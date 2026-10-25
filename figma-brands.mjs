// figma-brands.mjs - a system's brands: Figma's extended collections, each a skin over the system's own collections
// (its colours, its sizes) that overrides some of their variables. The code stays the same; only the variables differ.
// The style guide shows every component, and the Showroom's screens, in each brand.
//
//   brandsCaptureScript({ collection, from, count }) → the read-only Plugin API script (it changes nothing in Figma)
//   readBrandsWith(run, { log })                     → the snapshot, read a collection (and a part of one) at a time
//   brandsSnapshot(answers)                          → { _read, _file, collections: [{ name, parent, root, overrides }] }
//   brandList(snap)                                  → [{ key, name, parent, overrides: { variable: { mode: value } } }],
//                                                      each brand with what it inherits from the brands above it
//   brandCss(brands, { vars, modes, toVar, scope })  → the CSS that puts each brand on the previews
//   brandsFromCss(files, { modes })                  → the same snapshot from brand stylesheets (a file a brand)
//
// The snapshot is the same whichever place the brands live in: Figma's extended collections today, the brands' own
// stylesheets in the code's repository later (each variable then named as the code names it, --primitives-green).
//
// A brand is the collections that share its name's first word (Acme and Acme Sizing are the brand Acme; Retail Styling is
// Retail), and its parent the brand its colour collection extends (Retail extends Acme). A brand whose collection extends
// the system's own is a brand of the system.

// The script run in Figma. With no collection, the extended collections: each one's name, the one it extends, the
// system collection at the root of the chain, its modes by name and how many variables it overrides. With one, its
// overrides from `from` (count of them): each variable by name, each value by the mode's name, an alias by the name of
// the variable it points at, a colour as hex.
export function brandsCaptureScript({ collection = null, from = 0, count = 150, root = false } = {}) {
  return `// Read-only: the extended variable collections of this file and what they override. It changes nothing.
const hex = (c) => { const h = (n) => Math.round(n * 255).toString(16).padStart(2, '0'); return '#' + h(c.r) + h(c.g) + h(c.b) + (c.a != null && c.a < 1 ? h(c.a) : ''); };
const names = new Map();
async function nameOf(id) { if (names.has(id)) return names.get(id); let v = null; try { v = await figma.variables.getVariableByIdAsync(id); } catch (e) {} names.set(id, v ? v.name : null); return names.get(id); }
async function valueOf(v) {
  if (v && typeof v === 'object' && v.type === 'VARIABLE_ALIAS') return { alias: await nameOf(v.id) };
  if (v && typeof v === 'object' && 'r' in v) return hex(v);
  // A colour with an opacity of its own ({ color: <alias or colour>, opacity: 16 }): the alias kept with its opacity,
  // a colour written with its alpha times that opacity.
  if (v && typeof v === 'object' && 'color' in v) {
    const op = v.opacity == null ? 100 : Number(v.opacity);
    if (v.color && v.color.type === 'VARIABLE_ALIAS') return { alias: await nameOf(v.color.id), opacity: op };
    if (v.color && 'r' in v.color) return hex({ ...v.color, a: (v.color.a == null ? 1 : v.color.a) * op / 100 });
  }
  return v;
}
async function collectionName(id) { try { const c = await figma.variables.getVariableCollectionByIdAsync(id); return c ? c.name : null; } catch (e) { return null; } }
const all = (await figma.variables.getLocalVariableCollectionsAsync()).filter((c) => c.isExtension);
const WANT = ${JSON.stringify(collection)};
if (WANT == null) {
  const out = [];
  for (const c of all) out.push({ name: c.name, parent: await collectionName(c.parentVariableCollectionId), root: await collectionName(c.rootVariableCollectionId), modes: c.modes.map((m) => m.name), overridden: Object.keys(c.variableOverrides || {}).length });
  return JSON.stringify({ _read: new Date().toISOString(), _file: figma.root.name, collections: out });
}
const c = all.find((x) => x.name === WANT);
if (!c) return JSON.stringify({ collection: WANT, overrides: {}, next: null });
// With ROOT: the values of the collection the chain starts from (the system's published library), for each of its
// variables, by the root's mode names: what a brand is drawn on, where it differs from the code.
const ROOT = ${root ? 'true' : 'false'};
if (ROOT) {
  const top = await figma.variables.getVariableCollectionByIdAsync(c.rootVariableCollectionId);
  const rootModes = Object.fromEntries((top ? top.modes : []).map((m) => [m.modeId, m.name]));
  const ids = c.variableIds, FROM_R = ${Number(from) || 0}, COUNT_R = ${Number(count) || 150};
  const values = {};
  for (const id of ids.slice(FROM_R, FROM_R + COUNT_R)) {
    let v = null; try { v = await figma.variables.getVariableByIdAsync(id); } catch (e) {}
    if (!v) continue;
    const by = {};
    for (const [m, x] of Object.entries(v.valuesByMode || {})) if (rootModes[m]) by[rootModes[m]] = await valueOf(x);
    if (Object.keys(by).length) values[v.name] = by;
  }
  return JSON.stringify({ collection: WANT, library: values, next: FROM_R + COUNT_R < ids.length ? FROM_R + COUNT_R : null });
}
const modeName = Object.fromEntries(c.modes.map((m) => [m.modeId, m.name]));
const ids = Object.keys(c.variableOverrides || {});
const FROM = ${Number(from) || 0}, COUNT = ${Number(count) || 150};
const overrides = {};
for (const id of ids.slice(FROM, FROM + COUNT)) {
  const name = await nameOf(id); if (!name) continue;
  const by = {};
  for (const [m, v] of Object.entries(c.variableOverrides[id])) by[modeName[m] || m] = await valueOf(v);
  overrides[name] = by;
}
return JSON.stringify({ collection: WANT, overrides, next: FROM + COUNT < ids.length ? FROM + COUNT : null });
`;
}

