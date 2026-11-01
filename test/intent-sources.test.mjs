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
import { frontMatter, plainText, mdSections, readMarkdown, metaTitle, resolveLinks, decodeEntities } from '../doc-source-markdown.mjs';
import { entityView } from '../doc-source-dsds.mjs';
import { parseGithub, hostOf, fileUrl } from '../doc-host.mjs';
import { layerAccess, layerFiles, commitToBranch, openMergeRequest, mayWrite, mdAdd } from '../intent-changes.mjs';
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

test('a page written for people: a line that tells what to do is a rule, one that only describes stays a section for people', () => {
  const texts = new Map([['docs/components/tile.md', [
    '# Tile', '', 'Groups one subject.', '',
    '## Variants', '', '- The plain tile has no border.', '- Use the outlined tile on a busy background.', '',
    '## Placement', '', '- Tiles wrap to the next row in a grid.', '- Never nest a tile in a tile.', '- Give each tile one main action.', '',
    '## Role', '', '- Role: group', '',
  ].join('\n')]]);
  const t = readMarkdown(texts, { root: 'docs' }).entities[0];
  assert.deepEqual(t.rules.map((r) => r.text), ['Variants: Use the outlined tile on a busy background.', 'Placement: Never nest a tile in a tile.', 'Placement: Give each tile one main action.', 'Role: group']);
  assert.deepEqual(t.sections.map((x) => [x.title, x.described]), [['Variants', true], ['Placement', true]]);
  // A DSDS page is written for agents: every line of its own prose is a rule, as before.
  const d = entityView({ kind: 'component', name: 'Tile', sections: [{ kind: 'section', title: 'Spec', freeform: [{ title: 'Placement', body: '- Tiles wrap to the next row in a grid.' }] }] }, 'tile.dsds.json', 'components');
  assert.deepEqual(d.rules.map((r) => r.text), ['Placement: Tiles wrap to the next row in a grid.']);
});

