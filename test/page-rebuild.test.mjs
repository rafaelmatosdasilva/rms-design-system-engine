import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readHtml, rebuild, jobOf, componentFor, pageCounts, rebuildLines } from '../lib/page-rebuild.mjs';
import { reaches } from '../lib/prototype.mjs';
import { fixtureProject, budget } from './helpers.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const PAGE = `<!doctype html><html><head><title>Acme</title>
<link href="https://fonts.googleapis.com/css2?family=Inter" rel="stylesheet">
<style>.hero{background:#7c3aed;padding:48px;border-radius:16px}.card{padding:24px}</style>
<script>window.x = '<button>not a button</button>'</script></head>
<body><header><nav class="nav-links"><a href="/">Home</a><a href="/docs">Docs</a></nav></header>
<main><section class="hero"><h1>Ship faster</h1><p>For teams.</p>
<div class="actions"><button class="btn btn-primary">Get started</button><a class="btn" href="/demo">Book a demo</a></div></section>
<section class="features-grid"><h2>Why</h2><div class="card"><h3>Fast</h3><p>Quick.</p></div><div class="card"><h3>Safe</h3><p>Checked.</p></div><div class="card"><h3>Open</h3><p>Yours.</p></div></section>
<form><input type="hidden" name="t"><input type="email" placeholder="you@example.com"><button type="submit" style="color:#333">Subscribe</button></form></main>
<footer><p>© Acme</p></footer></body></html>`;
const catalog = { components: { Button: { props: { label: { type: 'text' }, variant: { type: 'enum', values: ['primary', 'secondary'] } } }, Card: { props: { title: { type: 'text' } } } } };
const find = (n, test, out = []) => { if (test(n)) out.push(n); for (const k of n.children ?? []) find(k, test, out); return out; };

test('the page is read without its scripts and styles, and each part for what it is for', () => {
  const tree = readHtml(PAGE);
  assert.equal(tree.tag, 'body');
  assert.equal(find(tree, (n) => n.tag === 'button').length, 2, 'the button inside a script is not one');
  assert.deepEqual(jobOf({ tag: 'a', attrs: { href: '/' }, children: [] }), { job: 'link', from: '<a href>' });
  assert.deepEqual(jobOf({ tag: 'div', attrs: { class: 'promo-card' }, children: [] }), { job: 'card', from: 'class "promo-card"' });
  assert.deepEqual(jobOf({ tag: 'div', attrs: { role: 'dialog' }, children: [] }), { job: 'dialog', from: 'role="dialog"' });
  // A name on something that holds controls names what it holds.
  const nav = find(tree, (n) => n.tag === 'nav')[0];
  assert.equal(jobOf(nav), null);
  assert.equal(componentFor('button', catalog), 'Button');
  assert.equal(componentFor('table', catalog), null);
});

test('each job becomes the system\'s component with the page\'s words and options, and what it lacks a Missing box or a stand-in', () => {
  const r = rebuild(readHtml(PAGE), { catalog, name: 'landing' });
  const nodes = find(r.prototype, () => true);
  const buttons = nodes.filter((n) => n.component === 'Button');
  assert.deepEqual(buttons.map((b) => b.props.label), ['Get started', 'Book a demo', 'Subscribe']);
  assert.equal(buttons[0].props.variant, 'primary');
  const cards = nodes.filter((n) => n.component === 'Card');
  assert.equal(cards.length, 3);
  assert.ok(find(cards[0], (n) => n.component === 'Text' && n.props.text === 'Fast').length, 'a card keeps what it holds');
  const missing = nodes.filter((n) => n.component === 'Missing').map((n) => n.props.need);
  assert.ok(missing.some((m) => /^link "Home"/.test(m)), missing.join(' | '));
  assert.ok(missing.some((m) => /^text input "you@example\.com"/.test(m)));
  assert.ok(!nodes.some((n) => n.props?.need?.includes('hidden')));
  assert.deepEqual(r.gaps.map((g) => g.need).sort(), ['a link component', 'a text input component']);
  assert.ok(nodes.some((n) => n.component === 'Columns'), 'three cards side by side are a grid');
  assert.deepEqual(r.regions.map((g) => g.name), ['the page header', 'the main content', 'the footer']);
  // With no Card in the system, a card keeps what it holds as a marked stand-in.
  const bare = rebuild(readHtml(PAGE), { catalog: { components: { Button: catalog.components.Button } } });
  const standIns = find(bare.prototype, (n) => n.props?.standInFor);
  assert.equal(standIns.length, 3);
  assert.match(standIns[0].props.standInFor, /^a card/);
});

test('what the page writes by hand is counted before, and the after line says none can be left', () => {
  const b = pageCounts(PAGE, { colours: new Map(), spacing: new Map(), sizes: [] });
  assert.equal(b.inline, 1);
  assert.equal(b.fonts, 1);
  assert.ok(b.rules >= 2);
  assert.ok(b.classes >= 6);
  const r = { ...rebuild(readHtml(PAGE), { catalog, name: 'landing' }), before: b, source: 'landing.html', unseen: [] };
  const lines = rebuildLines(r).join('\n');
  assert.match(lines, /Before: .*1 inline style .*1 font loaded/);
  assert.match(lines, /After: {2}6 system components \(Button ×3 · Card ×3\)/);
  assert.match(lines, /What the system lacks: a link component · a text input component/);
});

test('--from-page takes its page as a value, so it is never read as a composition', () => {
  assert.equal(reaches(['--from-page', 'landing.html']), 'a page made outside the system, rebuilt from it');
});

test('--prototype --from-page writes a starting point, draws it, and leaves the page and a kept starting point alone', () => {
  const dir = fixtureProject(join(HERE, 'fixtures', 'demo-ds'), 'from-page-');
  writeFileSync(join(dir, 'landing.html'), PAGE);
  const run = (...extra) => spawnSync(process.execPath, [join(HERE, '..', 'audit.mjs'), '--prototype', '--from-page', 'landing.html', '--no-browser', ...extra], { cwd: dir, encoding: 'utf8', env: { ...process.env, NO_COLOR: '1' }, timeout: budget(180000) });
  const r = run();
  assert.match(r.stdout, /Rebuilt from the system {2}· {2}landing\.html {2}→ {2}prototypes\/landing\.json/);
  assert.match(r.stdout, /button/);
  assert.equal(readFileSync(join(dir, 'landing.html'), 'utf8'), PAGE);
  assert.ok(existsSync(join(dir, 'prototypes', 'landing.json')));
  assert.ok(existsSync(join(dir, '.design-system-engine-out', 'prototypes', 'landing.rebuild.md')));
  writeFileSync(join(dir, 'prototypes', 'landing.json'), '{"prototype":{"component":"Page"},"$note":"mine"}');
  const again = run();
  assert.match(again.stdout, /already there and may hold your own edits/);
  assert.match(readFileSync(join(dir, 'prototypes', 'landing.json'), 'utf8'), /mine/);
});
