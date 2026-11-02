// The local style guide built again on every change (watch.mjs): the code, Figma, the intent layer and the engine
// each seen moving, a burst of saves built once, what the build writes never taken for a change, and the background
// job that keeps it running from login on (a LaunchAgent on a Mac, a user service on Linux).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, mkdirSync, readFileSync, existsSync, cpSync, realpathSync, symlinkSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { codeSignature, engineSignature, figmaVersionNow, snapshotFigmaVersion, makeWatch, jobFor, installWatch, uninstallWatch, realJobDir, stableNode } from '../lib/watch.mjs';
import { OUT_DIR } from '../lib/names.mjs';
import { budget, tempDir } from './helpers.mjs';

const ENGINE = dirname(dirname(fileURLToPath(import.meta.url)));
const git = (dir, ...a) => spawnSync('git', ['-C', dir, ...a], { encoding: 'utf8' });

test('the code: a save, a commit or a new file moves it; what the engine writes never does', () => {
  const dir = tempDir('watch-code-');
  git(dir, 'init', '-q'); git(dir, 'config', 'user.email', 'qa@example.com'); git(dir, 'config', 'user.name', 'QA');
  mkdirSync(join(dir, 'src'), { recursive: true });
  writeFileSync(join(dir, 'src', 'Button.vue'), '<template><button>Save</button></template>\n');
  git(dir, 'add', '-A'); git(dir, 'commit', '-qm', 'first');
  const a = codeSignature(dir);
  assert.equal(codeSignature(dir), a, 'nothing moved: the same');
  writeFileSync(join(dir, 'src', 'Button.vue'), '<template><button>Send</button></template>\n');
  const b = codeSignature(dir);
  assert.notEqual(b, a, 'a save');
  git(dir, 'add', '-A'); git(dir, 'commit', '-qm', 'second');
  const c = codeSignature(dir);
  assert.notEqual(c, b, 'a commit');
  mkdirSync(join(dir, OUT_DIR, 'styleguide'), { recursive: true });
  writeFileSync(join(dir, OUT_DIR, 'styleguide', 'index.html'), '<p>built</p>');
  writeFileSync(join(dir, 'figma-vars.snapshot.json'), '{}');
  writeFileSync(join(dir, 'a11y-results.snapshot.json'), '{}');
  assert.equal(codeSignature(dir), c, 'the output folder and the snapshots are the engine\'s');
  writeFileSync(join(dir, 'src', 'Chip.vue'), '<template><span /></template>\n');
  assert.notEqual(codeSignature(dir), c, 'a new file');
  // A folder outside git: read from its files' sizes and dates.
  const plain = tempDir('watch-plain-');
  writeFileSync(join(plain, 'tokens.css'), ':root { --x: 1px; }\n');
  const p = codeSignature(plain);
  writeFileSync(join(plain, 'tokens.css'), ':root { --x: 2px; --y: 1px; }\n');
  assert.notEqual(codeSignature(plain), p);
});

test('the engine: its commit, so an update is seen', () => {
  const dir = tempDir('watch-engine-');
  git(dir, 'init', '-q'); git(dir, 'config', 'user.email', 'qa@example.com'); git(dir, 'config', 'user.name', 'QA');
  writeFileSync(join(dir, 'a.mjs'), '1\n'); git(dir, 'add', '-A'); git(dir, 'commit', '-qm', 'one');
  const a = engineSignature(dir);
  writeFileSync(join(dir, 'a.mjs'), '2\n'); git(dir, 'commit', '-qam', 'two');
  assert.notEqual(engineSignature(dir), a);
  assert.match(engineSignature(ENGINE), /^[0-9a-f]{7,}$/);
});

