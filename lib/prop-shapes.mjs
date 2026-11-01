// prop-shapes.mjs - what a component's list and object props hold: the fields of each item, read from the component's
// own documentation and from the code's own uses, so a page passes the data a component takes, never a guess.
//
//   docFields(text)          the fields its doc comment writes under a prop:
//                              @tabs {Array} the tabs           ·  - id {String, Number} …   ·  - label [String]: …
//                            → { tabs: { id: { type, fields? }, label: { type } } }
//   readLiteral(text)        a JS literal as written ([{ id: 1, label: 'A' }], ref([…]), useState([…])) → a value
//                            whose unknown parts (a variable, a call) are UNKNOWN
//   literalBindings(script)  each const/let the script gives a literal → { name: text of the literal }
//   itemKeys(value)          the keys of the objects a value holds, at its first level of objects
//   shapeFindings(value, fields, { required })  each key no field names, each required key missing
//
// Pure: no I/O. Framework-agnostic: the comment and literal syntax is the language's, not a framework's.

export const UNKNOWN = Symbol('unknown');

// ── The fields a doc comment writes under each prop ─────────────────────────────
// A prop line is "@name {Type} words"; a field line under it is "- name {Type} words" or "- name [Type]: words", each
// deeper level indented further. A line that names no field (a note, a "[Boolean] if…" variant) is skipped.
export function docFields(text) {
  const out = {};
  for (const block of String(text ?? '').matchAll(/\/\*\*?([\s\S]*?)\*\//g)) {
    let prop = null;
    const stack = [];   // [{ indent, fields }]
    for (const raw of block[1].split('\n')) {
      const line = raw.replace(/^\s*\*(?!\*)/, (m) => m.replace('*', ' ')).replace(/\t/g, '    ');
      const p = /^\s*@([A-Za-z_$][\w$]*)\s*\{\s*([^}]*)\}/.exec(line);
      if (p) { prop = p[1]; out[prop] = out[prop] ?? {}; stack.length = 0; stack.push({ indent: -1, fields: out[prop] }); continue; }
      if (!prop) continue;
      const f = /^(\s*)-\s*([A-Za-z_$][\w$]*)\s*(?:\{\s*([^}]*)\}|\[\s*([^\]]*)\]|:)/.exec(line);
      if (!f) continue;
      const indent = f[1].length;
      while (stack.length > 1 && stack[stack.length - 1].indent >= indent) stack.pop();
      const parent = stack[stack.length - 1].fields;
      const type = String(f[3] ?? f[4] ?? '').trim().toLowerCase().split(/\s*[|,]\s*/).filter(Boolean).join(' | ') || null;
      const entry = parent[f[2]] ?? { ...(type ? { type } : {}) };
      parent[f[2]] = entry;
      entry.fields = entry.fields ?? {};
      stack.push({ indent, fields: entry.fields });
    }
  }
  // A field with nothing under it has no fields of its own.
  const tidy = (fields) => { for (const e of Object.values(fields)) { if (e.fields && !Object.keys(e.fields).length) delete e.fields; else if (e.fields) tidy(e.fields); } return fields; };
  for (const k of Object.keys(out)) { tidy(out[k]); if (!Object.keys(out[k]).length) delete out[k]; }
  return out;
}

