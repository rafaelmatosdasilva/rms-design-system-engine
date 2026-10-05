// visual-diff.mjs - each component as the page draws it, against its Figma image (idea I43).
//
// Field-by-field comparison misses what only pixels show: an icon on the wrong side, an alignment, a wrong
// glyph. With ds-config.json → codeReading.visual: true, the capture saves a PNG of each component's instance
// (first mode, default state, at scale 2). This compares it with the Figma image of the component's default
// variant, from the first of:
//   1. <visualRefs>/components/<name>.png (default .design-system-engine-refs), saved by hand or with the Figma MCP;
//   2. the Figma REST images API (FIGMA_TOKEN and figmaFileKey), cached under .design-system-engine-out/visual/figma/.
// A component with neither is listed as not compared, never guessed. The images are compared in Chrome on
// a canvas (no image library needed): the Figma image is drawn on the background the component sits on,
// then every pixel whose colour differs by more than the tolerance, and is not found within one pixel in
// the other image (anti-aliasing), counts. The result is advisory: two
// percentages per component, with and without its text, worst first, and a diff image under
// .design-system-engine-out/visual/diff/. The one without text decides the ⚠️ (codeReading.visualThreshold, default 2%).
import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync, readdirSync } from 'node:fs';
import { join, resolve, relative } from 'node:path';
import { findChrome, launchChrome, connectCDP, openPage } from './cdp.mjs';
import { OUT_DIR, REFS_DIR, projectPath } from './names.mjs';

const safe = (name) => String(name).replace(/[^\w.-]+/g, '_');
const readJson = (p) => { try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return null; } };
const axes = (n) => String(n ?? '').toLowerCase().replace(/\s+/g, '');

// Where the Figma image of a component comes from. Returns { file, from } or { why }.
// folder: components (a component's default variant) or screens (a designed screen, for the prototype check).
export async function figmaImage(ROOT, cfg, name, { nodeId, defaultVariant, version, token = process.env.FIGMA_TOKEN, fetchImpl = fetch, outDir = OUT_DIR, folder = 'components' } = {}) {
  const ref = resolve(ROOT, cfg.visualRefs ?? projectPath(ROOT, 'refs'), folder, `${safe(name)}.png`);
  if (existsSync(ref)) return { file: ref, from: 'reference' };
  if (!token) return { why: 'no reference image and no FIGMA_TOKEN' };
  if (!cfg.figmaFileKey) return { why: 'no reference image and no figmaFileKey in ds-config.json' };
  if (!nodeId) return { why: 'no reference image and no node id in the structure snapshot' };
  const dir = resolve(ROOT, outDir, 'visual', folder === 'components' ? 'figma' : `figma-${folder}`), file = join(dir, `${safe(name)}.png`), meta = join(dir, `${safe(name)}.json`);
  const m = readJson(meta);
  if (existsSync(file) && m?.nodeId === nodeId && m?.version === (version ?? null)) return { file, from: 'figma (cached)' };
  const get = async (url) => {
    const r = await fetchImpl(url, { headers: { 'X-Figma-Token': token }, signal: AbortSignal.timeout(30000) });
    if (!r.ok) throw new Error(`Figma answered ${r.status}`);
    return r;
  };
  try {
    const key = cfg.figmaFileKey, id = String(nodeId).replace('-', ':');
    // A component set renders every variant at once: take its default variant's own node.
    let target = id;
    const nodes = await (await get(`https://api.figma.com/v1/files/${key}/nodes?ids=${encodeURIComponent(id)}&depth=1`)).json();
    const doc = nodes?.nodes?.[id]?.document;
    if (doc?.type === 'COMPONENT_SET' && doc.children?.length) {
      target = (doc.children.find((c) => axes(c.name) === axes(defaultVariant)) ?? doc.children[0]).id;
    }
    const img = await (await get(`https://api.figma.com/v1/images/${key}?ids=${encodeURIComponent(target)}&format=png&scale=2`)).json();
    const url = img?.images?.[target];
    if (!url) return { why: 'Figma returned no image' };
    const bytes = Buffer.from(await (await fetchImpl(url, { signal: AbortSignal.timeout(30000) })).arrayBuffer());
    mkdirSync(dir, { recursive: true });
    writeFileSync(file, bytes);
    writeFileSync(meta, JSON.stringify({ nodeId, target, version: version ?? null }) + '\n');
    return { file, from: 'figma' };
  } catch (e) { return { why: `could not fetch the Figma image (${String(e.message || e).split('\n')[0]})` }; }
}

