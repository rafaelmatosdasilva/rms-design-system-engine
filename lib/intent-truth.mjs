// intent-truth.mjs - whether what an intent-layer page says is true of the system, checked on every run.
//
// The usage report (intent-layer.mjs → useReport) says whether a page reaches the agents; this says whether what it
// tells them holds. Four checks, all mechanical, against what the engine read from Figma, the code and its own checks:
//   name:  every name it writes as code (`tileOne`, `dense`, `--tile-color`, `icons/check`, a file) is one the
//          system has: a component, a prop, a token, a Figma variable, an icon or a file, or a word of its code.
//   claim: what it says of a component agrees with it: a prop it sets is one the component has, with a value the prop
//          takes; the code file it names is the component's; a status it gives is the component's; what it says the
//          component does for accessibility, the accessibility check did not find broken.
//   stale: the component changed (its props, the values they take, its tokens, in the code or Figma, or its code file)
//          after the page was last edited or a person last confirmed it still holds (a yes to review:<page>,
//          intent-proposals.mjs). The page is not taken out: it is marked to review again, with what changed and since when.
//   twin:  it says what another component's page says, so it does not help an agent choose between the two.
//   copy:  a list it writes out by hand that the engine generates (a prop table, a token family, a catalog of
//          components): right today, stale tomorrow, and taken for the whole list (copied-lists.mjs).
// A finding: { kind, line (the sentence), says, truth, source, fix }. Nothing here is a judgement of the writing: a
// page with no finding can still be unclear, but none of what it states is contradicted by the system.

import { readFileSync, existsSync, readdirSync, statSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, join, relative, dirname } from 'node:path';
import { execFileSync } from 'node:child_process';
import { codeSnapshotPath, OUT_DIR, ENGINE_DIRS } from './names.mjs';
import { resolveStatus } from './decision-status.mjs';
import { matchComponents, systemNames, codeFilesOf } from './intent-layer.mjs';
import { readDecisions, withdrawn } from './intent-proposals.mjs';
import { copiedLists } from './copied-lists.mjs';
import { storeFigmaChangelogs } from './snapshot-history.mjs';
import { figmaChangelogs } from './component-changelog.mjs';
import { docFields, listFields, docLines } from './prop-shapes.mjs';

export const KINDS = { name: 'Not in the system', claim: 'Disagrees with the system', stale: 'Out of date', twin: 'Same as another page', copy: 'Copies a generated list' };
// What the engine keeps of each component's props between runs, to tell when one changed.
export const CHANGES_FILE = `${OUT_DIR}/component-changes.json`;

const norm = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
const readJson = (p) => { try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return null; } };
const day = (iso) => { const d = new Date(iso); return isNaN(d) ? String(iso) : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }); };
const list = (a, n = 6) => a.slice(0, n).map((x) => `\`${x}\``).join(', ') + (a.length > n ? `, … (${a.length})` : '');

