// test/cluster-b.test.mjs - regression tests for the "cluster B" gate fixes.
//
// Bugs covered (one [bugfix ...] proving post-fix behaviour + [regression ...] locks
// of a valid-passes and an invalid-fails case each):
//   1) pseudo-element-check.mjs    - content value is PARSED, so `content: none`/`''`
//      (space after colon) are non-visible (skipped), real content still flagged.
//   2) container-containment-check.mjs - flex definiteness reads the BASIS component only,
//      so `flex:0 0 auto` is UNSAFE while `flex:1` / `flex:0 0 100px` are safe.
//   3) component-selector-check.mjs - the state-var scan allows whitespace after `var(`.
//   4) structure-check.mjs         - phantom-border inspects EVERY border/outline decl;
//      themeCSS comment-stripping + array themeCSS no longer crash.
//
// Each gate reads ds-config.json + CSS (+ snapshot/contract) from its cwd; runGate builds a
// throwaway fixture from a { relpath: content } map and returns { code, out, dir }.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runGate, crashed } from './helpers.mjs';

// ─────────────────────────────────────────────────────────────────────────────
// 1) pseudo-element-check.mjs
// ─────────────────────────────────────────────────────────────────────────────
const PSEUDO_GATE = 'pseudo-element-check.mjs';
const PSEUDO_CFG = { paths: { themeCSS: 'theme.css' } };

test('[regression pseudo] an undocumented ::before{content:"x"} fails', () => {
  const { code, out } = runGate(PSEUDO_GATE, {
    'ds-config.json': PSEUDO_CFG,
    'theme.css': `.thing::before { content: "x"; }`,
    // No structure-contract.mjs → nothing is documented.
  });
  assert.equal(code, 1, out);
  assert.match(out, /UNDOCUMENTED/);
  assert.match(out, /\.thing::before/);
});

test('[regression pseudo] a documented content-setting ::before passes', () => {
  const { code, out } = runGate(PSEUDO_GATE, {
    'ds-config.json': PSEUDO_CFG,
    'theme.css': `.tag::before { content: "\\2192"; }`,
    // ALLOWED map keyed by the normalised selector.
    'structure-contract.mjs': `export const PSEUDO_ELEMENTS = { '.tag::before': 'DS INDICATOR - chevron' };`,
  });
  assert.equal(code, 0, out);
  assert.match(out, /DOCUMENTED/);
  assert.match(out, /No undocumented/);
});

test('[bugfix pseudo] content:none and content:\'\' (space after colon) are NOT flagged', () => {
  // Deliberately NO structure-contract.mjs: if either value were treated as visible it
  // would be undocumented → exit 1. Parsing the value makes both non-visible → exit 0.
  const { code, out } = runGate(PSEUDO_GATE, {
    'ds-config.json': PSEUDO_CFG,
    'theme.css': `
      .a::before { content: none; }
      .b::after  { content: ''; }
    `,
  });
  assert.equal(code, 0, out);
  assert.doesNotMatch(out, /UNDOCUMENTED/);
  assert.match(out, /No undocumented/);
});

// ─────────────────────────────────────────────────────────────────────────────
// 2) container-containment-check.mjs
// ─────────────────────────────────────────────────────────────────────────────
const CONTAIN_GATE = 'container-containment-check.mjs';
const CONTAIN_CFG = { paths: { themeCSS: 'theme.css' } };

test('[bugfix container] flex:0 0 auto + container-type on a hugging box is flagged', () => {
  const { code, out } = runGate(CONTAIN_GATE, {
    'ds-config.json': CONTAIN_CFG,
    // inline-flex ⇒ shrink-to-fit; basis is `auto` ⇒ NOT a definite inline size.
    'theme.css': `.seg { display: inline-flex; container-type: inline-size; flex: 0 0 auto; }`,
  });
  assert.equal(code, 1, out);
  assert.match(out, /"\.seg"/);
  assert.match(out, /hugs its content/);
});

test('[regression container] flex:0 0 100px (definite basis) is NOT flagged', () => {
  const { code, out } = runGate(CONTAIN_GATE, {
    'ds-config.json': CONTAIN_CFG,
    'theme.css': `.seg { display: inline-flex; container-type: inline-size; flex: 0 0 100px; }`,
  });
  assert.equal(code, 0, out);
  assert.match(out, /safe/);
  assert.doesNotMatch(out, /hugs its content/);
});