// ── A literal as written ─────────────────────────────────────────────────────────
// Objects, arrays, strings, numbers, booleans and null; a key unquoted, quoted or shorthand ({ id }). A wrapper call the
// frameworks use for state (ref, reactive, useState, $state, signal, writable, readonly, shallowRef) is read through.
const WRAPPERS = /^(?:ref|reactive|shallowRef|shallowReactive|readonly|useState|useRef|signal|writable|readable|\$state|computed)$/;
export function readLiteral(text) {
  const s = String(text ?? '');
  let i = 0;
  const ws = () => { for (;;) { while (i < s.length && /\s/.test(s[i])) i++; if (s.startsWith('//', i)) { while (i < s.length && s[i] !== '\n') i++; continue; } if (s.startsWith('/*', i)) { const e = s.indexOf('*/', i + 2); i = e < 0 ? s.length : e + 2; continue; } break; } };
  // An expression the reader does not follow: skipped to the next , } ] ) at its own depth.
  const skip = () => { let d = 0; while (i < s.length) { const ch = s[i]; if (ch === '"' || ch === "'" || ch === '`') { str(); continue; } if ('([{'.includes(ch)) d++; else if (')]}'.includes(ch)) { if (!d) break; d--; } else if (ch === ',' && !d) break; i++; } return UNKNOWN; };
  const str = () => { const q = s[i++]; let out = ''; while (i < s.length && s[i] !== q) { if (s[i] === '\\') { out += s[i + 1] ?? ''; i += 2; continue; } if (q === '`' && s.startsWith('${', i)) return skip(); out += s[i++]; } i++; return out; };
  const value = () => {
    ws();
    const ch = s[i];
    if (ch === '[') {
      i++; const arr = [];
      for (;;) { ws(); if (s[i] === ']') { i++; return arr; } if (i >= s.length) return arr; if (s.startsWith('...', i)) { i += 3; skip(); } else arr.push(value()); ws(); if (s[i] === ',') i++; }
    }
    if (ch === '{') {
      i++; const obj = {};
      for (;;) {
        ws(); if (s[i] === '}') { i++; return obj; } if (i >= s.length) return obj;
        if (s.startsWith('...', i)) { i += 3; skip(); ws(); if (s[i] === ',') i++; continue; }
        let key;
        if (s[i] === '"' || s[i] === "'") key = str();
        else if (s[i] === '[') { skip(); key = null; }
        else { const m = /^[A-Za-z_$][\w$]*|^\d+/.exec(s.slice(i)); if (!m) { skip(); ws(); if (s[i] === ',') i++; continue; } key = m[0]; i += m[0].length; }
        ws();
        if (s[i] === ':') { i++; const v = value(); if (key != null) obj[key] = v; }
        else if (s[i] === '(') { skip(); if (key != null) obj[key] = UNKNOWN; }   // a method
        else if (key != null) obj[key] = UNKNOWN;                                // shorthand { id }
        ws(); if (s[i] === ',') i++;
      }
    }
    if (ch === '"' || ch === "'" || ch === '`') return str();
    const num = /^-?\d+(?:\.\d+)?/.exec(s.slice(i));
    if (num) { i += num[0].length; ws(); if (/[,\]})]/.test(s[i] ?? ',')) return Number(num[0]); return skip(); }
    const word = /^[A-Za-z_$][\w$]*/.exec(s.slice(i));
    if (word) {
      const w = word[0]; i += w.length; ws();
      if (/[,\]})]/.test(s[i] ?? ',') || i >= s.length) return w === 'true' ? true : w === 'false' ? false : w === 'null' ? null : UNKNOWN;
      if (s[i] === '(' && WRAPPERS.test(w)) { i++; ws(); if (s[i] === ')') { i++; return UNKNOWN; } const v = value(); skip(); if (s[i] === ')') i++; return v; }
      return skip();
    }
    return skip();
  };
  return value();
}

// Each name a script gives a literal: const tabs = ref([…]) · let rows = [...] · const [items, setItems] = useState([…]).
export function literalBindings(script) {
  const out = {};
  const s = String(script ?? '');
  for (const m of s.matchAll(/\b(?:const|let|var)\s+(?:([A-Za-z_$][\w$]*)|\[\s*([A-Za-z_$][\w$]*)\s*,[^\]]*\])\s*(?::\s*[^=]+)?=\s*/g)) {
    const name = m[1] ?? m[2];
    const start = m.index + m[0].length;
    // The literal runs to the end of its statement: its brackets balanced, then a ; or a new line.
    let d = 0, j = start;
    for (; j < s.length; j++) {
      const ch = s[j];
      if (ch === '"' || ch === "'" || ch === '`') { const q = ch; j++; while (j < s.length && s[j] !== q) { if (s[j] === '\\') j++; j++; } continue; }
      if ('([{'.includes(ch)) d++;
      else if (')]}'.includes(ch)) d--;
      else if (!d && (ch === ';' || ch === '\n')) break;
    }
    if (!(name in out)) out[name] = s.slice(start, j).trim();
  }
  return out;
}

// The objects a value holds at its first level of objects: [{…}, {…}] and [[{…}], [{…}]] give the inner objects.
export function itemsOf(v) {
  if (v === UNKNOWN || v == null) return [];
  if (Array.isArray(v)) return v.flatMap((x) => (Array.isArray(x) ? itemsOf(x) : x && typeof x === 'object' ? [x] : []));
  return typeof v === 'object' ? [v] : [];
}

// What a value gives that the component does not take, and what it leaves out that every use in the code gives.
// fields: docFields' entry for the prop · required: keys every real use gives. → [{ kind, key, path, item }]
export function shapeFindings(value, fields = null, { required = [], path = '' } = {}) {
  const out = [];
  const items = itemsOf(value);
  items.forEach((item, n) => {
    for (const k of Object.keys(item)) {
      if (fields && Object.keys(fields).length && !(k in fields)) out.push({ kind: 'unknown', key: k, path, item: n, known: Object.keys(fields) });
      else if (fields?.[k]?.fields && item[k] && typeof item[k] === 'object') out.push(...shapeFindings(item[k], fields[k].fields, { path: `${path}${k}.` }));
    }
    for (const k of required) if (!(k in item)) out.push({ kind: 'missing', key: k, path, item: n });
  });
  return out;
}

// The keys every item of every real use gives (seen at least `min` times): what a use without them leaves out.
// uses: [values]. → [keys]
export function requiredKeys(uses = [], { min = 3 } = {}) {
  const items = uses.flatMap(itemsOf);
  if (items.length < min) return [];
  const keys = new Set(items.flatMap((x) => Object.keys(x)));
  return [...keys].filter((k) => items.every((x) => k in x));
}
