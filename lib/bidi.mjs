// bidi.mjs - Firefox through WebDriver BiDi, with Node's own WebSocket and nothing installed.
//
// Firefox speaks the W3C's WebDriver BiDi on the port --remote-debugging-port opens, the way Chrome speaks its
// DevTools protocol (cdp.mjs). The engine needs little of it: open a page, wait for it, run a script, size the
// window, close. Each browser starts with a profile of its own in the system's temp folder,
// removed when it closes.
//
//   launchFirefox(path, { scheme })      → { wsUrl, kill }   (scheme: 'light' | 'dark', for the whole browser)
//   connectBiDi(wsUrl)                    → { send(method, params), close() }
//   bidiPage(send, url)                   → { evaluate(expr), setViewport(w, h), close() }
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, realpathSync, writeFileSync } from 'node:fs';
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

export async function launchFirefox(path, { timeoutMs = 30000, tmpPrefix = 'engine-firefox-', scheme = 'light' } = {}) {
  // The real path: Firefox refuses a profile named through the /var → /private/var link on a Mac.
  const profile = realpathSync(mkdtempSync(join(tmpdir(), tmpPrefix)));
  writeFileSync(join(profile, 'user.js'), userJs({ ...PREFS, 'layout.css.prefers-color-scheme.content-override': SCHEME_PREF[scheme] ?? SCHEME_PREF.light }));
  const proc = spawn(path, ['--headless', '--no-remote', '--remote-debugging-port=0', '--profile', profile], { stdio: ['ignore', 'ignore', 'pipe'] });
  const kill = () => { try { proc.kill(); } catch {} setTimeout(() => { try { rmSync(profile, { recursive: true, force: true }); } catch {} }, 300).unref?.(); };
  const wsUrl = await new Promise((res, rej) => {
    let buf = '';
    const t = setTimeout(() => { kill(); rej(new Error(`Firefox did not open WebDriver BiDi within ${timeoutMs / 1000}s${buf.trim() ? `: ${buf.trim().split('\n').slice(-1)[0]}` : ''}`)); }, timeoutMs);
    proc.stderr.on('data', (d) => { buf += d; const m = buf.match(/WebDriver BiDi listening on (ws:\/\/\S+)/); if (m) { clearTimeout(t); res(m[1]); } });
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
  await send('session.new', { capabilities: {} });
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
