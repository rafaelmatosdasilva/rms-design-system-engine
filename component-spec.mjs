// component-spec.mjs - a spec for a new component, from a description, made only of what the system has.
//
// A person says what they need ("a tag like the chip, called badge, with a size l"). The spec starts from the component
// it is like, as the capture read it, and takes only the operations that make it what was asked (figma-ops.mjs), each
// checked against the system: its variables, its components, its layers, its names written the system's way. What
// cannot be grounded is a question, never a value. A new component, and anything it adds to the system, is held for
// someone to sign off. The spec is written in DSDS's shape (contract-dsds.mjs), so the code side reads the same file
// later.
//
//   likeOf(description, components, { like }) → { like, candidates }: the component it says it is like ("like the
//     chip"), else the ones whose names share its words
//   nameOf(description, { name }) → the name it gives ("called badge"), or null
//   specOf({ description, like, name, ops, unread, captures, grammar, at }) → { spec, grounded, model }: the DSDS entry
//     with the engine's own part (x-rms-design-system-engine: the like, the operations, questions, held, named, notes,
//     and shared: a rebind to the shared variable each of the like's own variables points at, captures.aliases' chain)
//   sharedOf(variable, { like, captures }) → the shared variable one of the like's own stands for, never a primitive
//     unless asked (primitiveTest: the project's declared tiers, else its primitive prefix)
//   askedOf(description, model) → { ops, unread }: what else the description asks of the copy ("with a size xl like l",
//     "without the icon"), read as a change to the one it is like; what it cannot read is unread, never dropped
//   specLines(spec) → what the run prints
//
// Pure: no file is read or written here.
import { ground, predict, modelOf, opWords, optionNamed } from './figma-ops.mjs';
import { diffModels, diffLines } from './component-diff.mjs';
import { dsdsId, DSDS_VERSION } from './contract-dsds.mjs';
import { wordsOf, memberOf } from './construction-grammar.mjs';
import { parseChange } from './component-change.mjs';
import { classifyTier } from './tier-check.mjs';

export const EXT = 'x-rms-design-system-engine';
const squash = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');

