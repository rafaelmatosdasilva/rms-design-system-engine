// A component written as Angular, Lit or a plain custom element (class-writer.mjs), from a spec (spec-to-code.mjs) and
// from Figma's build sheet (scaffold.mjs), as Vue and JSX already are: read back with the code's own reader against
// what it was written from, and drawn by the project's own Lit and Angular, so what is handed back compiles and draws.
//
// The real tests use each system's own build, laid in gitignored folders as CI does:
//   npm ci --prefix test/.lit-tools
//   npm ci --prefix test/.angular-tools
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, existsSync, mkdirSync, symlinkSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { codeFromSpec } from '../lib/spec-to-code.mjs';
import { scaffoldOf } from '../lib/scaffold.mjs';
import { predict } from '../lib/figma-ops.mjs';
import { codeBuildContext, readBack } from '../lib/code-build-context.mjs';
import { textComponentApi } from '../lib/component-source.mjs';
import { classKind } from '../lib/class-components.mjs';
import { findChrome } from '../lib/cdp.mjs';
import { budget, tempDir } from './helpers.mjs';

const ENGINE = dirname(dirname(fileURLToPath(import.meta.url)));
const CHROME = findChrome({ playwright: true });

// Acme's status pill: a tone, a label it shows, an icon it shows on a switch, two of the system's variables.
const ops = [{ op: 'create', name: 'acmeStatus', axes: [{ name: 'tone', options: ['neutral', 'danger'] }], layout: { dir: 'HORIZONTAL' } }, { op: 'describe', text: 'A short state.' },
  { op: 'addLayer', parent: '', layer: { type: 'instance', name: 'Icon', of: 'acmeIcon' } }, { op: 'addLayer', parent: '', layer: { type: 'text', name: 'Label', text: 'New' } },
  { op: 'addProperty', name: 'showIcon', kind: 'boolean', default: false, layer: 'Icon' }, { op: 'addProperty', name: 'label', kind: 'text', default: 'New', layer: 'Label' },
  { op: 'bind', layer: '', field: 'fill', variable: 'accent' }, { op: 'bind', layer: '', field: 'radius', variable: 'radius' }];
const model = predict(null, ops, { props: { acmeIcon: { properties: {} } }, varNames: {} });
const ctxOf = (framework, ext = 'js') => ({ framework, folder: 'src/components', cssVarOf: (v) => `--acme-${v}`, tagOf: (n) => (n === 'acmeIcon' ? 'acme-icon' : 'acme-status'),
  classFileOf: () => `acme-status${framework === 'angular' ? '.component.ts' : `.${ext}`}`, classNameOf: () => `AcmeStatus${framework === 'angular' ? 'Component' : ''}` });

