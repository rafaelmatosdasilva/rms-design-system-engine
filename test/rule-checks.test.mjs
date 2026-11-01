// rule-checks.mjs - every rule on an intent-layer page said as what holds it: checked (a check the engine runs, named),
// checkable (the guard the edit check would hold it with, proposed for a yes or no), or judgment (a person), and a vague
// one rewritten as a sentence a reviewer can check. The same rules written in English and in Portuguese are read alike.
// An invented system (Acme): Tile, Button, Card.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { ruleContext, classifyRule, rewriteOf, pageRules, layerRules, ruleProposals, ruleTotals, ruleReport, markedRules, ruleKey } from '../rule-checks.mjs';
import { withGuard, guardsOf, guardFindings } from '../lessons.mjs';
import { editCheck } from '../edit-check.mjs';
import { entityView } from '../intent-layer.mjs';
import { tempDir } from './helpers.mjs';
const ENGINE = fileURLToPath(new URL('..', import.meta.url));

const COMPONENTS = {
  Tile: { props: { tone: { options: ['calm', 'loud'] }, title: { type: 'string' }, dense: { type: 'boolean' } }, slots: ['header'] },
  Button: { props: { variant: { options: ['primary', 'secondary'] }, label: { type: 'string' } } },
  Card: { props: {} },
};
const CTX = (more = {}) => ruleContext({ components: COMPONENTS, tokens: ['--acme-tile-bg', '--acme-surface'], imports: { replaced: { 'old-kit': '@acme/ui' } }, ...more });
const ENTITY = { whenToUse: ['To group related content.'], purpose: ['A tile groups related content.'] };
const on = (text, component = 'Tile', ctx = CTX()) => classifyRule(text, { component, entity: ENTITY }, ctx);

// Each rule twice, in English and in Portuguese, with what the two must become: the same status and the same guard.
const PAIRS = [
  ['Never put a Button inside a Tile.', 'Nunca coloques um Button dentro de um Tile.', 'checkable', { kind: 'pairing', parent: 'Tile', child: 'Button' }],
  ['A Tile never contains a Button.', 'O Tile nunca contém um Button.', 'checkable', { kind: 'pairing', parent: 'Tile', child: 'Button' }],
  ['Only one primary Button per screen.', 'Apenas um Button primary por ecrã.', 'checkable', { kind: 'max', component: 'Button', props: { variant: 'primary' }, max: 1 }],
  ['Never use the `loud` tone on Tile.', 'Nunca uses o tom `loud` no Tile.', 'checkable', { kind: 'props', component: 'Tile', props: { tone: 'loud' } }],
  ['Tile must always have a `title`.', 'O Tile deve ter sempre um `title`.', 'checkable', { kind: 'requires', component: 'Tile', prop: 'title' }],
  ['Never use a Tile without its header.', 'Nunca uses um Tile sem o seu header.', 'checkable', { kind: 'requires', component: 'Tile', slot: 'header' }],
  ['Use `--acme-tile-bg`, not `--acme-surface`.', 'Nunca uses `--acme-surface` no Tile; usa `--acme-tile-bg`.', 'checkable', { kind: 'value', value: '--acme-surface', use: '--acme-tile-bg', component: 'Tile' }],
  ['Import from `@acme/ui` instead of `legacy-kit`.', 'Importa de `@acme/ui` em vez de `legacy-kit`.', 'checkable', { kind: 'import', from: 'legacy-kit', to: '@acme/ui' }],
  ['Never use `tone="bright"`.', 'Nunca uses `tone="bright"`.', 'checked', null],
  ['Import from `@acme/ui`, never from `old-kit`.', 'Importa de `@acme/ui`, nunca de `old-kit`.', 'checked', null],
  ['Never hard-code colours: use the colour tokens.', 'Nunca escrevas cores à mão: usa os tokens de cor.', 'checked', null],
  ['Every image has alt text.', 'Todas as imagens têm sempre texto alternativo.', 'checked', null],
  ['Use Tile when content belongs together.', 'Usa o Tile quando o conteúdo é do mesmo grupo.', 'judgment', null],
  ['Use it appropriately.', 'Usa-o de forma adequada.', 'judgment', null],
];

