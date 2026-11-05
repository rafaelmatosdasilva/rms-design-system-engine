// intent-changes.mjs - the changes the Intent layer review asks for, made in the layer's own files: lines repeated on
// every page taken out, sentences the system contradicts written again as drafts, what a page lacks drafted; each in
// the page's Markdown spec and its DSDS page alike. And the reader: a drafted line is set apart, a rule shared by
// reference is the system's, a line that differs only by the page's own name is repeated. An invented system (Acme).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mdRemove, mdReplace, mdAdd, jsonRemove, jsonReplace, jsonAdd, jsonText, layoutOf, specIndex, specOf, planOf, draftPlan, sureParts, applyPlan, describeChanges } from '../lib/intent-changes.mjs';
import { entityView, dropBoilerplate, DRAFT } from '../lib/doc-source-dsds.mjs';
import { factsFrom } from '../lib/intent-truth.mjs';
import { useReport } from '../lib/intent-layer.mjs';
import { tempDir, makeFixture } from './helpers.mjs';

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

test('a line goes where the layer\'s own generator puts that heading, so generating the pages again moves nothing', () => {
  const page = (title, sections) => JSON.stringify({ kind: 'component', name: title, sections });
  const spec = (blocks) => ({ kind: 'section', for: 'all', title: 'Specification', freeform: blocks });
  const lim = { kind: 'section', for: 'all', title: 'Limitations', freeform: [{ title: 'Limitations', body: '- One at a time.' }] };
  const files = new Map([
    ['dsds/a.dsds.json', page('A', [{ kind: 'guidelines', for: 'all', framing: 'when-to-use', title: 'When to use', items: [] }, lim, spec([{ title: 'Data', body: '- `rows` holds a list.' }])])],
    ['dsds/b.dsds.json', page('B', [lim, spec([{ title: 'Do and don\'t', body: '- Do: keep it short.' }])])]
  ]);
  const layout = layoutOf(files);
  assert.equal(layout.shapes.get('when to use'), 'guidelines');
  assert.equal(layout.shapes.get('limitations'), 'own');
  assert.equal(layout.shapes.get('data'), 'in:Specification');
  const doc = { kind: 'component', name: 'C', sections: [{ kind: 'guidelines', for: 'all', framing: 'when-to-use', title: 'When to use', items: [] }, spec([{ title: 'Evidence', body: '- Read in the code.' }])] };
  jsonAdd(doc, 'Limitations', 'Two at most.', { layout });
  jsonAdd(doc, 'Limitations', 'Phone only.', { layout });
  jsonAdd(doc, 'Data', '`tabs` holds a list of items, each with `id`.', { sure: true, layout });
  jsonAdd(doc, 'When not to use', 'Not for a list.', { layout });
  assert.deepEqual(doc.sections.map((x) => x.title), ['When to use', 'When not to use', 'Limitations', 'Specification'], 'a section of its own before the one that holds the rest');
  assert.equal(doc.sections[2].freeform[0].body, '- **Draft:** Two at most.\n- **Draft:** Phone only.');
  assert.equal(doc.sections[3].freeform.find((b) => b.title === 'Data').body, '- `tabs` holds a list of items, each with `id`.');
  assert.equal(jsonRemove(doc, 'Phone only.'), 0, 'a draft is matched with its marker');
  assert.equal(jsonRemove(doc, '**Draft:** Phone only.'), 1);
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
  assert.deepEqual(plan[0].need, ['whenNotToUse', 'mistakes', 'limitations', 'example', 'role', 'doDont', { differ: 'tileTwo' }]);
  // The drafter answers; what names nothing the system has is kept, the rest dropped.
  const asked = [];
  draftPlan(plan, facts, (prompt) => { asked.push(prompt); return JSON.stringify({ '0.r0': { text: 'Set `tone="loud"` for alerts.' }, '0.d': { whenToUse: ['Use it rather than `tileTwo` for one subject.'], whenNotToUse: ['For two subjects use `tileTwo`.', 'Not with `glowMode`.'] } }); });
  assert.match(asked[0], /"task": "rewrite"/);
  assert.deepEqual(plan[0].rewritten, [{ line: 'Set `tone="bright"` for alerts.', text: 'Set `tone="loud"` for alerts.' }]);
  assert.deepEqual(plan[0].drafted.filter((d) => !d.sure).map((d) => d.text), ['Use it rather than `tileTwo` for one subject.', 'For two subjects use `tileTwo`.']);
  assert.deepEqual(plan[0].drafted.filter((d) => d.sure).map((d) => d.text), ['`<TileOne tone="calm" />`'], 'an example from its own props, its root unknown so no role');
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
  assert.deepEqual(json.sections.map((s) => s.title), ['When to use', 'When not to use', 'Example']);
  assert.match(describeChanges(r), /1 sentence the system contradicts written again as drafts/);
  // From a family's spec, the same page takes the line out but no draft of its own.
  const fam = applyPlan(plan, new Map([['specs/tiles.md', '# Tiles\n\n- Source: `src/tiles/`\n\n## When to use\n\n- The task maps to `tileOne` in the manifest.\n']]));
  assert.match(fam.held[0].why, /written from specs\/tiles\.md, which other pages are written from too/);
  assert.ok(!fam.files.get('specs/tiles.md').includes('maps to'));
});

