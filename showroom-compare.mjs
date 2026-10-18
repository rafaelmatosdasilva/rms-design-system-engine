// showroom-compare.mjs - a Showroom screen measured against the Figma screen it was written from, box by box: every
// text Figma shows, matched by its words to the same text in the drawing, and every component instance, matched by
// the component the drawing names on it (data-figma), each with how far it moved and how its size differs. So a screen
// is brought to Figma by numbers (the tabs 10px lower, the Minimum column 6px narrower), never by eye.
//
//   layoutCaptureScript(nodeId, { from, count }) → the read-only Plugin API script: the screen's texts and instances,
//                                           each with its box relative to the screen, its component, its font size, a
//                                           part at a time (next: where the next part starts)
//   compareLayout(figma, drawn, { tol })  → [{ kind, name, under, dx, dy, dw, dh }] worst first
//   layoutLines(rows)                     → the report, a line each, grouped by what holds them

export function layoutCaptureScript(nodeId, { from = 0, count = 120 } = {}) {
  return `// Read-only: the boxes of a screen's texts and component instances. It changes nothing.
const root = await figma.getNodeByIdAsync(${JSON.stringify(String(nodeId))});
const ox = root.absoluteTransform[0][2], oy = root.absoluteTransform[1][2];
const seen = (n) => { for (let p = n; p && p !== root; p = p.parent) if (p.visible === false) return false; return true; };
const box = (n) => { const b = n.absoluteBoundingBox || { x: n.absoluteTransform[0][2], y: n.absoluteTransform[1][2], width: n.width, height: n.height }; return { x: Math.round((b.x - ox) * 10) / 10, y: Math.round((b.y - oy) * 10) / 10, w: Math.round(b.width * 10) / 10, h: Math.round(b.height * 10) / 10 }; };
const owner = async (n) => { const out = []; for (let p = n.parent; p && p !== root; p = p.parent) if (p.type === 'INSTANCE') { const mc = await p.getMainComponentAsync(); const name = mc ? (mc.parent && mc.parent.type === 'COMPONENT_SET' ? mc.parent.name : mc.name) : p.name; if (!/^[._]/.test(name)) out.push(name); } return out; };
const texts = [], instances = [];
for (const t of root.findAll((n) => n.type === 'TEXT')) {
  if (!seen(t) || !String(t.characters || '').trim()) continue;
  texts.push({ text: t.characters.trim(), ...box(t), size: typeof t.fontSize === 'number' ? t.fontSize : null, under: (await owner(t)).slice(0, 2) });
}
for (const i of root.findAll((n) => n.type === 'INSTANCE')) {
  if (!seen(i)) continue;
  const mc = await i.getMainComponentAsync(); const name = mc ? (mc.parent && mc.parent.type === 'COMPONENT_SET' ? mc.parent.name : mc.name) : i.name;
  if (/^[._]/.test(name) || /background|state|padding/i.test(name)) continue;
  instances.push({ component: name, layer: i.name, ...box(i) });
}
// In parts short enough for one answer: the texts, then the instances, FROM and COUNT over both together.
const all = texts.map((t) => ({ t })).concat(instances.map((i) => ({ i }))), FROM = ${Number(from) || 0}, COUNT = ${Number(count) || 120};
const part = all.slice(FROM, FROM + COUNT);
return JSON.stringify({ node: ${JSON.stringify(String(nodeId))}, size: [root.width, root.height], texts: part.filter((x) => x.t).map((x) => x.t), instances: part.filter((x) => x.i).map((x) => x.i), next: FROM + COUNT < all.length ? FROM + COUNT : null });
`;
}

