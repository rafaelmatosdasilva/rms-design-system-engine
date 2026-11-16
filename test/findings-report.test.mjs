// The run's findings in the file the team's own review surface reads: SARIF for GitHub's code scanning, its own
// report for GitLab's code quality. What is tested here is that a finding keeps its place, its words and its
// verdict on the way, and that one with no place is said rather than put somewhere it is not.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { placeOf, whereOf, sarifOf, codeQualityOf, sarifReport, codeQualityReport, reportLine, TOOL } from '../lib/findings-report.mjs';
import { findingRecords } from '../lib/run-diff.mjs';

test('a finding\'s own words say where it is: a path with a line, a path without one, and never a link or a version', () => {
  assert.deepEqual(placeOf('⚠️  cardTile override (src/CardTile.vue:3)'), { file: 'src/CardTile.vue', line: 3 });
  assert.deepEqual(placeOf('apps/shop/src/Cart.vue:12 overrides it'), { file: 'apps/shop/src/Cart.vue', line: 12 });
  assert.deepEqual(placeOf('token missing in src/tokens.css'), { file: 'src/tokens.css', line: null });
  assert.equal(placeOf('see https://example.com/a.html for why'), null, 'a link\'s host is not a path');
  assert.deepEqual(placeOf('per https://example.com/spec, fix src/a.css:9'), { file: 'src/a.css', line: 9 }, 'the file beside the link is');
  assert.equal(placeOf('DSDS 0.23.1 is pinned'), null, 'a version is not a file');
  assert.equal(placeOf('contrast 4.5:1 fails'), null, 'nor a ratio');
  assert.equal(placeOf('3 of 3 semantic tokens have no description'), null);
});

test('a finding that names no file is placed on its component\'s own file, from the catalog the run wrote', () => {
  const lives = { cardTile: 'src/components/CardTile.vue' };
  assert.deepEqual(whereOf({ evidence: 'cardTile has no description', component: 'cardTile' }, lives), { file: 'src/components/CardTile.vue', line: null });
  assert.deepEqual(whereOf({ evidence: 'cardTile override (src/Other.vue:3)', component: 'cardTile' }, lives), { file: 'src/Other.vue', line: 3 },
    'what the finding itself says wins over where the component lives');
  assert.equal(whereOf({ evidence: '3 of 3 semantic tokens have no description', component: null }, lives), null);
});

test('SARIF: one rule per check with the rule it stands on, each finding on its line, with the verdict as its level', () => {
  const records = findingRecords([
    'Clean CSS :: ❌  cardTile override (src/CardTile.vue:3)',
    'System health :: ⚠️  3 of 3 semantic tokens have no description',
  ], ['cardTile'], { rules: { 'Clean CSS': 'No value contradicts Figma' }, failing: ['Clean CSS'] });
  const log = sarifOf(records, { gates: [{ check: 'System health', rule: 'Every token is described' }] });

  assert.equal(log.version, '2.1.0');
  assert.equal(log.runs[0].tool.driver.name, TOOL);
  assert.deepEqual(log.runs[0].tool.driver.rules.map((r) => [r.id, r.fullDescription?.text]),
    [['clean-css', 'No value contradicts Figma'], ['system-health', 'Every token is described']],
    'a check\'s rule comes from the finding, else from the gate beside it');

  const [broken, advisory] = log.runs[0].results;
  assert.equal(broken.level, 'error', 'a check that fails');
  assert.equal(advisory.level, 'warning', 'one that advises');
  assert.deepEqual(broken.locations[0].physicalLocation, { artifactLocation: { uri: 'src/CardTile.vue' }, region: { startLine: 3 } });
  assert.deepEqual(advisory.locations, [], 'a finding with no place is carried, with none');
  assert.equal(log.runs[0].invocations[0].properties.placeless, 1, 'and counted, so the report is never read as complete');
  assert.ok(broken.partialFingerprints.engineFindingId, 'the engine\'s own id, so GitHub keeps one finding across runs');
});

test('GitLab: every entry has a path, and the findings that have none are counted rather than placed', () => {
  const records = findingRecords([
    'Clean CSS :: ❌  cardTile override (src/CardTile.vue:3)',
    'System health :: ⚠️  3 of 3 semantic tokens have no description',
  ], ['cardTile'], { failing: ['Clean CSS'] });
  const { report, placeless } = codeQualityOf(records);

  assert.equal(report.length, 1);
  assert.equal(placeless, 1);
  assert.deepEqual(report[0].location, { path: 'src/CardTile.vue', lines: { begin: 3 } });
  assert.equal(report[0].severity, 'major');
  assert.equal(report[0].check_name, 'Clean CSS');
  assert.ok(report[0].fingerprint, 'GitLab keeps one finding across runs by it');
  assert.ok(report.every((e) => e.location?.path), 'an entry without a path is not a report GitLab reads');
});

test('the line the run prints says how many findings have no place, so a short report is never read as every finding', () => {
  assert.equal(reportLine('sarif', 'out/findings.sarif', { count: 12, placeless: 0 }),
    '📤 12 findings for GitHub code scanning → out/findings.sarif');
  assert.match(reportLine('gitlab', 'out/code-quality.json', { count: 11, placeless: 1 }),
    /11 findings for GitLab code quality → out\/code-quality\.json \(1 of them name no file, so they are not in it - the run's own report has every one\)/);
});

// A run prints lines that point at a finding rather than being one, and they carry their gate's verdict with them.
// Kept, a code review surface badges "Build freshness skipped on CI" as an error of the code being reviewed.
test('a line that points at a finding is in neither report, and the numbers the run says come from the report itself', () => {
  const records = findingRecords([
    'Data is up to date :: ❌  src/figma-vars.snapshot.json is 319 days old',
    'Data is up to date :: ⏭ Build freshness skipped on CI (mtime unreliable after fresh clone)',
    'Structure :: ↳ last changed by QA',
    'System health :: ⚠️  3 of 3 semantic tokens have no description',
  ], [], { failing: ['Data is up to date'] });
  assert.equal(records.length, 4, 'all four are records of the run');

  const sarif = sarifReport(records);
  assert.deepEqual(sarif.body.runs[0].results.map((r) => r.message.text),
    ['src/figma-vars.snapshot.json is 319 days old', '3 of 3 semantic tokens have no description'],
    'the skip and the pointer are left out');
  assert.equal(sarif.count, 2);
  assert.equal(sarif.placeless, 1);
  assert.equal(sarif.body.runs[0].tool.driver.rules.length, 2, 'and no rule is invented for a check only a pointer named');

  const gitlab = codeQualityReport(records);
  assert.equal(gitlab.count, 1);
  assert.equal(gitlab.placeless, 1);
  assert.equal(gitlab.body[0].description, 'src/figma-vars.snapshot.json is 319 days old');
});
