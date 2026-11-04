// styleguide-inputs.mjs - a style guide is built from the capture, the logo and the fonts, or it is not built.
//
// The line this draws, and the reason it is not one rule: a project with no Figma at all has an honest page built
// from its code alone. A project whose setup *names a store* for its capture and has no capture has lost it on the
// way, and its page would call every component one only the code has. The first carries on; the second stops.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, mkdirSync, existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { figmaSnapshots, missingFigma, missingBrandFiles, takeBrandFiles, inputsOnRun, SETUP_PATH } from '../lib/styleguide-inputs.mjs';
import { tempDir } from './helpers.mjs';

const ENGINE = dirname(dirname(fileURLToPath(import.meta.url)));
const STORE = 'https://gitlab.test/acme/kit';

const project = (files = {}) => {
  const d = tempDir('sginputs-');
  for (const [p, body] of Object.entries(files)) {
    mkdirSync(join(d, dirname(p)), { recursive: true });
    writeFileSync(join(d, p), typeof body === 'string' ? body : JSON.stringify(body));
  }
  return d;
};
// A setup that reads its capture from a store, which is what makes a missing capture a loss and not an absence.
const named = (extra = {}) => ({ stores: { snapshots: { gitlab: STORE } }, ...extra });
const captured = {
  'src/figma-vars.snapshot.json': { variables: { 'color/accent': '#0037fa' } },
  'src/figma-structure.snapshot.json': { components: { Button: { box: { width: 120 } } } },
};
// A store whose setup/ folder holds what the files map says, answering as GitLab's API does.
const fakeStore = (files = {}) => {
  const asked = [];
  const api = {
    get: async (path) => {
      asked.push(path);
      if (path.startsWith('/repository/tree')) {
        return { ok: true, status: 200, json: async () => Object.keys(files).map((p) => ({ type: 'blob', path: p })) };
      }
      const m = /^\/repository\/files\/([^/]+)\/raw$/.exec(path);
      const body = m && files[decodeURIComponent(m[1])];
      return body
        ? { ok: true, status: 200, arrayBuffer: async () => Buffer.from(body) }
        : { ok: false, status: 404, arrayBuffer: async () => Buffer.alloc(0) };
    },
  };
  return { asked, stores: { storesOf: (cfg) => ({ styleguide: { read: { gitlab: STORE } }, snapshots: { read: cfg?.stores?.snapshots ? { gitlab: STORE } : null } }), gitlabApi: () => api } };
};

test('the capture a page is built from is the one it reads: its variables and its structure', () => {
  assert.deepEqual(figmaSnapshots({}), ['src/figma-vars.snapshot.json', 'src/figma-structure.snapshot.json']);
  assert.deepEqual(figmaSnapshots({ paths: { snapshotVars: 'a.json', snapshotStructure: 'b.json' } }), ['a.json', 'b.json']);
});

test('a capture of nothing counts as no capture: that is what a read that failed leaves behind', () => {
  assert.equal(missingFigma(project(), {}).length, 2, 'neither file is there');
  const empty = project({ 'src/figma-vars.snapshot.json': '{}', 'src/figma-structure.snapshot.json': '{ "_takenAt": "2026-11-04" }' });
  assert.deepEqual(missingFigma(empty, {}), ['src/figma-vars.snapshot.json', 'src/figma-structure.snapshot.json'], 'a file with nothing in it but a note of when it was taken has no capture in it');
  assert.deepEqual(missingFigma(project({ 'src/figma-structure.snapshot.json': 'not json' }), {}).length, 2, 'a file that cannot be read is not a capture');
  assert.deepEqual(missingFigma(project(captured), {}), [], 'both there, with something in them');
});

test('a setup that names a store for its capture and has no capture stops the build, and says it is an access answer', async () => {
  const i = await inputsOnRun(project(), named(), { offline: true });
  assert.equal(i.stop, true);
  const said = i.lines.join('\n');
  assert.match(said, /❌ The Figma capture is not here/);
  assert.match(said, /every component reads as one only the code has/, 'why a page without it is worse than no page');
  assert.match(said, /NEXT: tell the person the page was not built and why/);
  assert.match(said, /--store says what GitLab allows/, 'where the person looks next');
});

test('a system with no Figma at all is built from its code alone, and the page says so', async () => {
  const i = await inputsOnRun(project(), {}, { offline: true });
  assert.equal(i.stop, false, 'a project the engine supports is never stopped for a capture it never had');
  assert.match(i.lines.join('\n'), /ℹ️ {2}No Figma capture here .* no store named for one: the page is built from the code alone/);
});

test('the logo and the fonts the setup names, and whether they are on disk', () => {
  const d = project({ 'assets/logo.svg': '<svg/>', 'fonts/Acme-Regular.woff2': 'x' });
  assert.deepEqual(missingBrandFiles(d, { styleguide: { logo: 'assets/logo.svg' }, paths: { fonts: 'fonts' } }), { logo: null, fonts: null });
  const bare = project({});
  assert.deepEqual(missingBrandFiles(bare, { styleguide: { logo: 'assets/logo.svg' } }), { logo: 'assets/logo.svg', fonts: 'fonts' });
  assert.deepEqual(missingBrandFiles(bare, {}), { logo: null, fonts: 'fonts' }, 'a setup that names no logo asks for none');
  const noFiles = project({ 'fonts/README.md': 'put them here' });
  assert.equal(missingBrandFiles(noFiles, {}).fonts, 'fonts', 'a folder with no font file in it is an empty folder');
});

