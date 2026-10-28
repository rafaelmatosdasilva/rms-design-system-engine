// cdp.mjs - the one shared headless-Chrome launcher + DevTools Protocol client.
//
// Every browser-backed check (Gate [16] rendered parity, the a11y check, the code capture)
// used to carry its own copy of: find Chrome, launch it headless, wait for the DevTools
// socket, a tiny JSON-RPC `send`, open a page, and poll until it has loaded. Two copies had
// already drifted (different load guards and timeouts). This module is that code once.
//
// No npm dependencies: Node >= 22's built-in WebSocket. Callers keep their own policy
// (timeouts, what "loaded" means, skip vs fail when Chrome is missing); this module only
// provides the mechanics, so adopting it changes no check's behaviour.

import { existsSync, mkdtempSync, rmSync, readdirSync, readlinkSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir, homedir } from 'node:os';
import { spawn, spawnSync } from 'node:child_process';

// Chromium builds Playwright installs, newest first. Only consulted when a caller opts in
// (`playwright: true`), so a machine that merely has Playwright installed does not suddenly
// start running browser gates that skipped before.
export function playwrightChromium({ env = process.env, exists = existsSync, list = readdirSync } = {}) {
  const roots = [env.PLAYWRIGHT_BROWSERS_PATH, join(homedir(), '.cache', 'ms-playwright'), join(homedir(), 'Library', 'Caches', 'ms-playwright')].filter(Boolean);
  const bins = ['chrome-linux/chrome', 'chrome-mac/Chromium.app/Contents/MacOS/Chromium', 'chrome-win/chrome.exe'];
  for (const root of roots) {
    let dirs = [];
    try { dirs = list(root).filter((d) => /^chromium-\d+$/.test(d)).sort((a, b) => +b.split('-')[1] - +a.split('-')[1]); } catch { continue; }
    for (const d of dirs) for (const b of bins) { const p = join(root, d, b); if (exists(p)) return p; }
  }
  return null;
}

// Find a Chrome/Chromium binary. Order: CHROME_PATH, the macOS app bundles, then binaries on
// PATH, then (opt-in) a Playwright Chromium.
export function findChrome({ env = process.env, exists = existsSync, which = whichBin, playwright = false } = {}) {
  // DESIGN_SYSTEM_ENGINE_CHROME=none: no Chrome, wherever one is installed (a Mac's /Applications is found without the
  // PATH, so hiding it from the PATH is not enough). A run meant to read the code without a browser sets it.
  if (env.DESIGN_SYSTEM_ENGINE_CHROME === 'none') return null;
  const absolute = [
    env.CHROME_PATH,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
  ].filter(Boolean);
  for (const p of absolute) if (exists(p)) return p;
  for (const name of ['google-chrome', 'google-chrome-stable', 'chromium-browser', 'chromium']) {
    const p = which(name);
    if (p) return p;
  }
  return playwright ? playwrightChromium({ env, exists }) : null;
}

function whichBin(name) {
  const r = spawnSync('which', [name], { encoding: 'utf8' });
  return r.status === 0 && r.stdout.trim() ? r.stdout.trim() : null;
}

// A process and every process under it, read once from ps (Chrome's helpers: renderers, the network service, the crash
// reporter), and any process whose command names `marker` (on Linux the crash reporter leaves the tree). Without ps,
// the process alone.
function processTree(pid, marker = null) {
  const r = spawnSync('ps', ['-A', '-o', 'pid=,ppid=,args='], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (r.error || r.status !== 0) return [pid];
  const kids = new Map(), named = [];
  for (const line of r.stdout.split('\n')) {
    const m = /^\s*(\d+)\s+(\d+)\s(.*)$/.exec(line);
    if (!m) continue;
    kids.set(Number(m[2]), [...(kids.get(Number(m[2])) || []), Number(m[1])]);
    if (marker && m[3].includes(marker)) named.push(Number(m[1]));
  }
  const tree = [pid];
  for (let i = 0; i < tree.length; i++) tree.push(...(kids.get(tree[i]) || []));
  return [...new Set([...tree, ...named])].filter((p) => p !== process.pid);
}

// Wait, synchronously (an exit handler may not wait any other way), until every process given has ended. Each is asked
// of ps rather than signalled, since a child Node has not reaped yet still answers a signal. Without ps, it does not wait.
function waitGone(pids, ms = 3000) {
  const pause = new Int32Array(new SharedArrayBuffer(4));
  for (const end = Date.now() + ms; Date.now() < end; Atomics.wait(pause, 0, 0, 10)) {
    const r = spawnSync('ps', ['-p', pids.join(','), '-o', 'stat='], { encoding: 'utf8' });
    if (r.error) return false;
    if (r.stdout.split('\n').every((l) => !l.trim() || l.trim().startsWith('Z'))) return true;
  }
  return false;
}

// Every profile carries the pid of the run that made it (rms-chrome-<pid>-<prefix>), so one left by a run that was killed
// before it could delete it is known for garbage: the next browser any run starts deletes it, with the folder Chrome
// keeps its socket in, after ending a browser still running on it (orphaned when its run died).
const PROFILE_PREFIX = 'rms-chrome-';
const alive = (pid) => { try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; } };

