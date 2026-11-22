// finding-layers.mjs - which layer each finding belongs to, and what is still left for a person.
//
// A change passes three kinds of check, and they are not the same kind of answer:
//   • rule: a machine answers it yes or no, the same every time (a token or a value written by hand, the system's
//     component imported or one built again, a prop value the component takes). Every gate is one, and so is each
//     rule of the team's own pages that a person said yes to holding as a check.
//   • guidance: a model reads the change against what the team wrote (the accessibility judgement of a component's
//     words, the judgement of a page against its request) and says what it thinks, for a person to confirm.
//   • taste: what only a person in a review can call, how it looks and how it reads. No check answers it.
// A report that mixes them reads as one verdict. Kept apart, a pull request that passes every rule and every guidance
// says what is still the reviewer's, and a team sees how much of its review is still judgement, and which judgements
// keep getting the same answer and could become rules.
//
// And what each check does with a mistake: it prevents it (the guard holds the edit before it is made), catches it
// (a gate fails the run, the edit check answers once the edit is made) or advises (it is said, and nothing stops it).
//
//   LAYERS, DOES
//   layerOf(check)                 → 'rule' | 'guidance'
//   doesOf({ verdict, strength })  → 'prevents' | 'catches' | 'advises'
//   layerCounts(records)           → { rule: { fails, advisory }, guidance: { … } }
//   leftForPerson({ records, judged, components }) → lines for the end of a run's report

export const LAYERS = {
  rule: 'a machine answers it yes or no',
  guidance: 'a model reads it against what the team wrote, for a person to confirm',
  taste: 'only a person in a review can call it',
};
export const DOES = { prevents: 'holds the mistake before it is made', catches: 'finds it once it is made, and stops the run', advises: 'says it, and stops nothing' };

// The checks a model answers: they report under these names. Every other check is answered by the engine's own code.
const GUIDANCE = /^(Words judged|Accessibility judgement|Judged against the request|Page judgement|Prototype judgement|Second review)/i;
export const layerOf = (check) => (GUIDANCE.test(String(check ?? '').trim()) ? 'guidance' : 'rule');

// What a check does with a mistake, from what the engine already says of it: a rail that holds the edit prevents it, a
// verdict that fails the run (or a rail that notices it) catches it, an advisory finding advises.
export function doesOf({ verdict = null, strength = null } = {}) {
  if (strength === 'holds the edit') return 'prevents';
  if (strength === 'notices' || strength === 'stops the merge' || verdict === 'fails') return 'catches';
  return 'advises';
}

export function layerCounts(records = []) {
  const out = { rule: { fails: 0, advisory: 0 }, guidance: { fails: 0, advisory: 0 } };
  for (const r of records ?? []) { const l = r.layer ?? layerOf(r.check); const k = r.verdict === 'fails' ? 'fails' : 'advisory'; if (out[l]) out[l][k]++; }
  return out;
}

// What the run leaves for a person, at the end of its report. records: the run's finding records; judged: how many
// readings a model gave this run (null when none was asked); components: the components the change touched.
export function leftForPerson({ records = [], judged = null, components = [] } = {}) {
  const c = layerCounts(records);
  const rules = c.rule.fails ? `${c.rule.fails} failing, ${c.rule.advisory} advice` : c.rule.advisory ? `none failing, ${c.rule.advisory} advice` : 'none failing';
  const guidance = judged == null ? 'none asked this run (--judge-a11y reads the words of each component)' : `${judged} reading${judged === 1 ? '' : 's'} by a model, each for a person to confirm`;
  const named = components.length ? `${components.slice(0, 6).join(', ')}${components.length > 6 ? ` and ${components.length - 6} more` : ''}` : 'the change';
  return [
    '**What each layer answered.**',
    `- Rules, answered by the engine: ${rules}.`,
    `- Guidance, read by a model: ${guidance}.`,
    `- Taste, for a person in the review: how ${named} look${components.length > 1 ? '' : 's'} and read${components.length > 1 ? '' : 's'}. No check answers it${c.rule.fails ? ', and it is worth a look once the rules pass' : ''}.`,
  ];
}