test('the merge request is written with GITLAB_WRITE_TOKEN when there is one; everything else reads with GITLAB_TOKEN', async () => {
  const { layerAccess, writeTokenFrom } = await import('../lib/intent-changes.mjs');
  const cfg = { intentLayer: 'https://gitlab.acme.test/ux/layer' };
  assert.equal(layerAccess('.', cfg, { env: { GITLAB_HOST: 'gitlab.acme.test', GITLAB_TOKEN: 'reads', GITLAB_WRITE_TOKEN: 'writes' } }).writesWith, 'GITLAB_WRITE_TOKEN');
  assert.equal(layerAccess('.', cfg, { env: { GITLAB_HOST: 'gitlab.acme.test', GITLAB_TOKEN: 'reads' } }).writesWith, 'GITLAB_TOKEN');
  const { writeFileSync } = await import('node:fs');
  const dir = tempDir('wt-');
  writeFileSync(dir + '/.env', 'GITLAB_TOKEN=reads\nGITLAB_WRITE_TOKEN="writes" # the layer only\n');
  assert.equal(writeTokenFrom({}, [dir]), 'writes');
});

test('a commit straight on the branch only while the branch is where the changes were made', async () => {
  const { commitToBranch } = await import('../lib/intent-changes.mjs');
  const sent = [];
  const access = (head) => ({ writesWith: 'GITLAB_WRITE_TOKEN', get: async () => ({ ok: true, json: async () => ({ id: head }) }), send: async (m, p, b) => { sent.push([m, p, b]); return { ok: true, json: async () => ({ id: 'c0ffee', web_url: 'https://gitlab.acme.test/c0ffee' }) }; } });
  const files = new Map([['specs/a.md', 'text']]);
  assert.match((await commitToBranch(access('abc999'), { files, sha: 'abc123', target: 'main', message: 'm' })).error, /main moved since the layer was read/);
  assert.equal(sent.length, 0);
  assert.equal((await commitToBranch(access('abc123def'), { files, sha: 'abc123', target: 'main', message: 'm' })).url, 'https://gitlab.acme.test/c0ffee');
  assert.deepEqual(sent[0][2].actions, [{ action: 'update', file_path: 'specs/a.md', content: 'text' }]);
  assert.equal(sent[0][2].branch, 'main');
});

test('reviewing drafts: approve takes the marker off, change writes the new text, drop deletes the line; in the spec and the page alike', async () => {
  const { mdReview, jsonReview, reviewPlan, describeReview } = await import('../lib/intent-changes.mjs');
  const md = '# Tile One\n\n- Source: `src/tiles/TileOne.vue`\n\n## When to use\n\n- **Draft:** Use it for one subject.\n- **Draft:** Use it on a dashboard.\n\n## When not to use\n\n- **Draft:** Not for a list.\n\n## Evidence\n\n- Seen.\n';
  assert.match(mdReview(md, 'Use it for one subject.'), /^- Use it for one subject\.$/m);
  assert.match(mdReview(md, 'Use it on a dashboard.', 'Use it on a home screen.'), /^- Use it on a home screen\.$/m);
  const dropped = mdReview(md, 'Not for a list.', null);
  assert.ok(!/When not to use/.test(dropped), 'a heading left empty goes');
  assert.equal(mdReview(md, 'A line it does not have.'), md);
  const page = { kind: 'component', id: 'component-tile-one', name: 'Tile One', sections: [{ kind: 'guidelines', title: 'When to use', items: [{ level: 'should', statement: '**Draft:** Use it for one subject.' }] }, { kind: 'guidelines', title: 'When not to use', items: [{ level: 'should-not', statement: '**Draft:** Not for a list.' }] }] };
  const doc = JSON.parse(JSON.stringify(page));
  assert.equal(jsonReview(doc, 'Use it for one subject.'), 1);
  assert.equal(doc.sections[0].items[0].statement, 'Use it for one subject.');
  assert.equal(jsonReview(doc, 'Not for a list.', null), 1);
  assert.deepEqual(doc.sections.map((s) => s.title), ['When to use']);
  // The plan: by page and line, a change checked first, what cannot be done said.
  const e = { kind: 'component', layer: 'components', name: 'Tile One', id: 'component-tile-one', file: 'specs/dsds/tile-one.dsds.json', code: 'src/tiles/TileOne.vue', drafts: [{ where: 'When to use', text: 'Use it for one subject.' }, { where: 'When to use', text: 'Use it on a dashboard.' }, { where: 'When not to use', text: 'Not for a list.' }] };
  const files = new Map([['specs/tile-one.md', md], ['specs/dsds/tile-one.dsds.json', JSON.stringify(page, null, 2) + '\n']]);
  const r = reviewPlan({ entities: [e] }, [
    { page: 'Tile One', line: 'Use it for one subject.', do: 'approve' },
    { page: 'Tile One', line: 'Use it on a dashboard.', do: 'change', to: 'Use `glowMode` on a dashboard.' },
    { page: 'Tile One', line: 'Not for a list.', do: 'drop' },
    { page: 'Tile Nine', do: 'approve' },
  ], files, { check: (x, t) => (/glowMode/.test(t) ? '`glowMode` is not in the system' : null) });
  assert.deepEqual(r.problems, ['Tile One, "Use it on a dashboard.": the new text is not kept: `glowMode` is not in the system', 'Tile Nine: no page of that name has drafts']);
  assert.match(r.files.get('specs/tile-one.md'), /^- Use it for one subject\.$/m);
  assert.match(r.files.get('specs/tile-one.md'), /- \*\*Draft:\*\* Use it on a dashboard\./, 'the refused change leaves the draft as it was');
  assert.match(describeReview(r), /^Drafts reviewed on 1 page: 1 approved, 0 changed, 1 dropped\./);
});

