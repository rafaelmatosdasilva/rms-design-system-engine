// test/skill-evals/procedure.mjs - what following the guide cost a run before it did anything: what it read before its
// first write, which files it read twice, and how far into the run that first write came.
//
// The evaluation already records a run's input tokens. A number for the whole run cannot say where they went: an agent
// can spend most of a task reading procedure (the guide, a recipe, a reference page) before its first edit, and read
// the same recipe again three turns later, and the total looks like any other run's. These measures say where.
//
// A transcript holds the calls in order and each assistant message's tokens, and no clock: so how far in the first
// write came is counted in calls and in input tokens, never in seconds. A run that writes nothing (an audit, a
// question) is measured to its end, and says it wrote nothing.
//
//   procedureCost(events)  → { startTokens, calls, firstWrite, beforeWrite: { calls, reads, guideReads, bytes, guideBytes, tokens }, readTwice }
//   procedureSummary(rows) → per model: { runs, startTokens, wrote, callsBefore, tokensBefore, guideBytesBefore, readTwiceRuns, readTwice }
//   procedureLines(summary)

// An edit the agent made itself. The engine's own writes are the engine's, and an edit is how an agent starts doing.
export const WRITE_TOOLS = new Set(['Write', 'Edit', 'MultiEdit', 'NotebookEdit']);
// The guide set the agent reads: the procedure it follows (the skill evaluation measures the same files).
export const GUIDE = /(^|\/)(rms-design-system-engine\.md|cookbook\/[^/]+\.md|reference\/[^/]+\.md)$/;
// A file read through the shell: cat, head, tail, less, more or sed -n, each naming the files it reads.
const SHELL_READ = /^\s*(cat|head|tail|less|more|sed\s+-n)\b/;
// A file written through the shell: a redirect into a file (not a stream, not /dev/null), or tee.
const SHELL_WRITE = /(^|[^0-9&>])>{1,2}\s*(?!&|\/dev\/null)["']?[^\s&|;>"']+|\btee\s+(-a\s+)?["']?[^\s&|;"']+/;

const inputOf = (u = {}) => (u.input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0);
const unquote = (s) => s.replace(/^["']|["']$/g, '');

// The files one shell command reads, as it names them (a path with a quote or a glob kept as written).
export function shellReads(command) {
  const out = [];
  for (const part of String(command).split(/\s*(?:&&|\|\||;|\|)\s*/)) {
    if (!SHELL_READ.test(part)) continue;
    const words = part.trim().match(/"[^"]*"|'[^']*'|\S+/g) ?? [];
    const sed = /^sed$/.test(words[0]);
    // sed -n's script is its first word after the flag; the files follow it.
    const args = words.slice(sed ? 3 : 1).filter((w) => !/^-/.test(w) && !/^\d+$/.test(w));
    out.push(...args.map(unquote).filter((w) => w && !/^[<>]/.test(w)));
  }
  return out;
}

// A path as the run's project or the engine has it: the throwaway folder each run is made in, and the engine's install,
// are the same on every run and say nothing.
export const shortPath = (p) => String(p).replace(/\\/g, '/').replace(/^.*\/skill-eval-[^/]+\//, '').replace(/^.*\/skills\/rms-design-system-engine\//, '<engine>/');

const writes = (c) => WRITE_TOOLS.has(c.name) || (c.name === 'Bash' && SHELL_WRITE.test(String(c.input?.command ?? '').replace(/\d?>&\d/g, '')));
// The skill's own guide arrives as the Skill tool's answer: read as the guide file it is.
const readsOf = (c) => (c.name === 'Read' ? [String(c.input?.file_path ?? c.input?.path ?? '')].filter(Boolean) : c.name === 'Bash' ? shellReads(c.input?.command) : c.name === 'Skill' ? ['<engine>/rms-design-system-engine.md'] : []).map(shortPath);

export function procedureCost(events = []) {
  const calls = [];
  const byId = new Map();
  const seenMessage = new Set();
  let tokens = 0, start = null;
  for (const e of events) {
    if (e?.type === 'assistant') {
      // A message streamed in parts carries its usage on each part: counted once.
      const id = e.message?.id;
      if (!id || !seenMessage.has(id)) { if (id) seenMessage.add(id); tokens += inputOf(e.message?.usage); start ??= inputOf(e.message?.usage); }
      for (const c of e.message?.content ?? []) if (c.type === 'tool_use') { const call = { id: c.id, name: c.name, input: c.input ?? {}, bytes: 0, tokens }; calls.push(call); byId.set(c.id, call); }
    }
    if (e?.type === 'user') for (const c of e.message?.content ?? []) {
      if (c.type !== 'tool_result') continue;
      const call = byId.get(c.tool_use_id);
      if (call) call.bytes = Buffer.byteLength(Array.isArray(c.content) ? c.content.map((x) => x.text ?? '').join('\n') : String(c.content ?? ''));
    }
  }
  const at = calls.findIndex(writes);
  const before = at < 0 ? calls : calls.slice(0, at);
  const read = before.map((c) => ({ c, paths: readsOf(c) })).filter((x) => x.paths.length);
  const guideReads = [...new Set(read.flatMap((x) => x.paths.filter((p) => GUIDE.test(p))))];
  const counts = new Map();
  for (const c of calls) for (const p of readsOf(c)) counts.set(p, (counts.get(p) ?? 0) + 1);
  return {
    // What the run was handed before it did anything: the system's prompt, the guide a skill loads with it, the task.
    startTokens: start ?? 0,
    calls: calls.length,
    // 1-based: the first write was the run's nth call. null: it wrote nothing.
    firstWrite: at < 0 ? null : at + 1,
    beforeWrite: {
      calls: before.length,
      reads: read.length,
      guideReads,
      bytes: read.reduce((k, x) => k + x.c.bytes, 0),
      guideBytes: read.filter((x) => x.paths.some((p) => GUIDE.test(p))).reduce((k, x) => k + x.c.bytes, 0),
      // What the run had been given by the message that made its first write: everything, when it wrote nothing.
      tokens: at < 0 ? tokens : calls[at].tokens,
    },
    readTwice: [...counts].filter(([, n]) => n > 1).map(([p]) => p),
  };
}

const median = (xs) => { const s = xs.filter((x) => typeof x === 'number').sort((a, b) => a - b); if (!s.length) return null; const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

// Per model, over the rows that carry the measure (an older row does not, and is left out rather than read as zero).
export function procedureSummary(rows = []) {
  const out = {};
  for (const r of rows) {
    if (!r?.procedure) continue;
    (out[r.model ?? 'model'] ??= []).push(r.procedure);
  }
  return Object.fromEntries(Object.entries(out).map(([model, ps]) => {
    const twice = new Map();
    for (const p of ps) for (const f of p.readTwice ?? []) twice.set(f, (twice.get(f) ?? 0) + 1);
    return [model, {
      runs: ps.length,
      startTokens: median(ps.map((p) => p.startTokens)),
      wrote: ps.filter((p) => p.firstWrite != null).length,
      callsBefore: median(ps.filter((p) => p.firstWrite != null).map((p) => p.beforeWrite.calls)),
      tokensBefore: median(ps.filter((p) => p.firstWrite != null).map((p) => p.beforeWrite.tokens)),
      guideBytesBefore: median(ps.map((p) => p.beforeWrite.guideBytes)),
      readTwiceRuns: ps.filter((p) => p.readTwice?.length).length,
      readTwice: [...twice].sort((a, b) => b[1] - a[1]).slice(0, 5),
    }];
  }));
}

const kb = (b) => `${(b / 1024).toFixed(1)} KB`;
export function procedureLines(summary) {
  const lines = [];
  for (const [model, s] of Object.entries(summary)) {
    const w = s.wrote ? `the first write came at call ${s.callsBefore} (median of the ${s.wrote} run${s.wrote === 1 ? '' : 's'} that wrote), ${Math.round(s.tokensBefore).toLocaleString('en')} input tokens in` : 'no run wrote anything';
    lines.push(`${model}: ${Math.round(s.startTokens ?? 0).toLocaleString('en')} input tokens handed over before the first call · ${w} · ${kb(s.guideBytesBefore ?? 0)} of the guide read before it · ${s.readTwiceRuns} of ${s.runs} runs read a file twice${s.readTwice.length ? ` (${s.readTwice.map(([f, n]) => `${f} ×${n}`).join(', ')})` : ''}`);
  }
  return lines;
}
