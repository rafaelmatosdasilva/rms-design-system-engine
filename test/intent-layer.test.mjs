// intent-layer.mjs - the team's intent layer (DSDS pages on GitLab) read through the API into a snapshot, matched to
// the system's components, folded into the design intent, the contracts, llms.txt, the prototype context and the
// style guide, and a report of what of it reaches the agents. An invented system (Acme); network through an injected
// fetch serving a tar.gz built here.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { makeFixture } from './helpers.mjs';
import {
  intentLayerConfig, layerOf, keyOfTitle, itemsOf, entityView, readDsds, dropBoilerplate, matchComponents,
  syncIntentLayer, readIntentLayer, componentIntent, useReport, describeSync, short, intentWords,
  addSource, configuredSources, syncSources, systemNames, namesFrom,
} from '../intent-layer.mjs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const ENGINE = fileURLToPath(new URL('..', import.meta.url));
import { rateGuidance, sectionsFrom } from '../guidance-rating.mjs';
import { generateIntent } from '../intent-gen.mjs';
import { guidanceView } from '../styleguide-data.mjs';
import { buildLlms } from '../contract-gen.mjs';
import { contextFrom, purposeLines, notesOf, NOTES_SHOWN } from '../prototype-context.mjs';

// ── An invented intent layer ──────────────────────────────────────────────────────────────────────────────────────
const sections = (items) => ({ kind: 'sections', items: items.map(([title, body]) => ({ title, anchor: title.toLowerCase(), body })) });
// What a generator writes on every page, only the name changed.
const filler = (name, file) => ({ kind: 'use-cases', purpose: `${name} should be used where it is part of the library.`,
  items: [{ stance: 'recommended', description: `Use ${name} when the API of \`${file}\` matches the need.` }, { stance: 'discouraged', description: `Avoid duplicating ${name} with local markup.` }] });
const comp = (id, name, file, blocks = []) => ({
  dsdsVersion: '0.15.2',
  entity: { kind: 'component', identifier: `component-${id}`, name, description: `${name} is a component implemented in \`${file}\`.`,
    metadata: { status: 'draft', docOrigin: 'generated' }, documentBlocks: [filler(name, file), ...blocks],
    $extensions: { 'com.acme.code': { sourcePath: file } } },
});
const LAYER = {
  'docs/dsds/system.dsds.json': {
    dsdsVersion: '0.15.2', systemInfo: { name: 'Acme DS', version: '2.0.0' },
    documentBlocks: [sections([['How to read this', 'Read the pages before composing a screen.']])],
    entityGroups: [
      { name: 'Components', entities: ['button-main', 'chip-filter', 'card-plain', 'toast-general', 'tile-media', 'ghost-widget'].map((f) => ({ $ref: `./components/${f}.dsds.json#/entity` })) },
      { name: 'Patterns', entities: [{ $ref: './patterns/saving.dsds.json#/entity' }] },
      { name: 'Templates', entities: [{ $ref: './templates/checkout.dsds.json#/entity' }] },
    ],
  },
  'docs/dsds/components/button-main.dsds.json': comp('button-main', 'Button Main', 'src/lib/buttons/Main.vue', [
    sections([
      ['Metadata', '- Name: Button Main\n- Status: Active'],
      ['Intent', 'Use the main button for the next step the person is expected to take.\n\nTypical labels: Save, Continue.'],
      ['Usage Rules', '- At most one main button in an action group.\n- Pair it with the secondary button for cancel.'],
      ['What Not To Do', '- Do not use it for destructive actions; use the danger button.\n- Do not use it for navigation.'],
      ['Tokens Used', '- `--acme-button-main-bg`'],
      ['Token Notes', 'Colours come from the --acme-button-main-* tokens.'],
    ]),
    { kind: 'anatomy', parts: [{ identifier: 'root', name: 'Root' }] },
    { kind: 'checklist', title: 'Checks', items: [{ label: 'Keep the label visible.', level: 'must' }] },
  ]),
  // Matched by its identifier, not its name.
  'docs/dsds/components/chip-filter.dsds.json': comp('chip-filter', 'Filter Chip', 'src/lib/chips/Filter.vue', [sections([['Overview / When Not To Use', 'Not for a single choice: use a radio group.']])]),
  // Matched by the code file only (its name and identifier differ from the component's).
  'docs/dsds/components/card-plain.dsds.json': comp('card-plain', 'Card Plain Plain', 'src/lib/cards/Plain.vue', [sections([['Intent', 'A surface that groups one subject.']])]),
  'docs/dsds/components/toast-general.dsds.json': comp('toast-general', 'Toast General', 'src/lib/toasts/General.vue'),
  'docs/dsds/components/tile-media.dsds.json': comp('tile-media', 'Tile Media', 'src/lib/tiles/Media.vue'),
  // Names no component of the system.
  'docs/dsds/components/ghost-widget.dsds.json': comp('ghost-widget', 'Ghost Widget', 'src/lib/ghost/Widget.vue', [sections([['Intent', 'A widget nobody built.']])]),
  'docs/dsds/patterns/saving.dsds.json': { entity: { kind: 'pattern', identifier: 'pattern-saving', name: 'Saving', documentBlocks: [sections([
    ['2. Overview', 'Save a long form as a draft.'], ['When Not To Use', 'Not for the final submit.'], ['Core Rules', '- Say when the draft was saved.']])] } },
  'docs/dsds/templates/checkout.dsds.json': { entity: { kind: 'template', identifier: 'template-checkout', name: 'Checkout', documentBlocks: [sections([['Anatomy', 'Header, steps, summary.']])] } },
  'README.md': '# Acme intent layer\n',
};
const COMPONENTS = ['buttonMain', 'chipFilter', 'cardPlain', 'toastGeneral', 'tileMedia', 'iconOnly'];
const CODE_FILES = { cardPlain: 'src/lib/cards/Plain.vue' };

// A tar archive as GitLab sends it: every file under "<project>-<ref>-<sha>/".
function tarGz(files, top = 'acme-intent-main-abc1234') {
  const blocks = [];
  const header = (name, size) => {
    const h = Buffer.alloc(512);
    h.write(name, 0, 100, 'utf8');
    h.write('0000644\0', 100); h.write('0000000\0', 108); h.write('0000000\0', 116);
    h.write(size.toString(8).padStart(11, '0') + '\0', 124); h.write('00000000000\0', 136);
    h.write('        ', 148); h.write('0', 156); h.write('ustar\0', 257); h.write('00', 263);
    let sum = 0; for (const b of h) sum += b;
    h.write(sum.toString(8).padStart(6, '0') + '\0 ', 148);
    return h;
  };
  for (const [path, content] of Object.entries(files)) {
    const data = Buffer.from(typeof content === 'string' ? content : JSON.stringify(content));
    blocks.push(header(`${top}/${path}`, data.length), data, Buffer.alloc((512 - (data.length % 512)) % 512));
  }
  blocks.push(Buffer.alloc(1024));
  return gzipSync(Buffer.concat(blocks));
}

