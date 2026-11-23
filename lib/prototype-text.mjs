// prototype-text.mjs - a prototype drawn as plain text, to paste into code review, a ticket or a thread.
// Run from project root:  rms-design-system-engine --prototype <composition.json> --text [--width 72]
//
// The drawing is made from the composition after the prototype check has read it, so it can only show what the
// composition holds: each of the system's components boxed with its catalog name and the options it was given, the
// engine's layout pieces as plain arrangement (a Row side by side, a Stack one under the other), a Text by the level of
// its heading, and a Missing box in a dashed frame with the need written in it. A part the check found wrong, or one the
// system lacks, is drawn where it is with a numbered mark, and the notes under the drawing say what each mark means,
// in the check's own words. Under it all, the components used and how often, every name one the catalog holds.
//
//   textWireframe(tree, { findings, gaps, width }) → { lines, notes, used }
//   wireframeText(name, wf)                        → the whole text, the drawing then its notes

const WORDS = ['label', 'text', 'title', 'heading', 'placeholder', 'value', 'content', 'children', 'name', 'description'];
const NOT_SHOWN = new Set(['id', 'wiring', 'opens', 'goesTo', 'inSlot', 'purpose', 'box', 'standInFor', 'tip', 'why', 'searched', 'figmaState', 'textless', 'grow', 'stretch', 'gap', 'padding', 'width', 'height', 'align', 'justify', 'columns']);

const fit = (s, w) => { const t = String(s); return t.length > w ? (w > 1 ? t.slice(0, w - 1) + '…' : t.slice(0, w)) : t + ' '.repeat(w - t.length); };
const isWord = (k) => WORDS.includes(String(k).toLowerCase());
const words = (props = {}) => Object.entries(props).filter(([k, v]) => isWord(k) && typeof v === 'string' && v.trim()).map(([, v]) => v.trim());
const options = (props = {}) => Object.entries(props).filter(([k, v]) => !isWord(k) && !NOT_SHOWN.has(k) && v != null && typeof v !== 'object').map(([k, v]) => `${k} ${v}`);

// Text wrapped to a width, never cutting a word that fits on a line of its own.
function wrap(text, w) {
  const out = [];
  let line = '';
  for (const word of String(text).split(/\s+/).filter(Boolean)) {
    if (!line) line = word;
    else if (line.length + 1 + word.length <= w) line += ` ${word}`;
    else { out.push(line); line = word; }
  }
  if (line) out.push(line);
  return out.map((l) => fit(l, w));
}

// Side by side: each block padded to the tallest, joined by a gap.
function beside(blocks, widths, gap = 1) {
  const h = Math.max(0, ...blocks.map((b) => b.length));
  return Array.from({ length: h }, (_, i) => blocks.map((b, j) => b[i] ?? ' '.repeat(widths[j])).join(' '.repeat(gap)));
}

function framed(head, body, w, { dashed = false, mark = '' } = {}) {
  const [h, v, tl, tr, bl, br] = dashed ? ['┄', '┆', '┌', '┐', '└', '┘'] : ['─', '│', '┌', '┐', '└', '┘'];
  const label = `${h} ${head}${mark ? ` ${mark}` : ''} `;
  const title = label.length >= w - 2 ? fit(label, Math.max(0, w - 2)) : label + h.repeat(w - 2 - label.length);
  return [`${tl}${title}${tr}`, ...body.map((l) => `${v}${l}${v}`), `${bl}${h.repeat(Math.max(0, w - 2))}${br}`];
}

