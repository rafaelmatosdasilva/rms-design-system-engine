// layout-names.mjs - the code's names for how things are laid out, carried onto Figma's auto-layout frames.
//
// A codebase often has a small vocabulary for arranging things (a stack, a cluster, a row, a grid), each a class that
// sets a direction, a gap, whether it wraps and how it lines its children up. Figma has auto layout and no names for
// arrangements, so a frame is "Frame 47", and it comes back into code as a guess. This reads the code's layout parts and
// what each one sets, then says, for each auto-layout frame in a component, which part it is laid out as, whether it is
// named after it, and whether its gap is bound to a variable. The construction check already finds the frames nobody
// named: this names them after what the code calls them.
//
//   layoutPartsOf(styles, roots)       → [{ name, class, dir, wrap, gap, align?, file, line }]
//     styles: [{ file, text }], the system's own CSS. A part is a class that is a layout's word and nothing more
//     (.stack, .cluster), the word after a layout prefix only (l-stack, o-cluster, layout-grid), or the root class of a
//     component named after one (roots: { '.ds-stack': 'stack' }, a Stack component's), and whose rule lays its children
//     out (flex or grid). A class that only ends in the word is a component's part (.table-row, .form-row), never a
//     layout of the system's: read as one, every column in a table became a Row. A modifier (stack--tight) is the
//     part's, never a part of its own.
//   layoutFrames(skeleton, parts)      → { component: [{ frame, dir, wrap, gap, gapBound, parts: [name], named }] }
//     each auto-layout frame inside a component (never the component itself, never an instance's layers) that some code
//     part lays out the same way: the same direction and the same wrap, and the same alignment where the part sets one.
//   layoutNameRules({ skeleton, layouts }) → construction rules in judge's shape (construction-grammar.mjs)
// Pure.
import { walkCss } from './css-source.mjs';

export const LAYOUT_WORDS = ['stack', 'vstack', 'hstack', 'cluster', 'inline', 'row', 'column', 'columns', 'split', 'grid', 'switcher', 'flow', 'reel', 'wrap'];
const WORD = new Set(LAYOUT_WORDS);
const cap = (w) => w[0].toUpperCase() + w.slice(1);

// The layout word a class is named after, or null: the word alone, or after a layout prefix (l-, o-, layout-).
const PREFIX = /^(l|o|u|ly|lay|layout|layouts)$/;
function wordOf(cls, roots = {}) {
  const c = String(cls);
  if (roots['.' + c]) return WORD.has(String(roots['.' + c]).toLowerCase()) ? String(roots['.' + c]).toLowerCase() : null;
  if (/--|__/.test(c)) return null;
  const words = c.split(/[-_]+|(?<=[a-z])(?=[A-Z])/).filter(Boolean).map((w) => w.toLowerCase());
  if (words.length === 1) return WORD.has(words[0]) ? words[0] : null;
  return words.length === 2 && PREFIX.test(words[0]) && WORD.has(words[1]) ? words[1] : null;
}

const ALIGN = { 'flex-start': 'MIN', start: 'MIN', center: 'CENTER', 'flex-end': 'MAX', end: 'MAX', baseline: 'BASELINE', 'space-between': 'SPACE_BETWEEN' };

export function layoutPartsOf(styles = [], roots = {}) {
  const out = [], seen = new Set();
  for (const { file = '', text = '' } of styles) {
    let rules = [];
    try { rules = walkCss(text, file); } catch { continue; }
    for (const r of rules) {
      if ((r.atRules ?? []).length) continue;   // a part as a media query changes it is still read from its own rule
      for (const sel of r.selectors ?? []) {
        const m = /^\.([A-Za-z_][\w-]*)$/.exec(String(sel).trim());
        const word = m ? wordOf(m[1], roots) : null;
        if (!word || seen.has(m[1])) continue;
        const d = Object.fromEntries((r.decls ?? []).map((x) => [x.prop, String(x.value).trim()]));
        const display = d.display ?? '';
        if (!/^(inline-)?(flex|grid)$/.test(display)) continue;
        seen.add(m[1]);
        const dir = /grid/.test(display) ? 'GRID' : /^column/.test(d['flex-direction'] ?? d['flex-flow'] ?? '') ? 'VERTICAL' : 'HORIZONTAL';
        const fw = d['flex-wrap'] ?? '', ff = d['flex-flow'] ?? '';
        const wrap = /^wrap/.test(fw) || (/\bwrap\b/.test(ff) && !/nowrap/.test(ff));
        const align = ALIGN[d['align-items']] ?? null;
        out.push({ name: cap(word), class: m[1], dir, wrap, gap: d.gap ?? d['row-gap'] ?? d['column-gap'] ?? null, ...(align ? { align } : {}), file, line: r.line ?? null });
      }
    }
  }
  return out;
}

