// The drafts of an intent layer page, in the Documentation panel: under the task that asks for them, each with the
// command for each decision (templates/styleguide.template.html), and that one decision on the command line.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const tpl = readFileSync(fileURLToPath(new URL('../templates/styleguide.template.html', import.meta.url)), 'utf8');

const loadChanges = () => {
  const src = /var ilChanges = (function \(p, write, notes, task\) \{[\s\S]*?\n    \});/.exec(tpl)[1];
  const esc = (x) => String(x).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;'), shq = (x) => `'${x}'`, decideMark = (k) => `<mark-${k}>`;
  const sysButton = (tag, label, attrs) => `<button${attrs}>${label}</button>`;
  const capital = (x) => String(x).charAt(0).toUpperCase() + String(x).slice(1);
  const ilOn = new Function(`return (${/var ilOn = (function \(p\) \{[\s\S]*?\n  \});/.exec(tpl)[1]})`)();
  const ilTaskOf = new Function(`return (${/var ilTaskOf = (function \(drafts\) \{[\s\S]*?\n  \});/.exec(tpl)[1]})`)();
  return new Function('esc', 'shq', 'decideMark', 'sysButton', 'capital', 'ENGINE', 'ilOn', 'ilTaskOf', `return (${src})`)(esc, shq, decideMark, sysButton, capital, ENGINE, ilOn, ilTaskOf);
};
const ENGINE = '/rms-design-system-engine-acme';
const cards = (html) => [...html.matchAll(/<div class="sg-decide sg-decide--(\w+)" title="([^"]+)"><strong class="sg-decide-head"><mark-\w+>([^<]+)<\/strong><button data-il-copy="([^"]*)" data-il-said="([^"]+)">([^<]+)<\/button>/g)].map((m) => ({ k: m[1], says: m[2], head: m[3], copy: m[4].replace(/&quot;/g, '"').replace(/&amp;/g, '&'), said: m[5], label: m[6] }));

