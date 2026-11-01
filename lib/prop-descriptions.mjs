// prop-descriptions.mjs - the props whose contract says nothing of what they are for, where a description would go, and
// one drafted from what the engine knows for sure, for a person to approve.
//
// A contract's prop says what it is for in the team's words (contract.authored.json propDescriptions), else the code's
// own doc comment on the prop, else Figma's. When none of them says anything, the prop is listed with the place the
// engine reads next run: the comment above the prop in its code file (the file and line), or, for a Figma property no
// code prop is (or one the code fills as a slot), contract.authored.json propDescriptions.
//
// For each prop the code declares, one plain sentence is drafted from facts only: its type and values (an enum's options,
// a boolean's on and off read from its name), its default, the Figma property it pairs with, the Figma properties that
// set it, and how often its uses in the code set it. Nothing is said that those facts do not hold; thin facts make a
// short sentence. The drafts are written as a patch (handback/prop-descriptions.diff) that adds each one as a comment
// in the file's own style: the doc comment above the prop in a Vue props object, a defineProps type or a TypeScript
// interface, or a line in the component's own comment block when that is where its props are described
// (@size {String} …). Nothing is applied here: a person reads them and applies the patch when they ask.
//
//   propDescriptionsOf(ROOT, contracts)         → { components: [...], totals }
//   draftDescription(fact, { component })       → the sentence
//   propCommentPatch(ROOT, components)          → { diff, patched, files }
//   writePropDescriptions(ROOT, outDir, list)   → the patch's path, or null when there is nothing to draft
import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { OUT_DIR } from './names.mjs';

const norm = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
const words = (s) => String(s ?? '').replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[-_/]+/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
const capital = (s) => String(s).charAt(0).toUpperCase() + String(s).slice(1);
const pascal = (s) => String(s ?? '').split(/[^A-Za-z0-9]+/).filter(Boolean).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join('');
const kebab = (s) => String(s).replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
const esc = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const said = (v) => typeof v === 'string' && v.trim() !== '';
const listOf = (xs, max = 6) => {
  const v = xs.map(String);
  const shown = v.length > max ? [...v.slice(0, max), `${v.length - max} more`] : v;
  return shown.length < 2 ? shown.join('') : `${shown.slice(0, -1).join(', ')} or ${shown[shown.length - 1]}`;
};
export const PATCH_FILE = 'prop-descriptions.diff';
export const patchPath = (outDir = OUT_DIR) => `${outDir}/handback/${PATCH_FILE}`;
// What a person pastes into Claude Code to apply them: a request, with the command it runs.
export const applyRequest = (outDir = OUT_DIR) => `Apply the drafted prop descriptions: git apply ${patchPath(outDir)}`;

// ── Which props say nothing ───────────────────────────────────────────────────────────────────────────────────────
// Each prop of a contract with no description: a Figma property and the code prop it is paired with, a code prop no
// Figma property is, or a Figma property with no code prop (or one the code fills as a slot, or a key of an object).
// → [{ prop, figma, code, kind: 'paired' | 'code' | 'figma', type, options, figmaOptions, default, required, setBy }]
export function undescribed(contract) {
  const out = [];
  for (const p of contract?.props ?? []) {
    if (!p?.name || said(p.description)) continue;
    const b = p.bindings?.code && typeof p.bindings.code === 'object' ? p.bindings.code : null;
    const code = b && b.as === 'prop' && typeof b.prop === 'string' && !b.key ? b.prop : null;
    const figmaOptions = Array.isArray(p.bindings?.figma?.options) ? p.bindings.figma.options : Array.isArray(p.options) ? p.options : null;
    out.push({
      prop: code ?? p.name, figma: p.name, code, kind: code ? 'paired' : 'figma',
      type: b?.type ?? (p.bindings?.figma?.kind === 'BOOLEAN' || p.type === 'boolean' ? 'boolean' : null),
      options: code && Array.isArray(b.options) ? b.options : null,
      figmaOptions: figmaOptions && !figmaOptions.every((o) => /^(true|false)$/i.test(String(o))) ? figmaOptions : null,
      ...(code && b.default != null ? { default: b.default } : {}), required: code ? b.required === true : false,
    });
  }
  for (const c of contract?.codeOnly ?? []) {
    if (!c?.name || said(c.description)) continue;
    out.push({ prop: c.name, figma: null, code: c.name, kind: 'code', type: c.type ?? null, options: Array.isArray(c.options) ? c.options : null, figmaOptions: null, ...(c.default != null ? { default: c.default } : {}), required: c.required === true, setBy: Array.isArray(c.setBy) ? c.setBy : [] });
  }
  return out;
}
const countProps = (c) => (c?.props ?? []).filter((p) => p?.name).length + (c?.codeOnly ?? []).filter((p) => p?.name).length;

