// bidi.mjs - Firefox through WebDriver BiDi, with Node's own WebSocket and nothing installed.
//
// Firefox speaks the W3C's WebDriver BiDi on the port --remote-debugging-port opens, the way Chrome speaks its
// DevTools protocol (cdp.mjs). The engine needs little of it: open a page, wait for it, run a script, size the
// window, close. Each browser starts with a profile of its own in the system's temp folder,
// removed when it closes. The profile's name carries the pid of the run that made it, so one a dead run left behind,
// and the browser still running on it, are swept before the next browser starts (sweepFirefoxProfiles).
//
//   launchFirefox(path, { scheme })      → { wsUrl, kill }   (scheme: 'light' | 'dark', for the whole browser)
//   sweepFirefoxProfiles(base)            → how many profiles a dead run left were removed
//   connectBiDi(wsUrl)                    → { send(method, params), close() }
//   bidiPage(send, url)                   → { evaluate(expr), setViewport(w, h), close() }
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, realpathSync, writeFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// What the profile says before Firefox starts: no first-run pages, no updates, no telemetry, nothing fetched that
// a check did not ask for.
const PREFS = {
  'browser.shell.checkDefaultBrowser': false,
  'browser.startup.homepage_override.mstone': 'ignore',
  'browser.aboutwelcome.enabled': false,
  'app.update.disabledForTesting': true,
  'datareporting.policy.dataSubmissionEnabled': false,
  'toolkit.telemetry.reportingpolicy.firstRun': false,
  'browser.newtabpage.enabled': false,
  'network.captive-portal-service.enabled': false,
  'browser.safebrowsing.malware.enabled': false,
  'browser.safebrowsing.phishing.enabled': false,
};
export const userJs = (prefs = PREFS) => Object.entries(prefs).map(([k, v]) => `user_pref(${JSON.stringify(k)}, ${JSON.stringify(v)});`).join('\n') + '\n';

// The colour scheme a page is drawn in. Firefox has no command for it, so it is the profile's, set before it starts:
// one Firefox a scheme, light unless asked (the headless default in Chrome, and the :root base).
export const SCHEME_PREF = { dark: 0, light: 1 };

// Found on one computer: 15 headless Firefoxes and 1165 profile folders left by test runs that were stopped, some nine
// hours old, and a new Firefox that would not answer beside them. A profile is a dead run's when the pid in its name
// (engine-firefox-<pid>-…) is no longer running; one from before the name carried it is when nothing uses it, or its
// browser was adopted by the system (pid 1) because its run died.
const FIREFOX_PROFILE = /^engine-firefox-(?:(\d+)-)?[A-Za-z0-9]{6}$/;
const running = (pid) => { try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; } };
export function firefoxLeftovers(base = tmpdir(), { ps = () => spawnSync('ps', ['-A', '-o', 'pid=,ppid=,args='], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).stdout ?? '', list = () => readdirSync(base), alive = running, self = process.pid } = {}) {
  let real = base; try { real = realpathSync(base); } catch { /* as given */ }
  const names = list().map((n) => [n, FIREFOX_PROFILE.exec(n)]).filter(([, m]) => m);
  if (!names.length) return [];
  const rows = String(ps()).split('\n').map((l) => /^\s*(\d+)\s+(\d+)\s(.*)$/.exec(l)).filter(Boolean).map((m) => ({ pid: Number(m[1]), ppid: Number(m[2]), args: m[3] }));
  const out = [];
  for (const [n, m] of names) {
    const dirs = [join(base, n), join(real, n)];
    const using = rows.filter((r) => dirs.some((d) => r.args.includes(`--profile ${d}`) || r.args.includes(d + '/') || r.args.endsWith(d)));
    // With the processes a browser started (its content processes carry no profile path of their own).
    const pids = using.map((r) => r.pid);
    for (let i = 0; i < pids.length; i++) for (const r of rows) if (r.ppid === pids[i] && !pids.includes(r.pid)) pids.push(r.pid);
    if (m[1]) { const owner = Number(m[1]); if (owner !== self && !alive(owner)) out.push({ dir: join(base, n), pids }); continue; }
    const browser = using.find((r) => /--headless/.test(r.args) && /--profile /.test(r.args));
    if (!using.length || (browser && browser.ppid === 1)) out.push({ dir: join(base, n), pids });
  }
  return out;
}
export function sweepFirefoxProfiles(base = tmpdir(), opts = {}) {
  let swept = 0;
  try {
    for (const { dir, pids } of firefoxLeftovers(base, opts)) {
      for (const pid of pids) try { process.kill(pid, 'SIGKILL'); } catch { /* already gone */ }
      try { rmSync(dir, { recursive: true, force: true }); } catch { /* best effort */ }
      swept++;
    }
  } catch { /* never in the way of a launch */ }
  return swept;
}

