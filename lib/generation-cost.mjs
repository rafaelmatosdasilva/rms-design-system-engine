// generation-cost.mjs - what each generated change cost, beside whether it passed.
//
// A team that lets people generate pages and components all day needs to know what it spends and what it gets. The
// hooks already see each request, each UI edit and its check, and the end of each turn, so each request that made a
// UI edit is kept: the rounds the agent took (each UI edit checked is one), the time from the request to the end of
// the turn, the input and output tokens the transcript reports, whether its first check passed and whether its last
// did. A request that took ten rounds to pass is a gap in the system, not only an expensive request, and is listed so.
// Kept in the engine's own output folder (generations.jsonl), on this computer; nothing is sent anywhere.
//
//   startRequest(root, { session, prompt, at })   UserPromptSubmit: a request opens
//   noteRound(root, { session, found, file })     PostToolUse: one UI edit checked, with what it found
//   endRequest(root, { session, transcript, at }) Stop: the request closes, kept when it made a UI edit
//   readGenerations(root) / weekly(rows) / generationLines(weeks, rows)

import { readFileSync, writeFileSync, appendFileSync, mkdirSync, existsSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { OUT_DIR } from './names.mjs';

const OPEN = 'generation-open.json';
export const GENERATIONS = 'generations.jsonl';
// A request this many rounds long before it passed, or still failing at the end, says the system lacks something.
export const LONG = 5;

const dir = (root) => join(root, OUT_DIR);
const openFile = (root) => join(dir(root), OPEN);
const readOpen = (root) => { try { return JSON.parse(readFileSync(openFile(root), 'utf8')); } catch { return {}; } };
const writeOpen = (root, o) => { mkdirSync(dir(root), { recursive: true }); writeFileSync(openFile(root), JSON.stringify(o)); };
const key = (session) => String(session ?? 'session');

// The request's own words are kept short: enough to recognise it in a list, never the whole of what was asked.
export function startRequest(root, { session = null, prompt = '', at = new Date().toISOString() } = {}) {
  const o = readOpen(root);
  o[key(session)] = { at, prompt: String(prompt).replace(/\s+/g, ' ').trim().slice(0, 120), rounds: 0, files: [], first: null, last: null };
  writeOpen(root, o);
}

// found: what the edit check found in this edit (its findings), [] when it passed. added: the lines the edit added,
// the attempt. Each file keeps its last rounds, so a loop the agent and the check cannot get out of is seen (stuckOn).
// → the file's rounds, newest last.
export function noteRound(root, { session = null, found = [], file = null, added = [] } = {}) {
  const o = readOpen(root);
  const r = o[key(session)];
  if (!r) return [];
  r.rounds++;
  const n = Array.isArray(found) ? found.length : Number(found) || 0;
  if (r.first == null) r.first = n;
  r.last = n;
  if (file && !r.files.includes(file)) r.files = [...r.files, file].slice(0, 20);
  let hist = [];
  if (file) {
    r.byFile ??= {};
    // What the check said, without where: the same finding a line further down is the same finding.
    const said = Array.isArray(found) ? [...new Set(found.map((f) => String(f.text ?? f.message ?? f).replace(/^[^:]*:\d+\s+/, '').trim()))].sort() : [];
    hist = [...(r.byFile[file] ?? []), { said, tried: (added ?? []).map((l) => String(l).trim()).filter(Boolean).slice(0, 3) }].slice(-STUCK);
    r.byFile[file] = hist;
  }
  writeOpen(root, o);
  return hist;
}

// Three rounds on one file in a row, each answered with the same findings: the agent's fix and the check disagree,
// and another round would end in a change made to pass the check rather than to be right. → the hand-off, or null.
export const STUCK = 3;
export function stuckOn(hist = []) {
  if (hist.length < STUCK) return null;
  const last = hist.slice(-STUCK);
  const same = last.every((h) => h.said.length && JSON.stringify(h.said) === JSON.stringify(last[0].said));
  return same ? { findings: last[0].said, attempts: last.map((h) => h.tried) } : null;
}

// What the agent is told instead of "fix it", the third time: stop, and hand it to the person with what was tried.
export function handOffText(file, stuck) {
  const tried = stuck.attempts.map((t, i) => `  round ${i + 1}: ${t.length ? t.map((l) => l.slice(0, 80)).join(' · ') : '(nothing added)'}`);
  return [
    `rms-design-system-engine checked ${file} ${STUCK} times in a row, and each time it found the same: your fix and the check do not agree.`,
    ...stuck.findings.slice(0, 6).map((f) => `  ${f}`),
    'What each round tried:', ...tried,
    'Stop editing this file for it. Hand it to the person: say each finding, what you tried in each round and what the check answered, and ask which is right. Never change the code only to make the check pass.',
  ].join('\n');
}

// The tokens the transcript reports for this request: every assistant message after the person's last message.
export function tokensSince(transcriptPath) {
  if (!transcriptPath || !existsSync(transcriptPath)) return null;
  const entries = readFileSync(transcriptPath, 'utf8').split('\n').filter((l) => l.trim()).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
  let start = 0;
  entries.forEach((e, i) => {
    const c = e.message?.content;
    const typed = e.type === 'user' && !e.isMeta && (typeof c === 'string' || (Array.isArray(c) && c.some((x) => x?.type === 'text')));
    if (typed) start = i;
  });
  const seen = new Set();
  let input = 0, output = 0, any = false;
  for (const e of entries.slice(start)) {
    if (e.type !== 'assistant' || !e.message?.usage) continue;
    const id = e.message.id; if (id && seen.has(id)) continue; if (id) seen.add(id);
    const u = e.message.usage; any = true;
    input += (u.input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0);
    output += u.output_tokens ?? 0;
  }
  return any ? { input, output } : null;
}

export function endRequest(root, { session = null, transcript = null, at = new Date().toISOString() } = {}) {
  const o = readOpen(root);
  const r = o[key(session)];
  if (!r) return null;
  delete o[key(session)];
  if (Object.keys(o).length) writeOpen(root, o); else { try { unlinkSync(openFile(root)); } catch { /* gone */ } }
  // A request that made no UI edit is a question or an audit, not a generation.
  if (!r.rounds) return null;
  const row = { at: r.at, ms: Math.max(0, Date.parse(at) - Date.parse(r.at)), prompt: r.prompt, rounds: r.rounds, files: r.files,
    passedFirst: r.first === 0, passed: r.last === 0, tokens: tokensSince(transcript) };
  mkdirSync(dir(root), { recursive: true });
  appendFileSync(join(dir(root), GENERATIONS), JSON.stringify(row) + '\n');
  return row;
}

export function readGenerations(root) {
  try { return readFileSync(join(dir(root), GENERATIONS), 'utf8').split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean); } catch { return []; }
}

