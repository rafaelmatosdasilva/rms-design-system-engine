// screen-reader.mjs - what a screen reader actually says, held against what the browser says it should (WCAG 4.1.2).
//
// The accessibility check reads what a screen reader would say from Chrome's accessibility tree (spokenLine in
// a11y-check.mjs): the role, the name and the states each control exposes. That is what the browser hands over, not
// what a person hears, and the two part ways: a reader that drops a state the tree has, says a role in its own words,
// or reads a name the tree never gave. Asked for (--hear), the engine drives a real screen reader - VoiceOver on a Mac,
// NVDA on Windows, through Guidepup - over each component the style guide draws: it presses Tab through the reader to reach each
// control in turn, as a person would, and records what the reader said. Each line is then held against the tree's own: the name, the
// role and every state the tree has must be in what was said, in that reader's words.
//
// It is a measurement, and the row says so: where a criterion rests on a person's word (checked.mjs), this is the part
// a tool can hear. It is advisory: a reader's quirk is not the component's failure, and the row's status is the
// checks'. It never changes a setting of the computer: a reader that cannot be driven yet (VoiceOver's "Allow
// VoiceOver to be controlled with AppleScript", Guidepup not installed) is said, with what the person does to allow it.
//
//   READERS                             → the readers the engine can drive, with their words for roles and states
//   expectedParts(line)                 → { name, role, states } of one of spokenLine's lines
//   compareSaid(line, said, reader)     → { ok, missing: [{ part, want }] }
//   readerFor(platform)                 → 'voiceover' | 'nvda' | null
//   loadReader(ROOT, which, opts)       → { reader } | { why, how }    the Guidepup driver, or why it cannot run
//   hearComponents({ url, names, reader, chrome, rootOf }) → { components: { [name]: { lines } }, failed }
//   hearRun(ROOT, cfg, opts)            → the run, written to RESULT_FILE
//   heardOf(result, name, signature)    → what the style guide shows for one component
//   heardLine(run)                      → the run in one line
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { OUT_DIR } from './names.mjs';

export const RESULT_FILE = `${OUT_DIR}/heard-by-reader.json`;
// How long after the focus moves before what the reader said is read: VoiceOver and NVDA speak a moment after.
export const SETTLE_MS = 900;
// The most controls heard on one component: a list of forty options is heard by its first few.
export const PER_COMPONENT = 12;

// Each reader's words, by what spokenLine says (its own words are VoiceOver's and NVDA's browse mode, in English).
// A role or a state can be said several ways by one reader across its versions: any of them counts as said. A role
// spokenLine says that a reader has no entry for is looked for in its own words.
export const READERS = {
  voiceover: {
    label: 'VoiceOver',
    platform: 'darwin',
    roles: {
      button: ['button', 'toggle button', 'pop up button', 'menu button'], link: ['link', 'visited link'], checkbox: ['checkbox', 'check box'],
      radio: ['radio button'], switch: ['switch', 'toggle button'], 'edit text': ['edit text', 'text field', 'secure edit text'], 'search text': ['search text field', 'edit text', 'search'],
      'combo box': ['combo box', 'pop up button', 'edit text'], 'list box': ['list box', 'list'], 'menu item': ['menu item'], tab: ['tab'], slider: ['slider'],
      heading: ['heading'], image: ['image'], stepper: ['stepper', 'incrementor'], 'progress bar': ['progress indicator', 'progress bar'], option: ['option', 'item'],
      dialog: ['dialog', 'web dialog'], 'alert dialog': ['alert', 'dialog'], 'tab list': ['tab group', 'tab list'], 'radio group': ['radio group', 'group'], 'menu item checkbox': ['menu item'], 'menu item radio': ['menu item'],
    },
    states: {
      checked: ['checked', 'selected', 'on'], 'not checked': ['unchecked', 'not checked', 'off'], 'partly checked': ['mixed', 'partially checked'], on: ['on', 'checked'], off: ['off', 'unchecked'],
      pressed: ['selected', 'pressed', 'on'], 'not pressed': ['not selected', 'not pressed', 'off'], 'partly pressed': ['mixed'],
      expanded: ['expanded'], collapsed: ['collapsed'], selected: ['selected'], required: ['required'], 'invalid entry': ['invalid data', 'invalid'], unavailable: ['dimmed', 'unavailable', 'disabled'],
    },
    // Guidepup's name for it, and what the person does once so it can be driven (never done by the engine).
    guidepup: 'voiceOver',
    allow: 'In VoiceOver Utility, General: turn on "Allow VoiceOver to be controlled with AppleScript" (npx @guidepup/setup does it, with the permissions the terminal asks for), then fetch the reader\'s own files once (npx @guidepup/setup install).',
  },
  nvda: {
    label: 'NVDA',
    platform: 'win32',
    roles: {
      button: ['button', 'toggle button', 'menu button'], link: ['link', 'visited link'], checkbox: ['check box', 'checkbox'], radio: ['radio button'], switch: ['switch', 'toggle button'],
      'edit text': ['edit', 'editable text'], 'search text': ['edit', 'search'], 'combo box': ['combo box'], 'list box': ['list'], 'menu item': ['menu item'], tab: ['tab'], slider: ['slider'],
      heading: ['heading'], image: ['graphic', 'image'], stepper: ['spin button', 'edit'], 'progress bar': ['progress bar'], option: ['item', 'option'],
      dialog: ['dialog'], 'alert dialog': ['alert', 'dialog'], 'tab list': ['tab control', 'tab list'], 'radio group': ['grouping', 'radio group'], 'menu item checkbox': ['check menu item', 'menu item'], 'menu item radio': ['radio menu item', 'menu item'],
    },
    states: {
      checked: ['checked'], 'not checked': ['not checked'], 'partly checked': ['half checked', 'partially checked'], on: ['on', 'pressed', 'checked'], off: ['off', 'not pressed', 'not checked'],
      pressed: ['pressed'], 'not pressed': ['not pressed'], 'partly pressed': ['half pressed', 'partially pressed'],
      expanded: ['expanded'], collapsed: ['collapsed'], selected: ['selected'], required: ['required'], 'invalid entry': ['invalid entry'], unavailable: ['unavailable'],
    },
    guidepup: 'nvda',
    allow: 'Install NVDA with Guidepup\'s own copy (npx @guidepup/setup, then npx @guidepup/setup install), which lets it be driven.',
  },
};