// A GitLab that answers the three calls the reader makes, counting them and the headers it was sent.
function fakeGitlab({ sha = 'abc1234def5678', files = LAYER, status = 200 } = {}) {
  const calls = [];
  const fetchImpl = async (url, o = {}) => {
    calls.push({ url, method: o.method ?? 'GET', headers: o.headers ?? {} });
    if (status !== 200) return { ok: false, status, json: async () => ({}), arrayBuffer: async () => new ArrayBuffer(0) };
    const u = new URL(url);
    if (/\/repository\/archive\.tar\.gz$/.test(u.pathname)) { const b = tarGz(files); return { ok: true, status: 200, arrayBuffer: async () => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) }; }
    // A file's last commit (when its page last changed) and what changed between two commits.
    if (/\/repository\/commits$/.test(u.pathname)) return { ok: true, status: 200, json: async () => [{ id: sha, committed_date: '2026-09-15T08:30:00Z' }] };
    if (/\/repository\/compare$/.test(u.pathname)) return { ok: true, status: 200, json: async () => ({ diffs: [{ new_path: 'docs/dsds/components/button-main.dsds.json', old_path: 'docs/dsds/components/button-main.dsds.json' }] }) };
    if (/\/repository\/commits\//.test(u.pathname)) return { ok: true, status: 200, json: async () => ({ id: sha, title: 'Docs', committed_date: '2026-10-01T10:00:00Z' }) };
    return { ok: true, status: 200, json: async () => ({ default_branch: 'main' }) };
  };
  return { fetchImpl, calls };
}
const LINK = 'https://git.acme.test/design/intent';
const ENV = { GITLAB_TOKEN: 't0k', GITLAB_HOST: 'git.acme.test' };

// ── Pure parts ────────────────────────────────────────────────────────────────────────────────────────────────────
test('config: a bare link or an object; nothing set is null', () => {
  assert.equal(intentLayerConfig({}), null);
  assert.deepEqual(intentLayerConfig({ intentLayer: LINK }), { url: LINK, entry: null, out: 'intent-layer.snapshot.json', contracts: null });
  assert.deepEqual(intentLayerConfig({ intentLayer: { gitlab: LINK, entry: '/docs/system.dsds.json', out: 'x.json', contracts: '/specs/contracts/' } }), { url: LINK, entry: 'docs/system.dsds.json', out: 'x.json', contracts: 'specs/contracts' });
});

test('kinds land in the layers of the design intent; titles map to the kinds the style guide shows', () => {
  assert.equal(layerOf('component'), 'components');
  assert.equal(layerOf('product-page'), 'pages');
  assert.equal(layerOf('module'), 'flows');
  assert.equal(layerOf('token-group'), 'foundations');
  assert.equal(layerOf('whatever', 'Patterns'), 'patterns');
  assert.equal(layerOf('whatever'), 'system');
  assert.equal(layerOf('component', 'Templates'), 'templates');
  assert.equal(layerOf('component', 'Library components'), 'components');
  assert.equal(layerOf('foundation', 'Product pages'), 'pages');
  assert.equal(keyOfTitle('Overview / When To Use'), 'whenToUse');
  assert.equal(keyOfTitle('What Not To Do'), 'whenNotToUse');
  assert.equal(keyOfTitle('2. Overview'), 'purpose');
  assert.equal(keyOfTitle('Token Notes'), null);
  assert.deepEqual(itemsOf('- one\n- two\n\nA paragraph\nthat goes on.\n1. three'), ['one', 'two', 'A paragraph that goes on.', 'three']);
  assert.equal(short('First sentence. Second one.'), 'First sentence.');
});

test('a DSDS index: its $refs followed, sections sorted by kind, facts and metadata left out, status read', () => {
  const files = new Map(Object.entries(LAYER).filter(([p]) => p.endsWith('.json')));
  const { system, entities } = readDsds(files, 'docs/dsds/system.dsds.json');
  assert.equal(system.name, 'Acme DS');
  assert.equal(system.sections[0].title, 'How to read this');
  assert.equal(entities.length, 8);
  const b = entities.find((e) => e.name === 'Button Main');
  assert.equal(b.layer, 'components');
  assert.equal(b.status, 'Active');
  assert.equal(b.code, 'src/lib/buttons/Main.vue');
  assert.equal(b.purpose[0], 'Use the main button for the next step the person is expected to take.');
  assert.deepEqual(b.whenNotToUse.slice(-2), ['Do not use it for destructive actions; use the danger button.', 'Do not use it for navigation.']);
  assert.deepEqual(b.rules, [{ text: 'Keep the label visible.', level: 'must' }]);
  assert.deepEqual(b.facts, ['Tokens Used']);
  // A section whose body only names itself is a placeholder, never guidance.
  const ph = entityView({ kind: 'component', name: 'X', documentBlocks: [sections([["Do / Don't", "Do / Don't section."], ['Overview', 'Overview section.'], ['Intent', 'A real sentence about sections.']])] }, 'x.json');
  assert.deepEqual([ph.whenNotToUse, ph.purpose], [[], ['A real sentence about sections.']]);
  assert.deepEqual(b.sections.map((s) => s.title), ['Token Notes']);
  assert.equal(entities.find((e) => e.name === 'Saving').layer, 'patterns');
  // No index: every file with an entity.
  assert.equal(readDsds(files, null).entities.length, 8);
});

test('DSDS 0.23: a guidelines section is read by its title, as a section is; Rules and the rest stay rules', () => {
  const g = (title, ...statements) => ({ kind: 'guidelines', title, items: statements.map((s) => ({ statement: s, level: 'should' })) });
  const v = entityView({ kind: 'component', id: 'component-tile-one', name: 'Tile One', description: 'A tile for one subject.', sections: [
    g('When to use', 'Use it to group one subject.'),
    g('When not to use', 'Not for a list of subjects: use the list.', 'Not for navigation.'),
    g('Common mistakes', 'Putting two actions in it.'),
    g('Limitations', 'One image at most.'),
    g('Rules', 'Keep the title visible.'),
    g('For agents', 'Read its contract first.'),
    { kind: 'section', title: 'Specification', freeform: [{ title: 'Token Notes', body: 'Colours come from the tile tokens.' }] },
  ] }, 'tile-one.dsds.json');
  assert.deepEqual(v.whenToUse, ['Use it to group one subject.']);
  assert.deepEqual(v.whenNotToUse, ['Not for a list of subjects: use the list.', 'Not for navigation.']);
  assert.deepEqual(v.mistakes, ['Putting two actions in it.']);
  assert.deepEqual(v.limitations, ['One image at most.']);
  assert.deepEqual(v.rules.map((r) => r.text), ['Keep the title visible.', 'Read its contract first.']);
  assert.deepEqual(v.purpose, ['A tile for one subject.']);
  // Read so, a page that says when to use its component is used, never told to add it.
  const r = useReport({ entities: [v] }, new Map([['tileOne', v]]), { names: ['tileOne'] });
  assert.equal(r.pages[0].verdict, 'used');
  assert.ok(!r.pages[0].todo.some((t) => /when to use/i.test(t) && /^Add/.test(t)), JSON.stringify(r.pages[0].todo));
});