// Every variant's Figma image of a component, for the style guide's Figma beside the code. From the first of:
//   1. <visualRefs>/components/<name>/<variant>.png, each variant named as Figma names it (Size=L, State=Default.png,
//      at 2x, or Size=L@1x.png at another scale), and <visualRefs>/components/<name>.png for its default variant;
//   2. the Figma REST API (FIGMA_TOKEN and figmaFileKey): every variant of its component set in one images call, cached
//      under <out>/visual/figma-variants/<name>/ until the Figma version changes.
// → { images: [{ variant: 'Size=L, State=Default' | null, file }], from } or { images: [], why }. max: the most taken.
export async function figmaVariantImages(ROOT, cfg, name, { nodeId, version = null, token = process.env.FIGMA_TOKEN, fetchImpl = fetch, outDir = OUT_DIR, max = 48 } = {}) {
  const refDir = resolve(ROOT, cfg.visualRefs ?? projectPath(ROOT, 'refs'), 'components');
  const own = join(refDir, safe(name)), one = join(refDir, `${safe(name)}.png`);
  const images = [];
  // A picture exported at another scale says so in its name (Size=L@1x.png); 2x by default.
  if (existsSync(own)) for (const f of readdirSync(own).filter((x) => /\.png$/i.test(x)).sort()) { const at = /@([1-4])x\.png$/i.exec(f); images.push({ variant: f.replace(/(@[1-4]x)?\.png$/i, ''), file: join(own, f), scale: at ? Number(at[1]) : 2 }); }
  if (existsSync(one)) images.unshift({ variant: null, file: one });
  if (images.length) return { images: images.slice(0, max), from: 'reference' };
  if (!token) return { images: [], why: 'no reference images and no FIGMA_TOKEN' };
  if (!cfg.figmaFileKey) return { images: [], why: 'no reference images and no figmaFileKey in ds-config.json' };
  if (!nodeId) return { images: [], why: 'no reference images and no node id for it' };
  const dir = resolve(ROOT, outDir, 'visual', 'figma-variants', safe(name)), meta = join(dir, 'images.json');
  const m = readJson(meta);
  if (m?.nodeId === nodeId && m?.version === (version ?? null) && m.images?.every((x) => existsSync(join(dir, x.file)))) return { images: m.images.map((x) => ({ variant: x.variant, file: join(dir, x.file) })), from: 'figma (cached)' };
  const get = async (url) => {
    const r = await fetchImpl(url, { headers: { 'X-Figma-Token': token }, signal: AbortSignal.timeout(30000) });
    if (!r.ok) throw new Error(`Figma answered ${r.status}`);
    return r;
  };
  try {
    const key = cfg.figmaFileKey, id = String(nodeId).replace('-', ':');
    const doc = (await (await get(`https://api.figma.com/v1/files/${key}/nodes?ids=${encodeURIComponent(id)}&depth=1`)).json())?.nodes?.[id]?.document;
    const nodes = doc?.type === 'COMPONENT_SET' ? (doc.children ?? []).filter((c) => c.type === 'COMPONENT').slice(0, max).map((c) => ({ id: c.id, variant: c.name })) : [{ id, variant: null }];
    const urls = (await (await get(`https://api.figma.com/v1/images/${key}?ids=${encodeURIComponent(nodes.map((n) => n.id).join(','))}&format=png&scale=2`)).json())?.images ?? {};
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(dir, { recursive: true });
    const kept = [];
    for (const [i, n] of nodes.entries()) {
      if (!urls[n.id]) continue;
      const file = `${i}.png`;
      writeFileSync(join(dir, file), Buffer.from(await (await fetchImpl(urls[n.id], { signal: AbortSignal.timeout(30000) })).arrayBuffer()));
      kept.push({ variant: n.variant, file });
    }
    writeFileSync(meta, JSON.stringify({ nodeId, version: version ?? null, images: kept }) + '\n');
    return { images: kept.map((x) => ({ variant: x.variant, file: join(dir, x.file) })), from: 'figma' };
  } catch (e) { return { images: [], why: `could not fetch the Figma images (${String(e.message || e).split('\n')[0]})` }; }
}

