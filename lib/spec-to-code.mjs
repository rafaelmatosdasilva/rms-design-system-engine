// spec-to-code.mjs - the component a spec describes, written in code the way the system's own components are.
//
// A spec (component-spec.mjs) is built in Figma through the script a person says yes to. The same spec is the code's
// too: this writes the component's file from it, the way the code's construction rules say the system writes one
// (code-grammar.mjs): its framework, where its file sits and how it is named, how a part's class and an option's class
// are named, its props named as the system names props, each bound variable as the custom property the naming convention
// gives it, each text in the text style the system sets text with (its mixin or its class, as its own components do).
// Nothing the system lacks: a nested component is the system's own tag, a value is always one of its variables. The file
// is handed back as a patch that adds it, which a person applies (the engine never writes code people own); and what was
// written is read back with the code's own reader and held against the spec, so the two start out matching.
//
//   codeFromSpec(model, ctx) → { file, text, notes }
//     model: figma-ops.mjs predict's model of the spec (axes, properties, layers, binds, description)
//     ctx: { framework: 'vue' | 'jsx', folder, fileCase, partWay, cssVarOf(figmaVar), textWayOf(style), tagOf(component), propCase }
//   checkAgainstSpec(model, written, anatomy) → [line]: a layer with no part, a property with no prop
//   A template, a pattern, a page or a flow (model.kind 'frame') is written with no props, its parts nested.
//   newFilePatch(file, text) → a unified diff that adds the file (git apply)
//
// Pure: nothing is read or written here.