test('a token\'s page is used when it says what the token is for; Improve always says what to add', () => {
  const page = (kind, purpose, extra = {}) => ({ kind, layer: kind === 'token' ? 'foundations' : 'patterns', name: `${kind}-one`, file: `${kind}.dsds.json`, purpose, whenToUse: [], whenNotToUse: [], mistakes: [], limitations: [], rules: [], sections: [], facts: [], repeated: 0, ...extra });
  const r = useReport({ entities: [page('token', ['Background colour of tileOne.']), page('pattern', ['Saving a long form.'])] });
  const [token, pattern] = r.pages;
  assert.deepEqual([token.verdict, token.action, token.todo], ['used', 'keep', []]);
  assert.deepEqual([pattern.verdict, pattern.action], ['thin', 'improve']);
  assert.match(pattern.todo[0], /^Add how to use it: When to use/);
  for (const p of r.pages) if (p.action === 'improve') assert.ok(p.todo.length, `${p.name}: Improve with nothing to do`);
});

test('the filler a generator writes on every page is dropped, and counted per page', () => {
  const files = new Map(Object.entries(LAYER).filter(([p]) => p.endsWith('.json')));
  const { entities } = readDsds(files, 'docs/dsds/system.dsds.json');
  const dropped = dropBoilerplate(entities);
  assert.ok(dropped >= 6 * 4, `dropped ${dropped}`);
  const b = entities.find((e) => e.name === 'Button Main');
  assert.ok(!b.whenToUse.some((x) => /matches the need/.test(x)));
  assert.ok(!b.purpose.some((x) => /part of the library|implemented in/.test(x)));
  assert.equal(b.purpose[0], 'Use the main button for the next step the person is expected to take.');
  assert.ok(b.repeated >= 4);
  assert.deepEqual(entities.find((e) => e.name === 'Toast General').purpose, []);
});

test('pages match components by name, by identifier, then by the code file', () => {
  const files = new Map(Object.entries(LAYER).filter(([p]) => p.endsWith('.json')));
  const { entities } = readDsds(files, 'docs/dsds/system.dsds.json');
  const m = matchComponents(COMPONENTS, entities, CODE_FILES);
  assert.equal(m.get('buttonMain').name, 'Button Main');
  assert.equal(m.get('chipFilter').name, 'Filter Chip');
  assert.equal(m.get('cardPlain').name, 'Card Plain Plain');
  assert.equal(m.has('iconOnly'), false);
  assert.ok(![...m.values()].some((e) => e.name === 'Ghost Widget'));
});

// ── Reading it from GitLab ────────────────────────────────────────────────────────────────────────────────────────
test('read through the API into its snapshot; the token goes to the named host; read again only when the commit moves', async () => {
  const dir = makeFixture({});
  const cfg = { intentLayer: LINK };
  const gl = fakeGitlab();
  const r = await syncIntentLayer(dir, cfg, { env: ENV, fetchImpl: gl.fetchImpl });
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(r.changed, true);
  assert.equal(r.entities, 8);
  const dated = (calls) => calls.filter((c) => /\/repository\/commits\?/.test(c.url)).length;   // one per page file, the first time
  assert.equal(gl.calls.length - dated(gl.calls), 3);
  assert.ok(dated(gl.calls) > 0);
  assert.equal(readIntentLayer(dir, cfg).entities.find((e) => e.name === 'Button Main').updatedAt, '2026-09-15T08:30:00Z', 'when its file last changed');
  assert.ok(gl.calls.every((c) => c.headers['PRIVATE-TOKEN'] === 't0k'));
  const snap = readIntentLayer(dir, cfg);
  assert.equal(snap._source.url, LINK);
  assert.equal(snap._source.ref, 'main');
  assert.equal(snap._source.entry, 'docs/dsds/system.dsds.json');
  assert.match(describeSync(r), /8 pages .* read →/);
  // Same commit: one call, no archive.
  const again = fakeGitlab();
  const r2 = await syncIntentLayer(dir, cfg, { env: ENV, fetchImpl: again.fetchImpl });
  assert.equal(r2.changed, false);
  assert.equal(again.calls.length, 1);   // the project, found once a run, gave its default branch: only the commit is asked
  // An entry given: only its folder is asked for.
  const sub = fakeGitlab({ sha: 'fff1234def5678' });
  await syncIntentLayer(dir, { intentLayer: { gitlab: LINK, entry: 'docs/dsds/system.dsds.json' } }, { env: ENV, fetchImpl: sub.fetchImpl });
  assert.match(sub.calls.find((c) => /archive\.tar\.gz/.test(c.url)).url, /path=docs%2Fdsds/);
});

test('the component contracts kept beside the layer come with it: the link to each on GitLab and what it lists', async () => {
  const dir = makeFixture({});
  const contract = { schemaVersion: 1, id: 'buttonMain', name: 'buttonMain', version: '1.0.0', anatomy: { root: {} }, source: { code: { file: 'src/ui/ButtonMain.vue' } },
    props: [{ name: 'size', bindings: { figma: { kind: 'VARIANT', property: 'size' }, code: { prop: 'size', as: 'prop', source: 'name' } } }], events: [{ name: 'clicked' }] };
  const gl = fakeGitlab({ files: { ...LAYER, 'specs/contracts/components/button-main.contract.json': contract } });
  await syncIntentLayer(dir, { intentLayer: LINK }, { env: ENV, fetchImpl: gl.fetchImpl });
  const [k] = readIntentLayer(dir, { intentLayer: LINK }).contracts;
  assert.deepEqual([k.name, k.format, k.codeFile, k.props, k.events], ['buttonMain', 1, 'src/ui/ButtonMain.vue', ['size'], ['clicked']]);
  assert.equal(k.url, `${LINK}/-/blob/main/specs/contracts/components/button-main.contract.json`);
});

test('each page says when its file last changed; a new commit dates only the files it changed, with one compare', async () => {
  const dir = makeFixture({});
  const cfg = { intentLayer: LINK };
  await syncIntentLayer(dir, cfg, { env: ENV, fetchImpl: fakeGitlab().fetchImpl });
  const next = fakeGitlab({ sha: 'fff9999aaa0000' });
  await syncIntentLayer(dir, cfg, { env: ENV, fetchImpl: next.fetchImpl });
  assert.ok(next.calls.some((c) => /\/repository\/compare\?from=abc1234def5678&to=fff9999aaa0000/.test(c.url)));
  assert.equal(next.calls.filter((c) => /\/repository\/commits\?/.test(c.url)).length, 0, 'the files already dated are not asked again');
  const pages = readIntentLayer(dir, cfg).entities;
  assert.equal(pages.find((e) => e.name === 'Button Main').updatedAt, '2026-10-01T10:00:00Z', 'changed in the new commit: its date');
  assert.equal(pages.find((e) => e.name === 'Filter Chip').updatedAt, '2026-09-15T08:30:00Z', 'unchanged: its date kept');
});

