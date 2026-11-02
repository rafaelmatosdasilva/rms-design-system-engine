// intent-proposals.mjs - the engine's proposed answer to each of the team's decisions on the Intent layer page (Fix,
// Add, Move), what it rests on, and the team's yes or no, kept and acted on. An invented system (Acme).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { proposalsFor, applyDecisions, decide, readDecisions, optionsOf, candidatesFor, withEvidence, currentAnswers, pendingOf, usageOf, deciderFor, rechecksFor, withdrawn } from '../lib/intent-proposals.mjs';
import * as truth from '../lib/intent-truth.mjs';
import { tempDir } from './helpers.mjs';

const ROOT = tempDir('proposals-');
const file = (p, t) => { mkdirSync(join(ROOT, p, '..'), { recursive: true }); writeFileSync(join(ROOT, p), t); };
file('src/lists/List.vue', "import Row from './Row'\n");
file('src/lists/Row.vue', '<template><li /></template>');
file('src/tiles/Tile.vue', '<template><div /></template>');
file('src/search/Search.vue', "import Row from '@/search/Row'\n");
file('src/search/Row.vue', '<template><li /></template>');
file('src/calendar/General.vue', "import Picker from '@/calendar/Picker'\n");
file('src/calendar/Picker.vue', '<template><div /></template>');
const codeFiles = { listMain: 'src/lists/List.vue', 'listMain/Row': 'src/lists/Row.vue', tileOne: 'src/tiles/Tile.vue', tileTwo: 'src/tiles/Tile.vue', searchMain: 'src/search/Search.vue', calendar: 'src/calendar/General.vue', newThing: 'src/new/Thing.vue' };
const page = (name, component, extra = {}) => ({ name, component, file: `${name}.dsds.json`, action: 'keep', wrong: [], ...extra });
const report = { pages: [
  page('List Main', 'listMain'), page('Tile One', 'tileOne'), page('Search', 'searchMain', { action: 'fix', wrong: [{ kind: 'name', says: '`searchRow`', line: 'Use `searchRow` for a row.' }] }),
  page('Patrimony', null, { action: 'fix', wrong: [{ kind: 'name', says: '`tabGroupV2`', line: 'Use `tabGroupV2`.' }] }),
  page('Consult', null, { action: 'fix', wrong: [{ kind: 'name', says: '`ListSimple`', line: 'Pick `ListSimple` or `ListDrop`.' }] }),
  page('Picker', null, { action: 'move', code: 'src/calendar/Picker.vue' }),
] };
const entity = (name, lines) => ({ name, file: `${name}.dsds.json`, purpose: [], whenToUse: lines, whenNotToUse: [], mistakes: [], limitations: [], rules: [], sections: [] });
const snap = { entities: [entity('Consult', ['Pick `ListSimple` or `ListDrop`.', 'Treat the Figma label `ListDrop` as it is.']), entity('Patrimony', ['Use `tabGroupV2`.']), entity('Search', ['Use `searchRow` for a row.'])] };
const facts = { text: '"tabGroup (deprecated, removal planned)"', files: ['src/search/Row', 'src/search/Search', 'src/lists/Row'] };

