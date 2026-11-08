// The Construction page's two sides: how the system is built in Figma and in the code, and every place that breaks
// it, each with who fixes it (construction-page.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { templateText } from '../lib/styleguide-template.mjs';
import { figmaRules, familyRules, tokenRules, codeRules, constructionView } from '../lib/construction-page.mjs';

const byId = (rules, id) => rules.find((r) => r.id === id);

test('in Figma: the file\'s hygiene as rules, each with how many follow it and who fixes it', () => {
  const values = {
    cardTile: { hygiene: { raw: [], rawCount: 0, description: true } },
    chipFilter: { hygiene: { raw: [{ field: 'fill', value: '#ff0000', at: 'chipFilter/Label' }], rawCount: 1, detached: ['chipFilter/Icon'] } },
    listRow: { hygiene: { renamed: [{ at: 'listRow/Action', component: 'buttonTertiary', layer: 'Button Tertiary' }] } },
  };
  const scopes = { 'V:1': { name: 'spacing/gap/s', scopes: ['GAP'] }, 'V:2': { name: 'primitives/blue/500', scopes: ['ALL_SCOPES'] } };
  const rules = figmaRules(values, scopes);
  const bound = byId(rules, 'figma-values-bound');
  assert.equal(bound.status, 'fix');
  assert.deepEqual([bound.follows, bound.of], [2, 3]);
  assert.equal(bound.toFix[0].component, 'chipFilter');
  assert.equal(bound.side, 'figma');
  assert.equal(bound.who, 'figma');
  assert.equal(byId(rules, 'figma-not-detached').toFix[0].value, 'chipFilter/Icon is detached from its instance');
  assert.equal(byId(rules, 'figma-instance-named').toFix[0].component, 'listRow');
  assert.equal(byId(rules, 'figma-variable-scope').status, 'rule', 'nothing bound outside its scope: a rule every one follows');
  const all = byId(rules, 'figma-scoped-variables');
  assert.deepEqual([all.follows, all.of, all.toFix[0].where], [1, 2, 'primitives/blue/500']);
  assert.ok(!rules.some((r) => /auto layout|description/i.test(r.says)), 'auto layout and descriptions are the grammar\'s own rules, never twice');
  assert.deepEqual(figmaRules({}), [], 'no sweep record: nothing said');
});

test('the components of one type compared with each other: a state set two ways, one thing two names, what most have', () => {
  const v = (props) => ({ properties: props });
  const props = {
    buttonPrimary: v({ disabled: { type: 'VARIANT', variantOptions: ['false', 'true'] }, 'labelContent#1:0': { type: 'TEXT' }, 'showIcon#1:1': { type: 'BOOLEAN' } }),
    buttonSecondary: v({ disabled: { type: 'VARIANT', variantOptions: ['false', 'true'] }, 'labelContent#2:0': { type: 'TEXT' }, 'showIcon#2:1': { type: 'BOOLEAN' } }),
    buttonGhost: v({ disabled: { type: 'VARIANT', variantOptions: ['false', 'true'] }, 'labelContent#3:0': { type: 'TEXT' }, 'showIcon#3:1': { type: 'BOOLEAN' } }),
    buttonDanger: v({ state: { type: 'VARIANT', variantOptions: ['default', 'disabled'] }, 'Label#4:0': { type: 'TEXT' } }),
  };
  const rules = familyRules(props);
  assert.equal(byId(rules, 'family-states').toFix[0].component, 'buttonDanger');
  assert.equal(byId(rules, 'family-states').status, 'fix');
  assert.equal(byId(rules, 'family-names').toFix[0].component, 'buttonDanger');
  const has = byId(rules, 'family-has');
  assert.equal(has.status, 'decide', 'a component may leave out what its family has on purpose: to decide, never to fix');
  assert.equal(has.who, 'both');
  assert.deepEqual(familyRules({ chip: v({}) }), [], 'no type of three or more: nothing compared');
});

test('the tokens: named by role, layered where their value changes, brands that pin what they inherit', () => {
  const vars = {
    color: { light: { 'surface/base/color': '#fff', 'text/blue/color': '#00f', 'border/subtle/color': '#ccc' }, dark: { 'surface/base/color': '#000', 'text/blue/color': '#00f', 'border/subtle/color': '#333' } },
    aliases: {},
  };
  const todos = [{ kind: 'Same value', who: 'both', say: '2 groups of tokens hold the same value.', todo: 'Decide for each group.' }, { kind: 'Broken alias', who: 'code', say: 'in the code', todo: 'x' }];
  const brands = { brands: [] };
  const jobs = [{ var: '--border-subtle', controls: [], others: ['card'], low: [{ name: 'input' }] }];
  const rules = tokenRules({ vars, todos, brands, jobs });
  const look = byId(rules, 'tokens-named-by-role');
  assert.equal(look.toFix[0].where, 'text/blue/color');
  assert.equal(byId(rules, 'tokens-one-primitive').status, 'decide');
  assert.equal(byId(rules, 'tokens-aliases').status, 'rule', 'the code\'s broken alias is the code side\'s, never said as Figma\'s');
  const layer = byId(rules, 'tokens-first-layer');
  assert.equal(layer.status, 'decide');
  assert.match(layer.toFix[0].value, /1 token is defined the same in every mode \(text\/blue\/color\)/);
  assert.equal(byId(rules, 'tokens-control-border').toFix[0].where, '--border-subtle');
  assert.equal(byId(rules, 'tokens-one-job').status, 'decide');
  assert.ok(!byId(rules, 'tokens-unused'), 'a token no component uses yet is not said here: it is no fault, and the page is for what is to fix or to decide');
});

