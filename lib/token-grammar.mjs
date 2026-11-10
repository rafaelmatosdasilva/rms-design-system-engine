// token-grammar.mjs - the grammar of a system's token names, mined from the names themselves.
//
// The checks read a token's name for its look and for a brand, never for the way the system writes it. A token named
// against the system's own grammar is the one an agent guesses wrong: it asks for button/background/pressed where the
// system wrote press, or for medium where every other size is m. Nothing here is imposed. Each rule is what most of the
// system's names already do, and a system that does none of it has none.
//
//   nameRules(figmaTokens) → [{ id, says, items: [{ where, value, fits }] }], for the construction grammar to judge
//     figmaTokens: the vars snapshot's figmaTokens ({ tokens: [{ name, kind, values: { mode: value } }] })
//
// Ten rules:
//   token-name-case      every part of a name is written in the case most parts are (a single lower-case word fits any)
//   token-one-name       one idea has one name (press or pressed, bg or background), the one most names use
//   token-one-scale      sizes are named on one scale (s, m, l or small, medium, large), the one most use
//   token-scale-order    a set of sizes grows with its steps (m is never larger than l)
//   token-states         a role has the states most roles have (hover, press), never fewer
//   token-segment-order  a state, and a size, sits where in a name most of them sit (the last part, as a rule)
//   token-category-order a category word (color, radius) sits where most names holding it put it
//   token-property-order what a colour is for (background, text) and its state in the order most names put them
//   token-on-scale       a spacing or radius value is a step of the system's own scale (a multiple of 4, say)
//   token-on-colour      a surface colour has a colour for what sits on it (fill beside text, surface beside on-surface)
//
// Pure: nothing is read or written here.

const SHARE = 0.8;   // what most is: FIX_SHARE, as the construction grammar
const segsOf = (name) => String(name).split('/').filter(Boolean);

// The case one part of a name is written in. A single lower-case word is every case's.
const caseOf = (s) => /^[a-z0-9]+$/.test(s) ? 'lower' : /^[a-z][a-z0-9]*([A-Z][a-z0-9]*)+$/.test(s) ? 'camelCase' : /^[a-z0-9]+(-[a-z0-9]+)+$/.test(s) ? 'kebab-case'
  : /^[a-z0-9]+(_[a-z0-9]+)+$/.test(s) ? 'snake_case' : /^[A-Z][a-zA-Z0-9]*$/.test(s) ? 'PascalCase' : 'other';

// Words that name one idea two ways. The first that most names use is the system's.
const SAME = [['bg', 'background'], ['fg', 'foreground'], ['danger', 'error'], ['warning', 'warn', 'caution'], ['press', 'pressed'],
  ['hover', 'hovered'], ['focus', 'focused'], ['disable', 'disabled'], ['select', 'selected'], ['txt', 'text'], ['btn', 'button'],
  ['img', 'image'], ['nav', 'navigation'], ['desc', 'description']];
// The ways a size is named, step by step, smallest first.
const SCALES = {
  short: ['xxs', 'xs', 's', 'm', 'l', 'xl', 'xxl'],
  abbreviated: ['xsm', 'sm', 'md', 'lg', 'xlg'],
  words: ['xsmall', 'small', 'medium', 'large', 'xlarge'],
};
const STEP = new Map(Object.entries(SCALES).flatMap(([scale, steps]) => steps.map((s, i) => [s, { scale, rank: i }])));
// States a role takes, as words in its name. Default is the role at rest, never one it can lack.
const STATES = ['hover', 'press', 'pressed', 'active', 'focus', 'focused', 'disabled', 'selected', 'checked'];
const AT_REST = ['default', 'rest', 'enabled', 'idle', 'normal'];
// The states a person brings about by touching a control. A role with none of them (a selected and an unselected
// colour) is not one that answers a hover, so it is never held to the states the interactive roles have.
const INTERACTIVE = new Set(['hover', 'press', 'pressed', 'active', 'focus', 'focused']);
const num = (v) => { const n = parseFloat(String(v)); return Number.isFinite(n) ? n : null; };

