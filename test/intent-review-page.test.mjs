// The Documentation page (templates/styleguide.template.html): each proposal with every answer it could take and their
// evidence, who it waits on and who answered it; a page whose component changed reviewed as that; rows counted by who
// they wait on. An invented system (Acme).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const tpl = readFileSync(fileURLToPath(new URL('../templates/styleguide.template.html', import.meta.url)), 'utf8');
const esc = (x) => String(x).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
const capital = (x) => String(x).charAt(0).toUpperCase() + String(x).slice(1);
const grab = (name, args) => new RegExp(`var ${name} = (function \\(${args}\\) \\{[\\s\\S]*?\\n    \\});`).exec(tpl)[1];

const loadProposal = (IL = {}) => new Function('esc', 'capital', 'IL', `var IL_STRENGTH = ${/var IL_STRENGTH = (\{[^\n]*\});/.exec(tpl)[1]};
  var ilCandidates = ${grab('ilCandidates', 'x')}; var ilAnsweredBy = ${grab('ilAnsweredBy', 'x')}; return (${grab('ilProposal', 'p')});`)(esc, capital, IL);

test('a proposal shows each answer it could take, the proposed one first, each with where its evidence comes from and how strong', () => {
  const html = loadProposal()({ proposals: [{ kind: 'add', subject: 'listMain/Row', proposal: 'Document it in List Main\'s page.', recommends: 'yes', split: true, decider: { name: 'Tiles team' },
    candidates: [
      { answer: 'yes', says: 'Document it in List Main\'s page.', evidence: [{ from: 'Figma', says: 'Its Figma name puts it inside listMain.', strength: 'strong' }] },
      { answer: 'no', says: 'It gets a page of its own.', evidence: [{ from: 'Products', says: 'Acme shop uses it in 3 files, on its own.', strength: 'some' }] },
    ] }] });
  assert.match(html, /The evidence is split: a person decides\./);
  assert.match(html, /<p class="sg-il-head">Proposed · Document it in List Main's page\.<\/p><p class="sg-il-item">Its Figma name puts it inside listMain\.<span class="pg-par-val">Figma · Strong<\/span>/);
  assert.match(html, /<p class="sg-il-head">It gets a page of its own\.<\/p><p class="sg-il-item">Acme shop uses it in 3 files, on its own\.<span class="pg-par-val">Products · Some<\/span>/);
  assert.match(html, /Waits on Tiles team\./);
});

test('an answer says who gave it, and when that was not its owner, says who decides it', () => {
  const html = loadProposal()({ proposals: [{ kind: 'review', subject: 'tileOne', proposal: 'Does Tile One\'s page still hold for tileOne as it is now?', answer: 'yes', by: 'Developer', at: '2026-03-06T09:00:00Z', notOwner: true, decider: { name: 'QA lead' }, evidence: ['tileOne changed.'] }] });
  assert.match(html, /Answered yes by Developer on 2026-03-06\. QA lead decides it: the answer stands, and they should hear of it\./);
  assert.doesNotMatch(html, /Waits on/);
});

test('a page whose component changed is reviewed as that, and every row to review says who it waits on, with a chip each', () => {
  assert.match(tpl, /isStale\(p\) && p\.action === 'review' \? 'Changed since written'/);
  assert.match(tpl, /deciderOf\(p\) \? \['Waits on ' \+ deciderOf\(p\)\] : \[\]/);
  assert.match(tpl, /label: 'Waiting on ' \+ d, n: waits\[d\]/);
  assert.match(tpl, /\['review', 'Note beside it'\]/, 'what the agents read shows the note beside the page');
  assert.match(tpl, /x\.decider \? lines\(\['Waits on ' \+ x\.decider\.name \+ '\.'\]\)/, 'a change in Figma held for sign-off says who it waits on');
});

test('a decision to review again: its page says so, a withdrawal says its question is asked again, and the History shows the note', () => {
  const html = loadProposal()({ proposals: [{ kind: 'recheck', subject: 'tileTwo', proposal: 'Does the answer yes to "Its page is Tile One." still hold for tileTwo as it is now?', answer: 'no', by: 'QA', at: '2026-03-06T09:00:00Z', evidence: ['tileTwo changed.'] }] });
  assert.match(html, /Withdrawn by QA on 2026-03-06: its question is asked again\./);
  assert.doesNotMatch(html, /Declined/);
  assert.match(tpl, /p\.recheck && p\.action === 'review' \? 'Decision to review again'/);
  assert.match(tpl, /\(d\.review \? '<p class="sg-il-line"><span class="pg-par-val">' \+ esc\(d\.review\)/, 'the History page shows the note');
  assert.match(tpl, /\(d\.review \? '<br>' \+ esc\(d\.review\) : ''\)/, 'and so does the component\'s own History');
});
