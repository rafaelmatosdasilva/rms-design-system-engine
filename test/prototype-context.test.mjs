// What the team wrote about its system, and its product's page decisions, put in front of a prototype.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, readFileSync, existsSync, cpSync, mkdtempSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { contextFrom, purposeLines, ruleLines, usesAgainstPurpose } from '../prototype-context.mjs';
import { pageFacts, deriveConventions, consistencyFindings, consistencyLine } from '../product-conventions.mjs';
import { checkPrototype } from '../prototype-pieces.mjs';

const ENGINE = join(dirname(fileURLToPath(import.meta.url)), '..');

const catalog = { components: {
  button: { description: 'The main action on a screen.', props: { Label: { type: 'text' } } },
  field: { description: 'A one-line text input.', props: {}, whenNotToUse: 'an on/off choice', useInstead: ['chip'] },
  badge: { description: 'Old status label.', props: {}, status: 'deprecated', useInstead: ['tag'] },
} };
const intent = {
  components: {
    button: { design: { description: 'x', annotations: [{ label: 'Role: button' }, 'Keep the label to one verb'] }, code: { note: null, cssComment: 'Primary only' }, guidelines: 'One per screen.' },
    field: { design: { annotations: [] }, code: {}, guidelines: 'Only for typing text.' },
  },
  guidelines: { general: 'Every page opens with one heading.', _sources: ['guidelines.md'] },
  templates: { authored: 'Settings pages: heading, sections, actions at the end.' },
  pages: { authored: '' },
};

test('the context gathers each component\'s purpose, role, notes, when not to use it and its guidelines, and the team\'s rules', () => {
  const ctx = contextFrom(catalog, intent);
  assert.equal(ctx.components.button.purpose, 'The main action on a screen.', 'the catalog\'s description first');
  assert.equal(ctx.components.button.role, 'button');
  assert.deepEqual(ctx.components.button.notes, ['Keep the label to one verb', 'Primary only']);
  assert.equal(ctx.components.button.guidelines, 'One per screen.');
  assert.equal(ctx.components.field.notFor, 'an on/off choice');
  assert.deepEqual(ctx.components.field.useInstead, ['chip']);
  assert.equal(ctx.components.badge.status, 'deprecated');
  assert.deepEqual(ctx.rules.map((r) => r.title), ['guidelines', 'templates'], 'an empty layer says nothing');
  const lines = purposeLines(ctx, ['button', 'field', 'badge']).join('\n');
  assert.match(lines, /button {2}The main action on a screen\. Role button\./);
  assert.match(lines, /not for an on\/off choice; use chip/);
  assert.match(lines, /guidelines Only for typing text\./);
  assert.match(lines, /badge {3}Old status label\. \[deprecated: use tag\]/);
  assert.match(ruleLines(ctx).join('\n'), /templates: Settings pages: heading, sections, actions at the end\./);
});

test('after drawing, each component used is shown beside what the prototype uses it for', () => {
  const ctx = contextFrom(catalog, intent);
  const uses = usesAgainstPurpose(ctx, [
    { component: 'button', props: { Label: 'Save' } }, { component: 'button', props: { Label: 'Cancel' } },
    { component: 'field', props: { standInFor: 'an on/off switch' } }, { component: 'Row', props: {} },
  ]);
  assert.deepEqual(uses.map((u) => u.component), ['button', 'field']);
  assert.deepEqual(uses[0].uses, ['Save', 'Cancel']);
  assert.match(uses[0].rule, /Guidelines: One per screen\./, 'two buttons beside "one per screen"');
  assert.match(uses[1].rule, /Not for an on\/off choice/);
});

test('a retired component is never put in a new prototype: its replacement is named', () => {
  const r = checkPrototype({ component: 'Page', children: [{ component: 'badge' }] }, { catalog, view: { components: [{ name: 'badge', controls: [] }] }, scales: { spacing: [], text: [] } });
  assert.equal(r.ok, false);
  assert.ok(r.findings.some((f) => f.level === 'error' && /badge is deprecated: use tag instead/.test(f.message)));
});

const page = (padding, heading, extra = []) => ({ component: 'Page', props: { padding, gap: 'padding/m' }, children: [{ component: 'Text', props: { text: 'T', style: heading, as: 'h1' } }, ...extra, { component: 'Row', props: { justify: 'end' }, children: [{ component: 'button', props: { Label: 'Save' } }] }] });

test('page facts: the frame, the heading, where the actions sit, and the answer to each missing need', () => {
  const f = pageFacts(page('padding/m', 'm', [{ component: 'chip', props: { standInFor: 'on/off switch for email' } }, { component: 'Missing', props: { need: 'an illustration' } }]), { actionNames: ['button'] });
  assert.deepEqual(f.page, { padding: 'padding/m', gap: 'padding/m', width: null, align: null });
  assert.deepEqual(f.heading, { style: 'm', as: 'h1' });
  assert.deepEqual(f.actions, { at: 'end', justify: 'end' });
  assert.deepEqual(f.needs, [{ need: 'on/off switch for email', answer: 'chip as a stand-in' }, { need: 'an illustration', answer: 'a Missing box' }]);
});

