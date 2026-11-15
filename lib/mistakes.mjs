// mistakes.mjs - mistakes that look right, written for agents.
//
// The most common mistakes are the plausible ones: a status shown by colour alone, a skeleton that does not match what
// loads, a submit button disabled with no reason. An agent told only what to do repeats the mistake that looks most
// like it. The team's intent layer holds them under Common mistakes, and the example frames drawn in Figma are read
// already: this is the written half, for an agent that cannot see them. Each mistake is read as three parts (the wrong
// use, why it fails, what to use instead), so llms.txt and the contracts carry them whole, and a page that leaves out
// the why or the instead is told so.
//
//   mistakeParts(text)          → { wrong, why, instead }
//   mistakeLine(text)           → the one line llms.txt carries
//   suggestedMistakes(name)     → the plausible mistakes the kind of component it is is known for
//   mistakeGaps(entities, names, { kindOf }) → [{ component, missing: [suggested], partial: [{ text, lacks }] }]
//   mistakeGapLines(gaps)

const sentences = (t) => String(t ?? '').replace(/\s+/g, ' ').trim().split(/(?<=[.!?])\s+(?=[A-Z`"'])/).filter(Boolean);
// What to do instead: a sentence that says so, or one that starts by telling what to do (an imperative).
const INSTEAD = /^(use|instead|prefer|reach for|pick|choose|show|give|write|put|keep|draw|close|run|lay|say|add|move|label|name|offer|ask|let|make|set|link|tell|place|wrap|split|replace)\b|\binstead\b|\buse (?:the |a |an )?[`\w]/i;
const WHY = /\b(because|since|so (?:that )?(?:people|users|nobody|no one|a screen reader|it)|which (?:means|hides|breaks)|people (?:cannot|can't|miss|lose)|nobody|fails?|breaks?|hides?|misleads?|confus\w*)\b/i;

// The three parts of one written mistake. A clause after a dash or "because" is the why when the sentences do not say
// it apart; the sentence that says what to use is the instead. A part the text does not say is null.
export function mistakeParts(text) {
  const ss = sentences(text);
  if (!ss.length) return { wrong: null, why: null, instead: null };
  let wrong = ss[0], why = null, instead = null;
  for (const s of ss.slice(1)) {
    if (!instead && INSTEAD.test(s)) instead = s;
    else if (!why && WHY.test(s)) why = s;
    else if (!why) why = s;
  }
  // One sentence that holds its own why ("… — people who cannot tell colours apart miss it", "… because …").
  const m = /^(.*?)\s*(?:[—–]|\s-\s)\s*(.+)$/.exec(wrong) ?? (!INSTEAD.test(wrong) ? /^(.*?),?\s+because\s+(.+)$/i.exec(wrong) : null);
  if (!why && m && m[1].length > 8) { wrong = m[1].replace(/[,;:]$/, '') + (/[.!?]$/.test(m[1]) ? '' : '.'); why = m[2].replace(/^\w/, (c) => c.toUpperCase()); }
  if (!instead && why && INSTEAD.test(why) && /\binstead\b|^use\b/i.test(why)) { instead = why; why = null; }
  return { wrong, why, instead };
}

// The line an agent reads: the wrong use, why it fails, what instead, each as the team wrote it.
export function mistakeLine(text) {
  const p = mistakeParts(text);
  return [p.wrong, p.why, p.instead].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
}

// The plausible mistakes each common kind of component is known for: wrong use, why it fails, what instead. Offered to
// a page that has none of its own, for the team to take, change or leave. Never handed to an agent as the team's word.
export const KNOWN = {
  badge: ['Showing a status by colour alone. People who cannot tell the colours apart, and screen readers, miss it. Put the status in words beside the colour.'],
  button: ['Disabling a submit button with no reason. People cannot tell what is missing and stop. Keep it enabled and say what is wrong when it is pressed, or say beside it why it is off.',
    'Two main actions side by side. People cannot tell which one moves them on. Keep one main action and make the rest secondary.'],
  skeleton: ['A skeleton that does not match what loads. The page jumps when the content arrives, and people lose their place. Draw the skeleton in the shape and size of the content it stands for.'],
  'text input': ['A placeholder used as the label. It disappears as soon as someone types, and some screen readers skip it. Give the field a label that stays.'],
  'form field': ['An error shown only by a red border. People who cannot see the colour miss it, and nothing says how to fix it. Write the error in words under the field.'],
  dialog: ['A dialog opened over another dialog. People lose track of where they are and how to get back. Close the first, or put the second step inside it.',
    'A confirmation in front of an action that can be undone. People learn to click through confirmations, and miss the one that matters. Run it at once and offer undo.'],
  toast: ['A toast that holds an action people must take. It goes away on its own, and the action with it. Put what must be done on the page or in a dialog.'],
  tooltip: ['Putting what people need to know in a tooltip. Touch screens and keyboards may never show it. Write it on the page.'],
  alert: ['Several alerts on one page. Each one shouts, so none is heard. Keep the one that matters now and put the rest inline.'],
  tabs: ['Using tabs as steps of a flow. People can jump ahead and skip what the step needs. Use a stepper or one page with sections.'],
  card: ['A card inside a card. It draws a box in a box and the hierarchy is lost. Lay its parts out inside one card.'],
  'empty state': ['An empty state that says only that there is nothing. People do not know what to do next. Say what to do to fill it, with the action that does.'],
  progress: ['A progress bar for work that cannot be measured. It stalls or jumps and people stop trusting it. Use a spinner, or say what is happening.'],
  link: ['A link styled as a button, or a button that navigates. Keyboards and screen readers treat each differently. Use a link to go somewhere and a button to do something.'],
};

// The kind a component is, by its name: common-set.mjs's matcher, passed in (kindOf(name) → an id of KNOWN, or null).
export const suggestedMistakes = (name, kindOf) => KNOWN[kindOf?.(name)] ?? [];

const norm = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
// Each component's page against what it owes agents: the known mistakes of its kind it does not say yet (by the words
// its own mistakes share with each), and each written mistake that leaves out why it fails or what to use instead.
// entities: the layer's component pages; names: the system's components.
export function mistakeGaps(entities = [], names = [], { kindOf = () => null } = {}) {
  const pages = new Map(entities.filter((e) => e.layer === 'components').map((e) => [norm(e.name), e]));
  const out = [];
  for (const name of names) {
    const e = pages.get(norm(name));
    const own = (e?.mistakes ?? []).map((x) => String(x?.text ?? x));
    const words = (t) => new Set(String(t).toLowerCase().match(/[a-z]{5,}/g) ?? []);
    const said = own.map(words);
    const missing = suggestedMistakes(name, kindOf).filter((k) => { const w = [...words(mistakeParts(k).wrong)]; return !said.some((s) => w.filter((x) => s.has(x)).length >= 2); });
    const partial = own.map((t) => ({ text: t, ...mistakeParts(t) })).filter((p) => !p.why || !p.instead).map((p) => ({ text: p.text, lacks: [!p.why && 'why it fails', !p.instead && 'what to use instead'].filter(Boolean) }));
    if (missing.length || partial.length) out.push({ component: name, page: e ? e.name : null, missing, partial });
  }
  return out;
}

export function mistakeGapLines(gaps = []) {
  if (!gaps.length) return ['✓ Every component page says the mistakes its kind is known for, each with why it fails and what to use instead.'];
  const lines = [`📝 ${gaps.length} component page${gaps.length === 1 ? '' : 's'} could say more of the mistakes that look right. Add each to the page's Common mistakes, in your own words if you prefer, so agents read it:`];
  for (const g of gaps) {
    lines.push(`   ${g.component}${g.page ? '' : ' (no page in the intent layer yet)'}`);
    for (const m of g.missing) lines.push(`      + ${m}`);
    for (const p of g.partial) lines.push(`      ~ "${p.text.slice(0, 90)}${p.text.length > 90 ? '…' : ''}" does not say ${p.lacks.join(' or ')}`);
  }
  return lines;
}
