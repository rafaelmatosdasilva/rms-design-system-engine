// docs/features.md gives each part one stage: Available with a maturity of one to three dots, or Planned. The
// "On this page" table and the line under each section's heading say the same, and headings carry no stage, so a
// link to a section survives its stage changing.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ENGINE = dirname(dirname(fileURLToPath(import.meta.url)));
const PAGE = readFileSync(join(ENGINE, 'docs', 'features.md'), 'utf8');
const STAGE = /^(Available (●●●|●●○|●○○)|Planned)$/;

const rows = new Map([...PAGE.matchAll(/^\| \[(.+?)\]\(#.+?\) \|.*\| ([^|]+?) \|$/gm)].map((m) => [m[1], m[2]]));
const sections = new Map([...PAGE.matchAll(/^## (.+)\n\n\*\*(.+?)\*\* · \*\*Why it matters:\*\*/gm)].map((m) => [m[1], m[2]]));

test('every part has one stage, the same in the table and in its section', () => {
  assert.ok(rows.size > 0 && sections.size === rows.size, 'each row has its section');
  for (const [name, stage] of rows) {
    assert.match(stage, STAGE, name);
    assert.equal(sections.get(name), stage, name);
  }
});

test('available parts come first, and headings carry no stage', () => {
  const stages = [...rows.values()];
  assert.equal(stages.findIndex((s) => s === 'Planned'), stages.filter((s) => s !== 'Planned').length);
  assert.deepEqual([...PAGE.matchAll(/^## .+ · \w+$/gm)].map((m) => m[0]), []);
});

test('no other stage names are left on the page', () => {
  assert.deepEqual(PAGE.match(/\b(Stable|Beta|Experimental)\b/g), null);
});
