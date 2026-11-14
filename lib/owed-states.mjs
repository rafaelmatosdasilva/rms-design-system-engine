// owed-states.mjs - the states a component owes, as its intent-layer page names them, against what Figma and the code have.
//
// A component that documents only its ideal state is incomplete. A page of the intent layer names the states the
// component must have (front matter `states: [error, loading, read-only]`, or a DSDS entity's metadata.states), in the
// team's own words. Each one is looked for on both sides, by its concept (state-concepts.mjs):
//   Figma: a value of a variant property (State=Loading) or a boolean property that is on for it (isReadOnly), read as
//          the project declares its states (ds-config.json → states) or by their names.
//   code:  a prop named for it (loading, readOnly, disabled), a value a prop takes (status: 'error'), or a rule or
//          attribute its own code reacts to (:disabled, [aria-busy], .is-loading, a BEM modifier card--loading).
// A state the team names that is none of the known concepts ("empty", "expanded") is looked for by its own name.
// The engine reads the component, not a word anywhere in its file: a side it is not sure of is said to lack the state,
// with what was looked at, never given one it may not have. A side the engine has no reading of (no Figma component,
// no code capture) says nothing. Pure: the audit reads the snapshots and prints the lines.
import { conceptOf, conceptOfName } from './state-concepts.mjs';

const norm = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
const strip = (k) => String(k).split('#')[0];
const kebab = (s) => String(s ?? '').trim().replace(/([a-z0-9])([A-Z])/g, '$1-$2').replace(/[\s_]+/g, '-').toLowerCase();
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// The states a page names, in its own words, once each: a list, or one line of them ("error, loading").
// raw: front matter's states, or a DSDS metadata.states (strings, or { name } each). → [string]
export function owedStatesOf(raw) {
  const items = (Array.isArray(raw) ? raw : raw == null ? [] : [raw])
    .flatMap((x) => (x && typeof x === 'object' ? [x.name ?? x.state ?? x.label] : String(x).split(',')))
    .map((x) => String(x ?? '').trim()).filter(Boolean);
  const seen = new Set();
  return items.filter((x) => { const k = norm(x); if (!k || seen.has(k)) return false; seen.add(k); return true; });
}

// What a component's own code says of a state: its rules and attributes, each concept by what a browser or a reader
// of the markup takes for it. A name of the team's own is looked for as a class of its own (.is-empty, card--empty).
const CODE_MARKS = {
  disabled: /:disabled\b|\[disabled\]|aria-disabled|\bis-disabled(?![\w-])|[A-Za-z0-9_]--disabled(?![\w-])/,
  readonly: /:read-only\b|\[readonly\]|aria-readonly|\bis-read-?only(?![\w-])|[A-Za-z0-9_]--read-?only(?![\w-])/,
  loading: /aria-busy|\bis-(loading|busy)(?![\w-])|[A-Za-z0-9_]--(loading|busy)(?![\w-])/,
  error: /aria-invalid|:invalid\b|:user-invalid\b|\bis-(error|invalid)(?![\w-])|[A-Za-z0-9_]--(error|invalid)(?![\w-])/,
  success: /:valid\b|:user-valid\b|\bis-(success|valid)(?![\w-])|[A-Za-z0-9_]--(success|valid)(?![\w-])/,
  selected: /aria-selected|aria-checked|:checked\b|\bis-(selected|checked)(?![\w-])|[A-Za-z0-9_]--(selected|checked)(?![\w-])/,
  focus: /:focus(-visible|-within)?\b/,
  active: /:active\b|aria-pressed|\bis-pressed(?![\w-])/,
  hover: /:hover\b/,
};
const ownMark = (word) => { const k = esc(kebab(word)); return new RegExp(`\\bis-${k}(?![\\w-])|[A-Za-z0-9_]--${k}(?![\\w-])|aria-${k}\\b`); };
// A file's code without its comments: a word only a comment writes is not something the component does.
const uncommented = (t) => String(t ?? '').replace(/<!--[\s\S]*?-->/g, ' ').replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:'"`\\])\/\/[^\n]*/g, '$1');

// Whether a name (a prop's, a property's) is the owed state when it is on: its concept, or the same words (empty,
// isEmpty for "empty"). read: how a label is read (Figma's with the project's declared states).
const isNamed = (concept, word, name, read) => (concept ? read(`${name}=true`) === concept : false) || [norm(word), 'is' + norm(word)].includes(norm(name));
// Whether a value a prop takes is the owed state: its concept, or the same words (State=Empty for "empty").
const isValue = (concept, word, name, value, read) => (concept ? read(`${name}=${value}`) === concept : false) || norm(value) === norm(word);
const TRUE_VALUE = /^(true|yes|on)$/i, FALSE_VALUE = /^(false|no|off)$/i;

// Figma's side. properties: the props snapshot's properties of the component ({ 'State': { type, variantOptions } }).
// → { has, by: [what holds it], looked: [what was read] }
export function figmaHas(state, properties, cfg = {}) {
  const concept = conceptOfName(state), read = (l) => conceptOf(l, cfg);
  const by = [], looked = [];
  for (const [k, def] of Object.entries(properties ?? {})) {
    const name = strip(k), type = String(def?.type ?? '').toUpperCase();
    if (type === 'VARIANT' && Array.isArray(def.variantOptions)) {
      looked.push(`${name} (${def.variantOptions.join(', ')})`);
      for (const opt of def.variantOptions.map(String)) {
        if (FALSE_VALUE.test(opt)) continue;
        // A true/false variant is the state when its name is (Disabled=True), never by the word true.
        if (TRUE_VALUE.test(opt) ? isNamed(concept, state, name, read) : isValue(concept, state, name, opt, read)) by.push(`${name}=${opt}`);
      }
    } else if (type === 'BOOLEAN') {
      looked.push(name);
      if (isNamed(concept, state, name, read)) by.push(name);
    }
  }
  return { has: by.length > 0, by, looked };
}

