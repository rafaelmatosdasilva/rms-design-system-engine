// The drafts of an intent layer page, in the Documentation panel: under the task that asks for them, each with the
// command for each decision (templates/styleguide.template.html), and that one decision on the command line.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const tpl = readFileSync(fileURLToPath(new URL('../templates/styleguide.template.html', import.meta.url)), 'utf8');

test('the drafts are in the What to do card, grouped by section, each once, then three decisions side by side', () => {
  assert.match(tpl, /card\('What to do', c\.todo \+ \(p\.missingFor \? '' : ilDrafts\(p\)\)\)/);
  assert.doesNotMatch(tpl, /card\('Drafts to review'/, 'no second card for them');
  const src = /var ilDrafts = (function \(p\) \{[\s\S]*?\n    \});/.exec(tpl)[1];
  const esc = (x) => String(x).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;'), shq = (x) => `'${x}'`, decideMark = (k) => `<mark-${k}>`;
  const sysButton = (tag, label, attrs) => `<button${attrs}>${label}</button>`;
  const ilDrafts = new Function('esc', 'shq', 'decideMark', 'sysButton', `return (${src})`)(esc, shq, decideMark, sysButton);
  const cards = (html) => [...html.matchAll(/<div class="sg-decide sg-decide--(\w+)"><strong class="sg-decide-head"><mark-\w+>([^<]+)<\/strong><p class="sg-decide-says">([^<]+)<\/p><div class="sg-decide-do"><button data-il-copy="([^"]*)" data-il-said="([^"]+)">([^<]+)<\/button>/g)].map((m) => ({ k: m[1], head: m[2], says: m[3], copy: m[4], said: m[5], label: m[6] }));
  const html = ilDrafts({ name: 'actionBar', file: 'specs/action-bar.dsds.json', drafts: [
    { where: 'Limitations', text: 'Does not show loading by itself.' },
    { where: 'Limitations', text: 'Takes at most two buttons.' },
    { where: 'Do and don\'t', text: 'Do: dock it to the bottom.' },
    { where: 'Limitations', text: 'Does not show loading  by itself.' },   // the same draft again
  ] });
  assert.equal((html.match(/Proposed drafts · Limitations/g) ?? []).length, 1, 'a section\'s drafts together');
  assert.match(html, /Proposed draft · Do and don't/);
  assert.equal((html.match(/Does not show loading/g) ?? []).length, 1, 'the same draft once');
  const c = cards(html);
  assert.deepEqual(c.map((x) => [x.k, x.head]), [['approve', 'Approve all'], ['change', 'Change one'], ['drop', 'Drop all']], 'three cards side by side, each with its own mark');
  assert.ok(c.every((x) => x.label === 'Copy decision' && x.said === 'Paste it in Claude Code'), 'one button each, and where to paste it');
  assert.equal(c[0].copy, "rms-design-system-engine --review-drafts --approve 'specs/action-bar.dsds.json'", 'every draft on the page at once');
  assert.equal(c[2].copy, "rms-design-system-engine --review-drafts --drop 'specs/action-bar.dsds.json'");
  assert.match(c[1].copy, /^Change one of the 3 drafts on actionBar's intent layer page \(specs\/action-bar\.dsds\.json\): ask me which one and my words, then run rms-design-system-engine --review-drafts --change/, 'a request Claude Code acts on, never a command with blanks');
  const lengths = c.map((x) => x.says.length);
  assert.ok(Math.max(...lengths) - Math.min(...lengths) <= 3, `one sentence each, of the same length (${lengths})`);
  // One draft: the decisions said for one, the sentences still even.
  const c1 = cards(ilDrafts({ name: 'error', file: 'e.json', drafts: [{ where: 'Limitations', text: 'Use an inline error.' }] }));
  assert.deepEqual(c1.map((x) => x.head), ['Approve', 'Change', 'Drop']);
  assert.match(c1[1].copy, /&quot;Use an inline error\.&quot;/);
  const l1 = c1.map((x) => x.says.length);
  assert.ok(Math.max(...l1) - Math.min(...l1) <= 3, `even for one draft (${l1})`);
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
