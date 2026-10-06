// ui-check.mjs - check a generated UI against the design system's component catalog.
// Run from project root:  node ../rms-design-system-engine/ui-check.mjs <generated.json> [--json]
//                     or: rms-design-system-engine --check-ui <generated.json>
//
// The catalog is contracts/catalog.json (written by every audit run). The check is deterministic
// and prompt-blind: it never repairs the UI and never adds anything; it lists every finding with the
// rule it breaks. The findings are also written to .design-system-engine-out/ui-check.json, so a generation log
// can keep them beside the raw output.
//
// Exit 0 = valid (warnings allowed). Exit 1 = at least one error. Exit 2 = no catalog or no input.

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { checkUi, RULES } from './ui-catalog.mjs';
import { OUT_DIR } from './names.mjs';

const ROOT = process.cwd();
const args = process.argv.slice(2).filter((a) => a !== '--check-ui');
const JSON_MODE = args.includes('--json');
const input = args.find((a) => !a.startsWith('--'));

let cfg = {};
try { cfg = JSON.parse(readFileSync(join(ROOT, 'ds-config.json'), 'utf8')); } catch { /* defaults */ }
const catalogPath = resolve(ROOT, cfg.contracts?.out ?? 'contracts', 'catalog.json');

if (!input || !existsSync(resolve(ROOT, input))) {
  console.log('\nUsage: rms-design-system-engine --check-ui <generated-ui.json>');
  console.log('   The file is the UI a generator produced: a flat { root, components: [{ id, component, children, …props }] }');
  console.log('   list (A2UI style) or a nested { component, props, children } tree.\n');
  process.exit(2);
}
// A page or a component file (HTML, JSX, Vue, CSS) is not a generated UI: it gets the check every edit gets, on what
// changed since the last commit (all of it for a file not committed yet), instead of failing as JSON.
if (/\.(html?|jsx|tsx|vue|svelte|css|scss|less)$/i.test(input)) {
  const { editCheck } = await import('./edit-check.mjs');
  const abs = resolve(ROOT, input);
  const out = editCheck({ tool_name: 'Write', tool_input: { file_path: abs, content: readFileSync(abs, 'utf8') } }, { root: ROOT, cfg: { ...cfg, hooks: true, editCheck: true } });
  if (!out) { console.log(`\n✅ ${input}: what changed since the last commit uses only the system (the check every edit gets). --check-ui is for a generated UI in JSON.\n`); process.exit(0); }
  console.log(`\n${out}\n`);
  process.exit(1);
}
if (!existsSync(catalogPath)) {
  console.log(`\n⏭  ${catalogPath.replace(ROOT + '/', '')} not found. Run the audit once: it writes the catalog beside the contracts.\n`);
  process.exit(2);
}

let ui;
try { ui = JSON.parse(readFileSync(resolve(ROOT, input), 'utf8')); }
catch (e) { console.log(`\n❌ ${input} is not valid JSON (${e.message.split('\n')[0]}). Nothing was checked.\n`); process.exit(1); }

const catalog = JSON.parse(readFileSync(catalogPath, 'utf8'));
const r = checkUi(ui, catalog);
try {
  mkdirSync(join(ROOT, OUT_DIR), { recursive: true });
  writeFileSync(join(ROOT, OUT_DIR, 'ui-check.json'), JSON.stringify({ input, checked: new Date().toISOString(), ...r }, null, 2) + '\n');
} catch { /* the report file is optional */ }

if (JSON_MODE) { process.stdout.write(JSON.stringify(r, null, 2) + '\n'); process.exit(r.ok ? 0 : 1); }

console.log(`\nGenerated UI check  ·  ${input}  ·  ${r.counts.components} component(s)`);
console.log(`${r.ok ? '✅' : '❌'} ${r.counts.errors} error(s) · ${r.counts.warnings} warning(s)`);
for (const f of r.findings) console.log(`   ${f.level === 'error' ? '❌' : '⚠️ '} ${f.message}  (rule ${f.rule}: ${RULES[f.rule - 1]})`);
console.log('');
process.exit(r.ok ? 0 : 1);
