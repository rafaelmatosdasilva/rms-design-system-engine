// scaffold.mjs - in build mode, each component still to build written as a starting file, from what is exact in Figma.
//
// Build mode lists what Figma has and the code does not, and --query gives each component its build sheet: the lines
// the engine checks once it exists. Those lines are exact (Figma's names, its variables, its selectors), so the first
// file can be written from them rather than retyped by an agent: its element by its role, its props as the catalog
// names them, its parts, the system's own components it holds, and every rule of its build sheet as CSS. What the sheet
// says but Figma does not give exactly (what a state is wired to, a focus ring the design does not draw) is never
// filled in: the file lists it as still to write, for the person. Nothing is written to the code: the files come back as
// one patch that adds them (git apply), and a file the code already has is left out.
//
//   scaffoldOf(name, { entry, rules, role, nested, owed, framework, file }) → { file, text, owed }
//     entry: the catalog's component (its selector, description, props); rules: build-list.mjs buildSheetRules;
//     role: its role annotation; nested: the system's components it holds; owed: the sheet's lines the file cannot write
//   scaffoldPatch(files) → one unified diff that adds them all
//
// Pure: nothing is read or written here.
import { roleMarkup } from './role-markup.mjs';

const words = (s) => String(s ?? '').replace(/#.*$/, '').replace(/([a-z0-9])([A-Z])/g, '$1 $2').split(/[^A-Za-z0-9]+/).filter(Boolean).map((w) => w.toLowerCase());
const kebab = (s) => words(s).join('-');
const pascal = (s) => words(s).map((w) => w[0].toUpperCase() + w.slice(1)).join('');
// A value written into the file as code, which nothing in it can break out of.
const lit = (v) => JSON.stringify(v).replace(/</g, '\\u003c').replace(/>/g, '\\u003e');
const comment = (s) => String(s).replace(/\*\//g, '* /').replace(/<\/(script|template|style)/gi, '<\\/$1');
const ident = (s) => (/^[A-Za-z_$][\w$]*$/.test(s) ? s : null);

// The element a role is written as: the tag and fixed attributes the build sheet names ("a <button type="button">").
function elementOf(role) {
  const m = role ? /<(\w+)((?:\s+[\w-]+="[^"…]*")*)/.exec(roleMarkup(role)) : null;
  return m ? { tag: m[1], attrs: m[2].trim() } : { tag: 'div', attrs: '' };
}

export function scaffoldOf(name, { entry = {}, rules = null, role = null, nested = [], owed = [], framework = 'vue', file = null } = {}) {
  if (!rules?.sel) return { file: null, text: null, owed: [`${name} has no build sheet: nothing exact to write`] };
  const cls = rules.sel.replace(/^\./, '');
  // A variant of True and False is a boolean, as the system's own build reference writes it (Disabled = false).
  const isBool = (p) => p.type === 'enum' && (p.values ?? []).length === 2 && (p.values ?? []).every((v) => /^(true|false)$/i.test(String(v)));
  const props = Object.entries(entry.props ?? {}).map(([figma, p]) => ({ name: p.codeName ?? figma, ...p, bool: isBool(p) })).filter((p) => ident(p.name));
  const cond = (p, value) => (p.bool ? (/^true$/i.test(String(value)) ? p.name : `!${p.name}`) : `${p.name} === ${lit(value)}`);
  const defOf = (p) => (p.bool ? String(/^true$/i.test(String(p.default))) : lit(p.default ?? (p.type === 'enum' ? p.values?.[0] : '')));
  const skipped = Object.keys(entry.props ?? {}).filter((n) => !props.some((p) => p.name === n || entry.props[n].codeName === p.name));
  const left = [...owed, ...skipped.map((n) => `the prop "${n}", whose name is no name code can take: name it with the person, and record it in contract.authored.json`)];
  // The modifier class each value writes (.chip--l), from the selectors the sheet gives; a pseudo-class (:hover) is CSS
  // alone, and :disabled is the element's own attribute.
  const mods = [], disabledWhen = [];
  for (const v of rules.variants) {
    const rest = v.selector.slice(rules.sel.length);
    const m = /^((?:\.[\w-]+)*)(.*)$/.exec(rest);
    const p = props.find((x) => x.name === v.prop || x.codeName === v.prop) ?? { name: v.prop };
    if (m[1]) mods.push({ p, value: v.value, classes: m[1].split('.').filter(Boolean) });
    if (/^:disabled/.test(m[2] ?? '')) disabledWhen.push({ p, value: v.value });
  }
  const el = elementOf(role);
  // What the role's sentence asks beyond the element (with aria-pressed "true" or "false"): it is wired to the
  // component's state, which Figma does not give.
  const beyond = role ? String(roleMarkup(role)).replace(/^.*?<[^>]*>/, '').trim() : '';
  if (beyond) left.unshift(`the <${el.tag}> ${beyond.replace(/^with\s+/, 'with ')}, wired to its state`);
  if (disabledWhen.length && !/^(button|input|select|textarea|fieldset)$/.test(el.tag)) left.push(`${disabledWhen.map((d) => `${d.p.name}=${d.value}`).join(', ')} is :disabled, which a <${el.tag}> does not take: write how it is disabled with the person`);
  const css = (sel, decls) => `${sel} {\n${decls.map((d) => `  ${d.prop}: ${d.value};`).join('\n')}\n}`;
  // A Figma frame's size holds its padding and its stroke: the box CSS calls border-box.
  const baseDecls = [{ prop: 'box-sizing', value: 'border-box' }, ...rules.base];
  if (rules.text) {
    if (rules.text.size) baseDecls.push({ prop: 'font-size', value: rules.text.size });
    if (rules.text.weight) baseDecls.push({ prop: 'font-weight', value: rules.text.weight });
    // A text style with no variable of its own: its values as Figma's style holds them.
    if (!rules.text.size && !rules.text.weight) for (const v of rules.text.vals) { const m = /^([\w-]+) (.+)$/.exec(v); if (m) baseDecls.push({ prop: m[1], value: m[2] }); }
  }
  if (rules.stroke) { const col = rules.base.find((d) => d.prop === 'border-color')?.value; left.push(`a border on every side, as the border shorthand (border: <width> solid ${col ?? '<colour>'}): Figma strokes every side, and the capture holds no stroke width${col ? '' : ' and binds no variable to its colour'}`); }
  for (const r of [...rules.raw.map((x) => `${x} on ${rules.sel}`), ...rules.variants.flatMap((v) => v.raw.map((x) => `${x} on ${v.selector}`))]) left.push(`${r}: Figma binds no variable here, so it is written as it is in the build sheet, never by the scaffold`);
  const style = [css(rules.sel, baseDecls), ...rules.variants.filter((v) => v.decls.length).map((v) => css(v.selector, v.decls))].join('\n');
  const texts = props.filter((p) => p.type === 'text');
  const jsx = framework === 'react' || framework === 'jsx';
  const tag = (n) => (jsx ? pascal(n) : kebab(n));
  const note = [`${name}${entry.description ? `: ${comment(entry.description)}` : ''}`, 'Written by rms-design-system-engine --scaffold from what is exact in Figma; every rule below is checked once it is built.',
    ...(left.length ? ['Still yours to write (the build sheet says it, and Figma does not give it exactly):', ...left.map((l) => `  - ${comment(l)}`)] : [])];
  const fname = pascal(name);
  // Its stylesheet is a file of its own beside it (button.css), as build mode reads a component's CSS.
  const dir = (f) => (f.includes('/') ? f.slice(0, f.lastIndexOf('/')) : '.');
  const sheetName = `${kebab(name)}.css`;
  const docs = `/**\n${note.map((l) => ` * ${l}`).join('\n')}\n */`;
  if (jsx) {
    const cn = mods.length ? `{['${cls}', ${mods.map((m) => `${cond(m.p, m.value)} && '${m.classes.join(' ')}'`).join(', ')}].filter(Boolean).join(' ')}` : `"${cls}"`;
    const dis = disabledWhen.length ? ` disabled={${disabledWhen.map((d) => cond(d.p, d.value)).join(' || ')}}` : '';
    const inner = [...nested.map((n) => `      <${tag(n)} />`), ...texts.map((p) => `      <span className="${cls}__${kebab(p.name)}">{${p.name}}</span>`)];
    const f = file ?? `src/components/${fname}.jsx`;
    const text = `import './${sheetName}';\n\n${docs}\nexport function ${fname}({ ${[...props.map((p) => `${p.name} = ${defOf(p)}`), '...rest'].join(', ')} }) {\n  return (\n    <${el.tag}${el.attrs ? ` ${el.attrs}` : ''} className=${cn}${dis} {...rest}>\n${inner.join('\n')}\n    </${el.tag}>\n  );\n}\n`;
    return { file: f, text, files: [{ file: f, text }, { file: `${dir(f)}/${sheetName}`, text: `${style}\n` }], owed: left };
  }
  const q = (x) => x.replace(/"/g, "'");
  const dis = disabledWhen.length ? ` :disabled="${q(disabledWhen.map((d) => cond(d.p, d.value)).join(' || '))}"` : '';
  const inner = [...nested.map((n) => `    <${tag(n)} />`), ...texts.map((p) => `    <span class="${cls}__${kebab(p.name)}">{{ ${p.name} }}</span>`)];
  const classes = mods.length ? ` :class="${q(`['${cls}', ${mods.map((m) => `${cond(m.p, m.value)} && '${m.classes.join(' ')}'`).join(', ')}]`)}"` : ` class="${cls}"`;
  const f = file ?? `src/components/${fname}.vue`;
  const text = `<template>\n  <${el.tag}${el.attrs ? ` ${el.attrs}` : ''}${classes}${dis}>\n${inner.join('\n')}\n  </${el.tag}>\n</template>\n\n<script setup>\n${docs}\ndefineProps({\n${props.map((p) => `  ${p.name}: { type: ${p.bool ? 'Boolean' : 'String'}, default: ${defOf(p)}${p.type === 'enum' && p.values && !p.bool ? `, validator: (v) => ${lit(p.values.map(String))}.includes(v)` : ''} },`).join('\n')}\n});\n</script>\n\n<style src="./${sheetName}"></style>\n`;
  return { file: f, text, files: [{ file: f, text }, { file: `${dir(f)}/${sheetName}`, text: `${style}\n` }], owed: left };
}

export function scaffoldPatch(files = []) {
  return files.map(({ file, text }) => {
    const lines = String(text).replace(/\n$/, '').split('\n');
    return `diff --git a/${file} b/${file}\nnew file mode 100644\n--- /dev/null\n+++ b/${file}\n@@ -0,0 +1,${lines.length} @@\n${lines.map((l) => `+${l}`).join('\n')}\n`;
  }).join('');
}
