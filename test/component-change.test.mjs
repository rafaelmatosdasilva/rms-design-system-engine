// A change to a component the system has, in Figma (component-change.mjs): the change read from words, only what changes,
// its report from two structured reads (the capture now, and the same once the change is made), where it is used, what
// breaks, the faults it already had; and after Figma is read again, the real difference beside the predicted one.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, readFileSync, mkdirSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { tempDir } from './helpers.mjs';
import { modelOf } from '../figma-ops.mjs';
import { parseChange, changeOf, changeLines, realOf, realLines } from '../component-change.mjs';
import { grammarOf } from '../construction-grammar.mjs';
import { route } from '../route.mjs';

const ENGINE = join(dirname(fileURLToPath(import.meta.url)), '..');

// Three chips built one way, one of them (chipInput) with a dot drawn in it, not an icon instance (a rule the team
// decided); each layer with its node id.
const chip = (n, more) => ({ nodeId: `1:${n.length}`, description: `The ${n}.`, properties: { size: { type: 'VARIANT', variantOptions: ['s', 'l'], defaultValue: 's' }, 'showIcon#1:2': { type: 'BOOLEAN', defaultValue: true }, [`${more}#1:4`]: { type: 'BOOLEAN', defaultValue: false } } });
const props = { chipFilter: chip('chipFilter', 'showCount'), chipChoice: chip('chipChoice', 'showCheck'), chipInput: chip('chipInput', 'showClose'), icon: { nodeId: '9:1', description: 'An icon.', properties: {} } };
const tree = (extra = []) => ({ layout: { dir: 'HORIZONTAL' }, c: [{ t: 'FRAME', n: 'Content', id: '2:1', c: [{ t: 'INSTANCE', n: 'icon', id: '2:2', of: { name: 'icon' }, wired: { visible: 'showIcon' } }, { t: 'TEXT', n: 'Label', id: '2:3', styles: { text: 'label/m' } }, ...extra] }] });
const skel = (extra) => ({ trees: [tree(extra)], variants: [['size=s', 0], ['size=l', 0]], page: 'Chips', section: 'Chips' });
const skeleton = { chipFilter: skel(), chipChoice: skel(), chipInput: skel([{ t: 'VECTOR', n: 'Dot', id: '2:9' }]) };
const varNames = { 'V:1': { name: 'chipFilter/label/color' }, 'V:2': { name: 'text/default' }, 'V:3': { name: 'spacing/s' } };
const values = { chipFilter: { hygiene: { binds: { 'V:1': { TEXT_FILL: 'size=s/Content/Label' }, 'V:3': { GAP: 'size=s/Content' } } } } };
const captures = { props, skeleton, values, varNames };
const structure = Object.fromEntries(Object.keys(skeleton).map((n) => [n, { layout: 'HORIZONTAL' }]));
const grammar = grammarOf({ props, structure, values, varNames, skeleton }, { answers: { 'icons-are-instances': true } });
const livesIn = { products: [{ name: 'Checkout', files: 3, uses: 7 }], inside: ['filterBar'], screens: [{ name: 'Search' }] };

test('the few changes said in words: an option like another, a property on a layer, a rename, a removal, a binding', () => {
  const m = modelOf('chipFilter', captures);
  const { ops, unread } = parseChange('add xl to the chipFilter\'s size like l; add a boolean showBadge on Label, off; rename the Label layer to Text in Figma; remove the property showCount; bind Content gap to spacing/s; move chipFilter/label/color to text/default; make it nicer', m);
  assert.deepEqual(ops, [
    { op: 'addOption', axis: 'size', option: 'xl', like: 'l' },
    { op: 'addProperty', name: 'showBadge', kind: 'boolean', default: false, layer: 'Content/Label' },
    { op: 'rename', what: 'layer', from: 'Content/Label', to: 'Text' },
    { op: 'removeProperty', name: 'showCount' },
    { op: 'bind', layer: 'Content', field: 'gap', variable: 'spacing/s' },
    { op: 'rebind', from: 'chipFilter/label/color', to: 'text/default' },
  ]);
  assert.deepEqual(unread, ['make it nicer']);
  // As people say them: "an XL size … like the L one", "the L size", whatever case the axis is written in.
  assert.deepEqual(parseChange('add an XL Size to the chipFilter in Figma, like the l one', m).ops, [{ op: 'addOption', axis: 'size', option: 'XL', like: 'l' }]);
  assert.deepEqual(parseChange('remove the l size from the chipFilter in Figma', m).ops, [{ op: 'removeOption', axis: 'size', option: 'l' }]);
  // A variant axis Figma calls a property is renamed as an axis.
  assert.deepEqual(parseChange('rename the property size to scale', m).ops, [{ op: 'rename', what: 'axis', from: 'size', to: 'scale' }]);
});

