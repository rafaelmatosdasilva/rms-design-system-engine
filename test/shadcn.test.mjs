// A shadcn/ui system read as its own kind of React: its cva variants are its props, its kebab-case files its
// components, its components.json its layout, and it draws with its own React, Tailwind and Radix.
//
// Acme (test/fixtures/acme-shadcn) is invented, written the way shadcn/ui writes its components. The browser test uses
// the packages a shadcn project installs, laid in a gitignored folder as CI does:
//   npm ci --prefix test/.react-tools
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, existsSync, readFileSync, symlinkSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { shadcnConfig, cvaCalls, cvaProps, componentName, resolveAlias, utilityOf, shadcnScaffold, slotOf, radixStateProps } from '../lib/shadcn.mjs';
import { codeComponents, textComponentApi, componentSourceFiles, resolveComponentFile, textReader, extractDefaults } from '../lib/component-source.mjs';
import { startReactHarness } from '../lib/react-harness.mjs';
import { codeGrammarFor } from '../lib/code-grammar.mjs';
import { findChrome, launchChrome, connectCDP, openPage, waitForTrue } from '../lib/cdp.mjs';
import { budget, tempDir } from './helpers.mjs';

const ENGINE = dirname(dirname(fileURLToPath(import.meta.url)));
const FIXTURE = join(ENGINE, 'test', 'fixtures', 'acme-shadcn');
const TOOLS = join(ENGINE, 'test', '.react-tools', 'node_modules');
const CHROME = findChrome({ playwright: true });
const READY = CHROME && typeof WebSocket !== 'undefined' && ['vite', 'react', 'tailwindcss', '@tailwindcss/vite', 'class-variance-authority', '@radix-ui/react-switch'].every((p) => existsSync(join(TOOLS, p)))
  ? false : 'no Chrome, or no React and shadcn build tools (npm ci --prefix test/.react-tools)';
const read = (f) => readFileSync(join(FIXTURE, f), 'utf8');

test('components.json says where the components are, through the project\'s own alias', () => {
  const c = shadcnConfig(FIXTURE);
  assert.equal(c.uiDir, 'src/components/ui');
  assert.equal(c.css, 'src/index.css');
  assert.equal(c.utils, '@/lib/utils');
  assert.equal(shadcnConfig(tempDir('no-shadcn-')), null, 'a project without one is not shadcn');
  const next = tempDir('shadcn-next-');
  assert.equal(resolveAlias(next, '@/components/ui'), 'components/ui', 'with no src folder and no paths, @/ is the root, as Next.js lays a project out');
});

test('a cva call is read into its variants, defaults and classes', () => {
  const calls = cvaCalls(read('src/components/ui/button.tsx'));
  const b = calls.buttonVariants;
  assert.deepEqual(Object.keys(b.variants), ['variant', 'size']);
  assert.equal(b.variants.variant.destructive, 'bg-destructive text-white hover:bg-destructive/90');
  assert.deepEqual(b.defaultVariants, { variant: 'default', size: 'default' });
  assert.match(b.base, /^inline-flex /);
  const tv = cvaCalls('const chip = tv({ base: "px-2", variants: { tone: { neutral: ["bg-a", "text-b"], danger: "bg-c" } } })');
  assert.deepEqual(tv.chip.variants.tone, { neutral: 'bg-a text-b', danger: 'bg-c' }, "tailwind-variants' tv, and a class list as an array");
});

test("a component's props are its cva axes and asChild, with cva's defaults", () => {
  const p = cvaProps(read('src/components/ui/button.tsx'));
  assert.deepEqual(p.variant, { type: 'enum', options: ['default', 'destructive', 'outline', 'secondary'], default: 'default' });
  assert.deepEqual(p.size.options, ['default', 'sm', 'lg', 'icon']);
  assert.equal(p.asChild.type, 'boolean');
  assert.deepEqual(cvaProps('const v = cva("a", { variants: { inset: { true: "pl-8", false: "" } } }); function X(p: VariantProps<typeof v>) {}').inset, { type: 'boolean', default: 'false' }, 'true and false keys are a yes/no prop');
  // Through the engine's own reader, which every check uses: the variants' `default:` key is no prop's default.
  const api = textComponentApi(join(FIXTURE, 'src/components/ui/button.tsx'), read('src/components/ui/button.tsx'));
  assert.equal(api.props.variant.default, 'default');
  assert.deepEqual(api.props.size.options, ['default', 'sm', 'lg', 'icon']);
  assert.equal(slotOf(read('src/components/ui/button.tsx')), 'button', 'its root named by data-slot');
});

