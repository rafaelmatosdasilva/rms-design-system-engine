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

test('parts you can use come first, and headings carry no stage', () => {
  const stages = [...rows.values()];
  assert.equal(stages.findIndex((s) => s === 'Coming soon'), stages.filter((s) => s !== 'Coming soon').length);
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
