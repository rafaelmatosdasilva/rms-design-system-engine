// Prototypes linked into flows, held to the flows the team wrote down.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { linksOf, flowGraph, teamFlows, stepPage, flowFindings, targetOf } from '../prototype-flows.mjs';
import { checkPrototype } from '../prototype-pieces.mjs';
import { fixtureProject } from './helpers.mjs';

const ENGINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const page = (label, to) => ({ component: 'Page', children: [{ component: 'Text', props: { as: 'h1', text: label } }, ...(to ? [{ id: 'next', component: 'button', props: { Label: 'Continue', goesTo: to } }] : [])] });

test('a part that leads on names the page, or one of its states; the links make the flow', () => {
  assert.deepEqual(targetOf('payment#error'), { page: 'payment', state: 'error' });
  assert.deepEqual(linksOf('cart', page('Your cart', 'shipping')), [{ from: 'cart', to: 'shipping', state: null, id: 'next', label: 'Continue' }]);
  const g = flowGraph({ cart: page('Cart', 'shipping'), shipping: page('Shipping', 'payment'), payment: page('Payment'), about: page('About') });
  assert.deepEqual([g.starts, g.deadEnds, g.missing], [['cart'], ['payment'], []]);
  assert.deepEqual(flowGraph({ cart: page('Cart', 'shipping') }).missing, ['shipping']);
  const ok = checkPrototype(page('Cart', 'shipping'), { catalog: { components: { button: { props: { Label: { type: 'text' } } } } }, view: { components: [{ name: 'button', controls: [{ label: 'Label', prop: 'Label' }] }] }, scales: { spacing: [], text: [] } });
  assert.equal(ok.ok, true, JSON.stringify(ok.findings));
  assert.ok(!ok.findings.some((f) => /goesTo/.test(f.message)), 'goesTo is no option of the button');
});

test('the team\'s flows are read from arrows or from a list under a flow heading, and each step is matched to a page', () => {
  const flows = teamFlows([
    { title: 'Checkout flow', text: '1. Cart\n2. Shipping address\n3. Payment\n4. Confirmation', file: 'guidelines.md' },
    { title: 'guidelines', text: 'Sign-up: Account → Plan → Welcome\nEvery page opens with one heading.', file: 'guidelines.md' },
    { title: 'Buttons', text: '- one per screen\n- a verb on each', file: 'guidelines.md' },
  ]);
  assert.deepEqual(flows.map((f) => [f.name, f.steps]), [['Checkout flow', ['Cart', 'Shipping address', 'Payment', 'Confirmation']], ['Sign-up', ['Account', 'Plan', 'Welcome']]]);
  const pages = { cart: { heading: 'Your cart' }, shipping: { heading: 'Where should we send it?' }, 'pay-now': { heading: 'Payment' } };
  assert.equal(stepPage('Shipping address', pages), 'shipping');
  assert.equal(stepPage('Payment', pages), 'pay-now', 'by its heading');
  assert.equal(stepPage('Confirmation', pages), null);
});

test('what the reply owes: a page not drawn, a step with no page, two steps in a row that do not link', () => {
  const pages = { cart: { ui: page('Cart', 'shipping'), heading: 'Cart' }, shipping: { ui: page('Shipping', 'reviewing'), heading: 'Shipping' }, payment: { ui: page('Payment'), heading: 'Payment' } };
  const f = flowFindings(pages, [{ name: 'Checkout', steps: ['Cart', 'Shipping', 'Payment', 'Confirmation'], from: 'guidelines.md' }]);
  assert.deepEqual(f.map((x) => x.message), [
    'shipping ("Continue") goes to "reviewing", which is not drawn yet: draw prototypes/reviewing.json, or the flow stops there',
    'the flow "Checkout" (guidelines.md) has a step "Confirmation" and no prototype for it: draw it, or say why the flow leaves it out',
    'the flow "Checkout" goes from "Shipping" to "Payment", and shipping has nothing that leads to payment: give its action "goesTo": "payment"',
  ]);
});