test('a state Radix sets from a prop the component passes on, and its classes style, is that prop', () => {
  const root = (imp, tag, cls) => `import * as P from "${imp}"\nfunction X({ className, ...props }) { return <P.${tag} className={cn("${cls}", className)} {...props} /> }`;
  assert.deepEqual(Object.keys(radixStateProps(root('@radix-ui/react-switch', 'Root', 'data-[state=checked]:bg-primary data-[state=unchecked]:bg-input'))), ['checked']);
  assert.deepEqual(Object.keys(radixStateProps(root('@radix-ui/react-toggle', 'Root', 'data-[state=on]:bg-accent data-[disabled]:opacity-50'))).sort(), ['disabled', 'pressed']);
  assert.deepEqual(Object.keys(radixStateProps(root('radix-ui', 'Root', 'data-[state=open]:rotate-180'))), ['open']);
  assert.equal(radixStateProps(root('@radix-ui/react-switch', 'Root', 'data-[state=checked]:bg-primary')).checked.default, 'false');
  // A part (not a Root) whose state its Root keeps, a file that passes nothing on, and one with no Radix are left.
  assert.deepEqual(radixStateProps(root('@radix-ui/react-dialog', 'Content', 'data-[state=open]:animate-in')), {});
  assert.deepEqual(radixStateProps(root('@radix-ui/react-switch', 'Root', 'data-[state=checked]:bg-primary').replace('{...props}', '')), {});
  assert.deepEqual(radixStateProps('function X() { return <div className="data-[state=open]:block" {...props} /> }'), {});
  // A class list on a part it renders is never a prop's default (className="…" on its thumb read as className's).
  assert.deepEqual([...extractDefaults('function S({ size = "m", ...props }) { return <P.Root size="l"><P.Thumb className="block size-4" /></P.Root> }')], [['size', 'm']]);
});

test('its kebab-case files are its components, by the name each exports', () => {
  assert.equal(componentName('src/components/ui/dropdown-menu.tsx'), 'DropdownMenu');
  assert.deepEqual(codeComponents(FIXTURE, {}).map((k) => k.name), ['Badge', 'Button', 'Card', 'Switch']);
  const files = componentSourceFiles(FIXTURE, {});
  assert.match(resolveComponentFile('Button', { ROOT: FIXTURE, cfg: {}, files, read: textReader(), classFor: () => null }).file ?? '', /ui\/button\.tsx$/, 'Figma\'s Button is button.tsx');
});