// The reader a computer has: VoiceOver on a Mac, NVDA on Windows, none elsewhere.
export const readerFor = (platform = process.platform) => Object.keys(READERS).find((k) => READERS[k].platform === platform) ?? null;

const STATE_WORDS = Object.keys(READERS.voiceover.states).sort((a, b) => b.length - a.length);
const norm = (s) => String(s ?? '').toLowerCase().replace(/[‘’“”"]/g, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
// A word said whole, and not negated: "checked" is not heard in "unchecked" nor in "not checked".
const has = (said, word) => {
  const w = norm(word), t = ` ${norm(said)} `;
  return (/^not /.test(w) ? t : t.split(` not ${w} `).join(' ')).includes(` ${w} `);
};

// One line spokenLine wrote ("checkbox, Remember me, not checked"), in its parts: the role first, then the name, then
// any value and level, then the states, each one of spokenLine's own words. A line of text read as it is ('"Saved"')
// is a name with no role.
export function expectedParts(line) {
  const text = String(line ?? '').trim();
  if (/^".*"$/.test(text)) return { role: null, name: text.slice(1, -1), states: [] };
  const parts = text.split(', ').map((p) => p.trim()).filter(Boolean);
  const role = parts.shift() ?? null;
  const states = [];
  let level = null;
  while (parts.length && (STATE_WORDS.includes(parts.at(-1)) || /^level \d$/.test(parts.at(-1)))) {
    const p = parts.pop();
    if (/^level \d$/.test(p)) level = p; else states.unshift(p);
  }
  return { role, name: parts.join(', ') || null, ...(level ? { level } : {}), states };
}

// What the reader said, held against the tree's line: the name, the role (in this reader's words) and every state
// must be in it. A heading's level is part of its role ("heading level 2"). → { ok, missing: [{ part, want }] }
export function compareSaid(line, said, reader = 'voiceover') {
  const words = READERS[reader] ?? READERS.voiceover;
  const want = expectedParts(line);
  const missing = [];
  if (!String(said ?? '').trim()) return { ok: false, missing: [{ part: 'everything', want: line }], silent: true };
  // A control's name and its value ("Name, Ada") are said as two parts, often apart ("Name, edit, selected Ada"):
  // each must be said, wherever it falls.
  if (want.name && !has(said, want.name) && !want.name.split(', ').every((p) => has(said, p))) missing.push({ part: 'name', want: want.name });
  if (want.role) {
    const forms = words.roles[want.role] ?? [want.role];
    if (!forms.some((f) => has(said, f))) missing.push({ part: 'role', want: want.role });
    else if (want.level && !has(said, want.level)) missing.push({ part: 'level', want: want.level });
  }
  for (const s of want.states) {
    const forms = words.states[s] ?? [s];
    // "not checked" said as "unchecked" is said; "checked" is not heard inside "unchecked" (the words are whole).
    if (!forms.some((f) => has(said, f))) missing.push({ part: 'state', want: s });
  }
  return { ok: !missing.length, missing };
}

// What was left out, in words: 'it left out the state "expanded"' / 'it said nothing'.
export function missingLine(m = []) {
  if (m.some((x) => x.part === 'everything')) return 'it said nothing';
  const by = (part) => m.filter((x) => x.part === part).map((x) => `"${x.want}"`);
  const said = [];
  const name = by('name'), role = by('role'), level = by('level'), state = by('state');
  if (name.length) said.push(`the name ${name.join(' · ')}`);
  if (role.length) said.push(`the role ${role.join(' · ')}`);
  if (level.length) said.push(`the ${level.join(' · ')}`);
  if (state.length) said.push(`${state.length === 1 ? 'the state' : 'the states'} ${state.join(' · ')}`);
  return said.length ? `it left out ${said.join(' and ')}` : '';
}

// The Guidepup driver for a reader, from the project's own install or the engine's. Never installs anything and never
// turns a setting on: a driver that is missing, or a reader the computer will not let be driven, comes back as why and
// what the person does. → { reader: { label, which, version, start, stop, said } } | { why, how }
export async function loadReader(ROOT, which = readerFor(), { importer, platform = process.platform, allowed } = {}) {
  const spec = READERS[which];
  if (!spec) return { why: `no screen reader the engine can drive on this computer (${platform})`, how: 'VoiceOver is driven on a Mac and NVDA on Windows.' };
  if (spec.platform !== platform) return { why: `${spec.label} runs on ${spec.platform === 'darwin' ? 'a Mac' : 'Windows'}, not on this computer`, how: `Run it on ${spec.platform === 'darwin' ? 'a Mac' : 'Windows'}.` };
  let mod;
  const tryImport = importer ?? (async () => {
    for (const base of [join(ROOT, 'package.json'), join(dirname(new URL(import.meta.url).pathname), '..', 'package.json')]) {
      try { const p = createRequire(base).resolve('@guidepup/guidepup'); return await import(pathToFileURL(p).href); } catch { /* the next place */ }
    }
    return null;
  });
  try { mod = await tryImport(); } catch { mod = null; }
  const driver = mod?.[spec.guidepup] ?? mod?.default?.[spec.guidepup];
  if (!driver) return { why: 'Guidepup, which drives the screen reader, is not installed here', how: `npm install --save-dev @guidepup/guidepup in the project, then ${spec.allow}` };
  // VoiceOver says whether it can be driven: a computer where AppleScript may not control it is said, not changed.
  const ok = allowed ?? (which === 'voiceover' ? voiceOverAllowed() : true);
  if (!ok) return { why: `${spec.label} is not allowed to be driven on this computer yet`, how: spec.allow };
  const version = which === 'voiceover' ? macVersion() : null;
  return {
    reader: {
      label: spec.label, which, version,
      start: () => driver.start(),
      stop: () => driver.stop(),
      said: async () => String((await driver.lastSpokenPhrase?.()) ?? ''),
      // Tab, pressed through the reader: what it says is recorded only for a key it sent itself (Guidepup keeps no log
      // of speech it did not cause), and Tab is how a person moves through the controls anyway.
      // Every phrase it says for that Tab, not only its first: VoiceOver says the window, then the control.
      ...(typeof driver.press === 'function' ? { tab: () => driver.press('Tab', { capture: true }) } : {}),
      // Everything it said since it started, for a component it said nothing on: what it was reading instead.
      log: async () => ((await driver.spokenPhraseLog?.()) ?? []).map(String),
      // What the reader has under its cursor, read on demand: the words for the item it is on, when its speech log
      // caught only the hint after them ("You are currently on a button").
      ...(typeof driver.itemText === 'function' ? { item: async () => String((await driver.itemText()) ?? '') } : {}),
      // NVDA reads the window Windows has in front, and a window the browser brought forward itself is not always it:
      // Guidepup's own windowsActivate puts it there, by its program and its title.
      ...(which === 'nvda' && (mod.windowsActivate ?? mod.default?.windowsActivate) ? { front: ({ path, title }) => (mod.windowsActivate ?? mod.default.windowsActivate)(path, title) } : {}),
    },
  };
}

// Whether AppleScript may drive VoiceOver: the setting the person turns on, read, never written.
export function voiceOverAllowed({ run = spawnSync } = {}) {
  for (const domain of ['com.apple.VoiceOver4/default', `${process.env.HOME}/Library/Group Containers/group.com.apple.VoiceOver/Library/Preferences/com.apple.VoiceOver4/default`]) {
    const r = run('defaults', ['read', domain, 'SCREnableAppleScript'], { encoding: 'utf8' });
    if (r.status === 0) return /^\s*1\s*$/.test(r.stdout ?? '');
  }
  return false;
}
const macVersion = () => { const r = spawnSync('sw_vers', ['-productVersion'], { encoding: 'utf8' }); return r.status === 0 ? `macOS ${String(r.stdout).trim()}` : null; };

// The script that lists the controls of one component's preview, focusable ones in reading order, each marked so the
// run can find its node: what Tab reaches is what a person moves through, and the focus is what the reader follows.
const CONTROLS_JS = (root, max) => `(() => {
  const r = document.querySelector(${JSON.stringify(root)});
  if (!r) return null;
  // A mark just before the preview, where Tab starts from to reach its first control.
  if (!document.querySelector('[data-engine-heard-start]')) { const m = document.createElement('span'); m.tabIndex = -1; m.setAttribute('data-engine-heard-start', ''); r.before(m); }
  const sel = 'a[href],button,input:not([type=hidden]),select,textarea,summary,[tabindex]:not([tabindex="-1"]),[role=button],[role=link],[role=checkbox],[role=radio],[role=switch],[role=tab],[role=menuitem],[role=option],[role=slider],[role=combobox]';
  const seen = [...r.querySelectorAll(sel)].filter((e) => { const b = e.getBoundingClientRect(); return b.width > 0 && b.height > 0 && !e.closest('[inert],[hidden]'); });
  return seen.slice(0, ${max}).map((e, i) => { e.setAttribute('data-engine-heard', String(i)); return (e.tagName.toLowerCase() + (e.id ? '#' + e.id : '') + (e.className && typeof e.className === 'string' ? '.' + e.className.trim().split(/\\s+/)[0] : '')).slice(0, 60); });
})()`;

// Drive the reader over each component: open its page, move the focus to each control, read the tree's line for it
// and what the reader said, and hold one against the other. The browser is a real window (a reader hears only what is
// on screen), opened by the caller; rootOf(name) is the component's preview on the page.
// → { components: { [name]: { lines: [{ desc, want, said, ok, missing }] } }, failed: [string] }
export async function hearComponents({ url, names = [], reader, send, sessionId, rootOf, settleMs = SETTLE_MS, front = async () => {} } = {}) {
  const { spokenLine } = await import('./a11y-check.mjs');
  const { waitForTrue, FILE_PAGE_LOADED } = await import('./cdp.mjs');
  const out = { components: {}, failed: [] };
  const ev = async (expression) => (await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }, sessionId))?.result?.value;
  await send('DOM.enable', {}, sessionId);
  await send('Accessibility.enable', {}, sessionId);
  for (const name of names) {
    try {
      await send('Page.navigate', { url: url(name) }, sessionId);
      await waitForTrue(send, sessionId, FILE_PAGE_LOADED + ' || (location.protocol !== "file:" && document.readyState === "complete")', { attempts: 300, tolerateErrors: true });
      await front();
      const controls = await ev(CONTROLS_JS(rootOf(name), PER_COMPONENT));
      if (!controls) { out.failed.push(`${name}: its preview is not on the page`); continue; }
      const doc = await send('DOM.getDocument', { depth: 0 }, sessionId);
      const lines = [];
      for (let i = 0; i < controls.length; i++) {
        const q = await send('DOM.querySelector', { nodeId: doc.root.nodeId, selector: `[data-engine-heard="${i}"]` }, sessionId).catch(() => null);
        const node = q?.nodeId ? (await send('Accessibility.getPartialAXTree', { nodeId: q.nodeId, fetchRelatives: false }, sessionId).catch(() => null))?.nodes?.find((n) => !n.ignored) : null;
        const want = node ? spokenLine(node) : null;
        if (!want) continue;
        let reached = null, heardNow = null;
        if (reader.tab) {
          // From the control before it (or a mark just before the preview), one Tab through the reader, then where the
          // focus landed: Tab order is the page's, and a control Tab skips is said as skipped, never heard by force.
          const before = reader.log ? (await reader.log().catch(() => [])).length : 0;
          // Only a number goes into the script: the control before this one, or the mark CONTROLS_JS put before the preview.
          const from = i > 0 ? `[data-engine-heard="${Number(i) - 1}"]` : '[data-engine-heard-start]';
          await ev(`(() => { const e = document.querySelector('${from}'); e && e.focus(); return !!e; })()`);
          await reader.tab();
          await new Promise((r) => setTimeout(r, settleMs));
          reached = await ev(`(() => { const a = document.activeElement; return a && a.getAttribute('data-engine-heard') === '${i}'; })()`);
          if (reader.log) heardNow = (await reader.log().catch(() => [])).slice(before).join(' ');
        } else {
          await ev(`(() => { const e = document.querySelector('[data-engine-heard="${i}"]'); e && e.focus(); return !!e; })()`);
          await new Promise((r) => setTimeout(r, settleMs));
        }
        const said = String((heardNow || await reader.said({ desc: controls[i], want })) ?? '').replace(/\s+/g, ' ').trim();
        let c = compareSaid(want, said, reader.which);
        let heard = said;
        if (!c.ok && reader.item) {
          const item = String(await reader.item().catch(() => '') ?? '').replace(/\s+/g, ' ').trim();
          const both = [said, item].filter(Boolean).join(' ');
          const c2 = item ? compareSaid(want, both, reader.which) : null;
          if (c2?.ok) { c = c2; heard = both; }
        }
        lines.push({ desc: controls[i], want, said: heard, ok: c.ok, ...(c.missing.length ? { missing: c.missing } : {}), ...(reached === false ? { skipped: true } : {}) });
      }
      // Silent on every control: what the reader last said is kept, since it says what it was reading instead (another
      // window, the browser's own frame), which is the first thing to know about a run that heard nothing.
      const overall = lines.length && lines.every((l) => !l.said) && reader.log ? (await reader.log().catch(() => [])).filter((x) => x.trim()).slice(-5) : null;
      out.components[name] = { lines, ...(overall?.length ? { saidInstead: overall } : {}) };
    } catch (e) { out.failed.push(`${name}: ${String(e?.message ?? e).split('\n')[0]}`); }
  }
  return out;
}