test('--prototype --flow lists the links and holds them to the guidelines\' flow; a link to a page not drawn is owed', { timeout: 600000 }, () => {
  const dir = fixtureProject(join(ENGINE, 'test', 'fixtures', 'tidepool-figma'), 'tp-flow-');
  const ref = join(ENGINE, 'test', 'skill-evals', 'build-reference');
  for (const p of ['src/styles/tokens.css', 'src/components/button.css', 'src/components/Button.jsx', 'src/components/chip.css', 'src/components/Chip.jsx', 'src/components/field.css', 'src/components/Field.jsx', 'src/components/tag.css', 'src/components/Tag.jsx']) {
    mkdirSync(dirname(join(dir, p)), { recursive: true }); writeFileSync(join(dir, p), readFileSync(join(ref, p), 'utf8'));
  }
  writeFileSync(join(dir, 'guidelines.md'), '# Sign-up flow\n\n1. Account\n2. Plan\n3. Welcome\n');
  const cfg = JSON.parse(readFileSync(join(dir, 'ds-config.json'), 'utf8'));
  writeFileSync(join(dir, 'ds-config.json'), JSON.stringify({ ...cfg, guidelines: { sources: ['guidelines.md'] } }, null, 2));
  mkdirSync(join(dir, 'prototypes'), { recursive: true });
  const step = (h, to) => ({ component: 'Page', props: { padding: 'padding/m' }, children: [{ component: 'Text', props: { as: 'h1', text: h } }, ...(to ? [{ component: 'button', props: { Label: 'Continue', goesTo: to } }] : [])] });
  writeFileSync(join(dir, 'prototypes', 'account.json'), JSON.stringify(step('Your account', 'plan')));
  writeFileSync(join(dir, 'prototypes', 'plan.json'), JSON.stringify(step('Choose a plan')));
  const run = (...args) => spawnSync(process.execPath, [join(ENGINE, 'audit.mjs'), ...args], { cwd: dir, encoding: 'utf8', env: { ...process.env, NO_COLOR: '1' }, timeout: 300000 });
  let r = run('--prototype', 'prototypes/account.json', '--no-browser');
  assert.equal(r.status, 0, r.stdout);
  assert.match(readFileSync(join(dir, '.design-system-engine-out', 'prototypes', 'account.html'), 'utf8'), /"goesTo":"plan"/);
  r = run('--prototype', '--flow');
  assert.equal(r.status, 1, 'a flow with a step not drawn is not done: ' + r.stdout);
  assert.match(r.stdout, /🔗 FLOWS {2}2 page\(s\) in prototypes\/, 1 link\(s\)/);
  assert.match(r.stdout, /account → plan {2}by "Continue"/);
  assert.match(r.stdout, /the team's flow "Sign-up flow" \(guidelines\.md\): Account → Plan → Welcome/);
  assert.match(r.stdout, /❌ the flow "Sign-up flow" \(guidelines\.md\) has a step "Welcome" and no prototype for it/);
  const last = JSON.parse(readFileSync(join(dir, '.design-system-engine-out', 'prototypes', 'last.json'), 'utf8'));
  assert.ok(last.gaps.some((g) => g.kind === 'flow' && /Welcome/.test(g.line)));
  writeFileSync(join(dir, 'prototypes', 'plan.json'), JSON.stringify(step('Choose a plan', 'welcome')));
  r = run('--prototype', 'prototypes/plan.json', '--no-browser');
  assert.match(r.stdout, /⚠️ {2}"Continue" goes to "welcome", which is not drawn yet/);
});

test('--prototype --flow holds the pages of a flow to each other: the frame, the words for each action, a way back on every page after the first', { timeout: 600000 }, () => {
  const dir = fixtureProject(join(ENGINE, 'test', 'fixtures', 'tidepool-figma'), 'tp-flowc-');
  const ref = join(ENGINE, 'test', 'skill-evals', 'build-reference');
  for (const p of ['src/styles/tokens.css', 'src/components/button.css', 'src/components/Button.jsx', 'src/components/chip.css', 'src/components/Chip.jsx', 'src/components/field.css', 'src/components/Field.jsx', 'src/components/tag.css', 'src/components/Tag.jsx']) {
    mkdirSync(dirname(join(dir, p)), { recursive: true }); writeFileSync(join(dir, p), readFileSync(join(ref, p), 'utf8'));
  }
  mkdirSync(join(dir, 'prototypes'), { recursive: true });
  const step = (padding, h, actions) => ({ component: 'Page', props: { padding }, children: [{ component: 'Text', props: { as: 'h1', text: h, style: 'm' } }, { component: 'Row', children: actions.map(([Label, goesTo]) => ({ component: 'button', props: { Label, goesTo } })) }] });
  writeFileSync(join(dir, 'prototypes', 'account.json'), JSON.stringify(step('padding/m', 'Your account', [['Continue', 'plan']])));
  writeFileSync(join(dir, 'prototypes', 'plan.json'), JSON.stringify(step('padding/m', 'Choose a plan', [['Back', 'account'], ['Continue', 'payment']])));
  writeFileSync(join(dir, 'prototypes', 'payment.json'), JSON.stringify(step('padding/s', 'Payment', [['Next', 'welcome']])));
  writeFileSync(join(dir, 'prototypes', 'welcome.json'), JSON.stringify(step('padding/m', 'Welcome', [['Back', 'payment']])));
  let r = spawnSync(process.execPath, [join(ENGINE, 'audit.mjs'), '--prototype', '--flow'], { cwd: dir, encoding: 'utf8', env: { ...process.env, NO_COLOR: '1' }, timeout: 300000 });
  assert.equal(r.status, 1, 'pages that decide differently are not a finished flow: ' + r.stdout);
  assert.match(r.stdout, /❌ payment: page padding: padding\/s here, padding\/m on the other pages of the flow/);
  assert.match(r.stdout, /❌ payment: the words for going on: "Next" here, "Continue" on the other pages of the flow/);
  assert.match(r.stdout, /❌ payment has no way back to plan, and plan, welcome has one/);
  assert.doesNotMatch(r.stdout, /❌ (account|plan|welcome):/, 'the pages that match say nothing');
  // Brought in line, the flow holds.
  writeFileSync(join(dir, 'prototypes', 'payment.json'), JSON.stringify(step('padding/m', 'Payment', [['Back', 'plan'], ['Continue', 'welcome']])));
  r = spawnSync(process.execPath, [join(ENGINE, 'audit.mjs'), '--prototype', '--flow'], { cwd: dir, encoding: 'utf8', env: { ...process.env, NO_COLOR: '1' }, timeout: 300000 });
  assert.equal(r.status, 0, r.stdout);
  assert.match(r.stdout, /✅ the flow holds/);
});
