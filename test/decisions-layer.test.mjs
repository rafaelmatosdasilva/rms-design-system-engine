// Decisions written in the intent layer (decisions.mjs, doc-source-dsds.mjs, intent-changes.mjs decisionPlan).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseDecision, decisionLine, layerDecisionsOf, decisionsFrom, decisionView, ruledOutLines } from '../decisions.mjs';
import { entityView } from '../doc-source-dsds.mjs';
import { decisionPlan } from '../intent-changes.mjs';
import { buildLlms } from '../contract-gen.mjs';

test('a decision is one line a person reads, and the engine reads back', () => {
  const line = 'Tile has no Large size. Ruled out: a Large size; a size picked per page. Why: no screen needs it. Decided by Pat on 27 Oct 2026.';
  const d = parseDecision(line);
  assert.deepEqual(d, { what: 'Tile has no Large size', ruledOut: ['a Large size', 'a size picked per page'], why: 'no screen needs it', by: 'Pat', at: '2026-10-27' });
  assert.equal(decisionLine(d), line);
  assert.deepEqual(parseDecision('Use Toast for confirmations. Why: it does not block. Ruled out: Modal or Snackbar.').ruledOut, ['Modal', 'Snackbar'], 'in any order');
  assert.deepEqual(parseDecision('Forms show errors after submit.'), { what: 'Forms show errors after submit', ruledOut: [], why: null, by: null, at: null });
});

test('a page\'s Decisions section is read as its decisions, on any page of the layer and on the system\'s own', () => {
  const page = entityView({ kind: 'component', name: 'Tile Card', sections: [{ kind: 'section', title: 'Decisions', freeform: [{ title: 'Decisions', body: '- Tile has no Large size. Ruled out: a Large size. Why: no screen needs it.\n- **Draft:** Tiles never nest.' }] }] }, 'specs/tile.dsds.json', 'components');
  assert.equal(page.decisions.length, 2);
  assert.equal(page.rules.length, 0, 'never read as rules');
  const pattern = { kind: 'entry', layer: 'patterns', name: 'Forms', file: 'specs/forms.dsds.json', decisions: ['Errors show after submit. Ruled out: errors while typing.'] };
  const snap = { entities: [{ ...page, layer: 'components' }, pattern], system: { sections: [{ title: 'Decisions', text: '- No Rating component this year. Ruled out: a Rating component.' }] }, _source: { entry: 'specs/system.dsds.json' } };
  const log = layerDecisionsOf(snap, (e) => (e.name === 'Tile Card' ? 'tileCard' : null));
  assert.deepEqual(log.map((d) => [d.page, d.about, d.component, d.what]), [['Tile Card', 'Components', 'tileCard', 'Tile has no Large size'], ['Forms', 'Patterns', null, 'Errors show after submit'], ['The system', 'System', null, 'No Rating component this year']], 'a draft is not a decision yet');
  const view = decisionView(decisionsFrom({ layer: log }));
  assert.deepEqual(ruledOutLines(view, 'tileCard'), ['decided against: a Large size - no screen needs it (written in the intent layer)']);
});

test('a decision is written on the page it is about: its spec\'s Decisions heading, else its DSDS file', () => {
  const snap = { entities: [{ kind: 'component', name: 'Tile Card', file: 'specs/dsds/tile.dsds.json', code: 'src/Tile.vue' }, { kind: 'entry', name: 'Forms', file: 'specs/dsds/forms.dsds.json' }] };
  const files = new Map([
    ['specs/tile-card.md', '# Tile Card\n\n## Purpose\n\nA tile.\n\n## API\n\n- size\n'],
    ['specs/dsds/tile.dsds.json', JSON.stringify({ kind: 'component', name: 'Tile Card' })],
    ['specs/dsds/forms.dsds.json', JSON.stringify({ kind: 'entry', name: 'Forms', sections: [] }, null, 2) + '\n'],
  ]);
  const md = decisionPlan(snap, 'tile card', 'Tile has no Large size.', files, { codes: ['src/Tile.vue'] });
  assert.equal(md.file, 'specs/tile-card.md', 'the Markdown spec a person edits');
  assert.match(md.files.get(md.file), /## Purpose\n\nA tile\.\n\n## Decisions\n\n- Tile has no Large size\.\n\n## API/, 'after what it documents, before the reference sections');
  const json = decisionPlan(snap, 'Forms', 'Errors show after submit.', files);
  assert.equal(json.file, 'specs/dsds/forms.dsds.json');
  assert.deepEqual(JSON.parse(json.files.get(json.file)).sections, [{ kind: 'section', for: 'all', title: 'Decisions', freeform: [{ title: 'Decisions', body: '- Errors show after submit.' }] }]);
  assert.match(decisionPlan(snap, 'Nowhere', 'x', files).error, /no page in the intent layer is about "Nowhere"/);
});

test('llms.txt says what was decided against, before the catalog', () => {
  const txt = buildLlms([], { color: {} }, 0, null, { decidedAgainst: ['- Tile Card: a Large size, because no screen needs it.'] });
  assert.match(txt, /## Decided against\n\nThe team looked at these and turned them down\. Do not propose them again:\n- Tile Card: a Large size, because no screen needs it\./);
  assert.doesNotMatch(buildLlms([], { color: {} }, 0, null, {}), /Decided against/);
});

test('a decision asked for in words goes to --decision with what was ruled out and why, never to keep', async () => {
  const { route } = await import('../route.mjs');
  const r = route('we decided the chip has no large size, we ruled out a large chip because it breaks the row', { hasConfig: true, components: ['chip'] });
  assert.deepEqual(r.run, ['rms-design-system-engine --decision chip "<what was decided>" --ruled-out "a large chip" --why "it breaks the row"']);
  assert.match(route('keep the chip height on purpose because the product needs a larger tap target', { hasConfig: true, components: ['chip'] }).run[0], / --keep /);
});

test('History: one table of changes (the code\'s and Figma\'s, each tagged) and decisions; a release with nothing chosen hides', async () => {
  const { readFileSync } = await import('node:fs');
  const tpl = readFileSync(new URL('../templates/styleguide.template.html', import.meta.url), 'utf8');
  assert.match(tpl, /<tr data-chip="figma" data-chip-group="changes">/);
  assert.match(tpl, /<tr data-chip="code" data-chip-group="changes">/);
  assert.match(tpl, /\{ key: 'changes', label: 'Changes', n: nChanges \}, \{ key: 'decisions', label: 'Decisions'/);
  assert.match(tpl, /wn\.addEventListener\('sg-chip', function \(e\) \{ Array\.prototype\.forEach\.call\(e\.currentTarget\.querySelectorAll\('\.pg-inspect'\)/, 'never a var another page reuses');
  assert.match(tpl, /\.pg-inspect\[hidden\] \{ display: none; \}/);
});
