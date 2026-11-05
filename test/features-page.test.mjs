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
const parts = [...rows].map(([n]) => n);
const usable = [...rows].filter(([, s]) => s !== 'Coming soon').map(([n]) => n);

// A stage is what the owner promises people, set by hand on the page, not a statement about whether anything is
// written yet: a part may be held at Coming soon while its requests and its technical section already exist, and a
// part may be Ready to use before either is written. So the pages are held to the parts, never to the stages: every
// group and every section names a part of the page, and nothing a reader can use goes undocumented.
test('every group on the commands page names a part of the features page, or Set up', () => {
  const groups = [...read('docs/commands.md').matchAll(/^## (.+)$/gm)].map((m) => m[1]);
  assert.deepEqual(groups.filter((g) => g !== 'Set up' && !parts.includes(g)), []);
});

// The page also carries sections that are not parts at all (Install and update, Run it, Security and data), so only
// the other direction can be held: nothing a reader can use is left without its technical section.
test('the technical documentation covers every usable part', () => {
  const sections = [...read('docs/details.md').matchAll(/^## (.+)$/gm)].map((m) => m[1]);
  for (const name of usable.filter((n) => n !== "Fit your team's setup")) assert.ok(sections.includes(name), name);
});
