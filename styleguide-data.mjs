// styleguide-data.mjs - what the engine's style guide may show: only what Figma and the code agree on.
//
// A prop is shown as a control when Gate [15] matched it (component-prop-result.json, status "match"): Figma has it,
// the code accepts it under its counterpart name, with the same options and default. The control carries both
// names: Figma's as the label people read, the code's as the prop the code takes. Everything else (a prop missing on
// one side, a renamed one, a different default or option, a component not built yet, a recorded value that moved on
// one side) is not shown: it is counted in one line, and the person decides it before it appears.
//
// Pure: agreedView takes what the generator read and returns { components, notAgreed, modes }.
import { roleWord } from './role-markup.mjs';

const slug = (s) => String(s).trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
// A Figma prop name without its node suffix ("Label#3:4" → "Label").
const cleanName = (k) => String(k).replace(/#[\d:]+$/, '');

// The mode switches the page offers, from ds-config.json figma.modes (the same cssSelector forms the capture reads).
export function modeSwitches(cfg = {}) {
  const modes = cfg.figma?.modes?.length ? cfg.figma.modes : [{ name: 'Light', cssSelector: 'root' }, { name: 'Dark', cssSelector: 'dark-media' }];
  const out = [];
  for (const m of modes) {
    const sel = m.cssSelector ?? 'root';
    if (sel === 'root') out.push({ name: m.name });
    else if (sel === 'dark-media') out.push({ name: m.name, attr: 'data-color', value: 'dark' });   // the page derives [data-color] from the @media rules
    else if (sel.startsWith('data:')) { const [a, v = ''] = sel.slice(5).split('='); out.push({ name: m.name, attr: a.startsWith('data-') ? a : `data-${a}`, value: v }); }
    else if (sel.startsWith('class:')) out.push({ name: m.name, cls: sel.slice(6) });
    // other media modes (breakpoints, contrast) are not a switch on one page
  }
  return out;
}

// The class a variant option would carry in the code, only when the project's CSS has that selector.
function variantClass(cls, option, cssText) {
  if (!cls) return null;
  const c = `${cls}--${slug(option)}`;
  return new RegExp(`\\.${c}(?![\\w-])`).test(cssText) ? c : null;
}

// propsSnap: figma-component-props.snapshot.json · rows: component-prop-result.json rows · agreedRecord: the agreed
// record ({ facts }) · classFor(name) → the component's class · cssText: the project's CSS · probes: { name: markup }
// · unbuilt: names Figma has and the code does not yet.
export function agreedView({ propsSnap = {}, rows = [], agreedRecord = {}, classFor = () => null, cssText = '', probes = {}, unbuilt = [], cfg = {} } = {}) {
  const byComponent = new Map();
  for (const r of rows) { if (!byComponent.has(r.component)) byComponent.set(r.component, []); byComponent.get(r.component).push(r); }
  const components = [], waiting = [];
  let undecided = 0;
  for (const [name, entry] of Object.entries(propsSnap)) {
    if (name.startsWith('_') || !entry || typeof entry !== 'object') continue;
    const mine = byComponent.get(name) ?? [];
    if (unbuilt.includes(name) || mine.some((r) => /^\(no code file/.test(String(r.codeValue)))) { waiting.push(`${name} (not built yet)`); continue; }
    const cls = String(classFor(name) ?? '').replace(/^\./, '') || null;   // the class itself, without its dot
    const defs = Object.fromEntries(Object.entries(entry.properties ?? {}).map(([k, d]) => [cleanName(k), d]));
    const controls = [];
    for (const r of mine) {
      if (r.status !== 'match') { undecided++; continue; }   // missing, renamed, another value, or a prop only the code has
      const d = defs[r.figmaProp];
      if (!d) continue;
      const prop = /^\(|^not in code$/.test(String(r.codeProp)) || !r.codeProp ? r.figmaProp : r.codeProp;
      const control = { label: r.figmaProp, prop, type: d.type, default: d.defaultValue ?? null };
      // A True/False variant is a switch, as a boolean prop is.
      const yesNo = d.type === 'VARIANT' && (d.variantOptions ?? []).length === 2 && (d.variantOptions ?? []).every((o) => /^(true|false)$/i.test(o));
      if (d.type === 'BOOLEAN' || yesNo) {
        control.type = 'BOOLEAN';
        control.default = String(d.defaultValue).toLowerCase() === 'true';
        Object.assign(control, /^(is)?disabled$/i.test(r.figmaProp) ? { attr: 'disabled' } : { cls: variantClass(cls, r.figmaProp, cssText) });
      } else if (d.type === 'VARIANT') control.options = (d.variantOptions ?? []).map((o) => ({ label: o, cls: variantClass(cls, o, cssText) }));
      controls.push(control);
    }
    components.push({ name, cls, role: roleWord(entry.annotations), description: entry.description ?? '', probe: probes[name] ?? null, controls });
  }
  // A recorded value that moved on one side since it was agreed is not agreed any more.
  for (const f of Object.values(agreedRecord.facts ?? {})) if (f && f.figma !== undefined && f.code !== undefined && String(f.figma) !== String(f.code)) undecided++;
  const parts = [];
  if (undecided) parts.push(`${undecided} difference${undecided === 1 ? '' : 's'} between Figma and the code`);
  if (waiting.length) parts.push(`${waiting.length} component${waiting.length === 1 ? '' : 's'} not built yet (${waiting.map((w) => w.replace(/ \(not built yet\)$/, '')).join(', ')})`);
  const line = parts.length ? `Not shown until agreed, ${parts.join(' and ')}. Run the audit to see them and decide each one.` : 'Everything Figma and the code have is agreed.';
  return { components, notAgreed: { differences: undecided, waiting, line }, modes: modeSwitches(cfg) };
}
