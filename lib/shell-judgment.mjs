// shell-judgment.mjs - which of the system's own page shells a request starts from, judged by a model.
//
// A prototype starts from a shell, and which one it starts from is the decision everything else is laid inside.
// The engine ranked them by counting the words a request and a shell's description share, minus the words every
// shell uses (prototype-directions.mjs). That reads a request only where it happens to use the documentation's
// own vocabulary. A request to browse orders and a shell documented for inquiry and list screens share no word
// at all, so the count came back zero for every shell, the order fell back to the alphabet, and the catalog said
// the honest thing it could say from a count: these are the shells, and that choice is yours.
//
// The choice is a judgement - does this request start from this shell - and judgement is what a model can do and
// a word count cannot. So a model is asked, the way --judge asks one whether a request came out whole
// (prototype-judgment.mjs, whose answer reading, caching, cost accounting and advisory contract this follows).
//
// Three things it is held to, and they are the reason this is worth having rather than a free-text answer:
//   - It chooses only from the shells it was given. A name that is not one of them is dropped, not renamed to
//     the nearest. The engine's promise to a prototype is that nothing else exists, and a shell invented here
//     would be the one place that promise is broken.
//   - It says why in the documentation's own words. The reason is read back against the shell's description, and
//     one that rests on nothing the documentation says is kept but marked, so a reviewer can see which reasons
//     came from the system and which from the model's own idea of what the name means.
//   - It may answer that none of them fits. A system whose shells do not cover a request should hear so, and a
//     ranking that always produces a winner cannot say it.
//
// Advisory, never a failure, and never asked unless asked for: the counted order stands on its own, and this is
// laid over it. Kept by the request's and the shells' hashes, so the same question is never paid for twice.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { parseAnswer, DEFAULT_CMD } from './page-judgment.mjs';
import { OUT_DIR } from './names.mjs';
// The prototype route's own reading of a word, stems and all, so "entering" and "entered" are one word here as
// they are everywhere else the engine compares a request with a description.
import { wordsOf } from './prototype-context.mjs';

export const RESULT_FILE = `${OUT_DIR}/shell-judgment.json`;
export const CACHE_FILE = `${OUT_DIR}/shell-judgment-cache.json`;
// Bumped when the question's words change, so an answer to an older question is never reused for this one.
export const PROMPT_VERSION = 1;
export const FITS = ['starts here', 'could', 'no'];

const sha = (x) => createHash('sha256').update(x).digest('hex').slice(0, 16);
const flat = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();
const cap = (s, n) => { const t = flat(s); return t.length > n ? `${t.slice(0, n - 1)}…` : t; };
const readJson = (p, fallback) => { try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return fallback; } };

// The question. Each shell is given with its own documented description and nothing else: the model is choosing
// among the system's shells on what the system says about them, not on what their names suggest to it.
export function shellPrompt({ request, shells = [] }) {
  return [
    'You are choosing which page shell a prototype should start from. A shell is the whole-page layout everything else is laid inside.',
    'Choose only from the shells listed. Do not name any other shell, and do not invent one.',
    '',
    `What was asked for, in the designer's own words:\n${request}`,
    '',
    'The shells this design system has, each with what its own documentation says about it:',
    ...shells.map((s, i) => `${i + 1}. ${s.name}: ${s.purpose ? cap(s.purpose, 400) : '(its documentation says nothing about it)'}`),
    '',
    'For each shell say whether the request starts from it:',
    '  "starts here" - this is the shell the request describes a page of',
    '  "could"       - it would work, but another one fits the request better',
    '  "no"          - the request is not a page of this kind',
    'More than one may be "could". It is a real answer that none of them is "starts here": say so rather than choosing the least wrong.',
    '',
    'Answer with JSON only, no other text, one entry per shell in the order above:',
    `{"shells":[{"name":"<exactly as listed>","fit":"${FITS.join('|')}","why":"one sentence, resting on what the documentation above says about that shell"}]}`,
    '',
  ].join('\n');
}

// Whether a reason rests on what the documentation says, or only on the model's reading of the name. Not a
// judgement of the reason: a note on where it came from, so a reviewer knows which to trust.
export function restsOnDocs(why, purpose) {
  const said = new Set(wordsOf(purpose));
  if (!said.size) return false;
  return wordsOf(why).some((w) => said.has(w));
}

// What the model answered, held to the shells that were asked about. A shell it invented is dropped; one it did
// not answer about is left out rather than guessed at.
export function parseShells(text, shells = []) {
  const m = String(text ?? '').match(/\{[\s\S]*\}/);
  if (!m) return null;
  let got; try { got = JSON.parse(m[0]); } catch { return null; }
  const rows = Array.isArray(got?.shells) ? got.shells : null;
  if (!rows) return null;
  const want = new Map(shells.map((s) => [s.name.toLowerCase(), s]));
  const out = [], invented = [];
  for (const r of rows) {
    const name = flat(r?.name);
    const s = want.get(name.toLowerCase());
    if (!s) { if (name) invented.push(name); continue; }
    if (out.some((x) => x.name === s.name)) continue;
    const why = cap(r?.why, 240);
    out.push({ name: s.name, fit: FITS.includes(r?.fit) ? r.fit : 'no', why, grounded: restsOnDocs(why, s.purpose) });
  }
  return out.length ? { shells: out, invented } : null;
}

