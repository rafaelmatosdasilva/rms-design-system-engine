// system-kinds.mjs - everything a design system holds, not only components: a request for a pattern, a template, a
// page, a flow or a foundation, built from the system's own of that kind.
//
// Generation read and wrote components. A design system also holds patterns, templates, pages and flows (each a
// composition of its components, with its own rules for what it holds) and foundations (its variables). The kinds are
// the intent layer's own (foundations, components, patterns, templates, pages, flows), so nothing new is invented to say
// what a thing is. Each kind is read the way the construction grammar reads components: from the system's own examples
// of it (the templates and pages Figma composes, the intent layer's pages of that kind), what every one holds is a rule
// and what most hold is a fix, and a new one that lacks it is asked about, never quietly given it or left without it.
//
//   kindOf(description, { kind }) → 'component' | 'pattern' | 'template' | 'page' | 'flow' | 'foundation': what is made
//   examplesOf(kind, { templates, entities, components }) → [{ name, source, components }]: the system's own of that
//     kind, each with the components it holds in order (a flow's: the pages it goes through)
//   kindRules(kind, examples) → [{ id, says, status: 'rule' | 'fix', component }]
//   composeOps({ kind, name, description, like, examples, components, rules }) → { ops, questions, like }: a frame of
//     the system's own components (create kind 'frame', as: the kind), a flow a row of its pages
//   foundationOps({ description, name, variables }) → { ops, questions }: a new variable beside the one it is like
//   kindSpec({ kind, description, name, like, ops, questions, captures, grammar, at }) → { spec }: the spec of one that
//     is not a component, in DSDS's shape with the engine's part, checked against the system as a component's is
//
// Pure: nothing is read or written here.
import { wordsOf } from './construction-grammar.mjs';
import { ground } from './figma-ops.mjs';
import { EXT } from './component-spec.mjs';
import { dsdsId, DSDS_VERSION } from './contract-dsds.mjs';

export const KINDS = ['component', 'pattern', 'template', 'page', 'flow', 'foundation'];
// The intent layer's layer for each kind (intent-gen.mjs LAYERS).
export const LAYER_OF = { foundation: 'foundations', component: 'components', pattern: 'patterns', template: 'templates', page: 'pages', flow: 'flows' };
const WORD = [
  ['flow', /^(flow|journey|fluxo|jornada)s?$/i],
  ['template', /^(template|modelo)s?$/i],
  ['page', /^(page|screen|p[aá]gina|tela)s?$/i],
  ['pattern', /^(pattern|padr[aã]o|padr[oõ]es)$/i],
  ['foundation', /^(foundation|token|variable|vari[aá]vel|funda[cç][aã]o)s?$/i],
];
const squash = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
const stem = (w) => (w.length > 3 ? w.replace(/s$/, '') : w);

// What is made: the noun the request makes ("make a template like settings", "a spacing token called 40"), else a
// component. Only the thing made decides it: "a chip for the settings page" makes a chip.
export function kindOf(description = '', { kind = null } = {}) {
  if (kind && KINDS.includes(kind)) return kind;
  const made = String(description).match(/\b(?:make|create|build|design|draw|add|generate|cria\w*|fa[zç]a?|constr[oó]i\w*|desenha\w*|gera\w*|adiciona\w*)\s+(?:a |an |um |uma |the |o |a )?(?:new |novo |nova )?((?:[\w-]+\s+){0,2}[\w-]+)/i);
  const words = made ? made[1].split(/\s+/) : String(description).trim().split(/\s+/).slice(0, 3);
  for (const w of words) for (const [k, re] of WORD) if (re.test(w)) return k;
  return 'component';
}

// The components a page of the intent layer names, in the order it first names them.
const named = (text, components) => {
  const t = ` ${String(text ?? '')} `, at = [];
  for (const c of components) {
    const forms = [c, c.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase(), c.replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase()];
    const i = Math.min(...forms.map((f) => { const m = new RegExp(`[^\\w-]${f.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[^\\w-]`, 'i').exec(t); return m ? m.index : Infinity; }));
    if (i < Infinity) at.push([c, i]);
  }
  return at.sort((a, b) => a[1] - b[1]).map(([c]) => c);
};
const textOf = (e) => [e.summary, ...(e.purpose ?? []), ...(e.whenToUse ?? []), ...(e.rules ?? []), ...(e.sections ?? []).map((s) => `${s.title ?? ''} ${s.body ?? s.text ?? ''}`)].filter(Boolean).join(' \n ');

export function examplesOf(kind, { templates = {}, entities = [], components = [] } = {}) {
  const out = [];
  // Figma's templates are page frames: a template's and a page's examples.
  if (kind === 'template' || kind === 'page') for (const t of Object.values(templates ?? {})) if (t?.name && Array.isArray(t.components)) out.push({ name: t.name, source: 'Figma', components: t.components.filter((c) => components.includes(c)) });
  const layer = LAYER_OF[kind];
  const pages = entities.filter((e) => e.layer === 'templates' || e.layer === 'pages').map((e) => e.name);
  for (const e of entities.filter((x) => x.layer === layer)) {
    if (out.some((o) => squash(o.name) === squash(e.name))) continue;
    out.push({ name: e.name, source: 'intent layer', components: kind === 'flow' ? named(textOf(e), pages) : named(textOf(e), components) });
  }
  return out.filter((o) => o.components.length);
}