test('each run fixes the layer only where intentLayer.autoFix is "commit", never offline; --intent-autofix turns it on and off, the file\'s indentation kept', async () => {
  const { autoFix } = await import('../lib/intent-changes.mjs');
  assert.equal(await autoFix('.', { intentLayer: 'https://gitlab.acme.test/ux/layer' }), null);
  assert.equal(await autoFix('.', { intentLayer: { gitlab: 'https://gitlab.acme.test/ux/layer', autoFix: 'commit' } }, { offline: true }), null);
  const { writeFileSync, readFileSync } = await import('node:fs');
  const { join } = await import('node:path');
  const { spawnSync } = await import('node:child_process');
  const root = tempDir('autofix-');
  writeFileSync(join(root, 'ds-config.json'), '{\n    "name": "Acme",\n    "intentLayer": "https://gitlab.acme.test/ux/layer"\n}\n');
  const { fileURLToPath } = await import('node:url');
  const engine = fileURLToPath(new URL('../lib/audit.mjs', import.meta.url));
  assert.equal(spawnSync(process.execPath, [engine, '--intent-autofix', 'on'], { cwd: root, encoding: 'utf8' }).status, 0);
  assert.equal(readFileSync(join(root, 'ds-config.json'), 'utf8'), '{\n    "name": "Acme",\n    "intentLayer": {\n        "gitlab": "https://gitlab.acme.test/ux/layer",\n        "autoFix": "commit"\n    }\n}\n');
  assert.equal(spawnSync(process.execPath, [engine, '--intent-autofix', 'off'], { cwd: root, encoding: 'utf8' }).status, 0);
  assert.equal(JSON.parse(readFileSync(join(root, 'ds-config.json'), 'utf8')).intentLayer, 'https://gitlab.acme.test/ux/layer');
});

