// gap-drafts.mjs - a gap a prototype found, written where the team reviews documentation.
//
// The check kept each gap in a file and the Figma to-do list could take them, but nothing put them where the team
// reads: on the run this came from, the agent drafted them into the intent layer only after the owner asked twice.
// A gap that lives in a prototype folder and a chat never reaches the people who decide it.
//
// So each gap becomes a draft on the page it belongs to - the component it names, else the System page - marked as
// the prototype's, ready for the team's Drafts to review. Prepared by the check itself; sent only with --commit,
// because the intent layer is somebody's repository and the engine never writes one unasked.
import { GAP_KINDS } from './prototype-pieces.mjs';

// The section a gap of each kind answers on a page. A gap is a need the system did not meet, so each goes where
// that need would be written if the team decides to meet it.
export const GAP_SECTION = {
  component: 'When to use',
  option: 'Options',
  token: 'Tokens',
  icon: 'Icons',
  layout: 'Layout',
  pattern: 'Guidelines',
  part: 'Anatomy',
};
export const DEFAULT_SECTION = 'Guidelines';
export const SYSTEM_SUBJECT = 'System';

// Which page a gap belongs to. A gap that names a component of the system belongs on that component's page - it is
// that component the team would change. One that names none is the system's own: a component it does not have yet,
// a token nothing defines. Never guessed from the need's words alone: only a name the system actually has counts.
export function gapSubject(gap, components = []) {
  const has = new Map(components.map((c) => [String(c).toLowerCase(), c]));
  for (const candidate of [gap?.used, gap?.closest, gap?.part]) {
    const hit = has.get(String(candidate ?? '').toLowerCase());
    if (hit) return hit;
  }
  return SYSTEM_SUBJECT;
}

// One line per gap, as the team reads it: what was needed, what the prototype did meanwhile, and which prototype
// asked for it, so they can go and look at it.
export function gapDraftLine(gap, { prototype = null } = {}) {
  const need = String(gap?.need ?? '').trim();
  if (!need) return null;
  const kind = GAP_KINDS.includes(gap?.kind) ? gap.kind : 'component';
  const meanwhile = gap?.used ? `; the prototype uses ${gap.used} meanwhile`
    : gap?.closest ? `; the closest the system has is ${gap.closest}` : '';
  const from = prototype ? ` (asked for by the ${prototype} prototype)` : '';
  return `${kind}: ${need}${meanwhile}${gap?.note ? ` (${gap.note})` : ''}${from}`;
}

// Every gap grouped by the page it belongs to and the section it answers, ready for draftLinesPlan.
// -> [{ subject, section, lines, gaps }]
export function gapDrafts(gaps = [], { components = [], prototype = null } = {}) {
  const by = new Map();
  for (const g of gaps) {
    const line = gapDraftLine(g, { prototype });
    if (!line) continue;
    const subject = gapSubject(g, components);
    const section = GAP_SECTION[g?.kind] ?? DEFAULT_SECTION;
    const key = `${subject} ${section}`;
    if (!by.has(key)) by.set(key, { subject, section, lines: [], gaps: [] });
    const e = by.get(key);
    if (e.lines.includes(line)) continue;          // the same need asked twice is one draft
    e.lines.push(line);
    e.gaps.push(g);
  }
  return [...by.values()];
}

// What the person is told. The drafts are ready and nothing has been sent: the intent layer belongs to a team, and
// the engine never writes one without being asked.
export function gapDraftLines(drafts = [], { sent = false } = {}) {
  if (!drafts.length) return [];
  const total = drafts.reduce((n, d) => n + d.lines.length, 0);
  const out = [`${total} gap${total === 1 ? '' : 's'} drafted for the team, on ${drafts.length} page${drafts.length === 1 ? '' : 's'}:`];
  for (const d of drafts) out.push(`   ${d.subject} - ${d.section}: ${d.lines.length}`);
  out.push(sent
    ? '   Sent to the intent layer: they show in the style guide\'s drafts for the team to review.'
    : '   Written here only. They reach the team\'s drafts with --commit: the intent layer is theirs, not the engine\'s.');
  return out;
}