// How the system builds each kind, read from its own: what every one holds is a rule, what most hold a fix; with
// fewer than two examples nothing is a rule, as the construction grammar needs more than one component.
export function kindRules(kind, examples = []) {
  if (examples.length < 2 || kind === 'flow') return [];
  const count = new Map();
  for (const e of examples) for (const c of new Set(e.components)) count.set(c, (count.get(c) ?? 0) + 1);
  const rules = [];
  for (const [c, n] of [...count].sort((a, b) => b[1] - a[1])) {
    if (n === examples.length) rules.push({ id: `${kind}-holds`, says: `Every ${kind} holds ${c}`, status: 'rule', component: c });
    else if (n > examples.length / 2 && examples.length >= 3) rules.push({ id: `${kind}-holds`, says: `Most ${kind}s hold ${c} (${n} of ${examples.length})`, status: 'fix', component: c });
  }
  const firsts = new Set(examples.map((e) => e.components[0]));
  if (firsts.size === 1) rules.push({ id: `${kind}-opens-with`, says: `Every ${kind} opens with ${[...firsts][0]}`, status: 'rule', component: [...firsts][0] });
  return rules;
}

// The system's components a clause names: "with a toast and the action bar" → toast, actionBar.
const componentsIn = (text, components) => {
  const said = wordsOf(String(text)).map((w) => w.toLowerCase()).filter((w) => !/^(a|an|the|and|with|without|com|sem|um|uma|o|e)$/.test(w));
  const hits = [];
  for (const c of components) {
    const cw = wordsOf(c).map((w) => stem(w.toLowerCase()));
    if (!cw.length) continue;
    for (let i = 0; i + cw.length <= said.length; i++) if (cw.every((w, j) => stem(said[i + j]) === w)) { hits.push([c, i, cw.length]); break; }
  }
  // The longest name that fits wins (actionBar over action).
  return hits.sort((a, b) => b[2] - a[2]).filter((h, i, all) => !all.slice(0, i).some((g) => h[1] >= g[1] && h[1] < g[1] + g[2])).sort((a, b) => a[1] - b[1]).map(([c]) => c);
};