export function nameRules(figmaTokens) {
  const tokens = (figmaTokens?.tokens ?? []).filter((t) => t?.name);
  const rules = [];
  if (tokens.length < 3) return rules;

  // Case: the case most parts that say one are written in.
  const counts = {};
  for (const t of tokens) for (const s of segsOf(t.name)) { const c = caseOf(s); if (c !== 'lower') counts[c] = (counts[c] ?? 0) + 1; }
  const [mainCase] = Object.entries(counts).filter(([c]) => c !== 'other').sort((a, b) => b[1] - a[1])[0] ?? [];
  if (mainCase) rules.push({ id: 'token-name-case', says: `A token's name is written in ${mainCase}`, items: tokens.map((t) => {
    const off = segsOf(t.name).filter((s) => !['lower', mainCase].includes(caseOf(s)));
    return { where: t.name, value: off.join(', '), fits: !off.length };
  }) });

  // One idea, one name.
  const used = {};
  for (const t of tokens) for (const s of segsOf(t.name)) used[s.toLowerCase()] = (used[s.toLowerCase()] ?? 0) + 1;
  const split = SAME.map((g) => g.filter((w) => used[w])).filter((g) => g.length >= 2);
  if (split.length) {
    const main = new Map(split.map((g) => [g, g.slice().sort((a, b) => used[b] - used[a])[0]]));
    const groupOf = new Map(split.flatMap((g) => g.map((w) => [w, g])));
    rules.push({ id: 'token-one-name', says: `One idea has one name: ${split.map((g) => `${main.get(g)}, never ${g.filter((w) => w !== main.get(g)).join(' or ')}`).join('; ')}`,
      items: tokens.filter((t) => segsOf(t.name).some((s) => groupOf.has(s.toLowerCase()))).map((t) => {
        const off = segsOf(t.name).map((s) => s.toLowerCase()).filter((w) => groupOf.has(w) && main.get(groupOf.get(w)) !== w);
        return { where: t.name, value: off.map((w) => `${w}, where the system says ${main.get(groupOf.get(w))}`).join('; '), fits: !off.length };
      }) });
  }

  // One scale for sizes. A short step that is also a word of its own (s, m, l) counts only beside another step of its scale.
  const stepsIn = (t) => segsOf(t.name).map((s) => s.toLowerCase()).filter((s) => STEP.has(s));
  const scaleUse = {};
  for (const t of tokens) for (const s of stepsIn(t)) scaleUse[STEP.get(s).scale] = (scaleUse[STEP.get(s).scale] ?? 0) + 1;
  const scales = Object.entries(scaleUse).filter(([, n]) => n >= 2).sort((a, b) => b[1] - a[1]);
  if (scales.length >= 2) {
    const [main] = scales[0];
    rules.push({ id: 'token-one-scale', says: `Sizes are named on one scale: ${SCALES[main].join(', ')}`, items: tokens.filter((t) => stepsIn(t).length).map((t) => {
      const off = stepsIn(t).filter((s) => STEP.get(s).scale !== main);
      return { where: t.name, value: off.map((s) => `${s} (${STEP.get(s).scale === 'words' ? 'a word' : STEP.get(s).scale})`).join(', '), fits: !off.length };
    }) });
  }

  // A set of sizes grows with its steps: the tokens one name apart but for their step, in one mode, smallest first.
  const sets = new Map();
  for (const t of tokens) {
    const parts = segsOf(t.name), at = parts.findIndex((s) => STEP.has(s.toLowerCase()));
    if (at < 0) continue;
    const v = num(Object.values(t.values ?? {})[0]);
    if (v == null) continue;
    const key = [...parts.slice(0, at), '*', ...parts.slice(at + 1)].join('/');
    if (!sets.has(key)) sets.set(key, []);
    sets.get(key).push({ step: parts[at].toLowerCase(), v });
  }
  const sized = [...sets].filter(([, l]) => l.length >= 3 && new Set(l.map((x) => STEP.get(x.step).scale)).size === 1);
  if (sized.length) rules.push({ id: 'token-scale-order', says: 'A set of sizes grows with its steps: a larger step is never smaller', items: sized.map(([key, l]) => {
    const sorted = l.slice().sort((a, b) => STEP.get(a.step).rank - STEP.get(b.step).rank);
    const off = sorted.slice(1).map((x, i) => [sorted[i], x]).filter(([a, b]) => b.v < a.v).map(([a, b]) => `${a.step} ${a.v} > ${b.step} ${b.v}`);
    return { where: key, value: off.join(', '), fits: !off.length };
  }) });

  // An interactive role has the states most interactive roles have: tokens one name apart but for their state.
  const roles = new Map();
  for (const t of tokens) {
    const parts = segsOf(t.name), at = parts.findIndex((s) => [...STATES, ...AT_REST].includes(s.toLowerCase()));
    if (at < 0) continue;
    const key = [...parts.slice(0, at), '*', ...parts.slice(at + 1)].join('/');
    if (!roles.has(key)) roles.set(key, new Set());
    roles.get(key).add(parts[at].toLowerCase());
  }
  const stateful = [...roles].filter(([, s]) => s.size >= 2 && [...s].some((x) => INTERACTIVE.has(x)));
  if (stateful.length >= 3) {
    const expected = STATES.filter((s) => stateful.filter(([, have]) => have.has(s)).length >= stateful.length * SHARE);
    if (expected.length) rules.push({ id: 'token-states', says: `An interactive role has the states most have: ${expected.join(', ')}`, items: stateful.map(([key, have]) => {
      const missing = expected.filter((s) => !have.has(s));
      return { where: key, value: missing.length ? `no ${missing.join(', no ')}` : '', fits: !missing.length };
    }) });
  }
  rules.push(...orderRules(tokens), ...categoryRules(tokens), ...scaleRules(tokens), ...onColourRules(tokens));
  return rules;
}

