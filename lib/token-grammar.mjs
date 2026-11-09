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
// Five rules:
//   token-name-case      every part of a name is written in the case most parts are (a single lower-case word fits any)
//   token-one-name       one idea has one name (press or pressed, bg or background), the one most names use
//   token-one-scale      sizes are named on one scale (s, m, l or small, medium, large), the one most use
//   token-scale-order    a set of sizes grows with its steps (m is never larger than l)
//   token-states         a role has the states most roles have (hover, press), never fewer
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
  return rules;
}