test('each rule is checked, checkable or judgment, the same in English and in Portuguese', () => {
  for (const [en, pt, status, guard] of PAIRS) {
    const a = on(en), b = on(pt);
    assert.equal(a.status, status, en);
    assert.equal(b.status, status, pt);
    if (guard) { assert.deepEqual(a.guard, guard, en); assert.deepEqual(b.guard, guard, pt); assert.ok(a.proposal.place, en); }
  }
  // How many of each the fixtures hit, each language alike.
  const count = (lang) => PAIRS.reduce((t, p) => { const s = on(p[lang]).status; t[s] = (t[s] ?? 0) + 1; return t; }, {});
  assert.deepEqual(count(0), { checkable: 8, checked: 4, judgment: 2 });
  assert.deepEqual(count(1), count(0));
});

test('a checked rule names the check that holds it', () => {
  assert.match(on('Never use `tone="bright"`.').check, /prop values: `tone` takes `calm`, `loud`, so `bright` is flagged/);
  assert.match(on('Never hard-code colours: use the colour tokens.').check, /colour written by hand/);
  assert.match(on('Never write spacing in px: use the spacing tokens.').check, /size written by hand/);
  assert.match(on('Import from `@acme/ui`, never from `old-kit`.').check, /imports \(ds-config\.json → imports\.replaced\)/);
  assert.match(on('Every image has alt text.').check, /static accessibility check/);
  assert.equal(on('Every image has alt text.', 'Tile', CTX({ a11yStatic: false })).status, 'judgment', 'the static accessibility check turned off holds nothing');
  // The catalog's nesting rules: one it must never contain, or one outside what it holds.
  const catalog = { components: { Tile: { neverCombineWith: ['Card'] }, Card: { children: ['Tile'] } } };
  assert.match(on('Never put a Card inside a Tile.', 'Tile', CTX({ catalog })).check, /nesting rules .*Tile\.neverCombineWith/);
  assert.match(on('Never put a Button inside a Card.', 'Card', CTX({ catalog })).check, /the catalog: Card holds only Tile/);
});

test('a guard a yes wrote makes its rule checked, linked to the guard; with the edit check off it stays checkable', () => {
  const rule = 'Tile must always have a `title`.', key = ruleKey('guard', 'Tile', rule);
  const { authored } = withGuard(on(rule).guard, { authored: {}, id: key, rule });
  assert.deepEqual(authored.guards, [{ key, rule, kind: 'requires', component: 'Tile', prop: 'title' }]);
  const held = on(rule, 'Tile', CTX({ authored }));
  assert.equal(held.status, 'checked');
  assert.match(held.check, new RegExp(`the guard in contract\\.authored\\.json \\(${key}\\)`));
  const off = on(rule, 'Tile', CTX({ authored, editCheck: false }));
  assert.equal(off.status, 'checkable');
  assert.match(off.check, /turned off: ds-config\.json → editCheck/);
  // A pairing goes where the nesting rules read it.
  const pair = withGuard(on('Never put a Button inside a Tile.').guard, { authored: {}, id: 'guard:Tile:x', rule: 'Never put a Button inside a Tile.' }).authored;
  assert.deepEqual(pair.components.Tile.neverCombineWith, ['Button']);
  assert.equal(on('Never put a Button inside a Tile.', 'Tile', CTX({ authored: pair })).status, 'checked');
});

