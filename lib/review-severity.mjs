// review-severity.mjs - a severity proposed for each problem a prototype's review finds, for the reviewer to confirm.
//
// A team's exit criterion can ask for no Blocker and no Major in a prototype's UX, and a reviewer grades every problem
// from a blank page, so two reviewers grade the same problem differently. The check already finds the problems: how
// the page is laid out (alignment, spacing, one main action, hierarchy, line length), what breaks at a screen width
// or with longer words, a state the page owes, a control that does not do what it shows. Each gets a grade proposed
// from what kind of problem it is and where, with why. The grade stays a person's call: a reviewer confirms or
// changes each, by name, and that decision is kept as theirs (design-system-engine-grades.json), never the engine's.
//
//   reviewProblems({ visual, fit, owed, interactions }) → [{ id, source, message, proposed: { grade, why } }]
//   readGrades(root) / gradeProblem(root, { prototype, id, grade, by, why })
//   withGrades(problems, grades, prototype)             → each problem with its reviewer's grade, where there is one
//   gradeCounts(problems)                               → { Blocker, Major, Minor, confirmed, of }
//   gradeLines(problems)

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';

export const GRADES = ['Blocker', 'Major', 'Minor'];
export const GRADES_FILE = 'design-system-engine-grades.json';

// The id a problem keeps from one check to the next: what found it and what it says, so the same problem found again
// keeps the grade a reviewer gave it, and a changed one is graded again.
const idOf = (source, message) => createHash('sha1').update(`${source}\u0000${message}`).digest('hex').slice(0, 8);
const strip = (l) => String(l).replace(/^⚠️\s+/, '');

// What each kind of problem stops, and so the grade it is proposed at.
// Blocker: the task stops there. Major: a person can get through, with real trouble, or some people cannot.
// Minor: the page reads less well and nothing is stopped.
const VISUAL = {
  primary: ['Major', 'two main actions in view compete, so a person cannot tell which one moves the task on'],
  hierarchy: ['Minor', 'the headings read out of order, and the content is all still there'],
  align: ['Minor', 'parts out of line read as untidy, and nothing is stopped'],
  rhythm: ['Minor', 'uneven spacing reads as untidy, and nothing is stopped'],
  touching: ['Minor', 'parts with no space between them read as one, and nothing is stopped'],
  spacings: ['Minor', 'many different spaces make the page read as unplanned, and nothing is stopped'],
  reading: ['Minor', 'long lines are harder to read, and nothing is stopped'],
};

function fitGrade(f) {
  if (f.kind === 'target') return ['Major', 'a control under 24px is hard to tap on a phone, and fails WCAG 2.2\'s target size (2.5.8, AA)'];
  if (f.kind === 'wide') return f.asWritten
    ? ['Major', 'a part running past the screen\'s edge is out of reach without scrolling sideways, at that width as written']
    : ['Minor', 'only with the words 40% longer (as a translation makes them) does a part run past the edge'];
  if (f.kind === 'cut') return f.asWritten ? ['Major', 'cut words cannot be read at all'] : ['Minor', 'only longer words are cut, as a translation would make them'];
  if (f.kind === 'spill') return f.asWritten ? ['Major', 'words out of their box overlap what is beside them'] : ['Minor', 'only longer words spill, as a translation would make them'];
  return ['Minor', 'a control\'s label on two lines reads less well, and it still works'];
}

function interactionGrade(line) {
  if (/is wired and threw/.test(line)) return ['Minor', 'it needs something the page was drawn without, so whether it works is unproven: a reviewer tries it in the product'];
  if (/does not open|takes no typing|changes nothing on the page|does not turn on and off|does not show and hide/.test(line)) return ['Blocker', 'a control that does not do what it shows stops the task there'];
  if (/without the focus inside|does not close with Escape|does not give the focus back/.test(line)) return ['Major', 'a keyboard or screen reader user loses their place or cannot leave, and others get through'];
  return ['Major', 'a control does not work as it shows'];
}

