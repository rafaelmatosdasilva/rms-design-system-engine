// owed-states.mjs - the states a component must have, as the team's intent layer names them, held against each side.
//
// A component documented only in its ideal state is incomplete: the field with no error, the button with no loading,
// the input with no read-only. The team's page says which states a component owes, under a title that says so
// ("Required states", "States it must have"; a plain "States" stays a fact copied from Figma or the code, never read as
// a demand). Each owed state is read as a concept (disabled, error, loading, success, read-only, selected, focus, hover,
// active, empty), and each side is asked whether it has it: Figma by its variants and its boolean properties, the code
// by its props, its markup and its styles. A state one side lacks is a finding on that side, never a silence; a line
// the engine cannot read as a state is said, never dropped.
//
//   conceptOfState(text)                 → the concept a state is said as, or null
//   owedOf(lines)                        → { owed: [concept], unread: [line] }
//   figmaStatesOf(props, cfg)            → Set of concepts, from a component's Figma properties
//   codeStatesOf({ text, css, props })   → Set of concepts, from its file, the styles that name it and its props
//   missingOwed({ owed, figma, code })   → [{ state, side: 'Figma' | 'code' }]
//
// Pure: nothing is read or written here.
import { conceptOf } from './state-concepts.mjs';

export const OWED_STATES = ['disabled', 'error', 'loading', 'success', 'readonly', 'selected', 'focus', 'hover', 'active', 'empty'];
// How a state is said: in a page, a Figma option or a prop. Order matters: "inactive" is disabled before it could be
// active, "invalid" an error before it could read as valid.
const SAID = [
  ['disabled', /\b(disabled|inactive|not available)\b/i],
  ['readonly', /\bread[- _]?only\b/i],
  ['error', /\b(error|errors|invalid|failed|failure)\b/i],
  ['loading', /\b(loading|busy|pending|in progress|spinner|skeleton)\b/i],
  ['success', /\b(success|successful|succeeded|done|completed?)\b/i],
  ['selected', /\b(selected|checked|current)\b/i],
  ['focus', /\bfocus(ed|-visible)?\b/i],
  ['hover', /\bhover(ed)?\b/i],
  ['active', /\b(active|pressed)\b/i],
  ['empty', /\b(empty|no data|zero state|nothing to show)\b/i],
];
const words = (s) => String(s ?? '').replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ');
export const conceptOfState = (text) => SAID.find(([, re]) => re.test(words(text)))?.[0] ?? null;

export function owedOf(lines = []) {
  const owed = [], unread = [];
  for (const raw of lines) {
    // A line may name several ("error and disabled"), or one with what it shows ("Loading: a spinner over the label").
    const head = String(raw).split(/[:—–]|\s-\s/)[0];
    const found = SAID.filter(([, re]) => re.test(words(head))).map(([c]) => c);
    if (!found.length) { unread.push(String(raw)); continue; }
    for (const c of found) if (!owed.includes(c)) owed.push(c);
  }
  return { owed, unread };
}

// Figma: each option of a variant (State=Error), and each boolean property by its name (isLoading, showSpinner);
// a declared state (ds-config.json states) is the concept it names.
export function figmaStatesOf(props = {}, cfg = {}) {
  const out = new Set();
  for (const [key, d] of Object.entries(props ?? {})) {
    const name = String(key).replace(/#.*$/, '');
    if (d?.type === 'VARIANT') for (const o of d.variantOptions ?? []) {
      const c = conceptOf(`${name}=${o}`, cfg) ?? conceptOfState(/^(true|false)$/i.test(String(o)) ? (/^true$/i.test(String(o)) ? name : '') : o);
      if (c) out.add(c);
    }
    else if (d?.type === 'BOOLEAN') { const c = conceptOfState(name.replace(/^(is|has|show|with)(?=[A-Z_ -])/, '')); if (c) out.add(c); }
  }
  return out;
}

// The code: what its markup, its styles and its props show of a state.
const IN_CODE = {
  disabled: /:disabled\b|\[disabled\]|\bdisabled\b|aria-disabled/i,
  readonly: /\bread[- _]?only\b|:read-only|aria-readonly/i,
  error: /\berror\b|\binvalid\b|aria-invalid|:invalid\b/i,
  loading: /\bloading\b|aria-busy|\bspinner\b|\bskeleton\b|\bbusy\b/i,
  success: /\bsuccess\b/i,
  selected: /aria-selected|aria-checked|aria-pressed|:checked\b|\bselected\b|\bchecked\b/i,
  focus: /:focus(-visible|-within)?\b/i,
  hover: /:hover\b/i,
  active: /:active\b/i,
  empty: /\bempty\b|no-?data/i,
};
export function codeStatesOf({ text = '', css = '', props = [] } = {}) {
  const all = `${text}\n${css}\n${props.map(words).join(' ')}`;
  return new Set(Object.entries(IN_CODE).filter(([, re]) => re.test(all)).map(([c]) => c));
}

export function missingOwed({ owed = [], figma = null, code = null } = {}) {
  const out = [];
  for (const s of owed) {
    if (figma && !figma.has(s)) out.push({ state: s, side: 'Figma' });
    if (code && !code.has(s)) out.push({ state: s, side: 'code' });
  }
  return out;
}

export const STATE_WORDS = { readonly: 'read-only' };
export const stateWord = (s) => STATE_WORDS[s] ?? s;
