// rule-checks.mjs - every rule on an intent-layer page, said as what holds it.
//
// Most component pages carry rules, written as prose. A rule an agent only reads is one it may forget, so each rule is
// read for what can hold it:
//   checked    a check the engine already runs enforces it, and the check is named: the edit check's colours, sizes,
//              CSS variables, prop values and imports, the static accessibility check, the catalog's nesting rules, or a
//              guard a yes wrote before (lessons.mjs → the authored contract's guards and neverCombineWith).
//   checkable  it can be written as a guard the edit check enforces: a component that must never contain another, a prop
//              value or combination that is not allowed, a token never to write, a prop or slot a component always has,
//              an import replaced, at most so many of a component on one screen. The guard is proposed for a person to
//              say yes or no to, as the Documentation page's other proposals are (intent-proposals.mjs, guard:<page>:<id>);
//              a yes writes it with the lessons' own writer (lessons.mjs → withGuard) into contract.authored.json, or
//              ds-config.json for an import, and the rule is checked from then on, linked to its guard. A no is kept: the
//              rule stays one agents read.
//   judgment   only a person can say whether a screen follows it, or a model judging the page (--judge-pages).
// A rule that names nothing a reviewer could look for (no component, prop, value, token or count: "use it
// appropriately") is vague: a rewrite is drafted as one sentence a reviewer can check, from what the page itself says
// (its When to use, its props), and proposed the same way (rewrite:<page>:<id>); a yes drafts it on the page, under
// Rules, through the layer's own draft review.
// Read in English and Portuguese alike: the words are compared without accents, each list in both languages.
// Pure, but for readRuleContext, which reads what the last run wrote.
import { readFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { codeSnapshotPath } from './names.mjs';
import { guardsOf } from './lessons.mjs';

export const STATUS = { checked: 'Checked', checkable: 'Checkable', judgment: 'Judgment' };

const norm = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
// Lower case and no accents: "não contém" and "nao contem" are the same words.
export const fold = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const flat = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();
const hash = (s) => createHash('sha1').update(String(s)).digest('hex').slice(0, 8);
const end = (s) => { const t = flat(s); return !t || /[.!?]$/.test(t) ? t : `${t}.`; };
const lowerFirst = (s) => { const t = flat(s).replace(/[.!?]+$/, ''); return t && !/^[A-Z]{2}/.test(t) ? t[0].toLowerCase() + t.slice(1) : t; };
const esc = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// ── The words, in English and Portuguese, without accents ───────────────────────────────────────────────────────────
// "no" is a no in English and "in the" in Portuguese: a rule in Portuguese says no with não, nunca, jamais.
const NEG_EN = /\b(never|not|no|don'?t|do not|doesn'?t|does not|cannot|can'?t|must not|mustn'?t|shouldn'?t|should not|avoid\w*|forbid\w*|nunca|nao|jamais|evit\w*|proib\w*)\b|n't\b/;
const NEG_PT = /\b(never|not|don'?t|do not|nunca|nao|jamais|evit\w*|proib\w*)\b/;
const MUST = /\b(must|always|required|requires?|needs?|has to|have to|should|every|each|sempre|deve\w*|tem de|tem que|teem de|precisa\w*|obrigatori\w*|cada)\b/;
// What a component always has: said with a must, and a verb or a with before what it has.
const REQ = /\b(must|always|required|requires?|needs?|has to|have to|sempre|deve\w*|tem de|tem que|precisa\w*|obrigatori\w*)\b/;
const HAVE = /\b(have|has|set|give|include|carry|provide|pass|with|ter|tem|teem|definir|define|levar|leva|incluir|inclui|passar|com)\b/;
const PT_WORDS = /\b(nao|nunca|sempre|deve\w*|usar|usa|usa-o|usa-a|utiliz\w*|coloca\w*|escrev\w*|quando|ecra|tela|pagina|componente|dentro|com|para|um|uma|sem|seu|sua|tem|isto|este|esta|cada|outr[oa]s?|apenas|so|nem|ou|mais|ser|sao|os|das|dos|nas|nos|na|em|ao|pelo|pela|de|da|forma|tom|cor|cores|botao|botoes|cartao)\b/g;
// Portuguese: two of its own words, or one and the accents it writes (ã, õ, ç, ê…), before they are taken off.
const isPt = (t, raw = '') => { const n = new Set(t.match(PT_WORDS) ?? []).size; return n >= 2 || (n >= 1 && /[ãõçâêôàáéíóú]/i.test(raw)) || /\b(mant[eé]m|mantenha|coerentes?|adequad[oa]s?)\b/i.test(raw); };
const WITHOUT = /\b(without|sem)\b/;
const INSIDE = /\b(inside|within|into|in|nested in|under|dentro d[eoa]s?|dentro|em|no|na|num|numa|nos|nas)\b/;
const HOLDS = /\b(contains?|containing|holds?|holding|wraps?|wrapping|around|contem|conter|contenha|conte|inclui\w*|envolve\w*)\b/;
const PUT = /\b(put|place|nest|coloca\w*|poe|por|insere|inserir|aninha\w*)\b/;
const ANOTHER = /\b(another|other|outr[oa]s?)\b/;
const PRONOUN = /\b(it|this|this component|isto|este|esta|ele|ela|dele|dela|nele|nela)\b/;
const INSTEAD = /\b(instead of|rather than|in place of|em vez de|em lugar de|ao inves de)\b/;
const USE = /\b(use|uses|using|prefer|usa|use-se|usar|utiliza\w*|prefir\w*)\b/;
const IMPORT_W = /\b(import\w*|importa\w*|package|pacote|library|biblioteca)\b/;
const COUNT = { one: 1, a: 1, an: 1, single: 1, 1: 1, um: 1, uma: 1, unico: 1, unica: 1, two: 2, 2: 2, dois: 2, duas: 2, three: 3, 3: 3, tres: 3 };
const NUM = '(one|a single|single|1|two|2|three|3|um|uma|um unico|uma unica|dois|duas|tres)';
const PLACE = '(screen|page|view|form|dialog|modal|section|panel|ecra|tela|pagina|vista|formulario|dialogo|seccao|secao|painel)s?';
const MAX_HEAD = new RegExp(`\\b(?:only|just|at most|no more than|never more than|a maximum of|maximum of|max|apenas|so|somente|no maximo|nunca mais (?:de|do que)|um maximo de)\\s+${NUM}\\b`);
const MAX_PER = new RegExp(`\\b${NUM}\\b[^.;]{0,60}?\\b(?:per|each|every|on (?:a|one|each|the)|in (?:a|one|each)|por|em cada|de cada|num|numa)\\s+${PLACE}\\b`);
// What the edit check holds on every edit, whatever the component: said by the rule's own words.
const UNIVERSAL = [
  { test: (t) => /\b(colou?rs?|cor(es)?|hex)\b|#[0-9a-f]{3,8}\b/.test(t) && /\b(tokens?|variab\w*|hard.?cod\w*|by hand|raw|literal|a mao|fix[oa]s?|diretamente|hex)\b/.test(t), check: 'the edit check: a colour written by hand', by: 'edit' },
  { test: (t) => /\b(spacing|padding|margins?|gaps?|radius|radii|corners?|font.?sizes?|espacament\w*|margens?|raios?|cantos?|tamanhos? d[ea] (letra|fonte))\b/.test(t) && /\b(tokens?|variab\w*|hard.?cod\w*|by hand|px|rem|a mao|fix[oa]s?|diretamente)\b/.test(t), check: 'the edit check: a size written by hand', by: 'edit' },
  { test: (t) => /\b(css variables?|custom propert\w*|variaveis css)\b/.test(t), check: 'the edit check: a CSS variable declared nowhere', by: 'edit' },
  { test: (t) => /\b(alt text|alt|texto alternativo)\b/.test(t) && /\b(images?|imagens?|img)\b/.test(t), check: 'the static accessibility check: an image with no alt', by: 'a11y' },
  { test: (t) => /\b(icon.?only|only an icon|so (com )?(um )?icone|apenas (com )?(um )?icone)\b/.test(t) && /\b(label|name|aria-label|nome|rotulo)\b/.test(t), check: 'the static accessibility check: a button or link with only an icon and no name', by: 'a11y' },
  { test: (t) => /\b(outline|focus ring|anel de foco|contorno de foco)\b/.test(t) && /\b(remov\w*|none|hide|tira\w*|retira\w*|esconde\w*)\b/.test(t), check: 'the static accessibility check: a focus outline removed', by: 'a11y' },
  { test: (t) => /eslint-disable|stylelint-disable|ts-ignore|ts-expect-error|ts-nocheck|biome-ignore|\b(switch|turn) (a |the )?(lint|checks?) off\b|\bdesativ\w* (o |a )?(lint|verifica\w*)/.test(t), check: 'the edit check: a comment that switches a check off', by: 'edit' },
  { test: (t, ctx) => ctx.tailwind && /\b(arbitrary values?|valores? arbitrari\w*)\b|\w-\[[^\]]+\]/.test(t), check: 'the edit check: a Tailwind class with a value in brackets', by: 'edit' },
  { test: (t) => /\b(only the values|values (it|the prop|each prop) takes|as (its|the) contract names|valores que \w+ aceita)\b/.test(t), check: 'the edit check: a prop value the component does not take', by: 'edit' },
];
// What makes a rule vague: words that leave the case to whoever reads it. Said only of a rule that names nothing else.
const VAGUE = /\b(appropriate(ly)?|proper(ly)?|correct(ly)?|the right way|where (it )?(makes sense|needed|appropriate)|as (needed|appropriate)|when (needed|necessary|appropriate|it makes sense)|sparingly|overuse\w*|too (many|much)|consistent(ly)?|coheren\w*|clear(ly)?|concise(ly)?|short|good|well|nice(ly)?|careful(ly)?|wise(ly)?|best practices?|follow the guidelines|meaningful(ly)?|sensibl[ey]|reasonabl[ey]|accessib\w*|adequad\w*|apropriad\w*|corretamente|devidamente|quando (necessario|fizer sentido|apropriado)|com moderacao|moderad\w*|com cuidado|abus\w*|demasiad\w*|consisten\w*|coerente\w*|clar[oa]s?|concis[oa]s?|curt[oa]s?|bem|boas praticas|siga as (diretrizes|regras)|sensat\w*|razoav\w*|significativ\w*|acessiv\w*)\b/;

// ── What the system has, as the rules are read against it ───────────────────────────────────────────────────────────
// components: { name: { props: { prop: { options?, type? } }, slots?: [name] } }; tokens: [--x]; authored: the authored
// contract; catalog: contracts/catalog.json; imports: ds-config.json → imports. → the context classifyRule reads.
export function ruleContext({ components = {}, tokens = [], authored = {}, catalog = {}, imports = {}, editCheck = true, a11yStatic = true, tailwind = false } = {}) {
  const names = Object.keys(components).filter((n) => !/^[_.]/.test(n));
  for (const n of Object.keys(catalog?.components ?? {})) if (!names.includes(n)) names.push(n);
  return {
    names, components, tokens: new Set(tokens), authored: authored ?? {}, catalog: catalog?.components ?? {},
    replaced: imports?.replaced && typeof imports.replaced === 'object' ? imports.replaced : {}, system: typeof imports?.system === 'string' ? imports.system : null,
    guards: guardsOf(authored ?? {}), editCheck, a11yStatic, tailwind,
  };
}

// The context from what the last run wrote: the code capture's props and slots, Figma's properties, the catalog, the
// authored contract and the config. components: the components as another reader already has them (intent-truth.mjs's
// facts), to read nothing twice.
export function readRuleContext(ROOT, cfg = {}, { components = null } = {}) {
  const json = (p) => { try { return JSON.parse(readFileSync(resolve(ROOT, p), 'utf8')); } catch { return null; } };
  const code = json(codeSnapshotPath(cfg)) ?? {};
  let comps = components;
  if (!comps) {
    comps = {};
    const add = (n) => (comps[n] ??= { props: {} });
    for (const [n, a] of Object.entries(code.api ?? {})) {
      const c = add(n);
      for (const [p, d] of Object.entries(a?.props ?? {})) c.props[p] = { type: d?.type ?? null, options: Array.isArray(d?.options) ? d.options.map(String) : null };
      if (a?.slots?.named?.length) c.slots = [...a.slots.named];
    }
    for (const [n, x] of Object.entries(json(cfg.paths?.compPropsSnapshot ?? 'figma-component-props.snapshot.json') ?? {})) {
      if (n.startsWith('_') || !x?.properties) continue;
      const c = add(n);
      for (const [k, d] of Object.entries(x.properties)) { const p = k.split('#')[0]; if (!c.props[p]) c.props[p] = { type: String(d?.type ?? '').toLowerCase() || null, options: Array.isArray(d?.variantOptions) ? d.variantOptions.map(String) : null }; }
    }
  }
  const tailwind = cfg.tailwind === true || (cfg.tailwind !== false && ['tailwind.config.js', 'tailwind.config.ts', 'tailwind.config.mjs', 'tailwind.config.cjs'].some((f) => existsSync(join(ROOT, f))));
  return ruleContext({ components: comps, tokens: Object.keys(code.tokens ?? {}), authored: json(cfg.contracts?.authored ?? 'contract.authored.json') ?? {}, catalog: json(join(cfg.contracts?.out ?? 'contracts', 'catalog.json')) ?? {}, imports: cfg.imports ?? {}, editCheck: !(cfg.hooks === false || cfg.editCheck === false), a11yStatic: cfg.a11yStatic !== false, tailwind });
}

// ── Reading one rule ────────────────────────────────────────────────────────────────────────────────────────────────
// Every component the text names, in order, however it spells it (cardTile, CardTile, <card-tile>, card tile, Tiles),
// and the page's own component where the text says it, it or this. → [{ name, at, end, own? }]
function subjects(text, ctx, own) {
  const byKey = new Map(ctx.names.map((c) => [norm(c), c]).filter(([k]) => k.length > 2));
  const toks = [...String(text).matchAll(/<?\/?([\p{L}][\p{L}\d_-]*)/gu)].map((m) => ({ w: m[1], at: m.index }));
  const out = [];
  for (let i = 0; i < toks.length; i++) {
    let hit = null;
    for (const span of [2, 1]) {
      const part = toks.slice(i, i + span);
      if (part.length < span) continue;
      const k = norm(part.map((t) => t.w).join(''));
      const name = byKey.get(k) ?? byKey.get(k.replace(/e?s$/, '')) ?? byKey.get(k.replace(/s$/, ''));
      if (name) { hit = { name, at: part[0].at, end: part[span - 1].at + part[span - 1].w.length }; i += span - 1; break; }
    }
    if (hit) { out.push(hit); continue; }
    if (own && PRONOUN.test(fold(toks[i].w)) && /^(it|this|isto|este|esta|ele|ela|dele|dela|nele|nela)$/i.test(fold(toks[i].w))) out.push({ name: own, at: toks[i].at, end: toks[i].at + toks[i].w.length, own: true });
  }
  return out;
}
const propsOf = (ctx, c) => ctx.components[c]?.props ?? Object.fromEntries(Object.entries(ctx.catalog[c]?.props ?? {}).map(([k, d]) => [d?.codeName ?? k, { type: d?.type ?? null, options: Array.isArray(d?.values) ? d.values.map(String) : null }]));
const slotsOf = (ctx, c) => [...new Set([...(ctx.components[c]?.slots ?? []), ...Object.entries(ctx.catalog[c]?.props ?? {}).filter(([, d]) => d?.type === 'children' || d?.slot).map(([k]) => k)])];
const word = (w) => new RegExp(`(?<![\\w-])${esc(fold(w))}(?![\\w-])`);

// The rule's own words, without the marks its page gives it: a level in brackets, a title it is led by.
const own = (r) => flat(String(r?.text ?? r ?? '').replace(/\s*\((must|should|may|required|recommended|optional)\)\s*$/i, ''));

// One rule. component: the page's own. → { text, status, check?, by?, guard?, proposal?: { text, place }, vague?,
// rewrite?, why }
export function classifyRule(text, { component = null, entity = null } = {}, ctx = ruleContext()) {
  const raw = own(text), t = fold(raw);
  const codes = [...raw.matchAll(/`([^`\n]+)`/g)].map((m) => m[1].trim());
  const named = subjects(raw.replace(/`/g, ' '), ctx, component);
  const NEG = isPt(t, raw) ? NEG_PT : NEG_EN;
  const neg = NEG.test(t), must = MUST.test(t);
  const done = (x) => ({ text: raw, ...x, ...(x.status === 'checked' && x.by !== 'a11y' && x.by !== 'catalog' && !ctx.editCheck ? { status: 'checkable', off: true, check: `${x.check} (turned off: ds-config.json → editCheck)` } : {}) });
  const authored = ctx.authored?.components ?? {};
  const neverOf = (p) => [...(Object.entries(authored).find(([n]) => norm(n) === norm(p))?.[1]?.neverCombineWith ?? []), ...(ctx.catalog[p]?.neverCombineWith ?? [])];
  const sameGuard = (g) => ctx.guards.find((x) => x.kind === g.kind && norm(x.component) === norm(g.component) && (g.kind !== 'props' && g.kind !== 'max' || JSON.stringify(Object.entries(x.props ?? {}).sort()) === JSON.stringify(Object.entries(g.props ?? {}).sort()))
    && (g.kind !== 'value' || String(x.value).toLowerCase() === String(g.value).toLowerCase()) && (g.kind !== 'requires' || norm(x.prop ?? x.slot) === norm(g.prop ?? g.slot)) && (g.kind !== 'max' || Number(x.max) === Number(g.max)));
  const guarded = (g, text, place) => {
    const had = sameGuard(g);
    return had ? done({ status: 'checked', by: 'edit', check: `the edit check, by the guard in contract.authored.json${had.key ? ` (${had.key})` : had.lesson ? ` (lesson ${had.lesson})` : ''}`, guard: g })
      : done({ status: 'checkable', guard: g, proposal: { text, place } });
  };

  // A component put inside another: two of them named, or one inside another of its kind.
  if (neg && named.length) {
    let pair = null;
    const [a, b] = named;
    if (b && a.name !== b.name) {
      const between = fold(raw.slice(a.end, b.at)), before = fold(raw.slice(0, a.at));
      if (HOLDS.test(between)) pair = { parent: a.name, child: b.name };
      else if (INSIDE.test(between) || (PUT.test(before) && INSIDE.test(`${between} in`))) pair = { parent: b.name, child: a.name };
    } else if (named.every((x) => x.name === a.name) && ((INSIDE.test(fold(raw.slice(a.end))) || HOLDS.test(fold(raw.slice(a.end)))) && ANOTHER.test(fold(raw.slice(a.end))) || /\b(nest(ed|ing)?|aninha\w*)\b/.test(t))) pair = { parent: a.name, child: a.name };
    if (pair) {
      const g = { kind: 'pairing', ...pair };
      const p = Object.keys(ctx.catalog).find((n) => norm(n) === norm(pair.parent));
      const def = p ? ctx.catalog[p] : null;
      const open = Object.values(def?.props ?? {}).some((e) => e?.type === 'children' && !e.slot?.preferredOnly);
      if (neverOf(pair.parent).some((x) => norm(x) === norm(pair.child))) return done({ status: 'checked', by: 'edit', check: `the edit check's nesting rules (contract.authored.json or the catalog → ${pair.parent}.neverCombineWith)`, guard: g });
      if (def?.children?.length && !def.children.some((x) => norm(x) === norm(pair.child)) && !open && pair.parent !== pair.child) return done({ status: 'checked', by: 'edit', check: `the edit check's nesting rules (the catalog: ${pair.parent} holds only ${def.children.join(', ')})`, guard: g });
      return done({ status: 'checkable', guard: g, proposal: { text: `${pair.parent} never contains ${pair.child}.`, place: `contract.authored.json → ${pair.parent}.neverCombineWith` } });
    }
  }

  // An import, and the one that replaces it.
  if (IMPORT_W.test(t) || /\bfrom\b/.test(t)) {
    const mods = [...raw.matchAll(/[`'"]((?:@[\w.-]+\/)?[\w.-]+(?:\/[\w.@-]+)*)[`'"]/g)].filter((m) => /[@/]/.test(m[1]) || IMPORT_W.test(t)).map((m) => ({ v: m[1], at: m.index }))
      .filter((m) => !/^--/.test(m.v) && !ctx.names.some((n) => norm(n) === norm(m.v)));
    if (mods.length && (neg || INSTEAD.test(t))) {
      const io = INSTEAD.exec(t), n = NEG.exec(t);
      let wrong = null, right = null;
      if (io) { wrong = mods.find((m) => m.at > io.index) ?? null; right = mods.filter((m) => m.at < io.index).pop() ?? null; }
      else { wrong = mods.find((m) => m.at > n.index) ?? mods[0]; right = mods.find((m) => m !== wrong) ?? null; }
      const to = right?.v ?? (wrong && ctx.system && wrong.v !== ctx.system ? ctx.system : null);
      if (wrong && to) {
        if (ctx.replaced[wrong.v]) return done({ status: 'checked', by: 'edit', check: 'the edit check\'s imports (ds-config.json → imports.replaced)', guard: { kind: 'import', from: wrong.v, to: ctx.replaced[wrong.v] } });
        return done({ status: 'checkable', guard: { kind: 'import', from: wrong.v, to }, proposal: { text: `Never import from ${wrong.v}; import from ${to}.`, place: 'ds-config.json → imports.replaced' } });
      }
    }
  }

  // The component the rule is about, for what follows: the first it names, else the page's.
  const about = named.find((x) => !x.own)?.name ?? component ?? named[0]?.name ?? null;
  const props = about ? propsOf(ctx, about) : {};
  // Its props as the rule sets them: prop="value", `prop=value`, a value only one of its props takes (`loud`), or a prop
  // and one of its values named in words ("the loud tone").
  const setsOf = () => {
    const out = {};
    for (const m of raw.matchAll(/(?<![\w-]):?([a-zA-Z][\w-]*)\s*=\s*\{?\s*["'`]?([\w-]+)["'`]?/g)) if (!/^(class|style|id|key|href|src)$/i.test(m[1]) && (props[m[1]] || !Object.keys(props).length)) out[m[1]] = m[2];
    for (const [p, d] of Object.entries(props)) {
      if (out[p] || !d?.options?.length) continue;
      const opts = d.options.filter((o) => String(o).length > 1 && !/^(true|false)$/i.test(o));
      const coded = opts.find((o) => codes.some((c) => norm(c) === norm(o)));
      const others = Object.entries(props).filter(([q, e]) => q !== p && (e?.options ?? []).some((o) => norm(o) === norm(coded)));
      if (coded && !others.length) { out[p] = coded; continue; }
      const inWords = opts.find((o) => norm(o).length > 2 && word(o).test(t));
      if (inWords && (word(p).test(t) || !Object.entries(props).some(([q, e]) => q !== p && (e?.options ?? []).some((o) => norm(o) === norm(inWords))))) out[p] = inWords;
    }
    return out;
  };
  const sets = about ? setsOf() : {};

  // At most so many of a component on one screen.
  const maxM = MAX_HEAD.exec(t) ?? MAX_PER.exec(t);
  const most = /\b(at most|no more than|never more than|a maximum of|no maximo|nunca mais|um maximo de)\b/.test(t);
  const per = MAX_PER.test(t) && (/\b(per|por)\s/.test(t) || /\b(only|just|single|unic[oa]|apenas|so|somente)\b/.test(t));
  if (maxM && about && (most || per)) {
    const n = COUNT[maxM[1].split(/\s+/).pop()] ?? COUNT[maxM[1]] ?? 1;
    const g = { kind: 'max', component: about, ...(Object.keys(sets).length ? { props: sets } : {}), max: n };
    const withP = Object.entries(sets).map(([k, v]) => `${k}="${v}"`).join(' and ');
    return guarded(g, `At most ${n} ${about}${withP ? ` with ${withP}` : ''} on one screen.`, 'contract.authored.json → guards');
  }

  // A prop combination or value not allowed.
  if (neg && about && Object.keys(sets).length && !WITHOUT.test(t)) {
    const bad = Object.entries(sets).filter(([p, v]) => props[p]?.options?.length && !props[p].options.some((o) => norm(o) === norm(v)));
    if (bad.length) return done({ status: 'checked', by: 'edit', check: `the edit check's prop values: \`${bad[0][0]}\` takes ${props[bad[0][0]].options.map((o) => `\`${o}\``).join(', ')}, so \`${bad[0][1]}\` is flagged`, guard: { kind: 'props', component: about, props: sets } });
    const list = Object.entries(sets).map(([k, v]) => `${k}="${v}"`).join(' with ');
    return guarded({ kind: 'props', component: about, props: sets }, `${about} never takes ${list}.`, 'contract.authored.json → guards');
  }

  // A prop or a slot the component always has ("Tile always has a `title`", "never a Tile without a title").
  const req = (REQ.test(t) && !neg && HAVE.test(t.slice(REQ.exec(t).index))) || (neg && WITHOUT.test(t));
  if (about && req) {
    const from = Math.max(0, (neg ? WITHOUT.exec(t) : REQ.exec(t))?.index ?? 0);
    const slots = slotsOf(ctx, about);
    const pick = codes.map((c) => c.replace(/^[:#@]/, '')).find((c) => props[c] || slots.includes(c) || /^aria-[a-z]+$/.test(c))
      ?? [...Object.keys(props), ...slots].filter((p) => norm(p).length > 2 && word(p).test(t.slice(from))).sort((a, b) => t.slice(from).search(word(a)) - t.slice(from).search(word(b)))[0];
    if (pick) {
      const slot = !props[pick] && slots.includes(pick);
      const g = { kind: 'requires', component: about, ...(slot ? { slot: pick } : { prop: pick }) };
      return guarded(g, slot ? `${about} always has its ${pick} slot.` : `${about} always has \`${pick}\`.`, 'contract.authored.json → guards');
    }
  }

  // A token or a value never to write, and the one to write instead.
  const values = [...raw.matchAll(/var\(\s*(--[\w-]+)\s*\)|(--[a-zA-Z][\w-]*)|(#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsla?|oklch)\([^)]*\)|(?<![\w.-])\d*\.?\d+(?:px|rem)\b)/g)].map((m) => ({ v: m[1] ?? m[2] ?? m[3], at: m.index, token: !!(m[1] ?? m[2]) }));
  if (neg && values.length) {
    const io = INSTEAD.exec(t), n = NEG.exec(t);
    let wrong, right = null;
    if (io) { wrong = values.find((x) => x.at > io.index) ?? values[0]; right = values.filter((x) => x.at < io.index).pop() ?? null; }
    else { wrong = values.find((x) => x.at > n.index) ?? values[0]; const u = USE.exec(t.slice(n.index)); right = values.find((x) => x !== wrong && (!u || x.at > n.index + u.index)) ?? values.find((x) => x !== wrong) ?? null; }
    if (right && right.v === wrong.v) right = null;
    if (!wrong.token) return done({ status: 'checked', by: 'edit', check: /px|rem/.test(wrong.v) ? 'the edit check: a size written by hand' : 'the edit check: a colour written by hand', guard: { kind: 'value', value: wrong.v } });
    if (ctx.tokens.size && !ctx.tokens.has(wrong.v)) return done({ status: 'checked', by: 'edit', check: 'the edit check: a CSS variable declared nowhere', guard: { kind: 'value', value: wrong.v } });
    const on = named.find((x) => !x.own)?.name ?? component ?? null;
    const g = { kind: 'value', value: wrong.v, ...(right ? { use: right.v } : {}), ...(on ? { component: on } : {}) };
    return guarded(g, `${wrong.v} is never written${on ? ` on ${on}` : ''}${right ? `; use ${right.v}` : ''}.`, 'contract.authored.json → guards');
  }

  // What the engine's checks hold on every edit, whatever the component.
  if (neg || must || USE.test(t)) for (const u of UNIVERSAL) if (u.test(t, ctx) && (u.by !== 'a11y' || ctx.a11yStatic)) return done({ status: 'checked', by: u.by, check: u.check });

  // Vague: it names nothing a reviewer could look for.
  const concrete = codes.some((c) => !component || norm(c) !== norm(component)) || named.some((x) => !x.own && x.name !== component) || values.length
    || /\d/.test(t) || new RegExp(`\\b${NUM}\\b`).test(t) && /\b(per|por|at most|no maximo)\b/.test(t)
    || Object.entries(props).some(([p, d]) => (norm(p).length > 3 && word(p).test(t)) || (d?.options ?? []).some((o) => norm(o).length > 3 && word(o).test(t)));
  if (!concrete && VAGUE.test(t)) {
    const rewrite = rewriteOf(raw, { component: component ?? about, entity }, ctx);
    return done({ status: 'judgment', vague: true, ...(rewrite ? { rewrite } : {}), why: 'It names no component, prop, value, token or count: a reviewer cannot tell whether a screen follows it.' });
  }
  return done({ status: 'judgment' });
}

// ── A vague rule, rewritten ─────────────────────────────────────────────────────────────────────────────────────────
// One sentence a reviewer can check, in the rule's own language, from what the page says and the component has: at most
// one on a screen for "sparingly", the same prop on every one for "consistently", a short label for "clear", an
// accessible name for "accessible", and else its own When to use. null when the page says nothing to write it from.
export function rewriteOf(text, { component = null, entity = null } = {}, ctx = ruleContext()) {
  const t = fold(text), C = component ?? null;
  if (!C) return null;
  const pt = isPt(t, text);
  const props = propsOf(ctx, C);
  const choice = Object.entries(props).find(([, d]) => (d?.options ?? []).length >= 2)?.[0] ?? null;
  const label = Object.keys(props).find((p) => /^(label|text|title|heading|caption|rotulo|texto|titulo)$/i.test(p)) ?? null;
  if (/\b(sparingly|overuse\w*|too (many|much)|com moderacao|moderad\w*|abus\w*|demasiad\w*)\b/.test(t)) return pt ? `Use no máximo um ${C} por ecrã.` : `Use at most one ${C} per screen.`;
  if (/\b(consistent(ly)?|coheren\w*|consisten\w*|coerente\w*)\b/.test(t)) return pt
    ? (choice ? `Todos os ${C} de um ecrã têm o mesmo \`${choice}\`.` : `Todos os ${C} de um ecrã têm as mesmas props.`)
    : (choice ? `Every ${C} on one screen takes the same \`${choice}\`.` : `Every ${C} on one screen is set with the same props.`);
  if (/\b(clear(ly)?|concise(ly)?|short|clar[oa]s?|concis[oa]s?|curt[oa]s?|meaningful|significativ\w*)\b/.test(t)) return pt
    ? `${label ? `O \`${label}\` de ${C}` : `O texto de ${C}`} diz o que faz em três palavras no máximo, a começar por um verbo.`
    : `${label ? `${C}'s \`${label}\`` : `${C}'s text`} says what it does in three words at most, starting with a verb.`;
  if (/\b(accessib\w*|acessiv\w*)\b/.test(t)) return pt
    ? `${C} tem sempre um nome acessível: o seu texto visível, ou \`aria-label\` quando não mostra texto.`
    : `${C} always has an accessible name: its visible text, or \`aria-label\` when it shows none.`;
  const when = (entity?.whenToUse ?? []).map(flat).find(Boolean);
  if (when) {
    const w = lowerFirst(when);
    if (pt) return /^(para|quando|em|no|na|onde|com)\b/i.test(fold(w)) ? `Use ${C} só ${w}.` : `Use ${C} só para isto: ${w}.`;
    return /^(to|for|when|where|in|on|with|inside)\b/i.test(w) ? `Use ${C} only ${w}.` : `Use ${C} only for this: ${w}.`;
  }
  const what = (entity?.purpose ?? []).map(flat).find(Boolean);
  if (what) return pt ? `Use ${C} só para o que a sua página diz que é: ${lowerFirst(what)}.` : `Use ${C} only for what its page says it is for: ${lowerFirst(what)}.`;
  return null;
}

// ── A page, and the layer ───────────────────────────────────────────────────────────────────────────────────────────
// A rule's key, as its proposal is answered: guard:<page>:<id> for its guard, rewrite:<page>:<id> for its rewrite.
export const ruleKey = (kind, page, text) => `${kind}:${page}:${hash(fold(own(text)))}`;
const DRAFTED = /^\s*(\*\*|__)?draft\b/i;
// Every rule of a page, classified, with the answers the team gave its proposals. → { n, checked, checkable, judgment,
// vague, rules: [classifyRule + key?, answer?] } or null when the page has no rules.
export function pageRules(entity, component, ctx, { decisions = {} } = {}) {
  const list = (entity?.rules ?? []).filter((r) => !r?.draftOf && !DRAFTED.test(String(r?.text ?? r))).map(own).filter(Boolean);
  if (!list.length) return null;
  const rules = [...new Set(list)].map((text) => {
    const r = classifyRule(text, { component, entity }, ctx);
    const kind = r.status === 'checkable' && r.proposal ? 'guard' : r.vague && r.rewrite ? 'rewrite' : null;
    if (!kind) return r;
    const key = ruleKey(kind, entity.name, text);
    return { ...r, key, ...(decisions[key]?.answer ? { answer: decisions[key].answer, answered: { by: decisions[key].by ?? null, at: decisions[key].at ?? null } } : {}) };
  });
  const count = (s) => rules.filter((r) => r.status === s).length;
  return { n: rules.length, checked: count('checked'), checkable: count('checkable'), judgment: count('judgment'), vague: rules.filter((r) => r.vague).length, rules };
}
// Every page of the layer with rules. matched: Map(component → entity) (intent-layer.mjs → matchComponents).
// → Map(entity → pageRules)
export function layerRules(snap, matched, ctx, { decisions = {} } = {}) {
  const forEntity = new Map([...(matched ?? [])].map(([n, e]) => [e, n]));
  const out = new Map();
  for (const e of snap?.entities ?? []) {
    if (e.kind === 'token') continue;
    const r = pageRules(e, forEntity.get(e) ?? null, ctx, { decisions });
    if (r) out.set(e, r);
  }
  return out;
}
// The totals over the pages. → { pages, n, checked, checkable, judgment, vague }
export function ruleTotals(byPage) {
  const t = { pages: 0, n: 0, checked: 0, checkable: 0, judgment: 0, vague: 0 };
  for (const r of byPage.values()) { t.pages++; for (const k of ['n', 'checked', 'checkable', 'judgment', 'vague']) t[k] += r[k]; }
  return t;
}

// The proposals the rules make, as intent-proposals.mjs keeps them: a guard for each checkable rule, a rewrite for each
// vague one. byPage: layerRules'. → Map(key → proposal)
export function ruleProposals(byPage) {
  const out = new Map();
  for (const [e, r] of byPage) {
    for (const x of r.rules) {
      if (!x.key) continue;
      if (x.key.startsWith('guard:')) out.set(x.key, { kind: 'guard', subject: x.guard.component ?? x.guard.parent ?? e.name, page: e.name, rule: x.text, guard: x.guard, place: x.proposal.place, effect: 'guard',
        proposal: `Hold the rule “${x.text.replace(/[.]$/, '')}” as a check: ${x.proposal.text}`,
        evidence: [`The edit check can hold it on every edit: ${x.proposal.text}`, `A yes writes it into ${x.proposal.place}.`],
        yes: `Written into ${x.proposal.place}: the edit check holds it on every edit from then on, and the rule says it is checked.`,
        no: 'It stays a rule agents read; it is not proposed again.' });
      else out.set(x.key, { kind: 'rewrite', subject: e.name, page: e.name, rule: x.text, rewrite: x.rewrite, effect: 'draft',
        proposal: `Rewrite the rule “${x.text.replace(/[.]$/, '')}” as: ${x.rewrite}`,
        evidence: [x.why, 'The rewrite is one sentence a reviewer can check, from what the page and the component say.'],
        yes: 'The sentence is drafted on the page, under Rules, for the team to approve; agents read the rule as it is until then.',
        no: 'The rule stays as it is.' });
    }
  }
  return out;
}

// ── What people and agents read ─────────────────────────────────────────────────────────────────────────────────────
// The line each rule gets: its status and what holds it, what would, or its rewrite.
export function ruleSaid(r) {
  if (r.status === 'checked') return `checked by ${r.check}`;
  if (r.status === 'checkable') return r.off ? `checkable: ${r.check}` : `checkable as ${r.proposal.text}${r.answer === 'no' ? ' (declined)' : ''}`;
  return r.vague ? `vague${r.rewrite ? `: rewrite as "${r.rewrite}"${r.answer === 'no' ? ' (declined)' : ''}` : ': write the case it means'}` : 'judgment: a person, or a model judging the page (--judge-pages)';
}
const MARK = { checked: '✓', checkable: '◇', judgment: '·' };
// For --check-intent: the totals, then each page's count and each rule with what holds it. → [lines]
export function ruleReport(byPage, { max = 40 } = {}) {
  const t = ruleTotals(byPage);
  if (!t.n) return [];
  const lines = [`📏 Rules: ${t.n} on ${t.pages} page${t.pages === 1 ? '' : 's'} · ${t.checked} checked · ${t.checkable} checkable · ${t.judgment} judgment${t.vague ? ` (${t.vague} vague)` : ''}`];
  let shown = 0;
  for (const [e, r] of byPage) {
    lines.push(`  ${e.name}${e.file ? ` (${e.file})` : ''}: ${r.n} rule${r.n === 1 ? '' : 's'} · ${r.checked} checked · ${r.checkable} checkable · ${r.judgment} judgment${r.vague ? ` (${r.vague} vague)` : ''}`);
    for (const x of r.rules) {
      if (shown++ >= max) continue;
      lines.push(`    ${MARK[x.status]} "${x.text.length > 120 ? x.text.slice(0, 119) + '…' : x.text}"`, `        ${ruleSaid(x)}${x.key && !x.answer ? `  [${x.key}]` : ''}`);
    }
  }
  if (shown > max) lines.push(`    … and ${shown - max} more rules.`);
  return lines;
}
// What a contract gives agents for each rule: its words, its status and what holds it. Checked and checkable rules are
// hard constraints. → [{ text, status, check?, guard? }]
export function markedRules(rules, component, ctx, { entity = null } = {}) {
  return (rules ?? []).map((text) => {
    const r = classifyRule(text, { component, entity }, ctx);
    return { text: String(text), status: r.status, ...(r.status === 'checked' ? { check: r.check } : r.status === 'checkable' ? { guard: r.proposal?.text ?? r.check } : {}) };
  });
}
