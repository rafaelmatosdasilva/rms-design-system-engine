// The drafts of an intent layer page, in the Documentation panel: under the task that asks for them, each with the
// command for each decision (templates/styleguide.template.html), and that one decision on the command line.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const tpl = readFileSync(fileURLToPath(new URL('../templates/styleguide.template.html', import.meta.url)), 'utf8');

test('the drafts are in the What to do card, each with an Approve, a Change and a Drop command', () => {
  assert.match(tpl, /card\('What to do', c\.todo \+ \(p\.missingFor \? '' : ilDrafts\(p\)\)\)/);
  assert.doesNotMatch(tpl, /card\('Drafts to review'/, 'no second card for them');
  assert.match(tpl, /ilAnswer\('Approve', [^\n]*?cmd\('approve'\)\) \+ ilAnswer\('Change', [^\n]*?cmd\('change', 'your words'\)\) \+ ilAnswer\('Drop', [^\n]*?cmd\('drop'\)\)/);
  assert.match(tpl, /'rms-design-system-engine --review-drafts --' \+ a \+ ' ' \+ shq\(page\) \+ ' ' \+ shq\(d\.text\)/);
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