export function sweepDeadProfiles(base = tmpdir()) {
  let swept = 0;
  for (const n of readdirSync(base)) {
    const m = n.startsWith(PROFILE_PREFIX) && /^rms-chrome-(\d+)-/.exec(n);
    if (!m || Number(m[1]) === process.pid || alive(Number(m[1]))) continue;
    const dir = join(base, n);
    let socketDir = null;
    try { socketDir = dirname(readlinkSync(join(dir, 'SingletonSocket'))); } catch { /* never started */ }
    const orphans = processTree(-1, dir).filter((p) => p !== -1);
    if (orphans.length) {
      for (const pid of orphans) try { process.kill(pid, 'SIGKILL'); } catch { /* already gone */ }
      waitGone(orphans, 1000);
    }
    for (const d of [dir, socketDir]) if (d) try { rmSync(d, { recursive: true, force: true }); } catch { /* best effort */ }
    swept++;
  }
  return swept;
}

// Launch headless Chrome and resolve once its DevTools socket is listening.
// Returns { chrome, userDataDir, wsUrl, kill }. Rejects if Chrome exits first.
// Gives up after timeoutMs (default 30 s) so a Chrome that never starts cannot hang a run. A busy machine can take
// longer than that once: a start that timed out is tried once more after a pause, as the engine waits for Figma; one
// that failed outright (no Chrome there, or it exited) is not.
export async function launchChrome(chromePath, opts = {}) {
  try { return await launchOnce(chromePath, opts); } catch (e) {
    if (!/did not start within/.test(String(e?.message))) throw e;
    await new Promise((r) => setTimeout(r, opts.retryAfterMs ?? 2000));
    return launchOnce(chromePath, opts);
  }
}
async function launchOnce(chromePath, { tmpPrefix = 'design-system-engine-chrome-', timeoutMs = 30000 } = {}) {
  try { sweepDeadProfiles(); } catch { /* never in the way of a launch */ }
  const userDataDir = mkdtempSync(join(tmpdir(), `${PROFILE_PREFIX}${process.pid}-${tmpPrefix}`));
  // --use-mock-keychain (macOS) and --password-store=basic (Linux): a throwaway profile never touches the person's
  // keychain, so no "Keychain Not Found" or keyring prompt appears while the engine or its tests read pages.
  const chrome = spawn(chromePath, [
    '--headless=new', '--remote-debugging-port=0', '--no-first-run', '--no-sandbox',
    // No component updates: a throwaway profile never needs them, and each download left a folder in the temp folder.
    '--disable-gpu', '--disable-extensions', '--disable-component-update', '--use-mock-keychain', '--password-store=basic', `--user-data-dir=${userDataDir}`,
    // Every page the engine opens is one it is working in, though only one is in front: a page in a background tab keeps
    // its timers and its rendering at full speed (Chrome otherwise wakes it once a second, then once a minute).
    '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding',
    'about:blank',
  ], { stdio: ['ignore', 'ignore', 'pipe'] });
  // Chrome must not outlive the run that started it. kill() is the caller's to call, and a caller that throws, or a
  // test runner that ends while a page is still open, would otherwise leave a headless browser alive for ever: after
  // a day of runs on one computer there were forty of them holding three gigabytes, and every later run read as slow
  // because of it — which is exactly how a machine comes to look like a failing engine.
  // The handler is removed as soon as kill runs, so a long session that opens many browsers does not pile listeners
  // up, and everything it does is synchronous, which is all an exit handler may be.
  // Chrome writes its profile until it has shut down (a tenth of a second), so a profile deleted at once was written
  // again and left behind, a folder per browser: the profile goes only once Chrome is gone, with the folder Chrome
  // keeps its socket in, which it never deletes itself.
  const kill = () => {
    process.off('exit', kill);
    let socketDir = null;
    try { socketDir = dirname(readlinkSync(join(userDataDir, 'SingletonSocket'))); } catch { /* not started */ }
    // The helpers write to the profile too, and outlive the browser by a moment: all of them are waited for.
    const tree = chrome.pid && chrome.exitCode === null && chrome.signalCode === null ? processTree(chrome.pid, userDataDir) : [];
    try { chrome.kill(); } catch { /* already dead */ }
    if (tree.length && !waitGone(tree)) {
      for (const pid of tree) try { process.kill(pid, 'SIGKILL'); } catch { /* already gone */ }
      waitGone(tree, 1000);
    }
    for (const d of [userDataDir, socketDir]) if (d) try { rmSync(d, { recursive: true, force: true, maxRetries: 3 }); } catch { /* best effort */ }
  };
  process.on('exit', kill);
  try {
    const wsUrl = await new Promise((resolve, reject) => {
      let buf = '';
      chrome.stderr.on('data', (d) => {
        buf += d.toString();
        const m = buf.match(/DevTools listening on (ws:\/\/\S+)/);
        if (m) resolve(m[1]);
      });
      chrome.on('exit', () => reject(new Error(`Chrome exited before DevTools was ready:\n${buf.slice(-400)}`)));
      chrome.on('error', (e) => reject(new Error(`Chrome could not start: ${e.message}`)));
      const timer = setTimeout(() => reject(new Error(`Chrome did not start within ${timeoutMs / 1000}s`)), timeoutMs);
      timer.unref?.();
    });
    // Ready: from here it must not hold the run open either. A child with a pipe keeps Node's loop alive, so a run
    // whose last page was read would wait for a browser nobody is using - the suite sat for twenty minutes after its
    // final test for this. Only now, because until the socket is announced that same pipe is what the launch waits on.
    chrome.unref?.();
    chrome.stderr?.unref?.();
    return { chrome, userDataDir, wsUrl, kill };
  } catch (e) { kill(); throw e; }
}

