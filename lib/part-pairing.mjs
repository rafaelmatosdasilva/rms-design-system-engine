// part-pairing.mjs - each named part of a Figma component paired with the class that draws it in the code.
//
// Code Connect pairs a component with its code and nobody pairs its parts: a difference said "button, gap" and never
// "button › Label", and a fix could point at the component's own rule only. The structure contract's children pair a
// part with a selector by hand; this pairs the rest by name, from the layers Figma has and the classes the component's
// own file puts on its elements, and only where one class is the part's name, never a guess between two.
//
//   layerNames(skeletonEntry)   → the part names of one component: every layer below its frame with a name of its own
//   partFacts(skeletonEntry)    → { ids, instances, styles }: what Figma says of each part beyond its name - its layer's
//                                 node id, the component an instance part is, and the one text style it is set in
//   pairParts(names, text, { ids, instances, classFor }) → { partName: selector }, one each, from the file's text
//   pairedHow(names, text, opts) → { partName: 'name' | 'id' | 'component' }, how each was paired
//
// A class is the part's when its words are the part's (label, icon-leading), or end in them after the component's own
// prefix (button__label, button-icon-leading). The class the part's name says exactly wins over one that ends in it;
// two of either kind is no pairing. A part whose class says nothing of its name is paired two more ways, each one the
// file says outright and never a guess: the markup carries the layer's own node id in an attribute
// (data-figma-node="12:34", which survives a rename in Figma), or the part is an instance of another component whose
// class (classFor) the file puts on one element only, and no other part is that component. Pure: nothing is read or
// written here.
import { classUseCounts } from './class-use.mjs';

const wordsOf = (s) => String(s ?? '').replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
// Figma's own names for a layer nobody named (Frame 235, Rectangle, Vector 3): no part's.
const AUTO = /^(frame|group|rectangle|vector|ellipse|line|polygon|star|boolean|union|subtract|text|instance|component|slot)(\s*\d+)?$/i;

export function layerNames(entry) {
  const out = new Set();
  const walk = (t) => { for (const c of t?.c ?? []) { const n = String(c.n ?? '').trim(); if (n && !AUTO.test(n)) out.add(n); if (c.t !== 'INSTANCE') walk(c); } };
  for (const t of entry?.trees ?? []) walk(t);
  return [...out];
}

// One part's facts from every variant's tree: a fact that is not the same in each (two node ids, two styles) is none.
export function partFacts(entry) {
  const ids = {}, instances = {}, styles = {}, clash = { ids: new Set(), instances: new Set(), styles: new Set() };
  const keep = (bag, set, n, v) => { if (v == null) return; if (n in bag && bag[n] !== v) set.add(n); else bag[n] = v; };
  // The one text style a part is set in: its own (a text layer), else the one every text layer inside it shares.
  const styleOf = (t) => {
    if (t.t === 'TEXT') return t.styles?.text ?? null;
    const found = new Set(); let bare = false;
    const walk = (x) => { for (const c of x?.c ?? []) { if (c.hidden) continue; if (c.t === 'TEXT') { if (c.styles?.text) found.add(c.styles.text); else bare = true; } else if (c.t !== 'INSTANCE') walk(c); } };
    walk(t);
    return found.size === 1 && !bare ? [...found][0] : null;
  };
  const walk = (t) => { for (const c of t?.c ?? []) { const n = String(c.n ?? '').trim();
    if (n && !AUTO.test(n)) { keep(ids, clash.ids, n, c.id ?? null); if (c.t === 'INSTANCE') keep(instances, clash.instances, n, c.of?.name ?? null); keep(styles, clash.styles, n, styleOf(c)); }
    if (c.t !== 'INSTANCE') walk(c); } };
  for (const t of entry?.trees ?? []) walk(t);
  for (const [bag, set] of [[ids, clash.ids], [instances, clash.instances], [styles, clash.styles]]) for (const n of set) delete bag[n];
  return { ids, instances, styles };
}

const esc = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
export function pairedHow(names = [], text = '', { ids = {}, instances = {}, classFor = null } = {}) {
  const src = String(text ?? '');
  const counts = classUseCounts(src);
  const classes = [...counts.keys()].map((c) => [c, wordsOf(c).join('-')]).filter(([, k]) => k);
  const out = {};
  for (const n of names) {
    const key = wordsOf(n).join('-');
    if (!key) continue;
    const exact = classes.filter(([, k]) => k === key), ends = classes.filter(([, k]) => k !== key && k.endsWith(`-${key}`));
    const pick = exact.length === 1 ? exact[0] : !exact.length && ends.length === 1 ? ends[0] : null;
    if (pick) { out[n] = { selector: `.${pick[0]}`, by: 'name' }; continue; }
    // The layer's own node id, written on the element: [data-figma-node="12:34"].
    const id = ids[n];
    if (id && /^[\w:;-]+$/.test(id)) {
      const hits = [...src.matchAll(new RegExp(`\\b(data-[\\w-]+)\\s*=\\s*["'\`]${esc(id)}["'\`]`, 'g'))].map((m) => m[1]);
      if (new Set(hits).size === 1 && hits.length === 1) { out[n] = { selector: `[${hits[0]}="${id}"]`, by: 'id' }; continue; }
    }
    // Another component: its own class, on one element of this file, and no other part is that component.
    const of = instances[n];
    if (of && typeof classFor === 'function' && Object.values(instances).filter((x) => x === of).length === 1) {
      const cls = String(classFor(of) ?? '').replace(/^\./, '').trim();
      if (cls && /^[\w-]+$/.test(cls) && counts.get(cls) === 1) out[n] = { selector: `.${cls}`, by: 'component' };
    }
  }
  return out;
}

export function pairParts(names = [], text = '', opts = {}) {
  return Object.fromEntries(Object.entries(pairedHow(names, text, opts)).map(([n, x]) => [n, x.selector]));
}
