// The Playground of a Lit, a plain Web Components and an Angular system as it is of a Vue one: the lists each case
// needs (a bar's tabs), read from the framework's own loops and written in its code as that framework binds them, and
// the way each framework enters and leaves (Angular's animate.enter and animate.leave, a custom element's :host).
//
// The real tests build the style guide of an invented Lit and an invented Angular system with each one's own build,
// laid in gitignored folders as CI does:
//   npm ci --prefix test/.lit-tools
//   npm ci --prefix test/.angular-tools
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, existsSync, symlinkSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { listLoops, listSamples } from '../lib/vue-harness.mjs';
import { angularEnterLeave, hostMotion, importOf } from '../lib/styleguide-data.mjs';
import { callName } from '../lib/component-api.mjs';
import { readPage } from '../lib/styleguide-files.mjs';
import { findChrome } from '../lib/cdp.mjs';
import { budget, tempDir } from './helpers.mjs';

const ENGINE = dirname(dirname(fileURLToPath(import.meta.url)));
const CHROME = findChrome({ playwright: true });

test("each framework's own loop over a list is read: Vue's v-for, Angular's @for and *ngFor, a Lit html's map", () => {
  assert.deepEqual(listLoops('<template><li v-for="(tab, i) in tabs">{{ tab.label }}</li></template>'), [{ item: 'tab', list: 'tabs' }]);
  assert.deepEqual(listLoops('@for (tab of tabs; track tab.label) { <b>{{ tab.label }}</b> } @for (s of steps(); track s) {}'), [{ item: 'tab', list: 'tabs' }, { item: 's', list: 'steps' }], 'a signal input read by its call too');
  assert.deepEqual(listLoops('<li *ngFor="let item of items; trackBy: id">{{ item.title }}</li>'), [{ item: 'item', list: 'items' }]);
  assert.deepEqual(listLoops('render() { return html`${this.tabs.map((tab) => html`<button>${tab.label}</button>`)}`; }'), [{ item: 'tab', list: 'tabs' }]);
  // The fields each item is used by are the ones its samples are given, in a Lit component as in a Vue one.
  const lit = listSamples('render() { return html`${this.tabs.map((tab) => html`<button aria-selected=${tab.selected}>${tab.label}</button>`)}`; }', ['tabs']);
  assert.deepEqual(Object.keys(lit.tabs[0]).sort(), ['label', 'selected']);
  assert.equal(lit.tabs.length, 3);
  assert.deepEqual(listSamples('render() { return html`${this.rows.map((r) => r.id)}`; }', ['tabs']), {}, 'a list that is no prop of its own is not filled');
});

test('Angular enters and leaves with the classes its template names, and a custom element with its :host animations', () => {
  assert.deepEqual(angularEnterLeave('<div class="acmeToast" role="status" animate.enter="acmeToast--in" animate.leave="acmeToast--out"></div>'), { enter: 'acmeToast--in', leave: 'acmeToast--out', at: 'acmeToast' });
  assert.equal(angularEnterLeave('<div class="acmeToast"></div>'), null);
  assert.deepEqual(hostMotion(':host { display: block; animation: rise 200ms; } :host(.closing) { animation: sink 150ms; } :host([leaving]) { animation: sink 1s; } @keyframes rise { from { opacity: 0 } }'),
    { entry: true, exits: [{ cls: 'closing' }, { attr: 'leaving' }] });
  assert.equal(hostMotion(':host { display: block; } .spinner { animation: spin 1s infinite; }'), null, 'a host that does not move, and a loop that never ends, are not an entry');
});