// figma: the capture above; drawn: { texts: [{ text, x, y, w, h }], parts: [{ component, x, y, w, h }] } measured on
// the drawing at Figma's size. Each Figma text takes the drawn one with the same words nearest its place (each drawn
// text once); each instance the drawn part naming the same component, in the same order.
export function compareLayout(figma, drawn, { tol = 1 } = {}) {
  const rows = [];
  const norm = (s) => String(s).replace(/\s+/g, ' ').trim();
  const used = new Set();
  const [W, H] = figma.size ?? [Infinity, Infinity];
  for (const t of figma.texts ?? []) {
    // What the screen shows: a text past its edge (rows the frame cuts off) is not compared.
    if (t.x >= W || t.y >= H) continue;
    const same = (drawn.texts ?? []).map((d, i) => [d, i]).filter(([d, i]) => !used.has(i) && norm(d.text) === norm(t.text));
    if (!same.length) { rows.push({ kind: 'text', name: t.text, under: t.under?.[0] ?? null, missing: true }); continue; }
    same.sort((a, b) => Math.hypot(a[0].x - t.x, a[0].y - t.y) - Math.hypot(b[0].x - t.x, b[0].y - t.y));
    const [d, i] = same[0]; used.add(i);
    // A text's start and its middle: Figma's box is as tall as its line and often as wide as its column, the drawing's
    // as its glyphs, so their middles (and their left edges) are what agree when the text sits where Figma has it.
    rows.push({ kind: 'text', name: t.text, under: t.under?.[0] ?? null, dx: Math.round(d.x - t.x), dy: Math.round((d.y + d.h / 2) - (t.y + t.h / 2)), dw: 0, dh: 0, size: t.size, drawnSize: d.size ?? null });
  }
  const byName = {};
  for (const p of drawn.parts ?? []) (byName[p.component] ??= []).push(p);
  const taken = {};
  for (const i of figma.instances ?? []) {
    const list = byName[i.component]; if (!list) continue;
    const k = taken[i.component] = (taken[i.component] ?? 0);
    const d = list[k]; taken[i.component] = k + 1;
    if (!d) continue;
    // Both cut at the screen's edge (a table Figma lets run past the frame is as tall as the frame shows it).
    const clip = (b) => ({ ...b, w: Math.min(b.x + b.w, W) - b.x, h: Math.min(b.y + b.h, H) - b.y });
    const a = clip(i), z = clip(d);
    rows.push({ kind: 'part', name: i.component, under: null, dx: Math.round(z.x - a.x), dy: Math.round(z.y - a.y), dw: Math.round(z.w - a.w), dh: Math.round(z.h - a.h) });
  }
  const off = (r) => r.missing ? 1e6 : Math.max(Math.abs(r.dx), Math.abs(r.dy), Math.abs(r.dw), Math.abs(r.dh), r.size && r.drawnSize ? Math.abs(r.size - r.drawnSize) * 2 : 0);
  return rows.filter((r) => r.missing || off(r) > tol).sort((a, b) => off(b) - off(a));
}

export function layoutLines(rows) {
  const say = (r) => r.missing ? `"${r.name}" is not in the drawing` : `${r.kind === 'part' ? r.name : `"${r.name}"`}${r.under && r.kind === 'text' ? ` (in ${r.under})` : ''}: ${[r.dx ? `${r.dx > 0 ? r.dx + 'px right' : -r.dx + 'px left'}` : '', r.dy ? `${r.dy > 0 ? r.dy + 'px lower' : -r.dy + 'px higher'}` : '', r.dw ? `${r.dw > 0 ? r.dw + 'px wider' : -r.dw + 'px narrower'}` : '', r.dh ? `${r.dh > 0 ? r.dh + 'px taller' : -r.dh + 'px shorter'}` : '', r.size && r.drawnSize && r.size !== r.drawnSize ? `${r.drawnSize}px text, ${r.size}px in Figma` : ''].filter(Boolean).join(', ')}`;
  return rows.map(say);
}

