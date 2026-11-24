// text-diff.mjs - a whole file, before and after, as a unified diff a person applies with `git apply` (or `patch -p1`).
//
// The other hand-back patches change single lines the engine located (handback.mjs codePatch, rename-sweep.mjs
// linesDiff). A file the engine rewrites as a whole, keeping what it does not own (a WordPress theme.json), has no line
// to locate: the change is found by comparing the two texts, the lines both share kept as context.
//
//   unifiedDiff(file, before, after) → '' when they are the same; a new file's patch when there was none before
import { newFilePatch } from './spec-to-code.mjs';

const linesOf = (text) => { const l = String(text).split('\n'); const eol = l.at(-1) === ''; if (eol) l.pop(); return { lines: l, eol }; };

// The longest run of lines both share, in order (the middle only: the lines both start and end with are trimmed first,
// which is where a change to a settings file leaves almost all of it). → ops: [' ', i, j] kept, ['-', i] gone, ['+', j] new
function lineOps(a, b) {
  let start = 0; while (start < a.length && start < b.length && a[start] === b[start]) start++;
  let endA = a.length, endB = b.length; while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) { endA--; endB--; }
  const n = endA - start, m = endB - start, w = m + 1;
  const len = new Uint32Array((n + 1) * w);
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) {
    len[i * w + j] = a[start + i] === b[start + j] ? len[(i + 1) * w + j + 1] + 1 : Math.max(len[(i + 1) * w + j], len[i * w + j + 1]);
  }
  const ops = [];
  for (let k = 0; k < start; k++) ops.push([' ', k, k]);
  let i = 0, j = 0;
  while (i < n || j < m) {
    if (i < n && j < m && a[start + i] === b[start + j]) { ops.push([' ', start + i, start + j]); i++; j++; }
    // What goes comes before what replaces it, as a reader expects.
    else if (i < n && (j === m || len[(i + 1) * w + j] >= len[i * w + j + 1])) { ops.push(['-', start + i, null]); i++; }
    else { ops.push(['+', null, start + j]); j++; }
  }
  for (let k = 0; k < a.length - endA; k++) ops.push([' ', endA + k, endB + k]);
  return ops;
}

export function unifiedDiff(file, before, after, { context = 3 } = {}) {
  if (before === after) return '';
  if (before == null) return newFilePatch(file, after);
  const A = linesOf(before), B = linesOf(after), ops = lineOps(A.lines, B.lines);
  const changes = ops.map((o, k) => (o[0] === ' ' ? -1 : k)).filter((k) => k >= 0);
  if (!changes.length && A.eol === B.eol) return '';
  if (!changes.length) changes.push(ops.length - 1);   // only the last line's newline moved
  // Changes closer than twice the context share a hunk, so hunks never overlap.
  const groups = [];
  for (const k of changes) { const g = groups.at(-1); if (g && k - g[1] <= context * 2) g[1] = k; else groups.push([k, k]); }
  const noEol = '\\ No newline at end of file';
  let out = `diff --git a/${file} b/${file}\n--- a/${file}\n+++ b/${file}\n`;
  for (const [first, last] of groups) {
    const from = Math.max(0, first - context), to = Math.min(ops.length - 1, last + context), body = [];
    let aStart = null, bStart = null, aLen = 0, bLen = 0;
    for (let k = from; k <= to; k++) {
      const [t, i, j] = ops[k];
      if (t !== '+') { aStart ??= i; aLen++; }
      if (t !== '-') { bStart ??= j; bLen++; }
      const lastA = t !== '+' && i === A.lines.length - 1 && !A.eol, lastB = t !== '-' && j === B.lines.length - 1 && !B.eol;
      // A kept last line whose newline moved is one line gone and one new.
      if (t === ' ' && lastA !== lastB) { body.push(`-${A.lines[i]}`, ...(lastA ? [noEol] : []), `+${B.lines[j]}`, ...(lastB ? [noEol] : [])); continue; }
      body.push(`${t}${t === '+' ? B.lines[j] : A.lines[i]}`);
      if (lastA || lastB) body.push(noEol);
    }
    // An empty side starts at the line before it, as diff writes it.
    const aFirst = aLen ? aStart + 1 : (ops.slice(0, from).filter((o) => o[0] !== '+').length);
    const bFirst = bLen ? bStart + 1 : (ops.slice(0, from).filter((o) => o[0] !== '-').length);
    out += `@@ -${aFirst},${aLen} +${bFirst},${bLen} @@\n${body.join('\n')}\n`;
  }
  return out;
}
