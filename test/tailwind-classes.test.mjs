// A Tailwind component's classes against Figma as far as a CSS component is compared (tailwind-classes.mjs): a v3
// theme read from tailwind.config, each variant's own classes, each state's prefixed classes, the rest of its measures
// (gap, type, border width, shadow, motion) and each mode. An invented system (Acme).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { configTheme, optionClasses, classesIn, tailwindFindings, modeOverrides, findingLine } from '../lib/tailwind-classes.mjs';
import { projectTheme, projectArbitrary } from '../lib/tailwind-check.mjs';
import { tempDir } from './helpers.mjs';

// The tailwind naming preset: a Figma token's CSS variable.
const varOf = (tok) => `--${/^space\//.test(tok) ? 'spacing' : /^radius\//.test(tok) ? 'radius' : 'color'}-${tok.replace(/^(space|radius)\//, '').replace(/\/color$/, '').replace(/\//g, '-')}`;

test('a v3 theme: tailwind.config read as text, never run, its extend too, rem also as px', () => {
  const config = `const plugin = require('tailwindcss/plugin');
module.exports = {
  content: ['./src/**/*.{js,tsx}'],
  theme: {
    spacing: { 2: '0.5rem', 3: '0.75rem', control: '36px' },
    extend: {
      colors: { action: { DEFAULT: '#0a6c74', text: '#fff' }, danger: '#B42318', brand: process.env.BRAND },
      borderRadius: { control: '6px' },
      fontSize: { body: ['14px', { lineHeight: '20px' }], label: ['12px', '16px'] },
      boxShadow: { card: '0 1px 2px rgb(0 0 0 / 0.1)' },
      transitionDuration: { quick: '120ms' },
    },
  },
  plugins: [plugin(function ({ addUtilities }) {})],
};`;
  const t = configTheme(config);
  assert.deepEqual(t.get('color').get('#0a6c74'), ['action']);
  assert.deepEqual(t.get('color').get('#ffffff'), ['action-text'], 'a nested colour, DEFAULT its own name, #fff as #ffffff');
  assert.deepEqual(t.get('color').get('#b42318'), ['danger']);
  assert.equal([...t.get('color').values()].flat().includes('brand'), false, 'a value the config computes is skipped, never run');
  assert.deepEqual(t.get('spacing').get('12px'), ['3'], '0.75rem is 12px');
  assert.deepEqual(t.get('radius').get('6px'), ['control']);
  assert.deepEqual(t.get('text').get('14px'), ['body']);
  assert.deepEqual(t.get('text-lh:label').get('16px'), ['label']);
  assert.deepEqual(t.get('duration').get('120ms'), ['quick']);
  // A project with only a v3 config: its bracketed values are named against that theme.
  const dir = tempDir('tw-v3-');
  writeFileSync(join(dir, 'tailwind.config.js'), config);
  writeFileSync(join(dir, 'Card.jsx'), 'export const Card = () => <div className="p-[12px] rounded-[6px] bg-[#b42318] text-[#123456]" />;\n');
  assert.deepEqual(projectTheme(dir, '').get('spacing').get('12px'), ['3']);
  const r = projectArbitrary(dir, '');
  assert.equal(r.tailwind, true);
  assert.deepEqual(r.findings.map((f) => [f.cls, f.fix]), [['p-[12px]', 'p-3'], ['rounded-[6px]', 'rounded-control'], ['bg-[#b42318]', 'bg-danger'], ['text-[#123456]', null]]);
});

