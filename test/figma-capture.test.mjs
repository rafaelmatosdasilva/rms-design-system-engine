// P6 and P7: Figma read in chunks the engine checks, by the Figma tool or by figma-cli, and built into the vars
// snapshot with the capture recipe's own scripts. A stand-in Figma file large enough to need several chunks.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { varsScript, readCapture, importCapture, captureWithFigmaCli, parseAnswer, cyrb53, recipeScripts, importLines } from '../figma-capture.mjs';
import { snapshotsFromDesign } from '../figma-cli-import.mjs';

const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor;
const rgb = (r, g, b, a = 1) => ({ r, g, b, a });
const alias = (id) => ({ type: 'VARIABLE_ALIAS', id });

// A design system's file: Theme (Light, Dark) with 240 colours, a scrim with its own opacity and one aliasing a
// library; Sizing (Desktop, Phone); Motion; text styles; an effect style.
function makeFile() {
  const vars = {}, theme = [], sizing = [], motion = [];
  const add = (list, v) => { vars[v.id] = { scopes: ['ALL_SCOPES'], description: '', remote: false, ...v }; list.push(v.id); };
  for (let i = 0; i < 240; i++) add(theme, { id: `c${i}`, name: `group${Math.floor(i / 12)}/token${i}/color`, resolvedType: 'COLOR', variableCollectionId: 'theme', valuesByMode: { L: rgb(i / 255, 0.2, 0.4), D: rgb(1 - i / 255, 0.6, 0.8) }, description: i === 3 ? 'Body text. @deprecated use text/primary' : '' });
  add(theme, { id: 'scrim', name: 'overlay/scrim/color', resolvedType: 'COLOR', variableCollectionId: 'theme', valuesByMode: { L: { color: rgb(0, 0, 0), opacity: 50 }, D: { color: rgb(0, 0, 0), opacity: 70 } } });
  add(theme, { id: 'brand', name: 'brand/color', resolvedType: 'COLOR', variableCollectionId: 'theme', valuesByMode: { L: alias('lib1'), D: alias('lib1') } });
  add(sizing, { id: 's1', name: 'gap/m', resolvedType: 'FLOAT', variableCollectionId: 'size', valuesByMode: { S1: 12, S2: 8 }, scopes: ['GAP'] });
  add(sizing, { id: 's2', name: 'radius/m', resolvedType: 'FLOAT', variableCollectionId: 'size', valuesByMode: { S1: 6, S2: 6 }, scopes: ['CORNER_RADIUS'] });
  add(motion, { id: 'm1', name: 'duration/fast', resolvedType: 'FLOAT', variableCollectionId: 'motion', valuesByMode: { M: 0.2 } });
  vars.lib1 = { id: 'lib1', name: 'brand/600', resolvedType: 'COLOR', variableCollectionId: 'library', valuesByMode: { X: rgb(0, 0.4, 1) }, scopes: [], description: '', remote: true };
  const collections = [
    { id: 'theme', name: 'Theme', modes: [{ modeId: 'L', name: 'Light' }, { modeId: 'D', name: 'Dark' }], variableIds: theme },
    { id: 'size', name: 'Sizing', modes: [{ modeId: 'S1', name: 'Desktop' }, { modeId: 'S2', name: 'Phone' }], variableIds: sizing },
    { id: 'motion', name: 'Motion', modes: [{ modeId: 'M', name: 'Value' }], variableIds: motion },
  ];
  const text = (id, name, size, style = 'Regular') => ({ id, name, fontSize: size, fontName: { family: 'Inter', style }, lineHeight: { unit: 'PIXELS', value: size + 6 }, letterSpacing: { unit: 'PIXELS', value: 0 }, textCase: 'ORIGINAL', description: '' });
  const texts = [text('t1', 'XL/Regular', 24), text('t2', 'M/Regular', 14), text('t3', 'M/Bold', 14, 'Bold')];
  const effects = [{ id: 'e1', name: 'shadow/m', effects: [{ type: 'DROP_SHADOW', offset: { x: 0, y: 2 }, radius: 8, spread: 0, color: rgb(0, 0, 0, 0.2), visible: true }] }];
  return { vars, collections, texts, effects };
}
const asFigma = (f) => ({
  variables: {
    getLocalVariableCollectionsAsync: async () => f.collections,
    getVariableByIdAsync: async (id) => f.vars[id] ?? null,
    getLocalVariablesAsync: async () => f.collections.flatMap((c) => c.variableIds.map((id) => f.vars[id])),
  },
  getLocalTextStylesAsync: async () => f.texts,
  getLocalEffectStylesAsync: async () => f.effects,
});
const runIn = (f) => async (code) => new AsyncFunction('figma', code)(asFigma(f));
const cfg = { figma: { colorCollection: 'Theme', sizingCollection: 'Sizing', primitivePrefix: 'primitives/', modes: [{ name: 'Light', snapshotKey: 'light' }, { name: 'Dark', snapshotKey: 'dark' }] }, paths: { snapshotVars: 'src/figma-vars.snapshot.json' } };
const project = () => { const d = mkdtempSync(join(tmpdir(), 'capture-')); writeFileSync(join(d, 'ds-config.json'), JSON.stringify(cfg)); return d; };