// A registry: the library in its own folder, listed in registry.json, and components.json's ui folder holding the one
// component its own site installed. Each file written as a public registry writes them: Tailwind's utilities, its
// slots, a family per file, a useRender component with no element of its own, a type after a generic.
function acmeRegistry() {
  const dir = tempDir('acme-registry-');
  const put = (f, t) => { mkdirSync(dirname(join(dir, f)), { recursive: true }); writeFileSync(join(dir, f), t); };
  put('components.json', JSON.stringify({ style: 'new-york', tsx: true, tailwind: { css: 'src/index.css' }, aliases: { components: '@/components', ui: '@/components/ui', utils: '@/lib/utils' } }));
  put('src/index.css', '@import "tailwindcss";\n');
  put('src/components/ui/button.tsx', 'export function Button(props) {\n  return <button data-slot="button" className="inline-flex h-9" {...props} />;\n}\n');
  const ui = 'src/registry/ui';
  put('registry.json', JSON.stringify({ name: 'acme', items: ['button', 'badge', 'menu', 'toggle-group'].map((n) => ({ name: n, type: 'registry:ui', files: [{ path: `${ui}/${n}.tsx`, type: 'registry:ui' }] })) }));
  put(`${ui}/button.tsx`, [
    'import { cva, type VariantProps } from "class-variance-authority";',
    'const buttonVariants = cva("inline-flex items-center", { variants: { size: { sm: "h-8", lg: "h-10" } }, defaultVariants: { size: "sm" } });',
    'function Button({ className, size, ...props }: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {',
    '  return <ButtonPrimitive data-slot="button" className={cn(buttonVariants({ size, className }))} {...props} />;',
    '}', 'export { Button, buttonVariants };', ''].join('\n'));
  put(`${ui}/badge.tsx`, [
    'function Badge({ className, render = <span />, ...props }: React.ComponentProps<"span">) {',
    '  return useRender({ render, props: { "data-slot": "badge", className: cn("rounded-md px-2", className), ...props } });',
    '}', 'export { Badge };', ''].join('\n'));
  put(`${ui}/menu.tsx`, [
    'function MenuTrigger(props) {', '  return <MenuPrimitive.Trigger data-slot="menu-trigger" className="flex-1" {...props} />;', '}',
    'function Menu(props) {', '  return (', '    <div data-slot="menu" className="relative flex">', '      <div data-slot="menu-content" className="flex-1 bg-popover">{props.children}</div>', '    </div>', '  );', '}',
    'export { Menu, MenuTrigger };', ''].join('\n'));
  put(`${ui}/toggle-group.tsx`, [
    'function ToggleGroup({ children, ...props }: React.ComponentProps<typeof Group> & VariantProps<typeof toggleVariants>) {',
    '  return <div data-slot="toggle-group" className="flex w-fit">{children}</div>;', '}', 'export { ToggleGroup };', ''].join('\n'));
  return dir;
}

test('a registry is read from registry.json: its library, not the one component its own site installed', () => {
  const dir = acmeRegistry();
  assert.equal(shadcnConfig(dir).uiDir, 'src/registry/ui');
  assert.equal(shadcnConfig(dir).registry, 'registry.json');
  assert.deepEqual(codeComponents(dir, {}).map((k) => `${k.name} ${k.file}`), ['Badge src/registry/ui/badge.tsx', 'Button src/registry/ui/button.tsx', 'Menu src/registry/ui/menu.tsx', 'ToggleGroup src/registry/ui/toggle-group.tsx']);
});

test('a slotted component is read by its slots: a useRender one too, its parts its slots, never its utilities or its types', async () => {
  assert.equal(slotOf('useRender({ props: { "data-slot": "badge" } })'), 'badge', 'a slot passed in props, as useRender does');
  const g = await codeGrammarFor(acmeRegistry(), {}, { reports: false });
  assert.deepEqual(g.code.notRead ?? [], [], 'every component read: a cva one drawn by its primitive, and a useRender one');
  const parts = (g.code.anatomy.Menu?.parts ?? []).map((p) => p.class);
  assert.deepEqual(parts, ['menu-content'], 'its slot is its part, never a utility (flex-1, bg-popover)');
  assert.equal(g.code.anatomy.Menu.root, '.menu', 'the family\'s name is its root, not its first slot (menu-trigger)');
  const partRule = g.code.rules.find((r) => r.id === 'code-part-class');
  assert.ok(!partRule || !partRule.toFix.length, `the family's slots follow the family's name (menu-content under menu): ${JSON.stringify(partRule?.toFix)}`);
  const words = g.code.rules.find((r) => r.id === 'code-words-through-props');
  assert.ok(!words || !words.toFix.some((x) => /VariantProps|&/.test(x.value)), `a type after a generic is no words shown: ${JSON.stringify(words?.toFix)}`);
});

