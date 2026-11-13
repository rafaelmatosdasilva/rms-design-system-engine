// A stand-in for Figma the build and change scripts run on (figma-ops.mjs opsScript), built from an invented system's
// capture: component sets of variants, instances, texts, variables in collections with modes, and auto layout that
// lays its children out side by side or top to bottom, so what a script built can be measured (layout-faults.mjs).
// Everything is made up and the same on every run.

export function standin(system) {
  let seq = 0;
  const reg = new Map();
  const TEXT_W = 7, TEXT_H = 20;
  class N {
    constructor(type, name, extra = {}) {
      Object.assign(this, { type, name, id: `${++seq}:1`, children: [], parent: null, x: 0, y: 0, _w: 100, _h: 40, visible: true, fills: [], strokes: [], boundVariables: {}, description: '', componentPropertyReferences: null, clipsContent: false, layoutMode: 'NONE', itemSpacing: 0, paddingTop: 0, paddingRight: 0, paddingBottom: 0, paddingLeft: 0, primaryAxisSizingMode: 'FIXED', counterAxisSizingMode: 'FIXED' }, extra);
      if (type === 'COMPONENT' || type === 'COMPONENT_SET') this.componentPropertyDefinitions = this.componentPropertyDefinitions ?? {};
      reg.set(this.id, this);
    }
    get auto() { return this.layoutMode && this.layoutMode !== 'NONE'; }
    get width() {
      if (this.type === 'TEXT') return String(this.characters ?? '').length * TEXT_W;
      if (this.type === 'INSTANCE') return this.mainComponent?.width ?? this._w;
      const hug = this.auto && (this.layoutMode === 'HORIZONTAL' ? this.primaryAxisSizingMode : this.counterAxisSizingMode) === 'AUTO';
      if (!hug) return this._w;
      const kids = this.children.filter((c) => c.visible && c.layoutPositioning !== 'ABSOLUTE');
      const inner = this.layoutMode === 'HORIZONTAL' ? kids.reduce((s, c) => s + c.width, 0) + Math.max(0, kids.length - 1) * this.itemSpacing : Math.max(0, ...kids.map((c) => c.width));
      return inner + this.paddingLeft + this.paddingRight;
    }
    get height() {
      if (this.type === 'TEXT') return TEXT_H;
      if (this.type === 'INSTANCE') return this.mainComponent?.height ?? this._h;
      const hug = this.auto && (this.layoutMode === 'VERTICAL' ? this.primaryAxisSizingMode : this.counterAxisSizingMode) === 'AUTO';
      if (!hug) return this._h;
      const kids = this.children.filter((c) => c.visible && c.layoutPositioning !== 'ABSOLUTE');
      const inner = this.layoutMode === 'VERTICAL' ? kids.reduce((s, c) => s + c.height, 0) + Math.max(0, kids.length - 1) * this.itemSpacing : Math.max(0, ...kids.map((c) => c.height));
      return inner + this.paddingTop + this.paddingBottom;
    }
    // Auto layout puts each child after the one before it.
    lay() {
      if (this.auto) {
        let at = this.layoutMode === 'HORIZONTAL' ? this.paddingLeft : this.paddingTop;
        for (const c of this.children.filter((k) => k.visible && k.layoutPositioning !== 'ABSOLUTE')) {
          if (this.layoutMode === 'HORIZONTAL') { c.x = at; c.y = this.paddingTop; at += c.width + this.itemSpacing; } else { c.y = at; c.x = this.paddingLeft; at += c.height + this.itemSpacing; }
        }
      }
      for (const c of this.children) c.lay();
    }
    // Figma lays a frame out again as soon as a child goes in.
    appendChild(c) { if (c.parent) c.parent.children.splice(c.parent.children.indexOf(c), 1); c.parent = this; this.children.push(c); this.lay(); }
    insertChild(i, c) { if (c.parent) c.parent.children.splice(c.parent.children.indexOf(c), 1); c.parent = this; this.children.splice(i, 0, c); this.lay(); }
    remove() { if (this.parent) this.parent.children.splice(this.parent.children.indexOf(this), 1); this.parent = null; reg.delete(this.id); }
    clone() {
      const copy = (n) => {
        const { id, children, parent, ...rest } = n;
        const c = new N(n.type, n.name, JSON.parse(JSON.stringify({ ...rest, mainComponent: undefined })));
        c.mainComponent = n.mainComponent;
        for (const k of n.children) c.appendChild(copy(k));
        return c;
      };
      return copy(this);
    }
    findAll(f = () => true) { const out = []; const walk = (n) => { for (const k of n.children) { if (f(k)) out.push(k); walk(k); } }; walk(this); return out; }
    findOne(f) { return this.findAll(f)[0] ?? null; }
    setBoundVariable(f, v) { if (v) this.boundVariables[f] = { type: 'VARIABLE_ALIAS', id: v.id }; else delete this.boundVariables[f]; }
    addComponentProperty(name, type, def) { const k = `${name}#${++seq}:0`; this.componentPropertyDefinitions[k] = { type, defaultValue: def }; return k; }
    editComponentProperty(k, { name, defaultValue }) { const d = this.componentPropertyDefinitions[k]; delete this.componentPropertyDefinitions[k]; if (defaultValue !== undefined) d.defaultValue = defaultValue; const nk = name ? `${name}#${k.split('#')[1]}` : k; this.componentPropertyDefinitions[nk] = d; return nk; }
    deleteComponentProperty(k) { delete this.componentPropertyDefinitions[k]; }
    resize(w, h) { this._w = w; this._h = h; this.primaryAxisSizingMode = 'FIXED'; this.counterAxisSizingMode = 'FIXED'; }
    resizeWithoutConstraints(w, h) { this._w = w; this._h = h; }
    get defaultVariant() { return this.children.find((c) => c.type === 'COMPONENT') ?? null; }
    createInstance() { return new N('INSTANCE', this.parent?.type === 'COMPONENT_SET' ? this.parent.name : this.name, { mainComponent: this }); }
    async loadAsync() {}
    async setTextStyleIdAsync(id) { this.textStyleId = id; }
  }

  // The system's variables, in collections with modes.
  const collections = new Map(), vars = [];
  for (const v of system.variables) {
    if (!collections.has(v.collection)) collections.set(v.collection, { id: `C:${collections.size + 1}`, name: v.collection, modes: (system.modes[v.collection] ?? ['default']).map((m, i) => ({ modeId: `${collections.size + 1}:${i}`, name: m })) });
    vars.push({ id: `V:${vars.length + 1}`, name: v.name, resolvedType: v.type ?? 'FLOAT', scopes: v.scopes ?? ['ALL_SCOPES'], variableCollectionId: collections.get(v.collection).id, valuesByMode: {}, remove() { vars.splice(vars.indexOf(this), 1); }, setValueForMode(m, x) { this.valuesByMode[m] = x; } });
  }
  const varNamed = (n) => vars.find((v) => v.name === n);
  for (const v of system.variables) if (v.alias) { const x = varNamed(v.name), to = varNamed(v.alias), c = [...collections.values()].find((k) => k.id === x.variableCollectionId); for (const m of c.modes) x.valuesByMode[m.modeId] = { type: 'VARIABLE_ALIAS', id: to.id }; }

  // Each component from the capture: a set of its variants, each built from its tree, sized and bound as it says.
  const page = new N('PAGE', system.page ?? 'Components');
  const pages = [page, ...(system.pages ?? []).map((p) => new N('PAGE', p))];
  const nodes = {};
  const build = (t, comps) => {
    const n = t.t === 'INSTANCE' ? comps[t.of.name].createInstance() : new N(t.t, t.n, t.t === 'TEXT' ? { characters: t.text ?? t.n } : {});
    n.name = t.n ?? n.name;
    if (t.layout) { n.layoutMode = t.layout.dir; n.primaryAxisSizingMode = t.fixed ? 'FIXED' : 'AUTO'; n.counterAxisSizingMode = t.fixed ? 'FIXED' : 'AUTO'; n.itemSpacing = t.gap ?? 4; }
    if (t.fixed) { n._w = t.fixed[0]; n._h = t.fixed[1]; }
    if (t.clip) n.clipsContent = true;
    if (t.wired) n._wired = t.wired;
    for (const [f, v] of Object.entries(t.bind ?? {})) { const x = varNamed(v); if (f === 'fill') n.fills = [{ type: 'SOLID', color: { r: 0, g: 0, b: 0 }, boundVariables: { color: { type: 'VARIABLE_ALIAS', id: x.id } } }]; else n.setBoundVariable(f, x); }
    for (const k of t.c ?? []) n.appendChild(build(k, comps));
    return n;
  };
  const comps = {};
  for (const [name, c] of Object.entries(system.components)) {
    const variants = c.variants.map((vn) => { const v = build({ ...c.tree, t: 'COMPONENT', n: vn }, comps); v.type = 'COMPONENT'; v.componentPropertyDefinitions = {}; return v; });
    const set = variants.length > 1 || c.axes ? new N('COMPONENT_SET', name, { componentPropertyDefinitions: {} }) : variants[0];
    if (set !== variants[0]) { variants.forEach((v, i) => { set.appendChild(v); v.y = i * 60; }); set.resizeWithoutConstraints(400, variants.length * 60); }
    else set.name = name;
    for (const [k, d] of Object.entries(c.properties ?? {})) set.componentPropertyDefinitions[k] = d;
    // Each layer wired to its property, by the property's own key.
    const keyOf = (p) => Object.keys(set.componentPropertyDefinitions).find((k) => k.split('#')[0] === p);
    for (const v of variants) for (const l of [v, ...v.findAll()]) { const w = l._wired; if (w) { l.componentPropertyReferences = Object.fromEntries(Object.entries(w).map(([f, p]) => [f, keyOf(p)])); delete l._wired; } }
    page.appendChild(set);
    set.x = 0; set.y = Object.keys(comps).length * 200;
    comps[name] = set.type === 'COMPONENT_SET' ? set.defaultVariant : set;
    nodes[name] = set.id;
  }
  const textStyles = (system.textStyles ?? []).map((s, i) => ({ id: `S:${i}`, name: s, fontName: { family: 'Inter', style: 'Regular' } }));
  const figma = {
    mixed: Symbol('mixed'), root: { children: pages }, currentPage: page,
    getNodeByIdAsync: async (id) => reg.get(id) ?? null,
    createFrame: () => new N('FRAME', 'Frame'), createComponent: () => new N('COMPONENT', 'Component'), createText: () => new N('TEXT', 'Text', { characters: '', fontName: { family: 'Inter', style: 'Regular' } }),
    combineAsVariants: (cs, parent) => { const s = new N('COMPONENT_SET', 'Set', { componentPropertyDefinitions: {} }); for (const c of cs) s.appendChild(c); parent.appendChild(s); return s; },
    loadFontAsync: async () => {}, getLocalTextStylesAsync: async () => textStyles,
    variables: {
      getLocalVariablesAsync: async () => vars,
      getVariableByIdAsync: async (id) => vars.find((v) => v.id === id) ?? null,
      getVariableCollectionByIdAsync: async (id) => [...collections.values()].find((c) => c.id === id) ?? null,
      setBoundVariableForPaint: (p, f, v) => ({ ...p, boundVariables: { [f]: { type: 'VARIABLE_ALIAS', id: v.id } } }),
      createVariable: (name, col, type) => { const v = { id: `V:${vars.length + 1}:new`, name, resolvedType: type, variableCollectionId: col.id, valuesByMode: {}, scopes: [], remove() { vars.splice(vars.indexOf(this), 1); }, setValueForMode(m, x) { this.valuesByMode[m] = x; } }; vars.push(v); return v; },
      createVariableAlias: (v) => ({ type: 'VARIABLE_ALIAS', id: v.id }),
    },
  };
  return { figma, nodes, vars, pages, reg };
}

// The file as it is: every node (but where a set sits on its page, which placing a new one beside it moves) and every
// variable, to say what a run changed beyond what it was asked to.
export function fileState({ pages, vars }) {
  const out = {};
  const walk = (n, depth) => {
    out[n.id] = JSON.stringify({ type: n.type, name: n.name, parent: n.parent?.id ?? null, ...(n.type === 'PAGE' ? {} : { kids: n.children.map((c) => c.id) }), visible: n.visible, chars: n.characters ?? null, binds: n.boundVariables, fills: n.fills, refs: n.componentPropertyReferences, defs: n.componentPropertyDefinitions ?? null, description: n.description, main: n.mainComponent?.id ?? null, ...(depth > 1 ? { x: n.x, y: n.y } : {}) });
    for (const c of n.children) walk(c, depth + 1);
  };
  for (const p of pages) walk(p, 0);
  for (const v of vars) out[v.id] = JSON.stringify({ name: v.name, values: v.valuesByMode });
  return out;
}
