// code-connect-map.mjs - what a project's own Figma Code Connect files say about each component: which Figma property
// each code prop is, and how its values are written, read from the committed *.figma.* files (never Figma's API).
//
//   codeConnectMaps(ROOT, { include })   → [{ file, nodeId, slug, id, tag, props: [{ figma, code, kind, role?, negated?, equals?, values? }] }]
//   codeConnectFor(maps, name, nodeId)   → the map that connects that Figma component, or null
//   parseConnectFile(text, file)         → one file's maps
//
// Two forms are read. The classic one, figma.connect(Component, 'url', { props: { label: figma.string('Label') } }),
// names each code prop beside the Figma property it reads. The template one (figma.selectedInstance.getEnum('size',
// { s: 's' }) into a variable, the variable written into an attribute of figma.html`<button-primary buttonSize="${…}">`)
// names it by the attribute the variable fills. Advisory: the code's own API stays the truth; this pairs names.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { readTemplateForm } from './code-connect-template.mjs';

const SKIP = new Set(['node_modules', '.git', 'dist', 'build', 'coverage', '.design-system-engine-out']);
const nodeIdOf = (raw) => { const m = /node-id=([\d]+)[-:%3A]+([\d]+)/i.exec(String(raw ?? '')); return m ? `${m[1]}:${m[2]}` : null; };
const slugOf = (url) => { const m = /figma\.com\/(?:file|design)\/[^/]+\/([^?/#]+)/i.exec(String(url ?? '')); return m ? decodeURIComponent(m[1]) : null; };

// The values of an enum's map ({ s: 's', Large: 'lg' }): Figma's option → the code's value.
function valuesOf(body) {
  const out = {};
  for (const m of String(body ?? '').matchAll(/(?:^|[,{\s])(['"]?)([^'":,{}\s]+)\1\s*:\s*(['"])([^'"]*)\3/g)) out[m[2]] = m[4];
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
    for (const p of String(propsBody).matchAll(/([A-Za-z_$][\w$]*)\s*:\s*figma\.(enum|boolean|string|instance|children|nestedProps|textContent)\(\s*(['"`])([^'"`]+)\3/g)) {
      const values = p[2] === 'enum' ? valuesOf(objectAt(propsBody, p.index + p[0].length)) : undefined;
      props.push({ figma: p[4], code: p[1], kind: p[2], ...(values ? { values } : {}) });
    }
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
