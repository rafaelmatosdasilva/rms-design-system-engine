// A flow walked through (WCAG 3.3.7 Redundant Entry): opening a flow's pages one by one says what each asks for,
// never whether the flow carries an answer over, so the criterion was always left to a person. Walking it fills each
// step with values of its own and sends it, and a field asked again after that is the criterion failing. It types
// into a running product, so it runs only where the project asks for it, never types into a password or a card
// field, and stops before a step that pays, signs or deletes. The browser case walks two real pages.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { rmSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { makeFixture, budget } from './helpers.mjs';
import { walkValue, mayFill, maySend, stepForm, walkFlows, WALK_FILL, WALK_SEND } from '../lib/flow-walk.mjs';
import { findChrome } from '../lib/cdp.mjs';

const ENGINE = dirname(dirname(fileURLToPath(import.meta.url)));
const CHROME = findChrome({ playwright: true });
const HAS_CHROME = !!CHROME && typeof WebSocket === 'function';

test('what is typed comes from what the field asks for, and nothing is typed into a password or a card', () => {
  assert.equal(walkValue({ autocomplete: 'shipping postal-code', type: 'text' }), 'EX1 1EX');
  assert.equal(walkValue({ autocomplete: 'email', type: 'text' }), 'someone@example.com');
  assert.equal(walkValue({ type: 'date' }), '2030-01-01');
  // Nothing in the autocomplete or the type: the words of the label say what it asks for.
  assert.equal(walkValue({ type: 'text', label: 'Your e-mail' }), 'someone@example.com');
  assert.equal(walkValue({ type: 'text', label: 'Post code' }), 'EX1 1EX');
  assert.equal(walkValue({ type: 'text', name: 'q' }), 'Example');
  // A password is never typed (the criterion excepts one anyway), and neither is anything that asks for a card or an
  // account: a made-up number in a real product is not ours to send.
  for (const f of [{ type: 'password' }, { name: 'cc-number' }, { autocomplete: 'cc-csc' }, { label: 'Security code' }, { label: 'IBAN' }, { name: 'account-number' }]) {
    assert.equal(mayFill(f), false, JSON.stringify(f));
    assert.equal(walkValue(f), null, JSON.stringify(f));
  }
  // Every value is invented and generic: nothing here is a real person, address or account.
  const values = [{ autocomplete: 'name' }, { autocomplete: 'street-address' }, { autocomplete: 'organization' }, { autocomplete: 'tel' }].map(walkValue);
  for (const v of values) assert.match(v, /Example|example\.com|Acme|\+1555/);
});

test('a step that pays, signs or asks for a card is never sent', () => {
  assert.deepEqual(maySend({ submit: ['Continue'], fields: [{ type: 'text' }] }), { ok: true });
  for (const word of ['Pay now', 'Place the order', 'Transfer', 'I agree', 'Delete my account', 'Submit the application']) {
    assert.ok(maySend({ submit: [word], fields: [] }).stop, word);
    assert.match(maySend({ submit: [word], fields: [] }).stop, new RegExp(`reads "${word}"`));
  }
  assert.match(maySend({ submit: ['Continue'], fields: [{ label: 'Card number', name: 'cc-number' }] }).stop, /asks for Card number/);
  assert.match(maySend({ submit: [], fields: [{ type: 'text' }] }).stop, /no button that sends it/);
  // A password is not a reason to stop: a sign-in step is walked, its password field left alone.
  assert.deepEqual(maySend({ submit: ['Sign in'], fields: [{ type: 'password' }] }), { ok: true });
});

test('the step is walked through the form that asks for the most, never the newsletter box beside it', () => {
  assert.equal(stepForm({ forms: [{ fields: [{}] }, { fields: [{}, {}, {}] }] }), 1);
  assert.equal(stepForm({ forms: [{ fields: [{}, {}] }] }), 0);
});

