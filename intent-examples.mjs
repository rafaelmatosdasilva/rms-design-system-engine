// intent-examples.mjs - an example for a component page that shows none: the way the products use it most, taken from
// their code and written in the code's own syntax, as a draft for a person to approve.
//
// Where the calls come from: the files the usage map names for the component (its contract's livesIn.files, the files
// that use it most), read again. Each call is written the same way whatever product it is in: only what its contract
// has (a prop, an event, a slot) is kept, each prop's value kept when it is one of the values the prop takes (or a
// literal true, false or number), every other value written as the prop's name (an expression) or … (the product's own
// words), so nothing of a product's own data is left. The form most calls take wins; the file and line it is first written at
// are said with it. Never a prop the contract does not have.
//
//   callsIn(text, tags)                       → [{ tag, attrs, children, slots, line }]
//   apiOf(contract)                           → { props: Map(name → { options }), events: Set, slots: Set }
//   commonCall({ contract, files, syntax })   → { code, lang, file, line, product, same, total } | null
//   exampleText(call)                         → the drafted line that goes above the code

const squash = (x) => String(x ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
const esc = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const camel = (s) => String(s).replace(/-([a-z0-9])/g, (_, c) => c.toUpperCase());
const pascal = (s) => camel(s).replace(/^./, (c) => c.toUpperCase());
const kebab = (s) => String(s).replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();

// One attribute's value from where it starts: a quoted string, a braced expression (JSX, Svelte) or a bare word.
function valueAt(src, i) {
  const q = src[i];
  if (q === '"' || q === "'") { const j = src.indexOf(q, i + 1); return j < 0 ? null : { raw: src.slice(i + 1, j), quoted: true, end: j + 1 }; }
  if (q === '{') {
    let d = 0, k = i, s = null;
    for (; k < src.length; k++) {
      const c = src[k];
      if (s) { if (c === s && src[k - 1] !== '\\') s = null; continue; }
      if (c === '"' || c === "'" || c === '`') s = c;
      else if (c === '{') d++;
      else if (c === '}' && --d === 0) break;
    }
    return k >= src.length ? null : { raw: src.slice(i + 1, k).trim(), braced: true, end: k + 1 };
  }
  const m = /^[^\s>]+/.exec(src.slice(i));
  return m ? { raw: m[0].replace(/\/$/, ''), end: i + m[0].length - (m[0].endsWith('/') ? 1 : 0) } : null;
}

// Every call of a component in a file's text: its opening tag read attribute by attribute, what it holds when it is not
// self-closing (up to its closing tag, the same tag nested inside counted), and the named slots it fills (Vue's
// <template #name>, v-slot:name). tags: the names it is written with (TileMedia, tile-media).
export function callsIn(text, tags) {
  const src = String(text ?? ''), out = [];
  for (const tag of new Set(tags.filter(Boolean))) {
    const open = new RegExp(`<${esc(tag)}(?=[\\s/>])`, 'g');
    let m;
    while ((m = open.exec(src))) {
      let i = m.index + m[0].length, selfClosing = false, ok = false;
      const attrs = [];
      while (i < src.length && i - m.index < 4000) {
        while (/\s/.test(src[i] ?? '')) i++;
        if (src.startsWith('/>', i)) { selfClosing = true; i += 2; ok = true; break; }
        if (src[i] === '>') { i++; ok = true; break; }
        if (src[i] === '{') { const v = valueAt(src, i); if (!v) break; attrs.push({ name: '...', raw: v.raw, spread: true }); i = v.end; continue; }
        const n = /^[^\s=/>]+/.exec(src.slice(i));
        if (!n) break;
        i += n[0].length;
        while (/\s/.test(src[i] ?? '')) i++;
        if (src[i] !== '=') { attrs.push({ name: n[0], raw: null }); continue; }
        i++; while (/\s/.test(src[i] ?? '')) i++;
        const v = valueAt(src, i); if (!v) break;
        attrs.push({ name: n[0], raw: v.raw, ...(v.braced ? { braced: true } : {}), ...(v.quoted ? { quoted: true } : {}) });
        i = v.end;
      }
      if (!ok) continue;
      let children = null;
      if (!selfClosing) {
        const re = new RegExp(`<(/?)${esc(tag)}(?=[\\s/>])[^>]*?(/?)>`, 'g');
        re.lastIndex = i;
        let depth = 1, c;
        while ((c = re.exec(src))) { if (c[1]) depth--; else if (!c[2]) depth++; if (!depth) break; }
        children = c && !depth ? src.slice(i, c.index) : '';
      }
      const slots = children ? [...children.matchAll(/<template\s+(?:#|v-slot:)([\w-]+)/g)].map((x) => x[1]) : [];
      out.push({ tag, attrs, children, slots, at: m.index, line: src.slice(0, m.index).split('\n').length });
    }
  }
  return out.sort((a, b) => a.at - b.at);
}

// What a component's contract says it takes, by its code's own names: the props (each with the values it takes), the
// events and the slots. → { props: Map(code name → { options: [..] | null }), events: Set, slots: Set }
export function apiOf(contract) {
  const props = new Map(), events = new Set(), slots = new Set();
  for (const p of contract?.props ?? []) {
    const c = p?.bindings?.code;
    const name = typeof c?.attribute === 'string' ? c.attribute : typeof c?.prop === 'string' ? c.prop : null;
    if (name) props.set(name, { options: c.options ?? p.options ?? null, type: c.type ?? p.type ?? null });
    if (typeof c?.slot === 'string') slots.add(c.slot);
  }
  for (const p of contract?.codeOnly ?? []) if (p?.name && !props.has(p.name)) props.set(p.name, { options: p.options ?? null, type: p.type ?? null });
  for (const e of contract?.events ?? []) if (e?.name) events.add(e.name);
  for (const s of contract?.codeSlots ?? []) if (s?.name) slots.add(s.name);
  return { props, events, slots };
}

// An attribute as its syntax writes it, read as what it is: a prop (set to a value, bound to an expression, or present),
// an event, or something else (a directive, a key, a class, a spread), which is never kept.
function readAttr(a, syntax) {
  const n = a.name;
  if (a.spread) return null;
  if (syntax === 'vue') {
    if (/^(@|v-on:)/.test(n)) return { kind: 'event', name: n.replace(/^(@|v-on:)/, '').split('.')[0] };
    if (n === 'v-model') return { kind: 'bound', name: 'modelValue', model: true };
    if (/^v-model:/.test(n)) return { kind: 'bound', name: camel(n.slice(8).split('.')[0]), model: true };
    if (/^(:|v-bind:)/.test(n)) return { kind: 'bound', name: camel(n.replace(/^(:|v-bind:)/, '').split('.')[0]), raw: a.raw };
    if (/^(v-|#)/.test(n)) return null;
    return { kind: a.raw == null ? 'present' : 'static', name: camel(n), raw: a.raw };
  }
  if (syntax === 'svelte') {
    if (/^on:/.test(n)) return { kind: 'event', name: n.slice(3).split('|')[0] };
    if (/^bind:/.test(n)) return { kind: 'bound', name: n.slice(5), model: true };
    if (/^(use|transition|in|out|animate|class|let):/.test(n)) return null;
    return { kind: a.raw == null ? 'present' : a.braced ? 'bound' : 'static', name: n, raw: a.raw };
  }
  if (syntax === 'jsx') {
    if (/^on[A-Z]/.test(n)) return { kind: 'event', name: n.slice(2).replace(/^./, (c) => c.toLowerCase()), jsx: n };
    return { kind: a.raw == null ? 'present' : a.braced ? 'bound' : 'static', name: n, raw: a.raw };
  }
  // A web component: attributes in kebab case, each read as the prop of that name.
  if (/^(@|on)/.test(n)) return null;
  return { kind: a.raw == null ? 'present' : 'static', name: camel(n), attr: n, raw: a.raw };
}
// A bound value that is a literal (true, false, a number, a quoted string): kept as it is, since it is no product's data.
const LITERAL = /^(true|false|-?\d+(\.\d+)?|'[^']*'|"[^"]*")$/;

// One call written as the example would write it: the contract's props only, in the call's own order; a value that is one
// the prop takes, or a literal, as it is; an expression named after the prop, the product's own words as …; events
// handled by on<Event>; what it holds shown as … (its named slots kept, each holding …). → the code, or null when the call is not one to show.
function render(call, api, syntax) {
  const parts = [];
  const known = (name) => [...api.props.keys()].find((k) => squash(k) === squash(name)) ?? null;
  const takes = (p, v) => (api.props.get(p)?.options ?? []).some((o) => String(o) === String(v));
  for (const a of call.attrs) {
    const r = readAttr(a, syntax); if (!r) continue;
    if (r.kind === 'event') {
      const ev = [...api.events].find((e) => squash(e) === squash(r.name)); if (!ev) continue;
      const fn = `on${pascal(ev.replace(/[:.]/g, '-'))}`;
      parts.push(syntax === 'vue' ? `@${ev}="${fn}"` : syntax === 'svelte' ? `on:${ev}={${fn}}` : `${r.jsx ?? `on${pascal(ev)}`}={${fn}}`);
      continue;
    }
    const p = known(r.name); if (!p) continue;
    const attr = syntax === 'html' ? (r.attr ?? kebab(p)) : syntax === 'vue' && /-/.test(a.name.replace(/^(:|v-bind:|v-model:)/, '')) ? kebab(p) : p;
    if (r.kind === 'present') { parts.push(attr); continue; }
    if (r.model) { parts.push(syntax === 'vue' ? (r.name === 'modelValue' ? `v-model="${p}"` : `v-model:${attr}="${p}"`) : `bind:${p}={${p}}`); continue; }
    if (r.kind === 'static') { parts.push(takes(p, r.raw) ? `${attr}="${r.raw}"` : `${attr}="…"`); continue; }
    // Bound: a literal stays; an expression is the product's own data, written as the prop's name.
    const raw = String(r.raw ?? '').trim();
    const lit = LITERAL.test(raw) && (!/^['"]/.test(raw) || takes(p, raw.slice(1, -1)));
    if (syntax === 'vue') parts.push(lit ? `:${attr}="${raw.replace(/"/g, "'")}"` : `:${attr}="${p}"`);
    else parts.push(lit && /^['"]/.test(raw) ? `${attr}="${raw.slice(1, -1)}"` : `${attr}={${lit ? raw : p}}`);
  }
  const head = `<${call.tag}${parts.map((x) => ' ' + x).join('')}`;
  const inner = String(call.children ?? '').trim();
  if (call.children == null || !inner) return call.children == null ? `${head} />` : `${head}></${call.tag}>`;
  const named = call.slots.filter((s) => [...api.slots].some((x) => squash(x) === squash(s)));
  const rest = inner.replace(/<template\b[\s\S]*?<\/template>/g, '').trim();
  const lines = [...named.map((s) => `  <template #${s}>…</template>`), ...(rest ? ['  …'] : [])];
  return lines.length ? `${head}>\n${lines.join('\n')}\n</${call.tag}>` : `${head}></${call.tag}>`;
}

// The names a component is written with in the products: its code's own tag (the contract's), its name in Pascal case,
// and in kebab case where the syntax allows it (a Vue or Svelte template, a web component).
export function tagsOf(contract, syntax) {
  const tag = contract?.source?.code?.tag ?? null, name = contract?.name ?? '';
  const base = tag ?? pascal(String(name).replace(/[/\s]+/g, '-'));
  return [...new Set([base, ...(syntax === 'vue' || syntax === 'html' ? [kebab(base)] : [])].filter((t) => t && /^[A-Za-z][\w.:-]*$/.test(t)))];
}
const LANG = { vue: 'vue', svelte: 'svelte', jsx: 'jsx', html: 'html' };

// The way the products use a component most: every call in the files given read and written as the example would write
// it, and the form most of them take (the first one found, on a tie: the files come most used first). files: [{ file,
// text, product }]. → { code, lang, file, line, product, same, total } | null when no call is found or the contract
// names no syntax.
export function commonCall({ contract, files = [], syntax = null } = {}) {
  const sx = syntax ?? contract?.source?.code?.syntax ?? null;
  if (!contract || !LANG[sx]) return null;
  const api = apiOf(contract), tags = tagsOf(contract, sx);
  const own = String(contract?.source?.code?.file ?? '').replace(/^\.?\//, '');
  const forms = new Map();
  let total = 0;
  for (const f of files) {
    if (!f?.text || String(f.file).replace(/^\.?\//, '') === own) continue;
    for (const c of callsIn(f.text, tags)) {
      const code = render(c, api, sx); if (!code) continue;
      total++;
      // The same form whether a product writes its own data as text or as an expression.
      const key = code.replace(/\s:?([\w-]+)="(?:…|\1)"|\s([\w-]+)=\{\3\}/g, ' $1$3=*');
      const k = forms.get(key) ?? { code, file: f.file, line: c.line, product: f.product ?? null, same: 0 };
      k.same++; forms.set(key, k);
    }
  }
  if (!total) return null;
  const best = [...forms.values()].reduce((a, b) => (b.same > a.same ? b : a));
  return { ...best, lang: LANG[sx], total };
}

// The line above the example: how many of the uses read take this form, and where it was taken from (the file, its line,
// its product), said in plain words. Never in backticks: a product's file is not a name of the system.
export function exampleText(c) {
  const of = c.total > 1 ? `${c.same} of the ${c.total} uses read` : 'its one use read';
  return `The most common way the products use it (${of}), from ${c.file}, line ${c.line}${c.product ? `, in ${c.product}` : ''}, with the product's own data left out:`;
}