// The order a run puts them in: what it starts from, then what could, then the rest, each keeping the order the
// answer gave. A shell the answer never mentioned keeps its counted place at the end.
export function shellOrder(run, shells = []) {
  if (!run?.shells?.length) return shells;
  const rank = new Map(run.shells.map((s, i) => [s.name, [FITS.indexOf(s.fit), i]]));
  return [...shells].sort((a, b) => {
    const x = rank.get(a.name) ?? [FITS.length, 0], y = rank.get(b.name) ?? [FITS.length, 0];
    return x[0] - y[0] || x[1] - y[1];
  });
}

// What a person is told. A run that found no shell to start from says so: that is the answer, not a failure.
export function shellJudgmentLines(run) {
  if (!run) return [];
  if (run.why) return ['', `🧭 WHICH SHELL  not judged: ${run.why}`];
  const cost = run.cost ? ` · $${run.cost.toFixed(2)}` : '';
  const cached = run.cached ? ' (unchanged since it was last asked)' : '';
  const starts = run.shells.filter((s) => s.fit === 'starts here');
  const could = run.shells.filter((s) => s.fit === 'could');
  const out = [''];
  if (!starts.length) {
    out.push(`🧭 WHICH SHELL  none of the ${run.shells.length} shells is one this request starts from${cost}${cached}`);
    for (const s of could) out.push(`   could: ${s.name} — ${s.why}`);
    out.push('   The shell is yours to choose, and the system may be missing the one this asks for: that is worth saying to the design team.');
  } else {
    out.push(`🧭 WHICH SHELL  ${starts.map((s) => s.name).join(', ')}${cost}${cached}`);
    for (const s of starts) out.push(`   ${s.name} — ${s.why}${s.grounded ? '' : ' (not from the documentation: the model read the name)'}`);
    for (const s of could) out.push(`   could also: ${s.name} — ${s.why}`);
  }
  if (run.invented?.length) out.push(`   Left out, because the system has no such shell: ${run.invented.join(', ')}.`);
  out.push('   Advisory: a model read the documentation, not a person. The counted order above stands on its own.');
  return out;
}

// One request judged against the system's shells. shells: [{ name, purpose }].
// → { at, shells, invented, asked, cached, cost, why }
export async function judgeShells(ROOT, cfg = {}, { request = '', shells = [], ask = null, now = new Date().toISOString() } = {}) {
  const base = { at: now, shells: [], invented: [], asked: 0, cached: false, cost: 0 };
  if (!flat(request)) return { ...base, why: 'no request to choose a shell for: this compares what was asked with what the shells are documented for' };
  if (!shells.length) return { ...base, why: 'the system documents no page shell to choose between' };
  if (shells.length < 2) return { ...base, why: `the system has one page shell (${shells[0].name}): there is nothing to choose between` };
  const key = sha(JSON.stringify({ v: PROMPT_VERSION, request: flat(request), shells: shells.map((s) => [s.name, flat(s.purpose)]) }));
  const cachePath = resolve(ROOT, CACHE_FILE);
  const cache = readJson(cachePath, {});
  if (cache[key]?.shells) return { ...base, shells: cache[key].shells, invented: cache[key].invented ?? [], cached: true };
  if (!ask) {
    const { askModel } = await import('./guidance-rating.mjs');
    ask = (prompt) => askModel(prompt, cfg.shellJudgment?.cmd ?? cfg.prototypeJudgment?.cmd ?? cfg.pageJudgment?.cmd ?? DEFAULT_CMD, { cwd: ROOT, timeout: 600000 });
  }
  // ask(prompt) → { ok, out, why }, as the person's command answers (askModel), or a stand-in in tests.
  const answered = await ask(shellPrompt({ request: flat(request), shells }));
  if (!answered?.ok) return { ...base, asked: 1, why: answered?.why || 'the command failed' };
  const { text, cost, error } = parseAnswer(answered.out);
  if (error) return { ...base, asked: 1, why: error };
  const got = parseShells(text, shells);
  if (!got) return { ...base, asked: 1, why: 'the answer was not the JSON that was asked for' };
  const run = { ...base, shells: got.shells, invented: got.invented, asked: 1, cost: typeof cost === 'number' ? cost : 0 };
  cache[key] = { at: now, shells: got.shells, invented: got.invented };
  try { mkdirSync(dirname(cachePath), { recursive: true }); writeFileSync(cachePath, JSON.stringify(cache, null, 2) + '\n'); } catch { /* the run still stands */ }
  try { writeFileSync(resolve(ROOT, RESULT_FILE), JSON.stringify(run, null, 2) + '\n'); } catch { /* the lines still say it */ }
  return run;
}