// A component's Do and Don't examples, for its Usage: pictures in <visualRefs>/components/<name>/do/ and .../dont/ (the
// file's name is its caption: "Labels that say what happens.png"), then the Figma nodes contract.authored.json names
// (components.<name>.examples: [{ "kind": "do" | "dont", "nodeId": "12:34", "caption": "…" }]), fetched with FIGMA_TOKEN
// and cached under <out>/visual/figma-examples/<name>/. → [{ kind, caption, file }], do's first.
export async function exampleImages(ROOT, cfg, name, { authored = [], token = process.env.FIGMA_TOKEN, fetchImpl = fetch, outDir = OUT_DIR } = {}) {
  const base = join(resolve(ROOT, cfg.visualRefs ?? projectPath(ROOT, 'refs'), 'components'), safe(name));
  const out = [];
  for (const kind of ['do', 'dont']) {
    const dir = join(base, kind);
    if (existsSync(dir)) for (const f of readdirSync(dir).filter((x) => /\.png$/i.test(x)).sort()) out.push({ kind, caption: f.replace(/\.png$/i, '').replace(/^\d+[\s._-]+/, ''), file: join(dir, f) });
  }
  const wanted = (Array.isArray(authored) ? authored : []).filter((e) => e && /^(do|dont|don't)$/i.test(e.kind ?? '') && e.nodeId);
  if (wanted.length && token && cfg.figmaFileKey) {
    const dir = resolve(ROOT, outDir, 'visual', 'figma-examples', safe(name));
    try {
      const ids = wanted.map((e) => String(e.nodeId).replace('-', ':'));
      const missing = ids.filter((id) => !existsSync(join(dir, `${safe(id)}.png`)));
      if (missing.length) {
        const r = await fetchImpl(`https://api.figma.com/v1/images/${cfg.figmaFileKey}?ids=${encodeURIComponent(missing.join(','))}&format=png&scale=2`, { headers: { 'X-Figma-Token': token }, signal: AbortSignal.timeout(30000) });
        if (!r.ok) throw new Error(`Figma answered ${r.status}`);
        const urls = (await r.json())?.images ?? {};
        mkdirSync(dir, { recursive: true });
        for (const id of missing) if (urls[id]) writeFileSync(join(dir, `${safe(id)}.png`), Buffer.from(await (await fetchImpl(urls[id], { signal: AbortSignal.timeout(30000) })).arrayBuffer()));
      }
      wanted.forEach((e, i) => { const f = join(dir, `${safe(ids[i])}.png`); if (existsSync(f)) out.push({ kind: /^do$/i.test(e.kind) ? 'do' : 'dont', caption: e.caption ?? '', file: f }); });
    } catch { /* the examples that could be read */ }
  }
  return out.sort((a, b) => (a.kind === b.kind ? 0 : a.kind === 'do' ? -1 : 1));
}

// Runs in the page: both images on one canvas size, the Figma one over the component's background.
// `text` are the component's text boxes in CSS pixels ([x, y, w, h]); `scale` the image scale. Pixels in
// them (grown by one CSS pixel) are left out of the second score: glyphs never rasterise the same way in
// two renderers, so that score is about shape and colour only.
export function compareExpression(figmaUrl, codeUrl, background, tolerance, text = [], scale = 2) {
  return `(async () => {
    const load = (src) => new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => no(new Error('image did not load')); i.src = src; });
    const [a, b] = await Promise.all([load(${JSON.stringify(figmaUrl)}), load(${JSON.stringify(codeUrl)})]);
    const w = Math.max(a.width, b.width), h = Math.max(a.height, b.height);
    const pixels = (img) => { const c = new OffscreenCanvas(w, h), x = c.getContext('2d'); x.fillStyle = ${JSON.stringify(background)}; x.fillRect(0, 0, w, h); x.drawImage(img, 0, 0); return x.getImageData(0, 0, w, h).data; };
    const pa = pixels(a), pb = pixels(b);
    const out = new OffscreenCanvas(w, h), ox = out.getContext('2d'), od = ox.createImageData(w, h);
    let diff = 0, outside = 0, outsideTotal = 0;
    const mask = new Uint8Array(w * h);
    for (const [x, y, bw, bh] of ${JSON.stringify(text)}) {
      const s = ${Number(scale)}, x0 = Math.max(0, Math.floor((x - 1) * s)), y0 = Math.max(0, Math.floor((y - 1) * s));
      const x1 = Math.min(w, Math.ceil((x + bw + 1) * s)), y1 = Math.min(h, Math.ceil((y + bh + 1) * s));
      for (let Y = y0; Y < y1; Y++) mask.fill(1, Y * w + x0, Y * w + x1);
    }
    const T = ${Number(tolerance)};
    const near = (p, i, q, j) => Math.max(Math.abs(p[i] - q[j]), Math.abs(p[i + 1] - q[j + 1]), Math.abs(p[i + 2] - q[j + 2])) <= T;
    // Anti-aliasing and sub-pixel text differ between any two renderers: a pixel that has its colour
    // within one pixel in the other image (both ways) is not a difference.
    const within1 = (p, i, q) => {
      const x = (i / 4) % w, y = Math.floor(i / 4 / w);
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const X = x + dx, Y = y + dy;
        if (X >= 0 && Y >= 0 && X < w && Y < h && near(p, i, q, (Y * w + X) * 4)) return true;
      }
      return false;
    };
    for (let i = 0; i < pa.length; i += 4) {
      const inText = mask[i / 4] === 1;
      if (!inText) outsideTotal++;
      if (!near(pa, i, pb, i) && !(within1(pa, i, pb) && within1(pb, i, pa))) { diff++; if (!inText) outside++; od.data[i] = 255; od.data[i + 1] = 0; od.data[i + 2] = 64; od.data[i + 3] = 255; }
      else { const g = pb[i] * 0.3 + pb[i + 1] * 0.59 + pb[i + 2] * 0.11; od.data[i] = od.data[i + 1] = od.data[i + 2] = g; od.data[i + 3] = 60; }
    }
    ox.putImageData(od, 0, 0);
    const bytes = new Uint8Array(await (await out.convertToBlob({ type: 'image/png' })).arrayBuffer());
    let bin = ''; for (let i = 0; i < bytes.length; i += 8192) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 8192));
    return { figma: [a.width, a.height], code: [b.width, b.height], diff, total: w * h, outside, outsideTotal, png: btoa(bin) };
  })()`;
}

// Every component the capture drew, compared with its Figma image. Returns { rows, missing, note }.
export async function visualDiff(ROOT, cfg, code, structure, { outDir = OUT_DIR, version = null, chromePath = findChrome({ playwright: true }), token, fetchImpl } = {}) {
  const drawn = Object.entries(code?.components ?? {}).filter(([, c]) => c.visual?.file);
  if (!drawn.length) return { rows: [], missing: [], note: null };
  const tolerance = Number.isFinite(cfg.codeReading?.visualTolerance) ? cfg.codeReading.visualTolerance : 10;
  const threshold = Number.isFinite(cfg.codeReading?.visualThreshold) ? cfg.codeReading.visualThreshold : 2;
  const pairs = [], missing = [];
  for (const [name, c] of drawn) {
    const f = structure?.[name] ?? {};
    const img = await figmaImage(ROOT, cfg, name, { nodeId: f.nodeId, defaultVariant: f.defaultVariant, version, token, fetchImpl, outDir });
    if (img.file) pairs.push({ name, figma: img.file, from: img.from, code: resolve(ROOT, c.visual.file), background: c.visual.background ?? '#ffffff', text: c.visual.text ?? [], scale: c.visual.scale ?? 2 });
    else missing.push({ name, why: img.why });
  }
  if (!pairs.length) return { rows: [], missing, note: null };
  if (!chromePath || typeof WebSocket === 'undefined') return { rows: [], missing, note: 'Chrome not found, images not compared' };
  const diffDir = resolve(ROOT, outDir, 'visual', 'diff');
  rmSync(diffDir, { recursive: true, force: true });
  mkdirSync(diffDir, { recursive: true });
  const rows = [];
  const chrome = await launchChrome(chromePath, { tmpPrefix: 'visual-diff-' });
  try {
    const cdp = await connectCDP(chrome.wsUrl);
    try {
      const { sessionId } = await openPage(cdp.send, 'about:blank');
      const dataUrl = (p) => `data:image/png;base64,${readFileSync(p).toString('base64')}`;
      for (const p of pairs) {
        const r = (await cdp.send('Runtime.evaluate', { expression: compareExpression(dataUrl(p.figma), dataUrl(p.code), p.background, tolerance, p.text, p.scale), awaitPromise: true, returnByValue: true }, sessionId)).result?.value;
        if (!r) { missing.push({ name: p.name, why: 'the images could not be compared' }); continue; }
        const file = join(diffDir, `${safe(p.name)}.png`);
        writeFileSync(file, Buffer.from(r.png, 'base64'));
        const pct = Math.round((1000 * r.diff) / r.total) / 10;
        const noText = r.outsideTotal ? Math.round((1000 * r.outside) / r.outsideTotal) / 10 : 0;
        rows.push({ name: p.name, pct, noText, over: noText > threshold, figmaSize: r.figma, codeSize: r.code, from: p.from, diff: relative(ROOT, file) });
      }
    } finally { cdp.close(); }
  } finally { chrome.kill(); }
  return { rows: rows.sort((a, b) => b.noText - a.noText || b.pct - a.pct || a.name.localeCompare(b.name)), missing, note: null, threshold };
}

export function visualLines(r, refsDir = REFS_DIR) {
  const lines = [];
  if (r.rows.length) {
    const over = r.rows.filter((x) => x.over);
    lines.push(`🖼  VISUAL ${r.rows.length} compared with their Figma image (advisory, worst first): ${over.length} differ by more than ${r.threshold}% of pixels outside text`);
    for (const x of r.rows) {
      const size = x.figmaSize.join('×') === x.codeSize.join('×') ? '' : `, Figma ${x.figmaSize.join('×')} and code ${x.codeSize.join('×')} px`;
      lines.push(`   🖼  ${x.over ? '⚠️ ' : '✓ '} ${x.name}: ${x.noText}% of pixels differ outside text, ${x.pct}% with it${size}  → ${x.diff}`);
    }
  }
  if (r.note) lines.push(`   🖼  ⏭ ${r.note}`);
  if (r.missing.length) {
    const by = new Map();
    for (const m of r.missing) by.set(m.why, [...(by.get(m.why) ?? []), m.name]);
    for (const [why, names] of by) lines.push(`   🖼  ⏭ not compared (${names.length}), ${why}: ${names.slice(0, 12).join(', ')}${names.length > 12 ? `, ${names.length - 12} more` : ''}`);
    lines.push(`   🖼  ⏭ to compare them: set FIGMA_TOKEN, or save each default variant at scale 2 as ${refsDir}/components/<name>.png`);
  }
  return lines;
}
