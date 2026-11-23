// change-judgment.mjs - a second pass on an agent's change: did it stay inside the system, and did it do what was asked.
//
// The checks that give the same answer every time already run on each edit (edit-check.mjs): a colour written by
// hand, a component rebuilt, a prop that does not exist. A change can pass every one of them and still be wrong as a
// whole: it builds a list by hand where the catalog has one, or it does something near what was asked and not the
// thing. Only a reader of the whole diff, beside the request, sees that.
//
// So, once the deterministic checks pass, a second model reads the diff with the request and the system's catalog and
// answers two decisions apart, each with its why:
//   system  - it stayed inside the system: the component made for each job, nothing rebuilt that the catalog has,
//             the system's tokens rather than values
//   asked   - it did what was asked, the whole of it, and nothing the request did not ask for
// It is a second model on purpose: the person's own command (prototypeJudgment's, by default `claude -p`), run as a
// process of its own with its own context, never the session that made the change, which would be marking its own work.
// Advisory, never a pass or fail on its own. Asked only when asked for, since it spends the person's model tokens, and
// kept by the diff's and the request's hash, so the same change is never paid for twice.
//
//   DECISIONS                                   → the two decisions, each with what the model is asked
//   changeDiff(ROOT, { base })                  → the diff to judge (the branch against its base, else what is not committed)
//   catalogLines(ROOT, cfg)                     → [line] each component of the system with what it is for
//   changePrompt({ request, diff, catalog })    → the prompt
//   judgeChange(ROOT, cfg, { request, base, diff, ask }) → { at, findings, cached, cost, why }
//   changeLines(run)                            → [lines] for the terminal
//   changeMarkdown(run)                         → the same, for a pull request
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { parseAnswer, whyFailed, DEFAULT_CMD } from './page-judgment.mjs';
import { OUT_DIR } from './names.mjs';

export const RESULT_FILE = `${OUT_DIR}/change-judgment.json`;
export const CACHE_FILE = `${OUT_DIR}/change-judgment-cache.json`;
export const PROMPT_VERSION = 1;
export const VERDICTS = ['holds', 'breaks', 'unclear'];
export const SEVERITIES = ['high', 'medium', 'low'];
// The most of a diff a model is given: a change larger than this is judged on its start, and the run says so.
export const MAX_DIFF = 60000;

export const DECISIONS = [
  { id: 'system', label: 'It stayed inside the system', ask: 'It stayed inside the system: each part of the change uses the system component made for that job (read what each is for in the catalog below), nothing the catalog has is rebuilt by hand, and colours, spacing and type come from the system\'s tokens, not values written in. A list, a button or a card built from scratch where the catalog has one breaks this.' },
  { id: 'asked', label: 'It did what was asked', ask: 'It did what was asked: the change carries out the request, the whole of it, and adds nothing the request did not ask for. A change that does something near it, or only part of it, breaks this.' },
];

const sha = (x) => createHash('sha256').update(String(x)).digest('hex').slice(0, 16);
const flat = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();
const cap = (s, n) => { const t = flat(s); return t.length > n ? `${t.slice(0, n - 1)}…` : t; };
const readJson = (p, fallback) => { try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return fallback; } };
const git = (ROOT, args) => { const r = spawnSync('git', args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }); return r.status === 0 ? r.stdout : null; };

// The change: the branch against its base (origin/main, or the base given), else what is not committed yet.
export function changeDiff(ROOT, { base = null } = {}) {
  const from = base ?? ['origin/main', 'origin/master', 'main', 'master'].find((b) => git(ROOT, ['rev-parse', '--verify', '--quiet', b]) !== null);
  const branch = from ? git(ROOT, ['diff', `${from}...HEAD`]) : null;
  if (branch && branch.trim()) return { diff: branch, from };
  const work = git(ROOT, ['diff', 'HEAD']);
  return { diff: work ?? '', from: work && work.trim() ? 'what is not committed' : null };
}

// Each component of the system with what it is for: the catalog the contracts write, else the contracts themselves.
export function catalogLines(ROOT, cfg = {}) {
  const out = cfg.contracts?.out ?? 'contracts';
  const cat = readJson(resolve(ROOT, out, 'catalog.json'), null);
  const comps = cat?.components ?? null;
  if (comps && typeof comps === 'object') return Object.entries(comps).map(([n, c]) => `- ${n}${c?.purpose || c?.description ? `: ${cap(c.purpose ?? c.description, 160)}` : ''}`);
  let files;
  try { files = readdirSync(resolve(ROOT, out)).filter((f) => f.endsWith('.contract.json')); } catch { return []; }
  return files.map((f) => readJson(join(resolve(ROOT, out), f), null)).filter(Boolean).map((c) => `- ${c.name}${c.description ? `: ${cap(c.description, 160)}` : ''}`);
}

export function changePrompt({ request, diff, catalog = [] }) {
  const cut = diff.length > MAX_DIFF;
  return [
    'You are reviewing a change an agent made to a product\'s code, as a second reader. You did not make it. Judge it on its own.',
    '',
    `The request the change was made for:\n${flat(request)}`,
    '',
    catalog.length ? `The design system's components, each with what it is for:\n${catalog.join('\n')}` : 'The design system\'s components are not listed: judge only from the diff.',
    '',
    `The change, as a diff${cut ? ` (its first ${MAX_DIFF} characters of ${diff.length})` : ''}:\n${diff.slice(0, MAX_DIFF)}`,
    '',
    'Answer each decision apart:',
    ...DECISIONS.map((d) => `- ${d.id}: ${d.ask}`),
    '',
    'For each, a verdict (holds, breaks or unclear), a severity when it breaks (high, medium or low), the evidence from the diff in one or two sentences (the file and what it does), and what a person should check. Answer with this JSON and nothing else:',
    '{"findings":[{"decision":"system","verdict":"holds","severity":"low","evidence":"…","check":"…"},{"decision":"asked","verdict":"holds","severity":"low","evidence":"…","check":"…"}]}',
  ].join('\n');
}

