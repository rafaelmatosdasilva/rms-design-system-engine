// The judgement criteria pre-sorted for a person (WCAG 2.4.6, 3.3.3, 2.4.4): a model reads the words a component's
// own code shows and marks the ones to look at first. It never passes a criterion and never fails one, it runs only
// when asked, and the same wording is never paid for twice. No model tokens are spent here: the asking is a fake.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tempDir } from './helpers.mjs';
import { wordsOf, judgePrompt, parseJudged, judgementOf, judgeA11y, judgementLine, judgementKey, JUDGED, RESULT_FILE } from '../lib/a11y-judgement.mjs';
import { templateText } from '../lib/styleguide-template.mjs';
import { WCAG22 } from '../lib/wcag21.mjs';

const CARD = `<template>
  <section class="card">
    <h2>Details</h2>
    <label for="email">Email</label>
    <input id="email" aria-label="Email address">
    <p class="error" role="alert">Invalid.</p>
    <a href="/guide">click here</a>
    <a href="/export">Read the export guide</a>
    <button aria-label="">Go</button>
  </section>
</template>`;

test('the words read are the ones the three criteria are about, each with where it is written', () => {
  const w = wordsOf(CARD);
  assert.deepEqual(w.map((x) => [x.sc, x.kind, x.text]), [
    ['2.4.6', 'heading', 'Details'],
    ['2.4.6', 'label', 'Email'],
    ['2.4.6', 'label', 'Email address'],
    ['3.3.3', 'error', 'Invalid.'],
    ['2.4.4', 'link', 'click here'],
    ['2.4.4', 'link', 'Read the export guide'],
  ]);
  // Where each is written, so a person finds it.
  assert.deepEqual(w.map((x) => x.where), ['<h2>', '<label>', 'aria-label on <input>', 'shown as an error', '<a>', '<a>']);
  // Empty words are left out: the checks already report an empty name, and a model reading nothing says nothing.
  assert.ok(!w.some((x) => !x.text));
  // Only these three criteria, and each one the engine cannot settle by itself.
  assert.deepEqual([...new Set(w.map((x) => x.sc))].sort(), ['2.4.4', '2.4.6', '3.3.3']);
  for (const sc of Object.keys(JUDGED)) assert.ok(WCAG22.some((c) => c.sc === sc), sc);
  // A component with nothing to read asks nothing.
  assert.deepEqual(wordsOf('<div class="spacer"></div>'), []);
});

test('the prompt asks about the words and nothing else, and the answer is held to what was asked', () => {
  const w = wordsOf(CARD);
  const p = judgePrompt('card', w);
  assert.match(p, /called card/);
  for (const [sc, j] of Object.entries(JUDGED)) { assert.ok(p.includes(`WCAG ${sc}`), sc); assert.ok(p.includes(j.asks), sc); }
  assert.match(p, /1\. \[heading\] "Details" \(<h2>\)/);
  assert.match(p, /never suggest a replacement: the person writes the words/);
  // Held to the rubric: a line that does not exist, a word that was not offered and a second verdict for one line are
  // all dropped; nothing readable at all is null, never an empty pass.
  const judged = parseJudged('```json\n{"words":[{"n":1,"verdict":"likely","why":"Says nothing about what follows"},{"n":1,"verdict":"fine"},{"n":99,"verdict":"fine"},{"n":5,"verdict":"terrible"},{"n":6,"verdict":"fine"}]}\n```', w);
  assert.deepEqual(judged, [{ i: 0, verdict: 'likely', why: 'Says nothing about what follows' }, { i: 5, verdict: 'fine', why: '' }]);
  assert.equal(parseJudged('I had a look and it seems fine to me.', w), null);
  assert.equal(parseJudged('', w), null);
});

test('what the style guide shows: only what is to look at, under its own criterion', () => {
  const result = { components: { card: { words: [
    { sc: '2.4.6', kind: 'heading', text: 'Details', where: '<h2>', verdict: 'likely', why: 'Says nothing about what follows' },
    { sc: '2.4.4', kind: 'link', text: 'click here', where: '<a>', verdict: 'likely', why: 'Does not say where it goes' },
    { sc: '2.4.4', kind: 'link', text: 'Read the export guide', where: '<a>', verdict: 'fine', why: 'Says where it goes' },
    { sc: '3.3.3', kind: 'error', text: 'Invalid.', where: 'shown as an error', verdict: 'unclear', why: 'Cannot tell which field it belongs to' },
  ] } } };
  const by = judgementOf(result, 'card');
  assert.deepEqual(Object.keys(by).sort(), ['2.4.4', '2.4.6', '3.3.3']);
  assert.equal(by['2.4.4'].length, 1, 'a wording judged fine was never a finding, so it is not shown');
  assert.equal(by['2.4.6'][0].text, 'Details');
  assert.equal(by['3.3.3'][0].verdict, 'unclear');
  assert.deepEqual(judgementOf(result, 'nothing-judged'), {});
  // The page lists them under the criterion and says what they are, without touching the row's status.
  const page = templateText();
  assert.match(page, /WCAG\.judged\[c\.name\]/);
  assert.match(page, /wordings to look at first, from a model\\?'s reading of the words \(it decides nothing\)/);
  assert.match(page, /pg-a11y-listed/);
});

test('it is asked once per wording: an answer is kept, and only a change asks again', async () => {
  const dir = tempDir('judge-');
  const asked = [];
  const ask = async (prompt) => { asked.push(prompt); return JSON.stringify({ result: '{"words":[{"n":1,"verdict":"likely","why":"Says nothing about what follows"}]}', total_cost_usd: 0.01 }); };
  const one = [{ name: 'card', code: '<h2>Details</h2>' }];
  let run = await judgeA11y(dir, {}, one, { ask });
  assert.equal(run.asked, 1);
  assert.equal(run.cached, 0);
  assert.equal(run.cost, 0.01);
  assert.deepEqual(run.components.card.words.map((w) => [w.text, w.verdict]), [['Details', 'likely']]);
  // The same words again: kept, nothing asked, nothing spent.
  run = await judgeA11y(dir, {}, one, { ask });
  assert.equal(run.asked, 0);
  assert.equal(run.cached, 1);
  assert.equal(run.cost, 0);
  assert.equal(asked.length, 1);
  // Other words: asked again.
  run = await judgeA11y(dir, {}, [{ name: 'card', code: '<h2>Your details</h2>' }], { ask });
  assert.equal(run.asked, 1);
  assert.notEqual(judgementKey(wordsOf('<h2>Details</h2>')), judgementKey(wordsOf('<h2>Your details</h2>')));
  // What it found is written where the style guide reads it.
  const written = JSON.parse(readFileSync(join(dir, RESULT_FILE), 'utf8'));
  assert.ok(written.at && written.components.card);
  // A component with nothing to read is never asked about.
  const quiet = await judgeA11y(dir, {}, [{ name: 'spacer', code: '<div></div>' }], { ask });
  assert.deepEqual(quiet.components, {});
  assert.equal(asked.length, 2);
});

test('an answer that cannot be read is said so, and nothing is recorded for it', async () => {
  const dir = tempDir('judge-bad-');
  const run = await judgeA11y(dir, {}, [{ name: 'card', code: '<h2>Details</h2>' }], { ask: async () => 'nothing like JSON' });
  assert.deepEqual(run.components, {});
  assert.equal(run.asked, 0);
  assert.deepEqual(run.failed, ['card: the answer did not read as the JSON asked for']);
  assert.equal(judgementLine(run), "No words judged: one component's answer could not be read.");
});
