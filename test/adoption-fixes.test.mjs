// The causes behind the misses of the 2026-10 evaluations, each made deterministic so the model does not decide it:
// the first fix on a tie, the file a page name refers to, the role Figma's annotation asks for, and the sentence owed
// when a colour has no variable.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { burndownLines } from '../run-diff.mjs';
import { buildSummary } from '../next-step.mjs';
import { route, pagesNamed, rawColoursOf } from '../route.mjs';
import { roleWord, roleMarkupFindings } from '../role-markup.mjs';
import { sayKind } from '../guard.mjs';
import { fixtureProject } from './helpers.mjs';

const ENGINE = dirname(dirname(fileURLToPath(import.meta.url)));

test('a burndown tie is said, and the summary names what to fix first', () => {
  const lines = burndownLines({ rows: [{ name: 'button', open: 5, was: null }, { name: 'chip', open: 5, was: null }], loose: 0, done: [] });
  assert.match(lines[1], /next up: button \(tied with chip at 5; a tie goes in name order\)/);
  const s = buildSummary({ verdict: 'fail', gates: [], burndown: lines, next: 'NEXT: x' });
  assert.match(s, /Fix first: button \(tied with chip at 5/);
});

test('a page named in a request is the file whose path holds that word', () => {
  const pages = ['apps/gallery/ui.html', 'apps/settings/ui.html', 'src/components/Button.jsx'];
  assert.deepEqual(pagesNamed('add a small green "Saved" confirmation next to the Save button on the gallery page', pages, ['button', 'chip']), ['apps/gallery/ui.html']);
  assert.deepEqual(pagesNamed('add a button to the page', pages, ['button']), []);
  const r = route('add a small green "Saved" confirmation next to the Save button on the gallery page', { components: ['button', 'chip'], pages });
  assert.ok(r.notes.some((n) => /The file the request names is apps\/gallery\/ui\.html/.test(n)), r.notes.join('\n'));
});

test('the role Figma annotates is read in the markup: a <div> toggle fails, a button with aria-pressed passes', () => {
  assert.equal(roleWord([{ label: 'Role: togglebutton' }]), 'togglebutton');
  assert.deepEqual(roleMarkupFindings('return <div className="chip">{label}</div>', 'togglebutton'), ['a <button> (or role="button")', 'aria-pressed, written even when it is false']);
  assert.deepEqual(roleMarkupFindings('return <button type="button" aria-pressed={on}>{label}</button>', 'togglebutton'), []);
  assert.deepEqual(roleMarkupFindings('return <Button pressed={on}>{label}</Button>', 'togglebutton'), [], 'composed from the system\'s own component: left to the browser check');
  const dir = fixtureProject(join(ENGINE, 'test', 'fixtures', 'tidepool-figma'), 'tp-role-');
  mkdirSync(join(dir, 'src/components'), { recursive: true });
  writeFileSync(join(dir, 'src/components/Chip.jsx'), 'export function Chip({ Size = "M", Icon = "False", Label = "Filter" }) {\n  return <div className="chip">{Label}</div>;\n}\n');
  writeFileSync(join(dir, 'src/components/chip.css'), '.chip { height: 24px; }\n');
  const r = spawnSync(process.execPath, [join(ENGINE, 'audit.mjs'), '--component', 'chip', '--only', '15'], { cwd: dir, encoding: 'utf8', env: { ...process.env, NO_COLOR: '1' } });
  assert.match(r.stdout, /chip: Figma's annotation says role togglebutton; the code needs a <button> \(or role="button"\) and aria-pressed/);
});

test('building a component Figma paints with a colour that has no variable: the person is told, in the reply', () => {
  const struct = JSON.parse(readFileSync(join(ENGINE, 'test/fixtures/tidepool-figma/src/figma/figma-structure.snapshot.json'), 'utf8')).components;
  const raw = rawColoursOf(struct);
  assert.deepEqual(raw.tag, ['Tone=Positive #d6f5e3, #136c3a']);
  const r = route('build the tag from our Figma design system as a React component', { components: Object.keys(struct), rawColours: raw, build: true });
  assert.equal(r.recipe, 'build-from-figma');
  assert.equal(sayKind(r.say[0]), 'noVariable', r.say.join('\n'));
  assert.equal(route('build the button from our Figma design system', { components: Object.keys(struct), rawColours: raw, build: true }).say.length, 0);
});
