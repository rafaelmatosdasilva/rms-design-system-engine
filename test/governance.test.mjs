// Governance on paper, held against what happened: the team's own rules, read from its documents, and its last
// releases walked against them.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { paperRules, breakingOf, changelogSection, breakingStep, governanceGaps, governanceLines, trackerGaps, trackerLines, readGovernance, isMigrationDoc } from '../lib/governance.mjs';

const GUIDE = `# Contributing to Acme

Every change goes through a pull request.

## Releases

We follow semantic versioning.
- Breaking changes need a migration guide.
- Add an entry to the changelog for every change you make.
- Commit messages follow Conventional Commits.

Issues with no activity for 30 days are closed. Duplicates are closed within 7 days.
`;

test('the rules are what the documents state, each with the file that states it', () => {
  const r = paperRules([{ file: 'CONTRIBUTING.md', text: GUIDE }]);
  assert.equal(r.major.file, 'CONTRIBUTING.md');
  assert.ok(r.changelog && r.migration && r.conventional);
  assert.equal(r.staleDays.days, 30);
  assert.equal(r.duplicateDays.days, 7);
  // A document that states none of them asks nothing, and a code block's words are not the team's rules.
  const none = paperRules([{ file: 'CONTRIBUTING.md', text: 'Run the tests before you push.\n\n```\nsemver bump major\n```\n\nSee the changelog.' }]);
  assert.deepEqual(Object.values(none).filter(Boolean), []);
  // A changelog that says every notable change is written in it states that rule itself.
  const kac = paperRules([], { file: 'CHANGELOG.md', text: '# Changelog\n\nAll notable changes to this project will be documented in this file.\n' });
  assert.equal(kac.changelog.file, 'CHANGELOG.md');
  assert.equal(kac.major, null);
});

test('a breaking change is only what says so', () => {
  assert.ok(breakingOf({ subject: 'feat(cardTile)!: drop the size prop' }));
  assert.ok(breakingOf({ subject: 'refactor: tokens', body: 'BREAKING CHANGE: color/brand is gone' }));
  assert.ok(breakingOf({ subject: 'BREAKING remove the old theme' }));
  assert.equal(breakingOf({ subject: 'fix: breaking layout on small screens' }), null);
  assert.equal(breakingOf({ subject: 'feat(cardTile): a new size', body: 'Not breaking.' }), null);
});

test('a changelog section is the heading that names the version, up to the next as high', () => {
  const text = '# Changelog\n\n## [2.0.0] - 2026-10-01\n### Breaking\n- cardTile: size removed\n\n## [1.4.0] - 2026-09-01\n- added\n';
  assert.match(changelogSection(text, 'v2.0.0'), /size removed/);
  assert.doesNotMatch(changelogSection(text, 'v2.0.0'), /added/);
  assert.equal(changelogSection(text, 'v2.0.1'), null);
  assert.equal(changelogSection(text, '1.4'), null, 'a version is matched whole');
});

test('a step that may break: a major, or a minor below 1.0', () => {
  assert.equal(breakingStep('v1.4.0', 'v2.0.0'), true);
  assert.equal(breakingStep('v1.4.0', 'v1.5.0'), false);
  assert.equal(breakingStep('v0.4.0', 'v0.5.0'), true);
  assert.equal(breakingStep('v0.4.0', 'v0.4.1'), false);
});

const CHANGELOG = { file: 'CHANGELOG.md', text: '# Changelog\n\n## 2.0.0\n### Breaking\n- cardTile: the size prop is gone. Migration: use density.\n\n## 1.5.0\n- Fixed a typo in the docs.\n' };
const releases = [
  { tag: 'v2.0.0', prev: 'v1.5.0', commits: [{ short: 'aaa1111', subject: 'feat(cardTile)!: drop the size prop (#40)' }] },
  { tag: 'v1.5.0', prev: 'v1.4.0', commits: [{ short: 'bbb2222', subject: 'feat(badge)!: rename tone to intent (#38)' }, { short: 'ccc3333', subject: 'Update the readme' }] },
];

test('each breaking change is held to the version, the entry and the note the paper asks', () => {
  const rules = paperRules([{ file: 'CONTRIBUTING.md', text: GUIDE }]);
  const g = governanceGaps({ rules, releases, changelog: CHANGELOG });
  assert.equal(g.checked.breaking, 2);
  assert.equal(g.breaking.length, 1, 'v2.0.0 kept every rule');
  assert.equal(g.breaking[0].tag, 'v1.5.0');
  assert.deepEqual(g.breaking[0].gaps, ['a minor step from v1.4.0', 'the v1.5.0 entry in CHANGELOG.md does not name it', 'no migration note']);
  assert.equal(g.unconventional.commits.length, 1);
  const lines = governanceLines(g, rules);
  assert.equal(lines[0], "1 breaking change in the last 2 releases went out other than the team's own documents say (CONTRIBUTING.md asks a major version · a changelog entry · a migration note for a breaking change):");
  assert.equal(lines[1], '   · v1.5.0  feat(badge)!: rename tone to intent (#38) (bbb2222): a minor step from v1.4.0 · the v1.5.0 entry in CHANGELOG.md does not name it · no migration note');
  assert.match(lines[2], /^1 of 3 commits in the last 2 releases do not follow Conventional Commits, which CONTRIBUTING\.md asks for \(ccc3333 "Update the readme"\)\.$/);
  for (const l of lines) assert.ok(!l.includes(';'), 'no semicolon in the engine\'s own words');
});