test('drawn with its own React, Tailwind and Radix: each variant as it ships, a Radix switch that switches', { skip: READY, timeout: budget(300000) }, async () => {
  const dir = tempDir('shadcn-real-');
  cpSync(FIXTURE, dir, { recursive: true });
  symlinkSync(TOOLS, join(dir, 'node_modules'), 'dir');
  const files = componentSourceFiles(dir, {});
  const locate = (n) => resolveComponentFile(n, { ROOT: dir, cfg: {}, files, read: textReader(), classFor: () => null }).file;
  const names = ['Button', 'Badge', 'Switch', 'Card'];
  const h = await startReactHarness(dir, { name: 'Acme', paths: { themeCSS: 'src/index.css' } }, names, { locate });
  assert.ok(h.url, h.why);
  const browser = await launchChrome(CHROME, { tmpPrefix: 'dse-shadcn-' });
  try {
    const { send } = await connectCDP(browser.wsUrl);
    const { sessionId } = await openPage(send, h.url);
    await waitForTrue(send, sessionId, 'window.__dseHarnessReady === true', { attempts: 1200, intervalMs: 50, tolerateErrors: true });
    const inPage = async (expression) => (await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }, sessionId)).result?.value;
    assert.deepEqual(JSON.parse(await inPage('JSON.stringify(window.__dseHarnessFailed)')), [], 'every component drew');
    // Its variants are cases, read from its cva call: one per option of each axis.
    const cases = JSON.parse(await inPage(`JSON.stringify([...document.querySelectorAll('[data-dse-component="Button"] [data-dse-case]')].map((b) => b.getAttribute('data-dse-case')))`));
    assert.ok(cases.some((c) => /destructive/i.test(c)) && cases.some((c) => /\blg\b/i.test(c)), `the button is drawn in its variants: ${cases.join(', ')}`);
    // Tailwind compiled by the project's own Vite plugin, its theme's variables resolved: the default button is primary.
    assert.equal(await inPage(`getComputedStyle(document.querySelector('[data-dse-component="Button"] [data-slot="button"]')).height`), '36px', 'h-9, compiled');
    assert.match(await inPage(`getComputedStyle(document.querySelector('[data-dse-component="Button"] [data-slot="button"]')).backgroundColor`), /oklch\(0\.205 0 0\)|rgb\(23, 23, 23\)/, 'bg-primary, from the theme');
    // Its checked state is a case of its own: the prop Radix sets data-state="checked" from, read from the classes that
    // style it, though the component passes it on in {...props} and names none. Drawn by Radix, in its checked colour.
    const sw = JSON.parse(await inPage(`JSON.stringify([...document.querySelectorAll('[data-dse-component="Switch"] [data-dse-case]')].map((b) => { const s = b.querySelector('[data-slot="switch"]'); return [b.getAttribute('data-dse-case'), s && s.getAttribute('data-state'), s && getComputedStyle(s).backgroundColor]; }))`));
    const checked = sw.find(([c]) => /checked=true/.test(c));
    assert.ok(checked, `the switch is drawn checked: ${JSON.stringify(sw)}`);
    assert.equal(checked[1], 'checked', 'Radix drew it checked');
    assert.notEqual(checked[2], sw.find(([c]) => c === 'default')?.[2], 'its data-[state=checked] colour, not the unchecked one');
    // Radix runs: the switch flips its state, and its data-[state=checked] classes follow.
    assert.equal(await inPage(`(async () => { const s = document.querySelector('[data-dse-component="Switch"] [data-slot="switch"]'); const before = s.getAttribute('data-state'); s.click(); await new Promise((r) => setTimeout(r, 200)); return before + '>' + s.getAttribute('data-state') + ':' + s.getAttribute('role'); })()`),
      'unchecked>checked:switch');
  } finally { browser.kill(); await h.close?.(); }
});

