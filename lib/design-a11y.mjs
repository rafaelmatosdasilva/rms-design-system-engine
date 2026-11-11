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

const INTERACTIVE = /^(control|button|togglebutton|toggle|iconbutton|checkbox|radio|radiogroup|switch|tab|link|textbox|textfield|textinput|input|searchbox|combobox|select|spinbutton|stepper|slider|disclosure|accordion|menuitem|option)$/;
const TAKES_INPUT = /^(textbox|textfield|textinput|input|searchbox|combobox|select|spinbutton|stepper|checkbox|radio|radiogroup|switch|slider)$/;
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
  dropdown: 'combobox', combobox: 'combobox', slider: 'slider', stepper: 'spinbutton', menuitem: 'menuitem', accordion: 'disclosure', disclosure: 'disclosure',
  segmentedcontrol: 'radiogroup', segmentedbutton: 'radiogroup', searchbar: 'searchbox', sorting: 'button', sort: 'button' };
// A row of a list that opens to pick from is what is picked (dropdownPickerRow → option, menuRow → menuitem).
const PICKS_FROM = { dropdown: 'option', select: 'option', combobox: 'option', listbox: 'option', picker: 'option', menu: 'menuitem' };
const PICKED = /^(row|item|option)$/;
// A name that ends on a group or a part of controls names that, not a control (checkboxStack, linkListLabel); a chip or
// a tag of one is the chip's (dropdownTagChip).
const NOT_A_CONTROL = /^(group|groups|list|lists|bar|label|labels|set|stack|container|wrapper|panel|header|footer|section|area|text|helper|hint|message|badge|indicator|counter|divider|background|icon|state|row|rows|item|items|option|options|cell|cells|chip|chips|tag|tags|pill|pills)$/;
export function nameRole(name) {
  // A name in a path (nav/TabCompact): its last part names the component, the ones before it its folder.
  const parts = String(name ?? '').split('/').map((x) => x.trim()).filter(Boolean);
  if (parts.length > 1) { const own = nameRole(parts[parts.length - 1]); if (own) return own; }
  const words = String(name ?? '').replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  if (!words.length) return null;
  if (words.length > 1 && PICKED.test(words[words.length - 1])) for (const k of [words.slice(0, 2).join(''), words[0]]) if (Object.hasOwn(PICKS_FROM, k)) return PICKS_FROM[k];
  for (const k of [words.join(''), words.slice(-2).join(''), words[words.length - 1]]) if (Object.hasOwn(NAME_ROLE, k)) return NAME_ROLE[k];
  // A system that names the type first and the kind after it (buttonBold, tabUnderline, fieldPlain).
  if (words.length > 1 && !NOT_A_CONTROL.test(words[words.length - 1])) for (const k of [words.slice(0, 2).join(''), words[0]]) if (Object.hasOwn(NAME_ROLE, k)) return NAME_ROLE[k];
  return null;
}

