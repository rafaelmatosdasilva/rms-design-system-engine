// state-token-use.mjs - a component's hover, press, focus and disabled use the system's state token where it has one.
//
// A system that names its states (--button-bg and --button-bg-hover) has decided what a hover looks like. A component
// whose :hover writes var(--blue-700), or a colour by hand, or keeps var(--button-bg), decides it again, and the next
// change to the hover token never reaches it. This reads a component's own styles: for each rule on a state (:hover,
// :active, :focus-visible, :disabled), the property its resting rule sets with a token, and whether the system declares
// that token's state twin. Where it does and the state rule writes anything else, the state rule is listed with the
// token it should use. Where the system has no state token, nothing is said: the component cannot follow it or break it.
//
//   stateTokenBreaks(styles, declared) → { seen, breaks: [{ file, line, selector, prop, wrote, want }] }
//     styles: [{ file, text }] (a Vue or Svelte file's <style> blocks are read from it); declared: Set of custom
//     properties the system declares (its theme and its components' own)
import { walkCss, styleBlocksOf } from './css-source.mjs';

// The words a state is named by, in a token, for each pseudo-class that brings it about.
const STATE_WORDS = { hover: ['hover', 'hovered'], active: ['pressed', 'press', 'active'], focus: ['focus', 'focused'], 'focus-visible': ['focus', 'focused'], disabled: ['disabled'] };
const REST_WORDS = ['default', 'rest', 'enabled', 'idle', 'normal'];
const PSEUDO = /:(hover|active|focus-visible|focus|disabled)\b/;
const varIn = (value) => /var\(\s*(--[\w-]+)/.exec(String(value ?? ''))?.[1] ?? null;
const varsIn = (value) => [...String(value ?? '').matchAll(/var\(\s*(--[\w-]+)/g)].map((m) => m[1]);

// The names a token's state twin could have: its rest word swapped for the state's (--x-default → --x-hover), the
// state's word added at the end (--x → --x-hover) or before the property's last part (--button-bg → --button-hover-bg).
export function stateTwins(token, state) {
  const words = STATE_WORDS[state] ?? [state];
  const parts = String(token).replace(/^--/, '').split('-');
  const out = new Set();
  for (const w of words) {
    const i = parts.findIndex((p) => REST_WORDS.includes(p));
    if (i >= 0) { const q = parts.slice(); q[i] = w; out.add(`--${q.join('-')}`); }
    out.add(`--${parts.join('-')}-${w}`);
    if (parts.length > 1) out.add(`--${[...parts.slice(0, -1), w, parts[parts.length - 1]].join('-')}`);
  }
  return [...out];
}

const textOf = (s) => (/\.(vue|svelte|html?)$/i.test(s.file ?? '') ? styleBlocksOf(s.text) : String(s.text ?? ''));
const base = (sel) => sel.replace(/:(hover|active|focus-visible|focus|disabled)\b|:not\([^)]*\)/g, '').replace(/\s+/g, ' ').trim();

export function stateTokenBreaks(styles = [], declared = new Set()) {
  const rules = (styles ?? []).flatMap((s) => walkCss(textOf(s), s.file ?? '').map((r) => ({ ...r, file: s.file ?? r.file })));
  const rest = new Map();   // selector → prop → token
  for (const r of rules) for (const sel of r.selectors ?? []) {
    if (PSEUDO.test(sel)) continue;
    for (const d of r.decls ?? []) { const v = varIn(d.value); if (v) (rest.get(sel) ?? rest.set(sel, new Map()).get(sel)).set(d.prop, v); }
  }
  let seen = false;
  const breaks = [];
  for (const r of rules) for (const sel of r.selectors ?? []) {
    const m = PSEUDO.exec(sel);
    if (!m) continue;
    const at = rest.get(base(sel));
    if (!at) continue;
    for (const d of r.decls ?? []) {
      const restTok = at.get(d.prop);
      if (!restTok) continue;
      const want = stateTwins(restTok, m[1]).find((t) => declared.has(t));
      if (!want) continue;
      seen = true;
      if (!varsIn(d.value).includes(want)) breaks.push({ file: r.file, line: d.line, selector: sel, prop: d.prop, wrote: d.value, want });
    }
  }
  return { seen, breaks };
}

export const stateTokenLine = (b) => `${b.selector} sets ${b.prop}: ${b.wrote}, where the system has var(${b.want}) (${b.file}:${b.line})`;
