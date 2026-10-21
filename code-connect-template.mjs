// code-connect-template.mjs - the template form of a Code Connect file read as the code it is, not by patterns: each
// variable a Figma property is read into (figma.selectedInstance.getEnum('size', { s: 's' })), and what the example
// (figma.html`<tile-one …>`) does with it, each ${…} evaluated for every branch it can take.
//
//   readTemplateForm(src) → { tag, props: [{ figma, code, kind, role, negated?, equals?, values? }] }
//
// A property either fills an attribute (role value: caption="${caption}", or a bare `disabled` given when it is true) or
// decides whether an attribute is written at all (role condition: ${revealCaption ? `caption="${caption}"` : ''} makes
// revealCaption the condition of caption; ${!revealCaption ? `icon="${icon}"` : ''} the condition of icon, negated). A comparison
// of a property with a value (${type === 'card' ? 'outlined' : ''}) is a condition with `equals`. A property compared
// with itself only to leave out its default (${size !== 'm' ? `size="${size}"` : ''}) is just its value. An attribute of
// another component inside the example belongs to that component, never to this one. A property used only inside an
// expression the reader cannot follow (a call, an array joined) has code null: it is not one Figma property.
// No dependency: a tokenizer and a small expression parser for what these templates use.

// ── Reading the source: template literals with ${…} inside them, nested to any depth ─────────────────────────────────
// From just after an opening backtick → { parts: [{ text } | { expr }], end } (end: just after the closing backtick).
function scanTemplate(src, i) {
  const parts = []; let text = '';
  while (i < src.length) {
    const c = src[i];
    if (c === '\\') { text += src[i + 1] ?? ''; i += 2; continue; }
    if (c === '`') { parts.push({ text }); return { parts, end: i + 1 }; }
    if (c === '$' && src[i + 1] === '{') {
      parts.push({ text }); text = '';
      const { expr, end } = scanExpr(src, i + 2);
      parts.push({ expr }); i = end; continue;
    }
    text += c; i++;
  }
  parts.push({ text }); return { parts, end: i };
}
// From just after ${ → { expr (its source), end (just after the matching }) }, strings and templates inside skipped.
function scanExpr(src, i) {
  const start = i; let depth = 0;
  while (i < src.length) {
    const c = src[i];
    if (c === '\'' || c === '"') { i = skipString(src, i); continue; }
    if (c === '`') { i = scanTemplate(src, i + 1).end; continue; }
    if (c === '{') depth++;
    else if (c === '}') { if (!depth) return { expr: src.slice(start, i), end: i + 1 }; depth--; }
    i++;
  }
  return { expr: src.slice(start), end: i };
}
function skipString(src, i) {
  const q = src[i]; i++;
  while (i < src.length && src[i] !== q) i += src[i] === '\\' ? 2 : 1;
  return i + 1;
}

