// prototype-judgment.mjs - did what the designer asked for come out whole, judged on the drawn flow.
//
// Everything else the engine checks about a prototype is structure: the components are the system's, the pages
// link, a shape owes what it owes, the page still owes a route. All of it can hold while the thing is useless -
// the designer asked for a way to approve an order and got a page where the approve button leads nowhere, and
// every check passes because nothing it measures is wrong.
//
// Whether a request came out whole is judgement, and judgement is what a model can do and a word count cannot. So
// a model is asked, the way --judge-pages asks one about a Showroom screen (page-judgment.mjs, whose answer
// reading, caching, cost accounting and advisory contract this follows). What is different here is the question:
// not "is this screen well made" but "could the person who asked for this use it for the thing they asked for".
//
// The decisions are named and fixed, because a judgement nobody can repeat is an opinion. Only four, and each is
// something that should be the same every time:
//   asked      - the flow does the thing the request asked for, end to end
//   whole      - a person gets through it without meeting a part that is drawn but does nothing
//   honest     - what the system lacks is shown as a gap, not faked with something that looks like it
//   shown      - it could go in front of someone in a user test as it is
//
// Advisory, never a failure. Asked only when asked for, because it spends the person's model tokens. Kept by the
// pictures' hashes and the request's, so a flow that did not change is never paid for twice. And it judges the
// drawn flow against the request as given: a judgement taken from the pages alone would be the pages marking
// their own work.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { parseAnswer, DEFAULT_CMD } from './page-judgment.mjs';
import { OUT_DIR } from './names.mjs';

export const RESULT_FILE = `${OUT_DIR}/prototype-judgment.json`;
export const CACHE_FILE = `${OUT_DIR}/prototype-judgment-cache.json`;
// Bumped when a decision's words change, so an answer to an older question is never reused for this one.
export const PROMPT_VERSION = 1;
export const VERDICTS = ['holds', 'breaks', 'unclear'];
export const SEVERITIES = ['high', 'medium', 'low'];

const sha = (x) => createHash('sha256').update(x).digest('hex').slice(0, 16);
const flat = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();
const cap = (s, n) => { const t = flat(s); return t.length > n ? `${t.slice(0, n - 1)}…` : t; };
const readJson = (p, fallback) => { try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return fallback; } };

export const DECISIONS = {
  asked: { label: 'It does what was asked', ask: 'It does what was asked: the flow carries out the thing the request describes, from its first page to its last. A flow that does something near it, or part of it, breaks this.' },
  whole: { label: 'Nothing drawn but dead', ask: 'Nothing drawn but dead: every control a person would reach for leads somewhere or changes something. A button, tab or row that is drawn and does nothing breaks this, however good it looks.' },
  honest: { label: 'What is missing is shown as missing', ask: 'What is missing is shown as missing: where the design system has no component for something, the page shows it as a gap rather than faking it with a component meant for something else or with a drawing of its own. Something faked to look finished breaks this.' },
  shown: { label: 'Fit to put in front of someone', ask: 'Fit to put in front of someone: the flow could be used in a user test as it is, with no part of it needing to be explained away. Placeholder words left in, a page that ends nowhere, or a step a person cannot complete breaks this.' },
};
export const DECISION_IDS = Object.keys(DECISIONS);

// The decisions this project judges: all of them, or the ones prototypeJudgment.decisions names. A name the
// engine does not know is said and left out; a decision is never rewritten in a project's own words, so a
// judgement means the same thing on every project.
export function decisionsFrom(cfg = {}) {
  const want = cfg?.prototypeJudgment?.decisions;
  if (!Array.isArray(want) || !want.length) return { decisions: DECISION_IDS.map((id) => ({ id, ...DECISIONS[id] })), unknown: [] };
  const known = want.filter((n) => DECISION_IDS.includes(n));
  return { decisions: known.map((id) => ({ id, ...DECISIONS[id] })), unknown: want.filter((n) => !DECISION_IDS.includes(n)) };
}

// The question, for one flow. The request is given as the designer wrote it, because what was asked and what was
// drawn are the two things being compared.
export function judgmentPrompt({ request, pages = [], decisions = [] }) {
  return [
    'You are judging whether a prototype does what the person who asked for it wanted. Judge only the decisions listed, only on what these pages show.',
    '',
    `What was asked for, in the designer's own words:\n${request}`,
    '',
    `The flow has ${pages.length} page(s). For each, read the image file before you answer: it is the page as a person sees it.`,
    ...pages.map((p, i) => [
      `${i + 1}. ${p.name}${p.leadsTo?.length ? ` → ${p.leadsTo.join(', ')}` : ' (leads nowhere)'}`,
      `   picture: ${p.shot}`,
      p.outline ? `   outline: ${cap(p.outline, 1500)}` : '   outline: (empty)',
    ].join('\n')),
    '',
    'The decisions to judge:',
    ...decisions.map((d, i) => `${i + 1}. ${d.id}: ${d.ask}`),
    '',
    'Answer with JSON only, no other text, one entry per decision in the order above:',
    `{"findings":[{"decision":"${decisions.map((d) => d.id).join('|')}","verdict":"holds|breaks|unclear","severity":"high|medium|low","evidence":"what you saw, and on which page","check":"one sentence a person can check on the pages themselves"}]}`,
    'Severity: high when the designer could not use this for what they asked, medium when they could but would have to explain it away, low otherwise. A decision that holds is low.',
    '',
  ].join('\n');
}

