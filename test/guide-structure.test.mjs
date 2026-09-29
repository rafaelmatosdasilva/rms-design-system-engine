// The guide as a main file, recipes and reference (idea I55): the structure that keeps it whole.
//   • every recipe is in the main file's index, and every index entry is a recipe
//   • every recipe follows the template (use when, steps, NEXT handling, read more, a recipe-check block)
//   • the main file stays small, since it is loaded on every run
//   • no long paragraph lives in two files, so a recipe and the reference cannot drift apart
//   • every --recipe / --reference name, "see *X* in …" pointer, step and gate reference resolves
//   • every recipe's recipe-check commands run on the demo design system
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync, cpSync, mkdtempSync, writeFileSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { units } from './skill-evals/check-split.mjs';

const ENGINE = dirname(dirname(fileURLToPath(import.meta.url)));
const MAIN = 'rms-figma-code-parity.md';
const list = (d) => (existsSync(join(ENGINE, d)) ? readdirSync(join(ENGINE, d)).filter((f) => f.endsWith('.md')).sort().map((f) => `${d}/${f}`) : []);
const RECIPES = list('cookbook'), REFERENCE = list('reference');
const FILES = [MAIN, ...REFERENCE, ...RECIPES];
const read = (f) => readFileSync(join(ENGINE, f), 'utf8');
const name = (f) => basename(f, '.md');
const main = read(MAIN);