test('a spec written as Angular, Lit and a plain custom element, each in its own words, and read back as the spec', async () => {
  const ng = codeFromSpec(model, ctxOf('angular'));
  assert.equal(ng.file, 'src/components/acme-status.component.ts');
  assert.match(ng.text, /selector: 'acme-status'/);
  assert.match(ng.text, /<div \[class\]="'acme-status' \+ ' acme-status--' \+ tone">/);
  assert.match(ng.text, /@if \(showIcon\) \{\n\s+<acme-icon class="acme-status__icon"><\/acme-icon>\n\s+\}/);
  assert.match(ng.text, /\{\{ label \}\}/);
  assert.match(ng.text, /@Input\(\) tone: 'neutral' \| 'danger' = 'neutral';/);
  assert.match(ng.text, /background-color: var\(--acme-accent\);/);
  const lit = codeFromSpec(model, ctxOf('lit'));
  assert.match(lit.text, /class=\$\{'acme-status' \+ ' acme-status--' \+ this\.tone\}/);
  assert.match(lit.text, /\$\{this\.showIcon \? html`[\s\S]*` : nothing\}/);
  assert.match(lit.text, /static properties = \{\n {4}tone: \{ type: String, reflect: true \},/);
  assert.match(lit.text, /customElements\.define\('acme-status', AcmeStatus\);/);
  const plain = codeFromSpec(model, ctxOf('web component'));
  assert.match(plain.text, /static observedAttributes = \['tone', 'show-icon', 'label'\];/);
  assert.match(plain.text, /<span class="acme-status__label">\$\{esc\(this\.label\)\}<\/span>/, 'what an attribute gives is escaped before it is written');
  for (const [fw, out] of [['angular', ng], ['lit', lit], ['web component', plain]]) {
    assert.equal(classKind(out.file, out.text), fw, `${fw}: read as its framework's`);
    assert.deepEqual(Object.keys(textComponentApi(out.file, out.text).props ?? {}).sort(), ['label', 'showIcon', 'tone'], `${fw}: its props read back`);
    assert.deepEqual(await readBack(model, ctxOf(fw), out, fw), [], `${fw}: every layer a part, every property a prop`);
  }
});

test('what a spec says is written as code nothing in it can break out of, in each of the three', () => {
  const m = predict(null, [{ op: 'create', name: 'acmeNote', axes: [{ name: 'tone', options: ["a'}</script>${x}"] }] },
    { op: 'addLayer', parent: '', layer: { type: 'text', name: 'Label', text: "it's {{ x }} ${y} `z` </span><b>" } }, { op: 'describe', text: 'A note. */ alert(1) /* `x` ${y}' }], {});
  for (const fw of ['angular', 'lit', 'web component']) {
    const { text } = codeFromSpec({ ...m, kind: 'frame' }, { framework: fw, tagOf: () => 'acme-note' });
    assert.doesNotMatch(text, /<\/span><b>|\{\{ x \}\}|\$\{y\}|\*\/ alert/, fw);
    const props = codeFromSpec(m, { framework: fw, tagOf: () => 'acme-note' }).text;
    assert.doesNotMatch(props, /a'\}<\/script>|\$\{x\}/, `${fw}: an option's value stays a string`);
  }
});

test('Figma\'s build sheet scaffolded as Angular, Lit and a plain custom element, its rules and what it still owes kept', () => {
  const rules = { sel: '.acme-chip', base: [{ prop: 'border-radius', value: 'var(--acme-radius)' }], raw: [], text: null, stroke: false,
    variants: [{ selector: '.acme-chip.acme-chip--l', prop: 'size', value: 'l', decls: [{ prop: 'height', value: 'var(--acme-h-l)' }], raw: [] }, { selector: '.acme-chip:disabled', prop: 'disabled', value: 'true', decls: [], raw: [] }] };
  const entry = { description: 'A choice.', props: { size: { type: 'enum', values: ['m', 'l'], default: 'm' }, disabled: { type: 'enum', values: ['false', 'true'], default: 'false' }, label: { type: 'text', default: 'Chip' } } };
  const ng = scaffoldOf('acmeChip', { entry, rules, role: 'button', framework: 'angular', tag: 'acme-chip' });
  assert.equal(ng.file, 'src/components/acme-chip.component.ts');
  assert.match(ng.text, /<button type="button" \[class\]="'acme-chip' \+ \(size === 'l' \? ' acme-chip--l' : ''\)" \[disabled\]="disabled">/);
  assert.match(ng.text, /\.acme-chip\.acme-chip--l \{\n\s+height: var\(--acme-h-l\);/);
  const lit = scaffoldOf('acmeChip', { entry, rules, role: 'button', framework: 'lit', tag: 'acme-chip' });
  assert.match(lit.text, /\?disabled=\$\{this\.disabled\}/);
  const plain = scaffoldOf('acmeChip', { entry, rules, role: 'button', framework: 'web component', tag: 'acme-chip' });
  assert.match(plain.text, /\$\{this\.disabled \? 'disabled' : ''\}/);
  assert.match(scaffoldOf('chip', { entry, rules, framework: 'lit' }).owed.join('\n'), /its tag chip has no dash/, 'a tag a custom element cannot have is said, never made up');
});

// ── The real thing: what is written, drawn by the project's own Lit and Angular ──
const fixture = (name, tools) => {
  const dir = tempDir(`writer-${name}-`);
  cpSync(join(ENGINE, 'test', 'fixtures', name), dir, { recursive: true });
  symlinkSync(join(ENGINE, 'test', tools, 'node_modules'), join(dir, 'node_modules'), 'dir');
  return dir;
};
const put = (dir, out) => { mkdirSync(dirname(join(dir, out.file)), { recursive: true }); writeFileSync(join(dir, out.file), out.text); };
const CFG = { name: 'Acme', paths: { themeCSS: 'src/styles/tokens.css' } };

const LIT_READY = CHROME && typeof WebSocket !== 'undefined' && existsSync(join(ENGINE, 'test', '.lit-tools', 'node_modules', 'lit')) ? false : 'no Chrome, or no Lit build tools (npm ci --prefix test/.lit-tools)';
test('a Lit system: written as its own components are (their tag prefix, their file), and drawn by its own Lit, the plain element too', { skip: LIT_READY, timeout: budget(300000) }, async () => {
  const dir = fixture('acme-lit', '.lit-tools');
  const { ctx, framework } = await codeBuildContext(dir, CFG, { name: 'statusPill' });
  assert.equal(framework, 'lit');
  assert.equal(ctx.tagOf('statusPill'), 'acme-status-pill', 'the prefix its own tags share');
  assert.equal(ctx.classFileOf('statusPill'), 'status-pill.ts', 'TypeScript, as its components are');
  const lit = codeFromSpec(model, { ...ctx, tagOf: (n) => (n === 'acmeIcon' ? 'acme-icon' : 'acme-status'), classFileOf: () => 'acme-status.js', classNameOf: () => 'AcmeStatus' });
  const plain = codeFromSpec(model, { ...ctx, framework: 'web component', tagOf: (n) => (n === 'acmeIcon' ? 'acme-icon' : 'acme-flag'), classFileOf: () => 'acme-flag.js', classNameOf: () => 'AcmeFlag' });
  put(dir, lit); put(dir, plain);
  const { renderedLit } = await import('../lib/lit-harness.mjs');
  const files = { 'acme-status': join(dir, lit.file), 'acme-flag': join(dir, plain.file) };
  const r = await renderedLit(dir, CFG, Object.keys(files), { locate: (n) => files[n], max: 4 });
  assert.equal(r.why, undefined, r.why);
  assert.deepEqual(r.failed, [], 'both drew');
  assert.match(r.markup['acme-status'], /class="acme-status acme-status--neutral"/);
  assert.match(r.markup['acme-status'], /<span class="acme-status__label">New<\/span>/);
  assert.match(r.markup['acme-flag'], /class="acme-status acme-status--neutral"/, 'the plain element drew into its own shadow root');
});

const NG_TOOLS = join(ENGINE, 'test', '.angular-tools', 'node_modules');
const NG_READY = CHROME && typeof WebSocket !== 'undefined' && ['@angular/core', '@angular/compiler-cli', '@angular/build'].every((p) => existsSync(join(NG_TOOLS, p))) ? false : 'no Chrome, or no Angular build tools (npm ci --prefix test/.angular-tools)';
test('an Angular system: written as its own components are (.component.ts, a Component class), compiled and drawn by its own Angular', { skip: NG_READY, timeout: budget(300000) }, async () => {
  const dir = fixture('acme-angular', '.angular-tools');
  const { ctx, framework } = await codeBuildContext(dir, CFG, { name: 'statusPill' });
  assert.equal(framework, 'angular');
  assert.deepEqual([ctx.classFileOf('statusPill'), ctx.classNameOf('statusPill'), ctx.tagOf('statusPill')], ['status-pill.component.ts', 'StatusPillComponent', 'acme-status-pill']);
  // With no icon of its own in this system, the spec's icon is left out: what is drawn is what the writer wrote.
  const bare = predict(null, ops.filter((o) => !/Icon|showIcon/.test(JSON.stringify(o))), { varNames: {} });
  const ng = codeFromSpec(bare, { ...ctx, tagOf: () => 'acme-status', classFileOf: () => 'acme-status.component.ts', classNameOf: () => 'AcmeStatusComponent' });
  put(dir, ng);
  const { renderedAngular } = await import('../lib/angular-harness.mjs');
  const r = await renderedAngular(dir, CFG, ['acme-status'], { locate: () => join(dir, ng.file), max: 4 });
  assert.equal(r.why, undefined, r.why);
  assert.deepEqual(r.failed, [], 'it compiled and drew');
  assert.match(r.markup['acme-status'], /class="acme-status acme-status--neutral"/);
  assert.match(r.markup['acme-status'], />New<\/span>/);
});
