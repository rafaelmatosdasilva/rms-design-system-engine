// Figma read in chunks the engine checks, by the Figma tool or by figma-cli, and built into the vars
// snapshot with the capture recipe's own scripts. A small stand-in Figma file, and a large one (test/figma-standin.mjs)
// sized like a real design system's, read in compact answers that give the same snapshot as the full form before.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, existsSync, utimesSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { varsScript, readCapture, importCapture, captureWithFigmaCli, figmaCliEval, parseAnswer, cyrb53, recipeScripts, importLines, varsItems, encodeValue, decodeValue } from '../figma-capture.mjs';
import { snapshotsFromDesign } from '../figma-cli-import.mjs';
import { largeVarsFile, asFigma as asLargeFigma } from './figma-standin.mjs';

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

test('a file of 1,900 variables reads in about ten answers, each near the cap, with the checksums of every chunk and checked against its own', async () => {
  const f = largeVarsFile(), run = async (code) => new AsyncFunction('figma', code)(asLargeFigma(f));
  const sums = await run(varsScript('sums'));
  assert.ok(sums.of >= 8 && sums.of <= 12, `about ten chunks (${sums.of})`);
  let total = 0;
  for (let n = 0; n < sums.of; n++) {
    const a = await run(varsScript(n)), size = Buffer.byteLength(JSON.stringify(a));
    assert.ok(size <= 19000, `chunk ${n}: ${size} bytes, within 19,000`);
    total += size;
    assert.deepEqual(a.sums, sums.sums);
    assert.equal(cyrb53(JSON.stringify(a.d)), a.sum, 'the checksum Figma computed is the one the engine computes');
  }
  assert.ok(total / sums.of > 14000, 'the answers are full');
  assert.equal((await run(varsScript(sums.of))).error, 'no such chunk');
  // The script is short and only reads.
  assert.ok(varsScript(0).length < 8000);
  assert.doesNotMatch(varsScript(0), /setCurrentPage|\.set[A-Z]\w*\(|\.remove\(|create[A-Z]\w*\(/);
  // An answer the tool wrapped in words still reads.
  assert.deepEqual(parseAnswer(`Result:\n${JSON.stringify({ capture: 'vars', of: 1, sums: ['x'] })}\n`), { capture: 'vars', of: 1, sums: ['x'] });
});

test('the snapshot is the one the recipe gives through the Figma tool; a chunk cut or changed while saved is read again', async () => {
  const f = makeFile(), run = runIn(f), root = project(), dir = join(root, 'cap');
  const { mkdirSync } = await import('node:fs'); mkdirSync(dir, { recursive: true });
  // A small budget, so this small file needs several chunks.
  const script = (n) => varsScript(n, 3000);
  const { of } = await run(script('sums'));
  assert.ok(of >= 4, `several chunks (${of})`);
  for (let n = 0; n < of; n++) writeFileSync(join(dir, `vars-${n}.json`), n === 1 ? JSON.stringify(await run(script(n)), null, 2) : JSON.stringify(await run(script(n))));
  // One saved answer was changed by hand: it is refused, and its chunk is asked again.
  const one = JSON.parse(readFileSync(join(dir, 'vars-2.json'), 'utf8')); one.d.v[0][2] += 'edited'; writeFileSync(join(dir, 'vars-2.json'), JSON.stringify(one));
  let r = await importCapture(root, cfg, { dir });
  assert.equal(r.ok, false);
  assert.deepEqual(r.missing, [2]);
  assert.match(r.bad[0], /^vars-2\.json: its checksum does not match/);
  assert.match(importLines(r, 'cap').join('\n'), /1 of \d+ chunks still to read: 2\.\nNEXT: for each, run rms-design-system-engine --capture-script vars <chunk>/);
  writeFileSync(join(dir, 'vars-2.json'), JSON.stringify(await run(script(2))));
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

test('on a refresh only the checksums are asked, and only the chunk that changed is read again', async () => {
  const f = largeVarsFile(), root = project(), dir = join(root, 'cap');
  const run = async (code) => JSON.stringify(await new AsyncFunction('figma', code)(asLargeFigma(f)));
  const first = await captureWithFigmaCli(root, cfg, { run, dir });
  assert.equal(first.ok, true);
  // A designer changes one colour; a refresh asks for the checksums and that one chunk.
  const theme = f.collections.find((c) => c.name === 'Theme'), token = f.vars[theme.variableIds[100]];
  token.valuesByMode[theme.modes[0].modeId] = { r: 1, g: 0, b: 0, a: 1 };
  const asked = [];
  const r = await captureWithFigmaCli(root, cfg, { run: async (code) => { asked.push(/CHUNK=('sums'|\d+)/.exec(code)[1]); return run(code); }, dir });
  assert.equal(r.ok, true);
  assert.equal(asked[0], "'sums'");
  assert.equal(asked.length, 2, `the checksums and one chunk (${asked.join(', ')})`);
  assert.equal(JSON.parse(readFileSync(join(root, 'src/figma-vars.snapshot.json'), 'utf8')).color.light[token.name], '#ff0000');
  assert.ok(readdirSync(dir).length <= first.counts.chunks + 2, 'the chunk replaced is dropped');
  // A variable added, or one taken out, moves only the chunk it is in (two when the budget moves a boundary), not
  // every chunk after it.
  const sums = async () => JSON.parse(await run(varsScript('sums'))).sums;
  const before = await sums();
  const at = theme.variableIds[40];
  theme.variableIds.splice(41, 0, 'VariableID:1:1'); f.vars['VariableID:1:1'] = { ...f.vars[at], id: 'VariableID:1:1', name: `${f.vars[at].name}-new` };
  assert.ok((await sums()).filter((s) => !before.includes(s)).length <= 2, 'a variable added');
  theme.variableIds.splice(41, 1); theme.variableIds.splice(300, 1);
  assert.ok((await sums()).filter((s) => !before.includes(s)).length <= 2, 'a variable taken out');
});

test('figma-cli and the Figma tool give the same snapshot; the design.json import agrees on what design.json holds', async () => {
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

test('the commands write the script for a chunk and import what was saved', async () => {
  const { spawnSync } = await import('node:child_process');

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
  assert.match(r.stdout, /✓ Figma's variables read in \d+ checked chunks?: 484 colours in 2 modes, 2 sizes, 3 text styles, the scopes of 245 variables → src\/figma-vars\.snapshot\.json/);
});

// On a real file: Tidepool's answer, saved as the Figma tool returned it (test/fixtures/tidepool-figma/figma-capture).
test('on a real file: Figma\'s checksum holds, and the Figma tool, the recipe\'s capture and figma-cli agree', async () => {
  const { varsFromItems } = await import('../figma-capture.mjs');
  const { tidepoolDesign } = await import('./figma-cli-design.mjs');
  const TP = join(fileURLToPath(new URL('.', import.meta.url)), 'fixtures', 'tidepool-figma');
  const answer = JSON.parse(readFileSync(join(TP, 'figma-capture', 'vars-0.json'), 'utf8'));
  assert.equal(cyrb53(JSON.stringify(answer.items)), answer.sum, 'the checksum computed in Figma is the engine\'s');
  const tpCfg = JSON.parse(readFileSync(join(TP, 'ds-config.json'), 'utf8'));
  const built = await varsFromItems(answer.items, tpCfg);
  // The same file captured before with the recipe, value by value.
  const recipe = JSON.parse(readFileSync(join(TP, 'src', 'figma', 'figma-vars.snapshot.json'), 'utf8'));
  for (const k of ['color', 'sizing']) assert.deepEqual(built[k], recipe[k], k);
  // Each style now records its family too (the snapshot was captured before it did): the rest is the same.
  const noFamily = Object.fromEntries(Object.entries(built.typography).map(([n, { family, ...rest }]) => [n, rest]));
  assert.deepEqual(noFamily, recipe.typography, 'typography');
  assert.ok(Object.values(built.typography).every((t) => t.family === 'Inter'));
  assert.deepEqual(built._collections, { color: 'Theme', colorModes: ['Light', 'Dark'], sizing: ['Sizing'] });
  assert.deepEqual(built.variableScopes['VariableID:1:17'], { name: 'radii/button', scopes: ['CORNER_RADIUS'] });
  // figma-cli's design.json of the same file gives the same colours and sizes.
  const fromDesign = snapshotsFromDesign(tidepoolDesign(), tpCfg).vars;
  assert.deepEqual(fromDesign.color, built.color);
  assert.deepEqual(fromDesign.sizing, built.sizing);
});

// The capture in the form before the compact one: every variable, text style and effect style as Figma holds it (an
// items list), in answers of 14,000 bytes of items (a boundary after an item whose id hashes to it), each with every
// chunk's checksum.
async function fullForm(f) {
  const fig = asLargeFigma(f), collections = await fig.variables.getLocalVariableCollectionsAsync(), idToVar = {}, order = [];
  for (const c of collections) for (const id of c.variableIds) { const v = await fig.variables.getVariableByIdAsync(id); if (v && !idToVar[id]) { idToVar[id] = v; order.push(id); } }
  const texts = await fig.getLocalTextStylesAsync();
  for (const st of texts) for (const a of Object.values(st.boundVariables || {})) for (const x of [].concat(a)) { if (!x?.id || idToVar[x.id]) continue; const t = await fig.variables.getVariableByIdAsync(x.id); if (t) { idToVar[x.id] = t; order.push(x.id); } }
  const tried = {};
  for (let added = 1; added;) { added = 0; for (const id of [...order]) for (const val of Object.values(idToVar[id].valuesByMode)) { const a = val?.type === 'VARIABLE_ALIAS' ? val : val?.color?.type === 'VARIABLE_ALIAS' ? val.color : null; if (!a || idToVar[a.id] || tried[a.id]) continue; tried[a.id] = 1; const t = await fig.variables.getVariableByIdAsync(a.id); if (t) { idToVar[a.id] = t; order.push(a.id); added++; } } }
  const items = collections.map((c) => ({ k: 'collection', id: c.id, v: { id: c.id, name: c.name, modes: c.modes.map((m) => ({ modeId: m.modeId, name: m.name })) } }));
  for (const id of order) { const v = idToVar[id]; items.push({ k: 'var', id, v: { id: v.id, name: v.name, resolvedType: v.resolvedType, variableCollectionId: v.variableCollectionId, valuesByMode: v.valuesByMode, scopes: [...(v.scopes || [])], description: v.description || '', remote: !!v.remote } }); }
  for (const st of texts) items.push({ k: 'text', id: st.id, v: { id: st.id, name: st.name, fontSize: st.fontSize, fontName: st.fontName, lineHeight: st.lineHeight, letterSpacing: st.letterSpacing, paragraphSpacing: st.paragraphSpacing, textCase: st.textCase, boundVariables: st.boundVariables || {}, description: st.description || '' } });
  for (const st of await fig.getLocalEffectStylesAsync()) items.push({ k: 'effect', id: st.id, v: { id: st.id, name: st.name, effects: st.effects } });
  const chunks = [];
  let cur = [], size = 0;
  for (const it of JSON.parse(JSON.stringify(items))) { const b = Buffer.byteLength(JSON.stringify(it)) + 1; if (cur.length && size + b > 14000) { chunks.push(cur); cur = []; size = 0; } cur.push(it); size += b; if (parseInt(cyrb53(it.id).slice(-2), 16) % 24 === 0) { chunks.push(cur); cur = []; size = 0; } }
  if (cur.length) chunks.push(cur);
  const sums = chunks.map((c) => cyrb53(JSON.stringify(c)));
  return chunks.map((c, n) => ({ capture: 'vars', chunk: n, of: chunks.length, sums, sum: sums[n], items: c }));
}
const largeCfg = { ...cfg, figma: { ...cfg.figma, motionCollection: 'Primitives' } };
const withoutRun = (snap) => { const { _source, _built: { at, ...built }, ...rest } = snap; return JSON.stringify({ ...rest, _built: built }, null, 2); };

test('the compact answers give, byte for byte, the snapshot the full form gives, in about a tenth of the answers and bytes', async () => {
  const f = largeVarsFile(), run = async (code) => new AsyncFunction('figma', code)(asLargeFigma(f));
  const now = '2026-10-14T00:00:00.000Z';
  // The form before: about 110 answers.
  const full = await fullForm(f), a = project();
  mkdirSync(join(a, 'cap'), { recursive: true });
  for (const x of full) writeFileSync(join(a, 'cap', `vars-${x.chunk}.json`), JSON.stringify(x));
  const ra = await importCapture(a, largeCfg, { dir: join(a, 'cap'), now });
  assert.equal(ra.ok, true, 'answers saved in the form before still read');
  // The compact form.
  const b = project(), { of } = await run(varsScript('sums'));
  mkdirSync(join(b, 'cap'), { recursive: true });
  const compact = [];
  for (let n = 0; n < of; n++) { const x = await run(varsScript(n)); compact.push(x); writeFileSync(join(b, 'cap', `vars-${n}.json`), JSON.stringify(x)); }
  const rb = await importCapture(b, largeCfg, { dir: join(b, 'cap'), now });
  assert.equal(rb.ok, true);
  const snapA = JSON.parse(readFileSync(join(a, 'src/figma-vars.snapshot.json'), 'utf8')), snapB = JSON.parse(readFileSync(join(b, 'src/figma-vars.snapshot.json'), 'utf8'));
  assert.equal(withoutRun(snapB), withoutRun(snapA), 'the same snapshot, but for how many chunks it was read in');
  assert.equal(Object.keys(snapA.color.light).length, 900);
  assert.equal(Object.keys(snapA.typography).length, 17);
  assert.equal(Object.keys(snapA.effects).length, 27);
  assert.ok(Object.keys(snapA.motion).length > 100 && Object.keys(snapA.modeVariants.Sizing.vars).length > 50);
  // The items the recipe's scripts read are Figma's own, but for what the recipe never reads finer than hex.
  const items = varsItems(compact.map((x) => x.d)), held = full.flatMap((x) => x.items);
  assert.equal(items.length, held.length);
  for (const [i, it] of items.entries()) if (it.k !== 'var' || it.v.resolvedType !== 'COLOR') assert.deepEqual(it, held[i], it.id);
  // About a tenth: the chunk count and the bytes the agent reads and writes.
  const bytes = (xs) => xs.reduce((n, x) => n + Buffer.byteLength(JSON.stringify(x)), 0);
  assert.ok(full.length >= 100 && of * 9 <= full.length, `${full.length} answers before, ${of} now`);
  assert.ok(bytes(full) >= 5 * bytes(compact), `${bytes(full)} bytes before, ${bytes(compact)} now`);
});

test('a value travels exactly: a 32-bit float as its shortest decimal, a string that looks like one as itself', () => {
  for (const x of [Math.fround(1.2), Math.fround(0.08), Math.fround(-0.4), 0.1, 1.618033988749895, 12, -0, 1e-7, Math.fround(1e-7), '~1.2', '~', '#fff', 'plain', true, null])
    assert.ok(Object.is(decodeValue(JSON.parse(JSON.stringify(encodeValue(x)))), x === -0 ? 0 : x), String(x));
  assert.equal(encodeValue(Math.fround(1.2)), '~1.2');
  assert.deepEqual(decodeValue(encodeValue({ a: [Math.fround(0.3), '~x'], b: { c: 'y' } })), { a: [Math.fround(0.3), '~x'], b: { c: 'y' } });
});

test('answers saved in the form before still read; new checksums name every chunk to read again, and say why', async () => {
  const f = largeVarsFile(), root = project(), dir = join(root, 'cap');
  mkdirSync(dir, { recursive: true });
  const full = await fullForm(f), past = new Date(Date.now() - 3600e3);
  for (const x of full) { writeFileSync(join(dir, `vars-${x.chunk}.json`), JSON.stringify(x)); utimesSync(join(dir, `vars-${x.chunk}.json`), past, past); }
  // The checksums asked again with this engine: compact, so none of the saved chunks matches.
  const run = async (code) => new AsyncFunction('figma', code)(asLargeFigma(f));
  const sums = await run(varsScript('sums'));
  writeFileSync(join(dir, 'vars-sums.json'), JSON.stringify(sums));
  let r = await importCapture(root, cfg, { dir });
  assert.equal(r.ok, false);
  assert.deepEqual(r.missing, [...Array(sums.of).keys()]);
  assert.equal(r.older.length, full.length);
  const said = importLines(r, 'cap').join('\n');
  assert.match(said, new RegExp(`^${sums.of} of ${sums.of} chunks still to read: 0, 1, `));
  assert.match(said, /\d+ answers were saved in the form before \(vars-\d+\.json, vars-\d+\.json, vars-\d+\.json, …\): the checksums now are of the compact form, so read the chunks named again; the import clears the old answers\./);
  // A compact chunk cut while it was saved is refused like any other.
  for (let n = 0; n < sums.of; n++) writeFileSync(join(dir, `vars-${n}.json`), JSON.stringify(await run(varsScript(n))));
  const text = readFileSync(join(dir, 'vars-3.json'), 'utf8'), cut = JSON.parse(text);
  cut.d.v[0][2] += ' (cut)';
  writeFileSync(join(dir, 'vars-3.json'), JSON.stringify(cut));
  r = await importCapture(root, cfg, { dir });
  assert.deepEqual(r.missing, [3]);
  assert.match(r.bad.join('\n'), /^vars-3\.json: its checksum does not match/m);
  writeFileSync(join(dir, 'vars-3.json'), text);
  r = await importCapture(root, cfg, { dir });
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.ok(readdirSync(dir).every((x) => x === 'vars-sums.json' || Number(/\d+/.exec(x)?.[0]) < sums.of), 'the answers in the form before are cleared');
});

test('figma-cli: a call that fails is tried once more after a pause; two failures say what figma-cli printed', async () => {
  const root = mkdtempSync(join(tmpdir(), 'figma-cli-eval-'));
  const answers = (list) => { const left = [...list], asked = []; return { asked, spawn: (cmd, args) => { asked.push([cmd, args[0]]); return left.shift(); } }; };
  const paused = [];
  const pause = async (ms) => { paused.push(ms); };
  let f = answers([{ status: 1, stdout: '', stderr: '' }, { status: 0, stdout: '{"ok":1}\n', stderr: '' }]);
  assert.equal(await figmaCliEval(root, { spawn: f.spawn, pause, retryMs: 7 })('return 1'), '{"ok":1}\n');
  assert.deepEqual(f.asked, [['figma-cli', 'eval'], ['figma-cli', 'eval']]);
  assert.deepEqual(paused, [7]);
  f = answers([{ status: 1, stdout: 'x\n✗ Not connected to Figma\n\n', stderr: '' }, { status: 1, stdout: '✗ Execution timeout (90s).\n', stderr: '' }]);
  await assert.rejects(figmaCliEval(root, { spawn: f.spawn, pause })('return 1'), /did not finish, twice: ✗ Execution timeout \(90s\)\.$/);
  f = answers([{ status: 0, stdout: '1\n' }]);
  assert.equal(await figmaCliEval(root, { spawn: f.spawn, pause })('return 1'), '1\n');
  assert.equal(f.asked.length, 1, 'a call that works is made once');
});
