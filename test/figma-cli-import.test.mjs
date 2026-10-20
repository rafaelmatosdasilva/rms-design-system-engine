// figma-cli as the Figma reader: its design.json becomes the engine's snapshots, and what it does not hold is kept.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, cpSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { snapshotsFromDesign, varsFromDesign, importFigmaCli, tokensFromDesign } from '../figma-cli-import.mjs';
import { tidepoolDesign } from './figma-cli-design.mjs';

const ENGINE = dirname(dirname(fileURLToPath(import.meta.url)));
const TP = join(ENGINE, 'test', 'fixtures', 'tidepool-figma');
const json = (p) => JSON.parse(readFileSync(join(TP, p), 'utf8'));
const tpVars = json('src/figma/figma-vars.snapshot.json');
const tpStruct = json('src/figma/figma-structure.snapshot.json').components;
const tpCfg = json('ds-config.json');

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
  assert.deepEqual(out.counts, { modes: 2, colours: Object.keys(tpVars.color.light).length * 2, sizing: Object.keys(tpVars.sizing).length, components: 6 });
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

test('each collection\'s modes in Figma\'s own order, by snapshot key, for the style guide to list them so', () => {
  const design = tidepoolDesign();
  const col = (design.variables ?? []).find((c) => (c.modes ?? []).length > 1);
  col.modes = [...col.modes].reverse();
  const v = varsFromDesign(design, tpCfg);
  const key = (name) => (tpCfg.figma?.modes ?? []).find((m) => m.name === name)?.snapshotKey ?? name.toLowerCase();
  assert.deepEqual(Object.values(v.modeOrder)[0], col.modes.map(key));
  assert.ok(snapshotsFromDesign(design, tpCfg, {}, 'T').vars._modeOrder, 'written on the vars snapshot');
});

test('a hidden stroke paint is not a stroke', async () => {
  const { structureFromComponent } = await import('../figma-cli-import.mjs');
  assert.equal(structureFromComponent({ t: 'COMPONENT', h: 24, strokes: [{ type: 'SOLID', visible: false }] }).strokeOnDefault, false);
  assert.equal(structureFromComponent({ t: 'COMPONENT', h: 24, strokes: [{ type: 'SOLID' }] }).strokeOnDefault, true);
});

test('design.json\'s read is dated to the time figma-cli wrote it when it records the day alone, so it is not older than a read that morning', async () => {
  const { readAt } = await import('../figma-cli-import.mjs');
  const at = (iso) => () => new Date(iso);
  assert.equal(readAt('2026-10-20', 'design.json', at('2026-10-20T17:05:00.000Z')), '2026-10-20T17:05:00.000Z');
  assert.equal(readAt('2026-10-20', 'design.json', at('2026-10-24T09:00:00.000Z')), '2026-10-20T00:00:00.000Z', 'a file touched days later: the day alone');
  assert.equal(readAt('2026-10-20', 'design.json', () => null), '2026-10-20T00:00:00.000Z');
  assert.equal(readAt('2026-10-20T08:00:00Z', 'design.json', at('2026-10-20T17:05:00.000Z')), '2026-10-20T08:00:00.000Z', 'a time it records is kept');
  assert.equal(readAt(undefined, 'design.json'), null);
});

test('a set\'s structure is read from its resting variant, never from a disabled or error variant Figma lists first', async () => {
  const { structureFromComponent } = await import('../figma-cli-import.mjs');
  const set = (vp, names) => ({ t: 'COMPONENT_SET', vp, kids: names.map((n, i) => ({ t: 'COMPONENT', n, h: 10 + i })) });
  assert.equal(structureFromComponent(set({ Size: { values: ['s'] }, Disabled: { values: ['true', 'false'] } }, ['Size=s, Disabled=true', 'Size=s, Disabled=false'])).defaultVariant, 'Size=s, Disabled=false');
  assert.equal(structureFromComponent(set({ State: { values: ['error', 'disabled', 'default'] } }, ['State=disabled', 'State=error', 'State=default'])).defaultVariant, 'State=default');
  assert.equal(structureFromComponent(set({ State: { values: ['disabled', 'default', 'selected'] } }, ['State=default', 'State=disabled'])).h, 10, 'the facts come from the same variant');
  assert.equal(structureFromComponent(set({ State: { values: ['Idle', 'Default'] } }, ['State=Default', 'State=Idle'])).defaultVariant, 'State=Idle');
  assert.equal(structureFromComponent(set(undefined, ['Type=a', 'Type=b'])).defaultVariant, 'Type=a', 'no State axis: Figma\'s first');
});

