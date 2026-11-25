// a11y-lint.mjs - the accessibility lint a team already runs in its editor, counted beside the engine's own checks.
//
// eslint-plugin-jsx-a11y (React), eslint-plugin-vuejs-accessibility (Vue) and angular-eslint's template rules
// (Angular), all MIT, and eslint-plugin-lit-a11y (Lit, ISC) show an accessibility problem as an engineer types: a
// missing alt, a click on a div, a label with no control. A team that has one has decided to hold its code to it, so
// what it reports belongs in the accessibility result, beside what the engine found in the browser, with the file and
// line it is on. A team with none is told the one that fits its framework, and nothing is installed: the engine's own
// checks stay a whole path without it. Plain custom elements write their markup in strings no lint reads, so for them
// the engine's checks in the browser are the whole answer, and that is said.
//
//   a11yLintSetup(ROOT, configs)          → { plugins: [{ id, framework, file, installed }], propose: { id, framework } | null }
//   a11yLintFindings(ROOT, files, setup)  → { ran, plugins, findings: [{ file, line, rule, message, severity }], byRule, why? }
//
// Only the project's own ESLint is run, from its node_modules, never fetched: a linter that is not installed is said
// to be, and nothing else happens. The engine changes no code and no config.
import { existsSync, readFileSync } from 'node:fs';
import { projectBin, runBin } from './project-bin.mjs';
import { resolve, join, dirname } from 'node:path';
import { execFileSync } from 'node:child_process';
import { lintConfigs } from './lint-config.mjs';
import { underRoot, slashed } from './shown-path.mjs';

export const PLUGINS = [
  { id: 'eslint-plugin-jsx-a11y', prefix: 'jsx-a11y/', framework: 'react', named: /jsx-a11y|jsxA11y/ },
  { id: 'eslint-plugin-vuejs-accessibility', prefix: 'vuejs-accessibility/', framework: 'vue', named: /vuejs-accessibility|vueA11y|vuejsAccessibility/ },
  // Angular's template plugin holds other rules too (eqeqeq, no-any): only its accessibility set counts here, the one
  // angular-eslint's own template-accessibility config turns on, and no-positive-tabindex.
  { id: '@angular-eslint/eslint-plugin-template', prefix: '@angular-eslint/template/', framework: 'angular', named: /template-accessibility|templateAccessibility|@angular-eslint\/template\/(alt-text|valid-aria|elements-content)/, license: 'MIT',
    only: ['alt-text', 'click-events-have-key-events', 'elements-content', 'interactive-supports-focus', 'label-has-associated-control', 'mouse-events-have-key-events', 'no-autofocus', 'no-distracting-elements', 'role-has-required-aria', 'table-scope', 'valid-aria', 'no-positive-tabindex'] },
  { id: 'eslint-plugin-lit-a11y', prefix: 'lit-a11y/', framework: 'lit', named: /lit-a11y|litA11y/, license: 'ISC' },
];
const licenseOf = (id) => PLUGINS.find((p) => p.id === id)?.license ?? 'MIT';
// Whether a rule the team's ESLint reported is one of a plugin's accessibility rules.
const a11yRule = (p, ruleId) => ruleId.startsWith(p.prefix) && (!p.only || p.only.includes(ruleId.slice(p.prefix.length)));

const readJson = (f) => { try { return JSON.parse(readFileSync(f, 'utf8')); } catch { return null; } };

// What the project is written in, from its own packages: the plugin to propose is the one for that framework.
export function frameworkOf(ROOT) {
  const p = readJson(join(ROOT, 'package.json')) ?? {};
  const deps = { ...p.dependencies, ...p.devDependencies, ...p.peerDependencies };
  if (deps.vue || deps.nuxt) return 'vue';
  if (deps.react || deps.next || deps['react-dom']) return 'react';
  if (deps['@angular/core']) return 'angular';
  if (deps.lit || deps['lit-element']) return 'lit';
  if (p.customElements || existsSync(join(ROOT, 'custom-elements.json'))) return 'web-components';
  return null;
}

// Which of the two the team's ESLint config uses: a rule of the plugin's set, or the plugin named (its import, its
// extends, its plugins entry). Installed or not is said apart, since a config can name a plugin nobody installed.
export function a11yLintSetup(ROOT, configs = lintConfigs(ROOT)) {
  const eslint = configs.filter((c) => c.tool === 'eslint');
  const texts = eslint.map((c) => { try { return { c, text: readFileSync(resolve(ROOT, c.file), 'utf8') }; } catch { return { c, text: '' }; } });
  const plugins = [];
  for (const p of PLUGINS) {
    const hit = texts.find(({ c, text }) => Object.keys(c.settings ?? {}).some((k) => k.startsWith(p.prefix)) || p.named.test(text));
    if (hit) plugins.push({ id: p.id, framework: p.framework, file: hit.c.file, installed: existsSync(join(ROOT, 'node_modules', p.id, 'package.json')) });
  }
  const fw = frameworkOf(ROOT);
  const want = PLUGINS.find((p) => p.framework === fw);
  return { plugins, framework: fw, propose: !plugins.length && want ? { id: want.id, framework: fw } : null };
}