test('P6: each answer fits the Figma tool, carries the checksums of every chunk, and is checked against its own', async () => {
  const f = makeFile(), run = runIn(f);
  const sums = await run(varsScript('sums'));
  assert.ok(sums.of >= 3, `several chunks (${sums.of})`);
  for (let n = 0; n < sums.of; n++) {
    const a = await run(varsScript(n));
    assert.ok(Buffer.byteLength(JSON.stringify(a)) < 20480, `chunk ${n} fits in one answer`);
    assert.deepEqual(a.sums, sums.sums);
    assert.equal(cyrb53(JSON.stringify(a.items)), a.sum, 'the checksum Figma computed is the one the engine computes');
  }
  assert.equal((await run(varsScript(sums.of))).error, 'no such chunk');
  // An answer the tool wrapped in words still reads.
  assert.deepEqual(parseAnswer(`Result:\n${JSON.stringify({ capture: 'vars', of: 1, sums: ['x'] })}\n`), { capture: 'vars', of: 1, sums: ['x'] });
});

test('P6: the snapshot is the one the recipe gives through the Figma tool; a chunk cut or changed while saved is read again', async () => {
  const f = makeFile(), run = runIn(f), root = project(), dir = join(root, 'cap');
  const { mkdirSync } = await import('node:fs'); mkdirSync(dir, { recursive: true });
  const { of } = await run(varsScript('sums'));
  for (let n = 0; n < of; n++) writeFileSync(join(dir, `vars-${n}.json`), n === 1 ? JSON.stringify(await run(varsScript(n)), null, 2) : JSON.stringify(await run(varsScript(n))));
  // One saved answer was changed by hand: it is refused, and its chunk is asked again.
  const one = JSON.parse(readFileSync(join(dir, 'vars-2.json'), 'utf8')); one.items[0].v.name = 'edited'; writeFileSync(join(dir, 'vars-2.json'), JSON.stringify(one));
  let r = await importCapture(root, cfg, { dir });
  assert.equal(r.ok, false);
  assert.deepEqual(r.missing, [2]);
  assert.match(r.bad[0], /^vars-2\.json: its checksum does not match/);
  assert.match(importLines(r, 'cap').join('\n'), /1 of \d+ chunks still to read: 2\.\nNEXT: for each, run rms-design-system-engine --capture-script vars <chunk>/);
  writeFileSync(join(dir, 'vars-2.json'), JSON.stringify(await run(varsScript(2))));
  r = await importCapture(root, cfg, { dir });
  assert.equal(r.ok, true, JSON.stringify(r));
  const snap = JSON.parse(readFileSync(join(root, 'src/figma-vars.snapshot.json'), 'utf8'));
  // The recipe's single-pass script run straight on the file gives the same values.
  const S = recipeScripts();
  const direct = await new AsyncFunction('figma', S.single.replace("let COLOR_COLLECTION='Theme'", "let COLOR_COLLECTION='Theme'"))(asFigma(f));
  for (const k of ['color', 'aliases', 'sizing', 'typography', 'modeVariants', '_modeOrder', '_collections']) assert.deepEqual(snap[k], direct[k], k);
  assert.equal(snap.color.light['brand/color'], '#0066ff', 'a library alias resolved');
  assert.equal(snap.color.dark['overlay/scrim/color'], '#000000b3', 'a colour with its own opacity');
  assert.deepEqual(Object.keys(snap.typography), ['xl/regular', 'm/regular', 'm/bold']);
  assert.equal(snap.motion['duration/fast'], '200ms');
  assert.match(snap.effects['shadow/m'], /0px 2px 8px rgba\(0, 0, 0, 0\.2\)/);
  assert.deepEqual(snap.variableScopes.s1, { name: 'gap/m', scopes: ['GAP'] });
  assert.deepEqual(snap.tokenMeta['group0/token3/color'], { description: 'Body text. @deprecated use text/primary', deprecated: true });
  assert.deepEqual(snap.brokenAliases, []);
  assert.match(snap._source, /read in \d+ checked chunks$/);
  assert.ok(snap._built?.at && 'figmaRead' in snap._built, 'stamped with what it was built from');
});