const words = (s) => String(s ?? '').replace(/([a-z0-9])([A-Z])/g, '$1 $2').split(/[^A-Za-z0-9]+/).filter(Boolean).map((w) => w.toLowerCase());
const kebab = (s) => words(s).join('-');
const pascal = (s) => words(s).map((w) => w[0].toUpperCase() + w.slice(1)).join('');
const camel = (s) => { const p = pascal(s); return p ? p[0].toLowerCase() + p.slice(1) : p; };
const CASES = { camelCase: camel, PascalCase: pascal, 'kebab-case': kebab, snake_case: (s) => words(s).join('_') };
// A value written into the file as code: a string literal that no quote, backslash or closing tag can leave, and a
// comment no "*/" can end early.
const lit = (v) => JSON.stringify(v).replace(/</g, '\\u003c').replace(/>/g, '\\u003e');
const comment = (s) => String(s).replace(/\*\//g, '* /').replace(/<\/(script|template|style)/gi, '<\\/$1');
const CSS_OF = { fill: 'background-color', stroke: 'border-color', strokeWeight: 'border-width', gap: 'gap', padding: 'padding', paddingX: 'padding-inline', paddingY: 'padding-block', paddingTop: 'padding-top', paddingRight: 'padding-right', paddingBottom: 'padding-bottom', paddingLeft: 'padding-left', radius: 'border-radius', fontSize: 'font-size', width: 'width', height: 'min-height' };

export function codeFromSpec(model, { framework = 'vue', folder = 'src/components', fileCase = 'PascalCase', partWay = '<root>__…', propCase = 'camelCase', cssVarOf = () => null, textWayOf = () => null, tagOf = (n) => kebab(n) } = {}) {
  const notes = [];
  const root = kebab(model.name);
  const partClass = (layer) => { const w = kebab(String(layer).split('/').pop()); return partWay === '<root>-…' ? `${root}-${w}` : partWay === 'own name' ? w : `${root}__${w}`; };
  const propName = CASES[propCase] ?? camel;
  const varCss = (v) => { const c = cssVarOf(v); if (!c) notes.push(`${v} has no custom property the naming convention gives it: written as a comment to fill in`); return c ? `var(${c})` : `/* ${v} */`; };
  // Its props: an axis is a prop of its options, a property one of its kind, each with Figma's default.
  const props = [...model.axes.map((a) => ({ name: propName(a.name), type: 'String', options: a.options.map((o) => o.name), def: lit(a.default ?? a.options[0]?.name) })),
    ...model.properties.map((p) => ({ name: propName(p.name), type: p.kind === 'BOOLEAN' ? 'Boolean' : 'String', def: lit(p.default ?? (p.kind === 'BOOLEAN' ? false : '')) }))];
  // Its parts, in the order the spec lays them: a text writes the prop that drives its words, an instance is the
  // system's own component, a part a boolean drives is shown on it.
  const layers = Object.values(model.layers ?? {}).filter((l) => !String(l.path).includes('/'));
  const shownBy = (l) => (l.wired?.visible ? propName(l.wired.visible) : null);
  const textOf = (l) => (l.wired?.characters ? propName(l.wired.characters) : null);
  // Its style: the root's own values, each option's under its class, and each text's style as the system sets it.
  const rules = [];
  const decls = (layer, where) => Object.entries(model.binds ?? {}).filter(([k]) => { const [l, f] = k.split('|'); return l === layer && CSS_OF[f]; })
    .map(([k, vs]) => `${CSS_OF[k.split('|')[1]]}: ${varCss([].concat(vs)[0])};`);
  rules.push([`.${root}`, ['display: inline-flex;', `flex-direction: ${model.layout?.dir === 'VERTICAL' ? 'column' : 'row'};`, 'align-items: center;', ...decls('')]]);
  const scss = [];
  for (const l of layers) {
    const own = decls(l.path);
    if (l.type === 'TEXT' && l.style) {
      const way = textWayOf(l.style);
      if (way?.how === 'include') { own.push(`@include ${way.name};`); scss.push(1); }
      else if (way?.how === 'class') l.textClass = way.name;
      else notes.push(`${l.path}'s text style ${l.style}: the system sets no text with it in its own components, so it is a comment to fill in`), own.push(`/* text style: ${l.style} */`);
    }
    if (own.length) rules.push([`.${partClass(l.path)}`, own]);
  }
  const css = rules.map(([sel, ds]) => `${sel} {\n${ds.map((d) => `  ${d}`).join('\n')}\n}`).join('\n');
  const modifier = model.axes.map((a) => `${root}--` + '${' + propName(a.name) + '}');
  let file, text;
  // A template, a pattern, a page or a flow (a frame, system-kinds.mjs): no props of its own, its parts nested as the
  // spec nests them, each of the system's components its own tag, each frame laid out as the spec lays it out.
  if (model.kind === 'frame') {
    const all = Object.values(model.layers ?? {});
    const parentOf = (path) => { const x = String(path), i = x.lastIndexOf('/'); return i < 0 ? '' : x.slice(0, i); };
    const frames = [[`.${root}`, model.layout?.dir === 'HORIZONTAL' ? 'row' : 'column']];
    const jsx = framework === 'jsx';
    const node = (l, depth) => {
      const pad = '  '.repeat(depth), cls = partClass(l.path), attr = jsx ? 'className' : 'class';
      if (l.type === 'INSTANCE') return `${pad}<${jsx ? pascal(tagOf(l.of)) : tagOf(l.of)} ${attr}="${cls}" />`;
      if (l.type === 'TEXT') return `${pad}<span ${attr}="${cls}">{${jsx ? '' : '{ '}${lit(String(l.text ?? ''))}${jsx ? '' : ' }'}}</span>`;
      frames.push([`.${cls}`, l.layout?.dir === 'HORIZONTAL' ? 'row' : 'column']);
      const inner = all.filter((k) => parentOf(k.path) === l.path).map((k) => node(k, depth + 1));
      return inner.length ? `${pad}<div ${attr}="${cls}">\n${inner.join('\n')}\n${pad}</div>` : `${pad}<div ${attr}="${cls}"></div>`;
    };
    const body = all.filter((l) => parentOf(l.path) === '').map((l) => node(l, jsx ? 3 : 2));
    const fcss = frames.map(([sel, dir]) => `${sel} {\n  display: flex;\n  flex-direction: ${dir};${sel === `.${root}` ? decls('').map((d) => `\n  ${d}`).join('') : ''}\n}`).join('\n');
    const fname = (CASES[fileCase] ?? pascal)(model.name);
    if (framework === 'vue') {
      text = `<template>\n  <div class="${root}">\n${body.join('\n')}\n  </div>\n</template>\n\n${model.description ? `<script setup>\n/** ${comment(model.description)} */\n</script>\n\n` : ''}<style scoped>\n${fcss}\n</style>\n`;
      return { file: `${folder}/${fname}.vue`, text, notes };
    }
    if (jsx) {
      text = `import './${fname}.css';\n\n${model.description ? `/** ${comment(model.description)} */\n` : ''}export function ${pascal(model.name)}() {\n  return (\n    <div className="${root}">\n${body.join('\n')}\n    </div>\n  );\n}\n`;
      notes.push(`its styles go in ${folder}/${fname}.css:\n${fcss}`);
      return { file: `${folder}/${fname}.jsx`, text, notes };
    }
  }
  if (framework === 'vue') {
    const el = (l) => {
      const cls = [partClass(l.path), l.textClass].filter(Boolean).join(' ');
      const cond = shownBy(l) ? ` v-if="${shownBy(l)}"` : '';
      if (l.type === 'INSTANCE') return `    <${tagOf(l.of)}${cond} class="${cls}" />`;
      if (l.type === 'TEXT') return `    <span${cond} class="${cls}">{{ ${textOf(l) ?? lit(String(l.text ?? ''))} }}</span>`;
      return `    <div${cond} class="${cls}"></div>`;
    };
    const cls = modifier.length ? `:class="['${root}', ${modifier.map((m) => '`' + m + '`').join(', ')}]"` : `class="${root}"`;
    text = `<template>\n  <div ${cls}>\n${layers.map(el).join('\n')}\n  </div>\n</template>\n\n<script setup>\n${model.description ? `/** ${comment(model.description)} */\n` : ''}defineProps({\n${props.map((p) => `  ${p.name}: { type: ${p.type}, default: ${p.def}${p.options ? `, validator: (v) => ${lit(p.options)}.includes(v)` : ''} },`).join('\n')}\n});\n</script>\n\n<style${scss.length ? ' lang="scss"' : ''} scoped>\n${css}\n</style>\n`;
    file = `${folder}/${(CASES[fileCase] ?? pascal)(model.name)}.vue`;
  } else if (framework === 'jsx') {
    const el = (l) => {
      const cls = [partClass(l.path), l.textClass].filter(Boolean).join(' ');
      const tag = l.type === 'INSTANCE' ? pascal(tagOf(l.of)) : l.type === 'TEXT' ? 'span' : 'div';
      const inner = l.type === 'TEXT' ? `{${textOf(l) ?? lit(String(l.text ?? ''))}}` : '';
      const node = l.type === 'INSTANCE' ? `<${tag} className="${cls}" />` : `<${tag} className="${cls}">${inner}</${tag}>`;
      return `      ${shownBy(l) ? `{${shownBy(l)} && ${node}}` : node}`;
    };
    const cn = modifier.length ? '{`' + [root, ...modifier].join(' ') + '`}' : `"${root}"`;
    text = `import './${(CASES[fileCase] ?? pascal)(model.name)}.css';\n\n${model.description ? `/** ${comment(model.description)} */\n` : ''}export function ${pascal(model.name)}({ ${props.map((p) => `${p.name} = ${p.def}`).join(', ')} }) {\n  return (\n    <div className=${cn}>\n${layers.map(el).join('\n')}\n    </div>\n  );\n}\n`;
    file = `${folder}/${(CASES[fileCase] ?? pascal)(model.name)}.jsx`;
    notes.push(`its styles go in ${file.replace(/\.jsx$/, '.css')}:\n${css}`);
  } else return { file: null, text: null, notes: [`the system's components are written as ${framework}, which the engine does not write yet`] };
  return { file, text, notes };
}

// What was written, read back with the code's own reader, held against the spec: every layer a part, every property
// and axis a prop.
export function checkAgainstSpec(model, { propCase = 'camelCase', partWay = '<root>__…' } = {}, anatomy = null, writtenProps = []) {
  const out = [], root = kebab(model.name), propName = CASES[propCase] ?? camel;
  const classes = new Set((anatomy?.parts ?? []).map((p) => p.class));
  for (const l of Object.values(model.layers ?? {}).filter((x) => !String(x.path).includes('/'))) {
    const w = kebab(String(l.path)), cls = partWay === '<root>-…' ? `${root}-${w}` : partWay === 'own name' ? w : `${root}__${w}`;
    if (!classes.has(cls)) out.push(`the layer ${l.path} has no part in the code (.${cls})`);
  }
  for (const n of [...model.axes.map((a) => a.name), ...model.properties.map((p) => p.name)]) if (!writtenProps.includes(propName(n))) out.push(`${n} has no prop in the code`);
  return out;
}

export function newFilePatch(file, text) {
  const lines = String(text).replace(/\n$/, '').split('\n');
  return `diff --git a/${file} b/${file}\nnew file mode 100644\n--- /dev/null\n+++ b/${file}\n@@ -0,0 +1,${lines.length} @@\n${lines.map((l) => `+${l}`).join('\n')}\n`;
}
