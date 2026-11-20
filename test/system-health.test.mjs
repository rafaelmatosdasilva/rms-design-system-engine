import { test } from 'node:test';
import assert from 'node:assert/strict';
import { health, healthLines, healthMarkdown, healthSince, healthRecord, QUESTIONS, LAYERS } from '../lib/system-health.mjs';
import { compareVersions } from '../lib/releases.mjs';
import { route } from '../lib/route.mjs';

const at = (rows, id) => rows.find((r) => r.id === id);

test('thirteen questions, each under one of the engine\'s four layers, with the command that answers it and what only the team can tell', () => {
  assert.equal(QUESTIONS.length, 13);
  assert.deepEqual(LAYERS.map((l) => l.name), ['Facts', 'Contracts', 'Intent', 'Evaluation']);
  for (const q of QUESTIONS) {
    assert.ok(LAYERS.some((l) => l.id === q.layer), q.id);
    assert.match(q.run, /rms-design-system-engine|eval-run/, q.id);
    assert.ok(q.team, q.id);
    assert.match(q.question, /\?$/, q.id);
  }
});

test('with nothing read, every question is unanswered and says what it could not see, never a guess', () => {
  const rows = health({});
  assert.equal(rows.length, 13);
  for (const r of rows) { assert.equal(r.rating, null, r.id); assert.ok(r.unseen.length, r.id); }
});

test('each question is answered from its own evidence', () => {
  const rows = health({
    ages: { 'src/figma-vars.snapshot.json': 48, 'src/figma-structure.snapshot.json': 20, lastRun: 2 },
    common: { sides: ['figma', 'code'], rows: [{ id: 'button', figma: ['button'], code: ['Button'] }, { id: 'link', figma: [], code: [] }, { id: 'tabs', figma: [], code: [], kept: 'no product has tabs' }] },
    gates: [{ check: 'A', verdict: 'passes' }, { check: 'B', verdict: 'passes' }, { check: 'C', verdict: 'not checked' }],
    a11y: { blockers: 0, warnings: 1, target: 'WCAG 2.2 AA', browsers: { chrome: true, firefox: false } },
    names: { figma: ['Button', 'Chip'], code: ['button', 'chip'], documented: ['Button'] },
    census: { errors: 9, warnings: 2, files: 3, byKind: { colour: 7, spacing: 2 } },
    tests: { components: 4, tested: 1, shown: 4 },
    differences: { total: 0, kept: 2, notChecked: [] }, components: 4,
    explained: { components: 4, purpose: 4, use: 1, missing: [] },
    governance: { rules: { major: { file: 'CONTRIBUTING.md' } }, gaps: { checked: { releases: 5 }, breaking: [{ tag: 'v3.0.0' }], unconventional: null } },
    products: [{ name: 'shop', uses: '2.1.0' }, { name: 'admin', uses: '3.0.0' }, { name: 'docs', uses: null }], latest: '3.0.0', compare: compareVersions, departures: ['shop'],
    machine: { llms: true, contracts: 4, intentLayer: true, guidance: 'partial' },
    agents: { mcp: true, rules: ['AGENTS.md'], codeConnect: 0 },
    evals: { rate: 60, violations: 3, at: '2026-11-19' }, invented: { components: { Card2: { right: 'Card', times: 2 } }, props: {}, values: {}, events: {} },
  });
  assert.equal(at(rows, 'current').rating, 'good');
  assert.match(at(rows, 'current').evidence[0], /oldest \(src\/figma-vars\.snapshot\.json\) taken 2 days ago/);
  assert.equal(at(rows, 'agree').rating, 'good');
  assert.equal(at(rows, 'names').rating, 'good');
  assert.match(at(rows, 'names').evidence.join(' '), /1 of those also go by that name in the docs/);
  assert.equal(at(rows, 'values').rating, 'poor');
  assert.equal(at(rows, 'rules').rating, 'good');
  assert.deepEqual(at(rows, 'rules').unseen, ['1 check not run']);
  assert.equal(at(rows, 'access').rating, 'mixed');
  assert.deepEqual(at(rows, 'access').unseen, ['firefox, not installed here']);
  assert.equal(at(rows, 'proof').rating, 'poor');
  assert.equal(at(rows, 'whole').rating, 'mixed');
  assert.match(at(rows, 'whole').evidence.join(' '), /1 of 2 parts most products need .*left out on purpose/);
  assert.equal(at(rows, 'explained').rating, 'poor');
  assert.equal(at(rows, 'releases').rating, 'mixed');
  assert.equal(at(rows, 'products').rating, 'mixed');
  assert.match(at(rows, 'products').evidence.join(' '), /1 on the latest \(3\.0\.0\), 1 behind, 1 by a major.*1 product builds its own copy/);
  assert.equal(at(rows, 'learn').rating, 'good');
  assert.equal(at(rows, 'built').rating, 'mixed');
  assert.match(at(rows, 'built').evidence.join(' '), /60% .*1 name agents invented/);
});

test('an old capture is poor past the team\'s own ceiling, and current within a week', () => {
  assert.equal(at(health({ ages: { a: 24 * 40 } }), 'current').rating, 'poor');
  assert.equal(at(health({ ages: { a: 24 * 10, limitDays: 14 } }), 'current').rating, 'mixed');
  assert.equal(at(health({ ages: { a: 24 * 10, limitDays: 5 } }), 'current').rating, 'poor');
});

test('releases on paper with no release to hold them to is evidence, not an answer', () => {
  const r = at(health({ governance: { rules: { changelog: { file: 'CHANGELOG.md' } }, gaps: null } }), 'releases');
  assert.equal(r.rating, null);
  assert.deepEqual(r.unseen, ['no release tagged to hold them to']);
});

test('the next report says what got better and worse, and an unanswered side is not a change', () => {
  const first = health({ a11y: { blockers: 1, warnings: 0 }, gates: [{ check: 'A', verdict: 'passes' }] });
  const rec = healthRecord(first, '2026-11-01T00:00:00Z');
  const next = health({ a11y: { blockers: 0, warnings: 0 }, gates: [{ check: 'A', verdict: 'fails' }] });
  const since = healthSince(next, rec);
  assert.deepEqual(since, { better: ['access'], worse: ['rules'], at: '2026-11-01T00:00:00Z' });
  assert.equal(healthSince(next, null), null);
  assert.match(healthLines(next, since)[1], /Since the last report \(2026-11-01\): 1 better, 1 worse/);
});

test('the report groups the questions by layer, names the command for each unanswered one, and writes no semicolon of its own', () => {
  const rows = health({ a11y: { blockers: 1, warnings: 0 } });
  const md = healthMarkdown(rows);
  for (const L of LAYERS) assert.ok(md.includes(`## ${L.name}: ${L.asks}`), L.id);
  for (const qn of QUESTIONS) assert.ok(md.includes(`### ${qn.question}`), qn.id);
  assert.equal((md.match(/Only the team can tell/g) ?? []).length, 13);
  assert.equal((md.match(/To answer it: `/g) ?? []).length, 12);
  assert.doesNotMatch(md, /;/);
  assert.match(healthLines(rows)[0], /1 of 13 questions answered .*1 poor/);
});

test('health requests, and the earlier inspection words, reach --health', () => {
  for (const req of ['how healthy is our design system?', 'run a health check on the system', 'inspect our design system', 'faz uma inspeção do design system', 'como está a saúde do design system?']) {
    assert.deepEqual(route(req).run, ['rms-design-system-engine --health'], req);
  }
});
