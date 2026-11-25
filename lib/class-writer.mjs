// class-writer.mjs - a component written as Angular, Lit or a plain custom element: the file the shared writers
// (spec-to-code.mjs from a spec, scaffold.mjs from Figma's build sheet) hand back, in the framework the system's own
// components are written in, as Vue and JSX already are.
//
// One description, three ways to write it, each in its framework's own words:
//   Angular: a standalone @Component, its selector the tag, each prop an @Input, its template bound with [class],
//     [disabled], @if and {{ }}, its styles inline.
//   Lit: a LitElement, its props in static properties with their defaults set in the constructor, its html`` bound with
//     ${this.…}, ?disabled and nothing, its css`` its static styles, its tag defined.
//   A plain custom element: an HTMLElement drawing into its own shadow root, each prop an attribute it watches
//     (observedAttributes) read by a getter, every value it writes escaped, its styles in the shadow root's <style>.
//
//   classComponentFile(d) → { file, text, notes }
//     d: { framework: 'angular' | 'lit' | 'web component', name, tag, className, file, description,
//          props: [{ name, kind: 'string' | 'boolean', options?, def }]   def: the default as a JS value
//          classes: { root, mods: [{ prop } | { when, classes }] }       when: (ref) => an expression
//          el: { tag, attrs }, disabledWhen: (ref) => expression | null, children: [node], css }
//     node: { type: 'text', prop | text, cls, when? } | { type: 'instance', tag, cls, when? }
//           | { type: 'el', tag?, cls, when?, children? }
//   classFramework(kind) → 'angular' | 'lit' | 'web component' | null: the writer's name for classKind's answer
//
// Pure: nothing is read or written here.

export const CLASS_FRAMEWORKS = ['angular', 'lit', 'web component'];
export const classFramework = (kind) => (CLASS_FRAMEWORKS.includes(kind) ? kind : null);

// A value as code a template cannot be broken out of: a single-quoted string (Angular's templates take no other
// inside a double-quoted attribute), with nothing in it that ends the string, the attribute or the element.
export const sq = (v) => (typeof v === 'boolean' || typeof v === 'number' ? String(v)
  : `'${String(v ?? '').replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/\n/g, '\\n').replace(/`/g, '\\u0060').replace(/\$\{/g, '\\u0024{')}'`);