test('the logo and the fonts come from the store that keeps them, into where the setup names them', async () => {
  const d = project({});
  const s = fakeStore({ [`${SETUP_PATH}/brand/logo.svg`]: '<svg id="acme"/>', [`${SETUP_PATH}/fonts/Acme-Regular.woff2`]: 'woff-bytes', [`${SETUP_PATH}/README.md`]: 'not a font' });
  const r = await takeBrandFiles(d, {}, { logo: 'assets/logo.svg', fonts: 'src/fonts' }, { stores: s.stores });
  assert.deepEqual(r.took.sort(), ['assets/logo.svg', join('src/fonts', 'Acme-Regular.woff2')].sort(), r.why ?? '');
  assert.equal(readFileSync(join(d, 'assets/logo.svg'), 'utf8'), '<svg id="acme"/>');
  assert.deepEqual(readdirSync(join(d, 'src/fonts')), ['Acme-Regular.woff2'], 'the fonts, and nothing else the folder holds');
  assert.ok(s.asked.some((p) => p.includes(`path=${SETUP_PATH}`)), `the store's ${SETUP_PATH}/ folder is where they live`);
});

test('a store with nothing to give, and no store at all, each say which it was', async () => {
  const bare = await takeBrandFiles(project(), {}, { logo: 'logo.svg' }, { stores: fakeStore({}).stores });
  assert.deepEqual(bare.took, []);
  assert.match(bare.why, new RegExp(`${SETUP_PATH}/ holds no logo or fonts`));
  const nowhere = await takeBrandFiles(project(), {}, { logo: 'logo.svg' }, { stores: { storesOf: () => ({ styleguide: {}, snapshots: {} }), gitlabApi: () => null } });
  assert.deepEqual(nowhere, { took: [], why: 'no store holds them' });
});

test('a page is never stopped for its logo and fonts: they are taken, and only the logo is named as missing', async () => {
  const d = project({ ...captured, 'src/styles/tokens.css': ':root { --base-typography-fontFamily: inter; }' });
  const cfg = named({ styleguide: { logo: 'assets/logo.svg' }, paths: { fonts: 'src/fonts', themeCSS: ['src/styles/tokens.css'] } });
  const s = fakeStore({ [`${SETUP_PATH}/logo.svg`]: '<svg/>' });
  const i = await inputsOnRun(d, cfg, { take: (R, c, w) => takeBrandFiles(R, c, w, { stores: s.stores }) });
  assert.equal(i.stop, false, 'a plain page is not an untrue one');
  const said = i.lines.join('\n');
  assert.match(said, /🎨 Taken from the store for this page: assets\/logo\.svg/);
  assert.ok(!/built without a logo/.test(said), 'the logo arrived, so nothing is said about it');
  // The store had no font files, and nothing here says a word about fonts or tokens. Counting files in a folder is
  // not a judgement, and was checked against a real system to be sure: its tokens name one family, the files it keeps
  // are of another, and its page draws the named one perfectly - the build fetched it from a font service. A warning
  // here would have been wrong about a page that was right. The build says which family was found nowhere, after it
  // has looked in the system's own files and on the services (font-embed.mjs).
  assert.ok(!/font/i.test(said), `fonts are the build's judgement, not this one: ${said}`);
});

test('a run that reads nothing over the network says what the page is built without, and asks the store for nothing', async () => {
  let asked = 0;
  const i = await inputsOnRun(project(captured), { styleguide: { logo: 'logo.svg' } }, { offline: true, take: async () => { asked++; return { took: [], why: '' }; } });
  assert.equal(i.stop, false);
  assert.equal(asked, 0, 'offline asks the store for nothing');
  assert.match(i.lines.join('\n'), /logo\.svg and fonts not here, and this run reads nothing over the network/);
});

test('the style guide is never built from a capture that is not there', async () => {
  // What a person on the team had today: a page whose every component read as code-only and whose parity figures
  // were of nothing, because the capture never arrived. --styleguide does not pass through the code capture, so the
  // build asks for itself.
  const d = project({});
  writeFileSync(join(d, 'ds-config.json'), JSON.stringify(named()));
  const engine = join(ENGINE, 'lib', 'styleguide-gen.mjs');
  const r = spawnSync(process.execPath, ['-e', `import(${JSON.stringify(engine)}).then((m) => m.generateStyleguide(${JSON.stringify(d)}, ${JSON.stringify(named())}, { partsOnly: true, offline: true }))`], { encoding: 'utf8' });
  assert.equal(r.status, 2, r.stdout + r.stderr);
  assert.match(r.stderr, /❌ The Figma capture is not here/);
  assert.equal(existsSync(join(d, 'styleguide', 'index.html')), false, 'nothing was written');
});