test('a proposal for each of the team\'s decisions, with what it rests on', () => {
  const P = proposalsFor({ ROOT, report, snap, names: ['listMain', 'tileOne', 'tileTwo', 'tabGroup', 'listMain/Row', 'newThing'], codeFiles, facts, noPage: ['listMain/Row', 'tileTwo', 'newThing'] });
  assert.match(P.get('add:listMain/Row').proposal, /^Document it in List Main's page, as a part of listMain/);
  assert.match(P.get('add:listMain/Row').evidence.join(' '), /Only List\.vue uses it/);
  assert.match(P.get('add:tileTwo').proposal, /^Its page is Tile One/);
  assert.equal(P.get('add:newThing').effect, 'write');
  assert.match(P.get('fix:Patrimony:tabGroupV2').proposal, /replaces tabGroup/);
  assert.match(P.get('fix:Patrimony:tabGroupV2').evidence[0], /Figma marks deprecated/);
  assert.match(P.get('fix:Consult:ListSimple').proposal, /Figma's own/);
  assert.match(P.get('fix:Search:searchRow').proposal, /src\/search\/Row/);
  assert.match(P.get('move:Picker').evidence[0], /used only by General/);
});

test('a yes is kept and acted on; a no keeps the decision on the page', () => {
  const P = proposalsFor({ ROOT, report, snap, names: ['listMain', 'tileOne', 'tileTwo', 'tabGroup'], codeFiles, facts, noPage: ['listMain/Row', 'tileTwo', 'newThing'] });
  decide(ROOT, ['add:listMain/Row', 'fix:Patrimony:tabGroupV2', 'move:Picker'], 'yes', Object.fromEntries(P), { now: '2026-01-01' });
  decide(ROOT, ['add:tileTwo'], 'no', Object.fromEntries(P));
  const d = readDecisions(ROOT);
  assert.equal(d['add:listMain/Row'].answer, 'yes');
  assert.match(d['add:listMain/Row'].proposal, /Document it in List Main's page/);
  const r = applyDecisions({ report, noPage: ['listMain/Row', 'tileTwo', 'newThing'], proposals: P, decisions: d });
  assert.deepEqual(r.noPage, ['tileTwo', 'newThing']);
  assert.equal(r.addProposals.tileTwo.answer, 'no');
  const pg = (n) => r.pages.find((p) => p.name === n);
  assert.equal(pg('Patrimony').action, 'keep');
  assert.equal(pg('Picker').action, 'keep');
  assert.equal(pg('Search').action, 'fix');
  assert.equal(pg('Search').proposals[0].key, 'fix:Search:searchRow');
  assert.ok(JSON.parse(readFileSync(join(ROOT, 'design-system-engine-intent-decisions.json'), 'utf8'))['move:Picker']);
});

test('a decision keeps who made it and when, and the page is given both', () => {
  const P = proposalsFor({ ROOT, report, snap, names: ['listMain', 'tileOne', 'tileTwo', 'tabGroup'], codeFiles, facts, noPage: ['listMain/Row', 'tileTwo', 'newThing'] });
  decide(ROOT, ['add:tileTwo'], 'no', Object.fromEntries(P), { by: 'Acme Designer', now: '2026-02-03T10:00:00Z' });
  const d = readDecisions(ROOT);
  assert.deepEqual([d['add:tileTwo'].by, d['add:tileTwo'].at], ['Acme Designer', '2026-02-03T10:00:00Z']);
  const r = applyDecisions({ report, noPage: ['listMain/Row', 'tileTwo', 'newThing'], proposals: P, decisions: d });
  assert.equal(r.addProposals.tileTwo.by, 'Acme Designer');
  assert.equal(r.addProposals.tileTwo.at, '2026-02-03T10:00:00Z');
});

test('a proposal\'s answers: yes and no by default, or its own list of three or more, each with what it does', () => {
  assert.deepEqual(optionsOf({ yes: 'Kept.', no: 'Merged.' }), [{ answer: 'yes', label: 'If yes', does: 'Kept.' }, { answer: 'no', label: 'If no', does: 'Merged.' }]);
  assert.deepEqual(optionsOf({ options: [{ answer: 'Keep', does: 'Kept.' }, { answer: 'merge', label: 'Merge it', does: 'Merged.' }, { answer: 'drop', does: 'Taken out.' }] }).map((o) => [o.answer, o.label]), [['keep', 'If Keep'], ['merge', 'Merge it'], ['drop', 'If drop']]);
});

// A page whose component changed after it was written: the team says whether it still holds.
const stale = { kind: 'stale', at: '2026-03-05T10:00:00Z', since: '2026-03-01T10:00:00Z', truth: 'tileOne changed on 5 Mar 2026: props removed `dense`, after this page was last edited. The page still names `dense`.', changed: ['props removed `dense`'], gone: ['dense'] };
const staleReport = { pages: [page('Tile One', 'tileOne', { action: 'review', layer: 'components', wrong: [stale] })] };
const proposeStale = () => proposalsFor({ ROOT, report: staleReport, snap: { entities: [] }, names: ['tileOne'], codeFiles: {}, facts: {}, noPage: [] });

test('a page whose component changed asks whether it still holds; a yes is kept with who and when, and a later change asks again', () => {
  const P = proposeStale();
  const x = P.get('review:Tile One');
  assert.equal(x.kind, 'review');
  assert.equal(x.since, '2026-03-05T10:00:00Z');
  assert.match(x.proposal, /^Does Tile One's page still hold for tileOne as it is now\?$/);
  assert.deepEqual(optionsOf(x).map((o) => o.label), ['It still holds', 'It needs editing']);
  decide(ROOT, ['review:Tile One'], 'yes', Object.fromEntries(P), { by: 'QA', now: '2026-03-06T09:00:00Z' });
  const d = readDecisions(ROOT);
  assert.deepEqual([d['review:Tile One'].by, d['review:Tile One'].effect], ['QA', 'confirm']);
  assert.ok(currentAnswers(P, d)['review:Tile One'], 'a confirmation after the change answers it');
  // The component changed again after the confirmation: the old yes no longer answers it.
  const later = new Map([['review:Tile One', { ...x, since: '2026-03-08T10:00:00Z' }]]);
  assert.equal(currentAnswers(later, d)['review:Tile One'], undefined);
});

test('evidence first: each answer a proposal could take, with where its evidence comes from and how strong it is', () => {
  const P = proposalsFor({ ROOT, report, snap, names: ['listMain', 'tileOne', 'tileTwo', 'tabGroup', 'listMain/Row', 'newThing'], codeFiles, facts, noPage: ['listMain/Row', 'tileTwo', 'newThing'] });
  // A part its products also place on their own: the evidence is split.
  const usage = { 'listMain/Row': { products: [{ name: 'Acme shop', files: 3, uses: 5 }, { name: 'Northwind', files: 1, uses: 1 }], inside: ['listMain'], screens: [] } };
  const row = withEvidence('add:listMain/Row', P.get('add:listMain/Row'), { usage, decisions: {}, report });
  const yes = row.candidates.find((c) => c.answer === 'yes'), no = row.candidates.find((c) => c.answer === 'no');
  assert.deepEqual(yes.evidence.map((e) => [e.from, e.strength]), [['Figma', 'strong'], ['The code', 'strong'], ['The usage map', 'weak']]);
  assert.deepEqual(no.evidence.map((e) => [e.from, e.strength]), [['Products', 'strong']]);
  assert.match(no.evidence[0].says, /^Acme shop, Northwind use it in 4 files, on its own\.$/);
  assert.equal(row.recommends, 'yes', 'the engine\'s own answer stands');
  assert.equal(row.split, undefined);
  // A page to write that no product uses, and that the team said no to twice before.
  const past = { 'add:oldA': { answer: 'no', effect: 'write' }, 'add:oldB': { answer: 'no', effect: 'write' }, 'add:oldC': { answer: 'yes', effect: 'documented' } };
  const write = withEvidence('add:newThing', P.get('add:newThing'), { usage: { newThing: { products: [], inside: [], screens: [] } }, decisions: past, report });
  assert.deepEqual(write.candidates.find((c) => c.answer === 'no').evidence.map((e) => e.from), ['Products', 'Past decisions']);
  assert.equal(write.split, true, 'as much speaks against it as for it: a person decides');
  // A name the team kept on another page before.
  const fix = withEvidence('fix:Search:searchRow', P.get('fix:Search:searchRow'), { decisions: { 'fix:Other:searchRow': { answer: 'yes' } }, report });
  assert.ok(fix.candidates[0].evidence.some((e) => e.from === 'Past decisions' && e.strength === 'strong'));
});

test('a page to review proposes what its evidence says: a name it still writes was taken out, so it needs editing', () => {
  const x = proposeStale().get('review:Tile One');
  const [first] = candidatesFor('review:Tile One', x, {});
  assert.equal(first.answer, 'no');
  assert.match(first.evidence[0].says, /still names `dense`, which tileOne no longer has/);
  assert.equal(withEvidence('review:Tile One', x).recommends, 'no');
  const clean = { ...x, stale: { ...stale, gone: undefined, changed: ['tileOne.vue changed in the code'] } };
  assert.equal(withEvidence('review:Tile One', clean).recommends, 'yes');
});

test('what waits on a person names who it waits on, and an answer by someone else is said, never blocked', () => {
  const owners = { 'tile*': 'Tiles team', listMain: { team: 'Lists team', decides: 'QA lead' }, '*': 'Design system team' };
  const P = proposalsFor({ ROOT, report, snap, names: ['listMain', 'tileOne', 'tileTwo', 'listMain/Row', 'newThing'], codeFiles, facts, noPage: ['listMain/Row', 'tileTwo', 'newThing'] });
  const withOwner = new Map([...P].map(([k, x]) => [k, { ...x, decider: deciderFor(x, report, owners) }]));
  assert.equal(withOwner.get('fix:Search:searchRow').decider.name, 'Design system team', 'a page\'s proposal is its component\'s owner\'s');
  assert.equal(withOwner.get('add:tileTwo').decider.name, 'Tiles team');
  assert.equal(withOwner.get('add:newThing').decider.name, 'Design system team');
  const decisions = { 'add:tileTwo': { answer: 'no', by: 'Developer', at: '2026-03-01' }, 'add:newThing': { answer: 'yes', by: 'design system team', at: '2026-03-01' } };
  const r = applyDecisions({ report, noPage: ['listMain/Row', 'tileTwo', 'newThing'], proposals: withOwner, decisions });
  assert.equal(r.addProposals.tileTwo.notOwner, true, 'answered by someone else than its owner');
  assert.equal(r.addProposals.newThing.notOwner, undefined, 'the owner, however written');
  const decided = { proposals: withOwner, decisions, noPage: ['listMain/Row', 'tileTwo'], report: { pages: [{ name: 'Tile One', component: 'tileOne', layer: 'components', drafts: [{ where: 'When to use', text: 'x' }] }] }, snap: { system: { drafts: [] } } };
  const pending = pendingOf(decided, { owners });
  assert.deepEqual(pending.map((x) => [x.what, x.subject, x.decider?.name]).filter(([w, n]) => w === 'drafts' || /^(listMain\/Row|tileTwo|newThing)$/.test(n)), [['proposal', 'listMain/Row', 'QA lead'], ['drafts', 'tileOne', 'Tiles team']], 'a part is its root\'s; answered ones and pages taken off the list wait on nobody');
});

test('where each component is used is read from what the audit wrote: the catalog, else each contract', () => {
  const root = tempDir('usage-');
  mkdirSync(join(root, 'contracts'), { recursive: true });
  writeFileSync(join(root, 'contracts', 'tile-one.contract.json'), JSON.stringify({ name: 'tileOne', livesIn: { products: [{ name: 'Acme shop', files: 1, uses: 2 }] } }));
  assert.equal(usageOf(root).tileOne.products[0].name, 'Acme shop');
  writeFileSync(join(root, 'contracts', 'catalog.json'), JSON.stringify({ components: { listMain: { livesIn: { products: [] } } } }));
  assert.deepEqual(Object.keys(usageOf(root)), ['listMain']);
});

// A decision answered here whose component changed after it was recorded: asked again whether it still holds.
const change = (at, extra = {}) => ({ at, how: 'props', added: ['glow'], removed: [], log: [{ at, how: 'props', added: ['glow'], removed: [], ...extra }] });
test('a decision whose component changed after it was recorded is to review again; a yes is kept with who and when, a later change asks again', () => {
  const root = tempDir('recheck-');
  const noPage = ['listMain/Row', 'tileTwo', 'newThing'];
  const found = proposalsFor({ ROOT: root, report, snap, names: ['listMain', 'tileOne', 'tileTwo', 'listMain/Row', 'newThing'], codeFiles, facts, noPage });
  decide(root, ['add:tileTwo'], 'yes', Object.fromEntries(found), { by: 'QA', now: '2026-03-01T09:00:00Z' });
  const changed = { tileTwo: change('2026-03-05T10:00:00Z') };
  const R = rechecksFor({ found, decisions: readDecisions(root), changed, report, truth });
  const x = R.get('recheck:add:tileTwo');
  assert.equal(x.kind, 'recheck');
  assert.equal(x.page, 'Tile One', 'shown on the page that documents it');
  assert.equal(x.since, '2026-03-05T10:00:00Z');
  assert.match(x.proposal, /^Does the answer yes to "Its page is Tile One: no page of its own\." still hold for tileTwo as it is now\?$/);
  assert.equal(x.evidence[0], 'tileTwo changed on 5 Mar 2026: new props `glow`, after this decision was recorded.');
  assert.deepEqual(optionsOf(x).map((o) => o.label), ['It still holds', 'Withdraw it']);
  // The decision still stands; its page is to review, with the change said.
  const P = new Map([...found, ...R]);
  const done = applyDecisions({ report, noPage, proposals: P, decisions: currentAnswers(P, readDecisions(root)) });
  assert.ok(!done.noPage.includes('tileTwo'), 'still documented in Tile One until a person says otherwise');
  const tile = done.pages.find((p) => p.name === 'Tile One');
  assert.deepEqual([tile.action, tile.recheck], ['review', 1]);
  assert.match(tile.todo[0], /^Review a decision again: tileTwo changed on 5 Mar 2026/);
  const ev = withEvidence('recheck:add:tileTwo', x, { decisions: readDecisions(root) });
  assert.ok(ev.candidates.find((c) => c.answer === 'yes').evidence.some((e) => e.from === 'Past decisions' && /QA answered yes on 2026-03-01/.test(e.says)));
  assert.ok(ev.candidates.find((c) => c.answer === 'no').evidence.some((e) => /New props `glow`: what the decision rested on may have changed/.test(e.says)));
  // Confirmed: recorded with who and when, and not asked again until the component changes again.
  decide(root, ['recheck:add:tileTwo'], 'yes', Object.fromEntries(R), { by: 'QA lead', now: '2026-03-06T09:00:00Z' });
  const d = readDecisions(root);
  assert.deepEqual([d['recheck:add:tileTwo'].by, d['recheck:add:tileTwo'].effect], ['QA lead', 'confirm']);
  assert.equal(rechecksFor({ found, decisions: d, changed, report, truth }).size, 0);
  const again = rechecksFor({ found, decisions: d, changed: { tileTwo: { ...change('2026-03-08T10:00:00Z'), log: [...change('2026-03-05T10:00:00Z').log, ...change('2026-03-08T10:00:00Z').log] } }, report, truth }).get('recheck:add:tileTwo');
  assert.match(again.evidence[0], /changed on 8 Mar 2026: new props `glow`, after this decision was last confirmed\.$/);
  assert.equal(currentAnswers(new Map([['recheck:add:tileTwo', again]]), d)['recheck:add:tileTwo'], undefined, 'the old yes no longer answers it');
});

test('a decision withdrawn once its component changed is asked again; a kept name the page still writes is reviewed on its page', () => {
  const root = tempDir('recheck-no-');
  const noPage = ['listMain/Row', 'tileTwo', 'newThing'];
  const found = proposalsFor({ ROOT: root, report, snap, names: ['listMain', 'tileOne', 'tileTwo', 'listMain/Row', 'newThing'], codeFiles, facts, noPage });
  decide(root, ['add:tileTwo'], 'yes', Object.fromEntries(found), { now: '2026-03-01T09:00:00Z' });
  const R = rechecksFor({ found, decisions: readDecisions(root), changed: { tileTwo: change('2026-03-05T10:00:00Z') }, report, truth });
  decide(root, ['recheck:add:tileTwo'], 'no', Object.fromEntries(R), { now: '2026-03-06T09:00:00Z' });
  let d = readDecisions(root);
  assert.equal(withdrawn(d, 'add:tileTwo'), true);
  assert.equal(currentAnswers(found, d)['add:tileTwo'], undefined, 'no longer an answer');
  assert.ok(applyDecisions({ report, noPage, proposals: found, decisions: currentAnswers(found, d) }).noPage.includes('tileTwo'), 'its question is asked again');
  assert.equal(rechecksFor({ found, decisions: d, changed: { tileTwo: change('2026-03-05T10:00:00Z') }, report, truth }).size, 0, 'nothing to review: it waits for an answer');
  // Answered again: it stands.
  decide(root, ['add:tileTwo'], 'no', Object.fromEntries(found), { now: '2026-03-07T09:00:00Z' });
  d = readDecisions(root);
  assert.equal(withdrawn(d, 'add:tileTwo'), false);
  // A name kept on a page (no finding left to propose on): its page's component changed, so it is reviewed there.
  decide(root, ['fix:Search:searchRow'], 'yes', Object.fromEntries(found), { now: '2026-03-01T09:00:00Z' });
  const fix = rechecksFor({ found: new Map(), decisions: readDecisions(root), changed: { searchMain: { at: '2026-03-04T00:00:00Z', how: 'file', file: 'src/search/Search.vue', added: [], removed: [] } }, report, keptFix: new Set(['fix:Search:searchRow']), truth }).get('recheck:fix:Search:searchRow');
  assert.deepEqual([fix.page, fix.subject], ['Search', 'searchMain']);
  assert.equal(fix.evidence[0], 'Search.vue changed on 4 Mar 2026, after this decision was recorded.');
  assert.equal(withEvidence('recheck:fix:Search:searchRow', fix, { decisions: readDecisions(root) }).recommends, 'yes', 'only its code file changed');
});

// An Add answered with no page (no to writing it, or a yes to a page the layer no longer has): its recheck has no page
// row to show on, so it is kept for a row of its own; one whose answer names a page still there stays on that page.
test('a recheck of an Add answered with no page is kept for its component\'s own row', () => {
  const root = tempDir('recheck-nopage-');
  const noPage = ['listMain/Row', 'tileTwo', 'newThing'];
  const found = proposalsFor({ ROOT: root, report, snap, names: ['listMain', 'tileOne', 'tileTwo', 'listMain/Row', 'newThing'], codeFiles, facts, noPage });
  decide(root, ['add:newThing'], 'no', Object.fromEntries(found), { by: 'QA', now: '2026-03-01T09:00:00Z' });
  decide(root, ['add:tileTwo', 'add:listMain/Row'], 'yes', Object.fromEntries(found), { by: 'QA', now: '2026-03-01T09:00:00Z' });
  const changed = { newThing: change('2026-03-05T10:00:00Z'), tileTwo: change('2026-03-05T10:00:00Z'), 'listMain/Row': change('2026-03-05T10:00:00Z') };
  // The layer no longer has List Main's page: listMain/Row's answer named it.
  const shown = { pages: report.pages.filter((p) => p.name !== 'List Main') };
  const R = rechecksFor({ found, decisions: readDecisions(root), changed, report: shown, truth });
  assert.equal(R.get('recheck:add:newThing').page, undefined, 'no page of its own');
  const P = new Map([...found, ...R]);
  const done = applyDecisions({ report: shown, noPage, proposals: P, decisions: currentAnswers(P, readDecisions(root)) });
  assert.ok(!done.noPage.includes('newThing'), 'its answer stands until a person says otherwise');
  assert.deepEqual(Object.keys(done.noPageRechecks).sort(), ['listMain/Row', 'newThing']);
  const x = done.noPageRechecks.newThing;
  assert.equal(x.key, 'recheck:add:newThing');
  assert.equal(x.answer, null);
  assert.deepEqual(x.was, { answer: 'no', proposal: 'Write its page.', by: 'QA', at: '2026-03-01T09:00:00Z' });
  assert.match(x.proposal, /^Does the answer no to "Write its page\." still hold for newThing/);
  assert.equal(done.pages.find((p) => p.name === 'Tile One').recheck, 1, 'one whose page is still there is on that page');
  // Answered: no row is left.
  decide(root, ['recheck:add:newThing'], 'yes', Object.fromEntries(R), { now: '2026-03-06T09:00:00Z' });
  const again = applyDecisions({ report: shown, noPage, proposals: P, decisions: currentAnswers(P, readDecisions(root)) });
  assert.equal(again.noPageRechecks.newThing, undefined);
});

test('a change to a rule with nothing but the engine\'s own reading behind it is never recommended: No is its answer, folded away', () => {
  const guard = { kind: 'guard', subject: 'Tile', page: 'Tile', rule: 'Only one Tile per screen.', proposal: 'Hold the rule as a check: At most 1 Tile on one screen.', evidence: ['The edit check can hold it on every edit.', 'A yes writes it into contract.authored.json → guards.'], no: 'It stays a rule agents read.' };
  const bare = withEvidence('guard:Tile:1', guard, {});
  assert.deepEqual([bare.recommends, bare.quiet], ['no', true]);
  assert.ok(bare.candidates.find((c) => c.answer === 'yes').evidence.every((e) => e.from === 'The engine' && e.strength === 'weak'));
  assert.match(bare.candidates.find((c) => c.answer === 'no').evidence[0].says, /Only the engine's own reading of the rule speaks for the change/);
  // The team's own word for it, or its past yes to the same kind: recommended, as any proposal is.
  const must = withEvidence('guard:Tile:1', { ...guard, level: 'must' }, {});
  assert.deepEqual([must.recommends, must.quiet], ['yes', undefined]);
  assert.equal(withEvidence('guard:Tile:1', guard, { decisions: { 'guard:Card:2': { answer: 'yes' } } }).recommends, 'yes');
  const rewrite = withEvidence('rewrite:Tile:1', { kind: 'rewrite', subject: 'Tile', page: 'Tile', proposal: 'Rewrite it.', evidence: ['It names nothing.'] }, {});
  assert.deepEqual([rewrite.recommends, rewrite.quiet], ['no', true]);
});
