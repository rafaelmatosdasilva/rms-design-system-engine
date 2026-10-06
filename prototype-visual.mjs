// prototype-visual.mjs - a design review of the drawn page, before anyone sees it.
//
// The browser reads what the page shows (VISUAL_EXPRESSION); visualFindings judges it, the same way every time:
//   • alignment: the parts of a column start on one line (a component's own margin pushes one in);
//   • spacing rhythm: the space between the parts of one arrangement is the same, and the page uses few spacings;
//   • one main action: one part styled as the primary action in view (the system's primary component or option);
//   • hierarchy: the main heading is the largest text, each heading level smaller than the one above, every heading
//     larger or heavier than the text it heads;
//   • reading: a line of text no longer than about 90 characters;
//   • breathing room: two parts of an arrangement never touch.
// Each finding takes points off 10: the score says how far the page is from a reviewed one, and each line what to fix.

// What the page shows, read in the browser: arrangements, headings, body text, primaries, long lines.
export const VISUAL_EXPRESSION = `(() => {
  const canvas = document.getElementById('pt-canvas');
  if (!canvas) return null;
  const visible = (e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== 'hidden'; };
  const nameOf = (e) => e.getAttribute('data-pt-component') || e.getAttribute('data-engine') || e.tagName.toLowerCase();
  const containers = [];
  for (const e of canvas.querySelectorAll('[data-pt-path]')) {
    const kids = [...e.children].filter((k) => k.hasAttribute('data-pt-path') && visible(k));
    if (kids.length < 2) continue;
    const cs = getComputedStyle(e);
    const row = cs.display.includes('flex') && cs.flexDirection.startsWith('row');
    const grid = cs.display.includes('grid');
    const boxes = kids.map((k) => { const r = k.getBoundingClientRect(); return { path: k.getAttribute('data-pt-path'), name: nameOf(k), left: Math.round(r.left), right: Math.round(r.right), top: Math.round(r.top), bottom: Math.round(r.bottom) }; });
    const gaps = [];
    if (!grid) for (let i = 1; i < boxes.length; i++) { const a = boxes[i - 1], b = boxes[i]; const same = row ? Math.abs(a.top - b.top) < (b.bottom - b.top) : true; if (same) gaps.push(row ? b.left - a.right : b.top - a.bottom); }
    containers.push({ path: e.getAttribute('data-pt-path'), name: nameOf(e), engine: e.hasAttribute('data-engine'), row, grid, align: cs.alignItems, kids: boxes, gaps });
  }
  const texts = [];
  const w = document.createTreeWalker(canvas, NodeFilter.SHOW_TEXT); let n;
  while ((n = w.nextNode())) {
    const el = n.parentElement; if (!el || !n.textContent.trim() || el.closest('svg, script, style') || !visible(el)) continue;
    const cs = getComputedStyle(el), h = el.closest('h1, h2, h3, h4, h5, h6');
    const r = document.createRange(); r.selectNodeContents(n);
    const lines = new Set([...r.getClientRects()].filter((x) => x.width > 1).map((x) => Math.round(x.top))).size || 1;
    texts.push({ text: n.textContent.trim().replace(/\\s+/g, ' ').slice(0, 60), chars: n.textContent.trim().length, size: parseFloat(cs.fontSize), weight: parseInt(cs.fontWeight, 10) || 400, level: h ? +h.tagName[1] : 0, lines, path: (el.closest('[data-pt-path]') || el).getAttribute('data-pt-path'), top: Math.round(r.getBoundingClientRect().top) });
  }
  const primaries = [...canvas.querySelectorAll('[data-pt-component]')].filter((e) => visible(e) && !e.closest('[data-pt-overlay]') && (/primary|cta/i.test(e.getAttribute('data-pt-component')) || [...e.classList].some((c) => /(^|[-_])(primary|cta)($|[-_])/i.test(c))))
    .map((e) => ({ path: e.getAttribute('data-pt-path'), name: e.getAttribute('data-pt-component'), text: (e.textContent || '').trim().replace(/\\s+/g, ' ').slice(0, 40) }));
  return { width: canvas.getBoundingClientRect().width, containers, texts, primaries };
})()`;

const WEIGHT = { align: 1, rhythm: 1, spacings: 1, primary: 2, hierarchy: 2, reading: 1, touching: 1 };
const label = (b) => `${b.name}${b.path ? ` (${b.path})` : ''}`;