// What the model answered, held to the decisions that were asked. An answer about a decision nobody asked is
// dropped; a decision with no answer is left out rather than guessed at.
export function parseJudgment(text, decisions = []) {
  const m = String(text ?? '').match(/\{[\s\S]*\}/);
  if (!m) return null;
  let got; try { got = JSON.parse(m[0]); } catch { return null; }
  const rows = Array.isArray(got?.findings) ? got.findings : null;
  if (!rows) return null;
  const want = new Map(decisions.map((d) => [d.id, d]));
  const out = [];
  for (const r of rows) {
    const d = want.get(String(r?.decision ?? '').trim());
    if (!d || out.some((x) => x.decision === d.id)) continue;
    out.push({
      decision: d.id,
      label: d.label,
      verdict: VERDICTS.includes(r?.verdict) ? r.verdict : 'unclear',
      severity: SEVERITIES.includes(r?.severity) ? r.severity : 'low',
      evidence: cap(r?.evidence, 300),
      check: cap(r?.check, 200),
    });
  }
  return out.length ? out : null;
}

// Only what a person has to act on.
export const broken = (findings = []) => findings.filter((f) => f.verdict === 'breaks');

// What a run says. A judgement that holds is said in one line, because "nothing to report" from a thing that was
// paid for should look different from a thing that never ran.
export function judgmentLines(run) {
  if (!run) return [];
  if (run.why) return ['', `⚖️  THE REQUEST, JUDGED  not judged: ${run.why}`];
  const bad = broken(run.findings);
  const cost = run.cost ? ` · $${run.cost.toFixed(2)}` : '';
  const cached = run.cached ? ' (unchanged since it was last judged)' : '';
  if (!bad.length) return ['', `⚖️  THE REQUEST, JUDGED  ${run.findings.length} decision(s), all hold${cost}${cached}`];
  const out = ['', `⚖️  THE REQUEST, JUDGED  ${bad.length} of ${run.findings.length} decision(s) break${cost}${cached}:`];
  for (const f of bad) {
    out.push(`   ${f.severity === 'high' ? '❌' : '⚠️ '} ${f.label}: ${f.evidence}`);
    if (f.check) out.push(`      check: ${f.check}`);
  }
  out.push('   Advisory: a model read the drawn pages, not a person. Each says what to check on the pages themselves.');
  return out;
}

// One flow judged against its request. pages: [{ name, shot, outline, leadsTo }].
// → { at, findings, asked, cached, cost, why }
export async function judgePrototype(ROOT, cfg = {}, { request = '', pages = [], ask = null, now = new Date().toISOString() } = {}) {
  const { decisions, unknown } = decisionsFrom(cfg);
  const base = { at: now, decisions: decisions.map((d) => d.id), unknown, findings: [], asked: 0, cached: false, cost: 0 };
  if (!flat(request)) return { ...base, why: 'no request to judge it against: this compares what was asked with what was drawn' };
  if (!pages.length) return { ...base, why: 'no drawn page to judge' };
  if (!decisions.length) return { ...base, why: 'no decision to judge (prototypeJudgment.decisions names none the engine knows)' };
  const shots = [];
  for (const p of pages) {
    // No picture is no judging: this asks about the pages as a person sees them, and a model reading only the
    // outline would be answering a different question than the line claims.
    try { shots.push(readFileSync(resolve(ROOT, p.shot))); } catch { return { ...base, why: `no picture of "${p.name}" was drawn` }; }
  }
  const key = sha(JSON.stringify({ v: PROMPT_VERSION, request: flat(request), ids: decisions.map((d) => d.id), shots: shots.map(sha) }));
  const cachePath = resolve(ROOT, CACHE_FILE);
  const cache = readJson(cachePath, {});
  if (cache[key]?.findings) return { ...base, findings: cache[key].findings, cached: true };
  if (!ask) {
    const { askModel } = await import('./guidance-rating.mjs');
    ask = (prompt) => askModel(prompt, cfg.prototypeJudgment?.cmd ?? cfg.pageJudgment?.cmd ?? DEFAULT_CMD, { cwd: ROOT, timeout: 600000 });
  }
  const answered = await ask(judgmentPrompt({ request: flat(request), pages, decisions }));
  const { text, cost, error } = parseAnswer(answered);
  if (error) return { ...base, asked: 1, why: error };
  const findings = parseJudgment(text, decisions);
  if (!findings) return { ...base, asked: 1, why: 'the answer was not the JSON that was asked for' };
  const run = { ...base, findings, asked: 1, cost: typeof cost === 'number' ? cost : 0 };
  cache[key] = { at: now, findings };
  try { mkdirSync(dirname(cachePath), { recursive: true }); writeFileSync(cachePath, JSON.stringify(cache, null, 2) + '\n'); } catch { /* the run still stands */ }
  try { writeFileSync(resolve(ROOT, RESULT_FILE), JSON.stringify(run, null, 2) + '\n'); } catch { /* the lines still say it */ }
  return run;
}
