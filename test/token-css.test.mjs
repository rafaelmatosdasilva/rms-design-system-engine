// token-css.mjs - the stylesheets that declare the tokens are there, or the run says so. A hosted file the engine
// wrote itself is taken again from the addresses the setup kept; one a person named stops the run.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { missingThemeCss, hostedSources, modeNames, retakeHosted, themeCssOnRun, HOSTED_FILE } from '../lib/token-css.mjs';
import { tempDir } from './helpers.mjs';

const HOSTED = 'https://files.acme.test/kit/light_desktop.css';
const css = (name, value) => `:root { --acme-accent-color: ${value}; --acme-gap-m: 8px; } /* ${name} */`;
// A host that answers for the modes it has; anything else is a 404.
const fakeHost = (has = { light_desktop: '#0037fa', dark_desktop: '#99b0ff', light_phone: '#0037fa' }) => {
  const asked = [];
  const fetchImpl = async (url) => {
    asked.push(url);
    const m = /\/([\w-]+)\.css$/.exec(String(url));
    const body = m && has[m[1]];
    return body
      ? { ok: true, status: 200, text: async () => css(m[1], body) }
      : { ok: false, status: 404, text: async () => 'not found' };
  };
  return { asked, fetchImpl };
};
const project = (cfg, files = {}) => {
  const d = tempDir('tokencss-');
  writeFileSync(join(d, 'ds-config.json'), JSON.stringify(cfg, null, 2));
  for (const [p, body] of Object.entries(files)) { mkdirSync(join(d, p, '..'), { recursive: true }); writeFileSync(join(d, p), body); }
  return d;
};

test('a token stylesheet the setup named and is not on disk is the one reported; a URL there is never missing', () => {
  const d = project({}, { 'src/styles/main.scss': '@use "x";' });
  const cfg = { paths: { themeCSS: ['src/styles/main.scss', HOSTED_FILE, 'https://files.acme.test/tokens.css'] } };
  assert.deepEqual(missingThemeCss(d, cfg), [HOSTED_FILE]);
  writeFileSync(join(d, 'ds-config.json'), '{}');
  assert.deepEqual(missingThemeCss(d, { paths: {} }), [], 'a setup that names none asks for none');
});

test('where the hosted file came from: what the setup kept, else what the code loads; an address built as it runs is not one', () => {
  const d = project({});
  assert.deepEqual(hostedSources(d, { paths: { themeCSSFrom: [HOSTED] } }), [HOSTED], 'what the setup kept');
  assert.deepEqual(hostedSources(d, {}, { hints: [HOSTED, 'https://files.acme.test/kit/${theme}_desktop.css'] }), [HOSTED], 'a template is not an address the engine can ask for');
  assert.deepEqual(hostedSources(d, {}), [], 'nothing kept and nothing in the code: nothing to ask');
});

test('taken again: the addresses kept, plus the same address in every mode the system has', async () => {
  const d = project({}, { 'src/styles/figma-vars.snapshot.json': JSON.stringify({ modeVariants: { Theme: { modes: [{ snapshotKey: 'light' }, { snapshotKey: 'dark' }] }, Breakpoint: { modes: [{ snapshotKey: 'desktop' }, { snapshotKey: 'phone' }] } } }) });
  const cfg = { paths: { themeCSSFrom: [HOSTED], snapshotVars: 'src/styles/figma-vars.snapshot.json' } };
  assert.deepEqual(modeNames(d, cfg), ['light', 'dark', 'desktop', 'phone']);
  const h = fakeHost();
  const r = await retakeHosted(d, cfg, { fetchImpl: h.fetchImpl });
  assert.equal(r.ok, true, r.line);
  assert.equal(r.took, 3, 'the one named and the two other modes that answer');
  assert.match(r.line, /taken again from https:\/\/files\.acme\.test/);
  const written = readFileSync(join(d, HOSTED_FILE), 'utf8');
  assert.match(written, /--acme-accent-color/, 'the tokens are in the file');
  assert.ok(h.asked.some((u) => u.endsWith('dark_desktop.css')) && h.asked.some((u) => u.endsWith('light_phone.css')), 'every mode asked for');
});

