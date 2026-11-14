// Who acts on each accessibility finding: a criterion is not a task. One criterion can owe work to several people,
// and one finding two steps to two of them (a colour pair is picked in Figma, then used in the code). The profile
// belongs to the finding kind, is decided once (wcag21.mjs), travels on every record in a11y.json, and the style
// guide shows it as a column of its own with a filter.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WCAG22, WCAG_TASKS, WHO_PROFILES, tasksFor, whoForCriterion } from '../lib/wcag21.mjs';
import { A11Y_GUIDE, WHO_SAYS, a11yFindingRecord } from '../lib/a11y-check.mjs';
import { templateText } from '../lib/styleguide-template.mjs';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

test('the five profiles are the same everywhere, and nothing names a sixth', () => {
  assert.deepEqual(WHO_PROFILES, ['designer', 'developer', 'content', 'product', 'a11y']);
  assert.deepEqual(Object.keys(WHO_SAYS), WHO_PROFILES, 'the command line says the same five, in the same order');
  for (const steps of Object.values(WCAG_TASKS)) for (const t of steps) assert.ok(WHO_PROFILES.includes(t.who), t.who);
});

test('every finding kind owes somebody a task, and its words are never written twice', () => {
  for (const [kind, g] of Object.entries(A11Y_GUIDE)) {
    const steps = tasksFor(kind, g.fix);
    assert.ok(steps.length, `${kind} owes a task`);
    for (const t of steps) {
      assert.ok(WHO_PROFILES.includes(t.who), `${kind}: ${t.who}`);
      assert.ok(t.todo && t.todo.length > 5, `${kind} says what to do`);
      assert.ok(t.steps >= t.step && t.step >= 1, `${kind}: step ${t.step} of ${t.steps}`);
    }
    // A kind the table does not name is the code's, in one step, and its words are the kind's own fix: the one
    // wording stays in one place.
    if (!WCAG_TASKS[kind]) assert.deepEqual(steps, [{ who: 'developer', todo: g.fix.trim(), step: 1, steps: 1 }], kind);
  }
});

test('a finding that owes two people says a different thing to each, in order', () => {
  const two = Object.entries(A11Y_GUIDE).map(([k, g]) => [k, tasksFor(k, g.fix)]).filter(([, t]) => t.length > 1);
  assert.ok(two.length > 10, 'colour, size and the words all take two steps');
  for (const [kind, steps] of two) {
    assert.deepEqual(steps.map((t) => t.step), steps.map((_, i) => i + 1), kind);
    assert.equal(new Set(steps.map((t) => t.todo)).size, steps.length, `${kind}: each step says its own thing`);
    assert.equal(new Set(steps.map((t) => t.who)).size, steps.length, `${kind}: a different person each step`);
  }
  // A colour pair is picked where the system's colours live, then used in the code.
  assert.deepEqual(tasksFor('contrast', A11Y_GUIDE.contrast.fix).map((t) => t.who), ['designer', 'developer']);
  // Words are written before anything carries them.
  assert.deepEqual(tasksFor('textalt', A11Y_GUIDE.textalt.fix).map((t) => t.who), ['content', 'developer']);
  // A target's size is the design's, then the code's.
  assert.deepEqual(tasksFor('target', A11Y_GUIDE.target.fix).map((t) => t.who), ['designer', 'developer']);
});

test('a criterion with no finding of its own still reaches a person', () => {
  assert.equal(whoForCriterion('1.3.3'), 'a11y', 'only a person can judge it');
  assert.equal(whoForCriterion('3.3.3'), 'a11y');
  assert.equal(whoForCriterion('1.2.2'), 'content', "a recording's words are the content's");
  assert.equal(whoForCriterion('2.4.5'), 'product', "a page's own is the product's");
  assert.equal(whoForCriterion('2.1.1'), 'developer');
  // Every criterion of the target reaches one of the five, through its kinds or through this.
  for (const c of WCAG22) {
    const whos = [...(c.kinds ?? []), ...(c.pageKinds ?? [])].flatMap((k) => tasksFor(k, A11Y_GUIDE[k]?.fix).map((t) => t.who));
    const who = whos.length ? whos : [whoForCriterion(c.sc)];
    for (const w of who) assert.ok(WHO_PROFILES.includes(w), `${c.sc}: ${w}`);
  }
});

test('every finding carries its tasks, so a11y.json says who acts', () => {
  const r = a11yFindingRecord('contrast', { desc: '.card-title', ratio: 3.9, threshold: 4.5, theme: 'light' });
  assert.equal(r.wcag, '1.4.3');
  assert.deepEqual(r.tasks.map((t) => t.who), ['designer', 'developer']);
  assert.match(r.tasks[0].todo, /4\.5:1/);
  // One step: the record still says who, so nothing has to guess from the words.
  assert.deepEqual(a11yFindingRecord('aria', { desc: 'div' }).tasks.map((t) => t.who), ['developer']);
});

