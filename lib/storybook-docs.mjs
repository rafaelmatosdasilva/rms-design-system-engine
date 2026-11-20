// storybook-docs.mjs - what a team writes into Storybook by hand, read into its specs and guidelines.
//
// The engine already reads a Storybook's index to pair each component with its file, and each story as a page the
// browser checks run on (storybook-stories.mjs). What a team writes there by hand was left unread:
//   • each prop's description, its options and its default, in the story file's argTypes;
//   • the component's description (parameters.docs.description.component);
//   • each story, a worked example of the component in one state, with the args it needs;
//   • its tags (deprecated, experimental, beta, !autodocs).
// Those are the code's own words, so the spec takes them as the code's (each said to come from Storybook), and the
// guidelines take a story as the example of use when no product shows one.
//
// Only what the story files say as written is read. Storybook's own props table is generated from the same code the
// engine already reads (docgen), so it would add nothing, and it would hide a prop the stories describe that the code
// no longer has. The stories are read from the Storybook a project built to files, in Chrome, from the preview's own
// store (Storybook 7 and later keep each story file, as written, behind loadCSFFileByStoryId). The reading is kept in
// the engine's output folder, keyed on the build, so the specs and guidelines, which run without a browser, read it
// again until the Storybook is built again.
//
//   csfExpression(ids)                         → the page's expression that reads the story files those stories are in
//   readStoryFiles(dir, { chromePath })        → the reading, from a static build, in Chrome | null
//   storybookDocs(ROOT, cfg, { chromePath })   → the reading, cached on the build | null
//   docsFor(name, reading)                     → one component's: { title, file, description, tags, argTypes, stories } | null
//   storybookPart(docs, { codeProps, figmaProps }) → what its contract says of it: { from, description?, tags?, props, examples, differs }
//   statusFromTags(tags)                       → { state, source: 'storybook' } | null
//   storyExample(contract, example)            → the story written as a call, the way the guidelines show an example (its line is intent-examples.mjs exampleText)
//   differLines(rows)                          → what the run says, one line a disagreement
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { staticBuild, serveStatic, storyUrl, STORY_READY, componentOf } from './storybook-stories.mjs';
import { OUT_DIR } from './names.mjs';

