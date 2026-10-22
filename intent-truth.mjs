// intent-truth.mjs - whether what an intent-layer page says is true of the system, checked on every run.
//
// The usage report (intent-layer.mjs → useReport) says whether a page reaches the agents; this says whether what it
// tells them holds. Four checks, all mechanical, against what the engine read from Figma, the code and its own checks:
//   name:  every name it writes as code (`tileOne`, `dense`, `--tile-color`, `icons/check`, a file) is one the
//          system has: a component, a prop, a token, a Figma variable, an icon or a file, or a word of its code.
//   claim: what it says of a component agrees with it: a prop it sets is one the component has, with a value the prop
//          takes; the code file it names is the component's; a status it gives is the component's; what it says the
//          component does for accessibility, the accessibility check did not find broken.
//   stale: the component changed (its props, in the code or Figma, or its code file) after the page was last edited.
//   twin:  it says what another component's page says, so it does not help an agent choose between the two.
// A finding: { kind, line (the sentence), says, truth, source, fix }. Nothing here is a judgement of the writing: a
// page with no finding can still be unclear, but none of what it states is contradicted by the system.

import { readFileSync, existsSync, readdirSync, statSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, join, relative, dirname } from 'node:path';
import { execFileSync } from 'node:child_process';
import { codeSnapshotPath, OUT_DIR, ENGINE_DIRS } from './names.mjs';
import { resolveStatus } from './decision-status.mjs';
import { matchComponents, systemNames, codeFilesOf } from './intent-layer.mjs';

export const KINDS = { name: 'Not in the system', claim: 'Disagrees with the system', stale: 'Out of date', twin: 'Same as another page' };
// What the engine keeps of each component's props between runs, to tell when one changed.
export const CHANGES_FILE = `${OUT_DIR}/component-changes.json`;

const norm = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
const readJson = (p) => { try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return null; } };
const day = (iso) => { const d = new Date(iso); return isNaN(d) ? String(iso) : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }); };
const list = (a, n = 6) => a.slice(0, n).map((x) => `\`${x}\``).join(', ') + (a.length > n ? `, … (${a.length})` : '');

