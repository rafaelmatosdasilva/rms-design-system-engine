// A parent that cancels a nested component's state (subcomponent-isolation-check.mjs): a rule that targets a DS
// component inside another and sets what its own :hover, :active or :focus changes, winning by specificity or by
// coming later, leaves the nested component with no feedback.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runGate } from './helpers.mjs';

const GATE = 'subcomponent-isolation-check.mjs';
const CFG = { paths: { themeCSS: 'theme.css' } };
const BUTTON = '.button { background: blue; }\n.button:hover { background: navy; }\n.chip { padding: 4px; }\n';

test('a chip that sets its button\'s background later, at the same specificity, cancels the hover', () => {
  const { code, out } = runGate(GATE, { 'ds-config.json': CFG, 'theme.css': BUTTON + '.chip .button { background: none; }' });
  assert.equal(code, 1, out);
  assert.match(out, /"\.chip \.button" {2}in theme\.css cancels "\.button:hover" \(background\): the same specificity, later in the cascade/, out);
});

test('a greater specificity cancels it wherever it sits; in the products\' own CSS too', () => {
  const { code, out } = runGate(GATE, { 'ds-config.json': { paths: { themeCSS: 'theme.css', pluginCSS: ['app.css'] } }, 'theme.css': BUTTON,
    'app.css': '.chip .button.close { background-color: transparent; }' });
  assert.equal(code, 1, out);
  assert.match(out, /"\.chip \.button\.close" {2}in app\.css cancels "\.button:hover" \(background\): a greater specificity/, out);
});

test('no case: placed before the state, sets something the state does not, is a state rule itself, or documented', () => {
  for (const css of ['.chip .button { background: none; }\n' + BUTTON, BUTTON + '.chip .button { margin: 0; }', BUTTON + '.chip .button:hover { background: teal; }']) {
    const { out } = runGate(GATE, { 'ds-config.json': CFG, 'theme.css': css });
    assert.match(out, /No parent rule wins over a nested component's hover, press or focus/, css);
  }
  const { code, out } = runGate(GATE, { 'ds-config.json': CFG, 'theme.css': BUTTON + '.chip .button { background: none; }',
    'structure-contract.mjs': 'export const ALLOWED_STATE_CANCELS = { ".chip .button": "The close button is drawn flat on purpose." };' });
  assert.equal(code, 0, out);
  assert.match(out, /DOCUMENTED {2}1 {2}\(kept on purpose\)/, out);
});
