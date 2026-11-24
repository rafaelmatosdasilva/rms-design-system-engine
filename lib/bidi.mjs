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
//   connectBiDi(wsUrl)                    → { send(method, params), close(), version }
//   bidiPage(send, url)                   → { evaluate(expr), setViewport(w, h), close() }
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, realpathSync, writeFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { processRows, orphaned, processTree, waitGone } from './cdp.mjs';

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
// The processes are listed the engine's one way (cdp.mjs processRows: ps, or PowerShell on Windows, which has no ps).
export function firefoxLeftovers(base = tmpdir(), { ps = () => processRows() ?? '', list = () => readdirSync(base), alive = running, self = process.pid, win = process.platform === 'win32' } = {}) {
  let real = base; try { real = realpathSync(base); } catch { /* as given */ }
  const names = list().map((n) => [n, FIREFOX_PROFILE.exec(n)]).filter(([, m]) => m);
  if (!names.length) return [];
  const rows = String(ps()).split(/\r?\n/).map((l) => /^\s*(\d+)\s+(\d+)\s(.*)$/.exec(l)).filter(Boolean).map((m) => ({ pid: Number(m[1]), ppid: Number(m[2]), args: m[3] }));
  const out = [];
  const sep = win ? '\\' : '/';
  for (const [n, m] of names) {
    const dirs = [join(base, n), join(real, n)];
    const using = rows.filter((r) => dirs.some((d) => r.args.includes(`--profile ${d}`) || r.args.includes(d + sep) || r.args.endsWith(d)));
    // With the processes a browser started (its content processes carry no profile path of their own). Never on Windows,
    // which reuses a process id once its process is gone: a child found by its parent's id there can be anybody's.
    const pids = using.map((r) => r.pid);
    if (!win) for (let i = 0; i < pids.length; i++) for (const r of rows) if (r.ppid === pids[i] && !pids.includes(r.pid)) pids.push(r.pid);
    if (m[1]) { const owner = Number(m[1]); if (owner !== self && !alive(owner)) out.push({ dir: join(base, n), pids }); continue; }
    const browser = using.find((r) => /--headless/.test(r.args) && /--profile /.test(r.args));
    if (!using.length || (browser && orphaned(browser, rows))) out.push({ dir: join(base, n), pids });
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
  // Ended as Chrome is ended (cdp.mjs launchChrome): the browser and the processes that name its profile are waited for
  // before the profile goes, and it is ended too when the run exits without closing it. Signalled and left, Firefox
  // still held the files it had open on Windows, so the page a run opened could not be deleted after it (EBUSY), and a
  // profile deleted 300ms later on a timer was often still in use, a folder left per run.
  const kill = () => {
    process.off('exit', kill);
    const alive = proc.pid && proc.exitCode === null && proc.signalCode === null;
    const tree = alive ? processTree(proc.pid, profile) : [];
    if (process.platform === 'win32' && alive) { try { spawnSync('taskkill', ['/pid', String(proc.pid), '/F'], { stdio: 'ignore', timeout: 10000 }); } catch { /* already gone */ } }
    try { proc.kill(); } catch { /* already dead */ }
    if (tree.length && !waitGone(tree)) { for (const pid of tree) try { process.kill(pid, 'SIGKILL'); } catch { /* already gone */ } waitGone(tree, 1000); }
    try { rmSync(profile, { recursive: true, force: true, maxRetries: process.platform === 'win32' ? 20 : 3, retryDelay: 100 }); } catch { /* best effort */ }
  };
  process.on('exit', kill);
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
  let started;
  try { started = await send('session.new', { capabilities: {} }); } catch (e) { try { sock.close(); } catch {} throw e; }
  const close = async () => { try { await send('session.end'); } catch {} try { sock.close(); } catch {} };
  // The version Firefox says it is, as its session gave it: a row names the browser it was tried in with it.
  return { send, close, version: started?.capabilities?.browserVersion ?? null };
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

// Firefox can drop a tab's browsing context while it loads a page: a page from a file loads in Firefox's own process for
// files, and a new tab starts in another, so the tab moves process as it loads. A command sent during the move meets
// "no such frame: DiscardedBrowsingContextError", and a navigation can lose the load event it was waiting for and never
// answer ("browsingContext.navigate: no answer within 30s"). Both seen on GitHub's runners (Windows the first, Linux the
// second), never on a laptop. The tab itself is almost always still there once the move is done, so:
//   - a page is waited for by asking it (document.readyState), never by the navigation's own wait, and a question met
//     by the move is asked again until the page answers or the wait runs out;
//   - a step that meets a lost context, while Firefox still lists the tab, first waits for the page to settle and runs
//     again on the same tab, since opening a new one makes the same move again;
//   - a second loss in the step, or a tab Firefox no longer lists, opens a fresh tab at the same page and size.
// Each step has a few goes (TRIES), so a step that keeps meeting it still ends, and says so.
const GONE = /no such frame|DiscardedBrowsingContext|BrowsingContext does no longer exist/;
const TRIES = 3;
const READY = 'document.readyState';
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
// The page loaded, by its own word, asked again through a move. → true, or false when the wait runs out.
async function settled(send, context, { waitMs = 30000, everyMs = 100 } = {}) {
  const until = Date.now() + waitMs;
  while (Date.now() < until) {
    try {
      const r = await send('script.evaluate', { expression: READY, target: { context }, awaitPromise: false, resultOwnership: 'none' });
      if (r?.type !== 'exception' && fromRemote(r?.result) === 'complete') return true;
    } catch (e) { if (!GONE.test(String(e?.message))) throw e; }
    await pause(everyMs);
  }
  return false;
}
// Whether Firefox still lists the tab: a lost context in a tab that is listed was a move, not a closed tab.
async function listed(send, context) {
  try { return !!(await send('browsingContext.getTree', { root: context, maxDepth: 0 }))?.contexts?.length; } catch { return false; }
}
async function openTab(send, url, width, height, wait) {
  const { context } = await send('browsingContext.create', { type: 'tab' });
  try {
    await send('browsingContext.setViewport', { context, viewport: { width, height } });
    await send('browsingContext.navigate', { context, url, wait: 'none' });
    if (!(await settled(send, context, wait))) throw new Error(`${url} did not finish loading in Firefox`);
    return context;
  } catch (e) { send('browsingContext.close', { context }).catch(() => {}); throw e; }
}
export async function bidiPage(send, url, { width = 1280, height = 800, wait = {} } = {}) {
  let context, size = { width, height };
  // Opening the tab has a go of its own, wherever it is opened from: the same hiccup often takes the new tab as it loads.
  const open = async () => {
    try { return await openTab(send, url, size.width, size.height, wait); }
    catch (e) { if (!GONE.test(String(e?.message))) throw e; return openTab(send, url, size.width, size.height, wait); }
  };
  // The first loss in a step is waited out on the same tab while Firefox lists it (a move between processes); a second
  // is taken as a tab whose content process went away for good, which Firefox can go on listing, and a fresh tab is
  // opened (on GitHub's Windows runners every retry on the same listed tab met the loss again). A step that still meets
  // it says which tries it made, so the next failure says more than the last.
  const again = async (step) => {
    let last; const tried = [];
    for (let i = 0; i < TRIES; i++) {
      try { return await step(); } catch (e) {
        if (!GONE.test(String(e?.message))) throw e;
        last = e;
        if (i === 0 && await listed(send, context)) { tried.push('waited on the same tab'); await settled(send, context, wait); }
        else { tried.push('opened a new tab'); send('browsingContext.close', { context }).catch(() => {}); context = await open(); }
      }
    }
    throw new Error(`${last.message} (met ${TRIES} times in one step: ${tried.join(', then ')})`);
  };
  context = await open();
  const evaluate = (expression) => again(async () => {
    const r = await send('script.evaluate', { expression, target: { context }, awaitPromise: true, resultOwnership: 'none' });
    if (r.type === 'exception') throw new Error(r.exceptionDetails?.text ?? 'script error');
    return fromRemote(r.result);
  });
  return {
    evaluate,
    setViewport: (w, h) => again(async () => { await send('browsingContext.setViewport', { context, viewport: { width: w, height: h } }); size = { width: w, height: h }; }),
    // A real key press (input.performActions), its WebDriver actions made by page-driver.mjs.
    press: (key, mods) => again(async () => { const { keyActions } = await import('./page-driver.mjs'); await send('input.performActions', { context, actions: keyActions(key, mods) }); }),
    // A picture of the whole page, as a PNG.
    shot: () => again(async () => Buffer.from((await send('browsingContext.captureScreenshot', { context, origin: 'document' })).data, 'base64')),
    close: () => send('browsingContext.close', { context }).catch(() => {}),
  };
}