test('Figma: its version in one call, against the one the snapshots were read at; without a token or a file, said why', async () => {
  assert.deepEqual(await figmaVersionNow({}, { token: 't' }), { skip: 'no Figma file in ds-config.json' });
  assert.deepEqual(await figmaVersionNow({ figmaFileKey: 'AbC123' }, { token: '' }), { skip: 'no FIGMA_TOKEN (in .env or the environment)' });
  let asked = null;
  const fetch = async (url, o) => { asked = [url, o.headers['X-Figma-Token']]; return { ok: true, json: async () => ({ version: '2210' }) }; };
  assert.deepEqual(await figmaVersionNow({ figmaFile: 'https://www.figma.com/design/AbC123/Acme' }, { token: 'tok', fetch }), { version: '2210' });
  assert.deepEqual(asked, ['https://api.figma.com/v1/files/AbC123?depth=1', 'tok']);
  assert.deepEqual(await figmaVersionNow({ figmaFileKey: 'AbC123' }, { token: 'tok', fetch: async () => ({ ok: false, status: 403 }) }), { error: 'Figma answered 403' });
  const dir = tempDir('watch-figma-');
  mkdirSync(join(dir, 'src'), { recursive: true });
  writeFileSync(join(dir, 'src', 'figma-vars.snapshot.json'), JSON.stringify({ _figmaVersion: '2209' }));
  assert.equal(snapshotFigmaVersion(dir, {}), '2209');
  assert.equal(snapshotFigmaVersion(tempDir('watch-none-'), {}), null);
});

test('the engine updated by the watch itself, between rounds: built for, then the watch starts again on it', async () => {
  let engineSig = 'e1', updates = 0, restarted = 0;
  const builds = [], lines = [];
  const w = makeWatch({
    code: () => 'c', engine: () => engineSig,
    update: () => { updates++; if (updates === 2) { engineSig = 'e2'; return { line: 'ℹ️  The engine updated itself (e1 → e2).' }; } return null; },
    build: async (why, moved) => { builds.push(moved); return { ok: true }; },
    restart: () => { restarted++; },
    log: (l) => lines.push(l), remoteEveryMs: 60000,
  });
  assert.deepEqual(await w.tick(0), { built: false });
  assert.equal(updates, 1, 'asked with the remote sources');
  await w.tick(1000);
  assert.equal(updates, 1, 'not on every tick');
  const r = await w.tick(60000);
  assert.deepEqual(r.moved, ['the engine']);
  assert.ok(lines.includes('ℹ️  The engine updated itself (e1 → e2).'));
  assert.equal(restarted, 1);
});

test('the job starts node by a path an upgrade leaves in place', () => {
  const dir = tempDir('watch-node-');
  mkdirSync(join(dir, 'Cellar', 'node', '24.1.0', 'bin'), { recursive: true }); mkdirSync(join(dir, 'bin'));
  const versioned = join(dir, 'Cellar', 'node', '24.1.0', 'bin', 'node');
  writeFileSync(versioned, '');
  symlinkSync(versioned, join(dir, 'bin', 'node'));
  assert.equal(stableNode(versioned, `/nowhere:${join(dir, 'bin')}`), join(dir, 'bin', 'node'), 'the link on the PATH');
  assert.equal(stableNode(versioned, join(dir, 'Cellar', 'node', '24.1.0', 'bin')), versioned, 'no link: its own path');
  assert.equal(stableNode('/no/such/node', ''), '/no/such/node');
});

