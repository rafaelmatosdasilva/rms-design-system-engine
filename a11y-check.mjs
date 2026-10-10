// a11y-check.mjs — I18 Accessibility gate.  Run from project root:
//   node a11y-check.mjs [--component A,B|.selector] [--url <page>] [--a11y]
//
// Mechanical + agnostic: reads the REAL render (headless Chrome via the DevTools Protocol,
// the same flow as rendered-check.mjs / Gate 22), never an assumed DS shape.
//
// Render targets — NO project shape is imposed. It loads, in priority order: a live page from
// `--url <page>` (repeatable/comma), then `ds-config.json → a11y.urls` (any project that serves
// its components — a Vue/Vite SPA, Storybook, a deployed styleguide), then the **generated
// styleguide** (`ds-config.json → styleguide.out`, default `apps/styleguide/index.html`) via
// file:// — one static page that renders every component × every state, so the sweep gets
// deterministic, per-state coverage with no dev server; then the built plugin UIs via file://
// (the Figma-plugin shape); then AUTO-DISCOVERY (start the dev server + enumerate pages). So a
// non-plugin DS is checked by pointing it at a running dev server; `--url` even runs with no
// ds-config.json at all. `a11y.waitFor` (a selector) delays the sweep until an SPA has rendered.
// `a11y.styleguide:false` opts out of the styleguide target; `a11y.regenerateStyleguide:true`
// rebuilds it first (via styleguide-gen.mjs) so a11y never audits a stale one.
//
// It checks:
//   1. Contrast   — WCAG 2.1 AA ratio of each text leaf's computed color vs its EFFECTIVE
//                   (composited) background; normal >= 4.5:1, large >= 3:1. Per theme.
//   2. Name/role  — every interactive node in the accessibility tree has a non-empty accessible
//                   name and a resolvable role (a component not exposing aria / an icon-button
//                   with no label).
//   3. Focus      — every focusable element shows a computed style change when focused, AND that
//                   change is actually visible: the focus ring's colour has >= 3:1 contrast against
//                   its background (WCAG 1.4.11 for focus — a ring that "changes" but is nearly the
//                   same colour is still invisible).
//   4. State expo — an element whose STATE is shown only by a CSS class (selected / checked /
//                   expanded / disabled / invalid / pressed / …) but never through the matching
//                   aria/native state, so assistive tech never hears it. State-class → aria map
//                   is common-English by default; extend via ds-config.json → a11y.stateClasses.
//   5. Keyboard   — an interactive control that cannot be reached by keyboard (an interactive
//                   role on a non-focusable element, or a native control with tabindex=-1).
//   6. Tooltip    — a control whose only name is its title (an icon with a tooltip): touch and keyboard
//                   users never see the tooltip, so they cannot tell what it does. Words beside the icon,
//                   or aria-label at least.
//   7. Icons      — an icon that carries meaning (the only content of a control, or one with a name of
//                   its own) at less than 3:1 against its background, in every theme (WCAG 1.4.11): an
//                   icon drawn for the light theme that disappears in the dark one.
//
// Output is plain language, no jargon: each issue says what is wrong, why it matters, and what to
// do. `--a11y` adds the exact elements; `--json` emits a machine-readable record for an agent/CI.
// `--axe` (or ds-config a11y.axe:true) also runs axe-core (fetched from a CDN, no npm dep) for the
// broader WCAG rules the five checks above do not cover — non-text contrast, target size, duplicate
// ids, ARIA validity, heading order, labels — reported as an extra advisory section. `--states`
// (or a11y.interactionStates:true) forces :hover and re-measures, flagging text that reads fine at
// rest but fails contrast while hovered.
//
// Advisory by default (never fails the audit); `ds-config.json → a11yStrict: true` promotes
// findings to a hard fail (exit 1). Skips cleanly (exit 0) when no browser is available — never
// a false fail. `--component A,B|.selector` scopes the sweep to those components' subtrees.
//
// No npm dependencies (Node >= 22 built-in WebSocket). Honors No-imposed-structure: findings
// come from measured pixels and the accessibility tree, not from any presumed token/tier model.
//
// NOT yet (v2, by design):
//   - Non-text contrast (WCAG 1.4.11, >= 3:1): the focus ring (check 3), icons (check 7) and control edges
//     (wcag-page.js) are checked natively, control edges in the first mode only; graphics come from --axe.
//   - Live pseudo-class states: :hover text contrast is forced with --states (first mode); :focus and :active
//     text, and edges in those states, are not measured yet.
//   - Reading order, skip links, landmark completeness — and anything the render cannot reveal:
//     only when the project declares it in ds-config.json, never imposed (No-imposed-structure).

import { appDir } from './code-roots.mjs';
import './stdio-sync.mjs';   // the whole report reaches a pipe before process.exit
import { readFileSync, existsSync, writeFileSync, mkdirSync, readdirSync, statSync } from 'fs';
import { homedir } from 'os';
import { createHash } from 'crypto';
import { gunzipSync } from 'zlib';
import { join, resolve, dirname } from 'path';
import { spawn } from 'child_process';
import { pathToFileURL } from 'url';
import { findChrome, launchChrome, connectCDP, openPage, waitForTrue } from './cdp.mjs';
import { loadLocator } from './component-locator.mjs';
import { loadModes } from './mode-resolver.mjs';
import { modeSwitch } from './code-capture.mjs';
import { codeSnapshotPath, OUT_DIR } from './names.mjs';
import { roleWord as roleWordOf } from './role-markup.mjs';
import { parseColor as parseCssColor } from './css-values.mjs';
import { WCAG21_GUIDE, WCAG21_KIND, WCAG_PAGE_SOURCE } from './wcag21.mjs';
import { loadCategories, requirementEntry, noteKind, isRequirement } from './annotation-categories.mjs';
import { partRoleOf, annotatedBehaviours, partRolesOf, behavioursFor, roleKey, markInstanceExpression, behaviourExpression, partRoleExpression, stateFindings } from './behaviour-contract.mjs';

// ── Pure, unit-testable core (exported; importing this module runs NOTHING) ─────
// Parse a computed-style color. Returns {r,g,b,a} or null when it is not an rgb()/rgba()
// (e.g. a gradient keyword or color(display-p3 …)) — callers treat null as "cannot compute".
// After a mode switch, every CSS transition it started jumps to its end: a colour is read as it settles, never halfway
// (a button whose text colour transitions and whose background does not reads 1:1 for a moment).
export const SETTLE_TRANSITIONS = `document.getAnimations().forEach((a) => { if (typeof CSSTransition !== 'undefined' && a instanceof CSSTransition) { try { a.finish(); } catch (e) {} } })`;

// State-class → the aria/native state it must also expose. A common-English default (extend or override per project via
// ds-config.json → a11y.stateClasses). Curated words only, so a plain decorative class never trips it; the check only
// fires on interactive / roled elements. A state is said the way the element's role says it, so each word takes every
// attribute that can say it: a selected radio is aria-checked, a selected toggle aria-pressed, a selected step or page
// aria-current (any value but false), a selected tab or option aria-selected.
export const STATE_CLASSES = {
  selected:      { attr: ['aria-selected', 'aria-checked', 'aria-pressed', 'aria-current'], val: 'true' },
  checked:       { attr: ['aria-checked', 'checked'], val: 'true' },
  expanded:      { attr: 'aria-expanded', val: 'true' },
  open:          { attr: ['aria-expanded', 'open'], val: 'true' },
  pressed:       { attr: 'aria-pressed',  val: 'true' },
  disabled:      { attr: 'disabled',      val: 'true' },
  invalid:       { attr: 'aria-invalid',  val: 'true' },
  error:         { attr: 'aria-invalid',  val: 'true' },
  current:       { attr: 'aria-current',  val: 'true' },
  indeterminate: { attr: 'aria-checked',  val: 'mixed' },
};
// Does the element say the state the class draws? Runs in the page (its source is put in the sweep) and here in tests.
export function stateHeard(el, spec) {
  return [].concat(spec.attr).some(function (a) {
    if (a === 'disabled') return el.disabled === true || el.getAttribute('aria-disabled') === 'true';
    if (a === 'checked') return el.checked === true;
    if (a === 'open') return el.hasAttribute('open');
    var v = el.getAttribute(a);
    return v === spec.val || (a === 'aria-current' && v !== null && v !== 'false');
  });
}

export function parseColor(s) {
  if (typeof s !== 'string') return null;
  if (s === 'transparent') return { r: 0, g: 0, b: 0, a: 0 };
  const m = s.match(/^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:[\s,/]+([\d.]+))?\s*\)$/i);
  if (m) return { r: +m[1], g: +m[2], b: +m[3], a: m[4] === undefined ? 1 : +m[4] };
  // Chrome keeps oklch(), oklab() and color(srgb …) as written (Tailwind v4 colours are oklch): read them too.
  const c = /^(oklch|oklab|color|hsla?)\(/i.test(s) ? parseCssColor(s) : null;
  return c ? { r: c[0], g: c[1], b: c[2], a: c[3] } : null;
}

// Composite a translucent foreground over an opaque background (both {r,g,b}, fg has a).
export function over(fg, bg) {
  const a = fg.a;
  return { r: fg.r * a + bg.r * (1 - a), g: fg.g * a + bg.g * (1 - a), b: fg.b * a + bg.b * (1 - a) };
}

// Resolve the effective background from a nearest-first stack of computed background-color
// strings (element's own first, ancestors outward up to the first opaque one). Composites over
// white (the canvas default) in paint order.
export function effectiveBg(layers) {
  const parsed = layers.map(parseColor).filter(Boolean);
  let eff = { r: 255, g: 255, b: 255 };
  for (let i = parsed.length - 1; i >= 0; i--) eff = over(parsed[i], eff);
  return eff;
}