export const DOCS_FILE = `${OUT_DIR}/storybook-docs.json`;
// A name as code and Storybook both might write it: "is-disabled", "isDisabled" and "disabled" read alike.
const key = (s) => String(s ?? '').replace(/#.*$/, '').toLowerCase().replace(/[^a-z0-9]/g, '');

// ── In the page ───────────────────────────────────────────────────────────────
// Each story file once (the first story of each is enough to load it), read as written: its meta (title, argTypes,
// parameters, tags) and each story's name, args, tags and description. Only plain values leave the page: a function, an
// element or a component passed in is content, not words. → { [title]: { file, description, tags, argTypes, stories } }
export function csfExpression(ids = []) {
  return `(async () => {
  const p = window.__STORYBOOK_PREVIEW__, s = p && p.storyStoreValue;
  if (!s || typeof s.loadCSFFileByStoryId !== 'function') return null;
  const plain = (v, d = 0) => {
    if (v === null || ['string', 'number', 'boolean'].includes(typeof v)) return v;
    if (d > 3 || typeof v !== 'object') return undefined;
    if (Array.isArray(v)) { const a = v.map((x) => plain(x, d + 1)); return a.every((x) => x !== undefined) ? a : undefined; }
    if (Object.getPrototypeOf(v) !== Object.prototype) return undefined;
    // The args themselves keep what is plain, and a value inside them that holds anything else is content as a whole.
    const o = {}; for (const [k, x] of Object.entries(v)) { const y = plain(x, d + 1); if (y === undefined) { if (d) return undefined; continue; } o[k] = y; } return o;
  };
  const text = (v) => (typeof v === 'string' && v.trim() ? v.trim() : null);
  const argType = (a) => {
    if (!a || typeof a !== 'object') return null;
    const d = a.table && a.table.defaultValue && a.table.defaultValue.summary;
    const options = Array.isArray(a.options) ? plain(a.options) : null;
    const out = { description: text(a.description), options: options || null, default: d !== undefined && d !== null ? plain(d) ?? null : a.defaultValue !== undefined ? plain(a.defaultValue) ?? null : null };
    return out.description || out.options || out.default !== null ? out : null;
  };
  const out = {}, seen = new Set();
  for (const id of ${JSON.stringify(ids)}) {
    let f; try { f = await s.loadCSFFileByStoryId(id); } catch (e) { continue; }
    const m = f && f.meta; if (!m || seen.has(m.id)) continue;
    seen.add(m.id);
    const docs = (m.parameters && m.parameters.docs) || {};
    const argTypes = {};
    for (const [n, a] of Object.entries(m.argTypes || {})) { const r = argType(a); if (r) argTypes[n] = r; }
    out[m.title] = {
      file: (m.parameters && m.parameters.fileName) || null,
      description: text(docs.description && docs.description.component),
      tags: Array.isArray(m.tags) ? m.tags.filter((t) => typeof t === 'string') : [],
      argTypes,
      stories: Object.values(f.stories || {}).map((st) => {
        const sd = st.parameters && st.parameters.docs && st.parameters.docs.description;
        const own = {}; for (const [n, a] of Object.entries(st.argTypes || {})) { const r = argType(a); if (r) own[n] = r; }
        return { id: st.id, name: st.name, args: plain(st.args || {}) || {}, tags: Array.isArray(st.tags) ? st.tags.filter((t) => typeof t === 'string') : [], description: text(sd && sd.story), ...(Object.keys(own).length ? { argTypes: own } : {}) };
      }),
    };
  }
  return out;
})()`;
}

// ── A static build, read in Chrome ────────────────────────────────────────────
// The stories in the index's order, the first of each story file opened once: the page Storybook draws for one story
// holds the whole store. → { at, titles: { [title]: … } } | null when no Chrome, no story, or a Storybook older than 7.
export async function readStoryFiles(dir, { chromePath = null } = {}) {
  let index = null;
  for (const f of ['index.json', 'stories.json']) { try { index = JSON.parse(readFileSync(join(dir, f), 'utf8')); break; } catch { /* the other */ } }
  const entries = Object.values(index?.entries ?? index?.stories ?? {}).filter((e) => (e?.type ?? 'story') === 'story' && e?.id);
  if (!entries.length) return null;
  const firstOf = new Map();
  for (const e of entries) { const k = e.importPath ?? e.title ?? e.kind; if (!firstOf.has(k)) firstOf.set(k, e.id); }
  const { findChrome, launchChrome, connectCDP, openPage, waitForTrue } = await import('./cdp.mjs');
  const path = chromePath ?? findChrome({ playwright: true });
  if (!path || typeof WebSocket === 'undefined') return null;
  const server = await serveStatic(dir).catch(() => null);
  if (!server) return null;
  let chrome = null, cdp = null;
  try {
    chrome = await launchChrome(path, { tmpPrefix: 'storybook-docs-' });
    cdp = await connectCDP(chrome.wsUrl);
    const { sessionId } = await openPage(cdp.send, storyUrl(server.url, entries[0].id));
    const ok = await waitForTrue(cdp.send, sessionId, `document.readyState === 'complete' && (${STORY_READY})`, { attempts: 1200, intervalMs: 50, tolerateErrors: true });
    if (!ok) return null;
    const r = await cdp.send('Runtime.evaluate', { expression: csfExpression([...firstOf.values()]), awaitPromise: true, returnByValue: true }, sessionId);
    const titles = r?.result?.value ?? null;
    // Each file's stories in the index's order, which is the order the file exports them: the store keeps them by id.
    const rank = new Map(entries.map((e, i) => [e.id, i]));
    for (const t of Object.values(titles ?? {})) t.stories.sort((x, y) => (rank.get(x.id) ?? 1e9) - (rank.get(y.id) ?? 1e9));
    return titles ? { at: new Date().toISOString(), titles } : null;
  } catch { return null; }
  finally { try { cdp?.close(); } catch { /* gone */ } chrome?.kill(); await server.close(); }
}

// What says the build changed: its index and its page, which names every script the build wrote.
export function buildHash(dir) {
  const h = createHash('sha256');
  for (const f of ['index.json', 'stories.json', 'iframe.html']) { try { h.update(f).update(readFileSync(join(dir, f))); } catch { /* not in this build */ } }
  return h.digest('hex').slice(0, 16);
}

// The reading, kept on the build: read again only when the Storybook was built again. offline: never open a browser,
// only what an earlier run kept for this very build. A project can switch it off (ds-config.json → storybook.docs: false).
// → { at, build, titles } | null
export async function storybookDocs(ROOT, cfg = {}, { chromePath = null, offline = false } = {}) {
  if (cfg.storybook?.docs === false) return null;
  const dir = staticBuild(ROOT, cfg);
  if (!dir) return null;
  const build = buildHash(dir), file = resolve(ROOT, DOCS_FILE);
  try { const kept = JSON.parse(readFileSync(file, 'utf8')); if (kept?.build === build) return kept; } catch { /* none kept */ }
  if (offline) return null;
  const read = await readStoryFiles(dir, { chromePath });
  if (!read) return null;
  const out = { at: read.at, build, titles: read.titles };
  try { mkdirSync(dirname(file), { recursive: true }); writeFileSync(file, JSON.stringify(out, null, 2) + '\n'); } catch { /* used, unsaved */ }
  return out;
}

// One component's, under its name however the stories title it ("Components/Forms/Field" is Field, and field reads it).
// → { title, file, description, tags, argTypes, stories } | null
export function docsFor(name, reading) {
  const hit = Object.entries(reading?.titles ?? {}).find(([t]) => key(componentOf({ title: t })) === key(name));
  return hit ? { title: hit[0], ...hit[1] } : null;
}

// ── Into the contract ─────────────────────────────────────────────────────────
// A tag Storybook gives a component that is a status the contract knows: deprecated, or experimental (beta is one).
export function statusFromTags(tags = []) {
  const t = new Set((tags ?? []).map((x) => String(x).toLowerCase()));
  if (t.has('deprecated')) return { state: 'deprecated', source: 'storybook' };
  if (t.has('experimental') || t.has('beta') || t.has('alpha')) return { state: 'experimental', source: 'storybook' };
  return null;
}

const same = (a, b) => key(a) === key(b);
const shown = (v) => (Array.isArray(v) ? v.join(', ') : String(v));
const strip = (s) => String(s).replace(/#.*$/, '');
// A default read as text in one place and as a value in another ("'Small'", 'Small', false, "false") is the same default.
const unquote = (v) => String(v ?? '').trim().replace(/^(['"`])(.*)\1$/, '$2');

// What the contract says of a component's stories. codeProps: the code's props (structure-capture's api.props, by name:
// { type, options, default }). figmaProps: the props snapshot's properties. A prop the stories describe is matched to the
// code's by its name; where they disagree it is said, the code's side and Figma's beside Storybook's:
//   • a prop described that the code does not have (code props known);
//   • an option one side lists and the other does not;
//   • a default that differs.
// → { from, title, description?, tags?, props: [{ name, description?, options?, default? }], examples: [{ name, args, description?, tags? }], differs: [{ prop, what, storybook, code?, figma? }] }
export function storybookPart(docs, { codeProps = null, figmaProps = null } = {}) {
  if (!docs) return null;
  const code = codeProps && Object.keys(codeProps).length ? codeProps : null;
  const figma = Object.fromEntries(Object.entries(figmaProps ?? {}).map(([k, v]) => [strip(k), v]));
  const find = (obj, name) => (obj ? Object.entries(obj).find(([k]) => same(k, name) || same(k, String(name).replace(/^is(?=[A-Z])/, ''))) : null);
  const props = [], differs = [];
  for (const [name, a] of Object.entries(docs.argTypes ?? {})) {
    props.push({ name, ...(a.description ? { description: a.description } : {}), ...(a.options ? { options: a.options } : {}), ...(a.default != null ? { default: a.default } : {}) });
    const c = find(code, name), f = find(figma, name);
    if (code && !c) { differs.push({ prop: name, what: 'not in the code', storybook: a.description ?? (a.options ? shown(a.options) : 'described') }); continue; }
    const fOpts = f?.[1]?.type === 'VARIANT' ? f[1].variantOptions ?? null : null;
    for (const [side, opts] of [['code', c?.[1]?.options ?? null], ['figma', fOpts]]) {
      if (!a.options || !Array.isArray(opts) || !opts.length) continue;
      const onlySb = a.options.filter((o) => !opts.some((x) => same(x, o))), onlyOther = opts.filter((o) => !a.options.some((x) => same(x, o)));
      if (onlySb.length) differs.push({ prop: name, what: `options ${side === 'code' ? 'the code' : 'Figma'} does not have`, storybook: shown(onlySb), [side]: shown(opts) });
      if (onlyOther.length) differs.push({ prop: name, what: `options Storybook does not list`, storybook: shown(a.options), [side]: shown(onlyOther) });
    }
    const cDef = c?.[1]?.default, fDef = f?.[1]?.defaultValue;
    if (a.default != null && cDef != null && unquote(a.default) !== unquote(cDef)) differs.push({ prop: name, what: 'a different default', storybook: unquote(a.default), code: unquote(cDef) });
    else if (a.default != null && cDef == null && fDef != null && !same(unquote(a.default), fDef)) differs.push({ prop: name, what: 'a different default', storybook: unquote(a.default), figma: String(fDef) });
  }
  const examples = (docs.stories ?? []).map((s) => ({ name: s.name, args: s.args ?? {}, ...(s.description ? { description: s.description } : {}), ...(s.tags?.length ? { tags: s.tags } : {}) }));
  return {
    from: docs.file ? String(docs.file).replace(/^\.\//, '') : docs.title,
    title: docs.title,
    ...(docs.description ? { description: docs.description } : {}),
    ...(docs.tags?.length ? { tags: docs.tags } : {}),
    props, examples, differs,
  };
}

// What the run says, one line a disagreement. rows: [{ component, differs }] → [line]
export function differLines(rows = []) {
  const side = (d) => [d.code != null ? `the code has ${d.code}` : null, d.figma != null ? `Figma has ${d.figma}` : null].filter(Boolean).join(' and ');
  return rows.flatMap((r) => (r.differs ?? []).map((d) => `⚠️  [storybook] ${r.component}: ${d.prop}, ${d.what} (Storybook says ${d.storybook}${side(d) ? `, ${side(d)}` : ''}). Change the story or the code so they say the same.`));
}

// ── Into the guidelines ───────────────────────────────────────────────────────
// A story as the guidelines show an example: the component's tag with the story's args, in the code's own syntax, only
// the props the contract has. The story is the team's own example, so its words stay. → { code, lang, story, file } | null
export function storyExample(contract, example) {
  const sx = contract?.source?.code?.syntax ?? null;
  const lang = { vue: 'vue', svelte: 'svelte', jsx: 'jsx', html: 'html' }[sx];
  if (!lang || !example) return null;
  const tag = contract?.source?.code?.tag ?? String(contract?.name ?? '').replace(/(^|[-/\s])([a-z])/g, (_, __, c) => c.toUpperCase());
  if (!/^[A-Za-z][\w.:-]*$/.test(tag)) return null;
  const known = [...(contract.props ?? []).map((p) => p.bindings?.code?.prop ?? p.name), ...(contract.codeOnly ?? []).map((p) => p.name)];
  const parts = [];
  for (const [arg, v] of Object.entries(example.args ?? {})) {
    const prop = known.find((k) => same(k, arg)) ?? known.find((k) => same(String(k).replace(/^is(?=[A-Z])/, ''), arg)) ?? null;
    if (!prop || v === null || v === undefined || typeof v === 'object') continue;
    const attr = sx === 'html' || sx === 'vue' ? prop.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase() : prop;
    if (typeof v === 'string') parts.push(`${attr}="${v.replace(/"/g, '&quot;')}"`);
    else if (v === true && sx !== 'vue') parts.push(attr);
    else if (v === false && sx === 'html') continue;
    else parts.push(sx === 'vue' ? `:${attr}="${v}"` : `${attr}={${v}}`);
  }
  return { code: `<${tag}${parts.map((p) => ' ' + p).join('')} />`, lang, story: example.name, file: contract.storybook?.from ?? null };
}