// ── How its uses set each prop ─────────────────────────────────────────────────────────────────────────────────────
// Read from the files the contract says it is used in (livesIn): each opening tag of the component, and the props each
// one writes, with the values written as plain text. → { total, props: Map(norm prop → { n, values: [[value, count]] }) }
export function propUses(contract, read) {
  const tags = [...new Set([contract?.source?.code?.tag, pascal(contract?.name)].filter((t) => /^[A-Za-z][\w.-]*$/.test(String(t ?? ''))))];
  const names = [...new Set(tags.flatMap((t) => [t, ...(kebab(t).includes('-') ? [kebab(t)] : [])]))];
  const by = new Map();
  let total = 0;
  if (!names.length) return { total, props: by };
  const open = new RegExp(`<(?:${names.map(esc).join('|')})(?=[\\s/>])((?:[^>"'{]|"[^"]*"|'[^']*'|\\{[^}]*\\})*)>`, 'g');
  for (const f of contract?.livesIn?.files ?? []) {
    let text = '';
    try { text = read(f.file); } catch { continue; }
    for (const m of text.matchAll(open)) {
      total++;
      const seen = new Set();
      for (const a of m[1].matchAll(/(?:^|\s)(v-bind:|:|@|v-on:|#|v-slot:)?([A-Za-z_][\w-]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|(\{)))?/g)) {
        if (a[1] === '@' || a[1] === 'v-on:' || a[1] === '#' || a[1] === 'v-slot:' || /^v-/.test(a[2])) continue;
        const k = norm(a[2]);
        if (seen.has(k)) continue;
        seen.add(k);
        const e = by.get(k) ?? { n: 0, values: new Map() };
        e.n++;
        const plain = !a[1] && !a[5] ? a[3] ?? a[4] : undefined;
        if (plain != null && plain.trim() && plain.length <= 30) e.values.set(plain.trim(), (e.values.get(plain.trim()) ?? 0) + 1);
        by.set(k, e);
      }
    }
  }
  for (const [k, e] of by) by.set(k, { n: e.n, values: [...e.values].sort((x, y) => y[1] - x[1] || String(x[0]).localeCompare(String(y[0]))) });
  return { total, props: by };
}

// ── The sentence ───────────────────────────────────────────────────────────────────────────────────────────────────
// A boolean's on and off, as its name says it: showIcon shows its icon, hasBorder has a border, isOpen is open. A name
// that reads as no state (closeOnSelect) is said as what it turns on, nothing more.
function booleanSaid(prop, comp) {
  const m = /^(is|are|has|have|show|display|hide|can|allow|no|with)([A-Z0-9].*)$/.exec(prop);
  const art = (w) => (/s$/.test(w) && !/ss$/.test(w) ? '' : /^[aeiou]/.test(w) ? 'an ' : 'a ');
  if (m) {
    const rest = words(m[2]);
    switch (m[1]) {
      case 'is': case 'are': return `Whether the ${comp} is ${rest}.`;
      case 'has': case 'have': case 'with': return `Whether the ${comp} has ${art(rest)}${rest}.`;
      case 'show': case 'display': return `Whether the ${comp} shows its ${rest}.`;
      case 'hide': return `Whether the ${comp} hides its ${rest}.`;
      case 'can': return `Whether the ${comp} can ${rest}.`;
      case 'allow': return `Whether the ${comp} allows ${rest}.`;
      case 'no': return `Whether the ${comp} has no ${rest}.`;
    }
  }
  const w = words(prop);
  return w.includes(' ') ? `Turns ${w} on or off for the ${comp}.` : `Whether the ${comp} is ${w}.`;
}
const AS = { string: 'as text', number: 'as a number', array: 'as a list', object: 'as an object', date: 'as a date' };
function defaultSaid(v, type) {
  if (v === true || (/boolean/.test(String(type)) && String(v) === 'true')) return 'On by default.';
  if (v === false || (/boolean/.test(String(type)) && String(v) === 'false')) return 'Off by default.';
  if (typeof v === 'object' || v == null) return '';
  const s = String(v).trim();
  if (s === '' || s === "''" || s === '""') return 'Empty by default.';
  if (s.length > 40 || /[\n{}]/.test(s)) return '';
  return /\s/.test(s) ? `Default "${s.replace(/^['"`]|['"`]$/g, '')}".` : `Default ${s.replace(/^['"`]|['"`]$/g, '')}.`;
}
// fact: { prop, figma, code, type, options, figmaOptions, default, required, setBy, uses: { n, total, values } }
export function draftDescription(fact, { component = '' } = {}) {
  const comp = words(component) || 'component';
  const name = fact.code ?? fact.prop;
  const type = String(fact.type ?? '').toLowerCase();
  const pw = words(name);
  // A boolean by its type, or by a default of true or false when no type is written (a plain JSX prop).
  const bool = /^boolean$/.test(type.trim()) || (!type.trim() && typeof fact.default === 'boolean');
  const out = [];
  if (bool) out.push(booleanSaid(name, comp));
  else if (Array.isArray(fact.options) && fact.options.length) out.push(`${capital(pw)} of the ${comp}: ${listOf(fact.options)}.`);
  // onPick: a handler by its name, when nothing says it is anything else.
  else if ((!type || /function|=>/.test(type)) && /^on[A-Z]/.test(name)) out.push(`Handler for ${words(name.slice(2))} on the ${comp}.`);
  else {
    const t = type.trim();
    const as = /function|=>/.test(t) ? 'as a function' : /\[\]$|^array\b/.test(t) ? 'as a list' : AS[t] ?? '';
    out.push(`${capital(pw)} of the ${comp}${as ? `, ${as}` : ''}.`);
  }
  if (!bool && !(fact.options ?? []).length && (fact.figmaOptions ?? []).length) out.push(`Figma draws ${listOf(fact.figmaOptions)}.`);
  if (fact.required) out.push('Required.');
  else if ('default' in fact) { const d = defaultSaid(fact.default, fact.type); if (d) out.push(d); }
  if (fact.figma && norm(fact.figma) !== norm(name)) out.push(`Figma calls it ${fact.figma}.`);
  if ((fact.setBy ?? []).length) out.push(`Set through Figma's ${listOf(fact.setBy)}.`);
  const u = fact.uses;
  if (u && u.total) {
    const vals = bool ? [] : (u.values ?? []).slice(0, 3).map(([v]) => v);
    if (u.n) out.push(`Set in ${u.n} of its ${u.total} uses${vals.length ? ` (${vals.join(', ')})` : ''}.`.replace(/Set in 1 of its 1 uses/, 'Set in its one use'));
    else out.push(u.total === 1 ? 'Left unset in its one use.' : `Left unset in all ${u.total} of its uses.`);
  }
  // A comment can hold it as it is: no comment end, no tag, one line.
  return out.join(' ').replace(/\*\//g, '* /').replace(/[@{}]/g, '').replace(/\s+/g, ' ').trim();
}

// ── Where it goes in the code ──────────────────────────────────────────────────────────────────────────────────────
// The index of the brace that closes the one at `open`, past strings and comments. -1 when it never closes.
function closing(text, open) {
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    const ch = text[i];
    if (ch === '/' && text[i + 1] === '/') { i = text.indexOf('\n', i); if (i < 0) return -1; continue; }
    if (ch === '/' && text[i + 1] === '*') { i = text.indexOf('*/', i + 2); if (i < 0) return -1; i++; continue; }
    if (ch === '"' || ch === "'" || ch === '`') { const q = ch; i++; while (i < text.length && text[i] !== q && !(q !== '`' && text[i] === '\n')) { if (text[i] === '\\') i++; i++; } continue; }
    if (ch === '{') depth++;
    else if (ch === '}' && --depth === 0) return i;
  }
  return -1;
}
// The lines (0-based) that start a key at the top level of a brace block: { size: …, tone: … } written one per line.
function keyLines(text, open, close) {
  const out = [];
  let depth = 0;
  for (let i = open; i <= close; i++) {
    const ch = text[i];
    if (ch === '/' && text[i + 1] === '/') { const e = text.indexOf('\n', i); i = (e < 0 ? close : e) - 1; continue; }
    if (ch === '/' && text[i + 1] === '*') { const e = text.indexOf('*/', i + 2); i = e < 0 ? close : e + 1; continue; }
    if (ch === '"' || ch === "'" || ch === '`') { const q = ch; i++; while (i < close && text[i] !== q && !(q !== '`' && text[i] === '\n')) { if (text[i] === '\\') i++; i++; } continue; }
    if (ch === '{' || ch === '(' || ch === '[' || ch === '<') { if (ch !== '<' || /[\w$]\s*$/.test(text.slice(Math.max(0, i - 40), i))) depth++; continue; }
    if (ch === '}' || ch === ')' || ch === ']' || (ch === '>' && depth > 1 && text[i - 1] !== '=')) { depth--; continue; }
    if (ch === '\n' && depth === 1) {
      const end = text.indexOf('\n', i + 1);
      const line = text.slice(i + 1, end < 0 ? text.length : end);
      const m = /^([ \t]*)(?:readonly\s+)?(['"]?)([A-Za-z_$][\w$-]*)\2\s*\??\s*[:(]/.exec(line);
      if (m) out.push({ name: m[3], indent: m[1], at: i + 1 });
    }
  }
  return out;
}
const lineAt = (text, at) => text.slice(0, at).split('\n').length;
// The blocks that declare a component's props: a Vue props object, defineProps' type or object, a TypeScript interface
// or type of props (one named …Props when the file has any).
function propBlocks(text) {
  const opens = [];
  for (const re of [/\bprops\s*:\s*\{/g, /\bdefineProps\s*(?:<\s*\{|\(\s*\{)/g]) for (const m of text.matchAll(re)) opens.push(m.index + m[0].length - 1);
  const types = [...text.matchAll(/\b(?:interface\s+([A-Za-z_$][\w$]*)(?:\s*<[^>{]*>)?(?:\s+extends\s+[^{]+)?\s*\{|type\s+([A-Za-z_$][\w$]*)(?:\s*<[^>]*>)?\s*=\s*\{)/g)];
  const named = types.filter((m) => /Props\b/.test(m[1] ?? m[2] ?? ''));
  for (const m of named.length ? named : types.filter((m) => m[1])) opens.push(m.index + m[0].length - 1);
  return opens.map((o) => ({ open: o, close: closing(text, o) })).filter((b) => b.close > b.open);
}
// The style the file already writes its prop comments in: one line of /** … */, a /** block of lines */, or // lines.
function commentStyle(text, keys) {
  const lines = text.split('\n'), n = { single: 0, multi: 0, line: 0 };
  for (const k of keys) {
    const prev = (lines[lineAt(text, k.at) - 2] ?? '').trim();
    if (prev.startsWith('//')) n.line++;
    else if (/^\/\*\*.*\*\/$/.test(prev)) n.single++;
    else if (prev.endsWith('*/')) n.multi++;
  }
  return n.multi > n.single && n.multi >= n.line ? 'multi' : n.line > n.single ? 'line' : 'single';
}
// The component's own comment block that already describes some of its props as @name {Type} words, when there is one.
function docBlock(text, propNames) {
  const known = new Set(propNames.map(norm));
  let best = null;
  for (const m of text.matchAll(/\/\*\*[\s\S]*?\*\//g)) {
    const tags = [...m[0].matchAll(/@([A-Za-z_$][\w$]*)\s*\{[A-Za-z|,\s]+\}[^\n]*/g)].filter((t) => known.has(norm(t[1])));
    if (tags.length && (!best || tags.length > best.n)) {
      const last = tags[tags.length - 1];
      const at = m.index + last.index;
      const start = text.lastIndexOf('\n', at) + 1;
      const end = text.indexOf('\n', at);
      // The block closes on that same line: the new line goes before it, so it stays inside the comment.
      const closes = text.slice(at, end < 0 ? text.length : end).includes('*/');
      best = { n: tags.length, line: lineAt(text, at) + (closes ? 0 : 1), prefix: text.slice(start, at) };
    }
  }
  return best;
}
const TYPE_WORD = { string: 'String', boolean: 'Boolean', number: 'Number', array: 'Array', object: 'Object', function: 'Function', date: 'Date' };
const typeWord = (t, options) => {
  const ws = String(t ?? '').toLowerCase().split(/\s*\|\s*/).map((x) => TYPE_WORD[x.replace(/\[\]$/, '') === x ? x : 'array']).filter(Boolean);
  if (ws.length) return [...new Set(ws)].join(', ');
  return Array.isArray(options) && options.length ? 'String' : null;
};
// Where each prop's comment goes in its file, and the lines that write it there.
// known: every prop the component has, so its own comment block is found by the ones it already describes.
// → Map(norm prop → { line, how: 'above' | 'block', lines: [text] }) for the props found; the others are by hand.
export function placesIn(file, text, props, { known = [] } = {}) {
  const out = new Map();
  // A Vue file's props are in its scripts: its template is left as blank lines, so line numbers stay its own.
  const code = /\.vue$/i.test(file) ? text.replace(/<template\b[\s\S]*<\/template>/i, (t) => t.replace(/[^\n]/g, ' ')) : text;
  const eol = /\r\n/.test(text) ? '\r' : '';
  const keys = propBlocks(code).flatMap((b) => keyLines(code, b.open, b.close));
  const lines = text.split('\n');
  const block = docBlock(code, keys.map((k) => k.name).concat(known, props.map((p) => p.prop)));
  const style = commentStyle(code, keys);
  for (const p of props) {
    const k = keys.find((x) => norm(x.name) === norm(p.prop));
    const tw = typeWord(p.type, p.options);
    if (block && tw) { out.set(norm(p.prop), { line: block.line, how: 'block', lines: [`${block.prefix}@${p.prop} {${tw}} ${p.draft}${eol}`] }); continue; }
    if (!k) continue;
    const line = lineAt(code, k.at);
    // A comment already above it says nothing the engine reads (a lint line): a new one there would come between them.
    const prev = (lines[line - 2] ?? '').trim();
    if (prev.startsWith('//') || prev.endsWith('*/')) continue;
    const i = k.indent;
    out.set(norm(p.prop), { line, how: 'above', lines: style === 'line' ? [`${i}// ${p.draft}${eol}`] : style === 'multi' ? [`${i}/**${eol}`, `${i} * ${p.draft}${eol}`, `${i} */${eol}`] : [`${i}/** ${p.draft} */${eol}`] });
  }
  return out;
}

// ── All of it ──────────────────────────────────────────────────────────────────────────────────────────────────────
// contracts: the built contracts ([contract] or [{ contract }]). Each component with its count of props, how many say
// what they are for, and each one that does not: where its description goes and, for a code prop, the drafted sentence.
// → { components: [{ name, file, total, described, missing: [{ prop, figma, code, kind, at, where, draft?, inPatch }] }],
//     totals: { total, described, missing, drafted, patched } }
export function propDescriptionsOf(ROOT, contracts = [], { read = (f) => readFileSync(resolve(ROOT, f), 'utf8'), authored = 'contract.authored.json' } = {}) {
  const components = [];
  const totals = { total: 0, described: 0, missing: 0, drafted: 0, patched: 0 };
  for (const item of contracts) {
    const c = item?.contract ?? item;
    if (!c?.name) continue;
    const total = countProps(c);
    if (!total) continue;
    const missing = undescribed(c);
    totals.total += total; totals.described += total - missing.length; totals.missing += missing.length;
    const file = c.source?.code?.file ?? null;
    let text = null;
    if (file) { try { text = read(file); } catch { /* unreadable: by hand */ } }
    const uses = file ? propUses(c, read) : { total: 0, props: new Map() };
    const drafted = missing.map((m) => (m.code && text != null ? { ...m, draft: draftDescription({ ...m, uses: uses.total ? { total: uses.total, ...(uses.props.get(norm(m.code)) ?? { n: 0, values: [] }) } : null }, { component: c.name }) } : m));
    const known = [...(c.props ?? []).map((p) => p?.bindings?.code?.prop).filter((x) => typeof x === 'string'), ...(c.codeOnly ?? []).map((p) => p?.name).filter(Boolean)];
    const places = text != null ? placesIn(file, text, drafted.filter((m) => m.draft), { known }) : new Map();
    const list = drafted.map((m) => {
      const at = m.code && places.get(norm(m.code));
      const where = !m.code ? `${authored} (propDescriptions)` : at ? `${file}:${at.line}` : file ?? `${authored} (propDescriptions)`;
      if (m.draft) totals.drafted++;
      if (at) totals.patched++;
      return { prop: m.prop, figma: m.figma, code: m.code, kind: m.kind, where, ...(at ? { at: `${file}:${at.line}`, how: at.how, lines: at.lines, line: at.line } : {}), ...(m.draft ? { draft: m.draft } : {}), inPatch: !!at };
    });
    components.push({ name: c.name, file, text, total, described: total - missing.length, missing: list });
  }
  return { components, totals };
}

// One unified diff that adds every drafted comment found a place for, file by file; git apply takes it as it is.
export function propCommentPatch(components) {
  let diff = '', patched = 0;
  const files = [];
  for (const c of components) {
    const adds = c.missing.filter((m) => m.inPatch);
    if (!adds.length || c.text == null) continue;
    const noEol = !c.text.endsWith('\n');
    const lines = c.text.split('\n');
    if (!noEol) lines.pop();
    const at = new Map();
    for (const m of adds) at.set(m.line, [...(at.get(m.line) ?? []), ...m.lines]);
    const points = [...at.keys()].sort((a, b) => a - b);
    const groups = [];
    for (const p of points) { const g = groups[groups.length - 1]; if (g && p - g[g.length - 1] <= 3) g.push(p); else groups.push([p]); }
    let body = '', shift = 0;
    for (const g of groups) {
      const from = Math.max(1, g[0] - 1), to = Math.min(lines.length, g[g.length - 1]);
      const rows = [];
      let added = 0;
      for (let i = from; i <= to; i++) {
        for (const l of at.get(i) ?? []) { rows.push(`+${l}`); added++; }
        rows.push(` ${lines[i - 1]}`);
        if (i === lines.length && noEol) rows.push('\\ No newline at end of file');
      }
      const len = to - from + 1;
      body += `@@ -${from},${len} +${from + shift},${len + added} @@\n${rows.join('\n')}\n`;
      shift += added;
    }
    const rel = String(c.file).split(/[\\/]+/).join('/');
    diff += `--- a/${rel}\n+++ b/${rel}\n${body}`;
    patched += adds.length;
    files.push(rel);
  }
  return { diff, patched, files };
}

// Writes the patch beside the audit's other hand-back files (or removes it when there is nothing to draft).
export function writePropDescriptions(ROOT, outDir, components) {
  const dir = join(ROOT, outDir, 'handback');
  const p = propCommentPatch(components);
  if (!p.diff) { rmSync(join(dir, PATCH_FILE), { force: true }); return { path: null, ...p }; }
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, PATCH_FILE), p.diff);
  return { path: patchPath(outDir), ...p };
}

// The lines a report prints: each component with a prop that says nothing, its props with where each goes and the
// drafted sentence. → lines
export function propDescriptionLines(result, { top = Infinity } = {}) {
  const out = [];
  for (const c of result.components.filter((x) => x.missing.length).slice(0, top)) {
    out.push(`  ${c.name}: ${c.missing.length} of ${c.total} prop${c.total === 1 ? '' : 's'} with no description`);
    for (const m of c.missing) {
      out.push(`    ${m.prop}${m.figma && m.code && m.figma !== m.code ? ` (Figma ${m.figma})` : ''}  ${m.where}${m.code && !m.inPatch ? '  (by hand)' : ''}`);
      if (m.draft) out.push(`      drafted: ${m.draft}`);
    }
  }
  return out;
}
