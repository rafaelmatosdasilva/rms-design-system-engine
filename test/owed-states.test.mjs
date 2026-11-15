// The states each component owes, as its intent-layer page names them, against Figma and the code (owed-states.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readMarkdown } from '../lib/doc-source-markdown.mjs';
import { entityView } from '../lib/doc-source-dsds.mjs';
import { owedStatesOf, owedStates, owedFindings, owedAcross, owedLines, figmaHas, codeHas } from '../lib/owed-states.mjs';
import { collectFindings, findingRecords, plainAction } from '../lib/run-diff.mjs';

const page = (fm) => `---\ntitle: cardTile\n${fm}---\n\nA tile for one card.\n\n## When to use\n\nTo show one card in a grid.\n`;
const figma = {
  'State': { type: 'VARIANT', variantOptions: ['Default', 'Hover', 'Loading'] },
  'Disabled': { type: 'VARIANT', variantOptions: ['False', 'True'] },
  'Show icon#1:2': { type: 'BOOLEAN' },
};
const code = { props: { disabled: { type: 'boolean' }, title: { type: 'string' }, tone: { type: 'string', options: ['neutral', 'error'] } }, text: '<template><div class="card-tile" :aria-invalid="tone === \'error\'"></div></template>\n<style>.card-tile:disabled {}</style>' };

test('owed states are read from a page\'s front matter, in the team\'s own words, as a list or one line', () => {
  const md = readMarkdown(new Map([['docs/components/cardTile.md', page('states:\n  - Error\n  - Loading\n  - Read-only\n')]]));
  assert.deepEqual(md.entities[0].states, ['Error', 'Loading', 'Read-only']);
  const inline = readMarkdown(new Map([['docs/components/cardTile.md', page('states: [disabled, loading]\n')]]));
  assert.deepEqual(inline.entities[0].states, ['disabled', 'loading']);
  assert.deepEqual(owedStatesOf('error, loading, Error'), ['error', 'loading']);
  // A DSDS entity says the same through its metadata.
  assert.deepEqual(entityView({ kind: 'component', name: 'cardTile', metadata: { states: [{ name: 'Empty' }, 'Loading'] } }, 'cardTile.json').states, ['Empty', 'Loading']);
});

test('a page that names no states gives nothing', () => {
  const md = readMarkdown(new Map([['docs/components/cardTile.md', page('status: stable\n')]]));
  assert.equal(md.entities[0].states, undefined);
  assert.deepEqual(owedAcross(new Map([['cardTile', md.entities[0]]]), { figmaProps: { cardTile: { properties: figma } }, codeOf: () => code }), []);
  assert.deepEqual(owedLines([]), []);
});

test('a state both sides have is no finding: a variant value or a true/false variant in Figma, a prop or a rule in the code', () => {
  const rows = owedStates(['Disabled', 'error'], { figma: { ...figma, 'Status': { type: 'VARIANT', variantOptions: ['Neutral', 'Invalid'] } }, code });
  assert.deepEqual(rows.map((r) => [r.state, r.figma.has, r.code.has]), [['Disabled', true, true], ['error', true, true]]);
  assert.deepEqual(figmaHas('disabled', figma).by, ['Disabled=True']);
  assert.ok(codeHas('error', code).by.includes('tone="error"'));
  assert.deepEqual(owedFindings('cardTile', rows), []);
  // Read-only and loading, the code's own way: a readOnly prop, an aria-busy the markup sets.
  assert.ok(codeHas('Read-only', { props: { readOnly: { type: 'boolean' } } }).has);
  assert.ok(codeHas('loading', { props: {}, text: '<div :aria-busy="pending">' }).has);
  assert.ok(codeHas('loading', { props: {}, text: '.card-tile--loading { opacity: .5 }' }).has);
});

test('a state missing in Figma only is a finding for Figma, with what was looked at', () => {
  const rows = owedStates(['success'], { figma, code: { props: {}, text: '.card-tile.is-success {}' } });
  const f = owedFindings('cardTile', rows);
  assert.equal(f.length, 1);
  assert.equal(f[0].side, 'figma');
  assert.equal(f[0].text, 'The intent layer says cardTile owes a success state, and Figma has none.');
  assert.match(f[0].looked, /State \(Default, Hover, Loading\)/);
});