const isState = (s) => [...STATES, ...AT_REST].includes(s.toLowerCase());
const isStep = (s) => STEP.has(s.toLowerCase());
const PLACE = (n) => n === 0 ? 'the last part' : n === 1 ? 'the part before the last' : `part ${n + 1} from the end`;

// Where a state, and a size, sits in a name: counted from the end, since a name is read role first and narrows as it goes.
function orderRules(tokens) {
  const kinds = [['state', isState], ['size', isStep]].map(([kind, is]) => {
    const at = new Map();
    for (const t of tokens) { const parts = segsOf(t.name), i = parts.findLastIndex(is); if (i >= 0) at.set(t.name, parts.length - 1 - i); }
    if (at.size < 3) return null;
    const c = {};
    for (const n of at.values()) c[n] = (c[n] ?? 0) + 1;
    const [main] = Object.entries(c).sort((a, b) => b[1] - a[1])[0];
    return { kind, at, main: Number(main) };
  }).filter(Boolean);
  if (!kinds.length) return [];
  const items = tokens.filter((t) => kinds.some((k) => k.at.has(t.name))).map((t) => {
    const off = kinds.filter((k) => k.at.has(t.name) && k.at.get(t.name) !== k.main).map((k) => `its ${k.kind} is ${PLACE(k.at.get(t.name))}, where most names have it as ${PLACE(k.main)}`);
    return { where: t.name, value: off.join('; '), fits: !off.length };
  });
  return [{ id: 'token-segment-order', says: `A token's name puts ${kinds.map((k) => `its ${k.kind} as ${PLACE(k.main)}`).join(' and ')}`, items }];
}

// Where a category word sits (color, radius, shadow): each word where most names that hold it put it, counted from the
// end. Each word is its own: color last and radius one before it is a grammar, never a slip.
const CATEGORY = /^(color|colour|space|spacing|size|sizing|radius|font|typography|shadow|elevation|opacity|motion)$/i;
// The part that says what a colour is for (background, text, border). border is that, not a category, in a colour's name.
const PROPERTY = /^(bg|background|fill|surface|fg|foreground|text|content|border|outline|stroke|icon)$/i;
function categoryRules(tokens) { return [...placeRules(tokens, CATEGORY, 'token-category-order'), ...propertyStateRules(tokens)]; }