export function textWireframe(tree, { findings = [], gaps = [], width = 72 } = {}) {
  const notes = [];
  const used = new Map();
  const marks = new Map();
  const markFor = (id) => {
    const said = [...findings.filter((f) => f.id === id && f.level === 'error').map((f) => f.message), ...gaps.filter((g) => g.node === id && g.kind !== 'layout').map((g) => `not in the system: ${g.need}${g.note ? ` (${g.note})` : g.used ? ` (drawn with ${g.used} meanwhile)` : ''}`)];
    if (!said.length) return '';
    if (!marks.has(id)) { notes.push(...said.map((s, i) => `${i ? '   ' : `[${notes.length + 1}]`} ${s}`)); marks.set(id, `✗${notes.filter((n) => n.startsWith('[')).length}`); }
    return marks.get(id);
  };
  const draw = (node, w) => {
    if (!node) return [];
    w = Math.max(6, w);
    const p = node.props ?? {};
    const mark = markFor(node.id);
    const kids = node.children ?? [];
    if (node.component === 'Text') {
      const t = words(p)[0] ?? '';
      const level = /^h([1-6])$/i.exec(String(p.as ?? ''))?.[1];
      if (level === '1') return [fit(`${t.toUpperCase()}${mark ? ` ${mark}` : ''}`, w), fit('━'.repeat(Math.min(w, Math.max(t.length, 3))), w)];
      if (level === '2') return [fit(`${t.toUpperCase()}${mark ? ` ${mark}` : ''}`, w), fit('─'.repeat(Math.min(w, Math.max(t.length, 3))), w)];
      if (level) return wrap(`▸ ${t}${mark ? ` ${mark}` : ''}`, w);
      return wrap(`${t}${mark ? ` ${mark}` : ''}`, w);
    }
    if (node.component === 'Missing') {
      const need = String(p.need ?? 'a part the system does not have');
      return framed('missing', wrap(need, w - 2), w, { dashed: true, mark });
    }
    if (node.component === 'Row' || node.component === 'Columns') {
      if (!kids.length) return [];
      const n = kids.length, each = Math.floor((w - (n - 1)) / n);
      const widths = kids.map((_, i) => (i === n - 1 ? w - (n - 1) - each * (n - 1) : each));
      return beside(kids.map((k, i) => draw(k, widths[i])), widths);
    }
    // A part the system lacks, drawn with the engine's arrangement in its place: dashed, with what it stands in for.
    if (p.standInFor && ['Stack', 'Row', 'Columns'].includes(node.component)) {
      const inner = draw({ ...node, props: { ...p, standInFor: undefined } }, w - 2);
      return framed('stand-in', inner, w, { dashed: true, mark });
    }
    if (node.component === 'Page' || node.component === 'Stack') {
      const inner = node.component === 'Page' ? w - 2 : w;
      const body = kids.flatMap((k, i) => [...(i ? [' '.repeat(inner)] : []), ...draw(k, inner)]);
      if (node.component !== 'Page') return body;
      return [`╔${'═'.repeat(w - 2)}╗`, ...body.map((l) => `║${l}║`), `╚${'═'.repeat(w - 2)}╝`];
    }
    // One of the system's components (or a name the system does not hold, drawn with its mark).
    if (!findings.some((f) => f.id === node.id && f.rule === 1 && f.level === 'error')) used.set(node.component, (used.get(node.component) ?? 0) + 1);
    const inner = w - 2;
    const body = [];
    for (const t of words(p)) body.push(...wrap(`"${t}"`, inner));
    const opts = options(p);
    if (opts.length) body.push(...wrap(opts.join(' · '), inner));
    for (const k of kids) body.push(...draw(k, inner));
    if (!body.length) body.push(' '.repeat(inner));
    return framed(node.component, body, w, { mark });
  };
  const lines = draw(tree, width);
  // The arrangement no component of the system does (a page, a row) is said once, never marked on every box.
  const layout = [...new Set(gaps.filter((g) => g.kind === 'layout').map((g) => g.need))];
  return { lines, notes, layout, used: [...used.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])) };
}

export function wireframeText(name, wf) {
  const out = [`${name}`, '', ...wf.lines, ''];
  if (wf.used.length) out.push(`Components: ${wf.used.map(([n, k]) => (k > 1 ? `${n} ×${k}` : n)).join(' · ')}`);
  if (wf.layout?.length) out.push(`Arranged by the engine, which no component of the system does: ${wf.layout.join(' · ')}`);
  if (wf.notes.length) out.push('', 'Marked in the drawing:', ...wf.notes);
  else out.push('Every part is one the system holds, with options it has.');
  return out.join('\n') + '\n';
}