export function parseChangeJudgment(text) {
  const t = String(text ?? '').replace(/^\s*```(?:json)?\s*|\s*```\s*$/g, '');
  const a = t.indexOf('{'), b = t.lastIndexOf('}');
  if (a < 0 || b <= a) return null;
  let j; try { j = JSON.parse(t.slice(a, b + 1)); } catch { return null; }
  const rows = Array.isArray(j?.findings) ? j.findings : null;
  if (!rows) return null;
  const out = [];
  for (const r of rows) {
    const d = DECISIONS.find((x) => x.id === String(r?.decision ?? '').trim());
    if (!d || out.some((x) => x.decision === d.id)) continue;
    const verdict = String(r?.verdict ?? '').trim().toLowerCase();
    out.push({ decision: d.id, label: d.label, verdict: VERDICTS.includes(verdict) ? verdict : 'unclear', severity: SEVERITIES.includes(r?.severity) ? r.severity : 'low', evidence: cap(r?.evidence, 400), check: cap(r?.check, 240) });
  }
  return out.length ? out : null;
}

export async function judgeChange(ROOT, cfg = {}, { request = '', base = null, diff = null, ask = null, now = new Date().toISOString() } = {}) {
  const got = diff != null ? { diff, from: base } : changeDiff(ROOT, { base });
  const run = { at: now, from: got.from ?? null, findings: [], cached: false, cost: 0 };
  if (!flat(request)) return { ...run, why: 'no request to judge it against: this compares what was asked with what was changed' };
  if (!String(got.diff ?? '').trim()) return { ...run, why: 'no change to judge (nothing differs from its base, and nothing is uncommitted)' };
  const catalog = catalogLines(ROOT, cfg);
  const key = sha(JSON.stringify({ v: PROMPT_VERSION, request: flat(request), diff: sha(got.diff), catalog }));
  const cachePath = resolve(ROOT, CACHE_FILE);
  const cache = readJson(cachePath, {});
  if (cache[key]?.findings) return { ...run, findings: cache[key].findings, cached: true };
  if (!ask) {
    const { askModel } = await import('./guidance-rating.mjs');
    ask = (prompt) => askModel(prompt, cfg.changeJudgment?.cmd ?? cfg.prototypeJudgment?.cmd ?? cfg.pageJudgment?.cmd ?? DEFAULT_CMD, { cwd: ROOT, timeout: 600000 });
  }
  const answered = await ask(changePrompt({ request, diff: got.diff, catalog }));
  if (!answered?.ok) return { ...run, why: whyFailed(answered) };
  const { text, cost, error } = parseAnswer(answered.out);
  if (error) return { ...run, why: error };
  const findings = parseChangeJudgment(text);
  if (!findings) return { ...run, why: 'the answer was not the JSON that was asked for' };
  const done = { ...run, findings, cost: typeof cost === 'number' ? cost : 0, ...(got.diff.length > MAX_DIFF ? { cut: true } : {}) };
  cache[key] = { at: now, findings };
  try { mkdirSync(dirname(cachePath), { recursive: true }); writeFileSync(cachePath, JSON.stringify(cache, null, 2) + '\n'); } catch { /* the run still stands */ }
  try { writeFileSync(resolve(ROOT, RESULT_FILE), JSON.stringify(done, null, 2) + '\n'); } catch { /* the lines still say it */ }
  return done;
}

const MARK = { holds: '✅', breaks: '⚠️', unclear: '❔' };
export function changeLines(run) {
  if (!run) return [];
  if (run.why) return [`⚖️  THE CHANGE, JUDGED AGAIN  not judged: ${run.why}`];
  const cost = run.cost ? ` · $${run.cost.toFixed(2)}` : '';
  const out = [`⚖️  THE CHANGE, JUDGED AGAIN  by a second model, against ${run.from ?? 'its base'}${cost}${run.cached ? ' (unchanged since it was last judged)' : ''}${run.cut ? ' (a long change, judged on its start)' : ''}:`];
  for (const f of run.findings) {
    out.push(`   ${MARK[f.verdict]} ${f.label}: ${f.verdict}${f.verdict === 'breaks' ? ` (${f.severity})` : ''}. ${f.evidence}`);
    if (f.check && f.verdict !== 'holds') out.push(`      check: ${f.check}`);
  }
  out.push('   Advisory: a model read the diff, not a person. Neither answer passes or fails the change on its own.');
  return out;
}

export function changeMarkdown(run) {
  if (!run) return '';
  if (run.why) return `**The change, judged again:** not judged, ${run.why}.`;
  const rows = run.findings.map((f) => `- ${MARK[f.verdict]} **${f.label}**: ${f.verdict}${f.verdict === 'breaks' ? ` (${f.severity})` : ''}. ${f.evidence}${f.check && f.verdict !== 'holds' ? `\n  - Check: ${f.check}` : ''}`);
  return ['**The change, judged again by a second model** (advisory: it read the diff beside the request, and neither answer passes or fails the change):', '', ...rows].join('\n');
}
