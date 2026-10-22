// intent-layer.mjs - the team's written documentation of the system (why each piece exists and how it is meant to be
// used), from every documentation source a project names, matched to the system's components, and what of it reaches
// the agents.
//
// A documentation source is an adapter (SOURCES below): { id, label, configKey, configured(cfg), read(ROOT, cfg),
// sync(ROOT, cfg, opts), describe(result) }. sync reads the source where it lives (read-only) into a snapshot in the
// project; read returns that snapshot: { _source: { id, label, url, ... }, system, boilerplate, entities }, each entity
// { kind, layer, name, id, status, file, url, code, purpose[], whenToUse[], whenNotToUse[], mistakes[], limitations[],
// rules[{ text, level }], sections[{ title, text }], facts[], repeated }. Everything below, and every reader of it
// (intent-gen, contract-gen, prototype-context, the style guide, the guidance rating), takes only that shape, so
// another source (another documentation format, a design tool's own specs) is one adapter added to SOURCES, nothing
// else changed. The first: DSDS pages in a GitLab project (doc-source-dsds.mjs).

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { codeSnapshotPath } from './names.mjs';
import { codeComponents } from './component-source.mjs';
import * as dsds from './doc-source-dsds.mjs';

// The DSDS adapter's own parts, for the tests and the callers that read DSDS directly.
export const { DEFAULT_OUT, intentLayerConfig, layerOf, keyOfTitle, itemsOf, entityView, readDsds, dropBoilerplate, syncIntentLayer, fileUrl } = dsds;

const norm = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');

// ── The documentation sources ───────────────────────────────────────────────────────────────────────────────────────
// In this order: where two sources document the same component, the first one's page is its own.
export const SOURCES = [dsds.source];
// Another adapter, at the end (or first: { first: true }). Returns a function that takes it out again.
export function addSource(adapter, { first = false } = {}) {
  if (first) SOURCES.unshift(adapter); else SOURCES.push(adapter);
  return () => { const i = SOURCES.indexOf(adapter); if (i >= 0) SOURCES.splice(i, 1); };
}
export const configuredSources = (cfg) => SOURCES.filter((s) => { try { return s.configured(cfg); } catch { return false; } });

// Every configured source read again where it lives (each says when nothing moved). → [{ source, result, line }]
export async function syncSources(ROOT, cfg, opts = {}) {
  const out = [];
  for (const s of configuredSources(cfg)) {
    let result; try { result = await s.sync(ROOT, cfg, opts); } catch (e) { result = { error: e.message }; }
    out.push({ source: s, result, line: s.describe ? s.describe(result) : '' });
  }
  return out;
}

// Every configured source's snapshot as one: each entity keeps its source ({ id, label, url, ref }), and a link of its
// own when its source gives one. null when no source has a snapshot.
export function readIntentLayer(ROOT, cfg) {
  const snaps = [];
  for (const s of configuredSources(cfg)) { let x = null; try { x = s.read(ROOT, cfg); } catch { /* unreadable */ } if (x?.entities) snaps.push({ s, x }); }
  if (!snaps.length) return null;
  const src = (s, x) => ({ id: s.id, label: s.label, ...(x._source ?? {}) });
  const first = src(snaps[0].s, snaps[0].x);
  return {
    _source: first,
    _sources: snaps.map(({ s, x }) => src(s, x)),
    system: snaps.find(({ x }) => x.system)?.x.system ?? null,
    boilerplate: snaps.reduce((t, { x }) => t + (x.boilerplate ?? 0), 0),
    entities: snaps.flatMap(({ s, x }) => x.entities.map((e) => ({ ...e, source: src(s, x), url: e.url ?? dsds.fileUrl(x._source, e.file) }))),
    // The component contracts kept beside the layer (shared-contracts.mjs): their links and what each lists.
    contracts: snaps.flatMap(({ x }) => x.contracts ?? []),
  };
}