test('a watch: a burst of saves built once it settles, the remote sources asked every few minutes, a new engine starts it again', async () => {
  let codeSig = 'c1', engineSig = 'e1', figmaAnswer = { changed: false }, layerAnswer = { skip: 'no intent layer is set' };
  const builds = [], lines = [], asked = { figma: 0, layer: 0 };
  let restarted = 0;
  const w = makeWatch({
    code: () => codeSig, engine: () => engineSig,
    figma: async () => { asked.figma++; return figmaAnswer; },
    layer: async () => { asked.layer++; return layerAnswer; },
    build: async (why) => { builds.push(why); codeSig = codeSig + '+built'; return { ok: true }; },   // the build writes files
    restart: () => { restarted++; },
    log: (l) => lines.push(l), settleMs: 3000, remoteEveryMs: 300000,
  });
  assert.deepEqual(await w.tick(0), { built: false });
  assert.equal(asked.figma, 1, 'asked at once');
  codeSig = 'c2';
  assert.equal((await w.tick(1000)).waiting, 'code', 'a save: waits for it to settle');
  codeSig = 'c3';
  assert.equal((await w.tick(2000)).waiting, 'code', 'another save: waits again');
  assert.equal((await w.tick(4000)).waiting, 'code');
  const b = await w.tick(5500);
  assert.deepEqual([b.built, b.reasons], [true, ['the code changed']]);
  assert.equal(builds.length, 1, 'three saves, one build');
  assert.deepEqual(await w.tick(6000), { built: false }, 'what the build wrote is not a change');
  assert.equal(asked.figma, 1, 'Figma only every few minutes');
  figmaAnswer = { changed: true, line: 'Figma changed (version 2210)' };
  const f = await w.tick(300000);
  assert.deepEqual(f.reasons, ['Figma changed (version 2210)']);
  assert.equal(lines.filter((l) => /intent layer not watched: no intent layer is set/.test(l)).length, 1, 'a source not watched is said once');
  figmaAnswer = { changed: false };
  engineSig = 'e2';
  const e = await w.tick(301000);
  assert.deepEqual(e.reasons, ['the engine updated']);
  assert.equal(restarted, 1, 'the watch starts again on the new engine');
  assert.ok(lines.some((l) => /🔄 the engine updated: building the style guide/.test(l)) && lines.some((l) => /✅ style guide built/.test(l)));
  // A failed build is said, and the next change is built again.
  let fx = 'a';
  const failing = makeWatch({ code: () => fx, engine: () => 'e', build: async () => ({ ok: false, status: 1 }), log: (l) => lines.push(l), remoteEveryMs: Infinity, settleMs: 0 });
  fx = 'b';
  await failing.tick(0);
  assert.equal((await failing.tick(1)).ok, false);
  assert.equal(lines.at(-1), '❌ the build failed (exit 1); tried again at the next check');
  // Another round already building (a person's --watch --once) is no failure: it waits for the next check.
  let fy = 'a';
  const waiting = makeWatch({ code: () => fy, engine: () => 'e', build: async () => ({ ok: false, busy: true, line: 'a round is already running (process 7, since 07:54)' }), log: (l) => lines.push(l), remoteEveryMs: Infinity, settleMs: 0 });
  fy = 'b';
  await waiting.tick(0);
  await waiting.tick(1);
  assert.equal(lines.at(-1), '⏳ a round is already running (process 7, since 07:54): built at the next check');
});

test('the background job: a LaunchAgent on a Mac, a user service on Linux, each project its own; elsewhere, said why', () => {
  const ROOT = '/work/Design & Code/acme-ds';
  const mac = jobFor({ ROOT, engineDir: '/opt/engine', platform: 'darwin', home: '/h', minutes: 5, node: '/usr/local/bin/node', uid: 501 });
  assert.match(mac.label, /^com\.rms-design-system-engine\.watch\.[0-9a-f]{8}$/);
  assert.equal(mac.file, `/h/Library/LaunchAgents/${mac.label}.plist`);
  assert.match(mac.text, /<string>\/usr\/local\/bin\/node<\/string>\n {4}<string>\/opt\/engine\/audit\.mjs<\/string>\n {4}<string>--watch<\/string>\n {4}<string>5<\/string>/);
  assert.match(mac.text, /<key>WorkingDirectory<\/key><string>\/work\/Design &amp; Code\/acme-ds<\/string>/, 'its folder, escaped');
  assert.match(mac.text, /<key>RunAtLoad<\/key><true\/>[\s\S]*<key>KeepAlive<\/key><true\/>/, 'from login on, started again if it stops');
  assert.equal(mac.log, `${ROOT}/${OUT_DIR}/watch.log`);
  assert.deepEqual([mac.start, mac.stop], [['launchctl', 'bootstrap', 'gui/501', mac.file], ['launchctl', 'bootout', `gui/501/${mac.label}`]]);
  assert.notEqual(jobFor({ ROOT: '/work/other-ds', engineDir: '/opt/engine', platform: 'darwin', home: '/h' }).label, mac.label, 'another project, another job');
  const linux = jobFor({ ROOT: '/work/acme-ds', engineDir: '/opt/engine', platform: 'linux', home: '/h', minutes: 10, node: '/usr/bin/node' });
  assert.match(linux.file, /^\/h\/\.config\/systemd\/user\/rms-design-system-engine-watch-[0-9a-f]{8}\.service$/);
  assert.match(linux.text, /ExecStart="\/usr\/bin\/node" "\/opt\/engine\/audit\.mjs" "--watch" "10"/);
  assert.match(linux.text, /Restart=always[\s\S]*WantedBy=default\.target/);
  assert.deepEqual(linux.start.slice(0, 4), ['systemctl', '--user', 'enable', '--now']);
  assert.match(jobFor({ ROOT, engineDir: '/opt/engine', platform: 'win32', home: 'C:\\' }).unsupported, /on a Mac or on Linux, not on win32: keep rms-design-system-engine --watch running in a terminal/);
});