// The code's side. props: the code capture's props ({ loading: { type, options } }) · text: its own file · states: the
// contract's states the code gives (from: 'code'). → { has, by, looked }
export function codeHas(state, { props = {}, text = '', states = [] } = {}) {
  // The project's declared states name Figma's props: the code's are read by their names.
  const concept = conceptOfName(state), read = (l) => conceptOf(l);
  const by = [], looked = [];
  for (const [p, d] of Object.entries(props ?? {})) {
    looked.push(p);
    const options = Array.isArray(d?.options) ? d.options.map(String) : [];
    // A prop named for it (loading, isReadOnly), read as on: what it means when it is set.
    if (isNamed(concept, state, p, read)) { by.push(p); continue; }
    for (const o of options) if (!FALSE_VALUE.test(o) && isValue(concept, state, p, o, read)) { by.push(`${p}="${o}"`); break; }
  }
  for (const s of states ?? []) {
    const n = String(s?.name ?? s ?? '');
    if (n && (s?.from ?? 'code') === 'code' && ((concept && conceptOfName(n) === concept) || norm(n) === norm(state))) by.push(n);
  }
  const code = uncommented(text);
  const marks = [concept && CODE_MARKS[concept], ownMark(state)].filter(Boolean);
  if (code) looked.push('its own rules and markup');
  for (const re of marks) { const m = re.exec(code); if (m) { by.push(m[0].replace(/^[A-Za-z0-9_](?=--)/, '')); break; } }
  return { has: by.length > 0, by: [...new Set(by)], looked };
}

// Each state a component owes, on both sides. owed: the page's states · figma: its Figma properties, or null when the
// engine has no reading of it in Figma · code: { props, text, states }, or null when it has none of the code.
// → [{ state, concept, figma: { has, by, looked } | null, code: { has, by, looked } | null }]
export function owedStates(owed = [], { figma = null, code = null, cfg = {} } = {}) {
  return owedStatesOf(owed).map((state) => ({
    state, concept: conceptOfName(state),
    figma: figma ? figmaHas(state, figma, cfg) : null,
    code: code ? codeHas(state, code) : null,
  }));
}

// The team's word, as a sentence carries it: "Loading" reads loading, "OTP sent" stays as written.
const said = (w) => (/^[A-Z][a-z]/.test(w) && w.slice(1) === w.slice(1).toLowerCase() ? w.charAt(0).toLowerCase() + w.slice(1) : w);
const a = (w) => (/^[aeiou]/i.test(w) ? 'an' : 'a');
const SIDE = { figma: 'Figma', code: 'the code' };

// One finding for each owed state a side lacks. → [{ component, side: 'figma'|'code', state, text, looked }]
export function owedFindings(component, rows = []) {
  const out = [];
  for (const r of rows) for (const side of ['figma', 'code']) {
    const s = r[side];
    if (!s || s.has) continue;
    const w = said(r.state);
    const looked = s.looked.length ? ` Looked at ${side === 'figma' ? 'its properties' : 'its props'}: ${s.looked.slice(0, 6).join(' · ')}${s.looked.length > 6 ? ` · ${s.looked.length - 6} more` : ''}.` : side === 'figma' ? ' It has no properties.' : ' It has no props.';
    out.push({ component, side, state: r.state, text: `The intent layer says ${component} owes ${a(w)} ${w} state, and ${SIDE[side]} has none.`, looked: looked.trim() });
  }
  return out;
}

// Every component a page names states for. pages: Map(component → its page entity, which carries states) · figmaProps:
// the props snapshot ({ name: { properties } }) · codeOf(name): { props, text, states } or null. → [finding]
export function owedAcross(pages, { figmaProps = {}, codeOf = () => null, cfg = {} } = {}) {
  const out = [];
  for (const [name, e] of pages ?? []) {
    const owed = owedStatesOf(e?.states);
    if (!owed.length) continue;
    const fig = figmaProps?.[name]?.properties ?? null;
    out.push(...owedFindings(name, owedStates(owed, { figma: fig, code: codeOf(name), cfg })));
  }
  return out;
}

// What the audit prints: a heading, then one line a finding, led by its component, so the differences list, the
// style guide and the issues carry each to the side that lacks the state (run-diff.mjs → plainAction).
export const OWED_HEADING = 'States the intent layer owes';
export function owedLines(findings = []) {
  if (!findings.length) return [];
  const n = (s) => findings.filter((f) => f.side === s).length;
  const parts = [n('figma') && `${n('figma')} missing in Figma`, n('code') && `${n('code')} missing in the code`].filter(Boolean).join(' and ');
  return [`⚠️  ${OWED_HEADING}: ${parts}`, ...findings.map((f) => `     ${f.component}: ${f.text} ${f.looked}`),
    '   Advisory: each page of the intent layer names the states its component must have, and each side should have every one of them.'];
}