// WCAG relative luminance of an {r,g,b} in 0–255.
export function relLuminance({ r, g, b }) {
  const lin = (c) => { const s = c / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

// WCAG contrast ratio between two {r,g,b} colors (1–21).
export function contrastRatio(c1, c2) {
  const L1 = relLuminance(c1), L2 = relLuminance(c2);
  const [hi, lo] = L1 >= L2 ? [L1, L2] : [L2, L1];
  return (hi + 0.05) / (lo + 0.05);
}

// WCAG "large text": >= 24px, or >= 18.66px when bold (>= 700).
export function isLargeText(fontSizePx, fontWeight) {
  const w = Number(fontWeight) || (fontWeight === 'bold' ? 700 : 400);
  return fontSizePx >= 24 || (fontSizePx >= 18.66 && w >= 700);
}

// AA threshold for a text element.
export function aaThreshold(fontSizePx, fontWeight) {
  return isLargeText(fontSizePx, fontWeight) ? 3 : 4.5;
}

// Interactive ARIA roles that must carry an accessible name.
export const INTERACTIVE_ROLES = new Set([
  'button', 'link', 'textbox', 'searchbox', 'checkbox', 'radio', 'switch', 'combobox',
  'listbox', 'menuitem', 'menuitemcheckbox', 'menuitemradio', 'slider', 'spinbutton', 'tab', 'option',
]);

// Turn one theme's captured text leaves into contrast findings (pure; the heart of the gate).
export function contrastFindings(textEls, theme) {
  const out = [];
  for (const el of textEls) {
    if (el.bgImage) { out.push({ kind: 'contrast', theme, desc: el.desc, text: el.text, cannotCompute: 'background-image/gradient' }); continue; }
    // A colour in a space not converted (display-p3 …) is said, never skipped as if it passed.
    const unread = [el.color, ...(el.bgLayers ?? [])].find((c) => typeof c === 'string' && !parseColor(c));
    if (unread) { out.push({ kind: 'contrast', theme, desc: el.desc, text: el.text, cannotCompute: `colour space not read (${unread.slice(0, 40)})` }); continue; }
    const fg = parseColor(el.color);
    if (fg.a === 0) continue;
    const bg = effectiveBg(el.bgLayers);
    // See-through text draws as its blend over the background: measured as drawn, not as its solid colour.
    const ratio = contrastRatio(fg.a < 1 ? over(fg, bg) : fg, bg);
    const threshold = aaThreshold(el.fontSize, el.fontWeight);
    if (ratio + 1e-9 < threshold) {
      out.push({ kind: 'contrast', theme, desc: el.desc, text: el.text, ratio: Math.round(ratio * 100) / 100, threshold });
    }
  }
  return out;
}

// An icon's colour against what it sits on, in one theme: 3:1 at least (WCAG 1.4.11). Pure, like contrastFindings.
export function iconContrastFindings(iconEls, theme) {
  const out = [];
  for (const el of iconEls) {
    if (el.bgImage) continue;
    const fg = parseColor(el.color);
    if (!fg || fg.a === 0) continue;
    const bg = effectiveBg(el.bgLayers);
    const ratio = contrastRatio(fg.a < 1 ? over(fg, bg) : fg, bg);
    if (ratio + 1e-9 < 3) out.push({ kind: 'iconcontrast', theme, desc: el.desc, ratio: Math.round(ratio * 100) / 100, threshold: 3 });
  }
  return out;
}

// A name that comes only from the title attribute: the AX node's winning name source. → true | false
export function namedByTitleOnly(axNode) {
  const won = (axNode?.name?.sources ?? []).find((s) => !s.superseded && (s.value?.value || s.attributeValue?.value));
  return !!won && won.type === 'attribute' && won.attribute === 'title';
}

// ── Plain-language reporting (pure; exported for tests) ─────────────────────────
// No jargon: every issue says what is wrong, why it matters to a real person, and what to
// do about it. `title` returns the count sentence, singular/plural aware.
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
export const A11Y_GUIDE = {
  contrast: {
    title: (n) => `${plural(n, 'piece of text is', 'pieces of text are')} hard to read`,
    why: 'The text colour is too close to its background, so it is hard to read — and can be invisible when the page is shown in the other theme (light vs dark).',
    fix: 'Use a darker or lighter text colour, or add the colour for the theme that is missing.',
  },
  name: {
    title: (n) => `${plural(n, 'button or field has', 'buttons or fields have')} no label for screen readers`,
    why: 'A button that is only an icon, or a field with no label, is silent to someone using a screen reader — they hear nothing when they reach it.',
    fix: 'Give it a name: add aria-label to an icon button, or a <label> to an input.',
  },
  focus: {
    title: (n) => `${plural(n, 'control does', 'controls do')} not show where the keyboard is`,
    why: 'When someone moves through the page with the Tab key, nothing lights up, so they cannot tell which control they are on.',
    fix: 'Add a visible outline (a focus ring) on the control itself when it is focused — not only on a box around it.',
  },
  focuscontrast: {
    title: (n) => `${plural(n, 'focus outline is', 'focus outlines are')} too faint to see`,
    why: 'The control does light up when focused, but the outline is so close in colour to its background that a keyboard user still cannot tell where they are.',
    fix: 'Make the focus outline stand out clearly — a stronger colour or a thicker ring, so it is at least three times the contrast of whatever is behind it.',
  },
  hovercontrast: {
    title: (n) => `${plural(n, 'control becomes', 'controls become')} hard to read on hover`,
    why: 'When the mouse is over the control its colours change to something too faint — readable at rest, but not while it is being used.',
    fix: 'Give the hover state the same care as the normal state: keep the text at least 4.5 times the contrast of its background.',
  },
  ariastate: {
    title: (n) => `${plural(n, 'control shows', 'controls show')} their state only by looks`,
    why: 'Something is marked selected, checked or open only with colour or a CSS class, so a screen reader never announces that state.',
    fix: 'Also set the matching accessibility attribute: aria-selected, aria-checked, aria-expanded, and so on.',
  },
  keyboard: {
    title: (n) => `${plural(n, 'control cannot', 'controls cannot')} be used with the keyboard`,
    why: 'The control works with a mouse, but the Tab key skips over it, so people who only use a keyboard cannot reach it.',
    fix: 'Use a real <button> or link, or add tabindex="0" so it can be focused.',
  },
  target: {
    title: (n) => `${plural(n, 'control is', 'controls are')} too small to tap or click reliably`,
    why: 'A control smaller than 24 by 24 pixels, with other controls close by, is easy to miss or to hit the wrong one — hard for anyone with a tremor or on a touch screen.',
    fix: 'Make the control at least 24 by 24 pixels (padding counts), or keep 24 pixels of space around it.',
  },
  tabtrap: {
    title: (n) => `${plural(n, 'place traps', 'places trap')} the keyboard`,
    why: 'Pressing Tab stops moving at some point, so someone using only a keyboard cannot get past it.',
    fix: 'Let Tab move on (or Escape close) whatever is holding the focus.',
  },
  tooltipname: {
    title: (n) => `${plural(n, 'control says', 'controls say')} what it does only in a tooltip`,
    why: 'The control is an icon whose name is only its title, shown as a tooltip when a mouse rests on it. On a touch screen, or moving with the keyboard, no one sees it, so they cannot tell what the control does.',
    fix: 'Put words beside the icon (a visible label); at least give it aria-label.',
  },
  iconcontrast: {
    title: (n) => `${plural(n, 'icon is', 'icons are')} hard to see`,
    why: 'The icon is the only thing that says what the control or the message is, and its colour is too close to its background (often only in the dark theme, when the icon kept its light-theme colour).',
    fix: 'Draw the icon in currentColor or a token that changes with the theme, at least three times the contrast of its background.',
  },
  tabindex: {
    title: (n) => `${plural(n, 'control jumps', 'controls jump')} the Tab order`,
    why: 'A positive tabindex makes the Tab key visit this control out of reading order, which is confusing to follow.',
    fix: 'Use tabindex="0" (or none) and put the control where it belongs in the page order.',
  },
  escape: {
    title: (n) => `${plural(n, 'dialog does', 'dialogs do')} not close with Escape`,
    why: 'People who use the keyboard expect Escape to close a dialog; without it they can get stuck.',
    fix: 'Close the dialog on Escape and return the focus to what opened it.',
  },
  focusreturn: {
    title: (n) => `${plural(n, 'dialog or menu leaves', 'dialogs or menus leave')} the focus elsewhere when Escape closes it`,
    why: 'After Escape closes it, the focus is not back on the control that opened it, so someone using the keyboard or a screen reader loses their place.',
    fix: 'When it closes, move the focus back to the control that opened it.',
  },
  heading: {
    title: (n) => `${plural(n, 'page has', 'pages have')} no main heading, or several`,
    why: 'A screen reader jumps to the main heading (h1) to learn what a page is about; with none, or several, it cannot.',
    fix: 'Give each page one <h1> that names it (it can be visually hidden); make the other headings <h2> or below.',
  },
  motion: {
    title: (n) => `${plural(n, 'thing still moves', 'things still move')} when the person asked for less motion`,
    why: 'The system setting "reduce motion" is on, but these still animate. Movement can make some people dizzy or sick.',
    fix: 'Inside @media (prefers-reduced-motion: reduce), set the transition and animation to none (or near zero).',
  },
  forcedfocus: {
    title: (n) => `${plural(n, 'focus indicator disappears', 'focus indicators disappear')} in high-contrast mode`,
    why: 'Windows high-contrast mode removes shadows and background colours, so a focus style made only of those vanishes.',
    fix: 'Add a real outline (it can be transparent normally: outline: 2px solid transparent) so high-contrast mode can show it.',
  },
  spacing: {
    title: (n) => `${plural(n, 'piece of text gets', 'pieces of text get')} cut off with wider text spacing`,
    why: 'People who need more space between letters, words and lines (a common reading aid) lose part of this text.',
    fix: 'Do not fix the height or hide the overflow of text boxes; let them grow with their text.',
  },
  activate: {
    title: (n) => `${plural(n, 'control does', 'controls do')} nothing when Enter or Space is pressed`,
    why: 'A control built from a plain element (a div with role="button") only responds to the mouse unless it also listens for the keys, so a keyboard user can reach it but not use it.',
    fix: 'Use a real <button> (or <a href>), or handle Enter (and Space for buttons, checkboxes and switches) on the element.',
  },
  arrows: {
    title: (n) => `${plural(n, 'group does', 'groups do')} not move with the arrow keys`,
    why: 'In a radio group, tab list, menu or list box, keyboard users expect the arrow keys to move between the items; Tab moves out of the group.',
    fix: 'Move focus to the next and previous item on the arrow keys (a roving tabindex), or use native radio buttons.',
  },
  zoom: {
    title: (n) => `${plural(n, 'piece of text is', 'pieces of text are')} cut off at 200% zoom`,
    why: 'People who zoom the page to twice its size need all the text to stay readable; here it is clipped.',
    fix: 'Let the box grow with its text (no fixed height with overflow hidden), or allow the text to wrap.',
  },
  obscured: {
    title: (n) => `${plural(n, 'control is', 'controls are')} hidden under other content when focused`,
    why: 'When someone tabs to it, the control is completely covered (by a sticky header or a banner, for example), so they cannot see where they are.',
    fix: 'Keep sticky content from covering focused controls: add scroll-padding for the sticky area, or move the content.',
  },
  focusthin: {
    title: (n) => `${plural(n, 'focus ring is', 'focus rings are')} thinner than 2 pixels`,
    why: 'A thin focus ring is easy to miss. The enhanced level of WCAG (AAA) asks for at least 2 CSS pixels.',
    fix: 'Draw the focus ring at least 2px thick (outline-width: 2px).',
  },
  rolecontract: {
    title: (n) => `${plural(n, 'component does', 'components do')} not expose what its role requires`,
    why: 'The contract or a Figma note says what the component is (a toggle button, a checkbox, a text field, a tab). Assistive technology needs the matching wiring: the pressed or checked state, a label, the error link, the selected tab.',
    fix: 'Add what the finding names (aria-pressed that changes on click, a real checkbox input with a label, aria-invalid and aria-describedby on an errored field, aria-selected on the selected tab, disabled or aria-disabled).',
  },
  annotation: {
    title: (n) => `${plural(n, 'component does', 'components do')} not render what its Figma accessibility note says`,
    why: 'A Figma annotation on the component states its role, name, heading level or alt text; the rendered page says something else.',
    fix: 'Render what the annotation says, or update the annotation in Figma if the design changed.',
  },
  reflow: {
    title: (n) => `${plural(n, 'page scrolls', 'pages scroll')} sideways on a narrow screen`,
    why: 'At 320 pixels wide (a phone, or a page zoomed to 400%) the content does not fit, so people have to scroll in two directions to read it.',
    fix: 'Let the layout wrap or stack at narrow widths instead of keeping a fixed width.',
  },
  partrole: {
    title: (n) => `${plural(n, 'part does', 'parts do')} not do what its Figma part role says`,
    why: 'Figma marks an inner layer as the label, the error message, the indicator or a step button of its component. Each owes the control something: a label names it, an error message is linked while it shows, an indicator stays silent, a step button has a name.',
    fix: 'Wire the part as the finding says (a <label for>, aria-describedby, aria-hidden="true", aria-label), or correct the annotation in Figma.',
  },
  behaviour: {
    title: (n) => `${plural(n, 'component does', 'components do')} not behave as its role or its Figma note says`,
    why: 'What a person can do with a component comes with its role: Space flips a toggle, a click opens a disclosure, a tab takes the selection, a text box takes typing. Figma notes can add more (Escape closes, the arrow keys move).',
    fix: 'Make the component do it (the finding says what was tried and what happened), or record the person\'s exception with a link to its decision in contract.authored.json → behaviourExceptions.',
  },
  statefollows: {
    title: (n) => `${plural(n, 'state changes', 'states change')} the look but not what a screen reader hears`,
    why: 'An option that shows a state (selected, checked, expanded, in error) changes only a class here, so a screen reader still announces the component as it was.',
    fix: 'Set the attribute the finding names together with the class (aria-pressed, aria-checked, aria-expanded, aria-invalid), from the same prop.',
  },
  semantics: {
    title: (n) => `${plural(n, 'component is', 'components are')} announced as something else than the design system says`,
    why: 'A screen reader announces the element by its role. The contract says what each component is; this one renders as something different.',
    fix: 'Use the element or role the contract names (contract.authored.json → semantics), or correct the contract.',
  },
  // WCAG 2.1 A and AA, the rest of what a component can be checked for (wcag-page.js, wcag21.mjs).
  ...WCAG21_GUIDE,
};
const A11Y_ROLE_WORD = { button: 'A button', link: 'A link', textbox: 'An input field', searchbox: 'A search field', checkbox: 'A checkbox', radio: 'A radio button', switch: 'A switch', combobox: 'A dropdown', tab: 'A tab', slider: 'A slider' };
// One readable line locating a single finding.
export function a11yItemLine(kind, f) {
  if (kind === 'contrast') {
    const what = f.text ? `the text "${f.text}"` : (f.desc || 'text');
    return `${what} — its readability score is ${f.ratio} out of 21, needs at least ${f.threshold} (${f.theme} theme)${f.places > 1 ? `, in ${f.places} places` : ''}`;
  }
  if (kind === 'focuscontrast') return `${f.desc} — its focus outline scores ${f.ratio} out of 21, needs at least ${f.threshold}`;
  if (kind === 'iconcontrast') return `${f.desc} — the icon scores ${f.ratio} out of 21 against its background, needs at least ${f.threshold} (${f.theme} theme)${f.places > 1 ? `, in ${f.places} places` : ''}`;
  if (kind === 'hovercontrast') { const what = f.text ? `the text "${f.text}"` : (f.desc || 'text'); return `${what} on hover — its readability score is ${f.ratio} out of 21, needs at least ${f.threshold}`; }
  if (kind === 'name') return `${A11Y_ROLE_WORD[f.role] || `A ${f.role || 'control'}`} with no label`;
  if (kind === 'target') return `${f.desc} — ${f.size} with another control within 24 pixels`;
  if (kind === 'semantics') return `${f.desc} — announced as "${f.got}", the contract says "${f.want}"`;
  const where = f.modes && f.modes.length > 1 ? ` (${f.modes.join(', ')})` : '';
  return f.desc + where + (f.places > 1 ? `, in ${f.places} places` : '');   // focus / ariastate / keyboard / motion … — the CSS selector locates the element
}
// The same element failing the same way in many places (a component shown once per prop value on
// the styleguide) is one finding, with the number of places and a few of its texts.
export function groupSame(list) {
  const by = new Map();
  for (const f of list) {
    const k = [f.desc, f.theme, f.ratio, f.threshold].join('|');
    const g = by.get(k);
    if (!g) { by.set(k, { ...f, places: 1, texts: f.text ? [f.text] : [] }); continue; }
    g.places++;
    if (f.text && g.texts.length < 3 && !g.texts.includes(f.text)) g.texts.push(f.text);
  }
  return [...by.values()].map((g) => (g.places > 1 ? { ...g, text: g.texts.map((t) => `"${t}"`).join(', ').replace(/^"|"$/g, '') } : g));
}
// Structured record for --json (machines / an agent that fixes the code): exact locator +
// numbers + the fix. Same facts as the plain lines, but parseable.
export function a11yFindingRecord(kind, f) {
  const rec = { issue: kind, selector: f.desc ?? null, fix: A11Y_GUIDE[kind]?.fix ?? null };
  if (WCAG21_KIND[kind]) rec.wcag = WCAG21_KIND[kind];
  if (kind === 'contrast' || kind === 'hovercontrast') { rec.theme = f.theme ?? null; rec.text = f.text ?? null; rec.contrast = f.ratio ?? null; rec.needs = f.threshold ?? null; }
  if (kind === 'focuscontrast') { rec.contrast = f.ratio ?? null; rec.needs = f.threshold ?? null; }
  if (kind === 'iconcontrast') { rec.theme = f.theme ?? null; rec.contrast = f.ratio ?? null; rec.needs = f.threshold ?? null; }
  if (kind === 'name') rec.role = f.role ?? null;
  if (kind === 'target') rec.size = f.size ?? null;
  if (kind === 'semantics') { rec.rendered = f.got ?? null; rec.contract = f.want ?? null; }
  if (f.modes) rec.modes = f.modes;
  if (f.places > 1) rec.places = f.places;
  return rec;
}
// Collapse axe-core's per-node violations into one row per rule (highest count first).
export function summarizeAxe(violations) {
  const byId = {};
  for (const v of violations || []) {
    const e = (byId[v.id] ??= { id: v.id, help: v.help, impact: v.impact, helpUrl: v.helpUrl, count: 0, targets: [] });
    e.count += v.count || 0;
    for (const t of v.targets || []) if (e.targets.length < 8 && !e.targets.includes(t)) e.targets.push(t);
  }
  return Object.values(byId).sort((a, b) => b.count - a.count);
}

// ── Auto-discovery: start the project's dev server and enumerate render pages ────
// The most-automated path when nothing is configured and there is no static build. Reads
// package.json for a dev/serve/storybook script, starts it, reads the URL it prints, then
// enumerates targets: Storybook stories → else static router routes → else the base page.
// Fully agnostic (no DS shape assumed) and opt-out via ds-config.json → a11y.discover:false.
// Any failure returns null/nothing — the caller then asks or skips, never a crash.
function detectServeCmd(ROOT, cfg) {
  if (cfg.a11y?.serve) return cfg.a11y.serve;
  let pkg; try { pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')); } catch { return null; }
  const s = pkg.scripts || {};
  for (const name of ['storybook', 'dev', 'serve', 'start', 'preview']) if (s[name]) return 'npm run ' + name;
  return null;
}
export function startDevServer(cmd, ROOT) {
  const parts = cmd.split(/\s+/);
  const proc = spawn(parts[0], parts.slice(1), { cwd: ROOT, detached: true, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, BROWSER: 'none', FORCE_COLOR: '0', NO_COLOR: '1' } });
  const stop = () => { try { process.kill(-proc.pid, 'SIGTERM'); } catch { try { proc.kill('SIGTERM'); } catch {} } };
  const url = new Promise((res) => {
    let buf = '', done = false;
    const finish = (v) => { if (!done) { done = true; res(v); } };
    // A server that prints its address in colour (Vite puts the port in bold) is read without the colour codes.
    const scan = (d) => { buf += d.toString().replace(/\x1b\[[0-9;]*m/g, ''); const m = buf.match(/https?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])(?::\d+)?[^\s'"]*/i); if (m) finish(m[0].replace(/\/+$/, '')); };
    proc.stdout.on('data', scan); proc.stderr.on('data', scan);
    proc.on('exit', () => finish(null));
    setTimeout(() => finish(null), 40000);   // give the server up to 40s to print a URL
  });
  return { url, stop };
}
async function fetchJson(u) { try { const r = await fetch(u, { signal: AbortSignal.timeout(6000) }); return r.ok ? await r.json() : null; } catch { return null; } }
async function discoverStorybook(base) {
  for (const p of ['/index.json', '/stories.json']) {
    const j = await fetchJson(base + p); if (!j) continue;
    const entries = j.entries || j.stories || {};
    const ids = Object.values(entries).filter((e) => (e.type ?? 'story') === 'story').map((e) => e.id).filter(Boolean);
    if (ids.length) return ids.map((id) => `${base}/iframe.html?id=${encodeURIComponent(id)}&viewMode=story`);
  }
  return null;
}
// The project's own pages, from its router: every static path in its router files (the usual single files, and every
// file under src/router or src/routes, its modules included), as hash URLs when the router uses hash history
// (/#/components/buttons/primary). Scoped to components (prefer: their names and selectors), only the pages whose view
// uses one of them, the component's own page first (its folder and name in the path); every page when none does.
const squashName = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, '');
export function discoverRoutes(ROOT, base, { prefer = [], read = (f) => { try { return readFileSync(f, 'utf8'); } catch { return ''; } } } = {}) {
  const files = new Set(['src/router/index.ts', 'src/router/index.js', 'src/router.ts', 'src/router.js', 'src/routes.ts', 'src/routes.js', 'src/App.tsx', 'src/App.jsx'].map((r) => join(ROOT, r)).filter((f) => existsSync(f)));
  const walk = (dir, depth = 0) => {
    let names = []; try { names = readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of names) {
      const p = join(dir, e.name);
      if (e.isDirectory()) { if (depth < 4 && !e.name.startsWith('.') && e.name !== 'node_modules') walk(p, depth + 1); }
      else if (/\.(m?[jt]sx?)$/.test(e.name) && !/\.(test|spec)\./.test(e.name)) files.add(p);
    }
  };
  for (const d of ['src/router', 'src/routes', 'src/routing']) walk(join(ROOT, d));
  // A module path as the router writes it (@/views/x.vue, ./x, ~/x) → the file, or null.
  const fileOf = (from, spec) => {
    const raw = /^[@~]\//.test(spec) ? join(ROOT, 'src', spec.slice(2)) : spec.startsWith('.') ? join(dirname(from), spec) : null;
    if (!raw) return null;
    for (const x of ['', '.vue', '.js', '.ts', '.jsx', '.tsx', '.svelte', '/index.vue', '/index.js', '/index.ts', '/index.tsx']) if (existsSync(raw + x) && !/\/$/.test(raw + x)) { try { if (statSync(raw + x).isFile()) return raw + x; } catch { /* not a file */ } }
    return null;
  };
  const routes = new Map();
  let hash = false;
  for (const f of files) {
    const txt = read(f);
    if (/\bcreate(?:Web)?HashHistory\s*\(|<HashRouter\b|\bcreateHashRouter\s*\(/.test(txt)) hash = true;
    const imports = new Map([...txt.matchAll(/import\s+([A-Za-z_$][\w$]*)\s+from\s+['"]([^'"]+)['"]/g)].map((m) => [m[1], m[2]]));
    const found = [...txt.matchAll(/\bpath\s*:\s*['"`]([^'"`]+)['"`]/g)];
    found.forEach((m, i) => {
      const p = m[1];
      if (!p.startsWith('/') || p.includes(':') || p.includes('*') || routes.has(p)) return;   // static routes only (no params/wildcards)
      const chunk = txt.slice(m.index, found[i + 1]?.index ?? m.index + 600);
      const c = /\bcomponent\s*:\s*(?:\(\s*\)\s*=>\s*import\(\s*['"]([^'"]+)['"]\s*\)|([A-Za-z_$][\w$]*)\b)/.exec(chunk);
      const spec = c ? (c[1] ?? imports.get(c[2])) : null;
      routes.set(p, spec ? fileOf(f, spec) : null);
    });
  }
  let list = [...routes];
  const keys = [...new Set(prefer.map(squashName).filter((k) => k.length >= 3))];
  if (keys.length) {
    const uses = ([, view]) => view && keys.some((k) => squashName(read(view)).includes(k));
    // Its own page: the path's last two segments spell it (/components/buttons/primary is buttonPrimary).
    const own = ([p]) => { const seg = p.split('/').filter(Boolean).slice(-2).map(squashName); return seg.length === 2 && keys.some((k) => k === seg[0] + seg[1] || k === seg[0].replace(/(?<=...)s$/, '') + seg[1]); };
    const hit = list.filter((r) => uses(r) || own(r));
    if (hit.length) list = [...hit.filter(own), ...hit.filter((r) => !own(r))];
  }
  const b = base.replace(/\/$/, '') + (hash ? '/#' : '');
  return list.length ? list.map(([p]) => b + p) : null;
}

// A class the code gives an element: in a class attribute, as a quoted name a binding adds (:class, clsx), or as a CSS
// selector. A word in a comment is not one. A selector that is not one plain class is taken as present.
export function classInCode(code, sel) {
  const c = /^\.(-?[A-Za-z_][\w-]*)$/.exec(String(sel).trim())?.[1];
  if (!c) return true;
  const e = c.replace(/-/g, '\\-');
  return new RegExp(`class(?:Name)?\\s*=\\s*["'\`](?:[^"'\`]*\\s)?${e}(?=[\\s"'\`])|["'\`]${e}["'\`]|(?:^|[\\s,{>+~(&])\\.${e}(?![\\w-])`, 'm').test(String(code));
}

// The classes in the code that hold a name (modal-overlay for modal), most used first: the likely answer.
export function classesLike(code, names, max = 4) {
  const counts = new Map();
  for (const m of String(code).matchAll(/class(?:Name)?\s*=\s*["'`]([^"'`]+)["'`]/g)) for (const c of m[1].split(/\s+/)) if (/^-?[A-Za-z_][\w-]*$/.test(c)) counts.set(c, (counts.get(c) ?? 0) + 1);
  const sq = (x) => String(x).toLowerCase().replace(/[^a-z0-9]/g, '');
  return [...counts].filter(([c]) => names.some((n) => sq(c).includes(sq(n)))).sort((a, b) => b[1] - a[1]).slice(0, max).map(([c]) => '.' + c);
}

// ── CLI arg helpers ─────────────────────────────────────────────────────────────
function argValues(flag, argv) {
  const out = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === flag && argv[i + 1]) out.push(argv[i + 1]);
    else if (argv[i].startsWith(flag + '=')) out.push(argv[i].slice(flag.length + 1));
  }
  return out.flatMap((v) => v.split(',')).map((s) => s.trim()).filter(Boolean);
}

// ── The generated styleguide as a render target ─────────────────────────────────
// styleguide-gen.mjs writes one static page rendering every component × every state. As a
// file:// a11y target it is deterministic, complete and needs no dev server — and because
// each state is its own instance in the resting DOM, the existing sweep gets per-state
// coverage for free. Returns the target or null (missing, or opted out via a11y.styleguide:false).
export function styleguideTarget(cfg, ROOT, exists = existsSync, read = (f) => readFileSync(f, 'utf8')) {
  if (cfg?.a11y?.styleguide === false) return null;
  // A guide that draws no component (built before any was agreed, or with no Figma data) has nothing to try: the
  // project's own pages are checked instead. One whose list cannot be read is taken as it is.
  const draws = (abs) => {
    try { const m = /<script[^>]*\bid=["']sg-data["'][^>]*>([\s\S]*?)<\/script>/.exec(read(abs)); return !m || (JSON.parse(m[1]).components ?? [1]).length > 0; } catch { return true; }
  };
  // Where the style guide is written: the configured place, else the project's own template's, else the engine's.
  for (const rel of [cfg?.styleguide?.out, 'apps/styleguide/index.html', `${OUT_DIR}/styleguide/index.html`].filter(Boolean)) {
    const abs = join(ROOT, rel);
    if (exists(abs) && draws(abs)) return { label: rel, url: pathToFileURL(abs).href + '?all', styleguide: true };   // every view drawn at once
  }
  // Not built by the project yet: the code capture keeps its own copy, built from the same template.
  const cap = join(ROOT, dirname(codeSnapshotPath(cfg)), 'styleguide.html');
  return cfg?.styleguide?.template && exists(cap) ? { label: 'styleguide (built by the code capture)', url: pathToFileURL(cap).href + '?all', styleguide: true } : null;
}

// Chrome discovery + DevTools plumbing live in cdp.mjs (shared with Gate [16]).

// The in-page sweep: collect visible text leaves (with their computed color + background layer
// stack + font) and focusable elements that show no focus-style change. Runs entirely in the page.
function sweepExpression(roots, doFocus, stateMap) {
  return `(() => {
    const roots = ${JSON.stringify(roots)};
    const rootEls = roots ? roots.flatMap(s => [...document.querySelectorAll(s)]) : [document.body];
    const scope = roots ? [...new Set(rootEls.flatMap(r => [r, ...r.querySelectorAll('*')]))] : [...document.body.querySelectorAll('*')];   // roots may nest: each element once
    const vis = (el) => { const s = getComputedStyle(el); if (s.display==='none'||s.visibility==='hidden'||+s.opacity===0) return false; const r = el.getBoundingClientRect(); return r.width>0 && r.height>0; };
    const disabled = (el) => el.disabled===true || el.getAttribute('aria-disabled')==='true';
    const seen = new Set();
    // The design-system component an element belongs to (the innermost root around it, or the
    // element itself when it is one), so a bare "button" still says where it is.
    const ownerOf = (el) => { if (!roots) return ''; let best = null, depth = -1; for (const s of roots) { let r; try { r = el.closest(s); } catch { continue; } if (!r) continue; let d = 0; for (let n = r; n; n = n.parentElement) d++; if (d > depth) { depth = d; best = s; } } return best ? ' in ' + best : ''; };
    const textEls = [];
    for (const el of scope) {
      if (seen.has(el)) continue; seen.add(el);
      // Text in a disabled control is exempt (WCAG 1.4.3) wherever in the control it sits: <button disabled><span>.
      if (!vis(el) || disabled(el) || el.closest(':disabled,[aria-disabled="true"]')) continue;
      const hasText = [...el.childNodes].some(n => n.nodeType===3 && n.textContent.trim());
      if (!hasText) continue;
      const cs = getComputedStyle(el);
      const layers = []; let node = el;
      while (node && node.nodeType===1) {
        const b = getComputedStyle(node).backgroundColor; layers.push(b);
        const mm = b.match(/^rgba?\\(([^)]+)\\)/);
        const parts = mm ? mm[1].split(',') : null;
        const a = parts ? (parts[3]!==undefined ? parseFloat(parts[3]) : 1) : 0;
        if (a === 1) break;
        node = node.parentElement;
      }
      const cls = (el.className && typeof el.className==='string') ? '.'+el.className.trim().split(/\\s+/).join('.') : '';
      textEls.push({
        desc: (el.tagName.toLowerCase() + (el.id?('#'+el.id):'') + cls).slice(0,80) + ownerOf(el),
        text: [...el.childNodes].filter(n=>n.nodeType===3).map(n=>n.textContent).join(' ').trim().slice(0,40),
        color: cs.color, bgLayers: layers,
        fontSize: parseFloat(cs.fontSize) || 16, fontWeight: cs.fontWeight,
        bgImage: !!(cs.backgroundImage && cs.backgroundImage !== 'none'),
      });
    }
    // A placeholder on show is text (WCAG 1.4.3): its own colour against the field.
    for (const el of scope) {
      if (!el.matches || !el.matches('input[placeholder],textarea[placeholder]') || !el.getAttribute('placeholder').trim() || el.value || !vis(el) || el.closest(':disabled,[aria-disabled="true"]')) continue;
      const ps = getComputedStyle(el, '::placeholder'), cs = getComputedStyle(el);
      const layers = []; let node = el;
      while (node && node.nodeType===1) { const b = getComputedStyle(node).backgroundColor; layers.push(b); const mm = b.match(/^rgba?\\(([^)]+)\\)/); const parts = mm ? mm[1].split(',') : null; if ((parts ? (parts[3]!==undefined ? parseFloat(parts[3]) : 1) : 0) === 1) break; node = node.parentElement; }
      const cls = (el.className && typeof el.className==='string') ? '.'+el.className.trim().split(/\\s+/).join('.') : '';
      textEls.push({ desc: (el.tagName.toLowerCase() + (el.id?('#'+el.id):'') + cls).slice(0,80) + '::placeholder' + ownerOf(el), text: el.getAttribute('placeholder').trim().slice(0,40),
        color: ps.color, bgLayers: layers, fontSize: parseFloat(ps.fontSize || cs.fontSize) || 16, fontWeight: ps.fontWeight || cs.fontWeight, bgImage: !!(cs.backgroundImage && cs.backgroundImage !== 'none') });
    }
    // Icons that carry meaning: the only content of a control, or named themselves (role="img", aria-label, a <title>).
    // Their colour: an svg's painted fill or stroke, a masked icon's background, an icon font's text colour.
    const iconEls = [];
    const CONTROL = 'a[href],button,[role=button],[role=link],[role=tab],[role=menuitem],[role=switch]';
    for (const el of scope) {
      const svg = el.tagName && el.tagName.toLowerCase() === 'svg' && !el.parentElement?.closest('svg');
      const mcs = getComputedStyle(el), mask = (mcs.maskImage && mcs.maskImage !== 'none') || (mcs.webkitMaskImage && mcs.webkitMaskImage !== 'none');
      if (!(svg || mask) || !vis(el) || disabled(el) || el.closest('[disabled],[aria-disabled="true"]')) continue;
      const ctl = el.closest(CONTROL);
      const words = ctl && [...ctl.querySelectorAll('*'), ctl].some((n) => [...n.childNodes].some((t) => t.nodeType === 3 && t.textContent.trim()) && vis(n));
      const named = el.getAttribute('role') === 'img' || el.hasAttribute('aria-label') || !!(svg && el.querySelector(':scope > title'));
      if (!(named || (ctl && !words))) continue;
      let color = null;
      if (mask) color = mcs.backgroundColor;
      else {
        // A sprite icon (<use href="#icon-x">) is painted from its symbol: a fill or stroke written there, else what the
        // <use> passes down (currentColor its text colour).
        const paint = (v, ctx) => (!v || v === 'none' || /^url/.test(v) ? null : /^currentcolor$/i.test(v) ? getComputedStyle(ctx).color : v);
        const SHAPES = 'path,circle,rect,ellipse,line,polyline,polygon,text';
        for (const sh of el.querySelectorAll(SHAPES + ',use')) {
          if (sh.tagName.toLowerCase() === 'use') {
            const ref = document.getElementById(String(sh.getAttribute('href') || sh.getAttribute('xlink:href') || '').replace(/^#/, ''));
            const inner = ref ? [...ref.querySelectorAll(SHAPES)] : [];
            const own = (n, a) => { for (let x = n; x && x !== ref?.parentElement; x = x.parentElement) { const v = x.getAttribute(a) || (x.style && x.style.getPropertyValue(a)); if (v && v !== 'inherit') return v; } return null; };
            const uc = getComputedStyle(sh);
            for (const n of inner) { const f = own(n, 'fill'), st = own(n, 'stroke'); color = f ? paint(f, sh) : st ? paint(st, sh) : (paint(uc.fill, sh) || paint(uc.stroke, sh)); if (color) break; }
          } else { const c = getComputedStyle(sh); color = paint(c.fill, sh) || paint(c.stroke, sh); }
          if (color) break;
        }
        if (!color) { const c = getComputedStyle(el); color = (c.fill && c.fill !== 'none' && !/^url/.test(c.fill)) ? c.fill : c.color; }
      }
      const layers = []; let node = mask ? el.parentElement : el;
      while (node && node.nodeType===1) {
        const b = getComputedStyle(node).backgroundColor; layers.push(b);
        const mm = b.match(/^rgba?\\(([^)]+)\\)/);
        const parts = mm ? mm[1].split(',') : null;
        const a = parts ? (parts[3]!==undefined ? parseFloat(parts[3]) : 1) : 0;
        if (a === 1) break;
        node = node.parentElement;
      }
      const host = ctl || el;
      const cls = (host.className && typeof host.className==='string') ? '.'+host.className.trim().split(/\\s+/).join('.') : '';
      iconEls.push({ desc: (host.tagName.toLowerCase() + (host.id?('#'+host.id):'') + cls).slice(0,80) + ownerOf(host), color, bgLayers: layers, bgImage: false });
    }
    let noFocus = [], faintFocus = [], thinFocus = [], ariaState = [], notKeyboard = [];
    if (${doFocus ? 'true' : 'false'}) {
      const STATE_MAP = ${JSON.stringify(stateMap || {})};
      const stateWords = Object.keys(STATE_MAP);
      const stateHeard = ${stateHeard.toString()};
      const INTERACTIVE = 'a[href],button,input:not([type=hidden]),select,textarea,[tabindex],[role=button],[role=link],[role=checkbox],[role=radio],[role=switch],[role=tab],[role=menuitem],[role=option],[role=combobox],[role=slider]';
      const NATIVE_FOCUSABLE = 'a[href],button,input:not([type=hidden]),select,textarea';
      const IROLES = ['button','link','checkbox','radio','switch','tab','menuitem','option','combobox','slider'];
      for (const el of scope) {
        // A native checkbox or radio hidden under the part that draws it (opacity 0, beside its circle or track) is still
        // the control the keyboard reaches: its focus is judged by that part.
        const shown = vis(el);
        const hiddenNative = !shown && el.matches('input[type=checkbox],input[type=radio]') && (() => { const st = getComputedStyle(el); return st.display !== 'none' && st.visibility !== 'hidden' && !!el.parentElement && vis(el.parentElement); })();
        if (!shown && !hiddenNative) continue;
        const desc = (el.tagName.toLowerCase()+(el.id?('#'+el.id):'')).slice(0,60);
        const role = el.getAttribute('role');
        const isInteractive = el.matches(INTERACTIVE);
        // 3. Visible focus — does focusing change the look, and is that change actually visible?
        if (!disabled(el) && el.matches('a[href],button,input:not([type=hidden]),select,textarea,[tabindex],[role=button],[role=link]')) {
          // A focus style may be an outline, a shadow, a border, a background change, an underline,
          // or drawn on ::before / ::after: every one of those counts as a visible change.
          // An outline's colour counts only while an outline is drawn (a ring kept transparent at rest that takes a colour on focus).
          const ring = (x) => (x.outlineStyle !== 'none' && parseFloat(x.outlineWidth) > 0 ? x.outlineColor : '');
          const look = (s, pb, pa) => [s.outlineStyle, s.outlineWidth, ring(s), s.boxShadow, s.borderColor, s.borderWidth, s.backgroundColor, s.textDecorationLine,
            pb.outlineStyle, ring(pb), pb.boxShadow, pb.borderColor, pb.backgroundColor, pb.opacity, pa.outlineStyle, ring(pa), pa.boxShadow, pa.borderColor, pa.backgroundColor, pa.opacity].join('|');
          // The box that holds only this control (a field's frame around its borderless input) may show the focus
          // for it (:focus-within): up to two levels up, while no other control is inside.
          const boxes = []; for (let p = el.parentElement, i = 0; p && i < 2 && p.querySelectorAll('a[href],button,input:not([type=hidden]),select,textarea,[tabindex]').length === 1; p = p.parentElement, i++) boxes.push(p);
          const boxState = (p) => { const s = getComputedStyle(p); return { key: [s.outlineStyle, s.outlineWidth, s.outlineColor, s.boxShadow, s.borderColor, s.backgroundColor].join('|'), outline: s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) > 0 ? s.outlineColor : '', ow: parseFloat(s.outlineWidth) || 0, shadow: s.boxShadow, border: s.borderTopColor, bw: parseFloat(s.borderTopWidth) || 0, bg: s.backgroundColor }; };
          // A focus style that eases in (a frame whose border colour takes 0.15s) is read where it ends, as a keyboard
          // user sees it once it has drawn, and its rest where the easing back ends: the transitions a focus or a blur
          // starts, on the control and its frame, are finished before either is read.
          const settle = () => { for (const x of [el, ...boxes]) { try { for (const an of x.getAnimations({ subtree: x === el })) if (typeof CSSTransition !== 'undefined' && an instanceof CSSTransition) an.finish(); } catch (e) {} } };
          // The element the keyboard is already on (the page's first Tab) is let go first, so its look before is its rest;
          // a control let go before (by focusing another) may still be easing back: settled too.
          if (document.activeElement === el) { try { el.blur(); } catch(e){} }
          settle();
          const b = getComputedStyle(el); const pseudoAt = (s) => ['::before', '::after'].map((w) => { const p = getComputedStyle(el, w); return { w, outline: p.outlineStyle !== 'none' && parseFloat(p.outlineWidth) > 0 ? p.outlineColor : null, border: p.borderTopColor, shadow: p.boxShadow, bg: p.backgroundColor }; });
          const before = look(b, getComputedStyle(el, '::before'), getComputedStyle(el, '::after')); const pseudoBefore = pseudoAt();
          const boxBefore = boxes.map(boxState);
          // The parts beside it in the box that holds only this control (a radio's circle, a switch's track, drawn next to
          // the native input they stand for): what shows its focus may be one of them (input:focus-visible + .circle).
          const parts = boxes.length ? Array.prototype.filter.call(boxes[boxes.length - 1].querySelectorAll('*'), (k) => k !== el && !el.contains(k) && !k.contains(el)).slice(0, 30) : [];
          const partState = (k) => { const x = boxState(k); const pa = getComputedStyle(k, '::after'), pb = getComputedStyle(k, '::before'); x.key += '|' + [pb.outlineStyle, pb.outlineColor, pb.boxShadow, pb.borderColor, pa.outlineStyle, pa.outlineColor, pa.boxShadow, pa.borderColor].join('|'); x.offset = parseFloat(getComputedStyle(k).outlineOffset || '0'); return x; };
          const partBefore = parts.map(partState);
          try { el.focus(); } catch(e){}
          settle(); for (const k of parts) { try { for (const an of k.getAnimations()) if (typeof CSSTransition !== 'undefined' && an instanceof CSSTransition) an.finish(); } catch (e) {} }
          // A control that does not take the focus here (inside an inert thumbnail) shows none to judge.
          const took = document.activeElement === el;
          const a = getComputedStyle(el); const after = look(a, getComputedStyle(el, '::before'), getComputedStyle(el, '::after'));
          const boxAfter = boxes.map(boxState);
          const changedBox = boxAfter.findIndex((x, i) => x.key !== boxBefore[i].key);
          const partAfter = parts.map(partState);
          const changedPart = partAfter.findIndex((x, i) => x.key !== partBefore[i].key);
          // A hidden control's own ring is never seen: only what changes around it counts.
          const same = before === after || !shown;
          // A shadow ring may have several layers (a white gap, then a coloured ring): each colour is kept, and the
          // ring counts as seen when one of them stands out.
          const shadowLayers = (v) => v.split(/,(?![^(]*\\))/).map((l) => { const m = l.match(/(?:rgba?|oklch|oklab|color|hsla?)\\([^)]+\\)/); const lens = l.replace(/[a-z]+\\([^)]+\\)/g, '').match(/-?[\\d.]+px/g) || []; return { color: m ? m[0] : null, px: Math.max(parseFloat(lens[2] || '0'), parseFloat(lens[3] || '0')) }; }).filter((l) => l.color);
          // What surrounds a box: the first opaque background from it up (its own, or its parent's for a ring outside it).
          const layersFrom = (node) => { const out = []; while (node && node.nodeType===1) { const bg = getComputedStyle(node).backgroundColor; out.push(bg); const mm = bg.match(/^rgba?\\(([^)]+)\\)/); const parts = mm ? mm[1].split(',') : null; const al = parts ? (parts[3]!==undefined ? parseFloat(parts[3]) : 1) : 0; if (al === 1) break; node = node.parentElement; } return out; };
          if (!took) { /* nothing to judge */ }
          else if (same && changedBox < 0 && changedPart >= 0) {
            // A part beside it shows the focus (its circle, its track): measured as a ring on the control is.
            const was = partBefore[changedPart], is = partAfter[changedPart], part = parts[changedPart];
            let ind = null, px = null, outside = false;
            if (is.outline && is.outline !== was.outline) { ind = [is.outline]; px = is.ow; outside = is.offset >= 0; }
            else if (is.shadow !== was.shadow && is.shadow !== 'none') { const ls = shadowLayers(is.shadow); ind = ls.length ? ls.map((l) => l.color) : null; px = ls.length ? Math.max(...ls.map((l) => l.px)) : null; outside = !/inset/.test(is.shadow); }
            else if (is.border !== was.border) { ind = [is.border]; px = is.bw; }
            else if (is.bg !== was.bg) { ind = [is.bg]; }
            if (px != null && px < 2) thinFocus.push({ desc, px: Math.round(px * 10) / 10 });
            if (ind) faintFocus.push({ desc, colors: ind, bgLayers: layersFrom(outside && part.parentElement ? part.parentElement : part) });
          }
          else if (same && changedBox >= 0) {
            // Its frame shows the focus (WCAG 2.4.7 takes an indicator around the control): what changed on the frame is
            // measured as a ring on the control is, against what surrounds the frame (1.4.11) and for its thickness.
            const was = boxBefore[changedBox], is = boxAfter[changedBox], frame = boxes[changedBox];
            let ind = null, px = null;
            if (is.outline && is.outline !== was.outline) { ind = [is.outline]; px = is.ow; }
            else if (is.shadow !== was.shadow && is.shadow !== 'none') { const ls = shadowLayers(is.shadow); ind = ls.length ? ls.map((l) => l.color) : null; px = ls.length ? Math.max(...ls.map((l) => l.px)) : null; }
            else if (is.border !== was.border) { ind = [is.border]; px = is.bw; }
            else if (is.bg !== was.bg) { ind = [is.bg]; }
            if (px != null && px < 2) thinFocus.push({ desc, px: Math.round(px * 10) / 10 });
            if (ind) faintFocus.push({ desc, colors: ind, bgLayers: layersFrom(frame.parentElement || frame) });
          }
          else if (same) { noFocus.push(desc); }
          else {
            // Something changed — capture the focus-indicator colour + its background so Node can
            // check it is perceivable (WCAG 1.4.11, >= 3:1). A ring that "changes" but is nearly the
            // same colour as its background is still invisible to a keyboard user.
            let ind = null, outside = false, px = null;
            if (a.outlineStyle !== 'none' && parseFloat(a.outlineWidth) > 0 && (a.outlineColor !== b.outlineColor || a.outlineStyle !== b.outlineStyle || a.outlineWidth !== b.outlineWidth)) { ind = [a.outlineColor]; outside = parseFloat(a.outlineOffset || '0') >= 0; px = parseFloat(a.outlineWidth); }
            else if (a.boxShadow !== b.boxShadow && a.boxShadow !== 'none') { const ls = shadowLayers(a.boxShadow); ind = ls.length ? ls.map((l) => l.color) : null; outside = !/inset/.test(a.boxShadow); px = ls.length ? Math.max(...ls.map((l) => l.px)) : null; }
            else if (a.borderColor !== b.borderColor) { ind = [a.borderColor]; px = parseFloat(a.borderTopWidth); }
            else if (a.outlineStyle !== 'none' && parseFloat(a.outlineWidth) > 0) { ind = [a.outlineColor]; outside = parseFloat(a.outlineOffset || '0') >= 0; px = parseFloat(a.outlineWidth); }
            else {
              // A ring drawn on ::before / ::after: the part of it that changed is measured, against the element.
              const now = pseudoAt();
              for (let i = 0; i < 2 && !ind; i++) {
                const was = pseudoBefore[i], is = now[i];
                if (is.outline && is.outline !== was.outline) ind = [is.outline];
                else if (is.shadow !== was.shadow && is.shadow !== 'none') ind = shadowLayers(is.shadow).map((l) => l.color);
                else if (is.border !== was.border) ind = [is.border];
                else if (is.bg !== was.bg) ind = [is.bg];
              }
            }
            // WCAG 2.4.13 (AAA, advisory): a focus indicator at least 2 CSS pixels thick.
            // The browser's own ring (outline-style: auto) is drawn by the browser, not by this width.
            if (px != null && px < 2 && a.outlineStyle !== 'auto') thinFocus.push({ desc, px: Math.round(px * 10) / 10 });
            // The browser's own ring (outline-style: auto) is drawn in two tones so it shows on any background.
            // A ring drawn outside the element sits on what surrounds it: measure against the parent.
            if (ind && a.outlineStyle !== 'auto') faintFocus.push({ desc, colors: ind, bgLayers: layersFrom(outside && el.parentElement ? el.parentElement : el) });
          }
          try { el.blur(); } catch(e){}
          settle();
        }
        // 4. State communicated ONLY by a CSS class — a state word in the class list with no
        //    matching aria/native state, so assistive tech never hears the state.
        if (isInteractive || role) {
          const tokens = ((el.className && typeof el.className==='string') ? el.className.toLowerCase() : '').split(/[\\s_-]+/).filter(Boolean);
          for (const w of stateWords) {
            if (!tokens.includes(w)) continue;
            if (!stateHeard(el, STATE_MAP[w])) { ariaState.push((desc+' .'+w).slice(0,70)); break; }
          }
        }
        // 5. Keyboard reachability — an interactive control that cannot be reached by keyboard.
        const interactiveRole = role && IROLES.includes(role);
        if ((interactiveRole || isInteractive) && !disabled(el)) {
          const ti = el.getAttribute('tabindex');
          const tabStop = (n) => (n.matches(NATIVE_FOCUSABLE) ? n.getAttribute('tabindex') !== '-1' : (n.getAttribute('tabindex') !== null && Number(n.getAttribute('tabindex')) >= 0));
          // A composite (a radio group, a tab list, a menu) has one Tab stop and its arrow keys for the rest: an option
          // left out of the Tab order there is reached through the group, when the group has a stop at all.
          const group = el.closest('[role=radiogroup],[role=tablist],[role=listbox],[role=menu],[role=menubar],[role=tree],[role=grid],[role=treegrid],[role=toolbar]');
          const roving = !!group && group !== el && [...group.querySelectorAll('[role]')].some((n) => n !== el && n.getAttribute('role') === role && tabStop(n));
          const focusable = tabStop(el) || roving;
          if (!focusable) notKeyboard.push((desc+(role?('[role='+role+']'):'')).slice(0,70));
        }
      }
    }
    return { textEls, iconEls, noFocus, faintFocus, thinFocus, ariaState, notKeyboard, scanned: rootEls.length };
  })()`;
}

// The role each component should render as, from the committed contract.authored.json
// (components[name].semantics: { element, aria: { role } }). The explicit role wins over the element.
const IMPLICIT_ROLE = { button: 'button', a: 'link', select: 'combobox', textarea: 'textbox', nav: 'navigation', ul: 'list', ol: 'list', li: 'listitem', dialog: 'dialog', img: 'img', table: 'table', form: 'form', main: 'main', header: 'banner', footer: 'contentinfo', h1: 'heading', h2: 'heading', h3: 'heading', h4: 'heading', h5: 'heading', h6: 'heading', 'input[type=checkbox]': 'checkbox', 'input[type=radio]': 'radio', 'input[type=range]': 'slider', input: 'textbox' };
export function contractSemantics(ROOT, cfg = {}) {
  const out = {};
  let doc = null;
  try { doc = JSON.parse(readFileSync(resolve(ROOT, cfg.contracts?.authored ?? 'contract.authored.json'), 'utf8')); } catch { return out; }
  for (const [name, c] of Object.entries(doc?.components ?? {})) {
    const s = c?.semantics;
    if (!s) continue;
    const role = s.aria?.role ?? IMPLICIT_ROLE[String(s.element ?? '').toLowerCase()] ?? null;
    if (role) out[name] = String(role).toLowerCase();
  }
  return out;
}
// Figma accessibility annotations as checkable facts. An annotation is free text; the facts it states
// in a recognisable form are kept, one per clause (a line, or a sentence ending in ". " or ";"):
//   role: button              the role a screen reader announces
//   aria-label: Close         the accessible name (also "accessible name", "screen reader label")
//   heading level 2 · H2      a heading and its level
//   alt: A red chart          an image's text alternative
// Composite roles from spec tooling are read as what they mean: togglebutton is a button with
// aria-pressed, textinput a text box. Anything else stays a note for people.
const ROLE_WORDS = { textinput: 'textbox', searchinput: 'searchbox', iconbutton: 'button', disclosure: 'button', expander: 'button' };
export function roleOf(word) {
  const w = String(word ?? '').trim().toLowerCase().replace(/["'“”]/g, '');
  if (w === 'togglebutton') return { role: 'button', pressed: true };
  return { role: ROLE_WORDS[w] ?? w };
}
export function annotationFacts(annotations = []) {
  const f = {};
  const clauses = (annotations ?? []).flatMap((a) => String(a?.label ?? a?.labelMarkdown ?? '').replace(/[*_`]/g, '').split(/\n|;|\.\s+/));
  const value = (v) => v.trim().replace(/^["'“]|["'”.]$/g, '').trim();
  for (const c of clauses) {
    const kv = c.match(/^\s*([^:=]+?)\s*[:=]\s*(.+)$/);
    const key = kv ? kv[1].trim().toLowerCase() : '';
    if (key === 'role' && partRoleOf(value(kv[2]))) { f.part = partRoleOf(value(kv[2])); continue; }   // a part's role (label, errormessage): behaviour-contract.mjs checks it
    if (key === 'role') { const r = roleOf(value(kv[2])); if (r.role) f.role = r.role; if (r.pressed) f.pressed = true; continue; }
    if (/^(aria-label|accessible name|screen reader label)$/.test(key)) { f.name = value(kv[2]); continue; }
    if (/^(alt|alt text)$/.test(key)) { f.name ??= value(kv[2]); f.role ??= 'img'; continue; }
    const heading = c.match(/\bheading(?:\s+level)?\s*[:=]?\s*(?:h)?([1-6])\b/i) ?? c.match(/(?:^|\s)[Hh]([1-6])\b/);
    if (heading) { f.level = Number(heading[1]); f.role ??= 'heading'; }
  }
  return f;
}
// From the component-props snapshot: { component: { facts, layers: [{ layer, facts }] } }. Facts on
// the component node, and on its inner layers (layerAnnotations) when the capture recorded them.
// What each Figma annotation on a component feeds, so a designer can tell a note is used: the role it states (what that
// role owes, tried in the browser), a spoken name or alt text and a heading level (checked against what it renders), a
// part's role on a layer, a behaviour (Escape closes, arrow keys move, Enter and Space activate). Every note also reaches
// the agents as design intent. entry: the component's snapshot entry ({ annotations, layerAnnotations }).
// → [{ text, layer?, uses: [what it feeds], sc: [criteria] }]
// cats, cfg: the annotation categories (annotation-categories.mjs). A note in a design-intent category is no check's: it
// is listed with its kind and no use, for the agents only.
export function annotationUses(entry = {}, { cats = null, cfg = {} } = {}) {
  const out = [];
  const one = (a, layer, nodeId) => {
    const text = String(a?.label ?? a?.labelMarkdown ?? '').trim();
    if (!text) return;
    const kind = noteKind(a, nodeId, cats, cfg);
    if (!isRequirement(a, nodeId, cats, cfg)) { out.push({ text, ...(layer ? { layer } : {}), uses: [], sc: [], kind }); return; }
    const f = annotationFacts([a]), uses = [], sc = [];
    if (f.part && layer) { uses.push(`the role of its "${layer}" part (${f.part}), checked in the browser`); sc.push('1.3.1'); }
    else if (f.part) { uses.push(`a part's role (${f.part}), checked once it sits on the layer of that part`); }
    if (f.role && /\brole\s*[:=]/i.test(text)) { uses.push(`its role (${f.role}${f.pressed ? ', a toggle' : ''}): what that role owes is tried in the browser`); sc.push('4.1.2', '2.1.1'); }
    if (f.name) { uses.push(`its spoken name ("${f.name}"), checked against what it renders`); sc.push('4.1.2', '1.1.1'); }
    if (f.level) { uses.push(`its heading level (${f.level}), checked against what it renders`); sc.push('1.3.1'); }
    for (const b of annotatedBehaviours([a])) { uses.push(`a behaviour (${b.says}), tried in the browser`); sc.push('2.1.1'); }
    out.push({ text, ...(layer ? { layer } : {}), uses, sc: [...new Set(sc)], kind });
  };
  for (const a of entry.annotations ?? []) one(a, null, entry.nodeId);
  for (const l of entry.layerAnnotations ?? []) for (const a of l.annotations ?? []) one(a, l.layer, l.nodeId);
  return out;
}
export function annotationFactsFor(ROOT, cfg = {}) {
  let snap = {};
  try { snap = JSON.parse(readFileSync(resolve(ROOT, cfg.paths?.compPropsSnapshot ?? 'figma-component-props.snapshot.json'), 'utf8')); } catch { return {}; }
  const cats = loadCategories(ROOT, cfg);   // a note in a design-intent category states nothing to check
  const out = {};
  for (const [name, v0] of Object.entries(snap)) {
    if (name.startsWith('_') || !v0 || typeof v0 !== 'object') continue;
    const v = requirementEntry(v0, cats, cfg);
    const facts = annotationFacts(v.annotations ?? []);
    const layers = (v.layerAnnotations ?? []).map((l) => ({ layer: l.layer, facts: annotationFacts(l.annotations ?? []) })).filter((l) => Object.keys(l.facts).length);
    if (Object.keys(facts).length || layers.length) out[name] = { facts, layers };
  }
  return out;
}
// What the rendered node says against the annotation's facts, as readable differences.
export function annotationMismatches(f, got) {
  const out = [];
  if (f.role && got.role && !sameRole(got.role, f.role)) out.push(`Figma says role "${f.role}", it renders as "${got.role}"`);
  if (f.pressed && got.pressed == null) out.push('Figma says it is a toggle button, it has no aria-pressed');
  if (f.name && String(got.name ?? '').trim().toLowerCase() !== f.name.toLowerCase()) out.push(`Figma says its name is "${f.name}", it is announced as "${got.name ?? ''}"`);
  if (f.level && got.level != null && Number(got.level) !== f.level) out.push(`Figma says heading level ${f.level}, it renders as level ${got.level}`);
  return out;
}
// The page is loaded: its own document, not the about:blank a new target starts on (which already reports
// readyState "complete", so a slow navigation would be checked as an empty page), and waitFor when set.
export function pageLoadedExpression(waitFor = null) {
  return `location.href !== "about:blank" && document.readyState === "complete"${waitFor ? ` && !!document.querySelector(${JSON.stringify(waitFor)})` : ''}`;
}

// One deeper check at a time. A check that throws (the browser slow to answer, a page that changed under it)
// is tried once more with its partial findings removed; if it fails again it is listed in `unfinished` and
// reported as not checked, never silently clean.
export function makeStep(findings, unfinished, label) {
  let n = 0;
  return async (fn) => {
    const no = ++n;
    for (let attempt = 0; attempt < 2; attempt++) {
      const before = findings.length;
      try { await fn(); return; } catch (e) {
        findings.length = before;
        if (attempt === 1) unfinished.push(`${label}: deeper check ${no} (${String(e?.message ?? e).slice(0, 80)})`);
      }
    }
  };
}

// Chrome's accessibility tree names a few roles differently from ARIA.
// presentation and none are one role (ARIA 1.1 named it none); Chrome reports either as "none", and a plain element
// with no role of its own (generic) holds no meaning either, as presentation asks.
export const sameRole = (got, want) => got === want || (want === 'img' && got === 'image') || (want === 'textbox' && got === 'searchbox')
  || (/^(presentation|none)$/.test(want) && /^(presentation|none|generic)$/.test(got));   // a plain element means nothing either
// The same equivalences, to look a role up in Chrome's tree (Accessibility.queryAXTree) by the name an annotation uses.
const AX_ROLE_ALIASES = { img: ['image'], textbox: ['searchbox'] };
// The controls a wrapper can hold, for a note that names no role (a name, a heading level, a pressed state).
const WRAPPED_CONTROL = 'button,input:not([type=hidden]),select,textarea,a[href],summary,[role]:not([role=presentation]):not([role=none]):not([role=group])';

// What a role requires, checked on up to 20 rendered instances of a component (idea I39). Returns the
// problems as short sentences. A toggle button is clicked to see aria-pressed change, then clicked
// back. A state is read from the instance's classes and attributes (error or invalid, selected or
// active, disabled), the same words the capture and the styleguide use.
export function roleContractExpression(selector, role, { pressed = false } = {}) {
  return `(() => {
    let els; try { els = [...document.querySelectorAll(${JSON.stringify(selector)})].slice(0, 20); } catch { return []; }
    const role = ${JSON.stringify(role)}, pressedRole = ${JSON.stringify(!!pressed)};
    const out = new Set();
    const words = (el) => ((el.className && typeof el.className === 'string') ? el.className.toLowerCase() : '').split(/[\\s_-]+/).concat(String(el.getAttribute('data-state') || '').toLowerCase());
    const has = (el, ...w) => words(el).some((x) => w.includes(x));
    const named = (el) => !!((el.labels && el.labels.length) || (el.getAttribute('aria-label') || '').trim() || el.getAttribute('aria-labelledby') || (el.getAttribute('title') || '').trim());
    const idsExist = (v) => String(v || '').trim().split(/\\s+/).filter(Boolean).every((id) => document.getElementById(id));
    for (const el of els) {
      if (has(el, 'disabled') && !(el.disabled === true || el.getAttribute('aria-disabled') === 'true' || el.querySelector('[disabled],[aria-disabled="true"]')))
        out.add('looks disabled but is not disabled or aria-disabled');
      if (role === 'button' && pressedRole) {
        if (!el.hasAttribute('aria-pressed')) { out.add('is a toggle button without aria-pressed'); continue; }
        const before = el.getAttribute('aria-pressed');
        try { el.click(); } catch (e) {}
        const after = el.getAttribute('aria-pressed');
        if (after === before) out.add('aria-pressed does not change when clicked');
        else { try { el.click(); } catch (e) {} }
      }
      if (role === 'checkbox' || role === 'radio' || role === 'switch') {
        const input = el.matches('input') ? el : el.querySelector('input[type=checkbox],input[type=radio]');
        const aria = el.matches('[role=' + role + ']') ? el : el.querySelector('[role=' + role + ']');
        const control = input || aria;
        if (!control) out.add('has no ' + role + ' control (a native input, or role="' + role + '" with aria-checked)');
        else {
          if (!input && !control.hasAttribute('aria-checked')) out.add('role="' + role + '" without aria-checked');
          if (role === 'switch' && input && input.getAttribute('role') !== 'switch' && !aria) out.add('a switch should expose role="switch"');
          const labelled = named(control) || (input && input.closest('label')) || (el.matches('label') && el.contains(control));
          if (!labelled && !(control.textContent || '').trim()) out.add('its ' + role + ' has no label');
        }
      }
      if (role === 'textbox' || role === 'searchbox' || role === 'combobox') {
        const field = el.matches('input,textarea,select,[role=textbox],[role=searchbox],[role=combobox]') ? el : el.querySelector('input,textarea,select,[role=textbox],[role=searchbox],[role=combobox]');
        if (!field) { out.add('has no text field'); continue; }
        if (!named(field)) out.add('its field has no label');
        if (field.hasAttribute('aria-describedby') && !idsExist(field.getAttribute('aria-describedby'))) out.add('aria-describedby points to an element that does not exist');
        if (has(el, 'error', 'invalid') || has(field, 'error', 'invalid')) {
          if (field.getAttribute('aria-invalid') !== 'true') out.add('in its error state the field has no aria-invalid="true"');
          if (!field.getAttribute('aria-describedby')) {
            // A message on show that is not linked, or no message at all: an error shown only by a colour or a border
            // is not read out and not seen by everyone (WCAG 1.4.1, 3.3.1). The design owes the message.
            const shows = (x) => { const st = getComputedStyle(x); if (st.display === 'none' || st.visibility === 'hidden') return false; const r = x.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
            const words = [...el.querySelectorAll('*')].filter((x) => !x.children.length && x !== field && !x.closest('label > input') && shows(x) && (x.textContent || '').trim() && !(field.labels && [...field.labels].some((l) => l.contains(x) && l.textContent.trim() === x.textContent.trim())));
            out.add(words.length || el.querySelector('[role=alert],[aria-live]') ? 'in its error state the field is not linked to its message (aria-describedby)'
              : 'in its error state the error is shown only by its look: there is no message to read (WCAG 3.3.1). The design needs an error message part, linked to the field with aria-describedby (send it back to Figma)');
          }
        }
      }
      if (role === 'tab' || role === 'tablist') {
        const tabs = role === 'tab' ? [el] : [...el.querySelectorAll('[role=tab]')];
        if (role === 'tablist' && !tabs.length) out.add('has no role="tab" items');
        for (const t of tabs) {
          if (!t.matches('[role=tab]')) { out.add('is not exposed as role="tab"'); continue; }
          if (!t.closest('[role=tablist]')) out.add('a tab outside a role="tablist"');
          if ((has(t, 'selected', 'active', 'current') || t.getAttribute('aria-current')) && t.getAttribute('aria-selected') !== 'true') out.add('the selected tab has no aria-selected="true"');
        }
      }
    }
    return [...out];
  })()`;
}

// Deeper checks measured in the page (pure expression builders; exported for tests).
//   targets(): interactive controls under 24×24 with another control inside the 24px circle (2.5.8);
//              inline links in running text and disabled controls are exempt.
//   clipped(): text boxes whose content overflows a hidden/clipped box (for the 1.4.12 comparison).
//   moving():  elements that still transition or animate (for the prefers-reduced-motion pass).
// One trigger of a dialog or menu (I78), in three phases: 'open' clicks it (a link does not navigate, a form does
// not submit), 'opened' says what appeared, 'after' (once Escape is pressed) says whether it closed and where the
// focus is. 'close' clicks it again when Escape left it open.
export function openerExpression(i, phase) {
  return `(() => {
    const vis = (el) => { const s = getComputedStyle(el); if (s.display==='none'||s.visibility==='hidden'||+s.opacity===0) return false; const r = el.getBoundingClientRect(); return r.width>0 && r.height>0; };
    const desc = (el) => (el.tagName.toLowerCase() + (el.id?('#'+el.id):'') + ((el.className && typeof el.className==='string') ? '.'+el.className.trim().split(/\\s+/).join('.') : '')).slice(0,80);
    const POP = 'dialog[open],[role=dialog],[role=alertdialog],[aria-modal=true],[role=menu],[role=listbox]';
    const el = document.querySelector('[data-design-system-engine-opener="${i}"]');
    const w = window, phase = ${JSON.stringify(phase)};
    if (!el) return null;
    const ctl = () => { const id = el.getAttribute('aria-controls'); return id ? document.getElementById(id.split(/\\s+/)[0]) : null; };
    if (phase === 'open') {
      w.__dseBefore = new Set([...document.querySelectorAll(POP)].filter(vis));
      w.__dseCtlShown = !!(ctl() && vis(ctl()));
      w.__dseExpanded = el.getAttribute('aria-expanded') === 'true';
      w.__dseNav = (e) => { if (e.target && e.target.closest && e.target.closest('a[href]')) e.preventDefault(); };
      w.__dseSubmit = (e) => e.preventDefault();
      w.addEventListener('click', w.__dseNav, true); document.addEventListener('submit', w.__dseSubmit, true);   // before the page's own handlers, which still run
      el.focus(); el.click();
      return true;
    }
    if (phase === 'opened') {
      const pop = [...document.querySelectorAll(POP)].filter(vis).find((p) => !w.__dseBefore.has(p) && !p.contains(el));
      const c = ctl(), shown = c && !w.__dseCtlShown && vis(c) ? c : null;
      w.__dseOpened = pop || shown || null;
      if (!w.__dseOpened && !(el.getAttribute('aria-expanded') === 'true' && !w.__dseExpanded)) return null;
      return w.__dseOpened ? (w.__dseOpened.getAttribute('role') || w.__dseOpened.tagName.toLowerCase()) + ' ' + desc(w.__dseOpened) : 'what it controls';
    }
    if (phase === 'after') {
      const o = w.__dseOpened;
      const closed = (!o || !o.isConnected || !vis(o) || (o.tagName === 'DIALOG' && !o.open)) && el.getAttribute('aria-expanded') !== 'true';
      const a = document.activeElement;
      return { closed, back: a === el || el.contains(a), at: a && a !== document.body ? desc(a) : '' };
    }
    if (phase === 'close') el.click();
    if (phase === 'close' || phase === 'done') { w.removeEventListener('click', w.__dseNav, true); document.removeEventListener('submit', w.__dseSubmit, true); }
    return true;
  })()`;
}

export function deepSweepExpression(roots, what) {
  return `(() => {
    const roots = ${JSON.stringify(roots)};
    const rootEls = roots ? roots.flatMap(s => { try { return [...document.querySelectorAll(s)]; } catch { return []; } }) : [document.body];
    const scope = roots ? [...new Set(rootEls.flatMap(r => [r, ...r.querySelectorAll('*')]))] : [...document.body.querySelectorAll('*')];   // roots may nest: each element once
    const vis = (el) => { const s = getComputedStyle(el); if (s.display==='none'||s.visibility==='hidden'||+s.opacity===0) return false; const r = el.getBoundingClientRect(); return r.width>0 && r.height>0; };
    const desc = (el) => (el.tagName.toLowerCase() + (el.id?('#'+el.id):'') + ((el.className && typeof el.className==='string') ? '.'+el.className.trim().split(/\\s+/).join('.') : '')).slice(0,80);
    const what = ${JSON.stringify(what)};
    if (what === 'targets') {
      const SEL = 'a[href],button,input:not([type=hidden]),select,textarea,[role=button],[role=link],[role=checkbox],[role=radio],[role=switch],[role=tab],[role=menuitem],[role=option],[tabindex]:not([tabindex="-1"])';
      const all = [...new Set(scope.filter(el => el.matches(SEL) && vis(el) && !el.disabled && el.getAttribute('aria-disabled')!=='true'))];
      const rects = all.map(el => el.getBoundingClientRect());
      const out = [];
      all.forEach((el, i) => {
        const r = rects[i];
        if (r.width >= 24 && r.height >= 24) return;
        if (el.tagName === 'A' && el.closest('p,li,td,dd') && (el.closest('p,li,td,dd').textContent.trim().length > el.textContent.trim().length + 10)) return;   // a link inside running text
        if (el.tagName === 'INPUT' && el.labels && [...el.labels].some(l => { const lr = l.getBoundingClientRect(); return lr.width >= 24 && lr.height >= 24; })) return;   // its label is the target
        const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
        const near = rects.some((o, j) => j !== i && !all[j].contains(el) && !el.contains(all[j]) &&
          Math.hypot(Math.max(o.left - cx, 0, cx - o.right), Math.max(o.top - cy, 0, cy - o.bottom)) < 12);
        if (near) out.push({ desc: desc(el), size: Math.round(r.width) + '×' + Math.round(r.height) });
      });
      return out;
    }
    if (what === 'widgets') {
      // Controls built from a non-native element (a div with role=button): each is marked so Node
      // can focus it and press Enter or Space. Native controls handle the keys themselves.
      const SEL = '[role=button],[role=link],[role=checkbox],[role=switch],[role=tab],[role=menuitem],[role=option],[role=radio]';
      const NATIVE = 'button,a[href],input,select,textarea,summary';
      return scope.filter(el => el.matches(SEL) && !el.matches(NATIVE) && vis(el) && el.getAttribute('aria-disabled') !== 'true').slice(0, 60)
        .map((el, i) => { el.setAttribute('data-design-system-engine-kbd', String(i)); return { i, role: el.getAttribute('role'), desc: desc(el) }; });
    }
    if (what === 'composites') {
      // ARIA composite widgets move focus between their items with the arrow keys (radio groups,
      // tab lists, menus, list boxes). Native radio buttons do it themselves.
      const ITEM = { radiogroup: '[role=radio]', tablist: '[role=tab]', menu: '[role=menuitem]', menubar: '[role=menuitem]', listbox: '[role=option]' };
      return scope.filter(el => ITEM[el.getAttribute('role')] && vis(el)).slice(0, 30).map((el, i) => {
        const items = [...el.querySelectorAll(ITEM[el.getAttribute('role')])].filter(x => vis(x) && !x.matches('input'));
        if (items.length < 2) return null;
        el.setAttribute('data-design-system-engine-group', String(i));
        return { i, role: el.getAttribute('role'), desc: desc(el), items: items.length };
      }).filter(Boolean);
    }
    if (what === 'obscured') {
      // WCAG 2.4.11: the focused element must not be entirely hidden by other content (a sticky
      // header, a banner). Its centre and four inner corners are all covered by something else.
      const el = document.activeElement;
      if (!el || el === document.body) return null;
      const r = el.getBoundingClientRect();
      if (r.width < 2 || r.height < 2 || r.bottom < 0 || r.top > innerHeight) return null;
      const pts = [[r.left + r.width / 2, r.top + r.height / 2], [r.left + 1, r.top + 1], [r.right - 1, r.top + 1], [r.left + 1, r.bottom - 1], [r.right - 1, r.bottom - 1]];
      const hidden = pts.every(([x, y]) => { const t = document.elementFromPoint(x, y); return t && t !== el && !el.contains(t) && !t.contains(el); });
      return hidden ? desc(el) : null;
    }
    if (what === 'clipped') {
      const out = [];
      for (const el of scope) {
        if (!vis(el)) continue;
        if (![...el.childNodes].some(n => n.nodeType===3 && n.textContent.trim())) continue;
        const s = getComputedStyle(el);
        const hides = /hidden|clip/.test(s.overflowX + s.overflowY) || s.textOverflow === 'ellipsis';
        if (hides && (el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1)) out.push(desc(el));
      }
      return out;
    }
    if (what === 'moving') {
      const out = [];
      const secs = (v) => Math.max(0, ...String(v).split(',').map(x => (x.trim().endsWith('ms') ? parseFloat(x) / 1000 : parseFloat(x)) || 0));
      for (const el of scope) {
        if (!vis(el)) continue;
        const s = getComputedStyle(el);
        const anim = s.animationName !== 'none' && secs(s.animationDuration) > 0.01;
        const trans = s.transitionProperty !== 'none' && secs(s.transitionDuration) > 0.01;
        if (anim || trans) out.push(desc(el) + (anim ? ' (animation)' : ' (transition)'));
      }
      return [...new Set(out)].slice(0, 200);
    }
    if (what === 'reflow') return { scrollWidth: document.documentElement.scrollWidth, width: window.innerWidth };
    if (what === 'dialogs') return [...document.querySelectorAll('dialog[open],[role=dialog],[role=alertdialog],[aria-modal=true]')].filter(vis).map(desc);
    // A dialog open on the page as it loads, and whether it lies over the page (in the top layer, or fixed by itself or a
    // box around it) as a dialog that was opened does; one drawn in the page's flow is a picture of a dialog (a
    // specimen on a style guide), with nothing that opened it.
    if (what === 'dialogsAt') return [...document.querySelectorAll('dialog[open],[role=dialog],[role=alertdialog],[aria-modal=true]')].filter(vis).map((d) => {
      let over = false; try { over = d.matches(':modal'); } catch (e) {}
      for (let n = d; n && n !== document.body && !over; n = n.parentElement) { const pos = getComputedStyle(n).position; if (pos === 'fixed' || pos === 'sticky') over = true; }
      return { desc: desc(d), over };
    });
    if (what === 'openers') {
      // Controls that open a dialog, a menu or a list (I78): each is marked so Node can open it and press Escape.
      const SEL = '[aria-haspopup]:not([aria-haspopup=false]),[aria-expanded=false][aria-controls]';
      return scope.filter(el => el.matches(SEL) && vis(el) && !el.disabled && el.getAttribute('aria-disabled') !== 'true').slice(0, 8)
        .map((el, i) => { el.setAttribute('data-design-system-engine-opener', String(i)); return { i, desc: desc(el) }; });
    }
    if (what === 'headings') return [...document.querySelectorAll('h1,[role=heading][aria-level="1"]')].filter(el => !el.closest('[hidden],[aria-hidden=true]') && getComputedStyle(el).display !== 'none').map(desc);
    if (what === 'active') {
      // A unique identity (position among all elements) plus a readable label: two links that look
      // alike are still two different stops.
      const a = document.activeElement;
      if (!a || a === document.body) return null;
      return [...document.querySelectorAll('*')].indexOf(a) + '|' + desc(a);
    }
    return null;
  })()`;
}

// ── axe-core (opt-in, I32): broaden coverage toward full WCAG rule set ───────────
// Fetch the scanner source once (any CDN, pinned; no npm dependency), inject it into the
// already-open page and run it. Adds the rules our own five checks do not cover — non-text
// contrast, target size, duplicate ids, ARIA validity, and more — mapped to plain findings.
// Degrades to null on any failure (offline, blocked), so the core check is never affected.
// The pinned version is kept in ~/.cache after the first download (or a11y.axePath points at a
// local copy), so later runs are fast and work offline. Every copy, downloaded or cached, must match
// the pinned SHA-384 of axe.min.js: a file that does not is never injected into a page. Sources, in
// order: the CDN, then the npm registry's package (where a CDN is blocked). a11y.axePath is the
// project's own copy and is trusted as given.
const AXE_VERSION = '4.10.2';
export const AXE_SHA384 = '3NYxCdpLKVHfNs2FHPtg3qqaYuhq85m4mMnlHBlN0JzSpKYKct2PMGYfsKGaKIj4';
export const axeIntact = (s) => typeof s === 'string' && createHash('sha384').update(s).digest('base64') === AXE_SHA384;
// One file out of an npm .tgz (gzip + tar): enough tar to find a regular file by name.
export function fileFromTgz(buf, wanted) {
  const tar = gunzipSync(buf);
  for (let off = 0; off + 512 <= tar.length;) {
    const name = tar.subarray(off, off + 100).toString('utf8').replace(/\0.*$/s, '');
    if (!name) break;
    const size = parseInt(tar.subarray(off + 124, off + 136).toString('utf8').replace(/\0.*$/s, '').trim() || '0', 8);
    if (name === wanted) return tar.subarray(off + 512, off + 512 + size).toString('utf8');
    off += 512 + Math.ceil(size / 512) * 512;
  }
  return null;
}
async function fetchAxeSource(cfg = {}) {
  const looksLikeAxe = (s) => typeof s === 'string' && s.length > 100000 && s.includes('axe.run');
  if (cfg.a11y?.axePath) { try { const s = readFileSync(resolve(cfg.a11y.axePath), 'utf8'); if (looksLikeAxe(s)) return s; } catch { /* fall through */ } }
  const cacheDir = join(homedir(), '.cache', 'rms-design-system-engine');
  const cached = join(cacheDir, `axe-${AXE_VERSION}.min.js`);
  try { const s = readFileSync(cached, 'utf8'); if (axeIntact(s)) return s; } catch { /* not cached yet */ }
  const sources = [
    async () => { const r = await fetch(`https://cdnjs.cloudflare.com/ajax/libs/axe-core/${AXE_VERSION}/axe.min.js`, { signal: AbortSignal.timeout(15000) }); return r.ok ? r.text() : null; },
    async () => { const r = await fetch(`https://registry.npmjs.org/axe-core/-/axe-core-${AXE_VERSION}.tgz`, { signal: AbortSignal.timeout(30000) }); return r.ok ? fileFromTgz(Buffer.from(await r.arrayBuffer()), 'package/axe.min.js') : null; },
  ];
  for (const get of sources) {
    let s = null;
    try { s = await get(); } catch { continue; }
    if (!axeIntact(s)) continue;   // not the pinned file: never run it
    try { mkdirSync(cacheDir, { recursive: true }); writeFileSync(cached, s); } catch { /* cache is optional */ }
    return s;
  }
  return null;
}
// Runs the WCAG 2.0/2.1/2.2 A and AA rules explicitly (so target size and friends are always on),
// scoped to the checked components when there are any.
async function runAxe(send, sessionId, axeSource, roots = null) {
  if (!axeSource) return null;
  try {
    await send('Runtime.evaluate', { expression: axeSource, returnByValue: false }, sessionId);
    const ctx = roots ? `{ include: ${JSON.stringify(roots.map((s) => [s]))} }` : 'document';
    const expr = `axe.run(${ctx}, { resultTypes: ['violations'], runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] } })
      .then(r => JSON.stringify(r.violations.map(v => ({ id: v.id, help: v.help, impact: v.impact, helpUrl: v.helpUrl, count: v.nodes.length, targets: v.nodes.slice(0, 4).map(n => (n.target || []).join(' ')) }))))
      .catch(e => 'ERR:' + e.message)`;
    const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }, sessionId);
    const val = r.result?.value;
    if (typeof val !== 'string' || val.startsWith('ERR:')) return null;
    return JSON.parse(val);
  } catch { return null; }
}

async function main() {
  const ROOT = process.cwd();
  const argv = process.argv.slice(2);
  const VERBOSE = argv.includes('--a11y');
  const JSON_MODE = argv.includes('--json');   // structured output for an agent/CI that fixes the code
  // --json-out <file>: the same structured result written to a file, beside the plain-language report.
  const JSON_OUT = argv.includes('--json-out') ? argv[argv.indexOf('--json-out') + 1] : null;
  const components = argValues('--component', argv).concat(argValues('--components', argv));
  const cliUrls = argValues('--url', argv);   // check a live page directly (any project that serves it)

  let cfg = {};
  try { cfg = JSON.parse(readFileSync(join(ROOT, 'ds-config.json'), 'utf8')); }
  catch {
    // --url runs configuration-free (a non-plugin DS with no ds-config still gets checked).
    if (!cliUrls.length) { console.error('❌ ds-config.json not found at project root (or pass --url <page> to check a live URL without a config).'); process.exit(1); }
  }

  const STRICT = cfg.a11yStrict === true;
  const RUN_AXE = argv.includes('--axe') || cfg.a11y?.axe === true;   // broaden coverage with axe-core (opt-in)
  const RUN_STATES = argv.includes('--states') || cfg.a11y?.interactionStates === true;   // check :hover contrast (opt-in)
  // With --json the reason is JSON too, so a reader never mistakes a page that was not checked for a clean one.
  const skip = (msg) => { console.log(JSON_MODE ? JSON.stringify({ notChecked: msg }) : `⏭  [a11y] ${msg}`); process.exit(0); };

  const plugins = cfg.paths?.plugins ?? [];
  const pluginSrc = cfg.paths?.pluginCSS ?? [];

  // Every colour mode, switched the way ds-config says it is switched (media emulation, a class or a
  // data attribute on the root, high contrast): the same modeSwitch() the code capture uses.
  const modeDefs = cfg.figma?.modes?.length ? loadModes(cfg) : [{ name: 'Light', snapshotKey: 'light', cssSelector: 'root' }];
  let modes = modeDefs.map((m) => ({ name: m.name || m.snapshotKey || 'light', sw: modeSwitch(m) })).filter((m) => !m.sw.unsupported);
  const locator = await loadLocator(ROOT, cfg);   // the one shared component finder
  const selOf = (name) => locator.selectorFor(name);
  let roots = components.length ? components.map(selOf) : null;

  const builtUiPath = (plugin) => {
    const i = plugins.indexOf(plugin);
    const src = i >= 0 ? pluginSrc[i] : null;
    return join(ROOT, src ? src.replace(/\.src\.html$/, '.html') : `${appDir(cfg, plugin)}/ui.html`);
  };

  // Render targets — no project shape imposed. Priority: --url / a11y.urls > the generated
  // styleguide (every component × state, no dev server) > built plugin UIs > AUTO-DISCOVERY.
  const urlList = [...cliUrls, ...(cfg.a11y?.urls ?? [])];
  let stopServer = null;

  // Opt-in: (re)generate the styleguide first so a11y never audits a stale one.
  if (!urlList.length && cfg.a11y?.regenerateStyleguide && cfg.styleguide?.template) {
    try {
      const { generateStyleguide } = await import('./styleguide-gen.mjs');
      const r = await generateStyleguide(ROOT, cfg);
      console.log(`ℹ️  [a11y] regenerated styleguide → ${r.out.replace(ROOT + '/', '')}`);
    } catch (e) { console.log(`ℹ️  [a11y] styleguide regeneration skipped: ${e.message}`); }
  }

  // A React design system with no page to open: its components rendered from their own code (component-harness.mjs),
  // so clicks, keys and names are tried on what ships; the style guide only draws their markup. a11y.harness:false
  // turns it off.
  // Used in build mode (a Figma-only project building its components), or when there is no style guide and no built
  // page to open: a real page of the product is a better target than the components on their own.
  let harness = null, harnessWhy = null;
  const otherTarget = !!styleguideTarget(cfg, ROOT) || plugins.some((pl) => existsSync(builtUiPath(pl)));
  if (!urlList.length && cfg.a11y?.harness !== false && (cfg.build === true || !otherTarget)) {
    try {
      const { startHarness } = await import('./component-harness.mjs');
      const { componentSourceFiles, resolveComponentFile, textReader } = await import('./component-source.mjs');
      let propsSnap = {};
      try { propsSnap = JSON.parse(readFileSync(join(ROOT, cfg.paths?.compPropsSnapshot ?? 'src/figma-component-props.snapshot.json'), 'utf8')); } catch { /* none */ }
      const files = componentSourceFiles(ROOT, cfg).filter((f) => /\.(jsx|tsx)$/.test(f));
      if (files.length) {
        const read = textReader();
        const names = [...new Set([...locator.names(), ...Object.keys(propsSnap).filter((n) => !n.startsWith('_'))])];
        const h = await startHarness(ROOT, cfg, names, { propsSnap, locate: (n) => resolveComponentFile(n, { ROOT, cfg, files, read, classFor: (x) => locator.classFor(x) }).file });
        if (h.url) { harness = h; stopServer = h.close; }
        else if (h.why) harnessWhy = h.why;
      }
    } catch (e) { harnessWhy = String(e?.message ?? e).split('\n')[0]; }
  }
  const sg = urlList.length || harness ? null : styleguideTarget(cfg, ROOT);
  // The styleguide pins its own mode attribute: switch it too, or every mode is measured as light.
  if (sg) modes = modeDefs.map((m) => ({ name: m.name || m.snapshotKey || 'light', sw: modeSwitch(m, { styleguide: true }) })).filter((m) => !m.sw.unsupported);
  // On the styleguide, only the design system's own components are checked: the page's navigation,
  // badges and notes are the styleguide's chrome, not the DS.
  if ((sg || harness) && !roots) {
    let names = locator.names();
    try { names = [...new Set([...names, ...Object.keys(JSON.parse(readFileSync(join(ROOT, cfg.paths?.snapshotStructure ?? 'src/figma-structure.snapshot.json'), 'utf8')).components ?? {})])]; } catch { /* optional */ }
    const sels = names.map(selOf).filter((s) => { try { return !!s && /^[.#[a-z]/i.test(s); } catch { return false; } });
    if (sels.length) roots = sels;
  }
  let targets;
  if (urlList.length) {
    // An app page, not a story or a component's own page, is held to one main heading (I79).
    targets = urlList.map((u) => ({ label: u, url: u, page: !/iframe\.html|[?&]path=\/(story|docs)\/|\/story\//i.test(u) }));
  } else if (harness) {
    targets = [{ label: 'the components, rendered from their code', url: harness.url, ready: 'window.__dseHarnessReady === true', harness: true }];
    console.log(`ℹ️  [a11y] target: ${harness.groups.length} component(s) rendered from their own code in each Figma variant, no dev server (${harness.groups.map((g) => g.name).join(', ')})`);
    for (const m of harness.missing) console.log(`ℹ️  [a11y] not rendered: ${m}`);
  } else if (sg) {
    targets = [sg];
    console.log(`ℹ️  [a11y] target: the generated styleguide — every component × state on one page, no dev server (${sg.label})`);
  } else {
    targets = plugins.map(builtUiPath).filter((f) => existsSync(f)).map((f) => ({ label: f.replace(ROOT + '/', ''), url: pathToFileURL(f).href }));
  }

  // Nothing configured or built → be as automatic as possible: start the project's dev server
  // and discover pages (Storybook stories, else static router routes, else the base page). This
  // is what lets a non-plugin DS (SPA/Storybook) run with zero config and zero questions.
  // A project whose packages are not installed can run neither its dev server nor its components: said, not tried.
  const noPackages = existsSync(join(ROOT, 'package.json')) && !existsSync(join(ROOT, 'node_modules'));
  if (!targets.length && cfg.a11y?.discover !== false) {
    let base = cfg.a11y?.baseUrl || null;
    if (!base && !noPackages) {
      const cmd = detectServeCmd(ROOT, cfg);
      if (cmd) {
        console.log(`ℹ️  [a11y] no target configured — starting the dev server (${cmd}) to discover pages…`);
        const srv = startDevServer(cmd, ROOT);
        base = await srv.url;
        if (base) stopServer = srv.stop; else srv.stop();
      }
    }
    if (base) {
      const stories = await discoverStorybook(base);
      const found = stories || discoverRoutes(ROOT, base, { prefer: components.flatMap((c) => [c, selOf(c)]) }) || [base];
      const capped = found.slice(0, 40);
      targets = capped.map((u) => ({ label: u.startsWith(base) ? (u.slice(base.length) || '/') : u, url: u, page: !stories }));
      console.log(`ℹ️  [a11y] ${found.length === 1 ? 'checking the base page' : `${found.length} page(s) found — checking ${capped.length}`} via ${base}`);
    }
  }

  if (!targets.length && noPackages) skip('the project\'s packages are not installed (no node_modules), so neither its dev server nor its components can run in a browser: install them (npm install, or the project\'s package manager), then run again.');
  if (!targets.length) skip(`no render targets — start your dev server and pass --url <page> (or set ds-config.json → a11y.urls / a11y.serve), or build the UIs for a static DS. Auto-discovery found nothing.${harnessWhy ? ` The components were not rendered from their code either: ${harnessWhy}.` : ''}`);
  const waitFor = cfg.a11y?.waitFor ?? null;   // optional selector to await before the sweep (SPA hydration)

  const STATE_MAP = Object.assign({}, STATE_CLASSES, cfg.a11y?.stateClasses ?? {});

  const CHROME = findChrome();
  if (!CHROME) skip('Chrome not found (set CHROME_PATH to enable)');
  if (typeof WebSocket === 'undefined') skip('Node >= 22 required (built-in WebSocket)');

  let browser = null;
  const cleanup = () => { try { browser?.kill(); } catch {} try { stopServer?.(); } catch {} };
  process.on('exit', cleanup);
  // A component looked for by a class no element in the code has would be waited for on every page: said at once.
  if (roots && components.length && !cliUrls.length && !cfg.a11y?.urls?.length) {
    const { componentSourceFiles, textReader } = await import('./component-source.mjs');
    const read = textReader();
    const code = componentSourceFiles(ROOT, cfg).map(read).join('\n') + [cfg.paths?.themeCSS].flat().filter(Boolean).map((f) => read(join(ROOT, f))).join('\n');
    const has = (sel) => classInCode(code, sel);
    const missing = components.filter((c) => !has(selOf(c)));
    if (missing.length === components.length) {
      const like = classesLike(code, missing);
      skip(`nothing to check for ${missing.join(', ')}: no element in the code has the class ${missing.map(selOf).join(', ')}, the one taken for ${missing.length === 1 ? 'it' : 'them'} by the naming rule.${like.length ? ` Classes in the code that hold the name: ${like.join(', ')}.` : ''} Name the component's class in ds-config.json → componentSelectors (for example "${missing[0]}": "${like[0] ?? '.its-class'}"), or check a page that shows it with --url.`);
    }
  }

  // The time the check may take grows with its pages and colour modes (a fixed two minutes stopped a scoped check of
  // 23 pages halfway, and said so only where the audit never showed it); a11y.timeoutSec sets it.
  const limitSec = Number(cfg.a11y?.timeoutSec) || Math.min(900, Math.max(120, targets.length * Math.max(1, modes.length) * 12));
  let pagesDone = 0;
  const killTimer = setTimeout(() => { console.log(`⏭  [a11y] stopped after ${limitSec}s, with ${Math.max(0, pagesDone - 1)} of ${targets.length} page(s) checked: what they found is not reported. Give it longer with ds-config.json → a11y.timeoutSec, or check fewer pages (--url).`); cleanup(); process.exit(STRICT ? 1 : 0); }, limitSec * 1000); killTimer.unref();

  // A cold Chrome on a busy machine can take longer than one start allows: try once more before giving up.
  let launchError = null;
  for (let i = 0; i < 2 && !browser; i++) browser = await launchChrome(CHROME, { tmpPrefix: 'a11y-check-' }).catch((e) => { launchError = e; return null; });
  if (!browser) skip(`Chrome failed to start (${String(launchError?.message ?? launchError).split('\n')[0]})`);

  const { send, close: closeCDP } = await connectCDP(browser.wsUrl);

  const findings = [];   // { kind, theme?, desc, ... }
  const axeViolations = [];
  let sweptPlugins = 0;

  let axeSource = null;
  if (RUN_AXE) {
    axeSource = await fetchAxeSource(cfg);
    if (!axeSource) console.log('ℹ️  [a11y] --axe: could not load axe-core (offline or blocked) — the broader scan was skipped; the core checks still ran.');
  }

  const unrendered = [], unread = [], unfinished = [], notJudged = [];
  const ranChecks = new Set();   // the page-wide checks that finished (a keyboard trap, spacing, reflow, zoom, WCAG 2.1)
  const behavioursNotChecked = new Set();   // components whose behaviours the target cannot run (the style guide draws markup only)
  for (const target of targets) {
    pagesDone++;
    const label = target.label;
    const { targetId, sessionId } = await openPage(send, target.url);
    // up to ~10s — a dev server / SPA can be slower than a file://
    // The components rendered from their code are served here and transpiled on request: a busy machine gets ~30s.
    const loadSeconds = target.harness ? 30 : 10;
    const loaded = await waitForTrue(send, sessionId, pageLoadedExpression(waitFor) + (target.ready ? ` && (${target.ready})` : ''), { attempts: loadSeconds * 20, intervalMs: 50, tolerateErrors: true });
    if (!loaded) { unread.push(`${label} (the page did not finish loading within ${loadSeconds}s)`); await send('Target.closeTarget', { targetId }); continue; }
    await new Promise((res) => setTimeout(res, 300));   // settle — let an SPA finish its first render
    // A selector the browser cannot parse (a component named table/row gives .table/row) would make every sweep of the
    // page throw: it is dropped, and its component said not checked, never clean.
    if (roots) {
      const ok = (await send('Runtime.evaluate', { expression: `${JSON.stringify(roots)}.filter((s) => { try { document.querySelector(s); return true; } catch { return false; } })`, returnByValue: true }, sessionId)).result?.value;
      if (Array.isArray(ok) && ok.length < roots.length) {
        for (const bad of roots.filter((x) => !ok.includes(x))) unread.push(`${String(bad).replace(/^\./, '')} (its selector ${bad} is not valid CSS, so it was not checked)`);
        roots = ok;
      }
    }
    // Something to check must be on the page: a page that shows none of the design system's components
    // (still rendering, or blank) is not a clean page. Wait for it, up to ~10s, then say it was not checked,
    // never "nothing to fix".
    const shows = async () => ((await send('Runtime.evaluate', { expression: `(${JSON.stringify(roots)} ?? ['body']).some((s) => { try { return !!document.querySelector(s); } catch { return false; } })`, returnByValue: true }, sessionId)).result?.value) === true;
    let shown = await shows();
    for (let i = 0; !shown && i < 20; i++) { await new Promise((res) => setTimeout(res, 500)); shown = await shows(); }
    if (!shown) { unrendered.push(label); await send('Target.closeTarget', { targetId }); continue; }
    sweptPlugins++;
    // A keyboard user's page: one real Tab first, so the browser shows focus as it does for the keyboard
    // (:focus-visible), not as it does after a mouse click.
    try {
      for (const type of ['keyDown', 'keyUp']) await send('Input.dispatchKeyEvent', { type, key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 }, sessionId);
    } catch { /* no keyboard: the sweep still runs */ }
    // A component the harness could not load or render is said, never counted as clean.
    if (target.harness) for (const f of ((await send('Runtime.evaluate', { expression: 'window.__dseHarnessFailed || []', returnByValue: true }, sessionId)).result?.value ?? [])) unrendered.push(`${f.name} (${f.why})`);

    // 2. Name/role — accessibility tree (theme-independent), run once per target.
    try {
      await send('Accessibility.enable', {}, sessionId);
      // Asked role by role: the whole tree of a big page (a style guide with every component drawn, thousands of
      // elements) is one message too large for the DevTools socket, which then closes and the check stalls.
      const doc = (await send('Runtime.evaluate', { expression: 'document' }, sessionId)).result?.objectId;
      const nodes = [];
      for (const role of INTERACTIVE_ROLES) nodes.push(...((await send('Accessibility.queryAXTree', { objectId: doc, role }, sessionId)).nodes ?? []));
      for (const n of nodes) {
        if (n.ignored) continue;
        const role = n.role?.value;
        if (!INTERACTIVE_ROLES.has(role)) continue;
        const name = (n.name?.value || '').trim();
        if (!name) findings.push({ kind: 'name', plugin: label, role, desc: `<${role}> with no accessible name` });
        else if (namedByTitleOnly(n)) findings.push({ kind: 'tooltipname', plugin: label, role, desc: `<${role}> "${name.slice(0, 40)}", named only by its title` });
      }
    } catch { /* Accessibility domain unavailable — skip name/role, not a fail */ }

    // A real Tab key press first: script focus then counts as keyboard focus, so :focus-visible
    // styles show exactly as a keyboard user sees them.
    const pressKey = async (key, code, keyCode, text) => {
      await send('Input.dispatchKeyEvent', { type: 'keyDown', key, code, windowsVirtualKeyCode: keyCode, ...(text ? { text } : {}) }, sessionId);
      await send('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode: keyCode }, sessionId);
    };
    // The page counts as focused even when another tab of the same browser holds the window's focus:
    // without it, script focus can miss :focus / :focus-visible and a ring reads as missing.
    try { await send('Emulation.setFocusEmulationEnabled', { enabled: true }, sessionId); } catch { /* older Chrome */ }
    try { await pressKey('Tab', 'Tab', 9); } catch { /* input domain unavailable: script focus only */ }

    // 1. Contrast, 3. focus (and its ring contrast) in EVERY mode; 4/5. state exposure and keyboard
    // reachability once (they do not depend on the theme). A finding repeated in several modes is
    // reported once, with the modes it happens in.
    let first = true;
    const once = new Map();
    const note = (kind, desc, mode, extra = {}) => {
      const k = `${kind}|${desc}`;
      // Several elements can share a description ("button"): each mode is listed once, and the
      // number of elements is kept as places (the most seen in any one mode).
      const f = once.get(k);
      if (f) {
        f.perMode[mode] = (f.perMode[mode] ?? 0) + 1;
        if (!f.modes.includes(mode)) f.modes.push(mode);
        f.places = Math.max(...Object.values(f.perMode));
        return;
      }
      const nf = { kind, plugin: label, desc, modes: [mode], perMode: { [mode]: 1 }, ...extra };
      once.set(k, nf); findings.push(nf);
    };
    for (const mode of modes) {
      await send('Emulation.setEmulatedMedia', { features: mode.sw.media }, sessionId);
      if (mode.sw.apply) await send('Runtime.evaluate', { expression: mode.sw.apply }, sessionId);
      await send('Runtime.evaluate', { expression: SETTLE_TRANSITIONS }, sessionId).catch(() => {});
      const r = await send('Runtime.evaluate', { expression: sweepExpression(roots, true, STATE_MAP), returnByValue: true }, sessionId).catch((e) => ({ error: e.message }));
      if (!r.result?.value) { const why = r.error ?? r.exceptionDetails?.exception?.description?.split('\n')[0]; unread.push(`${label} (${mode.name}${why ? `: ${why}` : ''})`); if (mode.sw.undo) await send('Runtime.evaluate', { expression: mode.sw.undo }, sessionId); first = false; continue; }
      const { textEls = [], iconEls = [], noFocus = [], faintFocus = [], thinFocus = [], ariaState = [], notKeyboard = [] } = r.result.value;
      for (const f of iconContrastFindings(iconEls, mode.name)) findings.push({ plugin: label, ...f });
      for (const t of thinFocus) note('focusthin', t.desc, mode.name, { px: t.px });
      for (const f of contrastFindings(textEls, mode.name)) findings.push({ plugin: label, ...f });
      for (const desc of noFocus) note('focus', desc, mode.name);
      // Focus indicator visible? (WCAG 1.4.11 for the focus ring — computed in Node)
      for (const f of faintFocus) {
        const bg = effectiveBg(f.bgLayers);
        // The ring is seen when its clearest tone stands out (a two-tone ring is built that way).
        const ratios = (f.colors ?? [f.color]).map(parseColor).filter((c) => c && c.a > 0).map((raw) => contrastRatio(raw.a < 1 ? over(raw, bg) : raw, bg));
        if (!ratios.length) continue;
        const ratio = Math.max(...ratios);
        if (ratio + 1e-9 < 3) note('focuscontrast', f.desc, mode.name, { ratio: Math.round(ratio * 100) / 100, threshold: 3 });
      }
      if (first) {
        for (const desc of ariaState) findings.push({ kind: 'ariastate', plugin: label, desc });
        for (const desc of notKeyboard) findings.push({ kind: 'keyboard', plugin: label, desc });
      }
      if (mode.sw.undo) await send('Runtime.evaluate', { expression: mode.sw.undo }, sessionId);
      first = false;
    }
    await send('Emulation.setEmulatedMedia', { features: modes[0].sw.media }, sessionId);
    if (modes[0].sw.apply) await send('Runtime.evaluate', { expression: modes[0].sw.apply }, sessionId);
    // Interaction-state contrast (:hover) — force the pseudo-state via CDP and re-measure. Reuses the
    // contrast sweep; reports only text that reads fine at rest but fails while hovered (opt-in --states).
    if (RUN_STATES) {
      try {
        await send('DOM.enable', {}, sessionId);
        await send('CSS.enable', {}, sessionId);
        await send('Emulation.setEmulatedMedia', { features: modes[0].sw.media }, sessionId);
        const doc = await send('DOM.getDocument', { depth: -1 }, sessionId);
        const q = await send('DOM.querySelectorAll', { nodeId: doc.root.nodeId, selector: 'a[href],button,[role=button],[role=link],input:not([type=hidden]),select,textarea,[tabindex]' }, sessionId);
        const ids = (q.nodeIds || []).slice(0, 400);
        for (const id of ids) { try { await send('CSS.forcePseudoState', { nodeId: id, forcedPseudoClasses: ['hover'] }, sessionId); } catch {} }
        await send('Runtime.evaluate', { expression: SETTLE_TRANSITIONS }, sessionId).catch(() => {});
        const r = await send('Runtime.evaluate', { expression: sweepExpression(roots, false, STATE_MAP), returnByValue: true }, sessionId);
        const hoverText = (r.result?.value || {}).textEls || [];
        const restKey = new Set(findings.filter((f) => f.kind === 'contrast' && f.theme === modes[0].name).map((f) => f.desc + '|' + f.text));
        for (const f of contrastFindings(hoverText, modes[0].name)) {
          if (!restKey.has(f.desc + '|' + f.text)) findings.push({ kind: 'hovercontrast', plugin: label, theme: f.theme, desc: f.desc, text: f.text, ratio: f.ratio, threshold: f.threshold });
        }
        for (const id of ids) { try { await send('CSS.forcePseudoState', { nodeId: id, forcedPseudoClasses: [] }, sessionId); } catch {} }
      } catch (e) { unfinished.push(`${label}: hover contrast (${String(e?.message ?? e).slice(0, 80)})`); }   // missing, never clean
    }
    // ── Deeper checks (WCAG 2.2): target size, a real Tab walk, dialogs and Escape, reduced motion,
    //    forced colours, text spacing, reflow (opt-in a11y.reflow), and semantics against the contract.
    //    Each one is isolated: a failure in one never stops the others or the check as a whole.
    const evalv = async (expr) => (await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }, sessionId)).result?.value;
    // On the style guide a component is read where it is drawn, in its own section's playground: the page's own chrome
    // (a navigation card, a hidden menu button) shares the system's classes and is never the component.
    const ownSection = (comp, sel) => (target.styleguide && sel ? `#c-${String(comp).replace(/[^\w-]+/g, '-')} .pg-preview :is(${sel})` : sel);
    const media0 = modes[0].sw.media;
    const step = makeStep(findings, unfinished, label);
    await step(async () => {
      for (const x of (await evalv(deepSweepExpression(roots, 'targets'))) ?? []) findings.push({ kind: 'target', plugin: label, ...x });
    });
    // WCAG 2.1 A and AA, what is left once the checks above have run (wcag-page.js): text alternatives, groups and
    // tables, reading order, input purpose, control edges, moving and flashing content, link words, empty headings,
    // label in name, valid ARIA, status messages; then what it does when used (hover content, focus, input, press).
    // The first few of each component on the page; findings say the component they sit in.
    // The checks on the first few of each component, at rest; `edgesOnly` keeps the control edges (1.4.11), which
    // depend on the colour mode and are read again in every other mode.
    const wcagRun = (sel, edgesOnly) => evalv(`(async () => {
      const sel = ${JSON.stringify(sel)};
      const all = sel ? [...document.querySelectorAll(sel)] : [document.body];
      const seen = [], out = [];
      for (const el of all) {
        if (seen.length >= 3) break;
        if (seen.some((s) => s.contains(el)) || !el.getClientRects().length) continue;
        seen.push(el);
        // Read at rest: the focus the checks above gave a field is taken away and every transition it starts
        // jumps to its end, so an edge never reads halfway back from its focus look (a pass in one run, a fail in the next).
        if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
        ${SETTLE_TRANSITIONS};
        out.push(...window.__wcag21.check(el, { name: sel || '' }).findings.filter((f) => !${edgesOnly} || f.kind === 'boundary'));
        if (!${edgesOnly} && seen.length === 1) out.push(...(await window.__wcag21.interact(el, { wait: 150, triggers: 4 })).findings);
      }
      return out;
    })()`);
    // A control edge is one finding per element, with every mode it is too faint in.
    const edgeOf = new Map();
    const edgeKey = (sel, f) => `${String(f.desc).replace(/ \(.*$/, '')}|${sel ?? ''}`;
    await step(async () => {
      await evalv(WCAG_PAGE_SOURCE + '; true');
      const sels = roots ?? [null];
      for (const sel of sels) {
        const res = await wcagRun(sel, false);
        const once = new Set();
        for (const f of res ?? []) {
          const desc = sel ? `${f.desc} in ${sel}` : f.desc;
          if (once.has(f.kind + desc)) continue;
          once.add(f.kind + desc);
          const nf = { kind: f.kind, plugin: label, desc, ...(f.kind === 'boundary' && modes.length > 1 ? { modes: [modes[0].name] } : {}) };
          if (f.kind === 'boundary') edgeOf.set(edgeKey(sel, f), nf);
          findings.push(nf);
        }
      }
      ranChecks.add('wcag21');
    });
    // WCAG 1.4.11 in every other colour mode: a field edge that holds in light can fade into a dark background.
    if (modes.length > 1) await step(async () => {
      for (const mode of modes.slice(1)) {
        await send('Emulation.setEmulatedMedia', { features: mode.sw.media }, sessionId);
        if (mode.sw.apply) await send('Runtime.evaluate', { expression: mode.sw.apply }, sessionId);
        try {
          for (const sel of roots ?? [null]) {
            for (const f of (await wcagRun(sel, true)) ?? []) {
              const k = edgeKey(sel, f), had = edgeOf.get(k);
              if (had) { if (!had.modes.includes(mode.name)) had.modes.push(mode.name); continue; }
              const nf = { kind: 'boundary', plugin: label, desc: sel ? `${f.desc} in ${sel}` : f.desc, modes: [mode.name] };
              edgeOf.set(k, nf); findings.push(nf);
            }
          }
        } finally { if (mode.sw.undo) await send('Runtime.evaluate', { expression: mode.sw.undo }, sessionId); }
      }
      await send('Emulation.setEmulatedMedia', { features: modes[0].sw.media }, sessionId);
      if (modes[0].sw.apply) await send('Runtime.evaluate', { expression: modes[0].sw.apply }, sessionId);
    });
    await step(async () => {
      // Positive tabindex, then a real walk: Tab through the page and watch where the focus goes.
      const positive = await evalv(`[...document.querySelectorAll('[tabindex]')].filter(e => +e.getAttribute('tabindex') > 0).map(e => (e.tagName.toLowerCase() + (e.id ? '#' + e.id : '')).slice(0, 60))`);
      for (const d of positive ?? []) findings.push({ kind: 'tabindex', plugin: label, desc: d });
      await evalv(`document.activeElement && document.activeElement.blur && document.activeElement.blur()`);
      const seq = [];
      const obscured = new Set();
      for (let i = 0; i < 60; i++) {
        await pressKey('Tab', 'Tab', 9);
        seq.push(await evalv(deepSweepExpression(null, 'active')));
        // On the styleguide a sticky header is the page's own chrome, not the design system's.
        const ob = target.styleguide ? null : await evalv(deepSweepExpression(null, 'obscured'));
        if (ob) obscured.add(ob);
      }
      for (const d of obscured) findings.push({ kind: 'obscured', plugin: label, desc: d });
      const distinct = new Set(seq.filter(Boolean));
      for (let i = 2; i < seq.length; i++) {
        if (seq[i] && seq[i] === seq[i - 1] && seq[i] === seq[i - 2] && distinct.size > 1) { findings.push({ kind: 'tabtrap', plugin: label, desc: seq[i].split('|').slice(1).join('|') }); break; }
      }
      ranChecks.add('tabtrap');
    });
    await step(async () => {
      // Escape is judged on a dialog that lies over the page; one drawn open in its flow, with nothing that opened it,
      // is said not judged here (where a control opens it, the opener check below judges it).
      const at = (await evalv(deepSweepExpression(null, 'dialogsAt'))) ?? [];
      for (const d of at.filter((x) => !x.over)) notJudged.push(`Escape on ${d.desc} (${label}): drawn open in the page with nothing that opened it, so it is judged only where a control opens it`);
      const open = at.filter((x) => x.over).map((x) => x.desc);
      if (!open.length) return;
      await evalv(`(() => { const d = document.querySelector('dialog[open],[role=dialog],[role=alertdialog],[aria-modal=true]'); const f = d && d.querySelector('button,a[href],input,select,textarea,[tabindex]'); (f || d)?.focus?.(); })()`);
      await pressKey('Escape', 'Escape', 27);
      const still = new Set((await evalv(deepSweepExpression(null, 'dialogs'))) ?? []);
      for (const d of open) if (still.has(d)) findings.push({ kind: 'escape', plugin: label, desc: d });
    });
    await step(async () => {
      await send('Emulation.setEmulatedMedia', { features: [...media0, { name: 'prefers-reduced-motion', value: 'reduce' }] }, sessionId);
      for (const d of (await evalv(deepSweepExpression(roots, 'moving'))) ?? []) findings.push({ kind: 'motion', plugin: label, desc: d });
    });
    await step(async () => {
      const normal = new Set(findings.filter((f) => f.kind === 'focus' && f.plugin === label).map((f) => f.desc));
      await send('Emulation.setEmulatedMedia', { features: [...media0, { name: 'forced-colors', value: 'active' }] }, sessionId);
      const r2 = await evalv(sweepExpression(roots, true, STATE_MAP));
      for (const d of r2?.noFocus ?? []) if (!normal.has(d)) findings.push({ kind: 'forcedfocus', plugin: label, desc: d });
    });
    await send('Emulation.setEmulatedMedia', { features: media0 }, sessionId).catch(() => {});
    await step(async () => {
      // WCAG 1.4.12: the spacing a reader may set; only text that is newly cut off counts.
      const before = new Set((await evalv(deepSweepExpression(roots, 'clipped'))) ?? []);
      await evalv(`(() => { const s = document.createElement('style'); s.id = '__designSystemEngine_spacing'; s.textContent = '* { line-height: 1.5 !important; letter-spacing: 0.12em !important; word-spacing: 0.16em !important; } p { margin-bottom: 2em !important; }'; document.head.appendChild(s); })()`);
      for (const d of (await evalv(deepSweepExpression(roots, 'clipped'))) ?? []) if (!before.has(d)) findings.push({ kind: 'spacing', plugin: label, desc: d });
      await evalv(`document.getElementById('__designSystemEngine_spacing')?.remove()`);
      ranChecks.add('spacing');
    });
    if (cfg.a11y?.reflow === true) await step(async () => {
      await send('Emulation.setDeviceMetricsOverride', { width: 320, height: 640, deviceScaleFactor: 1, mobile: false }, sessionId);
      const r3 = await evalv(deepSweepExpression(null, 'reflow'));
      if (r3 && r3.scrollWidth > r3.width + 1) findings.push({ kind: 'reflow', plugin: label, desc: `${label}: ${r3.scrollWidth}px wide at 320px` });
      ranChecks.add('reflow');
      await send('Emulation.clearDeviceMetricsOverride', {}, sessionId);
    });
    await step(async () => {
      // WCAG 1.4.4: at 200% zoom (half the CSS width) no text newly cut off.
      await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false }, sessionId);
      const before = new Set((await evalv(deepSweepExpression(roots, 'clipped'))) ?? []);
      await send('Emulation.setDeviceMetricsOverride', { width: 640, height: 450, deviceScaleFactor: 2, mobile: false }, sessionId);
      for (const d of (await evalv(deepSweepExpression(roots, 'clipped'))) ?? []) if (!before.has(d)) findings.push({ kind: 'zoom', plugin: label, desc: d });
      await send('Emulation.clearDeviceMetricsOverride', {}, sessionId);
      ranChecks.add('zoom');
    });
    await step(async () => {
      // Rendered role against the contract's authored semantics (contract.authored.json).
      const want = contractSemantics(ROOT, cfg);
      if (!Object.keys(want).length) return;
      await send('DOM.enable', {}, sessionId);
      const doc = await send('DOM.getDocument', { depth: 0 }, sessionId);
      for (const [comp, role] of Object.entries(want)) {
        if (components.length && !components.includes(comp)) continue;
        let q;
        try { q = await send('DOM.querySelector', { nodeId: doc.root.nodeId, selector: selOf(comp) }, sessionId); } catch { continue; }
        if (!q?.nodeId) continue;
        const ax = await send('Accessibility.getPartialAXTree', { nodeId: q.nodeId, fetchRelatives: false }, sessionId);
        const got = String(ax?.nodes?.[0]?.role?.value ?? '').toLowerCase();
        if (got && !sameRole(got, role)) findings.push({ kind: 'semantics', plugin: label, desc: `${comp} (${selOf(comp)})`, got, want: role });
      }
    });
    await step(async () => {
      // Figma accessibility annotations as facts: the role, name, heading level or alt text a note
      // states, against what the component (or the named inner part) renders.
      const facts = annotationFactsFor(ROOT, cfg);
      if (!Object.keys(facts).length) return;
      let contract = {};
      try { contract = (await import(pathToFileURL(resolve(ROOT, cfg.paths?.structureContract ?? 'structure-contract.mjs')).href)).CONTRACT ?? {}; } catch { /* parts are optional */ }
      await send('DOM.enable', {}, sessionId);
      const doc = await send('DOM.getDocument', { depth: 0 }, sessionId);
      const axOf = async (selector, want = null) => {
        let q;
        try { q = await send('DOM.querySelector', { nodeId: doc.root.nodeId, selector }, sessionId); } catch { return null; }
        if (!q?.nodeId) return null;
        let ax = (await send('Accessibility.getPartialAXTree', { nodeId: q.nodeId, fetchRelatives: false }, sessionId))?.nodes?.[0];
        if (!ax) return null;
        // A plain wrapper (a div, a label around its input) may hold the component's own control, but a control it holds
        // is not always the component (a card is not the link inside it, a dialog's wrapper is not its Close button).
        if (/^(generic|none|labeltext|group|section|presentation)$/i.test(String(ax.role?.value ?? '')) || ax.ignored) {
          let ix = null;
          if (want) {
            // The role the annotation names, looked for by the role the browser gives each element inside (a native
            // <dialog>, <a href>, <li> or <input type=number> counts, not only a role attribute). When nothing inside
            // has it, the wrapper's own role is the answer.
            for (const role of [want, ...(AX_ROLE_ALIASES[want] ?? [])]) {
              const found = (await send('Accessibility.queryAXTree', { nodeId: q.nodeId, role }, sessionId).catch(() => null))?.nodes ?? [];
              ix = found.find((n) => !n.ignored) ?? null;
              if (ix) break;
            }
            // A subtree the tree leaves out (a harness host it ignores) has no computed roles to search: the element
            // that declares the role, or its native equivalent, is read on its own.
            if (!ix) {
              const wanted = `[role="${want}"]${{ textbox: ',input:not([type]),input[type=text],input[type=email],input[type=search],textarea', spinbutton: ',input[type=number]', button: ',button' }[want] ?? ''}`;
              const inner = await send('DOM.querySelector', { nodeId: q.nodeId, selector: wanted }, sessionId).catch(() => null);
              if (inner?.nodeId) ix = (await send('Accessibility.getPartialAXTree', { nodeId: inner.nodeId, fetchRelatives: false }, sessionId))?.nodes?.[0] ?? null;
            }
          } else {
            // No role named (a name, a heading level, a pressed state): the one control it wraps, when it wraps exactly
            // one. A control inside another (an icon's role inside its button) is not counted; a container of several
            // controls is read as itself.
            const obj = await send('DOM.resolveNode', { nodeId: q.nodeId }, sessionId).catch(() => null);
            const one = obj?.object?.objectId ? await send('Runtime.callFunctionOn', { objectId: obj.object.objectId, returnByValue: true, arguments: [{ value: WRAPPED_CONTROL }],
              functionDeclaration: 'function (sel) { const all = [...this.querySelectorAll(sel)]; const top = all.filter((el) => !all.some((o) => o !== el && o.contains(el))); return top.length === 1 ? all.indexOf(top[0]) : -1; }' }, sessionId).catch(() => null) : null;
            const at = one?.result?.value;
            if (Number.isInteger(at) && at >= 0) {
              const id = (await send('DOM.querySelectorAll', { nodeId: q.nodeId, selector: WRAPPED_CONTROL }, sessionId).catch(() => null))?.nodeIds?.[at];
              if (id) ix = (await send('Accessibility.getPartialAXTree', { nodeId: id, fetchRelatives: false }, sessionId))?.nodes?.[0] ?? null;
            }
          }
          if (ix && !/^(generic|none)$/i.test(String(ix.role?.value ?? ''))) ax = ix;
        }
        const prop = (n) => ax.properties?.find((p) => p.name === n)?.value?.value;
        return { role: String(ax.role?.value ?? '').toLowerCase(), name: String(ax.name?.value ?? ''), level: prop('level'), pressed: prop('pressed') };
      };
      for (const [comp, { facts: f, layers }] of Object.entries(facts)) {
        if (components.length && !components.includes(comp)) continue;
        if (Object.keys(f).length) {
          // A component the code has no markup for is drawn as a stand-in on the style guide: there is nothing of the
          // code's to read, so it is said not checked.
          if (target.styleguide && await evalv(`!!document.querySelector(${JSON.stringify(ownSection(comp, selOf(comp)))})?.matches('[data-sg-standin]')`)) {
            findings.push({ kind: 'annotation', plugin: label, desc: `${comp}: not checked, the code has no markup for it (the style guide draws a stand-in)` });
            continue;
          }
          const got = await axOf(ownSection(comp, selOf(comp)), f.role ? String(f.role).toLowerCase() : null);
          if (got) for (const d of annotationMismatches(f, got)) findings.push({ kind: 'annotation', plugin: label, desc: `${comp}: ${d}` });
        }
        // A note on an inner layer is checked on the part the contract names the same way.
        for (const { layer, facts: lf } of layers) {
          if (lf.part && !lf.role && !lf.name && !lf.level) continue;   // a part role: the part-role step below checks it
          const part = (contract[comp]?.children ?? []).find((c) => String(c.name ?? '').toLowerCase() === String(layer).toLowerCase());
          if (!part?.cssSelector) { findings.push({ kind: 'annotation', plugin: label, desc: `${comp} › ${layer}: not checked, the contract has no part named "${layer}" (add it to children with its cssSelector)` }); continue; }
          const got = await axOf(ownSection(comp, part.cssSelector));
          if (got) for (const d of annotationMismatches(lf, got)) findings.push({ kind: 'annotation', plugin: label, desc: `${comp} › ${layer}: ${d}` });
        }
      }
    });
    await step(async () => {
      // Roles as contracts (I39): what each declared role requires, on the rendered instances. The role
      // comes from the contract's authored semantics, or from a Figma note (which wins when both exist).
      const roles = Object.fromEntries(Object.entries(contractSemantics(ROOT, cfg)).map(([c, r]) => [c, { role: r }]));
      for (const [c, { facts: f }] of Object.entries(annotationFactsFor(ROOT, cfg))) if (f.role) roles[c] = { role: f.role, pressed: !!f.pressed };
      for (const [comp, r] of Object.entries(roles)) {
        if (components.length && !components.includes(comp)) continue;
        const sel = ownSection(comp, selOf(comp));
        if (!sel) continue;
        for (const problem of (await evalv(roleContractExpression(sel, r.role, { pressed: r.pressed }))) ?? []) findings.push({ kind: 'rolecontract', plugin: label, desc: `${comp} (${r.pressed ? 'toggle button' : r.role}): ${problem}` });
      }
    });
    await step(async () => {
      // Part roles and behaviours as contracts (I85, I92). A part's role comes from the annotation on its Figma layer; a
      // behaviour from the component's role and its annotations. Behaviours need the component's own script: on the
      // engine's style guide, which draws markup only, they are listed as not checked.
      let snap = {};
      try { snap = JSON.parse(readFileSync(resolve(ROOT, cfg.paths?.compPropsSnapshot ?? 'figma-component-props.snapshot.json'), 'utf8')); } catch { /* no annotations */ }
      // Only the notes that are requirements: a note in a design-intent category (Intent, Implementation…) asks nothing.
      const cats = loadCategories(ROOT, cfg);
      let authored = {};
      try { authored = JSON.parse(readFileSync(resolve(ROOT, cfg.contracts?.authored ?? 'contract.authored.json'), 'utf8'))?.components ?? {}; } catch { /* none */ }
      let contract = {};
      try { contract = (await import(pathToFileURL(resolve(ROOT, cfg.paths?.structureContract ?? 'structure-contract.mjs')).href)).CONTRACT ?? {}; } catch { /* parts are optional */ }
      const roles = Object.fromEntries(Object.entries(contractSemantics(ROOT, cfg)).map(([c, r]) => [c, r]));
      for (const [c, v] of Object.entries(snap)) { const w = !c.startsWith('_') && roleWordOf(requirementEntry(v, cats, cfg)?.annotations ?? []); if (w) roles[c] = w; }   // the role as Figma writes it (togglebutton, disclosure)
      // States follow their props: on the style guide, each option's effect is in its data (the code's selector for it).
      if (target.styleguide) {
        const sg = await evalv(`(() => { try { return JSON.parse(document.getElementById('sg-data').textContent).components || []; } catch (e) { return []; } })()`);
        for (const f of stateFindings((sg ?? []).map((c) => ({ ...c, role: roles[c.name] ?? c.role })))) if (!components.length || components.includes(f.component)) findings.push({ kind: 'statefollows', plugin: label, desc: f.message });
      }
      const names = [...new Set([...Object.keys(roles), ...Object.keys(snap).filter((k) => !k.startsWith('_'))])];
      const KEY = { ' ': [' ', 'Space', 32, ' '], Enter: ['Enter', 'Enter', 13, '\r'], Escape: ['Escape', 'Escape', 27], ArrowRight: ['ArrowRight', 'ArrowRight', 39], ArrowDown: ['ArrowDown', 'ArrowDown', 40], ArrowUp: ['ArrowUp', 'ArrowUp', 38], ArrowLeft: ['ArrowLeft', 'ArrowLeft', 37], Home: ['Home', 'Home', 36], End: ['End', 'End', 35] };
      // A style guide that inlines the system's own scripts (systemScripts) runs its components as the product does.
      const scripted = target.styleguide ? !!(await evalv(`!!document.querySelector('script[data-system-script]')`)) : true;
      let n = 0;
      for (const comp of names) {
        if (components.length && !components.includes(comp)) continue;
        const sel = selOf(comp);
        if (!sel) continue;
        const entry = requirementEntry(snap[comp] ?? {}, cats, cfg);
        for (const { layer, part } of partRolesOf(entry)) {
          const partSel = (contract[comp]?.children ?? []).find((c) => String(c.name ?? '').toLowerCase() === String(layer).toLowerCase())?.cssSelector ?? null;
          for (const problem of (await evalv(partRoleExpression(sel, partSel, layer, part))) ?? []) findings.push({ kind: 'partrole', plugin: label, desc: `${comp}: ${problem}` });
        }
        const plan = behavioursFor(roles[comp] ?? '', entry.annotations ?? [], authored[comp]?.behaviourExceptions ?? {});
        for (const w of plan.weak) findings.push({ kind: 'behaviour', plugin: label, desc: `${comp}: the exception for "${w.id}" gives no link to the decision (an ADR or a pull request), so it is still checked` });
        if (!plan.rows.length) continue;
        if (target.styleguide && !scripted) { behavioursNotChecked.add(comp); continue; }
        const mark = `b${n++}`;
        if (!(await evalv(markInstanceExpression(sel, mark, roles[comp] ?? null)))) continue;
        for (const row of plan.rows) {
          if (row.ifClickWorks) {
            await evalv(behaviourExpression(mark, row, 'before'));
            await evalv(`document.querySelector('[data-dse-control="${mark}"]').click()`);
            const clicked = await evalv(behaviourExpression(mark, row, 'after'));
            await evalv(behaviourExpression(mark, row, 'undo'));
            if (!clicked?.ok) continue;
          }
          const tries = row.act.keys ? row.act.keys.map((k) => ({ keys: [k] })) : [row.act];
          const results = [];
          for (const t of tries) {
            const before = await evalv(behaviourExpression(mark, row, 'before'));
            if (!before) break;
            if (t.click) await evalv(`document.querySelector('[data-dse-control="${mark}"]').click()`);
            else if (t.type) await send('Input.insertText', { text: t.type }, sessionId);
            else for (const k of t.keys) await pressKey(...KEY[k]);
            results.push(await evalv(behaviourExpression(mark, row, 'after')));
            await evalv(behaviourExpression(mark, row, 'undo'));
          }
          // Arrow keys: either direction will do. Every other key, and a click, must each work.
          const ok = row.expect === 'focus-moves' ? results.some((r) => r?.ok) : results.length && results.every((r) => r?.ok);
          if (!ok && results.length) findings.push({ kind: 'behaviour', plugin: label, desc: `${comp}: ${row.says} (${row.from}), but ${results.find((r) => !r?.ok)?.saw || 'nothing happened'}` });
        }
      }
    });
    await step(async () => {
      // Composite widgets move with the arrow keys.
      for (const g of (await evalv(deepSweepExpression(roots, 'composites'))) ?? []) {
        const started = await evalv(`(() => { const g = document.querySelector('[data-design-system-engine-group="${g.i}"]'); if (!g) return false; const items = [...g.querySelectorAll('[role=radio],[role=tab],[role=menuitem],[role=option]')]; const s = items.find((x) => x.tabIndex >= 0) || items[0]; s.focus(); window.__designSystemEngineStart = s; return document.activeElement === s; })()`);
        if (!started) continue;
        const vertical = ['menu', 'listbox'].includes(g.role);
        await pressKey(vertical ? 'ArrowDown' : 'ArrowRight', vertical ? 'ArrowDown' : 'ArrowRight', vertical ? 40 : 39);
        const moved = await evalv(`(() => { const g = document.querySelector('[data-design-system-engine-group="${g.i}"]'); return !!g && document.activeElement !== window.__designSystemEngineStart && g.contains(document.activeElement); })()`);
        if (!moved) findings.push({ kind: 'arrows', plugin: label, desc: `${g.desc} [role=${g.role}]` });
      }
    });
    await step(async () => {
      // Controls built from plain elements respond to Enter (and Space). Last, since it presses keys
      // on the page: the click is caught before the element's own handler, so nothing navigates.
      for (const w of (await evalv(deepSweepExpression(roots, 'widgets'))) ?? []) {
        const keys = ['checkbox', 'switch', 'radio', 'option'].includes(w.role) ? [[' ', 'Space', 32, ' ']] : w.role === 'button' ? [['Enter', 'Enter', 13, '\r'], [' ', 'Space', 32, ' ']] : [['Enter', 'Enter', 13, '\r']];
        for (const [key, code, kc, text] of keys) {
          const armed = await evalv(`(() => { const el = document.querySelector('[data-design-system-engine-kbd="${w.i}"]'); if (!el) return false;
            const aria = () => [...el.attributes].filter((a) => /^aria-(checked|pressed|selected|expanded)$/.test(a.name)).map((a) => a.name + '=' + a.value).join();
            window.__designSystemEngineHit = 0; window.__designSystemEngineAria = aria; window.__designSystemEngineWas = aria();
            el.__designSystemEngineOn = (e) => { window.__designSystemEngineHit++; e.preventDefault(); e.stopImmediatePropagation(); };
            el.addEventListener('click', el.__designSystemEngineOn, true); el.focus(); return document.activeElement === el; })()`);
          if (!armed) break;   // not focusable: the keyboard check already reports it
          await pressKey(key, code, kc, text);
          const hit = await evalv(`(() => { const el = document.querySelector('[data-design-system-engine-kbd="${w.i}"]'); if (!el) return true; el.removeEventListener('click', el.__designSystemEngineOn, true); return window.__designSystemEngineHit > 0 || window.__designSystemEngineAria() !== window.__designSystemEngineWas; })()`);
          if (!hit) { findings.push({ kind: 'activate', plugin: label, desc: `${w.desc} [role=${w.role}] (${code})` }); break; }
        }
      }
    });
    await step(async () => {
      // A dialog or menu opened from its trigger closes on Escape and gives the focus back to the trigger (I78).
      const wait = (ms) => new Promise((r) => setTimeout(r, ms));
      for (const t of (await evalv(deepSweepExpression(roots, 'openers'))) ?? []) {
        if (!(await evalv(openerExpression(t.i, 'open')))) continue;
        await wait(200);
        const what = await evalv(openerExpression(t.i, 'opened'));
        if (!what) { await evalv(openerExpression(t.i, 'done')); continue; }   // nothing opened that the page shows: not judged
        await pressKey('Escape', 'Escape', 27);
        await wait(200);
        const after = await evalv(openerExpression(t.i, 'after'));
        if (after && !after.closed) { findings.push({ kind: 'escape', plugin: label, desc: `${what} (opened by ${t.desc})` }); await evalv(openerExpression(t.i, 'close')); continue; }
        await evalv(openerExpression(t.i, 'done'));
        if (after && !after.back) findings.push({ kind: 'focusreturn', plugin: label, desc: `${t.desc}: the focus goes to ${after.at || 'the page'}` });
      }
    });
    if (target.page && !roots) await step(async () => {
      // An app page names what it is about with one main heading (I79); a component page or a story does not have to.
      const h1 = (await evalv(deepSweepExpression(null, 'headings'))) ?? [];
      if (h1.length !== 1) findings.push({ kind: 'heading', plugin: label, desc: h1.length ? `${label}: ${h1.length} main headings (${h1.slice(0, 3).join(', ')})` : `${label}: no main heading (h1)` });
    });

    if (axeSource) { const v = await runAxe(send, sessionId, axeSource, roots); if (v) for (const row of v) axeViolations.push(row); }
    await send('Target.closeTarget', { targetId });
  }

  closeCDP(); cleanup(); clearTimeout(killTimer);

  if (!sweptPlugins) skip(unrendered.length ? `nothing rendered to check — ${unrendered.join(', ')} showed none of the design system's components within 10s` : 'nothing rendered to check — a --url/dev-server page did not load, or the plugin UIs are not built');
  if (unrendered.length) console.log(`⚠️  [a11y] not checked: ${unrendered.join(', ')} showed none of the design system's components within 10s`);
  if (unread.length) console.log(`⚠️  [a11y] partly not checked: the page could not be read in ${unread.join(', ')}; those results are missing, not clean`);
  if (unfinished.length) console.log(`⚠️  [a11y] partly not checked: ${unfinished.join('; ')}; those results are missing, not clean`);
  for (const n of notJudged) console.log(`⏭  [a11y] ${n}`);
  if (behavioursNotChecked.size) console.log(`ℹ️  [a11y] behaviours not checked for ${[...behavioursNotChecked].join(', ')}: the style guide draws markup without the components' script. List the system's scripts in ds-config.json → systemScripts, or point a11y.urls (or --url) at a page that runs them (Storybook, the app), to check them.`);

  // ── Report ────────────────────────────────────────────────────────────────────
  const contrast = groupSame(findings.filter((f) => f.kind === 'contrast' && !f.cannotCompute));
  const cannot   = findings.filter((f) => f.kind === 'contrast' && f.cannotCompute);
  const names    = findings.filter((f) => f.kind === 'name');
  const iconCon  = groupSame(findings.filter((f) => f.kind === 'iconcontrast'));
  const focus    = findings.filter((f) => f.kind === 'focus');
  const focusCon = findings.filter((f) => f.kind === 'focuscontrast');
  const hoverCon = groupSame(findings.filter((f) => f.kind === 'hovercontrast'));
  const state    = findings.filter((f) => f.kind === 'ariastate');
  const keyboard = findings.filter((f) => f.kind === 'keyboard');
  const themes   = [...new Set(modes.map((m) => m.name))];

  const more = ['tooltipname', 'target', 'tabtrap', 'tabindex', 'escape', 'focusreturn', 'heading', 'activate', 'arrows', 'obscured', 'zoom', 'motion', 'forcedfocus', 'focusthin', 'spacing', 'reflow', 'semantics', 'rolecontract', 'annotation', 'partrole', 'behaviour', 'statefollows', ...Object.keys(WCAG21_GUIDE)].map((k) => [k, findings.filter((f) => f.kind === k)]);
  const buckets = [['contrast', contrast], ['hovercontrast', hoverCon], ['iconcontrast', iconCon], ['name', names], ['focus', focus], ['focuscontrast', focusCon], ['ariastate', state], ['keyboard', keyboard], ...more].filter(([, l]) => l.length);
  const total = buckets.reduce((n, [, l]) => n + l.length, 0);
  const inThemes = themes.length > 1 ? ` (checked in ${themes.length} themes)` : '';

  const axe = RUN_AXE ? summarizeAxe(axeViolations) : [];
  // Findings name the component they sit in ("… in .chip"); that component links to Figma.
  const { figmaLinker } = await import('./figma-link.mjs');
  const linkFor = figmaLinker(ROOT, cfg);
  // Every component the system has: the locator's, and those only Figma's snapshots list (their selectors come from the
  // locator's convention all the same).
  let everyName = locator.names();
  for (const f of [cfg.paths?.snapshotStructure ?? 'src/figma-structure.snapshot.json', cfg.paths?.compPropsSnapshot ?? 'src/figma-component-props.snapshot.json']) {
    try { const j = JSON.parse(readFileSync(join(ROOT, f), 'utf8')); everyName = [...new Set([...everyName, ...Object.keys(j.components ?? j).filter((n) => !n.startsWith('_'))])]; } catch { /* optional */ }
  }
  const bySel = new Map(everyName.map((n) => [selOf(n), n]));
  // The owner is the selector the sweep matched; a component's selector can also be written as a
  // list or with its own class first, so the first class of each is compared too.
  const firstClass = (sel) => String(sel ?? '').match(/\.(-?[_a-zA-Z][\w-]*)/)?.[1];
  const byClass = new Map(everyName.map((n) => [firstClass(selOf(n)), n]).filter(([k]) => k));
  // Read from the finding: "… in .chip", a description that starts with the component's name ("toast: …"), or the
  // element itself (button.buttonPrimary.fix-action: the first of its classes that is a component's).
  const allNames = new Set(everyName);
  const ownerName = (desc) => {
    const d = String(desc ?? '');
    const m = d.match(/ in (.+)$/);
    const inSel = m && (bySel.get(m[1]) ?? byClass.get(firstClass(m[1])));
    if (inSel) return inSel;
    const named = d.match(/^([\w/-]+): /);
    if (named && allNames.has(named[1])) return named[1];
    for (const k of d.split(/\s/)[0].match(/\.(-?[_a-zA-Z][\w-]*)/g) ?? []) { const n = byClass.get(k.slice(1)); if (n) return n; }
    return null;
  };
  const figmaOf = (desc) => { const n = ownerName(desc); return n ? linkFor(n) : null; };
  // Must-pass (a11yStrict) also counts axe's serious and critical violations, not only this check's own.
  const severeAxe = axe.filter((v) => v.impact === 'serious' || v.impact === 'critical').length;

  // ── Machine lane (--json): precise, parseable — for an agent/CI that fixes the code ──
  const machine = () => ({
    target: targets.map((t) => t.label),
    usedStyleguide: !!sg,
    themes, strict: STRICT, total, cannotMeasure: cannot.length,
    checkedAt: new Date().toISOString(),
    // The page-wide checks that finished: a criterion they stand for (a keyboard trap, text spacing, reflow, zoom) is
    // met only where its check ran.
    ran: [...ranChecks],
    issues: buckets.flatMap(([kind, list]) => list.map((f) => { const r = a11yFindingRecord(kind, f); const n = ownerName(f.desc); if (n) r.component = n; const u = figmaOf(f.desc); if (u) r.figma = u; return r; })),
    // What could not be read, rendered or finished: never a clean result, so an agent or CI can tell.
    ...(unread.length || unrendered.length || unfinished.length ? { notRead: [...unread, ...unrendered.map((u) => `${u} (not rendered)`), ...unfinished] } : {}),
    // What a check left alone on purpose, with why (a dialog drawn as a picture): neither a finding nor clean.
    ...(notJudged.length ? { notJudged } : {}),
    ...(RUN_AXE ? { axe, severeAxe } : {}),
  });
  if (JSON_OUT) { try { mkdirSync(dirname(resolve(JSON_OUT)), { recursive: true }); writeFileSync(resolve(JSON_OUT), JSON.stringify(machine(), null, 2) + '\n'); } catch { /* the file is a convenience */ } }
  if (JSON_MODE) {
    console.log(JSON.stringify(machine(), null, 2));
    process.exit(STRICT && (total || severeAxe) ? 1 : 0);
  }

  // ── Human lane (default): plain language, no jargon ──
  console.log(`\n─── Accessibility check ${STRICT ? '(must pass)' : components.length ? `(${components.join(', ')}: each line is part of building it, unless it says to send it back to Figma)` : '(advisory — never blocks the build)'} ───\n`);
  if (!total && (unread.length || unrendered.length || unfinished.length)) {
    console.log(`Nothing found in what could be read${inThemes}, but part of it was not checked (see ⚠️ above): not a clean result.`);
  } else if (!total) {
    console.log(`Good news: nothing to fix here${inThemes}.`);
  } else {
    console.log(`Found ${plural(total, 'thing', 'things')} that would make this hard to use for some people${inThemes}:\n`);
    for (const [kind, list] of buckets) {
      const g = A11Y_GUIDE[kind];
      const places = list.reduce((n, f) => n + (f.places ?? 1), 0);
      console.log(`• ${g.title(list.length)}${places > list.length ? ` (${places} places on the page)` : ''}`);
      console.log(`     Why it matters: ${g.why}`);
      console.log(`     What to do:     ${g.fix}`);
      if (VERBOSE) {
        console.log(`     Where:`);
        for (const f of list.slice(0, 100)) {
          const inSel = String(f.desc ?? '').match(/ in (.+)$/)?.[1];
          const where = kind === 'contrast' || kind === 'hovercontrast' || kind === 'iconcontrast' ? (inSel ? ` · in ${ownerName(f.desc) ?? inSel}` : f.desc ? ` · ${f.desc}` : '') : '';
          console.log(`       - ${a11yItemLine(kind, f)}${where}`);
        }
        if (list.length > 100) console.log(`       - ...and ${list.length - 100} more`);
        // The design-system components these sit in, opened in Figma.
        const owners = [...new Set(list.map((f) => ownerName(f.desc)).filter(Boolean))];
        for (const n of owners.slice(0, 10)) { const u = linkFor(n); if (u) console.log(`       🔗 ${n} in Figma: ${u}`); }
      }
      console.log('');
    }
    if (!VERBOSE) console.log(`Want the exact list? Run the same command again with --a11y — it shows every element and where to find it. (Add --json instead for a machine-readable version an agent can act on.)`);
  }
  if (cannot.length) {
    console.log(`\n${cannot.length === 1 ? 'One piece of text sits' : `${cannot.length} pieces of text sit`} on an image or gradient background, so its readability could not be measured automatically — please check ${cannot.length === 1 ? 'it' : 'them'} by eye.`);
  }

  // ── Broader scan (axe-core, opt-in) — the rules our own checks do not cover ──
  if (RUN_AXE && axeSource) {
    if (axe.length) {
      console.log(`\nA broader scanner (axe-core) also found ${plural(axe.length, 'other kind of problem', 'other kinds of problem')}:`);
      for (const v of axe) {
        console.log(`• ${v.help} — in ${plural(v.count, 'place', 'places')}${v.impact ? ` (severity: ${v.impact})` : ''}`);
        if (VERBOSE) for (const t of v.targets.slice(0, 5)) console.log(`       - ${t}`);
      }
      if (!VERBOSE) console.log(`Run with --a11y to see where each one is.`);
    } else {
      console.log(`\nThe broader scanner (axe-core) found nothing beyond the above.`);
    }
  }

  // ── Smart nudge: how to get deeper results (only when a styleguide wasn't the target) ──
  if (!sg && !harness && cfg.a11y?.styleguide !== false) {
    const sgOut = cfg.styleguide?.out ?? 'apps/styleguide/index.html';
    if (cfg.styleguide?.template && !existsSync(join(ROOT, sgOut))) {
      console.log(`\nTip for a deeper check: you have a styleguide set up but it isn't built yet. Build it (run the parity with --docs) and this check will use it on its own — that is the most thorough result: every component in every state (normal, disabled, error, focused), all on one page.`);
    } else if (!cfg.styleguide?.template) {
      console.log(`\nTip for a deeper check: this looked at "${targets[0]?.label ?? 'the page it could reach'}", which only shows the components that happen to be on screen. For the most thorough check — every component in every state (normal, disabled, error, focused) — add a styleguide (one page that shows all your components). Once it exists, this check finds and uses it automatically, so nothing is missed.`);
    }
  }

  if (STRICT && (total || severeAxe)) {
    console.log(`\nThis check is set to must-pass, so the run stops here until these are fixed${severeAxe ? ` (including ${severeAxe} serious or critical axe-core finding${severeAxe === 1 ? '' : 's'})` : ''}.`);
    process.exit(1);
  }
  process.exit(0);
}

// Only run when invoked directly — importing for tests has no side effects.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => { console.error('⏭  [a11y] skipped - ' + e.message); process.exit(0); });
}