export function composeOps({ kind, name, description = '', like = null, examples = [], components = [], rules = [] } = {}) {
  const questions = [];
  const ask = (text) => questions.push({ at: null, ask: text });
  const said = String(description).match(/\b(?:like|como|igual a|based on|baseado n[oa])\s+(?:the |an? |o |a )?["'`]?([\w/.-]+(?:\s[\w-]+)?)/i)?.[1];
  // An example by its name, with or without its kind's word ("consult" is the Consult Template).
  const bare = (n) => squash(String(n).replace(/\b(template|page|pattern|flow|screen)s?\b/gi, ''));
  const byName = (w) => (w ? examples.find((e) => squash(e.name) === squash(w)) ?? examples.find((e) => bare(e.name) === bare(w)) ?? null : null);
  const ex = byName(like) ?? (said ? byName(said) ?? byName(said.split(/\s/)[0]) : null) ?? null;
  if (like && !ex) ask(`The system has no ${kind} ${like}${examples.length ? `: its ${kind}s are ${examples.map((e) => e.name).join(', ')}` : ''}.`);
  const adds = [...String(description).matchAll(/\b(?:with|com)\s+(.+?)(?=\s*(?:,|;|\.\s|$|\s+(?:without|sem)\b))/gi)].flatMap((m) => componentsIn(m[1], components));
  const drops = [...String(description).matchAll(/\b(?:without|sem)\s+(.+?)(?=\s*(?:,|;|\.\s|$|\s+(?:with|com)\b))/gi)].flatMap((m) => componentsIn(m[1], components));
  const ops = [{ op: 'create', name, kind: 'frame', as: kind, layout: { dir: kind === 'flow' ? 'HORIZONTAL' : 'VERTICAL' } }];
  if (kind === 'flow') {
    // A flow is the pages it goes through, side by side, each as the system composes it.
    const steps = ex?.components ?? (String(description).match(/\b(?:from|de)\s+(.+?)\s+(?:to|para|até)\s+(.+?)(?=[.;]|$)/i)?.slice(1).flatMap((x) => x.split(/\s+(?:to|then|para|até|e depois)\s+|,\s*/)).map((x) => x.replace(/^(the|a|o|a)\s+/i, '').trim()).filter(Boolean) ?? []);
    if (!steps.length) ask(`Which pages does ${name} go through, in order?${examples.length ? ` The system's flows: ${examples.map((e) => `${e.name} (${e.components.join(' → ')})`).join('; ')}.` : ''}`);
    for (const st of steps) {
      ops.push({ op: 'addLayer', parent: '', layer: { type: 'frame', name: st, layout: { dir: 'VERTICAL' } } });
      for (const c of examples.find((e) => squash(e.name) === squash(st))?.components ?? []) ops.push({ op: 'addLayer', parent: st, layer: { type: 'instance', name: c, of: c } });
    }
    return { ops, questions, like: ex?.name ?? null };
  }
  const held = [...(ex?.components ?? []).filter((c) => !drops.includes(c)), ...adds.filter((c) => !(ex?.components ?? []).includes(c))];
  if (!held.length) ask(examples.length ? `Which of the system's ${kind}s is ${name} like, or which components does it hold? Its ${kind}s: ${examples.map((e) => `${e.name} (${e.components.join(', ')})`).join('; ')}.` : `Which of the system's components does ${name} hold? The system has no ${kind} of its own to start from.`);
  for (const c of held) ops.push({ op: 'addLayer', parent: '', layer: { type: 'instance', name: c, of: c } });
  // What every one of the system's own holds: asked when this one lacks it, never added behind the person's back.
  // What most hold is asked only of one built from nothing: one built like the system's own takes its choices.
  for (const r of rules.filter((x) => x.status === 'rule' || !ex)) {
    if (r.id.endsWith('-holds') && !held.includes(r.component) && held.length) ask(`${r.says}${drops.includes(r.component) ? ', and this one was asked without it' : ''}: does ${name} hold it too (an addLayer of ${r.component}), or is it left out on purpose?`);
    if (r.id.endsWith('-opens-with') && held.length && held[0] !== r.component && held.includes(r.component)) ask(`${r.says}, and ${name} opens with ${held[0]}: move ${r.component} first, or say why not.`);
  }
  return { ops, questions, like: ex?.name ?? null };
}

// A foundation: a new variable beside the one it is like ("a spacing token like spacing/32 called spacing/40,
// pointing at size/40"). Its value is one of the system's variables, or a value only where the one it is like holds
// its own; anything else is asked (figma-ops.mjs ground).
export function foundationOps({ description = '', name = null, variables = [] } = {}) {
  const questions = [];
  const find = (w) => variables.find((v) => v === w) ?? variables.find((v) => squash(v) === squash(w)) ?? null;
  const said = String(description).match(/\b(?:like|como|igual a|based on|baseado n[oa])\s+(?:the |an? |o |a )?["'`]?([\w/.-]+)/i)?.[1];
  const like = said ? find(said) : null;
  if (!like) { questions.push({ at: null, ask: `Which of the system's variables is it like? A new variable sits beside it, in its collection, of its type.${said ? ` (the system has no ${said})` : ''}` }); return { ops: [], questions }; }
  const nm = name ?? String(description).match(/\b(?:called|named|chamad[oa])\s+["'`]?([\w/.-]+)/i)?.[1] ?? null;
  const alias = String(description).match(/\b(?:pointing at|points at|aliased to|alias(?:es)? of|aponta(?:ndo)? para)\s+["'`]?([\w/.-]+)/i)?.[1] ?? null;
  const value = String(description).match(/\b(?:of|with (?:the )?value|holding|valor|de)\s+(-?\d+(?:\.\d+)?(?:px)?|#[0-9a-f]{3,8})\b/i)?.[1]?.replace(/px$/, '') ?? null;
  return { ops: [{ op: 'addVariable', name: nm, like, ...(alias ? { alias } : {}), ...(value != null && !alias ? { value } : {}) }], questions };
}

export function kindSpec({ kind, description = '', name = null, like = null, ops = [], questions = [], captures = {}, grammar = null, at = null } = {}) {
  const grounded = ground(ops, { captures, grammar });
  const qs = [...grounded.questions, ...questions];
  // Its name as asked, while a question holds it back: a variable's in the group of the one it is like.
  const asked = ops.find((o) => o.op === 'addVariable'), dir = (v) => String(v ?? '').split('/').slice(0, -1).join('/');
  const askedName = asked?.name ? (asked.name.includes('/') || !dir(asked.like) ? asked.name : `${dir(asked.like)}/${asked.name}`) : name;
  const made = kind === 'foundation' ? grounded.ops.find((o) => o.op === 'addVariable')?.name ?? askedName : grounded.ops.find((o) => o.op === 'create')?.name ?? name;
  if (kind !== 'foundation' && grounded.ops.some((o) => o.op === 'create') && !grounded.ops.some((o) => o.op === 'place')) qs.push({ at: null, ask: `Which page and section does ${made} go on? (a place operation)` });
  const uses = [...new Set(grounded.ops.map((o) => o.layer?.of).filter((n) => n && captures.props?.[n]))].map((n) => ({ to: dsdsId(n) }));
  const spec = {
    dsdsVersion: DSDS_VERSION, kind, id: dsdsId(made ?? `new-${kind}`), name: made ?? null, description: '',
    ...(uses.length ? { uses } : {}),
    [EXT]: { kind: 'spec', made: kind, asked: description, at, like, ops: grounded.ops, questions: qs, named: grounded.named, held: grounded.held, notes: [] },
  };
  return { spec, grounded };
}
