// screen-parity.mjs - product screens against their Figma frames (I96).
//
// A component compared on its own can match Figma while the product puts it in the wrong place: another component where
// the designed screen has this one, two where it has one, the space between them or their order changed. This opens each
// product's own page at the width and height of each screen designed for it (the screen capture, screen-layout.mjs), in
// the screen's colour mode, finds the system's components on it by their classes, and compares them with the instances
// on the designed screen, in reading order: which ones and how many, their order, the space between neighbours stacked
// or side by side, and whether the ones that line up in Figma line up on the page.

import { screenInstances } from './prototype-render.mjs';

const key = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
const round = (n) => Math.round(n * 10) / 10;

// Top to bottom, then left to right within a row (tops within 4px).
export function readingOrder(list) {
  return [...list].sort((a, b) => (Math.abs(a.y - b.y) <= 4 ? a.x - b.x : a.y - b.y));
}

// The longest run two orders share (by id): what is out of order is what it leaves out.
function lcs(a, b) {
  const m = a.length, n = b.length, t = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = m - 1; i >= 0; i--) for (let j = n - 1; j >= 0; j--) t[i][j] = a[i] === b[j] ? t[i + 1][j + 1] + 1 : Math.max(t[i + 1][j], t[i][j + 1]);
  const keep = new Set();
  for (let i = 0, j = 0; i < m && j < n;) { if (a[i] === b[j]) { keep.add(a[i]); i++; j++; } else if (t[i + 1][j] >= t[i][j + 1]) i++; else j++; }
  return keep;
}

// One screen against the product's page. figma, page: [{ component, x, y, w, h }] (the screen's instances, the page's
// components, both from the screen's top left corner). → [{ kind, component, message }]
export function screenFindings(screenName, figma, page, { tolerance = 2 } = {}) {
  const out = [];
  const F = readingOrder(figma), P = readingOrder(page);
  const names = [...new Set([...F, ...P].map((b) => b.component))];
  const pairs = [];
  for (const name of names) {
    const f = F.filter((b) => b.component === name), p = P.filter((b) => b.component === name);
    // Three or more of one component is a list: how many the page shows is its data, not its layout. Only whether it
    // shows one, and where the first one sits, are compared.
    if (f.length >= 3 || p.length >= 3) {
      if (!p.length) out.push({ kind: 'missing', component: name, message: `"${screenName}" has a list of ${name}; the page shows none` });
      else if (!f.length) out.push({ kind: 'extra', component: name, message: `the page shows a list of ${name}; "${screenName}" has none` });
      else pairs.push({ id: `${name}#0`, component: name, f: f[0], p: p[0] });
      continue;
    }
    if (f.length > p.length) out.push({ kind: 'missing', component: name, message: `"${screenName}" has ${f.length} ${name}${f.length > 1 ? 's' : ''}; the page shows ${p.length || 'none'}` });
    else if (p.length > f.length) out.push({ kind: 'extra', component: name, message: `the page shows ${p.length} ${name}${p.length > 1 ? 's' : ''}; "${screenName}" has ${f.length || 'none'}` });
    for (let i = 0; i < Math.min(f.length, p.length); i++) pairs.push({ id: `${name}#${i}`, component: name, f: f[i], p: p[i] });
  }
  const byF = readingOrder(pairs.map((x) => ({ ...x.f, id: x.id }))).map((b) => b.id);
  const byP = readingOrder(pairs.map((x) => ({ ...x.p, id: x.id }))).map((b) => b.id);
  const kept = lcs(byF, byP);
  for (const id of byF.filter((x) => !kept.has(x))) {
    const at = byP.indexOf(id), atF = byF.indexOf(id), comp = id.split('#')[0];
    const before = (list, i) => (i > 0 ? list[i - 1].split('#')[0] : null);
    out.push({ kind: 'order', component: comp, message: `${comp} is out of the screen's order: on the page it comes ${before(byP, at) ? `after ${before(byP, at)}` : 'first'}, on "${screenName}" ${before(byF, atF) ? `after ${before(byF, atF)}` : 'first'}` });
  }
  // Neighbours in the screen's order, both on the page: the space between them and their alignment.
  const pairOf = new Map(pairs.map((x) => [x.id, x]));
  for (let i = 1; i < byF.length; i++) {
    const A = pairOf.get(byF[i - 1]), B = pairOf.get(byF[i]);
    const across = B.f.x < A.f.x + A.f.w && A.f.x < B.f.x + B.f.w, along = B.f.y < A.f.y + A.f.h && A.f.y < B.f.y + B.f.h;
    if (across && B.f.y >= A.f.y + A.f.h - 1) {   // stacked
      const fg = B.f.y - (A.f.y + A.f.h), pg = B.p.y - (A.p.y + A.p.h);
      if (Math.abs(fg - pg) > tolerance) out.push({ kind: 'space', component: B.component, message: `the space between ${A.component} and the ${B.component} below it is ${round(pg)}px on the page, ${round(fg)}px on "${screenName}"` });
      if (Math.abs(A.f.x - B.f.x) <= 1 && Math.abs(A.p.x - B.p.x) > tolerance) out.push({ kind: 'align', component: B.component, message: `${B.component} starts ${round(B.p.x - A.p.x)}px from ${A.component}'s left edge on the page; on "${screenName}" they line up` });
    } else if (along && B.f.x >= A.f.x + A.f.w - 1) {   // side by side
      const fg = B.f.x - (A.f.x + A.f.w), pg = B.p.x - (A.p.x + A.p.w);
      if (Math.abs(fg - pg) > tolerance) out.push({ kind: 'space', component: B.component, message: `the space between ${A.component} and the ${B.component} beside it is ${round(pg)}px on the page, ${round(fg)}px on "${screenName}"` });
    }
  }
  return out;
}