// What the browser measured on a component's code, by its Figma name: the whole name or its last part (nav/TabCompact
// is TabCompact in the code), without case or separators, where the control it read is the component itself (a11y-facts
// own; facts saved before that was said are not used). → (name) → { focusable, role, named } | null
function codeFacts(measured) {
  const by = new Map();
  // Every measured component that says whether the control it read is itself (own): a modal's facts are its first
  // button's (own false), and a fact saved before own was said is not used.
  for (const [n, f] of Object.entries(measured ?? {})) if (f && typeof f === 'object' && !n.startsWith('_') && typeof f.own === 'boolean') by.set(norm(n), f);
  if (!by.size) return () => null;
  return (name) => {
    const f = by.get(norm(name)) ?? by.get(norm(String(name).split('/').pop()));
    if (!f) return null;
    const role = f.role ? norm(f.role) : null;
    return { focusable: !!f.focusable, role: role ?? 'control', named: !!role, own: f.own };
  };
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
// surface (surface/…, background/…, canvas/…, a /surface/ in the middle, or an app's own background: appBackground,
// page-background), never a text colour or a line.
// vars: the variables snapshot. → { <mode>: [{ token, value }] }
export function systemSurfaces(vars = {}, named = null) {
  const out = {};
  for (const [m, toks] of Object.entries(vars?.color ?? {})) {
    out[m] = Object.entries(toks ?? {}).filter(([t]) => (Array.isArray(named) && named.length ? named.includes(t) || named.includes(t.replace(/\/color$/, ''))
      : (/^(surface|surfaces|background|backgrounds|bg|canvas|page)(\/|$)/i.test(t) || /\/surface\//i.test(t) || /(^|\/)(app|page|screen|canvas)[-_ ]?background(\/|$)/i.test(t)) && !FOREGROUND.test(t) && !/(^|\/)(border|stroke|outline|divider|separator|shadow|focus|ring|disabled)(\/|$)/i.test(t)))
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

// Whether a component is a control, and its role: the role Figma's note gives it; else what the browser measured on the
// code, when Tab reaches it there or it has a control's role (actionList is a list by its name, and a button the code
// makes it); else what its name says. A measurement that found no tab stop says nothing: it may have tried a disabled
// variant, or the control sits inside the element it read. code: codeFacts(measured). → { said, built, guessed, role } | null
// What the code measured holds a button or a link at an element inside it, not at its own.
const heldButton = (read) => !!read?.named && read.own === false && /^(button|link)$/.test(read.role);
const PART = /^(label|labels|text|helper|hint|message|badge|indicator|counter|divider|background|icon|header|footer|container|wrapper|panel|section|area|row|rows)$/;
const CONTAINER_FIRST = /^(modal|dialog|drawer|sheet|popover|card|panel|toolbar|banner|toast) /;
function controlOf(name, entry, code) {
  if (/spacer|placeholder/i.test(name)) return null;   // it keeps a place, nobody operates it
  const said = annotatedRole(entry), read = said ? null : code(name);
  const built = read?.own && (read.focusable || INTERACTIVE.test(read.role)) ? read : null;
  let guessed = said || built ? null : nameRole(name);
  // A name that starts with a container and ends on a control names the container (dialogLink is a dialog with a link,
  // not a link): the code cannot say it, since a button's own wrapper holds a button just as a dialog does.
  if (guessed && CONTAINER_FIRST.test(nameWords(name))) guessed = null;
  // A name that says an input, on a component whose code holds a button or a link (an element inside it, not its own),
  // names what it shows, not what it is: a value shown read-only beside its reveal button.
  if (guessed && EDGED.test(guessed) && heldButton(read) && !OUTRIGHT.test(nameWords(name))) guessed = null;
  // A word that names other things too (a stepper of steps) counts only when the code confirms it with the role it
  // measured.
  if (guessed && !built && AMBIGUOUS.test(nameWords(name)) && !OUTRIGHT.test(nameWords(name)) && !(read?.named && read.role === guessed)) guessed = null;
  const role = said ?? (built ? built.role : guessed);
  if (role && (built || INTERACTIVE.test(role))) return { said, built, guessed, role };
  // Last, its states: a component drawn hovered, pressed, focused or disabled is something a person operates (a menu
  // entry, a card that opens): only a control is disabled. Not one whose name ends on a part or a group of controls (a row's
  // background), nor one a note or the code says otherwise.
  if (said || built) return null;
  const words = Object.entries(entry?.properties ?? {}).filter(([, d]) => d?.type === 'VARIANT').flatMap(([k, d]) => [k, ...(d.variantOptions ?? [])]).join(' ');
  const last = String(name).split('/').pop().replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean).pop();
  return /hover|press|focus|disabl/i.test(words) && !PART.test(last ?? '') ? { said: null, built: null, guessed: 'control', role: 'control', byStates: true } : null;
}

// props: the component-props snapshot · structure: the structure snapshot's components · vars: the variables snapshot
// (its colours by mode, for the focus ring) · surfaces: systemSurfaces · measured: a11y-facts.json's components, what
// the browser measured on the code (contract-a11y.mjs). → [{ component, kind, text, fix }]
export function designA11yFindings(props = {}, structure = {}, { only = null, vars = null, surfaces = null, measured = null } = {}) {
  const keep = only?.length ? new Set(only.map(norm)) : null;
  const under = surfaces ?? (vars ? systemSurfaces(vars) : {});
  const code = codeFacts(measured);
  const out = [];
  for (const [name, entry] of Object.entries(props ?? {})) {
    if (name.startsWith('_') || !entry || typeof entry !== 'object' || (keep && !keep.has(norm(name)))) continue;
    const ctl = controlOf(name, entry, code);
    if (!ctl) continue;
    const { said, built, guessed, role, byStates } = ctl;
    const s = structure?.[name] ?? null;
    if (guessed || built) {
      const why = built ? `the code makes it ${built.named ? (/^[aeiou]/.test(role) ? 'an ' : 'a ') + role : 'something Tab reaches'}`
        : byStates ? 'its hovered, pressed or disabled states say a person operates it' : `its name says ${/^[aeiou]/.test(guessed) ? 'an' : 'a'} ${guessed}`;
      out.push({ component: name, kind: 'norole', role, text: `${name} has no role note in Figma: ${why}, and ${built ? 'nothing in Figma says so' : 'nothing tells the code which role to give it'} (WCAG 4.1.2)`,
        fix: (built && !built.named) || byStates ? 'add a "Role:" annotation with the role it has' : `add the annotation "Role: ${role}" (or the role it really has)` });
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

// A control's edge in Figma (WCAG 1.4.11): a field, a checkbox, a radio, a switch or a slider is found by its edge, not
// its words, so in each variant not disabled at least one of the layers that can show it (the structure's edges, from
// paintFacts) has its fill or its border 3:1 or more against what is painted under it, in every mode. On nothing of its
// own component, it is held against every surface the system defines; with none known it is not measured. A control
// with words of its own (a button, a chip) needs no edge, and its words and icons are the text check's. The control is
// one by its role note, the code the browser measured or its name: any of them saying it takes input is enough (a
// checkbox the code made a button is still a box to find).
// Words that name an input and something else as well: a toggle (a button or a switch), a stepper (of steps or of a
// number).
const AMBIGUOUS = /(^| )(toggle|stepper)( |$)/;
// Words that name an input outright, whatever else the name holds (switchToggle is a switch).
const OUTRIGHT = /(^| )(checkbox|radio|switch|slider|input|text field|search field|search bar|text area|textarea|dropdown|drop down|select|combobox)( |$)/;
const nameWords = (name) => String(String(name ?? '').split('/').pop()).replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase();
const EDGED = /^(textbox|textfield|textinput|input|searchbox|combobox|select|spinbutton|stepper|checkbox|radio|switch|slider)$/;
// props · structure · vars · surfaces · measured: as for designA11yFindings. → [{ component, kind: 'boundary' (the browser check's name for it), ratio, modes, variant, text, fix }]
export function edgeFindings(props = {}, structure = {}, { vars = null, surfaces = null, measured = null, only = null } = {}) {
  const modes = Object.keys(vars?.color ?? {});
  if (!modes.length) return [];
  const keep = only?.length ? new Set(only.map(norm)) : null;
  const under = surfaces ?? systemSurfaces(vars);
  const code = codeFacts(measured);
  const colour = (m, c) => (String(c).startsWith('#') ? c : valueIn(vars, m, c));
  const tinted = (c, o) => { const p = parseColor(c); return p && o < 1 ? `rgba(${p[0]}, ${p[1]}, ${p[2]}, ${(p[3] ?? 1) * o})` : c; };
  const out = [];
  for (const [name, s] of Object.entries(structure ?? {})) {
    if (name.startsWith('_') || !Array.isArray(s?.edges) || (keep && !keep.has(norm(name)))) continue;
    const entry = props?.[name] ?? {};
    // A word that names an input outright (checkbox, radio, switch, slider, textField, dropdown) holds whatever role the
    // code gives it: a checkbox the code made a button is still a box to find. One that names other things too (a toggle
    // button, a field shown read-only, a stepper of steps) counts only when the code confirms an input role.
    const said = annotatedRole(entry), built = code(name);
    const byName = nameRole(name), words = nameWords(name), loose = byName && AMBIGUOUS.test(words) && !OUTRIGHT.test(words);
    const roles = [said, built?.named ? built.role : null, (loose && !(built && EDGED.test(built.role))) || (byName && EDGED.test(byName) && heldButton(built) && !OUTRIGHT.test(words)) ? null : byName].filter(Boolean);
    if (!roles.some((r) => EDGED.test(r))) continue;
    let worst = null;
    const failed = new Set();
    for (const g of s.edges) {
      for (const m of modes) {
        // The variant's best edge in this mode: each layer's fill or border on what is under it, the worst surface when
        // nothing of its own is. null when nothing could be measured.
        let best = null;
        for (const e of g.list ?? []) {
          const backs = e.on === 'surface' ? (under[m] ?? []).map((x) => x.value) : e.on === 'unbound' ? [] : [colour(m, e.on)];
          if (!backs.length || backs.some((b) => !parseColor(b))) continue;
          let r = 0;
          for (const c of [e.fill, e.stroke]) if (c && parseColor(colour(m, c))) r = Math.max(r, Math.min(...backs.map((b) => seen(tinted(colour(m, c), e.o ?? 1), b) ?? 0)));
          if (best == null || r > best) best = r;
        }
        if (best == null || best >= 3) continue;
        failed.add(m);
        if (!worst || best < worst.ratio) worst = { ratio: best, variant: g.variant ?? g.variants?.[0] };
      }
    }
    if (!worst) continue;
    worst.modes = modes.filter((m) => failed.has(m));
    const where = inModes(worst.modes, modes);
    out.push({ component: name, kind: 'boundary', ratio: worst.ratio, modes: worst.modes, variant: worst.variant,
      text: `${name}'s edge is ${worst.ratio}:1 against what is behind it${where ? ` ${where}` : ''} (${worst.variant}), under 3:1, so the control is hard to find (WCAG 1.4.11)`,
      fix: 'give its box or its border a colour at least 3:1 against what it sits on, in every mode' });
  }
  return out;
}

// Reading order in Figma (WCAG 1.3.2): where layers are placed by hand (the capture records where each one that can be
// read sits, beside the trees: looks[<variant>][<place>].at), the layers that carry words come in the layer order an
// agent or a developer builds the code in. One seen before a layer that comes ahead of it reads out of order. Artwork is
// never read; a frame in auto layout draws in layer order, so it is never out of order. Once a component.
// skeleton: the skeleton snapshot. → [{ component, kind: 'readorder', text, fix }]
export function readingOrderFindings(skeleton = {}, { only = null } = {}) {
  const keep = only?.length ? new Set(only.map(norm)) : null;
  const words = (t) => !!t && !t.hidden && (t.t === 'TEXT' || (t.t !== 'INSTANCE' && (t.c ?? []).some(words)));
  const out = [];
  for (const [component, sk] of Object.entries(skeleton ?? {})) {
    if (component.startsWith('_') || !sk?.trees || (keep && !keep.has(norm(component)))) continue;
    let found = null;
    for (const [vn, ti] of sk.variants ?? []) {
      const looks = sk.looks?.[vn] ?? {};
      const walk = (t, path) => {
        if (found || !t) return;
        const kids = (t.c ?? []).map((k, i) => ({ k, place: path ? `${path}.${i}` : String(i) })).filter(({ k, place }) => words(k) && looks[place]?.at);
        for (let i = 1; i < kids.length && !found; i++) {
          const [ax, ay, aw, ah] = looks[kids[i - 1].place].at, [bx, by, bw, bh] = looks[kids[i].place].at;
          // Two that share neither a row nor a column (a chart's labels round a pie) have no order to be seen in.
          const row = Math.min(ay + ah, by + bh) - Math.max(ay, by) > Math.min(ah, bh) / 2, column = Math.min(ax + aw, bx + bw) - Math.max(ax, bx) > 0;
          if (row ? bx + bw <= ax + 4 : column && by + bh <= ay + 1) found = { variant: vn, first: kids[i - 1].k.n, then: kids[i].k.n };
        }
        (t.c ?? []).forEach((k, i) => walk(k, path ? `${path}.${i}` : String(i)));
      };
      walk(sk.trees?.[ti], '');
      if (found) break;
    }
    if (found) out.push({ component, kind: 'readorder', text: `${component}: "${found.then}" is seen before "${found.first}" but comes after it in the layers (${found.variant}), so the code built from them reads in another order than it is seen (WCAG 1.3.2)`,
      fix: 'order the layers as they are seen, or lay the frame out with auto layout' });
  }
  return out;
}

// Everything the Figma file owes, from the snapshots and ds-config.json's a11y settings: what the audit prints, what
// --figma-edits puts on the design team's to do list, what the style guide's Tasks page lists.
export function designA11yGaps({ props = {}, structure = {}, vars = null, cfg = {}, only = null, skeleton = null, measured = null } = {}) {
  const surfaces = vars ? systemSurfaces(vars, cfg.a11y?.surfaces ?? null) : {};
  return [...designA11yFindings(props, structure, { only, vars, surfaces, measured }), ...(vars ? edgeFindings(props, structure, { vars, surfaces, measured, only }) : []), ...(skeleton ? readingOrderFindings(skeleton, { only }) : []),
    ...adviceFindings(props, skeleton ?? {}, { measured, only }),
    ...(vars ? designContrastFindings(vars, structure, { authored: cfg.a11y?.tokenPairs ?? [], derive: cfg.a11y?.derivePairs !== false, boundaries: cfg.a11y?.nonTextPairs === true, surfaces, only }) : [])];
}

// Advice for whoever keeps the Figma file, apart from WCAG's failures: what the code needs to be told and Figma does not
// say. Each kind is marked advice: true, and has no WCAG criterion of its own.
//   imagenote    a layer that paints an image with no note: the code is never told its alt text, or that it is decorative
//   disablednote a disabled variant with no note and no helper or tooltip text: nobody is told why it is disabled
//   states       a control with no hover, pressed or disabled state (and no error, for one that takes input); focus
//                has its own finding (nofocus)
//   a11ynote     a control with no note at all and no accessibility words in its description: role, keyboard and
//                screen reader are left to the code to guess
// props · skeleton: the snapshots · measured: a11y-facts.json's components. → [{ component, kind, advice, text, fix }]
const A11Y_WORDS = /aria|accessib|a11y|screen.?reader|keyboard|role|tab.?order/i;
// What one component's skeleton says: its images with no note, by their path, and its disabled variants that say
// nowhere why (no note on the variant, no helper or tooltip text). Self-contained, so the same code runs in Figma.
export function skeletonAdvice(sk) {
  const axes = (v) => Object.fromEntries(String(v).split(',').map((x) => x.split('=').map((y) => y.trim())).filter((x) => x.length === 2 && x[0]));
  const images = new Set(), quiet = [];
  for (const [vn, ti] of sk?.variants ?? []) {
    const looks = sk.looks?.[vn] ?? {}, tree = sk.trees?.[ti];
    // A layer hidden with no property to show it is never drawn; one a property shows is drawn whenever it is on.
    const drawn = (t) => !!t && (!t.hidden || !!t.wired?.visible);
    const walk = (t, place, path) => {
      if (!drawn(t)) return;
      if (t.img && !looks[place]?.notes) images.add(path || t.n);
      if (t.t === 'INSTANCE') return;   // what an instance holds is its own component's
      (t.c ?? []).forEach((k, i) => walk(k, place ? `${place}.${i}` : String(i), path ? `${path}/${k.n}` : k.n));
    };
    walk(tree, '', '');
    // A helper or tooltip text, or an instance of one (a nested helper component says it too).
    const why = /helper|hint|tooltip|reason/i;
    const told = (t) => !drawn(t) ? false : (t.t === 'TEXT' && why.test(t.n)) || (t.t === 'INSTANCE' ? why.test(t.n) || why.test(t.of?.name ?? '') : (t.c ?? []).some(told));
    const off = Object.entries(axes(vn)).some(([k, v]) => (/disabl/i.test(k) && /^true$/i.test(v)) || /disabled/i.test(v));   // lockedDisabled too
    if (off && !looks['']?.notes && !told(tree)) quiet.push(vn);
  }
  return { images, quiet };
}
export function adviceFindings(props = {}, skeleton = {}, { measured = null, only = null } = {}) {
  const keep = only?.length ? new Set(only.map(norm)) : null;
  const code = codeFacts(measured);
  const out = [];
  const push = (component, kind, text, fix) => out.push({ component, kind, advice: true, text, fix });
  const list = (xs) => xs.length > 3 ? `${xs.slice(0, 3).join(', ')} and ${xs.length - 3} more` : xs.join(', ');
  for (const [name, sk] of Object.entries(skeleton ?? {})) {
    if (name.startsWith('_') || !sk?.trees || (keep && !keep.has(norm(name)))) continue;
    const { images, quiet } = skeletonAdvice(sk);
    if (images.size) push(name, 'imagenote', `${name}: ${images.size === 1 ? 'an image has' : `${images.size} images have`} no note (${list([...images])}), so the code is never told what it says, or that it is decorative`, 'add a note on each image with its alt text, or that it is decorative');
    if (quiet.length) push(name, 'disablednote', `${name}: ${quiet.length === 1 ? 'its disabled variant says' : `${quiet.length} disabled variants say`} nowhere why it is disabled (${list(quiet)})`, 'add a helper or tooltip text, or a note, saying why it is disabled and what enables it');
  }
  for (const [name, entry] of Object.entries(props ?? {})) {
    if (name.startsWith('_') || !entry || typeof entry !== 'object' || (keep && !keep.has(norm(name)))) continue;
    const ctl = controlOf(name, entry, code);
    if (!ctl) continue;
    const defs = Object.entries(entry.properties ?? {});
    const words = defs.filter(([, d]) => d.type === 'VARIANT').flatMap(([k, d]) => [k, ...(d.variantOptions ?? [])]).join(' ').toLowerCase();
    const need = [['hover', /hover/], ['pressed', /press|active/], ['disabled', /disabl|inactive/], ...(EDGED.test(ctl.role) ? [['error', /error|invalid/]] : [])];
    const missing = need.filter(([, r]) => !r.test(words)).map(([k]) => k);
    if (missing.length) push(name, 'states', `${name} has no ${missing.join(', ')} state in Figma, so the code draws ${missing.length === 1 ? 'it' : 'them'} without a design`, `add the ${missing.join(', ')} state${missing.length === 1 ? '' : 's'}, or say in a note that the control has none`);
    const noted = (entry.annotations ?? []).length || (entry.layerAnnotations ?? []).some((l) => (l?.annotations ?? []).length) || A11Y_WORDS.test(String(entry.description ?? ''));
    if (!noted) push(name, 'a11ynote', `${name} has no note in Figma and its description says nothing of its accessibility: its role, its keyboard and what a screen reader says are left to the code`, 'add notes for its role, its name and the keys it answers');
  }
  return out;
}

// The WCAG criterion each kind is about, as the style guide labels it.
export const DESIGN_A11Y_WCAG = { nofocus: 'WCAG 2.4.7 Focus Visible (AA)', focuscontrast: 'WCAG 1.4.11 Non-text Contrast (AA)', boundary: 'WCAG 1.4.11 Non-text Contrast (AA)', colouronly: 'WCAG 1.4.1 Use of Color (A)', readorder: 'WCAG 1.3.2 Meaningful Sequence (A)',
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
export function designA11yBlock(all, { max = 10, unmeasured = [] } = {}) {
  // Advice is said apart, after what WCAG asks: one line a kind, with the components it is about.
  const advice = (all ?? []).filter((f) => f.advice), findings = (all ?? []).filter((f) => !f.advice);
  const ADVICE = { imagenote: 'an image with no note for its alt text', disablednote: 'a disabled variant that says nowhere why', states: 'a control with no hover, pressed, disabled or error state', a11ynote: 'a control with no accessibility note' };
  const kinds = [...new Set(advice.map((f) => f.kind))];
  const adviceLines = kinds.length ? ['   Advice, not a WCAG failure (what the code needs to be told):', ...kinds.map((k) => { const cs = advice.filter((f) => f.kind === k).map((f) => f.component); return `   • ${ADVICE[k] ?? k}: ${cs.slice(0, 8).join(', ')}${cs.length > 8 ? ` and ${cs.length - 8} more` : ''}`; })] : [];
  const left = unmeasured.length ? [`   ℹ️  ${unmeasured.length} text and icon colour${unmeasured.length === 1 ? '' : 's'} (${[...new Set(unmeasured.map((u) => u.component))].slice(0, 6).join(', ')}${new Set(unmeasured.map((u) => u.component)).size > 6 ? ', …' : ''}) ${unmeasured.length === 1 ? 'sits' : 'sit'} on nothing their own component paints, and no surface is known to measure ${unmeasured.length === 1 ? 'it' : 'them'} against, so ${unmeasured.length === 1 ? 'it was' : 'they were'} not measured: name the page's surfaces in ds-config.json (a11y.surfaces)`] : [];
  if (!findings.length) return left.length || adviceLines.length ? [`♿ Accessibility in the Figma file: nothing the design owes was found${left.length ? ', but not everything was measured' : ''}:`, ...left, ...adviceLines] : [];
  const nofocus = findings.filter((f) => f.kind === 'nofocus').map((f) => f.component);
  const pairs = findings.filter((f) => f.kind === 'contrast');
  const rest = findings.filter((f) => f.kind !== 'nofocus' && f.kind !== 'contrast');
  return [`♿ Accessibility in the Figma file: ${findings.length} thing${findings.length === 1 ? '' : 's'} the design owes (for whoever keeps the Figma file; the parity never changes Figma):`,
    ...(nofocus.length ? [`   • ${nofocus.join(', ')} ${nofocus.length === 1 ? 'has' : 'have'} no focus state in Figma, so the code invents the focus ring and no one designs it: add a focus state (a visible ring, at least 3:1 against what is behind it)`] : []),
    ...rest.map((f) => `   • ${f.text}: ${f.fix}`),
    ...pairs.slice(0, max).map((f) => `   • ${f.component ? `${f.component}: ` : ''}${f.text}: ${f.fix}`),
    ...(pairs.length > max ? [`   • and ${pairs.length - max} more colour pair${pairs.length - max === 1 ? '' : 's'} under their contrast`] : []),
    ...left,
    ...adviceLines,
    `   rms-design-system-engine --figma-edits puts each on the design team's to do list in Figma, written only after a yes.`];
}
