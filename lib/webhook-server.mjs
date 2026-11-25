// webhook-server.mjs - HTTP server that receives Figma webhook events and
// triggers an automated parity check when the DS file changes.
//
// Usage:
//   node lib/webhook-server.mjs
//
// Register the webhook once with:
//   FIGMA_TOKEN=xxx node lib/setup-webhook.mjs --url https://your-host/webhook
//
// Config (ds-config.json):
//   webhook.port            - port to listen on (default: 3456)
//   webhook.host            - the address it listens on (default: 127.0.0.1, this computer only). Set it ("0.0.0.0")
//                             only where something in front of it (a tunnel, a proxy) is meant to reach it from outside.
//   webhook.secret          - passcode Figma sends in every event (must match registration), required
//   or: FIGMA_WEBHOOK_SECRET env var
//   webhook.minIntervalSec  - the least time between two runs (default: 60): events in between are one run after it
//
// Handled events: FILE_UPDATE, LIBRARY_PUBLISH, FILE_VERSION_UPDATE
// On event: runs parity-check.mjs and visual-regression-check.mjs, logs result.
//
// What reaches it can start checks on this computer, so it takes only what it should: it listens on this computer
// unless a host is set, it will not start with no passcode, the passcode is compared in constant time, a body larger
// than any Figma event is refused, and events arriving faster than a run takes are one run, never a queue.
//
//   webhookOptions(cfg, env)                    → { port, host, secret, minGapMs }
//   samePasscode(given, expected)               → true only for the same passcode, in time that does not say how close
//   webhookHandler({ secret, run, minGapMs, now, log }) → (req, res) handler, run() → Promise<void>

import { createServer }                    from 'node:http';
import { readFileSync }                    from 'node:fs';
import { join, dirname, resolve as resolvePath } from 'node:path';
import { fileURLToPath, pathToFileURL }    from 'node:url';
import { spawn }                           from 'node:child_process';
import { createHash, timingSafeEqual }     from 'node:crypto';
import { projectPath } from './names.mjs';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
export const HANDLED_EVENTS = new Set(['FILE_UPDATE', 'LIBRARY_PUBLISH', 'FILE_VERSION_UPDATE']);
// Figma's events are a few hundred bytes: anything past this is not one, and is never read to its end.
export const MAX_BODY = 64 * 1024;

export function webhookOptions(cfg = {}, env = process.env) {
  const w = cfg.webhook ?? {};
  return {
    port: w.port ?? 3456,
    host: w.host ?? '127.0.0.1',
    secret: String(w.secret ?? env.FIGMA_WEBHOOK_SECRET ?? ''),
    minGapMs: Math.max(0, Number(w.minIntervalSec ?? 60)) * 1000,
  };
}

// Both sides hashed first, so the comparison takes the same time whatever the passcode's length or its first wrong
// character.
export function samePasscode(given, expected) {
  if (typeof given !== 'string' || !expected) return false;
  const h = (s) => createHash('sha256').update(String(s)).digest();
  return timingSafeEqual(h(given), h(expected));
}