// A busy machine can be slow to start one Firefox, as it can Chrome (cdp.mjs launchChrome): a start that timed out,
// and one where Firefox began and then closed, are tried once more after a pause. Found on the suite's own runners:
// two runs that began in the same minute each waited 30s for Firefox's BiDi port and failed, while the runs before
// and after on the same code passed. One Firefox cannot run (not found, or its own folder unreachable) is not tried
// again: that only gives the same answer later.
const FIREFOX_ANOTHER_GO = /did not open WebDriver BiDi within|closed at start \(exit [^)]*\)$/;
export async function launchFirefox(path, opts = {}) {
  // Never inside Codex's sandbox, where a browser aborts at startup (cdp.mjs sandboxRefusal).
  const { sandboxRefusal } = await import('./cdp.mjs');
  const refused = sandboxRefusal(opts.env);
  if (refused) throw refused;
  try { return await launchFirefoxOnce(path, opts); } catch (e) {
    if (!FIREFOX_ANOTHER_GO.test(String(e?.message))) throw e;
    await new Promise((r) => setTimeout(r, opts.retryAfterMs ?? 2000));
    return launchFirefoxOnce(path, opts);
  }
}
async function launchFirefoxOnce(path, { timeoutMs = 30000, tmpPrefix = 'engine-firefox-', scheme = 'light' } = {}) {
  sweepFirefoxProfiles();
  // The real path: Firefox refuses a profile named through the /var → /private/var link on a Mac.
  const profile = realpathSync(mkdtempSync(join(tmpdir(), `${tmpPrefix}${process.pid}-`)));
  writeFileSync(join(profile, 'user.js'), userJs({ ...PREFS, 'layout.css.prefers-color-scheme.content-override': SCHEME_PREF[scheme] ?? SCHEME_PREF.light }));
  const proc = spawn(path, ['--headless', '--no-remote', '--remote-debugging-port=0', '--profile', profile], { stdio: ['ignore', 'ignore', 'pipe'] });
  const kill = () => { try { proc.kill(); } catch {} setTimeout(() => { try { rmSync(profile, { recursive: true, force: true }); } catch {} }, 300).unref?.(); };
  const wsUrl = await new Promise((res, rej) => {
    let buf = '';
    const t = setTimeout(() => { kill(); rej(new Error(`Firefox did not open WebDriver BiDi within ${timeoutMs / 1000}s${buf.trim() ? `: ${buf.trim().split('\n').slice(-1)[0]}` : ''}`)); }, timeoutMs);
    proc.stderr.on('data', (d) => { buf += d; const m = buf.match(/WebDriver BiDi listening on (ws:\/\/\S+)/); if (m) { clearTimeout(t); res(m[1]); } });
    proc.on('error', (e) => { clearTimeout(t); rej(new Error(`Firefox could not be started: ${e.message}`)); });
    proc.on('exit', (code) => { clearTimeout(t); rej(new Error(`Firefox closed at start (exit ${code})${/profile folder/i.test(buf) ? ' - it could not reach its own folder. On a Mac, open Firefox once from Applications, then run again' : ''}`)); });
  });
  return { wsUrl, kill, proc };
}

export async function connectBiDi(wsUrl, { timeoutMs = 30000 } = {}) {
  const sock = new WebSocket(wsUrl.endsWith('/session') ? wsUrl : `${wsUrl}/session`);
  await new Promise((res, rej) => { sock.addEventListener('open', res, { once: true }); sock.addEventListener('error', () => rej(new Error('could not reach Firefox')), { once: true }); });
  let id = 0;
  const waiting = new Map();
  sock.addEventListener('message', (e) => {
    const m = JSON.parse(e.data);
    if (!m.id || !waiting.has(m.id)) return;
    const { res, rej, t } = waiting.get(m.id); waiting.delete(m.id); clearTimeout(t);
    if (m.type === 'error') rej(new Error(`${m.error}: ${m.message}`)); else res(m.result);
  });
  const send = (method, params = {}) => new Promise((res, rej) => {
    const i = ++id;
    const t = setTimeout(() => { waiting.delete(i); rej(new Error(`${method}: no answer within ${timeoutMs / 1000}s`)); }, timeoutMs);
    waiting.set(i, { res, rej, t });
    sock.send(JSON.stringify({ id: i, method, params }));
  });
  // No session, no connection: the socket is closed so nothing is left holding the process open.
  try { await send('session.new', { capabilities: {} }); } catch (e) { try { sock.close(); } catch {} throw e; }
  const close = async () => { try { await send('session.end'); } catch {} try { sock.close(); } catch {} };
  return { send, close };
}

// A value as BiDi returns it, back to plain JSON.
export function fromRemote(v) {
  if (!v || typeof v !== 'object') return v;
  switch (v.type) {
    case 'undefined': case 'null': return null;
    case 'string': case 'boolean': return v.value;
    case 'number': return typeof v.value === 'number' ? v.value : Number(v.value);
    case 'array': return (v.value ?? []).map(fromRemote);
    case 'object': return Object.fromEntries((v.value ?? []).map(([k, x]) => [typeof k === 'string' ? k : fromRemote(k), fromRemote(x)]));
    default: return null;
  }
}

export async function bidiPage(send, url, { width = 1280, height = 800 } = {}) {
  const { context } = await send('browsingContext.create', { type: 'tab' });
  await send('browsingContext.setViewport', { context, viewport: { width, height } });
  await send('browsingContext.navigate', { context, url, wait: 'complete' });
  const evaluate = async (expression) => {
    const r = await send('script.evaluate', { expression, target: { context }, awaitPromise: true, resultOwnership: 'none' });
    if (r.type === 'exception') throw new Error(r.exceptionDetails?.text ?? 'script error');
    return fromRemote(r.result);
  };
  return {
    evaluate,
    setViewport: (w, h) => send('browsingContext.setViewport', { context, viewport: { width: w, height: h } }),
    // A real key press (input.performActions), its WebDriver actions made by page-driver.mjs.
    press: async (key, mods) => { const { keyActions } = await import('./page-driver.mjs'); await send('input.performActions', { context, actions: keyActions(key, mods) }); },
    close: () => send('browsingContext.close', { context }).catch(() => {}),
  };
}