// visual: the page review ({ findings: [{ kind, message }] }); fit: [{ finding, line }] each width problem with its line;
// owed: [{ kind }] the states the page owes; interactions: the lines of what was tried and did not work.
export function reviewProblems({ visual = null, fit = [], owed = [], interactions = [] } = {}) {
  const out = [];
  const add = (source, message, [grade, why]) => { const m = strip(message); if (!out.some((p) => p.source === source && p.message === m)) out.push({ id: idOf(source, m), source, message: m, proposed: { grade, why } }); };
  for (const f of visual?.findings ?? []) add('layout', f.message, VISUAL[f.kind] ?? ['Minor', 'how the page is laid out, and nothing is stopped']);
  for (const { finding, line } of fit) add('widths', line, fitGrade(finding ?? {}));
  for (const o of owed) { const s = o.kind ?? o.state; if (s) add('states', `the page owes its ${s} state`, ['Major', `a person who meets the ${s} state sees a page not made for it`]); }
  for (const l of interactions) add('works', l, interactionGrade(strip(l)));
  return out;
}

export function readGrades(root) {
  try { const r = JSON.parse(readFileSync(join(root, GRADES_FILE), 'utf8')); return Array.isArray(r?.grades) ? r.grades : []; } catch { return []; }
}

// A grade given by a person, named: the engine never grades, and an agent's own grade is refused by the guard.
export function gradeProblem(root, { prototype, id, grade, by, why = null, message = null, proposed = null, at = new Date().toISOString() }) {
  const g = GRADES.find((x) => x.toLowerCase() === String(grade ?? '').toLowerCase());
  if (!g) throw new Error(`"${grade}" is not a grade: one of ${GRADES.join(', ')}`);
  if (!String(by ?? '').trim()) throw new Error('a grade is a person\'s: say who gives it (--by "<name>")');
  const grades = readGrades(root).filter((x) => !(x.prototype === prototype && x.id === id));
  grades.push({ prototype, id, grade: g, by: String(by).trim(), at, ...(why ? { why } : {}), ...(message ? { message } : {}), ...(proposed ? { proposed } : {}) });
  const file = join(root, GRADES_FILE);
  writeFileSync(file, JSON.stringify({ $description: 'The grade a reviewer gave each problem a prototype\'s check found (Blocker, Major or Minor), with who gave it. The engine proposes a grade; this is the person\'s.', grades }, null, 2) + '\n');
  return { file, grade: g };
}

export function withGrades(problems = [], grades = [], prototype) {
  return problems.map((p) => {
    const g = grades.find((x) => x.prototype === prototype && x.id === p.id);
    return g ? { ...p, grade: { grade: g.grade, by: g.by, at: g.at, ...(g.why ? { why: g.why } : {}) } } : p;
  });
}

// The grade each problem stands at: the reviewer's where they gave one, else the one proposed.
export function gradeCounts(problems = []) {
  const out = { Blocker: 0, Major: 0, Minor: 0, confirmed: 0, of: problems.length };
  for (const p of problems) { out[(p.grade ?? p.proposed).grade]++; if (p.grade) out.confirmed++; }
  return out;
}

export function gradeLines(problems = [], { prototype = null, cmd = 'rms-design-system-engine' } = {}) {
  if (!problems.length) return [];
  const c = gradeCounts(problems);
  const lines = [`⚖️  UX GRADES  ${GRADES.map((g) => `${c[g]} ${g}`).join(' · ')} · ${c.confirmed} of ${c.of} confirmed by a reviewer, the rest proposed`];
  for (const p of [...problems].sort((a, b) => GRADES.indexOf((a.grade ?? a.proposed).grade) - GRADES.indexOf((b.grade ?? b.proposed).grade))) {
    lines.push(p.grade
      ? `   ${p.grade.grade} (${p.grade.by}${p.grade.grade !== p.proposed.grade ? `, proposed ${p.proposed.grade}` : ''})  [${p.id}] ${p.message}`
      : `   ${p.proposed.grade}, proposed  [${p.id}] ${p.message}: ${p.proposed.why}`);
  }
  if (c.confirmed < c.of && prototype) lines.push(`   A reviewer confirms or changes each: ${cmd} --grade ${prototype} <id> <${GRADES.join('|')}> --by "<name>"`);
  return lines;
}

export const gradesExist = (root) => existsSync(join(root, GRADES_FILE));