test('install and uninstall: launchctl or systemctl asked only for a job in this computer\'s own folder, through the runner given', () => {
  const home = tempDir('watch-own-'), other = tempDir('watch-other-'), ROOT = tempDir('watch-proj-');
  for (const platform of ['darwin', 'linux']) {
    const calls = [], run = (argv) => { calls.push(argv[0] + ' ' + argv[2]); return { status: 0 }; };
    const own = jobFor({ ROOT, engineDir: '/opt/engine', platform, home, uid: 501 });
    assert.equal(dirname(own.file), realJobDir(platform, home));
    let r = installWatch(own, { run, realHome: home, platform });
    assert.deepEqual([r.ok, r.started], [true, true]);
    assert.ok(existsSync(own.file));
    assert.deepEqual(calls, platform === 'darwin' ? ['launchctl gui/501'] : ['systemctl daemon-reload', 'systemctl enable'], 'started through the runner');
    calls.length = 0;
    installWatch(own, { run, realHome: home, platform });
    assert.equal(calls[0], platform === 'darwin' ? 'launchctl gui/501/' + own.label : 'systemctl disable', 'installed again: the old one stopped first');
    calls.length = 0;
    assert.equal(uninstallWatch(own, { run, realHome: home, platform }).removed, true);
    assert.ok(!existsSync(own.file));
    assert.ok(calls.length >= 1);
    // Another home than this computer's own (HOME set elsewhere, as in a test): the file only, the runner never called.
    calls.length = 0;
    const borrowed = jobFor({ ROOT, engineDir: '/opt/engine', platform, home: other, uid: 501 });
    r = installWatch(borrowed, { run, realHome: home, platform });
    assert.deepEqual([r.ok, r.started], [true, false]);
    assert.match(r.lines[0], /written \(.+\) and not started/);
    assert.equal(uninstallWatch(borrowed, { run, realHome: home, platform }).removed, true);
    assert.deepEqual(calls, [], 'never asked of launchd or systemd');
    const failing = installWatch(own, { run: () => ({ status: 5, stderr: 'Bootstrap failed: 5' }), realHome: home, platform });
    assert.equal(failing.ok, false);
    assert.match(failing.lines[0], /did not start: Bootstrap failed: 5/);
    uninstallWatch(own, { run: () => ({ status: 0 }), realHome: home, platform });
  }
});

