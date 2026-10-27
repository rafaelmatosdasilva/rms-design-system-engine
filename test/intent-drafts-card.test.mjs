// The drafts of an intent layer page, in the Documentation panel: under the task that asks for them, each with the
// command for each decision (templates/styleguide.template.html), and that one decision on the command line.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const tpl = readFileSync(fileURLToPath(new URL('../templates/styleguide.template.html', import.meta.url)), 'utf8');

test('the drafts are in the What to do card, grouped by section, each once, then one decision for them all', () => {
  assert.match(tpl, /card\('What to do', c\.todo \+ \(p\.missingFor \? '' : ilDrafts\(p\)\)\)/);
  assert.doesNotMatch(tpl, /card\('Drafts to review'/, 'no second card for them');
  const src = /var ilDrafts = (function \(p\) \{[\s\S]*?\n    \});/.exec(tpl)[1];
  const answers = [];
  const esc = (s) => String(s), shq = (s) => `'${s}'`, ilAnswer = (head, does, cmd, mark) => { answers.push({ head, does, cmd, mark }); return `[${head}]`; };
  const ilDrafts = new Function('esc', 'shq', 'ilAnswer', `return (${src})`)(esc, shq, ilAnswer);
  const html = ilDrafts({ name: 'actionBar', file: 'specs/action-bar.dsds.json', drafts: [
    { where: 'Limitations', text: 'Does not show loading by itself.' },
    { where: 'Limitations', text: 'Takes at most two buttons.' },
    { where: 'Do and don\'t', text: 'Do: dock it to the bottom.' },
    { where: 'Limitations', text: 'Does not show loading  by itself.' },   // the same draft again
  ] });
  assert.equal((html.match(/Proposed drafts · Limitations/g) ?? []).length, 1, 'a section\'s drafts together');
  assert.match(html, /Proposed draft · Do and don't/);
  assert.equal((html.match(/Does not show loading/g) ?? []).length, 1, 'the same draft once');
  assert.deepEqual(answers.map((a) => a.head), ['Approve all', 'Change', 'Drop all']);
  assert.deepEqual(answers.map((a) => a.mark), ['approve', 'change', 'drop'], 'each with its own mark');
  assert.equal(answers[0].cmd, "rms-design-system-engine --review-drafts --approve 'specs/action-bar.dsds.json'", 'every draft on the page at once');
  assert.match(answers[0].does, /The 3 drafts become part of actionBar's page, as written: agents use them from the next run/);
  assert.equal(answers[1].cmd, "rms-design-system-engine --review-drafts --change 'specs/action-bar.dsds.json' 'the draft to change' 'your words'");
  assert.match(answers[2].does, /The 3 drafts are deleted from actionBar's page: agents never get them/);
  // One draft: its own words in the change, and the decisions said for one.
  answers.length = 0;
  ilDrafts({ name: 'error', file: 'e.json', drafts: [{ where: 'Limitations', text: 'Use an inline error.' }] });
  assert.deepEqual(answers.map((a) => a.head), ['Approve', 'Change', 'Drop']);
  assert.match(answers[1].cmd, /--change 'e\.json' 'Use an inline error\.' 'your words'$/);
});

test('a draft\'s words are quoted so a shell runs the command as written, backticks and quotes included', () => {
  const src = /var shq = (function \(s\) \{[^\n]*\});/.exec(tpl)[1];
  const shq = new Function(`return (${src})`)();
  const line = "Takes at most two buttons in `buttons`; it's the footer";
  const out = execFileSync('/bin/sh', ['-c', `printf %s ${shq(line)}`], { encoding: 'utf8' });
  assert.equal(out, line, 'nothing in it is run or lost');
});

test('a "when to use" draft also answers the "which component?" test, so it is not also still to write', () => {
  assert.match(tpl, /if \(drafted\['When to use'\]\) drafted\['When to use it, not a sibling'\] = 1;/);
});