// Which product a designed screen is for: the screen named in ds-config.json (screens: [{ nodeId, plugin }]), the
// screen components snapshot (keyed by node id, with its plugin), else a product whose name the screen's name holds.
export function productOfScreen(screen, { declared = [], screenComponents = {}, products = [] } = {}) {
  const id = String(screen?.id ?? '').replace('-', ':');
  const d = declared.find((s) => String(s.nodeId ?? '').replace('-', ':') === id);
  if (d?.plugin) return d.plugin;
  const sc = screenComponents[id] ?? screenComponents[id.replace(':', '-')];
  if (sc?.plugin) return sc.plugin;
  const name = key(screen?.name);
  return products.find((p) => name.includes(key(p))) ?? null;
}

// In the browser: the page at the screen's size and colour mode, every element of each component's class. As the
// screen capture does, the parts of a small component (a button's icon, a segmented control's segments) are its own,
// not the screen's: only a large one (a panel, a card that holds others) has its components listed.
// classes: { component: '.class' }. setup: a script that puts the page in the screen's state. → [{ component, x, y, w,
// h }] | null (did not load)
export async function readPageComponents(send, url, { width, height, sw = null, classes = {}, setup = null } = {}) {
  const { openLoaded } = await import('./code-capture.mjs');
  const { targetId, sessionId } = await openLoaded(send, url);
  if (!sessionId) return null;
  try {
    await send('Emulation.setDeviceMetricsOverride', { width: Math.round(width || 1280), height: Math.round(height || 900), deviceScaleFactor: 1, mobile: false }, sessionId);
    if (sw?.media) await send('Emulation.setEmulatedMedia', { features: sw.media }, sessionId);
    if (sw?.apply) await send('Runtime.evaluate', { expression: sw.apply }, sessionId);
    if (setup) await send('Runtime.evaluate', { expression: `(async () => { ${setup}\n })()`, awaitPromise: true }, sessionId);
    await new Promise((r) => setTimeout(r, setup ? 400 : 150));
    const expr = `(() => { const found = []; for (const [component, sel] of Object.entries(${JSON.stringify(classes)})) { let els = []; try { els = [...document.querySelectorAll(sel)]; } catch (e) { continue; }
      for (const e of els) { const r = e.getBoundingClientRect(), s = getComputedStyle(e); if (r.width * r.height < 1 || s.visibility === 'hidden') continue; found.push({ e, component, x: r.left + scrollX, y: r.top + scrollY, w: r.width, h: r.height }); } }
      const small = found.filter((f) => f.w * f.h <= 20000);
      return found.filter((f) => !small.some((o) => o !== f && o.e !== f.e && o.e.contains(f.e))).map(({ e, ...b }) => b); })()`;
    return (await send('Runtime.evaluate', { expression: expr, returnByValue: true }, sessionId)).result?.value ?? [];
  } finally { await send('Target.closeTarget', { targetId }).catch(() => {}); }
}

