// intent-sources.test.mjs - the intent layer read wherever it lives and however it is written: a GitHub repository
// and a folder of the project as well as a GitLab project (doc-host.mjs), and Markdown or MDX pages as well as DSDS
// (doc-source-markdown.mjs). An invented system (Northwind); GitHub through an injected fetch.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, utimesSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { makeFixture } from './helpers.mjs';
import { intentLayerConfig, syncIntentLayer, describeSync, readIntentLayer, matchComponents, componentIntent, itemsOf } from '../intent-layer.mjs';
import { frontMatter, plainText, mdSections, readMarkdown, metaTitle } from '../doc-source-markdown.mjs';
import { parseGithub, hostOf, fileUrl } from '../doc-host.mjs';
import { layerAccess } from '../intent-changes.mjs';
import { generateIntent } from '../intent-gen.mjs';

const ENGINE = fileURLToPath(new URL('..', import.meta.url));
const GH = 'https://github.com/northwind/ds';

// ── Where it lives ──────────────────────────────────────────────────────────────────────────────────────────────────
test('config: a GitHub link (with its branch and folder), a folder of the project, or an object naming either', () => {
  assert.deepEqual(intentLayerConfig({ intentLayer: `${GH}/tree/next/docs/components` }), { host: 'github', url: `${GH}/tree/next/docs/components`, path: 'docs/components', ref: 'next', entry: null, out: 'intent-layer.snapshot.json', contracts: null });
  assert.deepEqual(intentLayerConfig({ intentLayer: './docs/' }), { host: 'folder', url: 'docs', folder: 'docs', entry: null, out: 'intent-layer.snapshot.json', contracts: null });
  assert.equal(intentLayerConfig({ intentLayer: { github: GH, path: '/guides/', format: 'mdx' } }).path, 'guides');
  assert.equal(intentLayerConfig({ intentLayer: { github: GH, format: 'mdx' } }).format, 'markdown');
  assert.equal(intentLayerConfig({ intentLayer: { folder: 'docs', format: 'dsds' } }).format, 'dsds');
  assert.equal(intentLayerConfig({ intentLayer: { url: GH } }).host, 'github');
  assert.equal(intentLayerConfig({ stores: { intentLayer: { read: { folder: 'shared', path: 'intent' } } } }).folder, 'shared/intent');
  assert.equal(intentLayerConfig({ stores: { intentLayer: { read: { github: GH, branch: 'main' } } } }).ref, 'main');
  assert.equal(hostOf('https://git.northwind.test/design/intent'), 'gitlab');
  assert.equal(parseGithub('https://github.com/northwind/ds.git').repo, 'ds');
  assert.equal(parseGithub('https://git.northwind.test/a/b'), null);
});

test('each file links to where it lives, in its host\'s own form', () => {
  assert.equal(fileUrl({ host: 'github', url: GH, ref: 'main' }, 'docs/button.md'), `${GH}/blob/main/docs/button.md`);
  assert.equal(fileUrl({ host: 'gitlab', url: 'https://git.northwind.test/d/i', ref: 'main' }, 'a b.json'), 'https://git.northwind.test/d/i/-/blob/main/a%20b.json');
  assert.equal(fileUrl({ host: 'folder', web: 'github', url: GH, ref: 'main', prefix: 'packages/ds/' }, 'docs/x.md'), `${GH}/blob/main/packages/ds/docs/x.md`);
  assert.equal(fileUrl({ host: 'folder', url: null }, 'docs/x.md'), null);
});