// A page the walk drives, standing in for a real one: it holds its own facts, remembers what was typed, and moves to
// the next page when it is sent.
function fakePages(steps) {
  const typed = new Map();
  return async (url) => {
    const step = steps.find((s) => s.url === url) ?? steps[0];
    let where = step;
    return {
      read: async () => ({ url: where.url, title: where.title, forms: [{ fields: where.fields.map((f) => ({ ...f, filled: !!typed.get(`${where.url}|${f.name}`) })), submit: where.submit ?? ['Continue'], actions: [], checks: [], words: '' }] }),
      fill: async (i, values) => values.map((v, j) => (v === null ? null : (typed.set(`${where.url}|${where.fields[j].name}`, v), { i: j, value: v }))).filter(Boolean),
      send: async () => { const next = steps[steps.indexOf(where) + 1]; if (next) where = next; return { clicked: 'Continue' }; },
      close: async () => {},
    };
  };
}

test('a flow walked through: what the next step asks again, and what stops the walk', async () => {
  const email = { name: 'email', label: 'Email', autocomplete: 'email', type: 'text' };
  const post = { name: 'postcode', label: 'Post code', autocomplete: 'postal-code', type: 'text' };
  // Step two asks for the email again, empty, after step one was really given it.
  let r = await walkFlows([{ name: 'Checkout', steps: [{ label: 'one', url: 'one' }, { label: 'two', url: 'two' }] }], {
    page: fakePages([{ url: 'one', title: 'One', fields: [email, post] }, { url: 'two', title: 'Two', fields: [email] }]) });
  assert.equal(r.length, 1);
  assert.deepEqual(r[0].asked, [{ page: 'two', label: 'Email', key: 'email', after: 'one' }]);
  // The last step is read, never filled in or sent: by then what it asks for is the whole answer.
  assert.deepEqual(r[0].walked.map((w) => [w.label, w.sent, w.moved ?? w.last]), [['one', true, true], ['two', false, true]]);
  assert.equal(r[0].ended, null);
  assert.deepEqual(r[0].walked[0].given.map((g) => g.key), ['email', 'postalcode']);   // a field's meaning, from its autocomplete token
  // The same flow where step two asks for something new only: nothing asked twice.
  r = await walkFlows([{ name: 'Checkout', steps: [{ label: 'one', url: 'one' }, { label: 'two', url: 'two' }] }], {
    page: fakePages([{ url: 'one', title: 'One', fields: [email] }, { url: 'two', title: 'Two', fields: [post] }]) });
  assert.deepEqual(r[0].asked, []);
  assert.equal(r[0].ended, null);
  // A step that pays stops the walk before it is sent, and says why.
  r = await walkFlows([{ name: 'Checkout', steps: [{ label: 'one', url: 'one' }, { label: 'two', url: 'two' }] }], {
    page: fakePages([{ url: 'one', title: 'One', fields: [email], submit: ['Pay now'] }, { url: 'two', title: 'Two', fields: [post] }]) });
  assert.equal(r[0].walked.length, 1);
  assert.equal(r[0].walked[0].sent, false);
  assert.match(r[0].ended, /stopped before sending one: its button reads "Pay now"/);
  // A flow of one step is no flow to walk.
  assert.deepEqual(await walkFlows([{ name: 'One step', steps: [{ label: 'one', url: 'one' }] }], { page: fakePages([]) }), []);
});

test('a step that does not move on when it is sent decides nothing: the walk says so', async () => {
  const email = { name: 'email', label: 'Email', autocomplete: 'email', type: 'text' };
  const page = async () => ({
    read: async () => ({ url: 'one', title: 'One', forms: [{ fields: [{ ...email, filled: false }], submit: ['Continue'], actions: [], checks: [], words: '' }] }),
    fill: async () => [{ i: 0, value: 'someone@example.com' }],
    send: async () => ({ clicked: 'Continue' }),   // the page stays where it was: the values were refused
    close: async () => {},
  });
  const r = await walkFlows([{ name: 'Checkout', steps: [{ label: 'one', url: 'one' }, { label: 'two', url: 'two' }] }], { page });
  assert.equal(r[0].walked.length, 1);
  assert.match(r[0].ended, /one did not move on when it was sent \("Continue"\): the values it was given may have been refused/);
});