const parseAnswer = (answer) => {
  const text = String(answer ?? '').trim();
  const at = text.indexOf('{'), end = text.lastIndexOf('}');
  if (at < 0 || end < at) throw new Error('no brands in the answer');
  let data = JSON.parse(text.slice(at, end + 1));
  if (typeof data === 'string') data = JSON.parse(data);
  return data;
};

// Every collection read through a runner (figma-cli eval: run(script) → what it printed), each in parts short enough
// for one answer, a part retried when the connection drops. → the snapshot.
export async function readBrandsWith(run, { count = 150, log = () => {}, wait = 8000 } = {}) {
  const ask = async (script) => {
    for (let tries = 0; tries < 3; tries++) {
      const out = String(await run(script) ?? '');
      if (/output cut at/i.test(out)) return { cut: true };
      if (/"collections"|"collection"/.test(out)) return parseAnswer(out);
      await new Promise((r) => setTimeout(r, wait));
    }
    throw new Error('no answer from Figma for the brands');
  };
  const list = await ask(brandsCaptureScript());
  if (list.cut || !Array.isArray(list.collections)) throw new Error('the list of extended collections did not come back whole');
  const answers = [list];
  for (const c of list.collections) {
    let from = 0, size = count;
    while (from != null) {
      const part = await ask(brandsCaptureScript({ collection: c.name, from, count: size }));
      if (part.cut) { if (size > 10) { size = Math.ceil(size / 3); continue; } throw new Error(`${c.name}: a part of ${size} variables is still too long for one answer`); }
      answers.push(part);
      from = part.next ?? null;
    }
    log(`${c.name}: ${c.overridden} variables it overrides read`);
    // A brand of the system (it extends the system's own collection): the library's values it is drawn on.
    if (!list.collections.some((x) => x.name === c.parent)) {
      let at = 0, size = 60;
      while (at != null) {
        const part = await ask(brandsCaptureScript({ collection: c.name, from: at, count: size, root: true }));
        if (part.cut) { if (size > 10) { size = Math.ceil(size / 2); continue; } throw new Error(`${c.name}: the library's values do not fit one answer`); }
        answers.push(part);
        at = part.next ?? null;
      }
      log(`${c.name}: the library's values it is drawn on read`);
    }
  }
  return brandsSnapshot(answers);
}

// The list, then each collection's parts (in any order), each a JSON string or the tool's wrapping of it.
export function brandsSnapshot(answers) {
  const parts = [].concat(answers).map((a) => (typeof a === 'object' && a && !Array.isArray(a) ? a : parseAnswer(a)));
  const list = parts.find((p) => Array.isArray(p.collections));
  if (!list) throw new Error('no list of extended collections in the answers');
  const collections = list.collections.map((c) => ({ name: c.name, parent: c.parent ?? null, root: c.root ?? null, modes: c.modes ?? [], overrides: {} }));
  for (const p of parts) {
    if (!p.collection) continue;
    const c = collections.find((x) => x.name === p.collection);
    if (c && p.library) c.library = Object.assign(c.library ?? {}, p.library);
    else if (c) Object.assign(c.overrides, p.overrides ?? {});
  }
  return { _read: list._read ?? new Date().toISOString(), ...(list._file ? { _file: list._file } : {}), collections };
}

