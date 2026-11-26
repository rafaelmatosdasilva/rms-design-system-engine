// The parts the README's badges say each framework works with, each proven by a real run on a system written in it, as
// Vue's are: its contracts (Write component specs), its control center and its component pages (Publish a living control
// center), and an example drafted for its intent layer from how a product writes it (Maintain usage guidelines). A
// Lit system with a plain Web Component beside it, an Angular one and a React one, each drawn by its own build.
//
// What these runs found, and what changed because of them:
//   - an Angular file was named acme-switch.component, so it paired with its component only while no other file wrote
//     its selector, and lost its contract the moment a product used it (component-pairing.mjs reads the name before .component)
//   - a Lit class registered in the file beside it had no tag in its contract (registeredTag, shared with the harness)
//   - the element a Lit, an Angular or a plain custom element renders never reached its contract (contract-a11y.mjs)
//   - a custom element's tag in a page, an Angular template or a Lit html`…` was never counted as a use, so none of them
//     had an example drafted (usage-map.mjs), and an Angular or a Lit call was not written in its own bindings
//     (intent-examples.mjs)
//   - a component page wrote the framework's name (html) where the code to write goes (styleguide-machine.mjs)
//
// The tests use each system's own build, laid in gitignored folders as CI does:
//   npm ci --prefix test/.lit-tools
//   npm ci --prefix test/.angular-tools
//   npm ci --prefix test/.react-tools
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { spawnSync, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { findChrome } from '../lib/cdp.mjs';
import { budget, fixtureProject } from './helpers.mjs';

const ENGINE = dirname(dirname(fileURLToPath(import.meta.url)));
const CHROME = findChrome({ playwright: true });
const browser = CHROME && typeof WebSocket !== 'undefined';
const env = { ...process.env, NO_COLOR: '1', CHROME_PATH: CHROME ?? '' };
const has = (tools, ...pkgs) => pkgs.every((p) => existsSync(join(ENGINE, 'test', tools, 'node_modules', p)));

// A system with its intent layer in a folder of its own, a page there for one component, and the product files given.
function system(fixture, tools, prefix, { files = {}, pages = {} }) {
  const overlay = join(ENGINE, 'test', 'fixtures', `${fixture}-parity`);
  const dir = fixtureProject(join(ENGINE, 'test', 'fixtures', fixture), prefix, existsSync(overlay) ? { overlay } : {});
  symlinkSync(join(ENGINE, 'test', tools, 'node_modules'), join(dir, 'node_modules'), 'dir');
  for (const [f, t] of Object.entries(files)) { mkdirSync(dirname(join(dir, f)), { recursive: true }); writeFileSync(join(dir, f), t); }
  mkdirSync(join(dir, 'docs', 'intent'), { recursive: true });
  for (const [name, { code, purpose }] of Object.entries(pages)) writeFileSync(join(dir, 'docs', 'intent', `${name}.md`), `---\ntitle: ${name}\nkind: component\ncomponent: ${code}\n---\n\n# ${name}\n\n${purpose}\n`);
  const cfg = join(dir, 'ds-config.json');
  writeFileSync(cfg, JSON.stringify({ ...JSON.parse(readFileSync(cfg, 'utf8')), intentLayer: 'docs/intent' }, null, 2) + '\n');
  const git = { ...process.env, GIT_AUTHOR_NAME: 'QA', GIT_AUTHOR_EMAIL: 'qa@example.com', GIT_COMMITTER_NAME: 'QA', GIT_COMMITTER_EMAIL: 'qa@example.com' };
  for (const args of [['add', '-A'], ['commit', '-qm', 'product and intent layer']]) execFileSync('git', args, { cwd: dir, env: git });
  return dir;
}
const run = (dir, ...args) => {
  const r = spawnSync(process.execPath, [join(ENGINE, 'audit.mjs'), ...args], { cwd: dir, encoding: 'utf8', env, timeout: budget(500000) });
  return `${r.stdout}\n${r.stderr}`;
};
// The three runs: the full check writes the contracts, the control center is built from them, and the intent layer's
// gaps are drafted with no model (an answers file with nothing in it), so only what the engine is sure of is written.
function threeRuns(dir) {
  const check = run(dir);
  assert.match(check, /📐 Contracts → contracts/, check.slice(-2000));
  const built = run(dir, '--styleguide', '--no-a11y-bake');
  assert.ok(existsSync(join(dir, '.design-system-engine-out', 'styleguide', 'index.html')), built.slice(-2000));
  const answers = join(dir, '.design-system-engine-out', 'no-answers.json');
  writeFileSync(answers, '{}\n');
  const drafted = run(dir, '--intent-changes', '--offline', '--drafts-from', answers);
  const changes = join(dir, '.design-system-engine-out', 'intent-changes', 'CHANGES.md');
  return { built, drafted, changes: existsSync(changes) ? readFileSync(changes, 'utf8') : drafted };
}
const contract = (dir, name) => JSON.parse(readFileSync(join(dir, 'contracts', `${name}.contract.json`), 'utf8'));
const page = (dir, name) => readFileSync(join(dir, '.design-system-engine-out', 'styleguide', 'c', `${name}.md`), 'utf8');
const codeOf = (c) => ({ ...c.source?.code, element: c.semantics?.element, props: [...c.props, ...(c.codeOnly ?? [])].map((p) => p.name).sort(), events: (c.events ?? []).map((e) => e.name) });

// ── Lit, and a plain Web Component beside it ──────────────────────────────────────────────────────────────────────────
const NOTE = `/** A short note set beside a field. */
export class AcmeNote extends HTMLElement {
  static observedAttributes = ['tone'];
  constructor() {
    super();
    this.attachShadow({ mode: 'open' }).innerHTML = \`<style>.acmeNote { margin: 0; padding: 4px 8px; }</style><p class="acmeNote" role="note"><slot></slot></p>\`;
  }
}
customElements.define('acme-note', AcmeNote);
`;
const SETTINGS_LIT = `import { LitElement, html } from 'lit';
import '../components/acme-switch.js';

export class SettingsPage extends LitElement {
  render() {
    return html\`<section>
      <acme-switch ?checked=\${this.alerts} @acme-change=\${this.toggleAlerts}></acme-switch>
      <acme-switch ?checked=\${this.sounds} @acme-change=\${this.toggleSounds}></acme-switch>
    </section>\`;
  }
}
customElements.define('settings-page', SettingsPage);
`;
const INDEX = '<!doctype html>\n<html lang="en"><body>\n  <acme-note tone="calm">Saved a moment ago</acme-note>\n  <acme-note tone="calm" onclick="dismiss()">Synced</acme-note>\n</body></html>\n';

const LIT_READY = browser && has('.lit-tools', 'lit') ? false : 'no Chrome, or no Lit build tools (npm ci --prefix test/.lit-tools)';
test('a Lit system and a plain Web Component: their contracts, their pages and their examples, each from its own code', { skip: LIT_READY, timeout: budget(1200000) }, async () => {
  const dir = system('acme-lit', '.lit-tools', 'parts-lit-', {
    files: { 'src/components/acme-note.js': NOTE, 'src/app/settings-page.ts': SETTINGS_LIT, 'index.html': INDEX },
    pages: { 'acme-switch': { code: 'src/components/acme-switch.component.ts', purpose: 'Turns one setting on or off, and it takes effect at once.' },
      'acme-note': { code: 'src/components/acme-note.js', purpose: 'Says something about the field beside it.' } },
  });
  const { built, changes } = threeRuns(dir);
  assert.match(built, /5 of 5 Lit components drawn with the project's own Lit\./, built.slice(-2000));

  // Write component specs: a Lit class registered in the file beside it, and a plain element, each read from its own code.
  assert.deepEqual(codeOf(contract(dir, 'acme-switch')), { file: 'src/components/acme-switch.component.ts', tag: 'acme-switch', syntax: 'html', element: 'button', props: ['checked'], events: ['acme-change'] });
  assert.equal(contract(dir, 'acme-switch').accessibility?.role?.value, 'switch');
  assert.deepEqual(codeOf(contract(dir, 'acme-note')), { file: 'src/components/acme-note.js', tag: 'acme-note', syntax: 'html', element: 'p', props: ['tone'], events: [] });
  assert.deepEqual(codeOf(contract(dir, 'acme-badge')).element, 'span', "a plain element's own <style> is never its element");
  assert.deepEqual(contract(dir, 'acme-switch').livesIn.files, [{ file: 'src/app/settings-page.ts', uses: 2 }], "a Lit html`…` that writes its tag uses it");
  assert.deepEqual(contract(dir, 'acme-note').livesIn.files, [{ file: 'index.html', uses: 2 }], 'a page that writes its tag uses it');

  // Publish a living control center: each component's page says how to write it, in its own syntax.
  assert.match(page(dir, 'acme-switch'), /## Write it like this\n\n```\n(?:.*\n)?<acme-switch><\/acme-switch>\n```\nIts tag is `acme-switch`\./);
  assert.match(page(dir, 'acme-switch'), /## Events\n\n- acme-change/);
  assert.match(page(dir, 'acme-note'), /\| tone \|/);
  assert.doesNotMatch(page(dir, 'acme-note'), /^html$/m, "the framework's name is never written where the code goes");

  // Maintain usage guidelines: the example drafted from the products' own calls, in each one's own bindings.
  assert.match(changes, /```html\n\s*<acme-switch \?checked=\$\{checked\} @acme-change=\$\{onAcmeChange\}><\/acme-switch>\n/, changes);
  assert.match(changes, /```html\n\s*<acme-note tone="…">\n\s*…\n\s*<\/acme-note>\n/, changes);
  assert.doesNotMatch(changes, /alerts|toggleAlerts|Saved a moment|dismiss/, "none of a product's own data");

  // Try components in a playground: the plain element drawn in its own shadow root, its attribute written as one.
  const file = join(dir, '.design-system-engine-out', 'styleguide', 'index.html');
  const seen = await opened(file, 'acme-note', (inPage) => inPage(`(() => { const el = document.querySelector('#c-acme-note .pg-preview acme-note');
    return { drawn: !!el?.shadowRoot?.querySelector('p.acmeNote'), code: document.querySelector('#c-acme-note .pg-code code')?.textContent ?? '' }; })()`));
  assert.equal(seen.drawn, true, 'drawn by its own code, inside its shadow root');
  assert.match(seen.code, /^<acme-note[\s\S]*><\/acme-note>$/, `its own tag, closed by its end tag: ${seen.code}`);
});

// ── Angular ───────────────────────────────────────────────────────────────────────────────────────────────────────────
const SETTINGS_NG = `import { Component, signal } from '@angular/core';
import { AcmeSwitchComponent } from '../components/acme-switch.component';

@Component({
  selector: 'app-settings',
  imports: [AcmeSwitchComponent],
  template: \`<section>
    <acme-switch [(checked)]="alerts" (changed)="saveAlerts($event)"></acme-switch>
    <acme-switch [(checked)]="sounds" (changed)="saveSounds($event)" *ngIf="ready"></acme-switch>
  </section>\`,
})
export class SettingsComponent {
  alerts = signal(true);
  sounds = signal(false);
  ready = true;
  saveAlerts(on: boolean) {}
  saveSounds(on: boolean) {}
}
`;
const NG_READY = browser && has('.angular-tools', '@angular/core', '@angular/compiler-cli', '@angular/build') ? false : 'no Chrome, or no Angular build tools (npm ci --prefix test/.angular-tools)';
test('an Angular system: its contracts, its pages and its examples, each from its own code', { skip: NG_READY, timeout: budget(1200000) }, () => {
  const dir = system('acme-angular', '.angular-tools', 'parts-ng-', {
    files: { 'src/app/settings.component.ts': SETTINGS_NG },
    pages: { 'acme-switch': { code: 'src/components/acme-switch.component.ts', purpose: 'Turns one setting on or off, and it takes effect at once.' } },
  });
  const { built, changes } = threeRuns(dir);
  assert.match(built, /3 of 3 Angular components drawn with the project's own Angular\./, built.slice(-2000));

  // A component a product uses keeps its file: the name before .component is its name.
  assert.deepEqual(codeOf(contract(dir, 'acme-switch')), { file: 'src/components/acme-switch.component.ts', tag: 'acme-switch', syntax: 'angular', element: 'button', props: ['checked'], events: ['checkedChange', 'changed'] });
  assert.deepEqual(contract(dir, 'acme-switch').accessibility?.aria?.value, ['aria-checked'], "Angular's [attr.aria-checked] is an aria attribute it sets");
  assert.deepEqual(contract(dir, 'acme-switch').livesIn.files, [{ file: 'src/app/settings.component.ts', uses: 2 }]);
  assert.deepEqual(contract(dir, 'acme-button').livesIn.files, [], 'its own template file is never a product using it');
  assert.equal(contract(dir, 'acme-button').semantics.element, 'button', 'read from its templateUrl');

  assert.match(page(dir, 'acme-switch'), /## Write it like this\n\n```\n(?:.*\n)?<acme-switch><\/acme-switch>\n```/);
  assert.match(changes, /```html\n\s*<acme-switch \[\(checked\)\]="checked" \(changed\)="onChanged\(\$event\)"><\/acme-switch>\n/, changes);
  assert.doesNotMatch(changes, /ngIf|saveAlerts|alerts/, 'its directives and its own data left out');
});

// ── React ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
const FILE_ROW = `import { MenuSheet } from '../components/MenuSheet.jsx';

export function FileRow({ file, actions }) {
  return (
    <div className="file-row">
      <span>{file.name}</span>
      <MenuSheet label="Actions" items={actions.filter((a) => a.allowed)} />
      <MenuSheet label="Share" items={file.shareTargets} />
    </div>
  );
}
`;
const REACT_READY = browser && has('.react-tools', 'react', 'react-dom', 'vite') ? false : 'no Chrome, or no React build tools (npm ci --prefix test/.react-tools)';
test('a React system: its contracts, its pages and its examples, each from its own code', { skip: REACT_READY, timeout: budget(1200000) }, () => {
  const dir = system('beacon-react', '.react-tools', 'parts-react-', {
    files: { 'src/app/FileRow.jsx': FILE_ROW },
    pages: { MenuSheet: { code: 'src/components/MenuSheet.jsx', purpose: 'The actions for one thing, kept out of sight until asked for.' } },
  });
  const { built, changes } = threeRuns(dir);
  assert.match(built, /4 of 4 React components drawn with the project's own React\./, built.slice(-2000));
  const menu = contract(dir, 'menuSheet');
  assert.deepEqual(codeOf(menu), { file: 'src/components/MenuSheet.jsx', tag: 'MenuSheet', syntax: 'jsx', element: 'div', props: ['items', 'label'], events: [] });
  assert.equal(menu.description, 'The actions for one thing, kept out of sight until asked for.', 'its intent layer page');
  assert.deepEqual(menu.livesIn.files, [{ file: 'src/app/FileRow.jsx', uses: 2 }]);
  assert.match(page(dir, 'menuSheet'), /## Write it like this\n\n```\n(?:.*\n)?<MenuSheet \/>\n```/);
  assert.match(changes, /```jsx\n\s*<MenuSheet label="…" items=\{items\} \/>\n/, changes);
});

// The page opened at one component, and asked something in it.
async function opened(file, name, ask) {
  const { launchChrome, connectCDP, openPage, waitForTrue, FILE_PAGE_LOADED } = await import('../lib/cdp.mjs');
  const c = await launchChrome(CHROME);
  try {
    const { send, close } = await connectCDP(c.wsUrl);
    const { sessionId } = await openPage(send, `file://${file}#c-${name}`);
    await waitForTrue(send, sessionId, FILE_PAGE_LOADED);
    const inPage = async (expression) => (await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }, sessionId)).result.value;
    for (let i = 0; i < 100 && !(await inPage(`!!(document.querySelector('#c-${name} .pg-preview') || {}).firstElementChild`)); i++) await new Promise((res) => setTimeout(res, 100));
    const out = await ask(inPage);
    close();
    return out;
  } finally { c.kill(); }
}