test('conventions: two pages, or one designed screen, set a decision; a tie sets none; the team\'s file wins', () => {
  const A = ['button'];
  const two = { a: pageFacts(page('padding/m', 'm'), { actionNames: A }), b: pageFacts(page('padding/m', 'm'), { actionNames: A }) };
  assert.equal(deriveConventions(two).page.padding.value, 'padding/m');
  const one = { a: pageFacts(page('padding/m', 'm'), { actionNames: A }) };
  assert.equal(deriveConventions(one).page.padding, undefined, 'one page made in a chat is not yet a convention');
  assert.equal(deriveConventions({ a: { ...one.a, designed: true } }).page.padding.value, 'padding/m', 'a screen a designer made is');
  const tie = { a: pageFacts(page('padding/m', 'm'), { actionNames: A }), b: pageFacts(page('padding/s', 'm'), { actionNames: A }) };
  assert.equal(deriveConventions(tie).page.padding, undefined);
  const authored = deriveConventions(two, { page: { padding: 'padding/s' }, needs: { 'on/off switch': 'a Missing box' } });
  assert.equal(authored.page.padding.value, 'padding/s');
  assert.equal(authored.page.padding.authored, true);
  assert.equal(authored.needs[0].answer, 'a Missing box');
});

test('a page that decides differently from the others is told each difference, with the pages it differs from', () => {
  const A = ['button'];
  const others = {
    settings: { ...pageFacts(page('padding/m', 'm', [{ component: 'Missing', props: { need: 'a toggle switch' } }]), { actionNames: A }), designed: true },
  };
  const here = pageFacts(page('padding/s', 's', [{ component: 'chip', props: { standInFor: 'switch to toggle push' } }]), { actionNames: A });
  const d = consistencyFindings(here, deriveConventions(others));
  const lines = d.map(consistencyLine);
  assert.ok(lines.includes('page padding: padding/s here, padding/m on the product\'s other pages (settings)'), lines.join('\n'));
  assert.ok(lines.includes('page heading style: s here, m on the product\'s other pages (settings)'));
  assert.ok(lines.some((l) => /the answer to "a toggle switch": chip as a stand-in here, a Missing box/.test(l)), 'the same need, answered another way');
  assert.deepEqual(consistencyFindings(pageFacts(page('padding/m', 'm'), { actionNames: A }), deriveConventions(others)), [], 'a page that matches has nothing to change');
});

// ── End to end on a built Tidepool with written guidelines ────────────────────────────────────────────────────────
test('the catalog shows what each component is for and the product\'s pages; a drawn prototype is held to both', { timeout: 600000 }, () => {
  const dir = mkdtempSync(join(tmpdir(), 'tp-context-'));
  cpSync(join(ENGINE, 'test', 'fixtures', 'tidepool-figma'), dir, { recursive: true });
  const ref = join(ENGINE, 'test', 'skill-evals', 'build-reference');
  cpSync(join(ref, 'src', 'styles'), join(dir, 'src', 'styles'), { recursive: true });
  cpSync(join(ref, 'src', 'components'), join(dir, 'src', 'components'), { recursive: true });
  writeFileSync(join(dir, 'guidelines.md'), 'Every page opens with one heading.\n\n## field\nOnly for typing text. Never as an on/off control.\n');
  const cfg = JSON.parse(readFileSync(join(dir, 'ds-config.json'), 'utf8'));
  writeFileSync(join(dir, 'ds-config.json'), JSON.stringify({ ...cfg, guidelines: { sources: ['guidelines.md'] } }, null, 2));
  const run = (...args) => spawnSync(process.execPath, [join(ENGINE, 'audit.mjs'), ...args], { cwd: dir, encoding: 'utf8', env: { ...process.env, NO_COLOR: '1' }, timeout: 300000 });
  assert.equal(run('--prototype', '--from-screens', 'src/figma/figma-screen-layout.snapshot.json').status, 0);

  const cat = run('--prototype', '--catalog');
  assert.equal(cat.status, 0, cat.stdout);
  assert.match(cat.stdout, /field +A one-line text input\. Role textbox\.\n +guidelines Only for typing text\. Never as an on\/off control\./);
  assert.match(cat.stdout, /guidelines: Every page opens with one heading\./);
  assert.match(cat.stdout, /page padding padding\/m \(settings\)/, 'the designed screen sets the product\'s frame');
  assert.ok(!existsSync(join(dir, 'src', 'styles', 'design-intent.json')), 'reading the intent writes nothing into the project');

  mkdirSync(join(dir, 'prototypes'), { recursive: true });
  writeFileSync(join(dir, 'prototypes', 'notify.json'), JSON.stringify({ component: 'Page', props: { padding: 'padding/s', gap: 'padding/m', width: '360' }, children: [
    { component: 'Text', props: { text: 'Notifications', style: 'm', as: 'h1' } },
    { component: 'field', props: {} },
    { component: 'button', props: { Label: 'Save' } },
  ] }));
  const r = run('--prototype', 'prototypes/notify.json');
  assert.equal(r.status, 0, r.stdout);
  assert.match(r.stdout, /📓 WHAT THE DOCUMENTATION SAYS ABOUT WHAT THIS PROTOTYPE USES\n.*field: A one-line text input\. Role textbox\. Guidelines: Only for typing text\./);
  assert.match(r.stdout, /• button \(used for "Save"\): The main action on a screen\./);
  assert.match(r.stdout, /📐 DIFFERENT FROM THE PRODUCT'S OTHER PAGES {2}1\n {3}• page padding: padding\/s here, padding\/m on the product's other pages \(settings\)/);
  const last = JSON.parse(readFileSync(join(dir, '.design-system-engine-out', 'prototypes', 'last.json'), 'utf8'));
  assert.ok(last.gaps.some((g) => g.kind === 'consistency' && /page padding/.test(g.line)), 'the reply owes the difference');

  const c = run('--prototype', '--consistency');
  assert.equal(c.status, 0);
  assert.match(c.stdout, /⚠️ {2}notify\n {6}• page padding: padding\/s here, padding\/m/);
  assert.match(c.stdout, /✅ settings: the same as the others/);
});
