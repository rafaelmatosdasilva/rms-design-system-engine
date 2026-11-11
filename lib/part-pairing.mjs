// part-pairing.mjs - each named part of a Figma component paired with the class that draws it in the code.
//
// Code Connect pairs a component with its code and nobody pairs its parts: a difference said "button, gap" and never
// "button › Label", and a fix could point at the component's own rule only. The structure contract's children pair a
// part with a selector by hand; this pairs the rest by name, from the layers Figma has and the classes the component's
// own file puts on its elements, and only where one class is the part's name, never a guess between two.
//
//   layerNames(skeletonEntry)   → the part names of one component: every layer below its frame with a name of its own
//   pairParts(names, text)      → { partName: '.class' }, one class each, from the component file's text
//
// A class is the part's when its words are the part's (label, icon-leading), or end in them after the component's own
// prefix (button__label, button-icon-leading). The class the part's name says exactly wins over one that ends in it;
// two of either kind is no pairing. Pure: nothing is read or written here.
import { usedClasses } from './class-use.mjs';

const wordsOf = (s) => String(s ?? '').replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
// Figma's own names for a layer nobody named (Frame 235, Rectangle, Vector 3): no part's.
const AUTO = /^(frame|group|rectangle|vector|ellipse|line|polygon|star|boolean|union|subtract|text|instance|component|slot)(\s*\d+)?$/i;

export function layerNames(entry) {
  const out = new Set();
  const walk = (t) => { for (const c of t?.c ?? []) { const n = String(c.n ?? '').trim(); if (n && !AUTO.test(n)) out.add(n); if (c.t !== 'INSTANCE') walk(c); } };
  for (const t of entry?.trees ?? []) walk(t);
  return [...out];
}

export function pairParts(names = [], text = '') {
  const classes = [...usedClasses(String(text ?? ''))].map((c) => [c, wordsOf(c).join('-')]).filter(([, k]) => k);
  const out = {};
  for (const n of names) {
    const key = wordsOf(n).join('-');
    if (!key) continue;
    const exact = classes.filter(([, k]) => k === key), ends = classes.filter(([, k]) => k !== key && k.endsWith(`-${key}`));
    const pick = exact.length === 1 ? exact[0] : !exact.length && ends.length === 1 ? ends[0] : null;
    if (pick) out[n] = `.${pick[0]}`;
  }
  return out;
}