test('each variant: the classes its options write (cva, a map, a conditional), compared with its own Figma variant', () => {
  const axes = [['size', ['Small', 'Large']], ['tone', ['Neutral', 'Danger']]];
  const cva = optionClasses(`const button = cva('inline-flex items-center rounded-control', { variants: { size: { Small: 'h-8 px-2', Large: ['h-12', 'px-4'] }, tone: { Neutral: 'bg-surface', Danger: 'bg-danger' } }, defaultVariants: { size: 'Small' } });`, axes);
  assert.deepEqual(cva.options, { size: { small: 'h-8 px-2', large: 'h-12 px-4' }, tone: { neutral: 'bg-surface', danger: 'bg-danger' } });
  assert.match(cva.base, /inline-flex items-center rounded-control/);
  assert.doesNotMatch(cva.base, /h-8|h-12/, 'the option classes are not the base');
  const map = optionClasses(`const SIZE = { Small: 'h-8', Large: 'h-12' };`, axes);
  assert.deepEqual(map.options, { size: { small: 'h-8', large: 'h-12' } });
  const cond = optionClasses("const look = tone === 'Danger' ? 'bg-danger' : 'bg-surface';", axes);
  assert.deepEqual(cond.options, { tone: { danger: 'bg-danger', neutral: 'bg-surface' } }, 'the other branch is every other option');
  // Figma's Large is 48px; the code's Large writes h-10 (40px): found on that variant only.
  const structure = { button: { h: 32, defaultVariant: 'size=Small', variants: { 'size=Small': { h: 32 }, 'size=Large': { h: 48 } } } };
  const files = { button: "const S = { Small: 'h-8 px-2', Large: 'h-10 px-4' };\nexport const Button = ({ size }) => <button className={`inline-flex ${S[size]}`} />;" };
  const f = tailwindFindings({ structure, files, varOf });
  assert.deepEqual(f.map(findingLine), ['button (size=Large): height, Figma 48px, the code writes h-10; write h-12']);
  // Read as one list, the same file passed: h-8 matched Figma's default.
  assert.deepEqual(tailwindFindings({ structure: { button: { h: 32 } }, files, varOf }), []);
});

test('each state: hover, pressed, focus and disabled classes against the variable Figma binds in that state', () => {
  const stateBindings = { button: {
    'State=Default': { props: { State: 'Default' }, bindings: [{ token: 'action/primary/color', bindingField: 'fills', isText: false, depth: 0 }] },
    'State=Hover': { props: { State: 'Hover' }, bindings: [{ token: 'action/primary/hover/color', bindingField: 'fills', isText: false, depth: 0 }] },
    'State=Pressed': { props: { State: 'Pressed' }, bindings: [{ token: 'action/primary/pressed/color', bindingField: 'fills', isText: false, depth: 0 }] },
    'State=Disabled': { props: { State: 'Disabled' }, bindings: [{ token: 'disabled/color', bindingField: 'fills', isText: false, depth: 0 }, { token: 'disabled/text/color', bindingField: 'fills', isText: true, depth: 1 }] },
    'State=Focus': { props: { State: 'Focus' }, bindings: [{ token: 'action/primary/color', bindingField: 'fills', isText: false, depth: 0 }] },
  } };
  const structure = { button: { colors: { fill: { token: 'action/primary/color' } } } };
  const files = { button: '<button className="bg-action-primary hover:bg-action-primary-hover active:bg-action-primary disabled:bg-disabled" />' };
  const lines = tailwindFindings({ structure, files, varOf, stateBindings }).map(findingLine);
  assert.deepEqual(lines, [
    'button (pressed): fill, Figma action/primary/pressed/color, the code writes active:bg-action-primary; write active:bg-action-primary-pressed',
    'button (disabled): text colour, Figma disabled/text/color, the code writes none; write disabled:text-disabled-text',
  ], 'hover is right; focus draws as at rest, so nothing is owed');
});

