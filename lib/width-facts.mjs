// width-facts.mjs - whether each width the engine draws a page at is a width the page was really drawn at.
//
// A layout checked at three widths can be drawn at one, and every check passes: the page sits in a box of the width
// asked while the window stays wide, so a media query (which reads the window) never changes, or the CSS has rules
// for a width that change nothing at it. So the engine sets the browser's own width for each one (a container query
// reads the box around it instead, which the box's width sets), and here, at each width, reads which of the page's
// media rules hold and how the page is laid out. Two widths that lay out the same while different rules hold at each
// are listed: the CSS meant something to happen between them, and nothing did.
//
//   WIDTH_FACTS_JS(root)  → an in-page expression: { px, media: [rules that hold], container, layout } for the page now
//   sameDrawn(facts)      → [{ a, b, rules, container }] for each two widths drawn the same though the rules differ
//   sameDrawnLines(list)  → the lines the run prints

// root: a selector for the part of the page drawn (the prototype's, the page's); the whole body when absent.
export const WIDTH_FACTS_JS = (root = null) => `(() => {
  const media = new Set(), props = new Set();
  let container = 0;
  // Every @media rule of every sheet the page can read, nested ones too; a sheet from another host cannot be read.
  // What each one sets is read too, held or not, so every width reads the same properties: a rule that only
  // recolours a part changes the page as much as one that moves it.
  // Only a rule for a part this page has counts: a system's CSS holds rules for components the page never uses, and
  // those change nothing here at any width.
  const top = ${JSON.stringify(root)} ? document.querySelector(${JSON.stringify(root)}) : document.body;
  if (!top) return null;
  const here = (sel) => { try { return !!sel && (top.matches(sel) || !!top.querySelector(sel)); } catch (e) { return false; } };
  const styleRules = (rules, out = []) => { for (const r of rules || []) { if (r.selectorText != null && r.style) out.push(r); if (r.cssRules) styleRules(r.cssRules, out); } return out; };
  const walk = (rules) => { for (const r of rules || []) {
    if (r instanceof CSSMediaRule) {
      const c = r.conditionText || (r.media && r.media.mediaText) || '';
      const mine = styleRules(r.cssRules).filter((x) => here(x.selectorText));
      if (c && mine.length) {
        if (matchMedia(c).matches) media.add(c);
        for (const x of mine) for (let i = 0; i < x.style.length; i++) if (!x.style[i].startsWith('--')) props.add(x.style[i]);
      }
      walk(r.cssRules);
    }
    else if (typeof CSSContainerRule !== 'undefined' && r instanceof CSSContainerRule) { container++; walk(r.cssRules); }
    else if (r.cssRules) walk(r.cssRules);
  } };
  for (const s of document.styleSheets) { try { walk(s.cssRules); } catch (e) { /* another host's sheet */ } }
  // How the page is laid out, independent of how wide it is: each part's kind of layout, its direction, its columns,
  // its type size, whether it shows, its share of its parent's width in steps of 5%, and each property the page's media
  // rules set. A fluid page that only
  // stretches reads the same at every width; one whose rules take hold reads differently.
  // A property whose value is a length the window sets on its own (a width in %) reads differently at every width, so
  // it only ever keeps two widths apart: the list errs towards saying nothing.
  const own = [...props].sort().slice(0, 60);
  const parts = [top, ...top.querySelectorAll('*')].slice(0, 3000);
  const sig = parts.map((e) => {
    const s = getComputedStyle(e), r = e.getBoundingClientRect(), p = e.parentElement ? e.parentElement.getBoundingClientRect() : r;
    const cols = s.gridTemplateColumns && s.gridTemplateColumns !== 'none' ? s.gridTemplateColumns.split(' ').length : 0;
    const share = p.width ? Math.round((r.width / p.width) * 20) : 0;
    return [s.display, s.flexDirection, s.flexWrap, cols, Math.round(parseFloat(s.fontSize) || 0), s.visibility === 'hidden' || s.display === 'none' ? 0 : 1, share, ...own.map((k) => s.getPropertyValue(k))].join(',');
  }).join(';');
  let h = 0; for (let i = 0; i < sig.length; i++) h = (h * 31 + sig.charCodeAt(i)) | 0;
  return { px: innerWidth, media: [...media].sort(), container, layout: String(h >>> 0) + ':' + parts.length };
})()`;

// facts: [{ name, px, media, container, layout }] in any order. Neighbouring widths only: three widths drawn the same
// are two pairs, each said, rather than every pair of them.
export function sameDrawn(facts = []) {
  const list = facts.filter((f) => f && f.layout).sort((x, y) => x.px - y.px);
  const out = [];
  for (let i = 1; i < list.length; i++) {
    const a = list[i - 1], b = list[i];
    if (a.layout !== b.layout) continue;
    const A = new Set(a.media ?? []), B = new Set(b.media ?? []);
    const rules = [...[...A].filter((c) => !B.has(c)), ...[...B].filter((c) => !A.has(c))];
    if (!rules.length) continue;
    out.push({ a: a.name ?? `${a.px}px`, b: b.name ?? `${b.px}px`, rules, container: Math.max(a.container ?? 0, b.container ?? 0) });
  }
  return out;
}

export function sameDrawnLines(list = []) {
  return list.map((s) => `⚠️  ${s.a} and ${s.b} are drawn the same, though the CSS has rules for one and not the other (${s.rules.slice(0, 3).map((r) => `@media ${r}`).join(' · ')}${s.rules.length > 3 ? ` and ${s.rules.length - 3} more` : ''}): what the rules say does not change the page between them${s.container ? `. Its ${s.container} container quer${s.container === 1 ? 'y reads' : 'ies read'} the box around a part, not the window` : ''}`);
}