test('every recipe is indexed in the main file, and every index entry is a recipe', () => {
  const index = main.match(/\n## Recipes and reference[\s\S]*?(?=\n## )/)?.[0] ?? '';
  assert.ok(index, 'the main file has a "Recipes and reference" index');
  const indexed = [...index.matchAll(/^\|[^|\n]+\| `([a-z0-9-]+)` \|$/gm)].map((m) => m[1]);
  assert.deepEqual([...indexed].sort(), RECIPES.map(name).sort());
  assert.equal(new Set(indexed).size, indexed.length, 'each recipe is indexed once');
  const refs = [...index.matchAll(/`([a-z-]+)`\s+\(/g)].map((m) => m[1]);
  for (const r of REFERENCE.map(name)) assert.ok(refs.includes(r), `reference ${r} is named in the index`);
});

test('every recipe follows the template', () => {
  for (const f of RECIPES) {
    const t = read(f);
    assert.match(t, /^# \S.*\n\n\*\*Use when\.\*\* \S/, `${f}: a title, then "Use when"`);
    assert.match(t, /\n## Steps\n\n1\. \S/, `${f}: numbered steps`);
    assert.match(t, /\nAlways: relay the SUMMARY block as it is, then follow its `NEXT:` line\. Change code, config or snapshots only when the person asks for that change\./, `${f}: the NEXT handling`);
    assert.match(t, /\n## Read more\n\n- \S/, `${f}: links into the reference`);
    assert.match(t, /\n```recipe-check\nrms-figma-code-parity\b[^\n]*\n```\n/, `${f}: a recipe-check block`);
  }
});

test('the main file stays small: it is loaded on every run', () => {
  assert.ok(Buffer.byteLength(main) <= 30 * 1024, `${MAIN} is ${Buffer.byteLength(main)} bytes, over 30 KB: move task steps to a recipe`);
});

test('no paragraph of 120 characters or more lives in two places', () => {
  const where = new Map();
  const template = /^Always: relay the SUMMARY block/;   // the recipe template's own line, the same on purpose
  for (const f of FILES) for (const u of units(read(f))) if (u.length >= 120 && !template.test(u)) where.set(u, [...(where.get(u) ?? []), f]);
  const twice = [...where].filter(([, fs]) => fs.length > 1).map(([u, fs]) => `${fs.join(' + ')}: ${u.slice(0, 100)}`);
  assert.deepEqual(twice, []);
});

// A label is a heading or a bold lead-in ("**Disabled wins.**").
const hasLabel = (text, label) => new RegExp(`^(#+ ${esc(label)}\\b|\\*\\*${esc(label)}\\.?\\*\\*)`, 'm').test(text);
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const fileOf = (kind, n) => (kind === 'recipe' ? `cookbook/${n}.md` : `reference/${n}.md`);

test('every --recipe and --reference name exists', () => {
  const bad = [];
  for (const f of [...FILES, 'README.md']) for (const m of read(f).matchAll(/--(recipe|reference) ([a-z][a-z0-9-]*)/g)) {
    if (!existsSync(join(ENGINE, fileOf(m[1], m[2])))) bad.push(`${f}: --${m[1]} ${m[2]}`);
  }
  assert.deepEqual(bad, []);
});

test('every "see *X*" and read-more label resolves in the file it names', () => {
  const bad = [];
  for (const f of FILES) {
    const t = read(f);
    for (const m of t.matchAll(/see \*([^*\n]+)\*( in (the main guide|`rms-figma-code-parity --(recipe|reference) ([a-z0-9-]+)`))?/g)) {
      const target = m[3] === 'the main guide' ? MAIN : m[4] ? fileOf(m[4], m[5]) : f;
      if (!hasLabel(read(target), m[1])) bad.push(`${f}: see *${m[1]}*${m[2] ?? ''}`);
    }
    // Recipe "Read more" lines: `rms-figma-code-parity --reference usage`: *A*, *B*
    for (const line of t.match(/\n## Read more\n\n[\s\S]*?(?=\n```|\n## |$)/)?.[0].split('\n') ?? []) {
      const m = line.match(/--(recipe|reference) ([a-z0-9-]+)`:(.*)/);
      if (!m) continue;
      for (const l of m[3].matchAll(/\*([^*]+)\*/g)) if (!hasLabel(read(fileOf(m[1], m[2])), l[1])) bad.push(`${f}: read more *${l[1]}* in ${m[2]}`);
    }
  }
  assert.deepEqual(bad, []);
});

test('every step and gate reference resolves', () => {
  const all = FILES.map(read).join('\n');
  const headings = all.split('\n').filter((l) => /^#+ /.test(l)).join('\n');
  const steps = [...new Set([...all.matchAll(/\bStep (\d+[a-z]?)\b/g)].map((m) => m[1]))];
  assert.deepEqual(steps.filter((s) => !new RegExp(`Step ${s}\\b`).test(headings)), [], 'a "Step N" with no heading');
  const table = new Set([...all.matchAll(/^\| \[(\d+[a-z]?)\]/gm)].map((m) => m[1]));
  assert.ok(table.size >= 20, 'the gate table is found');
  const gates = [...new Set([...all.matchAll(/\bGate \[(\d+)([a-z]?)\]/g)].map((m) => m[1]))];
  assert.deepEqual(gates.filter((g) => !table.has(g)), [], 'a "Gate [N]" with no row in the gate table');
});

test('every recipe-check command runs on the demo design system', { timeout: 600000 }, () => {
  const dir = mkdtempSync(join(tmpdir(), 'recipe-check-'));
  cpSync(join(ENGINE, 'test', 'fixtures', 'demo-ds'), dir, { recursive: true, filter: (p) => !/expected-report/.test(p) });
  const today = new Date().toISOString();
  for (const f of readdirSync(join(dir, 'src')).filter((x) => x.endsWith('.json'))) writeFileSync(join(dir, 'src', f), readFileSync(join(dir, 'src', f), 'utf8').replace(/"_updated": "[^"]*"/, `"_updated": "${today}"`));
  const env = { ...process.env, GIT_AUTHOR_NAME: 'demo', GIT_AUTHOR_EMAIL: 'demo@example.com', GIT_COMMITTER_NAME: 'demo', GIT_COMMITTER_EMAIL: 'demo@example.com' };
  for (const a of [['init', '-q'], ['add', '-A'], ['commit', '-qm', 'init']]) execFileSync('git', a, { cwd: dir, env });
  // Without Chrome, so the check is fast and the same everywhere; the audit runs first so --summary has one.
  const run = (args) => spawnSync(process.execPath, [join(ENGINE, 'audit.mjs'), ...args], { cwd: dir, encoding: 'utf8', timeout: 300000, env: { ...process.env, HOME: dir, CHROME_PATH: join(dir, 'no-chrome'), PLAYWRIGHT_BROWSERS_PATH: join(dir, 'none'), NO_COLOR: '1', CI: '1' } });
  run([]);
  const checks = RECIPES.flatMap((f) => [...read(f).matchAll(/\n```recipe-check\n([\s\S]*?)\n```/g)].flatMap((m) => m[1].split('\n').filter(Boolean).map((cmd) => ({ f, cmd }))));
  assert.equal(checks.length >= RECIPES.length, true);
  const bad = [];
  for (const { f, cmd } of checks) {
    const r = run(cmd.replace(/^rms-figma-code-parity\s*/, '').split(/\s+/).filter(Boolean));
    const out = (r.stdout ?? '') + (r.stderr ?? '');
    if (![0, 1].includes(r.status) || /Unknown (option|flag)|TypeError|ReferenceError|SyntaxError|\n\s+at .+:\d+:\d+\)/.test(out) || !out.trim()) bad.push(`${f}: \`${cmd}\` exit ${r.status}: ${out.trim().split('\n').slice(-3).join(' / ').slice(0, 300)}`);
  }
  assert.deepEqual(bad, []);
});