// ── What the system has ─────────────────────────────────────────────────────────────────────────────────────────────
// From plain parts (the tests, another reader); systemFacts below reads them from a project.
//   components: { name: { file?, props: { prop: { type?, options? } }, status? } }   code and Figma together
//   tokens: [--css-custom-property], text: one string of every source (code and Figma), every word of it a name the
//   system has; files: [project file paths]; layerFiles: [the layer's own files] or null when not known;
//   a11y: { component: [{ wcag, fix }] }; changed: { component: { at, added, removed, how } }; aliases: { key: name }
export function factsFrom({ components = {}, tokens = [], text = '', files = [], layerFiles = null, a11y = {}, changed = {}, aliases = {} } = {}) {
  const comps = new Map();
  for (const n of Object.keys(components)) comps.set(norm(n), n);
  for (const [k, n] of Object.entries(aliases)) if (!comps.has(norm(k))) comps.set(norm(k), n);
  const allProps = new Set();
  for (const c of Object.values(components)) for (const p of Object.keys(c.props ?? {})) allProps.add(p);
  const words = new Set((text.match(/[A-Za-z_$][\w$-]*/g) ?? []).map(norm));
  const noExt = (f) => String(f).replace(/^\.?\//, '').replace(/\.[\w]+$/, '');
  const fileKeys = files.map(noExt);
  const dirs = new Set(files.flatMap((f) => { const parts = String(f).replace(/^\.?\//, '').split('/'); return parts.slice(0, -1).map((_, i) => parts.slice(0, i + 1).join('/')); }));
  return {
    components, comps, allProps, words, text, tokens: new Set(tokens), files: fileKeys, dirs,
    layerFiles: layerFiles ? new Set(layerFiles.map(noExt)) : null, a11y, changed,
    hasFile: (p) => { const k = noExt(p).replace(/\/$/, ''); return dirs.has(k) || fileKeys.some((f) => f === k || f.endsWith('/' + k)); },
  };
}

// Every text file under a folder, skipping what is not the project's own source.
function walk(root, dir, out, { exts = /\.(vue|jsx?|tsx?|mjs|svelte|s?css|less|json|html|svg|png|md)$/i } = {}) {
  let names = []; try { names = readdirSync(dir); } catch { return out; }
  for (const f of names) {
    if (f.startsWith('.') || f === 'node_modules' || f === 'dist' || f === 'build' || f === 'coverage') continue;
    const p = join(dir, f);
    if (ENGINE_DIRS.some((d) => relative(root, p) === d)) continue;
    let s; try { s = statSync(p); } catch { continue; }
    if (s.isDirectory()) walk(root, p, out, { exts });
    else if (exts.test(f)) out.push({ path: relative(root, p), size: s.size });
  }
  return out;
}

// The system as the engine read it: the code capture (components, props, tokens), Figma's snapshots, the project's
// files, the accessibility check, and when each component last changed (kept by the engine, and the code's history
// when it is a git repository). record: keep this run's props to tell the next run what changed.
export function systemFacts(ROOT, cfg = {}, { record = true, now = new Date().toISOString() } = {}) {
  const code = readJson(resolve(ROOT, codeSnapshotPath(cfg))) ?? {};
  const P = cfg.paths ?? {};
  const structure = readJson(resolve(ROOT, P.snapshotStructure || 'figma-structure.snapshot.json'))?.components ?? {};
  const figmaProps = readJson(resolve(ROOT, P.compPropsSnapshot || 'figma-component-props.snapshot.json')) ?? {};
  const authored = readJson(resolve(ROOT, 'contract.authored.json'))?.components ?? {};
  const components = {};
  const add = (n) => (components[n] ??= { props: {} });
  for (const n of Object.keys(structure)) if (!/^[_.\s]/.test(n)) add(n);
  for (const [n, a] of Object.entries(code.api ?? {})) {
    const c = add(n); if (a?.file) c.file = a.file;
    for (const [p, d] of Object.entries(a?.props ?? {})) c.props[p] = { type: d?.type ?? null, options: Array.isArray(d?.options) ? d.options.map(String) : null, from: 'the code' };
    for (const s of a?.slots?.named ?? []) c.slots = [...(c.slots ?? []), s];
  }
  for (const [n, x] of Object.entries(figmaProps)) {
    if (n.startsWith('_') || !x?.properties) continue;
    const c = add(n);
    for (const [k, d] of Object.entries(x.properties)) {
      const p = k.split('#')[0];
      const options = Array.isArray(d?.variantOptions) ? d.variantOptions.map(String) : null;
      const had = c.props[p];
      c.props[p] = had ? { ...had, options: had.options ?? options } : { type: d?.type === 'BOOLEAN' ? 'boolean' : d?.type === 'VARIANT' ? 'variant' : String(d?.type ?? '').toLowerCase() || null, options, from: 'Figma' };
    }
    const st = resolveStatus(authored[n], x.description);
    if (st) c.status = st.state;
  }
  for (const [n, a] of Object.entries(authored)) { const st = resolveStatus(a, null); if (st && components[n]) components[n].status = st.state; }
  // The names a page may use for a component: its code file's name too (TileOne for TileOne.vue).
  const aliases = {};
  for (const [n, c] of Object.entries(components)) if (c.file) aliases[String(c.file).split('/').pop().replace(/\.[^.]+$/, '')] = n;
  // Every word the system has: its code (the folders its components and token files are in) and Figma's snapshots.
  const roots = new Set();
  for (const c of Object.values(components)) if (c.file) roots.add(String(c.file).replace(/^\.?\//, '').split('/')[0]);
  for (const f of [P.themeCSS].flat().filter(Boolean)) if (!/^https?:/.test(f)) roots.add(String(f).replace(/^\.?\//, '').split('/')[0]);
  const files = [];
  for (const r of roots) { const p = resolve(ROOT, r); try { if (statSync(p).isDirectory()) walk(ROOT, p, files); else files.push({ path: r, size: statSync(p).size }); } catch { /* gone */ } }
  const texts = [];
  for (const f of files) if (!/\.(png|svg)$/i.test(f.path) && f.size < 4e6) { try { texts.push(readFileSync(resolve(ROOT, f.path), 'utf8')); } catch { /* unreadable */ } }
  for (const k of ['snapshotStructure', 'compPropsSnapshot', 'snapshotVars', 'snapshotIcons', 'snapshotExamples', 'snapshotScreenComponents']) {
    const p = P[k] && resolve(ROOT, P[k]);
    if (p && existsSync(p) && !files.some((f) => resolve(ROOT, f.path) === p)) { try { texts.push(readFileSync(p, 'utf8')); } catch { /* unreadable */ } }
  }
  // The accessibility check's findings, by component.
  const a11y = {};
  for (const i of readJson(resolve(ROOT, OUT_DIR, 'a11y.json'))?.issues ?? []) {
    const n = String(i.component ?? '').replace(/^\./, ''); if (!n || !i.wcag) continue;
    (a11y[n] ??= []).push({ wcag: String(i.wcag), fix: i.fix ?? null, issue: i.issue ?? null });
  }
  const changed = componentChanges(ROOT, components, { record, now });
  // The intent layer's own files, when its snapshot lists them (a page may point at another page of the layer).
  const il = readJson(resolve(ROOT, (typeof cfg.intentLayer === 'object' && cfg.intentLayer?.out) || 'intent-layer.snapshot.json'));
  return factsFrom({ components, tokens: Object.keys(code.tokens ?? {}), text: texts.join('\n'), files: files.map((f) => f.path), layerFiles: il?.layerFiles ?? null, a11y, changed, aliases });
}

// When each component last changed: the engine keeps each component's props (names, and the values each takes) from
// run to run, and dates the run that first saw them differ; the code's own history dates its file when the project is
// a git repository. → { name: { at, added: [props], removed: [props], how } }; a component never seen to change has none.
export function componentChanges(ROOT, components, { record = true, now = new Date().toISOString() } = {}) {
  const path = resolve(ROOT, CHANGES_FILE);
  const kept = readJson(path) ?? {};
  const next = {}, out = {};
  for (const [n, c] of Object.entries(components)) {
    const props = Object.keys(c.props ?? {}).sort();
    const sig = props.map((p) => `${p}:${(c.props[p].options ?? []).join('|')}`).join(',');
    const was = kept[n];
    if (!was) next[n] = { sig, props, since: null };
    else if (was.sig !== sig) {
      next[n] = { sig, props, since: now, added: props.filter((p) => !was.props.includes(p)), removed: was.props.filter((p) => !props.includes(p)) };
      if (!next[n].added.length && !next[n].removed.length) next[n].values = true;
    } else next[n] = was;
    const r = next[n];
    if (r.since) out[n] = { at: r.since, added: r.added ?? [], removed: r.removed ?? [], how: r.values ? 'the values its props take changed' : 'props' };
  }
  if (record) { try { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, JSON.stringify(next, null, 1) + '\n'); } catch { /* not kept */ } }
  // The code's history, when there is one: the last commit of each component's file.
  try {
    const filesOf = Object.entries(components).filter(([, c]) => c.file).map(([n, c]) => [n, String(c.file).replace(/^\.?\//, '')]);
    if (filesOf.length && existsSync(resolve(ROOT, '.git'))) {
      const log = execFileSync('git', ['-C', ROOT, 'log', '--format=@%cI', '--name-only', '-n', '3000', '--', ...new Set(filesOf.map(([, f]) => f.split('/')[0]))], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 64e6 });
      const last = new Map(); let at = null;
      for (const l of log.split('\n')) { if (l.startsWith('@')) at = l.slice(1); else if (l && at && !last.has(l)) last.set(l, at); }
      for (const [n, f] of filesOf) {
        const d = last.get(f); if (!d) continue;
        if (!out[n] || d > out[n].at) out[n] = { at: d, added: [], removed: [], how: 'file', file: f };
      }
    }
  } catch { /* no history */ }
  return out;
}

// ── One page, against the system ────────────────────────────────────────────────────────────────────────────────────
// Each line a page says, with where it is (the section it is under), code blocks left out: they are examples.
const PARTS = [['purpose', 'Intent'], ['whenToUse', 'When to use'], ['whenNotToUse', 'When not to use'], ['mistakes', 'Common mistakes'], ['limitations', 'Limitations']];
export function linesOf(e) {
  const out = [];
  for (const [k, where] of PARTS) for (const t of e[k] ?? []) out.push({ where, text: String(t) });
  for (const r of e.rules ?? []) out.push({ where: 'Rules', text: String(r.text ?? r) });
  for (const s of e.sections ?? []) out.push({ where: s.title, text: String(s.text ?? '').replace(/```[\s\S]*?```/g, ' ') });
  return out;
}
const sentenceOf = (text, at) => {
  const start = Math.max(text.lastIndexOf('. ', at), text.lastIndexOf('\n', at)) + 1;
  const m = /[.!?](\s|$)|\n/.exec(text.slice(at)); const end = m ? at + m.index + 1 : text.length;
  return text.slice(start, end).trim();
};

// Names written as code that look like names (camelCase, kebab-case, a token, a path), not words of a sentence.
const CODE_NAME = /^(?:[A-Za-z_$][\w$]*[a-z0-9][A-Z][\w$]*|[a-z][a-z0-9]*(?:-[a-z0-9]+)+)$/;
const PATH = /^[\w.@-]+(?:\/[\w.@-]+)+\/?$/;
const PLACEHOLDER = /^(folder|name|icon-name|path|file|component|x|y|n|foo|bar|your-?\w*|\.\.\.)$/i;
// prop=value, prop="value", :prop="value"
const SETS = /^:?([A-Za-z_][\w-]*)\s*=\s*["']?([^"'\s]*)["']?$/;
// The web's own names, not the system's: ARIA and data attributes, and the HTML elements a page may name.
const HTML_ATTR = /^(aria-[a-z]+|data-[\w-]+|role|tabindex|for|id|class|style|href|alt|title|type|name|value|disabled|readonly|required|autocomplete|inputmode)$/;
const HTML_EL = /^(a|abbr|button|code|div|form|h[1-6]|img|input|label|li|nav|ol|option|p|pre|section|select|span|svg|table|tbody|td|textarea|th|thead|tr|ul)$/i;
const WARNS = /^\s*(do not|don't|never|avoid)\b|\b(deprecated|removed|no longer|must not be used|not part of|invent(ed)?|misspel\w*|alias(es)? of|not an? (new )?(ds|design[- ]system) component|local (layout )?wrapper)\b/i;
const NOT_THIS = /\b(not|never|avoid|instead of|rather than|named|called|nor|no)\s+(?:[\w-]+\s+){0,3}$|\b(not|never|avoid|instead of|rather than|named|called|nor|no)\s*$/i;
const FIGMA_DRAWING = /\bfigma\b|\b(construction )?layers?\b|\bframes?\b/i;
const camel = (s) => s.replace(/-([a-z0-9])/g, (_, c) => c.toUpperCase());
const BOOL = new Set(['true', 'false']);

// A name it writes that the system does not have, and a close one it does (a typo), when there is exactly one.
function closest(word, facts) {
  const w = norm(word); if (w.length < 5) return null;
  const pool = [...facts.comps.values(), ...facts.allProps];
  const near = [...new Set(pool.filter((n) => Math.abs(norm(n).length - w.length) <= 2 && lev(norm(n), w) <= 2))];
  return near.length === 1 ? near[0] : null;
}
function lev(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}

const propsOf = (facts, n) => facts.components[n]?.props ?? {};
const propOf = (facts, n, p) => { const ps = propsOf(facts, n); return ps[p] ?? ps[camel(p)] ?? Object.entries(ps).find(([k]) => norm(k) === norm(p))?.[1] ?? null; };

// What a page says the component does for accessibility, said as done (not an instruction to whoever uses it, nor
// left to another component), and the WCAG criteria the accessibility check reports it under.
const A11Y = [
  { re: /\b(is|are) (fully )?keyboard[- ](accessible|operable|navigable|friendly)\b|\bsupports? (full )?keyboard\b|\bcan be (reached|used|operated) (with|by|from) (the )?keyboard\b|\bis focusable\b/i, wcag: ['2.1.1', '2.1.2', '2.4.3'], what: 'keyboard use' },
  { re: /\bhas (a )?visible focus\b|\bshows? (a )?focus (ring|indicator|outline)\b/i, wcag: ['2.4.7', '2.4.11'], what: 'a visible focus' },
  { re: /\bmeets? (the )?(wcag )?(aa )?contrast\b|\bcontrast (is|meets|passes)\b/i, wcag: ['1.4.3', '1.4.6', '1.4.11'], what: 'contrast' },
  { re: /\b(is|are) (fully )?(screen.?reader)[- ](accessible|friendly|compatible)\b|\bsupports? screen ?readers?\b|\b(is|are) announced\b|\bannounces (its|the)\b|\bhas an accessible name\b/i, wcag: ['4.1.2', '1.3.1', '2.5.3', '4.1.3'], what: 'what a screen reader says' },
];
const NOT_ITS_OWN = /\b(not|no|never|don't|do not|parent|owns?|consumer|caller|you|your)\b/i;

// → [finding]. component: the system's component this page documents (null for a page of another layer).
// strict: no leniency for a name the line warns against or says is Figma's (a drafted line names only what there is).
export function checkPage(e, facts, { component = null, strict = false } = {}) {
  const out = [];
  const seen = new Set();
  // One finding per sentence: the same wrong name in two sentences is two places to fix.
  const push = (f) => { const k = `${f.kind}|${f.says}|${f.line ?? ''}`; if (!seen.has(k)) { seen.add(k); out.push(f); } };
  const own = component && facts.components[component] ? component : null;
  for (const { where, text } of linesOf(e)) {
    for (const m of text.matchAll(/`([^`\n]+)`/g)) {
      const span = m[1].trim(); const line = sentenceOf(text, m.index);
      // Which component the sentence is about: the last one it names before this, else the page's own.
      const before = [...line.slice(0, Math.max(0, line.indexOf(m[0]))).matchAll(/`([^`\n]+)`/g)].map((x) => facts.comps.get(norm(x[1].trim()))).filter(Boolean);
      const subject = before.at(-1) ?? own;
      // A prop set to a value: the prop is one of the component's, the value one it takes.
      const set = SETS.exec(span);
      if (set) {
        const [, p, v] = set;
        // A prop no component has, in the code or Figma, and no word of the code: not in the system. A prop another
        // component has may be meant for it (a table's prop on a cell's page), so only the one the sentence is about
        // is held to its values.
        if (!facts.allProps.has(p) && !facts.allProps.has(camel(p)) && !facts.words.has(norm(p)) && !HTML_ATTR.test(p)) {
          const near = closest(p, facts);
          push({ kind: 'name', where, line, says: `\`${p}\``, truth: `No component has a prop \`${p}\`, in the code or Figma.${near ? ` The system has \`${near}\`.` : ''}`, source: 'the code and Figma', fix: near ? `Write \`${near}\` if that is the one meant; else take it out.` : 'Use the prop the component has for it, or take this out.' });
          continue;
        }
        const prop = subject ? propOf(facts, subject, p) : null;
        const vals = v.split(/[/|]/).filter(Boolean);
        const bad = prop?.options?.length ? vals.filter((x) => !prop.options.some((o) => norm(o) === norm(x))) : [];
        if (bad.length) {
          push({ kind: 'claim', where, line, says: `\`${p}\` = \`${v}\` on ${subject}`, truth: `\`${p}\` takes ${list(prop.options, 12)}.`, source: prop.from ?? 'the code', fix: `Use one of the values \`${p}\` takes, or add \`${bad[0]}\` to the component first.` });
        } else if (prop && v && prop.type === 'boolean' && !vals.every((x) => BOOL.has(x.toLowerCase()))) {
          push({ kind: 'claim', where, line, says: `\`${p}\` = \`${v}\` on ${subject}`, truth: `\`${p}\` is on or off (true or false).`, source: prop.from ?? 'the code', fix: `Set \`${p}\` to true or false.` });
        }
        continue;
      }
      // A name written as code: one the system has. A flow's or a page's own screens are the product's, not the
      // system's: there only a token, and a name one letter or two from one the system has (a typo), are held to it.
      const product = e.layer === 'flows' || e.layer === 'pages';
      let known = true, what = '';
      if (/^--[\w-]+$/.test(span)) { known = facts.tokens.has(span) || facts.text.includes(span); what = 'token'; }
      else if (HTML_ATTR.test(span)) continue;
      // A label written as Title/Case (a state, a screen: `Data/Content`) is a name for people, not a path.
      else if (PATH.test(span) && !span.split('/').every((s) => /^[A-Z][a-z]+$/.test(s)) && !span.split('/').some((s) => PLACEHOLDER.test(s)) && span.split('/').some((s) => s.length > 2) && !span.split('/').every((s) => HTML_EL.test(s))) {
        const inLayer = facts.layerFiles && [...facts.layerFiles].some((f) => f === span.replace(/\.[\w]+$/, '') || f.endsWith('/' + span.replace(/\.[\w]+$/, '')));
        const layerFolder = !facts.layerFiles && /\.(md|json)$/i.test(span) && String(e.file ?? '').split('/')[0] === span.split('/')[0];
        known = inLayer || layerFolder || facts.hasFile(span) || facts.text.includes(span) || facts.comps.has(norm(span)); what = 'file, icon or variable';
      } else if (CODE_NAME.test(span)) { known = facts.comps.has(norm(span)) || facts.allProps.has(span) || facts.allProps.has(camel(span)) || facts.words.has(norm(span)); what = 'name'; }
      else continue;
      // A name given as the one not to use ("not `icons/check-big`", "a component named `x`"), or in a sentence that warns
      // against it (do not use it, it is deprecated, removed, no longer there, not to be invented): the page says it is
      // not one, which is right.
      if (!known && !strict && (NOT_THIS.test(text.slice(Math.max(0, m.index - 40), m.index)) || WARNS.test(line))) continue;
      // A name of Figma's own drawing (a frame, a layer, a reference screen): the engine reads Figma's components and
      // variables, not every frame, so it cannot say such a name is not there.
      if (!known && !strict && (FIGMA_DRAWING.test(line) || FIGMA_DRAWING.test(where))) continue;
      if (!known) {
        const near = closest(span, facts);
        if (product && what !== 'token' && !near) continue;
        push({ kind: 'name', where, line, says: `\`${span}\``, truth: `No ${what === 'name' ? 'component, prop or name in the code or Figma' : what === 'token' ? 'token in the code or Figma' : 'file, icon or Figma variable'} is called that.${near ? ` The system has \`${near}\`.` : ''}`, source: 'the code and Figma', fix: near ? `Write \`${near}\` if that is the one meant; else take it out.` : 'Write the name the system uses, or take it out if it is not part of the system.' });
      }
    }
    // A list of values given for a prop: "through `tone`: `calm`, `loud`".
    for (const m of text.matchAll(/`([A-Za-z_][\w-]*)`\s*:\s*((?:`[^`\n]+`[\s,]*(?:or|and)?\s*)+)/g)) {
      const subject = own; if (!subject) continue;
      const prop = propOf(facts, subject, m[1]); if (!prop?.options?.length) continue;
      const vals = [...m[2].matchAll(/`([^`\n]+)`/g)].map((x) => x[1].trim());
      const bad = vals.filter((v) => !prop.options.some((o) => norm(o) === norm(v)));
      if (bad.length) push({ kind: 'claim', where, line: sentenceOf(text, m.index), says: `\`${m[1]}\` takes ${list(bad)}`, truth: `\`${m[1]}\` takes ${list(prop.options, 12)}.`, source: prop.from ?? 'the code', fix: `List only the values \`${m[1]}\` takes, or add ${bad.length === 1 ? 'that one' : 'those'} to the component first.` });
    }
    // What it says the component does for accessibility, against what the accessibility check found.
    if (own && facts.a11y[own]?.length) {
      for (const s of text.split(/(?<=[.!?])\s+|\n/)) {
        if (NOT_ITS_OWN.test(s)) continue;
        for (const t of A11Y) {
          if (!t.re.test(s)) continue;
          const found = facts.a11y[own].filter((i) => t.wcag.includes(i.wcag));
          if (!found.length) continue;
          const crit = [...new Set(found.map((i) => i.wcag))].join(', ');
          push({ kind: 'claim', where, line: s.trim(), says: `${own} handles ${t.what}`, truth: `The accessibility check found ${found.length} problem${found.length === 1 ? '' : 's'} with ${t.what} in ${own} (WCAG ${crit})${found[0].fix ? `: ${found[0].fix}` : '.'}`, source: 'the accessibility check', fix: 'Fix the component first, or say what it does today.' });
        }
      }
    }
  }
  if (own) {
    const c = facts.components[own];
    // The code file it names: the component's.
    if (e.code && c.file && String(e.code).replace(/^\.?\//, '') !== String(c.file).replace(/^\.?\//, '') && !facts.hasFile(e.code)) {
      push({ kind: 'claim', where: 'Code', line: e.code, says: `its code is ${e.code}`, truth: `${e.code} is not in the code; ${own} is in ${c.file}.`, source: 'the code', fix: `Point it at ${c.file}.` });
    }
    // The status it gives: the component's.
    if (c.status === 'deprecated' && e.status && !/deprecat|retir|legacy/i.test(e.status)) {
      push({ kind: 'claim', where: 'Status', line: `status: ${e.status}`, says: `it is ${e.status}`, truth: `${own} is deprecated.`, source: 'Figma or contract.authored.json', fix: 'Mark the page deprecated, and say what to use instead.' });
    }
    // Changed after the page was last edited.
    const ch = facts.changed[own];
    if (ch && e.updatedAt && Date.parse(ch.at) > Date.parse(e.updatedAt)) {
      const what = ch.how === 'file' ? `${String(ch.file).split('/').pop()} changed on ${day(ch.at)}`
        : `${own} changed on ${day(ch.at)}${ch.added.length ? `: new props ${list(ch.added)}` : ''}${ch.removed.length ? `${ch.added.length ? ';' : ':'} props removed ${list(ch.removed)}` : ''}${!ch.added.length && !ch.removed.length ? `: ${ch.how}` : ''}`;
      push({ kind: 'stale', where: 'The whole page', line: null, says: `last edited on ${day(e.updatedAt)}`, truth: `${what}, after this page was last edited.`, source: ch.how === 'file' ? 'the code\'s history' : 'the engine\'s record of the component', fix: 'Read it against the component as it is now and update what no longer holds; editing the page clears this.' });
    }
  }
  return out;
}

// Pages of two components that say the same: lines on three pages or more (written by a template) and each page's own
// names left out, at least two lines left, and most of them on the other page too. pages: [[entity, component]].
export function twins(pages) {
  const key = (e, comp) => {
    const names = [comp, e.name, String(e.code ?? '').split('/').pop().replace(/\.[^.]+$/, '')].filter(Boolean).map((n) => norm(n));
    return linesOf(e).map((l) => { let t = norm(l.text); for (const n of names) if (n.length >= 4) t = t.split(n).join('#'); return t; }).filter((t) => t.length > 12);
  };
  const keyed = pages.map(([e, comp]) => ({ e, comp, lines: [...new Set(key(e, comp))] }));
  const count = new Map();
  for (const p of keyed) for (const l of p.lines) count.set(l, (count.get(l) ?? 0) + 1);
  for (const p of keyed) p.own = p.lines.filter((l) => count.get(l) <= 2);
  const out = new Map();
  for (const a of keyed) {
    if (a.own.length < 2) continue;
    for (const b of keyed) {
      if (a === b || a.comp === b.comp || a.e === b.e) continue;
      const B = new Set(b.lines);
      const same = a.own.filter((l) => B.has(l)).length;
      // A page that names the other one (its name, or its code file's) says when to use which: not a twin.
      const raw = linesOf(a.e).map((l) => l.text).join('\n');
      const otherNames = [b.comp, b.e.name, String(b.e.code ?? '').split('/').pop()].filter(Boolean);
      if (otherNames.some((n) => raw.includes(n) || norm(raw).includes(norm(n)) && norm(n).length > 6)) continue;
      if (same >= 2 && same / a.own.length >= 0.8) {
        (out.get(a.e) ?? out.set(a.e, []).get(a.e)).push({ kind: 'twin', where: 'The whole page', line: null, says: `${same} of its ${a.own.length} lines`, truth: `${b.comp}'s page (${b.e.file}) says the same, so an agent cannot tell from them when to use one and not the other.`, source: 'the intent layer', fix: `Say what is particular to ${a.comp}: when to use it rather than ${b.comp}, and when not to.`, other: b.comp });
      }
    }
  }
  return out;
}

// Every page of the layer that documents a component, checked. matched: Map(component → entity) (matchComponents).
// → Map(entity → [finding])
export function checkLayer(snap, matched, facts) {
  const out = new Map();
  const forEntity = new Map([...matched].map(([n, e]) => [e, n]));
  for (const e of snap?.entities ?? []) {
    if (e.kind === 'token') continue;
    const component = forEntity.get(e) ?? null;
    if (e.layer === 'components' && !component) continue;
    const f = checkPage(e, facts, { component });
    if (f.length) out.set(e, f);
  }
  for (const [e, f] of twins([...matched].map(([n, e]) => [e, n]))) out.set(e, [...(out.get(e) ?? []), ...f]);
  return out;
}

// The layer checked once per run, for every reader that writes from it (the style guide, the design intent, the
// contracts): → wrongOf(entity) → [finding]. An entity is known by its file and name, so any read of the layer finds it.
const checked = new Map();
export const pageKey = (e) => `${e.file}#${e.id ?? e.name}`;
export function checkedLayer(ROOT, cfg, snap) {
  if (!snap?.entities?.length) return () => [];
  const k = `${resolve(ROOT)}|${snap._source?.sha ?? ''}|${snap.entities.length}`;
  if (!checked.has(k)) {
    let byKey = new Map();
    try {
      const facts = systemFacts(ROOT, cfg);
      const names = [...new Set([...systemNames(ROOT, cfg), ...Object.keys(facts.components)])];
      const found = checkLayer(snap, matchComponents(names, snap.entities, codeFilesOf(ROOT, cfg)), facts);
      byKey = new Map([...found].map(([e, f]) => [pageKey(e), f]));
    } catch { /* not checked: nothing said, nothing left out */ }
    checked.set(k, byKey);
  }
  const byKey = checked.get(k);
  return (e) => byKey.get(pageKey(e)) ?? [];
}

// ── The command: --check-intent [file or folder] ────────────────────────────────────────────────────────────────────
// A page (or a folder of them) checked before it is written to the layer, or, with none named, the whole layer as the
// project last read it. Prints each finding; exits 1 when any is found, so a page is written only once it passes.
export function report(findingsByPage) {
  const lines = [];
  let n = 0;
  for (const [page, fs] of findingsByPage) {
    if (!fs.length) continue;
    lines.push(`\n${page}`);
    for (const f of fs) { n++; lines.push(`  ✗ ${KINDS[f.kind]}: ${f.where ? f.where + ' · ' : ''}${f.line ? `"${f.line.length > 140 ? f.line.slice(0, 139) + '…' : f.line}"` : f.says}`, `     ${f.truth}`, `     → ${f.fix}`); }
  }
  return { n, text: lines.join('\n') };
}