// The whole check for a project. → { screens: [{ name, product, page, findings }], notCompared: [why] } | null (no capture)
export async function projectScreens(ROOT, cfg = {}, { chromePath = null } = {}) {
  const { readFileSync, existsSync } = await import('node:fs');
  const { resolve, join, dirname } = await import('node:path');
  const { pathToFileURL } = await import('node:url');
  const readJSON = (p) => { try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return null; } };
  const figmaDir = dirname(resolve(ROOT, cfg.paths?.snapshotStructure ?? 'figma-structure.snapshot.json'));
  const file = [cfg.paths?.screenLayout, join(figmaDir, 'figma-screen-layout.snapshot.json'), 'figma-screen-layout.snapshot.json'].filter(Boolean).map((p) => resolve(ROOT, p)).find(existsSync);
  const screens = file ? readJSON(file)?.screens ?? [] : [];
  if (!screens.length) return null;
  const { productPages } = await import('./code-roots.mjs');
  const pages = productPages(ROOT, cfg);
  const scFile = [cfg.paths?.snapshotScreenComponents, join(figmaDir, 'figma-screen-components.snapshot.json')].filter(Boolean).map((p) => resolve(ROOT, p)).find(existsSync);
  const screenComponents = scFile ? readJSON(scFile)?.screens ?? {} : {};
  const names = Object.keys(readJSON(resolve(ROOT, cfg.paths?.snapshotStructure ?? 'figma-structure.snapshot.json'))?.components ?? {}).filter((n) => !n.startsWith('_'));
  const catalog = { components: Object.fromEntries(names.map((n) => [n, {}])) };
  const { loadLocator } = await import('./component-locator.mjs');
  const locator = await loadLocator(ROOT, cfg);
  const classes = Object.fromEntries(names.map((n) => [n, locator.selectorFor(n)]).filter(([, s]) => s && /^[.#[a-z]/i.test(s)));
  const { loadModes } = await import('./mode-resolver.mjs');
  const { modeSwitch } = await import('./code-capture.mjs');
  const modes = loadModes(cfg);
  const out = { screens: [], notCompared: [] };
  const todo = [];
  for (const s of screens) {
    const product = productOfScreen(s, { declared: [...(cfg.frames ?? []), ...(cfg.screens ?? [])], screenComponents, products: pages.map((p) => p.product) });
    const page = pages.find((p) => p.product === product);
    if (!product || !page) { out.notCompared.push(`"${s.name}" (${product ? `${product} has no built page` : 'no product it belongs to'})`); continue; }
    todo.push({ s, product, page });
  }
  if (!todo.length) return out;
  const { findChrome, launchChrome, connectCDP } = await import('./cdp.mjs');
  const chrome = chromePath ?? findChrome();
  if (!chrome) { out.notCompared.push('every screen (Chrome not found)'); return out; }
  const browser = await launchChrome(chrome, { tmpPrefix: 'screen-parity-' });
  try {
    const { send, close } = await connectCDP(browser.wsUrl);
    for (const { s, product, page } of todo) {
      const colour = Object.values(s.modes ?? {}).map((m) => modes.find((x) => key(x.name) === key(m))).find(Boolean);
      const setup = [...(cfg.frames ?? []), ...(cfg.screens ?? [])].find((d) => String(d.nodeId ?? '').replace('-', ':') === String(s.id ?? '').replace('-', ':'))?.setup ?? null;
      const found = await readPageComponents(send, pathToFileURL(page.file).href, { width: s.tree?.w, height: s.tree?.h, sw: colour ? modeSwitch(colour) : null, classes, setup });
      if (!found) { out.notCompared.push(`"${s.name}" (${page.file} did not load)`); continue; }
      const figma = screenInstances(s.tree ?? {}, catalog).filter((b) => Number.isFinite(b.x) && Number.isFinite(b.y)).map((b) => ({ component: b.component, x: b.x, y: b.y, w: b.w, h: b.h }));
      // A page that opens in another state than the screen (empty before its data comes, a screen drawn with a list
      // loaded) would list every difference of that state: said once instead, with how to give it the screen's state.
      const kinds = new Set(figma.map((b) => b.component)), shown = new Set(found.map((b) => b.component));
      const both = [...kinds].filter((k) => shown.has(k)).length, gone = kinds.size - both;
      if (gone >= 3 && gone / kinds.size > 1 / 3) { out.notCompared.push(`"${s.name}" (${product}'s page opens in another state: it shows ${both} of the screen's ${kinds.size} components${setup ? ', after its setup' : ''}. Give the screen a setup in ds-config.json (its frames or screens entry), a script that puts the page in the screen's state)`); continue; }
      out.screens.push({ name: s.name, product, page: page.file.replace(ROOT + '/', ''), width: s.tree?.w ?? null, findings: screenFindings(s.name, figma, found) });
    }
    close();
  } finally { browser.kill(); }
  return out;
}

// The style guide's To do rows: one per product, what its page does otherwise than its designed screens.
export function screenTodos(saved) {
  const by = new Map();
  for (const s of saved?.screens ?? []) if (s.findings.length) { if (!by.has(s.product)) by.set(s.product, []); by.get(s.product).push(s); }
  return [...by].map(([product, list]) => {
    const all = list.flatMap((s) => s.findings);
    return { area: 'Products', type: `${product}, screen`, kind: 'Screen', who: 'code',
      say: `${product}'s page is laid out otherwise than its designed screen${list.length > 1 ? 's' : ''} in Figma, in ${all.length} place${all.length === 1 ? '' : 's'} (${all.slice(0, 3).map((f) => f.message).join('; ')}${all.length > 3 ? `; and ${all.length - 3} more` : ''}).`,
      todo: `Lay out ${product} as ${list.length > 1 ? 'its screens are' : `"${list[0].name}" is`} in Figma, or tell the design team the screen is out of date. Tell Claude which.` };
  });
}

// The screen layout snapshot from a capture's answer (what use_figma returned, saved as a file).
export function screenSnapshot(answer) {
  const a = typeof answer === 'string' ? JSON.parse(answer) : answer;
  const body = Array.isArray(a?.screens) ? a : Array.isArray(a?.result?.screens) ? a.result : null;
  if (!body) throw new Error('not a screen capture (no "screens")');
  return { _updated: new Date().toISOString(), _note: 'Designed screens read from Figma (screen-layout.mjs SCREEN_CAPTURE_JS), read only.', screens: body.screens };
}