// Words written as they read, in any of the three: no element, interpolation or binding can start in them.
const words = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\{/g, '&#123;').replace(/\}/g, '&#125;').replace(/\$/g, '&#36;').replace(/`/g, '&#96;');
const comment = (s) => String(s).replace(/\*\//g, '* /').replace(/`/g, "'").replace(/\$\{/g, '$ {');
const kebab = (s) => String(s).replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();

export function classComponentFile(d) {
  const fw = d.framework, notes = [];
  const ts = /\.ts$/.test(d.file);
  // How a prop is read where it is used: by its name in an Angular template, from the element in a class's own code.
  const ref = (p) => (fw === 'angular' ? p : `this.${p}`);
  const classExpr = [sq(d.classes.root), ...(d.classes.mods ?? []).map((m) => (m.prop ? `${sq(` ${d.classes.root}--`)} + ${ref(m.prop)}` : `(${m.when(ref)} ? ${sq(` ${m.classes.join(' ')}`)} : '')`))].join(' + ');
  const hasMods = (d.classes.mods ?? []).length > 0;
  const clsAttr = (cls) => `class="${cls}"`;
  // Lit binds an attribute whole, quoted or not; a plain element writes text into innerHTML, so its value is quoted
  // and escaped there.
  const rootClass = !hasMods ? clsAttr(d.classes.root) : fw === 'angular' ? `[class]="${classExpr}"` : fw === 'lit' ? `class=\${${classExpr}}` : `class="\${esc(${classExpr})}"`;
  const disabled = d.disabledWhen ? d.disabledWhen(ref) : null;
  const disAttr = !disabled ? '' : fw === 'angular' ? ` [disabled]="${disabled}"` : fw === 'lit' ? ` ?disabled=\${${disabled}}` : ` \${${disabled} ? 'disabled' : ''}`;
  const textOf = (n) => (n.prop ? (fw === 'angular' ? `{{ ${n.prop} }}` : fw === 'lit' ? `\${${ref(n.prop)}}` : `\${esc(${ref(n.prop)})}`) : words(n.text));
  const shown = (when, inner, pad) => {
    if (!when) return inner;
    const cond = ref(when);
    if (fw === 'angular') return `${pad}@if (${cond}) {\n${inner}\n${pad}}`;
    return `${pad}\${${cond} ? ${fw === 'lit' ? 'html' : ''}\`\n${inner}\n${pad}\` : ${fw === 'lit' ? 'nothing' : "''"}}`;
  };
  const node = (n, depth) => {
    const pad = '  '.repeat(depth);
    let out;
    if (n.type === 'instance') out = `${pad}<${n.tag} ${clsAttr(n.cls)}></${n.tag}>`;
    else if (n.type === 'text') out = `${pad}<span ${clsAttr(n.cls)}>${textOf(n)}</span>`;
    else {
      const inner = (n.children ?? []).map((k) => node(k, depth + 1));
      out = inner.length ? `${pad}<${n.tag ?? 'div'} ${clsAttr(n.cls)}>\n${inner.join('\n')}\n${pad}</${n.tag ?? 'div'}>` : `${pad}<${n.tag ?? 'div'} ${clsAttr(n.cls)}></${n.tag ?? 'div'}>`;
    }
    return n.when ? shown(n.when, out.replace(/^/gm, '  '), pad) : out;
  };
  const elTag = d.el?.tag ?? 'div';
  const body = (depth) => {
    const pad = '  '.repeat(depth);
    const kids = (d.children ?? []).map((k) => node(k, depth + 1));
    return `${pad}<${elTag}${d.el?.attrs ? ` ${d.el.attrs}` : ''} ${rootClass}${disAttr}>\n${kids.length ? `${kids.join('\n')}\n` : ''}${pad}</${elTag}>`;
  };
  const doc = d.description ? `/** ${comment(d.description)} */\n` : '';
  const type = (p) => (!ts ? '' : p.kind === 'boolean' ? ': boolean' : p.options?.length ? `: ${p.options.map(sq).join(' | ')}` : ': string');
  const css = String(d.css ?? '').trim();
  let text;
  if (fw === 'angular') {
    // Its inputs by decorator, each with its default, which every Angular version reads.
    const inputs = d.props.map((p) => `  @Input() ${p.name}${type(p)} = ${sq(p.def)};`);
    text = `import { Component, Input } from '@angular/core';\n\n${doc}@Component({\n  selector: '${d.tag}',\n  standalone: true,\n  template: \`\n${body(2)}\n  \`,\n${css ? `  styles: [\`\n${css.replace(/^/gm, '    ')}\n  \`],\n` : ''}})\nexport class ${d.className} {\n${inputs.join('\n')}${inputs.length ? '\n' : ''}}\n`;
  } else if (fw === 'lit') {
    // Its properties declared, never as class fields (a field would hide Lit's own accessor), their defaults set in
    // the constructor, as Lit's own guide writes a component with no decorators.
    const decl = d.props.map((p) => `    ${p.name}: { type: ${p.kind === 'boolean' ? 'Boolean' : 'String'}, reflect: true },`);
    const typed = ts ? d.props.map((p) => `  declare ${p.name}${type(p)};`) : [];
    const used = /\bnothing\b/.test(body(2)) ? ', nothing' : '';
    text = `import { LitElement, html, css${used} } from 'lit';\n\n${doc}export class ${d.className} extends LitElement {\n  static styles = css\`\n${css.replace(/^/gm, '    ')}\n  \`;\n\n  static properties = {\n${decl.join('\n')}\n  };\n${typed.length ? `\n${typed.join('\n')}\n` : ''}\n  constructor() {\n    super();\n${d.props.map((p) => `    this.${p.name} = ${sq(p.def)};`).join('\n')}${d.props.length ? '\n' : ''}  }\n\n  render() {\n    return html\`\n${body(3)}\n    \`;\n  }\n}\ncustomElements.define('${d.tag}', ${d.className});\n`;
  } else if (fw === 'web component') {
    // Each prop an attribute it watches, read by a getter: a string's value or its default, an on/off by whether the
    // attribute is there. What it writes into its shadow root is escaped, since an attribute is anyone's to set.
    // An attribute is off until it is set, so an on/off Figma starts on is said, never turned around in its name.
    for (const p of d.props.filter((x) => x.kind === 'boolean' && x.def === true)) notes.push(`${p.name} starts on in Figma, and an attribute starts off: the element is drawn with it off until a page sets ${kebab(p.name)}`);
    const getters = d.props.map((p) => (p.kind === 'boolean'
      ? `  get ${p.name}() { return this.hasAttribute('${kebab(p.name)}'); }`
      : `  get ${p.name}() { return this.getAttribute('${kebab(p.name)}') ?? ${sq(p.def)}; }`));
    text = `const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => \`&#\${c.charCodeAt(0)};\`);\n\n${doc}export class ${d.className} extends HTMLElement {\n  static observedAttributes = [${d.props.map((p) => sq(kebab(p.name))).join(', ')}];\n\n  constructor() {\n    super();\n    this.attachShadow({ mode: 'open' });\n  }\n\n${getters.join('\n')}${getters.length ? '\n\n' : ''}  connectedCallback() { this.render(); }\n\n  attributeChangedCallback() { this.render(); }\n\n  render() {\n    this.shadowRoot.innerHTML = \`<style>\n${css.replace(/^/gm, '      ')}\n    </style>\n${body(2)}\`;\n  }\n}\ncustomElements.define('${d.tag}', ${d.className});\n`;
  } else return { file: null, text: null, notes: [`${fw} is not a framework this writer writes`] };
  return { file: d.file, text, notes };
}
