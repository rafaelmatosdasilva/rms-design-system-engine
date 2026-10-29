// the criteria that belong to a page, never to a component, tried on a product's own pages and across them: a title
// and a language on each, a way past the repeated blocks, the navigation in the same order and named alike, help in
// the same place, a flow never asking twice, and a step that pays or signs left to a person. What a machine cannot
// decide is a person's to check, never a pass. The browser case opens three small pages of one product (Acme).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { rmSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { makeFixture, budget } from './helpers.mjs';
import { pageCriteria, pageCriteriaTodos, fieldKey, orderBreak, groupsOf, LEGAL } from '../page-criteria.mjs';
import { WCAG22, WCAG_KIND } from '../wcag21.mjs';
import { A11Y_GUIDE, productA11yTodos } from '../a11y-check.mjs';
import { findChrome } from '../cdp.mjs';

const ENGINE = dirname(dirname(fileURLToPath(import.meta.url)));
const CHROME = findChrome({ playwright: true });
const HAS_CHROME = !!CHROME && typeof WebSocket === 'function';

const page = (label, o = {}) => ({ label, url: `https://acme.example.com/${label}`, title: `Acme ${label}`, lang: 'en', landmarks: { main: 1, nav: 1 }, skip: { name: 'Skip to content', to: 'main', there: true },
  navs: [{ label: 'Main', items: ['Home', 'Cards', 'Help'] }], controls: [{ name: 'Home', href: 'https://acme.example.com/home', raw: '/home', region: 'nav' }, { name: 'Cards', href: 'https://acme.example.com/cards', raw: '/cards', region: 'nav' }, { name: 'Help', href: 'https://acme.example.com/help', raw: '/help', region: 'nav' }], forms: [], ...o });

test('catalogue: each criterion of a page names the findings that fail it there, in plain words', () => {
  const ofPage = WCAG22.filter((c) => c.pageKinds);
  assert.deepEqual(ofPage.map((c) => c.sc), ['2.4.1', '2.4.2', '3.1.1', '3.2.3', '3.2.4', '3.2.6', '3.3.4', '3.3.7']);
  for (const c of ofPage) for (const k of c.pageKinds) {
    assert.equal(WCAG_KIND[k], c.sc, k);
    assert.ok(A11Y_GUIDE[k]?.fix, `${k} has words in the audit's guide`);
    assert.match(A11Y_GUIDE[k].title(1), /^One /, k);
  }
  // 3.3.7 stays a person's on a component's page: only a named flow tries it.
  assert.equal(WCAG22.find((c) => c.sc === '3.3.7').how, 'person');
});

test('pages of one product that agree: each criterion passes, with the pages as its evidence', () => {
  const r = pageCriteria([page('home'), page('cards')]);
  for (const sc of ['2.4.1', '2.4.2', '3.1.1', '3.2.3', '3.2.6']) assert.equal(r.criteria[sc].st, 'done', `${sc}: ${r.criteria[sc].note}`);
  assert.deepEqual(r.criteria['3.2.3'].pages.sort(), ['cards', 'home']);
  assert.match(r.criteria['2.4.2'].note, /home "Acme home"/);
  // The same links read the same: a person still compares buttons and icons, never a pass on links alone.
  assert.equal(r.criteria['3.2.4'].st, 'check');
  assert.match(r.criteria['3.2.4'].note, /3 links/);
  // No form, nothing asked: nothing to commit and nothing asked twice.
  assert.equal(r.criteria['3.3.4'].st, 'done');
  assert.equal(r.criteria['3.3.7'].st, 'done');
  assert.deepEqual(r.findings, []);
});