test('read-only: only GETs, only the project, its latest commit and one archive; nothing written there', async () => {
  const gl = fakeGitlab();
  const dir = makeFixture({});
  await syncIntentLayer(dir, { intentLayer: LINK }, { env: ENV, fetchImpl: gl.fetchImpl });
  await syncIntentLayer(dir, { intentLayer: LINK }, { env: ENV, fetchImpl: gl.fetchImpl });
  assert.ok(gl.calls.every((c) => c.method === 'GET'), JSON.stringify(gl.calls.map((c) => c.method)));
  const base = 'https://git.acme.test/api/v4/projects/design%2Fintent';
  for (const c of gl.calls) assert.ok(c.url === base || c.url.startsWith(`${base}/repository/commits/`) || c.url.startsWith(`${base}/repository/commits?`) || c.url.startsWith(`${base}/repository/compare?`) || c.url.startsWith(`${base}/repository/archive.tar.gz?`), c.url);
});

test('a snapshot written by an older reader is read again, even when the commit has not moved', async () => {
  const dir = makeFixture({});
  await syncIntentLayer(dir, { intentLayer: LINK }, { env: ENV, fetchImpl: fakeGitlab().fetchImpl });
  const file = join(dir, 'intent-layer.snapshot.json');
  const snap = JSON.parse(readFileSync(file, 'utf8'));
  writeFileSync(file, JSON.stringify({ ...snap, _reader: 1 }));
  const again = fakeGitlab();
  const r = await syncIntentLayer(dir, { intentLayer: LINK }, { env: ENV, fetchImpl: again.fetchImpl });
  assert.equal(r.changed, true);
  assert.ok(again.calls.some((c) => /archive\.tar\.gz/.test(c.url)), 'the archive is read again');
  assert.ok(JSON.parse(readFileSync(file, 'utf8'))._reader > 1);
});

test('the token is never sent to a host not named in GITLAB_HOST', async () => {
  const gl = fakeGitlab();
  await syncIntentLayer(makeFixture({}), { intentLayer: LINK }, { env: { GITLAB_TOKEN: 't0k' }, fetchImpl: gl.fetchImpl });
  assert.ok(gl.calls.every((c) => !c.headers['PRIVATE-TOKEN']));
});

test('the token and the host come from the project\'s .env', async () => {
  const dir = makeFixture({ '.env': 'GITLAB_TOKEN="from-env-file"\nGITLAB_HOST=git.acme.test\n' });
  const gl = fakeGitlab();
  const r = await syncIntentLayer(dir, { intentLayer: LINK }, { env: {}, fetchImpl: gl.fetchImpl });
  assert.equal(r.ok, true);
  assert.equal(gl.calls[0].headers['PRIVATE-TOKEN'], 'from-env-file');
});

test('a project that is a GitLab mirror finds the token in the folder that holds it', async () => {
  const outer = makeFixture({ '.env': 'GITLAB_TOKEN=outer-token\nGITLAB_HOST=git.acme.test\n', 'acme-ds/.gitlab-source.json': { origin: 'https://git.acme.test', host: 'git.acme.test', path: 'design/ds' } });
  const gl = fakeGitlab();
  const r = await syncIntentLayer(join(outer, 'acme-ds'), { intentLayer: LINK }, { env: {}, fetchImpl: gl.fetchImpl });
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(gl.calls[0].headers['PRIVATE-TOKEN'], 'outer-token');
});

test('GitLab refusing keeps the snapshot already there and says why; never throws', async () => {
  const dir = makeFixture({});
  await syncIntentLayer(dir, { intentLayer: LINK }, { env: ENV, fetchImpl: fakeGitlab().fetchImpl });
  const r = await syncIntentLayer(dir, { intentLayer: LINK }, { env: ENV, fetchImpl: fakeGitlab({ status: 401 }).fetchImpl });
  assert.equal(r.stale, true);
  assert.match(r.error, /401/);
  assert.match(describeSync(r), /using the copy of/);
  assert.ok(readIntentLayer(dir, { intentLayer: LINK }));
  const none = await syncIntentLayer(makeFixture({}), { intentLayer: LINK }, { env: ENV, fetchImpl: fakeGitlab({ files: { 'README.md': '# none' } }).fetchImpl });
  assert.match(none.error, /no DSDS entities/);
  assert.equal(await syncIntentLayer(makeFixture({}), {}, {}), null);
});

// ── Where it is used ──────────────────────────────────────────────────────────────────────────────────────────────
async function project() {
  const dir = makeFixture({
    'theme.css': ':root{}\n',
    'struct.json': { components: Object.fromEntries(COMPONENTS.map((n) => [n, { h: 24 }])) },
    'props.json': { buttonMain: { description: 'The main action.', annotations: [], props: [] } },
  });
  const cfg = { paths: { themeCSS: 'theme.css', snapshotStructure: 'struct.json', compPropsSnapshot: 'props.json' }, componentFiles: CODE_FILES, intentLayer: LINK };
  await syncIntentLayer(dir, cfg, { env: ENV, fetchImpl: fakeGitlab().fetchImpl });
  return { dir, cfg };
}

test('the design intent carries each component\'s page with its link, each layer its pages, and what matched nothing', async () => {
  const { dir, cfg } = await project();
  const r = await generateIntent(dir, cfg, {});
  assert.equal(r.withIntentLayer, 5);
  assert.equal(r.intentLayerPages, 8);
  const it = JSON.parse(readFileSync(r.out, 'utf8'));
  const b = it.components.buttonMain.intentLayer;
  assert.equal(b.purpose, 'Use the main button for the next step the person is expected to take.');
  assert.equal(b.url, `${LINK}/-/blob/main/docs/dsds/components/button-main.dsds.json`);
  assert.deepEqual(b.rules, ['Keep the label visible. (must)']);
  assert.equal(it.patterns.intentLayer[0].name, 'Saving');
  assert.equal(it.templates.intentLayer[0].name, 'Checkout');
  assert.deepEqual(it.intentLayer.noComponent.map((x) => x.name), ['Ghost Widget']);
  // iconOnly is only in Figma here (the code has no file for it): no page to write until it is built.
  assert.deepEqual(it.intentLayer.noPage, []);
  assert.equal(it.components.iconOnly.intentLayer, undefined);
});

test('the usage report: what reaches the agents and where, what does not and why, a verdict per page', async () => {
  const { dir, cfg } = await project();
  const snap = readIntentLayer(dir, cfg);
  const rep = useReport(snap, matchComponents(COMPONENTS, snap.entities, CODE_FILES));
  const page = (n) => rep.pages.find((p) => p.name === n);
  assert.equal(page('Button Main').verdict, 'used');
  assert.equal(page('Button Main').component, 'buttonMain');
  assert.ok(page('Button Main').gets.find((g) => g.what === 'when not to use').to.includes('llms.txt (the first line)'));
  assert.ok(page('Button Main').notUsed.some((n) => /Tokens Used/.test(n.what) && n.reason === 'facts' && /Figma and the code/.test(n.why) && /^Yes/.test(n.remove)));
  // Notes on its tokens are for people (the contracts carry the tokens): never asked to be retitled.
  assert.ok(!page('Button Main').notUsed.some((n) => /Token Notes/.test(n.what)));
  assert.ok(page('Button Main').notUsed.some((n) => n.reason === 'repeated' && /every page of its kind/.test(n.why) && n.fix && n.remove));
  assert.equal(page('Filter Chip').verdict, 'thin');                // when not to use, but not what it is for
  assert.equal(page('Toast General').verdict, 'not used');          // only filler
  assert.equal(page('Ghost Widget').verdict, 'not used');
  assert.match(page('Ghost Widget').notUsed[0].why, /matches no component/);
  assert.match(page('Ghost Widget').notUsed[0].fix, /as its component is named in Figma/);
  assert.equal(page('Ghost Widget').notUsed.length, 1);              // nothing else matters until it is named
  assert.equal(page('Saving').verdict, 'used');                     // a pattern: what it is for and its rules
  assert.ok(page('Saving').gets.some((g) => /other sections/.test(g.what) && g.to[0].startsWith('the prototype context')));
  assert.equal(page('Checkout').verdict, 'not used');               // only a fact section
  assert.equal(page('Card Plain Plain').verdict, 'thin');           // what it is for, but not when
  assert.deepEqual(rep.counts, { used: 2, thin: 2, notUsed: 4 });
});