// The whole run: the style guide's page for each component (?all&only=<name>), in a browser window the reader can
// hear, the reader started and stopped around it, and what it heard kept with each component's signature, so a
// component changed since reads as to hear again.
export async function hearRun(ROOT, cfg = {}, { only = null, which = readerFor(), load = loadReader, browser, signature } = {}) {
  const run = { at: new Date().toISOString(), reader: null, components: {}, failed: [], why: null, how: null };
  const { styleguideTarget } = await import('./a11y-check.mjs');
  const target = styleguideTarget(cfg, ROOT);
  if (!target?.styleguide) { run.why = 'there is no style guide to hear its components on'; run.how = 'Build it first (rms-design-system-engine --styleguide).'; return write(ROOT, run); }
  const names = (target.names ?? []).filter((n) => !only || only.includes(n));
  if (!names.length) { run.why = only ? `the style guide draws none of ${only.join(' · ')}` : 'the style guide draws no component'; return write(ROOT, run); }
  const got = await load(ROOT, which);
  if (!got.reader) { run.why = got.why; run.how = got.how; return write(ROOT, run); }
  const reader = got.reader;
  run.reader = { name: reader.label, which: reader.which, ...(reader.version ? { version: reader.version } : {}) };
  const base = target.url.replace(/\?all$/, '');
  const open = browser ?? (await import('./screen-reader.mjs')).openWindow;
  const win = await open();
  try {
    // A reader starting on a computer just booted can take longer than its first try allows: once more, after a moment.
    try { await reader.start(); } catch { await new Promise((r) => setTimeout(r, 5000)); await reader.start(); }
    const heard = await hearComponents({
      url: (n) => `${base}?all&only=${encodeURIComponent(n)}`, names, reader, send: win.send, sessionId: win.sessionId,
      front: async () => {
        await win.front();
        if (!reader.front || !win.path) return;
        const title = (await win.send('Runtime.evaluate', { expression: 'document.title', returnByValue: true }, win.sessionId).catch(() => null))?.result?.value;
        await reader.front({ path: win.path, title: String(title ?? '') }).catch(() => {});
      },
      rootOf: (n) => `#c-${String(n).replace(/[^\w-]+/g, '-')} .pg-preview`,
    });
    run.failed.push(...heard.failed);
    for (const [n, c] of Object.entries(heard.components)) run.components[n] = { ...c, ...(signature ? { signature: signature(n) } : {}) };
  } catch (e) { run.failed.push(startFailure(e)); }
  finally { try { await reader.stop(); } catch { /* already stopped */ } win.close(); }
  return write(ROOT, run);
}