test('a Lit, a plain custom element and an Angular component are written by their own tags, and Angular brought in by its class', () => {
  const lit = "import { LitElement, html } from 'lit';\nexport class AcmeTabs extends LitElement { render() { return html`<div></div>`; } }\ncustomElements.define('acme-tabs', AcmeTabs);\n";
  assert.deepEqual(callName('acme-tabs', '/x/acme-tabs.js', lit), { tag: 'acme-tabs', syntax: 'html', framework: 'lit' });
  const plain = "export class AcmeBadge extends HTMLElement { connectedCallback() { this.innerHTML = '<span></span>'; } }\ncustomElements.define('acme-badge', AcmeBadge);\n";
  assert.deepEqual(callName('acme-badge', '/x/acme-badge.js', plain), { tag: 'acme-badge', syntax: 'html' });
  const ng = "import { Component, Input } from '@angular/core';\n@Component({ selector: 'acme-tabs', standalone: true, template: '<div></div>' })\nexport class AcmeTabsComponent { @Input() tabs = []; }\n";
  assert.deepEqual(callName('acme-tabs', '/x/acme-tabs.component.ts', ng), { tag: 'acme-tabs', syntax: 'angular', exportName: 'AcmeTabsComponent' });
  assert.equal(importOf({ tag: 'acme-tabs', syntax: 'angular', exportName: 'AcmeTabsComponent', file: 'src/components/acme-tabs.component.ts' }).line, "import { AcmeTabsComponent } from '@/components/acme-tabs.component';");
});

// ── The real thing: each system's style guide built with its own build, and its Playground opened in Chrome ──
const TABS_LIT = `import { LitElement, html, css } from 'lit';

export class AcmeTabs extends LitElement {
  static styles = css\`.acmeTabs { display: flex; gap: 4px; } .acmeTabs__tab--on { border-bottom: 2px solid var(--acme-accent); }\`;
  static properties = { tabs: { type: Array } };
  constructor() { super(); this.tabs = []; }
  render() {
    return html\`<div class="acmeTabs" role="tablist">\${this.tabs.map((tab) => html\`<button class="acmeTabs__tab \${tab.selected ? 'acmeTabs__tab--on' : ''}" role="tab" aria-selected=\${String(!!tab.selected)}>\${tab.label}</button>\`)}</div>\`;
  }
}
customElements.define('acme-tabs', AcmeTabs);
`;
const TOAST_LIT = `import { LitElement, html, css } from 'lit';

export class AcmeToast extends LitElement {
  static styles = css\`
    :host { display: block; animation: acme-rise 200ms ease-out; }
    :host(.closing) { animation: acme-sink 150ms ease-in forwards; }
    @keyframes acme-rise { from { opacity: 0; } }
    @keyframes acme-sink { to { opacity: 0; } }
    .acmeToast { padding: 8px 12px; background: var(--acme-accent); }\`;
  render() { return html\`<div class="acmeToast" role="status"><slot></slot></div>\`; }
}
customElements.define('acme-toast', AcmeToast);
`;
const TABS_NG = `import { Component, Input } from '@angular/core';

export interface AcmeTab { label: string; selected?: boolean; }

/** Moves between views of one page. */
@Component({
  selector: 'acme-tabs',
  standalone: true,
  template: \`<div class="acmeTabs" role="tablist">@for (tab of tabs; track tab.label) {<button class="acmeTabs__tab" [class.acmeTabs__tab--on]="tab.selected" role="tab" [attr.aria-selected]="!!tab.selected">{{ tab.label }}</button>}</div>\`,
  styles: [\`.acmeTabs { display: flex; gap: 4px; } .acmeTabs__tab--on { border-bottom: 2px solid var(--acme-accent); }\`],
})
export class AcmeTabsComponent {
  @Input() tabs: AcmeTab[] = [];
}
`;
const TOAST_NG = `import { Component } from '@angular/core';

/** A short message that comes and goes. */
@Component({
  selector: 'acme-toast',
  standalone: true,
  templateUrl: './acme-toast.component.html',
  styles: [\`.acmeToast { padding: 8px 12px; background: var(--acme-accent); } .acmeToast--in { animation: acme-rise 200ms ease-out; } .acmeToast--out { animation: acme-sink 150ms ease-in forwards; } @keyframes acme-rise { from { opacity: 0; } } @keyframes acme-sink { to { opacity: 0; } }\`],
})
export class AcmeToastComponent {}
`;