test('a vague rule is rewritten as one sentence a reviewer can check, in its own language', () => {
  const ctx = CTX();
  assert.equal(on('Use it appropriately.').rewrite, 'Use Tile only to group related content.');
  assert.equal(on('Use Tiles sparingly.').rewrite, 'Use at most one Tile per screen.');
  assert.equal(on('Keep tiles consistent.').rewrite, 'Every Tile on one screen takes the same `tone`.');
  assert.equal(on('Make it accessible.').rewrite, 'Tile always has an accessible name: its visible text, or `aria-label` when it shows none.');
  assert.equal(on('Keep the text clear.').rewrite, 'Tile\'s `title` says what it does in three words at most, starting with a verb.');
  assert.equal(on('Usa o Tile com moderação.').rewrite, 'Use no máximo um Tile por ecrã.');
  assert.equal(on('Mantém os Tiles coerentes.').rewrite, 'Todos os Tile de um ecrã têm o mesmo `tone`.');
  assert.equal(on('Usa-o de forma adequada.', 'Tile', ctx).vague, true);
  // The rewrite of "sparingly" is itself a rule a check can hold.
  assert.equal(on(on('Use Tiles sparingly.').rewrite).status, 'checkable');
  // A rule that names a component, a prop or a value is not vague, however loosely it is written.
  for (const t of ['Use Tile when content belongs together.', 'Use the loud tone appropriately.', 'Put Button inside Tile appropriately.']) assert.notEqual(on(t).vague, true, t);
  assert.equal(rewriteOf('Use it appropriately.', { component: 'Tile', entity: {} }, ctx), null, 'nothing on the page to write it from');
});

// A page of the layer, as the DSDS reader gives it.
const page = (name, rules, extra = {}) => ({ kind: 'component', layer: 'components', name, file: `components/${name}.dsds.json`, purpose: [], whenToUse: ['To group related content.'], whenNotToUse: [], mistakes: [], limitations: [], rules: rules.map((text) => ({ text, level: null })), sections: [], ...extra });

test('a page counts its rules by what holds them, and each one a check could hold or a rewrite could fix is proposed', () => {
  const en = page('Tile', PAIRS.map((p) => p[0]));
  const pt = page('Tile PT', PAIRS.map((p) => p[1]));
  const drafted = page('Card', ['**Draft (A review, 2026-10-30):** Card holds one Tile.', 'Never put a Card inside another Card.']);
  drafted.rules[0].draftOf = 'Rules';
  const byPage = layerRules({ entities: [en, drafted] }, new Map([['Tile', en], ['Card', drafted]]), CTX(), { decisions: {} });
  const r = byPage.get(en), p = pageRules(pt, 'Tile', CTX());
  assert.deepEqual([r.n, r.checked, r.checkable, r.judgment, r.vague], [14, 4, 8, 2, 1]);
  assert.deepEqual([p.n, p.checked, p.checkable, p.judgment, p.vague], [14, 4, 8, 2, 1], 'the same rules in Portuguese');
  byPage.set(pt, p);
  assert.equal(byPage.get(drafted).n, 1, 'a draft is not a rule yet');
  assert.deepEqual(ruleTotals(byPage), { pages: 3, n: 29, checked: 8, checkable: 17, judgment: 4, vague: 2 });
  const P = ruleProposals(byPage);
  const guards = [...P.keys()].filter((k) => k.startsWith('guard:Tile:'));
  assert.equal(guards.length, 8);
  const g = P.get(ruleKey('guard', 'Tile', 'Never put a Button inside a Tile.'));
  assert.equal(g.kind, 'guard');
  assert.equal(g.page, 'Tile');
  assert.match(g.proposal, /^Hold the rule “Never put a Button inside a Tile” as a check: Tile never contains Button\.$/);
  assert.match(g.yes, /contract\.authored\.json → Tile\.neverCombineWith/);
  const rw = P.get(ruleKey('rewrite', 'Tile', 'Use it appropriately.'));
  assert.equal(rw.rewrite, 'Use Tile only to group related content.');
  // A no is kept: the rule stays checkable, its proposal answered.
  const key = ruleKey('guard', 'Tile', 'Tile must always have a `title`.');
  const again = pageRules(en, 'Tile', CTX(), { decisions: { [key]: { answer: 'no', by: 'QA', at: '2026-10-31' } } });
  const kept = again.rules.find((x) => x.key === key);
  assert.deepEqual([kept.status, kept.answer, kept.answered.by], ['checkable', 'no', 'QA']);
  // --check-intent says it.
  const lines = ruleReport(byPage).join('\n');
  assert.match(lines, /^📏 Rules: 29 on 3 pages · 8 checked · 17 checkable · 4 judgment \(2 vague\)/);
  assert.match(lines, /Tile \(components\/Tile\.dsds\.json\): 14 rules · 4 checked · 8 checkable · 2 judgment \(1 vague\)/);
  assert.match(lines, /◇ "Tile must always have a `title`\."\n {8}checkable as Tile always has `title`\. {2}\[guard:Tile:[0-9a-f]{8}\]/);
  assert.match(lines, /vague: rewrite as "Use Tile only to group related content\."/);
});