test('[regression container] a plain safe case (flex:1) passes', () => {
  const { code, out } = runGate(CONTAIN_GATE, {
    'ds-config.json': CONTAIN_CFG,
    // flex:1 ⇒ basis 0% (definite) ⇒ containment safe.
    'theme.css': `.full { display: inline-flex; container-type: inline-size; flex: 1; }`,
  });
  assert.equal(code, 0, out);
  assert.match(out, /safe/);
});

test('[regression container] inline-block with no definite width is flagged (invalid)', () => {
  const { code, out } = runGate(CONTAIN_GATE, {
    'ds-config.json': CONTAIN_CFG,
    'theme.css': `.chip { display: inline-block; container-type: inline-size; }`,
  });
  assert.equal(code, 1, out);
  assert.match(out, /"\.chip"/);
});

// ─────────────────────────────────────────────────────────────────────────────
// 3) component-selector-check.mjs
// ─────────────────────────────────────────────────────────────────────────────
const SELECTOR_GATE = 'component-selector-check.mjs';
const SELECTOR_CFG = { paths: { themeCSS: 'theme.css' }, componentSelectors: { listItem: '.list-item' } };
// `listItem` is a DS component because the project declares it (componentSelectors; the captured
// structure snapshot works the same way). The engine ships no built-in list of component names.

test('[bugfix selector] a state var written var( --listItem-bg-selected ) (space) is detected', () => {
  const { code, out } = runGate(SELECTOR_GATE, {
    'ds-config.json': SELECTOR_CFG,
    // Non-state selector (.list-item has no "selected") ⇒ mis-scoped state var.
    'theme.css': `.list-item { color: var( --listItem-bg-selected ); }`,
  });
  assert.equal(code, 1, out);
  assert.match(out, /--listItem-bg-selected/);
  assert.match(out, /🚨/);
});

test('[regression selector] the same var without a space is still detected (invalid)', () => {
  const { code, out } = runGate(SELECTOR_GATE, {
    'ds-config.json': SELECTOR_CFG,
    'theme.css': `.list-item { color: var(--listItem-bg-selected); }`,
  });
  assert.equal(code, 1, out);
  assert.match(out, /--listItem-bg-selected/);
});

test('[regression selector] a correctly-scoped state selector passes (valid)', () => {
  const { code, out } = runGate(SELECTOR_GATE, {
    'ds-config.json': SELECTOR_CFG,
    'theme.css': `.list-item.selected { color: var(--listItem-bg-selected); }`,
  });
  assert.equal(code, 0, out);
  assert.match(out, /All state vars appear inside matching state selectors/);
});

// ─────────────────────────────────────────────────────────────────────────────
// 4) structure-check.mjs (Gate [3c] phantom borders + array-themeCSS resilience)
// ─────────────────────────────────────────────────────────────────────────────
const STRUCT_GATE = 'structure-check.mjs';
// A minimal contract: one non-structural component (skips the snapshot cross-check) whose
// only job is to give the phantom gate a base selector to scan.
const STRUCT_CONTRACT =
  `export const CONTRACT = { widget: {} };\n` +
  `export const COMPONENT_CSS_SELECTORS = { widget: { main: '.widget' } };\n`;

function structFixture({ themeCSS, snapComp, extra = {} }) {
  return {
    'ds-config.json': { paths: { themeCSS, snapshotStructure: 'snap.json' } },
    'snap.json': { components: { widget: snapComp } },
    'structure-contract.mjs': STRUCT_CONTRACT,
    ...extra,
  };
}

test('[bugfix structure] border-color:transparent + border-left:solid is flagged when Figma has no stroke', () => {
  const { code, out } = runGate(STRUCT_GATE, structFixture({
    themeCSS: 'theme.css',
    snapComp: { strokeOnAnyState: false },
    extra: { 'theme.css': `:root {}\n.widget { border-color: transparent; border-left: 3px solid red; }` },
  }));
  assert.equal(code, 1, out);
  assert.match(out, /Gate \[3c\]/);          // phantom-border section header
  assert.match(out, /border-left/);           // the visible side border, not the transparent one
  assert.doesNotMatch(out, /TypeError/, out);
});

test('[regression structure] a no-stroke component with only border-color:transparent passes (valid)', () => {
  const { code, out } = runGate(STRUCT_GATE, structFixture({
    themeCSS: 'theme.css',
    snapComp: { strokeOnAnyState: false },
    extra: { 'theme.css': `:root {}\n.widget { border-color: transparent; }` },
  }));
  assert.equal(code, 0, out);
  assert.match(out, /All structural checks pass/);
});