test('a state missing in the code only is a finding for the code, and a word only a comment writes is not the state', () => {
  const rows = owedStates(['Loading'], { figma, code: { props: { title: {} }, text: '<!-- is-loading: one day --><div class="card-tile"></div>' } });
  const f = owedFindings('cardTile', rows);
  assert.deepEqual(f.map((x) => [x.side, x.text]), [['code', 'The intent layer says cardTile owes a loading state, and the code has none.']]);
  assert.match(f[0].looked, /Looked at its props: title/);
});

test('a side the engine has no reading of says nothing, and a state of the team\'s own is found by its name', () => {
  assert.deepEqual(owedFindings('cardTile', owedStates(['loading'], { figma: null, code: null })), []);
  const rows = owedStates(['Empty'], { figma: { 'State': { type: 'VARIANT', variantOptions: ['Default', 'Empty'] } }, code: { props: { isEmpty: { type: 'boolean' } } } });
  assert.deepEqual(rows.map((r) => [r.figma.has, r.code.has]), [[true, true]]);
});

test('the routed finding: the audit\'s line reaches the differences list, for the side that lacks the state', () => {
  const findings = [
    ...owedFindings('cardTile', owedStates(['error'], { figma: { 'State': { type: 'VARIANT', variantOptions: ['Default'] } }, code })),
    ...owedFindings('cardTile', owedStates(['loading'], { figma, code: { props: {} } })),
  ];
  const lines = owedLines(findings);
  assert.match(lines[0], /^⚠️ {2}States the intent layer owes: 1 missing in Figma and 1 missing in the code$/);
  const log = ['ALL GATES PASS ✅', ...lines];
  const records = findingRecords(collectFindings(log), ['cardTile']);
  assert.deepEqual(records.map((r) => [r.check, r.component, r.side, r.difference]), [
    ['States the intent layer owes', 'cardTile', 'figma', true],
    ['States the intent layer owes', 'cardTile', 'decide', true],
  ]);
  const [toFigma, toCode] = records.map((r) => plainAction(r.evidence, r.component));
  assert.equal(toFigma.who, 'figma');
  assert.match(toFigma.todo, /^In Figma, add the "error" state to cardTile/);
  assert.equal(toCode.who, 'code');
  assert.match(toCode.todo, /^In the code, give cardTile the "loading" state/);
  for (const t of [...lines, toFigma.todo, toCode.todo]) assert.doesNotMatch(t, /;/);
});

// A team that writes pages rather than metadata says the states a component must have under a heading. A plain
// "States" is a fact copied from Figma or the code and stays one; only a heading saying they are required is read
// as what the component owes, and both sources add up.
test('a section titled for required states says what the component owes', () => {
  const page = (title, body) => entityView({
    kind: 'component', identifier: 'c-filewell', name: 'fileWell',
    documentBlocks: [{ kind: 'sections', items: [{ title, body }] }],
  }, 'docs/dsds/components/file-well.dsds.json');

  assert.deepEqual(page('Required states', '- error\n- loading\n- read-only').states, ['error', 'loading', 'read-only']);
  assert.deepEqual(page('States the component must have', '- empty').states, ['empty']);
  assert.equal(page('States', '- error\n- loading').states, undefined, 'a plain States heading is a fact, not a demand');
  assert.ok(page('States', '- error').facts.includes('States'), 'and it is kept as the fact it is');
});

test('the metadata and the heading are both read, once each', () => {
  const view = entityView({
    kind: 'component', identifier: 'c-filewell', name: 'fileWell',
    metadata: { states: ['error', 'loading'] },
    documentBlocks: [{ kind: 'sections', items: [{ title: 'Required states', body: '- loading\n- read-only' }] }],
  }, 'docs/dsds/components/file-well.dsds.json');
  assert.deepEqual(view.states, ['error', 'loading', 'read-only'], 'both sources, and loading is not said twice');
});