test('noise left out: entities decoded, images (wrapped too) and lines of links only dropped', () => {
  assert.equal(decodeEntities('a&nbsp;|&nbsp;b &amp; c &#8217; &#x2014;'), 'a | b & c ’ —');
  const t = plainText('[Source code](https://x.test/src) &nbsp;|&nbsp; [Usage guidelines](/components/tile/usage)\n\nGroups one subject &amp; its actions.\n\n![A tile with a long\ndescription](tile.png)\n\n- ![icon](i.svg) Keep one action.\n\n```html\n<b>&amp;</b>\n```');
  assert.doesNotMatch(t, /Source code|!\[|tile\.png/);
  assert.match(t, /Groups one subject & its actions\./);
  assert.match(t, /- Keep one action\./);
  assert.match(t, /<b>&amp;<\/b>/, 'code is kept as written');
});

test('a link to another page of the site goes to that page where the layer lives; others are left', () => {
  const page = (name, file, extra = {}) => ({ name, file, url: `${GH}/blob/main/${file}`, purpose: [], whenToUse: [], whenNotToUse: [], mistakes: [], limitations: [], rules: [], sections: [], ...extra });
  const tree = page('Tree view', 'site/components/tree-view/usage.mdx', { files: ['site/components/tree-view/usage.mdx', 'site/components/tree-view/style.mdx'] });
  const acc = page('Accordion', 'site/components/accordion.md', { whenNotToUse: ['Nested content: use [tree view](/components/tree-view/usage#when) instead.', 'See [the guide](../guide.md), [MDN](https://developer.mozilla.org/x) and [gone](/nowhere).'] });
  resolveLinks([tree, acc], { url: (f) => `${GH}/blob/main/${f}`, paths: ['site/guide.md'] });
  assert.equal(acc.whenNotToUse[0], `Nested content: use [tree view](${GH}/blob/main/site/components/tree-view/usage.mdx#when) instead.`);
  assert.equal(acc.whenNotToUse[1], `See [the guide](${GH}/blob/main/site/guide.md), [MDN](https://developer.mozilla.org/x) and [gone](/nowhere).`);
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
test('a folder layer\'s changes are written in the folder for a person to commit; a page changed since is never overwritten', async () => {
  const dir = makeFixture(files());
  const cfg = { intentLayer: 'docs' };
  await syncIntentLayer(dir, cfg, {});
  const access = layerAccess(dir, cfg);
  assert.equal(access.kind, 'folder');
  assert.deepEqual(await mayWrite(dir, cfg), { ok: true });
  const got = await layerFiles(access, 'x');
  assert.ok(got.has('docs/components/button-main.md'));
  const page = 'docs/components/button-main.md';
  const next = new Map([[page, mdAdd(got.get(page), 'Common mistakes', 'Two main buttons side by side.')], ['docs/components/new-tile.md', '---\ntitle: New tile\n---\n']]);
  const done = await commitToBranch(access, { files: next, sha: 'x', target: 'HEAD', message: 'm', created: new Set(['docs/components/new-tile.md']) });
  assert.match(done.said, /written in the folder docs \(2 files\), not committed/);
  assert.match(readFileSync(join(dir, page), 'utf8'), /## Common mistakes\n\n- \*\*Draft:\*\* Two main buttons side by side\./);
  assert.ok(readFileSync(join(dir, 'docs/components/new-tile.md'), 'utf8').startsWith('---\ntitle: New tile'));
  // Read again, then changed on disk by a person before the changes are written: refused, nothing written.
  const again = layerAccess(dir, cfg); const read = await layerFiles(again, 'x');
  writeFileSync(join(dir, page), read.get(page) + '\n- A person\'s line.\n');
  const refused = await commitToBranch(again, { files: new Map([[page, 'gone']]), sha: 'x', target: 'HEAD', message: 'm' });
  assert.match(refused.error, /changed in the folder since the layer was read/);
  assert.match(readFileSync(join(dir, page), 'utf8'), /A person's line/);
});

test('a Markdown page is its own source: the plan\'s lines are written in it, and a new page starts beside its siblings', async () => {
  const { applyPlan } = await import('../intent-changes.mjs');
  const { startPage } = await import('../intent-answers.mjs');
  const files = new Map([['docs/components/button-main.md', MD['docs/components/button-main.md']], ['docs/components/chip-filter/usage.mdx', MD['docs/components/chip-filter/usage.mdx']]]);
  const e = { name: 'Button Main', file: 'docs/components/button-main.md', code: 'src/ButtonMain.vue' };
  const r = applyPlan([{ entity: e, remove: ['To submit a form.'], drafted: [{ where: 'Limitations', text: 'One label line only.' }] }], files);
  const out = r.files.get('docs/components/button-main.md');
  assert.ok(out.startsWith('---\ntitle: Button Main'), 'the front matter is kept');
  assert.doesNotMatch(out, /To submit a form\./);
  assert.match(out, /## Limitations\n\n- \*\*Draft:\*\* One label line only\./);
  const snap = { entities: [{ kind: 'component', layer: 'components', name: 'Button Main', file: 'docs/components/button-main.md', code: 'src/ButtonMain.vue' }] };
  const s = startPage({ name: 'tileMedia', code: 'src/TileMedia.vue' }, snap, files);
  assert.equal(s.file, 'docs/components/tile-media.md');
  assert.equal(s.files.get(s.file), '---\ntitle: Tile Media\nkind: component\ncomponent: src/TileMedia.vue\nstatus: draft\n---\n');
  const tabs = startPage({ name: 'tileMedia', code: 'src/TileMedia.vue' }, { entities: [{ kind: 'component', layer: 'components', name: 'Filter chip', file: 'docs/components/chip-filter/usage.mdx', files: ['docs/components/chip-filter/usage.mdx', 'docs/components/chip-filter/accessibility.mdx'], code: 'src/Chip.vue' }] }, files);
  assert.equal(tabs.file, 'docs/components/tile-media/usage.mdx');
});

function fakeGithubWrite({ head = 'abc1234def5678', status = {} } = {}) {
  const calls = [];
  const reply = (code, j) => ({ ok: code >= 200 && code < 300, status: code, json: async () => j });
  const fetchImpl = async (url, o = {}) => {
    calls.push({ method: 'GET', url, headers: o.headers ?? {} });
    const u = new URL(url);
    if (/\/git\/ref\/heads\//.test(u.pathname)) return reply(status.ref ?? 200, { object: { sha: head } });
    if (/\/git\/commits\//.test(u.pathname)) return reply(200, { tree: { sha: 'tree0' } });
    return reply(200, {});
  };
  const sendImpl = async (url, o = {}) => {
    calls.push({ method: o.method, url, headers: o.headers ?? {}, body: o.body });
    const u = new URL(url);
    if (/\/git\/trees$/.test(u.pathname)) return reply(201, { sha: 'tree1' });
    if (/\/git\/commits$/.test(u.pathname)) return reply(201, { sha: 'new0001' });
    if (/\/git\/refs\/heads\//.test(u.pathname)) return reply(status.patch ?? 200, {});
    if (/\/git\/refs$/.test(u.pathname)) return reply(201, {});
    if (/\/pulls$/.test(u.pathname)) return reply(201, { html_url: `${GH}/pull/7` });
    return reply(404, {});
  };
  return { fetchImpl, sendImpl, calls };
}
test('a GitHub layer\'s changes: one commit on its branch while it has not moved, or a branch and a pull request; the token only to GitHub', async () => {
  const cfg = { intentLayer: GH };
  const env = { GITHUB_TOKEN: 'gh1' };
  const files = new Map([['docs/a.md', '# A\n'], ['docs/old.md', null]]);
  const f = fakeGithubWrite();
  const a = layerAccess('.', cfg, { env, fetchImpl: f.fetchImpl, sendImpl: f.sendImpl });
  const done = await commitToBranch(a, { files, sha: 'abc1234def5678', target: 'main', message: 'Intent layer: fixed' });
  assert.equal(done.said, `committed on main: ${GH}/commit/new0001`);
  const tree = f.calls.find((c) => /\/git\/trees$/.test(c.url)).body;
  assert.deepEqual(tree, { base_tree: 'tree0', tree: [{ path: 'docs/a.md', mode: '100644', type: 'blob', content: '# A\n' }, { path: 'docs/old.md', mode: '100644', type: 'blob', sha: null }] });
  assert.deepEqual(f.calls.find((c) => c.method === 'PATCH').body, { sha: 'new0001', force: false });
  assert.ok(f.calls.every((c) => new URL(c.url).host === 'api.github.com' && c.headers.Authorization === 'Bearer gh1'));
  const moved = fakeGithubWrite({ head: 'fff9999' });
  assert.match((await commitToBranch(layerAccess('.', cfg, { env, fetchImpl: moved.fetchImpl, sendImpl: moved.sendImpl }), { files, sha: 'abc1234def5678', target: 'main', message: 'm' })).error, /main moved since the layer was read/);
  assert.ok(!moved.calls.some((c) => c.method !== 'GET'), 'nothing sent when the branch moved');
  const r = fakeGithubWrite();
  const pr = await openMergeRequest(layerAccess('.', cfg, { env, fetchImpl: r.fetchImpl, sendImpl: r.sendImpl }), { files, sha: 'abc1234def5678', target: 'main', branch: 'design-system-engine/review-1', title: 'T', description: 'D', message: 'm' });
  assert.equal(pr.url, `${GH}/pull/7`);
  assert.deepEqual(r.calls.find((c) => /\/git\/refs$/.test(c.url)).body, { ref: 'refs/heads/design-system-engine/review-1', sha: 'abc1234def5678' });
  assert.deepEqual(r.calls.find((c) => /\/pulls$/.test(c.url)).body, { title: 'T', head: 'design-system-engine/review-1', base: 'main', body: 'D' });
  const p = fakeGithubWrite({ status: { patch: 422 } });
  assert.match((await commitToBranch(layerAccess('.', cfg, { env, fetchImpl: p.fetchImpl, sendImpl: p.sendImpl }), { files, sha: 'abc1234def5678', target: 'main', message: 'm' })).error, /422/);
  assert.match((await mayWrite('.', cfg, 'commit', { env: {} })).why, /no GITHUB_TOKEN/);
  assert.match((await commitToBranch(layerAccess('.', cfg, { env: {} }), { files, sha: 'abc', target: 'main', message: 'm' })).error, /no GITHUB_TOKEN/);
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

// ── Documentation tools and GitHub Enterprise ───────────────────────────────────────────────────────────────────────
const json = (j, status = 200) => ({ ok: status < 300, status, json: async () => j });
test('Notion: the page\'s child pages as folders of pages, its database rows with their properties; the token only to Notion', async () => {
  const root = '0123456789abcdef0123456789abcdef';
  const kids = {
    '01234567-89ab-cdef-0123-456789abcdef': [{ id: 'c1', type: 'child_page', child_page: { title: 'Components' }, has_children: true, last_edited_time: '2026-10-01T00:00:00Z' }, { id: 'db1', type: 'child_database', child_database: { title: 'Patterns' } }],
    c1: [{ id: 'b1', type: 'child_page', child_page: { title: 'Button Main' }, has_children: true, last_edited_time: '2026-10-02T00:00:00Z' }],
    b1: [{ type: 'paragraph', paragraph: { rich_text: [{ plain_text: 'The next step the person is expected to take.' }] } }, { type: 'heading_2', heading_2: { rich_text: [{ plain_text: 'When not to use' }] } }, { type: 'bulleted_list_item', bulleted_list_item: { rich_text: [{ plain_text: 'For navigation; use a link.' }] } }],
    p1: [{ type: 'paragraph', paragraph: { rich_text: [{ plain_text: 'Save a long form as a draft.' }] } }],
  };
  const calls = [];
  const fetchImpl = async (url, o = {}) => { calls.push({ url, headers: o.headers }); const id = /blocks\/([^/]+)\/children/.exec(url)?.[1]; return json({ results: kids[id] ?? [], has_more: false }); };
  const sendImpl = async (url, o = {}) => { calls.push({ url, headers: o.headers, method: o.method }); return json({ results: [{ id: 'p1', url: 'https://www.notion.so/Saving-p1', last_edited_time: '2026-10-03T00:00:00Z', properties: { Name: { type: 'title', title: [{ plain_text: 'Saving' }] }, Kind: { type: 'select', select: { name: 'pattern' } } } }], has_more: false }); };
  const dir = makeFixture({ '.env': 'NOTION_TOKEN=nt0\n' });
  const cfg = { intentLayer: `https://www.notion.so/acme/Intent-${root}` };
  assert.equal(intentLayerConfig(cfg).host, 'notion');
  const r = await syncIntentLayer(dir, cfg, { fetchImpl, sendImpl });
  assert.equal(r.ok, true, r.error);
  assert.match(describeSync(r), /🧭 Intent layer: Notion \(last edited 2026-10-03\) - 2 Markdown pages, read/);
  const snap = readIntentLayer(dir, cfg);
  const b = snap.entities.find((e) => e.name === 'Button Main');
  assert.equal(b.layer, 'components');
  assert.deepEqual(b.whenNotToUse, ['For navigation; use a link.']);
  assert.equal(b.url, 'https://www.notion.so/b1');
  const s = snap.entities.find((e) => e.name === 'Saving');
  assert.equal(s.layer, 'patterns');
  assert.equal(s.url, 'https://www.notion.so/Saving-p1');
  assert.ok(calls.every((c) => new URL(c.url).host === 'api.notion.com' && c.headers.Authorization === 'Bearer nt0'));
  assert.match((await syncIntentLayer(makeFixture({}), cfg, { fetchImpl, sendImpl, env: {} })).error, /no NOTION_TOKEN in \.env/);
  // Read-only: the changes are made on the pages as read and listed for a person; sending them is refused, plainly.
  const access = layerAccess(dir, cfg, { fetchImpl, sendImpl });
  assert.equal((await layerFiles(access, 'latest')).get('Components/Button Main.md').includes('For navigation; use a link.'), true);
  assert.match((await commitToBranch(access, { files: new Map([['Components/Button Main.md', 'x']]), sha: 'latest', target: 'latest', message: 'm' })).error, /reads the layer from Notion but never writes there: each change is listed for a person to make in Notion/);
  assert.match((await openMergeRequest(access, { files: new Map(), sha: 'latest', target: 'latest', title: 't', description: 'd', branch: 'b', message: 'm' })).error, /never writes there/);
  const may = await mayWrite(dir, cfg, 'commit');
  assert.deepEqual([may.ok, may.readOnly], [false, true]);
  assert.ok(calls.every((c) => !c.method || c.method === 'POST' && /\/databases\/[^/]+\/query$/.test(c.url)), 'only reads: GETs, and the database query');
});

test('Confluence: the page and its descendants, in folders by their ancestors, storage format as Markdown; basic auth on the cloud', async () => {
  const { storageToMarkdown } = await import('../doc-tools.mjs');
  assert.equal(storageToMarkdown('<h2>When to use</h2><ul><li><p>To submit a form.</p></li></ul><p>Plain &amp; <strong>bold</strong>.</p><table><tbody><tr><th>Size</th><th>Use</th></tr><tr><td>sm</td><td>Dense lists</td></tr></tbody></table><ac:structured-macro ac:name="code"><ac:plain-text-body><![CDATA[<b>x</b>]]></ac:plain-text-body></ac:structured-macro><ac:image><ri:attachment ri:filename="a.png"/></ac:image>'),
    '## When to use\n\n- To submit a form.\n\nPlain & **bold**.\n\n| Size | Use |\n| sm | Dense lists |\n\n```\n<b>x</b>\n```');
  // A tag split by another is still taken out; an escaped one stays as text; a link in a list item stays a link.
  assert.equal(storageToMarkdown('<ul><li><p>Use <a href="https://x.test/a">the link</a>.</p></li></ul><p>a <scr<script>ipt>b &lt;c&gt;</p>'), '- Use [the link](https://x.test/a).\n\na b <c>');
  const link = 'https://acme.atlassian.net/wiki/spaces/DS/pages/100/Intent+layer';
  const calls = [];
  const fetchImpl = async (url, o = {}) => {
    calls.push({ url, headers: o.headers });
    if (/content\/100\?/.test(url)) return json({ id: '100', title: 'Intent layer', version: { number: 3, when: '2026-10-01T00:00:00Z' }, body: { storage: { value: '<p>Read before composing a screen.</p>' } }, _links: { webui: '/spaces/DS/pages/100' } });
    return json({ results: [
      { id: '101', title: 'Components', ancestors: [{ id: '1', title: 'DS home' }, { id: '100', title: 'Intent layer' }], version: { number: 1, when: '2026-10-02T00:00:00Z' }, body: { storage: { value: '<p>Every component.</p>' } } },
      { id: '102', title: 'Button Main', ancestors: [{ id: '1', title: 'DS home' }, { id: '100', title: 'Intent layer' }, { id: '101', title: 'Components' }], version: { number: 7, when: '2026-10-04T00:00:00Z' }, body: { storage: { value: '<p>The next step.</p><h2>When not to use</h2><ul><li>For navigation.</li></ul>' } }, _links: { webui: '/spaces/DS/pages/102' } },
    ] });
  };
  const dir = makeFixture({ '.env': 'CONFLUENCE_EMAIL=me@acme.test\nCONFLUENCE_TOKEN=ct0\n' });
  const r = await syncIntentLayer(dir, { intentLayer: link }, { fetchImpl });
  assert.equal(r.ok, true, r.error);
  const b = readIntentLayer(dir, { intentLayer: link }).entities.find((e) => e.name === 'Button Main');
  assert.equal(b.layer, 'components');
  assert.deepEqual(b.whenNotToUse, ['For navigation.']);
  assert.equal(b.url, 'https://acme.atlassian.net/wiki/spaces/DS/pages/102');
  assert.ok(calls.every((c) => c.url.startsWith('https://acme.atlassian.net/wiki/rest/api/') && c.headers.Authorization === `Basic ${Buffer.from('me@acme.test:ct0').toString('base64')}`));
});

test('hostOf: a Notion or Confluence page is its tool\'s; a GitLab project that only looks like one stays GitLab', () => {
  assert.equal(hostOf('https://www.notion.so/acme/Intent-0123456789abcdef0123456789abcdef'), 'notion');
  assert.equal(hostOf('https://acme.atlassian.net/wiki/spaces/DS/pages/100/Intent'), 'confluence');
  assert.equal(hostOf('https://wiki.acme.test/pages/viewpage.action?pageId=100'), 'confluence');
  assert.equal(hostOf('https://git.acme.test/design/display/intent'), 'gitlab');
  assert.equal(intentLayerConfig({ intentLayer: { confluence: 'https://wiki.acme.test/pages/viewpage.action?pageId=100' } }).host, 'confluence');
});

test('GitHub Enterprise: a host named in GITHUB_HOST, read through its own API, files through its contents; the token only to it', async () => {
  const link = 'https://git.acme.test/design/docs/tree/main/intent';
  assert.equal(hostOf(link, { GITHUB_HOST: 'git.acme.test' }), 'github');
  assert.equal(hostOf(link, {}), 'gitlab', 'an unknown host stays a GitLab project');
  const calls = [];
  const fetchImpl = async (url, o = {}) => {
    calls.push({ url, headers: o.headers });
    const u = new URL(url);
    if (/\/contents\//.test(u.pathname)) { const b = Buffer.from('# Saving\n\nSave a long form as a draft.\n'); return { ok: true, status: 200, arrayBuffer: async () => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) }; }
    if (/\/git\/trees\//.test(u.pathname)) return json({ tree: [{ path: 'intent/patterns/saving.md', type: 'blob', size: 40 }] });
    if (/\/commits\/main$/.test(u.pathname)) return json({ sha: 'abc1234def5678', commit: { committer: { date: '2026-10-01T00:00:00Z' } } });
    if (/\/commits$/.test(u.pathname)) return json([]);
    return json({ default_branch: 'main' });
  };
  const dir = makeFixture({});
  const r = await syncIntentLayer(dir, { intentLayer: { github: link } }, { env: { GITHUB_TOKEN: 'ghe0' }, fetchImpl });
  assert.equal(r.ok, true, r.error);
  assert.equal(readIntentLayer(dir, { intentLayer: { github: link } }).entities[0].url, 'https://git.acme.test/design/docs/blob/main/intent/patterns/saving.md');
  assert.ok(calls.every((c) => c.url.startsWith('https://git.acme.test/api/v3/repos/design/docs/') && c.headers.Authorization === 'Bearer ghe0'));
  assert.ok(calls.some((c) => /\/contents\/intent\/patterns\/saving\.md\?ref=abc1234def5678$/.test(c.url) && c.headers.Accept === 'application/vnd.github.raw'));
});
