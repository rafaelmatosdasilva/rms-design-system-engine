// act-rules.mjs - the engine's own accessibility checks held against the W3C's ACT Rules test cases.
//
// Most of the accessibility check is the engine's own code (wcag-page.js, a11y-check.mjs), held only by its own tests: a
// check written by hand is only as right as its author. The W3C publishes, for each Accessibility Conformance Testing
// rule, the pages that must pass, the ones that must fail and the ones the rule does not apply to. This runs the real
// engine (a11y-check.mjs --url, axe-core left out, so only the engine's own code answers) on every case of each rule an
// engine check stands for, and holds what it found against what the W3C expects:
//   failed        the engine must raise one of the rule's kinds
//   passed        it must raise none of them
//   inapplicable  it must raise none of them
// A case the engine answers otherwise is a disagreement. One that is known, with why, is listed in KNOWN and never
// fails a run; any other fails it. So a check that drifts from the W3C's own reading is seen the day it drifts, and the
// rules that hold are the ones the features page says the engine follows.
//
// The cases are fetched, never committed (test/.act/, ignored by git), from one pinned commit of the W3C's repository,
// with the images and media they use: a case is a page of its own, served here at the path the W3C serves it, since
// its assets are written as absolute paths. A fetched file is data: it is opened in the browser and never run here.
// .github/workflows/act-rules.yml fetches the pinned commit and runs every case, on a change to the checks and each week.
//
//   node lib/act-rules.mjs fetch                  → the pinned cases into test/.act/<commit>/
//   node lib/act-rules.mjs run [--rule <id>]      → every mapped case through the engine, each said, and a summary
//   node lib/act-rules.mjs rules                  → the rules mapped, and those no check stands for
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync, mkdtempSync } from 'node:fs';
import { join, dirname, extname, normalize } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';

const ENGINE = dirname(dirname(fileURLToPath(import.meta.url)));

// One commit of the W3C's wcag-act-rules repository: its testcases.json and the cases it lists. The pin moves only
// through a pull request that says what passed (pinned-standards.mjs asks for a newer one each week).
export const ACT_COMMIT = 'e77ea58caf27bead77e4dde933a26282792d3c3b';
export const ACT_REPO = 'w3c/wcag-act-rules';
const BASE_PATH = '/WAI/content-assets/wcag-act-rules/';
export const FIXTURES = join(ENGINE, 'test', '.act');