// Connect to a DevTools socket. Returns { send, on, ws, close }.
// send(method, params, sessionId) resolves with the result or rejects with "<method>: <message>".
// Every call gives up after timeoutMs (default 30 s), and a socket that closes rejects every call
// still waiting, so a stuck page or a dead browser can never hang a run.
// on(method, fn) subscribes to a protocol event; fn(params, sessionId). Returns an unsubscribe.
export async function connectCDP(wsUrl, { timeoutMs = 30000 } = {}) {
  const ws = new WebSocket(wsUrl);
  await new Promise((res, rej) => {
    const timer = setTimeout(() => rej(new Error('DevTools socket did not open within 10s')), 10000);
    timer.unref?.();
    ws.onopen = () => { clearTimeout(timer); res(); };
    ws.onerror = (e) => { clearTimeout(timer); rej(e?.error ?? new Error('DevTools socket error')); };
  });
  let msgId = 0;
  const pending = new Map();
  const listeners = new Map();
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); return; }
    if (m.method) for (const fn of listeners.get(m.method) ?? []) { try { fn(m.params, m.sessionId); } catch { /* listener error */ } }
  };
  const on = (method, fn) => {
    if (!listeners.has(method)) listeners.set(method, new Set());
    listeners.get(method).add(fn);
    return () => listeners.get(method)?.delete(fn);
  };
  let closed = false;
  ws.onclose = () => {
    closed = true;
    for (const [id, fn] of pending) { pending.delete(id); fn({ error: { message: 'the browser connection closed' } }); }
  };
  // A call on a closed socket fails at once: a send on it is silently dropped, so it would wait out its whole timeout.
  const send = (method, params = {}, sessionId) => new Promise((res, rej) => {
    if (closed) { rej(new Error(`${method}: the browser connection closed`)); return; }
    const id = ++msgId;
    const timer = setTimeout(() => { pending.delete(id); rej(new Error(`${method}: no answer within ${timeoutMs / 1000}s`)); }, timeoutMs);
    timer.unref?.();
    pending.set(id, (m) => { clearTimeout(timer); return m.error ? rej(new Error(`${method}: ${m.error.message}`)) : res(m.result); });
    try { ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) })); }
    catch (e) { clearTimeout(timer); pending.delete(id); rej(new Error(`${method}: ${e.message}`)); }
  });
  const close = () => { try { ws.close(); } catch { /* already closed */ } };
  return { send, on, ws, close };
}

// Open a page in a new target and attach a flat session with the Runtime domain enabled.
// The target opens blank so the page starts in light before its own script runs: headless Chrome takes
// prefers-color-scheme from the computer it runs on, so a page that reads it at load would come up dark on a
// dark-mode machine and light on a light one. A caller that wants dark asks for it itself, after this.
export async function openPage(send, url) {
  // Each page in a window of its own: none is ever a background tab, which Chrome slows to a wake-up a second (the
  // style guide's build tries its components in several pages at once).
  const { targetId } = await send('Target.createTarget', { url: 'about:blank', newWindow: true });
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
  await send('Runtime.enable', {}, sessionId);
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'light' }] }, sessionId).catch(() => {});
  if (url && url !== 'about:blank') await send('Page.navigate', { url }, sessionId);
  return { targetId, sessionId };
}

// Poll `expression` in the page until it evaluates to true. Returns true when it did.
// tolerateErrors: treat a failed evaluation (a page mid-navigation) as "not yet".
export async function waitForTrue(send, sessionId, expression, { attempts = 100, intervalMs = 50, tolerateErrors = false } = {}) {
  for (let i = 0; i < attempts; i++) {
    const r = tolerateErrors
      ? await send('Runtime.evaluate', { expression, returnByValue: true }, sessionId).catch(() => ({ result: {} }))
      : await send('Runtime.evaluate', { expression, returnByValue: true }, sessionId);
    if (r.result?.value === true) return true;
    await new Promise((res) => setTimeout(res, intervalMs));
  }
  return false;
}

// The load guard for a file:// page. The target's initial about:blank already reports
// readyState "complete", so readyState alone races the navigation.
// A style guide page is loaded once it has drawn itself (it marks <html> sg-ready), not only once the file is read.
export const FILE_PAGE_LOADED = 'location.protocol === "file:" && document.readyState === "complete" && (!document.body.classList.contains("sg-page") || document.documentElement.classList.contains("sg-ready"))';