test('in the code: values written by hand, broken aliases, the gates that lint the code and near copies, each a developer\'s or a decision', () => {
  const census = { files: [{ file: 'src/chip.css', errors: 1, findings: [{ line: 4, level: 'error', text: 'color: #b42318 is written by hand; use --color-danger' }, { line: 9, level: 'warning', text: 'z-index: 50' }] }] };
  const records = [{ check: 'No invented CSS variables', rule: null, component: null, evidence: '--brand-glow is declared and traces to no Figma token' }, { check: 'Clean CSS', rule: 'No unused variable', component: 'chipFilter', evidence: '--chip-old is never used' }, { check: 'Token values', component: null, evidence: 'not a lint' }];
  const todos = [{ kind: 'Broken alias', who: 'code', say: '1 token in the code points at a token declared nowhere.', todo: 'Point each one at the token that replaced it.' }, { kind: 'Broken alias', who: 'figma', say: 'Figma', todo: 'y' }];
  const copies = [{ component: 'chipFilter', product: 'acme-app', file: 'src/tag.css', line: 3, cls: 'tag', same: 7, of: 8 }];
  const rules = codeRules({ census, records, todos, copies });
  assert.ok(rules.every((r) => r.side === 'code'));
  const vals = byId(rules, 'code-values-tokens');
  assert.deepEqual(vals.toFix.map((t) => t.where), ['src/chip.css:4'], 'errors only: a warning is the census\'s to say');
  assert.equal(vals.of, undefined, 'only the breaks are known: no share is said');
  assert.equal(byId(rules, 'code-aliases').toFix.length, 1, 'Figma\'s broken alias is Figma\'s side');
  assert.equal(byId(rules, 'code-variables-traced').toFix[0].value, '--brand-glow is declared and traces to no Figma token');
  assert.equal(byId(rules, 'code-clean-css').says, 'No unused variable', 'the gate\'s own rule in plain words, when its record has one');
  assert.equal(byId(rules, 'code-text-casing').status, 'rule', 'a gate whose records say nothing: a rule kept');
  assert.ok(!rules.some((r) => r.toFix.some((t) => t.value === 'not a lint')), 'a gate that compares values is not linting the code');
  const near = byId(rules, 'code-near-copies');
  assert.deepEqual([near.status, near.who], ['decide', 'both']);
  assert.match(near.toFix[0].value, /acme-app's \.tag is nearly chipFilter/);
  assert.deepEqual(codeRules(), [], 'nothing read: nothing said');
});

test('both sides in one view, the grammar\'s first; nothing on either side, no page', () => {
  const grammar = [{ id: 'auto-layout', area: 'layout', says: 'Every component lays out with auto layout', status: 'fix', follows: 3, of: 4, toFix: [{ component: 'x', value: 'y' }] }, { id: 'case', area: 'naming', says: 'c', status: 'decide', follows: 1, of: 2, toFix: [] }];
  const v = constructionView({ grammar, code: codeRules({ todos: [{ kind: 'Font written by hand', who: 'code', say: 's', todo: 't' }] }), listed: true });
  assert.deepEqual(v.rules.map((r) => r.id), ['auto-layout', 'case', 'code-font-family']);
  assert.deepEqual(v.rules.map((r) => [r.side, r.who]), [['figma', 'figma'], ['figma', 'both'], ['code', 'code']]);
  assert.equal(v.listed, true);
  assert.equal(constructionView({}), null);
});

test('the page: in the menu by default, one table whose heads sort, chips for what is left to do', () => {
  const tpl = templateText();
  const page = tpl.slice(tpl.indexOf('if (DATA.construction)'), tpl.indexOf('// Changes in Figma: each change made'));
  assert.deepEqual([...page.matchAll(/\n      \['([^']+)', function \(r\)/g)].map((m) => m[1]), ['Rule', 'Area', 'In', 'Follow it', 'Who fixes it', 'Status'], 'one head a column, each sorting by it; no To do column');
  assert.match(page, /'<th data-sort="' \+ esc\(c\[0\]\) \+ '" aria-sort="none"><button type="button" class="sg-mx-sort">' \+ esc\(c\[0\]\) \+ MX_TRI/, 'every head a button, with the mark of the column sorted by');
  assert.match(page, /sortDir = sortKey === key \? -sortDir : 1;/, 'the same head again sorts the other way round');
  assert.ok(!/data-chip-group=/.test(page), 'which side a rule is on is a column, never a chip');
  assert.ok(!/label: 'In Figma'|label: 'In the code'|label: 'Notes'/.test(page), 'which side a rule is on is a filter of its own, never a chip beside the statuses');
  assert.deepEqual([...page.matchAll(/\{ key: '(\w+)', label: '([^']+)'/g)].map((m) => [m[1], m[2]]), [['area', 'Area'], ['in', 'In'], ['status', 'Status']], 'one filter a column: its area, its side and its status');
  assert.match(page, /data-f data-f-area="' \+ esc\(AREA\[r\.area\] \|\| capital\(r\.area\)\)/, 'every row says its values to the filter');
  assert.match(page, /card\(r\.status === 'rule' \? 'Nothing to change' : 'Suggested change', suggest \+ ways \+ list \+ decide\)/, 'what is suggested, what it changes and the decision are one card, the decision under the draft');
  assert.match(page, /Hand each change back as a patch for a person to apply; change no code yourself\./, 'the code\'s change is handed back, never written over the code people wrote');
  const gen = readFileSync(new URL('../lib/styleguide-gen.mjs', import.meta.url), 'utf8');
  assert.match(gen, /const constructionShow = cfg\.styleguide\?\.construction \?\? 'listed';/, 'in the menu unless the team leaves it out');
});