// Each ACT rule an engine check stands for: the kinds that answer it, and, where one kind holds several problems (every
// ARIA one is "aria"), the words of the finding that is this rule's. A rule mapped here is one the engine claims to
// check, so every one of its cases must agree or be listed in KNOWN. A rule no check stands for is left out on purpose
// (UNMAPPED says which and why), never mapped to a near miss.
export const RULES = {
  '674b10': { kinds: ['aria'], says: /is not an ARIA role/, name: 'Role attribute has valid value' },
  '6a7281': { kinds: ['aria'], says: /" takes |points to an id/, name: 'ARIA state or property has valid value' },
  '5f99a7': { kinds: ['aria'], says: /is not an ARIA attribute/, name: 'ARIA attribute is defined in WAI-ARIA' },
  '4e8ab6': { kinds: ['aria'], says: /" without aria-/, name: 'Element with role attribute has required states and properties' },
  '6cfa84': { kinds: ['aria'], says: /aria-hidden="true" on something Tab reaches/, name: 'Element with aria-hidden has no content in sequential focus navigation' },
  'ff89c9': { kinds: ['context'], name: 'ARIA required context role' },
  '2ee8b8': { kinds: ['labelname'], name: 'Visible label is part of accessible name' },
  '23a2a8': { kinds: ['textalt', 'name'], name: 'Image has non-empty accessible name' },
  '59796f': { kinds: ['textalt', 'name'], name: 'Image button has non-empty accessible name' },
  '97a4e1': { kinds: ['name'], name: 'Button has non-empty accessible name' },
  'e086e5': { kinds: ['name'], name: 'Form field has non-empty accessible name' },
  'c487ae': { kinds: ['name', 'link'], name: 'Link has non-empty accessible name' },
  'm6b1q3': { kinds: ['name'], name: 'Menuitem has non-empty accessible name' },
  'ffd0e9': { kinds: ['emptylabel'], name: 'Heading has non-empty accessible name' },
  'afw4f7': { kinds: ['contrast'], name: 'Text has minimum contrast' },
  '2779a5': { kinds: ['pagetitle'], name: 'HTML page has non-empty title' },
  'b5c3f8': { kinds: ['pagelang'], name: 'HTML page has lang attribute' },
  '80f0bf': { kinds: ['autoaudio'], name: 'Audio or video element avoids automatically playing audio' },
  '80af7b': { kinds: ['tabtrap'], name: 'Focusable element has no keyboard trap' },
  'oj04fd': { kinds: ['focus'], name: 'Element in sequential focus order has visible focus' },
};

// The rest of the W3C's rules, by why no engine check stands for them: whole kinds of content the engine does not
// read (media alternatives, iframes, meta refresh), or judgements a person makes (a label or a heading that describes).
export const UNMAPPED_WHY = 'no check of the engine\'s stands for it: a kind of content it does not read (media alternatives, iframes, meta elements, CSS in style attributes) or a judgement a person makes (whether a label, heading, link or title describes)';

// Disagreements known, by case id, with why: kept until the check is fixed. Empty means every mapped case agrees.
export const KNOWN = {
  '7d3d7214d9fca81a8a09a819665871a474f85548': 'a video with no sound track: whether it has one cannot be read without playing it, and a browser with no person at it blocks sound that starts by itself, so the engine says it plays sound',
  'ab24c77ed9daefc8fa1650aedf0d1c6438460243': 'a keyboard trap whose way out is a key the page names in words (Ctrl+M): the Tab walk presses Tab and Shift+Tab, never a key it would have to read the instructions to find',
  'e3902f01b8589702925be6d97f9542895ef3c76d': 'a keyboard trap whose way out is a key the page names in words (Ctrl+M): the Tab walk presses Tab and Shift+Tab, never a key it would have to read the instructions to find',
  'b92b5214d2b2214b89fb9812b389536759701790': 'a keyboard trap whose way out is a help link that says which key to press: the Tab walk never reads instructions to find a key',
  'd2f5325f3fd5ddde38cd677a5ca36ba0d762fb84': 'focus sent back after a 10ms timer: the Tab walk reads where focus landed before the timer moves it on, and sees it go round, where the W3C reads that a person can still leave',
  'f8e3dbe601969ab54954447e04ae384eb52d7082': 'list items inside a shadow root, owned across it by aria-owns: the page checks read the document and the shadow roots it draws text from, not the roles inside one',

  'd343bc6a2877b62d80153453c3781debc33e0b1d': 'a focus sentinel under aria-hidden whose script sends the focus back into a dialog the moment it arrives: a page check sees a link Tab reaches, and the script that moves on from it runs only when focus lands there',
};

// What the W3C expects of one case, against the kinds the engine raised on it. → 'agree' | 'disagree'
export function judge(expected, raised, ruleKinds, says = null) {
  const hit = raised.some((r) => (typeof r === 'string' ? ruleKinds.includes(r) && !says : ruleKinds.includes(r.kind) && (!says || says.test(r.said ?? ''))));
  return (expected === 'failed') === hit ? 'agree' : 'disagree';
}

// The cases of the mapped rules, from a fetched testcases.json.
export function mappedCases(all, only = null) {
  return all.filter((t) => RULES[t.ruleId] && (!only || only.includes(t.ruleId)));
}

// Each rule's outcome over its cases: 'holds' when every case agrees or is known, else the cases that disagree.
export function summarise(results) {
  const by = {};
  for (const r of results) {
    const s = (by[r.ruleId] ??= { rule: r.ruleId, name: RULES[r.ruleId]?.name ?? r.ruleName, cases: 0, agree: 0, known: [], disagree: [] });
    s.cases++;
    if (r.verdict === 'agree') s.agree++;
    else if (KNOWN[r.testcaseId]) s.known.push({ id: r.testcaseId, why: KNOWN[r.testcaseId] });
    else s.disagree.push({ id: r.testcaseId, expected: r.expected, raised: r.raised, url: r.url });
  }
  for (const s of Object.values(by)) s.holds = s.disagree.length === 0;
  return Object.values(by).sort((a, b) => a.rule.localeCompare(b.rule));
}

const caseDir = (commit = ACT_COMMIT) => join(FIXTURES, commit);
export function fixtureDir(commit = ACT_COMMIT) {
  const d = caseDir(commit);
  if (!existsSync(join(d, 'testcases.json'))) throw new Error(`The ACT Rules cases at ${commit.slice(0, 7)} are not fetched: run node lib/act-rules.mjs fetch`);
  return d;
}

// An asset a case names by its absolute path on the W3C's site (an image, a video, a stylesheet).
const assetsOf = (html) => [...new Set([...String(html).matchAll(/(?:src|href|poster|data)\s*=\s*["']([^"']+)["']/gi)].map((m) => m[1])
  .filter((u) => u.startsWith(BASE_PATH) || u.startsWith('/test-assets/')).map((u) => u.replace(/[?#].*$/, '')))];

// The pinned commit's testcases.json, every case of a mapped rule and the assets they name, into test/.act/<commit>/.
export async function fetchCases({ commit = ACT_COMMIT, fetchImpl = fetch, into = caseDir(commit) } = {}) {
  const raw = (p) => `https://raw.githubusercontent.com/${ACT_REPO}/${commit}/content-assets/wcag-act-rules/${p}`;
  const get = async (p, binary = false) => {
    const r = await fetchImpl(raw(p));
    if (!r.ok) throw new Error(`${p}: ${r.status}`);
    return binary ? Buffer.from(await r.arrayBuffer()) : r.text();
  };
  rmSync(into, { recursive: true, force: true });
  mkdirSync(into, { recursive: true });
  const index = JSON.parse(await get('testcases.json'));
  const cases = mappedCases(index.testcases);
  writeFileSync(join(into, 'testcases.json'), JSON.stringify({ ...index, testcases: cases }, null, 1));
  const assets = new Set();
  for (const t of cases) {
    const html = await get(t.relativePath);
    mkdirSync(dirname(join(into, t.relativePath)), { recursive: true });
    writeFileSync(join(into, t.relativePath), html);
    for (const a of assetsOf(html)) assets.add(a.startsWith(BASE_PATH) ? a.slice(BASE_PATH.length) : a.slice(1));
  }
  for (const a of assets) {
    try { const b = await get(a, true); mkdirSync(dirname(join(into, a)), { recursive: true }); writeFileSync(join(into, a), b); } catch { /* an asset gone from the pin is said by the case that needs it */ }
  }
  writeFileSync(join(into, 'README.md'), `The W3C's ACT Rules test cases at ${ACT_REPO}@${commit}, for the rules the engine maps (lib/act-rules.mjs). Fetched, never committed. Licence: ${index.license}. Do not edit.\n`);
  return { into, cases: cases.length, assets: assets.size };
}

const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.svg': 'image/svg+xml', '.mp4': 'video/mp4', '.webm': 'video/webm', '.mp3': 'audio/mpeg', '.vtt': 'text/vtt' };
// The fetched cases served at the paths the W3C serves them, on this computer only.
export function serve(dir) {
  return new Promise((resolve) => {
    const server = createServer((req, res) => {
      let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
      p = p.startsWith(BASE_PATH) ? p.slice(BASE_PATH.length) : p.slice(1);
      const file = normalize(join(dir, p));
      if (!file.startsWith(dir) || !existsSync(file)) { res.writeHead(404); res.end(); return; }
      res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' });
      res.end(readFileSync(file));
    }).listen(0, '127.0.0.1', () => resolve({ origin: `http://127.0.0.1:${server.address().port}`, close: () => server.close() }));
  });
}

// One case through the real engine, axe-core left out: the kinds it raised.
export function runCase(url, { cwd, timeoutMs = 120000 } = {}) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [join(ENGINE, 'lib', 'a11y-check.mjs'), '--url', url, '--json', '--no-axe', '--no-states', '--fresh'], { cwd, env: { ...process.env, NO_COLOR: '1' } });
    let out = '';
    child.stdout.on('data', (d) => { out += d; });
    const timer = setTimeout(() => child.kill('SIGKILL'), timeoutMs);
    child.on('close', () => {
      clearTimeout(timer);
      try { const j = JSON.parse(out.slice(out.indexOf('{'))); resolve({ raised: (j.issues ?? []).map((i) => ({ kind: i.issue, said: String(i.selector ?? '') })) }); }
      catch { resolve({ raised: [], error: 'the engine wrote no result' }); }
    });
  });
}

export async function runAll({ only = null, concurrency = 4, log = console.log } = {}) {
  const dir = fixtureDir();
  const cases = mappedCases(JSON.parse(readFileSync(join(dir, 'testcases.json'), 'utf8')).testcases, only);
  const srv = await serve(dir);
  const cwd = mkdtempSync(join(tmpdir(), 'act-rules-'));
  const results = [];
  try {
    let next = 0;
    await Promise.all(Array.from({ length: concurrency }, async () => {
      while (next < cases.length) {
        const t = cases[next++];
        const url = srv.origin + BASE_PATH + t.relativePath;
        const got = await runCase(url, { cwd });
        const rule = RULES[t.ruleId];
        const verdict = got.error ? 'disagree' : judge(t.expected, got.raised, rule.kinds, rule.says);
        const mine = got.raised.filter((r) => rule.kinds.includes(r.kind) && (!rule.says || rule.says.test(r.said)));
        results.push({ ...t, url, raised: mine.map((r) => `${r.kind}: ${r.said}`.slice(0, 160)), verdict, ...(got.error ? { error: got.error } : {}) });
        log(`${verdict === 'agree' ? 'agree   ' : KNOWN[t.testcaseId] ? 'known   ' : 'DISAGREE'} ${t.ruleId} ${t.expected.padEnd(12)} ${t.testcaseId.slice(0, 8)} raised: ${mine.map((r) => r.kind).join(' · ') || 'none of its kinds'}${got.error ? ` (${got.error})` : ''}`);
      }
    }));
  } finally { srv.close(); rmSync(cwd, { recursive: true, force: true }); }
  return summarise(results);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === normalize(process.argv[1])) {
  const [cmd] = process.argv.slice(2);
  const ri = process.argv.indexOf('--rule');
  const only = ri > 0 ? String(process.argv[ri + 1] ?? '').split(',').filter(Boolean) : null;
  if (cmd === 'fetch') { const r = await fetchCases(); console.log(`ACT Rules at ${ACT_COMMIT.slice(0, 7)}: ${r.cases} cases of ${Object.keys(RULES).length} rules and ${r.assets} assets in ${r.into}.`); }
  else if (cmd === 'rules') { for (const [id, r] of Object.entries(RULES)) console.log(`${id}  ${r.name}  → ${r.kinds.join(' · ')}`); console.log(`Every other ACT rule: ${UNMAPPED_WHY}.`); }
  else if (cmd === 'run') {
    const sum = await runAll({ only });
    console.log('');
    for (const s of sum) console.log(`${s.holds ? '✅' : '❌'} ${s.rule} ${s.name}: ${s.agree} of ${s.cases} agree${s.known.length ? `, ${s.known.length} known` : ''}${s.disagree.length ? `, ${s.disagree.length} disagree` : ''}`);
    const bad = sum.filter((s) => !s.holds);
    for (const s of bad) for (const d of s.disagree) console.log(`::error title=ACT ${s.rule} ${d.id.slice(0, 8)}::${s.name}: the W3C expects ${d.expected}, the engine raised ${d.raised.join(' · ') || 'nothing'}`);
    console.log(`\n${sum.length - bad.length} of ${sum.length} rules hold.`);
    process.exit(bad.length ? 1 : 0);
  } else { console.log('node lib/act-rules.mjs fetch | run [--rule <id>] | rules'); process.exit(2); }
}