test('more said in words: a description without quotes, an option named after its axis, a layer in any case', () => {
  const m = modelOf('chipFilter', captures);
  assert.deepEqual(parseChange('change the description to A chip for filters', m).ops, [{ op: 'describe', text: 'A chip for filters' }]);
  assert.deepEqual(parseChange('remove the size small', m).ops, [{ op: 'removeOption', axis: 'size', option: 's' }]);
  assert.deepEqual(parseChange('remove the Icon', m).ops, [{ op: 'removeLayer', layer: 'Content/icon' }]);
  assert.deepEqual(parseChange('add XL to Size like L', m).ops, [{ op: 'addOption', axis: 'size', option: 'XL', like: 'L' }]);
});

test('the report: what changes, where it is used, what breaks, what it adds, and the faults it already had, apart', () => {
  const ops = parseChange('add xl to size like l; remove the property showCount; rename Label layer to Text', modelOf('chipInput', captures)).ops;
  const ch = changeOf({ component: 'chipInput', asked: 'x', ops: [...ops, { op: 'removeProperty', name: 'showClose' }], captures, grammar, livesIn });
  assert.deepEqual(ch.questions.map((q) => q.ask), ['chipInput has no property showCount.']);
  assert.deepEqual(ch.report.skeleton, [{ change: 'renamed', what: 'layer', from: 'Content/Label', to: 'Content/Text' }]);
  assert.deepEqual(ch.report.architecture.map((x) => `${x.change} ${x.what}`), ['added option size=xl', 'removed property showClose', 'changed variants']);
  assert.deepEqual(ch.held.map((h) => h.what), ['a new option, size=xl, on chipInput']);
  assert.equal(ch.breaking.length, 1);
  assert.deepEqual(ch.faults.map((f) => `${f.rule}: ${f.value}`), ['icons-are-instances: Content/Dot']);
  const lines = changeLines(ch).join('\n');
  assert.match(lines, /Where it is used: the code of Checkout \(3 files\); inside filterBar; 1 Figma screen\. Team files the engine does not read are not counted\./);
  assert.match(lines, /Breaking \(1\), held for sign-off with what they break:\n {3}• the property showClose removed/);
  assert.match(lines, /Faults chipInput already has, not fixed by this change \(1;/);
});

test('after Figma is read again: the real difference, and where it is not what the change said', () => {
  const ch = changeOf({ component: 'chipFilter', ops: [{ op: 'rename', what: 'layer', from: 'Content/Label', to: 'Text' }, { op: 'addLayer', parent: 'Content', layer: { type: 'instance', of: 'icon', name: 'trailing' } }], captures, grammar });
  // The read after: the skeleton as given, and the values capture's paths with the label's name as it is then.
  const as = (fn) => { const s = JSON.parse(JSON.stringify(skeleton)); fn(s.chipFilter.trees[0].c[0].c); const label = s.chipFilter.trees[0].c[0].c[1].n; const v = JSON.parse(JSON.stringify(values).replaceAll('Content/Label', `Content/${label}`)); return modelOf('chipFilter', { ...captures, skeleton: s, values: v }); };
  // Made as said: the label renamed (the same node), the new instance read with its own node id.
  const ok = realOf(ch, as((c) => { c[1].n = 'Text'; c.push({ t: 'INSTANCE', n: 'trailing', id: '2:7', of: { name: 'icon' } }); }));
  assert.deepEqual(ok.mismatch, []);
  assert.deepEqual(ok.real.skeleton.map((x) => x.change), ['renamed', 'added']);
  assert.match(realLines(ok, 'chipFilter').join('\n'), /✅ It is what the change said\./);
  // Made otherwise: the label left as it was, and a layer nobody asked for.
  const off = realOf(ch, as((c) => { c.push({ t: 'INSTANCE', n: 'trailing', id: '2:7', of: { name: 'icon' } }, { t: 'FRAME', n: 'Extra', id: '2:8' }); }));
  assert.deepEqual(off.mismatch.map((x) => `${x.change} ${x.what}`), ['renamed layer', 'added frame Content/Extra']);
  assert.match(realLines(off, 'chipFilter').join('\n'), /⚠️ {2}Not what the change said \(2\)/);
});

test('--figma-change and --change-report: the report, held for sign-off, the script, then the read after', () => {
  const root = tempDir('change-');
  mkdirSync(join(root, 'src'), { recursive: true });
  mkdirSync(join(root, 'contracts'), { recursive: true });
  const write = (f, j) => writeFileSync(join(root, f), JSON.stringify(j));
  write('ds-config.json', { figmaFileKey: 'KEY', writes: { figma: 'ask' }, paths: { compPropsSnapshot: 'src/props.json', snapshotStructure: 'src/structure.json', snapshotVars: 'src/vars.json', snapshotSkeleton: 'src/skeleton.json' } });
  write('src/props.json', { ...props, _updated: '2026-01-01T00:00:00Z' });
  write('src/structure.json', { components: structure });
  write('src/vars.json', { variableScopes: varNames });
  write('src/skeleton.json', skeleton);
  write('component-values.snapshot.json', values);
  write('contracts/chipFilter.contract.json', { name: 'chipFilter', livesIn });
  const cli = (...args) => { try { return execFileSync(process.execPath, [join(ENGINE, 'audit.mjs'), ...args], { cwd: root, encoding: 'utf8', env: { ...process.env, CI: '', FIGMA_TOKEN: '' } }); } catch (e) { return String(e.stdout ?? '') + String(e.stderr ?? ''); } };
  assert.match(cli('--figma-change', 'chipFilter', 'make it nicer'), /not one the engine reads in words[\s\S]*--figma-change chipFilter --ops <file>/);
  const first = cli('--figma-change', 'chipFilter', 'add xl to size like l, then rename Label layer to Text');
  assert.match(first, /chipFilter: the change asked .*, 2 steps:/);
  assert.match(first, /Where it is used: the code of Checkout/);
  assert.match(first, /it waits for someone to sign it off/);
  const signed = cli('--figma-change', 'chipFilter', 'add xl to size like l, then rename Label layer to Text', '--signed-off', 'the system owner');
  assert.match(signed, /only when they say yes, run the script .*use_figma \(fileKey KEY\)[\s\S]*--change-report chipFilter/);
  assert.match(readFileSync(join(root, '.design-system-engine-out/handback/figma-apply.js'), 'utf8'), /--figma-change[\s\S]*getNodeByIdAsync\("1:10"\)/);
  // Figma read again, as the change said.
  const after = JSON.parse(JSON.stringify(skeleton));
  after.chipFilter.trees[0].c[0].c[1].n = 'Text';
  after.chipFilter.variants.push(['size=xl', 0]);
  write('src/skeleton.json', after);
  write('component-values.snapshot.json', JSON.parse(JSON.stringify(values).replaceAll('Content/Label', 'Content/Text')));
  write('src/props.json', { ...props, chipFilter: { ...props.chipFilter, properties: { ...props.chipFilter.properties, size: { type: 'VARIANT', variantOptions: ['s', 'l', 'xl'], defaultValue: 's' } } }, _updated: '2099-01-01T00:00:00Z' });
  const report = cli('--change-report', 'chipFilter');
  assert.match(report, /↻ layer: Content\/Label → Content\/Text/);
  assert.match(report, /✅ It is what the change said\./);
  assert.equal(JSON.parse(readFileSync(join(root, '.design-system-engine-out/changes/chipFilter.change.json'), 'utf8')).done.length, 1);
  // Kept once made, for the style guide's Changes in Figma page.
  assert.equal(readdirSync(join(root, '.design-system-engine-out/changes/done')).length, 1);
});

test('a change to one component in Figma routes to its report; a new one, roles and values keep their own', () => {
  const c = { components: ['chip', 'button', 'tag'] };
  assert.deepEqual(route('add a size xl to the chip in Figma', c).run, ['rms-design-system-engine --figma-change chip "add a size xl to the chip in Figma"']);
  assert.deepEqual(route('do this on the chip in Figma https://gitlab.com/a/b/-/issues/12', c).run, ['rms-design-system-engine --figma-change chip --task https://gitlab.com/a/b/-/issues/12']);
  assert.equal(route('make a pill like the chip in Figma', c).recipe, 'build-component-figma');
  // "like the L one" is an option of the chip, not a component to build like.
  assert.equal(route('add an XL size to the chip in Figma, like the L one', c).recipe, 'change-component-figma');
  assert.equal(route('add the roles in Figma', c).recipe, 'figma-edits');
  assert.equal(route('change the chip radius in figma to 8', c).recipe, 'fix-a-difference');
});
