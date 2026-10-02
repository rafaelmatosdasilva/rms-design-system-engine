// figma-cli as the Figma reader: its design.json becomes the engine's snapshots, and what it does not hold is kept.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, cpSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { snapshotsFromDesign, varsFromDesign, importFigmaCli } from '../figma-cli-import.mjs';

const ENGINE = dirname(dirname(fileURLToPath(import.meta.url)));
const TP = join(ENGINE, 'test', 'fixtures', 'tidepool-figma');
const json = (p) => JSON.parse(readFileSync(join(TP, p), 'utf8'));
const tpVars = json('src/figma/figma-vars.snapshot.json');
const tpStruct = json('src/figma/figma-structure.snapshot.json').components;
const tpCfg = json('ds-config.json');

// Tidepool as `figma-cli snapshot` writes it (format v2): variables by collection with every mode, aliases as
// { alias, collection }, bound variables as `collection:name`, and each component set's first variant walked.
function tidepoolDesign() {
  const light = tpVars.color.light, dark = tpVars.color.dark;
  const theme = Object.keys(light).map((name) => ({ name, type: 'COLOR', values: { Light: light[name], Dark: dark[name] } }));
  // The button's colour goes through a primitive in another collection, as a real system does.
  const prim = { name: 'Primitives', modes: ['Value'], variables: [
    { name: 'primitives/blue/600', type: 'COLOR', values: { Value: light['button/background/color'].toUpperCase() } }] };
  theme.find((v) => v.name === 'button/background/color').values.Light = { alias: 'primitives/blue/600', collection: 'Primitives' };
  const sizing = Object.entries(tpVars.sizing).map(([name, v]) => ({ name, type: 'FLOAT', values: { Mode: parseFloat(v) } }));
  const t = (name) => `Theme:${name}`, s = (name) => `Sizing:${name}`;
  const variant = (c) => {
    const k = { t: 'COMPONENT', n: c.defaultVariant, h: c.h, w: 80, bv: {}, kids: [] };
    if (c.paddingVar) Object.assign(k.bv, { paddingTop: s(c.paddingVar.tb), paddingBottom: s(c.paddingVar.tb), paddingLeft: s(c.paddingVar.lr), paddingRight: s(c.paddingVar.lr) });
    if (c.gapVar) k.bv.itemSpacing = s(c.gapVar);
    if (c.innerRadiusVar) Object.assign(k.bv, { topLeftRadius: s(c.innerRadiusVar), topRightRadius: s(c.innerRadiusVar) });
    if (c.colors?.fill?.token) { k.bv.fills = [t(c.colors.fill.token)]; k.fills = [light[c.colors.fill.token]]; }
    if (c.colors?.stroke?.token) { k.bv.strokes = [t(c.colors.stroke.token)]; k.strokes = [light[c.colors.stroke.token]]; k.sw = 1; }
    const text = { t: 'TEXT', n: 'Label', txt: { chars: 'x', size: 12 } };
    if (c.colors?.text?.token) { text.bv = { fills: [t(c.colors.text.token)] }; text.fills = [light[c.colors.text.token]]; }
    k.kids.push(text);
    return k;
  };
  const sets = Object.entries(tpStruct).map(([n, c]) => ({ t: 'COMPONENT_SET', n, vp: {}, kids: [variant(c)] }));
  sets.find((x) => x.n === 'chip').vp = { Size: { values: ['M', 'L'] }, Icon: { values: ['False', 'True'] } };
  // A raw colour on a variant (no variable bound) stays a raw value.
  const tag = sets.find((x) => x.n === 'tag'); tag.kids[0] = { ...tag.kids[0], n: 'Tone=Positive', bv: { ...tag.kids[0].bv, fills: undefined }, fills: ['#D6F5E3'] };
  delete tag.kids[0].bv.fills;
  return {
    version: 2, meta: { file: 'Tidepool', extractedAt: '2026-10-02', scope: null },
    pages: [{ name: 'Components', nodeCount: 40, frames: [{ t: 'FRAME', n: 'Library', kids: sets }, { t: 'COMPONENT_SET', n: '_private', vp: {}, kids: [] }] }],
    variables: [prim, { name: 'Sizing', modes: ['Mode'], variables: sizing }, { name: 'Theme', modes: ['Dark', 'Light'], variables: theme }],
  };
}

