// intent-changes.mjs - the changes the Intent layer review asks for, made in the layer's own files: lines repeated on
// every page taken out, sentences the system contradicts written again as drafts, what a page lacks drafted; each in
// the page's Markdown spec and its DSDS page alike. And the reader: a drafted line is set apart, a rule shared by
// reference is the system's, a line that differs only by the page's own name is repeated. An invented system (Acme).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mdRemove, mdReplace, mdAdd, jsonRemove, jsonReplace, jsonAdd, jsonText, specIndex, specOf, planOf, draftPlan, sureParts, applyPlan, describeChanges } from '../intent-changes.mjs';
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
  const { layerAccess, writeTokenFrom } = await import('../intent-changes.mjs');
  const cfg = { intentLayer: 'https://gitlab.acme.test/ux/layer' };
  assert.equal(layerAccess('.', cfg, { env: { GITLAB_HOST: 'gitlab.acme.test', GITLAB_TOKEN: 'reads', GITLAB_WRITE_TOKEN: 'writes' } }).writesWith, 'GITLAB_WRITE_TOKEN');
  assert.equal(layerAccess('.', cfg, { env: { GITLAB_HOST: 'gitlab.acme.test', GITLAB_TOKEN: 'reads' } }).writesWith, 'GITLAB_TOKEN');
  const { mkdtempSync, writeFileSync } = await import('node:fs');
  const dir = mkdtempSync((await import('node:path')).join((await import('node:os')).tmpdir(), 'wt-'));
  writeFileSync(dir + '/.env', 'GITLAB_TOKEN=reads\nGITLAB_WRITE_TOKEN="writes" # the layer only\n');
  assert.equal(writeTokenFrom({}, [dir]), 'writes');
});

test('a commit straight on the branch only while the branch is where the changes were made', async () => {
  const { commitToBranch } = await import('../intent-changes.mjs');
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
  const { mdReview, jsonReview, reviewPlan, describeReview } = await import('../intent-changes.mjs');
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
  const { autoFix } = await import('../intent-changes.mjs');
  assert.equal(await autoFix('.', { intentLayer: 'https://gitlab.acme.test/ux/layer' }), null);
  assert.equal(await autoFix('.', { intentLayer: { gitlab: 'https://gitlab.acme.test/ux/layer', autoFix: 'commit' } }, { offline: true }), null);
  const { mkdtempSync, writeFileSync, readFileSync } = await import('node:fs');
  const { join } = await import('node:path');
  const { tmpdir } = await import('node:os');
  const { spawnSync } = await import('node:child_process');
  const root = mkdtempSync(join(tmpdir(), 'autofix-'));
  writeFileSync(join(root, 'ds-config.json'), '{\n    "name": "Acme",\n    "intentLayer": "https://gitlab.acme.test/ux/layer"\n}\n');
  const engine = new URL('../audit.mjs', import.meta.url).pathname;
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
  assert.deepEqual(plan[0].drafted.map((d) => `${d.sure ? 'sure ' : ''}${d.where}: ${d.text}`), ['sure Role: Role: button', 'sure Example: `<ChipOne size="s" />`', 'Common mistakes: Using `chipOne` for a list of links; use a link instead.', 'Limitations: It takes one choice only.', "Do and don't: Do: keep its label short.", "Do and don't: Don't: put two chips' choices in one."]);
  const md = applyPlan(plan, new Map([['specs/chip-one.md', '# Chip One\n\n- Source: `src/chips/ChipOne.vue`\n\n## Purpose\n\nA chip for one choice.\n']])).files.get('specs/chip-one.md');
  assert.match(md, /## Role\n\n- Role: button\n/, 'from the code: no Draft marker');
  assert.match(md, /## Example\n\n- `<ChipOne size="s" \/>`/);
  assert.match(md, /## Limitations\n\n- \*\*Draft:\*\* It takes one choice only\./, 'judged: a Draft');
  assert.match(md, /## Do and don't\n\n- \*\*Draft:\*\* Do: keep its label short\./);
  assert.ok(md.indexOf('## Common mistakes') < md.indexOf('## Limitations') && md.indexOf('## Limitations') < md.indexOf('## Role') && md.indexOf('## Role') < md.indexOf('## Example'), 'the written sections first, then the reference ones');
});

test('a large change goes as several commits, each made on the one before, and stops when someone else committed between', async () => {
  const { commitToBranch } = await import('../intent-changes.mjs');
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

test('the sure parts are written even when nothing can be drafted', () => {
  const facts = factsFrom({ components: { chipOne: { file: 'src/chips/ChipOne.vue', props: {} } } });
  const plan = [{ entity: { name: 'Chip One' }, page: { component: 'chipOne' }, need: [{ write: [{ where: 'Data', text: '`items` holds a list of items, each with `id`.' }] }] }];
  sureParts(plan, facts);
  assert.deepEqual(plan[0].drafted, [{ where: 'Data', text: '`items` holds a list of items, each with `id`.', sure: true }]);
});

test('a component\'s own spec wins over a pattern that names the same code as its source', () => {
  const idx = specIndex(new Map([['specs/patterns/selection.md', '# Selection\n\n- Source: `src/tables/Grid.vue`\n'], ['specs/components/grid.md', '# Grid\n\n- Source: `src/tables/Grid.vue`\n']]));
  assert.deepEqual(specOf({ name: 'Grid', code: 'src/tables/Grid.vue' }, idx), { spec: 'specs/components/grid.md', shared: false });
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
