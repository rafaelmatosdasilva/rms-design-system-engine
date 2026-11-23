// What the intent layer's DSDS reader keeps of how a page is written: who each section is for (for: agent stays off the
// pages people read), where the page came from (origin, reviewed), and each dsds: link (written as words, and a link to
// nothing said as a finding with its page). And what a review of drafts writes back: the page as written with help, and
// the review with who made it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { readDsds, plainLinks, linksOf, originOf, unreviewed, derivedId, READER } from '../lib/doc-source-dsds.mjs';
import { componentIntent, UNREVIEWED } from '../lib/intent-layer.mjs';
import { linkFindings, KINDS, report } from '../lib/intent-truth.mjs';
import { markReviewed, reviewPlan } from '../lib/intent-changes.mjs';
import { validate } from '../lib/json-schema.mjs';
import { DSDS_TRIED } from '../lib/contract-dsds.mjs';
import { fixtureDir } from '../lib/dsds-release.mjs';

const INDEX = 'docs/system.dsds.json', BUTTON = 'docs/components/button.dsds.json', CARD = 'docs/components/card.dsds.json';
const layer = () => new Map([
  [INDEX, { schemaVersion: '0.23.1', name: 'Acme', entries: [{ kind: 'system', id: 'acme', name: 'Acme', description: 'The Acme system.' }],
    shared: [{ id: 'shared-a11y', name: 'Shared accessibility', description: 'Rules every control follows.', sections: [{ kind: 'guidelines', for: 'all', items: [{ id: 'focus-visible', statement: 'Focus is always visible.', level: 'must' }] }] }],
    refs: [{ href: 'components/button.dsds.json', rel: 'file' }, { href: 'components/card.dsds.json', rel: 'file' }] }],
  [BUTTON, { kind: 'component', id: 'button', name: 'Button', description: 'Triggers an action. For navigation use <dsds:link-inline>.',
    metadata: { origin: { method: 'generated', author: 'generated' } },
    traits: [{ traitType: 'variant', kind: 'enum', id: 'variant', description: 'Its look.', values: [{ id: 'primary', description: 'The main one.' }] }],
    sections: [
      { kind: 'guidelines', for: 'all', title: 'When to use', items: [{ statement: 'Use for the main action, as [focus visible](dsds:shared-a11y#focus-visible) asks.', level: 'should' }] },
      { kind: 'guidelines', for: 'agent', title: 'When to use', items: [{ statement: 'Prefer it over a div with a click handler.', level: 'should' }] },
      { kind: 'guidelines', for: 'agent', title: 'Rules', items: [{ statement: 'Always import Button from the package root.', level: 'must' }] },
      { kind: 'guidelines', for: 'human', title: 'Rules', items: [{ statement: 'Write labels in sentence case.', level: 'should' }] },
      { kind: 'section', for: 'agent', freeform: [{ title: 'Implementation notes', body: 'Wrap it in a form to submit.' }] },
      { kind: 'guidelines', for: 'all', title: 'Rules', items: [
        { statement: 'Pair it with [a card](dsds:card), never [the old one](dsds:button-legacy).', level: 'should' },
        { statement: 'Use the [primary variant](dsds:button#variant.primary) once a view, never the [ghost one](dsds:button#variant.ghost).', level: 'must' },
        { statement: '**Draft:** Put it last in a form.', level: 'should' },
      ] },
    ] }],
  [CARD, { kind: 'component', id: 'card', name: 'Card', description: 'Holds related content.',
    metadata: { origin: { author: 'generated' }, reviewed: [{ date: '2026-11-20', by: 'human:QA' }] } }],
]);
const read = () => readDsds(layer(), INDEX);
const byName = (snap, n) => snap.entities.find((e) => e.name === n);

test('a section written for agents alone reaches agents and stays off the pages people read; one for people reaches both', () => {
  const button = byName(read(), 'Button');
  const agents = componentIntent(button, {}, []), people = componentIntent(button, {}, [], { for: 'people' });
  assert.ok(agents.whenToUse.includes('Prefer it over a div with a click handler.'));
  assert.ok(!(people.whenToUse ?? []).includes('Prefer it over a div with a click handler.'), 'a line for agents alone');
  assert.ok(people.whenToUse.some((l) => /^Use for the main action/.test(l)), 'a line for all stays');
  const rule = (r, t) => r.some((x) => x.startsWith(t));
  assert.ok(rule(agents.rules, 'Always import Button') && !rule(people.rules, 'Always import Button'), 'a rule for agents alone');
  assert.ok(rule(agents.rules, 'Implementation notes: Wrap it in a form') && !rule(people.rules, 'Implementation notes'), 'its prose too');
  assert.ok(rule(agents.rules, 'Write labels in sentence case') && rule(people.rules, 'Write labels in sentence case'), 'for people: an agent reads everything, as DSDS says');
});