test('a rule the paper does not state is never held against the team', () => {
  const rules = paperRules([{ file: 'CONTRIBUTING.md', text: 'We follow semantic versioning.' }]);
  const g = governanceGaps({ rules, releases, changelog: null });
  assert.deepEqual(g.breaking.map((b) => b.gaps), [['a minor step from v1.4.0']], 'no changelog asked for, none missed');
  assert.equal(g.unconventional, null);
  assert.deepEqual(governanceLines(governanceGaps({ rules: paperRules([]), releases }), paperRules([])), []);
});

test('a migration note in a file of its own counts, and so does what the engine recorded', () => {
  const rules = paperRules([{ file: 'RELEASING.md', text: 'A breaking change ships in a major release with a migration guide.' }]);
  const rel = [{ tag: 'v3.0.0', prev: 'v2.0.0', commits: [] }];
  const records = [{ version: '3.0.0', changes: [{ kind: 'token', name: 'color/brand', says: 'token "color/brand" removed' }] }];
  assert.deepEqual(governanceGaps({ rules, releases: rel, records }).breaking[0].gaps, ['no migration note']);
  assert.deepEqual(governanceGaps({ rules, releases: rel, records, migrationDocs: [{ file: 'docs/upgrading.md', text: '# Upgrading to 3.0.0\nUse color/accent.' }] }).breaking, []);
  assert.ok(isMigrationDoc('docs/upgrading.md') && isMigrationDoc('MIGRATION.md') && !isMigrationDoc('docs/tokens.md'));
});

test('the tracker against the team\'s own limits, an issue with no date never counted', () => {
  const rules = paperRules([{ file: 'CONTRIBUTING.md', text: GUIDE }]);
  const now = Date.parse('2026-11-15T00:00:00Z');
  const issues = [
    { iid: 1, updatedAt: '2026-09-01T00:00:00Z', createdAt: '2026-09-01T00:00:00Z' },
    { iid: 2, updatedAt: '2026-11-10T00:00:00Z', createdAt: '2026-10-01T00:00:00Z', labels: ['duplicate'] },
    { iid: 3, updatedAt: '2026-11-14T00:00:00Z', createdAt: '2026-11-14T00:00:00Z', labels: ['duplicate'] },
    { iid: 4 },
  ];
  const g = trackerGaps(issues, rules, { now });
  assert.deepEqual(g.stale.map((i) => i.iid), [1]);
  assert.deepEqual(g.duplicates.map((i) => i.iid), [2]);
  assert.deepEqual(trackerLines(g, rules), [
    '1 open issue has had no activity for more than 30 days, the limit CONTRIBUTING.md sets (#1): close each, or say why it stays open.',
    '1 open issue is marked as a duplicate and still open after 7 days, the limit CONTRIBUTING.md sets (#2): close each into the issue it repeats.',
  ]);
  assert.deepEqual(trackerGaps(issues, paperRules([]), { now }), { stale: [], duplicates: [] });
});

test('the history is read only when a document states a rule, through the readers given', () => {
  const asked = [];
  const git = (args) => {
    asked.push(args.join(' '));
    if (args[0] === 'tag') return 'v2.0.0\nv1.5.0\nv2.0.0-beta.1\nlatest\n';
    if (args.at(-1) === 'v1.5.0..v2.0.0') return '\x1eaaa1111aaaa\x1ffeat(cardTile)!: drop the size prop\n\nBody.\n';
    return '\x1ebbb2222bbbb\x1ffeat(badge): a badge\n';
  };
  const files = { 'CONTRIBUTING.md': 'We follow semantic versioning. Breaking changes are listed in the changelog.', 'CHANGELOG.md': '## 2.0.0\n- the cardTile size prop is gone\n' };
  const { gaps } = readGovernance({ read: (f) => files[f] ?? '', git, files: [] });
  assert.equal(gaps.checked.releases, 2);
  assert.equal(gaps.checked.breaking, 1);
  assert.deepEqual(gaps.breaking, [], 'a major, and an entry that names its scope');
  assert.ok(asked.some((a) => a.endsWith('v1.5.0..v2.0.0')));
  const quiet = [];
  assert.equal(readGovernance({ read: () => '', git: (a) => { quiet.push(a); return ''; } }).gaps, null);
  assert.deepEqual(quiet, [], 'no documents, no history read');
});
