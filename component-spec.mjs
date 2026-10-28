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
//   specOf({ description, like, name, ops, captures, grammar, at }) → { spec, grounded, model }: the DSDS entry with the
//     engine's own part (x-rms-design-system-engine: the like, the operations, questions, held, named, notes)
//   specLines(spec) → what the run prints
//
// Pure: no file is read or written here.
import { ground, predict, modelOf, opWords } from './figma-ops.mjs';
import { diffModels, diffLines } from './component-diff.mjs';
import { dsdsId, DSDS_VERSION } from './contract-dsds.mjs';
import { wordsOf } from './construction-grammar.mjs';

export const EXT = 'x-rms-design-system-engine';
const squash = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');

export function likeOf(description = '', components = [], { like = null } = {}) {
  const names = components.filter((n) => !String(n).startsWith('_'));
  const find = (w) => names.find((n) => squash(n) === squash(w)) ?? null;
  if (like) return { like: find(like), candidates: find(like) ? [] : names.filter((n) => squash(n).includes(squash(like))).slice(0, 5) };
  const said = String(description).match(/\b(?:like|como|igual a|based on|baseado n[oa])\s+(?:the |an? |o |a )?["'`]?([\w/.-]+(?:\s[\w-]+)?)/i);
  if (said) { const hit = find(said[1]) ?? find(said[1].split(/\s/)[0]); if (hit) return { like: hit, candidates: [] }; }
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
  const made = String(description).match(/\b(?:make|create|build|design|cria\w*|fa[zç]a?|constr[oó]i\w*|desenha\w*)\s+(?:a |an |um |uma )?(?:new |novo |nova )?([\w-]+)\s+(?:like|como|igual|based|baseado)\b/i);
  return made && !/^(component|componente|one|thing|coisa)s?$/i.test(made[1]) ? made[1] : null;
}

// The variables a component was given as its own (its name is one of the path's segments: advanced/chip/fill/color).
const ownOf = (v, component) => String(v).split('/').some((s) => s.toLowerCase() === String(component).toLowerCase());

export function specOf({ description = '', like = null, name = null, ops = [], captures = {}, grammar = null, at = null } = {}) {
  const all = like ? [{ op: 'clone', from: like, name }, ...ops.filter((o) => o.op !== 'clone')] : ops;
  const grounded = ground(all, { captures, grammar });
  const before = like ? modelOf(like, captures) : null;
  const model = predict(null, grounded.ops, captures);
  const questions = [...grounded.questions], notes = [];
  const holds = (id) => (grammar?.figma?.rules ?? []).some((r) => r.id === id && (r.status === 'rule' || r.status === 'fix'));
  if (model) {
    if (!grounded.ops.some((o) => o.op === 'describe') && holds('description')) questions.push({ at: null, ask: `What does ${model.name}'s description in Figma say? Every component in this system carries one (a describe operation).` });
    if (!like && !grounded.ops.some((o) => o.op === 'place')) questions.push({ at: null, ask: `Which page and section does ${model.name} go on? (a place operation)` });
    // The like's own variables, bound on the copy too: the new component's to choose.
    const own = [...new Set(Object.values(model.binds).flat().filter((v) => like && ownOf(v, like)))];
    if (own.length) questions.push({ at: null, ask: `${like} binds ${own.length} variable${own.length === 1 ? '' : 's'} made for it (${own.slice(0, 3).join(', ')}${own.length > 3 ? '…' : ''}), and the copy would too. Bind the shared one each points at, or variables made for ${model.name} (made first, in the variables: a token change)? Say it with a rebind operation for each.` });
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
      ops: grounded.ops, questions, named: grounded.named, held: grounded.held, notes,
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