const system = (fixture, tools, files, prefix) => {
  const dir = tempDir(prefix);
  cpSync(join(ENGINE, 'test', 'fixtures', fixture), dir, { recursive: true });
  symlinkSync(join(ENGINE, 'test', tools, 'node_modules'), join(dir, 'node_modules'), 'dir');
  for (const [f, t] of Object.entries(files)) writeFileSync(join(dir, 'src', 'components', f), t);
  writeFileSync(join(dir, 'ds-config.json'), JSON.stringify({ name: 'Acme', paths: { themeCSS: 'src/styles/tokens.css' } }, null, 2));
  spawnSync('git', ['init', '-q'], { cwd: dir });
  return dir;
};
const build = (dir) => {
  const r = spawnSync(process.execPath, [join(ENGINE, 'audit.mjs'), '--styleguide', '--no-a11y-bake'], { cwd: dir, encoding: 'utf8', env: { ...process.env, NO_COLOR: '1', CHROME_PATH: CHROME }, timeout: budget(400000) });
  const file = join(dir, '.design-system-engine-out', 'styleguide', 'index.html');
  return { r, file, data: existsSync(file) ? JSON.parse(readPage(file).match(/id="sg-data">([\s\S]*?)<\/script>/)[1]) : null };
};
// The page opened at one component, and asked things in it.
const opened = async (file, name, ask) => {
  const { launchChrome, connectCDP, openPage, waitForTrue, FILE_PAGE_LOADED } = await import('../lib/cdp.mjs');
  const c = await launchChrome(CHROME);
  try {
    const { send, close } = await connectCDP(c.wsUrl);
    const { sessionId } = await openPage(send, `file://${file}#c-${name}`);
    await waitForTrue(send, sessionId, FILE_PAGE_LOADED);
    const inPage = async (expression) => (await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }, sessionId)).result.value;
    const go = async (n) => { await inPage(`location.hash = '#c-${n}'`); for (let i = 0; i < 100 && !(await inPage(`!!(document.querySelector('#c-${n} .pg-preview') || {}).firstElementChild`)); i++) await new Promise((res) => setTimeout(res, 100)); };
    await go(name);
    const out = await ask(inPage, go);
    close();
    return out;
  } finally { c.kill(); }
};

