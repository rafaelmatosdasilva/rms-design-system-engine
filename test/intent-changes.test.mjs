// intent-changes.mjs - the changes the Intent layer review asks for, made in the layer's own files: lines repeated on
// every page taken out, sentences the system contradicts written again as drafts, what a page lacks drafted; each in
// the page's Markdown spec and its DSDS page alike. And the reader: a drafted line is set apart, a rule shared by
// reference is the system's, a line that differs only by the page's own name is repeated. An invented system (Acme).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mdRemove, mdReplace, mdAdd, jsonRemove, jsonReplace, jsonAdd, jsonText, specIndex, specOf, planOf, draftPlan, applyPlan, describeChanges } from '../intent-changes.mjs';
import { entityView, dropBoilerplate, DRAFT } from '../doc-source-dsds.mjs';
import { factsFrom } from '../intent-truth.mjs';
import { useReport } from '../intent-layer.mjs';

const SPEC = `# Tile One

## Metadata

- Name: Tile One
- Source: \`src/tiles/TileOne.vue\`

## Purpose

A tile for one subject.

## When to use

- Use it for one subject at a glance.
- The task maps to \`tileOne\` in the manifest.

## When not to use

- Another component owns the behaviour more specifically.

## Evidence

- Confirmed in the reference.
`;
const PAGE = { kind: 'component', id: 'component-tile-one', name: 'Tile One', description: 'A tile for one subject.', metadata: { aliases: ['tileOne'] }, sourceFiles: [{ platform: 'vue', file: 'src/tiles/TileOne.vue' }],
  sections: [
    { kind: 'guidelines', for: 'all', framing: 'when-to-use', title: 'When to use', items: [{ level: 'should', statement: 'Use it for one subject at a glance.' }, { level: 'should', statement: 'The task maps to `tileOne` in the manifest.' }] },
    { kind: 'guidelines', for: 'all', framing: 'when-to-use', title: 'When not to use', items: [{ level: 'should-not', statement: 'Another component owns the behaviour more specifically.' }] },
    { kind: 'section', for: 'all', title: 'Specification', freeform: [{ title: 'Evidence', body: '- Confirmed in the reference.' }] },
  ] };

