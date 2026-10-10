// behaviour-contract.mjs: part roles and behaviours as contracts, checked in the browser (I85, I92).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { makeFixture } from './helpers.mjs';
import { findChrome } from '../cdp.mjs';
import { partRoleOf, partRolesOf, behavioursFor, annotatedBehaviours, behaviourSheetLines, partSheetLines } from '../behaviour-contract.mjs';
import { annotationFacts } from '../a11y-check.mjs';

const ENGINE = dirname(dirname(fileURLToPath(import.meta.url)));
const CHROME = findChrome({ playwright: true });
const HAS_CHROME = !!CHROME && typeof WebSocket !== 'undefined';

test('part roles are read from the inner layers\' annotations, in Specs\' words and their common names', () => {
  assert.equal(partRoleOf('Error message'), 'errormessage');
  assert.equal(partRoleOf('helper text'), 'description');
  assert.equal(partRoleOf('button'), null, 'a control role is not a part role');
  const parts = partRolesOf({ layerAnnotations: [{ layer: 'Label', annotations: [{ label: 'Role: label' }] }, { layer: 'Hint', annotations: [{ label: '**role**: helper text' }] }, { layer: 'Icon', annotations: [{ label: 'decorative' }] }] });
  assert.deepEqual(parts, [{ layer: 'Label', part: 'label' }, { layer: 'Hint', part: 'description' }]);
  assert.deepEqual(annotationFacts([{ label: 'role: errormessage' }]), { part: 'errormessage' }, 'not read as a control role the page must announce');
  assert.deepEqual(partSheetLines(parts)[0], 'the "Label" part names the control: a <label for> it, the control inside it, or aria-labelledby on the control');
});

test('behaviours come with the role, Figma notes add more, and an exception holds only with a link to its decision', () => {
  assert.deepEqual(behavioursFor('switch').rows.map((r) => r.id), ['click-toggle', 'keys-toggle']);
  assert.deepEqual(annotatedBehaviours([{ label: 'Escape closes the menu. Arrow keys move between items.' }]).map((r) => r.id), ['escape-closes', 'arrows-move']);
  const p = behavioursFor('disclosure', [{ label: 'Esc dismisses it' }], { 'click-expand': 'Opened by its parent: https://gitlab.com/acme/ds/-/merge_requests/12', 'escape-closes': 'we decided so' });
  assert.deepEqual(p.excepted.map((e) => e.id), ['click-expand']);
  assert.deepEqual(p.weak.map((e) => e.id), ['escape-closes']);
  assert.deepEqual(p.rows.map((r) => r.id), ['escape-closes'], 'an exception without a link is still checked');
  assert.deepEqual(behaviourSheetLines('toggle'), ['a click and Space flip aria-pressed (a native <button> gives Space for free)']);
});

test('page: each part does what its role says, and each component does what its role and notes say', { skip: HAS_CHROME ? false : 'no Chrome available' }, () => {
  const page = `<!doctype html><html lang="en"><head><style>[hidden] { display: none; }</style></head><body><main><h1>Parts</h1>
    <div class="field"><label class="field__label" for="em">Email</label><input id="em" class="field__input" aria-describedby="em-hint"><span id="em-hint" class="field__hint">Work address</span></div>
    <div class="loose"><span class="loose__label">Name</span><input class="loose__input" aria-label="x"><span class="loose__error">Required</span></div>
    <div class="stepper"><button class="stepper__decrement">-</button><input role="spinbutton" class="stepper__value" aria-label="Count" value="1"><button class="stepper__increment" aria-label="Increase">+</button></div>
    <button class="toggle" aria-pressed="false">Bold</button>
    <span role="button" tabindex="0" class="dead" aria-pressed="false">Italic</span>
    <button class="more" aria-expanded="false" aria-controls="more-panel">More</button><div id="more-panel" hidden>Details</div>
    <button class="stuck" aria-expanded="false" aria-controls="stuck-panel">Stuck</button><div id="stuck-panel" hidden>Never</div>
  </main><script>
    const flip = (el, a) => el.setAttribute(a, el.getAttribute(a) === 'true' ? 'false' : 'true');
    document.querySelector('.toggle').addEventListener('click', (e) => flip(e.currentTarget, 'aria-pressed'));
    document.querySelector('.dead').addEventListener('click', (e) => flip(e.currentTarget, 'aria-pressed'));   // a click flips it, Space does nothing
    document.querySelector('.more').addEventListener('click', (e) => { flip(e.currentTarget, 'aria-expanded'); document.getElementById('more-panel').hidden = !document.getElementById('more-panel').hidden; });
  </script></body></html>`;
  const layers = (pairs) => pairs.map(([layer, role]) => ({ layer, annotations: [{ label: `role: ${role}` }] }));
  const dir = makeFixture({
    'page.html': page,
    'figma-component-props.snapshot.json': {
      field: { annotations: [{ label: 'role: textbox' }], layerAnnotations: layers([['Label', 'label'], ['Hint', 'description']]) },
      loose: { annotations: [{ label: 'role: textbox' }], layerAnnotations: layers([['Label', 'label'], ['Error', 'errormessage']]) },
      stepper: { layerAnnotations: layers([['Decrement', 'decrement'], ['Increment', 'increment'], ['Value', 'value']]) },
      toggle: { annotations: [{ label: 'role: togglebutton' }] },
      dead: { annotations: [{ label: 'role: togglebutton' }] },
      more: { annotations: [{ label: 'role: disclosure' }] },
      stuck: { annotations: [{ label: 'role: disclosure' }] },
    },
    'contract.authored.json': { components: { stuck: { behaviourExceptions: { 'click-expand': 'Opened by the page, see https://github.com/acme/ds/pull/7' } } } },
    'ds-config.json': { componentSelectors: { field: '.field', loose: '.loose', stepper: '.stepper', toggle: '.toggle', dead: '.dead', more: '.more', stuck: '.stuck' } },
  });
  let out = '';
  try { out = execFileSync(process.execPath, [join(ENGINE, 'a11y-check.mjs'), '--url', pathToFileURL(join(dir, 'page.html')).href, '--json'], { cwd: dir, encoding: 'utf8', timeout: 120000, env: { ...process.env, CHROME_PATH: CHROME } }); }
  catch (e) { out = e.stdout ?? ''; }
  const d = JSON.parse(out.slice(out.indexOf('{')));
  const of = (k) => d.issues.filter((i) => i.issue === k).map((i) => i.selector).sort();
  assert.deepEqual(of('partrole'), [
    'loose: its "Error" part (errormessage) shows but is not linked to its control (aria-describedby or aria-errormessage)',
    'loose: its "Error" part (errormessage) shows while its control has no aria-invalid="true"',
    'loose: its "Label" part (label) is not tied to its control: a <label for>, the control inside it, or aria-labelledby',
    'stepper: its "Decrement" part (decrement) has no spoken name: add aria-label',
    'stepper: its "Value" part (value) is not exposed by its spinbutton (aria-valuenow or aria-valuetext)',
  ], out);
  assert.deepEqual(of('behaviour'), ['dead: Space flips aria-pressed (role togglebutton), but aria-pressed stayed false'], out);
  assert.ok(!of('behaviour').some((x) => /^(toggle|more|stuck):/.test(x)), out);
});

