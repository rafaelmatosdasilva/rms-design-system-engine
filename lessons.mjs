// lessons.mjs - a correction becomes the strongest guard that holds it.
//
// When a person corrects what an agent made, the correction is usually said once, in a chat, and lost. The next agent
// makes the same mistake, and the person says it again. A lesson is that correction kept: what was wrong, why, who
// said it and when, in one file beside the other decisions (design-system-engine-lessons.json, committed).
//
// A lesson kept as words still has to be remembered by whoever reads it. So each one is proposed in the strongest
// form that can hold it, in this order:
//   1. a check, when the engine can measure it from what it already reads: a component put inside another one, a
//      prop combination on a component, a value written by hand, an import. A check holds it on every edit;
//   2. else a step in the agent's rules, the file agents read before they work (agent-rules.mjs);
//   3. else a written rule for the guidelines: one sentence a reviewer can check, drafted on a page of the intent
//      layer through the layer's own review.
// The person says yes or no. A yes writes it where it belongs, and the lesson links to what it became. Nothing is
// written on the engine's own say.
//
// Where corrections come from:
//   • said: a person records one (--lesson "<what was wrong>" --why "<reason>");
//   • an edit: a line an agent wrote that somebody else changed or took out since. The hook sees every edit an agent
//     makes, so a line that went without an agent's edit taking it went by a person's hand. It is held as a
//     correction to confirm, never a lesson until the person gives why;
//   • a finding marked wrong (wrong.mjs), a page-review finding among them: the person corrected the engine. Its guard
//     is already written: the case its check must pass.
// And from findings that repeat: the same page-review finding on three screens, the same decision a model judged
// broken on three screens (page-judgment.mjs), or the same edit-check finding in three edits, is proposed as one
// checkable sentence. Only kinds that should be decided the same way every time are
// named; a judgement (which section matters most) never is.
//
// A lesson that comes back after its guard was written is said, with the guard that did not hold.
//
//   design-system-engine-lessons.json (committed): { lessons: [lesson], answers: { id: answer }, back: [event] }
//   .design-system-engine-out/lessons-seen.json (the engine's own record): the lines agents wrote, the corrections not
//   confirmed yet, how often each finding repeated, and each time a guard saw its lesson again.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, resolve, dirname, basename, relative } from 'node:path';
import { createHash } from 'node:crypto';
import { PROJECT, OUT_DIR } from './names.mjs';
import { readWrong } from './wrong.mjs';

export const LESSONS_FILE = PROJECT.lessons.now;
export const lessonsPath = (ROOT) => join(ROOT, LESSONS_FILE);
export const SEEN_FILE = `${OUT_DIR}/lessons-seen.json`;
const seenPath = (ROOT) => join(ROOT, SEEN_FILE);

// The forms a lesson can take, strongest first.
export const FORMS = {
  check: { said: 'a check', rank: 1 },
  agent: { said: 'a step in the agent rules', rank: 2 },
  guideline: { said: 'a written rule for the guidelines', rank: 3 },
};

const flat = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();
const norm = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
const words = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9#-]+/g, ' ').trim();
const hash = (s) => createHash('sha1').update(String(s)).digest('hex').slice(0, 8);
const end = (s) => { const t = flat(s); return !t || /[.!?]$/.test(t) ? t : `${t}.`; };
const capital = (s) => { const t = flat(s); return t ? t[0].toUpperCase() + t.slice(1) : t; };
const day = (at) => String(at ?? '').slice(0, 10);

// ── The file ─────────────────────────────────────────────────────────────────────────────────────────────────────
export function readLessonsFile(ROOT) {
  try {
    const j = JSON.parse(readFileSync(lessonsPath(ROOT), 'utf8'));
    return { lessons: Array.isArray(j.lessons) ? j.lessons.filter((l) => l && l.id && l.what) : [], answers: j.answers && typeof j.answers === 'object' ? j.answers : {}, back: Array.isArray(j.back) ? j.back : [] };
  } catch { return { lessons: [], answers: {}, back: [] }; }
}
function writeLessonsFile(ROOT, doc) {
  writeFileSync(lessonsPath(ROOT), JSON.stringify({ version: 1,
    $description: 'What people corrected in what agents made, each with why, who and when, and the guard it became once a person said yes (a check, a step in the agent rules, or a rule for the guidelines). Written by rms-design-system-engine --lesson and --lesson-answer; commit it.',
    lessons: doc.lessons, answers: doc.answers, back: doc.back }, null, 1) + '\n');
}
export function readSeen(ROOT) {
  try { const j = JSON.parse(readFileSync(seenPath(ROOT), 'utf8')); return { agentLines: j.agentLines ?? {}, corrections: j.corrections ?? [], repeats: j.repeats ?? {}, editSeen: j.editSeen ?? [], sightings: j.sightings ?? [] }; }
  catch { return { agentLines: {}, corrections: [], repeats: {}, editSeen: [], sightings: [] }; }
}
function writeSeen(ROOT, seen) {
  mkdirSync(dirname(seenPath(ROOT)), { recursive: true });
  writeFileSync(seenPath(ROOT), JSON.stringify({ $description: 'What the engine saw that lessons are made from: the lines agents wrote, corrections not confirmed yet, findings that repeat, and each time a guard saw its lesson again. The engine\'s own record; never edited by hand.', ...seen }, null, 1) + '\n');
}

// ── Recording a lesson ───────────────────────────────────────────────────────────────────────────────────────────
// What was wrong and why, both required: a lesson without why tells the next person nothing about where it holds.
// The same lesson recorded again is not a second lesson: it is the first one coming back, said with its guard.
// → { lesson, back: boolean }
export function recordLesson(ROOT, { what, why, component = null, source = 'said', from = null, rule = null, edit = null } = {}, { by = null, at = new Date().toISOString() } = {}) {
  if (!flat(what)) throw new Error('a lesson needs what was wrong');
  if (!flat(why)) throw new Error('a lesson needs why it was wrong');
  const doc = readLessonsFile(ROOT);
  const same = doc.lessons.find((l) => words(l.what) === words(what) && norm(l.component) === norm(component));
  if (same) {
    doc.back.push({ id: same.id, at, by: by || null, why: flat(why) });
    writeLessonsFile(ROOT, doc);
    return { lesson: same, back: true };
  }
  const n = Math.max(0, ...doc.lessons.map((l) => Number(/^L(\d+)$/.exec(l.id)?.[1] ?? 0))) + 1;
  const lesson = { id: `L${n}`, what: flat(what), why: flat(why), component: component ? flat(component) : null, source, from: from ?? null, ...(rule ? { rule: flat(rule) } : {}), ...(edit ? { edit } : {}), by: by || null, at };
  doc.lessons.push(lesson);
  writeLessonsFile(ROOT, doc);
  return { lesson, back: false };
}