// A brand's name: its collection's name less a word that says what kind of collection it is (Retail Styling → Retail,
// Acme Sizing → Acme).
const KIND_WORD = /\s+(styling|style|styles|sizing|sizes|theme|themes|colou?rs?|tokens?|variables?|spacing|typography)$/i;
export const brandOf = (name) => String(name ?? '').trim().replace(KIND_WORD, '').trim() || String(name ?? '').trim();
const keyOf = (name) => brandOf(name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

// The brands, each with what it overrides and what the brands above it override (its own winning), in the order a
// person reads them: each brand of the system, then the brands under it.
export function brandList(snap) {
  const cols = snap?.collections ?? [];
  const byName = new Map(cols.map((c) => [c.name, c]));
  const brands = new Map();
  for (const c of cols) {
    const key = keyOf(c.name);
    if (!brands.has(key)) brands.set(key, { key, name: brandOf(c.name), parent: null, own: {}, collections: [] });
    const b = brands.get(key);
    b.collections.push(c.name);
    // Its parent: the brand of the extended collection this one extends (a system collection is no brand).
    const up = c.parent && (byName.has(c.parent) || (c.root === 'stylesheet' && cols.some((x) => keyOf(x.name) === keyOf(c.parent)))) ? keyOf(c.parent) : null;
    if (up && up !== key) b.parent = up;
    for (const [v, by] of Object.entries(c.overrides ?? {})) b.own[v] = { ...(b.own[v] ?? {}), ...by };
  }
  const resolved = new Map();
  const resolve = (key, seen = new Set()) => {
    if (resolved.has(key)) return resolved.get(key);
    const b = brands.get(key);
    if (!b || seen.has(key)) return {};
    seen.add(key);
    const up = b.parent ? resolve(b.parent, seen) : {};
    const out = {};
    for (const [v, by] of Object.entries(up)) out[v] = { ...by };
    for (const [v, by] of Object.entries(b.own)) out[v] = { ...(out[v] ?? {}), ...by };
    resolved.set(key, out);
    return out;
  };
  const depth = (b) => (b.parent && brands.has(b.parent) ? 1 + depth(brands.get(b.parent)) : 0);
  const order = [...brands.values()].sort((a, b) => {
    const ra = a.parent ?? a.key, rb = b.parent ?? b.key;
    return ra === rb ? depth(a) - depth(b) || a.name.localeCompare(b.name) : ra.localeCompare(rb);
  });
  // Each brand's family: itself and every brand under it, so its own values reach them and each writes only its own.
  const family = (key) => [key, ...[...brands.values()].filter((x) => x.parent === key).flatMap((x) => family(x.key))];
  return order.map((b) => ({ key: b.key, name: b.name, parent: b.parent, collections: b.collections, own: Object.keys(b.own).length, ownOverrides: b.own, family: family(b.key), overrides: resolve(b.key) }));
}

// What a brand needs written for one mode: each variable it overrides, and each of the system's variables that points
// at one of those (all the way up its alias chain), written again so it reads the brand's value (a variable written as
// var(--other) takes the value it finds where it is declared, not where it is used). aliases: the system's alias map
// for that mode (variable → [the variable it points at, …]).
// A layer a brand switches off: a group's display (border/default/display, shadow/display, shadow/anyDisplay) set to
// false where the system shows it. The code has no variable for that switch, so the group's own variables are written
// so it draws nothing: each colour transparent, each offset, blur, spread and width 0. names: every variable of the
// system (each group's parts); baseValue(v): the system's own value of a variable in this mode.
const OFF_COLOUR = /colou?r$/i, OFF_SIZE = /^(x|y|blur|spread|width|borderWidth|strokeWidth|size)$/i;
export function hiddenLayers(overrides, mode, { names = [], baseValue = () => null } = {}) {
  const out = new Map();
  const off = (x) => x === false || x === 'false';
  for (const [v, by] of Object.entries(overrides ?? {})) {
    if (!/\/\w*[dD]isplay$/.test(v) || !by || !Object.prototype.hasOwnProperty.call(by, mode) || !off(by[mode])) continue;
    const group = v.replace(/\/[^/]+$/, '') + '/';
    for (const n of names) {
      if (!n.startsWith(group) || /\/\w*[dD]isplay$/.test(n)) continue;
      const last = n.slice(n.lastIndexOf('/') + 1);
      if (OFF_COLOUR.test(last)) out.set(n, 'transparent');
      else if (OFF_SIZE.test(last)) out.set(n, 0);
    }
  }
  return out;
}

// full: everything the brand has (its own and what the brands above it override), so a variable is followed through
// the brand's own links (Acme points the selected background at the app's), never the system's where a brand above
// changed them; a variable a brand above gives a value of its own points at nothing.
export function brandDeclarations(overrides, mode, aliases = {}, hidden = { names: [] }, full = overrides) {
  const links = { ...aliases };
  for (const [v, by] of Object.entries(full ?? {})) {
    if (!by || !Object.prototype.hasOwnProperty.call(by, mode)) continue;
    const x = by[mode];
    if (x && typeof x === 'object' && 'alias' in x) links[v] = [x.alias]; else delete links[v];
  }
  aliases = links;
  const out = new Map();
  for (const [v, by] of Object.entries(overrides ?? {})) if (by && Object.prototype.hasOwnProperty.call(by, mode)) out.set(v, by[mode]);
  for (const [v, val] of hiddenLayers(overrides, mode, hidden)) out.set(v, val);
  // What the brands above switch off stays off here too, whatever this brand re-links (the closure below would
  // otherwise give a border Acme hides Retail's colour again).
  const off = hiddenLayers(full, mode, hidden);
  const changed = new Set(out.keys());
  let grew = true;
  while (grew) {
    grew = false;
    for (const [v, chain] of Object.entries(aliases ?? {})) {
      const to = Array.isArray(chain) ? chain[0] : chain;
      if (!to || changed.has(v) || !changed.has(to)) continue;
      // Only a link the code can follow: what it points at is a variable the code declares, or one this brand writes.
      if (hidden.exists && !hidden.exists(to) && !out.has(to)) continue;
      // Written as the brand above links it (with its own opacity, Acme's lines at 3%), else as the system does.
      const own = full?.[v]?.[mode];
      out.set(v, own && typeof own === 'object' && own.alias === to ? own : { alias: to });
      changed.add(v);
      grew = true;
    }
  }
  for (const [v, val] of off) if (out.has(v)) out.set(v, val);
  return out;
}

// The CSS that puts each brand on what the page shows of the system: [data-brand="<key>"] on the page, each brand's
// values declared on the previews (scope) only, so the page around them keeps the system's own look. A mode is written
// where that mode applies: the base mode where no other is set, another where its attribute is (on the preview, on
// the page, or on a part inside the preview that has its own mode). A brand's block reaches the brands under it, each
// of which writes after it only what it changes (and what points at that), so the CSS grows with what differs.
// modes: [{ name, attr, value }] per axis, the base with no attr; toVar: Figma variable name → CSS variable;
// value(v): a value as CSS (an alias as var()).
export function brandCss(brands, { axes = [], aliases = {}, toVar, scope = '.pg-preview', unit = (v) => v, names = [], baseValue = () => null, exists = null } = {}) {
  const css = [];
  // An alias as var(); one with an opacity of its own mixed with transparent at that share (unless what it points at
  // has an opacity of its own already: Figma keeps that one, it does not multiply them); any other shape left out.
  let full = {}, mode = null;
  const seeThrough = (name) => { const x = full?.[name]?.[mode]; return (x && typeof x === 'object' && x.opacity != null && x.opacity < 100) || (typeof x === 'string' && /^#[0-9a-f]{8}$/i.test(x) && !/ff$/i.test(x)); };
  const css1 = (val, v) => {
    if (val && typeof val === 'object' && 'alias' in val) return val.alias ? (val.opacity != null && val.opacity < 100 && !seeThrough(val.alias) ? `color-mix(in srgb, var(${toVar(val.alias)}) ${val.opacity}%, transparent)` : `var(${toVar(val.alias)})`) : null;
    if (val && typeof val === 'object') return null;
    return unit(val, v);
  };
  const write = (decl) => [...decl].map(([v, val]) => { const c = css1(val, v); return c == null ? null : `  ${toVar(v)}: ${c};`; }).filter(Boolean).join('\n');
  for (const b of brands) {
    const fam = b.family ?? [b.key];
    const on = fam.length > 1 ? `:is(${fam.map((k) => `[data-brand="${k}"]`).join(', ')})` : `[data-brand="${b.key}"]`;
    for (const axis of axes) {
      for (const m of axis.modes) {
        full = b.overrides; mode = m.name;
        const decl = brandDeclarations(b.ownOverrides ?? b.overrides, m.name, aliases[m.key] ?? {}, { names, baseValue: (v) => baseValue(v, m.key), exists }, b.overrides);
        if (!decl.size) continue;
        let sel;
        if (!m.attr) {
          // The base mode: where none of the axis's other modes is set, or where the base is set again on purpose.
          const others = axis.modes.filter((x) => x.attr).map((x) => `[${x.attr}="${x.value}"]`);
          const not = others.length ? `:not(${others.join(', ')}, ${others.map((o) => o + ' *').join(', ')})` : '';
          sel = [`${on} :is(${scope})${not}`, ...(axis.baseValue ? [`${on} :is(${scope})[${axis.attr}="${axis.baseValue}"]`, `${on} :is(${scope}) [${axis.attr}="${axis.baseValue}"]`] : [])];
        } else {
          const at = `[${m.attr}="${m.value}"]`;
          const base = axis.baseValue ? `:not([${axis.attr}="${axis.baseValue}"])` : '';
          sel = [`${on}${at} :is(${scope})${base}`, `${on} ${at} :is(${scope})${base}`, `${on} :is(${scope})${at}`, `${on} :is(${scope}) ${at}`];
        }
        css.push(`${sel.join(',\n')} {\n${write(decl)}\n}`);
      }
    }
  }
  return css.join('\n');
}

// Brands kept as stylesheets (one file a brand, in the repository beside the system's own tokens): each block's variables
// are what that brand overrides, in the mode its selector names (a block with none of the modes' attributes is the base
// mode; [data-theme="dark"] is Dark). The brand is the file's name (acme.css is Acme), under the brand a comment names
// (/* extends: acme */). files: [{ name, css }]; modes: [{ name, cssSelector }] as ds-config.json lists them, every axis.
// → the snapshot brandList reads, each variable named as the code names it.
export function brandsFromCss(files = [], { modes = [] } = {}) {
  const attrOf = (sel) => { const m = /^data:([\w-]+)=(.+)$/.exec(String(sel ?? '')); return m ? { attr: m[1].startsWith('data-') ? m[1] : `data-${m[1]}`, value: m[2] } : null; };
  const byAttr = modes.map((m) => ({ name: m.name, at: attrOf(m.cssSelector) })).filter((m) => m.at);
  const base = modes.filter((m) => (m.cssSelector ?? 'root') === 'root').map((m) => m.name);
  const collections = [];
  for (const f of files) {
    const css = String(f.css ?? '').replace(/\/\*(?!\s*extends)[\s\S]*?\*\//g, '');
    const parent = /\/\*\s*extends:\s*([\w-]+)\s*\*\//i.exec(String(f.css ?? ''))?.[1] ?? null;
    const overrides = {};
    for (const m of css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}@]+)\{([^{}]*)\}/g)) {
      const sel = m[1];
      const hit = byAttr.filter((x) => new RegExp(`\\[${x.at.attr}=["']?${x.at.value}["']?\\]`).test(sel));
      const names = hit.length ? hit.map((x) => x.name) : base;
      for (const d of m[2].matchAll(/(--[\w-]+)\s*:\s*([^;]+);?/g)) {
        const v = d[2].trim(), alias = /^var\((--[\w-]+)\)$/.exec(v);
        for (const n of names) (overrides[d[1]] ??= {})[n] = alias ? { alias: alias[1] } : v;
      }
    }
    const name = String(f.name ?? 'brand').replace(/\.css$/i, '');
    collections.push({ name, parent, root: 'stylesheet', source: f.source ?? null, modes: [...new Set([...base, ...byAttr.map((x) => x.name)])], overrides });
  }
  return { _read: new Date().toISOString(), _source: 'stylesheets', collections };
}

