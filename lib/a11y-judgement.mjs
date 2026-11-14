// a11y-judgement.mjs - the judgement criteria pre-sorted for a person (WCAG 2.4.6, 3.3.3, 2.4.4).
//
// Three criteria are a person's to settle and no machine's: whether a heading or a label says what follows it
// (2.4.6), whether an error message says how to put it right (3.3.3), and whether a link says where it goes (2.4.4).
// The checks already find what a pattern can find - an empty heading, a name that says little, "click here" - and
// what is left is a reading. An auditor spends their time on it, going through every heading and every message in
// turn, and most of them are fine.
//
// Asked for (--judge-a11y, a11yJudgement.cmd), a model reads only the words a component shows - its headings and
// labels, its link words, its error messages - and marks each one likely to fail, unclear, or fine, with one short
// reason a person can check on the component. It never passes a criterion and never fails one: the row keeps the
// status the checks gave it, and this is listed under it as what to look at first. Advisory, kept by the words and
// the rubric so the same words are never paid for twice, and it spends the person's model tokens, so it runs only
// when asked.
//
//   wordsOf(code)                       → [{ kind, sc, text, where }]  what there is to read, from its own template
//   judgePrompt(name, words)            → the prompt for one component
//   parseJudged(text, words)            → [{ i, verdict, why }] | null
//   judgementOf(result, name)           → { [sc]: [{ text, where, verdict, why }] }  what the style guide shows
//   judgeA11y(ROOT, cfg, components, { ask }) → { components, asked, cached, cost, failed, why }
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { OUT_DIR } from './names.mjs';
import { parseAnswer } from './page-judgment.mjs';

export const RESULT_FILE = `${OUT_DIR}/a11y-judgement.json`;
export const CACHE_FILE = `${OUT_DIR}/a11y-judgement-cache.json`;
// The command that answers a prompt on stdin, as the page judgement's does: no tools at all, since the words are in
// the prompt and nothing on disk has to be read.
export const DEFAULT_CMD = 'claude -p --output-format json --strict-mcp-config';
// Bumped when the prompt's wording changes, so a kept answer to the old words is asked again.
const PROMPT_VERSION = 1;
const VERDICTS = ['likely', 'unclear', 'fine'];

// What each criterion asks of a reader, in the words the prompt uses and the page repeats.
export const JUDGED = {
  '2.4.6': { what: 'a heading or a label', asks: 'does it say what follows it, read on its own, without the rest of the component?' },
  '3.3.3': { what: 'an error message', asks: 'does it say how to put the error right, not only that something is wrong?' },
  '2.4.4': { what: 'a link', asks: 'do its own words say where it goes, read apart from the sentence around it?' },
};

const clean = (s) => String(s ?? '').replace(/<[^>]*>/g, ' ').replace(/&[a-z]+;/gi, ' ').replace(/\s+/g, ' ').trim();
const attr = (tag, name) => new RegExp(`\\s${name}\\s*=\\s*("([^"]*)"|'([^']*)')`, 'i').exec(tag)?.slice(2).find((x) => x != null) ?? null;