// ── What the system has ─────────────────────────────────────────────────────────────────────────────────────────────
// From plain parts (the tests, another reader); systemFacts below reads them from a project.
//   components: { name: { file?, props: { prop: { type?, options? } }, status?, doc?: [{ prop, field, says }] } }
//   code and Figma together; doc is what the code's doc comment says of each prop and field
//   tokens: [--css-custom-property], text: one string of every source (code and Figma), every word of it a name the
//   system has; files: [project file paths]; layerFiles: [the layer's own files] or null when not known;
//   a11y: { component: [{ wcag, fix }] }; changed: { component: { at, added, removed, how } }; aliases: { key: name };
//   fields: the item fields of list and object props the code facts know (a doc comment's, the product's uses)
export function factsFrom({ components = {}, tokens = [], text = '', files = [], layerFiles = null, a11y = {}, changed = {}, aliases = {}, fields = [] } = {}) {
  const comps = new Map();
  for (const n of Object.keys(components)) comps.set(norm(n), n);
  for (const [k, n] of Object.entries(aliases)) if (!comps.has(norm(k))) comps.set(norm(k), n);
  const allProps = new Set();
  for (const c of Object.values(components)) for (const p of Object.keys(c.props ?? {})) allProps.add(p);
  const words = new Set((text.match(/[A-Za-z_$][\w$-]*/g) ?? []).map(norm));
  // The fields of a list or object prop the engine's code facts know (its Data line), though only a doc comment writes them.
  for (const f of fields) words.add(norm(f));
  // Each part of a token's name is a name the system has (--x-tileHeader-color: tileHeader), the family a page names.
  for (const t of [...tokens, ...(text.match(/--[\w-]+/g) ?? [])]) for (const w of String(t).replace(/^--/, '').split('-')) if (w.length > 2) words.add(norm(w));
  const noExt = (f) => String(f).replace(/^\.?\//, '').replace(/\.[\w]+$/, '');
  const fileKeys = files.map(noExt);
  const dirs = new Set(files.flatMap((f) => { const parts = String(f).replace(/^\.?\//, '').split('/'); return parts.slice(0, -1).map((_, i) => parts.slice(0, i + 1).join('/')); }));
  return {
    components, comps, allProps, words, text, tokens: new Set(tokens), files: fileKeys, dirs,
    layerFiles: layerFiles ? new Set(layerFiles.map(noExt)) : null, a11y, changed,
    hasFile: (p) => { const k = noExt(p).replace(/\/$/, ''); return dirs.has(k) || fileKeys.some((f) => f === k || f.endsWith('/' + k)); },
  };
}

// The fields a component's doc comment names under each of its list and object props (docFields, as the prototype
// check reads them), with the fields under those. A prop the comment names that the component does not have gives none:
// a typo stays one. props: the capture's { prop: { type } }. → [field]
function docItemFields(props = {}, src = '') {
  const doc = docFields(src), byKey = new Map(Object.keys(props ?? {}).map((p) => [norm(p), p]));
  const fields = Object.fromEntries(Object.entries(doc).map(([f, v]) => [byKey.get(norm(f)) ?? f, v]));
  const { data } = listFields('', { props, fields });
  return [...Object.values(data).flat(), ...Object.keys(data).flatMap((p) => nestedFields(fields[p]))];
}
// Every field under a doc comment's fields, at any depth below the first. → [field]
const nestedFields = (fields) => Object.values(fields ?? {}).flatMap((e) => (e && typeof e === 'object' ? Object.entries(e.fields ?? {}).flatMap(([k, v]) => [k, ...nestedFields({ [k]: v })]) : []));

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
  // The fields of each list or object prop, as the engine's code facts know them (its Data line): its doc comment's,
  // and the keys the product's own uses give it. Names the code has, though a comment is where they are written.
  const itemFields = [];
  const cache = readJson(resolve(ROOT, OUT_DIR, 'prototypes', 'page-system.json'));
  for (const [n, c] of Object.entries(cache?.components ?? {})) { const { data } = listFields(n, c, cache.uses); itemFields.push(...Object.values(data).flat(), ...Object.keys(data).flatMap((p) => nestedFields(c.fields?.[p]))); }
  for (const n of Object.keys(structure)) if (!/^[_.\s]/.test(n)) add(n);
  for (const [n, a] of Object.entries(code.api ?? {})) {
    const c = add(n); if (a?.file) c.file = a.file;
    // The words of its own code file: a value the code takes but the capture did not list (a status the code names).
    // Its root element too (<button>, <nav>…): the role a person writes for it starts from it.
    // What its doc comment says of each prop and field (docLines): where a property only Figma has is carried in the code.
    if (a?.file) { try { const src = readFileSync(resolve(ROOT, a.file), 'utf8'); c.codeWords = [...new Set(src.match(/[A-Za-z_][\w-]*/g) ?? [])]; c.root = /<template>\s*<([a-zA-Z][\w-]*)/.exec(src)?.[1]?.toLowerCase() ?? null; itemFields.push(...docItemFields(a.props, src)); const byKey = new Map(Object.keys(a.props ?? {}).map((p) => [norm(p), p])); const said = docLines(src).filter((l) => byKey.has(norm(l.prop))).map((l) => ({ ...l, prop: byKey.get(norm(l.prop)) })); if (said.length) c.doc = said; } catch { /* not read */ } }
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
      c.props[p] = had ? { ...had, options: had.options ?? options, ...(had.options || !options ? {} : { optionsFrom: 'Figma' }) } : { type: d?.type === 'BOOLEAN' ? 'boolean' : d?.type === 'VARIANT' ? 'variant' : String(d?.type ?? '').toLowerCase() || null, options, from: 'Figma' };
    }
    const st = resolveStatus(authored[n], x.description);
    if (st) c.status = st.state;
  }
  for (const [n, a] of Object.entries(authored)) { const st = resolveStatus(a, null); if (st && components[n]) components[n].status = st.state; }
  // Its tokens: those its contract says it uses, and Figma's variables named after it (tileOne/background).
  for (const [n, t] of Object.entries(componentTokens(ROOT, cfg, Object.keys(components)))) components[n].tokens = t;
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
  // A name only a comment writes is not one the code has (a typo in a doc comment, copied into a page, stays a typo),
  // and what the engine itself generates from the pages (design-intent.json) would only echo them back.
  const own = new Set([cfg.docs?.out, 'design-intent.json'].filter(Boolean).map((x) => String(x).split('/').pop()));
  const uncommented = (t, path) => (/\.(vue|svelte|html?|[cm]?[jt]sx?|s?css|less)$/i.test(path)
    ? t.replace(/<!--[\s\S]*?-->/g, ' ').replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:'"`\\])\/\/[^\n]*/g, '$1') : t);
  for (const f of files) if (!/\.(png|svg)$/i.test(f.path) && f.size < 4e6 && !own.has(String(f.path).split('/').pop())) { try { texts.push(uncommented(readFileSync(resolve(ROOT, f.path), 'utf8'), f.path)); } catch { /* unreadable */ } }
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
  // Figma's history: the snapshots the project commits (each commit read once, then kept: component-changelog.mjs), else
  // the snapshots store's saved history.
  let figma = null;
  try {
    const snaps = { props: P.compPropsSnapshot || (existsSync(resolve(ROOT, 'figma-component-props.snapshot.json')) ? 'figma-component-props.snapshot.json' : 'src/figma-component-props.snapshot.json'), vars: P.snapshotVars || 'src/figma-vars.snapshot.json' };
    figma = figmaChangelogs(ROOT, snaps, Object.keys(components));
  } catch { /* no git history */ }
  if (!figma || !Object.keys(figma).length) { try { figma = storeFigmaChangelogs(ROOT, Object.keys(components)); } catch { /* no store history */ } }
  const changed = componentChanges(ROOT, components, { record, now, figma });
  // The intent layer's own files, when its snapshot lists them (a page may point at another page of the layer).
  const il = readJson(resolve(ROOT, (typeof cfg.intentLayer === 'object' && cfg.intentLayer?.out) || 'intent-layer.snapshot.json'));
  return factsFrom({ components, tokens: Object.keys(code.tokens ?? {}), text: texts.join('\n'), files: files.map((f) => f.path), layerFiles: il?.layerFiles ?? null, a11y, changed, aliases, fields: itemFields });
}

// Each component's tokens, from what the engine already wrote: its contract's tokens.used (contracts/), and the Figma
// variables named after it in the variables snapshot. → { name: [token] } (sorted), only for the components that have any.
export function componentTokens(ROOT, cfg = {}, names = []) {
  const out = {};
  const add = (n, t) => { if (!names.includes(n) || !t) return; (out[n] ??= new Set()).add(String(t)); };
  const walkDir = (d) => { let es = []; try { es = readdirSync(d, { withFileTypes: true }); } catch { return; } for (const x of es) { const p = join(d, x.name); if (x.isDirectory()) walkDir(p); else if (x.name.endsWith('.contract.json')) { const c = readJson(p); const n = c?.name ?? String(c?.id ?? '').replace(/^[^.]+\./, ''); for (const t of c?.tokens?.used ?? []) add(n, t); } } };
  walkDir(resolve(ROOT, cfg.contracts?.out ?? 'contracts'));
  const vars = cfg.paths?.snapshotVars ? readJson(resolve(ROOT, cfg.paths.snapshotVars)) : null;
  for (const [mode, map] of Object.entries(vars ?? {})) {
    if (!map || typeof map !== 'object' || Array.isArray(map) || mode.startsWith('_')) continue;
    for (const k of Object.keys(map)) { const n = k.split('/')[0]; if (k.includes('/')) add(n, k); }
  }
  return Object.fromEntries(Object.entries(out).map(([n, t]) => [n, [...t].sort()]));
}

// When each component last changed, and what: the engine keeps each component's props (names, and the values each
// takes) and its tokens from run to run, and dates the run that first saw them differ; the code's own history dates its
// file when the project is a git repository; the snapshots store's history (snapshot-history.mjs, read from its kept
// digest, never fetched here) dates each read of Figma that changed it. → { name: { at, added, removed, how, log } }:
// at, added, removed and how are the latest change's; log is every change kept, newest last, each
// { at, how, added?, removed?, values?: [{ prop, added, removed }], tokensAdded?, tokensRemoved?, file?, figma? }.
// A component never seen to change has none.
const LOG_KEPT = 12;
export function componentChanges(ROOT, components, { record = true, now = new Date().toISOString(), figma = null } = {}) {
  const path = resolve(ROOT, CHANGES_FILE);
  const kept = readJson(path) ?? {};
  const next = {}, out = {};
  const less = (a, b) => (a ?? []).filter((x) => !(b ?? []).includes(x));
  for (const [n, c] of Object.entries(components)) {
    const props = Object.keys(c.props ?? {}).sort();
    const sig = props.map((p) => `${p}:${(c.props[p].options ?? []).join('|')}`).join(',');
    const options = Object.fromEntries(props.filter((p) => c.props[p].options?.length).map((p) => [p, c.props[p].options.map(String)]));
    const tokens = c.tokens ?? [];
    const was = kept[n];
    // A record from before tokens were kept takes today's as where they start: never a change of its own.
    const wasTokens = was?.tokens ?? tokens;
    const tokensAdded = less(tokens, wasTokens), tokensRemoved = less(wasTokens, tokens);
    if (!was) next[n] = { sig, props, options, tokens, since: null, log: [] };
    else if (was.sig !== sig || tokensAdded.length || tokensRemoved.length) {
      const ev = { at: now, how: 'props', added: less(props, was.props), removed: less(was.props, props) };
      if (was.sig !== sig && was.options) {
        const values = props.filter((p) => was.props.includes(p)).map((p) => ({ prop: p, added: less(options[p], was.options[p]), removed: less(was.options[p], options[p]) })).filter((v) => v.added.length || v.removed.length);
        if (values.length) ev.values = values;
      }
      if (tokensAdded.length) ev.tokensAdded = tokensAdded;
      if (tokensRemoved.length) ev.tokensRemoved = tokensRemoved;
      if (was.sig === sig) ev.how = 'tokens';
      else if (!ev.added.length && !ev.removed.length && !ev.values) ev.how = 'the values its props take changed';
      next[n] = { sig, props, options, tokens, since: now, added: ev.added, removed: ev.removed, ...(ev.how !== 'props' && ev.how !== 'tokens' ? { values: true } : {}), log: [...(was.log ?? []), ev].slice(-LOG_KEPT) };
    } else next[n] = { ...was, options, tokens };
    const r = next[n];
    // A record from before the log was kept: its one change, as it was said.
    const log = r.log?.length ? r.log : r.since ? [{ at: r.since, how: r.values ? 'the values its props take changed' : 'props', added: r.added ?? [], removed: r.removed ?? [] }] : [];
    if (log.length) { const last = log[log.length - 1]; out[n] = { at: last.at, added: last.added ?? [], removed: last.removed ?? [], how: last.how, log }; }
  }
  if (record) { try { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, JSON.stringify(next, null, 1) + '\n'); } catch { /* not kept */ } }
  const addEvent = (n, ev) => {
    const o = out[n] ?? { at: ev.at, added: [], removed: [], how: ev.how, log: [] };
    o.log = [...o.log, ev].sort((a, b) => String(a.at).localeCompare(String(b.at)));
    if (!out[n] || ev.at > o.at) Object.assign(o, { at: ev.at, added: [], removed: [], how: ev.how, ...(ev.file ? { file: ev.file } : {}) });
    out[n] = o;
  };
  // The code's history, when there is one: the last commit of each component's file.
  try {
    const filesOf = Object.entries(components).filter(([, c]) => c.file).map(([n, c]) => [n, String(c.file).replace(/^\.?\//, '')]);
    if (filesOf.length && existsSync(resolve(ROOT, '.git'))) {
      const log = execFileSync('git', ['-C', ROOT, 'log', '--format=@%cI', '--name-only', '-n', '3000', '--', ...new Set(filesOf.map(([, f]) => f.split('/')[0]))], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 64e6 });
      const last = new Map(); let at = null;
      for (const l of log.split('\n')) { if (l.startsWith('@')) at = l.slice(1); else if (l && at && !last.has(l)) last.set(l, at); }
      for (const [n, f] of filesOf) { const d = last.get(f); if (d) addEvent(n, { at: d, how: 'file', file: f }); }
    }
  } catch { /* no history */ }
  // Figma's history: each read of Figma that changed what it says of the component (its properties, its variables). Its
  // first read is not a change of it: a page written before the snapshots were first kept is not out of date for that.
  const first = (r) => r.changed.length === 1 && /first time/.test(r.changed[0]);
  for (const [n, list] of Object.entries(figma ?? {})) {
    if (!components[n]) continue;
    for (const r of (list ?? []).slice(0, 5)) if (r?.date && r.changed?.length && !first(r)) addEvent(n, { at: r.date, how: 'figma', figma: r.changed });
  }
  return out;
}

// The changes of a component made after a date (the page's last edit, or its last confirmation), oldest first.
// ch: componentChanges' entry for it, or one as the tests write it ({ at, added, removed, how, file? }).
export function changesSince(ch, since) {
  if (!ch) return [];
  const t = Date.parse(since);
  const log = ch.log?.length ? ch.log : [{ at: ch.at, how: ch.how, added: ch.added ?? [], removed: ch.removed ?? [], ...(ch.file ? { file: ch.file } : {}) }];
  return log.filter((e) => isNaN(t) || Date.parse(e.at) > t);
}

// What changed, in a few words a change: new props, props removed, a prop's values, tokens, its file, a read of Figma.
// → [string], newest last, each a sentence part ("new props `glow`; props removed `dense`").
export function changeWords(events) {
  return events.map((e) => {
    if (e.how === 'file') return `${String(e.file).split('/').pop()} changed in the code`;
    if (e.how === 'figma') return `Figma: ${e.figma.slice(0, 3).join(', ')}${e.figma.length > 3 ? `, … (${e.figma.length})` : ''}`;
    const parts = [];
    if (e.added?.length) parts.push(`new props ${list(e.added)}`);
    if (e.removed?.length) parts.push(`props removed ${list(e.removed)}`);
    for (const v of e.values ?? []) parts.push(`\`${v.prop}\` ${[v.added.length ? `takes ${list(v.added)} now` : '', v.removed.length ? `no longer takes ${list(v.removed)}` : ''].filter(Boolean).join(' and ')}`);
    if (e.tokensAdded?.length) parts.push(`new tokens ${list(e.tokensAdded, 4)}`);
    if (e.tokensRemoved?.length) parts.push(`tokens removed ${list(e.tokensRemoved, 4)}`);
    return parts.length ? parts.join('; ') : e.how;
  });
}

// The names a change took away (props, values, tokens): a page that still writes one of them says what is no longer so.
export const removedBy = (events) => [...new Set(events.flatMap((e) => [...(e.removed ?? []), ...(e.tokensRemoved ?? []), ...(e.values ?? []).flatMap((v) => v.removed)]))];

// ── Decisions, against the component's changes ─────────────────────────────────────────────────────────────────────
// A decision answered in the decisions file (intent-proposals.mjs: add:, fix:, move:) is dated as a page is: when its
// component changed after it was recorded, or after a person last confirmed it still holds (a yes to recheck:<key>), it
// is marked to review again, with what changed and since when. It still stands until a person withdraws it (a no).
// The component a decision is about: add:<component> names it; fix:<page>:<name> and move:<page> name a page, whose
// component pageComponent gives. A review (review:, recheck:) is not a decision of its own here. → name | null
export function decisionComponent(key, pageComponent = () => null) {
  const k = String(key ?? '');
  let m;
  if ((m = /^add:(.+)$/.exec(k))) return m[1];
  if ((m = /^move:(.+)$/.exec(k))) return pageComponent(m[1]) ?? null;
  if ((m = /^fix:(.+):[^:]*$/.exec(k))) return pageComponent(m[1]) ?? null;
  return null;
}
// decisions: the decisions file; changed: componentChanges' (facts.changed); only(key): the decisions to look at.
// → { key: { component, at, since, confirmed, changed: [words], truth, note } } for every decision to review again.
export function decisionsToReview(decisions = {}, changed = {}, { pageComponent = () => null, only = () => true } = {}) {
  const out = {};
  for (const [k, d] of Object.entries(decisions ?? {})) {
    if (!d?.at || /^(review|recheck):/.test(k) || !only(k)) continue;
    const own = decisionComponent(k, pageComponent);
    const ch = own && changed?.[own];
    if (!ch) continue;
    const again = decisions[`recheck:${k}`];
    const confirmed = again?.answer === 'yes' && again.at && Date.parse(again.at) > Date.parse(d.at);
    const since = confirmed ? again.at : d.at;
    const events = changesSince(ch, since);
    if (!events.length) continue;
    const at = events[events.length - 1].at;
    const words = changeWords(events);
    const one = events.length === 1 && events[0].how === 'file' ? `${String(events[0].file).split('/').pop()} changed on ${day(at)}` : `${own} changed on ${day(at)}: ${words.join('; ')}`;
    const truth = `${one}, after this decision was ${confirmed ? 'last confirmed' : 'recorded'}.`;
    out[k] = { component: own, at, since, confirmed: !!confirmed, changed: words, truth, note: `To review again: ${truth} Where it disagrees with the component's contract, follow the contract.` };
  }
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
const PLACEHOLDER = /^(folder|name|icon-name|path|file|component|token|x|y|n|foo|bar|your-?\w*|\.\.\.)$/i;
// prop=value, prop="value", :prop="value"
const SETS = /^:?([A-Za-z_][\w-]*)\s*=\s*["']?([^"'\s]*)["']?$/;
// The web's own names, not the system's: ARIA and data attributes, and the HTML elements a page may name.
const HTML_ATTR = /^(aria-[a-z]+|data-[\w-]+|role|tabindex|for|id|class|style|href|alt|title|type|name|value|disabled|readonly|required|autocomplete|inputmode)$/;
const HTML_EL = /^(a|abbr|button|code|div|form|h[1-6]|img|input|label|li|nav|ol|option|p|pre|section|select|span|svg|table|tbody|td|textarea|th|thead|tr|ul)$/i;
const WARNS = /^\s*(do not|don't|never|avoid)\b|\b(deprecated|removed|no longer|must not be used|not part of|invent(ed)?|misspel\w*|alias(es)? of|not an? (new )?(ds|design[- ]system) component|local (layout )?wrapper)\b/i;
// A list item under a line that says what follows is wrong ("Incorrect:", "Don't:", "Avoid:"): examples not to follow.
function underWrongList(text, at) {
  const lines = text.slice(0, at).split('\n');
  if (!/^\s*[-*]\s/.test(lines.at(-1))) return false;
  for (let i = lines.length - 2; i >= 0; i--) { if (/^\s*[-*]\s/.test(lines[i]) || !lines[i].trim()) continue; return /^\s*(incorrect|wrong|bad|don'?t|do not|avoid|never)\b[^\n]*:\s*$/i.test(lines[i]); }
  return false;
}
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

// A value the prop takes: one of its options, or, when only Figma lists them (Figma names a variant one way, the code
// another: positive and success), a word of the component's own code file.
const takes = (facts, n, prop, v) => prop.options.some((o) => norm(o) === norm(v)) || ((prop.optionsFrom ?? prop.from) !== 'the code' && (facts.components[n]?.codeWords ?? []).includes(v));
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

// Whether a name written as code is one the system has, or the web's own, or a file or folder of the project: what the
// content check does not call "not in the system". The documentation rating asks the same, so both say the same.
export function inSystem(facts, n) {
  const w = String(n ?? '').trim(), bare = w.replace(/^--/, ''), k = norm(bare);
  if (/^<[A-Za-z]/.test(w)) return true;   // markup (an example), not a name: its tag and props are the content check's
  if (!k || PLACEHOLDER.test(bare) || HTML_ATTR.test(bare) || HTML_EL.test(bare) || BOOL.has(bare)) return true;
  if (facts.comps.has(k) || [...facts.allProps].some((p) => norm(p) === k) || facts.tokens.has(bare) || facts.tokens.has(w)) return true;
  if (PATH.test(bare) || /\.\w{1,5}$/.test(bare)) return facts.hasFile(bare) || (facts.layerFiles?.has(bare.replace(/\.[\w]+$/, '')) ?? false) || facts.words.has(k);
  if (bare.includes('*')) { const head = norm(bare.split('*')[0]); return head.length >= 3 && [...facts.words].some((x) => x.startsWith(head)); }
  return facts.words.has(k);
}

// → [finding]. component: the system's component this page documents (null for a page of another layer).
// strict: no leniency for a name the line warns against or says is Figma's (a drafted line names only what there is).
// reviewedAt: when a person last confirmed the page still holds (a yes to review:<page>): a change before it is settled.
export function checkPage(e, facts, { component = null, strict = false, reviewedAt = null } = {}) {
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
        const bad = prop?.options?.length ? vals.filter((x) => !takes(facts, subject, prop, x)) : [];
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
      if (/^--[\w-]+$/.test(span)) { known = facts.tokens.has(span) || facts.text.includes(span) || PLACEHOLDER.test(span.slice(2)); what = 'token'; }
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
      if (!known && !strict && (NOT_THIS.test(text.slice(Math.max(0, m.index - 40), m.index)) || WARNS.test(line) || underWrongList(text, m.index))) continue;
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
      const bad = vals.filter((v) => !takes(facts, own, prop, v));
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
    // Changed after the page was last edited, or last confirmed by a person: to review again, never taken out.
    const ch = facts.changed[own];
    const confirmed = reviewedAt && (!e.updatedAt || Date.parse(reviewedAt) > Date.parse(e.updatedAt));
    const since = confirmed ? reviewedAt : e.updatedAt;
    const events = ch && since ? changesSince(ch, since) : [];
    if (events.length) {
      const at = events[events.length - 1].at;
      const words = changeWords(events);
      const one = events.length === 1 && events[0].how === 'file' ? `${String(events[0].file).split('/').pop()} changed on ${day(at)}` : `${own} changed on ${day(at)}: ${words.join('; ')}`;
      const said = (x) => new RegExp(`(^|[^\\w-])${x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^\\w-])`);
      const gone = removedBy(events).filter((x) => linesOf(e).some((l) => said(x).test(l.text)));
      const from = [...new Set(events.map((x) => x.how === 'file' ? 'the code\'s history' : x.how === 'figma' ? 'Figma\'s history' : 'the engine\'s record of the component'))].join(' and ');
      push({ kind: 'stale', where: 'The whole page', line: null, says: confirmed ? `confirmed on ${day(reviewedAt)}` : `last edited on ${day(e.updatedAt)}`, truth: `${one}, after this page was ${confirmed ? 'last confirmed' : 'last edited'}.${gone.length ? ` The page still names ${list(gone)}.` : ''}`, source: from,
        fix: `Check the page against the component as it is today and update anything that is no longer true. This goes away once the page is edited, or once a person confirms it still holds.`,
        at, since, changed: words, ...(gone.length ? { gone } : {}) });
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
        (out.get(a.e) ?? out.set(a.e, []).get(a.e)).push({ kind: 'twin', where: 'The whole page', line: null, says: `${same} of its ${a.own.length} lines`, truth: `${b.comp}'s page (${b.e.file}) says the same, so an agent cannot tell from them when to use one and not the other.`, source: 'the intent layer', fix: `Say what is particular to ${a.comp}, when to use it rather than ${b.comp} and when not to.`, other: b.comp });
      }
    }
  }
  return out;
}

// Every page of the layer that documents a component, checked. matched: Map(component → entity) (matchComponents).
// → Map(entity → [finding])
// reviewedOf(entity): when a person last confirmed that page still holds, or null.
export function checkLayer(snap, matched, facts, { reviewedOf = () => null } = {}) {
  const out = new Map();
  const forEntity = new Map([...matched].map(([n, e]) => [e, n]));
  const contracts = new Map((snap?.contracts ?? []).map((c) => [c.name, c.file]));
  // What a copied list is pointed to: the layer's own generated files when it has them (a DTCG tokens file, the
  // contracts' folder), else the engine's.
  const tokensFile = (snap?.layerFiles ?? []).find((f) => /\.tokens\.json$/.test(f)) ?? 'tokens.json';
  // Each token's own entry in the layer says which of its files holds it.
  const tokenFile = new Map((snap?.entities ?? []).filter((t) => t.kind === 'token').flatMap((t) => [[norm(t.name), t.file], [norm('--' + String(t.name).replace(/\//g, '-')), t.file]]));
  const dirs = (snap?.contracts ?? []).map((c) => String(c.file).split('/'));
  let common = dirs[0] ?? []; for (const d of dirs) { let i = 0; while (i < common.length && common[i] === d[i]) i++; common = common.slice(0, i); }
  const catalog = common.length && dirs.length > 1 ? `the contracts in ${common.join('/')}` : 'the contracts';
  for (const e of snap?.entities ?? []) {
    if (e.kind === 'token') continue;
    const component = forEntity.get(e) ?? null;
    if (e.layer === 'components' && !component) continue;
    // And the lists it copies from what the engine generates (copied-lists.mjs): right today, stale tomorrow.
    const f = [...checkPage(e, facts, { component, reviewedAt: reviewedOf(e) }), ...copiedLists(e, facts, { component, contractOf: (c) => contracts.get(c) ?? null, tokensFile, tokenFileOf: (n) => tokenFile.get(norm(n)) ?? null, catalog })];
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
    const keptKeys = new Set();
    try {
      const facts = systemFacts(ROOT, cfg);
      const names = [...new Set([...systemNames(ROOT, cfg), ...Object.keys(facts.components)])];
      // A page a person confirmed still holds (a yes to review:<page>) counts its changes from then.
      const decisions = readDecisions(ROOT);
      const reviewedOf = (e) => (decisions[`review:${e.name}`]?.answer === 'yes' ? decisions[`review:${e.name}`].at ?? null : null);
      const found = checkLayer(snap, matchComponents(names, snap.entities, codeFilesOf(ROOT, cfg)), facts, { reviewedOf });
      // A name the team said to keep (intent-proposals.mjs → a yes to fix:<page>:<name>) is no longer a finding.
      // One withdrawn since (a no to recheck:<key>) is a finding again. Each one kept is named (keptKeys).
      const keyOf = (e, f) => `fix:${e.name}:${String(f.says).replace(/`/g, '')}`;
      const kept = (e, f) => f.kind === 'name' && decisions[keyOf(e, f)]?.answer === 'yes' && !withdrawn(decisions, keyOf(e, f));
      for (const [e, f] of found) for (const x of f) if (kept(e, x)) keptKeys.add(keyOf(e, x));
      byKey = new Map([...found].map(([e, f]) => [pageKey(e), f.filter((x) => !kept(e, x))]).filter(([, f]) => f.length));
    } catch { /* not checked: nothing said, nothing left out */ }
    checked.set(k, Object.assign(byKey, { keptKeys }));
  }
  const byKey = checked.get(k);
  return Object.assign((e) => byKey.get(pageKey(e)) ?? [], { kept: byKey.keptKeys ?? new Set() });
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
