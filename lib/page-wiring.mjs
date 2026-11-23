// What a page made elsewhere is wired to, kept through its rebuild from the system (page-rebuild.mjs).
//
// A page works because of more than how it looks: each link goes somewhere, each field sends a name, a handler runs
// on a click, a test finds a part by its test id, and the page's scripts look parts up by id, class or attribute.
// The rebuild keeps each of these on the part that does it ("wiring" on that node of the composition) and writes the
// page's whole list beside it, so a part taken out later, or a script left looking for a part that is no longer
// there, is said and fails the check. A loss the person meant is written down with its reason and passes. A heading
// or a figure that went missing is said, never failed: it changes what the page says, not what it does.

const TEST_ID = ['data-testid', 'data-test-id', 'data-test', 'data-cy', 'data-qa'];
const FIELD = new Set(['input', 'select', 'textarea', 'button', 'output', 'fieldset']);
const short = (s, n = 60) => { const t = String(s).replace(/\s+/g, ' ').trim(); return t.length > n ? `${t.slice(0, n - 1)}…` : t; };

// The scripts the page carries in itself, and the ones it loads from elsewhere (only named: they are not read).
export function pageScripts(html) {
  const inline = [], loaded = [];
  for (const m of String(html).matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)) {
    const attrs = m[1] ?? '';
    const type = /\btype\s*=\s*["']?([^"'\s>]+)/i.exec(attrs)?.[1]?.toLowerCase() ?? '';
    // Data in a script tag (JSON, a template) is not code: it looks nothing up.
    if (type && !/^(module|text\/javascript|application\/javascript|text\/ecmascript)$/.test(type)) continue;
    const src = /\bsrc\s*=\s*["']?([^"'\s>]+)/i.exec(attrs)?.[1];
    if (src) loaded.push(src); else if (m[2].trim()) inline.push(m[2]);
  }
  return { inline, loaded };
}

// Each element a script looks up, as the selector it is looked up by. Only selectors written out in the code are read
// (a string built at run time is not guessed at).
export function scriptLookups(code) {
  const out = new Set();
  const q = '([\'"`])((?:(?!\\1)[^\\\\]|\\\\.){1,200})\\1';
  const add = (re, as) => { for (const m of String(code).matchAll(re)) if (!/\$\{/.test(m[2])) out.add(as(m[2].trim())); };
  add(new RegExp(`getElementById\\(\\s*${q}`, 'g'), (v) => `#${v}`);
  add(new RegExp(`getElementsByClassName\\(\\s*${q}`, 'g'), (v) => v.split(/\s+/).map((c) => `.${c}`).join(''));
  add(new RegExp(`getElementsByName\\(\\s*${q}`, 'g'), (v) => `[name="${v}"]`);
  add(new RegExp(`(?:querySelector|querySelectorAll|closest|matches)\\(\\s*${q}`, 'g'), (v) => v);
  // A selector list is one lookup for each of its selectors.
  return [...out].flatMap((s) => s.split(',').map((x) => x.trim()).filter(Boolean));
}

// The last compound of a selector ("form .row > input[name=email]" → input[name=email]), as the parts it asks for.
// → { tag, ids, classes, attrs: [[name, value|null]] } or null when it asks for something this reader does not read.
function compound(selector) {
  const last = String(selector).trim().split(/\s*[\s>+~]\s*(?![^[]*\])/).filter(Boolean).pop() ?? '';
  const s = last.replace(/::?[a-z-]+(\([^)]*\))?/gi, '');
  if (!s) return null;
  const out = { tag: null, ids: [], classes: [], attrs: [] };
  const re = /^([a-z][\w-]*|\*)|#([\w-]+)|\.([\w-]+)|\[\s*([\w-]+)\s*(?:[~|^$*]?=\s*(?:"([^"]*)"|'([^']*)'|([^\]\s]+)))?\s*\]/gi;
  let m, read = 0;
  while ((m = re.exec(s)) && m.index === read) {
    read = re.lastIndex;
    if (m[1]) out.tag = m[1] === '*' ? null : m[1].toLowerCase();
    else if (m[2]) out.ids.push(m[2]);
    else if (m[3]) out.classes.push(m[3]);
    else out.attrs.push([m[4].toLowerCase(), m[5] ?? m[6] ?? m[7] ?? null]);
  }
  return read === s.length ? out : null;
}
export function matches(n, selector) {
  const c = compound(selector);
  if (!c || n.tag === '#text') return false;
  const cls = String(n.attrs?.class ?? '').split(/\s+/);
  return (!c.tag || c.tag === n.tag) && c.ids.every((i) => n.attrs?.id === i) && c.classes.every((k) => cls.includes(k))
    && c.attrs.every(([a, v]) => n.attrs?.[a] != null && (v == null || n.attrs[a] === v));
}

// What one element is wired to, as the composition keeps it, or null when it is wired to nothing.
// lookups: the selectors the page's scripts look parts up by.
export function wiresOf(n, lookups = []) {
  if (!n || n.tag === '#text') return null;
  const a = n.attrs ?? {}, w = {};
  if (n.tag === 'a' && a.href != null) w.href = a.href;
  if (n.tag === 'form') {
    if (a.action != null) w.action = a.action;
    if (a.method) w.method = a.method.toLowerCase();
    // A hidden field has no part of its own on the rebuilt page: the form that sends it keeps its name.
    const hidden = [];
    const walk = (k) => { for (const c of k.children ?? []) { if (c.tag === 'input' && String(c.attrs?.type ?? '').toLowerCase() === 'hidden' && c.attrs?.name) hidden.push(c.attrs.name); else if (c.tag !== 'form') walk(c); } };
    walk(n);
    if (hidden.length) w.sends = hidden;
  }
  if (FIELD.has(n.tag) && a.name) w.name = a.name;
  if (a.formaction != null) w.action = a.formaction;
  const on = Object.fromEntries(Object.entries(a).filter(([k]) => /^on[a-z]+$/.test(k)).map(([k, v]) => [k.slice(2), short(v, 120)]));
  if (Object.keys(on).length) w.on = on;
  const tid = TEST_ID.find((k) => a[k] != null);
  if (tid) w.testId = a[tid];
  const seen = lookups.filter((s) => matches(n, s));
  if (seen.length) w.lookedUpAs = seen;
  return Object.keys(w).length ? w : null;
}

// What an image or figure stands for, the same words on the page and on the rebuilt part: its alt text, else its
// source, else its label, else the element itself.
export function figureOf(n) {
  if (!n || !['img', 'figure', 'picture', 'video'].includes(n.tag)) return null;
  const img = n.tag === 'img' ? n : findNode(n, (x) => x.tag === 'img');
  return img?.attrs?.alt || img?.attrs?.src || n.attrs?.['aria-label'] || element(n);
}

// Each wire as one line of the page's list: { kind, value, element }.
const element = (n) => `<${n.tag}${n.attrs?.id ? ` id="${n.attrs.id}"` : ''}${n.attrs?.class ? ` class="${String(n.attrs.class).split(/\s+/).slice(0, 2).join(' ')}"` : ''}>`;
export function wireEntries(w, el = '') {
  if (!w) return [];
  const out = [];
  if (w.href != null) out.push({ kind: 'link', value: w.href });
  if (w.action != null) out.push({ kind: 'form', value: `${w.method ? `${w.method.toUpperCase()} ` : ''}${w.action}` });
  if (w.name) out.push({ kind: 'field', value: w.name });
  for (const f of w.sends ?? []) out.push({ kind: 'field', value: f });
  for (const [ev, code] of Object.entries(w.on ?? {})) out.push({ kind: 'handler', value: `on${ev}="${code}"` });
  if (w.testId != null) out.push({ kind: 'test id', value: w.testId });
  for (const s of w.lookedUpAs ?? []) out.push({ kind: 'lookup', value: s });
  return out.map((e) => ({ ...e, element: el }));
}
const key = (e) => `${e.kind}\u0000${e.value}`;

// The page's whole list, read from its markup (tree: readHtml) and its scripts: what it is wired to, what its scripts
// look up, and what it says that is not wiring (its headings and figures). Scripts it loads from elsewhere are named
// in unread, since what they look up was not read.
export function wiringOf(tree, html) {
  const { inline, loaded } = pageScripts(html);
  const lookups = [...new Set(inline.flatMap(scriptLookups))];
  const wires = [], said = [], found = new Set();
  const walk = (n) => {
    if (!n || n.tag === '#text') return;
    for (const s of lookups) if (matches(n, s)) found.add(s);
    for (const e of wireEntries(wiresOf(n, lookups), element(n))) if (!wires.some((x) => key(x) === key(e))) wires.push(e);
    if (/^h[1-6]$/.test(n.tag)) { const t = textOf(n); if (t) said.push({ kind: 'heading', value: t }); }
    if (n.tag === 'img' || n.tag === 'figure' || n.tag === 'picture' || n.tag === 'video') {
      const v = figureOf(n);
      if (n.tag !== 'img' || !said.some((x) => x.kind === 'figure' && x.value === v)) said.push({ kind: 'figure', value: v });
      if (n.tag === 'figure' || n.tag === 'picture') return;
    }
    for (const k of n.children ?? []) walk(k);
  };
  walk(tree);
  // A selector no part of the page answers was not the rebuild's to keep: the script makes that part itself, or
  // looks in vain already. It is said, never failed.
  const unmatched = lookups.filter((s) => !found.has(s));
  return { wires, said, lookups, unmatched, unread: loaded };
}

function findNode(node, test) {
  if (test(node)) return node;
  for (const k of node.children ?? []) { const f = findNode(k, test); if (f) return f; }
  return null;
}
const textOf = (n) => (n.tag === '#text' ? n.text : (n.children ?? []).map(textOf).join(' ')).replace(/\s+/g, ' ').trim();

// What a composition still carries: each part's "wiring", its headings' words, and what each image stands for.
// Read from the composition as written, nested or flat (A2UI components).
export function carriedBy(ui) {
  const wires = new Set(), headings = new Set(), figures = new Set();
  const nodes = Array.isArray(ui?.components) ? ui.components : [];
  const visit = (n) => {
    if (!n || typeof n !== 'object') return;
    for (const e of wireEntries(n.wiring)) wires.add(key(e));
    const p = n.props ?? {};
    if (/^h[1-6]$/.test(String(p.as ?? ''))) headings.add(norm(p.text));
    if (n.wiring?.figure) figures.add(n.wiring.figure);
    if (!Array.isArray(ui?.components)) for (const k of Array.isArray(n.children) ? n.children : []) visit(k);
  };
  if (nodes.length) nodes.forEach(visit); else visit(ui);
  return { wires, headings, figures };
}
const norm = (s) => String(s ?? '').replace(/\s+/g, ' ').trim().toLowerCase();

// The losses since the rebuild. wiring: the list the rebuild wrote ({ wires, said }); dropped: the person's own
// [{ kind?, value, why }], each a loss meant and its reason. → findings, as the prototype check gives them.
export function wiringFindings(ui, wiring, dropped = []) {
  if (!wiring || typeof wiring !== 'object') return [];
  const out = [];
  const have = carriedBy(ui);
  const meant = (e) => (Array.isArray(dropped) ? dropped : []).find((d) => d && String(d.value) === String(e.value) && (!d.kind || d.kind === e.kind));
  for (const d of Array.isArray(dropped) ? dropped : []) {
    if (d && d.value != null && !String(d.why ?? '').trim()) out.push({ rule: null, source: 'the page it was rebuilt from', level: 'error', id: null, kind: 'wiring', message: `wiringDropped names ${JSON.stringify(String(d.value))} with no reason: say why it goes ("why"), or put it back` });
  }
  for (const e of Array.isArray(wiring.wires) ? wiring.wires : []) {
    if (have.wires.has(key(e))) continue;
    const m = meant(e);
    if (m && String(m.why ?? '').trim()) continue;
    if (m) continue;   // said above: a reason is owed
    const what = e.kind === 'lookup'
      ? `the page's scripts look up ${JSON.stringify(e.value)} (${e.element}), and no part of the rebuilt page is that part any more`
      : `the page's ${e.kind} ${JSON.stringify(e.value)} (${e.element}) is on no part of the rebuilt page any more`;
    out.push({ rule: null, source: 'the page it was rebuilt from', level: 'error', id: null, kind: 'wiring', need: `${e.kind} ${e.value}`, message: `${what}: put it back on the part that does it ("wiring"), or write it in "wiringDropped" with why it goes` });
  }
  for (const s of Array.isArray(wiring.said) ? wiring.said : []) {
    const kept = s.kind === 'heading' ? have.headings.has(norm(s.value)) : have.figures.has(s.value);
    if (kept || meant(s)) continue;
    out.push({ rule: null, source: 'the page it was rebuilt from', level: 'warning', id: null, kind: 'wiring', message: `the page's ${s.kind} ${JSON.stringify(short(s.value))} is not on the rebuilt page: it says less than the page did, if that was not meant` });
  }
  return out;
}

// The lines the rebuild prints about what it kept.
export function wiringLines(wiring) {
  if (!wiring) return [];
  const by = {};
  for (const e of wiring.wires ?? []) by[e.kind] = (by[e.kind] ?? 0) + 1;
  const names = { link: ['link', 'links'], form: ['form', 'forms'], field: ['field name', 'field names'], handler: ['handler', 'handlers'], 'test id': ['test id', 'test ids'], lookup: ['element its scripts look up', 'elements its scripts look up'] };
  const parts = Object.entries(by).map(([k, n]) => `${n} ${names[k]?.[n === 1 ? 0 : 1] ?? k}`);
  const lines = [`   Wiring kept: ${parts.join(' · ') || 'none to keep'}, each on the part that does it. A part taken out later fails the check, unless "wiringDropped" says why.`];
  if (wiring.unmatched?.length) lines.push(`   Looked up by its scripts, and on no part of the page already: ${wiring.unmatched.slice(0, 6).join(' · ')}${wiring.unmatched.length > 6 ? ` and ${wiring.unmatched.length - 6} more` : ''}`);
  if (wiring.unread?.length) lines.push(`   Not read: the scripts it loads (${wiring.unread.slice(0, 3).join(' · ')}${wiring.unread.length > 3 ? '…' : ''}), so what they look up is not kept`);
  return lines;
}