// ── Matching entities to the system's components ────────────────────────────────────────────────────────────────────
// By name (its words, case and spacing aside: "Button Main" is buttonMain), by identifier without its kind
// ("component-button-primary"), else by the code file the entity names and the engine found for the component.
// names: the components; codeFiles: { name: file }. → Map(name → entity)
export function matchComponents(names, entities, codeFiles = {}) {
  const comps = entities.filter((e) => e.layer === 'components');
  const byName = new Map(), byCode = new Map();
  for (const e of comps) {
    for (const k of [norm(e.name), norm(String(e.id ?? '').replace(/^(component|element)[-_:]?/i, ''))]) if (k && !byName.has(k)) byName.set(k, e);
    if (e.code) byCode.set(e.code.replace(/^\.?\//, ''), e);
  }
  const out = new Map();
  for (const name of names) {
    let e = byName.get(norm(name));
    const file = codeFiles[name] ? String(codeFiles[name]).replace(/^\.?\//, '') : null;
    if (!e && file) e = byCode.get(file) ?? [...byCode].find(([p]) => file.endsWith('/' + p) || p.endsWith('/' + file))?.[1];
    if (e) out.set(name, e);
  }
  return out;
}

// The components the agents get, as the design intent has them: Figma's (its structure snapshot), else, with no
// Figma data, the code's own. Read from the sources, never from a saved design-intent.json that may not be there.
// Where those names come from, said in the advice: 'Figma', or 'the code' for a system with no Figma data.
export function namesFrom(ROOT, cfg = {}) {
  try { if (Object.keys(JSON.parse(readFileSync(resolve(ROOT, cfg.paths?.snapshotStructure || 'figma-structure.snapshot.json'), 'utf8'))?.components ?? {}).length) return 'Figma'; } catch { /* none */ }
  return 'the code';
}
export function systemNames(ROOT, cfg = {}) {
  try {
    const s = JSON.parse(readFileSync(resolve(ROOT, cfg.paths?.snapshotStructure || 'figma-structure.snapshot.json'), 'utf8'));
    const names = Object.keys(s?.components ?? {}).filter((n) => !/^[_.]/.test(n));
    if (names.length) return names;
  } catch { /* no Figma data */ }
  try { return codeComponents(ROOT, cfg).map((k) => k.name); } catch { return []; }
}

// The code file of each component the engine knows: ds-config.json → componentFiles, then the code capture's.
export function codeFilesOf(ROOT, cfg = {}) {
  const out = {};
  try {
    const snap = JSON.parse(readFileSync(resolve(ROOT, codeSnapshotPath(cfg)), 'utf8'));
    for (const [n, a] of Object.entries(snap?.api ?? {})) if (a?.file) out[n] = a.file;
  } catch { /* no code capture yet */ }
  for (const [n, f] of Object.entries(cfg?.componentFiles ?? {})) if (typeof f === 'string') out[n] = f;
  // The components the code has, by their files (a project with no code capture, or no Figma).
  try { for (const k of codeComponents(ROOT, cfg)) out[k.name] ??= k.file; } catch { /* no code read */ }
  return out;
}

// What a component carries from the layer, for the design intent, the contracts and the style guide. wrong: what the
// content check found on its page (intent-truth.mjs): the lines it says are wrong are left out, and it is listed.
export function componentIntent(e, src, wrong = []) {
  const bad = new Set(wrong.filter((f) => (f.kind === 'name' || f.kind === 'claim') && f.line).map((f) => norm(f.line)));
  const ok = (t) => !bad.size || ![...bad].some((b) => b && norm(t).includes(b));
  if (bad.size) e = { ...e, purpose: e.purpose.filter(ok), whenToUse: e.whenToUse.filter(ok), whenNotToUse: e.whenNotToUse.filter(ok), mistakes: e.mistakes.filter(ok), limitations: e.limitations.filter(ok), rules: e.rules.filter((r) => ok(r.text ?? r)), sections: e.sections.filter((x) => ok(x.text)) };
  const list = (a) => (a.length ? a : null);
  return {
    ...(wrong.length ? { wrong: wrong.map(({ kind, where, line, truth, fix }) => ({ kind, where, line, truth, fix })) } : {}),
    name: e.name, file: e.file, url: e.url ?? fileUrl(src, e.file), status: e.status ?? null, source: e.source?.label ?? src?.label ?? 'the intent layer',
    purpose: e.purpose[0] ?? null, whenToUse: list(e.whenToUse), whenNotToUse: list(e.whenNotToUse),
    mistakes: list(e.mistakes), limitations: list(e.limitations),
    rules: list(e.rules.map((r) => (r.level ? `${r.text} (${r.level})` : r.text))),
    sections: list(e.sections),
    // What was left out of its page: the sections that are facts (by title), the lines repeated on every page.
    facts: list(e.facts ?? []), repeated: e.repeated ?? 0,
  };
}

// Each component's page as text the guidance rating reads ("When to use: …" lines), so a component documented only in
// the intent layer is rated on it. names: the components; → { name: text }
export function intentWords(snap, names, codeFiles = {}) {
  const out = {};
  if (!snap) return out;
  for (const [name, e] of matchComponents(names, snap.entities, codeFiles)) {
    const lines = [...e.purpose.slice(0, 1), ...e.whenToUse.map((x) => `When to use: ${x}`), ...e.whenNotToUse.map((x) => `When not to use: ${x}`),
      ...e.mistakes.map((x) => `Common mistake: ${x}`), ...e.limitations.map((x) => `Limitation: ${x}`), ...e.rules.map((r) => r.text), ...e.sections.map((x) => `${x.title}: ${x.text}`)];
    if (lines.length) out[name] = lines.join('\n');
  }
  return out;
}

// One line of an index: its first sentence, at most n characters.
export function short(text, n = 160) {
  const t = String(text ?? '').replace(/\s+/g, ' ').trim();
  const first = /^(.+?[.!?])(\s|$)/.exec(t)?.[1] ?? t;
  return first.length > n ? first.slice(0, n - 1).replace(/\s+\S*$/, '') + '…' : first;
}

// The pages that are not components, for llms.txt: { name, kind, layer, purpose }.
export function layerPages(snap) {
  return (snap?.entities ?? []).filter((e) => e.layer !== 'components').map((e) => ({ name: e.name, kind: e.kind, layer: e.layer, purpose: e.purpose[0] ?? null }));
}

// ── What reaches the agents ─────────────────────────────────────────────────────────────────────────────────────────
// Where each kind of line of a page goes, as the readers above and in contract-gen, prototype-context and the style
// guide take it. The usage report below is built from this table, so it says what is true of the readers.
export const REACH = {
  components: {
    purpose: ['its contract', 'llms.txt (when Figma has no description)', 'the prototype context', 'its documentation in the style guide'],
    whenToUse: ['its contract', 'the prototype context', 'its documentation in the style guide'],
    whenNotToUse: ['its contract', 'llms.txt (the first line)', 'the prototype context and its checks', 'its documentation in the style guide'],
    mistakes: ['its contract', 'the prototype context', 'its documentation in the style guide'],
    limitations: ['its contract', 'the prototype context', 'its documentation in the style guide'],
    rules: ['its contract', 'the prototype context', 'its documentation in the style guide'],
  },
  other: {
    purpose: ['llms.txt', 'the prototype context'],
    whenToUse: ['the prototype context'],
    whenNotToUse: ['the prototype context'],
    mistakes: ['the prototype context'],
    limitations: ['the prototype context'],
    rules: ['the prototype context'],
    sections: ['the prototype context (when a request matches it)'],
  },
};
// Why a part of a page does not reach the agents, what to do so it does, and whether to remove it (and what it is
// still for when it stays). One entry per reason; the usage report and the style guide say them as written here.
export const NOT_USED = {
  noComponent: {
    why: 'Its name matches no component of the system, nor does the code file it names, so the engine cannot tell which component it is about.',
    fix: 'Name the page as the system names the component (Figma\'s name, or the code\'s with no Figma file), or point it at the component\'s code file.',
    remove: 'Only if the component no longer exists. Otherwise keep it: once it is named, the whole page reaches the agents.',
  },
  unknownTitle: {
    why: 'The engine sorts a component page by the title of each section, and this title is not one it knows, so no agent is given it.',
    fix: 'If it tells someone when or how to use the component, title it Intent, When to use, When not to use, Common mistakes or Limitations.',
    remove: 'No. It stays on the page for people and in design-intent.json, which a person or an agent can open.',
  },
  noReader: {
    why: 'No agent reads this kind of line on a page of this layer yet.',
    fix: 'Nothing on the page: the engine would have to learn to read it.',
    remove: 'No. It stays on the page for people.',
  },
  morePurpose: {
    why: 'Only the first line of what it is for is read: it is the one-line summary agents see.',
    fix: 'Put the sentence that matters most first.',
    remove: 'No. The rest stays on the page for people.',
  },
  facts: {
    why: 'The engine reads these from Figma and the code themselves, which are the source; a copy here is not read so that it can never contradict them.',
    fix: 'Nothing: agents get them from the contracts, built from Figma and the code.',
    remove: 'Yes, unless a script writes them from the code on every change: a copy written by hand goes out of date.',
  },
  repeated: {
    why: 'The same sentence is on every page of its kind with only the name changed, so it says nothing about this one.',
    fix: 'Write what is true of this piece only (when to use it, what not to do with it), or leave it out.',
    remove: 'Yes: change whatever writes it on every page.',
  },
};
const notUsedItem = (what, reason) => ({ what, reason, ...NOT_USED[reason] });

const KIND_WORDS = { purpose: 'what it is for', whenToUse: 'when to use', whenNotToUse: 'when not to use', mistakes: 'common mistakes', limitations: 'limitations', rules: 'rules', sections: 'other sections' };

// For every page of the layer: what the agents get from it and where, what they do not get (why, what to do so they
// do, whether to remove it: NOT_USED), and a verdict.
//   used:     what it is for and when (or when not) to use it reach the agents
//   thin:     some of it reaches them, but not what it is for together with when to use it
//   not used: nothing of it reaches them
// matched: Map(component → entity) from matchComponents. → { pages: [...], counts: { used, thin, notUsed } }
// opts: { names: the system's components, codeExists(file): is that code file in the project }.
// wrongOf(entity) → [finding]: what on the page the system contradicts (intent-truth.mjs → checkedLayer).
export function useReport(snap, matched = new Map(), { names = [], codeExists = null, from = 'Figma', wrongOf = () => [] } = {}) {
  const forEntity = new Map([...matched].map(([n, e]) => [e, n]));
  const pages = [];
  for (const e of snap?.entities ?? []) {
    const comp = e.layer === 'components';
    const component = forEntity.get(e) ?? null;
    const reach = comp ? REACH.components : REACH.other;
    const gets = [], notUsed = [];
    if (comp && !component) {
      notUsed.push({ what: 'the whole page', ...orphanAdvice(e, { entities: snap.entities, forEntity, names, codeExists, from }) });
    } else {
      for (const k of ['purpose', 'whenToUse', 'whenNotToUse', 'mistakes', 'limitations', 'rules']) {
        const n = (e[k] ?? []).length; if (!n) continue;
        const to = reach[k];
        // Only the first line of what it is for is read.
        const lines = k === 'purpose' ? 1 : n;
        if (to) gets.push({ what: KIND_WORDS[k], lines, to });
        else notUsed.push(notUsedItem(`${KIND_WORDS[k]} (${n} line${n === 1 ? '' : 's'})`, 'noReader'));
        if (k === 'purpose' && n > 1) notUsed.push(notUsedItem(`${n - 1} more line${n === 2 ? '' : 's'} of what it is for`, 'morePurpose'));
      }
    }
    if (e.sections?.length && reach.sections && !(comp && !component)) gets.push({ what: `${KIND_WORDS.sections} (${e.sections.map((x) => x.title).slice(0, 4).join(', ')}${e.sections.length > 4 ? ', …' : ''})`, lines: e.sections.length, to: reach.sections });
    else if (e.sections?.length) notUsed.push(notUsedItem(`${e.sections.length} section${e.sections.length === 1 ? '' : 's'} (${e.sections.map((x) => x.title).slice(0, 4).join(', ')}${e.sections.length > 4 ? ', …' : ''})`, 'unknownTitle'));
    if (e.facts?.length) notUsed.push(notUsedItem(e.facts.join(', '), 'facts'));
    if (e.repeated) notUsed.push(notUsedItem(`${e.repeated} repeated line${e.repeated === 1 ? '' : 's'}`, 'repeated'));
    // A page that names no component: nothing else on it matters until it is named.
    if (comp && !component) notUsed.splice(1);
    const has = (k) => gets.some((g) => g.what.startsWith(KIND_WORDS[k]));
    // A component's page is used when it says what the piece is for and when (or when not) to use it; a token's when it
    // says what it is for (that one line is all a token's page has to say); any other page when it says what it is for
    // and gives a rule or a section to compose by.
    const how = has('whenToUse') || has('whenNotToUse') || (!comp && (e.kind === 'token' || has('rules') || has('sections') || has('mistakes')));
    const verdict = !gets.length ? 'not used' : has('purpose') && how ? 'used' : 'thin';
    const wrong = wrongOf(e) ?? [];
    const page = { name: e.name, kind: e.kind, layer: e.layer, file: e.file, url: e.url ?? fileUrl(snap._source, e.file), source: e.source?.label ?? null, component, verdict, gets, notUsed, ...(e.code ? { code: e.code } : {}), ...(e.updatedAt ? { updatedAt: e.updatedAt } : {}), ...(wrong.length ? { wrong } : {}) };
    Object.assign(page, decide(page, e, { comp, has }));
    pages.push(page);
  }
  const counts = { used: 0, thin: 0, notUsed: 0 };
  for (const p of pages) counts[p.verdict === 'used' ? 'used' : p.verdict === 'thin' ? 'thin' : 'notUsed']++;
  const actions = Object.fromEntries(ACTIONS.map(([k]) => [k, pages.filter((p) => p.action === k).length]));
  return { pages, counts, actions };
}

// ── One decision per page, and the changes it takes ─────────────────────────────────────────────────────────────────
// What the team does with each page, most urgent first, in one word (its row says each change): [key, the decision].
export const ACTIONS = [
  ['delete', 'Delete'], ['move', 'Move'], ['rename', 'Rename'], ['name', 'Name'],
  ['fix', 'Fix'], ['write', 'Write'], ['improve', 'Improve'], ['keep', 'Keep'],
];
const ORPHAN_ACTION = { emptyPage: 'delete', codeGone: 'delete', partSaid: 'delete', copy: 'delete', subPartAlone: 'delete', part: 'move', subPart: 'move', rename: 'rename', noComponent: 'name' };
// → { action, decision, todo: [each change, as an instruction] }
function decide(page, e, { comp, has }) {
  const label = (k) => ACTIONS.find(([x]) => x === k)[1];
  if (comp && !page.component) {
    const o = page.notUsed[0];
    const action = ORPHAN_ACTION[o.reason] ?? 'name';
    return { action, decision: label(action), todo: [o.fix] };
  }
  const todo = [];
  if (!has('purpose')) todo.push(comp ? 'Add what it is for, as an Intent or Overview section.' : 'Add what it is for, as an Overview section.');
  if (comp && !has('whenToUse') && !has('whenNotToUse')) todo.push('Add when to use it and when not to, as sections with those titles.');
  // Any other page that says what it is for but not how to compose by it: what to add (never Improve with nothing to do).
  if (!comp && page.verdict === 'thin' && has('purpose')) todo.push('Add how to use it: When to use, When not to use, Common mistakes or a rule, as sections with those titles.');
  for (const n of page.notUsed) {
    if (n.reason === 'unknownTitle') todo.push(`Retitle ${n.what.replace(/^\d+ sections? \((.*)\)$/, '$1')} as When to use, When not to use, Common mistakes or Limitations where they say how to use it; leave the rest as they are, for people.`);
    if (n.reason === 'facts') todo.push(`Remove ${n.what}: the engine reads them from Figma and the code, and a copy here goes out of date.`);
    if (n.reason === 'repeated') todo.push(`Remove the ${n.what.replace(/ repeated lines?$/, '')} lines written on every page alike, in whatever writes them.`);
    if (n.reason === 'morePurpose') todo.push('Put the sentence that matters most first in what it is for: agents read that one.');
  }
  // What on it the system contradicts, first: fix it before anything is added to it.
  const fix = (page.wrong ?? []).map((f) => (f.kind === 'name' || f.kind === 'claim' ? `${f.says}: ${f.fix}` : f.fix));
  if (fix.length) return { action: 'fix', decision: label('fix'), todo: [...fix, ...todo] };
  // A page that exists and says something: one decision, improve it, its changes listed one by one (what to add,
  // retitle or remove); keep it only when there is nothing to change.
  const action = page.verdict === 'not used' ? 'write' : todo.length || page.verdict === 'thin' ? 'improve' : 'keep';
  return { action, decision: label(action), todo };
}


// ── A page that names no component: what to do with it ──────────────────────────────────────────────────────────────
// One decision, said plainly, from what the page is: nothing of its own once filler and facts are out (delete it); the
// page of a code file that is gone (delete it); a component's name with a generic word added, for a component no page
// documents yet (rename it); the page of a part of a component that has its own page (fold it into that page, or
// delete it when that page already says it); the same words as a component's page (delete it); else name it as Figma
// does, or add the component to Figma. A decision is said only when the page shows it; else the plain one.
const linesOf = (e) => [...e.purpose, ...e.whenToUse, ...e.whenNotToUse, ...e.mistakes, ...e.limitations, ...e.rules.map((r) => r.text ?? r), ...e.sections.map((x) => `${x.title}: ${x.text}`)]
  .map((t) => String(t).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()).filter(Boolean);
const wordsOfName = (n) => String(n ?? '').replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
const shares = (a, b) => { const B = new Set(b); return a.length ? a.filter((x) => B.has(x)).length / a.length : 0; };
const pageOf = (x) => `${x.name} (${x.file})`;
// from: where the system's component names come from ('Figma', or 'the code' with no Figma data), as the advice says it.
export function orphanAdvice(e, { entities = [], forEntity = new Map(), names = [], codeExists = null, from = 'Figma' } = {}) {
  const say = (reason, why, fix, remove) => ({ reason, why, fix, remove });
  const mine = linesOf(e);
  if (!mine.length) return say('emptyPage', 'It names no component of the system and, once the lines written on every page alike and the facts the engine reads from Figma and the code are left out, says nothing of its own.',
    'Delete this page.', 'Yes.');
  if (e.code && codeExists && !codeExists(e.code)) return say('codeGone', `It is the page of ${e.code}, which is no longer in the code.`, 'Delete this page.', 'Yes.');
  const dir = (f) => String(f ?? '').split('/').slice(0, -1).join('/');
  const others = entities.filter((x) => x !== e && x.layer === 'components');
  const twins = others.filter((x) => !forEntity.has(x) && shares(mine, linesOf(x)) >= 0.8).map((x) => x.name);
  const twinNote = twins.length ? ` The same text is on ${twins.length === 1 ? twins[0] : `${twins.length} other pages (${twins.slice(0, 3).join(', ')}${twins.length > 3 ? ', …' : ''})`} too.` : '';
  // A component's name with a generic word added ("Panel General" for panel), for a component no page documents
  // yet: the same component, under another name. Only one such component, or none is said.
  const documented = new Set(forEntity.values());
  const GENERIC = /^(general|generic|base|default|main|standard|component|basic|primary)$/;
  const pageKey = norm(e.name);
  const close = names.filter((n) => !documented.has(n) && norm(n).length >= 4 && pageKey.includes(norm(n)))
    .filter((n) => wordsOfName(e.name).filter((w) => !norm(n).includes(w)).every((w) => GENERIC.test(w)));
  if (close.length === 1) {
    const target = close[0];
    // A part of another component (table/Header is table's): not one agents place on its own, so no page of its own.
    // What it says goes on its parent's page when that page exists (or is this layer's, under another name); else it
    // is deleted.
    if (target.includes('/')) {
      const parentName = target.split('/')[0];
      const parentPage = [...forEntity].find(([, n]) => n === parentName)?.[0]
        ?? others.find((x) => !forEntity.has(x) && norm(x.name).includes(norm(parentName)) && wordsOfName(x.name).filter((w) => !norm(parentName).includes(w)).every((w) => GENERIC.test(w)));
      return parentPage
        ? say('subPart', `It is about ${target}, a part of ${parentName}, not a component agents place on its own.${twinNote}`, `Move what is true of ${target} and not yet on ${pageOf(parentPage)} there (under When to use, When not to use, Limitations…), then delete this page.`, 'Yes, once that is moved.')
        : say('subPartAlone', `It is about ${target}, a part of ${parentName}, not a component agents place on its own, and no page documents ${parentName}.${twinNote}`, 'Delete this page, or, if what it says matters, make it the page of ' + parentName + ' first.', 'Yes.');
    }
    return say('rename', `It names no component of the system as ${from} names it; ${target} is that component, under its own name, and no page documents ${target} yet.${twinNote}`, `Rename this page to ${target}, the component's name in ${from}.`, 'No.');
  }
  // A part of a component: its code file beside that component's, and its name (or its file's) holding the component's
  // name (PointListItem beside pointList). Its page belongs in that component's page.
  const ownKey = [norm(e.name), norm(String(e.code ?? '').split('/').pop().replace(/\.[^.]+$/, ''))];
  const parent = e.code ? others.filter((x) => forEntity.has(x) && x.code && dir(x.code) === dir(e.code))
    .filter((x) => { const k = norm(forEntity.get(x).split('/').pop()); return k.length >= 4 && ownKey.some((o) => o !== k && o.includes(k)); })
    .sort((a, b) => forEntity.get(b).length - forEntity.get(a).length)[0] : null;
  if (parent) {
    const said = shares(mine, linesOf(parent));
    const short = e.code.split('/').pop();
    return said >= 0.8
      ? say('partSaid', `${short} is a part of ${forEntity.get(parent)} (its file is beside it), not a component of its own in ${from}, and its page already says what this one says.${twinNote}`, 'Delete this page.', 'Yes.')
      : say('part', `${short} is a part of ${forEntity.get(parent)} (its file is beside it), not a component of its own in ${from}, so no agent is given this page.${twinNote}`,
        `Move what is true of this part and not yet on ${pageOf(parent)} there (under When to use, When not to use, Limitations…), then delete this page.`, 'Yes, once that is moved.');
  }
  // The same words as a component's page.
  const copy = others.find((x) => forEntity.has(x) && shares(mine, linesOf(x)) >= 0.8);
  if (copy) return say('copy', `It names no component of the system, and what it says is on the page of ${forEntity.get(copy)} (${copy.file}).${twinNote}`, 'Delete this page.', 'Yes.');
  return say('noComponent', `Its name matches no component of the system, nor does the code file it names, so no agent is given it.${twinNote}`,
    from === 'Figma'
      ? 'Name it as its component is named in Figma (the names are in the Components list of the style guide). If the component is not in Figma yet, add it there; if it is not meant to be used, delete this page.'
      : 'Name it as its component is named in the code (its file\'s name, as in the Components list of the style guide). If no component in the code is the one it describes, delete this page.', 'Only if the component is not meant to be used.');
}

// One line for the person, from a source's sync result (the DSDS adapter's words, the default).
export const describeSync = dsds.describeSync;