// Take lessons back (the ones test(lesson) picks), with their answers. → the lessons removed.
export function dropLessons(ROOT, test) {
  const doc = readLessonsFile(ROOT);
  const gone = doc.lessons.filter(test);
  if (!gone.length) return [];
  const ids = new Set(gone.map((l) => l.id));
  writeLessonsFile(ROOT, { lessons: doc.lessons.filter((l) => !ids.has(l.id)), answers: Object.fromEntries(Object.entries(doc.answers).filter(([k]) => !ids.has(k))), back: doc.back.filter((b) => !ids.has(b.id)) });
  return gone;
}

// ── The strongest form that holds it ────────────────────────────────────────────────────────────────────────────
// Every component the lesson names, in the order it names them: by the system's own names, however the text spells
// them (cardTile, CardTile, <card-tile>, card tile).
export function mentions(text, components = []) {
  const byKey = new Map(components.map((c) => [norm(c), c]).filter(([k]) => k.length > 2));
  const toks = [...String(text ?? '').matchAll(/<?\/?([A-Za-z][\w-]*)/g)].map((m) => ({ w: m[1], at: m.index }));
  const out = [];
  for (let i = 0; i < toks.length; i++) {
    for (const span of [2, 1]) {
      const part = toks.slice(i, i + span);
      if (part.length < span) continue;
      const hit = byKey.get(norm(part.map((t) => t.w).join('')));
      if (hit) { out.push({ name: hit, at: part[0].at, end: part[span - 1].at + part[span - 1].w.length }); i += span - 1; break; }
    }
  }
  return out;
}
const INSIDE = /\b(inside|within|into|in|under|nested in)\b/i;
const HOLDS = /\b(contains?|containing|holds?|held|holding|wraps?|wrapping|around)\b/i;
const POSITIVE = /\b(should|must|always|needs? to)\b(?!\s+(?:not|never))/i;
const NEGATIVE = /\b(never|not|no|don'?t|avoid|wrong|instead|mistake)\b|n't\b/i;
const VALUE = /#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsla?|oklch)\([^)]*\)|var\(--[\w-]+\)|(?<![\w.-])\d*\.?\d+(?:px|rem)\b/g;
const PROPS = /(?<![\w-])([a-zA-Z][\w-]*)\s*=\s*\{?\s*["'`]([\w-]+)["'`]/g;
const IMPORT = /\bfrom\s+["'`]([^"'`]+)["'`]|\bimport(?:ed|s|ing)?\b[^"'`]*["'`]([@\w./-]+)["'`]/i;
// A step of the agent's own way of working (before it writes, what it asks, what it runs), not a property of the page.
const AGENT = /\b(?:before (?:writing|adding|editing|changing|committing|you|it|making|building)|ask(?:ed|ing|s)? (?:the person|first|before)|without asking|run(?:s|ning)? (?:the |rms-)|query|look(?:ed)? up|commit(?:ted|ting)?|first check|check with|wait(?:ed)? for)\b|(?:^|\s)--[a-z][\w-]+/i;
const IMPERATIVE = /^(never|always|use|do not|don't|each|every|only|keep|put|give|write|ask|run|no)\b/i;

// The sentence a lesson becomes: the one the person gave (--rule), else the lesson's own words when they already read
// as a rule, else its why when that does, else the lesson said as what not to do again.
export function ruleSentence(lesson = {}) {
  if (flat(lesson.rule)) return end(capital(lesson.rule));
  if (IMPERATIVE.test(flat(lesson.what))) return end(capital(lesson.what));
  if (/\b(must|never|always|only|should)\b/i.test(flat(lesson.why))) return end(capital(lesson.why));
  return end(`Never again: ${flat(lesson.what).replace(/\.$/, '')}${lesson.why ? ` (${flat(lesson.why).replace(/\.$/, '')})` : ''}`);
}

// The strongest form that can hold one lesson, and the guard it would write. components: the system's names.
// → { form, kind, text, place, guard? }
//   check · pairing  a component inside another   → contract.authored.json, components.<parent>.neverCombineWith
//   check · props    a prop combination on one    → contract.authored.json, guards (read by the edit check)
//   check · value    a value written by hand      → contract.authored.json, guards
//   check · import   an import, and what replaces → ds-config.json, imports.replaced
//   agent            a step of the agent's work   → the agent rules
//   guideline        anything else                → a drafted line in the intent layer
export function proposeGuard(lesson = {}, { components = [], authored = 'contract.authored.json' } = {}) {
  const text = `${lesson.what ?? ''}`;
  const sentence = ruleSentence(lesson);
  const said = POSITIVE.test(text) && !NEGATIVE.test(text);   // "X should go inside Y" is a rule to follow, not a mistake to forbid
  const named = mentions(text, components);
  const component = lesson.component ? (components.find((c) => norm(c) === norm(lesson.component)) ?? lesson.component) : null;
  // A component put inside another one.
  if (!said && named.length >= 2) {
    const [a, b] = named;
    const between = text.slice(a.end, b.at);
    const before = text.slice(0, a.at);
    let pair = null;
    if (INSIDE.test(between)) pair = { parent: b.name, child: a.name };
    else if (HOLDS.test(between)) pair = { parent: a.name, child: b.name };
    else if (/\b(put|place|nest)\b/i.test(before) && /\b(in|inside|into|within)\b/i.test(between + ' in')) pair = { parent: b.name, child: a.name };
    if (pair && pair.parent !== pair.child) {
      return { form: 'check', kind: 'pairing', ...pair, text: `${pair.parent} never contains ${pair.child}.`, place: `${authored} → ${pair.parent}.neverCombineWith`, guard: { kind: 'pairing', ...pair } };
    }
  }
  // An import, when the lesson names what replaces it.
  const imp = IMPORT.exec(text);
  const instead = /\b(?:use|instead|replace\w* (?:with|by))\b[^"'`]*["'`]([@\w./-]+)["'`]/i.exec(text.slice(imp ? imp.index + imp[0].length : 0));
  if (!said && imp && instead) {
    const old = imp[1] ?? imp[2];
    return { form: 'check', kind: 'import', from: old, to: instead[1], text: `Never import from ${old}; import from ${instead[1]}.`, place: 'ds-config.json → imports.replaced', guard: { kind: 'import', from: old, to: instead[1] } };
  }
  // A prop combination on one component.
  const props = Object.fromEntries([...text.matchAll(PROPS)].map((m) => [m[1], m[2]]).filter(([k]) => !/^(class|style|id|key|href|src)$/i.test(k)));
  const on = component ?? named[0]?.name ?? null;
  if (!said && on && Object.keys(props).length) {
    const list = Object.entries(props).map(([k, v]) => `${k}="${v}"`).join(' with ');
    return { form: 'check', kind: 'props', component: on, props, text: `${on} never takes ${list}.`, place: `${authored} → guards`, guard: { kind: 'props', component: on, props } };
  }
  // A value written by hand: the one before "instead of" or after "not" is the wrong one; the other is what to use.
  const values = [...text.matchAll(VALUE)].map((m) => ({ v: m[0], at: m.index }));
  if (!said && values.length) {
    const io = /\binstead of\b/i.exec(text), not = /\bnot\b/i.exec(text);
    let wrong = values[0], right = values[1] ?? null;
    if (io) { wrong = values.filter((x) => x.at < io.index).pop() ?? values[0]; right = values.find((x) => x.at > io.index) ?? null; }
    else if (not && values.some((x) => x.at > not.index) && values.some((x) => x.at < not.index)) { right = values.filter((x) => x.at < not.index).pop(); wrong = values.find((x) => x.at > not.index); }
    if (right && right.v === wrong.v) right = null;
    const where = component ? ` on ${component}` : '';
    return { form: 'check', kind: 'value', value: wrong.v, ...(right ? { use: right.v } : {}), ...(component ? { component } : {}), text: `${wrong.v} is never written${where}${right ? `; use ${right.v}` : ''}.`, place: `${authored} → guards`, guard: { kind: 'value', value: wrong.v, ...(right ? { use: right.v } : {}), ...(component ? { component } : {}) } };
  }
  if (AGENT.test(`${text} ${lesson.why ?? ''} ${lesson.rule ?? ''}`)) return { form: 'agent', kind: 'step', text: sentence, place: 'the agent rules (between the engine\'s markers in the agents\' instruction file)' };
  return { form: 'guideline', kind: 'rule', text: sentence, place: component ? `the intent layer, ${component}'s page, under Rules, as a draft` : 'the intent layer, the System page, under Rules, as a draft' };
}

// ── Corrections an agent's edit received ────────────────────────────────────────────────────────────────────────
// A line counts when it says something: not a bracket, not a blank, not a lone tag end.
const MEANS = (l) => { const t = l.trim(); return t.length >= 6 && /[A-Za-z0-9#]/.test(t) && !/^[\s{}()[\];,<>/]*$/.test(t); };
const MAX_LINES = 200, MAX_FILES = 200, MAX_CORRECTIONS = 100;
// Most of a file's agent lines gone at once is a file rewritten or reformatted, not a line corrected: nothing to ask.
const rewritten = (gone, all) => gone.length > 10 && gone.length > all.length / 2;
const likeness = (a, b) => { const x = new Set(words(a).split(' ').filter(Boolean)), y = new Set(words(b).split(' ').filter(Boolean)); if (!x.size || !y.size) return 0; let s = 0; for (const w of x) if (y.has(w)) s++; return s / Math.max(x.size, y.size); };
// What the line reads now, when it was changed rather than taken out: the line of the file most like it, that no agent wrote.
function nowReads(text, fileText, agentWrote) {
  let best = null, score = 0.4;
  for (const l of String(fileText ?? '').split('\n')) {
    const t = l.trim();
    if (!t || agentWrote.has(t)) continue;
    const s = likeness(text, t);
    if (s > score) { score = s; best = t; }
  }
  return best;
}

// After an agent's edit (the PostToolUse hook): the lines it wrote are remembered; a line an agent wrote earlier that
// is gone, without this edit taking it, went by another hand, and is kept as a correction to confirm. The agent's own
// edits take their lines with them: an Edit by the text it replaced, a Write by everything it rewrote.
// event: Claude Code's tool call; added: the lines the edit added (edit-check addedLines). → the corrections found.
export function noteAgentEdit(ROOT, event, added = [], { now = new Date().toISOString() } = {}) {
  const file = event?.tool_input?.file_path;
  if (!file) return [];
  const rel = relative(resolve(ROOT), resolve(ROOT, file));
  if (!rel || rel.startsWith('..')) return [];
  let text = ''; try { text = readFileSync(resolve(ROOT, rel), 'utf8'); } catch { return []; }
  const seen = readSeen(ROOT);
  const lines = new Set(text.split('\n').map((l) => l.trim()));
  const input = event.tool_input ?? {};
  const took = new Set((event.tool_name === 'Edit' ? [input.old_string] : event.tool_name === 'MultiEdit' ? (input.edits ?? []).map((e) => e.old_string) : []).join('\n').split('\n').map((l) => l.trim()));
  const rewrote = event.tool_name === 'Write';
  const before = seen.agentLines[rel] ?? [];
  const found = [];
  const kept = [];
  for (const l of before) {
    if (lines.has(l.text)) { kept.push(l); continue; }
    if (rewrote || took.has(l.text)) continue;   // the agent took it itself
    found.push({ file: rel, text: l.text, wrote: l.at, seen: now });
  }
  if (rewritten(found, before)) found.length = 0;
  // The agent writing again what a person took out: a lesson made from that correction came back.
  const lessons = readLessonsFile(ROOT).lessons.filter((x) => x.edit?.text);
  for (const t of added.map((l) => l.trim())) for (const x of lessons) if (x.edit.text === t) seen.sightings.push({ id: x.id, at: now, where: rel, how: 'an agent wrote the corrected line again' });
  const fresh = added.map((l) => l.trim()).filter(MEANS).filter((t) => !kept.some((k) => k.text === t)).map((t) => ({ text: t, at: now }));
  seen.agentLines[rel] = [...kept, ...fresh].slice(-MAX_LINES);
  const files = Object.keys(seen.agentLines);
  if (files.length > MAX_FILES) for (const f of files.slice(0, files.length - MAX_FILES)) delete seen.agentLines[f];
  const writtenByAgent = new Set(seen.agentLines[rel].map((l) => l.text));
  for (const c of found) c.now = nowReads(c.text, text, writtenByAgent);
  seen.corrections = [...seen.corrections, ...found].slice(-MAX_CORRECTIONS);
  writeSeen(ROOT, seen);
  return found;
}

// At a run: every line an agent wrote that is gone from its file since, with no agent edit taking it. → the new ones.
export function sweepCorrections(ROOT, { now = new Date().toISOString() } = {}) {
  const seen = readSeen(ROOT);
  const found = [];
  let changed = false;
  for (const [rel, list] of Object.entries(seen.agentLines)) {
    let text; try { text = readFileSync(join(ROOT, rel), 'utf8'); } catch { delete seen.agentLines[rel]; changed = true; continue; }   // a file taken away is no correction of a line
    const lines = new Set(text.split('\n').map((l) => l.trim()));
    const gone = list.filter((l) => !lines.has(l.text));
    if (!gone.length) continue;
    seen.agentLines[rel] = list.filter((l) => lines.has(l.text));
    const mine = new Set(seen.agentLines[rel].map((l) => l.text));
    changed = true;
    if (rewritten(gone, list)) continue;
    for (const l of gone) found.push({ file: rel, text: l.text, wrote: l.at, seen: now, now: nowReads(l.text, text, mine) });
  }
  if (found.length) seen.corrections = [...seen.corrections, ...found].slice(-MAX_CORRECTIONS);
  if (found.length || changed) writeSeen(ROOT, seen);
  return found;
}

// The corrections waiting for the person, numbered as --lesson --edit <n> names them. → [{ n, file, text, now, … }]
export const pendingCorrections = (ROOT) => readSeen(ROOT).corrections.map((c, i) => ({ n: i + 1, ...c }));
// One correction taken off the list: confirmed as a lesson, or not a correction after all. → the correction, or null.
export function takeCorrection(ROOT, n) {
  const seen = readSeen(ROOT);
  const c = seen.corrections[Number(n) - 1];
  if (!c) return null;
  seen.corrections.splice(Number(n) - 1, 1);
  writeSeen(ROOT, seen);
  return c;
}
export const correctionWhat = (c) => `An agent wrote \`${c.text}\` in ${c.file}${c.now ? `; a person changed it to \`${c.now}\`` : '; a person took it out'}`;

// ── Findings that repeat ────────────────────────────────────────────────────────────────────────────────────────
// Only decisions that should be the same every time. A page with every section at one weight is a judgement of which
// matters most, so it is never named; nor is an accessibility finding, which the system's floor already decides.
export const REPEAT_RULES = {
  'page:primary': { form: 'guideline', text: 'Each screen has one primary action in view; every other action is secondary.' },
  'page:destructive': { form: 'guideline', text: 'A destructive action is never the primary one: the safe action is.' },
  'page:nested': { form: 'guideline', text: 'A card never sits inside another card: one surface, its parts laid out inside it.' },
  'page:heading': { form: 'guideline', text: 'Each page has one main heading, and no heading level is skipped.' },
  'page:placeholder': { form: 'guideline', text: 'Every field has a label that stays when someone types: a placeholder is never its only label.' },
  'page:alerts': { form: 'guideline', text: 'A page shows one alert at a time: the one that matters now.' },
  'page:empty': { form: 'guideline', text: 'Every list shows what it holds when it is empty.' },
  'page:error': { form: 'guideline', text: 'Every field that takes input shows what is wrong at the field, in words.' },
  'page:loading': { form: 'guideline', text: 'A page that loads its data shows it loading.' },
  // A decision a model judged broken, read on the screenshot as well as the code (page-judgment.mjs).
  'judge:component': { form: 'guideline', text: 'Each part of a screen uses the component made for what it does, as its intent says; never one made for something else.' },
  'judge:primary': { form: 'guideline', text: 'Each screen shows one main action that reads first; every other action looks secondary.' },
  'judge:destructive': { form: 'guideline', text: 'A destructive action never looks more prominent than the main decision: not in colour, size or place.' },
  'judge:layout': { form: 'guideline', text: 'Each screen is arranged as its brief says: what matters most comes first, grouped as the brief groups it.' },
  'edit:colour': { form: 'agent', text: 'Write every colour as one of the system\'s colour tokens (var(--…)); never write a colour by hand.' },
  'edit:size': { form: 'agent', text: 'Write every padding, margin, gap, radius and font size as one of the system\'s size tokens; never in px or rem by hand.' },
  'edit:variable': { form: 'agent', text: 'Use only the CSS variables the theme declares; ask with rms-design-system-engine --query <name> before using one.' },
  'edit:prop': { form: 'agent', text: 'Write a component\'s props and values as its contract names them (rms-design-system-engine --query <component>).' },
  'edit:tailwind': { form: 'agent', text: 'Use the theme\'s Tailwind utilities; never a value in brackets.' },
  'edit:token': { form: 'agent', text: 'Never add a token of your own: use the system\'s, or tell the person the system has no such value.' },
  'edit:silencer': { form: 'agent', text: 'Never switch a check off with a comment: fix what it reports, or ask the person.' },
  'edit:import': { form: 'agent', text: 'Import from the system\'s public entry only: never from a library it replaced, nor from inside its package.' },
  'edit:nesting': { form: 'agent', text: 'Put a component inside another only the way the system does (rms-design-system-engine --query <component> says what it holds).' },
  'edit:copy': { form: 'agent', text: 'Never write a class that copies a system component: use the component, or ask the person.' },
  'edit:pair': { form: 'agent', text: 'Put a text or icon colour only on the surface it was made for.' },
  'edit:primitive': { form: 'agent', text: 'Use the system\'s component instead of an element styled to look like it.' },
};
const repeatPlace = (form) => (form === 'agent' ? 'the agent rules (between the engine\'s markers in the agents\' instruction file)' : 'the intent layer, the System page, under Rules, as a draft');

// The kind of an edit-check finding, from its own kind or its words.
export function editKind(f = {}) {
  if (f.kind && f.kind !== 'a11y' && f.kind !== 'lesson') return f.kind;
  if (f.kind) return null;
  const t = String(f.text ?? '');
  if (/is not a (spacing value|radius|font size) of the design system|^(padding|margin|gap|row-gap|column-gap|[\w-]*radius|font-size|fontSize|[a-z]+(Top|Left|Right|Bottom))\b[^;]*: .* is written by hand/i.test(t)) return 'size';
  if (/is not a design-system colour|is written by hand; use var\(/.test(t)) return 'colour';
  if (/is not a declared CSS variable/.test(t)) return 'variable';
  if (/is not a value this prop takes|is not the prop's name/.test(t)) return 'prop';
  if (/is outside the theme/.test(t)) return 'tailwind';
  if (/is a new token Figma has no variable for/.test(t)) return 'token';
  if (/styled by hand is the system's/.test(t)) return 'primitive';
  return null;
}

const MAX_HITS = 50, MAX_EDIT_SEEN = 1000;
const bump = (seen, sig, source, place, now) => {
  const r = seen.repeats[sig] ?? { source, times: 0, places: {}, hits: [], first: now };
  r.times += 1; r.places[place] = true; r.last = now;
  r.hits = [...(r.hits ?? []), now].slice(-MAX_HITS);
  seen.repeats[sig] = r;
};

// A run's page reviews: each screen's finding kinds. A finding counts once per screen while it stays: a screen fixed
// and then made the same way again counts again, because that is the mistake made twice.
// screens: [{ place, kinds: [kind] }]. prefix: 'page' for the page review, 'judge' for a model's judgment of the page
// (each kept apart, so a screen judged is never counted twice for the same review).
export function noteReview(ROOT, screens = [], { now = new Date().toISOString(), prefix = 'page' } = {}) {
  const seen = readSeen(ROOT);
  const present = new Map();
  for (const s of screens) for (const k of new Set(s.kinds ?? [])) { const sig = `${prefix}:${k}`; if (!present.has(sig)) present.set(sig, new Set()); present.get(sig).add(s.place); }
  const reviewed = new Set(screens.map((s) => s.place));
  for (const [sig, r] of Object.entries(seen.repeats)) {
    if (!sig.startsWith(`${prefix}:`)) continue;
    for (const p of Object.keys(r.places)) if (reviewed.has(p) && !present.get(sig)?.has(p)) r.places[p] = false;
  }
  for (const [sig, places] of present) for (const p of places) if (!seen.repeats[sig]?.places?.[p]) bump(seen, sig, prefix, p, now);
  writeSeen(ROOT, seen);
}

// An edit's findings (the edit check): each one a mistake made once, counted by kind. The same line found again (the
// check run once more over a file) is the same mistake, never a second one. A finding of a lesson's own guard is the
// lesson coming back: kept as a sighting of that guard.
export function noteEdit(ROOT, rel, found = [], { now = new Date().toISOString() } = {}) {
  if (!found.length) return;
  const seen = readSeen(ROOT);
  const known = new Set(seen.editSeen);
  let changed = false;
  for (const f of found) {
    const key = hash(`${rel}|${String(f.text).replace(/:\d+\b/g, '')}`);
    if (known.has(key)) continue;
    known.add(key); seen.editSeen.push(key); changed = true;
    if (f.kind === 'lesson' && f.lesson) { seen.sightings.push({ id: f.lesson, at: now, where: rel, how: 'the edit check caught it' }); continue; }
    const k = editKind(f);
    if (k) bump(seen, `edit:${k}`, 'edit', rel, now);
  }
  seen.editSeen = seen.editSeen.slice(-MAX_EDIT_SEEN);
  if (changed) writeSeen(ROOT, seen);
}

// The rules the repeats propose: a kind found at least `least` times, that should be decided the same way every
// time, with no answer yet. → [{ id, form, text, place, times, places, source }]
export function proposedRules(ROOT, { least = 3, answers = readLessonsFile(ROOT).answers } = {}) {
  const out = [];
  for (const [sig, r] of Object.entries(readSeen(ROOT).repeats)) {
    const rule = REPEAT_RULES[sig];
    if (!rule || r.times < least) continue;
    const id = `R-${sig.replace(':', '-')}`;
    if (answers[id]) continue;
    out.push({ id, form: rule.form, text: rule.text, place: repeatPlace(rule.form), times: r.times, places: Object.keys(r.places), source: r.source, kind: sig, last: r.last ?? null });
  }
  return out.sort((a, b) => b.times - a.times || a.id.localeCompare(b.id));
}

// ── Answers ─────────────────────────────────────────────────────────────────────────────────────────────────────
// The proposal a lesson or a repeated finding stands for, by its id. → { id, lesson?, repeat?, proposal } | null
export function proposalFor(ROOT, id, { components = [], authored } = {}) {
  const doc = readLessonsFile(ROOT);
  const lesson = doc.lessons.find((l) => l.id === id);
  if (lesson) return { id, lesson, proposal: proposeGuard(lesson, { components, authored }) };
  const m = /^R-(page|edit|judge)-(\w+)$/.exec(String(id));
  const rule = m && REPEAT_RULES[`${m[1]}:${m[2]}`];
  if (rule) {
    const r = readSeen(ROOT).repeats[`${m[1]}:${m[2]}`] ?? { times: 0, places: {} };
    return { id, repeat: { kind: `${m[1]}:${m[2]}`, times: r.times, places: Object.keys(r.places ?? {}) }, proposal: { form: rule.form, kind: 'rule', text: rule.text, place: repeatPlace(rule.form) } };
  }
  return null;
}

// Write a check's guard where it belongs. Pure: given the files as read, → { authored?, config? } as they become.
export function withGuard(guard, { authored = {}, config = {}, id = null, say = null } = {}) {
  if (guard.kind === 'pairing') {
    const comps = { ...(authored.components ?? {}) };
    const at = Object.keys(comps).find((n) => norm(n) === norm(guard.parent)) ?? guard.parent;
    const entry = { ...(comps[at] ?? {}) };
    const list = Array.isArray(entry.neverCombineWith) ? entry.neverCombineWith : [];
    if (!list.some((x) => norm(x) === norm(guard.child))) entry.neverCombineWith = [...list, guard.child];
    comps[at] = entry;
    return { authored: { ...authored, components: comps } };
  }
  if (guard.kind === 'import') return { config: { ...config, imports: { ...(config.imports ?? {}), replaced: { ...(config.imports?.replaced ?? {}), [guard.from]: guard.to } } } };
  const guards = (Array.isArray(authored.guards) ? authored.guards : []).filter((g) => g?.lesson !== id);
  const { kind, ...rest } = guard;
  return { authored: { ...authored, guards: [...guards, { lesson: id, kind, ...rest, ...(say ? { say } : {}) }] } };
}

// A person's answer to a proposal, recorded with who and when. A yes to a check writes its guard here, into the
// engine's own file (the authored contract) or the project's config (an import), where writes.engine lets it; a step
// or a rule is written by the command that writes that place (the agent rules, the intent layer's draft), which the
// caller runs. → { answer, proposal, wrote: [file] | [], next: null | 'agent-rules' | 'draft', blocked?: why }
export function answerProposal(ROOT, id, answer, { components = [], cfg = {}, by = null, at = new Date().toISOString(), rule = null, may = 'yes' } = {}) {
  if (!['yes', 'no'].includes(answer)) throw new Error('an answer is yes or no');
  const authoredFile = cfg.contracts?.authored ?? 'contract.authored.json';
  const p = proposalFor(ROOT, id, { components, authored: authoredFile });
  if (!p) throw new Error(`no lesson or proposed rule is called ${id}`);
  const proposal = rule && p.proposal.form !== 'check' ? { ...p.proposal, text: end(capital(rule)) } : p.proposal;
  const doc = readLessonsFile(ROOT);
  const wrote = [];
  let next = null, blocked = null;
  if (answer === 'yes' && proposal.form === 'check') {
    if (may === 'no') blocked = 'this project does not let the engine write its own files (ds-config.json → writes.engine): the guard is a task for whoever owns them';
    else {
      const read = (f) => { try { return JSON.parse(readFileSync(join(ROOT, f), 'utf8')); } catch { return {}; } };
      const made = withGuard(proposal.guard, { authored: read(authoredFile), config: read('ds-config.json'), id, say: p.lesson ? `${p.lesson.why}` : null });
      if (made.authored) { writeFileSync(join(ROOT, authoredFile), JSON.stringify(made.authored, null, 2) + '\n'); wrote.push(authoredFile); }
      if (made.config) { writeFileSync(join(ROOT, 'ds-config.json'), JSON.stringify(made.config, null, 2) + '\n'); wrote.push('ds-config.json'); }
    }
  }
  if (answer === 'yes' && proposal.form === 'agent') next = 'agent-rules';
  if (answer === 'yes' && proposal.form === 'guideline') next = 'draft';
  doc.answers[id] = { answer, form: proposal.form, text: proposal.text, place: proposal.place, ...(proposal.guard ? { guard: proposal.guard } : {}), ...(p.repeat ? { repeat: p.repeat } : {}), ...(blocked ? { blocked } : {}), by: by || null, at };
  writeLessonsFile(ROOT, doc);
  return { answer, proposal, wrote, next, ...(blocked ? { blocked } : {}), lesson: p.lesson ?? null, repeat: p.repeat ?? null };
}
// Where a yes was written beyond the file itself: the draft made for a rule, or the agent files updated.
export function noteWritten(ROOT, id, where) {
  const doc = readLessonsFile(ROOT);
  if (!doc.answers[id]) return;
  doc.answers[id] = { ...doc.answers[id], written: [...new Set([...(doc.answers[id].written ?? []), ...[where].flat()])] };
  writeLessonsFile(ROOT, doc);
}

// The steps in the agent rules that lessons became: every yes to a step, in the order said.
export function agentSteps(ROOT) {
  return Object.entries(readLessonsFile(ROOT).answers).filter(([, a]) => a.answer === 'yes' && a.form === 'agent').sort(([, a], [, b]) => String(a.at).localeCompare(String(b.at))).map(([, a]) => a.text);
}
// The guards a yes wrote into the authored contract, as the edit check reads them.
export const guardsOf = (authored = {}) => (Array.isArray(authored?.guards) ? authored.guards.filter((g) => g && (g.kind === 'props' || g.kind === 'value')) : []);

// ── The edit check reads the guards ─────────────────────────────────────────────────────────────────────────────
// Each opening tag of a component, with the lines it spans and its props as written. Props across several lines
// count: a tag written one prop per line is the same tag.
function tagsOf(text, component) {
  const k = norm(component);
  const out = [];
  const re = /<([A-Za-z][\w.-]*)\b((?:[^>"'{}]|"[^"]*"|'[^']*'|\{[^{}]*\})*)\/?>/g;
  let m;
  while ((m = re.exec(text))) {
    const tag = m[1];
    if (norm(tag) !== k && !(tag.includes('-') && norm(tag).endsWith(k) && /^[a-z]{1,4}$/.test(norm(tag).slice(0, -k.length)))) continue;
    const from = text.slice(0, m.index).split('\n').length;
    const to = from + m[0].split('\n').length - 1;
    const props = Object.fromEntries([...m[2].matchAll(/(?:^|\s)[:@]?(?:v-bind:)?([\w-]+)\s*=\s*\{?\s*["'`]([^"'`]*)["'`]/g)].map((x) => [x[1].toLowerCase(), x[2]]));
    out.push({ from, to, props });
  }
  return out;
}
// Whether a line of a file is about a component: its tag, its class, or the component's own file.
const about = (line, component, file) => {
  const k = norm(component);
  return norm(basename(String(file ?? '')).replace(/\.[^.]+$/, '')) === k
    || [...String(line).matchAll(/<\/?([A-Za-z][\w.-]*)|\.([A-Za-z][\w-]*)/g)].some((m) => norm(m[1] ?? m[2]) === k);
};
// → [{ line, text, kind: 'lesson', lesson }] for the lines the edit added. added: the lines' numbers (a Set).
export function guardFindings(fullText, added, guards = [], { file = null } = {}) {
  const out = [];
  const lines = String(fullText ?? '').split('\n');
  const why = (g) => (g.say ? ` (a lesson: ${flat(g.say).replace(/\.$/, '')})` : ' (a lesson)');
  for (const g of guards) {
    if (g.kind === 'props' && g.component && g.props && Object.keys(g.props).length) {
      const want = Object.entries(g.props).map(([k, v]) => [k.toLowerCase(), String(v)]);
      for (const t of tagsOf(String(fullText ?? ''), g.component)) {
        let touched = false; for (let i = t.from; i <= t.to; i++) if (added.has(i)) touched = true;
        if (!touched || !want.every(([k, v]) => t.props[k] === v)) continue;
        out.push({ line: t.from, kind: 'lesson', lesson: g.lesson ?? null, text: `${g.component} with ${want.map(([k, v]) => `${k}="${v}"`).join(' and ')} is what a lesson ruled out${why(g)}: write it another way, or ask the person` });
      }
    }
    if (g.kind === 'value' && g.value) {
      const v = String(g.value).toLowerCase();
      lines.forEach((l, i) => {
        if (!added.has(i + 1) || !l.toLowerCase().includes(v)) return;
        if (g.component && !about(l, g.component, file)) return;
        out.push({ line: i + 1, kind: 'lesson', lesson: g.lesson ?? null, text: `${g.value} is what a lesson ruled out${g.component ? ` on ${g.component}` : ''}${why(g)}${g.use ? `; use ${g.use}` : ''}` });
      });
    }
  }
  return out;
}

// ── The view ────────────────────────────────────────────────────────────────────────────────────────────────────
// The system's component names, from what the last run wrote: the catalog, and Figma's components.
export function componentNamesOf(ROOT, cfg = null) {
  const json = (p) => { try { return JSON.parse(readFileSync(join(ROOT, p), 'utf8')); } catch { return {}; } };
  const c = cfg ?? json('ds-config.json');
  return [...new Set([...Object.keys(json(join(c.contracts?.out ?? 'contracts', 'catalog.json')).components ?? {}), ...Object.keys(json(c.paths?.snapshotStructure ?? 'src/figma-structure.snapshot.json').components ?? {})])].filter((n) => !n.startsWith('_'));
}

// Every lesson, what it became or what it is proposed to become, and whether it came back; the rules the repeats
// propose; the corrections waiting for a person. wrong: the findings marked wrong (wrong.mjs readWrong).
// → { lessons, proposed, corrections, counts }
export function lessonsView(ROOT, { components = componentNamesOf(ROOT), wrong = [], authored } = {}) {
  const doc = readLessonsFile(ROOT);
  const seen = readSeen(ROOT);
  const backOf = (id, since) => {
    const said = doc.back.filter((b) => b.id === id && (!since || String(b.at) > String(since))).map((b) => ({ at: b.at, how: `a person corrected it again${b.by ? ` (${b.by})` : ''}` }));
    const sighted = seen.sightings.filter((s) => s.id === id && (!since || String(s.at) > String(since))).map((s) => ({ at: s.at, how: s.how, where: s.where }));
    return [...said, ...sighted].sort((a, b) => String(a.at).localeCompare(String(b.at)));
  };
  const one = (l) => {
    const a = doc.answers[l.id] ?? null;
    const proposal = a ? { form: a.form, text: a.text, place: a.place } : proposeGuard(l, { components, authored });
    const yes = a?.answer === 'yes';
    const back = yes ? backOf(l.id, a.at) : [];
    return { ...l, proposal, answer: a?.answer ?? null, answered: a ? { by: a.by, at: a.at } : null, became: yes && !a.blocked ? { form: a.form, place: a.place, text: a.text, at: a.at, written: a.written ?? [] } : null, blocked: a?.blocked ?? null, back, held: back.length ? back.every((b) => /check caught/.test(b.how)) : null };
  };
  const lessons = doc.lessons.map(one);
  // A finding marked wrong is a correction of the engine itself, and its guard is already written: the case its check
  // must pass (wrong.mjs). Shown with the others so the count is every correction.
  for (const w of wrong) lessons.push({ id: `W-${hash(w.key)}`, what: `${w.check} raised: ${w.what}`, why: w.why, component: w.component ?? null, source: 'wrong', from: w.check, by: w.by ?? null, at: w.at ?? null,
    proposal: { form: 'check', text: `a case ${w.check} must pass`, place: 'design-system-engine-wrong.json' }, answer: 'yes', answered: null,
    became: { form: 'check', place: 'design-system-engine-wrong.json', text: `a case ${w.check} must pass: it must stop raising this`, at: w.at ?? null, written: [] }, back: [], held: null });
  // The repeats a person said yes to, as lessons of their own: what they became, and whether the finding came back.
  for (const [id, a] of Object.entries(doc.answers)) {
    if (!id.startsWith('R-') || !a.repeat) continue;
    const r = seen.repeats[a.repeat.kind];
    const after = a.answer === 'yes' ? (r?.hits ?? []).filter((h) => String(h) > String(a.at)).map((at) => ({ at, how: a.form === 'agent' ? 'the edit check found it again' : String(a.repeat.kind).startsWith('judge:') ? 'a model judging the page found it again' : 'the page review found it again' })) : [];
    lessons.push({ id, what: a.text, why: `found ${a.repeat.times} times${a.repeat.places?.length ? ` (${a.repeat.places.slice(0, 4).join(', ')}${a.repeat.places.length > 4 ? ` +${a.repeat.places.length - 4}` : ''})` : ''}`, component: null, source: 'repeat', from: a.repeat.kind, by: a.by, at: a.at,
      proposal: { form: a.form, text: a.text, place: a.place }, answer: a.answer, answered: { by: a.by, at: a.at },
      became: a.answer === 'yes' ? { form: a.form, place: a.place, text: a.text, at: a.at, written: a.written ?? [] } : null, back: after, held: after.length ? false : null });
  }
  const proposed = proposedRules(ROOT, { answers: doc.answers });
  const corrections = seen.corrections.map((c, i) => ({ n: i + 1, ...c }));
  const counts = {
    lessons: lessons.length,
    held: lessons.filter((l) => l.became).length,
    byForm: Object.fromEntries(Object.keys(FORMS).map((f) => [f, lessons.filter((l) => l.became?.form === f).length])),
    waiting: lessons.filter((l) => !l.answer).length,
    back: lessons.filter((l) => l.back.length).length,
    proposed: proposed.length,
    corrections: corrections.length,
  };
  return { lessons, proposed, corrections, counts };
}

// The guard a lesson that came back had, in words: which one did not hold. A check that caught it held; the agent was
// still not told before it wrote.
export function backSaid(l) {
  if (!l.back?.length) return null;
  const last = l.back[l.back.length - 1];
  const guard = l.became ? `${FORMS[l.became.form].said} (${l.became.place})` : 'no guard yet';
  const held = l.became?.form === 'check' && l.back.every((b) => /check caught/.test(b.how));
  return `came back ${l.back.length} time${l.back.length === 1 ? '' : 's'}, last on ${day(last.at)}${last.where ? ` in ${last.where}` : ''} (${last.how}): ${held ? `${guard} held and caught it; the agent was not told before it wrote` : `${guard} did not hold`}`;
}

// The run's one line. → a string, or null when there is nothing to say.
export function lessonsLine(view) {
  const c = view?.counts;
  if (!c || (!c.lessons && !c.proposed && !c.corrections)) return null;
  const forms = Object.entries(c.byForm).filter(([, n]) => n).map(([f, n]) => `${n} ${f === 'check' ? (n === 1 ? 'check' : 'checks') : f === 'agent' ? (n === 1 ? 'agent step' : 'agent steps') : (n === 1 ? 'guideline' : 'guidelines')}`);
  const parts = [`${c.lessons} lesson${c.lessons === 1 ? '' : 's'}${c.held ? ` (${c.held} held: ${forms.join(', ')})` : ''}`];
  if (c.waiting) parts.push(`${c.waiting} waiting for a yes`);
  if (c.proposed) parts.push(`${c.proposed} rule${c.proposed === 1 ? '' : 's'} proposed from repeated findings`);
  if (c.corrections) parts.push(`${c.corrections} correction${c.corrections === 1 ? '' : 's'} of an agent's edit to confirm`);
  if (c.back) { const b = view.lessons.filter((l) => l.back.length && !l.held); parts.push(`${c.back} came back${b.length ? ` (${[...new Set(b.map((l) => (l.became ? FORMS[l.became.form].said : 'no guard')))].join(', ')} did not hold)` : ''}`); }
  return `Lessons: ${parts.join(' · ')}. rms-design-system-engine --lessons lists them.`;
}

// Every lesson as people read it, for --lessons. → lines
export function lessonsLines(view) {
  const out = [];
  const lesson = (l) => {
    out.push(`  ${l.id}  ${l.component ? `${l.component}: ` : ''}${l.what}`);
    if (l.why) out.push(`      why: ${l.why}${l.by ? ` (${l.by}${l.at ? `, ${day(l.at)}` : ''})` : l.at ? ` (${day(l.at)})` : ''}`);
    if (l.became) out.push(`      became ${FORMS[l.became.form].said}: ${l.became.text} → ${l.became.place}${l.became.written?.length ? ` (${l.became.written.join(', ')})` : ''}`);
    else if (l.answer === 'no') out.push(`      not made a guard (answered no${l.answered?.by ? ` by ${l.answered.by}` : ''})`);
    else if (l.blocked) out.push(`      a yes, not written: ${l.blocked}`);
    else out.push(`      proposed as ${FORMS[l.proposal.form].said}: ${l.proposal.text} → ${l.proposal.place}`);
    const b = backSaid(l);
    if (b) out.push(`      🔁 ${b}`);
  };
  if (view.lessons.length) { out.push(`🧠 ${view.lessons.length} lesson${view.lessons.length === 1 ? '' : 's'} (${LESSONS_FILE}):`); view.lessons.forEach(lesson); }
  if (view.proposed.length) {
    out.push(`📏 ${view.proposed.length} rule${view.proposed.length === 1 ? '' : 's'} proposed from findings that repeat:`);
    for (const r of view.proposed) out.push(`  ${r.id}  ${r.text}`, `      found ${r.times} times (${r.places.slice(0, 4).join(', ')}${r.places.length > 4 ? ` +${r.places.length - 4}` : ''}) → ${FORMS[r.form].said}, in ${r.place}`);
  }
  if (view.corrections.length) {
    out.push(`✏️  ${view.corrections.length} line${view.corrections.length === 1 ? '' : 's'} an agent wrote that a person changed since (a correction to confirm):`);
    for (const c of view.corrections.slice(0, 20)) out.push(`  ${c.n}. ${c.file}: \`${c.text}\`${c.now ? ` → now \`${c.now}\`` : ' → taken out'}`);
  }
  return out;
}

// The lessons and the proposed rules as decisions (decisions.mjs), so they show where decisions already show: beside
// each component's Changelog, on the History page, in DECISIONS.md, and to an agent as what was ruled out. A finding
// marked wrong rules nothing out for an agent (the engine was the one wrong), so it is shown and never told.
export function lessonDecisions(view) {
  const out = [];
  for (const l of view?.lessons ?? []) {
    if (l.answer === 'no' && l.source === 'repeat') continue;
    const became = l.became ? `Became ${FORMS[l.became.form].said}: ${l.became.text} (${l.became.place})` : l.answer === 'no' ? 'Not made a guard' : `Proposed as ${FORMS[l.proposal.form].said}: ${l.proposal.text}`;
    out.push({ component: l.component ?? null, kind: l.source === 'repeat' ? 'rule' : 'lesson', what: l.source === 'repeat' ? l.what : `Lesson: ${l.what}`, ruledOut: l.source === 'repeat' || l.source === 'wrong' ? [] : [l.what], why: l.why ?? null, by: l.by ?? null, at: l.at ?? null,
      from: l.source === 'wrong' ? 'the findings marked wrong' : 'the lessons', became, ...(backSaid(l) ? { back: backSaid(l) } : {}) });
  }
  for (const r of view?.proposed ?? []) out.push({ component: null, kind: 'proposed', what: r.text, ruledOut: [], why: `found ${r.times} times (${r.places.slice(0, 4).join(', ')})`, by: null, at: r.last ?? null, from: 'the findings that repeat', became: `Proposed as ${FORMS[r.form].said}, waiting for a yes: rms-design-system-engine --lesson-answer ${r.id} yes|no` });
  return out;
}

// Gathered from the project as every reader takes it.
export function projectLessons(ROOT, cfg = null) {
  return lessonsView(ROOT, { components: componentNamesOf(ROOT, cfg), wrong: readWrong(ROOT), authored: cfg?.contracts?.authored });
}