test('what else a component page lacks: its role and an example written from the code as the team\'s; mistakes, limitations, do and don\'t drafted for review', () => {
  const facts = factsFrom({ components: { chipOne: { file: 'src/chips/ChipOne.vue', root: 'button', props: { size: { options: ['s', 'm'] } } } } });
  const e = { kind: 'component', layer: 'components', name: 'Chip One', id: 'component-chip-one', file: 'specs/dsds/chip-one.dsds.json', code: 'src/chips/ChipOne.vue', purpose: ['A chip for one choice.'], whenToUse: ['Use it for one choice.'], whenNotToUse: ['Not for navigation.'], mistakes: [], limitations: [], rules: [], sections: [] };
  const snap = { _source: {}, entities: [e] };
  const report = useReport(snap, new Map([['chipOne', e]]), { names: ['chipOne'], wrongOf: () => [] });
  const plan = planOf(snap, report);
  assert.deepEqual(plan[0].need, ['mistakes', 'limitations', 'example', 'role', 'doDont']);
  const asked = [];
  draftPlan(plan, facts, (prompt) => { asked.push(prompt); return JSON.stringify({ '0.d': { mistakes: ['Using `chipOne` for a list of links; use a link instead.'], limitations: ['It takes one choice only.'], example: 'never asked', doDont: ['Do: keep its label short.', "Don't: put two chips' choices in one."] } }); });
  assert.match(asked[0], /"need": \[\s*"mistakes",\s*"limitations",\s*"doDont"\s*\]/, 'its role and an example are never asked');
  assert.deepEqual(plan[0].drafted.map((d) => `${d.sure ? 'sure ' : ''}${d.where}: ${d.text}`), ['sure Role: Role: button', 'sure Example: `<ChipOne size="s" />`', 'Common mistakes: Using `chipOne` for a list of links; use a link instead.', 'Limitations: It takes one choice only.', "Do and don't: Do: keep its label short."]);
  const md = applyPlan(plan, new Map([['specs/chip-one.md', '# Chip One\n\n- Source: `src/chips/ChipOne.vue`\n\n## Purpose\n\nA chip for one choice.\n']])).files.get('specs/chip-one.md');
  assert.match(md, /## Role\n\n- Role: button\n/, 'from the code: no Draft marker');
  assert.match(md, /## Example\n\n- `<ChipOne size="s" \/>`/);
  assert.match(md, /## Limitations\n\n- \*\*Draft:\*\* It takes one choice only\./, 'judged: a Draft');
  assert.match(md, /## Do and don't\n\n- \*\*Draft:\*\* Do: keep its label short\./);
  assert.ok(md.indexOf('## Common mistakes') < md.indexOf('## Limitations') && md.indexOf('## Limitations') < md.indexOf('## Role') && md.indexOf('## Role') < md.indexOf('## Example'), 'the written sections first, then the reference ones');
});

test('a role the code cannot say (it renders a div) is asked, and comes back a draft for review; one that is not an ARIA role is not kept', () => {
  const facts = factsFrom({ components: { tileOne: { file: 'src/tiles/TileOne.vue', root: 'div', props: { size: { options: ['s', 'm'] } } }, tileTwo: { file: 'src/tiles/TileTwo.vue', root: 'div', props: {} } } });
  const page = (name, file) => ({ kind: 'component', layer: 'components', name, id: `component-${file}`, file: `specs/dsds/${file}.dsds.json`, code: `src/tiles/${name.replace(' ', '')}.vue`, purpose: ['A tile.'], whenToUse: ['Use it for one subject.'], whenNotToUse: ['Not for lists.'], mistakes: ['Two in a row.'], limitations: ['One subject only.'], rules: [], sections: [{ title: 'Example', text: '<TileOne />' }, { title: 'Do and don\'t', text: 'Do: keep it short.' }] });
  const a = page('Tile One', 'tile-one'), b = page('Tile Two', 'tile-two');
  const snap = { _source: {}, entities: [a, b] };
  const report = useReport(snap, new Map([['tileOne', a], ['tileTwo', b]]), { names: ['tileOne', 'tileTwo'], wrongOf: () => [] });
  const plan = planOf(snap, report);
  assert.ok(plan.every((it) => it.need.includes('role')));
  const asked = [];
  draftPlan(plan, facts, (prompt) => { asked.push(prompt); return JSON.stringify({ '0.d': { role: 'link' }, '1.d': { role: 'clickable card' } }); });
  assert.match(asked[0], /"need": \[\s*"role"\s*\]/, 'its role is asked');
  assert.match(asked[0], /"role": "<the ARIA role/);
  assert.deepEqual(plan[0].drafted.map((d) => `${d.sure ? 'sure ' : ''}${d.where}: ${d.text}`), ['Role: Role: link'], 'a draft, not sure');
  assert.deepEqual(plan[1].drafted, []);
  assert.deepEqual(plan[1].dropped, [{ text: 'Role: clickable card', why: 'it is not one of the ARIA roles' }]);
  const md = applyPlan(plan.slice(0, 1), new Map([['specs/tile-one.md', '# Tile One\n\n- Source: `src/tiles/TileOne.vue`\n\n## Purpose\n\nA tile.\n']])).files.get('specs/tile-one.md');
  assert.match(md, /## Role\n\n- \*\*Draft:\*\* Role: link\n/, 'judged: a Draft');
});

test('a page with drafts waiting for review still gets drafted the parts it lacks that no draft covers', () => {
  const e = { kind: 'component', layer: 'components', name: 'Tile One', id: 'component-tile-one', file: 'specs/dsds/tile-one.dsds.json', code: 'src/tiles/TileOne.vue', purpose: ['A tile.'], whenToUse: [], whenNotToUse: [], mistakes: [], limitations: [], rules: [], sections: [], drafts: [{ where: 'When to use', text: 'Use it for one subject.' }, { where: 'Limitations', text: 'One subject only.' }] };
  const snap = { _source: {}, entities: [e] };
  const report = useReport(snap, new Map([['tileOne', e]]), { names: ['tileOne'], wrongOf: () => [] });
  const [it] = planOf(snap, report);
  assert.deepEqual(it.need, ['whenNotToUse', 'mistakes', 'example', 'role', 'doDont'], 'what waits is not asked again; the rest is');
});

test('a draft is known by what it says too: a "Role: button" waiting under Rules is a role waiting, never drafted twice', () => {
  const e = { kind: 'component', layer: 'components', name: 'Tile One', id: 'component-tile-one', file: 'specs/dsds/tile-one.dsds.json', code: 'src/tiles/TileOne.vue', purpose: ['A tile.'], whenToUse: [], whenNotToUse: [], mistakes: [], limitations: [], rules: [], sections: [], drafts: [{ where: 'Rules', text: 'Role: button' }, { where: 'Rules', text: 'Limitations: none known' }, { where: 'Rules', text: 'Keep it short' }] };
  const snap = { _source: {}, entities: [e] };
  const report = useReport(snap, new Map([['tileOne', e]]), { names: ['tileOne'], wrongOf: () => [] });
  const [it] = planOf(snap, report);
  assert.ok(!it.need.includes('role'), 'the role waits under Rules');
  assert.ok(!it.need.includes('limitations'), 'so do its limitations, led by their part\'s name');
  assert.ok(it.need.includes('whenToUse'), 'a draft that names no part covers none');
});

test('a large change goes as several commits, each made on the one before, and stops when someone else committed between', async () => {
  const { commitToBranch } = await import('../lib/intent-changes.mjs');
  const files = new Map(Array.from({ length: 90 }, (_, i) => [`specs/page-${i}.md`, 'x'.repeat(100)]));
  let head = 'abc123', n = 0;
  const sent = [];
  const access = { writesWith: 'GITLAB_TOKEN', get: async () => ({ ok: true, json: async () => ({ id: head }) }), send: async (m, p, body) => { sent.push(body); head = `c${++n}`; return { ok: true, json: async () => ({ id: head, web_url: `u/${head}` }) }; } };
  const r = await commitToBranch(access, { files, sha: 'abc123', target: 'master', message: 'Intent layer review\n\nCo-Authored-By: x' });
  assert.deepEqual([r.parts, sent.map((b) => b.actions.length)], [3, [40, 40, 10]]);
  assert.match(sent[1].commit_message, /^Intent layer review \(part 2 of 3\)\n\nCo-Authored-By: x$/);
  // Someone commits after the first part: the rest is not sent.
  head = 'abc123'; n = 0; sent.length = 0;
  const moving = { ...access, get: async () => ({ ok: true, json: async () => ({ id: sent.length ? 'theirs' : head }) }) };
  const r2 = await commitToBranch(moving, { files, sha: 'abc123', target: 'master', message: 'm' });
  assert.equal(sent.length, 1);
  assert.match(r2.error, /moved while the changes were sent \(1 of 3 parts sent\)/);
});

test('what the tests found and the code says for certain is written as final; telling siblings apart is drafted', () => {
  const facts = factsFrom({ components: { chipOne: { file: 'src/chips/ChipOne.vue', root: 'button', props: {} }, chipTwo: { file: 'src/chips/ChipTwo.vue', props: {} } } });
  const e = { kind: 'component', layer: 'components', name: 'Chip One', id: 'component-chip-one', file: 'specs/dsds/chip-one.dsds.json', code: 'src/chips/ChipOne.vue', purpose: ['A chip for one choice.'], whenToUse: ['The value is picked by the user.'], whenNotToUse: ['Not for navigation.'], mistakes: ['x'], limitations: ['y'], rules: ['Role: button', 'Do: keep it short.', 'Example: `<ChipOne />`', 'Send `picked` once.'], sections: [] };
  const snap = { _source: {}, entities: [e] };
  const report = useReport(snap, new Map([['chipOne', e]]), { names: ['chipOne'], wrongOf: () => [] });
  const code = { name: 'chipOne', events: ['picked', 'removed', 'cleared'], payloads: { removed: 'chip.id', cleared: '$event' }, slots: ['icon'], props: ['dense'], propFacts: { dense: { type: 'boolean', default: false } }, data: { items: ['id', 'label'] }, listy: { items: true }, ownless: true, shared: ['The value is picked by the user.'], confusedWith: 'chipTwo' };
  const plan = planOf(snap, report, { code: () => code });
  plan[0].code = code;
  assert.deepEqual(plan[0].need.find((n) => n?.write).write, [{ where: 'Data', text: '`items` holds a list of items, each with `id`, `label`.' }], 'events, props and slots are the generator\'s own definitions');
  assert.ok(plan[0].need.includes('whenToUse') && plan[0].need.some((n) => n?.ownUse) && plan[0].need.some((n) => n?.differ === 'chipTwo'));
  const asked = [];
  draftPlan(plan, facts, (prompt) => { asked.push(prompt); return JSON.stringify({ '0.d': { whenToUse: ['Use it when the user removes picks one by one, not `chipTwo`.'] } }); });
  assert.match(asked[0], /"ownUse": true/);
  assert.match(asked[0], /With ownUse: every "when to use" line/);
  const sure = plan[0].drafted.filter((d) => d.sure).map((d) => `${d.where}: ${d.text}`);
  assert.deepEqual(sure, ['Data: `items` holds a list of items, each with `id`, `label`.']);
  assert.ok(plan[0].drafted.some((d) => !d.sure && d.where === 'When to use'), 'drafted for review');
});

test('an internal part\'s page says, for certain, that it is not used on its own and what to use instead', () => {
  const part = { kind: 'component', layer: 'components', name: 'Tile Grip', file: 'specs/dsds/tile-grip.dsds.json', code: 'src/tiles/Grip.vue', purpose: ['A grip.'], whenToUse: [], whenNotToUse: [], mistakes: [], limitations: [], rules: [], sections: [] };
  const owner = { ...part, name: 'Tile One', file: 'specs/dsds/tile-one.dsds.json', code: 'src/tiles/TileOne.vue' };
  const snap = { _source: {}, entities: [part, owner] };
  const report = { pages: [{ name: 'Tile Grip', file: part.file, action: 'move', code: part.code }] };
  const plan = sureParts(planOf(snap, report, { partOf: new Map([['Tile Grip', ['src/tiles/TileOne.vue']]]) }), factsFrom({ components: {} }));
  assert.deepEqual(plan.map((it) => it.drafted), [[{ where: 'When not to use', text: 'Not used on its own: it is an internal part of Tile One; use Tile One instead.', sure: true }]]);
  assert.equal(planOf(snap, report).length, 0, 'a page to move with no part found takes nothing');
  const said = { ...snap, entities: [{ ...part, whenNotToUse: ['Not used on its own: it is an internal part of Tile One.'] }, owner] };
  assert.equal(planOf(said, report, { partOf: new Map([['Tile Grip', ['src/tiles/TileOne.vue']]]) }).length, 0, 'said once');
});

test('the sure parts are written even when nothing can be drafted', () => {
  const facts = factsFrom({ components: { chipOne: { file: 'src/chips/ChipOne.vue', props: {} } } });
  const plan = [{ entity: { name: 'Chip One' }, page: { component: 'chipOne' }, need: [{ write: [{ where: 'Data', text: '`items` holds a list of items, each with `id`.' }] }] }];
  sureParts(plan, facts);
  assert.deepEqual(plan[0].drafted, [{ where: 'Data', text: '`items` holds a list of items, each with `id`.', sure: true }]);
});

test('a component\'s own spec wins over a pattern that names the same code as its source', () => {
  const idx = specIndex(new Map([['specs/patterns/selection.md', '# Selection\n\n- Source: `src/tables/Grid.vue`\n'], ['specs/components/grid.md', '# Grid\n\n- Source: `src/tables/Grid.vue`\n']]));
  assert.deepEqual(specOf({ name: 'Grid', code: 'src/tables/Grid.vue' }, idx), { spec: 'specs/components/grid.md', shared: false });
  const only = specIndex(new Map([['specs/patterns/error.md', '# Error\n\n- Source: `src/notes/Note.vue`\n'], ['specs/components/notes.md', '# Notes\n\n- Source: `src/notes/`\n']]));
  assert.deepEqual(specOf({ name: 'Note General', code: 'src/notes/Note.vue' }, only), { spec: 'specs/components/notes.md', shared: true }, 'a pattern never owns a component\'s code');
});

test('when the code changes, the engine\'s own section follows it: a line it no longer says comes out, the new one goes in', () => {
  const e = { kind: 'component', layer: 'components', name: 'Chip One', id: 'component-chip-one', file: 'specs/dsds/chip-one.dsds.json', code: 'src/chips/ChipOne.vue', purpose: ['A chip.'], whenToUse: ['Use it for one choice.'], whenNotToUse: ['Not for links.'], mistakes: ['x'], limitations: ['y'], rules: ['Role: button', 'Do: keep it short.', 'Example: `<ChipOne />`', 'Data: `items` holds a list of items, each with `id`, `name`.', 'Data: `groups` holds a list of items, each with `id`.'], sections: [] };
  const snap = { _source: {}, entities: [e] };
  const report = useReport(snap, new Map([['chipOne', e]]), { names: ['chipOne'], wrongOf: () => [] });
  // The code renamed name to label, and groups is gone.
  const code = { events: [], payloads: {}, slots: [], props: [], propFacts: {}, data: { items: ['id', 'label'] }, listy: { items: true } };
  const plan = planOf(snap, report, { code: () => code });
  assert.deepEqual(plan[0].remove.sort(), ['`groups` holds a list of items, each with `id`.', '`items` holds a list of items, each with `id`, `name`.']);
  assert.deepEqual(plan[0].need.find((n) => n?.write).write, [{ where: 'Data', text: '`items` holds a list of items, each with `id`, `label`.' }]);
  // As the code says it: nothing to do.
  const same = planOf(snap, report, { code: () => ({ events: [], payloads: {}, slots: [], props: [], propFacts: {}, data: { items: ['id', 'name'], groups: ['id'] }, listy: { items: true, groups: true } }) });
  assert.equal(same.length, 0);
});

test('the reader keeps what a generated definitions section names, and whether it says more than the name', () => {
  const v = entityView({ kind: 'component', name: 'Chip One', sections: [
    { kind: 'definitions', title: 'Events', items: [{ term: 'picked', definition: 'Event emitted by the component.' }, { term: 'removed', definition: 'Sent when the person takes the chip out, with its id.' }] },
    { kind: 'definitions', title: 'Properties', items: [{ term: 'size (chipSize)', definition: 'Vue prop `chipSize`. String; default `m`.' }] },
  ] }, 'specs/dsds/chip-one.dsds.json');
  assert.deepEqual(v.defined, { events: [{ term: 'picked', codeTerm: null, said: false }, { term: 'removed', codeTerm: null, said: true }], props: [{ term: 'size', codeTerm: 'chipSize', said: true }] });
});

test('a line led by its section\'s title, as the reader gives it, is found where its file keeps it without', () => {
  const md = '# Tile One\n\n## Overflow\n\n- Keep `tileOne` to one line.\n\n## When to use\n\n- Overflow: Keep it short.\n';
  const t = mdReplace(md, 'Overflow: Keep `tileOne` to one line.', 'Overflow: Keep `tileOne` to two lines.');
  assert.match(t, /## Overflow\n\n- \*\*Draft:\*\* Keep `tileOne` to two lines\.\n/, 'the title it is led by is not written twice');
  assert.match(mdRemove(md, 'Overflow: Keep `tileOne` to one line.'), /^# Tile One\n\n## When to use\n\n- Overflow: Keep it short\.\n$/);
  assert.equal(mdRemove(md, 'Limits: Keep `tileOne` to one line.'), md, 'only under a heading of that title');
  assert.match(mdRemove(md, 'Overflow: Keep it short.'), /- Keep `tileOne` to one line\.\n$/, 'a line written led by it is matched as it is');
  const doc = { kind: 'component', name: 'Tile One', sections: [{ kind: 'section', title: 'Specification', freeform: [{ title: 'Overflow', body: '- Keep `tileOne` to one line.' }] }] };
  assert.equal(jsonReplace(doc, 'Overflow: Keep `tileOne` to one line.', 'Keep `tileOne` to two lines.'), 1);
  assert.equal(doc.sections[0].freeform[0].body, '- **Draft:** Keep `tileOne` to two lines.');
  assert.equal(jsonRemove(doc, 'Overflow: **Draft:** Keep `tileOne` to two lines.'), 1);
  assert.equal(doc.sections[0].freeform[0].body, '');
});

test('a change none of the page\'s files holds is never said as made: the summary and CHANGES.md say it could not be found', () => {
  const e = { kind: 'component', layer: 'components', name: 'Tile One', id: 'component-tile-one', file: 'specs/dsds/tile-one.dsds.json', code: 'src/tiles/TileOne.vue' };
  const plan = [{ entity: e, page: { name: 'Tile One', component: 'tileOne' }, remove: [], rewrite: [], need: [], rewritten: [{ line: 'Set `tone="bright"` for alerts.', text: 'Set `tone="loud"` for alerts.' }], drafted: [] }];
  const files = new Map([['specs/tile-one.md', SPEC], ['specs/dsds/tile-one.dsds.json', JSON.stringify(PAGE, null, 2) + '\n']]);
  const r = applyPlan(plan, files);
  assert.equal(r.files.size, 0);
  assert.deepEqual(r.pages, []);
  assert.deepEqual(r.missed, [{ name: 'Tile One', line: 'Set `tone="bright"` for alerts.', to: 'Set `tone="loud"` for alerts.' }]);
  const said = describeChanges(r);
  assert.match(said.split('\n')[0], /^0 pages changed: .*0 sentences the system contradicts written again as drafts, 0 lines drafted\. 1 line could not be found in its page: "Set `tone="bright"` for alerts\." \(Tile One\)\.$/);
  assert.match(said, /### Not found in the page\n.*\n\n- Tile One: "Set `tone="bright"` for alerts\." \(to be written again as "Set `tone="loud"` for alerts\."\)/);
  // A line to take out that is not there either.
  const out = applyPlan([{ ...plan[0], rewritten: [], remove: ['A line no file has.'] }], files);
  assert.deepEqual(out.missed, [{ name: 'Tile One', line: 'A line no file has.' }]);
  assert.match(describeChanges(out), /- Tile One: "A line no file has\." \(to be taken out\)/);
});

test('a line the engine wrote from the code that the system now contradicts is written again from the code, never drafted', () => {
  const facts = factsFrom({ components: { tileCard: { file: 'src/TileCard.vue', props: { tileData: { type: 'Array' } } } } });
  const e = { kind: 'component', layer: 'components', name: 'Tile Card', id: 'component-tile-card', file: 'specs/dsds/tile-card.dsds.json', code: 'src/TileCard.vue', purpose: ['A card for one subject.'], whenToUse: ['Use it for one subject.'], whenNotToUse: ['x'], mistakes: ['x'], limitations: ['x'], rules: ['Role: none', 'Do: keep it short.', 'Example: `<TileCard />`', 'Data: `tileData` holds a list of items, each with `title`, `statusLabel`, `icon`.'], sections: [] };
  const snap = { _source: {}, entities: [e] };
  const wrong = [{ kind: 'name', where: 'Rules', line: 'Data: `tileData` holds a list of items, each with `title`, `statusLabel`, `icon`.', says: '`statusLabel`', truth: 'No component, prop or name in the code or Figma is called that.' }];
  const report = useReport(snap, new Map([['tileCard', e]]), { names: ['tileCard'], wrongOf: () => wrong });
  const code = { events: [], payloads: {}, slots: [], props: [], propFacts: {}, data: { tileData: ['title', 'badgeText', 'icon'] }, listy: { tileData: true } };
  const [it] = planOf(snap, report, { code: () => code });
  assert.deepEqual(it.rewrite, [], 'not a sentence for a person to review');
  assert.deepEqual(it.stale, ['`tileData` holds a list of items, each with `title`, `statusLabel`, `icon`.']);
  assert.deepEqual(it.need.find((n) => n?.write).write, [{ where: 'Data', text: '`tileData` holds a list of items, each with `title`, `badgeText`, `icon`.' }]);
  // As the code still says it: nothing to change. With the code not read this run: kept as it is, and said why.
  assert.equal(planOf(snap, report, { code: () => ({ ...code, data: { tileData: ['title', 'statusLabel', 'icon'] } }) }).length, 0);
  const unread = planOf(snap, report);
  assert.deepEqual(unread[0].rewrite, []);
  draftPlan(unread, facts, () => '{}');
  const r = applyPlan(unread, new Map());
  assert.equal(r.files.size, 0);
  assert.match(r.held[0].why, /^"Data: `tileData` holds [^"]+" was written by the engine from the code and the system now says otherwise \(No component, prop or name in the code or Figma is called that\); the code was not read this run/);
});

test('a DSDS layer whose code\'s item fields changed: the engine\'s Data line is written again in its Markdown spec and its DSDS page', async () => {
  const { syncIntentLayer } = await import('../lib/intent-layer.mjs');
  const { prepareLayerFix } = await import('../lib/intent-changes.mjs');
  const old = '`tileData` holds a list of items, each with `title`, `statusLabel`, `icon`.', now = '`tileData` holds a list of items, each with `title`, `badgeText`, `icon`.';
  const example = '```vue\n<TileCard :tile-data="items" />\n```';
  const dir = makeFixture({
    'package.json': { name: 'acme' },
    'struct.json': { components: { tileCard: {} } },
    'src/TileCard.vue': '<template><div><slot /></div></template>\n<script setup>\ndefineProps({ tileData: Array })\n</script>\n',
    '.design-system-engine-out/code.snapshot.json': { api: { tileCard: { file: 'src/TileCard.vue', props: { tileData: { type: 'Array' } } } } },
    // What the code says each item holds now: statusLabel is gone, badgeText is new.
    '.design-system-engine-out/prototypes/page-system.json': { components: { TileCard: { file: 'src/TileCard.vue', props: { tileData: { type: 'Array' } }, fields: { tileData: { title: {}, badgeText: {}, icon: {} } } } }, uses: {} },
    'specs/dsds/index.dsds.json': { schemaVersion: '0.23.0', entries: [{ kind: 'system', id: 'acme', name: 'Acme' }], refs: [{ href: 'components/cards/tile-card.dsds.json' }] },
    'specs/dsds/components/cards/tile-card.dsds.json': { kind: 'component', id: 'component-tile-card', name: 'Tile Card', description: 'A card for one subject.', sourceFiles: [{ platform: 'vue', file: 'src/TileCard.vue' }], sections: [
      { kind: 'guidelines', for: 'all', framing: 'when-to-use', title: 'When to use', items: [{ level: 'should', statement: 'Use it to show one subject at a glance.' }] },
      { kind: 'section', for: 'all', title: 'Specification', freeform: [{ title: 'Data', body: `- ${old}` }, { title: 'Examples', body: example }] }] },
    'specs/components/tile-card.md': `# Tile Card\n\n## Metadata\n\n- Name: Tile Card\n- Source: \`src/TileCard.vue\`\n\n## Purpose\n\nA card for one subject.\n\n## When to use\n\n- Use it to show one subject at a glance.\n\n## Examples\n\n${example}\n\n## Data\n\n- ${old}\n`,
  });
  const cfg = { paths: { snapshotStructure: 'struct.json' }, componentFiles: { tileCard: 'src/TileCard.vue' }, intentLayer: { folder: 'specs', format: 'dsds', entry: 'specs/dsds/index.dsds.json' } };
  assert.equal((await syncIntentLayer(dir, cfg, {})).ok, true);
  // The content check finds statusLabel nowhere in the code; a drafter would write the line again if asked.
  const p = await prepareLayerFix(dir, cfg, { answers: { '0.r0': { text: 'Data: `tileData` holds the list of items the tile shows.' } } });
  assert.equal(p.error, undefined);
  assert.deepEqual(p.plan[0].rewrite, [], 'the engine\'s own line is not asked to be written again');
  assert.deepEqual([...p.result.files.keys()].sort(), ['specs/components/tile-card.md', 'specs/dsds/components/cards/tile-card.dsds.json']);
  const md = p.result.files.get('specs/components/tile-card.md');
  assert.ok(md.endsWith(`## Data\n\n- ${now}\n`), md);
  assert.ok(!md.includes('statusLabel') && !md.includes('**Draft:**'));
  const page = JSON.parse(p.result.files.get('specs/dsds/components/cards/tile-card.dsds.json'));
  assert.deepEqual(page.sections[1].freeform.map((b) => [b.title, b.body]), [['Data', `- ${now}`], ['Examples', example]], 'in the same block, written as sure');
  assert.deepEqual(p.result.missed, []);
  const first = p.summary.split('\n')[0];
  assert.match(first, /^1 page changed: 0 lines written on every page alike taken out, 0 sentences the system contradicts written again as drafts, 1 line drafted, 1 line the code no longer says taken out\.$/);
  assert.match(p.summary, new RegExp(`- Written from the code, Data: "${now.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"\n- Taken out, the code no longer says it: "${old.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`));
});

test('the parts a project asks not to be drafted are never drafted, by the name its pages give them or the engine\'s key', async () => {
  const { noDraftsOf } = await import('../lib/intent-changes.mjs');
  assert.deepEqual([...noDraftsOf({ intentLayer: { noDrafts: ['Role', "Do and don't", 'limitations', 'banana'] } })].sort(), ['doDont', 'limitations', 'role']);
  assert.deepEqual([...noDraftsOf({ intentLayer: 'https://git.example.test/x' })], [], 'a layer given as a link alone asks nothing');
  assert.deepEqual([...noDraftsOf({})], []);
});