// Each Showroom screen measured on the built page (Chrome): set at Figma's size, unscaled, in the brand its screen is
// designed in and its light mode, every text's box and every part named with data-figma. → { key: drawn } or { why }.
export async function measureScreens(pageFile, { brands = {}, themes = {} } = {}) {
  const { findChrome, launchChrome, connectCDP, openPage, waitForTrue, FILE_PAGE_LOADED } = await import('./cdp.mjs');
  const { pathToFileURL } = await import('node:url');
  const chrome = findChrome({ playwright: true });
  if (!chrome) return { why: 'Chrome not found (set CHROME_PATH)' };
  let browser = null, cdp = null;
  try {
    browser = await launchChrome(chrome, { tmpPrefix: 'dse-showroom-' });
    cdp = await connectCDP(browser.wsUrl);
    const { sessionId } = await openPage(cdp.send, pathToFileURL(pageFile).href + '#showroom');
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1600, height: 1000, deviceScaleFactor: 1, mobile: false }, sessionId);
    await waitForTrue(cdp.send, sessionId, FILE_PAGE_LOADED, { attempts: 400, intervalMs: 50 });
    const expr = `(async () => {
      const wait = (ms) => new Promise((r) => setTimeout(r, ms));
      const BRANDS = ${JSON.stringify(brands)};
      await wait(1200);
      const THEMES = ${JSON.stringify(themes)};
      const out = {};
      // Each screen on its own page (#showroom/<Screen>), opened in turn, at Laptop: the size Figma's screen is drawn at.
      window.__dseShowroomFrame = 'laptop';
      for (const key of window.__dseShowroomKeys || []) {
        location.hash = '#showroom/' + encodeURIComponent(key);
        await wait(500);
        const sc = document.querySelector('.sg-showroom-detail .sg-showroom-screen[data-screen="' + CSS.escape(key) + '"]');
        if (!sc) continue;
        // In the colour mode Figma's screen is drawn in (its Theme mode), Light when it names none.
        document.documentElement.setAttribute('data-theme', THEMES[key] || 'light');
        await wait(200);
        if (BRANDS[key]) document.documentElement.setAttribute('data-brand', BRANDS[key]); else document.documentElement.removeAttribute('data-brand');
        const stage = sc.parentElement, keep = [stage.style.cssText, sc.style.transform];
        stage.setAttribute('data-measuring', '');   // the page leaves it as it is while it is measured
        stage.style.cssText = 'position:fixed;left:0;top:0;width:' + sc.style.width + ';height:' + sc.style.height + ';z-index:99999;overflow:hidden;border:0';
        sc.style.transform = 'none';
        await wait(400);
        const o = sc.getBoundingClientRect(), texts = [];
        const walker = document.createTreeWalker(sc, NodeFilter.SHOW_TEXT); let n;
        while ((n = walker.nextNode())) {
          const t = n.textContent.replace(/\\s+/g, ' ').trim(); if (!t) continue;
          const cs = getComputedStyle(n.parentElement); if (cs.visibility === 'hidden' || cs.display === 'none') continue;
          const r = document.createRange(); r.selectNodeContents(n); const b = r.getBoundingClientRect(); if (!b.width) continue;
          texts.push({ text: t, x: b.left - o.left, y: b.top - o.top, w: b.width, h: b.height, size: parseFloat(cs.fontSize) });
        }
        // A field's placeholder is its words too (Figma draws it as a text).
        for (const i of sc.querySelectorAll('input[placeholder]')) { if (i.value) continue; const b = i.getBoundingClientRect(), cs = getComputedStyle(i); texts.push({ text: i.placeholder, x: b.left - o.left + parseFloat(cs.paddingLeft), y: b.top - o.top + (b.height - parseFloat(cs.lineHeight || cs.fontSize)) / 2, w: 0, h: parseFloat(cs.lineHeight) || parseFloat(cs.fontSize), size: parseFloat(cs.fontSize) }); }
        const parts = [...sc.querySelectorAll('[data-figma]')].map((e) => { const b = e.getBoundingClientRect(); return { component: e.getAttribute('data-figma'), x: b.left - o.left, y: b.top - o.top, w: b.width, h: b.height }; });
        out[key] = { texts, parts };
        stage.style.cssText = keep[0]; sc.style.transform = keep[1]; stage.removeAttribute('data-measuring');
      }
      return JSON.stringify(out);
    })()`;
    const r = await cdp.send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }, sessionId);
    return JSON.parse(r.result?.value ?? '{}');
  } catch (e) { return { why: String(e?.message ?? e).split('\n')[0] }; }
  finally { try { cdp?.close(); } catch { /* closed */ } try { browser?.kill(); } catch { /* gone */ } }
}

