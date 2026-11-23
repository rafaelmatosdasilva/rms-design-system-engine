// ui-check.mjs - check a generated UI against the design system's component catalog.
// Run from project root:  node ../rms-design-system-engine/lib/ui-check.mjs <generated.json> [--json]
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
import { a2uiVersion, versionMismatch } from './a2ui-catalog.mjs';
import { cardsRead } from './cards-read.mjs';
import { noteInvented } from './invented.mjs';
import { OUT_DIR } from './names.mjs';
import { underRoot } from './shown-path.mjs';

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
  console.log('   list, A2UI\'s own updateComponents messages (one, a list, or a JSONL stream), or a nested { component, props, children } tree.\n');
  process.exit(2);
}
// A page or a component file (HTML, JSX, Vue, CSS) is not a generated UI: it gets the check every edit gets, on what
// changed since the last commit (all of it for a file not committed yet), instead of failing as JSON.
if (/\.(html?|jsx|tsx|vue|svelte|css|scss|less)$/i.test(input)) {
  const { editCheck } = await import('./edit-check.mjs');
  const abs = resolve(ROOT, input);
  const event = { tool_name: 'Write', tool_input: { file_path: abs, content: readFileSync(abs, 'utf8') } };
  // A page in prototypes/ is held to the system as a prototype is: its components, what each is given, where each goes.
  const page = (await import('./page-check.mjs')).pageHookCheck(event, { root: ROOT, cfg: { ...cfg, hooks: true, editCheck: true }, outDir: OUT_DIR });
  const out = [editCheck(event, { root: ROOT, cfg: { ...cfg, hooks: true, editCheck: true } }), page].filter(Boolean).join('\n\n') || null;
  // Passing is the end of the task: the reply says what changed, and nothing more is run to confirm it (a server, a
  // screenshot, a browser install): the check above is the confirmation.
  if (!out) { console.log(`\n✅ ${input}: what changed since the last commit uses only the system (the check every edit gets). --check-ui is for a generated UI in JSON.\nNEXT: the change is checked. Reply now, in the chat: what you added and where, and anything the system did not have for it. Run nothing more to confirm it.\n`); process.exit(0); }
  console.log(`\n${out}\n`);
  process.exit(1);
}
if (!existsSync(catalogPath)) {
  console.log(`\n⏭  ${underRoot(ROOT, catalogPath)} not found. Run the audit once: it writes the catalog beside the contracts.\n`);
  process.exit(2);
}

let ui;
const text = readFileSync(resolve(ROOT, input), 'utf8');
try { ui = JSON.parse(text); }
catch (e) {
  // A2UI streams its messages one per line (JSONL): read as the list of messages it is.
  try { const lines = text.split('\n').map((l) => l.trim()).filter(Boolean); if (lines.length < 2) throw e; ui = lines.map((l) => JSON.parse(l)); }
  catch { console.log(`\n❌ ${input} is not valid JSON (${e.message.split('\n')[0]}). Nothing was checked.\n`); process.exit(1); }
}

const catalog = JSON.parse(readFileSync(catalogPath, 'utf8'));
// Which cards this project handed over recently, so a component written from its name alone is said (rule 6).
// Nothing noted at all means nothing is known, not that nothing was read: the rule then says nothing. Only once a
// card has been handed over is there a basis to say another was not.
const read = cardsRead(ROOT);
const r = checkUi(ui, catalog, { cardsRead: read.size ? read : null });
// A2UI's messages say their version: held to the one the team declared, never to whichever the agent wrote.
if (r.a2ui) {
  const declared = a2uiVersion(cfg);
  const off = declared?.version ? versionMismatch(r.a2ui.versions, declared.version) : null;
  if (off) { r.findings.push({ rule: 4, level: 'error', id: null, message: off, at: null }); r.counts.errors++; r.ok = false; }
}
// What this page invented, kept so the catalog can reject it by name next time rather than after the fact.
noteInvented(ROOT, r.findings);
try {
  mkdirSync(join(ROOT, OUT_DIR), { recursive: true });
  writeFileSync(join(ROOT, OUT_DIR, 'ui-check.json'), JSON.stringify({ input, checked: new Date().toISOString(), ...r }, null, 2) + '\n');
} catch { /* the report file is optional */ }

if (JSON_MODE) { process.stdout.write(JSON.stringify(r, null, 2) + '\n'); process.exit(r.ok ? 0 : 1); }

console.log(`\nGenerated UI check  ·  ${input}  ·  ${r.counts.components} component(s)${r.a2ui ? `  ·  A2UI, ${r.a2ui.messages} updateComponents message(s)` : ''}`);
console.log(`${r.ok ? '✅' : '❌'} ${r.counts.errors} error(s) · ${r.counts.warnings} warning(s)`);
for (const f of r.findings) console.log(`   ${f.level === 'error' ? '❌' : '⚠️ '} ${f.message}  (rule ${f.rule}: ${RULES[f.rule - 1]})`);
console.log('');
process.exit(r.ok ? 0 : 1);