test('a component\'s documentation merges the intent layer with Figma, the code and the contract, each under its source', () => {
  const il = { file: 'docs/dsds/components/button-main.dsds.json', url: `${LINK}/-/blob/main/x`, whenNotToUse: ['Not for navigation.'], whenToUse: ['For the next step.'] };
  const g = guidanceView({ description: 'Main.\nWhen not to use: for a destructive action', note: 'Avoid: two in a row', intentLayer: il, authored: { whenToUse: 'In forms.' } });
  const not = g.sections.find((s) => s.key === 'whenNotToUse');
  assert.equal(not.from, 'Figma');
  assert.deepEqual(not.also, [{ from: 'the code', text: ['two in a row'] }, { from: 'the intent layer (docs/dsds/components/button-main.dsds.json)', text: ['Not for navigation.'], url: `${LINK}/-/blob/main/x` }]);
  const use = g.sections.find((s) => s.key === 'whenToUse');
  assert.equal(use.from, 'the intent layer (docs/dsds/components/button-main.dsds.json)');
  assert.equal(use.url, `${LINK}/-/blob/main/x`);
  assert.deepEqual(use.also, [{ from: 'contract.authored.json', text: ['In forms.'] }]);
  assert.deepEqual(g.missing, ['mistakes', 'limitations']);
});

