// class-components.mjs - a component written as a class, read into the shape the Vue and React readers give.
//
// Vue, React and Svelte say what a component takes in their own syntax, and component-source.mjs reads each. Two more
// write a component as a class with decorated or declared fields, and were read as plain code: a web component built
// with Lit, and an Angular component. Each says the same things in its own way:
//
//   what it takes   Lit: a reactive property (@property() size = 'm', or static properties = { size: { type: String } })
//                   Angular: an input (@Input() size = 'm', or a signal: size = input('m'), input.required(), model())
//   what it sends   Lit: an event it dispatches (this.dispatchEvent(new CustomEvent('change')))
//                   Angular: an output (@Output() change = new EventEmitter(), or change = output()), and a model's
//                   own <name>Change
//   what it holds   both: the content a person puts in it, Lit's <slot> (named or not) and Angular's <ng-content>,
//                   named by what its select picks ([icon], .icon, [slot=icon])
//   its template    Lit: the html`` its render() returns. Angular: its template, or the file templateUrl names
//
// A Lit component's internal state (@state(), state: true) is never something a person sets, so it is left out, as
// a Vue component's data is. A Lit system that ships a Custom Elements Manifest is read from it first (component-api.mjs);
// this is the reading for one that does not.
//
//   classKind(file, text)            → 'lit' | 'angular' | null
//   classComponentApi(file, text, { template }) → { props, slots: { named, default }, events, tag? } in
//                                      textComponentApi's shape, null for a file that is neither
//   templateOf(file, text, read)     → the component's template text ('' when none is found)
//   classRootClass(file, text, read) → the class its own element, or its template's first element, carries, or null
//
// Pure except for reading the template file an Angular component names, through `read`.

import { dirname, resolve, isAbsolute, extname, join } from 'node:path';
import { readFileSync } from 'node:fs';

const SCRIPT = new Set(['.ts', '.js', '.mts', '.mjs']);
const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, '');
const unq = (s) => String(s).trim().replace(/^['"`]|['"`]$/g, '');
const blank = (t) => String(t ?? '').replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' ')).replace(/(^|[^:\\])\/\/[^\n]*/g, (m, a) => a + ' '.repeat(m.length - a.length));