test('P6: on a refresh only the checksums are asked, and only the chunk that changed is read again', async () => {
  const f = makeFile(), root = project(), dir = join(root, 'cap');
  const first = await captureWithFigmaCli(root, cfg, { run: async (code) => JSON.stringify(await runIn(f)(code)), dir });
  assert.equal(first.ok, true);
  // A designer changes one colour; a refresh asks for the checksums and that one chunk.
  f.vars.c100.valuesByMode.L = rgb(1, 0, 0);
  const asked = [];
  const r = await captureWithFigmaCli(root, cfg, { run: async (code) => { asked.push(/CHUNK=('sums'|\d+)/.exec(code)[1]); return JSON.stringify(await runIn(f)(code)); }, dir });
  assert.equal(r.ok, true);
  assert.equal(asked[0], "'sums'");
  assert.equal(asked.length, 2, `the checksums and one chunk (${asked.join(', ')})`);
  assert.equal(JSON.parse(readFileSync(join(root, 'src/figma-vars.snapshot.json'), 'utf8')).color.light['group8/token100/color'], '#ff0000');
  assert.ok(readdirSync(dir).length <= first.counts.chunks + 2, 'the chunk replaced is dropped');
  // A variable added moves only the chunk it lands in, not every chunk after it.
  f.collections[0].variableIds.splice(5, 0, 'new'); f.vars.new = { id: 'new', name: 'group0/new/color', resolvedType: 'COLOR', variableCollectionId: 'theme', valuesByMode: { L: rgb(0, 0, 0), D: rgb(1, 1, 1) }, scopes: [], description: '', remote: false };
  const before = readCapture(dir).sums;
  const after = (await runIn(f)(varsScript('sums'))).sums;
  assert.ok(after.filter((s) => !before.includes(s)).length <= 2, 'one chunk changes (two when the budget moves a boundary)');
});