// ── Markdown and MDX ────────────────────────────────────────────────────────────────────────────────────────────────
test('front matter, a Storybook Meta title, and MDX taken back to its words', () => {
  const { data, body } = frontMatter('---\ntitle: "Button Main"\nstatus: stable\naliases: [Primary, CTA]\ntags:\n  - action\n---\n# Hi\n');
  assert.deepEqual(data, { title: 'Button Main', status: 'stable', aliases: ['Primary', 'CTA'], tags: ['action'] });
  assert.equal(body, '# Hi\n');
  assert.equal(metaTitle('<Meta title="Components/Forms/Field" of={X} />'), 'Components/Forms/Field');
  const t = plainText([
    "import { Meta } from '@storybook/blocks'",
    'export const query = graphql`',
    '  query { a }',
    '`',
    'export const meta = {',
    '  tags: [1, 2],',
    '}',
    'Intro <img',
    '  width="3"',
    '  src="a.png"/> text with `<code>` kept.',
    '',
    '<Demo variants={[',
    "  { label: 'a' },",
    ']} />',
    '',
    '<DoDont type="dont" caption="Never stack two main buttons." />',
    '<Do>',
    '<img src="x.png" />',
    '<Caption>Use one main button per group.</Caption>',
    '</Do>',
    '',
    '| Variant | Purpose |',
    '| --- | --- |',
    '| Main | The next step. |',
    '',
    '```html',
    '<button>kept</button>',
    '```',
  ].join('\n'));
  assert.doesNotMatch(t, /import|graphql|query|tags|<img|Demo|label/);
  assert.match(t, /Intro\s+text with `<code>` kept\./);
  assert.match(t, /\*\*Don't:\*\* Never stack two main buttons\./);
  assert.match(t, /\*\*Do:\*\* Use one main button per group\./);
  assert.match(t, /^- Main: The next step\.$/m);
  assert.match(t, /<button>kept<\/button>/);
});

test('a page\'s sections: each ## a section, each ### under it read by its last part; a wrapped bullet is one line', () => {
  const d = mdSections('# Button\n\nThe main action.\n\n## Usage\n\nIntro.\n\n### When not to use\n\n- Not for links;\n  use a link.\n- Not twice.\n');
  assert.equal(d.title, 'Button');
  assert.equal(d.intro, 'The main action.');
  assert.deepEqual(d.sections.map((s) => s.title), ['Usage', 'Usage / When not to use']);
  assert.deepEqual(itemsOf(d.sections[1].body), ['Not for links; use a link.', 'Not twice.']);
});

const MD = {
  'docs/README.md': '# Northwind DS\n\n## Principles\n\n- One main action a screen.\n- **Draft:** Motion stays under 200ms.\n',
  'docs/components/button-main.md': '---\ntitle: Button Main\nstatus: stable\ncomponent: src/ButtonMain.vue\n---\n\nThe next step the person is expected to take.\n\n## When to use\n\n- To submit a form.\n\n## When not to use\n\n- For navigation; use a link.\n\n## Props\n\n| Prop | Type |\n| --- | --- |\n| size | sm, md |\n\n## Rules\n\n- At most one in an action group.\n- [open] Can it hold an icon only?\n',
  // A component's tabs: one page named after the folder; its code and api tabs and its react/ folder are left out.
  'docs/components/chip-filter/usage.mdx': "import X from 'y'\n\n# Filter chip\n\nNarrows a list.\n\n## When to use\n\n- To filter a list by one value.\n\n<Dont caption=\"Not for a single choice: use a radio group.\" />\n",
  'docs/components/chip-filter/accessibility.mdx': '## Keyboard\n\n- Space toggles it.\n',
  'docs/components/chip-filter/code.mdx': '## Props\n\n- selected\n',
  'docs/components/chip-filter/react/deprecated.mdx': '# Old chip\n\nGone.\n',
  'docs/patterns/saving.md': '# Saving\n\nSave a long form as a draft.\n\n## Rules\n\n- Say when it was saved.\n',
  'docs/CHANGELOG.md': '# Changes\n\n- 1.0\n',
};
test('Markdown pages read into the same shape as a DSDS page: kinds by folder, tabs as one page, Do and Don\'t, drafts and open questions set apart', () => {
  const { system, entities } = readMarkdown(new Map(Object.entries(MD)), { root: 'docs' });
  assert.equal(system.name, 'Northwind DS');
  assert.deepEqual(system.sections.map((s) => s.title), ['Principles']);
  assert.equal(system.drafts[0].text, 'Motion stays under 200ms.');
  assert.deepEqual(entities.map((e) => `${e.name} ${e.kind}/${e.layer}`).sort(), ['Button Main component/components', 'Filter chip component/components', 'Saving pattern/patterns']);
  const b = entities.find((e) => e.name === 'Button Main');
  assert.equal(b.code, 'src/ButtonMain.vue');
  assert.equal(b.status, 'stable');
  assert.deepEqual(b.purpose, ['The next step the person is expected to take.']);
  assert.deepEqual(b.whenToUse, ['To submit a form.']);
  assert.deepEqual(b.whenNotToUse, ['For navigation; use a link.']);
  assert.deepEqual(b.rules.map((r) => r.text), ['At most one in an action group.']);
  assert.equal(b.open[0].text, 'Can it hold an icon only?');
  assert.ok(b.facts.includes('Props'), 'a props table is a fact the code gives');
  const c = entities.find((e) => e.name === 'Filter chip');
  assert.deepEqual(c.files, ['docs/components/chip-filter/usage.mdx', 'docs/components/chip-filter/accessibility.mdx']);
  assert.deepEqual(c.whenToUse, ['To filter a list by one value.']);
  assert.deepEqual(c.whenNotToUse, ['Not for a single choice: use a radio group.']);
  assert.ok(c.rules.some((r) => /Space toggles it/.test(r.text)));
  assert.ok(!entities.some((e) => /Old chip|Changes/.test(e.name)));
});

test('an .mdx beside its component\'s code is that component\'s page, with a docs folder in it', () => {
  const texts = new Map([
    ['src/components/Tile/Tile.mdx', '<Meta title="Components/Tile" />\n\nA surface that groups one subject.\n\n## When not to use\n\n- Not inside another tile.\n'],
    ['src/components/Tile/docs/overview.mdx', '## Rules\n\n- Keep one main action.\n'],
    ['src/components/Guide/getting-started.mdx', '<Meta title="Getting Started/Setup" />\n\nInstall it.\n'],
  ]);
  const { entities } = readMarkdown(texts, { root: 'src/components', paths: [...texts.keys(), 'src/components/Tile/Tile.tsx', 'src/components/Tile/Tile.stories.tsx'] });
  const t = entities.find((e) => e.name === 'Tile');
  assert.equal(t.code, 'src/components/Tile/Tile.tsx');
  assert.equal(t.layer, 'components');
  assert.deepEqual(t.whenNotToUse, ['Not inside another tile.']);
  assert.deepEqual(t.rules.map((r) => r.text), ['Keep one main action.']);
  assert.equal(entities.find((e) => e.name === 'Setup').layer, 'system');
});

// ── A folder of the project ─────────────────────────────────────────────────────────────────────────────────────────
const files = (extra = {}) => ({ 'package.json': { name: 'northwind', repository: 'github:northwind/ds' }, 'src/ButtonMain.vue': '<template><button/></template>\n', ...MD, ...extra });
test('a folder of the project: read as it is on disk, linked to the project\'s repository, read again when a page changes', async () => {
  const dir = makeFixture(files());
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'northwind', repository: { url: 'git+https://github.com/northwind/ds.git' } }));
  const cfg = { intentLayer: 'docs' };
  const r = await syncIntentLayer(dir, cfg, {});
  assert.equal(r.ok, true);
  assert.equal(r.entities, 3);
  assert.equal(r.source.format, 'markdown');
  assert.match(describeSync(r), /🧭 Intent layer: the folder docs - 3 Markdown pages, read/);
  const snap = readIntentLayer(dir, cfg);
  assert.equal(snap.entities.find((e) => e.name === 'Button Main').url, `${GH}/blob/HEAD/docs/components/button-main.md`);
  assert.ok(snap.entities.every((e) => e.updatedAt), 'each page dated (when it was saved, with no commit)');
  assert.equal((await syncIntentLayer(dir, cfg, {})).changed, false);
  const page = join(dir, 'docs/components/button-main.md');
  writeFileSync(page, readFileSync(page, 'utf8').replace('To submit a form.', 'To submit a form or a search.'));
  utimesSync(page, new Date(), new Date(Date.now() + 5000));
  assert.equal((await syncIntentLayer(dir, cfg, {})).changed, true);
  assert.deepEqual(readIntentLayer(dir, cfg).entities.find((e) => e.name === 'Button Main').whenToUse, ['To submit a form or a search.']);
  // Offline it is still read: it is on disk.
  assert.equal((await syncIntentLayer(dir, cfg, { offline: true })).ok, true);
});