test('the rest of its measures: gap, text size, weight and line height, border width, shadow and motion', () => {
  const structure = { chip: { gapVar: 'space/2', fontSizeVar: 'label', fontWeightVar: 'label', stroke: { weights: [2, 2, 2, 2] } } };
  const typography = { label: { size: '12px', weight: '600', lh: '16px' } };
  const effects = { chip: { effects: [{ type: 'DROP_SHADOW', radius: 4 }] } };
  const motion = { chip: [{ trigger: 'ON_HOVER', type: 'SMART_ANIMATE', duration: 0.2, easing: { type: 'EASE_OUT' } }] };
  const theme = new Map([['spacing', new Map([['8px', ['2']], ['4px', ['1']]])]]);
  const files = { chip: '<span className="inline-flex gap-1 text-sm font-medium leading-6 border transition duration-300 ease-in" />' };
  const lines = tailwindFindings({ structure, files, varOf, theme, typography, effects, motion }).map(findingLine);
  assert.deepEqual(lines, [
    'chip: gap, Figma space/2, the code writes gap-1; write gap-2',
    'chip: text size, Figma label (12px), the code writes text-sm; write text-xs',
    'chip: weight, Figma label (600), the code writes font-medium; write font-semibold',
    'chip: line height, Figma 16px, the code writes leading-6; write leading-4',
    'chip: border width, Figma 2px, the code writes border; write border-2',
    'chip: shadow, Figma draws one, the code writes none; write shadow-…',
    'chip (hover): duration, Figma 200ms, the code writes duration-300; write duration-200',
    'chip (hover): easing, Figma ease-out, the code writes ease-in; write ease-[ease-out]',
  ]);
  // The same component written as Figma says: nothing.
  const right = { chip: '<span className="inline-flex gap-2 text-xs font-semibold leading-4 border-2 shadow-sm transition duration-200 ease-[ease-out]" />' };
  assert.deepEqual(tailwindFindings({ structure, files: right, varOf, theme, typography, effects, motion }), []);
  // Figma animates it, the code changes it at once.
  assert.deepEqual(tailwindFindings({ structure: { chip: {} }, files: { chip: '<span className="bg-surface" />' }, varOf, motion }).map(findingLine),
    ['chip (hover): motion, Figma 200ms ease-out, the code writes none: it changes at once; write transition duration-200']);
});

test('each mode: the dark block or a dark: class against the value Figma gives the variable in that mode', () => {
  const css = '@theme { --color-surface: #ffffff; --color-ink: #111111; --color-night: #0e141a; }\n@variant dark (&:where(.dark, .dark *));\n.dark { --color-surface: #0e141a; }\n';
  const theme = new Map([['color', new Map([['#ffffff', ['surface']], ['#111111', ['ink']], ['#0e141a', ['night']]])]]);
  assert.equal(modeOverrides(css, 'class:dark').get('--color-surface'), '#0e141a');
  const modes = [{ name: 'Dark', snapshotKey: 'dark', cssSelector: 'class:dark' }];
  const colours = { dark: { 'surface/color': '#0e141a', 'ink/color': '#eeeeee' } };
  const structure = { card: { colors: { fill: { token: 'surface/color' }, text: { token: 'ink/color' } } } };
  const lines = tailwindFindings({ structure, files: { card: '<div className="bg-surface text-ink" />' }, varOf, theme, modes, colours, themeCss: css }).map(findingLine);
  assert.deepEqual(lines, ['card (Dark): text colour, Figma ink/color (#eeeeee), the code writes text-ink (#111111); write --color-ink: #eeeeee in the Dark block'], 'the fill follows the dark block; the text keeps its light value');
  const viaClass = tailwindFindings({ structure, files: { card: '<div className="bg-surface text-ink dark:text-night" />' }, varOf, theme, modes, colours, themeCss: css }).map(findingLine);
  assert.deepEqual(viaClass, ['card (Dark): text colour, Figma ink/color (#eeeeee), the code writes dark:text-night (#0e141a); write text-ink, with --color-ink set in the Dark block']);
  assert.deepEqual(classesIn('data-[state=open]:bg-x hover:dark:text-y').map((c) => [c.variants, c.cls]), [[['data-[state=open]'], 'bg-x'], [['hover', 'dark'], 'text-y']]);
});