// ── Expressions: tokens, then a small precedence parser ─────────────────────────────────────────────────────────────
function tokenize(src) {
  const out = []; let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c)) { i++; continue; }
    if (c === '/' && src[i + 1] === '/') { while (i < src.length && src[i] !== '\n') i++; continue; }
    if (c === '/' && src[i + 1] === '*') { const j = src.indexOf('*/', i + 2); i = j < 0 ? src.length : j + 2; continue; }
    if (c === '\'' || c === '"') { const end = skipString(src, i); out.push({ t: 'str', v: src.slice(i + 1, end - 1).replace(/\\(.)/g, '$1') }); i = end; continue; }
    if (c === '`') { const { parts, end } = scanTemplate(src, i + 1); out.push({ t: 'tpl', parts }); i = end; continue; }
    const id = /^[A-Za-z_$][\w$]*/.exec(src.slice(i));
    if (id) { out.push({ t: 'id', v: id[0] }); i += id[0].length; continue; }
    const num = /^\d+(\.\d+)?/.exec(src.slice(i));
    if (num) { out.push({ t: 'num', v: num[0] }); i += num[0].length; continue; }
    const op = /^(===|!==|==|!=|&&|\|\||\?\?|\?\.|<=|>=|=>|\.\.\.|[?:!().,[\]{}+\-*/<>=%])/.exec(src.slice(i));
    if (op) { out.push({ t: 'op', v: op[0] }); i += op[0].length; continue; }
    i++;
  }
  return out;
}
// → a node: { k: 'str'|'tpl'|'id'|'cond'|'and'|'or'|'not'|'cmp'|'opaque', … }. What it does not model (calls, members,
// arithmetic, arrays, objects, arrow functions) becomes `opaque` with the identifiers it uses, so nothing is guessed.
function parse(tokens) {
  let p = 0;
  const peek = (v) => tokens[p]?.t === 'op' && tokens[p].v === v;
  const ternary = () => {
    const test = or();
    if (peek('?')) { p++; const yes = ternary(); if (peek(':')) p++; const no = ternary(); return { k: 'cond', test, yes, no }; }
    return test;
  };
  const or = () => { let l = and(); while (peek('||') || peek('??')) { p++; l = { k: 'or', l, r: and() }; } return l; };
  const and = () => { let l = cmp(); while (peek('&&')) { p++; l = { k: 'and', l, r: cmp() }; } return l; };
  const cmp = () => {
    let l = unary();
    while (['===', '!==', '==', '!=', '<', '>', '<=', '>='].some(peek)) { const op = tokens[p++].v; l = { k: 'cmp', op, l, r: unary() }; }
    return l;
  };
  const unary = () => { if (peek('!')) { p++; return { k: 'not', e: unary() }; } return postfix(); };
  const postfix = () => {
    let e = primary();
    // [a, b ? `x` : ''].filter(Boolean).join(', '): a list written as one text, each item on its own.
    if (e.k === 'arr') {
      while (peek('.') && tokens[p + 1]?.v === 'filter') { p += 2; if (peek('(')) { p++; collectUntil(')'); } }
      if (peek('.') && tokens[p + 1]?.v === 'join') { p += 2; if (peek('(')) { p++; collectUntil(')'); } e = { k: 'join', items: e.items }; }
      else e = { k: 'opaque', ids: e.items.flatMap(idsOf) };
    }
    // a member, an index or a call: what it reads is kept, what it does is not followed.
    while (peek('.') || peek('?.') || peek('(') || peek('[')) {
      const ids = idsOf(e);
      if (peek('.') || peek('?.')) { p++; if (tokens[p]?.t === 'id') p++; }
      else { const close = peek('(') ? ')' : ']'; p++; ids.push(...collectUntil(close)); }
      e = { k: 'opaque', ids };
    }
    if (peek('=>')) { p++; const body = ternary(); e = { k: 'opaque', ids: [...idsOf(e), ...idsOf(body)] }; }
    while (['+', '-', '*', '/', '%'].some(peek)) { p++; e = { k: 'opaque', ids: [...idsOf(e), ...idsOf(unary())] }; }
    return e;
  };
  const collectUntil = (close) => {
    const ids = []; let depth = 0;
    while (p < tokens.length) {
      const tk = tokens[p];
      if (tk.t === 'op' && (tk.v === '(' || tk.v === '[' || tk.v === '{')) depth++;
      if (tk.t === 'op' && (tk.v === ')' || tk.v === ']' || tk.v === '}')) { if (!depth && tk.v === close) { p++; return ids; } depth--; }
      if (tk.t === 'id') ids.push(tk.v);
      if (tk.t === 'tpl') for (const part of tk.parts) if (part.expr != null) ids.push(...tokenize(part.expr).filter((x) => x.t === 'id').map((x) => x.v));
      p++;
    }
    return ids;
  };
  const primary = () => {
    const tk = tokens[p++];
    if (!tk) return { k: 'str', v: '' };
    if (tk.t === 'str') return { k: 'str', v: tk.v };
    if (tk.t === 'num') return { k: 'str', v: tk.v };
    if (tk.t === 'tpl') return { k: 'tpl', parts: tk.parts.map((x) => (x.expr != null ? { expr: parseExpr(x.expr) } : x)) };
    if (tk.t === 'id') return ['true', 'false', 'null', 'undefined'].includes(tk.v) ? { k: 'str', v: tk.v === 'true' ? 'true' : '' } : { k: 'id', v: tk.v };
    if (tk.t === 'op' && tk.v === '(') { const e = ternary(); if (peek(')')) p++; return e; }
    if (tk.t === 'op' && tk.v === '[') {
      const items = [];
      while (p < tokens.length && !peek(']')) { const at = p; items.push(ternary()); if (peek(',')) p++; else if (p === at) p++; else if (!peek(']')) return { k: 'opaque', ids: [...items.flatMap(idsOf), ...collectUntil(']')] }; }
      if (peek(']')) p++;
      return { k: 'arr', items };
    }
    if (tk.t === 'op' && tk.v === '{') return { k: 'opaque', ids: collectUntil('}') };
    return { k: 'str', v: '' };
  };
  return ternary();
}
const parseExpr = (src) => parse(tokenize(src));
function idsOf(n) {
  if (!n) return [];
  switch (n.k) {
    case 'id': return [n.v];
    case 'opaque': return [...n.ids];
    case 'tpl': return n.parts.flatMap((x) => (x.expr ? idsOf(x.expr) : []));
    case 'cond': return [...idsOf(n.test), ...idsOf(n.yes), ...idsOf(n.no)];
    case 'and': case 'or': return [...idsOf(n.l), ...idsOf(n.r)];
    case 'not': return idsOf(n.e);
    case 'arr': case 'join': return n.items.flatMap(idsOf);
    case 'cmp': return [...idsOf(n.l), ...idsOf(n.r)];
    default: return [];
  }
}