// What the team's ESLint reports from its accessibility plugin, on the design system's component files. ESLint answers
// with exit 1 when it finds something, and that is still an answer.
export function a11yLintFindings(ROOT, files = [], setup = a11yLintSetup(ROOT), { run = execFileSync } = {}) {
  const ready = setup.plugins.filter((p) => p.installed);
  const none = (why) => ({ ran: false, plugins: setup.plugins, findings: [], byRule: {}, why });
  if (!setup.plugins.length) return none(null);
  if (!ready.length) return none(`${setup.plugins.map((p) => p.id).join(' and ')} named in ${setup.plugins[0].file} but not installed (npm install), so not run`);
  const bin = projectBin(ROOT, 'eslint');
  if (!bin) return none('the project has no ESLint installed to run its accessibility rules with');
  // An Angular component's template is its own .html file, named by its templateUrl, and angular-eslint lints it.
  const angular = ready.some((p) => p.framework === 'angular');
  const mine = files.filter((f) => /\.(vue|jsx|tsx|js|ts)$/i.test(f) || (angular && /\.html$/i.test(f)));
  if (angular) for (const f of mine.filter((x) => /\.ts$/i.test(x))) {
    let t = ''; try { t = readFileSync(resolve(ROOT, f), 'utf8'); } catch { /* a file that cannot be read has no template to add */ }
    const url = /templateUrl\s*:\s*['"`]([^'"`]+\.html)['"`]/.exec(t)?.[1];
    const html = url && slashed(join(dirname(f), url));
    if (html && !mine.includes(html) && existsSync(resolve(ROOT, html))) mine.push(html);
  }
  if (!mine.length) return none('no component file to lint');
  let text;
  try { text = String(runBin(bin, ['--format', 'json', ...mine], run, { cwd: ROOT, timeout: 120000, maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] })); }
  catch (e) { text = String(e?.stdout ?? ''); }
  let list;
  try { list = JSON.parse(text.slice(text.indexOf('['))); } catch { return none('ESLint did not answer with its report'); }
  const used = ready.map((p) => PLUGINS.find((x) => x.id === p.id));
  const findings = [];
  for (const f of list) for (const m of f.messages ?? []) {
    if (!m.ruleId || !used.some((p) => a11yRule(p, m.ruleId))) continue;
    findings.push({ file: underRoot(resolve(ROOT), String(f.filePath)), line: m.line ?? null, rule: m.ruleId, message: m.message, severity: m.severity === 2 ? 'error' : 'warning' });
  }
  const byRule = {};
  for (const x of findings) byRule[x.rule] = (byRule[x.rule] ?? 0) + 1;
  return { ran: true, plugins: setup.plugins, findings, byRule };
}

// The lines said beside the engine's own: what the team's lint found, or the plugin that fits, proposed.
export function a11yLintLines(r, setup) {
  if (r?.ran) {
    const n = r.findings.length;
    const rules = Object.entries(r.byRule).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([k, v]) => `${k} ${v}`).join(' · ');
    return [n ? `⚠️  [a11y] the team's own accessibility lint (${r.plugins.filter((p) => p.installed).map((p) => p.id).join(', ')}) reports ${n}: ${rules}` : `✅ [a11y] the team's own accessibility lint (${r.plugins.filter((p) => p.installed).map((p) => p.id).join(', ')}) reports nothing`,
      ...r.findings.slice(0, 10).map((f) => `   ${f.file}${f.line ? `:${f.line}` : ''}  ${f.rule}: ${f.message}`)];
  }
  if (r?.why) return [`ℹ️  [a11y] the team's accessibility lint: ${r.why}`];
  if (setup?.propose) return [`ℹ️  [a11y] no accessibility lint in the team's ESLint. ${setup.propose.id} (${licenseOf(setup.propose.id)}) shows these problems as code is typed. Proposed, never installed: add it to the team's ESLint config if wanted.`];
  if (setup?.framework === 'web-components' && !setup.plugins?.length) return [`ℹ️  [a11y] plain custom elements write their markup in strings no accessibility lint reads, so the engine's checks in the browser are the whole answer for them.`];
  return [];
}