// The Monday a request's week starts on, in UTC.
const weekOf = (at) => { const d = new Date(at); const day = (d.getUTCDay() + 6) % 7; d.setUTCDate(d.getUTCDate() - day); return d.toISOString().slice(0, 10); };
const median = (xs) => { const s = [...xs].sort((a, b) => a - b); if (!s.length) return null; const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

export function weekly(rows = []) {
  const by = new Map();
  for (const r of rows) { const w = weekOf(r.at); if (!by.has(w)) by.set(w, []); by.get(w).push(r); }
  return [...by].sort((a, b) => b[0].localeCompare(a[0])).map(([week, rs]) => ({
    week, requests: rs.length,
    passedFirst: rs.filter((r) => r.passedFirst).length,
    passed: rs.filter((r) => r.passed).length,
    rounds: median(rs.map((r) => r.rounds)),
    minutes: median(rs.map((r) => r.ms / 60000)),
    tokens: rs.some((r) => r.tokens) ? rs.reduce((k, r) => k + (r.tokens?.input ?? 0) + (r.tokens?.output ?? 0), 0) : null,
    long: rs.filter((r) => r.rounds >= LONG || !r.passed).length,
  }));
}

const pct = (n, of) => `${of ? Math.round((100 * n) / of) : 0}%`;
export function generationLines(weeks = [], rows = [], { show = 4 } = {}) {
  if (!weeks.length) return ['No generated change recorded yet: each request that makes a UI edit is kept from the first one the hooks see.'];
  const lines = ['What each week\'s generated changes cost, beside whether they passed'];
  for (const w of weeks.slice(0, show)) {
    lines.push(`   week of ${w.week}: ${w.requests} request${w.requests === 1 ? '' : 's'} · ${pct(w.passedFirst, w.requests)} passed on the first try, ${pct(w.passed, w.requests)} by the end · ${w.rounds} round${w.rounds === 1 ? '' : 's'} and ${w.minutes < 1 ? 'under a minute' : `${Math.round(w.minutes)} min`} each (median)${w.tokens != null ? ` · ${Math.round(w.tokens / 1000).toLocaleString('en')}k tokens` : ''}`);
  }
  const gaps = rows.filter((r) => r.rounds >= LONG || !r.passed).slice(-5).reverse();
  if (gaps.length) {
    lines.push(`   Requests that say the system lacks something (${LONG} rounds or more, or never passed):`);
    for (const r of gaps) lines.push(`      · ${String(r.at).slice(0, 10)} "${r.prompt}": ${r.rounds} round${r.rounds === 1 ? '' : 's'}${r.passed ? '' : ', still failing at the end'}`);
  }
  return lines;
}
