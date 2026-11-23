import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startRequest, noteRound, endRequest, readGenerations, weekly, generationLines, tokensSince, GENERATIONS, LONG } from '../lib/generation-cost.mjs';
import { OUT_DIR } from '../lib/names.mjs';
import { tempDir, makeFixture } from './helpers.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));

test('a request that made UI edits is kept with its rounds, time and first and last checks; a question is not', () => {
  const root = tempDir('gen-');
  startRequest(root, { session: 's1', prompt: 'a settings page   with a save button', at: '2026-11-23T10:00:00.000Z' });
  noteRound(root, { session: 's1', found: [{ m: 'a colour typed by hand' }], file: 'src/Settings.vue' });
  noteRound(root, { session: 's1', found: [], file: 'src/Settings.vue' });
  const row = endRequest(root, { session: 's1', at: '2026-11-23T10:03:00.000Z' });
  assert.deepEqual({ ...row, tokens: undefined }, { at: '2026-11-23T10:00:00.000Z', ms: 180000, prompt: 'a settings page with a save button', rounds: 2, files: ['src/Settings.vue'], passedFirst: false, passed: true, tokens: undefined });
  // A question or an audit makes no UI edit, and is no generation.
  startRequest(root, { session: 's1', prompt: 'what does the chip take?' });
  assert.equal(endRequest(root, { session: 's1' }), null);
  // A round with no request open (a hook installed mid-turn) is not counted against anything.
  noteRound(root, { session: 'other', found: [] });
  assert.equal(readGenerations(root).length, 1);
  assert.ok(!existsSync(join(root, OUT_DIR, 'generation-open.json')), 'nothing left open');
});

test('the tokens are the assistant\'s since the person last wrote, each message once', () => {
  const root = tempDir('gen-tok-');
  const t = join(root, 't.jsonl');
  const msg = (id, inp, out) => ({ type: 'assistant', message: { id, usage: { input_tokens: inp, cache_read_input_tokens: 0, output_tokens: out } } });
  writeFileSync(t, [
    { type: 'user', message: { role: 'user', content: 'first request' } }, msg('a', 9000, 900),
    { type: 'user', message: { role: 'user', content: 'make the settings page' } }, msg('b', 1000, 100), msg('b', 1000, 100), msg('c', 2000, 50),
    { type: 'user', message: { role: 'user', content: [{ type: 'tool_result', content: 'ok' }] } },
  ].map((e) => JSON.stringify(e)).join('\n'));
  assert.deepEqual(tokensSince(t), { input: 3000, output: 150 });
  assert.equal(tokensSince(join(root, 'none.jsonl')), null);
});

test('each week says how many passed on the first try and by the end, and the long ones are listed as gaps', () => {
  const r = (at, rounds, passedFirst, passed, prompt = 'x') => ({ at, ms: 120000, prompt, rounds, files: [], passedFirst, passed, tokens: { input: 50000, output: 2000 } });
  const rows = [r('2026-11-17T09:00:00Z', 1, true, true), r('2026-11-18T09:00:00Z', 3, false, true), r('2026-11-24T09:00:00Z', LONG + 5, false, true, 'a data table with filters'), r('2026-11-25T09:00:00Z', 2, false, false, 'a date range picker')];
  const w = weekly(rows);
  assert.deepEqual(w.map((x) => [x.week, x.requests, x.passedFirst, x.passed, x.long]), [['2026-11-23', 2, 0, 1, 2], ['2026-11-16', 2, 1, 2, 0]]);
  const lines = generationLines(w, rows).join('\n');
  assert.match(lines, /week of 2026-11-23: 2 requests · 0% passed on the first try, 50% by the end · 6 rounds and 2 min each \(median\) · 104k tokens/);
  assert.match(lines, /"a date range picker": 2 rounds, still failing at the end/);
  assert.match(lines, /"a data table with filters": 10 rounds/);
  assert.match(generationLines([], [])[0], /No generated change recorded yet/);
});

test('the hooks keep it: a prompt, a UI edit checked, the end of the turn', () => {
  const root = makeFixture({ 'ds-config.json': {}, 'src/theme.css': ':root{--x:1px}' });
  const guard = (event) => spawnSync(process.execPath, [join(HERE, '..', 'lib', 'guard.mjs')], { input: JSON.stringify({ cwd: root, session_id: 'sx', ...event }), encoding: 'utf8' });
  guard({ hook_event_name: 'UserPromptSubmit', prompt: 'a card for the dashboard' });
  writeFileSync(join(root, 'src', 'Card.vue'), '<template><div class="c">Hi</div></template>');
  guard({ hook_event_name: 'PostToolUse', tool_name: 'Write', tool_input: { file_path: join(root, 'src', 'Card.vue'), content: '<template><div class="c">Hi</div></template>' } });
  guard({ hook_event_name: 'Stop' });
  const rows = readGenerations(root);
  assert.equal(rows.length, 1, `kept in ${join(OUT_DIR, GENERATIONS)}`);
  assert.equal(rows[0].prompt, 'a card for the dashboard');
  assert.equal(rows[0].rounds, 1);
  const r = spawnSync(process.execPath, [join(HERE, '..', 'audit.mjs'), '--generations'], { cwd: root, encoding: 'utf8', env: { ...process.env, DESIGN_SYSTEM_ENGINE_NO_AUTO_UPDATE: '1' } });
  assert.match(r.stdout, /1 request · /);
});
