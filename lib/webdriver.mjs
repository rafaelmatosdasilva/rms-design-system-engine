// webdriver.mjs - Safari through the W3C WebDriver that macOS ships (safaridriver), over plain HTTP, nothing installed.
//
// WebKit is Safari's engine, and on a Mac the one way to drive it without installing anything is safaridriver: it
// is part of the system, and a person turns it on once ("safaridriver --enable", which asks for their password, or
// Safari's Develop menu, Allow Remote Automation). The engine needs the same little it needs from Firefox (bidi.mjs):
// open a page, run a script, size the window, close.
//
// What Safari does not offer is said, never guessed: it opens a real window (there is no headless Safari), it runs
// one session at a time, and it draws in the Mac's own appearance (no command sets the colour scheme), so a value
// asked for in the other scheme is left untried there.
//
//   launchSafari(path, { port, timeoutMs })   → { base, kill }
//   webdriverSession(base, { fetch })          → { request(method, path, body), close() }
//   webdriverPage(session, url)                → { evaluate(expr), setViewport(w, h), close() }
import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:net';

// The Safari a session starts runs on after the session ends (an automation copy, marked --automation, one more for
// every session), so the driver notes the ones that came up with its session and quits exactly those when it closes,
// or when the run is stopped. A person's own Safari never carries the mark and is never touched.
export function automationSafaris({ ps = () => spawnSync('ps', ['-A', '-o', 'pid=,args='], { encoding: 'utf8' }).stdout ?? '' } = {}) {
  return String(ps()).split('\n').map((l) => l.trim().match(/^(\d+)\s+(.*)$/)).filter((m) => m && /\/Safari\.app\/Contents\/MacOS\/Safari\b/.test(m[2]) && /\s--automation\b/.test(m[2])).map((m) => Number(m[1]));
}
const started = new Set(), drivers = new Set();
const quitStarted = () => {
  for (const pid of started) { try { process.kill(pid, 'SIGTERM'); } catch { /* gone */ } }
  for (const d of drivers) { try { d.kill(); } catch { /* gone */ } }
  started.clear(); drivers.clear();
};
let exitHooked = false;
function hookExit() {
  if (exitHooked) return;
  exitHooked = true;
  process.on('exit', quitStarted);
  for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.once(sig, () => { quitStarted(); process.exit(128 + ({ SIGINT: 2, SIGTERM: 15, SIGHUP: 1 })[sig]); });
}

const freePort = () => new Promise((res, rej) => { const s = createServer(); s.unref(); s.on('error', rej); s.listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => res(port)); }); });

export async function launchSafari(path, { port, timeoutMs = 15000, fetchImpl = fetch } = {}) {
  const p = port ?? await freePort();
  const proc = spawn(path, ['-p', String(p)], { stdio: 'ignore' });
  drivers.add(proc); hookExit();
  const kill = () => { try { proc.kill(); } catch {} drivers.delete(proc); };
  const base = `http://127.0.0.1:${p}`;
  const until = Date.now() + timeoutMs;
  for (;;) {
    try { const r = await fetchImpl(`${base}/status`); if (r.ok) return { base, kill, proc }; } catch {}
    if (Date.now() > until) { kill(); throw new Error(`safaridriver did not answer within ${timeoutMs / 1000}s`); }
    await new Promise((r) => setTimeout(r, 150));
  }
}

// Why Safari refused, in words a person can act on.
export function whySafariRefused(message = '') {
  if (/remote automation|allow remote|--enable/i.test(message)) return 'Safari\'s remote automation is off: run "safaridriver --enable" once (it asks for your password)';
  if (/session.*already|one session/i.test(message)) return 'Safari is already being driven by another session: close it and run again';
  return message.split('\n')[0];
}

export async function webdriverSession(base, { fetchImpl = fetch, timeoutMs = 30000, safaris = automationSafaris } = {}) {
  const before = new Set(safaris());
  const call = async (method, path, body) => {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), timeoutMs);
    try {
      const r = await fetchImpl(`${base}${path}`, { method, signal: ac.signal, headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || j?.value?.error) throw new Error(whySafariRefused(j?.value?.message ?? j?.value?.error ?? `HTTP ${r.status}`));
      return j.value;
    } catch (e) { if (e.name === 'AbortError') throw new Error(`${method} ${path}: no answer within ${timeoutMs / 1000}s`); throw e; }
    finally { clearTimeout(t); }
  };
  const created = await call('POST', '/session', { capabilities: { alwaysMatch: { browserName: 'safari' } } });
  const id = created?.sessionId;
  const mine = safaris().filter((pid) => !before.has(pid));
  for (const pid of mine) started.add(pid);
  if (mine.length) hookExit();
  if (!id) { for (const pid of mine) { try { process.kill(pid, 'SIGTERM'); } catch {} started.delete(pid); } throw new Error('safaridriver gave no session'); }
  const request = (method, path, body) => call(method, `/session/${id}${path}`, body);
  const close = async () => {
    await call('DELETE', `/session/${id}`).catch(() => {});
    for (const pid of mine) { try { process.kill(pid, 'SIGTERM'); } catch { /* gone */ } started.delete(pid); }
  };
  return { id, request, close, safaris: mine };
}

export async function webdriverPage(session, url, { width = 1280, height = 800 } = {}) {
  const { request } = session;
  // The window's outer size is what WebDriver sets: the page's own width is read back and the window grown by the
  // difference, so the page is drawn at the width asked for.
  const setViewport = async (w, h) => {
    await request('POST', '/window/rect', { width: w, height: h });
    const inner = await request('POST', '/execute/sync', { script: 'return [innerWidth, innerHeight]', args: [] });
    const [iw, ih] = Array.isArray(inner) ? inner : [w, h];
    if (iw !== w || ih !== h) await request('POST', '/window/rect', { width: w + (w - iw), height: h + (h - ih) });
  };
  await setViewport(width, height);
  await request('POST', '/url', { url });
  return {
    // A script given as an expression, as cdp.mjs and bidi.mjs take it.
    evaluate: (expression) => request('POST', '/execute/async', { script: `const done = arguments[arguments.length - 1]; Promise.resolve(${expression}).then((v) => done(v), (e) => done({ __error: String(e) }));`, args: [] })
      .then((v) => { if (v && typeof v === 'object' && '__error' in v) throw new Error(v.__error); return v; }),
    setViewport,
    // A real key press (the Actions endpoint), its actions made by page-driver.mjs.
    press: async (key, mods) => { const { keyActions } = await import('./page-driver.mjs'); await request('POST', '/actions', { actions: keyActions(key, mods) }); await request('DELETE', '/actions').catch(() => {}); },
    close: () => session.close(),
  };
}