test('a contract gives each rule with its status: checked and checkable are constraints an agent is held to', () => {
  const m = markedRules(['Never put a Button inside a Tile.', 'Never use `tone="bright"`.', 'Use Tile when content belongs together.'], 'Tile', CTX());
  assert.deepEqual(m.map((r) => r.status), ['checkable', 'checked', 'judgment']);
  assert.equal(m[0].guard, 'Tile never contains Button.');
  assert.match(m[1].check, /prop values/);
});

test('the guards the rules become are held by the edit check: a prop or slot always there, at most one on a screen', () => {
  const rule = (t) => ({ ...on(t).guard, page: 'Tile' });
  let authored = {};
  for (const t of ['Tile must always have a `title`.', 'Never use a Tile without its header.', 'Only one primary Button per screen.', 'Never use the `loud` tone on Tile.']) authored = withGuard(rule(t), { authored, id: ruleKey('guard', 'Tile', t), rule: t }).authored;
  const guards = guardsOf(authored);
  assert.equal(guards.length, 4);
  const file = ['<Tile tone="calm">', '  <template #header>Hi</template>', '</Tile>', '<Tile title="A" tone="loud"><template #header>x</template></Tile>', '<Tile title="B" />', '<Button variant="primary" />', '<Button variant="primary">Save</Button>', '<Button variant="secondary" />'].join('\n');
  const found = guardFindings(file, new Set([1, 2, 3, 4, 5, 6, 7, 8]), guards);
  const said = found.map((f) => `${f.line} ${f.text.split(':')[0]}`);
  assert.deepEqual(said, ['1 Tile without `title`', '5 Tile without its header slot', '6 2 Button with variant="primary" on one screen', '4 Tile with tone="loud" is what a rule of the team rules out (the team\'s rule']);
  assert.ok(found.every((f) => f.rule && f.rule.startsWith('guard:Tile:')), 'each finding links its rule');
  assert.match(found[0].text, /a rule of the team says it always has it \("Tile must always have a `title`"\); set title/);
  // Props passed on unnamed are not read as missing; a tag the edit did not touch is not this edit's.
  assert.deepEqual(guardFindings('<Tile {...rest} />', new Set([1]), guards), []);
  assert.deepEqual(guardFindings('<Tile tone="calm" />', new Set([2]), guards), []);
  // Through the hook: written into the authored contract, the next edit is checked against it.
  const dir = tempDir('rule-guards-');
  writeFileSync(join(dir, 'contract.authored.json'), JSON.stringify(authored));
  mkdirSync(join(dir, 'src'), { recursive: true });
  writeFileSync(join(dir, 'src', 'Page.vue'), '<template>\n  <Tile tone="calm" />\n</template>\n');
  const r = editCheck({ tool_name: 'Write', tool_input: { file_path: join(dir, 'src', 'Page.vue'), content: '<template>\n  <Tile tone="calm" />\n</template>\n' } }, { root: dir, cfg: {}, headOf: () => null });
  assert.match(r, /Tile without `title`: a rule of the team says it always has it/);
  assert.match(r, /What a rule of the team rules out was written on its page and held as a check by a person's yes/);
});

// A project with an intent layer read into its snapshot: --check-intent says each page's rules, --intent-decide writes
// the guard a yes asks for, and the rule is checked from then on.
function project(rules) {
  const root = tempDir('rule-cli-');
  writeFileSync(join(root, 'ds-config.json'), JSON.stringify({ name: 'Acme', intentLayer: './docs/' }));
  mkdirSync(join(root, '.design-system-engine-out'), { recursive: true });
  writeFileSync(join(root, '.design-system-engine-out', 'code.snapshot.json'), JSON.stringify({ api: { Tile: { file: 'src/Tile.vue', props: { tone: { type: 'string', options: ['calm', 'loud'] }, title: { type: 'string' } }, slots: { named: ['header'] } }, Button: { file: 'src/Button.vue', props: { variant: { type: 'string', options: ['primary', 'secondary'] } } } }, tokens: {} }));
  mkdirSync(join(root, 'src')); writeFileSync(join(root, 'src', 'Tile.vue'), '<template><div class="tile"><slot name="header" /></div></template>'); writeFileSync(join(root, 'src', 'Button.vue'), '<template><button /></template>');
  mkdirSync(join(root, 'docs'));
  const entity = { kind: 'component', id: 'component-tile', name: 'Tile', sections: [{ kind: 'guidelines', title: 'When to use', items: [{ statement: 'To group related content.' }] }, { kind: 'guidelines', title: 'Rules', items: rules.map((statement) => ({ statement })) }] };
  writeFileSync(join(root, 'intent-layer.snapshot.json'), JSON.stringify({ _source: { id: 'dsds', label: 'the intent layer', url: 'docs', sha: 'abc' }, entities: [entityView(entity, 'docs/components/tile.dsds.json', 'components')] }));
  return root;
}
const run = (root, ...args) => spawnSync(process.execPath, [join(ENGINE, 'audit.mjs'), ...args], { cwd: root, encoding: 'utf8' });

test('--check-intent says each page\'s rules; a yes writes the guard and the rule is checked from then on; a no is kept', () => {
  const root = project(['Never put a Button inside a Tile.', 'Nunca uses o tom `loud` no Tile.', 'Use it appropriately.', 'Use Tile when content belongs together.']);
  const first = run(root, '--check-intent');
  assert.equal(first.status, 0, first.stdout + first.stderr);
  assert.match(first.stdout, /📏 Rules: 4 on 1 page · 0 checked · 2 checkable · 2 judgment \(1 vague\)/);
  assert.match(first.stdout, /NEXT: ask the person yes or no to each guard and rewrite the rules propose \(--intent-decide "<key>" yes\|no\)/);
  const pair = ruleKey('guard', 'Tile', 'Never put a Button inside a Tile.');
  const yes = run(root, '--intent-decide', pair, 'yes');
  assert.equal(yes.status, 0, yes.stdout + yes.stderr);
  assert.match(yes.stdout, /written into contract\.authored\.json → Tile\.neverCombineWith: the edit check holds "Never put a Button inside a Tile\." from the next edit/);
  assert.deepEqual(JSON.parse(readFileSync(join(root, 'contract.authored.json'), 'utf8')).components.Tile.neverCombineWith, ['Button']);
  const tone = ruleKey('guard', 'Tile', 'Nunca uses o tom `loud` no Tile.');
  const no = run(root, '--intent-decide', tone, 'no');
  assert.equal(no.status, 0, no.stdout + no.stderr);
  assert.equal(JSON.parse(readFileSync(join(root, 'design-system-engine-intent-decisions.json'), 'utf8'))[tone].answer, 'no');
  const rw = run(root, '--intent-decide', ruleKey('rewrite', 'Tile', 'Use it appropriately.'), 'yes');
  assert.match(rw.stdout, /NEXT: draft the rewrite on its page for the team to review: rms-design-system-engine --draft 'Tile' 'Rules' 'Use Tile only to group related content\.' --task 'Rule rewrite'/);
  const after = run(root, '--check-intent');
  assert.match(after.stdout, /📏 Rules: 4 on 1 page · 1 checked · 1 checkable · 2 judgment \(1 vague\)/);
  assert.match(after.stdout, /checked by the edit check's nesting rules/);
  assert.match(after.stdout, /checkable as Tile never takes tone="loud"\. \(declined\)/);
  assert.match(after.stdout, /NEXT: none/, 'nothing left to ask');
});

test('the Documentation page shows each page\'s rules in a card of their own', () => {
  const tpl = readFileSync(join(ENGINE, 'templates', 'styleguide.template.html'), 'utf8');
  assert.match(tpl, /card\('Rules', ilRules\(p\)\)/);
  assert.match(tpl, /' checked, ' \+ r\.checkable \+ ' checkable, ' \+ r\.judgment \+ ' judgment'/);
});