// A brand's own family embedded in the page, so everyone sees it without having it (a family licensed for that): each
// font file in the project's fonts folder whose name starts with the family's (Acme-Bold.otf for acme), its weight and
// style from the rest of its name, one file each (the smallest format the folder has it in: woff2, woff, then ttf or otf).
// files: [{ name, data: Buffer }] → @font-face rules, the files written in as data.
const WEIGHTS = [['hairline', 100], ['thin', 100], ['extralight', 200], ['ultralight', 200], ['light', 300], ['book', 400], ['regular', 400], ['normal', 400], ['medium', 500], ['semibold', 600], ['demibold', 600], ['extrabold', 800], ['ultrabold', 800], ['bold', 700], ['black', 900], ['heavy', 900]];
export function fontFaces(family, files = []) {
  const sq = (x) => String(x).toLowerCase().replace(/[^a-z0-9]/g, '');
  const fam = sq(family);
  const FORMAT = { woff2: 'woff2', woff: 'woff', otf: 'opentype', ttf: 'truetype' }, MIME = { woff2: 'font/woff2', woff: 'font/woff', otf: 'font/otf', ttf: 'font/ttf' };
  const RANK = { woff2: 0, woff: 1, ttf: 2, otf: 2 };
  const pick = new Map();
  for (const f of files) {
    const ext = String(f.name).split('.').pop().toLowerCase(), base = sq(String(f.name).replace(/\.[^.]+$/, ''));
    if (!FORMAT[ext] || !base.startsWith(fam)) continue;
    const rest = base.slice(fam.length), italic = /italic|oblique/.test(rest), word = rest.replace(/italic|oblique/g, '');
    // A weight written as a number (inter-latin-700-normal.woff2), else as a word (Acme-Bold.otf).
    const num = /(?:^|[^0-9])([1-9]00)(?![0-9])/.exec(word);
    const weight = num ? +num[1] : (WEIGHTS.find(([w]) => word === w) ?? WEIGHTS.find(([w]) => word.includes(w)) ?? [null, 400])[1];
    const key = `${weight} ${italic}`, had = pick.get(key);
    if (!had || RANK[ext] < RANK[had.ext]) pick.set(key, { f, ext, weight, italic });
  }
  return [...pick.values()].map(({ f, ext, weight, italic }) => `@font-face { font-family: "${family}"; src: url(data:${MIME[ext]};base64,${Buffer.from(f.data).toString('base64')}) format("${FORMAT[ext]}"); font-weight: ${weight}; font-style: ${italic ? 'italic' : 'normal'}; font-display: swap; }`);
}

