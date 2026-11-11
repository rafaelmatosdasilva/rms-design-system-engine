// design-a11y.mjs - accessibility that starts in the Figma file: what the design itself owes before any code is
// written, read from the snapshots every project has (the component props and their annotations, the structure with
// each variant's sizes and colours, the variables with each mode's colours).
//
//   • an interactive component with no focus state: code has to invent the focus ring, unseen by the designer;
//   • a focus ring Figma draws (the focus variant's stroke) under 3:1 against the surfaces it sits on, in any mode
//     (WCAG 1.4.11, 2.4.13);
//   • an error state that adds no message: an error shown by its colour alone is not read out and not seen by
//     everyone (WCAG 1.4.1, 3.3.1);
//   • an interactive component under 24px tall or wide, in any variant: easy to miss with a tremor or a finger (WCAG 2.5.8);
//   • a component whose name says it is a control (iconButton, textField) and no note states its role: the code guesses it;
//   • a control that shows no words and no note names it (aria-label: …): a screen reader has nothing to say (WCAG 4.1.2);
//   • a text or icon colour under its contrast on a surface it is drawn on, or that the system pairs it with by name, in
//     any mode: 4.5:1 for text, 3:1 for an icon or a large text (WCAG 1.4.3, 1.4.11).
//
// Each is for whoever keeps the Figma file: the audit lists them, --figma-edits puts them on the design team's to do
// list in Figma (figma-edits.mjs designA11yEdits, written only after a yes), and the style guide's Tasks page lists
// each under its component. The build sheet tells the agent what to write meanwhile (a focus ring on :focus-visible)
// and what to leave to the person (the words of an error message or of a name). Pure.
import { parseColor } from './css-values.mjs';
import { ratio as contrast, pairsOf, FOREGROUND } from './token-pairs.mjs';
import { deriveContrastPairs, applyDrawnOn } from './pair-derive.mjs';