test('a Markdown spec: a line taken out (its heading too when nothing is left), written again as a draft, added under its heading', () => {
  let t = mdRemove(SPEC, 'The task maps to `tileOne` in the manifest.');
  assert.ok(!t.includes('maps to'));
  t = mdRemove(t, 'Another component owns the behaviour more specifically.');
  assert.ok(!/## When not to use/.test(t), 'the empty heading goes');
  assert.match(t, /## When to use\n\n- Use it for one subject at a glance\.\n\n## Evidence/);
  t = mdReplace(t, 'Use it for one subject at a glance.', 'Use `tileOne` for one subject at a glance.');
  assert.match(t, /^- \*\*Draft:\*\* Use `tileOne` for one subject at a glance\.$/m);
  t = mdAdd(t, 'When not to use', 'Not for a list of subjects: use `listMain`.');
  assert.match(t, /- \*\*Draft:\*\* Use `tileOne`[^\n]*\n\n## When not to use\n\n- \*\*Draft:\*\* Not for a list of subjects: use `listMain`\.\n\n## Evidence/);
  assert.equal(mdRemove(SPEC, 'A line it does not have.'), SPEC);
});

test('a DSDS page: the same changes, its own formatting kept', () => {
  const before = JSON.stringify({ ...PAGE }, null, '\t') + '\n';
  const doc = JSON.parse(before);
  assert.equal(jsonRemove(doc, 'Another component owns the behaviour more specifically.'), 1);
  assert.ok(!doc.sections.some((s) => s.title === 'When not to use'), 'a section left empty goes');
  assert.equal(jsonReplace(doc, 'Use it for one subject at a glance.', 'Use `tileOne` for one subject.'), 1);
  jsonAdd(doc, 'When not to use', 'Not for a list.');
  const s = doc.sections.find((x) => x.title === 'When not to use');
  assert.deepEqual(s, { kind: 'guidelines', for: 'all', framing: 'when-to-use', title: 'When not to use', items: [{ level: 'should-not', statement: '**Draft:** Not for a list.' }] });
  assert.equal(doc.sections.indexOf(s), 1, 'placed after When to use, before the specification');
  assert.equal(jsonRemove(doc, 'Confirmed in the reference.'), 1);
  const out = jsonText(doc, before);
  assert.ok(out.startsWith('{\n\t"kind"') && out.endsWith('}\n'));
});

test('where a page is written: its spec by the code file it names, by its title, else a family\'s spec shared with others', () => {
  const files = new Map([['specs/components/tile-one.md', SPEC], ['specs/components/lists.md', '# Lists\n\n- Source: `src/lists/`\n']]);
  const idx = specIndex(files);
  assert.deepEqual(specOf({ name: 'Tile One', code: 'src/tiles/TileOne.vue' }, idx), { spec: 'specs/components/tile-one.md', shared: false });
  assert.deepEqual(specOf({ name: 'Tile One', code: null }, idx), { spec: 'specs/components/tile-one.md', shared: false });
  assert.deepEqual(specOf({ name: 'List Main', code: 'src/lists/Main.vue' }, idx), { spec: 'specs/components/lists.md', shared: true });
  assert.equal(specOf({ name: 'Other', code: 'src/x/Other.vue' }, idx), null);
});

test('the reader: a drafted line is set apart; a shared rule is the system\'s; a line with only the page\'s name changed is repeated', () => {
  assert.ok(DRAFT.test('**Draft:** Use it.') && !DRAFT.test('Drafting a form.'));
  const shared = [{ id: 'agent-rules', sections: [{ items: [{ id: 'exact-api', statement: 'Use only the props listed.', level: 'must' }] }] }];
  const mk = (i) => entityView({ kind: 'component', id: `component-tile-${i}`, name: `Tile ${i}`, metadata: { aliases: [`tile${i}`] }, sections: [
    { kind: 'guidelines', title: 'When to use', items: [{ level: 'should', statement: `The task maps to \`tile${i}\` in the manifest.` }, { level: 'should', statement: `Use it for subject ${i}.` }, ...(i === 1 ? [{ level: 'should', statement: '**Draft:** Use it on a dashboard.' }] : [])] },
    { kind: 'guidelines', title: 'For agents', items: [{ refs: [{ to: 'agent-rules#exact-api', rel: 'same-as' }] }] },
  ] }, `tile-${i}.dsds.json`, 'components', shared);
  const pages = [1, 2, 3, 4, 5, 6].map(mk);
  assert.deepEqual(pages[0].drafts, [{ where: 'When to use', text: 'Use it on a dashboard.' }]);
  assert.ok(pages[0].rules[0].shared);
  dropBoilerplate(pages);
  assert.deepEqual(pages[0].whenToUse, ['Use it for subject 1.']);
  assert.deepEqual(pages[0].repeatedLines, ['The task maps to `tile1` in the manifest.']);
  assert.equal(pages[0].rules.length, 0);
  assert.equal(pages[0].sharedRules, 1);
});

test('the plan: repeated lines out, a wrong sentence written again (checked), a twin drafted; a family spec takes no page\'s draft', () => {
  const facts = factsFrom({ components: { tileOne: { file: 'src/tiles/TileOne.vue', props: { tone: { options: ['calm', 'loud'] } } }, tileTwo: { file: 'src/tiles/TileTwo.vue', props: {} } } });
  const e = { kind: 'component', layer: 'components', name: 'Tile One', id: 'component-tile-one', file: 'specs/dsds/tile-one.dsds.json', code: 'src/tiles/TileOne.vue', purpose: ['A tile for one subject.'], whenToUse: ['Set `tone="bright"` for alerts.'], whenNotToUse: [], mistakes: [], limitations: [], rules: [], sections: [], repeatedLines: ['The task maps to `tileOne` in the manifest.'] };
  const snap = { _source: {}, entities: [e] };
  const wrong = [{ kind: 'claim', line: 'Set `tone="bright"` for alerts.', truth: '`tone` takes `calm`, `loud`.' }, { kind: 'twin', other: 'tileTwo', truth: 'the same' }];
  const report = useReport(snap, new Map([['tileOne', e]]), { names: ['tileOne'], wrongOf: () => wrong });
  const plan = planOf(snap, report);
  assert.equal(plan.length, 1);
  assert.deepEqual(plan[0].remove, ['The task maps to `tileOne` in the manifest.']);
  assert.equal(plan[0].rewrite[0].line, 'Set `tone="bright"` for alerts.');
  assert.deepEqual(plan[0].need, ['whenNotToUse', { differ: 'tileTwo' }]);
  // The drafter answers; what names nothing the system has is kept, the rest dropped.
  const asked = [];
  draftPlan(plan, facts, (prompt) => { asked.push(prompt); return JSON.stringify({ '0.r0': { text: 'Set `tone="loud"` for alerts.' }, '0.d': { whenToUse: ['Use it rather than `tileTwo` for one subject.'], whenNotToUse: ['For two subjects use `tileTwo`.', 'Not with `glowMode`.'] } }); });
  assert.match(asked[0], /"task": "rewrite"/);
  assert.deepEqual(plan[0].rewritten, [{ line: 'Set `tone="bright"` for alerts.', text: 'Set `tone="loud"` for alerts.' }]);
  assert.deepEqual(plan[0].drafted.map((d) => d.text), ['Use it rather than `tileTwo` for one subject.', 'For two subjects use `tileTwo`.']);
  assert.equal(plan[0].dropped[0].text, 'Not with `glowMode`.');
  const spec = '# Tile One\n\n- Source: `src/tiles/TileOne.vue`\n\n## When to use\n\n- Set `tone="bright"` for alerts.\n- The task maps to `tileOne` in the manifest.\n';
  const page = JSON.stringify({ kind: 'component', id: 'component-tile-one', name: 'Tile One', sections: [{ kind: 'guidelines', title: 'When to use', items: [{ level: 'should', statement: 'Set `tone="bright"` for alerts.' }, { level: 'should', statement: 'The task maps to `tileOne` in the manifest.' }] }] }, null, 2) + '\n';
  const r = applyPlan(plan, new Map([['specs/tile-one.md', spec], ['specs/dsds/tile-one.dsds.json', page]]));
  assert.deepEqual([...r.files.keys()].sort(), ['specs/dsds/tile-one.dsds.json', 'specs/tile-one.md']);
  const md = r.files.get('specs/tile-one.md');
  assert.match(md, /- \*\*Draft:\*\* Set `tone="loud"` for alerts\.\n- \*\*Draft:\*\* Use it rather than `tileTwo`/);
  assert.ok(!md.includes('maps to'));
  assert.match(md, /## When not to use\n\n- \*\*Draft:\*\* For two subjects use `tileTwo`\./);
  const json = JSON.parse(r.files.get('specs/dsds/tile-one.dsds.json'));
  assert.deepEqual(json.sections.map((s) => s.title), ['When to use', 'When not to use']);
  assert.match(describeChanges(r), /1 sentence the system contradicts written again as drafts/);
  // From a family's spec, the same page takes the line out but no draft of its own.
  const fam = applyPlan(plan, new Map([['specs/tiles.md', '# Tiles\n\n- Source: `src/tiles/`\n\n## When to use\n\n- The task maps to `tileOne` in the manifest.\n']]));
  assert.match(fam.held[0].why, /written from specs\/tiles\.md, which other pages are written from too/);
  assert.ok(!fam.files.get('specs/tiles.md').includes('maps to'));
});
