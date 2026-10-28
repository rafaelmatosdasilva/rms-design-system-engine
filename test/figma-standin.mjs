// test/figma-standin.mjs - a fictional Figma file sized like a large design system's, for the capture tests: about
// 1,900 variables in three collections (two modes, two modes, four modes), aliases, aliases to a library's variables,
// colours with alpha and with their own opacity, text styles bound to variables that change with a mode, and effect
// styles. Values are 32-bit floats, as Figma stores them. Everything is made up and the same on every run.

// A small seeded generator, so the file is the same on every run.
export function prng(seed = 1) {
  let s = seed >>> 0;
  return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const f32 = Math.fround;
const alias = (id) => ({ type: 'VARIABLE_ALIAS', id });

export function largeVarsFile(seed = 7) {
  const rnd = prng(seed), pick = (a) => a[Math.floor(rnd() * a.length)];
  const vars = {}, collections = [];
  let n = 1000;
  const vid = () => `VariableID:${n++}:${Math.floor(rnd() * 9000) + 100}`;
  const colour = (a = 1) => ({ r: f32(Math.floor(rnd() * 256) / 255 + (rnd() - 0.5) / 600), g: f32(Math.floor(rnd() * 256) / 255), b: f32(rnd()), a: f32(a) });
  const collection = (id, name, modes) => { const c = { id: `VariableCollectionId:${id}`, name, modes: modes.map((m, i) => ({ modeId: `${id.split(':')[0]}:${i}`, name: m })), variableIds: [] }; collections.push(c); return c; };
  const add = (c, name, resolvedType, values, more = {}) => {
    const id = vid();
    const valuesByMode = Object.fromEntries(c.modes.map((m, i) => [m.modeId, typeof values === 'function' ? values(i) : values]));
    vars[id] = { id, name, resolvedType, variableCollectionId: c.id, valuesByMode, scopes: ['ALL_SCOPES'], description: '', remote: false, ...more };
    c.variableIds.push(id);
    return id;
  };
  // A library's variables, which the file's own alias or bind.
  const library = [];
  const lib = (name, resolvedType, value, scopes = []) => {
    const id = `VariableID:${Array.from({ length: 40 }, () => Math.floor(rnd() * 16).toString(16)).join('')}/${n++}:${Math.floor(rnd() * 90) + 10}`;
    vars[id] = { id, name, resolvedType, variableCollectionId: 'VariableCollectionId:9f1c2e7a5b3d4c6e8f0a1b2c3d4e5f6a7b8c9d0e/12:9', valuesByMode: { '12:0': value }, scopes, description: '', remote: true };
    library.push(id);
    return id;
  };
  const libColours = Array.from({ length: 15 }, (_, i) => lib(`brand/accent/${i * 100 + 50}`, 'COLOR', colour()));
  const libFamily = lib('font/family/display', 'STRING', 'Fictional Sans Display');
  const libWeight = lib('font/weight/display', 'FLOAT', 650);

  // Primitives: two modes; most values the same in both.
  const prim = collection('101:2', 'Primitives', ['Default', 'High contrast']);
  const hues = ['slate', 'gray', 'zinc', 'stone', 'red', 'orange', 'amber', 'yellow', 'lime', 'green', 'emerald', 'teal', 'cyan', 'sky', 'blue', 'indigo', 'violet', 'purple', 'fuchsia', 'pink', 'rose', 'sand', 'moss', 'clay', 'ink', 'pearl'];
  const steps = [25, 50, 75, 100, 150, 200, 250, 300, 350, 400, 450, 500, 550, 600, 650, 700, 750, 800, 850, 900];
  const palette = [];
  for (const h of hues) for (const s of steps) {
    const base = colour(), hc = rnd() < 0.25 ? colour() : base;
    palette.push(add(prim, `primitives/color/${h}/${s}`, 'COLOR', (i) => (i ? hc : base), { scopes: [] }));
  }
  const alphas = [];
  for (const h of ['black', 'white']) for (const a of [4, 8, 12, 16, 24, 32, 40, 48, 56, 64, 72, 80]) alphas.push(add(prim, `primitives/color/alpha/${h}/${a}`, 'COLOR', { ...(h === 'black' ? { r: 0, g: 0, b: 0 } : { r: 1, g: 1, b: 1 }), a: f32(a / 100) }, { scopes: [] }));
  const space = [], radius = [], fontSize = [], lineHeight = [], weight = [];
  for (let i = 0; i < 40; i++) space.push(add(prim, `primitives/space/${i * 2}`, 'FLOAT', i * 2, { scopes: [] }));
  for (let i = 0; i < 16; i++) radius.push(add(prim, `primitives/radius/${i}`, 'FLOAT', i < 12 ? i * 2 : 999, { scopes: [] }));
  for (let i = 0; i < 24; i++) fontSize.push(add(prim, `primitives/font/size/${i}`, 'FLOAT', 10 + i * 2, { scopes: [] }));
  for (let i = 0; i < 24; i++) lineHeight.push(add(prim, `primitives/font/line-height/${i}`, 'FLOAT', f32((10 + i * 2) * 1.35), { scopes: [] }));
  for (const w of [100, 200, 300, 400, 500, 600, 700, 800, 900]) weight.push(add(prim, `primitives/font/weight/${w}`, 'FLOAT', w, { scopes: [] }));
  for (let i = 0; i < 12; i++) add(prim, `primitives/opacity/${i * 8}`, 'FLOAT', f32(i * 0.08), { scopes: [] });
  for (let i = 0; i < 14; i++) add(prim, `primitives/duration/${i}`, 'FLOAT', f32(0.05 * (i + 1)), { scopes: [] });
  // Strings that look like the compact form's own marks, a colour whose alpha rounds to ff, a number that is no 32-bit float.
  add(prim, 'primitives/text/tilde', 'STRING', '~ approx', { scopes: ['TEXT_CONTENT'] });
  add(prim, 'primitives/text/hash', 'STRING', '#not-a-colour', { scopes: ['TEXT_CONTENT'] });
  add(prim, 'primitives/color/edge', 'COLOR', { r: 0, g: 0, b: 0, a: f32(0.999) }, { scopes: [] });
  add(prim, 'primitives/ratio/golden', 'FLOAT', 1.618033988749895, { scopes: [] });
  const families = [];
  for (const fam of ['Fictional Sans', 'Fictional Serif', 'Fictional Mono']) families.push(add(prim, `primitives/font/family/${fam.split(' ')[1].toLowerCase()}`, 'STRING', fam, { scopes: ['FONT_FAMILY'] }));

  // Theme: two modes; every colour an alias to a primitive, some with their own opacity, some to the library.
  const theme = collection('202:7', 'Theme', ['Light', 'Dark']);
  const roles = ['background', 'surface', 'text', 'icon', 'border', 'outline', 'overlay'];
  const parts = ['button', 'input', 'card', 'chip', 'tab', 'menu', 'dialog', 'toast', 'badge', 'table', 'nav', 'link', 'toggle', 'slider', 'avatar', 'tooltip', 'banner', 'stepper', 'list', 'sheet'];
  const kinds = ['primary', 'secondary', 'tertiary', 'danger', 'success', 'warning', 'neutral'];
  const states = ['default', 'hover', 'pressed', 'focus', 'disabled', 'selected', 'on'];
  const scopesFor = { background: ['FRAME_FILL', 'SHAPE_FILL'], surface: ['FRAME_FILL', 'SHAPE_FILL'], text: ['TEXT_FILL'], icon: ['SHAPE_FILL', 'STROKE_COLOR'], border: ['STROKE_COLOR'], outline: ['STROKE_COLOR'], overlay: ['ALL_FILLS'] };
  let t = 0;
  for (const p of parts) for (const k of kinds) for (const s of states) {
    if (t >= 900) break;
    if (rnd() < 0.05) continue;
    const role = roles[t % roles.length];
    const x = rnd();
    const values = x < 0.04 ? (i) => ({ color: alias(pick(palette)), opacity: i ? 16 : 8 })
      : x < 0.06 ? () => alias(pick(libColours))
      : x < 0.08 ? (i) => colour(i ? 0.88 : 0.72)
      : x < 0.1 ? () => alias(pick(alphas))
      : (() => { const l = pick(palette), d = pick(palette); return (i) => alias(i ? d : l); })();
    add(theme, `color/${p}/${k}/${role}/${s}`, 'COLOR', values, { scopes: rnd() < 0.15 ? ['ALL_SCOPES'] : scopesFor[role], description: rnd() < 0.05 ? `Use on the ${p} when ${s}. Contrast checked on both modes.${rnd() < 0.3 ? ' @deprecated use the neutral one' : ''}` : '' });
    t++;
  }
  for (let i = 0; i < 10; i++) add(theme, `feature/flag/${i}`, 'BOOLEAN', (m) => (m + i) % 3 === 0);

  // Sizing: four modes (Desktop, Laptop, Tablet, Phone); aliases to the primitives, a value of its own now and then.
  const size = collection('303:4', 'Sizing', ['Desktop', 'Laptop', 'Tablet', 'Phone']);
  const typo = {};
  const scales = ['display-l', 'display-m', 'display-s', 'headline-l', 'headline-m', 'headline-s', 'title-l', 'title-m', 'title-s', 'body-l', 'body-m', 'body-s', 'label-l', 'label-m', 'label-s', 'caption', 'overline'];
  scales.forEach((sc, i) => {
    const big = 16 - Math.min(i, 15);
    typo[sc] = {
      size: add(size, `typography/${sc}/font-size`, 'FLOAT', (m) => alias(fontSize[Math.max(0, big - m)]), { scopes: ['FONT_SIZE'] }),
      lh: add(size, `typography/${sc}/line-height`, 'FLOAT', (m) => alias(lineHeight[Math.max(0, big - m)]), { scopes: ['LINE_HEIGHT'] }),
      ls: add(size, `typography/${sc}/letter-spacing`, 'FLOAT', (m) => f32(i < 6 ? -0.4 + m * 0.1 : 0.15), { scopes: ['LETTER_SPACING'] }),
      w: add(size, `typography/${sc}/font-weight`, 'FLOAT', alias(weight[i < 9 ? 6 : 3]), { scopes: ['FONT_WEIGHT'] }),
    };
  });
  let k = 0;
  for (const p of parts) for (const what of ['padding-x', 'padding-y', 'gap', 'radius', 'height', 'min-width', 'icon-size', 'border-width', 'offset', 'inset', 'max-width', 'shadow-blur', 'focus-ring', 'divider']) {
    if (k++ >= 310 - 68) break;
    const x = rnd();
    const values = x < 0.55 ? (() => { const a = Math.floor(rnd() * 30); return (m) => alias(space[Math.max(0, a - m * (rnd() < 0.5 ? 1 : 0))]); })()
      : x < 0.75 ? alias(pick(radius))
      : x < 0.9 ? (m) => f32(1.25 + m * 0.33)
      : f32(rnd() * 40);
    add(size, `size/${p}/${what}`, 'FLOAT', values, { scopes: [what === 'radius' ? 'CORNER_RADIUS' : what === 'gap' ? 'GAP' : what.startsWith('padding') ? 'GAP' : 'WIDTH_HEIGHT'] });
  }

  // Text styles, each bound to Sizing's variables (which change with the mode), one to the library's family.
  const texts = scales.map((sc, i) => ({
    id: `S:${Array.from({ length: 40 }, () => Math.floor(rnd() * 16).toString(16)).join('')},${400 + i}:${i * 3}`,
    name: `${sc.split('-')[0]}/${sc.split('-')[1] ?? 'regular'}`,
    fontSize: 28 - i, fontName: { family: i < 6 ? 'Fictional Sans Display' : 'Fictional Sans', style: i < 9 ? 'Semi Bold' : 'Regular' },
    lineHeight: i % 4 === 3 ? { unit: 'AUTO' } : { unit: 'PIXELS', value: f32((28 - i) * 1.35) },
    letterSpacing: { unit: i % 2 ? 'PERCENT' : 'PIXELS', value: f32(i < 6 ? -0.5 : 0.25) },
    paragraphSpacing: i === 10 ? 12 : 0, textCase: i === 16 ? 'UPPER' : 'ORIGINAL',
    boundVariables: { fontSize: alias(typo[sc].size), lineHeight: alias(typo[sc].lh), letterSpacing: alias(typo[sc].ls), fontWeight: alias(i < 6 ? libWeight : typo[sc].w), ...(i < 6 ? { fontFamily: alias(libFamily) } : { fontFamily: alias(families[0]) }) },
    description: i === 0 ? 'The largest heading.' : '',
  }));
  // Effect styles: drop and inner shadows, one with its colour bound to a variable.
  const effects = Array.from({ length: 27 }, (_, i) => ({
    id: `S:${Array.from({ length: 40 }, () => Math.floor(rnd() * 16).toString(16)).join('')},${700 + i}:1`,
    name: `elevation/${['raised', 'overlay', 'floating', 'modal', 'focus', 'inset', 'pressed', 'sticky', 'popover'][i % 9]}/${Math.floor(i / 9) + 1}`,
    effects: Array.from({ length: 1 + (i % 3) }, (_, j) => ({ type: i % 9 === 5 ? 'INNER_SHADOW' : 'DROP_SHADOW', color: { r: f32(0.06), g: f32(0.09), b: f32(0.16), a: f32(0.04 + j * 0.06 + i * 0.003) }, offset: { x: 0, y: f32(1 + j * 2 + i * 0.5) }, radius: f32(2 + j * 4 + i), spread: j === 2 ? -2 : 0, visible: true, blendMode: 'NORMAL', showShadowBehindNode: false,
      boundVariables: i === 4 && j === 0 ? { color: alias(pick(palette)) } : {} })),
  }));
  return { vars, collections, texts, effects, library };
}

// The Plugin API the capture scripts read, over a stand-in file.
export const asFigma = (f) => ({
  variables: {
    getLocalVariableCollectionsAsync: async () => f.collections,
    getVariableByIdAsync: async (id) => f.vars[id] ?? null,
    getLocalVariablesAsync: async () => f.collections.flatMap((c) => c.variableIds.map((id) => f.vars[id])),
  },
  getLocalTextStylesAsync: async () => f.texts,
  getLocalEffectStylesAsync: async () => f.effects,
});

// ── Components: layers that throw where the Figma tool throws, and a file of about 200 component sets ──
export const MIXED = Symbol('mixed');
export const rgb = (r, g, b) => ({ r, g, b });
export const solid = (color, varId, more = {}) => ({ type: 'SOLID', visible: true, opacity: 1, color, ...(varId ? { boundVariables: { color: { type: 'VARIABLE_ALIAS', id: varId } } } : {}), ...more });
export const bound = (id) => ({ type: 'VARIABLE_ALIAS', id });

// The Figma tool throws on reading a property a layer type does not have ("no such property 'fills' on GROUP node").
export const STRICT = new Set(['fills', 'strokes', 'strokeWeight', 'cornerRadius', 'topLeftRadius', 'topRightRadius', 'bottomLeftRadius', 'bottomRightRadius', 'rectangleCornerRadii',
  'layoutMode', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft', 'itemSpacing', 'styles', 'style', 'componentId', 'detachedInfo', 'isMask', 'layoutPositioning',
  'fillStyleId', 'strokeStyleId', 'fontSize']);
// A layer with what the recipes' functions read, its children's parent set and their place on the canvas. A group has
// no fills or strokes; a text no layout.
let layerIds = 0;
export function node(props, children = []) {
  const shape = props.type === 'GROUP' || props.type === 'TEXT' ? {} : { fills: [], strokes: [] };
  const raw = { id: `L:${++layerIds}`, visible: true, opacity: 1, ...shape, boundVariables: {}, x: 0, y: 0, width: 80, height: 32, componentPropertyReferences: null, ...props, children };
  const n = new Proxy(raw, { get(t, k) { if (typeof k === 'string' && STRICT.has(k) && !(k in t)) throw new Error(`no such property '${k}' on ${t.type} node`); return t[k]; } });
  for (const c of children) c.parent = n;
  Object.defineProperty(raw, 'absoluteBoundingBox', { get() { const p = raw.parent?.absoluteBoundingBox ?? { x: 0, y: 0 }; return { x: p.x + raw.x, y: p.y + raw.y, width: raw.width, height: raw.height }; } });
  raw.findAll = (pred) => { const out = []; const walk = (x) => { for (const c of x.children ?? []) { if (!pred || pred(c)) out.push(c); walk(c); } }; walk(n); return out; };
  raw.findOne = (pred) => raw.findAll(pred)[0] ?? null;
  raw.findAllWithCriteria = ({ types }) => raw.findAll((c) => types.includes(c.type));
  return n;
}
export const frame = (props, children) => node({ type: 'FRAME', layoutMode: 'HORIZONTAL', paddingTop: 4, paddingRight: 12, paddingBottom: 4, paddingLeft: 12, itemSpacing: 4,
  cornerRadius: 8, topLeftRadius: 8, topRightRadius: 8, bottomRightRadius: 8, bottomLeftRadius: 8, layoutSizingHorizontal: 'HUG', layoutSizingVertical: 'FIXED', minHeight: null, minWidth: null, maxWidth: null,
  primaryAxisAlignItems: 'CENTER', counterAxisAlignItems: 'CENTER', layoutWrap: 'NO_WRAP', strokeWeight: 1, strokeAlign: 'INSIDE', dashPattern: [], fillStyleId: '', strokeStyleId: '', detachedInfo: null, ...props }, children);
export const label = (props = {}) => node({ type: 'TEXT', name: 'Label', width: 40, height: 20, x: 12, y: 6, fontSize: 14, fontName: { family: 'Inter', style: 'Medium' }, lineHeight: { unit: 'PIXELS', value: 20 },
  letterSpacing: { unit: 'PERCENT', value: 0 }, textCase: 'ORIGINAL', textDecoration: 'NONE', textAlignHorizontal: 'LEFT', textStyleId: 'S:m', fills: [solid(rgb(1, 1, 1), 'v-text')], boundVariables: { fills: [bound('v-text')] }, ...props });
export const icon = (props = {}) => node({ type: 'INSTANCE', name: 'Icon', width: 16, height: 16, x: 4, y: 8, ...props }, [node({ type: 'VECTOR', name: 'Vector', width: 16, height: 16, fills: [solid(rgb(1, 1, 1), 'v-text')] })]);

// The Plugin API the components capture reads, over a stand-in file with one page ({ page, vars }).
export const asComponentsFigma = (f) => {
  const all = () => [f.page, ...f.page.findAll()];
  return {
    mixed: MIXED,
    root: { children: [f.page], findAllWithCriteria: (c) => f.page.findAllWithCriteria(c) },
    currentPage: f.page,
    setCurrentPageAsync: async () => { throw new Error('the capture switched the page: that changes the file'); },
    getNodeByIdAsync: async (id) => all().find((x) => x.id === id) ?? null,
    getStyleByIdAsync: async (id) => (id.startsWith('S:') ? { id, name: `Body/${id.slice(2)}` } : null),
    variables: { getLocalVariablesAsync: async () => Object.values(f.vars), getVariableByIdAsync: async (id) => f.vars[id] ?? null },
  };
};

// About 200 component sets of 2 to 12 variants (a State axis, often a Size or a Type), each variant an auto-layout
// frame bound to spacing and radius variables, with a background, an icon, a label, parts of its own and, now and
// then, a nested content frame; props of every kind, notes and descriptions.
export function largeComponentsFile(seed = 11, count = 200) {
  const rnd = prng(seed), pick = (a) => a[Math.floor(rnd() * a.length)];
  const vars = {};
  let n = 1;
  const v = (name) => { const id = `VariableID:${n++}:${Math.floor(rnd() * 900) + 100}`; vars[id] = { id, name }; return id; };
  const sp = Array.from({ length: 12 }, (_, i) => v(`size/space/${i * 2}`)), rad = Array.from({ length: 6 }, (_, i) => v(`size/radius/${i * 2}`));
  const kinds = ['primary', 'secondary', 'tertiary', 'danger', 'neutral'], states = ['Default', 'Hover', 'Pressed', 'Focus', 'Disabled', 'Selected'];
  const names = ['button', 'icon-button', 'input', 'select', 'checkbox', 'radio', 'switch', 'chip', 'tag', 'badge', 'avatar', 'card', 'tab', 'tabs', 'menu-item', 'menu', 'tooltip', 'toast',
    'banner', 'dialog', 'sheet', 'drawer', 'stepper', 'slider', 'progress', 'spinner', 'table-row', 'table-cell', 'list-item', 'nav-item', 'breadcrumb', 'pagination', 'link', 'divider',
    'search', 'date-field', 'time-field', 'segmented', 'accordion', 'empty-state'];
  const token = (part, kind, role, state) => vars[`t:${part}/${kind}/${role}/${state}`]?.id ?? (vars[`t:${part}/${kind}/${role}/${state}`] = { id: v(`color/${part}/${kind}/${role}/${state.toLowerCase()}`) }).id;
  const sets = [];
  for (let i = 0; i < count; i++) {
    const part = names[i % names.length] + (i >= names.length ? `-${Math.floor(i / names.length) + 1}` : ''), kind = pick(kinds);
    const axes = [['State', states.slice(0, 2 + Math.floor(rnd() * 3))]];
    if (rnd() < 0.25) axes.push(['Size', ['S', 'M', 'L'].slice(0, 2 + Math.floor(rnd() * 2))]);
    if (rnd() < 0.2) axes.push(['Type', ['Filled', 'Outlined']]);
    let combos = [[]];
    for (const [ax, vals] of axes) combos = combos.flatMap((c) => vals.map((x) => [...c, [ax, x]]));
    combos = combos.slice(0, 12);
    const base = 100 + i * 20;
    const parts = 1 + Math.floor(rnd() * 5), nested = rnd() < 0.4, withBg = rnd() < 0.6, withIcon = rnd() < 0.7;
    const variants = combos.map((c, j) => {
      const state = c.find(([a]) => a === 'State')[1], h = 24 + 8 * ['S', 'M', 'L'].indexOf(c.find(([a]) => a === 'Size')?.[1] ?? 'M');
      const bg = token(part, kind, 'background', state), fg = token(part, kind, 'text', state), br = token(part, kind, 'border', state);
      const p = Math.floor(rnd() * 6);
      return frame({ type: 'COMPONENT', id: `${base}:${j + 1}`, name: c.map(([a, x]) => `${a}=${x}`).join(', '), height: h, width: 64 + Math.floor(rnd() * 120), opacity: state === 'Disabled' ? 0.5 : 1,
        fills: [solid({ r: Math.fround(rnd()), g: Math.fround(rnd()), b: Math.fround(rnd()) }, bg)], strokes: rnd() < 0.5 ? [solid({ r: Math.fround(0.8), g: Math.fround(0.8), b: Math.fround(0.82) }, br)] : [],
        boundVariables: { paddingTop: bound(sp[p]), paddingBottom: bound(sp[p]), paddingLeft: bound(sp[p + 2]), paddingRight: bound(sp[p + 2]), itemSpacing: bound(sp[1 + (p % 3)]), topLeftRadius: bound(rad[p % 6]), fills: [bound(bg)] } }, [
        ...(withBg ? [node({ type: 'RECTANGLE', name: 'Background', width: 80, height: h, layoutPositioning: 'ABSOLUTE', fills: [solid({ r: Math.fround(rnd()), g: Math.fround(rnd()), b: Math.fround(rnd()) }, bg, { opacity: Math.fround(0.08 * (1 + (j % 3))) })], boundVariables: { fills: [bound(bg)] } })] : []),
        ...(withIcon ? [icon({ id: `${base}:${j + 1}:1`, componentPropertyReferences: { visible: `Show icon#${base}:7`, mainComponent: `Icon#${base}:8` } })] : []),
        label({ id: `${base}:${j + 1}:2`, characters: part, textStyleId: `S:${pick(['s', 'm', 'l'])}`, componentPropertyReferences: { characters: `Label#${base}:9` }, fills: [solid({ r: 1, g: 1, b: 1 }, fg)], boundVariables: { fills: [bound(fg)] },
          annotations: j === 0 && rnd() < 0.3 ? [{ label: `The ${part} label names what it does.` }] : [] }),
        ...Array.from({ length: parts }, (_, k) => frame({ name: `${['Leading', 'Trailing', 'Indicator', 'Helper', 'Counter'][k]} part`, width: 8 + k * 4, height: 8, layoutMode: 'NONE', cornerRadius: 0, topLeftRadius: 0, topRightRadius: 0, bottomRightRadius: 0, bottomLeftRadius: 0,
          fills: [solid({ r: Math.fround(rnd()), g: Math.fround(rnd()), b: Math.fround(rnd()) }, k % 2 ? token(part, kind, 'icon', state) : null)] }, [])),
        ...(nested ? [frame({ name: 'Content', layoutMode: 'VERTICAL', boundVariables: { itemSpacing: bound(sp[2]) }, width: 120, height: 40 }, [label({ name: 'Title', fills: [solid({ r: 0, g: 0, b: 0 }, fg)] }), label({ name: 'Supporting text', fontSize: 12, fills: [solid({ r: 0.3, g: 0.3, b: 0.3 }, token(part, kind, 'text-muted', state))] })])] : []),
      ]);
    });
    const defs = Object.fromEntries([...axes.map(([ax, vals]) => [ax, { type: 'VARIANT', defaultValue: vals[0], variantOptions: vals }]),
      ...(withIcon ? [[`Show icon#${base}:7`, { type: 'BOOLEAN', defaultValue: true }], [`Icon#${base}:8`, { type: 'INSTANCE_SWAP', defaultValue: '9:1', preferredValues: [] }]] : []),
      [`Label#${base}:9`, { type: 'TEXT', defaultValue: part }]]);
    sets.push(node({ type: 'COMPONENT_SET', id: `${base}:0`, name: part, description: rnd() < 0.7 ? `The ${part}: use it for one ${kind} action.` : '', annotations: rnd() < 0.3 ? [{ label: `Role: ${part}` }] : [], componentPropertyDefinitions: defs }, variants));
  }
  const page = node({ type: 'PAGE', id: '0:1', name: 'Components', loadAsync: async () => {} }, sets);
  for (const k of Object.keys(vars)) if (k.startsWith('t:')) delete vars[k];
  return { page, vars, sets };
}
