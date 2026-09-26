#!/usr/bin/env node
// test/skill-evals/check-split.mjs - proves the guide's split lost and duplicated nothing (idea I55).
//
//   node test/skill-evals/check-split.mjs [ref]     (default ref: guide-monolith)
//
// Every paragraph, code block and table row of the one-file guide at <ref> must appear exactly once across
// the main file, reference/ and cookbook/, after taking out the only new text: the recipe headers, the
// main file's index, the reference titles, the declared edits and the "in <where>" pointers added to
// cross-file "see *X*" references. A one-time check of the split itself: after it, the files change on
// their own and this check is not expected to hold.
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// The declared edits to moved text, [before, after]: a positional pointer ("below", "above") that now crosses
// files names the file, and one wrong gate number. Undone before comparing.
export const EDITS = [
  ["  then follow the phases below.", "  then follow the `full-audit` recipe (`rms-figma-code-parity --recipe full-audit`)."],
  ["is listed by Gate [25] as `IN PROGRESS`", "is listed by Gate [17] as `IN PROGRESS`"],
  ["(the Plugin API snippet below works on any plan, no token)", "(the Plugin API snippet in `rms-figma-code-parity --reference gates` works on any plan, no token)"],
  ["Already covered by the Audit Rules above.", "Already covered by the Audit Rules in the main guide."],
  ["with no token, run the plugin capture below in the library file.", "with no token, run the plugin capture in `rms-figma-code-parity --reference gates` in the library file."],
];

// Units: fenced code blocks whole; outside them, paragraphs split on blank lines; table rows one by one.
export function units(text) {
  const out = [];
  let buf = [], fence = false;
  const flush = () => { const t = buf.join('\n').trim(); if (t) out.push(t); buf = []; };
  for (const line of text.split('\n')) {
    if (line.trimStart().startsWith('```')) {
      if (!fence) { flush(); fence = true; buf.push(line); continue; }
      buf.push(line); fence = false; flush(); continue;
    }
    if (fence) { buf.push(line); continue; }
    if (!line.trim()) { flush(); continue; }
    if (/^\s*\|/.test(line)) { flush(); out.push(line.trim()); continue; }
    buf.push(line);
  }
  flush();
  return out;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const ROOT = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
  const ref = process.argv[2] ?? 'guide-monolith';
  const old = execFileSync('git', ['show', `${ref}:rms-figma-code-parity.md`], { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  
  const files = ['rms-figma-code-parity.md', ...['reference', 'cookbook'].flatMap((d) => (existsSync(join(ROOT, d)) ? readdirSync(join(ROOT, d)).filter((f) => f.endsWith('.md')).map((f) => `${d}/${f}`) : []))];

  // The new text, recognised by shape: recipe files' own header (up to their first moved section), the index,
  // reference titles, and the pointers added to cross-file references.
  function strip(file, text) {
    let t = text;
    for (const [before, after] of EDITS) t = t.replace(after, before);
    t = t.replace(/ in (the main guide|`rms-figma-code-parity --(recipe|reference) [\w-]+`)/g, '');
    if (file === 'rms-figma-code-parity.md') t = t.replace(/\n## Recipes and reference \(read the one that fits before acting\)[\s\S]*?(?=\n## How to run this skill)/, '\n');
    if (file.startsWith('reference/')) t = t.replace(/^# [^\n]*\n\nPart of the rms-figma-code-parity reference[^\n]*\n/, '');
    if (file.startsWith('cookbook/')) {
      const m = t.match(/\n```recipe-check\n[\s\S]*?\n```\n/);
      t = m ? t.slice(m.index + m[0].length) : '';
    }
    return t;
  }
  
  const count = new Map();
  for (const f of files) for (const u of units(strip(f, readFileSync(join(ROOT, f), 'utf8')))) count.set(u, (count.get(u) ?? 0) + 1);
  const oldUnits = units(old);
  const oldCount = new Map();
  for (const u of oldUnits) oldCount.set(u, (oldCount.get(u) ?? 0) + 1);
  const missing = [...oldCount].filter(([u, n]) => (count.get(u) ?? 0) < n);
  const extra = [...count].filter(([u, n]) => (oldCount.get(u) ?? 0) < n);
  console.log(`${oldUnits.length} units in ${ref}; ${files.length} files after the split`);
  for (const [u] of missing.slice(0, 20)) console.log(`  missing: ${u.slice(0, 140).replace(/\n/g, ' ⏎ ')}`);
  for (const [u] of extra.slice(0, 20)) console.log(`  new or duplicated: ${u.slice(0, 140).replace(/\n/g, ' ⏎ ')}`);
  console.log(missing.length || extra.length ? `❌ ${missing.length} missing, ${extra.length} new or duplicated` : '✅ nothing lost, nothing duplicated, nothing added beyond the declared new text');
  process.exit(missing.length || extra.length ? 1 : 0);
}