test('a dsds: link is written as words: its own, or the name of what it names', () => {
  const button = byName(read(), 'Button');
  assert.equal(button.purpose.at(-1), 'Triggers an action. For navigation use link-inline.', '<dsds:…> to nothing: its id');
  assert.ok(button.whenToUse.includes('Use for the main action, as focus visible asks.'));
  assert.ok(button.rules.some((r) => r.text === 'Pair it with a card, never the old one.'));
  assert.equal(plainLinks('See <dsds:card> and <dsds:shared-a11y#focus-visible>.', (id) => ({ card: 'Card', 'shared-a11y': 'Shared accessibility' }[id])), 'See Card and Shared accessibility focus visible.');
  assert.equal(plainLinks('No link here.'), 'No link here.');
  assert.doesNotMatch(JSON.stringify(read().entities), /dsds:/, 'no link reaches an agent or a page as a link');
});

test('a dsds: link to something the layer no longer has is a finding with its page and where it is', () => {
  const snap = read(), button = byName(snap, 'Button');
  assert.deepEqual(button.links.map((l) => [l.to, l.where]), [
    ['link-inline', 'Description'], ['shared-a11y#focus-visible', 'When to use'], ['card', 'Rules'], ['button-legacy', 'Rules'], ['button#variant.primary', 'Rules'], ['button#variant.ghost', 'Rules'],
  ]);
  const f = linkFindings(button, snap);
  assert.deepEqual(f.map((x) => x.says), ['dsds:link-inline', 'dsds:button-legacy', 'dsds:button#variant.ghost'], 'an entry gone, and a part gone: a shared rule, a page and a value it has are fine');
  assert.ok(f.every((x) => x.kind === 'link'));
  assert.match(f[1].truth, /No page of the layer is `button-legacy`\. It was renamed or deleted/);
  assert.match(f[2].truth, /Button has no `variant\.ghost`/);
  assert.equal(f[1].line, 'the old one', 'the link\'s own words');
  assert.equal(KINDS.link, 'Links to nothing');
  assert.match(report([['Button', f]]).text, /✗ Links to nothing: Rules · "the old one"/);
  for (const x of f) assert.doesNotMatch(`${x.truth} ${x.fix}`, /;/, 'never a semicolon');
  assert.deepEqual(linkFindings(byName(snap, 'Card'), snap), [], 'a page with no links');
  assert.equal(derivedId('Focus is always visible.'), 'focus-is-always-visible', 'an item with no id is named by its words, as DSDS does');
});

test('where a page came from: a page a tool wrote that nobody reviewed is weighed below one a person stands behind', () => {
  const snap = read();
  const button = byName(snap, 'Button'), card = byName(snap, 'Card');
  assert.deepEqual(button.origin, { author: 'generated', method: 'generated', reviewed: [] });
  assert.equal(unreviewed(button.origin), true);
  assert.equal(componentIntent(button, {}, []).weigh, UNREVIEWED, 'agents are told');
  assert.equal(componentIntent(button, {}, [], { for: 'people' }).weigh, undefined, 'a note for agents, not for the page');
  assert.deepEqual(card.origin.reviewed, [{ by: 'human:QA', date: '2026-11-20' }]);
  assert.equal(componentIntent(card, {}, []).weigh, undefined, 'reviewed by a person');
  assert.equal(originOf({}), null, 'nothing said: a person wrote it');
  assert.equal(byName(snap, 'Button').drafts[0].text, 'Put it last in a form.', 'a draft is still set apart');
  assert.ok(READER >= 23, 'snapshots read by an older reader are read again');
  assert.ok(linksOf({}).length === 0);
});

test('approving a draft marks the page written with help, with the review and who made it, in DSDS\'s own terms', () => {
  const files = new Map([...layer()].map(([f, d]) => [f, JSON.stringify(d, null, 2) + '\n']));
  const snap = read();
  const { files: out } = reviewPlan(snap, [{ page: 'Button', do: 'approve' }], files, { by: 'QA', at: '2026-11-23' });
  const page = JSON.parse(out.get(BUTTON));
  assert.ok(page.sections.at(-1).items.some((i) => i.statement === 'Put it last in a form.'), 'the draft is the page\'s now');
  assert.deepEqual(page.metadata.origin, { method: 'generated', author: 'generated' }, 'a page a tool wrote stays generated');
  assert.deepEqual(page.metadata.reviewed, [{ date: '2026-11-23', by: 'human:QA', note: 'Drafted lines approved or rewritten by a person.' }]);
  // A page a person wrote becomes written with help, and the same review once only.
  const own = markReviewed(markReviewed({ kind: 'component', id: 'x', name: 'X', description: 'Y.' }, { by: 'QA', at: '2026-11-23' }), { by: 'QA', at: '2026-11-23' });
  assert.equal(own.metadata.origin.author, 'assisted');
  assert.equal(own.metadata.reviewed.length, 1);
  // A dropped draft is no review of the page.
  assert.equal(reviewPlan(read(), [{ page: 'Button', do: 'drop' }], files, { by: 'QA', at: '2026-11-23' }).files.get(BUTTON).includes('reviewed'), false);
  // DSDS's own schema takes the page as written, in each version the engine writes.
  for (const v of DSDS_TRIED) {
    const schema = JSON.parse(readFileSync(join(fixtureDir(v), 'dsds.bundled.schema.json'), 'utf8'));
    const doc = { schemaVersion: v, name: 'Acme', entries: [{ ...page, sections: page.sections }, own] };
    assert.deepEqual(validate(schema, doc).errors.map((e) => `${e.at} ${e.message}`), [], v);
  }
});