const AUTO = /^((Frame|Group|Auto layout)( \d+)*)$/i;
// The words of a frame's name, so "Content stack" and "content-stack" are both named after Stack.
const wordsIn = (n) => String(n ?? '').split(/[\s/_-]+|(?<=[a-z])(?=[A-Z])/).filter(Boolean).map((w) => w.toLowerCase());

export function layoutFrames(skeleton = {}, parts = []) {
  const out = {};
  if (!parts.length) return out;
  for (const [component, sk] of Object.entries(skeleton ?? {})) {
    if (String(component).startsWith('_')) continue;
    const frames = [], seen = new Set();
    for (const [variant, ti] of sk?.variants ?? []) {
      const binds = sk.binds?.[variant] ?? {};
      const walk = (t, place, depth) => {
        if (!t || t.hidden || t.t === 'INSTANCE') return;
        const l = t.layout;
        if (depth > 0 && t.t === 'FRAME' && l && /^(HORIZONTAL|VERTICAL|GRID)$/.test(l.dir)) {
          const wrap = !!l.wrap;
          const like = parts.filter((p) => p.dir === l.dir && (p.dir === 'GRID' || p.wrap === wrap) && (!p.align || !l.cross || p.align === l.cross));
          if (like.length && !seen.has(t.n)) {
            seen.add(t.n);
            const names = [...new Set(like.map((p) => p.name))];
            frames.push({ frame: t.n, dir: l.dir, wrap, gap: l.gap ?? 0, gapBound: !!binds[place]?.itemSpacing, parts: names, named: !AUTO.test(String(t.n).trim()) && names.some((n) => wordsIn(t.n).includes(n.toLowerCase())) });
          }
        }
        (t.c ?? []).forEach((k, i) => walk(k, place ? `${place}.${i}` : String(i), depth + 1));
      };
      walk(sk.trees?.[ti], '', 0);
    }
    if (frames.length) out[component] = frames;
  }
  return out;
}

const DIR = { HORIZONTAL: 'a row', VERTICAL: 'a column', GRID: 'a grid' };
const either = (xs) => (xs.length < 2 ? xs[0] : `${xs.slice(0, -1).join(', ')} or ${xs[xs.length - 1]}`);
export function layoutNameRules({ skeleton = {}, layouts = [] } = {}) {
  const frames = layoutFrames(skeleton, layouts ?? []);
  const named = [], bound = [];
  for (const [component, fs] of Object.entries(frames)) {
    const wrong = fs.filter((f) => !f.named);
    named.push({ component, fits: !wrong.length, value: wrong.map((f) => `${f.frame} is laid out as the code's ${either(f.parts)} (${DIR[f.dir]}${f.wrap ? ' that wraps' : ''})`).join(' · ') });
    const loose = fs.filter((f) => f.gap > 0 && !f.gapBound);
    bound.push({ component, fits: !loose.length, value: loose.map((f) => `${f.frame} (${f.gap}px)`).join(' · ') });
  }
  return [
    { id: 'layouts-named', area: 'naming', says: 'Each auto-layout frame is named after the code\'s layout part it is laid out as', items: named },
    { id: 'layout-gap-bound', area: 'variables', says: 'Each auto-layout frame the code has a layout part for binds its gap to a spacing variable', items: bound },
  ];
}