test('every colour in every mode, aliases followed to their value, and sizing in px', () => {
  const v = varsFromDesign(tidepoolDesign(), tpCfg);
  assert.deepEqual(v.color, tpVars.color);
  assert.deepEqual(v.aliases.light['button/background/color'], ['primitives/blue/600']);
  assert.equal(v.aliases.dark['button/background/color'], undefined);
  assert.deepEqual(v.sizing, tpVars.sizing);
});

test('each component: variant props, height, the variables bound to padding, gap, radius and colours, a raw colour as is', () => {
  const out = snapshotsFromDesign(tidepoolDesign(), tpCfg, {}, 'T');
  const c = out.structure.components;
  for (const name of ['button', 'chip', 'field']) {
    for (const k of ['h', 'paddingVar', 'gapVar', 'innerRadiusVar', 'strokeOnDefault']) assert.deepEqual(c[name][k], tpStruct[name][k], `${name}.${k}`);
    assert.deepEqual(c[name].colors, tpStruct[name].colors, `${name}.colors`);
  }
  assert.deepEqual(c.tag.colors.fill, { hex: '#d6f5e3' });
  assert.deepEqual(out.props.chip.properties.Size, { type: 'VARIANT', defaultValue: 'M', variantOptions: ['M', 'L'] });
  assert.equal(out.props._private, undefined, 'a private component is not part of the system');
  assert.deepEqual(out.counts, { modes: 2, colours: Object.keys(tpVars.color.light).length * 2, sizing: Object.keys(tpVars.sizing).length, components: 4 });
});

test('what design.json does not hold is kept: text styles, text props, descriptions, annotations, other variants', () => {
  const props = json('src/figma/figma-component-props.snapshot.json');
  const out = snapshotsFromDesign(tidepoolDesign(), tpCfg, { vars: tpVars, props, structure: { components: tpStruct } }, 'T');
  assert.deepEqual(out.vars.typography, tpVars.typography);
  assert.equal(out.props.chip.description, props.chip.description);
  assert.deepEqual(out.props.chip.annotations, props.chip.annotations);
  assert.deepEqual(out.props.chip.properties['Label#3:4'], props.chip.properties['Label#3:4']);
  assert.deepEqual(out.structure.components.chip.variants, tpStruct.chip.variants);
  assert.equal(out.structure.components.chip.nodeId, tpStruct.chip.nodeId);
  assert.match(out.vars._source, /figma-cli design\.json \(Tidepool\)/);
});

test('another format version is refused with what to do', () => {
  assert.throws(() => snapshotsFromDesign({ version: 1 }, {}), /design\.json format v1; this engine reads v2/);
});

test('the command writes the snapshots ds-config names, and the audit reads them', { timeout: 300000 }, () => {
  const dir = mkdtempSync(join(tmpdir(), 'figma-cli-'));
  cpSync(TP, dir, { recursive: true });
  writeFileSync(join(dir, 'design.json'), JSON.stringify(tidepoolDesign()));
  const r = importFigmaCli(dir, tpCfg, 'design.json');
  assert.equal(r.paths.vars, 'src/figma/figma-vars.snapshot.json');
  const vars = JSON.parse(readFileSync(join(dir, r.paths.vars), 'utf8'));
  assert.deepEqual(vars.color, tpVars.color);
  const a = spawnSync(process.execPath, [join(ENGINE, 'audit.mjs')], { cwd: dir, encoding: 'utf8', env: { ...process.env, NO_COLOR: '1' } });
  assert.equal(a.status, 0, a.stdout.split('\n').filter((l) => /❌/.test(l)).join('\n'));
  assert.match(a.stdout, /TO BUILD {2}17 tokens/);
});
