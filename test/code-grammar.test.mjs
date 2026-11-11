// How a system builds a component in the code, read from its own component files (code-grammar.mjs): the rules most of
// its components follow (Q32's depth), and each component's anatomy read as deeply as Figma's (Q40's).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tempDir } from './helpers.mjs';
import { codeGrammarOf, anatomyOf, shadowLayers, codeGrammarLines, codeGrammarFor, cssInJs, namesTextStyle, resolveSass, sassVars } from '../lib/code-grammar.mjs';
import { constructionView } from '../lib/construction-page.mjs';
import { decidedRules } from '../lib/construction-grammar.mjs';

// A Vue component the way most of the invented Acme system writes one: a root class, parts named after it, states as
// pseudo-classes, a class a prop puts on, tokens for every value.
const vue = (name, cls, { extra = '', style = '', props = 'disabled: Boolean, size: String', pseudo = true } = {}) => `<template>
  <button :class="['${cls}', { '${cls}--large': size === 'large' }]" :disabled="disabled">
    <span v-if="icon" class="${cls}__icon"></span>
    <span class="${cls}__label">{{ label }}</span>${extra}
  </button>
</template>
<script>
/** ${name}: an invented component. */
export default { props: { ${props} } };
</script>
<style scoped>
.${cls} {
  display: inline-flex;
  gap: var(--space-s) var(--space-m);
  flex-wrap: wrap;
  min-width: var(--size-min);
  border-radius: var(--radius-m);
  border: 1px solid var(--border-color);
  box-shadow: var(--shadow-x) var(--shadow-y) var(--shadow-blur) var(--shadow-spread) var(--shadow-color);
  --${cls}-gap: var(--space-s);
}
.${cls}:hover { background: var(--surface-hover); }
${pseudo ? `.${cls}:disabled { opacity: var(--opacity-disabled); box-shadow: none; }` : ''}
.${cls}--large { padding: var(--space-l); font-size: var(--text-l); }
.${cls}__label { font: var(--text-body); }
${style}
</style>
`;
const api = (props, extra = {}) => ({ props, slots: { named: [], default: true }, events: [], ...extra });
const P = { disabled: { type: 'boolean', description: 'Turns it off.' }, iconOnly: { type: 'boolean', description: 'Shows the icon alone.' }, size: { type: 'string', options: ['small', 'large'], description: 'Its size.' } };
const comp = (name, file, cls, opts = {}, apiExtra = {}) => {
  const text = vue(name, cls, opts);
  return { name, file, text, styles: [{ file, text: text.replace(/[\s\S]*<style scoped>/, (m) => m.replace(/[^\n]/g, ' ')).replace(/<\/style>[\s\S]*$/, '') }], root: cls, api: api(opts.apiProps ?? P, apiExtra), figmaProps: opts.figma ?? null };
};
const system = () => [
  comp('acmeButton', 'src/components/buttons/Button.vue', 'acme-button', { figma: { size: {}, 'disabled#1:0': {} } }, { codeConnectFile: 'src/figma/Button.figma.js', codeConnect: { size: 'size', disabled: 'disabled' } }),
  comp('acmeChip', 'src/components/chips/Chip.vue', 'acme-chip', { figma: { size: {} } }, { codeConnectFile: 'src/figma/Chip.figma.js', codeConnect: { size: 'size' } }),
  comp('acmeTag', 'src/components/tags/Tag.vue', 'acme-tag'),
  // One written otherwise: a disabled class, a part named on its own, a shadow and a corner by hand, a prop in snake_case.
  comp('acmeBadge', 'src/components/badges/badge.vue', 'acme-badge', {
    pseudo: false,
    style: '.acme-badge.is-disabled { opacity: 0.4; }\n.acme-badge .dot { border-top-left-radius: 4px; box-shadow: 0 1px 2px #0003; }',
    extra: '\n    <i class="dot"></i>',
    apiProps: { is_active: { type: 'boolean' }, size: { type: 'string', options: ['Small', 'Large'] } },
    figma: { size: {}, showDot: {} },
  }, { codeConnectFile: 'src/figma/Badge.figma.js', codeConnect: { size: 'size' } }),
];

