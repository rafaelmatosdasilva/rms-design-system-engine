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

// Each instance on a screen with the instance it sits in (its scope), and the ones that are that instance's own parts:
// a component inside another and outside its slots is drawn by that component (a status bar's divider), not placed by
// the screen; what a slot holds is the screen's. The screen itself, even when it is an instance, is no one's scope.
export function screenScopes(tree) {
  const scope = new Map(), own = new Set();
  const walk = (n, owner, inSlot, depth) => {
    if (!n || typeof n !== 'object') return;
    if (depth > 0 && n.kind === 'instance') { scope.set(n, owner); if (owner && !inSlot) own.add(n); }
    const holder = depth > 0 && n.kind === 'instance';
    for (const k of n.children ?? []) walk(k, holder ? n : owner, holder ? false : inSlot || n.type === 'SLOT', depth + 1);
  };
  walk(tree, null, false, 0);
  return { scope, own };
}

// One screen against the product's page. figma, page: [{ component, x, y, w, h }] (the screen's instances, the page's
// components, both from the screen's top left corner); a screen's instance may name its scope (screenScopes), and only
// components in the same scope are neighbours: a switch in the side panel and a badge in the status bar beside it are
// not. → [{ kind, component, message }]
export function screenFindings(screenName, figma, page, { tolerance = 2 } = {}) {
  const out = [];
  const F = readingOrder(figma), P = readingOrder(page);
  const names = [...new Set([...F, ...P].map((b) => b.component))];
  // How far the page as a whole sits from the screen (a window title bar Figma draws above the page): the shift the
  // components found once on each side share, taken off before same-named ones are paired by where they sit.
  const median = (v) => { const a = [...v].sort((x, y) => x - y); return a.length ? a[Math.floor(a.length / 2)] : 0; };
  const once = names.filter((n) => F.filter((b) => b.component === n).length === 1 && P.filter((b) => b.component === n).length === 1);
  const dx = median(once.map((n) => P.find((b) => b.component === n).x - F.find((b) => b.component === n).x));
  const dy = median(once.map((n) => P.find((b) => b.component === n).y - F.find((b) => b.component === n).y));
  const pairs = [];
  for (const name of names) {
    const f = F.filter((b) => b.component === name), p = P.filter((b) => b.component === name);
    // Three or more of one component is a list: how many the page shows is its data, not its layout. Only whether it
    // shows one, and where the first one sits, are compared.
    if (f.length >= 3 || p.length >= 3) {
      if (!p.length) out.push({ kind: 'missing', component: name, message: `"${screenName}" has a list of ${name}; the page shows none` });
      else if (!f.length) out.push({ kind: 'extra', component: name, message: `the page shows a list of ${name}; "${screenName}" has none` });
      else pairs.push({ id: `${name}#0`, component: name, f: f[0], p: p[0], list: true });
      continue;
    }
    if (f.length > p.length) out.push({ kind: 'missing', component: name, message: `"${screenName}" has ${f.length} ${name}${f.length > 1 ? 's' : ''}; the page shows ${p.length || 'none'}` });
    else if (p.length > f.length) out.push({ kind: 'extra', component: name, message: `the page shows ${p.length} ${name}${p.length > 1 ? 's' : ''}; "${screenName}" has ${f.length || 'none'}` });
    // Two of one component (a switch in the side panel, another in the status bar) are paired by place, the nearest
    // first, not by their order: a few pixels can put either one first.
    const near = [];
    for (let i = 0; i < f.length; i++) for (let j = 0; j < p.length; j++) near.push([Math.hypot(p[j].x - dx - f[i].x, p[j].y - dy - f[i].y), i, j]);
    const usedF = new Set(), usedP = new Set();
    for (const [, i, j] of near.sort((a, b) => a[0] - b[0])) { if (usedF.has(i) || usedP.has(j)) continue; usedF.add(i); usedP.add(j); pairs.push({ id: `${name}#${i}`, component: name, f: f[i], p: p[j] }); }
  }
  const byF = readingOrder(pairs.map((x) => ({ ...x.f, id: x.id }))).map((b) => b.id);
  const byP = readingOrder(pairs.map((x) => ({ ...x.p, id: x.id }))).map((b) => b.id);
  const kept = lcs(byF, byP);
  // Out of order only against a component it shares a column or a row with on the screen, the other way round on the
  // page. Two columns side by side have no order between them: a list beside an empty state is not out of order
  // because the list is longer on the page.
  const flipped = new Set();
  for (let i = 0; i < pairs.length; i++) for (let j = i + 1; j < pairs.length; j++) {
    const A = pairs[i], B = pairs[j];
    if (A.f.scope !== B.f.scope) continue;
    const col = A.f.x < B.f.x + B.f.w && B.f.x < A.f.x + A.f.w, row = A.f.y < B.f.y + B.f.h && B.f.y < A.f.y + A.f.h;
    const way = (a, b) => Math.sign(Math.round(a - b));
    const turned = col && !row ? way(A.f.y, B.f.y) * way(A.p.y, B.p.y) < 0 : row && !col ? way(A.f.x, B.f.x) * way(A.p.x, B.p.x) < 0 : false;
    if (turned) { flipped.add(A.id); flipped.add(B.id); }
  }
  for (const id of byF.filter((x) => !kept.has(x) && flipped.has(x))) {
    const at = byP.indexOf(id), atF = byF.indexOf(id), comp = id.split('#')[0];
    const before = (list, i) => (i > 0 ? list[i - 1].split('#')[0] : null);
    out.push({ kind: 'order', component: comp, message: `${comp} is out of the screen's order: on the page it comes ${before(byP, at) ? `after ${before(byP, at)}` : 'first'}, on "${screenName}" ${before(byF, atF) ? `after ${before(byF, atF)}` : 'first'}` });
  }
  // Neighbours in the screen's order, both on the page: the space between them and their alignment.
  const pairOf = new Map(pairs.map((x) => [x.id, x]));
  for (let i = 1; i < byF.length; i++) {
    const B = pairOf.get(byF[i]);
    // Its neighbour: the one before it in the screen's order within its own scope.
    let k = i - 1; while (k >= 0 && pairOf.get(byF[k]).f.scope !== B.f.scope) k--;
    if (k < 0) continue;
    const A = pairOf.get(byF[k]);
    // After a list, the space depends on how many it shows: only its first one stands for it.
    if (A.list) continue;
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
      const kept = found.filter((f) => !small.some((o) => o !== f && o.e !== f.e && o.e.contains(f.e)));
      // The component each one sits inside, the nearest: a component's own parts are told apart by it.
      return kept.map(({ e, ...b }) => { const holders = found.filter((o) => o.e !== e && o.e.contains(e)).sort((a, z) => a.w * a.h - z.w * z.h); const near = kept.filter((o) => holders.includes(o))[0]; return holders.length ? { ...b, ...(near ? { inside: near.component } : {}), within: [...new Set(holders.map((o) => o.component))] } : b; }); })()`;
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
      let setup = [...(cfg.frames ?? []), ...(cfg.screens ?? [])].find((d) => String(d.nodeId ?? '').replace('-', ':') === String(s.id ?? '').replace('-', ':'))?.setup ?? null;
      // A setup can also be a script file named from the project's root (screens/results.js): a long one reads better.
      if (typeof setup === 'string' && /^[\w./-]+\.m?js$/.test(setup.trim()) && existsSync(resolve(ROOT, setup.trim()))) setup = readFileSync(resolve(ROOT, setup.trim()), 'utf8');
      const found = await readPageComponents(send, pathToFileURL(page.file).href, { width: s.tree?.w, height: s.tree?.h, sw: colour ? modeSwitch(colour) : null, classes, setup });
      if (!found) { out.notCompared.push(`"${s.name}" (${page.file} did not load)`); continue; }
      const { scope, own } = screenScopes(s.tree ?? {});
      // A screen that is itself one of the system's components (an overlay holding a modal or a loader) is a layer
      // drawn over the page: only what it holds is compared, and on the page only what sits inside that.
      const layer = s.tree?.kind === 'instance' && names.some((n) => key(n) === key(s.tree.component));
      const placed = screenInstances(s.tree ?? {}, catalog).filter((b) => Number.isFinite(b.x) && Number.isFinite(b.y) && !own.has(b.node) && !(layer && b.node === s.tree));
      const figma = placed.map((b) => ({ component: b.component, x: b.x, y: b.y, w: b.w, h: b.h, scope: scope.get(b.node) ?? null }));
      const held = layer ? new Set(placed.filter((b) => !scope.get(b.node)).map((b) => key(b.component))) : null;
      // The same parts on the page: a component inside one whose own part it is on the screen (the button an empty
      // state draws) is that component's, not the page's.
      const ownParts = new Set([...own].map((n) => `${key(scope.get(n)?.component)}>${key(n.component)}`));
      const pageFound = found.filter((b) => !(b.inside && ownParts.has(`${key(b.inside)}>${key(b.component)}`)))
        .filter((b) => !held || held.has(key(b.component)) || (b.within ?? []).some((w) => held.has(key(w))));
      // A page that opens in another state than the screen (empty before its data comes, a screen drawn with a list
      // loaded) would list every difference of that state: said once instead, with how to give it the screen's state.
      const kinds = new Set(figma.map((b) => b.component)), shown = new Set(pageFound.map((b) => b.component));
      const both = [...kinds].filter((k) => shown.has(k)).length, gone = kinds.size - both;
      if (gone >= 3 && gone / kinds.size > 1 / 3) { out.notCompared.push(`"${s.name}" (${product}'s page opens in another state: it shows ${both} of the screen's ${kinds.size} components${setup ? ', after its setup' : ''}. Give the screen a setup in ds-config.json (its frames or screens entry), a script that puts the page in the screen's state)`); continue; }
      out.screens.push({ name: s.name, product, page: page.file.replace(ROOT + '/', ''), width: s.tree?.w ?? null, findings: screenFindings(s.name, figma, pageFound.map(({ inside, within, ...b }) => b)) });
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
  return { _updated: new Date().toISOString(), _note: 'Designed screens read from Figma (screen-layout.mjs SCREEN_CAPTURE_JS), read only.', screens: body.screens, ...(Array.isArray(body.left) && body.left.length ? { left: body.left } : {}) };
}

// The screens kept so far with a new answer's: the new one wins for the same screen, only the screens ds-config.json
// still names are kept, in its order (ids: its frames and screens, "1-2" or "1:2").
export function mergeScreens(prev = [], fresh = [], ids = []) {
  const norm = (i) => String(i ?? '').replace('-', ':');
  const by = new Map([...prev, ...fresh].map((s) => [norm(s.id), s]));
  const order = ids.map(norm);
  return order.length ? order.filter((i) => by.has(i)).map((i) => by.get(i)) : [...by.values()];
}