test('Markdown pages reach the design intent and each component\'s documentation as DSDS pages do', async () => {
  const dir = makeFixture({ ...files(), 'theme.css': ':root{}\n', 'struct.json': { components: { buttonMain: { h: 24 }, chipFilter: { h: 24 } } } });
  const cfg = { paths: { themeCSS: 'theme.css', snapshotStructure: 'struct.json' }, componentFiles: { buttonMain: 'src/ButtonMain.vue' }, intentLayer: 'docs' };
  await syncIntentLayer(dir, cfg, {});
  const snap = readIntentLayer(dir, cfg);
  const m = matchComponents(['buttonMain', 'chipFilter'], snap.entities, { buttonMain: 'src/ButtonMain.vue' });
  assert.equal(m.get('chipFilter').name, 'Filter chip');
  assert.deepEqual(componentIntent(m.get('buttonMain'), snap._source).whenNotToUse, ['For navigation; use a link.']);
  const { intent } = await generateIntent(dir, cfg, { write: false });
  assert.equal(intent.components.buttonMain.intentLayer.purpose, 'The next step the person is expected to take.');
  assert.equal(intent.patterns.intentLayer[0].name, 'Saving');
});

test('a folder that holds DSDS is read as DSDS; format says which when both are there', async () => {
  const dsds = { 'intent/system.dsds.json': { dsdsVersion: '0.15.2', systemInfo: { name: 'N' }, entityGroups: [{ name: 'Components', entities: [{ $ref: './c.dsds.json#/entity' }] }] }, 'intent/c.dsds.json': { entity: { kind: 'component', name: 'Card', description: 'Groups one subject.' } }, 'intent/notes.md': '# Notes\n\nWhy.\n' };
  const dir = makeFixture(dsds);
  const r = await syncIntentLayer(dir, { intentLayer: 'intent' }, {});
  assert.equal(r.source.format, 'dsds');
  assert.equal(r.entities, 1);
  const md = await syncIntentLayer(makeFixture(dsds), { intentLayer: { folder: 'intent', format: 'markdown' } }, {});
  assert.equal(md.source.format, 'markdown');
  assert.equal(md.entities, 1);
  const none = await syncIntentLayer(makeFixture({ 'intent/x.txt': 'x' }), { intentLayer: 'intent' }, {});
  assert.match(none.error, /no DSDS entities and no Markdown or MDX pages found in the folder intent/);
  assert.match((await syncIntentLayer(makeFixture({}), { intentLayer: 'nowhere' }, {})).error, /nowhere is not a folder/);
});