const LIT_READY = CHROME && typeof WebSocket !== 'undefined' && existsSync(join(ENGINE, 'test', '.lit-tools', 'node_modules', 'lit')) ? false : 'no Chrome, or no Lit build tools (npm ci --prefix test/.lit-tools)';
test("a Lit system's Playground draws a bar with its tabs, writes them as Lit binds them, and plays its host's entry and exit", { skip: LIT_READY, timeout: budget(600000) }, async () => {
  const dir = system('acme-lit', '.lit-tools', { 'acme-tabs.js': TABS_LIT, 'acme-toast.js': TOAST_LIT }, 'pg-lit-');
  const { r, file, data } = build(dir);
  assert.match(r.stdout, /5 of 5 Lit components drawn with the project's own Lit\./, `${r.stdout}\n${r.stderr}`.slice(-2000));
  const tabs = data.components.find((c) => c.name === 'acme-tabs');
  assert.equal(tabs.codeLists.tabs.length, 3, JSON.stringify(tabs.codeLists));
  assert.deepEqual([tabs.api.tag, tabs.api.syntax, tabs.api.framework], ['acme-tabs', 'html', 'lit'], 'its own tag, never its class');
  assert.deepEqual(data.components.find((c) => c.name === 'acme-toast').hostMotion, { entry: true, exits: [{ cls: 'closing' }] });
  const seen = await opened(file, 'acme-tabs', async (inPage, go) => {
    const drawn = await inPage(`document.querySelector('#c-acme-tabs .pg-preview acme-tabs').shadowRoot.querySelectorAll('[role="tab"]').length`);
    const code = await inPage(`document.querySelector('#c-acme-tabs .pg-code code').textContent`);
    await go('acme-toast');
    const buttons = await inPage(`[...document.querySelectorAll('#c-acme-toast .pg-actions button')].map((b) => b.textContent.trim())`);
    // An exit puts its class on the host, and the drawing comes back once it has played.
    const during = await inPage(`(() => { [...document.querySelectorAll('#c-acme-toast .pg-actions button')].find((b) => /Play exit/.test(b.textContent)).click(); return document.querySelector('#c-acme-toast .pg-preview acme-toast').classList.contains('closing'); })()`);
    await new Promise((res) => setTimeout(res, 1200));
    const after = await inPage(`document.querySelector('#c-acme-toast .pg-preview acme-toast').classList.contains('closing')`);
    return { drawn, code, buttons, during, after };
  });
  assert.equal(seen.drawn, 3, 'the bar is drawn with its three tabs, not empty');
  assert.match(seen.code, /^<acme-tabs\s+\.tabs=\$\{\[\{ [^}]*label: 'Label 1'/, `Lit's property binding: ${seen.code}`);
  assert.match(seen.code, /><\/acme-tabs>$/, 'a custom element closed by its end tag');
  assert.deepEqual(seen.buttons.filter((b) => /^Play /.test(b)), ['Play entry', 'Play exit']);
  assert.deepEqual([seen.during, seen.after], [true, false]);
});

const NG_TOOLS = join(ENGINE, 'test', '.angular-tools', 'node_modules');
const NG_READY = CHROME && typeof WebSocket !== 'undefined' && ['@angular/core', '@angular/compiler-cli', '@angular/build'].every((p) => existsSync(join(NG_TOOLS, p))) ? false : 'no Chrome, or no Angular build tools (npm ci --prefix test/.angular-tools)';
test("an Angular system's Playground draws a bar with its tabs, writes them as Angular binds them, and plays animate.enter and animate.leave", { skip: NG_READY, timeout: budget(600000) }, async () => {
  const dir = system('acme-angular', '.angular-tools', { 'acme-tabs.component.ts': TABS_NG, 'acme-toast.component.ts': TOAST_NG,
    'acme-toast.component.html': '<div class="acmeToast" role="status" animate.enter="acmeToast--in" animate.leave="acmeToast--out"><ng-content /></div>\n' }, 'pg-ng-');
  const { r, file, data } = build(dir);
  assert.match(r.stdout, /5 of 5 Angular components drawn with the project's own Angular\./, `${r.stdout}\n${r.stderr}`.slice(-2000));
  const tabs = data.components.find((c) => c.name === 'acme-tabs');
  assert.equal(tabs.codeLists.tabs.length, 3, JSON.stringify(tabs.codeLists));
  assert.equal(tabs.import.line, "import { AcmeTabsComponent } from '@/components/acme-tabs.component';", 'brought in by its class, used by its selector');
  assert.deepEqual(data.components.find((c) => c.name === 'acme-toast').enterLeave, { enter: 'acmeToast--in', leave: 'acmeToast--out', at: 'acmeToast' }, 'read from its templateUrl file');
  const seen = await opened(file, 'acme-tabs', async (inPage, go) => {
    const drawn = await inPage(`document.querySelectorAll('#c-acme-tabs .pg-preview [role="tab"]').length`);
    const code = await inPage(`document.querySelector('#c-acme-tabs .pg-code code').textContent`);
    await go('acme-toast');
    const hide = `[...document.querySelectorAll('#c-acme-toast .pg-actions button')].find((b) => /^(Hide|Show) /.test(b.textContent.trim()))`;
    const label = await inPage(`(${hide} || {}).textContent`);
    const during = await inPage(`(() => { ${hide}.click(); return document.querySelector('#c-acme-toast .pg-preview .acmeToast').classList.contains('acmeToast--out'); })()`);
    await new Promise((res) => setTimeout(res, 600));
    const hidden = await inPage(`[document.querySelector('#c-acme-toast .pg-preview .acmeToast').style.visibility, document.querySelector('#c-acme-toast .pg-preview .acmeToast').classList.contains('acmeToast--out'), ${hide}.textContent.trim()]`);
    return { drawn, code, label, during, hidden };
  });
  assert.equal(seen.drawn, 3, 'the bar is drawn with its three tabs, not empty');
  assert.match(seen.code, /^<acme-tabs\s+\[tabs\]="\[\{ [^}]*label: 'Label 1'/, `Angular's input binding: ${seen.code}`);
  assert.match(seen.label.trim(), /^Hide acme-toast$/);
  assert.equal(seen.during, true, 'its own leave class, as Angular puts it on');
  assert.deepEqual(seen.hidden, ['hidden', false, 'Show acme-toast'], 'gone once it has played, the class taken off');
});