test('nothing says where it came from: nothing is written, and the line asks for the address once', async () => {
  const d = project({});
  const r = await retakeHosted(d, {}, { fetchImpl: fakeHost().fetchImpl });
  assert.equal(r.ok, false);
  assert.match(r.line, /Nothing says where .* was taken from/);
  assert.match(r.line, /--refresh-token-css/);
  assert.equal(existsSync(join(d, HOSTED_FILE)), false);
});

test('a hosted file gone is taken again and the run carries on', async () => {
  const d = project({}, { 'src/styles/figma-vars.snapshot.json': '{}' });
  const cfg = { paths: { themeCSS: [HOSTED_FILE], themeCSSFrom: [HOSTED], snapshotVars: 'src/styles/figma-vars.snapshot.json' } };
  const t = await themeCssOnRun(d, cfg, { fetchImpl: fakeHost().fetchImpl });
  assert.equal(t.stop, false, t.lines.join('\n'));
  assert.match(t.lines.join('\n'), /taken again/);
  assert.equal(missingThemeCss(d, cfg).length, 0, 'the file is back');
});

test('a hosted file gone that cannot be taken again stops the run, and so does a file a person named', async () => {
  const d = project({});
  const cannot = await themeCssOnRun(d, { paths: { themeCSS: [HOSTED_FILE] } }, { fetchImpl: fakeHost().fetchImpl });
  assert.equal(cannot.stop, true);
  assert.match(cannot.lines.join('\n'), /❌ The design tokens are read from/);
  assert.match(cannot.lines.join('\n'), /NEXT: tell the person which file is missing/);

  const theirs = await themeCssOnRun(d, { paths: { themeCSS: ['src/tokens.css'] } }, { fetchImpl: fakeHost().fetchImpl });
  assert.equal(theirs.stop, true);
  assert.match(theirs.lines.join('\n'), /src\/tokens\.css/);
  assert.ok(!theirs.lines.join('\n').includes('taken again'), 'a file the engine did not write is never fetched');
});

test('a run that reads nothing over the network says what is missing and stops, never takes it', async () => {
  const d = project({});
  let asked = 0;
  const t = await themeCssOnRun(d, { paths: { themeCSS: [HOSTED_FILE], themeCSSFrom: [HOSTED] } }, { offline: true, fetchImpl: async () => { asked++; return { ok: false, status: 404, text: async () => '' }; } });
  assert.equal(t.stop, true);
  assert.equal(asked, 0, 'offline asks the network for nothing');
  assert.match(t.lines.join('\n'), /reads nothing over the network/);
});

test('every stylesheet the file is built from is there, with nothing on disk to start from', async () => {
  const d = project({});
  const h = fakeHost({ light_desktop: '#0037fa' });
  const r = await retakeHosted(d, { paths: { themeCSSFrom: [HOSTED] } }, { fetchImpl: h.fetchImpl });
  assert.equal(r.ok, true, r.line);
  assert.match(r.line, /1 stylesheet\(s\)/);
  assert.match(readFileSync(join(d, HOSTED_FILE), 'utf8'), /--acme-gap-m/);
});

test('a system that builds its tokens from Figma is never stopped for the file they go into', async () => {
  const d = project({});
  const cfg = { build: true, paths: { themeCSS: ['src/styles/tokens.css'] } };
  assert.deepEqual(missingThemeCss(d, cfg), ['src/styles/tokens.css'], 'the file is not there yet');
  const t = await themeCssOnRun(d, cfg, { fetchImpl: fakeHost().fetchImpl });
  assert.deepEqual(t, { lines: [], stop: false }, 'the gate for that file lists the tokens to write into it');
});