// ── Branches: every text an expression can give, each with the conditions it holds under ────────────────────────────
// A text keeps a mark where a property's own value goes: \u0001name\u0002. Conditions: [{ v, negated?, equals? }].
const MARK = (v) => `\u0001${v}\u0002`;
const MAX_BRANCHES = 64;
// A local is read as what it holds (const hasBox = type === 'selectable', then ${hasBox ? … : ''}).
function conditionsOf(n, vars, negated = false, locals = null, seen = new Set()) {
  if (!n) return [];
  const again = (x, neg = negated) => conditionsOf(x, vars, neg, locals, seen);
  if (n.k === 'id' && vars.has(n.v)) return [{ v: n.v, negated }];
  if (n.k === 'id' && locals?.has(n.v) && !seen.has(n.v)) { seen.add(n.v); return again(locals.get(n.v)); }
  if (n.k === 'not') return again(n.e, !negated);
  if (n.k === 'and' && !negated) return [...again(n.l), ...again(n.r)];
  if (n.k === 'cmp') {
    const side = n.l.k === 'id' && vars.has(n.l.v) ? n.l : n.r.k === 'id' && vars.has(n.r.v) ? n.r : null;
    const other = side === n.l ? n.r : n.l;
    if (side && other.k === 'str') {
      const differs = n.op === '!==' || n.op === '!=';
      return [{ v: side.v, equals: other.v, negated: differs !== negated }];
    }
  }
  // Anything else (an or, a negated and): each property it reads is a condition, its direction unknown.
  const ids = (x, sn = new Set()) => idsOf(x).flatMap((id) => (vars.has(id) ? [id] : locals?.has(id) && !sn.has(id) ? (sn.add(id), ids(locals.get(id), sn)) : []));
  return [...new Set(ids(n))].map((v) => ({ v, unclear: true }));
}
function branches(n, vars, locals, seen = new Set()) {
  if (!n) return [{ text: '', conds: [] }];
  switch (n.k) {
    case 'str': return [{ text: n.v, conds: [] }];
    case 'id': {
      if (vars.has(n.v)) return [{ text: MARK(n.v), conds: [] }];
      if (locals.has(n.v) && !seen.has(n.v)) return branches(locals.get(n.v), vars, locals, new Set([...seen, n.v]));
      return [{ text: '', conds: [] }];
    }
    case 'tpl': {
      let acc = [{ text: '', conds: [] }];
      for (const part of n.parts) {
        const next = part.expr ? branches(part.expr, vars, locals, seen) : [{ text: part.text, conds: [] }];
        const joined = [];
        for (const a of acc) for (const b of next) joined.push({ text: a.text + b.text, conds: [...a.conds, ...b.conds] });
        acc = joined.length > MAX_BRANCHES ? joined.slice(0, MAX_BRANCHES) : joined;
      }
      return acc;
    }
    case 'cond': {
      const yes = branches(n.yes, vars, locals, seen).map((b) => ({ ...b, conds: [...conditionsOf(n.test, vars, false, locals), ...b.conds] }));
      const no = branches(n.no, vars, locals, seen).map((b) => ({ ...b, conds: [...conditionsOf(n.test, vars, true, locals), ...b.conds] }));
      return [...yes, ...no];
    }
    case 'and': return [...branches(n.r, vars, locals, seen).map((b) => ({ ...b, conds: [...conditionsOf(n.l, vars, false, locals), ...b.conds] })), { text: '', conds: [] }];
    case 'or': return [...branches(n.l, vars, locals, seen), ...branches(n.r, vars, locals, seen)];
    // A list joined into one text: each item is read on its own, so one item's conditions never reach another's text.
    case 'join': return [...n.items.flatMap((it) => branches(it, vars, locals, seen)), { text: '', conds: [] }];
    case 'arr': return [{ text: '', conds: [], opaque: idsOf(n).filter((x) => vars.has(x)) }];
    // A property written the other way round (:hidden="${!shown}"): its value, marked negated.
    case 'not': if (n.e?.k === 'id' && vars.has(n.e.v)) return [{ text: MARK(`!${n.e.v}`), conds: [] }];
    // falls through
    // An expression it cannot follow: no text, and the properties it reads are noted as used that way.
    // A value computed from one property and nothing else (its words split, an icon resolved from it): that property's
    // value, marked as computed.
    case 'opaque': { const from = [...new Set(idsOf(n).flatMap((x) => (vars.has(x) ? [x] : locals.has(x) ? idsOf(locals.get(x)).filter((y) => vars.has(y)) : [])))]; if (from.length === 1) return [{ text: MARK(`~${from[0]}`), conds: [] }]; return [{ text: '', conds: [], opaque: from }]; }
    case 'cmp': return [{ text: '', conds: [], opaque: [...new Set(idsOf(n).flatMap((x) => (vars.has(x) ? [x] : locals.has(x) ? idsOf(locals.get(x)).filter((y) => vars.has(y)) : [])))] }];
    default: return [{ text: '', conds: [] }];
  }
}