// Why a reader did not start, in one line: Guidepup's own words and, when it gives one, the cause under them ("VoiceOver
// cannot be started: ..."), since the first line alone never said what to fix.
export function startFailure(e) {
  const first = (x) => String(x?.message ?? x ?? '').split('\n')[0].trim();
  const said = [];
  for (let x = e, n = 0; x && n < 4; x = x.cause, n++) { const w = first(x); if (w && !said.includes(w)) said.push(w); }
  return said.join(': ');
}

// A real browser window, in front, for the reader to hear: the engine's own launcher, not headless.
export async function openWindow() {
  const { findChrome, launchChrome, connectCDP, openPage } = await import('./cdp.mjs');
  const path = findChrome({ playwright: true });
  if (!path) throw new Error('no Chrome to open the pages in');
  const chrome = await launchChrome(path, { headless: false });
  const { send, close } = await connectCDP(chrome.wsUrl, { timeoutMs: 60000 });
  const { targetId, sessionId } = await openPage(send, 'about:blank');
  const app = /\.app\//.test(path) ? path.slice(0, path.indexOf('.app/') + 4) : null;
  const front = async () => {
    await send('Target.activateTarget', { targetId }).catch(() => {});
    await send('Page.bringToFront', {}, sessionId).catch(() => {});
    if (app && process.platform === 'darwin') spawnSync('open', ['-a', app]);
  };
  return { send, sessionId, front, path, close: () => { close(); chrome.kill(); } };
}

