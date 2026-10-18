// Selectors read the way the browser reads them: a list split at its own commas only (never inside :not(.a, .b)), and
// a state the contract writes with what a screen reader hears ([aria-disabled="true"], [role="alert"]) built by a rule
// for the rest of it. A real system's gates 12, 13 and 14 failed on exactly these.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { splitSelectors, withoutHeardState } from '../selector-list.mjs';
import { runGate } from './helpers.mjs';

test('a selector list is split at its own commas, never inside :not(), :is() or an attribute value', () => {
  assert.deepEqual(splitSelectors('.row:not(.selected, .no-button):hover .act svg, .row.hovered .act svg'), ['.row:not(.selected, .no-button):hover .act svg', '.row.hovered .act svg']);
  assert.deepEqual(splitSelectors('.a:is(.b, .c) > .d, [data-x="1,2"]'), ['.a:is(.b, .c) > .d', '[data-x="1,2"]']);
  assert.deepEqual(splitSelectors('.only'), ['.only']);
});

test('a state without what a screen reader hears is what the CSS styles; other attributes stay', () => {
  assert.equal(withoutHeardState('.node.node-disabled[aria-disabled="true"]'), '.node.node-disabled');
  assert.equal(withoutHeardState('.toast.toast-error[role="alert"]'), '.toast.toast-error');
  assert.equal(withoutHeardState('.seg button.selected[aria-checked="true"]'), '.seg button.selected');
  assert.equal(withoutHeardState('.chip[data-size="l"]'), '.chip[data-size="l"]');
  assert.equal(withoutHeardState('.tab[aria-selected]'), '.tab');
});

const CONTRACT = `export const CONTRACT = {
  node: { propertyMap: { State: { Default: '.node', Disabled: '.node.node-disabled[aria-disabled="true"]' }, Selected: { True: '.node.node-selected[aria-pressed="true"]' } } },
  chip: { propertyMap: { Size: { L: '.chip.chip--l[data-size="l"]' } } },
};
export const ALLOWED_BROAD_RULES = { '.row:not(.selected, .no-button):hover .act svg': 'LEAF — the action is its own component' };
`;
const THEME = `.node { color: red; }
.node.node-disabled { opacity: .5; }
.node.node-selected { outline: 1px solid; }
.chip.chip--l { height: 32px; }
.row:not(.selected, .no-button):hover .act svg { color: blue; }
`;

test('Gate [14]: a state written with its heard attribute is built by the rule for its classes; another attribute is still asked for', () => {
  const { out } = runGate('state-binding-check.mjs', { 'ds-config.json': { paths: { themeCSS: 'theme.css' } }, 'theme.css': THEME, 'structure-contract.mjs': CONTRACT });
  assert.match(out, /COVERED\s+3\s/, out);
  assert.match(out, /MISSING\s+1\s/, out);
  assert.match(out, /chip\.Size\.L/, 'a data attribute the CSS would style is still asked for');
  assert.doesNotMatch(out, /node\.State\.Disabled|node\.Selected\.True/, out);
});

test('Gate [12]: a rule with :not(.a, .b) is read whole and matched with the reason recorded for it', () => {
  const { out } = runGate('subcomponent-isolation-check.mjs', { 'ds-config.json': { paths: { themeCSS: 'theme.css' } }, 'theme.css': THEME, 'structure-contract.mjs': CONTRACT });
  assert.match(out, /✅ DOCUMENTED\s+1\s[\s\S]*✅ \.row:not\(\.selected, \.no-button\):hover \.act svg\n/, 'read whole, with its reason: ' + out);
  assert.doesNotMatch(out, /UNDOCUMENTED\s+[1-9]/, out);
});
