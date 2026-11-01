// docs/features.md gives each part one stage: Ready to use, Actively improving, Early development or Coming soon. The
// "On this page" table and the line under each section's heading say the same, and headings carry no stage, so a
// link to a section survives its stage changing.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ENGINE = dirname(dirname(fileURLToPath(import.meta.url)));
const PAGE = readFileSync(join(ENGINE, 'docs', 'features.md'), 'utf8');
const STAGE = /^(Ready to use|Actively improving|Early development|Coming soon)$/;

const rows = new Map([...PAGE.matchAll(/^\| \[(.+?)\]\(#.+?\) \|.*\| ([^|]+?) \|$/gm)].map((m) => [m[1], m[2]]));
const sections = new Map([...PAGE.matchAll(/^## (.+)\n\n\*\*(.+?)\*\* · \*\*Why it matters:\*\*/gm)].map((m) => [m[1], m[2]]));

test('every part has one stage, the same in the table and in its section', () => {
  assert.ok(rows.size > 0 && sections.size === rows.size, 'each row has its section');
  for (const [name, stage] of rows) {
    assert.match(stage, STAGE, name);
    assert.equal(sections.get(name), stage, name);
  }
});

// Ready to use, then Actively improving, Early development and Coming soon, in the table and in the sections alike,
// so the page reads as the status it is.
const ORDER = ['Ready to use', 'Actively improving', 'Early development', 'Coming soon'];
const inOrder = (stages) => stages.every((s, i) => i === 0 || ORDER.indexOf(stages[i - 1]) <= ORDER.indexOf(s));

test('parts are listed by stage, most ready first, and headings carry no stage', () => {
  assert.ok(inOrder([...rows.values()]), `table: ${[...rows.values()].join(', ')}`);
  assert.deepEqual([...sections.keys()], [...rows.keys()], 'sections follow the table');
  assert.deepEqual([...PAGE.matchAll(/^## .+ · \w+$/gm)].map((m) => m[0]), []);
});

test('no other stage names are left on the page', () => {
  assert.deepEqual(PAGE.match(/\b(Stable|Beta|Experimental|Planned)\b|[●○]/g), null);
});

const read = (f) => readFileSync(join(ENGINE, f), 'utf8');
const usable = [...rows].filter(([, s]) => s !== 'Coming soon').map(([n]) => n);
const soon = [...rows].filter(([, s]) => s === 'Coming soon').map(([n]) => n);

test('the commands page groups its requests under Set up and the usable parts, and has none for a part coming soon', () => {
  const groups = [...read('docs/commands.md').matchAll(/^## (.+)$/gm)].map((m) => m[1]);
  assert.deepEqual(groups.filter((g) => g !== 'Set up' && !usable.includes(g)), []);
});

test('the technical documentation has a section for every usable part, and none for a part coming soon', () => {
  const sections = [...read('docs/details.md').matchAll(/^## (.+)$/gm)].map((m) => m[1]);
  for (const name of usable.filter((n) => n !== "Fit your team's setup")) assert.ok(sections.includes(name), name);
  assert.deepEqual(sections.filter((s) => soon.includes(s)), []);
});