// ── GitHub ──────────────────────────────────────────────────────────────────────────────────────────────────────────
function fakeGithub({ sha = 'abc1234def5678', tree = MD, status = 200, truncated = false } = {}) {
  const calls = [];
  const fetchImpl = async (url, o = {}) => {
    calls.push({ url, method: o.method ?? 'GET', headers: o.headers ?? {} });
    const json = (j) => ({ ok: true, status: 200, json: async () => j });
    if (status !== 200) return { ok: false, status, json: async () => ({}) };
    const u = new URL(url);
    if (u.host === 'raw.githubusercontent.com') {
      const path = decodeURIComponent(u.pathname.split('/').slice(4).join('/'));
      const b = Buffer.from(typeof tree[path] === 'string' ? tree[path] : JSON.stringify(tree[path]));
      return tree[path] == null ? { ok: false, status: 404 } : { ok: true, status: 200, arrayBuffer: async () => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) };
    }
    if (/\/git\/trees\//.test(u.pathname)) return json({ truncated, tree: Object.keys(tree).map((path) => ({ path, type: 'blob', size: 10 })) });
    if (/\/compare\//.test(u.pathname)) return json({ files: [{ filename: 'docs/patterns/saving.md', status: 'modified' }] });
    if (/\/commits\/[^/]+$/.test(u.pathname)) return json({ sha, commit: { committer: { date: '2026-10-01T10:00:00Z' } } });
    if (/\/commits$/.test(u.pathname)) return json([{ commit: { committer: { date: '2026-09-15T08:30:00Z' } } }]);
    return json({ default_branch: 'main' });
  };
  return { fetchImpl, calls };
}
test('a GitHub repository: read through its API without a clone, only GETs, the token only to GitHub, again only when the commit moves', async () => {
  const dir = makeFixture({});
  const cfg = { intentLayer: `${GH}/tree/main/docs` };
  const gh = fakeGithub();
  const r = await syncIntentLayer(dir, cfg, { env: { GITHUB_TOKEN: 'gh0' }, fetchImpl: gh.fetchImpl });
  assert.equal(r.ok, true);
  assert.equal(r.entities, 3);
  assert.match(describeSync(r), /github\.com\/northwind\/ds @ main abc1234d \(2026-10-01\) - 3 Markdown pages, read/);
  assert.ok(gh.calls.every((c) => c.method === 'GET'));
  assert.ok(gh.calls.every((c) => ['api.github.com', 'raw.githubusercontent.com'].includes(new URL(c.url).host)));
  assert.ok(gh.calls.every((c) => c.headers.Authorization === 'Bearer gh0' && c.headers['User-Agent']));
  const snap = readIntentLayer(dir, cfg);
  assert.equal(snap.entities.find((e) => e.name === 'Saving').url, `${GH}/blob/main/docs/patterns/saving.md`);
  assert.equal(snap.entities.find((e) => e.name === 'Saving').updatedAt, '2026-09-15T08:30:00Z');
  const again = fakeGithub();
  assert.equal((await syncIntentLayer(dir, cfg, { env: {}, fetchImpl: again.fetchImpl })).changed, false);
  assert.ok(!again.calls.some((c) => /trees|raw\.githubusercontent/.test(c.url)), 'nothing read again while the commit has not moved');
  assert.ok(again.calls.every((c) => !c.headers.Authorization), 'no token, none sent');
  const moved = fakeGithub({ sha: 'fff9999aaa0000' });
  await syncIntentLayer(dir, cfg, { env: {}, fetchImpl: moved.fetchImpl });
  assert.ok(moved.calls.some((c) => /\/compare\/abc1234def5678\.\.\.fff9999aaa0000$/.test(c.url)));
  assert.equal(readIntentLayer(dir, cfg).entities.find((e) => e.name === 'Saving').updatedAt, '2026-10-01T10:00:00Z');
});

test('GitHub refusing keeps the copy already there and says what to do; a cut tree is said', async () => {
  const dir = makeFixture({});
  const cfg = { intentLayer: GH };
  await syncIntentLayer(dir, cfg, { env: {}, fetchImpl: fakeGithub().fetchImpl });
  const r = await syncIntentLayer(dir, cfg, { env: {}, fetchImpl: fakeGithub({ status: 403 }).fetchImpl });
  assert.equal(r.stale, true);
  assert.match(r.error, /GitHub refused \(403\).*GITHUB_TOKEN/);
  assert.match(describeSync(r), /using the copy of github\.com\/northwind\/ds/);
  const p = await syncIntentLayer(makeFixture({}), cfg, { env: {}, fetchImpl: fakeGithub({ status: 404 }).fetchImpl });
  assert.match(p.error, /private and no GITHUB_TOKEN/);
  const cut = await syncIntentLayer(makeFixture({}), cfg, { env: {}, fetchImpl: fakeGithub({ truncated: true }).fetchImpl });
  assert.match(describeSync(cut), /only part of this repository's tree/);
});

// ── Writing and setting it ──────────────────────────────────────────────────────────────────────────────────────────
test('changes are written to a GitLab layer only; a GitHub or folder layer says so', () => {
  assert.match(layerAccess('.', { intentLayer: GH }).error, /GitLab only.*on GitHub.*Documentation page/);
  assert.match(layerAccess('.', { intentLayer: 'docs' }).error, /the folder docs/);
});

test('--intent-layer takes a folder of the project or a GitHub link; a folder that is not there is not set', () => {
  const dir = makeFixture({ ...files(), 'ds-config.json': { name: 'northwind', figmaFileKey: '', paths: { themeCSS: 'theme.css' } }, 'theme.css': ':root{}\n' });
  const run = (...a) => spawnSync(process.execPath, [join(ENGINE, 'audit.mjs'), '--intent-layer', ...a], { cwd: dir, encoding: 'utf8', env: { ...process.env, DESIGN_SYSTEM_ENGINE_NO_AUTO_UPDATE: '1' } });
  const ok = run('./docs');
  assert.equal(ok.status, 0, ok.stdout + ok.stderr);
  assert.match(ok.stdout, /the folder docs - 3 Markdown pages/);
  assert.equal(JSON.parse(readFileSync(join(dir, 'ds-config.json'), 'utf8')).intentLayer, 'docs');
  const fmt = run('docs', '--format=mdx');
  assert.equal(fmt.status, 0);
  assert.deepEqual(JSON.parse(readFileSync(join(dir, 'ds-config.json'), 'utf8')).intentLayer, { folder: 'docs', format: 'markdown' });
  const bad = run('missing');
  assert.equal(bad.status, 1);
  assert.match(bad.stdout, /not a folder of this project/);
  assert.match(run('https://github.com/northwind').stdout, /not a GitHub repository link/);
});