// The column was added to the table and nothing else was moved to meet it: the panel still wrote who inside what to
// do and left the new column saying "Nothing.", the eight columns shared the room evenly so the one sentence a person
// reads wrapped to five lines, and the tooltip that lists where a criterion was tried repeated one address thirty
// times. Each is checked here, against the template as it is written.
test('who acts has a card of its own in the panel, and what to do says only what to do, at the top', () => {
  const page = templateText();
  // Its own card, from the row's own who, where the table has its column.
  assert.match(page, /if \(k === 'whoCell'\) return card\(col\[0\], r\.who \?/);
  // What to do never repeats who acts (the owner's, 12 November 2026), and every panel opens with it.
  assert.match(page, /if \(k === 'todo'\) return card\(col\[0\], \(r\.todo \?/);
  assert.match(page, /order = order\.filter\(function \(col\) \{ return col\[1\] === 'todo'; \}\)\.concat/);
  assert.doesNotMatch(page, /if \(taskOpen\) order =/, 'whether the task is open or done');
  assert.match(page, /cards\.splice\(firstTodo, 0, '<div class="pg-inspect sg-token-card"><div class="pg-inspect-head">What it affects/, 'what it affects goes under it');
});

test('every issue table gives each column its share by what it holds, and the column it is read for the rest', () => {
  const css = readFileSync(join(ROOT, 'templates', 'styleguide', 'css', '09-component-playground.css'), 'utf8');
  // A share for each kind of column, in percent, whatever its place: a column a table leaves out never shifts the rest.
  for (const k of ['no', 'kind', 'whoCell', 'source', 'status', 'updated']) assert.match(css, new RegExp(`\\.sg-issues \\.sg-col-${k} \\{ width: \\d+%; \\}`), `column ${k}`);
  assert.match(css, /\.sg-issues :is\(\.sg-col-figma, \.sg-col-code\) \{ width: \d+%; \}/);
  assert.match(css, /\.sg-issues \.sg-col-rest \{ width: auto; \}/, 'the column it is read for takes what is left');
  assert.doesNotMatch(css, /\.sg-cols-\d th:nth-child/, 'no width set by a column\'s place');
  assert.match(css, /\.sg-issues \[data-empty-col\] \{ display: none; \}/, 'a column with nothing in any row is left out');
  const page = templateText();
  // Accessibility's criterion is what it is read for; Motion's what to do, left out when nothing is to do.
  assert.match(page, /return read\.length \? read : has\('figma'\) && has\('code'\) \? \['figma', 'code'\] : \['kind'\];/);
});

test('the style guide shows the task, its criterion, the person in a column, and filters by them', () => {
  const page = templateText();
  // The table: the task, its criterion, then who does it (the owner's order, 11 November 2026).
  assert.match(page, /Accessibility: \[\['Task nr', 'no'\], \['WCAG', 'kind'\], \['Who acts', 'whoCell'\], \['What to do', 'todo'\]/);
  // What to do is read in the row's panel, with what the Figma notes say and what was found.
  assert.match(page, /PANEL_ONLY = \{ Parity: \['todo'\], Accessibility: \['todo', 'figma', 'code'\]/);
  // One row per person, each with that person's steps alone, and the step said so a row read on its own still says
  // it follows another's.
  assert.match(page, /return byWho\.map\(function \(g\) \{/);
  assert.match(page, /whoKey: g\.who, who: WHO\[g\.who\] \+ teamNote\(c\.name\)/);
  assert.match(page, /r\.steps > 1 \? '<span class="sg-todo-step"/);
  // The five, with words of their own, and a filter that takes one at a time.
  for (const w of ['A designer, in Figma', 'Whoever writes the words', 'Whoever owns the flow', 'A person checks it by hand']) assert.ok(page.includes(w), w);
  assert.match(page, /aria-multiselectable="false" aria-label="Who acts"/, 'one person at a time, never a running total');
  // All is an option of its own, chosen to begin with, and it is no filter at all.
  assert.match(page, /data-whopick="all" aria-selected="true"><span>All<\/span>/);
  assert.match(page, /\.filter\(function \(k\) \{ return k !== 'all'; \}\)/);
  // Choosing one unchooses the rest, so the list never adds up.
  assert.match(page, /x\.setAttribute\('aria-selected', x === o \? 'true' : 'false'\)/);
  assert.match(page, /function applyWho\(dd\)/);
  // The two filters agree on what is shown: a row is hidden when either one hides it.
  assert.match(page, /\.sg-issues tr\.sg-st-off, \.sg-issues tr\.sg-who-off/);
  assert.match(page, /tr\.classList\.toggle\('sg-who-off', !has\)/);
});