// What a brand is drawn on: the values of the library its collections extend (the system as published in Figma), where
// they differ from the code's own (the library's borders 2px, the code's 1px). Each such value joins the brand of the
// system that collection belongs to, under its own overrides, so the brand looks as Figma draws it.
// codeValue(variable, mode) → the code's value of a Figma variable in that mode (null when the code has none);
// toLiteral: the library's value with its links followed. → the snapshot with those values added.
export function onLibrary(snap, codeValue) {
  const norm = (v) => {
    if (v == null) return null;
    if (typeof v === 'number') return String(Math.round(v * 1000) / 1000);
    const t = String(v).trim().toLowerCase();
    const hex = /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/.exec(t);
    if (hex) { let h = hex[1]; if (h.length === 3) h = h.split('').map((c) => c + c).join(''); if (h.length === 8 && h.endsWith('ff')) h = h.slice(0, 6); return '#' + h; }
    const px = /^(-?[\d.]+)px$/.exec(t);
    return px ? String(Math.round(parseFloat(px[1]) * 1000) / 1000) : t.replace(/^["']|["']$/g, '');
  };
  const out = { ...snap, collections: (snap.collections ?? []).map((c) => ({ ...c, overrides: { ...c.overrides } })) };
  for (const c of out.collections) {
    if (!c.library) continue;
    const lit = (n, m, d = 0) => { const x = c.library[n]?.[m]; if (d > 12) return null; return x && typeof x === 'object' && 'alias' in x ? (x.opacity != null && x.opacity < 100 ? null : lit(x.alias, m, d + 1)) : x; };
    for (const [n, by] of Object.entries(c.library)) {
      for (const [m, v] of Object.entries(by)) {
        if (c.overrides[n] && Object.prototype.hasOwnProperty.call(c.overrides[n], m)) continue;
        // A layer's display switch: the code has no variable for it, so the library's own always joins (what it hides
        // stays hidden in every brand, unless a brand turns it on).
        if (/\/\w*[dD]isplay$/.test(n) && (v === false || v === true || v === 'false' || v === 'true')) { (c.overrides[n] ??= {})[m] = v; continue; }
        const code = codeValue(n, m);
        if (code == null) continue;
        const want = lit(n, m);
        if (want == null || typeof want === 'object' || norm(want) === norm(code)) continue;
        (c.overrides[n] ??= {})[m] = v;
      }
    }
  }
  return out;
}