test('the drafts are in the What to do card, grouped by section, each once, then three decisions side by side', () => {
  assert.match(tpl, /card\('What to do', todo \|\| task\)/);
  assert.doesNotMatch(tpl, /card\('(Drafts to review|Still to write|To remove)'/, 'no second card for any change');
  const ilDrafts = (p) => loadChanges()(p);
  const cards = (html) => [...html.matchAll(/<div class="sg-decide sg-decide--(\w+)" title="([^"]+)"><strong class="sg-decide-head"><mark-\w+>([^<]+)<\/strong><button data-il-copy="([^"]*)" data-il-said="([^"]+)">([^<]+)<\/button>/g)].map((m) => ({ k: m[1], says: m[2], head: m[3], copy: m[4], said: m[5], label: m[6] }));
  const html = ilDrafts({ name: 'actionBar', file: 'specs/action-bar.dsds.json', drafts: [
    { where: 'Limitations', text: 'Does not show loading by itself.' },
    { where: 'Limitations', text: 'Takes at most two buttons.' },
    { where: 'Do and don\'t', text: 'Do: dock it to the bottom.' },
    { where: 'Limitations', text: 'Does not show loading  by itself.' },   // the same draft again
  ] });
  assert.equal((html.match(/<strong>Limitations</g) ?? []).length, 1, 'a section\'s drafts together');
  assert.match(html, /<strong>Do and don't</);
  assert.doesNotMatch(html, /Proposed draft/, 'the heading says they are proposed, never each section');
  assert.match(html, /^<p class="sg-il-line"><strong>3 proposed drafts<\/strong><\/p><p class="sg-il-line">Approve all 3, change one or drop them all, then copy your decision into Claude Code\. Agents won't use the drafts until you decide\.<\/p>/);
  assert.equal((html.match(/Does not show loading/g) ?? []).length, 1, 'the same draft once');
  const c = cards(html);
  assert.deepEqual(c.map((x) => [x.k, x.head]), [['approve', 'Approve all'], ['change', 'Change one'], ['drop', 'Drop all']], 'three cards side by side, each with its own mark');
  assert.ok(c.every((x) => x.label === 'Copy decision' && x.said === 'Paste it in Claude Code'), 'one button each, and where to paste it');
  assert.equal(c[0].copy, '/rms-design-system-engine-acme on Component actionBar, Approve all 3 drafts.', 'the system\'s command, the page by its kind and name, the decision: never a file or a flag');
  assert.equal(c[2].copy, '/rms-design-system-engine-acme on Component actionBar, Drop all 3 drafts.');
  assert.equal(c[1].copy, '/rms-design-system-engine-acme on Component actionBar, Change one of the 3 drafts: ask me which one and my words.', 'a request Claude Code acts on, never a command with blanks');
  assert.ok(c.every((x) => !/\.json|\.md|--/.test(x.copy)), 'no file, no flag');
  const lengths = c.map((x) => x.says.length);
  assert.ok(Math.max(...lengths) - Math.min(...lengths) <= 3, `what each does, in its tip, of the same length (${lengths})`);
  // One draft: the decisions said for one, the sentences still even.
  const c1 = cards(ilDrafts({ name: 'error', file: 'e.json', drafts: [{ where: 'Limitations', text: 'Use an inline error.' }] }));
  assert.deepEqual(c1.map((x) => x.head), ['Approve', 'Change', 'Drop']);
  assert.match(c1[1].copy, /^\/rms-design-system-engine-acme on Component error, Change its draft &quot;Use an inline error\.&quot;: ask me for my words\.$/);
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

test('every change a page asks for is in What to do, under one decision: its drafts, what to write, the notes to remove or change', () => {
  const html = loadChanges()({ name: 'actionBar', file: 'specs/action-bar.dsds.json', todo: [], drafts: [{ where: 'Limitations', text: 'Does not show loading by itself.' }] },
    [{ what: 'When to use it, not a sibling', where: 'specs/action-bar.md, under ## When to use', html: '<span class="sg-il-text">One line.</span>' }],
    [{ what: 'Save flow pattern available here: a link', from: 'Figma annotation', why: 'The agent cannot open a link.', fix: 'Write in words what to take from it.', remove: 'No: keep the link and add the words.' },
     { what: 'A copy of its description', from: 'Code note', why: 'Figma says it already.', remove: 'Yes: the description already carries it.' }]);
  assert.deepEqual([...html.matchAll(/sg-il-change"><strong>([^<]+)</g)].map((m) => m[1]),
    ['Limitations', 'To draft · When to use it, not a sibling', 'Remove · Code note', 'Change · Figma annotation'], 'each change under what it is, in one place');
  assert.match(html, /<strong>4 proposed changes<\/strong><\/p><p class="sg-il-line">Approve all 4, change one or drop them all/);
  assert.match(html, /Remove · Code note<\/strong><span class="pg-par-val">\u201cA copy of its description\u201d<\/span><span class="sg-il-text">Figma says it already\.<\/span><\/div>/, 'a note and why, in one place');
  assert.match(html, /\u201cSave flow pattern available here: a link\u201d<\/span><span class="sg-il-text">The agent cannot open a link\. Write in words what to take from it\.</);
  assert.doesNotMatch(html, /Why remove it|What to change|>Where</, 'no labels, no file to find');
  const c = cards(html);
  assert.deepEqual(c.map((x) => x.head), ['Approve all', 'Change one', 'Drop all'], 'one decision for all of them');
  assert.equal(c[0].copy, '/rms-design-system-engine-acme on Component actionBar, Approve its draft; then write "When to use it, not a sibling" under ## When to use as drafts I review; then remove "A copy of its description" where each lives; then for "Save flow pattern available here: a link", write in words what to take from it.');
  assert.equal(c[2].copy, '/rms-design-system-engine-acme on Component actionBar, Drop its draft; write nothing new and leave its notes as they are.');
  // The page's task under the heading, in plain words.
  assert.match(loadChanges()({ name: 'a', file: 'a.json', drafts: [{ where: 'Purpose', text: 'X.' }] }, [], [], '<p class="sg-il-line">Its task.</p>'), /^<p class="sg-il-line"><strong>1 proposed draft<\/strong><\/p><p class="sg-il-line">Its task\.<\/p><p class="sg-il-line">Approve it, change it or drop it,/);
  // Nothing to change: no card.
  assert.equal(loadChanges()({ name: 'chip', file: 'c.json' }, [], []), '');
});

test('the engine\'s own line for the drafts is not said twice: the card says it for every change', () => {
  const re = new RegExp(/var REVIEW_LINE = \/(.+)\/;/.exec(tpl)[1]);
  assert.ok(re.test('Review these 5 drafts. Approve them all, change one or drop them all, then copy your decision and paste it into Claude Code.'));
  assert.ok(re.test('Review its draft below. Approve it, change it or drop it.'));
  assert.ok(!re.test('Check the page against the component as it is today.'));
});

test('a part\'s page: what moves to its root\'s page is shown as it will read there, and the decision copied says where', () => {
  const part = { name: 'tileListRow', root: 'tileList', file: 'specs/tile-list.md' };
  const html = loadChanges()({ name: 'tileListRow', file: 'specs/tile-list-row.md', drafts: [{ where: 'Purpose', text: 'One row of a tile list.' }] },
    [{ what: 'Add to tileList\'s page', part, html: '<span class="sg-il-text"><strong>tileListRow</strong>: One row of a tile list.</span>' }], []);
  assert.deepEqual([...html.matchAll(/sg-il-change"><strong>([^<]+)</g)].map((m) => m[1]), ['Purpose', 'Add to tileList\'s page']);
  assert.doesNotMatch(html.split('sg-decide-grid')[0], /Write it in|under Parts/, 'nothing for the person to do by hand, no file to find');
  const c = cards(html);
  assert.equal(c[0].copy, '/rms-design-system-engine-acme on Component tileListRow, Approve its draft; then copy what this page says into Component tileList\'s page, under Parts, as ### tileListRow, then delete this page.');
  assert.match(tpl, /if \(x\.part\) \{ var says = /, 'it opens with what this page says it is');
});

test('a part\'s page says what happens to it in plain words', () => {
  const gen = readFileSync(fileURLToPath(new URL('../styleguide-gen.mjs', import.meta.url)), 'utf8');
  assert.match(gen, /p\.todo = \[`\$\{p\.component\} only lives inside \$\{root\}, so its guidance moves to \$\{root\}'s page and this page goes away\.`\]/);
});

test('a decision copied names the task that wrote the drafts, and the page by its kind: a template, a part, the System page', () => {
  const at = { task: 'What to do when no component fits', at: '2026-10-28' };
  const sys = cards(loadChanges()({ action: 'review', absent: {}, system: true, drafts: [{ where: 'What to do when no component fits', text: 'Use only the system\'s components.', ...at }, { where: 'What to do when no component fits', text: 'Ask before building one.', ...at }] }, [], []));
  assert.equal(sys[0].copy, '/rms-design-system-engine-acme on the System page, Approve all 2 drafts from the task "What to do when no component fits" (28 Oct).');
  assert.equal(sys[2].copy, '/rms-design-system-engine-acme on the System page, Drop all 2 drafts from the task "What to do when no component fits" (28 Oct).');
  const tpl2 = cards(loadChanges()({ name: 'Checkout', layer: 'templates', file: 't.json', drafts: [{ where: 'Rules', text: 'One primary action.' }] }, [], []));
  assert.equal(tpl2[0].copy, '/rms-design-system-engine-acme on Template Checkout, Approve its draft.');
  const part = cards(loadChanges()({ name: 'Legend', about: { partOf: 'Pie chart' }, file: 'l.json', drafts: [{ where: 'Purpose', text: 'Names each slice.' }] }, [], []));
  assert.equal(part[0].copy, '/rms-design-system-engine-acme on Legend, part of Component Pie chart, Approve its draft.');
  // Drafts from two tasks: none is named, so the decision is for all of them.
  const two = cards(loadChanges()({ name: 'x', file: 'x.json', drafts: [{ where: 'Rules', text: 'A.', task: 'One' }, { where: 'Rules', text: 'B.', task: 'Two' }] }, [], []));
  assert.equal(two[0].copy, '/rms-design-system-engine-acme on Component x, Approve all 2 drafts.');
  // Nothing drafted yet on the System page: what to write, as the request it becomes.
  const write = cards(loadChanges()({ action: 'write', absent: {} }, [{ what: 'What to do when no component fits', html: '' }], []));
  assert.equal(write[0].copy, '/rms-design-system-engine-acme on the System page, Write "What to do when no component fits" as drafts I review.');
});

test('the proposals and the part questions are copied in words too', () => {
  assert.match(tpl, /var cmd = function \(a\) \{ return ENGINE \+ ' on ' \+ ilOn\(p\) \+ ', ' \+ \(a === 'yes' \? 'Yes' : a === 'no' \? 'No'/);
  assert.match(tpl, /var run = function \(to\) \{ return ENGINE \+ ' on Component ' \+ c\.name \+ ', ' \+ \(to === 'none' \? 'It is its own component' : 'It is a part of Component ' \+ to\); \};/);
  assert.doesNotMatch(tpl, /'rms-design-system-engine --(intent-decide|review-drafts|part) /, 'no copied decision names a flag');
});
