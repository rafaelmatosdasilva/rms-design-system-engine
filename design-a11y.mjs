// design-a11y.mjs - accessibility that starts in the Figma file: what the design itself owes before any code is
// written, read from the snapshots every project has (the component props and their annotations, the structure).
//
//   • an interactive component with no focus state: code has to invent the focus ring, unseen by the designer;
//   • an error state that adds no message: an error shown by its colour alone is not read out and not seen by
//     everyone (WCAG 1.4.1, 3.3.1);
//   • an interactive component under 24px tall: easy to miss with a tremor or a finger (WCAG 2.5.8).
//
// Each is for whoever keeps the Figma file; the build sheet tells the agent what to write meanwhile (a focus ring
// on :focus-visible) and what to leave to the person (the words of an error message). Pure.

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

// props: the component-props snapshot · structure: the structure snapshot's components. → [{ component, kind, text, fix }]
export function designA11yFindings(props = {}, structure = {}, { only = null } = {}) {
  const keep = only?.length ? new Set(only.map(norm)) : null;
  const out = [];
  for (const [name, entry] of Object.entries(props ?? {})) {
    if (name.startsWith('_') || !entry || typeof entry !== 'object' || (keep && !keep.has(norm(name)))) continue;
    const role = annotatedRole(entry);
    if (!role || !INTERACTIVE.test(role)) continue;
    const defs = Object.entries(entry.properties ?? {});
    const options = defs.filter(([, d]) => d.type === 'VARIANT').flatMap(([k, d]) => (d.variantOptions ?? []).map((o) => ({ prop: clean(k), value: String(o) })));
    if (!options.some((o) => /focus/i.test(o.value) || /focus/i.test(o.prop))) {
      out.push({ component: name, kind: 'nofocus', text: `${name} has no focus state in Figma, so the code invents its focus ring and no one designs it`,
        fix: 'add a focus state (a visible ring, at least 3:1 against what is behind it)' });
    }
    const error = options.find((o) => /error|invalid/i.test(o.value));
    if (error && TAKES_INPUT.test(role)) {
      const s = structure[name] ?? {};
      const layersOf = (v) => s.variants?.[v]?.layers;
      const errKey = Object.keys(s.variants ?? {}).find((v) => new RegExp(`\\b${error.prop}=${error.value}\\b`).test(v));
      const baseKey = s.defaultVariant ?? Object.keys(s.variants ?? {}).find((v) => v !== errKey);
      const errLayers = errKey && layersOf(errKey), baseLayers = baseKey && layersOf(baseKey);
      const addsLayer = errLayers && baseLayers ? errLayers.some((l) => !baseLayers.includes(l)) : null;
      const textProp = defs.some(([k, d]) => d.type === 'TEXT' && /error|message|helper|hint|description/i.test(k));
      if (addsLayer === false || (addsLayer === null && !textProp)) {
        out.push({ component: name, kind: 'colouronly', text: `${name}'s ${error.prop}=${error.value} adds no message: the error is shown by its colour alone (WCAG 1.4.1, 3.3.1)`,
          fix: 'add an error message part to the error state (its words a text property), so the code can link it to the field' });
      }
    }
    const h = structure[name]?.h;
    if (typeof h === 'number' && h > 0 && h < 24) {
      out.push({ component: name, kind: 'small', text: `${name} is ${h}px tall: under 24px a control is easy to miss (WCAG 2.5.8)`, fix: 'make it at least 24×24, or keep 24px of space around it wherever it is used' });
    }
  }
  return out;
}

// The lines the build sheet adds for one component: what to write meanwhile, what to leave to the person.
export function designA11ySheetLines(findings, name) {
  const mine = findings.filter((f) => norm(f.component) === norm(name));
  const lines = [];
  if (mine.some((f) => f.kind === 'nofocus')) lines.push('a visible focus ring on :focus-visible (an outline at least 3:1 against what is behind it; a frame around a borderless input may carry it): Figma has no focus state, so tell the person it is yours until the design has one');
  if (mine.some((f) => f.kind === 'colouronly')) lines.push('its error state needs a message linked with aria-describedby, and Figma has none: write aria-invalid="true", and tell the person the design owes the message; never invent its words');
  if (mine.some((f) => f.kind === 'small')) lines.push('a hit area of at least 24×24 (padding counts), or tell the person it needs 24px of space around it');
  return lines;
}

// The block the audit prints. [] when nothing is found.
export function designA11yBlock(findings) {
  if (!findings.length) return [];
  const nofocus = findings.filter((f) => f.kind === 'nofocus').map((f) => f.component);
  const rest = findings.filter((f) => f.kind !== 'nofocus');
  return [`♿ Accessibility in the Figma file: ${findings.length} thing${findings.length === 1 ? '' : 's'} the design owes (for whoever keeps the Figma file; the parity never changes Figma):`,
    ...(nofocus.length ? [`   • ${nofocus.join(', ')} ${nofocus.length === 1 ? 'has' : 'have'} no focus state in Figma, so the code invents the focus ring and no one designs it: add a focus state (a visible ring, at least 3:1 against what is behind it)`] : []),
    ...rest.map((f) => `   • ${f.text}: ${f.fix}`)];
}
