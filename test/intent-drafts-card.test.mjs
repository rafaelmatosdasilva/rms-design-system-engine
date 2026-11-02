// The drafts of an intent layer page, in the Documentation panel: under the task that asks for them, each with the
// command for each decision (templates/styleguide.template.html), and that one decision on the command line.
import { test } from 'node:test';
import { templateText } from '../lib/styleguide-template.mjs';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const tpl = templateText();

// The review's functions, from where a source line starts to the end of ilChanges, with what they use from the page.
const loadReview = () => {
  const src = /\n    (var ilDraftFrom = function [\s\S]*?\n    var ilChanges = function \(p, write, notes, task, rules\) \{[\s\S]*?\n    \};)\n/.exec(tpl)[1];
  const esc = (x) => String(x).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;'), decideMark = (k) => `<mark-${k}>`;
  const sysButton = (tag, label, attrs) => `<button${attrs}>${label}</button>`;
  const capital = (x) => String(x).charAt(0).toUpperCase() + String(x).slice(1);
  const ilOn = new Function(`return (${/var ilOn = (function \(p\) \{[\s\S]*?\n  \});/.exec(tpl)[1]})`)();
  const ilTaskOf = new Function(`return (${/var ilTaskOf = (function \(drafts\) \{[\s\S]*?\n  \});/.exec(tpl)[1]})`)();
  const ilAnsweredBy = (x) => (x.decider ? `<waits>${x.decider.name}</waits>` : '');
  return new Function('esc', 'decideMark', 'sysButton', 'capital', 'ENGINE', 'ilOn', 'ilTaskOf', 'ilAnsweredBy', `${src}\nreturn { ilChanges: ilChanges, ilDecided: ilDecided, ilDraftFrom: ilDraftFrom };`)(esc, decideMark, sysButton, capital, ENGINE, ilOn, ilTaskOf, ilAnsweredBy);
};
const loadChanges = () => loadReview().ilChanges;
const ENGINE = '/rms-design-system-engine-acme';
const unq = (s) => String(s).replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&amp;/g, '&');
// Each group as the page draws it: its key, heading, and items, each with its heading, the answer it has before anyone
// chooses, and the words each answer adds to the decision copied (as ilGroupsOf reads them back).
const groupsOf = (html) => [...html.matchAll(/<div class="sg-il-group-decide" data-il-group="(\w+)"((?: data-il-all-\w+="[^"]*")*)><div class="sg-il-group-head"><strong>([^<]+)<\/strong>([\s\S]*?)(?=<div class="sg-il-group-decide"|<\/div><div class="sg-il-review-copy")/g)].map((m) => ({
  key: m[1], head: m[3], all: Object.fromEntries([...m[2].matchAll(/data-il-all-(\w+)="([^"]*)"/g)].map((a) => [a[1], unq(a[2])])), approveAll: /data-il-all="/.test(m[4]),
  items: [...m[4].matchAll(/<div class="sg-il-line sg-il-change sg-il-item" data-il-item((?: data-il-\w+="[^"]*")*)><strong>([^<]+)<\/strong>([\s\S]*?)<span class="sg-il-choices" role="group" aria-label="([^"]+)">([\s\S]*?)<\/span><\/div>/g)].map((i) => ({
    head: unq(i[2]), body: i[3], label: unq(i[4]), quiet: m[4].slice(0, i.index).includes('<details'),
    choice: (/data-il-choose="(\w+)" aria-pressed="true"/.exec(i[5]) ?? [])[1] ?? null,
    choices: [...i[5].matchAll(/data-il-choose="(\w+)"/g)].map((c) => c[1]),
    steps: Object.fromEntries([...i[1].matchAll(/data-il-(\w+)="([^"]*)"/g)].map((a) => [a[1], unq(a[2])])),
  })),
}));
// The decision copied with the answers chosen: by item, in order ('a', 'c', 'd' or null), group by group.
const decided = (html, ...picks) => loadReview().ilDecided(unq(/data-il-on="([^"]*)"/.exec(html)[1]), groupsOf(html).map((g, gi) => ({ all: g.all, items: g.items.map((it, i) => ({ choice: picks[gi]?.[i] === undefined ? it.choice : ({ a: 'approve', c: 'change', d: 'drop' })[picks[gi][i]] ?? null, steps: it.steps })) })));

test('the drafts are in the What to do card under New text for the page, grouped apart, each once, each with its own decision', () => {
  assert.match(tpl, /card\('What to do', todo \|\| task\)/);
  assert.doesNotMatch(tpl, /card\('(Drafts to review|Still to write|To remove)'/, 'no second card for any change');
  const html = loadChanges()({ name: 'tileBar', file: 'specs/tile-bar.dsds.json', drafts: [
    { where: 'Limitations', text: 'Does not show loading by itself.' },
    { where: 'Limitations', text: 'Takes at most two buttons.' },
    { where: 'Do and don\'t', text: 'Do: dock it to the bottom.' },
    { where: 'Limitations', text: 'Does not show loading by itself.' },   // the same draft again
  ] });
  assert.match(html, /^<p class="sg-il-line">Approve, change or drop each one, then copy your decisions into Claude Code\. Agents won't use the drafts until you decide\.<\/p>/);
  const g = groupsOf(html);
  assert.deepEqual(g.map((x) => x.head), ['New text for the page (3)'], 'one group, its count in its heading');
  assert.deepEqual(g[0].items.map((x) => x.head), ['Limitations', 'Limitations', 'Do and don\'t']);
  assert.equal((html.match(/pg-par-val">Does not show loading/g) ?? []).length, 1, 'the same draft once');
  assert.ok(g[0].approveAll, 'an Approve all for the group');
  assert.ok(g[0].items.every((x) => x.choices.join() === 'approve,change,drop' && x.choice === null), 'each draft its own approve, change and drop, none chosen yet');
  assert.deepEqual(g[0].items[1].steps, { approve: 'Approve the draft "Takes at most two buttons."', change: 'Change the draft "Takes at most two buttons.": ask me for my words', drop: 'Drop the draft "Takes at most two buttons."' });
  assert.match(html, /<code data-il-preview><\/code><button data-il-copy-review>Copy decisions<\/button>/, 'one Copy for every decision made, nothing decided yet');
  assert.doesNotMatch(html, /sg-decide-grid|Approve all 3, change one|Drop all</, 'no single choice for everything any more');
});

test('each draft is decided on its own, and the decision copied carries every one', () => {
  const html = loadChanges()({ name: 'tileBar', file: 'specs/tile-bar.dsds.json', drafts: [{ where: 'Purpose', text: 'A.' }, { where: 'Purpose', text: 'B `x`.' }, { where: 'Limitations', text: 'C.' }] });
  assert.equal(decided(html, ['a', 'd', 'c']), '/rms-design-system-engine-acme on Component tileBar, Approve the draft "A."; then Drop the draft "B `x`."; then Change the draft "C.": ask me for my words.');
  assert.equal(decided(html, ['a', null, 'a']), '/rms-design-system-engine-acme on Component tileBar, Approve the draft "A."; then Approve the draft "C.".', 'a draft not decided is left as it is');
  assert.equal(decided(html, ['a', 'a', 'a']), '/rms-design-system-engine-acme on Component tileBar, Approve all 3 drafts.', 'every one approved: said at once');
  assert.equal(decided(html, ['d', 'd', 'd']), '/rms-design-system-engine-acme on Component tileBar, Drop all 3 drafts.');
  assert.equal(decided(html, [null, null, null]), '', 'nothing decided, nothing to copy');
  const one = loadChanges()({ name: 'error', file: 'e.json', drafts: [{ where: 'Limitations', text: 'Use an inline error.' }] });
  assert.match(one, /Approve, change or drop it, then copy your decision into Claude Code\./);
  assert.equal(decided(one, ['a']), '/rms-design-system-engine-acme on Component error, Approve its draft.');
  assert.equal(decided(one, ['c']), '/rms-design-system-engine-acme on Component error, Change the draft "Use an inline error.": ask me for my words.');
  assert.ok(!/\.json|\.md|--/.test(decided(html, ['a', 'd', 'c'])), 'no file, no flag');
});

test('each draft shows where it comes from: the code\'s prop, a name only Figma has, the line it says again', () => {
  const html = loadChanges()({ name: 'Draft Saver', component: 'draftSaver', code: 'src/saver/DraftSaver.vue', file: 'specs/draft-saver.dsds.json', drafts: [
    { where: 'When to use', text: 'Use `draftSaver` with `state` moving from `idle` to `busy`.', from: { props: [{ name: 'state', from: 'the code', file: 'src/saver/DraftSaver.vue', options: ['idle', 'busy', 'done'] }], line: { from: 'The intent layer · When to use', text: 'Show progress with `state`.' } } },
    { where: 'Limitations', text: 'It shows the time only when `showClock` is set.', from: { props: [{ name: 'showClock', from: 'Figma' }], figmaOnly: ['showClock'] } },
    { where: 'Limitations', text: 'It does not submit.' },
  ] });
  const [a, b, c] = groupsOf(html)[0].items;
  assert.match(a.body, /<span class="sg-il-source">The code: `state`, a prop of DraftSaver\.vue, takes `idle`, `busy`, `done`\.<\/span><span class="sg-il-source">Says again: “Show progress with `state`\.” \(The intent layer · When to use\)\.<\/span>/);
  assert.match(b.body, /<span class="sg-il-source sg-il-source--warn">Figma: `showClock` is a property of the Figma component, not a prop DraftSaver\.vue takes\. Change the draft to say what the code does, or name it as Figma's\.<\/span>/);
  assert.match(c.body, /Source: none found on the page, in Figma or in the code\./);
});

test('the changes to rules are a group of their own, apart from the drafts; one with only the engine behind it is folded away, No its answer', () => {
  const rule = (proposal, more = {}) => ({ kind: 'guard', key: `guard:Tile:${proposal.length}`, rule: 'Only one Tile per screen.', proposal, candidates: [{ answer: 'yes', evidence: [{ from: "The team's pages", says: 'The page marks the rule must.' }] }], decider: { name: 'Tiles team' }, ...more });
  const html = loadChanges()({ name: 'Tile', file: 't.json', drafts: [{ where: 'Purpose', text: 'Groups content.' }] }, [], [], '', [
    rule('Hold the rule “Only one Tile per screen” as a check: At most 1 Tile on one screen.'),
    { kind: 'rewrite', key: 'rewrite:Tile:1', rule: 'Use it sparingly.', rewrite: 'Use at most one Tile per screen.', proposal: 'Rewrite the rule “Use it sparingly” as: Use at most one Tile per screen.', quiet: true, recommends: 'no', candidates: [{ answer: 'yes', evidence: [{ from: 'The engine', says: 'x' }] }] },
  ]);
  const g = groupsOf(html);
  assert.deepEqual(g.map((x) => x.head), ['New text for the page (1)', 'Changes to rules (2)'], 'two groups, each with its own heading and count');
  const [hold, quiet] = g[1].items;
  assert.equal(hold.head, 'Hold the rule as a check');
  assert.match(hold.body, /“Only one Tile per screen\.”<\/span><span class="sg-il-label">With the check<\/span><span class="sg-il-text">At most 1 Tile on one screen\.<\/span><span class="sg-il-source">The page marks the rule must\.<\/span><waits>Tiles team<\/waits>/);
  assert.deepEqual([hold.quiet, hold.choice], [false, null]);
  assert.deepEqual([quiet.head, quiet.quiet, quiet.choice], ['Rewrite the rule', true, 'drop'], 'folded away, No chosen until a person says otherwise');
  assert.match(html, /<details class="sg-il-quiet"><summary>1 more the engine has no ground for: No, unless you say otherwise<\/summary>/);
  assert.match(quiet.body, /Only the engine's own reading of the rule speaks for it/);
  assert.match(unq(html), /<code data-il-preview>\/rms-design-system-engine-acme on Component Tile, No to "Rewrite the rule “Use it sparingly” as: Use at most one Tile per screen\."\.<\/code>/, 'the folded no is decided already');
  assert.equal(decided(html, ['a'], ['a', undefined]), '/rms-design-system-engine-acme on Component Tile, Approve its draft; then Yes to "Hold the rule “Only one Tile per screen” as a check: At most 1 Tile on one screen."; then No to "Rewrite the rule “Use it sparingly” as: Use at most one Tile per screen.".');
  assert.equal(decided(html, [null], ['c', 'a']), '/rms-design-system-engine-acme on Component Tile, Change "Hold the rule “Only one Tile per screen” as a check: At most 1 Tile on one screen.": ask me for my words; then Yes to "Rewrite the rule “Use it sparingly” as: Use at most one Tile per screen.".');
  // A rule change is decided here only: never again under Proposal, nor as a yes or no in the page's task.
  assert.match(tpl, /var ilOpen = function \(p\) \{ return ilOwn\(p\)\.filter\(function \(x\) \{ return x\.answer !== 'no' && !isRuleChange\(x\); \}\); \};/);
  assert.match(tpl, /var list = ilOwn\(p\)\.filter\(function \(x\) \{ return !isRuleChange\(x\); \}\);/);
  assert.match(tpl, /ilChanges\(p, c\.write, c\.notes, own \? ilTodo\(own, true\) : c\.todo, ilRulesOpen\(p\)\)/);
});

test('the panel keeps each item\'s decision: a second press takes it back, Approve all leaves what is folded away', () => {
  assert.match(tpl, /if \(!was\) ch\.setAttribute\('aria-pressed', 'true'\); show\(\); return;/);
  assert.match(tpl, /if \(it\.closest\('\.sg-il-quiet'\)\) return;/);
  assert.match(tpl, /if \(!text\) \{ said\.textContent = 'Choose approve, change or drop for one at least first\.'; return; \} copyText\(text, rc, said, 'Paste it in Claude Code'\);/);
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

test('every other change a page asks for is in What to do too, under Other changes, each with its own decision', () => {
  const html = loadChanges()({ name: 'tileBar', file: 'specs/tile-bar.dsds.json', todo: [], drafts: [{ where: 'Limitations', text: 'Does not show loading by itself.' }] },
    [{ what: 'When to use it, not a sibling', where: 'specs/tile-bar.md, under ## When to use', html: '<span class="sg-il-text">One line.</span>' }],
    [{ what: 'Save flow pattern available here: a link', from: 'Figma annotation', why: 'The agent cannot open a link.', fix: 'Write in words what to take from it.', remove: 'No: keep the link and add the words.' },
     { what: 'A copy of its description', from: 'Code note', why: 'Figma says it already.', remove: 'Yes: the description already carries it.' }]);
  const g = groupsOf(html);
  assert.deepEqual(g.map((x) => x.head), ['New text for the page (1)', 'Other changes (3)']);
  assert.deepEqual(g[1].items.map((x) => x.head), ['To draft · When to use it, not a sibling', 'Remove · Code note', 'Change · Figma annotation'], 'each change under what it is, in one place');
  assert.match(html, /Remove · Code note<\/strong><span class="pg-par-val">“A copy of its description”<\/span><span class="sg-il-text">Figma says it already\.<\/span><span class="sg-il-choices"/, 'a note and why, in one place');
  assert.match(html, /“Save flow pattern available here: a link”<\/span><span class="sg-il-text">The agent cannot open a link\. Write in words what to take from it\.</);
  assert.doesNotMatch(html, /Why remove it|What to change|>Where</, 'no labels, no file to find');
  assert.equal(decided(html, ['a'], ['a', 'a', 'a']), '/rms-design-system-engine-acme on Component tileBar, Approve its draft; then write "When to use it, not a sibling" under ## When to use as drafts I review; then remove "A copy of its description" where it lives; then for "Save flow pattern available here: a link", write in words what to take from it.');
  assert.equal(decided(html, ['d'], ['d', 'd', 'd']), '/rms-design-system-engine-acme on Component tileBar, Drop its draft; then write nothing new and leave its notes as they are.');
  assert.equal(decided(html, [null], [null, 'd', 'c']), '/rms-design-system-engine-acme on Component tileBar, For "Save flow pattern available here: a link", ask me what to change.', 'a note dropped is left as it is');
  // The page's task first, in plain words.
  assert.match(loadChanges()({ name: 'a', file: 'a.json', drafts: [{ where: 'Purpose', text: 'X.' }] }, [], [], '<p class="sg-il-line">Its task.</p>'), /^<p class="sg-il-line">Its task\.<\/p><p class="sg-il-line">Approve, change or drop it,/);
  // Nothing to change: no card.
  assert.equal(loadChanges()({ name: 'chip', file: 'c.json' }, [], []), '');
});

test('the engine\'s own line for the drafts is not said twice: the card says it for every change', () => {
  const re = new RegExp(/var REVIEW_LINE = \/(.+)\/;/.exec(tpl)[1]);
  assert.ok(re.test('Review these 5 drafts. Approve, change or drop each one, then copy your decisions and paste them into Claude Code.'));
  assert.ok(re.test('Review its draft below. Approve it, change it or drop it.'));
  assert.ok(!re.test('Check the page against the component as it is today.'));
});

test('a part\'s page: what moves to its root\'s page is shown as it will read there, and the decision copied says where', () => {
  const part = { name: 'tileListRow', root: 'tileList', file: 'specs/tile-list.md' };
  const html = loadChanges()({ name: 'tileListRow', file: 'specs/tile-list-row.md', drafts: [{ where: 'Purpose', text: 'One row of a tile list.' }] },
    [{ what: 'Add to tileList\'s page', part, html: '<span class="sg-il-text"><strong>tileListRow</strong>: One row of a tile list.</span>' }], []);
  assert.deepEqual(groupsOf(html).map((g) => g.items.map((x) => x.head)), [['Purpose'], ['Add to tileList\'s page']]);
  assert.doesNotMatch(html.replace(/ data-il-\w+="[^"]*"/g, ''), /Write it in|under Parts/, 'nothing for the person to do by hand, no file to find: the decision copied says it');
  assert.equal(decided(html, ['a'], ['a']), '/rms-design-system-engine-acme on Component tileListRow, Approve its draft; then copy what this page says into Component tileList\'s page, under Parts, as ### tileListRow, then delete this page.');
  assert.match(tpl, /if \(x\.part\) \{ var says = /, 'it opens with what this page says it is');
});

test('a part\'s page says what happens to it in plain words', () => {
  const gen = readFileSync(fileURLToPath(new URL('../lib/styleguide-gen.mjs', import.meta.url)), 'utf8');
  assert.match(gen, /p\.todo = \[`\$\{p\.component\} only lives inside \$\{root\}, so its guidance moves to \$\{root\}'s page and this page goes away\.`\]/);
});

test('a decision copied names the task that wrote the drafts, and the page by its kind: a template, a part, the System page', () => {
  const at = { task: 'What to do when no component fits', at: '2026-10-28' };
  const sys = loadChanges()({ action: 'review', absent: {}, system: true, drafts: [{ where: 'What to do when no component fits', text: 'Use only the system\'s components.', ...at }, { where: 'What to do when no component fits', text: 'Ask before building one.', ...at }] }, [], []);
  assert.equal(decided(sys, ['a', 'a']), '/rms-design-system-engine-acme on the System page, Approve all 2 drafts from the task "What to do when no component fits" (28 Oct).');
  assert.equal(decided(sys, ['d', 'd']), '/rms-design-system-engine-acme on the System page, Drop all 2 drafts from the task "What to do when no component fits" (28 Oct).');
  assert.equal(decided(sys, ['a', 'd']), '/rms-design-system-engine-acme on the System page, Approve the draft "Use only the system\'s components."; then Drop the draft "Ask before building one.".');
  assert.equal(decided(loadChanges()({ name: 'Checkout', layer: 'templates', file: 't.json', drafts: [{ where: 'Rules', text: 'One primary action.' }] }, [], []), ['a']), '/rms-design-system-engine-acme on Template Checkout, Approve its draft.');
  assert.equal(decided(loadChanges()({ name: 'Legend', about: { partOf: 'Pie chart' }, file: 'l.json', drafts: [{ where: 'Purpose', text: 'Names each slice.' }] }, [], []), ['a']), '/rms-design-system-engine-acme on Legend, part of Component Pie chart, Approve its draft.');
  // Drafts from two tasks: none is named, so the decision is for all of them.
  assert.equal(decided(loadChanges()({ name: 'x', file: 'x.json', drafts: [{ where: 'Rules', text: 'A.', task: 'One' }, { where: 'Rules', text: 'B.', task: 'Two' }] }, [], []), ['a', 'a']), '/rms-design-system-engine-acme on Component x, Approve all 2 drafts.');
  // Nothing drafted yet on the System page: what to write, as the request it becomes.
  assert.equal(decided(loadChanges()({ action: 'write', absent: {} }, [{ what: 'What to do when no component fits', html: '' }], []), ['a']), '/rms-design-system-engine-acme on the System page, Write "What to do when no component fits" as drafts I review.');
});

test('the proposals and the part questions are copied in words too', () => {
  assert.match(tpl, /var cmd = function \(a\) \{ return ENGINE \+ ' on ' \+ ilOn\(p\) \+ ', ' \+ \(a === 'yes' \? 'Yes' : a === 'no' \? 'No'/);
  assert.match(tpl, /var run = function \(to\) \{ return ENGINE \+ ' on Component ' \+ c\.name \+ ', ' \+ \(to === 'none' \? 'It is its own component' : 'It is a part of Component ' \+ to\); \};/);
  assert.doesNotMatch(tpl, /'rms-design-system-engine --(intent-decide|review-drafts|part) /, 'no copied decision names a flag');
});

test('a drafted example shows its code under its line', () => {
  const html = loadChanges()({ name: 'tileMedia', file: 'docs/tile-media.md', drafts: [{ where: 'Examples', text: 'The most common way the products use it (2 of the 4 uses read), from a.vue, line 3:', code: '<TileMedia size="small" />', lang: 'vue' }, { where: 'Limitations', text: 'One picture only.' }] });
  assert.match(html, /<strong>Examples<\/strong><span class="pg-par-val">The most common way[^<]*<\/span><pre class="sg-il-example"><code>&lt;TileMedia size=&quot;small&quot; \/><\/code><\/pre>/);
  assert.match(html, /<strong>Limitations<\/strong><span class="pg-par-val">One picture only\.<\/span><span class="sg-il-source">Source: none found on the page, in Figma or in the code\.<\/span><span class="sg-il-choices"/, 'a draft with no code shows none');
  assert.doesNotMatch(html.split('<strong>Limitations')[0], /Source: none found/, 'an example says where its code is from itself');
});

test('the pages to write are ordered most used first, with a chip and each one\'s reach', () => {
  // The Documentation page: the rows with no page sorted by their rank, a chip for them, their reach in the panel.
  assert.match(tpl, /\.concat\(\(IL\.noPage \|\| \[\]\)\.slice\(\)\.sort\(function \(a, b\) \{ var r = IL\.pagesToWrite \|\| \{\}/);
  assert.match(tpl, /\{ key: 'pagesToWrite', label: 'Pages to write, most used first', n: toStart, dot: 'differs' \}/);
  const src = /var ilReachOf = (function \(n\) \{[\s\S]*?'<\/span><\/p>'; \});/.exec(tpl)[1];
  const esc = (x) => String(x).replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const reach = (IL) => new Function('IL', 'esc', `return (${src})`)(IL, esc);
  assert.equal(reach({ pagesToWrite: { tileMedia: { rank: 2, reach: { products: ['Shop', 'Admin'], files: 6, uses: 12 }, next: true } } })('tileMedia'), '<p class="sg-il-line"><strong>Number 2 of the pages to write, most used first</strong><span class="pg-par-val">Shop, Admin use it: 6 files, 12 uses. The next run that writes the layer starts its page, its lines drafts to review.</span></p>');
  assert.equal(reach({})('tileMedia'), '');
});
