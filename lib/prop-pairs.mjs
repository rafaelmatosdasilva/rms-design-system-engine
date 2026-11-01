// prop-pairs.mjs - the pairs the engine already suggests, put to a person as a yes or a no.
//
// A Figma property no code prop is paired with may carry a suggestion in its contract (prop-binding.mjs suggestionFor):
// the one code prop only the code has whose name holds its name, or is held in it. The engine never takes it as the
// pairing on its own. So each one is a question for a person, "Figma's Content is the code's contentList?", listed by
// --prop-pairs and on the component's page in the style guide.
//   yes  the pair is written where the engine keeps the pairings a person agreed: contract.authored.json, the
//        component's bindings ({ "Content": { "attribute": "contentList" } }). The next contract build pairs them, with
//        the code prop's facts (its type, description, default) and its values mapped; the props check pairs them too.
//   no   kept beside it (declinedPairs: { "Content": "contentList" }), so the same pair is never asked again.
//
//   pairProposals(contracts)              → [{ component, figma, code }] from the built contracts
//   askOf(x)                              → the question, in words
//   commandFor(x, answer)                 → the command that records the answer
//   decidePair(authored, x, answer)       → contract.authored.json with the answer in it (pure)
//   isDeclined(entry, figma, code)        → true when a person said no to that pair
import { SKILL } from './names.mjs';

// The contracts as built ([contract] or [{ name, contract }]): each Figma property whose suggestion is a code prop only
// the code has.
export function pairProposals(contracts = []) {
  const out = [];
  for (const item of contracts) {
    const c = item?.contract ?? item;
    if (!c?.name || !Array.isArray(c.props)) continue;
    const only = new Set((c.codeOnly ?? []).map((x) => x?.name).filter(Boolean));
    for (const p of c.props) if (p?.suggestion && !p.bindings?.code && only.has(p.suggestion)) out.push({ component: c.name, figma: p.name, code: p.suggestion });
  }
  return out.sort((a, b) => a.component.localeCompare(b.component) || a.figma.localeCompare(b.figma));
}

export const askOf = (x) => `Figma's "${x.figma}" is the code's "${x.code}"?`;
const quote = (s) => (/^[\w./-]+$/.test(String(s)) ? String(s) : `"${String(s).replace(/(["\\$`])/g, '\\$1')}"`);
export const commandFor = (x, answer) => `${SKILL} --prop-pair ${quote(x.component)} ${quote(x.figma)} ${answer}`;
// What each answer does, in words.
export const doesOf = (x, answer) => (answer === 'yes'
  ? `The contract pairs ${x.figma} with ${x.code} from the next build (contract.authored.json bindings).`
  : `${x.figma} and ${x.code} stay apart, and the pair is not asked again (contract.authored.json declinedPairs).`);

export const isDeclined = (entry, figma, code) => entry?.declinedPairs?.[figma] === code;

// The authored contract with one answer in it. Never changes another component, nor a binding the team wrote for another
// property. → the new document
export function decidePair(authored = {}, x, answer) {
  if (!['yes', 'no'].includes(answer)) throw new Error('answer yes or no');
  const doc = { ...authored, components: { ...(authored.components ?? {}) } };
  const entry = { ...(doc.components[x.component] ?? {}) };
  const declined = { ...(entry.declinedPairs ?? {}) };
  if (answer === 'yes') {
    entry.bindings = { ...(entry.bindings ?? {}), [x.figma]: { attribute: x.code } };
    delete declined[x.figma];
  } else declined[x.figma] = x.code;
  if (Object.keys(declined).length) entry.declinedPairs = declined; else delete entry.declinedPairs;
  doc.components[x.component] = entry;
  return doc;
}