function write(ROOT, run) {
  try { mkdirSync(join(ROOT, OUT_DIR), { recursive: true }); writeFileSync(join(ROOT, RESULT_FILE), JSON.stringify(run, null, 1) + '\n'); } catch { /* the run still says what it heard */ }
  return run;
}

export function readHeard(ROOT) { try { return existsSync(join(ROOT, RESULT_FILE)) ? JSON.parse(readFileSync(join(ROOT, RESULT_FILE), 'utf8')) : null; } catch { return null; } }

// What the style guide shows for one component: the reader, when, each line heard apart from the tree's, how many
// were said as the tree says, and whether the component changed since (its signature then and now).
export function heardOf(result, name, signature = null) {
  const own = result?.components?.[name];
  if (!own || !result.reader) return null;
  const lines = own.lines ?? [];
  return {
    reader: result.reader.name, ...(result.reader.version ? { version: result.reader.version } : {}), at: String(result.at ?? '').slice(0, 10),
    heard: lines.length, same: lines.filter((l) => l.ok).length,
    apart: lines.filter((l) => !l.ok).map((l) => ({ desc: l.desc, want: l.want, said: l.said, why: missingLine(l.missing) })),
    ...(signature && own.signature && own.signature !== signature ? { stale: true } : {}),
  };
}

// The run in one line.
export function heardLine(run) {
  if (!run) return null;
  if (!run.reader) return `Nothing heard: ${run.why ?? 'no screen reader ran'}.${run.how ? ` ${run.how}` : ''}`;
  const comps = Object.values(run.components ?? {});
  const all = comps.flatMap((c) => c.lines ?? []);
  const apart = all.filter((l) => !l.ok).length;
  if (!all.length) return `${run.reader.name} heard nothing on ${comps.length === 1 ? 'one component' : `${comps.length} components`}${run.failed?.length ? `, and ${run.failed.length} could not be opened` : ''}.`;
  return `${run.reader.name} heard ${all.length === 1 ? 'one control' : `${all.length} controls`} across ${comps.length === 1 ? 'one component' : `${comps.length} components`}: ` +
    `${apart === 0 ? 'every one said as the browser says it' : `${apart === 1 ? 'one' : apart} said apart from what the browser says`}${run.failed?.length ? `, and ${run.failed.length} not heard` : ''}.`;
}
