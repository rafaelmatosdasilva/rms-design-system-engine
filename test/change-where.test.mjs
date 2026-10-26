// change-where.mjs: what a Changelog row says when a commit names no issue, and where a commit changed the system
// besides a component's code. An invented system (Acme): a chip and a tag, their docs, demo pages and tests.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { requestOf, requestLabel, closesOf, diffFiles, whereOf, pathKey } from '../change-where.mjs';
import { ticketOf } from '../component-changelog.mjs';

test('the request a commit came by, and what it says it closes', () => {
  assert.deepEqual(requestOf('Each component says what it is for (#70)'), { n: '70' });
  assert.deepEqual(requestOf("Merge branch 'x' into 'main'\n\nSee merge request acme/ui!12"), { n: '12' });
  assert.equal(requestOf('Fixed the chip'), null);
  assert.equal(requestLabel('12', true), '!12');
  assert.equal(requestLabel('70', false), 'PR #70');
  assert.deepEqual(closesOf('Chip clears\n\nCloses #45. Fixes ABC-12, resolves acme/ui#9'), ['#45', 'ABC-12', 'acme/ui#9']);
  assert.deepEqual(closesOf('REL-1204: the chip clears', { changelog: { ticket: '#\\d+|REL-\\d+' } }), ['REL-1204']);
});

test("the team's own label is its row's issue; a link learned from #n tickets is not given to it", () => {
  const cfg = { changelog: { ticket: '#\\d+|REL-\\d+' } };
  assert.equal(ticketOf('REL-1204: the chip clears', cfg).ticket, 'REL-1204');
  assert.equal(ticketOf('REL-1204: the chip clears', cfg).ticketUrl, null);
  assert.equal(ticketOf('#120435 - adding the picker', cfg).ticket, '#120435');
});

const ctx = {
  names: ['chip', 'tag', 'datePicker'],
  componentFiles: new Set(['src/components/chip/Chip.vue']),
  byKey: new Map([[pathKey('src/components/chip/Chip.vue'), 'chip'], [pathKey('src/components/tag/Tag.vue'), 'tag']]),
  themeFiles: ['src/theme.css'],
};
const files = (list) => list.map(([path, diff = '']) => ({ path, diff }));

test('a commit that changed no component code still says where: its docs, demo pages, tests, agents', () => {
  const w = whereOf(files([['docs/components/chip/Chip.md', '+Use it to filter'], ['src/views/components/tag/Tag.vue', '+<Tag/>'], ['tests/unit/chip/Chip.spec.js', '+it()'], ['.claude/commands/fill-documentation.md', '+x']]), ctx);
  assert.deepEqual(w.map((x) => [x.kind, x.names ?? null]), [['docs', ['chip']], ['examples', ['tag']], ['tests', ['chip']], ['agents', null]]);
});

test('Figma, tokens, the version, the pipeline and the setup, each named; a component\'s own file left to its chip', () => {
  const w = whereOf(files([
    ['src/components/chip/Chip.vue', '+x'],
    ['packages/ui/src/figma-vars.snapshot.json', '+    "color/primary": {\n-    "spacing/gap/m": {'],
    ['packages/ui/src/figma-component-props.snapshot.json', '+  "datePicker": {'],
    ['src/theme.css', '+  --color-primary: #fff;\n-  --gap-m: 8px;'],
    ['package.json', '-  "version": "2.11.0",\n+  "version": "2.12.0",'],
    ['.gitlab-ci.yml', '+x'], ['ds-config.json', '+x'], ['scripts/build.sh', '+x'],
  ]), ctx);
  const by = Object.fromEntries(w.map((x) => [x.kind, x]));
  assert.deepEqual(Object.keys(by), ['figma', 'tokens', 'version', 'pipeline', 'setup', 'other']);
  assert.deepEqual([by.figma.names, by.figma.tokens], [['datePicker'], 2]);
  assert.equal(by.tokens.count, 2);
  assert.equal(by.version.label, 'Version 2.12.0');
  assert.equal(by.other.label, 'scripts/');
});

test('a patch read file by file, its added and removed lines only', () => {
  const f = diffFiles('diff --git a/a.md b/a.md\nindex 1..2\n--- a/a.md\n+++ b/a.md\n@@ -1 +1 @@\n-old\n+new\ndiff --git a/b.css b/b.css\n+x\n');
  assert.deepEqual(f, [{ path: 'a.md', diff: '-old\n+new\n' }, { path: 'b.css', diff: '+x\n' }]);
});