const INTERACTIVE = /^(button|togglebutton|toggle|iconbutton|checkbox|radio|switch|tab|link|textbox|textfield|textinput|input|searchbox|combobox|select|spinbutton|stepper|slider|disclosure|accordion|menuitem|option)$/;
const TAKES_INPUT = /^(textbox|textfield|textinput|input|searchbox|combobox|select|spinbutton|stepper|checkbox|radio|switch|slider)$/;
const norm = (s) => String(s ?? '').toLowerCase().replace(/[\s_-]+/g, '');
const clean = (k) => String(k).replace(/#[\d:]+$/, '').trim();

// The role a component's annotation gives it ("Role: togglebutton"), normalised, or null.
export function annotatedRole(entry = {}) {
  for (const a of entry.annotations ?? []) {
    const m = /\brole\s*[:=]\s*["'“]?([a-z][\w -]*)/i.exec(String(a?.label ?? a?.labelMarkdown ?? '').replace(/[*_`]/g, ''));
    if (m) return norm(m[1]);
  }
  return null;
}

// The role a component's name says it has, before anyone annotated it: the whole name, its last two words or its last
// word (iconButton → button, textField → textbox, menuItem → menuitem), else, for a system that names the type first,
// its first two words or its first word (buttonBold → button, iconButtonGhost → button, fieldPlain → textbox). A
// group, a list or a label of them is not one (buttonGroup, fieldLabel, checkboxStack). null when the name says no control.
const NAME_ROLE = { button: 'button', iconbutton: 'button', togglebutton: 'togglebutton', checkbox: 'checkbox', radio: 'radio', radiobutton: 'radio',
  switch: 'switch', toggle: 'switch', tab: 'tab', link: 'link', field: 'textbox', textfield: 'textbox', input: 'textbox', textinput: 'textbox',
  textbox: 'textbox', textarea: 'textbox', searchfield: 'searchbox', searchbox: 'searchbox', searchinput: 'searchbox', select: 'combobox',
  dropdown: 'combobox', combobox: 'combobox', slider: 'slider', stepper: 'spinbutton', menuitem: 'menuitem', accordion: 'disclosure', disclosure: 'disclosure' };
// A name that ends on a group or a part of controls names that, not a control (checkboxStack, linkListLabel).
const NOT_A_CONTROL = /^(group|groups|list|lists|bar|label|labels|set|stack|container|wrapper|panel|header|footer|section|area|text|helper|hint|message|badge|indicator|counter|divider|background|icon|state|row|rows|item|items|option|options|cell|cells)$/;
export function nameRole(name) {
  const words = String(name ?? '').replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  if (!words.length) return null;
  for (const k of [words.join(''), words.slice(-2).join(''), words[words.length - 1]]) if (Object.hasOwn(NAME_ROLE, k)) return NAME_ROLE[k];
  // A system that names the type first and the kind after it (buttonBold, tabUnderline, fieldPlain).
  if (words.length > 1 && !NOT_A_CONTROL.test(words[words.length - 1])) for (const k of [words.slice(0, 2).join(''), words[0]]) if (Object.hasOwn(NAME_ROLE, k)) return NAME_ROLE[k];
  return null;
}

// A note that names the component for a screen reader (the forms the accessibility check reads, a11y-check.mjs annotationFacts).
const NAME_NOTE = /(^|[\s*_`])(aria-label(ledby)?|accessible name|screen ?reader (label|name)|alt( text)?|name)\s*[:=]/im;
const notesOf = (entry = {}) => [...(entry.annotations ?? []), ...(entry.layerAnnotations ?? []).flatMap((l) => l?.annotations ?? [])].map((a) => String(a?.label ?? a?.labelMarkdown ?? ''));
// A component that draws no words in any variant: no text property, and the structure capture (one that read its
// colours or variants) saw no text in it.
const showsNoWords = (defs, s) => s && typeof s === 'object' && ['colors', 'variants', 'text'].some((k) => k in s) && !defs.some(([, d]) => d?.type === 'TEXT') && !s.fontSizeVar && !s.colors?.text && !s.text
  && !Object.values(s.variants ?? {}).some((v) => v?.fontSize || v?.colors?.text);

// "State=Focus, Size=M" → { State: 'Focus', Size: 'M' }
const axesOf = (v) => Object.fromEntries(String(v).split(',').map((x) => x.split('=').map((y) => y.trim())).filter((x) => x.length === 2 && x[0]));
const disabledVariant = (v) => Object.entries(axesOf(v)).some(([k, val]) => (/^disabled$/i.test(k) && /^true$/i.test(val)) || /^disabled$/i.test(val));
const isFocusVariant = (v) => Object.entries(axesOf(v)).some(([k, val]) => /focus/i.test(val) || (/focus/i.test(k) && /^true$/i.test(val)));

// The surfaces the system defines in each mode: ds-config a11y.surfaces names them, else every colour token named as a
// surface (surface/…, background/…, canvas/…, or a /surface/ in the middle), never a text colour or a line.
// vars: the variables snapshot. → { <mode>: [{ token, value }] }
export function systemSurfaces(vars = {}, named = null) {
  const out = {};
  for (const [m, toks] of Object.entries(vars?.color ?? {})) {
    out[m] = Object.entries(toks ?? {}).filter(([t]) => (Array.isArray(named) && named.length ? named.includes(t) || named.includes(t.replace(/\/color$/, ''))
      : (/^(surface|surfaces|background|backgrounds|bg|canvas|page)(\/|$)/i.test(t) || /\/surface\//i.test(t)) && !FOREGROUND.test(t) && !/(^|\/)(border|stroke|outline|divider|separator|shadow|focus|ring|disabled)(\/|$)/i.test(t)))
      .map(([token, value]) => ({ token, value })).filter((x) => { const c = parseColor(x.value); return c && c[3] >= 1; });
  }
  return out;
}

// What the eye sees of a colour drawn over a solid one, and their contrast. null when either is not a colour or the
// one under is see-through (what is under it is not known).
function seen(fg, bg) {
  const f = parseColor(fg), b = parseColor(bg);
  if (!f || !b || b[3] < 1) return null;
  const a = f[3] ?? 1;
  return Math.round(contrast({ r: f[0] * a + b[0] * (1 - a), g: f[1] * a + b[1] * (1 - a), b: f[2] * a + b[2] * (1 - a) }, { r: b[0], g: b[1], b: b[2] }) * 100) / 100;
}
const valueIn = (vars, mode, t) => vars?.color?.[mode]?.[t] ?? vars?.color?.[mode]?.[`${t}/color`] ?? null;
const inModes = (failed, all) => (all.length > 1 && failed.length === all.length ? 'in every mode' : all.length > 1 ? `in ${failed.join(', ')}` : '');

// props: the component-props snapshot · structure: the structure snapshot's components · vars: the variables snapshot
// (its colours by mode, for the focus ring) · surfaces: systemSurfaces. → [{ component, kind, text, fix }]
export function designA11yFindings(props = {}, structure = {}, { only = null, vars = null, surfaces = null } = {}) {
  const keep = only?.length ? new Set(only.map(norm)) : null;
  const under = surfaces ?? (vars ? systemSurfaces(vars) : {});
  const out = [];
  for (const [name, entry] of Object.entries(props ?? {})) {
    if (name.startsWith('_') || !entry || typeof entry !== 'object' || (keep && !keep.has(norm(name)))) continue;
    const said = annotatedRole(entry), guessed = said ? null : nameRole(name);
    const role = said ?? guessed;
    if (!role || !INTERACTIVE.test(role)) continue;
    const s = structure?.[name] ?? null;
    if (guessed) {
      out.push({ component: name, kind: 'norole', role: guessed, text: `${name} has no role note in Figma: its name says ${/^[aeiou]/.test(guessed) ? 'an' : 'a'} ${guessed}, and nothing tells the code which role to give it (WCAG 4.1.2)`,
        fix: `add the annotation "Role: ${guessed}" (or the role it really has)` });
    }
    const defs = Object.entries(entry.properties ?? {});
    const options = defs.filter(([, d]) => d.type === 'VARIANT').flatMap(([k, d]) => (d.variantOptions ?? []).map((o) => ({ prop: clean(k), value: String(o) })));
    if (!options.some((o) => /focus/i.test(o.value) || /focus/i.test(o.prop))) {
      out.push({ component: name, kind: 'nofocus', text: `${name} has no focus state in Figma, so the code invents its focus ring and no one designs it`,
        fix: 'add a focus state (a visible ring, at least 3:1 against what is behind it)' });
    } else if (s?.variants && vars) {
      // The ring Figma draws: the focus variant's stroke, where it differs from the resting variant's. Measured against
      // every surface the system defines, in every mode; the worst is said.
      const rest = s.variants[s.defaultVariant] ?? null;
      let worst = null;
      const failed = new Set(), modes = Object.keys(vars.color ?? {});
      for (const [vn, v] of Object.entries(s.variants)) {
        if (!isFocusVariant(vn) || disabledVariant(vn)) continue;
        const ring = v?.colors?.stroke;
        if (!ring || (!ring.token && !ring.hex)) continue;
        const was = rest?.colors?.stroke ?? (s.strokeOnDefault ? s.colors?.stroke : null);
        if (was && (ring.token ? was.token === ring.token : was.hex === ring.hex)) continue;   // the border it always has: not its ring
        for (const m of modes) {
          const c = (ring.token && valueIn(vars, m, ring.token)) ?? ring.hex;
          const op = typeof ring.opacity === 'number' && ring.opacity < 1 ? ring.opacity : 1;
          const p = parseColor(c);
          if (!p) continue;
          const drawn = op < 1 ? `rgba(${p[0]}, ${p[1]}, ${p[2]}, ${(p[3] ?? 1) * op})` : c;
          for (const sf of under[m] ?? []) {
            const r = seen(drawn, sf.value);
            if (r == null) continue;
            if (r < 3) failed.add(m);
            if (!worst || r < worst.ratio) worst = { ratio: r, mode: m, on: sf.token, ring: ring.token ?? ring.hex, variant: vn };
          }
        }
      }
      if (worst && worst.ratio < 3) {
        const where = inModes([...failed], modes);
        out.push({ component: name, kind: 'focuscontrast', ratio: worst.ratio, ring: worst.ring, on: worst.on, modes: [...failed],
          text: `${name}'s focus ring (${worst.ring}, ${worst.variant}) is ${worst.ratio}:1 on ${worst.on}${where ? ` ${where}` : ''}: under 3:1 it is hard to see (WCAG 1.4.11, 2.4.13)`,
          fix: 'pick a ring colour at least 3:1 against every surface it sits on, in every mode' });
      }
    }
    const error = options.find((o) => /error|invalid/i.test(o.value));
    if (error && TAKES_INPUT.test(role)) {
      const st = s ?? {};
      const layersOf = (v) => st.variants?.[v]?.layers;
      const errKey = Object.keys(st.variants ?? {}).find((v) => new RegExp(`\\b${error.prop}=${error.value}\\b`).test(v));
      const baseKey = st.defaultVariant ?? Object.keys(st.variants ?? {}).find((v) => v !== errKey);
      const errLayers = errKey && layersOf(errKey), baseLayers = baseKey && layersOf(baseKey);
      const addsLayer = errLayers && baseLayers ? errLayers.some((l) => !baseLayers.includes(l)) : null;
      const textProp = defs.some(([k, d]) => d.type === 'TEXT' && /error|message|helper|hint|description/i.test(k));
      if (addsLayer === false || (addsLayer === null && !textProp)) {
        out.push({ component: name, kind: 'colouronly', text: `${name}'s ${error.prop}=${error.value} adds no message: the error is shown by its colour alone (WCAG 1.4.1, 3.3.1)`,
          fix: 'add an error message part to the error state (its words a text property), so the code can link it to the field' });
      }
    }
    // Its size: the resting frame, and every variant a person can use (a small size is a variant too).
    const h = s?.h;
    const tall = Object.entries(s?.variants ?? {}).filter(([vn, v]) => !disabledVariant(vn) && typeof v?.h === 'number' && v.h > 0).sort((a, b) => a[1].h - b[1].h)[0];
    const w = s?.box?.sizing?.h !== 'FILL' && typeof s?.box?.width === 'number' && s.box.width > 0 ? s.box.width : null;
    if (typeof h === 'number' && h > 0 && h < 24) {
      out.push({ component: name, kind: 'small', text: `${name} is ${h}px tall: under 24px a control is easy to miss (WCAG 2.5.8)`, fix: 'make it at least 24×24, or keep 24px of space around it wherever it is used' });
    } else if (tall && tall[1].h < 24) {
      out.push({ component: name, kind: 'small', text: `${name}'s ${tall[0]} is ${tall[1].h}px tall: under 24px a control is easy to miss (WCAG 2.5.8)`, fix: 'make it at least 24×24, or keep 24px of space around it wherever it is used' });
    } else if (w != null && w < 24) {
      out.push({ component: name, kind: 'small', text: `${name} is ${w}px wide: under 24px a control is easy to miss (WCAG 2.5.8)`, fix: 'make it at least 24×24, or keep 24px of space around it wherever it is used' });
    }
    // Its name: a control that shows no words is named only by a note, and none says it.
    if (!/^(textbox|textfield|textinput|input|searchbox|combobox|select|slider|spinbutton|stepper)$/.test(role) && showsNoWords(defs, s) && !notesOf(entry).some((t) => NAME_NOTE.test(t.replace(/[*_`]/g, ' ')))) {
      out.push({ component: name, kind: 'noname', text: `${name} shows no words, and no note in Figma says what a screen reader calls it (WCAG 4.1.2)`,
        fix: 'add an annotation with its name, written as aria-label: "<what it does>"' });
    }
  }
  return out;
}

// ── Contrast in the variables, before any code ────────────────────────────────────────────────────────────────────
// Every text and icon colour on every surface it is drawn on (the structure snapshot's drawnOn: the fill right under it,
// or, with nothing under it in the component, each surface the system defines), on the background its own component's
// names pair it with (pair-derive.mjs), on the surface the system's names made it for (token-pairs.mjs pairsOf, its
// pairs by name), and every pair the project declares (ds-config a11y.tokenPairs). Measured in each mode with the
// variables' own values: 4.5:1 for text, 3:1 for an icon, a large text or a line a control shows itself by. A pair Figma
// never draws together is left out, so is a disabled colour (WCAG asks nothing of it), and a background a component
// paints see-through (its fill opacity under 1: what is under it decides). One finding per pair, its worst mode said.
// → [{ component, kind: 'contrast', textToken, bg, ratio, threshold, modes, text, fix }]
export function designContrastFindings(vars = {}, structure = {}, { authored = [], derive = true, boundaries = false, surfaces = null, only = null } = {}) {
  const modes = Object.keys(vars?.color ?? {});
  if (!modes.length) return [];
  const names = [...new Set(modes.flatMap((m) => Object.keys(vars.color[m] ?? {})))];
  const comps = structure ?? {};
  const off = (t) => /(^|\/)disabled(\/|$)/i.test(String(t));
  // Who draws each pair, and what each component paints see-through.
  const drawer = new Map(), tint = new Set();
  for (const [cn, c] of Object.entries(comps)) {
    for (const d of Array.isArray(c?.drawnOn) ? c.drawnOn : []) if (d?.fg && d.on && !drawer.has(`${d.fg}|${d.on}`)) drawer.set(`${d.fg}|${d.on}`, cn);
    if (typeof c?.fillOpacity === 'number' && c.fillOpacity < 1 && c.colors?.fill?.token) tint.add(c.colors.fill.token);
    for (const [vn, o] of Object.entries(c?.variantFillOpacity ?? {})) if (o < 1 && c.variants?.[vn]?.colors?.fill?.token) tint.add(c.variants[vn].colors.fill.token);
  }
  const byName = new Map(Object.keys(comps).map((n) => [norm(n), n]));
  const componentOf = (key, text) => drawer.get(key) ?? byName.get(norm(String(text).split('/')[0])) ?? null;
  const { pairs: drawnPairs, apart } = applyDrawnOn(derive ? deriveContrastPairs(names, { boundaries }) : [], comps);
  const left = new Set(apart.map((p) => `${p.text}|${p.bg}`));
  const pairs = [], seenKey = new Set();
  const add = (p) => { const k = `${p.text}|${p.bg}`; if (!p.text || !p.bg || p.text === p.bg || seenKey.has(k) || left.has(k) || off(p.text) || off(p.bg)) return; seenKey.add(k); pairs.push(p); };
  for (const p of Array.isArray(authored) ? authored : []) add({ text: p?.text, bg: p?.bg, large: !!p?.large });
  for (const p of drawnPairs) add({ text: p.text, bg: p.bg, large: !!p.large });
  for (const p of pairsOf(vars.color)) if (p.by === 'name') add({ text: p.text, bg: p.surface, large: !!p.icon });
  // Drawn with nothing under it in its component: it sits on whichever surface the page gives it.
  const onSurface = [];
  for (const c of Object.values(comps)) for (const d of Array.isArray(c?.drawnOn) ? c.drawnOn : []) {
    if (d?.fg && d.on === 'surface' && !off(d.fg) && !onSurface.some((x) => x.text === d.fg)) onSurface.push({ text: d.fg, large: !!d.icon });
  }
  const under = surfaces ?? systemSurfaces(vars);
  const keep = only?.length ? new Set(only.map(norm)) : null;
  const out = [];
  const report = (key, text, large, measured) => {
    const threshold = large ? 3 : 4.5;
    const bad = measured.filter((x) => x.ratio < threshold);
    if (!bad.length) return;
    const worst = bad.sort((a, b) => a.ratio - b.ratio)[0];
    const component = componentOf(key, text);
    if (keep && !(component && keep.has(norm(component)))) return;
    const failed = [...new Set(bad.map((x) => x.mode))];
    const where = inModes(failed, modes);
    out.push({ component, kind: 'contrast', textToken: text, bg: worst.bg, ratio: worst.ratio, threshold, modes: failed, large,
      text: `${text} on ${worst.bg} is ${worst.ratio}:1${where ? ` ${where}` : ''}, under ${threshold}:1 (WCAG ${large ? '1.4.11' : '1.4.3'})`,
      fix: `pick colours at least ${threshold}:1 apart in Figma's variables, in every mode` });
  };
  for (const p of pairs) {
    if (tint.has(p.bg)) continue;
    const measured = [];
    for (const m of modes) { const r = seen(valueIn(vars, m, p.text), valueIn(vars, m, p.bg)); if (r != null && parseColor(valueIn(vars, m, p.text))?.join() !== parseColor(valueIn(vars, m, p.bg))?.join()) measured.push({ mode: m, ratio: r, bg: p.bg }); }
    report(`${p.text}|${p.bg}`, p.text, p.large, measured);
  }
  for (const p of onSurface) {
    const measured = [];
    for (const m of modes) for (const sf of under[m] ?? []) { const r = seen(valueIn(vars, m, p.text), sf.value); if (r != null && sf.token !== p.text) measured.push({ mode: m, ratio: r, bg: sf.token }); }
    report(`${p.text}|surface`, p.text, p.large, measured);
  }
  return out;
}

// The text and icon colours drawn on nothing in their own component, when no surface is known in any mode to measure
// them against: never measured, so never passed either. Said as such, with the setting that names the surfaces.
// → [{ component, fg }]
export function unmeasuredOnSurface(vars = {}, structure = {}, { surfaces = null, only = null } = {}) {
  const under = surfaces ?? systemSurfaces(vars);
  if (!Object.keys(vars?.color ?? {}).length || Object.values(under).some((l) => l?.length)) return [];
  const keep = only?.length ? new Set(only.map(norm)) : null;
  const off = (t) => /(^|\/)disabled(\/|$)/i.test(String(t));
  const out = [];
  for (const [component, c] of Object.entries(structure ?? {})) {
    if (keep && !keep.has(norm(component))) continue;
    for (const d of Array.isArray(c?.drawnOn) ? c.drawnOn : []) if (d?.fg && d.on === 'surface' && !off(d.fg) && !out.some((x) => x.component === component && x.fg === d.fg)) out.push({ component, fg: d.fg });
  }
  return out;
}

// Everything the Figma file owes, from the snapshots and ds-config.json's a11y settings: what the audit prints, what
// --figma-edits puts on the design team's to do list, what the style guide's Tasks page lists.
export function designA11yGaps({ props = {}, structure = {}, vars = null, cfg = {}, only = null } = {}) {
  const surfaces = vars ? systemSurfaces(vars, cfg.a11y?.surfaces ?? null) : {};
  return [...designA11yFindings(props, structure, { only, vars, surfaces }),
    ...(vars ? designContrastFindings(vars, structure, { authored: cfg.a11y?.tokenPairs ?? [], derive: cfg.a11y?.derivePairs !== false, boundaries: cfg.a11y?.nonTextPairs === true, surfaces, only }) : [])];
}

// The WCAG criterion each kind is about, as the style guide labels it.
export const DESIGN_A11Y_WCAG = { nofocus: 'WCAG 2.4.7 Focus Visible (AA)', focuscontrast: 'WCAG 1.4.11 Non-text Contrast (AA)', colouronly: 'WCAG 1.4.1 Use of Color (A)',
  small: 'WCAG 2.5.8 Target Size (Minimum) (AA)', norole: 'WCAG 4.1.2 Name, Role, Value (A)', noname: 'WCAG 4.1.2 Name, Role, Value (A)', contrast: 'WCAG 1.4.3 Contrast (Minimum) (AA)' };
export const wcagOf = (f) => (f.kind === 'contrast' && f.large ? 'WCAG 1.4.11 Non-text Contrast (AA)' : DESIGN_A11Y_WCAG[f.kind] ?? null);

// The lines the build sheet adds for one component: what to write meanwhile, what to leave to the person.
export function designA11ySheetLines(findings, name) {
  const mine = findings.filter((f) => norm(f.component) === norm(name));
  const lines = [];
  if (mine.some((f) => f.kind === 'nofocus')) lines.push('a visible focus ring on :focus-visible (an outline at least 3:1 against what is behind it; a frame around a borderless input may carry it): Figma has no focus state, so tell the person it is yours until the design has one');
  if (mine.some((f) => f.kind === 'colouronly')) lines.push('its error state needs a message linked with aria-describedby, and Figma has none: write aria-invalid="true", and tell the person the design owes the message; never invent its words');
  if (mine.some((f) => f.kind === 'small')) lines.push('a hit area of at least 24×24 (padding counts), or tell the person it needs 24px of space around it');
  if (mine.some((f) => f.kind === 'noname')) lines.push('an accessible name (aria-label) for a control that shows no words: Figma has no note naming it, so ask the person for its words; never invent them');
  return lines;
}

// The block the audit prints. [] when nothing is found. At most `max` colour pairs are listed; the rest are counted.
export function designA11yBlock(findings, { max = 10, unmeasured = [] } = {}) {
  const left = unmeasured.length ? [`   ℹ️  ${unmeasured.length} text and icon colour${unmeasured.length === 1 ? '' : 's'} (${[...new Set(unmeasured.map((u) => u.component))].slice(0, 6).join(', ')}${new Set(unmeasured.map((u) => u.component)).size > 6 ? ', …' : ''}) ${unmeasured.length === 1 ? 'sits' : 'sit'} on nothing their own component paints, and no surface is known to measure ${unmeasured.length === 1 ? 'it' : 'them'} against, so ${unmeasured.length === 1 ? 'it was' : 'they were'} not measured: name the page's surfaces in ds-config.json (a11y.surfaces)`] : [];
  if (!findings.length) return left.length ? ['♿ Accessibility in the Figma file: nothing the design owes was found, but not everything was measured:', ...left] : [];
  const nofocus = findings.filter((f) => f.kind === 'nofocus').map((f) => f.component);
  const pairs = findings.filter((f) => f.kind === 'contrast');
  const rest = findings.filter((f) => f.kind !== 'nofocus' && f.kind !== 'contrast');
  return [`♿ Accessibility in the Figma file: ${findings.length} thing${findings.length === 1 ? '' : 's'} the design owes (for whoever keeps the Figma file; the parity never changes Figma):`,
    ...(nofocus.length ? [`   • ${nofocus.join(', ')} ${nofocus.length === 1 ? 'has' : 'have'} no focus state in Figma, so the code invents the focus ring and no one designs it: add a focus state (a visible ring, at least 3:1 against what is behind it)`] : []),
    ...rest.map((f) => `   • ${f.text}: ${f.fix}`),
    ...pairs.slice(0, max).map((f) => `   • ${f.component ? `${f.component}: ` : ''}${f.text}: ${f.fix}`),
    ...(pairs.length > max ? [`   • and ${pairs.length - max} more colour pair${pairs.length - max === 1 ? '' : 's'} under their contrast`] : []),
    ...left,
    `   rms-design-system-engine --figma-edits puts each on the design team's to do list in Figma, written only after a yes.`];
}
