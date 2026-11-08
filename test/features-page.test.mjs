// docs/features.md gives each part one stage: Ready to use, Actively improving, Early development or Coming soon. The
// "On this page" tables and the line under each section's heading say the same, and headings carry no stage, so a
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

// The parts are listed in groups, one table each (Audit, Documentation, Collaboration, Creation). Inside a group, Ready
// to use, then Actively improving, Early development and Coming soon, so each group reads as the status it is. The
// order of the groups, and of the parts inside one stage, is the owner's: the order in which they build on each other.
const ORDER = ['Ready to use', 'Actively improving', 'Early development', 'Coming soon'];
const inOrder = (stages) => stages.every((s, i) => i === 0 || ORDER.indexOf(stages[i - 1]) <= ORDER.indexOf(s));
const OVERVIEW = PAGE.slice(PAGE.indexOf('**On this page**'), PAGE.search(/^## /m));
const groups = OVERVIEW.split(/^### /m).slice(1).map((g) => ({ name: g.split('\n')[0], stages: [...g.matchAll(/^\| \[.+?\]\(#.+?\) \|.*\| ([^|]+?) \|$/gm)].map((m) => m[1]) }));

test('parts are listed in groups, by stage inside each, and headings carry no stage', () => {
  assert.ok(groups.length > 1 && groups.every((g) => g.stages.length), 'the parts are grouped, and no group is empty');
  for (const g of groups) assert.ok(inOrder(g.stages), `${g.name}: ${g.stages.join(', ')}`);
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
test('every What to ask table sits under a part of the page, or under Set up', () => {
  const under = [];
  let part = null;
  for (const line of PAGE.split('\n')) {
    const h = line.match(/^## (.+)$/)?.[1];
    if (h) part = h;
    if (/^### What to ask$/.test(line)) under.push(part);
  }
  assert.ok(under.length > 5, 'the parts carry their requests');
  assert.deepEqual(under.filter((g) => !parts.includes(g)), []);
  assert.ok(/^## Set up$/m.test(PAGE), 'the requests that set the engine up have their section');
});

// The technical documentation is one page per group (Test accessibility, the largest part, on a page of its own), and
// every part a reader can use has its section, under its own name, on its group's page. A page also carries sections
// that are not parts (Install and update, Security and data), so only that direction can be held.
const PAGE_OF_GROUP = { Audit: 'audit', Documentation: 'documentation', Collaboration: 'collaboration', Creation: 'creation' };
const groupOf = new Map(groups.flatMap((g) => [...OVERVIEW.split(/^### /m).find((x) => x.startsWith(g.name)).matchAll(/^\| \[(.+?)\]\(#/gm)].map((m) => [m[1], g.name])));
test('the technical documentation covers every usable part, on its group\'s page', () => {
  for (const name of usable) {
    const page = name === 'Test accessibility' ? 'accessibility' : PAGE_OF_GROUP[groupOf.get(name)];
    assert.ok(page, `${name}: its group has a page`);
    const sections = [...read(`docs/${page}.md`).matchAll(/^## (.+)$/gm)].map((m) => m[1]);
    assert.ok(sections.includes(name), `${name} on docs/${page}.md`);
  }
});

// The README's feature list is this page's overview, word for word: the same groups, names, descriptions and stages,
// only its links pointing here. It is the short index of this page, never a second description that drifts from it.
// The README draws it its own way, the owner's: a table per group with the group's name as its header, and each stage
// as a mark its legend line names (🟢 Ready to use). So both are read down to group, name, description and stage.
const listed = (text, stageOf) => {
  const groups = [];
  for (const line of text.split('\n')) {
    const group = line.match(/^### (.+)$/)?.[1] ?? line.match(/^\| ([^[|]+?) \|(?: *\|)+$/)?.[1];
    if (group) { groups.push({ group, rows: [] }); continue; }
    const row = line.match(/^\| \[(.+?)\]\([^)]*\) \| (.+?) \| ([^|]+?) \|$/);
    if (row && groups.length) groups.at(-1).rows.push([row[1], row[2], stageOf(row[3])]);
  }
  return groups;
};

test('the README lists the features exactly as this page does', () => {
  const readme = read('README.md');
  const at = readme.search(/^#{1,2} Features$/m), end = readme.indexOf("\n# ", at + 1), own = readme.slice(at, end < 0 ? undefined : end);
  const legend = new Map([...own.matchAll(/(\p{Extended_Pictographic}\uFE0F?) ([A-Z][a-z]+(?: [a-z]+)*)/gu)].map((m) => [m[1], m[2]]));
  const page = listed(OVERVIEW, (s) => s);
  const mine = listed(own, (s) => legend.get(s) ?? s);
  assert.ok(page.length > 0, 'the page has its overview');
  for (const stage of new Set(page.flatMap((g) => g.rows.map((r) => r[2])))) assert.ok([...legend.values()].includes(stage), `the README's legend names ${stage}`);
  assert.deepEqual(mine, page);
});