test('the rules most of the code follows, each with the components that do not', () => {
  const { code, questions } = codeGrammarOf({ components: system() });
  const r = (id) => code.rules.find((x) => x.id === id);
  assert.equal(code.components, 4);
  assert.equal(r('code-framework').status, 'rule');
  assert.match(r('code-framework').says, /Vue single-file component/);
  // Badge's file is the one not in PascalCase; three of four is under four in five, so the team decides.
  assert.match(r('code-file-name-case').says, /PascalCase/);
  assert.deepEqual(r('code-file-name-case').toFix.map((t) => t.component), ['acmeBadge']);
  assert.equal(r('code-file-name-case').status, 'decide');
  assert.match(r('code-file-folder').says, /src\/components\/<family>\//);
  assert.equal(r('code-file-folder').status, 'rule');
  assert.deepEqual(r('code-boolean-prop-case').toFix.map((t) => t.value), ['is_active']);
  assert.deepEqual(r('code-option-case').toFix.map((t) => t.value), ['size=Small', 'size=Large']);
  assert.deepEqual(r('code-prop-comment').toFix.map((t) => t.component), ['acmeBadge']);
  // The component Figma has with no Code Connect file, and the Figma property no prop takes.
  assert.deepEqual(r('code-code-connect').toFix.map((t) => t.component), []);
  assert.deepEqual(r('code-figma-props-mapped').toFix.map((t) => [t.component, t.value]), [['acmeBadge', 'showDot']]);
  // How disabled is written: three by the pseudo-class, Badge by a class.
  assert.match(r('code-state-disabled').says, /a pseudo-class \(:disabled\)/);
  assert.deepEqual(r('code-state-disabled').toFix.map((t) => t.component), ['acmeBadge']);
  assert.match(r('code-part-class').says, /acme|button__label|the component's with the part's name/);
  assert.deepEqual(r('code-part-class').toFix.map((t) => [t.component, t.value]), [['acmeBadge', 'dot']]);
  assert.deepEqual(r('code-shadow-token').toFix.map((t) => t.component), ['acmeBadge']);
  assert.deepEqual(r('code-opacity-token').toFix.map((t) => t.component), ['acmeBadge']);
  assert.equal(r('code-text-token').status, 'rule');
  // The tokens: which way the system goes is the team's, always asked until it says.
  assert.equal(r('code-tokens').status === 'decide' || r('code-tokens').status === 'rule', true);
  assert.ok(r('code-tokens').ways?.length === 2);
  assert.ok(questions.some((q) => q.id === 'code-file-name-case'));
  // Every id is the code's own, so the team's answers never meet Figma's.
  assert.ok(code.rules.every((x) => x.id.startsWith('code-')));
});

test('the team decides a code rule the way it decides a Figma one', () => {
  const yes = codeGrammarOf({ components: system() }, { answers: { 'code-file-name-case': true } }).code.rules.find((x) => x.id === 'code-file-name-case');
  assert.equal(yes.status, 'fix');
  assert.equal(yes.by, 'team');
  assert.deepEqual(decidedRules({ figma: { rules: [] }, code: { rules: [yes] } }).broken.map((x) => x.id), ['code-file-name-case']);
  const no = codeGrammarOf({ components: system() }, { answers: { 'code-file-name-case': false } }).code.rules.find((x) => x.id === 'code-file-name-case');
  assert.equal(no, undefined);
  const own = codeGrammarOf({ components: system() }, { answers: { 'code-tokens': 'shared' } }).code.rules.find((x) => x.id === 'code-tokens');
  assert.equal(own.way, 'shared');
  assert.equal(own.by, 'team');
});

test('a component read as deeply as Figma: states, parts, what each prop changes, shadows, corners, wrap, its own API', () => {
  const [button] = system();
  const a = anatomyOf({ file: button.file, text: button.text, styles: button.styles, root: 'acme-button', props: Object.keys(P) });
  assert.equal(a.root, '.acme-button');
  assert.deepEqual(a.states.map((s) => [s.state, s.how]).sort(), [['disabled', 'pseudo-class'], ['hover', 'pseudo-class']]);
  // The parts, in the order the markup writes them, the icon only on a condition.
  assert.deepEqual(a.parts.map((p) => [p.class, p.element, p.optional]), [['acme-button__icon', 'span', true], ['acme-button__label', 'span', false]]);
  // The size prop puts a class on, and that class sets the padding and the text size.
  const size = a.changes.find((c) => c.prop === 'size');
  assert.deepEqual(size.declarations.sort(), ['font-size', 'padding']);
  assert.equal(size.class, '.acme-button--large');
  // One shadow of four lengths and a colour, all tokens; turned off when disabled.
  const on = a.shadows.find((s) => !s.off), off = a.shadows.find((s) => s.off);
  assert.equal(on.layers[0].attributes, 5);
  assert.equal(on.layers[0].token, true);
  assert.match(off.selector, /:disabled/);
  assert.equal(a.radius.shared, true);
  assert.deepEqual(a.radius.tokens, ['--radius-m']);
  assert.deepEqual(a.wrap, { at: 'src/components/buttons/Button.vue:15', wrap: 'wrap', rowGap: 'var(--space-s)', columnGap: 'var(--space-m)', minWidth: 'var(--size-min)' });
  assert.equal(a.sizing, 'hug');
  // What only the code has: the custom property it declares as its own, and those it reads from the theme.
  assert.deepEqual(a.exposes, []);   // --acme-button-gap is declared, never read: no API
  assert.ok(a.inherits.includes('--radius-m'));
  assert.ok(a.text.some((t) => t.part === 'acme-button__label' && t.token));
});

test('a custom property the component declares and reads is its own API, safe to override', () => {
  const text = '<template><div class="acme-card"><p class="acme-card__body">x</p></div></template><style>.acme-card { --acme-card-pad: var(--space-m); padding: var(--acme-card-pad); }</style>';
  const a = anatomyOf({ file: 'Card.vue', text, styles: [{ file: 'Card.vue', text }], root: 'acme-card' });
  assert.deepEqual(a.exposes, ['--acme-card-pad']);
  assert.deepEqual(a.overridable, ['--acme-card-pad']);
  assert.deepEqual(a.inherits, ['--space-m']);
});

test('a shadow layer says every attribute it writes, and a value Figma would draw with four says three', () => {
  assert.deepEqual(shadowLayers('0 2px 4px rgba(0, 0, 0, 0.2)').map((l) => l.attributes), [4]);
  assert.deepEqual(shadowLayers('inset 0 0 0 1px var(--ring), 0 1px 2px #0003').map((l) => [l.inset, l.attributes, l.token]), [[true, 6, true], [false, 4, false]]);
  assert.deepEqual(shadowLayers('none'), []);
});

test('the code\'s rules on the Rules page are the code\'s, and the summary lines say them', () => {
  const { code } = codeGrammarOf({ components: system() });
  const v = constructionView({ codeGrammar: code.rules });
  assert.ok(v.rules.length && v.rules.every((r) => r.side === 'code'));
  assert.ok(v.rules.filter((r) => r.status === 'decide').every((r) => r.who === 'both'));
  const lines = codeGrammarLines({ code });
  assert.match(lines[0], /in the code \(from its 4 component files\)/);
  assert.ok(lines.some((l) => /The disabled state is written as a pseudo-class/.test(l)));
  assert.deepEqual(codeGrammarLines({}), []);
});

test('read from a project with no code capture, from its component files', async () => {
  const ROOT = tempDir('code-grammar-');
  try {
    mkdirSync(join(ROOT, 'src/components'), { recursive: true });
    for (const c of system()) writeFileSync(join(ROOT, 'src/components', c.file.split('/').pop()), c.text);
    // A React component with its stylesheet beside it.
    writeFileSync(join(ROOT, 'src/components/Panel.jsx'), "import './panel.css';\nexport default function Panel() { return <div className=\"acme-panel\"><h2 className=\"acme-panel__title\">t</h2></div>; }\n");
    writeFileSync(join(ROOT, 'src/components/panel.css'), '.acme-panel:hover { box-shadow: var(--shadow); }\n');
    const g = await codeGrammarFor(ROOT, {}, {});
    assert.equal(g.code.components, 5);
    assert.ok(g.code.anatomy.Panel.shadows.length === 1);
    assert.equal(g.code.anatomy.Panel.states[0].how, 'pseudo-class');
  } finally { rmSync(ROOT, { recursive: true, force: true }); }
});

test('nothing to read is no grammar, never an error', () => {
  assert.deepEqual(codeGrammarOf({}).code.rules, []);
  assert.equal(anatomyOf({ text: '' }), null);
});

// A system that writes its text, spacing and values the way Sass, a mixin or JavaScript does is read as using the
// system, not as writing by hand. Every reading names the real line it came from; nothing is guessed.
const TYPO = { 's/strong': { size: 14, weight: 700 }, 'xs/regular': { size: 12, weight: 400 }, 'm/regular': { size: 16, weight: 400 } };

test('a text style pulled in by a mixin is the system\'s text style, read under the rule it sits in', () => {
  const text = `<template><div class="acme-note"><h3 class="title">t</h3><p class="body">b</p></div></template>
<style lang="scss">
.acme-note {
  padding: var(--space-m);
  .title { @include S-Strong; color: var(--text-color); }
  .body { @extend %XS-Regular; }
}
</style>`;
  const a = anatomyOf({ file: 'Note.vue', text, styles: [{ file: 'Note.vue', text }], root: 'acme-note', textStyles: TYPO });
  const styled = a.text.filter((t) => t.style);
  assert.deepEqual(styled.map((t) => [t.part, t.value, t.style]), [['title', 'S-Strong', 's/strong'], ['body', 'XS-Regular', 'xs/regular']]);
  // Each names the line it was read from, so a person can check it in the file.
  assert.ok(styled.every((t) => /^Note\.vue:\d+$/.test(t.at)));
  assert.ok(styled.every((t) => t.token));
  // A name that is no text style of the system is never paired with one.
  const none = anatomyOf({ file: 'N.vue', text: text.replace('S-Strong', 'scrollbarStyles'), styles: [{ file: 'N.vue', text: text.replace('S-Strong', 'scrollbarStyles') }], root: 'acme-note', textStyles: TYPO });
  assert.deepEqual(none.text.filter((t) => t.style).map((t) => t.value), ['XS-Regular']);
});

test('a value written with a Sass variable is read through it, and one that cannot be resolved is left out', () => {
  const text = `<template><div class="acme-box"></div></template>
<style lang="scss">
$box-pad: var(--space-m);
$ring: 0 1px 2px var(--shadow-color);
.acme-box { padding: $box-pad; box-shadow: $ring; gap: $unknown-gap; }
</style>`;
  const a = anatomyOf({ file: 'Box.vue', text, styles: [{ file: 'Box.vue', text }], root: 'acme-box' });
  const pad = a.spacing.find((x) => x.prop === 'padding');
  assert.equal(pad.token, true, 'padding: $box-pad resolves to a token');
  assert.equal(a.shadows[0].layers[0].token, true, 'the shadow resolves to a token');
  // The gap names a variable this reading cannot resolve: it is marked unread and no rule counts it either way.
  const gap = a.spacing.find((x) => x.prop === 'gap');
  assert.equal(gap.read, false);
  const g = codeGrammarOf({ components: [...system(), { name: 'acmeBox', file: 'src/components/boxes/Box.vue', text, styles: [{ file: 'Box.vue', text }], root: 'acme-box', api: api({}) }] });
  const sp = g.code.rules.find((r) => r.id === 'code-spacing-token');
  assert.ok(!sp.toFix.some((t) => t.component === 'acmeBox'), 'a value that could not be read is never reported as written by hand');
});

test('padding, gaps and margins are read against the system\'s spacing tokens', () => {
  const byHand = { ...comp('acmeSlab', 'src/components/slabs/Slab.vue', 'acme-slab', { style: '.acme-slab { gap: 8px; margin: 4px; }' }) };
  const g = codeGrammarOf({ components: [...system(), byHand] });
  const sp = g.code.rules.find((r) => r.id === 'code-spacing-token');
  assert.match(sp.says, /padding, gaps and margins/);
  assert.deepEqual(sp.toFix.map((t) => t.component), ['acmeSlab']);
  assert.match(sp.toFix[0].value, /gap: 8px|margin: 4px/);
});

test('a component that writes its styles in JavaScript is read as one', () => {
  const text = `import styled from 'styled-components';
const Card = styled.div\`
  display: inline-flex;
  gap: var(--space-s);
  border-radius: var(--radius-m);
  box-shadow: 0 1px 2px #0003;
  &:hover { background: var(--surface-hover); }
\`;
export default function AcmeCard() { return <Card><span className="acme-card__label">x</span></Card>; }
`;
  const styles = [cssInJs('Card.jsx', text)];
  assert.deepEqual(styles[0].roots, ['Card']);
  const a = anatomyOf({ file: 'Card.jsx', text, styles, root: 'Card' });
  assert.deepEqual(a.states.map((s) => [s.state, s.how]), [['hover', 'pseudo-class']]);
  assert.equal(a.shadows[0].layers[0].token, false, 'the shadow is written by hand');
  assert.deepEqual(a.radius.tokens, ['--radius-m']);
  assert.equal(a.sizing, 'hug');
  // An interpolation cannot be read, so it is blanked and the line numbers still point at the real file.
  const withExpr = cssInJs('C.jsx', 'const B = styled.button`\n  color: ${(p) => p.c};\n  gap: var(--space-s);\n`;');
  assert.ok(!/\$\{/.test(withExpr.text));
});

test('a component with no element of its own is said, never dropped quietly', () => {
  const pass = { name: 'acmeCell', file: 'src/components/cells/Cell.vue', text: '<template><acme-button v-bind="x"/></template>', styles: [], root: null, api: api({}) };
  const g = codeGrammarOf({ components: [...system(), pass] });
  assert.ok(!g.code.anatomy.acmeCell);
  assert.deepEqual(g.code.notRead.map((x) => x.component), ['acmeCell']);
  assert.match(g.code.notRead[0].why, /renders another component|no class of its own/);
});

test('the code is scored the way the Figma library is, and keeps a trend of its own', async () => {
  const { scoreOf, withHistory, scoreFile } = await import('../lib/library-score.mjs');
  const rules = [
    { side: 'code', area: 'naming', status: 'rule', follows: 10, of: 10 },
    { side: 'code', area: 'variables', status: 'fix', follows: 8, of: 10 },
    { side: 'code', area: 'documentation', status: 'decide', follows: 1, of: 10 },
  ];
  const s = scoreOf(rules);
  // A rule still to decide counts for nothing, as on Figma's side.
  assert.deepEqual(s.areas.map((a) => [a.area, a.score]), [['Tokens', 80], ['Naming', 100]]);
  assert.equal(s.score, 90);
  // Each side keeps its own history, so the code's trend is the code's.
  assert.notEqual(scoreFile('/out', 'code'), scoreFile('/out', 'figma'));
  const dir = tempDir('code-score-');
  const file = scoreFile(dir, 'code');
  withHistory(file, '2026-11-10T09:00:00.000Z', { score: 88, areas: [] });
  const now = withHistory(file, '2026-11-11T09:00:00.000Z', s);
  assert.equal(now.previous.score, 88);
  assert.equal(now.score, 90);
});

test('a class name goes into a regular expression escaped whole, never its hyphens alone', () => {
  // A class is read out of markup, so it may hold any character. One holding a regular expression's own ("card.v2+")
  // must match itself and nothing else, and must never throw.
  const text = `<template><div class="acme-grid" :class="{ 'acme-grid.v2+': wide }"><span class="acme-grid__cell"></span></div></template>
<style>.acme-grid {} .acme-grid\\.v2\\+ { padding: 0; } .acme-grid__cell {}</style>`;
  const a = anatomyOf({ file: 'Grid.vue', text, styles: [{ file: 'Grid.vue', text }], root: 'acme-grid', props: ['wide'] });
  assert.ok(a, 'a class holding regular-expression characters is read, never thrown on');
  assert.deepEqual(a.parts.map((p) => p.class), ['acme-grid__cell']);
});
