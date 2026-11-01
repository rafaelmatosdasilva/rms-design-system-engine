// code-connect-map.mjs - what a project's own Figma Code Connect files say about each component: which Figma property
// each code prop is, and how its values are written, read from the committed *.figma.* files (never Figma's API).
//
//   codeConnectMaps(ROOT, { include })   → [{ file, nodeId, slug, id, tag, props: [{ figma, code, kind, role, negated?, equals?, values?, slot? }] }]
//   codeConnectFor(maps, name, nodeId)   → the map that connects that Figma component, or null
//   parseConnectFile(text, file)         → one file's maps
//
// Two forms are read. The classic one, figma.connect(Component, 'url', { props: { label: figma.string('Label') } }),
// names each code prop beside the Figma property it reads; a Figma property whose values map to another figma call
// (label: figma.boolean('Show label', { true: figma.string('Label'), false: undefined })) decides whether that prop is
// written, and the call inside fills it. The template one (figma.selectedInstance.getEnum('size',
// { s: 's' }) into a variable, the variable written into an attribute of figma.html`<button-primary buttonSize="${…}">`)
// names it by the attribute the variable fills. Advisory: the code's own API stays the truth; this pairs names.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { readTemplateForm } from './code-connect-template.mjs';

const SKIP = new Set(['node_modules', '.git', 'dist', 'build', 'coverage', '.design-system-engine-out']);
const nodeIdOf = (raw) => { const m = /node-id=(\d+)(?:-|:|%3A)(\d+)/i.exec(String(raw ?? '')); return m ? `${m[1]}:${m[2]}` : null; };
const slugOf = (url) => { const m = /figma\.com\/(?:file|design)\/[^/]+\/([^?/#]+)/i.exec(String(url ?? '')); return m ? decodeURIComponent(m[1]) : null; };

// The values of an enum's map ({ s: 's', Large: 'lg', 'Extra large': 'xl', True: true }): Figma's option → the code's
// value, a true, false or number written as its text.
function valuesOf(body) {
  const out = {};
  for (const m of String(body ?? '').matchAll(/(?:^|[,{\s])(?:'([^']+)'|"([^"]+)"|([^'":,{}\s]+))\s*:\s*(?:(['"])([^'"]*)\4|(true|false|-?\d+(?:\.\d+)?)(?=\s*[,}]|\s*$))/g)) out[m[1] ?? m[2] ?? m[3]] = m[5] ?? m[6];
  return Object.keys(out).length ? out : undefined;
}
// The object literal right after a position, its braces balanced.
function objectAt(text, from) {
  const i = text.indexOf('{', from);
  if (i < 0) return '';
  let d = 0;
  for (let j = i; j < text.length; j++) { if (text[j] === '{') d++; else if (text[j] === '}' && !--d) return text.slice(i + 1, j); }
  return '';
}

// From a quote at i, just past its closing one: a template literal's ${…} skipped whole, strings inside it too.
function skipQuoted(text, i) {
  const q = text[i++];
  while (i < text.length && text[i] !== q) {
    if (text[i] === '\\') { i += 2; continue; }
    if (q === '`' && text[i] === '$' && text[i + 1] === '{') {
      let d = 1; i += 2;
      while (i < text.length && d) { const c = text[i]; if (c === '\'' || c === '"' || c === '`') { i = skipQuoted(text, i); continue; } if (c === '{') d++; else if (c === '}') d--; i++; }
      continue;
    }
    i++;
  }
  return i + 1;
}
// The top-level entries of an object literal's body: [{ key, value (its source) }], strings and brackets balanced.
function entriesOf(body) {
  const parts = []; let depth = 0, start = 0;
  for (let i = 0; i < body.length; i++) {
    const c = body[i];
    if (c === '\'' || c === '"' || c === '`') { i = skipQuoted(body, i) - 1; continue; }
    if ('([{'.includes(c)) depth++;
    else if (')]}'.includes(c)) depth--;
    else if (c === ',' && !depth) { parts.push(body.slice(start, i)); start = i + 1; }
  }
  parts.push(body.slice(start));
  const out = [];
  for (const p of parts) {
    const m = /^\s*(?:(['"])(.*?)\1|([A-Za-z_$][\w$]*|-?\d+(?:\.\d+)?))\s*:\s*([\s\S]*?)\s*$/.exec(p.replace(/\/\/[^\n]*$/gm, ''));
    if (m) out.push({ key: m[2] ?? m[3], value: m[4] });
  }
  return out;
}
// One figma.kind('Figma name', { … }) call: { kind, figma, map (the entries of its object, when it has one) } or null.
function callOf(value) {
  const m = /^figma\.(enum|boolean|string|instance|slot|children|nestedProps|textContent)\(\s*(['"`])([^'"`]+)\2\s*(,?)/.exec(String(value).trim());
  if (!m) return null;
  const rest = String(value).trim().slice(m[0].length);
  return { kind: m[1], figma: m[3], map: m[4] && /^\s*\{/.test(rest) ? entriesOf(objectAt(rest, 0)) : null, body: m[4] && /^\s*\{/.test(rest) ? objectAt(rest, 0) : '' };
}
// What one classic prop says: its value (a figma call), each call inside another's values filling it, and the outer
// call deciding whether it is written: a boolean on true (on false: negated), an enum on the option it maps it under.
// A call that maps both ways to another call picks which one fills it: a condition whose direction is not one.
function classicReadings(code, value, conds = []) {
  const call = callOf(value);
  if (!call) return [];
  const inner = call.kind === 'nestedProps' ? [] : (call.map ?? []).filter((e) => callOf(e.value));
  if (!inner.length) {
    const values = call.kind === 'enum' ? valuesOf(call.body) : undefined;
    const flips = call.kind === 'boolean' && call.map && call.map.length && call.map.every((e) => (e.key === 'true' && e.value === 'false') || (e.key === 'false' && e.value === 'true'));
    return [{ figma: call.figma, code, kind: call.kind, role: 'value', ...(flips ? { negated: true } : {}), ...(values ? { values } : {}) }, ...conds];
  }
  const out = [];
  for (const e of inner) {
    const both = call.kind === 'boolean' && inner.length > 1;
    const cond = { figma: call.figma, code, kind: call.kind, role: 'condition', ...(both ? { unclear: true } : call.kind === 'boolean' ? (e.key === 'false' ? { negated: true } : {}) : { equals: e.key }) };
    out.push(...classicReadings(code, e.value, [...conds, cond]));
  }
  const seen = new Set();
  return out.filter((r) => { const k = JSON.stringify(r); if (seen.has(k)) return false; seen.add(k); return true; });
}

export function parseConnectFile(text = '', file = '') {
  const src = String(text);
  const out = [];
  // The template form: one component a file, named by its header comments.
  if (/figma\.selectedInstance|figma\.currentLayer/.test(src) || (/\/\/\s*url\s*=/.test(src) && /figma\.(?:html|code|tsx|vue)\s*`/.test(src) && !/figma\.connect\(/.test(src))) {
    const url = /\/\/\s*url\s*=\s*(\S+)/.exec(src)?.[1] ?? null;
    const id = /\/\/\s*component\s*=\s*(\S+)/.exec(src)?.[1] ?? null;
    // Read as the code it is (code-connect-template.mjs): each property by the attribute it fills, and by those it
    // decides are written at all.
    const { tag, props } = readTemplateForm(src);
    out.push({ file, nodeId: nodeIdOf(url), slug: slugOf(url), id, tag, props });
    return out;
  }
  // The classic form: figma.connect(Component, 'url', { props: { code: figma.kind('Figma', …) } }).
  for (const m of src.matchAll(/figma\.connect\(\s*([A-Za-z_$][\w$.]*)\s*,\s*(['"`])([^'"`]*)\2/g)) {
    const body = objectAt(src, m.index + m[0].length);
    const propsBody = objectAt(body, (/\bprops\s*:/.exec(body)?.index ?? -1) + 1);
    const props = [];
    for (const { key, value } of entriesOf(propsBody)) if (/^[A-Za-z_$][\w$]*$/.test(key)) props.push(...classicReadings(key, value));
    out.push({ file, nodeId: nodeIdOf(m[3]), slug: slugOf(m[3]), id: null, tag: m[1].split('.').pop(), props });
  }
  return out;
}

// Every Code Connect file the project has (figma.config.json codeConnect.include, else any *.figma.* file).
export function codeConnectMaps(ROOT, { include = null } = {}) {
  const files = [];
  const walk = (d) => {
    let names; try { names = readdirSync(d); } catch { return; }
    for (const n of names) {
      if (SKIP.has(n) || n.startsWith('.')) continue;
      const p = join(d, n); let st; try { st = statSync(p); } catch { continue; }
      if (st.isDirectory()) walk(p);
      else if (/\.figma\.(m?[jt]sx?|vue)$/i.test(n)) files.push(p);
    }
  };
  walk(ROOT);
  const want = (include ?? []).map((g) => new RegExp('^' + String(g).replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*\*\//g, '\u0000').replace(/\*/g, '[^/]*').replace(/\u0000/g, '(?:.*/)?') + '$'));
  const out = [];
  for (const f of files) {
    const rel = relative(ROOT, f).split(/[\\/]+/).join('/');
    if (want.length && !want.some((re) => re.test(rel))) continue;
    let text; try { text = readFileSync(f, 'utf8'); } catch { continue; }
    out.push(...parseConnectFile(text, rel));
  }
  return out;
}

// The map that connects a Figma component: by its node id, else by the name its URL carries.
export function codeConnectFor(maps = [], name, nodeId = null) {
  const id = nodeId ? String(nodeId).replace(/-/g, ':') : null;
  return (id && maps.find((m) => m.nodeId === id)) || maps.find((m) => m.slug && m.slug === name) || null;
}