// Which comes first, the word for what a colour is for or its state (background/hover or hover/background): the order
// most names holding both use. Counted from either end, either word moves with the parts around it; their order does not.
function propertyStateRules(tokens) {
  const both = tokens.map((t) => { const parts = segsOf(t.name), p = parts.findIndex((x) => PROPERTY.test(x)), s = parts.findIndex(isState); return p >= 0 && s >= 0 ? [t.name, p < s] : null; }).filter(Boolean);
  if (both.length < 3) return [];
  const first = both.filter(([, x]) => x).length >= both.length / 2;
  return [{ id: 'token-property-order', says: `A token's name puts ${first ? 'what a colour is for before its state (background/hover)' : 'its state before what a colour is for (hover/background)'}`, items: both.map(([n, x]) => ({ where: n, value: x === first ? '' : (x ? 'what it is for comes before its state' : 'its state comes before what it is for'), fits: x === first })) }];
}
function placeRules(tokens, WORD, id) {
  const at = new Map();   // word -> Map(token -> place from the end)
  for (const t of tokens) segsOf(t.name).forEach((s, i, parts) => { if (!WORD.test(s)) return; const w = s.toLowerCase(); if (!at.has(w)) at.set(w, new Map()); if (!at.get(w).has(t.name)) at.get(w).set(t.name, parts.length - 1 - i); });
  const words = [...at].filter(([, m]) => m.size >= 3).map(([w, m]) => { const c = {}; for (const n of m.values()) c[n] = (c[n] ?? 0) + 1; return [w, m, Number(Object.entries(c).sort((a, b) => b[1] - a[1])[0][0])]; });
  if (!words.length) return [];
  const items = tokens.filter((t) => words.some(([, m]) => m.has(t.name))).map((t) => {
    const off = words.filter(([, m, main]) => m.has(t.name) && m.get(t.name) !== main).map(([w, m, main]) => `${w} is ${PLACE(m.get(t.name))}, where most names have it as ${PLACE(main)}`);
    return { where: t.name, value: off.join('; '), fits: !off.length };
  });
  return [{ id, says: `A token's name puts ${words.map(([w, , main]) => `${w} as ${PLACE(main)}`).join(', ')}`, items }];
}

// A spacing or radius value on the system's own scale: the largest of 8, 4 and 2 that most of its values are steps of.
const SPACED = /^(space|spacing|gap|padding|inset|margin|stack|radius|corner|rounding)$/;
function scaleRules(tokens) {
  const words = (s) => s.replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase().split(/[^a-z0-9]+/);
  const sized = tokens.filter((t) => t.kind !== 'COLOR' && segsOf(t.name).some((s) => words(s).some((w) => SPACED.test(w))))
    .map((t) => ({ t, v: num(Object.values(t.values ?? {})[0]) })).filter(({ v }) => v != null && v > 0 && v < 999);   // 9999 is a pill, never a step
  if (sized.length < 5) return [];
  // A value under one step (a 1 or 2px hairline on a 4px scale) is a half-step the scale allows, never off it.
  const base = [8, 4, 2].find((b) => sized.filter(({ v }) => v % b === 0).length >= sized.length * SHARE);
  if (!base) return [];
  return [{ id: 'token-on-scale', says: `A spacing or radius value is a step of the system's ${base}px scale`, items: sized.map(({ t, v }) => ({ where: t.name, value: v % base ? `${v}, between ${v - (v % base)} and ${v - (v % base) + base}` : '', fits: v < base || v % base === 0 })) }];
}

// A surface colour has a colour for what sits on it: a role with a background has a text or icon colour beside it.
// A role is the part of a name before the surface: its states come after, and a text that never changes on hover is
// still the text on the background that does.
const SURFACE = /^(bg|background|surface|fill|container|canvas)$/, ON = /^(on|fg|foreground|text|content|icon|label)$/;
function onColourRules(tokens) {
  const words = (s) => s.replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  const surfaces = new Map(), on = new Map();
  for (const t of tokens.filter((x) => x.kind === 'COLOR')) {
    const parts = segsOf(t.name);
    const o = parts.findIndex((s) => words(s).some((w) => ON.test(w)));
    if (o >= 0) { const role = parts.slice(0, o).join('/'); if (!on.has(role)) on.set(role, parts[o]); continue; }
    const i = parts.findIndex((s) => words(s).some((w) => SURFACE.test(w)));
    if (i >= 0) { const role = parts.slice(0, i).join('/'); if (!surfaces.has(role)) surfaces.set(role, parts[i]); }
  }
  if (surfaces.size < 3) return [];
  return [{ id: 'token-on-colour', says: 'A surface colour has a colour for what sits on it (its text or icon)', items: [...surfaces].map(([role, s]) => ({ where: [role, s].filter(Boolean).join('/'), value: on.has(role) ? '' : `no text or icon colour beside it${role ? ` under ${role}` : ''}`, fits: on.has(role) })) }];
}