test('[regression structure] a no-stroke component with a real border is flagged (invalid)', () => {
  const { code, out } = runGate(STRUCT_GATE, structFixture({
    themeCSS: 'theme.css',
    snapComp: { strokeOnAnyState: false },
    extra: { 'theme.css': `:root {}\n.widget { border: 1px solid red; }` },
  }));
  assert.equal(code, 1, out);
  assert.match(out, /Gate \[3c\]/);
});

test('[bugfix structure] a component with no selector entry of its own is checked by its class: a panel Figma draws without a border', () => {
  // The panel had no COMPONENT_CSS_SELECTORS entry, so its border-right was never compared with Figma's no stroke.
  const fx = structFixture({ themeCSS: 'theme.css', snapComp: { strokeOnAnyState: false },
    extra: { 'theme.css': `:root {}\n.widget { color: red; }\n.panel { border-right: 1px solid red; }\n.panel.panel--right { border-left: 1px solid red; }` } });
  fx['snap.json'].components.panel = { strokeOnAnyState: false };
  const { code, out } = runGate(STRUCT_GATE, fx);
  assert.equal(code, 1, out);
  assert.match(out, /panel: "\.panel" has `border-right/);
  assert.match(out, /panel: "\.panel\.panel--right" has `border-left/);
});

test('[structure] a product rule that paints a background on a component Figma draws with no fill is flagged', () => {
  // A band of colour behind an empty state came from a product rule giving the system's empty state a fill.
  const fx = structFixture({ themeCSS: 'theme.css', snapComp: { strokeOnAnyState: false },
    extra: { 'theme.css': `:root {}\n.widget { color: red; }\n.results .emptyState { background: var(--panel-background-secondary); }` } });
  fx['snap.json'].components.emptyState = { fillStructure: 'none', strokeOnAnyState: false };
  const { code, out } = runGate(STRUCT_GATE, fx);
  assert.equal(code, 1, out);
  assert.match(out, /CSS paints a background but Figma has no fill/);
  assert.match(out, /emptyState: "\.results \.emptyState" has `background: var\(--panel-background-secondary\)`/);
});

test('[structure] a part the component nests, a part inside it, and a component Figma fills are not flagged', () => {
  const fx = structFixture({ themeCSS: 'theme.css', snapComp: { strokeOnAnyState: false, fills: ['widget/background/color'], fillStructure: 'direct' },
    extra: { 'theme.css': [':root {}',
      '.widget { background: var(--widget-background); }',                                   // Figma fills it
      '.statusBar::after { content: ""; height: 1px; background: var(--dividerLine-border); }', // its nested dividerLine, drawn by CSS
      '.emptyState .emptyState-icon { background: red; }',                                   // a part inside it, not its surface
      '.emptyState:hover { background: transparent; }'].join('\n') } });
  fx['snap.json'].components.statusBar = { fillStructure: 'none', strokeOnAnyState: false, toggles: { 'Show Divider Line Bottom': ['dividerLine'] } };
  fx['snap.json'].components.emptyState = { fillStructure: 'none', strokeOnAnyState: false };
  const { out } = runGate(STRUCT_GATE, fx);   // fails elsewhere: the two components are in no contract
  assert.match(out, /PASS {2}2 component\(s\) - no fill Figma does not have/);
  assert.match(out, /FAIL {2}0 phantom fill\(s\)/);
});

test('[bugfix structure] array themeCSS resolves without crashing; a strokeful component keeps its border', () => {
  const { code, out } = runGate(STRUCT_GATE, structFixture({
    themeCSS: ['theme.css', 'extra.css'],           // array form - used to crash
    snapComp: { strokeOnAnyState: true },            // Figma strokes it ⇒ CSS border allowed
    extra: {
      'theme.css': `:root {}\n.widget { border: 1px solid var(--widget-border); }`,
      'extra.css': `.extra { color: red; }`,
    },
  }));
  // The identical `.widget { border ... }` rule fails on a no-stroke component (test above);
  // here it passes, which proves the strokeful component is permitted its border.
  assert.ok(!crashed(out), out);
  assert.equal(code, 0, out);
  assert.match(out, /All structural checks pass/);
  assert.match(out, /no phantom CSS borders/);
});

test('[generic selector] a component known only from the captured structure snapshot is checked', () => {
  const { code, out } = runGate(SELECTOR_GATE, {
    'ds-config.json': { paths: { themeCSS: 'theme.css', snapshotStructure: 'struct.json' } },
    'struct.json': { components: { chipTag: {} } },
    'theme.css': `.chip-tag { color: var(--chipTag-bg-selected); }`,
  });
  assert.equal(code, 1, out);
  assert.match(out, /--chipTag-bg-selected/);
});
