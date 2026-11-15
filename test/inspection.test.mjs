import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inspect, inspectionLines, inspectionMarkdown, QUESTIONS } from '../lib/inspection.mjs';
import { compareVersions } from '../lib/releases.mjs';

const at = (rows, id) => rows.find((r) => r.id === id);

test('with nothing read, every question is unrated and says what it could not see, never a guess', () => {
  const rows = inspect({});
  assert.equal(rows.length, 10);
  for (const r of rows) { assert.equal(r.rating, null, r.id); assert.ok(r.unseen.length, r.id); assert.ok(r.interview, r.id); }
});

test('each question is rated from its own evidence', () => {
  const rows = inspect({
    common: { sides: ['figma', 'code'], rows: [{ id: 'button', figma: ['button'], code: ['Button'] }, { id: 'link', figma: [], code: [] }, { id: 'tabs', figma: [], code: [], kept: 'no product has tabs' }] },
    gates: [{ check: 'A', verdict: 'passes' }, { check: 'B', verdict: 'passes' }, { check: 'C', verdict: 'not checked' }],
    a11y: { blockers: 0, warnings: 1, target: 'WCAG 2.2 AA', browsers: { chrome: true, firefox: false } },
    names: { figma: ['Button', 'Chip'], code: ['button', 'chip'] },
    tests: { components: 4, tested: 1, shown: 4 },
    differences: { total: 0, kept: 2, notChecked: [] }, components: 4,
    governance: { rules: { major: { file: 'CONTRIBUTING.md' } }, gaps: { checked: { releases: 5 }, breaking: [{ tag: 'v3.0.0' }], unconventional: null } },
    products: [{ name: 'shop', uses: '2.1.0' }, { name: 'admin', uses: '3.0.0' }, { name: 'docs', uses: null }], latest: '3.0.0', compare: compareVersions,
    machine: { llms: true, contracts: 4, intentLayer: true, guidance: 'partial' },
    agents: { mcp: true, rules: ['AGENTS.md'], codeConnect: 0 },
  });
  assert.equal(at(rows, 'coverage').rating, 'yellow');
  assert.match(at(rows, 'coverage').evidence.join(' '), /1 of 2 common components .*left out on purpose/);
  assert.equal(at(rows, 'practices').rating, 'green');
  assert.deepEqual(at(rows, 'practices').unseen, ['1 check not run']);
  assert.equal(at(rows, 'accessibility').rating, 'yellow');
  assert.deepEqual(at(rows, 'accessibility').unseen, ['firefox, not here to run in']);
  assert.equal(at(rows, 'language').rating, 'green');
  assert.equal(at(rows, 'testing').rating, 'red');
  assert.equal(at(rows, 'orchestration').rating, 'green');
  assert.equal(at(rows, 'governance').rating, 'yellow');
  assert.equal(at(rows, 'adoption').rating, 'yellow');
  assert.match(at(rows, 'adoption').evidence.join(' '), /1 on the latest \(3\.0\.0\), 1 behind, 1 by a major/);
  assert.deepEqual(at(rows, 'adoption').unseen, ['the version of 1 product']);
  assert.equal(at(rows, 'machine').rating, 'green');
  assert.equal(at(rows, 'agents').rating, 'green');
});

test('governance on paper with no release to hold it to is evidence, not a rating', () => {
  const r = at(inspect({ governance: { rules: { changelog: { file: 'CHANGELOG.md' } }, gaps: null } }), 'governance');
  assert.equal(r.rating, null);
  assert.deepEqual(r.unseen, ['no release tagged to hold them to']);
});

test('the report names every question with what to ask in an interview, and writes no semicolon of its own', () => {
  const rows = inspect({ a11y: { blockers: 1, warnings: 0 } });
  const md = inspectionMarkdown(rows);
  for (const q of QUESTIONS) assert.ok(md.includes(`## ${q.question}`), q.id);
  assert.equal((md.match(/Ask in an interview/g) ?? []).length, 10);
  assert.doesNotMatch(md, /;/);
  const lines = inspectionLines(rows);
  assert.match(lines[0], /1 of 10 questions answered .*1 red/);
});