export function likeOf(description = '', components = [], { like = null } = {}) {
  const names = components.filter((n) => !String(n).startsWith('_'));
  const find = (w) => names.find((n) => squash(n) === squash(w)) ?? null;
  if (like) return { like: find(like), candidates: find(like) ? [] : names.filter((n) => squash(n).includes(squash(like))).slice(0, 5) };
  const said = String(description).match(/\b(?:like|como|igual a|based on|baseado n[oa])\s+(?:the |an? |o |a )?["'`]?([\w/.-]+(?:\s[\w-]+)?)/i);
  if (said) { const hit = find(said[1]) ?? find(said[1].split(/\s/)[0]) ?? memberOf(said[1].split(/\s/)[0], description, names); if (hit) return { like: hit, candidates: [] }; }
  // The components whose names share the most words with the description.
  const stem = (w) => (w.length > 3 ? w.replace(/s$/, '') : w);
  const words = new Set(wordsOf(description).filter((w) => w.length > 2).map(stem));
  const scored = names.map((n) => [n, wordsOf(n).map(stem).filter((w) => words.has(w)).length]).filter(([, s]) => s).sort((a, b) => b[1] - a[1] || a[0].length - b[0].length);
  return { like: null, candidates: scored.slice(0, 5).map(([n]) => n) };
}

export function nameOf(description = '', { name = null } = {}) {
  if (name) return name;
  const m = String(description).match(/\b(?:called|named|chamad[oa]|com o nome)\s+["'`]?([\w/-]+)/i);
  if (m) return m[1];
  // "make a tag like the chip": the thing it makes, unless that is only "a component".
  const made = String(description).match(/\b(?:make|create|build|design|cria\w*|fa[zç]a?|constr[oó]i\w*|desenha\w*)\s+(?:a |an |um |uma )?(?:new |novo |nova )?([\w-]+)(?:\s+(?:in|no|na)\s+figma)?,?\s+(?:like|como|igual|based|baseado)\b/i);
  return made && !/^(component|componente|one|thing|coisa)s?$/i.test(made[1]) ? made[1] : null;
}

// What the description asks beyond the copy: "with …" adds, "without …" removes, each clause read as a change.
export function askedOf(description = '', model = null) {
  const rest = String(description)
    .replace(/\s+(?:in|no|na) figma\b/gi, '')
    .replace(/\b(?:called|named|chamad[oa]|com o nome)\s+["'`]?[\w/-]+["'`]?/gi, '')
    // The component it is like, not an option a clause copies from ("with a size xl like l").
    .replace(/\b(?:like|como|igual a|based on|baseado n[oa])\s+(?:the |an? |o |a )?["'`]?([\w/.-]+)(?:\s(?:one|ones|button|component))?["'`]?/gi, (all, w) => ((model?.axes ?? []).some((a) => optionNamed(model, a.name, w)) ? all : ''));
  const clauses = [...rest.matchAll(/\b(with|without|but with|but without|com|sem)\s+(.+?)(?=\s*(?:,|;|\.\s|$|\s+and\s+(?:with|without)\b|\s+(?:with|without)\b))/gi)];
  const said = clauses.map(([, w, what]) => `${/out|sem/i.test(w) ? 'remove' : 'add'} ${what.trim().replace(/^no\s+/i, 'the ')}`);
  // "with the description …" is its description.
  const lines = said.map((c) => c.replace(/^add (?:the |a )?description\b/i, 'description'));
  return lines.length ? parseChange(lines.join('; '), model) : { ops: [], unread: [] };
}

// The variables a component was given as its own (its name is one of the path's segments: advanced/chip/fill/color).
const ownOf = (v, component) => String(v).split('/').some((s) => s.toLowerCase() === String(component).toLowerCase());

// A primitive, by the project's own tiers when it declares them (the base layer, or the tier named primitive), else by
// the prefix its primitives carry (figma.primitivePrefix). The engine never imposes a tier model.
export function primitiveTest({ tiers = null, prefix = 'primitives/' } = {}) {
  const t = declared(tiers);
  const base = t.find((x) => x.layer === 1)?.name ?? t.find((x) => /primitive/i.test(x.name))?.name ?? null;
  return base ? (v) => classifyTier(v, t) === base : (v) => String(v).startsWith(prefix);
}
const declared = (tiers) => (Array.isArray(tiers) ? tiers.filter((x) => x?.name && x.match != null) : []);
// The layer a variable is in, by the declared tiers; null when the project declares none.
export const tierTest = ({ tiers = null } = {}) => { const t = declared(tiers); return t.length ? (v) => classifyTier(v, t) : () => null; };

// The shared variable one of the like's own variables stands for: the nearest in its alias chain that is neither made
// for the like nor a primitive. When the chain reaches only primitives, the shared variable that resolves to the same
// primitive in every mode, with the same scope (one is proposed, via that primitive; several are asked); else the
// primitive itself is asked, never proposed. → { to?, via? } | { primitive, options } | {}
export function sharedOf(v, { like, captures = {} } = {}) {
  const prim = captures.isPrimitive ?? primitiveTest();
  const comps = Object.keys(captures.props ?? {});
  const own = (x) => comps.some((c) => ownOf(x, c));
  const chain = (x) => captures.aliases?.[x] ?? [];
  // Shared is never the layer the like's own variables are in: the declared tier, else the path before its name
  // (advanced/chip/… is in advanced/, with every other component's own).
  const tierOf = captures.tierOf ?? (() => null), segs = String(v).split('/');
  const at = segs.findIndex((x) => x.toLowerCase() === String(like).toLowerCase()), head = at > 0 ? `${segs.slice(0, at).join('/')}/` : null;
  const layered = (x) => (tierOf(v) ? tierOf(x) === tierOf(v) : head ? String(x).startsWith(head) : own(x));
  const c = chain(v).filter((x) => !ownOf(x, like) && !layered(x));
  const near = c.find((x) => !prim(x));
  if (near) return { to: near };
  if (!c.length) return {};
  const byMode = Object.entries(captures.aliasesByMode ?? {}).filter(([, m]) => m[v]);
  const ends = (x) => (byMode.length ? byMode.map(([, m]) => (m[x] ?? []).at(-1) ?? null) : [chain(x).at(-1) ?? null]);
  const scopes = new Map(Object.values(captures.varNames ?? {}).filter((x) => x?.name).map((x) => [x.name, x.scopes ?? []]));
  const fits = (x) => { const a = scopes.get(v) ?? [], b = scopes.get(x) ?? []; return !a.length || !b.length || a.includes('ALL_SCOPES') || b.includes('ALL_SCOPES') || a.some((y) => b.includes(y)); };
  const want = ends(v).join('|');
  const same = [...scopes.keys()].filter((x) => x !== v && !prim(x) && !own(x) && !layered(x) && chain(x).length && ends(x).join('|') === want && fits(x));
  if (!same.length) return { primitive: c.at(-1), options: [] };
  // The same value is not the same purpose: one is proposed only when its name shares a word with the variable it
  // replaces (text, border, background), more than any other does; else the person chooses.
  const GENERIC = new Set(['color', 'colour', 'fill', 'value', 'all', 'base', 'semantic', 'advanced', 'default']);
  const words = new Set(wordsOf(String(v).replace(/\//g, ' ')).map((w) => w.toLowerCase()).filter((w) => w.length > 2 && !GENERIC.has(w) && w !== String(like).toLowerCase()));
  const score = (x) => new Set(wordsOf(String(x).replace(/\//g, ' ')).map((w) => w.toLowerCase()).filter((w) => words.has(w))).size;
  const ranked = same.map((x) => [x, score(x)]).sort((a, b) => b[1] - a[1]);
  if (ranked[0][1] > 0 && (ranked.length === 1 || ranked[0][1] > ranked[1][1])) return { to: ranked[0][0], via: c.at(-1) };
  return { primitive: c.at(-1), options: ranked.slice(0, 4).map(([x]) => x) };
}

export function specOf({ description = '', like = null, name = null, ops = [], unread = [], captures = {}, grammar = null, at = null } = {}) {
  const all = like ? [{ op: 'clone', from: like, name }, ...ops.filter((o) => o.op !== 'clone')] : ops;
  const grounded = ground(all, { captures, grammar });
  const before = like ? modelOf(like, captures) : null;
  const model = predict(null, grounded.ops, captures);
  let shared = [];
  // What was not read says what the one it is like has, so the person can say it in its terms.
  const has = (m) => [m?.axes?.length ? `variant axes ${m.axes.map((a) => `${a.name} (${a.options.map((o) => o.name).join(', ')})`).join(', ')}` : `no variant axis`, m?.properties?.length ? `properties ${m.properties.map((p) => p.name).join(', ')}` : null].filter(Boolean).join('; ');
  const likeModel = like ? modelOf(like, captures) : null;
  const questions = [...grounded.questions, ...unread.map((u) => ({ at: null, ask: `What was asked and not read: "${u}"${likeModel ? ` (${like} has ${has(likeModel)})` : ''}. Write it as operations, or say it is not wanted.` }))], notes = [];
  const holds = (id) => (grammar?.figma?.rules ?? []).some((r) => r.id === id && (r.status === 'rule' || r.status === 'fix'));
  if (model) {
    if (!grounded.ops.some((o) => o.op === 'describe') && holds('description')) questions.push({ at: null, ask: `What does ${model.name}'s description in Figma say? Every component in this system carries one (a describe operation).` });
    if (!like && !grounded.ops.some((o) => o.op === 'place')) questions.push({ at: null, ask: `Which page and section does ${model.name} go on? (a place operation)` });
    // The like's own variables, bound on the copy too: the new component's to choose.
    const own = [...new Set(Object.values(model.binds).flat().filter((v) => like && ownOf(v, like)))];
    // The shared variable each points at: the first in its alias chain that is not made for the one it is like.
    const found = own.map((v) => ({ v, ...sharedOf(v, { like, captures }) }));
    shared = found.filter((f) => f.to).map((f) => ({ op: 'rebind', from: f.v, to: f.to }));
    const via = found.filter((f) => f.to && f.via), choose = found.filter((f) => f.primitive && f.options.length), bare = found.filter((f) => f.primitive && !f.options.length), none = found.filter((f) => !f.to && !f.primitive).map((f) => f.v);
    if (own.length) questions.push({ at: null, ask: `${like} binds ${own.length} variable${own.length === 1 ? '' : 's'} made for it (${own.slice(0, 3).join(', ')}${own.length > 3 ? '…' : ''}), and the copy would too. Bind the shared one each points at, or variables made for ${model.name} (made first, in the variables: a token change)?${shared.length ? ` The shared ones: ${shared.slice(0, 3).map((o) => `${o.from} → ${o.to}`).join(', ')}${shared.length > 3 ? ` and ${shared.length - 3} more` : ''} (--shared binds ${shared.length === own.length ? (own.length === 1 ? 'it' : 'them all') : shared.length === 1 ? 'that one' : `these ${shared.length}`}).` : ''}${via.length ? ` ${via.length === 1 ? 'One points' : `${via.length} point`} only at a primitive: ${via.length === 1 ? 'its shared one is' : 'their shared ones are'} the variable that resolves to the same primitive in every mode (${via.slice(0, 2).map((f) => `${f.to}, for ${f.via}`).join('; ')}${via.length > 2 ? '; …' : ''}).` : ''}${choose.length ? ` ${choose.length === 1 ? 'One points' : `${choose.length} point`} only at a primitive, and the shared variables that resolve to it are not plainly for the same thing: ${choose.slice(0, 2).map((f) => `${f.v} (${f.primitive}: ${f.options.join(', ')})`).join('; ')}${choose.length > 2 ? '; …' : ''}. Which, or the primitive itself? A rebind operation for each.` : ''}${bare.length ? ` ${bare.length === 1 ? 'One points' : `${bare.length} point`} only at a primitive no shared variable resolves to (${bare.slice(0, 3).map((f) => `${f.v} → ${f.primitive}`).join(', ')}${bare.length > 3 ? ', …' : ''}): bind the primitive itself, skipping the layer between, or a variable made for it first (a token change)? A rebind operation for each.` : ''}${none.length ? ` ${none.length === own.length ? 'None points' : `${none.length} point${none.length === 1 ? 's' : ''}`} at no shared variable${none.length < own.length ? ` (${none.slice(0, 3).join(', ')})` : ''}: a rebind operation for ${none.length === 1 ? 'it' : 'each'}.` : ''}` });
    const raw = captures.values?.[like]?.hygiene?.rawCount;
    if (raw) notes.push(`${like} has ${raw} value${raw === 1 ? '' : 's'} bound to no variable; the copy starts with ${raw === 1 ? 'it' : 'them'} too, and the hygiene check lists ${raw === 1 ? 'it' : 'them'} once it is built.`);
  }
  const traits = [];
  for (const a of model?.axes ?? []) {
    const opts = a.options.map((o) => o.name);
    traits.push(opts.length === 2 && opts.every((o) => /^(true|false)$/i.test(o))
      ? { traitType: 'variant', kind: 'boolean', id: a.name, description: `${model.name}'s ${a.name}.` }
      : { traitType: 'variant', kind: 'enum', id: a.name, description: `${model.name}'s ${a.name}${a.default ? `, ${a.default} unless set` : ''}.`, values: opts });
  }
  for (const p of model?.properties ?? []) if (p.kind === 'BOOLEAN') traits.push({ traitType: 'variant', kind: 'boolean', id: p.name, description: `${model.name}'s ${p.name}${p.default != null ? `, ${p.default ? 'on' : 'off'} unless set` : ''}.` });
  const uses = [...new Set(Object.values(model?.layers ?? {}).map((l) => l.of).filter((n) => n && captures.props?.[n] && !String(n).startsWith('.')))].map((n) => ({ to: dsdsId(n) }));
  const spec = {
    dsdsVersion: DSDS_VERSION, kind: 'component', id: dsdsId(model?.name ?? name ?? 'new-component'), name: model?.name ?? name ?? null,
    description: model?.description ?? '',
    ...(traits.length ? { traits } : {}), ...(uses.length ? { uses } : {}),
    [EXT]: {
      kind: 'spec', asked: description, at, like,
      ops: grounded.ops, questions, named: grounded.named, held: grounded.held, notes, ...(shared.length ? { shared } : {}),
      ...(model ? { variants: model.variants.length, figma: { page: model.page, section: model.section } } : {}),
      diff: diffModels(before, model),
    },
  };
  return { spec, grounded, model };
}

export function specLines(spec, { file = null } = {}) {
  const x = spec[EXT] ?? {};
  const out = [`${spec.name ?? 'The new component'}: a spec${x.like ? ` built like ${x.like}` : ''}${x.variants ? `, ${x.variants} variant${x.variants === 1 ? '' : 's'}` : ''}${file ? ` (${file})` : ''}.`];
  if ((x.ops ?? []).length) out.push('What it is made of:', ...x.ops.map((o) => `   • ${opWords(o)}`));
  const d = diffLines(x.diff ?? {});
  if (x.like && d.length) out.push(`How it differs from ${x.like}:`, ...d);
  if ((x.named ?? []).length) out.push('Named the way the system names things:', ...x.named.map((n) => `   • ${n.from} → ${n.to} (${n.why})`));
  for (const n of x.notes ?? []) out.push(`ℹ️  ${n}`);
  if ((x.held ?? []).length) out.push(`Held for sign-off (it adds to the system): ${x.held.map((h) => h.what).join('; ')}.`);
  if ((x.questions ?? []).length) out.push(`To answer before it is built (${x.questions.length}):`, ...x.questions.map((q) => `   • ${q.ask}`));
  return out;
}