// textStyles: the system's text styles ([{ name, size, weight }]). A heading already in the largest of them cannot be
// made larger: that is the system's limit, said as a gap, never taken off the score.
// → { score, findings: [{ kind, message, path }], limits: [{ kind, message, need }] }
export function visualFindings(facts, { textStyles = [] } = {}) {
  if (!facts) return { score: null, findings: [], limits: [] };
  const out = [], limits = [];
  const sizes = textStyles.map((t) => Number(t.size)).filter((n) => n > 0);
  const top = sizes.length ? Math.max(...sizes) : null;
  const topStyle = top != null ? textStyles.filter((t) => Number(t.size) === top).sort((a, b) => (Number(b.weight) || 0) - (Number(a.weight) || 0))[0] : null;
  const atTop = (h) => topStyle && h.size >= top - 0.5 && h.weight >= (Number(topStyle.weight) || 0) - 1;
  const add = (kind, message, path = null) => out.push({ kind, message, path });
  // Alignment: a column whose parts start where it says they start, by more than 2px.
  for (const c of facts.containers ?? []) {
    if (c.row || c.grid || /center|end/.test(c.align ?? '')) continue;
    const lefts = c.kids.map((k) => k.left), min = Math.min(...lefts);
    const off = c.kids.filter((k) => k.left - min > 2);
    if (off.length) add('align', `the parts of ${label(c)} do not start on one line: ${off.map((k) => `${label(k)} sits ${k.left - min}px in`).join(', ')}`, c.path);
  }
  // Rhythm: one arrangement, several spaces between its parts.
  for (const c of facts.containers ?? []) {
    const g = (c.gaps ?? []).filter((x) => x >= 0);
    if (g.length < 2) continue;
    const distinct = [...new Set(g.map((x) => Math.round(x)))];
    if (Math.max(...g) - Math.min(...g) > 2) add('rhythm', `the space between the parts of ${label(c)} changes (${distinct.join(', ')}px): one spacing for one arrangement`, c.path);
  }
  // Touching: two parts of one of the engine's arrangements with no space between them.
  for (const c of facts.containers ?? []) if (c.engine && (c.gaps ?? []).some((x) => x < 1) && (c.gaps ?? []).some((x) => x >= 1) === false) add('touching', `the parts of ${label(c)} touch: give it a gap from the system's spacing`, c.path);
  // Few spacings on one page.
  const all = [...new Set((facts.containers ?? []).flatMap((c) => c.gaps ?? []).filter((x) => x >= 1).map((x) => Math.round(x)))].sort((a, b) => a - b);
  if (all.length > 4) add('spacings', `the page uses ${all.length} different spaces between parts (${all.join(', ')}px): keep to a few of the system's spacings`);
  // One main action in view.
  const p = facts.primaries ?? [];
  if (p.length > 1) add('primary', `${p.length} primary actions in view (${p.map((x) => `${x.name}${x.text ? ` "${x.text}"` : ''}`).join(', ')}): keep one, the rest secondary`);
  // Hierarchy.
  const t = facts.texts ?? [];
  const body = t.filter((x) => !x.level);
  const bodySize = body.length ? body.map((x) => x.size).sort((a, b) => a - b)[Math.floor(body.length / 2)] : null;
  const heads = t.filter((x) => x.level);
  const h1 = heads.filter((x) => x.level === 1);
  const largest = Math.max(0, ...t.map((x) => x.size));
  if (h1.length && h1[0].size < largest - 0.5) add('hierarchy', `the main heading "${h1[0].text}" (${h1[0].size}px) is not the largest text on the page (${largest}px): it reads as less important`, h1[0].path);
  for (const lv of [2, 3, 4]) {
    const here = heads.filter((x) => x.level === lv), above = heads.filter((x) => x.level < lv);
    for (const h of here) if (above.length && h.size > Math.min(...above.map((x) => x.size)) + 0.5) add('hierarchy', `the heading "${h.text}" (h${lv}, ${h.size}px) is larger than a heading above it in rank`, h.path);
  }
  const ranked = new Set(out.filter((f) => f.kind === 'hierarchy').map((f) => f.path));
  if (bodySize) for (const h of heads) {
    if (ranked.has(h.path) || h.size > bodySize || h.weight > Math.max(...body.map((x) => x.weight))) continue;
    if (atTop(h)) { if (!limits.some((l) => l.need === 'a heading text style')) limits.push({ kind: 'system', need: 'a heading text style', message: `the heading "${h.text}" is in the system's largest text style (${topStyle.name ?? `${top}px`}, ${top}px), the same as its body text: the system has no heading style; say so as a gap` }); continue; }
    add('hierarchy', `the heading "${h.text}" looks like body text (${h.size}px, weight ${h.weight}): use a larger or heavier text style`, h.path);
  }
  // Reading: a long line of text.
  for (const x of t) if (!x.level && x.lines >= 1 && x.chars / x.lines > 90 && x.chars > 90) add('reading', `"${x.text.slice(0, 40)}…" runs about ${Math.round(x.chars / x.lines)} characters a line: keep lines under 90 (a narrower column)`, x.path);
  const seen = new Set();
  const findings = out.filter((f) => !seen.has(f.message) && seen.add(f.message));
  const lost = findings.reduce((s, f) => s + (WEIGHT[f.kind] ?? 1), 0);
  return { score: Math.max(0, 10 - lost), findings, limits };
}

export const visualLines = (v) => [...(v?.findings ?? []).map((f) => `⚠️  ${f.message}`), ...(v?.limits ?? []).map((l) => `ℹ️  ${l.message}`)];