test('a component is scaffolded the shadcn way: cva, cn, data-slot and asChild, with utilities read from variables', () => {
  const rules = {
    sel: '.chip', base: [{ prop: 'padding-inline', value: 'var(--space-s)' }, { prop: 'border-radius', value: 'var(--radius-m)' }, { prop: 'height', value: '24px' }],
    raw: [], text: null, stroke: false,
    variants: [{ prop: 'Tone', value: 'Danger', selector: '.chip--danger', decls: [{ prop: 'background-color', value: 'var(--danger)' }], raw: [] }],
  };
  const entry = { props: { Tone: { type: 'enum', values: ['Neutral', 'Danger'], default: 'Neutral' }, Label: { type: 'text' } } };
  const out = shadcnScaffold('Chip', { entry, rules, el: { tag: 'span', attrs: '' }, cfg: shadcnConfig(FIXTURE), hasSlot: true });
  assert.equal(out.file, 'src/components/ui/chip.tsx');
  assert.match(out.text, /const chipVariants = cva\("box-border px-\(--space-s\) rounded-\(--radius-m\)"/);
  assert.match(out.text, /Danger: "bg-\(--danger\)"/);
  assert.match(out.text, /defaultVariants: \{\n {4}tone: "Neutral"/);
  assert.match(out.text, /import \{ cn \} from "@\/lib\/utils"/, 'cn from the alias components.json names');
  assert.match(out.text, /const Comp = asChild \? Slot : "span"/);
  assert.match(out.text, /data-slot="chip"/);
  assert.doesNotMatch(out.text, /-\[/, 'never a value in brackets');
  assert.ok(out.owed.some((o) => /height: 24px/.test(o)), 'a value that is no variable is left for the person');
  assert.equal(utilityOf({ prop: 'font-size', value: 'var(--text-s)' }), 'text-(length:--text-s)', 'a utility that reads two kinds says which');
});

// The same build-mode project the other scaffolds are tested on, written the shadcn way when it says so.
test('--scaffold --framework shadcn hands back components the shadcn way, each a .tsx in its ui folder', { timeout: 600000 }, async () => {
  const { spawnSync } = await import('node:child_process');
  const { writeFileSync: write, mkdirSync: mk } = await import('node:fs');
  const root = tempDir('shadcn-scaffold-');
  cpSync(join(ENGINE, 'test', 'fixtures', 'tidepool-figma'), root, { recursive: true });
  const cli = (...args) => spawnSync(process.execPath, [join(ENGINE, 'audit.mjs'), ...args], { cwd: root, encoding: 'utf8', env: { ...process.env, CI: '1', NO_COLOR: '1' } });
  cli();
  mk(join(root, 'src/styles'), { recursive: true });
  write(join(root, 'src/styles/tokens.css'), readFileSync(join(root, '.design-system-engine-out/handback/tokens-to-build.css'), 'utf8'));
  // components.json is how a shadcn project says what it is and where its components go: nothing else is asked.
  write(join(root, 'components.json'), JSON.stringify({ style: 'new-york', tsx: true, tailwind: { css: 'src/styles/tokens.css' }, aliases: { components: '@/components', ui: '@/components/ui', utils: '@/lib/utils' } }));
  const out = cli('--scaffold').stdout;
  assert.match(out, /files? written from what is exact in Figma \(shadcn\)/, out.slice(0, 1500));
  assert.match(out, /• button → src\/components\/ui\/button\.tsx/);
  const patch = readFileSync(join(root, '.design-system-engine-out/handback/scaffold.patch'), 'utf8');
  assert.match(patch, /\+const buttonVariants = cva\(/);
  assert.match(patch, /\+import \{ cn \} from "@\/lib\/utils"/);
  assert.doesNotMatch(patch, /\+.*className=\{?"[^"]*-\[/, 'no value in brackets');
  assert.ok(!existsSync(join(root, 'src/components/ui')), 'nothing is written to the code');
});

test('setup reads a shadcn/ui project from its components.json: its tokens are the stylesheet it names', { timeout: 300000 }, async () => {
  const { spawnSync, execFileSync } = await import('node:child_process');
  const { rmSync } = await import('node:fs');
  const dir = tempDir('shadcn-setup-');
  cpSync(FIXTURE, dir, { recursive: true });
  rmSync(join(dir, 'ds-config.json'));
  execFileSync('git', ['init', '-q'], { cwd: dir });
  const r = spawnSync(process.execPath, [join(ENGINE, 'audit.mjs'), '--init', '--theme-css=', '--no-hooks'], { cwd: dir, encoding: 'utf8', env: { ...process.env, CI: '1', NO_COLOR: '1' } });
  assert.match(r.stdout, /A shadcn\/ui project \(components\.json\): its components in src\/components\/ui, its tokens in src\/index\.css/, r.stdout.slice(0, 2000));
  assert.equal(JSON.parse(readFileSync(join(dir, 'ds-config.json'), 'utf8')).paths.themeCSS, 'src/index.css');
});

// Found building a shadcn/ui system's style guide: the page carried its theme file as written (@import "tailwindcss",
// @theme), so none of its utilities applied and its switch was drawn 16px by 6px and grey, and a component Figma has
// was not drawn at all, its markup carrying no class of its name. The compiled Tailwind comes from the build, its reset
// kept to the drawings, and data-slot says which component a drawing is.
test('its style guide page draws it with its compiled Tailwind, checked and not, the guide around it untouched', { skip: READY, timeout: budget(600000) }, async () => {
  const { spawnSync } = await import('node:child_process');
  const { writeFileSync } = await import('node:fs');
  const dir = tempDir('shadcn-page-');
  cpSync(FIXTURE, dir, { recursive: true });
  symlinkSync(TOOLS, join(dir, 'node_modules'), 'dir');
  writeFileSync(join(dir, 'src', 'figma-component-props.snapshot.json'), JSON.stringify({ Switch: { nodeId: '2:1', properties: { Checked: { type: 'VARIANT', defaultValue: 'False', variantOptions: ['False', 'True'] } } } }));
  const cfg = JSON.parse(readFileSync(join(dir, 'ds-config.json'), 'utf8'));
  cfg.paths.compPropsSnapshot = 'src/figma-component-props.snapshot.json';
  writeFileSync(join(dir, 'ds-config.json'), JSON.stringify(cfg));
  const r = spawnSync(process.execPath, [join(ENGINE, 'audit.mjs'), '--styleguide', '--here', '--no-publish', '--no-a11y-bake'], { cwd: dir, encoding: 'utf8', env: { ...process.env, CI: '1', NO_COLOR: '1', CHROME_PATH: CHROME } });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const page = join(dir, '.design-system-engine-out', 'styleguide', 'index.html');
  assert.match(readFileSync(page, 'utf8'), /@layer base \{\n@scope \(\.pg-preview, /, 'Tailwind\'s reset kept to the drawings');
  const browser = await launchChrome(CHROME, { tmpPrefix: 'dse-shadcn-page-' });
  try {
    const { send } = await connectCDP(browser.wsUrl);
    const look = async (hash) => {
      const { sessionId } = await openPage(send, `file://${page}${hash}`);
      await waitForTrue(send, sessionId, `!!document.querySelector('#c-Switch .pg-preview [data-slot="switch"]')`, { attempts: 400, intervalMs: 50, tolerateErrors: true });
      const v = await send('Runtime.evaluate', { expression: `JSON.stringify((() => { const s = document.querySelector('#c-Switch .pg-preview [data-slot="switch"]'), r = s.getBoundingClientRect(); return { state: s.getAttribute('data-state'), size: [r.width, r.height], bg: getComputedStyle(s).backgroundColor, nav: getComputedStyle(document.querySelector('.sg-nav')).padding }; })())`, returnByValue: true }, sessionId);
      return JSON.parse(v.result.value);
    };
    const off = await look('#c-Switch'), on = await look('#c-Switch?Checked=true');
    assert.deepEqual(off.size, [32, 20], `h-5 w-8, compiled: ${JSON.stringify(off)}`);
    assert.equal(off.state, 'unchecked');
    assert.equal(on.state, 'checked', 'Figma\'s Checked is Radix\'s checked');
    assert.notEqual(on.bg, off.bg, 'its data-[state=checked] colour');
    assert.notEqual(off.nav, '0px', 'the guide\'s own menu keeps its padding: the reset stays inside the drawings');
  } finally { browser.kill(); }
});