test('llms.txt: what it is for when Figma says nothing, its first "when not to use", and the other pages', () => {
  const built = [
    { name: 'buttonMain', contract: { description: '', props: [], intent: { source: LINK, purpose: 'For the next step. More.', whenNotToUse: ['Not for navigation.', 'Not twice.'] } } },
    { name: 'chipFilter', contract: { description: 'A filter.', props: [], whenNotToUse: 'Authored: not for one choice.', intent: { source: LINK, whenNotToUse: ['Not for one choice.'] } } },
  ];
  const out = buildLlms(built, {}, 0, null, { intentLayer: { source: LINK, pages: [{ name: 'Saving', kind: 'pattern', purpose: 'Save a long form as a draft.' }] } });
  assert.match(out, /- for: For the next step\./);
  assert.match(out, /- avoid: Not for navigation\./);
  assert.doesNotMatch(out, /Not twice/);
  assert.match(out, /- avoid: Authored: not for one choice\./);          // the authored guidance comes first
  assert.doesNotMatch(out, /- avoid: Not for one choice/);
  assert.match(out, /## Patterns, templates and pages[\s\S]*- Saving \(pattern\): Save a long form as a draft\./);
});

test('the prototype context: a component\'s page fills what it is for, the other pages become rules', async () => {
  const { dir, cfg } = await project();
  const { intent } = await generateIntent(dir, cfg, { write: false });
  const ctx = contextFrom({ components: { chipFilter: { props: {} }, cardPlain: { props: {} } } }, intent, []);
  // Its own block, apart from Figma's and the code's words; with nothing from Figma or the code, it says what it is for.
  assert.equal(ctx.components.cardPlain.purpose, 'A surface that groups one subject.');
  assert.equal(ctx.components.cardPlain.intentLayer.purpose, 'A surface that groups one subject.');
  assert.deepEqual(ctx.components.chipFilter.intentLayer.whenNotToUse, ['Not for a single choice: use a radio group.']);
  assert.ok(ctx.components.chipFilter.never.some((n) => n.sentence === 'Intent layer: Not for a single choice: use a radio group.'));
  const lines = purposeLines(ctx, ['cardPlain', 'chipFilter']).join('\n');
  assert.match(lines, /cardPlain\s+A surface that groups one subject\./);
  assert.doesNotMatch(lines, /intent A surface/, 'said once');
  assert.match(lines, /intent: not for Not for a single choice/);
  const saving = ctx.rules.filter((r) => /^Saving/.test(r.title));
  assert.ok(saving.some((r) => /Save a long form as a draft\.[\s\S]*Not when: Not for the final submit\./.test(r.text)));
  assert.ok(saving.some((r) => /Core Rules/.test(r.title) && r.file === `${LINK}/-/blob/main/docs/dsds/patterns/saving.dsds.json`));
  assert.ok(existsSync(join(dir, 'intent-layer.snapshot.json')));
});

test('componentIntent lists only what the page says', () => {
  const v = entityView({ kind: 'component', name: 'X', documentBlocks: [sections([['Intent', 'For x.']])] }, 'a/x.json');
  assert.deepEqual(componentIntent(v, { url: LINK, ref: 'main' }), { name: 'X', kind: 'component', file: 'a/x.json', url: `${LINK}/-/blob/main/a/x.json`, status: null, source: 'the intent layer', purpose: 'For x.', whenToUse: null, whenNotToUse: null, mistakes: null, limitations: null, rules: null, sections: null, facts: null, repeated: 0 });
});

test('Figma\'s and the code\'s notes no agent is given: each with why, what to do and whether to remove it', () => {
  const i = { design: { description: 'A chip.', annotations: [
    'Filter pattern here: https://www.figma.com/design/AbC/Acme?node-id=1-2',
    { label: 'A chip.', layer: 'Label' },
    'Height 32px, padding 8px 12px, node 12:34',
    'Never use it for navigation.', 'Keep the label short.', 'Group chips in a row.'] }, code: { note: 'Never use it for navigation.', cssComment: 'Wraps on small screens.' } };
  const { notes, left } = notesOf(i, 'A chip.');
  assert.deepEqual(notes, ['Never use it for navigation.', 'Keep the label short.', 'Group chips in a row.', 'Wraps on small screens.']);
  const by = Object.fromEntries(left.map((l) => [l.reason, l]));
  assert.equal(by.linkOnly.from, 'Figma annotation');
  assert.match(by.linkOnly.fix, /in words/);
  assert.equal(by.repeatsDescription.from, 'Figma annotation on its "Label" layer');
  assert.match(by.repeatsDescription.remove, /^Yes/);
  assert.equal(by.buildOnly.who, 'figma');
  assert.equal(by.repeatsNote.from, 'the code (its note in the structure contract)');
  assert.equal(by.notShown.text, 'Wraps on small screens.');
  assert.equal(by.notShown.who, 'code');
  assert.equal(NOTES_SHOWN, 3);
  for (const l of left) assert.ok(l.why && l.fix && l.remove, l.reason);
});

test('the guidance rating reads a component\'s intent-layer page, so documenting it there counts as much as in Figma', async () => {
  const { dir, cfg } = await project();
  const snap = readIntentLayer(dir, cfg);
  const words = intentWords(snap, COMPONENTS, CODE_FILES);
  assert.match(words.buttonMain, /^Use the main button for the next step[\s\S]*When to use: At most one main button[\s\S]*When not to use: Do not use it for navigation\./);
  assert.equal(words.iconOnly, undefined);
  const facts = { components: Object.fromEntries(COMPONENTS.map((n) => [n, { props: [] }])), tokens: [] };
  const rated = rateGuidance(sectionsFrom({ sections: [], general: '' }, facts, words), facts).components.find((r) => r.name === 'buttonMain');
  assert.equal(rated.pieces.whenToUse, true);
  assert.equal(rated.pieces.whenNotToUse, true);
  // What was left out of its page travels with it, for the style guide to show.
  const it = componentIntent(matchComponents(COMPONENTS, snap.entities, CODE_FILES).get('buttonMain'), snap._source);
  assert.deepEqual(it.facts, ['Tokens Used']);
  assert.ok(it.repeated > 0);
});

// ── Another documentation source plugs in as an adapter ──────────────────────────────────────────────────────────
test('a second documentation source is one adapter: its pages reach the design intent, the report and the style guide under its own name', async () => {
  const { dir, cfg } = await project();
  const page = (name, extra = {}) => ({ kind: 'component', layer: 'components', name, id: null, status: null, file: `specs/${name}`, url: `https://specs.acme.test/${encodeURIComponent(name)}`, code: null, summary: null,
    purpose: [], whenToUse: [], whenNotToUse: [], mistakes: [], limitations: [], rules: [], sections: [], facts: [], repeated: 0, ...extra });
  const remove = addSource({
    id: 'acme-specs', label: 'Acme specs', configKey: 'acmeSpecs',
    configured: (c) => !!c.acmeSpecs,
    read: () => ({ _source: { url: 'https://specs.acme.test' }, entities: [
      page('Icon Only', { purpose: ['A button with only an icon.'], whenNotToUse: ['Not without a label for screen readers.'] }),
      page('Button Main', { purpose: ['From the specs, second to the intent layer.'] }),
    ] }),
    sync: async () => ({ ok: true, changed: false }),
    describe: () => 'Acme specs: up to date',
  });
  try {
    const both = { ...cfg, acmeSpecs: true };
    assert.deepEqual(configuredSources(both).map((s) => s.id), ['dsds-gitlab', 'acme-specs']);
    assert.deepEqual((await syncSources(dir, both, { offline: true })).map((x) => x.line.slice(0, 12)), ['⚠️  Intent l', 'Acme specs: ']);
    const snap = readIntentLayer(dir, both);
    assert.equal(snap._sources.length, 2);
    const m = matchComponents(COMPONENTS, snap.entities, CODE_FILES);
    assert.equal(m.get('iconOnly').source.label, 'Acme specs');                 // a component only the new source documents
    assert.equal(m.get('buttonMain').source.label, 'the intent layer');         // the first source wins where both do
    const it = componentIntent(m.get('iconOnly'), snap._source);
    assert.equal(it.source, 'Acme specs');
    assert.equal(it.url, 'https://specs.acme.test/Icon%20Only');
    const g = guidanceView({ intentLayer: it });
    assert.equal(g.sections.find((s) => s.key === 'whenNotToUse').from, 'Acme specs (specs/Icon Only)');
    const { intent } = await generateIntent(dir, both, { write: false });
    assert.equal(intent.components.iconOnly.intentLayer.purpose, 'A button with only an icon.');
    assert.deepEqual(intent.intentLayer.noPage, []);
    const rep = useReport(snap, m);
    assert.equal(rep.pages.find((p) => p.name === 'Icon Only').source, 'Acme specs');
    assert.equal(rep.pages.find((p) => p.name === 'Icon Only').verdict, 'used');
  } finally { remove(); }
  assert.deepEqual(configuredSources({ ...cfg, acmeSpecs: true }).map((s) => s.id), ['dsds-gitlab']);
});

// ── A system read from its code alone ────────────────────────────────────────────────────────────────────────────
test('no Figma file: the components are the code\'s, and the intent layer still reaches the design intent, the contracts, llms.txt and the catalog', async () => {
  const dir = makeFixture({
    'src/components/buttons/Main.vue': '<template>\n  <button class="acme-main-button" :disabled="disabled">{{ label }}</button>\n</template>\n<script>\nexport default { props: { label: { type: String, default: \'\' }, disabled: { type: Boolean, default: false } } };\n</script>\n',
    'src/components/chips/Filter.vue': '<template><span class="acme-filter-chip"><slot /></span></template>\n',
    'src/styles/theme.css': ':root { --acme-space-m: 12px; }\n',
  });
  const cfg = { figmaFileKey: '', paths: { themeCSS: 'src/styles/theme.css' }, intentLayer: LINK };
  await syncIntentLayer(dir, cfg, { env: ENV, fetchImpl: fakeGitlab({ files: {
    ...LAYER,
    'docs/dsds/components/button-main.dsds.json': comp('button-main', 'Main', 'src/lib/x.vue', [sections([['Intent', 'The next step.'], ['When Not To Use', 'Not for navigation.']])]),
  } }).fetchImpl });
  const r = await generateIntent(dir, cfg, {});
  assert.deepEqual(Object.keys(r.intent.components).sort(), ['Filter', 'Main']);
  assert.equal(r.intent.components.Main.class, '.acme-main-button');
  assert.equal(r.intent.components.Main.intentLayer.purpose, 'The next step.');
  assert.match(r.intent._sources.components, /the code \(no Figma data\)/);
  const { generateContracts } = await import('../contract-gen.mjs');
  const c = await generateContracts(dir, cfg, {});
  assert.deepEqual(c.components.sort(), ['Filter', 'Main']);
  assert.deepEqual(c.invalid, []);
  const main = JSON.parse(readFileSync(join(dir, 'contracts', 'Main.contract.json'), 'utf8'));
  assert.equal(main.description, '');                                            // never a placeholder that says Figma
  assert.equal(main.intent.purpose, 'The next step.');
  const cat = JSON.parse(readFileSync(join(dir, 'contracts', 'catalog.json'), 'utf8')).components.Main;
  assert.equal(cat.selector, '.acme-main-button');
  assert.deepEqual(Object.keys(cat.props), ['label', 'disabled']);
  assert.equal(cat.props.disabled.type, 'boolean');
  const llms = readFileSync(join(dir, 'contracts', 'llms.txt'), 'utf8');
  assert.match(llms, /from the code alone \(no Figma file\)/);
  assert.match(llms, /\[Main\]\(\.\/Main\.contract\.json\): · props: label, disabled\n {4}- for: The next step\.\n {4}- avoid: Not for navigation\./);
});

// ── Setup takes the documentation link ───────────────────────────────────────────────────────────────────────────
test('setup with a documentation link: a GitLab project is the intent layer, a wiki page a guidelines page; the link is kept even when it cannot be read yet', () => {
  const run = (link) => {
    const dir = makeFixture({ 'ds-config.json': { name: 'acme', figmaFileKey: '', paths: { themeCSS: 'theme.css' } }, 'theme.css': ':root{}\n' });
    const out = spawnSync(process.execPath, [join(ENGINE, 'audit.mjs'), '--init', `--documentation=${link}`], { cwd: dir, encoding: 'utf8', env: { ...process.env, GITLAB_FETCH_TIMEOUT_MS: '1000', DESIGN_SYSTEM_ENGINE_NO_AUTO_UPDATE: '1', GITLAB_TOKEN: '' } });
    return { out: out.stdout + out.stderr, cfg: JSON.parse(readFileSync(join(dir, 'ds-config.json'), 'utf8')) };
  };
  const a = run('https://git.acme.test/design/intent');
  assert.match(a.out, /Documentation for agents: the intent layer/);
  assert.equal(a.cfg.intentLayer, 'https://git.acme.test/design/intent');
  const b = run('https://git.acme.test/design/ds/-/wikis/Buttons');
  assert.match(b.out, /Documentation for agents: a guidelines page/);
  assert.deepEqual(b.cfg.guidelines.source.gitlab, ['https://git.acme.test/design/ds/-/wikis/Buttons']);
  assert.equal(b.cfg.intentLayer, undefined);
});

// ── One decision per page ────────────────────────────────────────────────────────────────────────────────────────
test('each page gets one decision, said as an instruction, with why: delete, move then delete, rename, name as in Figma, improve, keep', () => {
  const v = (name, file, code, extra = {}) => ({ kind: 'component', layer: 'components', name, id: null, status: null, file, url: null, code, summary: null,
    purpose: [], whenToUse: [], whenNotToUse: [], mistakes: [], limitations: [], rules: [], sections: [], facts: [], repeated: 0, ...extra });
  const shared = { purpose: ['Show short supporting points.'], whenToUse: ['Keep items parallel.'], sections: [{ title: 'Decision Rules', text: 'Points, steps, clauses.' }] };
  const entities = [
    v('Point List', 'lists/point-list.json', 'src/lib/lists/PointList.vue', { ...shared, whenNotToUse: ['Not for actions.'] }),
    v('Point List Item', 'lists/point-list-item.json', 'src/lib/lists/PointListItem.vue', { ...shared, sections: [...shared.sections, { title: 'Spacing', text: 'Items sit 8 apart.' }] }),
    v('Point List Row', 'lists/point-list-row.json', 'src/lib/lists/PointListRow.vue', shared),
    v('Calendar General', 'calendar/general.json', 'src/lib/calendar/General.vue', { purpose: ['Pick a date.'], whenToUse: ['One date.'] }),
    v('Old Widget', 'old/widget.json', 'src/lib/old/Widget.vue', { purpose: ['Gone.'] }),
    v('Empty Thing', 'x/empty.json', null, { repeated: 4, facts: ['API'] }),
    v('Mystery Panel', 'x/mystery.json', null, { purpose: ['A panel nobody named.'] }),
    v('Tag', 'tag.json', 'src/lib/tag/Tag.vue', { purpose: ['Label a thing.'] }),
    v('Chip', 'chip.json', 'src/lib/chip/Chip.vue', { purpose: ['Filter a list.'], whenNotToUse: ['Not for one choice.'], repeated: 2 }),
    v('Banner', 'banner.json', 'src/lib/banner/Banner.vue', { purpose: ['Say something to the whole page.'], whenToUse: ['A message for every section.'] }),
  ];
  const names = ['pointList', 'calendar', 'tag', 'chip', 'banner'];
  const matched = matchComponents(names, entities, {});
  const rep = useReport({ _source: {}, entities }, matched, { names, codeExists: (f) => !/old\/Widget/.test(f) });
  const at = (n) => rep.pages.find((p) => p.name === n);
  assert.equal(at('Banner').action, 'keep');
  assert.deepEqual(at('Banner').todo, []);
  assert.equal(at('Point List').action, 'improve');                  // a section under a title no agent reads
  assert.match(at('Point List').todo[0], /^Retitle Decision Rules as When to use, When not to use/);
  assert.deepEqual([at('Point List Item').action, at('Point List Item').notUsed[0].reason], ['move', 'part']);
  assert.match(at('Point List Item').todo[0], /^Move what is true of this part and not yet on Point List \(lists\/point-list\.json\) there.*then delete this page\.$/);
  assert.match(at('Point List Item').notUsed[0].why, /PointListItem\.vue is a part of pointList/);
  assert.deepEqual([at('Point List Row').action, at('Point List Row').decision, at('Point List Row').todo], ['delete', 'Delete', ['Delete this page.']]);   // its parent's page says it all
  assert.deepEqual([at('Calendar General').action, at('Calendar General').todo[0]], ['rename', 'Rename this page to calendar, the component\'s name in Figma.']);
  assert.deepEqual([at('Old Widget').action, at('Old Widget').notUsed[0].reason], ['delete', 'codeGone']);
  assert.deepEqual([at('Empty Thing').action, at('Empty Thing').notUsed[0].reason], ['delete', 'emptyPage']);
  assert.deepEqual([at('Mystery Panel').action, at('Mystery Panel').notUsed[0].reason], ['name', 'noComponent']);
  assert.deepEqual([at('Tag').action, at('Tag').todo], ['improve', ['Add when to use it and when not to, as sections with those titles.']]);
  assert.deepEqual([at('Chip').action, at('Chip').todo], ['improve', ['Remove the 2 lines written on every page alike, in whatever writes them.']]);
  assert.equal(rep.actions.delete, 3);
  for (const p of rep.pages) assert.ok(p.decision && Array.isArray(p.todo), p.name);
});

test('the components a page is judged against come from the sources, never from a saved design intent that may be missing', () => {
  const figma = makeFixture({ 'struct.json': { components: { panel: { h: 1 }, _meta: {}, chip: { h: 1 } } } });
  assert.deepEqual(systemNames(figma, { paths: { snapshotStructure: 'struct.json' } }), ['panel', 'chip']);
  const code = makeFixture({ 'src/components/panels/Main.vue': '<template><div class="acme-panel"></div></template>\n' });
  assert.deepEqual(systemNames(code, {}), ['Main']);
  // "Panel General" is panel when panel has no page: Rename, wherever the report is built.
  const page = { kind: 'component', layer: 'components', name: 'Panel General', id: null, status: null, file: 'panel/general.json', url: null, code: 'src/lib/panel/General.vue', summary: null,
    purpose: ['Group one subject.'], whenToUse: [], whenNotToUse: [], mistakes: [], limitations: [], rules: [], sections: [], facts: [], repeated: 0 };
  const names = systemNames(figma, { paths: { snapshotStructure: 'struct.json' } });
  const rep = useReport({ _source: {}, entities: [page] }, matchComponents(names, [page], {}), { names });
  assert.deepEqual([rep.pages[0].action, rep.pages[0].todo[0]], ['rename', 'Rename this page to panel, the component\'s name in Figma.']);
});

test('a rename never goes to a part of a component: its page moves to the parent\'s page, or is deleted', () => {
  const pg = (name, file) => ({ kind: 'component', layer: 'components', name, id: null, status: null, file, url: null, code: null, summary: null,
    purpose: [`${name} says something.`], whenToUse: [], whenNotToUse: [], mistakes: [], limitations: [], rules: [], sections: [], facts: [], repeated: 0 });
  const names = ['grid', 'grid/Header', 'list/Row'];
  const ents = [pg('Grid General', 'grid/general.json'), pg('Grid Header Base', 'grid/header-base.json'), pg('List Row Base', 'list/row-base.json')];
  const rep = useReport({ _source: {}, entities: ents }, matchComponents(names, ents, {}), { names });
  const at = (n) => rep.pages.find((p) => p.name === n);
  assert.equal(at('Grid General').action, 'rename');                                          // grid: a component of its own
  assert.deepEqual([at('Grid Header Base').action, at('Grid Header Base').notUsed[0].reason], ['move', 'subPart']);
  assert.match(at('Grid Header Base').todo[0], /^Move what is true of grid\/Header and not yet on Grid General \(grid\/general\.json\) there/);
  assert.deepEqual([at('List Row Base').action, at('List Row Base').notUsed[0].reason], ['delete', 'subPartAlone']);   // list has no page at all
});

test('the advice names the component as the system does: Figma\'s name, or the code\'s with no Figma file', () => {
  const pg = { kind: 'component', layer: 'components', name: 'Panel General', id: null, status: null, file: 'p.json', url: null, code: null, summary: null,
    purpose: ['Group one subject.'], whenToUse: [], whenNotToUse: [], mistakes: [], limitations: [], rules: [], sections: [], facts: [], repeated: 0 };
  const names = ['Panel'];
  const code = useReport({ _source: {}, entities: [pg] }, matchComponents(names, [pg], {}), { names, from: 'the code' });
  assert.equal(code.pages[0].todo[0], 'Rename this page to Panel, the component\'s name in the code.');
  const odd = { ...pg, name: 'Mystery Thing' };
  assert.match(useReport({ _source: {}, entities: [odd] }, new Map(), { names, from: 'the code' }).pages[0].todo[0], /named in the code \(its file's name/);
  assert.match(useReport({ _source: {}, entities: [odd] }, new Map(), { names, from: 'Figma' }).pages[0].todo[0], /named in Figma/);
  assert.equal(namesFrom(makeFixture({}), {}), 'the code');
  assert.equal(namesFrom(makeFixture({ 'figma-structure.snapshot.json': { components: { panel: {} } } }), {}), 'Figma');
});

test('a component page\'s Accessibility, "… Rule" and other prose sections are its rules; examples, mappings and token notes are for people, never retitled', () => {
  const v = entityView({ kind: 'component', id: 'component-tile-one', name: 'Tile One', sections: [
    { kind: 'section', title: 'Specification', freeform: [
      { title: 'Accessibility', body: '- Give it a name a screen reader says.' },
      { title: 'List Request Rule', body: '- Ask for one subject at a time.' },
      { title: 'Design Request Examples', body: '- A tile on the home screen.' },
      { title: 'Vue Implementation Mapping', body: 'TileOne.vue renders it.' },
      { title: 'Grid Overflow', body: 'In a grid, the tiles wrap to the next row.' },
      { title: 'Tile in a grid', body: '```vue\n<TileOne title="A" />\n```' },
    ] },
    { kind: 'guidelines', title: 'When to use', items: [{ level: 'should', statement: 'Use it for one subject.' }] },
  ], description: 'A tile for one subject.' }, 'tile-one.dsds.json', 'components');
  assert.deepEqual(v.rules.map((r) => r.text), ['Give it a name a screen reader says.', 'Ask for one subject at a time.', 'Grid Overflow: In a grid, the tiles wrap to the next row.']);
  assert.deepEqual(v.sections.map((x) => x.title), ['Design Request Examples', 'Vue Implementation Mapping', 'Tile in a grid']);
  const r = useReport({ entities: [v] }, new Map([['tileOne', v]]), { names: ['tileOne'] });
  assert.equal(r.pages[0].action, 'keep');
  assert.ok(!r.pages[0].notUsed.some((n) => n.reason === 'unknownTitle'));
});

test('a page is to be written only for a component the code has; one only in Figma waits until it is built', async () => {
  const { pagesToWrite } = await import('../intent-layer.mjs');
  const documented = (n) => n === 'tileOne';
  assert.deepEqual(pagesToWrite(['tileOne', 'tileTwo', 'figmaOnly'], documented, { tileOne: 'src/TileOne.vue', tileTwo: 'src/TileTwo.vue' }), ['tileTwo']);
  assert.deepEqual(pagesToWrite(['tileOne', 'tileTwo'], documented, {}), ['tileTwo'], 'no code read: every one');
});

test('what the agents read from a page, word for word by kind, leaves out the lines found wrong and the drafts', async () => {
  const { agentText } = await import('../intent-layer.mjs');
  const e = { kind: 'component', layer: 'components', name: 'Tile One', file: 'tile.dsds.json', purpose: ['A tile for one subject.', 'More words.'], whenToUse: ['Use it for one subject.', 'Set `glowMode` on it.'], whenNotToUse: [], mistakes: [], limitations: [], rules: [{ text: 'Keep its title short.', level: 'should' }], sections: [{ title: 'Examples', text: 'A tile.' }], drafts: [{ where: 'When to use', text: 'Use it on a dashboard.' }] };
  assert.deepEqual(agentText(e, {}, [{ kind: 'name', line: 'Set `glowMode` on it.' }]), { purpose: ['A tile for one subject.'], whenToUse: ['Use it for one subject.'], rules: ['Keep its title short. (should)'] });
  assert.deepEqual(agentText({ ...e, layer: 'patterns', whenToUse: [] }).sections, ['Examples: A tile.']);
});

test('a page the layer\'s generator wrote: a titled line keeps its title once, and a draft in a prose section stays a draft', async () => {
  const { entityView } = await import('../doc-source-dsds.mjs');
  const page = { kind: 'component', name: 'Chip One', sections: [
    { kind: 'section', for: 'all', title: 'Limitations', freeform: [{ title: 'Limitations', body: '- **Draft:** It takes one choice only.' }] },
    { kind: 'section', for: 'all', title: 'Specification', freeform: [
      { title: 'Role', body: '- Role: button' },
      { title: "Do and don't", body: "- **Draft:** Do: keep its label short.\n- Don't: put two choices in one." },
    ] },
  ] };
  const v = entityView(page, 'specs/dsds/components/chips/one.dsds.json', 'components');
  const rules = v.rules.map((r) => r.text);
  assert.ok(rules.includes('Role: button'), rules.join(' | '));
  assert.ok(rules.includes("Do and don't: Don't: put two choices in one."));
  assert.ok(!rules.some((r) => /draft/i.test(r)), 'no draft read as a rule');
  assert.deepEqual(v.drafts.map((d) => `${d.where}: ${d.text}`).sort(), ["Do and don't: Do: keep its label short.", 'Limitations: It takes one choice only.']);
});
