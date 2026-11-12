// layout-faults.mjs - what a component's boxes say in Figma: text that overlaps other text or an icon, a part cut off
// by a frame that clips, a part sitting outside its parent.
//
// The construction check and the hygiene read bindings and structure, never boxes, so a component built or changed in
// Figma could pass every rule with its label running under its icon. The capture keeps, for each variant, the size of a
// box of a fixed size whose texts or instances run beyond it (looks[...].box) with those layers' places (looks[...].at),
// beside the place of every layer placed by hand, which it kept already: auto layout lays its parts side by side, so an
// overlap is a layer placed by hand. From those, each fault is named with its layer and its variant. Only content is held to it (text, an instance, a frame): artwork drawn
// freely on purpose (a chart's slices, a decoration) is never a fault.
//
//   layoutFaults(entry)          → [{ variant, kind: 'overlap' | 'clipped' | 'outside', layer, with?, by }], one entry's
//   layoutRules({ skeleton })    → [{ id, area, says, items }] for the construction grammar (layout-faults), only when
//                                  the capture keeps boxes at all (capture-waits.mjs says so otherwise)
//   faultLine(fault)             → the fault in words
//
// Pure: nothing is read or written here.

const CONTENT = /^(TEXT|INSTANCE|FRAME|GROUP)$/;
const EPS = 0.5;

export function layoutFaults(entry) {
  const out = [], seen = new Set();
  const add = (f) => { const k = `${f.kind}|${f.layer}|${f.with ?? ''}`; if (!seen.has(k)) { seen.add(k); out.push(f); } };
  for (const [vn, ti] of entry?.variants ?? []) {
    const looks = entry.looks?.[vn] ?? {};
    const walk = (t, place) => {
      const kids = (t?.c ?? []).map((k, i) => ({ k, place: place ? `${place}.${i}` : String(i) })).filter(({ k }) => !k.hidden);
      const box = looks[place]?.box;
      const placed = kids.filter(({ k, place: p }) => CONTENT.test(k.t) && looks[p]?.at);
      // A part beyond its box: cut off when the box clips, spilling out of it when it does not.
      if (box) for (const { k, place: p } of placed) {
        const [x, y, w, h] = looks[p].at;
        const by = Math.max(-x, -y, x + w - box[0], y + h - box[1]);
        if (by > EPS) add({ variant: vn, kind: t.clip ? 'clipped' : 'outside', layer: k.n, by: Math.round(by) });
      }
      // Text over text or over an icon: two parts of one box drawn on each other.
      for (let i = 0; i < placed.length; i++) for (let j = i + 1; j < placed.length; j++) {
        const a = placed[i], b = placed[j];
        if (a.k.t !== 'TEXT' && b.k.t !== 'TEXT') continue;
        if (!/^(TEXT|INSTANCE)$/.test(a.k.t) || !/^(TEXT|INSTANCE)$/.test(b.k.t)) continue;
        const [ax, ay, aw, ah] = looks[a.place].at, [bx, by_, bw, bh] = looks[b.place].at;
        const ow = Math.min(ax + aw, bx + bw) - Math.max(ax, bx), oh = Math.min(ay + ah, by_ + bh) - Math.max(ay, by_);
        if (ow > EPS && oh > EPS) add({ variant: vn, kind: 'overlap', layer: a.k.t === 'TEXT' ? a.k.n : b.k.n, with: a.k.t === 'TEXT' ? b.k.n : a.k.n, by: Math.round(Math.min(ow, oh)) });
      }
      for (const { k, place: p } of kids) if (k.t !== 'INSTANCE') walk(k, p);
    };
    walk(entry.trees?.[ti], '');
  }
  return out;
}

export const faultLine = (f) => (f.kind === 'overlap' ? `${f.layer} overlaps ${f.with} by ${f.by}px` : f.kind === 'clipped' ? `${f.layer} is cut off by ${f.by}px` : `${f.layer} sits ${f.by}px outside its parent`) + ` (${f.variant})`;

export function layoutRules({ skeleton = {} } = {}) {
  const names = Object.keys(skeleton).filter((n) => !n.startsWith('_') && skeleton[n]?.trees?.length).sort();
  const boxed = names.filter((n) => Object.values(skeleton[n].looks ?? {}).some((v) => Object.values(v ?? {}).some((l) => l?.box)));
  if (!boxed.length) return [];
  return [{ id: 'layout-faults', area: 'layout', says: 'No text overlaps other text or an icon, and no part is cut off by a frame that clips or sits outside its parent',
    items: boxed.map((n) => { const f = layoutFaults(skeleton[n]); return { component: n, value: f.slice(0, 3).map(faultLine).join('; ') + (f.length > 3 ? ` and ${f.length - 3} more` : ''), fits: !f.length }; }) }];
}