// The words a component shows that one of the three criteria is about, read from its own code - a template, a JSX
// return, the markup the style guide draws - which is where they are written.
// A heading and a label are 2.4.6; what is shown as an error is 3.3.3; a link's own words are 2.4.4. Empty words are
// left out: the checks already report those, and a model reading nothing says nothing.
export function wordsOf(code) {
  const html = String(code ?? '');
  const out = [];
  const add = (kind, sc, text, where) => { const t = clean(text); if (t && !out.some((o) => o.sc === sc && o.text === t)) out.push({ kind, sc, text: t.slice(0, 160), where }); };
  // Headings, by tag or by role.
  for (const m of html.matchAll(/<(h[1-6])\b([^>]*)>([\s\S]*?)<\/\1>/gi)) add('heading', '2.4.6', m[3], `<${m[1].toLowerCase()}>`);
  for (const m of html.matchAll(/<([a-z][\w-]*)\b([^>]*\srole\s*=\s*["']heading["'][^>]*)>([\s\S]*?)<\/\1>/gi)) add('heading', '2.4.6', m[3], `role="heading"`);
  // Labels: a <label>, and a name given with aria-label.
  for (const m of html.matchAll(/<label\b([^>]*)>([\s\S]*?)<\/label>/gi)) add('label', '2.4.6', m[2], '<label>');
  for (const m of html.matchAll(/<([a-z][\w-]*)\b([^>]*)>/gi)) { const a = attr(m[2], 'aria-label'); if (a) add('label', '2.4.6', a, `aria-label on <${m[1].toLowerCase()}>`); }
  // What is shown as an error: a live region for errors, or a part named as one.
  for (const m of html.matchAll(/<([a-z][\w-]*)\b([^>]*(?:role\s*=\s*["']alert["']|class\s*=\s*["'][^"']*\b(?:error|invalid|danger)\b[^"']*["'])[^>]*)>([\s\S]*?)<\/\1>/gi)) add('error', '3.3.3', m[3], 'shown as an error');
  // Links, by their own words.
  for (const m of html.matchAll(/<a\b([^>]*\shref\b[^>]*)>([\s\S]*?)<\/a>/gi)) add('link', '2.4.4', m[2] || attr(m[1], 'aria-label') || '', '<a>');
  return out;
}

// One component's prompt: its words, numbered, and the question each criterion asks. Nothing about the component's
// code, its props or its look - this is a reading of words, and anything else invites the model to judge the rest.
export function judgePrompt(name, words) {
  const lines = words.map((w, i) => `${i + 1}. [${w.kind}] "${w.text}" (${w.where})`);
  return [
    `You read the words of one component of a design system, called ${name}, and say which of them a person should look at first.`,
    '',
    'Judge each line below against the question for its kind, and nothing else:',
    ...Object.entries(JUDGED).map(([sc, j]) => `- ${j.what} (WCAG ${sc}): ${j.asks}`),
    '',
    'The words:',
    ...lines,
    '',
    'Answer with JSON only, no prose around it:',
    '{"words":[{"n":1,"verdict":"likely|unclear|fine","why":"one short sentence"}]}',
    '',
    '"likely" means a person will probably have to change it. "unclear" means you cannot tell from the words alone',
    '(you cannot see the component, and a label that reads oddly here may be clear beside what it labels). "fine"',
    'means it answers its question. Give every line a verdict, in order. Keep each "why" under twenty words, say what',
    'you read, and never suggest a replacement: the person writes the words.',
  ].join('\n');
}

// The model's answer, held to what was asked: a verdict for a line that exists, one of the three words, one per line.
export function parseJudged(text, words) {
  const t = String(text ?? '').replace(/^\s*```(?:json)?\s*|\s*```\s*$/g, '');
  const a = t.indexOf('{'), b = t.lastIndexOf('}');
  if (a < 0 || b <= a) return null;
  let j; try { j = JSON.parse(t.slice(a, b + 1)); } catch { return null; }
  const list = Array.isArray(j) ? j : Array.isArray(j?.words) ? j.words : null;
  if (!list) return null;
  const out = [];
  for (const w of list) {
    const i = Number(w?.n) - 1;
    const verdict = String(w?.verdict ?? '').trim().toLowerCase();
    if (!Number.isInteger(i) || i < 0 || i >= words.length || !VERDICTS.includes(verdict) || out.some((x) => x.i === i)) continue;
    out.push({ i, verdict, why: String(w?.why ?? '').replace(/\s+/g, ' ').trim().slice(0, 140) });
  }
  return out.length ? out : null;
}

// What a component's judgement says, per criterion, for the style guide: only what is to look at (a line judged fine
// is not shown - it was never a finding), each with the words, where they are and why it was marked.
export function judgementOf(result, name) {
  const own = result?.components?.[name];
  if (!own) return {};
  const by = {};
  for (const w of own.words ?? []) {
    if (w.verdict === 'fine') continue;
    (by[w.sc] ??= []).push({ text: w.text, where: w.where, verdict: w.verdict, why: w.why });
  }
  return by;
}

// The key a component's answer is kept by: its words and the rubric. The same words are never paid for twice, and a
// change to either asks again.
export const judgementKey = (words) => createHash('sha1').update(JSON.stringify({ v: PROMPT_VERSION, words: words.map((w) => [w.sc, w.text]) })).digest('hex').slice(0, 16);

// Ask for each component with words to read. components: [{ name, code }], its own source text. ask(prompt) → stdout,
// the person's own command (a11yJudgement.cmd); a component whose answer is kept is not asked again.
export async function judgeA11y(ROOT, cfg = {}, components = [], { ask } = {}) {
  const out = { components: {}, asked: 0, cached: 0, cost: 0, failed: [], why: null };
  if (!ask) {
    const { askModel } = await import('./guidance-rating.mjs');
    const cmd = cfg.a11yJudgement?.cmd ?? DEFAULT_CMD;
    ask = (prompt) => askModel(prompt, cmd, { cwd: ROOT, timeout: 600000 });
  }
  const cachePath = join(ROOT, CACHE_FILE);
  let cache = {};
  try { cache = JSON.parse(readFileSync(cachePath, 'utf8')); } catch { /* nothing kept yet */ }
  for (const c of components) {
    const words = wordsOf(c.code ?? c.markup);
    if (!words.length) continue;
    const key = judgementKey(words);
    const kept = cache[c.name]?.key === key ? cache[c.name].words : null;
    if (kept) { out.components[c.name] = { words: kept }; out.cached++; continue; }
    if (!ask) { out.why = 'no command to ask with'; continue; }
    let answer = null;
    try { answer = parseAnswer(await ask(judgePrompt(c.name, words))); } catch (e) { out.failed.push(`${c.name}: ${String(e.message ?? e).split('\n')[0]}`); continue; }
    if (answer?.error) { out.failed.push(`${c.name}: ${answer.error}`); continue; }
    const judged = parseJudged(answer?.text, words);
    if (!judged) { out.failed.push(`${c.name}: the answer did not read as the JSON asked for`); continue; }
    if (Number.isFinite(answer?.cost)) out.cost += answer.cost;
    out.asked++;
    const said = judged.map((x) => ({ ...words[x.i], verdict: x.verdict, why: x.why }));
    out.components[c.name] = { words: said };
    cache[c.name] = { key, words: said };
  }
  try { mkdirSync(dirname(cachePath), { recursive: true }); writeFileSync(cachePath, JSON.stringify(cache, null, 1) + '\n'); } catch { /* keeping is a convenience */ }
  try { writeFileSync(join(ROOT, RESULT_FILE), JSON.stringify({ at: new Date().toISOString(), ...out }, null, 1) + '\n'); } catch { /* the run still says what it found */ }
  return out;
}

// What the run says, in one line.
export function judgementLine(run) {
  if (!run) return null;
  const n = Object.values(run.components ?? {}).reduce((t, c) => t + (c.words ?? []).filter((w) => w.verdict !== 'fine').length, 0);
  const comps = Object.keys(run.components ?? {}).length;
  if (!comps) {
    if (run.failed?.length) return `No words judged: ${run.failed.length === 1 ? "one component's answer" : `${run.failed.length} components' answers`} could not be read.`;
    return run.why ? `No words judged: ${run.why}.` : 'No words to judge.';
  }
  return `${n === 0 ? 'Nothing' : n === 1 ? 'One wording' : `${n} wordings`} to look at first, across ${comps === 1 ? 'one component' : `${comps} components`}` +
    `${run.asked ? ` (${run.asked} asked${run.cached ? `, ${run.cached} kept` : ''}${run.cost ? `, $${run.cost.toFixed(2)}` : ''})` : run.cached ? ` (${run.cached} kept)` : ''}` +
    `${run.failed?.length ? `; ${run.failed.length} not read` : ''}.`;
}