test('P7: figma-cli and the Figma tool give the same snapshot; the design.json import agrees on what design.json holds', async () => {
  const f = makeFile();
  // Through the Figma tool: the agent saves each answer.
  const a = project(), dirA = join(a, 'cap'); (await import('node:fs')).mkdirSync(dirA, { recursive: true });
  const run = runIn(f), { of } = await run(varsScript('sums'));
  for (let n = 0; n < of; n++) writeFileSync(join(dirA, `vars-${n}.json`), JSON.stringify(await run(varsScript(n))));
  await importCapture(a, cfg, { dir: dirA });
  // Through figma-cli: the engine runs the same scripts.
  const b = project();
  await captureWithFigmaCli(b, cfg, { run: async (code) => `${JSON.stringify(await run(code))}\n`, dir: join(b, 'cap') });
  const snapA = JSON.parse(readFileSync(join(a, 'src/figma-vars.snapshot.json'), 'utf8')), snapB = JSON.parse(readFileSync(join(b, 'src/figma-vars.snapshot.json'), 'utf8'));
  for (const k of ['color', 'aliases', 'sizing', 'typography', 'modeVariants', '_modeOrder', '_collections', 'motion', 'effects', 'variableScopes', 'tokenMeta', 'brokenAliases']) assert.deepEqual(snapB[k], snapA[k], k);
  // figma-cli's design.json (names, types and every mode's value) gives the same colours, aliases, sizes and per-mode
  // values; what it does not hold (text styles, scopes, descriptions, Figma's mode order) comes from the capture.
  const hex = (c) => '#' + [c.r, c.g, c.b].map((x) => Math.round(x * 255).toString(16).padStart(2, '0')).join('').toUpperCase();
  const modeName = { L: 'Light', D: 'Dark', S1: 'Desktop', S2: 'Phone', M: 'Value' };
  const valueOf = (v) => (v?.type === 'VARIABLE_ALIAS' ? { alias: f.vars[v.id].name, collection: v.id === 'lib1' ? 'Library' : undefined } : v?.color ? hex(v.color) + Math.round((v.opacity / 100) * 255).toString(16).padStart(2, '0').toUpperCase() : typeof v === 'object' ? hex(v) : v);
  const design = { version: 2, meta: { file: 'stand-in', extractedAt: '2026-10-13' }, pages: [], variables: [
    ...f.collections.map((c) => ({ name: c.name, modes: c.modes.map((m) => m.name).sort(), variables: c.variableIds.map((id) => f.vars[id]).map((v) => ({ name: v.name, type: v.resolvedType, values: Object.fromEntries(Object.entries(v.valuesByMode).map(([m, x]) => [modeName[m], valueOf(x)])) })) })),
    { name: 'Library', modes: ['Value'], variables: [{ name: 'brand/600', type: 'COLOR', values: { Value: hex(f.vars.lib1.valuesByMode.X) } }] },
  ] };
  const fromDesign = snapshotsFromDesign(design, cfg).vars;
  assert.deepEqual(fromDesign.color, snapA.color);
  assert.deepEqual(fromDesign.aliases, snapA.aliases);
  assert.deepEqual(fromDesign.sizing, snapA.sizing);
  assert.deepEqual(fromDesign.modeVariants, snapA.modeVariants, 'every mode of a collection that is not the colours');
});

test('P6: the commands write the script for a chunk and import what was saved', async () => {
  const { spawnSync } = await import('node:child_process');
  const { fileURLToPath } = await import('node:url');
  const ENGINE = join(fileURLToPath(new URL('.', import.meta.url)), '..');
  const root = project();
  const cli = (...a) => spawnSync(process.execPath, [join(ENGINE, 'audit.mjs'), ...a], { cwd: root, encoding: 'utf8', env: { ...process.env, NO_COLOR: '1' } });
  let r = cli('--capture-script', 'vars', '0');
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const script = join(root, '.design-system-engine-out/figma-capture/vars-0.js');
  assert.ok(existsSync(script));
  assert.match(r.stdout, /NEXT: run it unchanged with the Figma tool \(use_figma\) on the design system's file, save its answer as it came to \.design-system-engine-out\/figma-capture\/vars-0\.json/);
  const f = makeFile(), run = runIn(f), { of } = await run(readFileSync(script, 'utf8'));
  for (let n = 0; n < of; n++) writeFileSync(join(root, '.design-system-engine-out/figma-capture', `vars-${n}.json`), JSON.stringify(await run(varsScript(n))));
  r = cli('--capture-import');
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /✓ Figma's variables read in \d+ checked chunks: 484 colours in 2 modes, 2 sizes, 3 text styles, the scopes of 245 variables → src\/figma-vars\.snapshot\.json/);
});