test('a variable that points at one no longer in the file is recorded; one into a library collection is not', () => {
  const d = tidepoolDesign();
  const col = d.variables.find((c) => (c.variables ?? []).some((v) => Object.values(v.values ?? {}).some((x) => x && typeof x === 'object' && 'alias' in x)));
  const v = col.variables.find((x) => Object.values(x.values ?? {}).some((y) => y && typeof y === 'object' && 'alias' in y));
  const mode = Object.keys(v.values).find((m) => v.values[m] && typeof v.values[m] === 'object' && 'alias' in v.values[m]);
  assert.deepEqual(varsFromDesign(d, tpCfg).brokenAliases, []);
  const target = v.values[mode].alias;
  for (const c of d.variables) c.variables = c.variables.filter((x) => x.name !== target);   // the variable it points at, deleted
  v.values = { ...v.values, other: { alias: 'surface/base', collection: 'A shared library' } };   // a library's: left alone
  assert.deepEqual(varsFromDesign(d, tpCfg).brokenAliases.filter((b) => b.name === v.name), [{ name: v.name, mode, target }]);
});

test('a fresher design.json updates the tokens an earlier chunked read kept: a link replaced by a value shows', () => {
  const design = { version: 2, variables: [{ name: 'Theme', modes: ['Light', 'Dark'], variables: [
    { name: 'base/shadow/anyDisplay', type: 'BOOLEAN', values: { Light: false, Dark: false } },
    { name: 'card/shadow/display', type: 'BOOLEAN', values: { Light: true, Dark: true } },
    { name: 'card/radius', type: 'FLOAT', values: { Light: { alias: 'base/radius', collection: 'Theme' }, Dark: 12 } },
    { name: 'base/radius', type: 'FLOAT', values: { Light: 8, Dark: 8 } },
    { name: 'card/hint', type: 'COLOR', values: { Light: { color: 'x' }, Dark: '#AABBCC' } },
  ] }] };
  const kept = [
    { name: 'card/shadow/display', collection: 'Theme', kind: 'BOOLEAN', values: { Light: 'false', Dark: 'false' }, aliases: { Light: 'base/shadow/anyDisplay', Dark: 'base/shadow/anyDisplay' } },
    { name: 'card/radius', collection: 'Theme', kind: 'FLOAT', values: { Light: '4px', Dark: '4px' } },
    { name: 'card/hint', collection: 'Theme', kind: 'COLOR', values: { Light: '#000000', Dark: '#000000' } },
    { name: 'gone/token', collection: 'Theme', kind: 'BOOLEAN', values: { Light: 'true' } },
  ];
  const [display, radius, hint, gone] = tokensFromDesign(design, kept);
  assert.deepEqual(display, { name: 'card/shadow/display', collection: 'Theme', kind: 'BOOLEAN', values: { Light: 'true', Dark: 'true' } });
  assert.deepEqual(radius.values, { Light: '8px', Dark: '12px' });
  assert.deepEqual(radius.aliases, { Light: 'base/radius' });
  assert.deepEqual(hint.values, { Light: '#000000', Dark: '#aabbcc' }, 'a value it cannot write keeps the one kept');
  assert.equal(gone, kept[3]);
  const snap = snapshotsFromDesign(design, {}, { vars: { figmaTokens: { collections: [], tokens: kept } } }, 'T');
  assert.equal(snap.vars.figmaTokens.tokens[0].values.Light, 'true');
});

test('a component named blank, or private behind a status mark (🟡 .row), is not part of the system, and one kept is dropped', () => {
  const comp = (n) => ({ t: 'COMPONENT', n, kids: [] });
  const design = { version: 2, variables: [], pages: [{ name: 'P', frames: [comp('card'), comp(' '), comp('🟡 .tableRow (deprecated)'), comp('🟡  _old'), comp('🟡 widget/disabled (deprecated)')] }] };
  const kept = { props: { '🟡 .tableCell (deprecated)': { properties: {} }, keep: { properties: {} } }, structure: { components: { ' ': {}, keep: {} } } };
  const out = snapshotsFromDesign(design, {}, kept, 'T');
  const names = Object.keys(out.props).filter((k) => !k.startsWith('_'));
  assert.ok(names.includes('card') && names.includes('keep') && names.includes('🟡 widget/disabled (deprecated)'));
  assert.ok(!names.some((n) => !n.trim() || /\.table|_old/.test(n)), names.join(','));
  assert.deepEqual(Object.keys(out.structure.components).filter((k) => !k.trim()), []);
});