// Every Showroom screen measured against Figma, as the style guide's build does after it draws them and
// --showroom-compare does on its own: Figma's boxes read when they are missing (figma-cli when it answers, else the
// script for the Figma tool of the session, said in `next`), the page measured, each screen compared.
// → { results: { key: { title, off, tol, lines } }, next: [what to run], why }
export async function compareShowroom(ROOT, cfg, pageFile, { refresh = false, tol = 2 } = {}) {
  const { readdirSync, readFileSync, writeFileSync, existsSync } = await import('node:fs');
  const { join, resolve, relative } = await import('node:path');
  const { spawnSync } = await import('node:child_process');
  const dir = resolve(ROOT, cfg.paths?.showroom ?? 'showroom');
  let screens = []; try { screens = readdirSync(dir).filter((f) => /\.vue$/.test(f)).map((f) => f.replace(/\.vue$/, '')); } catch { /* none */ }
  if (!screens.length) return { results: {}, next: [], why: 'no Showroom screen' };
  if (!existsSync(pageFile)) return { results: {}, next: [], why: `no built style guide at ${relative(ROOT, pageFile)}` };
  const cli = (script) => spawnSync('figma-cli', ['eval', script], { encoding: 'utf8', maxBuffer: 1e8, timeout: 600000 }).stdout ?? '';
  let cliOk = null;
  const metas = {}, layouts = {}, next = [];
  for (const k of screens) {
    let meta = {}; try { meta = JSON.parse(readFileSync(join(dir, `${k}.json`), 'utf8')); } catch { /* none */ }
    metas[k] = meta;
    const file = join(dir, `${k}.figma-layout.json`);
    if (!existsSync(file) || refresh) {
      const node = /node-id=(\d+)[-:](\d+)/.exec(meta.figma ?? '');
      if (!node) continue;
      const id = `${node[1]}:${node[2]}`;
      if (cliOk == null) cliOk = /^\s*1\s*$/m.test(cli('return 1'));
      if (!cliOk) { const f = join(dir, `${k}.figma-layout.js`); writeFileSync(f, layoutCaptureScript(id)); next.push(`run ${relative(ROOT, f)} with the Figma tool of this session on the file that holds the screen (in parts: from, count) and save what it returns as ${relative(ROOT, file)}`); continue; }
      try {
        const out = { texts: [], instances: [] };
        for (let from = 0; from != null;) { const r = cli(layoutCaptureScript(id, { from, count: 80 })); const d = JSON.parse(r.slice(r.indexOf('{'), r.lastIndexOf('}') + 1)); out.texts.push(...d.texts); out.instances.push(...d.instances); out.size = d.size; out.node = d.node; from = d.next ?? null; }
        writeFileSync(file, JSON.stringify(out));
      } catch { next.push(`${k}: the Figma file that holds the screen is not the one open in Figma (open it, then build again)`); continue; }
    }
    try { layouts[k] = JSON.parse(readFileSync(file, 'utf8')); } catch { /* unreadable */ }
  }
  const keys = screens.filter((k) => layouts[k]);
  if (!keys.length) return { results: {}, next, why: null };
  const themeOf = (m) => { const v = Object.entries(m.modes ?? {}).find(([a]) => /theme|colou?r|mode|styling/i.test(a))?.[1]; return /dark/i.test(v ?? '') ? 'dark' : 'light'; };
  const drawn = await measureScreens(pageFile, { brands: Object.fromEntries(keys.map((k) => [k, metas[k].brand ?? null]).filter(([, b]) => b)), themes: Object.fromEntries(keys.map((k) => [k, themeOf(metas[k])])) });
  if (drawn.why) return { results: {}, next, why: drawn.why };
  const results = {};
  for (const k of keys) {
    if (!drawn[k]) continue;
    const rows = compareLayout(layouts[k], drawn[k], { tol });
    results[k] = { title: metas[k].title ?? k, off: rows.length, tol, lines: [...new Set(layoutLines(rows))] };
  }
  return { results, next, why: null };
}