const step = (title, body, { lang = 'en' } = {}) => `<!doctype html><html lang="${lang}"><head><title>${title}</title><style>body { font: 16px/1.4 sans-serif; color: #111; background: #fff; } a, button { color: #0b3d91; }</style></head><body>
<a href="#main">Skip to content</a><header><nav aria-label="Main"><a href="one.html">One</a> <a href="two.html">Two</a></nav></header>
<main id="main"><h1>${title}</h1>${body}</main></body></html>`;

test('in the browser: two real pages walked, the email asked again after it was given', { timeout: budget(300000), skip: !HAS_CHROME && 'no Chrome' }, () => {
  const form = (fields, to) => `<form onsubmit="event.preventDefault(); location.href = '${to}';">${fields}<button>Continue</button></form>`;
  const dir = makeFixture({
    'one.html': step('Acme step one', form('<label>Email <input name="email" autocomplete="email"></label><label>Post code <input name="postcode" autocomplete="postal-code"></label>', 'two.html')),
    'two.html': step('Acme step two', form('<label>Email <input name="email" autocomplete="email"></label><label>Address <input name="street" autocomplete="street-address"></label>', 'one.html')),
    'ds-config.json': { a11y: { walkFlows: true, flows: [{ name: 'Checkout', pages: ['one.html', 'two.html'] }] } },
  });
  try {
    const urls = ['one.html', 'two.html'].flatMap((f) => ['--url', pathToFileURL(join(dir, f)).href]);
    let out = '';
    try { out = execFileSync(process.execPath, [join(ENGINE, 'lib', 'a11y-check.mjs'), ...urls, '--json', '--no-axe', '--no-states'], { cwd: dir, encoding: 'utf8', timeout: budget(280000), env: { ...process.env, CHROME_PATH: CHROME } }); } catch (e) { out = String(e.stdout ?? ''); }
    const d = JSON.parse(out.slice(out.indexOf('{')));
    const c = d.pages?.criteria ?? {};
    // Walked, so the criterion is decided: the second step asks for the email again, with nothing filled in.
    assert.equal(c['3.3.7']?.st, 'todo', JSON.stringify(c['3.3.7']));
    assert.match(c['3.3.7'].note, /Asked again after the flow was walked through: "Email" on .*two\.html/);
    const asked = d.issues.filter((i) => i.issue === 'askedagain');
    assert.equal(asked.length, 1, JSON.stringify(asked.map((i) => i.selector)));
    assert.match(asked[0].selector, /"Email" is asked again, empty, after .*one\.html was given it and the flow was walked through/);
    // The address it asks for only once is not a finding.
    assert.ok(!asked.some((i) => /Address/.test(i.selector)), JSON.stringify(asked.map((i) => i.selector)));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('in the browser: nothing is walked unless the project asks for it', { timeout: budget(300000), skip: !HAS_CHROME && 'no Chrome' }, () => {
  const form = (fields, to) => `<form onsubmit="event.preventDefault(); location.href = '${to}';">${fields}<button>Continue</button></form>`;
  const dir = makeFixture({
    'one.html': step('Acme step one', form('<label>Email <input name="email" autocomplete="email"></label>', 'two.html')),
    'two.html': step('Acme step two', form('<label>Email <input name="email" autocomplete="email"></label>', 'one.html')),
    'ds-config.json': { a11y: { flows: [{ name: 'Checkout', pages: ['one.html', 'two.html'] }] } },   // no walkFlows
  });
  try {
    const urls = ['one.html', 'two.html'].flatMap((f) => ['--url', pathToFileURL(join(dir, f)).href]);
    let out = '';
    try { out = execFileSync(process.execPath, [join(ENGINE, 'lib', 'a11y-check.mjs'), ...urls, '--json', '--no-axe', '--no-states'], { cwd: dir, encoding: 'utf8', timeout: budget(280000), env: { ...process.env, CHROME_PATH: CHROME } }); } catch (e) { out = String(e.stdout ?? ''); }
    const d = JSON.parse(out.slice(out.indexOf('{')));
    const c = d.pages?.criteria ?? {};
    // The pages were opened, never filled in: a person confirms, and the words say which reading it is.
    assert.equal(c['3.3.7']?.st, 'check', JSON.stringify(c['3.3.7']));
    assert.match(c['3.3.7'].note, /empty when the page opens.*A person runs the flow/s);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
