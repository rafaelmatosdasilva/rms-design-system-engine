#!/usr/bin/env node
// test/skill-evals/gallery.mjs - the build evaluation as pictures: for each task, what Figma shows, what Claude built
// with the Figma MCP alone and what it built with the skill, each case rendered (light, dark, hover…) with the checks it
// failed written under it. Built from the recorded runs, without running a model: each run's project is rebuilt from
// the fixture, the task's setup and the files the run wrote, then scored again with pictures taken.
//
//   node test/skill-evals/gallery.mjs --model claude-opus-5-5 [--from <results/build dir>] [--run 0] [--out gallery.html]
//
// The same run number is shown on both sides (the first by default), never the best one; the pass counts of every run
// are written beside it.
import { readFileSync, writeFileSync, existsSync, mkdtempSync, cpSync, mkdirSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { BUILD, TIDEPOOL } from './build-tasks.mjs';
import { capturePictures } from './build-score.mjs';
import { globalChecks } from './rules.mjs';
import { context } from './lib.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const arg = (k, d) => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : d; };
const MODEL = arg('--model', 'claude-opus-5-5');
const FROM = arg('--from', join(HERE, 'results', 'build'));
const RUN = Number(arg('--run', '0'));
const OUT = arg('--out', join(HERE, 'results', `gallery.${MODEL}.html`));
const SIDES = [['mcp', 'Claude with the Figma MCP alone'], ['cookbook', 'Claude with the Figma MCP and the skill']];

const rowsOf = (variant) => { const f = join(FROM, `${variant}.${MODEL}.jsonl`); return existsSync(f) ? readFileSync(f, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : []; };
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

async function picture(t, row, variant) {
  const dir = mkdtempSync(join(tmpdir(), 'gallery-'));
  try {
    cpSync(TIDEPOOL, dir, { recursive: true });
    t.setup?.(dir);
    for (const [p, text] of Object.entries(row.files ?? {})) { mkdirSync(dirname(join(dir, p)), { recursive: true }); writeFileSync(join(dir, p), text); }
    const tr = join(FROM, 'transcripts', `${variant}.${MODEL}.${row.task}.${row.run}.jsonl`);
    const events = existsSync(tr) ? readFileSync(tr, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : [];
    const ctx = { ...context(events, dir, row), dir };
    const shots = {};
    capturePictures(shots);
    const checks = row.error ? row.checks : await t.score(ctx);
    capturePictures(null);
    const all = [...checks, ...globalChecks(ctx, t)];
    return { shots, checks: all, pass: all.every((c) => c.ok) };
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

const sections = [];
let totals = { mcp: [0, 0], cookbook: [0, 0] };
for (const t of BUILD) {
  const per = Object.fromEntries(SIDES.map(([v]) => [v, rowsOf(v).filter((r) => r.task === t.id)]));
  if (!SIDES.every(([v]) => per[v].length)) continue;
  const tally = Object.fromEntries(SIDES.map(([v]) => [v, `${per[v].filter((r) => r.pass).length}/${per[v].length}`]));
  for (const [v] of SIDES) { totals[v][0] += per[v].filter((r) => r.pass).length; totals[v][1] += per[v].length; }
  const shown = {};
  for (const [v] of SIDES) {
    const row = per[v].find((r) => r.run === RUN) ?? per[v][0];
    shown[v] = { run: row.run, ...(await picture(t, row, v)) };
    process.stdout.write(`  ${shown[v].pass ? '✓' : '✗'} ${v} ${t.id} #${row.run}\n`);
  }
  const name = t.id.replace(/^build-/, '');
  const figmaPng = join(TIDEPOOL, 'figma-mcp', `${name === 'tokens' ? 'settings' : name}.png`);
  const figma = existsSync(figmaPng) ? `data:image/png;base64,${readFileSync(figmaPng).toString('base64')}` : null;
  const cases = [...new Set(SIDES.flatMap(([v]) => Object.keys(shown[v].shots)))];
  const caseCheck = (v, id) => shown[v].checks.find((c) => c.name === `${id} matches Figma`);
  const cell = (v, id) => {
    const img = shown[v].shots[id];
    const c = caseCheck(v, id);
    return `<td>${img ? `<img src="${img}" alt="${esc(`${id}, ${SIDES.find((s) => s[0] === v)[1]}`)}">` : '<div class="none">not rendered</div>'}${c ? `<div class="${c.ok ? 'ok' : 'bad'}">${c.ok ? '✓ matches Figma' : `✗ ${esc(c.detail)}`}</div>` : ''}</td>`;
  };
  const misses = (v) => shown[v].checks.filter((c) => !c.ok && !/ matches Figma$/.test(c.name));
  sections.push(`<section>
  <h2>${esc(name)}</h2>
  <p class="tally">All runs: alone <b>${tally.mcp}</b> · with the skill <b>${tally.cookbook}</b> · shown: run ${shown.mcp.run} on both sides</p>
  ${figma ? `<figure class="figma"><img src="${figma}" alt="${esc(name)} in Figma"><figcaption>Figma</figcaption></figure>` : ''}
  ${cases.length ? `<table><thead><tr><th></th>${SIDES.map(([v, label]) => `<th>${esc(label)} ${shown[v].pass ? '<span class="ok">passes</span>' : '<span class="bad">fails</span>'}</th>`).join('')}</tr></thead><tbody>
  ${cases.map((id) => `<tr><th>${esc(id)}</th>${SIDES.map(([v]) => cell(v, id)).join('')}</tr>`).join('\n  ')}
  </tbody></table>` : ''}
  <div class="misses">${SIDES.map(([v, label]) => `<div><h3>${esc(label)}</h3>${misses(v).length ? `<ul>${misses(v).map((c) => `<li>✗ ${esc(c.name)}${c.detail ? `: <span>${esc(c.detail)}</span>` : ''}</li>`).join('')}</ul>` : '<p class="ok">nothing else missed</p>'}</div>`).join('')}</div>
</section>`);
}

const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Build gallery</title>
<style>
:root { --bg: #f6f7f9; --card: #fff; --ink: #1b2433; --muted: #5b6577; --ok: #136c3a; --bad: #b3261e; --line: #dde1e8; }
@media (prefers-color-scheme: dark) { :root { --bg: #10151f; --card: #182030; --ink: #e8ecf3; --muted: #9aa4b5; --ok: #6fd69a; --bad: #ff8a80; --line: #2a3547; } }
body { margin: 0; padding: 24px 16px; background: var(--bg); color: var(--ink); font: 15px/1.5 system-ui, sans-serif; }
main { max-width: 1100px; margin: 0 auto; }
section { background: var(--card); border: 1px solid var(--line); border-radius: 12px; padding: 16px; margin: 0 0 20px; overflow-x: auto; }
h1 { font-size: 24px; margin: 0 0 4px; } h2 { margin: 0 0 4px; text-transform: capitalize; } h3 { font-size: 14px; margin: 0 0 4px; }
.tally, .lead { color: var(--muted); margin: 0 0 12px; }
table { border-collapse: collapse; width: 100%; } th, td { border-top: 1px solid var(--line); padding: 8px; text-align: left; vertical-align: top; font-size: 13px; }
td img, .figma img { max-width: 100%; height: auto; display: block; border: 1px dashed var(--line); }
.figma { margin: 0 0 12px; } .figma figcaption { color: var(--muted); font-size: 13px; }
.ok { color: var(--ok); } .bad { color: var(--bad); } .none { color: var(--muted); font-style: italic; }
.misses { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-top: 12px; } .misses ul { margin: 0; padding-left: 18px; } .misses span { color: var(--muted); }
@media (max-width: 640px) { .misses { grid-template-columns: 1fr; } }
</style></head><body><main>
<h1>Building from Figma, ${esc(MODEL)}</h1>
<p class="lead">Each component as Claude built it from the same Figma MCP output, alone and with the skill, rendered in Chrome and measured against Figma. Builds that pass: alone <b>${totals.mcp[0]}/${totals.mcp[1]}</b>, with the skill <b>${totals.cookbook[0]}/${totals.cookbook[1]}</b>.</p>
${sections.join('\n')}
</main></body></html>`;
writeFileSync(OUT, html);
console.log(`gallery → ${OUT} (${sections.length} tasks)`);