test('a stepper is a spinbutton: its value and range in the markup, ArrowUp in the browser', async () => {
  const { roleObligations } = await import('../role-markup.mjs');
  assert.deepEqual(behavioursFor('stepper').rows.map((r) => r.id), ['keys-step']);
  assert.deepEqual(roleObligations('<div><button aria-label="Decrease"/><span role="spinbutton" aria-valuenow={v} aria-valuemin={0} aria-valuemax={10} aria-label={label}>{v}</span></div>', 'stepper'), { missing: [], owed: [] });
  assert.deepEqual(roleObligations('<input type="number" min={0} max={10} aria-label="Guests" />', 'spinbutton'), { missing: [], owed: [] });
  assert.deepEqual(roleObligations('<div><button>-</button><span>{v}</span><button>+</button></div>', 'spinbutton').missing.length, 2);
});

// E11, E12: the attribute a state is owed follows what the state means. The step a person is on (Current) is
// aria-current, never checked; an error on a message (a notice with role status) is announced (role="alert"), while an
// error on a field is still aria-invalid.
test('states: Current is aria-current; an error on a message is announced, on a field it is aria-invalid', async () => {
  const { stateFindings } = await import('../behaviour-contract.mjs');
  const comp = (name, role, label, effect) => ({ name, role, controls: [{ label: 'State', type: 'VARIANT', options: [{ label, ...effect }] }] });
  const want = (c) => stateFindings([c]).map((f) => f.want.join(' or '));
  assert.deepEqual(want(comp('step', 'radio', 'Current', { add: ['step--current'] })), ['aria-current']);
  assert.deepEqual(want(comp('step', 'radio', 'Current', { add: ['step--current'], attrs: { 'aria-current': 'step' } })), []);
  assert.deepEqual(want(comp('notice', 'status', 'Error', { add: ['notice--error'] })), ['role or aria-live']);
  assert.deepEqual(want(comp('notice', 'status', 'Error', { add: ['notice--error'], attrs: { role: 'alert' } })), []);
  assert.deepEqual(want(comp('field', 'textbox', 'Error', { add: ['field--error'] })), ['aria-invalid']);
  // A component whose role is not known: an error the option itself announces (role="alert") is heard.
  assert.deepEqual(want(comp('notice', undefined, 'Error', { add: ['notice--error'], attrs: { role: 'alert' } })), []);
});

// E13: a state whose look is drawn on the component (a class on a field's wrapper) while it is heard on a part (the
// field itself disabled): the contract's heardOn names the part and its state, the option sets both, and the state
// check counts what the part says.
test('states: an option heard on a part (heardOn) sets the part\'s state and counts as heard', async () => {
  const { stateFindings } = await import('../behaviour-contract.mjs');
  const { heardEffect, addHeard } = await import('../styleguide-data.mjs');
  assert.deepEqual(heardEffect('.field__input:disabled'), { target: '.field__input', attrs: { disabled: '' } });
  assert.deepEqual(heardEffect('.field__input[aria-invalid="true"]'), { target: '.field__input', attrs: { 'aria-invalid': 'true' } });
  const controls = [
    { label: 'Disabled', type: 'BOOLEAN', on: { add: ['field--disabled'], attrs: {} } },
    { label: 'State', type: 'VARIANT', options: [{ label: 'Error', add: ['field--error'], attrs: {} }, { label: 'Default', add: [], attrs: {} }] },
  ];
  addHeard(controls, { Disabled: { True: '.field__input:disabled' }, State: { Error: '.field__input[aria-invalid="true"]' } });
  assert.deepEqual(controls[0].on.also, [{ target: '.field__input', attrs: { disabled: '' } }]);
  assert.deepEqual(controls[1].options[0].also, [{ target: '.field__input', attrs: { 'aria-invalid': 'true' } }]);
  assert.equal(controls[1].options[1].also, undefined);
  assert.deepEqual(stateFindings([{ name: 'field', role: 'textbox', controls }]), []);
  // Without heardOn the class alone is still a state nobody hears.
  const bare = [{ label: 'Disabled', type: 'BOOLEAN', on: { add: ['field--disabled'], attrs: {} } }];
  assert.equal(stateFindings([{ name: 'field', role: 'textbox', controls: bare }]).length, 1);
});