test('the commands: the job written and taken away again, and a watch that sees a save and builds', { timeout: budget(240000) }, async () => {
  const dir = tempDir('watch-cli-');
  cpSync(join(ENGINE, 'test', 'fixtures', 'demo-ds'), dir, { recursive: true });
  const home = tempDir('watch-home-');
  const env = { ...process.env, HOME: home, NO_COLOR: '1', FIGMA_TOKEN: '', CI: '' };
  const run = (...a) => spawnSync(process.execPath, [join(ENGINE, 'audit.mjs'), ...a], { cwd: dir, encoding: 'utf8', env });
  if (process.platform === 'linux' || process.platform === 'darwin') {
    let r = run('--watch-uninstall');
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.match(r.stdout, /No background watch for this folder: nothing to take away\./);
    // An ordinary run in a test: the default watch is never installed, and the status says why.
    r = run('--guide-status');
    assert.match(r.stdout, /No background watch for this folder \(this is a test run\)/, r.stdout + r.stderr);
    assert.ok(!existsSync(join(home, 'Library', 'LaunchAgents')) && !existsSync(join(home, '.config', 'systemd')), 'nothing written');
    r = run('--watch-install', '7');
    const job = jobFor({ ROOT: realpathSync(dir), engineDir: ENGINE, home, minutes: 7 });   // the folder as the run sees it (a temporary folder on a Mac is a link)
    assert.ok(existsSync(job.file), 'the job is written');
    assert.match(readFileSync(job.file, 'utf8'), /--watch/);
    // A home of its own: the job is written there, and launchd or systemd is never asked to start it.
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.match(r.stdout, /The background watch was written \(.+\) and not started: that folder is not where this computer's own jobs live/);
    assert.doesNotMatch(r.stdout + r.stderr, /\n\s+at .+\.mjs:\d+|is not defined/);
    r = run('--watch-uninstall');
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.match(r.stdout, /✅ The background watch is off/);
    assert.match(r.stdout, /It stays off for this folder: no run turns it on again/);
    assert.ok(!existsSync(job.file), 'the job is gone');
  }
  // The watch itself: started, a save seen, the style guide built.
  const p = spawn(process.execPath, [join(ENGINE, 'audit.mjs'), '--watch'], { cwd: dir, env });
  let out = '';
  p.stdout.on('data', (d) => { out += d; });
  p.stderr.on('data', (d) => { out += d; });
  const until = async (re, ms) => { const t = Date.now(); while (!re.test(out) && Date.now() - t < ms) await new Promise((r) => setTimeout(r, 200)); return re.test(out); };
  try {
    assert.ok(await until(/👀 Watching .*: the code every few seconds, Figma, the intent layer and the stores every 5 min, and the engine/, 30000), out);
    assert.ok(await until(/Figma not watched: no Figma file in ds-config\.json/, 30000), out);   // the demo names no Figma file
    await new Promise((r) => setTimeout(r, 2500));
    writeFileSync(join(dir, 'notes.md'), '# A note\n');
    assert.ok(await until(/🔄 the code changed: building the style guide/, 30000), out);
  } finally { p.kill(); }
  assert.doesNotMatch(out, /\n\s+at .+\.mjs:\d+|is not defined|is not a function/);
});

// A round that failed, on a new engine that starts the watch again, is not forgotten: the next watch tries it first.
test('a failed round is kept for the next watch, which tries it again at its first check; a build that works clears it', async () => {
  let kept = 'unset', restarted = 0, eng = 'e1';
  const builds = [];
  const a = makeWatch({ code: () => 'c1', engine: () => eng, build: async (why) => { builds.push(why); return { ok: false, status: 1 }; }, restart: () => { restarted++; }, keepRetry: (r) => { kept = r; }, remoteEveryMs: 1000 });
  eng = 'e2';
  await a.tick(0);
  assert.equal(restarted, 1, 'a new engine starts the watch again');
  assert.deepEqual(kept, { reasons: ['the engine updated'], moved: ['the engine'] }, 'what failed is kept for the next watch');
  kept = 'unset';
  const b = makeWatch({ code: () => 'c1', engine: () => 'e2', retry: { reasons: ['the engine updated'], moved: ['the engine'] }, build: async (why, what) => { builds.push([why, what]); return { ok: true } }, keepRetry: (r) => { kept = r; }, remoteEveryMs: 1000 });
  const r = await b.tick(0);
  assert.equal(r.built, true);
  assert.deepEqual(builds.at(-1), [['the engine updated'], ['the engine']]);
  assert.equal(kept, null, 'built: nothing left to try again');
});