test('each page alone: no title, no language, no way past the blocks, a skip link to nothing', () => {
  const r = pageCriteria([
    page('home', { title: '', lang: '' }),
    page('cards', { landmarks: { main: 0, nav: 1 }, skip: null, lang: 'english language' }),
    page('help', { skip: { name: 'Skip', to: 'content', there: false } }),
  ]);
  const of = (k) => r.findings.filter((f) => f.kind === k).map((f) => [f.plugin, f.severity]);
  assert.deepEqual(of('pagetitle'), [['home', 'blocker']]);
  assert.deepEqual(of('pagelang'), [['home', 'blocker'], ['cards', 'blocker']]);
  assert.deepEqual(of('bypass'), [['cards', 'blocker'], ['help', 'blocker']]);
  assert.equal(r.criteria['2.4.2'].st, 'todo');
  assert.deepEqual(r.criteria['3.1.1'].pages, ['home', 'cards']);
  assert.match(r.findings.find((f) => f.plugin === 'help').desc, /#content, which is not on the page/);
  // The same title on two pages is for a person to judge.
  const dup = pageCriteria([page('home', { title: 'Acme' }), page('cards', { title: 'Acme' })]);
  assert.equal(dup.criteria['2.4.2'].st, 'check');
  assert.equal(dup.findings[0].severity, 'advisory');
});

test('across pages: a menu in another order, a link named otherwise, help that moves', () => {
  const cards = page('cards', {
    navs: [{ label: 'Main', items: ['Cards', 'Home', 'Help'] }],
    controls: [{ name: 'Cards', href: 'https://acme.example.com/cards', raw: '/cards', region: 'nav' }, { name: 'Start', href: 'https://acme.example.com/home', raw: '/home', region: 'nav' }, { name: 'Help', href: 'https://acme.example.com/help', raw: '/help', region: 'footer' }],
  });
  const r = pageCriteria([page('home'), cards]);
  const one = (k) => r.findings.filter((f) => f.kind === k).map((f) => f.desc);
  assert.deepEqual(one('navorder'), ['cards: navigation "Main" puts "Cards" before "Home"; home has "Home" first']);
  assert.deepEqual(one('namedalike'), ['cards: the navigation link to /home reads "Start"; on home it reads "Home"']);
  assert.deepEqual(one('helpplace'), ['cards: "Help" is in the footer; on home it is in the nav']);
  for (const sc of ['3.2.3', '3.2.4', '3.2.6']) { assert.equal(r.criteria[sc].st, 'todo', sc); assert.deepEqual(r.criteria[sc].pages, ['cards']); }
  assert.deepEqual(orderBreak(['a', 'b', 'c'], ['a', 'x', 'b', 'c']), null);   // an item added is not a change of order
});

test('pages of two products are never compared, and one page alone is said, not passed', () => {
  const r = pageCriteria([{ ...page('home'), product: 'acme' }, { ...page('cards', { navs: [{ label: 'Main', items: ['Help', 'Home'] }] }), product: 'cardTile' }]);
  assert.deepEqual(groupsOf([{ label: 'a', product: 'acme' }, { label: 'b', url: 'file:///x/b.html' }]).map((g) => g.site), ['acme', 'file']);
  assert.ok(!r.findings.some((f) => f.kind === 'navorder'));
  assert.equal(r.criteria['3.2.3'].st, 'check');
  assert.match(r.criteria['3.2.3'].note, /Only one page of each product was tried/);
  assert.equal(r.findings.length, 0);
});

const field = (name, o = {}) => ({ name, label: name, type: 'text', autocomplete: '', filled: false, ...o });
const form = (fields, submit, o = {}) => ({ fields, submit, actions: submit, checks: [], words: '', ...o });

test('a flow: what an earlier step asked, asked again empty, is a person\'s to confirm; a password asked again is fine', () => {
  const steps = [
    page('details', { forms: [form([field('email', { autocomplete: 'email' }), field('fullName'), field('password', { type: 'password' })], ['Continue'])] }),
    page('delivery', { forms: [form([field('e-mail'), field('full_name', { filled: true }), field('password', { type: 'password' }), field('street')], ['Continue'])] }),
    page('pay', { forms: [form([field('card')], ['Pay now'])] }),
  ];
  const r = pageCriteria(steps, { flows: [{ name: 'Checkout', pages: ['details', 'delivery', 'pay', 'receipt'] }] });
  assert.deepEqual(r.flows, [{ name: 'Checkout', pages: ['details', 'delivery', 'pay'], missing: ['receipt'] }]);
  const again = r.findings.filter((f) => f.kind === 'askedagain');
  assert.deepEqual(again.map((f) => f.desc), ['delivery, in Checkout: "e-mail" is asked again, empty, after details asked for it']);
  assert.equal(again[0].severity, 'warning');
  assert.equal(r.criteria['3.3.7'].st, 'check');   // the pages are opened, never filled: the flow may fill it once it runs
  // Its meaning is its autocomplete token, else its name.
  assert.equal(fieldKey({ name: 'x', autocomplete: 'shipping postal-code' }), 'postalcode');
  assert.equal(fieldKey({ name: 'Full_Name' }), 'fullname');
  // Paying with no review, correction or undo around it: advisory, for a person.
  assert.deepEqual(r.findings.filter((f) => f.kind === 'legalstep').map((f) => [f.plugin, f.severity]), [['pay', 'advisory']]);
  assert.equal(r.criteria['3.3.4'].st, 'check');
  assert.match(r.criteria['3.3.4'].note, /"Pay now" on pay \(no way to review or undo it found\)/);
  // A review step after it in the flow is a way; still a person's to check, never a pass.
  const reviewed = pageCriteria([...steps, page('review', { title: 'Review your order', forms: [form([], ['Confirm order'])] })], { flows: [{ name: 'Checkout', pages: ['details', 'delivery', 'pay', 'review'] }] });
  assert.ok(!reviewed.findings.some((f) => f.kind === 'legalstep' && f.plugin === 'pay'));
  assert.equal(reviewed.criteria['3.3.4'].st, 'check');
  // Fields and no flow named: a person walks each flow.
  assert.match(pageCriteria(steps).criteria['3.3.7'].note, /No flow named \(a11y.flows/);
  assert.ok(LEGAL.test('Place order') && LEGAL.test('Delete my account') && !LEGAL.test('Continue') && !LEGAL.test('Search') && !LEGAL.test('Sign in') && !LEGAL.test('Apply filters'));
});

test('the style guide\'s rows: one per criterion left, the code\'s to fix or a person\'s to check, with the pages', () => {
  const r = pageCriteria([page('home', { title: '' }), page('cards')]);
  const rows = pageCriteriaTodos(r, Object.fromEntries(WCAG22.map((k) => [k.sc, k.name])));
  const t = rows.find((x) => x.type === 'Pages, 2.4.2 Page Titled');
  assert.deepEqual([t.who, t.st, t.area], ['code', 'todo', 'Accessibility']);
  assert.match(t.todo, /on home\./);
  assert.equal(rows.find((x) => /3\.2\.4/.test(x.type)).who, 'person');
  assert.ok(!rows.some((x) => /2\.4\.1|3\.1\.1/.test(x.type)), 'what passes is no row');
  // What fails a page criterion is its own row, never counted again in the product's.
  assert.deepEqual(productA11yTodos({ issues: [{ issue: 'pagetitle', product: 'acme' }] }), []);
});

const shell = (title, body, { nav = ['Home', 'Cards', 'Help'], lang = 'en', helpIn = 'nav' } = {}) => `<!doctype html><html${lang ? ` lang="${lang}"` : ''}><head><title>${title}</title><style>body { font: 16px/1.4 sans-serif; color: #111; background: #fff; } a, button { color: #0b3d91; } .skip { position: absolute; left: 8px; top: 8px; }</style></head><body>
<a class="skip" href="#main">Skip to content</a>
<header><nav aria-label="Main">${nav.filter((n) => n !== 'Help' || helpIn === 'nav').map((n) => `<a href="${n.toLowerCase()}.html">${n}</a>`).join(' ')}</nav></header>
<main id="main"><h1>${title}</h1>${body}</main>
<footer>${helpIn === 'footer' ? '<a href="help.html">Help</a>' : '<p>Acme</p>'}</footer></body></html>`;

test('in the browser: three pages of one product, a flow through two, each criterion tried and said with its pages', { timeout: budget(300000), skip: !HAS_CHROME && 'no Chrome' }, () => {
  const dir = makeFixture({
    'home.html': shell('Acme home', '<p>Welcome.</p>'),
    'details.html': shell('Acme details', '<form><label>Email <input name="email" autocomplete="email"></label><label>Name <input name="cardTile"></label><button>Continue</button></form>', { nav: ['Cards', 'Home', 'Help'] }),
    'pay.html': shell('Acme payment', '<form><label>Email <input name="email"></label><label>Card number <input name="cardNumber" autocomplete="cc-number"></label><button>Pay now</button></form>', { lang: '', helpIn: 'footer' }),
    'ds-config.json': { a11y: { flows: [{ name: 'Checkout', pages: ['details.html', 'pay.html'] }] } },
  });
  try {
    const urls = ['home.html', 'details.html', 'pay.html'].flatMap((f) => ['--url', pathToFileURL(join(dir, f)).href]);
    let out = '';
    try { out = execFileSync(process.execPath, [join(ENGINE, 'a11y-check.mjs'), ...urls, '--json', '--no-axe', '--no-states'], { cwd: dir, encoding: 'utf8', timeout: budget(280000), env: { ...process.env, CHROME_PATH: CHROME } }); } catch (e) { out = String(e.stdout ?? ''); }
    const d = JSON.parse(out.slice(out.indexOf('{')));
    const c = d.pages?.criteria ?? {};
    const label = (f) => pathToFileURL(join(dir, f)).href;
    assert.equal(c['2.4.2']?.st, 'done', JSON.stringify(c));
    assert.equal(c['2.4.1']?.st, 'done');
    assert.deepEqual([c['3.1.1'].st, c['3.1.1'].pages], ['todo', [label('pay.html')]]);
    assert.deepEqual([c['3.2.3'].st, c['3.2.3'].pages], ['todo', [label('details.html')]]);
    assert.deepEqual([c['3.2.6'].st, c['3.2.6'].pages], ['todo', [label('pay.html')]]);
    assert.equal(c['3.3.7'].st, 'check');
    assert.equal(c['3.3.4'].st, 'check');
    assert.deepEqual(d.pages.flows, [{ name: 'Checkout', pages: [label('details.html'), label('pay.html')], missing: [] }]);
    const of = (k) => d.issues.filter((i) => i.issue === k);
    assert.equal(of('pagelang').length, 1);
    assert.equal(of('pagelang')[0].wcag, '3.1.1');
    assert.equal(of('pagelang')[0].severity, 'blocker');
    assert.equal(of('navorder')[0].wcag, '3.2.3');
    assert.match(of('askedagain')[0].selector, /"Email" is asked again, empty/);
    assert.equal(of('legalstep')[0].severity, 'advisory');
    assert.ok(!of('pagetitle').length && !of('bypass').length, JSON.stringify(d.issues.map((i) => [i.issue, i.selector])));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