export function classKind(file, text) {
  if (!SCRIPT.has(extname(String(file)).toLowerCase())) return null;
  const t = blank(text);
  if (/@Component\s*\(\s*\{/.test(t) && /from\s+['"]@angular\/core['"]/.test(t)) return 'angular';
  if (/\bextends\s+(?:LitElement|[A-Z]\w*\(\s*LitElement\s*\))/.test(t) || (/from\s+['"]lit(?:-element)?(?:\/[\w-]+)?['"]/.test(t) && /\bclass\s+[A-Z]\w*\s+extends\b/.test(t))) return 'lit';
  // A Web Component written with no library: a class of the platform's own elements, defined as a custom element.
  if (/\bclass\s+[A-Z]\w*\s+extends\s+HTML[A-Za-z]*Element\b/.test(t) && /\bcustomElements\.define\s*\(/.test(t)) return 'web component';
  return null;
}

// A literal as the code writes it: a number or a boolean as one, a string unquoted, anything else not a default.
function literal(raw) {
  const v = String(raw ?? '').trim();
  if (/^-?\d+(\.\d+)?$/.test(v)) return { value: Number(v) };
  if (v === 'true' || v === 'false') return { value: v === 'true' };
  if (/^(['"`])[^'"`$]*\1$/.test(v)) return { value: unq(v) };
  return v ? { expression: v } : null;
}
// The options a union of strings gives ('sm' | 'md'), and a plain type said in words.
function fromType(type) {
  const t = String(type ?? '').replace(/\s+/g, ' ').trim().replace(/^\|\s*/, '');
  const opts = [...t.matchAll(/['"`]([^'"`]*)['"`]/g)].map((m) => m[1]);
  if (opts.length >= 2 && /^(['"`][^'"`]*['"`]\s*\|\s*)+['"`][^'"`]*['"`](\s*\|\s*(undefined|null))*$/.test(t)) return { options: opts, type: 'string' };
  const plain = /^(string|boolean|number)(\s*\|\s*(undefined|null))*$/.exec(t)?.[1];
  return plain ? { type: plain } : {};
}
const LIT_TYPES = { String: 'string', Boolean: 'boolean', Number: 'number', Object: 'object', Array: 'array' };

// The index of the quote that closes the string opening at `i`. A template literal's ${…} is code, read through to its
// own closing brace, so a template inside a template (html`${x ? html`<b>` : ''}`) never ends the outer one.
function closeOf(s, i) {
  const q = s[i];
  for (let j = i + 1; j < s.length; j++) {
    const c = s[j];
    if (c === '\\') { j++; continue; }
    if (c === q) return j;
    if (q === '`' && c === '$' && s[j + 1] === '{') {
      let depth = 0;
      for (j = j + 1; j < s.length; j++) {
        const d = s[j];
        if (d === '"' || d === "'" || d === '`') { j = closeOf(s, j); continue; }
        if (d === '{') depth++;
        else if (d === '}' && --depth === 0) break;
      }
    }
  }
  return s.length;
}
const QUOTES = new Set(['"', "'", '`']);
// The text between a bracket and its match, from the bracket at `open`. Its strings are skipped whole, and its comments
// are read blanked, so an apostrophe in a comment (the button's) never opens one.
function inside(text, open) {
  const pairs = { '(': ')', '{': '}', '<': '>', '[': ']' };
  const want = pairs[text[open]], b = blank(text);
  let depth = 0;
  for (let i = open; i < b.length; i++) {
    const c = b[i];
    if (QUOTES.has(c)) { i = closeOf(b, i); continue; }
    if (c === b[open]) depth++;
    else if (c === want && --depth === 0) return text.slice(open + 1, i);
  }
  return '';
}
// The rest of a class field after its name: its type (after a colon) and its value (after =), up to the end of the line
// or its semicolon.
function fieldAfter(text, at) {
  let end = at, depth = 0;
  for (; end < text.length; end++) {
    const c = text[end];
    if (QUOTES.has(c)) { end = closeOf(text, end); continue; }
    if ('([{<'.includes(c)) depth++;
    else if (')]}>'.includes(c)) { if (!depth) break; depth--; }
    // A line that ends on = | : or , goes on to the next (a union or a default a formatter wrapped).
    else if (c === ';' && !depth) break;
    else if (c === '\n' && !depth && !/[=|:,]\s*$/.test(text.slice(at, end)) && !/^\s*[|=]/.test(text.slice(end + 1))) break;
  }
  const rest = text.slice(at, end);
  const eq = topLevel(rest, '='), colon = topLevel(rest, ':');
  const type = colon >= 0 && (eq < 0 || colon < eq) ? rest.slice(colon + 1, eq >= 0 ? eq : undefined).trim() : '';
  const value = eq >= 0 ? rest.slice(eq + 1).trim() : '';
  return { type, value };
}
function topLevel(s, ch) {
  let depth = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (QUOTES.has(c)) { i = closeOf(s, i); continue; }
    if ('([{<'.includes(c)) depth++;
    else if (')]}>'.includes(c)) depth--;
    else if (c === ch && !depth && !(ch === '=' && (s[i + 1] === '>' || s[i + 1] === '=' || s[i - 1] === '!' || s[i - 1] === '<' || s[i - 1] === '>'))) return i;
  }
  return -1;
}
// A field's options from its decorator: { type: String, attribute: 'aria-label', state: true }.
const optionOf = (opts, key) => new RegExp(`\\b${key}\\s*:\\s*([^,}]+)`).exec(opts ?? '')?.[1]?.trim() ?? null;

function put(props, name, { type = '', value = '', declared = null, required = null } = {}) {
  const e = props[name] ?? {};
  const t = fromType(type);
  if (t.options) e.options = t.options;
  if (t.type || declared) e.type ??= t.type ?? declared;
  const lit = literal(value);
  if (lit && 'value' in lit) e.default = lit.value;
  else if (lit?.expression && e.default === undefined) e.defaultExpression = lit.expression;
  if (required != null) e.required = required;
  props[name] = e;
}

function litProps(t) {
  const props = {};
  // @property({ … }) name: type = value, with or without `accessor`, `declare`, `override`.
  for (const m of t.matchAll(/@property\s*\(/g)) {
    const opts = inside(t, m.index + m[0].length - 1);
    if (/\bstate\s*:\s*true\b/.test(opts)) continue;
    const after = m.index + m[0].length + opts.length + 1;
    const f = /^\s*(?:(?:public|protected|override|declare|accessor|readonly)\s+)*([A-Za-z_$][\w$]*)\s*([!?])?/.exec(t.slice(after));
    if (!f) continue;
    const { type, value } = fieldAfter(t, after + f[0].length);
    put(props, f[1], { type, value, declared: LIT_TYPES[optionOf(opts, 'type')] ?? null });
  }
  // static properties = { … } and static get properties() { return { … } }
  const stat = /static\s+(?:override\s+)?(?:properties\s*=\s*|get\s+properties\s*\(\s*\)\s*\{\s*return\s*)\{/.exec(t);
  if (stat) {
    const body = inside(t, stat.index + stat[0].length - 1);
    for (const m of body.matchAll(/(?:^|[,{\n])\s*['"]?([A-Za-z_$][\w$]*)['"]?\s*:\s*\{/g)) {
      const opts = inside(body, m.index + m[0].length - 1);
      if (/\bstate\s*:\s*true\b/.test(opts)) continue;
      put(props, m[1], { declared: LIT_TYPES[optionOf(opts, 'type')] ?? null });
    }
  }
  // A default given in the constructor: this.size = 'm'.
  const ctor = /\bconstructor\s*\([^)]*\)\s*\{/.exec(t);
  if (ctor) for (const m of inside(t, ctor.index + ctor[0].length - 1).matchAll(/this\.([A-Za-z_$][\w$]*)\s*=\s*([^;\n]+)/g)) {
    if (props[m[1]] && props[m[1]].default === undefined) put(props, m[1], { value: m[2] });
  }
  return props;
}

function angularProps(t) {
  const props = {}, events = [];
  const field = (at) => /^\s*(?:(?:public|protected|override|readonly)\s+)*(?:(?:get|set)\s+(?=[A-Za-z_$]))?([A-Za-z_$][\w$]*)\s*([!?])?/.exec(t.slice(at));
  // @Input() name: type = value · @Input('alias') · @Input({ required: true, alias: 'x' }) · @Input() set name(v: T)
  for (const m of t.matchAll(/@Input\s*\(/g)) {
    const args = inside(t, m.index + m[0].length - 1), after = m.index + m[0].length + args.length + 1;
    const f = field(after);
    if (!f) continue;
    const alias = /^\s*['"]([\w-]+)['"]/.exec(args)?.[1] ?? (optionOf(args, 'alias') ? unq(optionOf(args, 'alias')) : null);
    const accessor = /^\s*(?:(?:public|protected|override)\s+)*(get|set)\s/.exec(t.slice(after))?.[1];
    // A setter's type is its parameter's, a getter's what it returns, and neither has a default of its own.
    const { type, value } = accessor === 'set' ? { type: /\(\s*\w+\s*:\s*([^)]+)\)/.exec(t.slice(after))?.[1] ?? '', value: '' }
      : accessor === 'get' ? { type: /\)\s*:\s*([^{]+)\{/.exec(t.slice(after))?.[1] ?? '', value: '' } : fieldAfter(t, after + f[0].length);
    put(props, alias ?? f[1], { type, value, required: /\brequired\s*:\s*true\b/.test(args) ? true : null });
  }
  // name = input<T>(value) · input.required<T>() · model<T>(value)
  for (const m of t.matchAll(/(?:^|[\s;{])(?:(?:public|protected|readonly)\s+)*([A-Za-z_$][\w$]*)\s*=\s*(input|model)(\.required)?\s*(<)?/g)) {
    let i = m.index + m[0].length - (m[4] ? 1 : 0), type = '';
    if (m[4]) { type = inside(t, i); i += type.length + 2; }
    const paren = t.indexOf('(', i);
    if (paren < 0 || t.slice(i, paren).trim()) continue;
    const args = inside(t, paren);
    const first = args.slice(0, topLevel(args, ',') >= 0 ? topLevel(args, ',') : undefined).trim();
    const opts = /\{[\s\S]*\}/.exec(args.slice(first.length))?.[0] ?? (first.startsWith('{') ? first : '');
    const name = optionOf(opts, 'alias') ? unq(optionOf(opts, 'alias')) : m[1];
    put(props, name, { type, value: m[3] || first.startsWith('{') ? '' : first, required: m[3] ? true : null });
    if (m[2] === 'model') events.push(`${name}Change`);
  }
  // @Output() name = new EventEmitter<T>() · @Output('alias') · name = output<T>() · outputFromObservable(…)
  for (const m of t.matchAll(/@Output\s*\(/g)) {
    const args = inside(t, m.index + m[0].length - 1), f = field(m.index + m[0].length + args.length + 1);
    if (f) events.push(/^\s*['"]([\w-]+)['"]/.exec(args)?.[1] ?? f[1]);
  }
  for (const m of t.matchAll(/(?:^|[\s;{])(?:(?:public|protected|readonly)\s+)*([A-Za-z_$][\w$]*)\s*=\s*(?:output|outputFromObservable)\s*[<(]/g)) events.push(m[1]);
  // inputs: ['size', 'label: ariaLabel'] in the component's own metadata.
  const meta = componentMeta(t);
  for (const m of (/\binputs\s*:\s*\[([^\]]*)\]/.exec(meta)?.[1] ?? '').matchAll(/['"]([\w-]+)(?:\s*:\s*([\w-]+))?['"]/g)) put(props, m[2] ?? m[1]);
  for (const m of (/\boutputs\s*:\s*\[([^\]]*)\]/.exec(meta)?.[1] ?? '').matchAll(/['"]([\w-]+)(?:\s*:\s*([\w-]+))?['"]/g)) events.push(m[2] ?? m[1]);
  return { props, events };
}
// The doc comment right above the component's class.
const classDoc = (text) => /(\/\*\*(?:(?!\*\/)[\s\S])*\*\/)\s*(?:@\w+\s*\((?:[^()]|\([^()]*\))*\)\s*)*(?:export\s+)?(?:default\s+)?(?:abstract\s+)?class\s/.exec(String(text ?? ''))?.[1] ?? '';
const componentMeta = (t) => { const m = /@Component\s*\(\s*\{/.exec(t); return m ? inside(t, m.index + m[0].length - 1) : ''; };

// The template text: Lit's html`` (the one render() returns first, else the first in the file), Angular's template or
// the file its templateUrl names.
export function templateOf(file, text, read = null) {
  const t = String(text ?? '');
  const kind = classKind(file, t);
  if (kind === 'lit') {
    const r = /\brender\s*\(\s*\)\s*(?::\s*[\w.<>| ]+)?\s*\{/.exec(t);
    const scope = r ? inside(t, r.index + r[0].length - 1) : t;
    const all = [...scope.matchAll(/\bhtml\s*`/g)].map((m) => templateLiteral(scope, m.index + m[0].length - 1));
    return all.join('\n');
  }
  if (kind === 'web component') {
    // What it writes into itself or its shadow root: innerHTML = `…`, a <template>'s innerHTML, insertAdjacentHTML.
    const all = [...t.matchAll(/\b(?:innerHTML\s*=|insertAdjacentHTML\s*\([^,]*,)\s*`/g)].map((m) => templateLiteral(t, m.index + m[0].length - 1));
    return all.join('\n');
  }
  if (kind === 'angular') {
    const meta = componentMeta(t);
    const inline = /\btemplate\s*:\s*(`)/.exec(meta);
    if (inline) return templateLiteral(meta, inline.index + inline[0].length - 1);
    const quoted = /\btemplate\s*:\s*(['"])((?:\\.|(?!\1).)*)\1/.exec(meta);
    if (quoted) return quoted[2];
    const url = /\btemplateUrl\s*:\s*['"]([^'"]+)['"]/.exec(meta)?.[1];
    if (!url) return '';
    const path = resolve(isAbsolute(String(file)) ? dirname(String(file)) : resolve(process.cwd(), dirname(String(file))), url);
    try { return (read ?? ((p) => readFileSync(p, 'utf8')))(path) ?? ''; } catch { return ''; }
  }
  return '';
}
// A template literal from its opening backtick, with each ${…} kept as written.
const templateLiteral = (s, open) => s.slice(open + 1, closeOf(s, open));

// What a template holds: Lit's <slot> (named or the default), Angular's <ng-content>, named by its select.
function slotsIn(tpl, kind) {
  const named = new Map();
  let hasDefault = false;
  if (kind === 'angular') {
    for (const m of tpl.matchAll(/<ng-content\b([^>]*)>/g)) {
      const sel = /\bselect\s*=\s*(['"])([^'"]+)\1/.exec(m[1])?.[2];
      if (!sel) { hasDefault = true; continue; }
      const name = selectorName(sel);
      if (!named.has(norm(name))) named.set(norm(name), name);
    }
  } else {
    for (const m of tpl.matchAll(/<slot\b([^>]*)>/g)) {
      const name = /(?:^|\s)name\s*=\s*(['"])([^'"]+)\1/.exec(m[1])?.[2] ?? /(?:^|\s)name\s*=\s*([\w-]+)/.exec(m[1])?.[1];
      if (name) { if (!named.has(norm(name))) named.set(norm(name), name); } else hasDefault = true;
    }
  }
  return { named: [...named.values()], default: hasDefault };
}

// What the code says of each prop, in the comment right above it (over its decorator, when it has one).
// → Map(normalised name → the comment's words), read with commentWords.
export function classPropComments(text, commentWords) {
  const out = new Map();
  const re = /(\/\*\*(?:(?!\*\/)[\s\S])*\*\/|(?:^[ \t]*\/\/[^\n]*\n)+)\s*(?:@(?:property|Input)\s*\((?:[^()]|\([^()]*\))*\)\s*)?(?:(?:public|protected|override|declare|accessor|readonly)\s+)*(?:set\s+)?['"]?([A-Za-z_$][\w$]*)['"]?\s*[!?]?\s*[:=(]/gm;
  for (const m of String(text ?? '').matchAll(re)) {
    const words = commentWords(m[1]);
    if (words && !out.has(norm(m[2]))) out.set(norm(m[2]), words);
  }
  return out;
}

// The name a select gives the content it picks: [slot=icon] → icon, else the attribute it asks for ([matChipAvatar];
// the last when one part asks for two, [matButtonIcon][iconPositionEnd]), else its class (.hint), else its element.
// What a part rules out (:not(…)) never names it.
export function selectorName(sel) {
  const s = String(sel ?? '').trim();
  const slot = /\[\s*slot\s*=\s*['"]?([\w-]+)['"]?\s*\]/.exec(s)?.[1];
  if (slot) return slot;
  const parts = s.split(',').map((p) => p.replace(/:not\((?:[^()]|\([^()]*\))*\)/g, '').trim()).filter(Boolean);
  for (const p of parts) { const attrs = [...p.matchAll(/\[\s*([\w-]+)/g)].map((m) => m[1]); if (attrs.length) return attrs.at(-1); }
  for (const p of parts) { const c = /\.([\w-]+)/.exec(p)?.[1]; if (c) return c; }
  return /^[a-z][\w-]*/.exec(parts[0] ?? '')?.[0] ?? s;
}

// What a class inherits from the class it extends, when that class is the project's own (imported from a path that
// starts with a dot): its props and events, read the same way, three classes up at most. A property the component
// declares itself wins.
function inherited(file, text, kind, read, seen = new Set(), depth = 0) {
  if (depth >= 3 || !file) return { props: {}, events: [] };
  const t = blank(text);
  const base = /\bclass\s+[A-Z]\w*(?:<[^>{]*>)?\s+extends\s+(?:\w+\(\s*)*([A-Z]\w*)/.exec(t)?.[1];
  const from = base && new RegExp(`import\\s*(?:type\\s*)?\\{[^}]*\\b${base}\\b[^}]*\\}\\s*from\\s*['"](\\.[^'"]+)['"]|import\\s+${base}\\s+from\\s*['"](\\.[^'"]+)['"]`).exec(t);
  const spec = from?.[1] ?? from?.[2];
  if (!spec) return { props: {}, events: [] };
  const dir = dirname(isAbsolute(String(file)) ? String(file) : resolve(process.cwd(), String(file)));
  const stem = resolve(dir, spec).replace(/\.(js|mjs|ts|mts)$/, '');
  const reader = read ?? ((p) => readFileSync(p, 'utf8'));
  for (const p of [`${stem}.ts`, `${stem}.js`, `${stem}.mts`, `${stem}.mjs`, join(stem, 'index.ts'), join(stem, 'index.js')]) {
    if (seen.has(p)) continue;
    let src = null;
    try { src = reader(p); } catch { /* not this one */ }
    if (!src) continue;
    seen.add(p);
    const own = kind === 'lit' ? { props: litProps(blank(src)), events: litEvents(blank(src)) } : angularProps(blank(src));
    const up = inherited(p, src, kind, read, seen, depth + 1);
    return { props: { ...up.props, ...own.props }, events: [...up.events, ...own.events] };
  }
  return { props: {}, events: [] };
}
// A plain custom element's props: each attribute it watches (observedAttributes), read as the property its accessor
// gives it (a kebab name as camelCase), a yes-or-no where its accessor asks hasAttribute or toggles it; and each public
// accessor pair (get x / set x) besides, as Lit's are read. Which attributes it reflects is said, so a drawing sets them.
function elementProps(t) {
  const props = {};
  const listed = /static\s+(?:get\s+observedAttributes\s*\(\s*\)\s*\{\s*return\s*|observedAttributes\s*=\s*)\[([^\]]*)\]/.exec(t)?.[1] ?? '';
  const camel = (a) => a.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
  for (const m of listed.matchAll(/['"`]([\w-]+)['"`]/g)) {
    const attr = m[1], name = camel(attr);
    const getter = new RegExp(`\\bget\\s+${name}\\s*\\(\\s*\\)\\s*(?::[^{]*)?\\{`).exec(t);
    const body = getter ? inside(t, getter.index + getter[0].length - 1) : '';
    const yesNo = new RegExp(`hasAttribute\\(\\s*['"\`]${attr}['"\`]`).test(body) || new RegExp(`toggleAttribute\\(\\s*['"\`]${attr}['"\`]`).test(t);
    put(props, name, { type: getter ? (/\)\s*:\s*([^{]+)\{/.exec(t.slice(getter.index, getter.index + getter[0].length))?.[1] ?? '') : '', declared: yesNo ? 'boolean' : 'string' });
    props[name].attribute = attr;
  }
  for (const m of t.matchAll(/(?:^|\n)\s*(?:public\s+)?get\s+([a-zA-Z][\w$]*)\s*\(\s*\)\s*(?::\s*([^{]+))?\{/g)) {
    if (props[m[1]] || !new RegExp(`\\bset\\s+${m[1]}\\s*\\(`).test(t)) continue;
    put(props, m[1], { type: m[2] ?? '' });
  }
  return props;
}
const litEvents = (t) => [...t.matchAll(/new\s+(?:CustomEvent|Event)\s*(?:<[^>]*>)?\s*\(\s*['"`]([\w:-]+)['"`]/g), ...t.matchAll(/\bthis\.emit\s*\(\s*['"`]([\w:-]+)['"`]/g)].map((m) => m[1]);

// The element a component draws as itself: Lit's custom element tag, Angular's selector.
function tagOf(t, kind) {
  if (kind === 'lit' || kind === 'web component') return /@tag(?:name)?\s+([a-z][\w]*-[\w-]*)/.exec(classDoc(t))?.[1] ?? /@customElement\s*\(\s*['"]([\w-]+)['"]/.exec(t)?.[1] ?? /customElements\.define\s*\(\s*['"]([\w-]+)['"]/.exec(t)?.[1] ?? null;
  return /\bselector\s*:\s*['"`]([^'"`]+)['"`]/.exec(componentMeta(t))?.[1]?.split(',')[0].trim() ?? null;
}

export function classComponentApi(file, text, { template = null, read = null } = {}) {
  const kind = classKind(file, text);
  if (!kind) return null;
  const t = blank(text);
  const tpl = template ?? templateOf(file, text, read);
  let props, events;
  if (kind === 'lit') {
    props = litProps(t);
    events = litEvents(t);
  } else if (kind === 'web component') {
    props = elementProps(t);
    events = litEvents(t);
  } else ({ props, events } = angularProps(t));
  const up = inherited(file, text, kind, read);
  props = { ...up.props, ...props };
  events = [...up.events, ...events];
  // What the class's own doc comment says it sends and holds (@event, @fires, @slot), the tags a manifest is built from.
  const doc = classDoc(text);
  for (const m of doc.matchAll(/@(?:event|fires)\s+(?:\{[^}]*\}\s*)?([\w:-]+)/g)) if (!/^\{/.test(m[1])) events.push(m[1]);
  const docSlots = [...doc.matchAll(/@slot\s+(?!-)([\w-]+)/g)].map((m) => m[1]), docDefault = /@slot\s+-/.test(doc);
  const tag = tagOf(t, kind);
  const slots = slotsIn(tpl, kind);
  for (const n of docSlots) if (!slots.named.some((x) => norm(x) === norm(n))) slots.named.push(n);
  if (docDefault) slots.default = true;
  return { props, slots, events: [...new Set(events)], kind, ...(tag ? { tag } : {}) };
}

// A template with its <!-- … --> comments cut, each read from its opening to its close (an unclosed one runs to the end).
function withoutComments(tpl) {
  let out = '', i = 0;
  for (let at = tpl.indexOf('<!--'); at !== -1; at = tpl.indexOf('<!--', i)) {
    out += tpl.slice(i, at);
    const end = tpl.indexOf('-->', at + 4);
    i = end === -1 ? tpl.length : end + 3;
  }
  return out + tpl.slice(i);
}

// The class a component carries on itself: Angular's host class, else the first class its template's first element
// carries (a Lit component's own element is its tag, styled through :host, so its first element is what carries one).
export function classRootClass(file, text, read = null) {
  const kind = classKind(file, text);
  if (!kind) return null;
  const host = kind === 'angular' ? /\bhost\s*:\s*\{[^}]*?['"]?class['"]?\s*:\s*['"]([^'"]+)['"]/.exec(componentMeta(blank(text)))?.[1] : null;
  const first = (s) => String(s ?? '').split(/\s+/).find((c) => /^-?[A-Za-z_][\w-]*$/.test(c)) ?? null;
  if (host && first(host)) return first(host);
  const tpl = withoutComments(templateOf(file, text, read));
  // Its first element, a tag chosen at render (<${tag}) among them, its attributes read past the ${…} they hold.
  // A <slot> is the content a person puts in, never the component's own element.
  const open = /<(?!slot[\s>])(?:[a-z][\w-]*|\$\{[^}]*\})[\s>]/.exec(tpl);
  if (!open) return null;
  let i = open.index + open[0].length, attrs = '';
  for (let depth = 0; i < tpl.length; i++) { const c = tpl[i]; if (c === '{') depth++; else if (c === '}') depth--; else if (c === '>' && depth <= 0) break; attrs += c; }
  // class=${classMap({ button: true, … })}: the first class it always sets.
  const mapped = /(?:^|\s)class\s*=\s*["']?\$\{\s*classMap\s*\(\s*\{\s*['"]?([A-Za-z_][\w-]*)['"]?\s*:\s*true\b/.exec(attrs);
  if (mapped) return mapped[1];
  const own = /(?:^|\s)class\s*=\s*(?:"([^"]*)"|'([^']*)')/.exec(attrs);
  // Its static classes only: one written with ${…} (acmeButton--${tone}) is a modifier, never the component's name.
  return own ? first(String(own[1] ?? own[2]).replace(/\S*\$\{[^}]*\}\S*/g, ' ')) : null;
}