// ── Where a branch's text sits in the example: which tag, which attribute, which key of an object value ─────────────
// The tag open at the end of `html` (its name), or null when between tags.
function openTag(html) {
  const lt = html.lastIndexOf('<'), gt = html.lastIndexOf('>');
  if (lt < 0 || gt > lt) return null;
  return /^<\s*([A-Za-z][\w.-]*)/.exec(html.slice(lt))?.[1] ?? null;
}
// The attribute whose quoted value is open at the end of `html`: { name, value (what of it is written so far) } or null.
function openAttribute(html) {
  const tagStart = html.lastIndexOf('<');
  const inTag = html.slice(tagStart);
  const re = /([:@]?[A-Za-z_][\w:.-]*)\s*=\s*(["'])/g;
  let m, last = null;
  while ((m = re.exec(inTag))) {
    const close = inTag.indexOf(m[2], m.index + m[0].length);
    if (close < 0) last = { name: m[1], value: inTag.slice(m.index + m[0].length) };
    else re.lastIndex = close + 1;
  }
  return last;
}
const attrName = (a) => String(a).replace(/^v-bind:|^[:@]/, '');

export function readTemplateForm(src) {
  const vars = new Map(), locals = new Map(), order = [];
  const decl = /(?:^|\n)\s*(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*/g;
  let m;
  while ((m = decl.exec(src))) {
    const name = m[1], from = m.index + m[0].length;
    const init = readStatement(src, from);
    const getter = /^figma\.(?:selectedInstance|currentLayer)\.get(Enum|Boolean|String|InstanceSwap|PropertyValue)\(\s*(['"])([^'"]+)\2/.exec(init);
    const helper = /^[\w$.]+\(\s*figma\.(?:selectedInstance|currentLayer)\s*,\s*(['"])([^'"]+)\1/.exec(init);
    if (getter) {
      const kind = getter[1].toLowerCase();
      vars.set(name, { figma: getter[3], kind, ...(kind === 'enum' ? valueMapOf(init) : {}) }); order.push(name);
    } else if (helper) { vars.set(name, { figma: helper[2], kind: 'instance' }); order.push(name); }
    else if (!/^figma\.html|^\{/.test(init)) locals.set(name, parseExpr(init));
  }
  // The example: the first figma.html`…` (or figma.code / tsx / vue) template.
  const at = /figma\.(?:html|code|tsx|vue)\s*`/.exec(src);
  const tpl = at ? scanTemplate(src, at.index + at[0].length).parts : [];
  const staticHtml = tpl.filter((x) => x.expr == null).map((x) => x.text).join('');
  const tag = /<\s*([a-z][\w-]*|[A-Z][\w.]*)/.exec(staticHtml)?.[1] ?? null;

  const found = new Map(order.map((v) => [v, []]));
  const opaque = new Set();
  const add = (v, entry) => { const list = found.get(v); if (list && !list.some((e) => JSON.stringify(e) === JSON.stringify(entry))) list.push(entry); };
  let before = '';
  tpl.forEach((part, i) => {
    if (part.expr == null) { before += part.text; return; }
    for (const b of branches(parseExpr(part.expr), vars, locals)) {
      for (const v of b.opaque ?? []) opaque.add(v);
      read(before, b, (v, entry) => add(v, entry));
    }
    void i;
  });
  // A whole-template local written as one value (params built in JavaScript, then :params="${params}") was read above
  // as the branches of that local, so its keys are attributed the same way.

  function read(context, b, emit) {
    const text = b.text;
    if (!text) return;
    const tagHere = openTag(context);
    if (!tagHere || (tag && tagHere !== tag)) return;   // between tags, or inside another component's tag
    const self = new Set([...text.matchAll(/\u0001[!~]?([^\u0002]+)\u0002/g)].map((x) => x[1]));
    // A mark is the property's own value (!: written the other way round; ~: computed from it, as a part of its words).
    const valueOf = (mark, code, extra = {}) => (mark.startsWith('!') ? emit(mark.slice(1), { code, role: 'value', negated: true, mark: true, ...extra }) : mark.startsWith('~') ? emit(mark.slice(1), { code, role: 'value', derived: true, mark: true, ...extra }) : emit(mark, { code, role: 'value', mark: true, ...extra }));
    // A fixed true or false written under one property's own on/off (${!framed ? ':framed="false"' : ''}) is that
    // property's value: the code prop holds it (the other way round when they disagree).
    const ownValue = (literal) => {
      const c = b.conds.length === 1 ? b.conds[0] : null;
      if (!c || c.equals != null || c.unclear || !/^(true|false)$/.test(String(literal).trim())) return null;
      const negated = (String(literal).trim() === 'false') !== !!c.negated;
      return { v: c.v, ...(negated ? { negated: true } : {}) };
    };
    const condition = (target) => {
      for (const c of b.conds) {
        if (self.has(c.v) && (c.equals != null || !c.negated)) continue;   // a property tested against itself: its value
        emit(c.v, { code: target, role: 'condition', ...(c.negated ? { negated: true } : {}), ...(c.equals != null ? { equals: c.equals } : {}), ...(c.unclear ? { unclear: true } : {}) });
      }
    };
    // Inside an attribute's quoted value already: the marks are values of that attribute (or of a key of its object).
    const open = openAttribute(context);
    if (open) {
      for (const mk of text.matchAll(/\u0001([^\u0002]+)\u0002/g)) {
        const sofar = open.value + text.slice(0, mk.index);
        const key = /([A-Za-z_$][\w$]*)\s*:\s*['"`]?\s*$/.exec(sofar)?.[1];
        const target = attrName(open.name) + (key ? `.${key}` : '');
        valueOf(mk[1], target);
        condition(target);
      }
      // Keys written with a fixed value inside the attribute (mandatory: true): decided by the branch's conditions.
      if (!/\u0001/.test(text)) {
        for (const kv of text.matchAll(/([A-Za-z_$][\w$]*)\s*:\s*([^,}\n]+)/g)) {
          const target = `${attrName(open.name)}.${kv[1]}`, own = ownValue(kv[2]);
          if (own) emit(own.v, { code: target, role: 'value', ...(own.negated ? { negated: true } : {}) });
          else for (const c of b.conds) emit(c.v, { code: target, role: 'condition', ...(c.negated ? { negated: true } : {}), ...(c.equals != null ? { equals: c.equals } : {}), ...(c.unclear ? { unclear: true } : {}) });
        }
      }
      return;
    }
    // Attributes the branch writes itself: name="…${v}…" (its value), name="fixed" (written when its conditions hold:
    // they decide it), a bare one (the property that switches it on), or an event listener (@name: never a prop).
    const re = /((?:v-on:|@|v-bind:|:)?[A-Za-z_][\w:.-]*)(?:\s*=\s*(["'])([\s\S]*?)\2)?/g;
    const flags = (c) => ({ ...(c.negated ? { negated: true } : {}), ...(c.equals != null ? { equals: c.equals } : {}), ...(c.unclear ? { unclear: true } : {}) });
    let a;
    while ((a = re.exec(text))) {
      const event = /^(?:@|v-on:)/.test(a[1]);
      const name = attrName(a[1].replace(/^v-on:/, '@')); const value = a[3];
      const extra = event ? { event: true } : {};
      if (value != null) {
        const found = [...value.matchAll(/\u0001([^\u0002]+)\u0002/g)];
        const marks = found.map((x) => x[1]);
        // A mark inside an object the attribute writes ([{ owner: '${owner}' }]) fills that key of it.
        const keyAt = (m) => (event ? null : /([A-Za-z_$][\w$]*)\s*:\s*['"`]?\s*$/.exec(value.slice(0, m.index))?.[1] ?? null);
        for (const m of found) { const k = keyAt(m); valueOf(m[1], k ? `${name}.${k}` : name, extra); if (k) condition(`${name}.${k}`); }
        const own = !marks.length && !event ? ownValue(value) : null;
        if (found.some((m) => !keyAt(m))) condition(name);
        else if (own) emit(own.v, { code: name, role: 'value', ...(own.negated ? { negated: true } : {}) });
        else for (const c of b.conds) emit(c.v, { code: name, role: 'condition', ...flags(c), ...extra });
      } else {
        for (const c of b.conds) emit(c.v, { code: name, role: c.equals != null || c.unclear || event ? 'condition' : 'value', ...flags(c), ...extra });
      }
    }
  }

  const props = [];
  for (const v of order) {
    const info = vars.get(v);
    // An attribute written either way, with a different fixed value on and off (${on ? ':picked="a"' : ':picked="b"'}), is not
    // decided by the property: the property picks its value.
    // A property that fills an attribute (or a key of it) does not also decide that attribute: the branch that leaves its
    // value out (${name ? `title: '${name}'` : ''}) is that same value, empty.
    const all = found.get(v);
    const fills = new Set(all.filter((e) => e.role === 'value' && e.code).map((e) => e.code));
    const own = (e) => e.role === 'condition' && [...fills].some((f) => f === e.code || f.startsWith(`${e.code}.`));
    const raw = all.filter((e) => !own(e));
    const plainCond = (e) => e.role === 'condition' && e.code && e.equals == null && !e.unclear;
    const picks = new Set(raw.filter((e) => plainCond(e) && e.negated && raw.some((o) => plainCond(o) && !o.negated && o.code === e.code)).map((e) => e.code));
    const entries = [...raw.filter((e) => !(plainCond(e) && picks.has(e.code))), ...[...picks].filter((c) => !raw.some((e) => e.role === 'value' && e.code === c)).map((c) => ({ code: c, role: 'value' }))];
    const base = { figma: info.figma, kind: info.kind };
    // Its value map belongs where its own value is written (size="${size}"), never where it picks or switches one on.
    const mapOf = (e) => (info.values && e.role === 'value' && e.mark ? { values: info.values } : {});
    // Its value first, then what it decides; one property used only where the reader cannot follow pairs with none.
    // A reading whose direction is unclear adds nothing beside a clear one of the same attribute.
    const clear = entries.filter((e) => (!e.unclear || !entries.some((o) => !o.unclear && o.code === e.code && o.role === e.role)));
    const sorted = [...clear].sort((x, y) => (x.role === y.role ? 0 : x.role === 'value' ? -1 : 1));
    if (!sorted.length) props.push({ ...base, code: null, role: 'value', ...(opaque.has(v) ? { reason: 'built into a value the reader does not follow' } : {}) });
    for (const e of sorted) { const { mark, ...rest } = e; props.push({ ...base, ...mapOf(e), ...rest }); }
  }
  return { tag, props };
}

// The statement that starts at `from` (a variable's value), brackets and strings balanced, up to its line end or ;.
function readStatement(src, from) {
  let i = from, depth = 0;
  while (i < src.length) {
    const c = src[i];
    if (c === '\'' || c === '"') { i = skipString(src, i); continue; }
    if (c === '`') { i = scanTemplate(src, i + 1).end; continue; }
    if ('([{'.includes(c)) depth++;
    else if (')]}'.includes(c)) depth--;
    else if (!depth && (c === ';' || c === '\n')) { const rest = src.slice(i + 1).trimStart(); if (c === ';' || !/^[.?:&|+\-*/]/.test(rest)) break; }
    i++;
  }
  return src.slice(from, i).trim();
}
// getEnum('x', { s: 's', Large: 'lg' }) → { values: { s: 's', Large: 'lg' } }
function valueMapOf(init) {
  const body = /,\s*\{([\s\S]*)\}\s*\)\s*$/.exec(init)?.[1];
  if (!body) return {};
  const values = {};
  for (const m of body.matchAll(/(?:^|[,{\s])(['"]?)([^'":,{}\s]+)\1\s*:\s*(?:(['"])([^'"]*)\3|(true|false|\d+))/g)) values[m[2]] = m[4] ?? m[5];
  return Object.keys(values).length ? { values } : {};
}