export function webhookHandler({ secret, run, minGapMs = 60000, now = Date.now, log = console.log } = {}) {
  if (!secret) throw new Error('a webhook passcode is required');
  let running = false, queued = false, lastStart = -Infinity, timer = null;
  // One run at a time; an event during a run, or sooner than minGapMs after the last start, asks for one more run
  // once it may, and any number of such events are that one run.
  const start = async () => {
    if (running) { queued = true; return; }
    const wait = lastStart + minGapMs - now();
    if (wait > 0) { queued = true; if (!timer) timer = setTimeout(() => { timer = null; if (queued) { queued = false; start(); } }, wait); return; }
    running = true; lastStart = now();
    try { await run(); } catch (e) { log(`  ❌ the run failed: ${String(e?.message ?? e).split('\n')[0]}`); }
    finally { running = false; }
    if (queued) { queued = false; start(); }
  };
  const handler = (req, res) => {
    if (req.method !== 'POST' || req.url !== '/webhook') {
      const health = req.method === 'GET' && req.url === '/health';
      res.writeHead(health ? 200 : 404); res.end(health ? 'OK' : '');
      return;
    }
    let size = 0, body = '', refused = false;
    req.on('data', (chunk) => {
      if (refused) return;
      size += chunk.length;
      if (size > MAX_BODY) { refused = true; res.writeHead(413); res.end('Too large'); req.destroy(); return; }
      body += chunk;
    });
    req.on('end', () => {
      if (refused) return;
      let payload;
      try { payload = JSON.parse(body); } catch { res.writeHead(400); res.end('Bad JSON'); return; }
      // Figma sends a plain passcode in the body (not a signature).
      if (!samePasscode(payload?.passcode, secret)) {
        log(`[${new Date(now()).toISOString()}] ⚠️  Wrong passcode - rejected`);
        res.writeHead(401); res.end('Unauthorized');
        return;
      }
      const event = payload.event_type ?? 'UNKNOWN';
      log(`\n[${new Date(now()).toISOString()}] 📡 ${event}  file: ${payload.file_key ?? '?'}`);
      if (!HANDLED_EVENTS.has(event)) {
        res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ received: true, event }));
        log('  ⏭ Event not handled - skipping');
        return;
      }
      const later = running || lastStart + minGapMs > now();
      res.writeHead(later ? 202 : 200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ received: true, event, ...(later ? { queued: true } : {}) }));
      if (later) log('  ⏳ A run is going or just ran: this one runs once it may, with any others that arrive meanwhile');
      start();
    });
  };
  handler.idle = () => !running && !queued && !timer;
  return handler;
}

// ── The checks one event starts, each its own process so the server keeps answering while they run ──
function runScript(ROOT, name) {
  return new Promise((done) => {
    const p = spawn(process.execPath, [resolvePath(SCRIPT_DIR, name)], { cwd: ROOT, stdio: 'ignore' });
    const t = setTimeout(() => p.kill(), 300000);
    p.on('close', (code) => { clearTimeout(t); done(code === 0); });
    p.on('error', () => { clearTimeout(t); done(false); });
  });
}

async function main() {
  const ROOT = process.cwd();
  let cfg = {};
  try { cfg = JSON.parse(readFileSync(join(ROOT, 'ds-config.json'), 'utf8')); } catch {
    console.error('❌ ds-config.json not found at project root.'); process.exit(1);
  }
  let { port, host, secret, minGapMs } = webhookOptions(cfg);
  if (!secret) {
    console.error('❌ No webhook passcode: without one, anyone who can reach the port could start checks on this computer.');
    console.error('   Set webhook.secret in ds-config.json or FIGMA_WEBHOOK_SECRET, the same one setup-webhook.mjs registers with Figma.');
    process.exit(2);
  }
  const run = async () => {
    console.log('  🔄 Running parity-check.mjs...');
    console.log((await runScript(ROOT, 'parity-check.mjs')) ? '  ✅ Token parity OK' : '  ❌ Token parity FAIL - run /rms-design-system-engine to audit');
    if (process.env.FIGMA_TOKEN) {
      console.log('  🔄 Running visual-regression-check.mjs...');
      console.log((await runScript(ROOT, 'visual-regression-check.mjs')) ? '  ✅ Visual regression OK' : `  ❌ Visual regression FAIL - inspect ${cfg.visualRefs ?? projectPath(ROOT, 'refs')}/*.new.png`);
    }
    console.log('  Done.\n');
  };
  const server = createServer(webhookHandler({ secret, run, minGapMs }));
  server.listen(port, host, () => {
    port = server.address()?.port ?? port;   // the one it got, when it was given 0
    const where = host === '0.0.0.0' || host === '::' ? 'every network interface' : host === '127.0.0.1' || host === '::1' || host === 'localhost' ? 'this computer only' : host;
    console.log('\n📡 rms-design-system-engine webhook server');
    console.log(`   Listening: http://${host}:${port}/webhook (${where})`);
    console.log(`   Health:    http://${host}:${port}/health`);
    console.log(`   Events:    ${[...HANDLED_EVENTS].join(', ')}`);
    console.log(`   Passcode:  configured ✓ · at most one run every ${minGapMs / 1000}s`);
    console.log('');
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolvePath(process.argv[1])).href) main();
