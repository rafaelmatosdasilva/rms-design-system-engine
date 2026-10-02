// query.mjs - ask the design system a question from the terminal (idea I22).
// Run from project root:  rms-design-system-engine --query <term> [<term> …] [--json]
//
// An agent about to write UI asks for one component or token instead of reading the whole catalog, and
// gets the names exactly as they are written: a guessed name is the most common way generated code
// drifts. Read-only, over what every audit run already writes (contracts/catalog.json, contracts/tokens.json):
//   • a component: its selector and code file, each prop with its values and default as the code writes
//     them, Figma's own names where they differ (that is a parity difference), the names an agent is
//     likely to guess wrong, slots, what it must never contain, when not to use it and what to use instead;
//   • a token: its CSS variable, its value in each mode, and for a text colour the surfaces it can be read on;
//   • anything else: the closest component and token names.
// Several terms answer in one call. With no catalog yet it runs the audit once to write it. Exit 0 when every term
// was found, 1 when one was not, 2 with no catalog (no ds-config.json to build one from).
import './stdio-sync.mjs';   // the whole answer reaches a pipe before process.exit
import { readFileSync, existsSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { resolveNamingSpec, tokenToVar } from './naming-convention.mjs';
import { envVar } from './names.mjs';

const norm = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');

// DTCG tokens → [{ path: 'surface/base/color', value, modes }]
export function flattenTokens(tree, prefix = []) {
  const out = [];
  for (const [k, v] of Object.entries(tree ?? {})) {
    if (k.startsWith('$') || !v || typeof v !== 'object') continue;
    // A contract written before the rename keeps its facts under the old extension name.
    const ext = v.$extensions?.['com.rms.design-system-engine'] ?? v.$extensions?.['com.rms.parity'];
    if ('$value' in v) out.push({ path: [...prefix, k].join('/'), value: v.$value, modes: ext?.modes ?? null, readableOn: ext?.readableOn ?? null, deprecated: v.$deprecated === true });
    else out.push(...flattenTokens(v, [...prefix, k]));
  }
  return out;
}

// One term → { kind: 'component', name, entry } | { kind: 'token', token, cssVar } | { kind: 'none', term, near }
export function answer(term, { catalog = {}, tokens = [], varOf = (p) => null } = {}) {
  const t = norm(term);
  const comps = Object.entries(catalog.components ?? {});
  const comp = comps.find(([n]) => norm(n) === t) ?? comps.find(([, e]) => norm(e.selector) === t);
  if (comp) return { kind: 'component', name: comp[0], entry: comp[1] };
  const tok = tokens.find((x) => norm(x.path) === t || norm(varOf(x.path)) === t || norm(x.path.replace(/\/(color|default)$/, '')) === t);
  if (tok) return { kind: 'token', token: tok, cssVar: varOf(tok.path) };
  const near = [...comps.map(([n]) => n), ...tokens.map((x) => x.path)].filter((n) => t && (norm(n).includes(t) || t.includes(norm(n)))).slice(0, 8);
  return { kind: 'none', term, near };
}

export function answerLines(a) {
  if (a.kind === 'none') return [`${a.term}: no component or token of that name${a.near.length ? `. Closest: ${a.near.join(', ')}` : ''}`];
  if (a.kind === 'token') {
    const { token: x, cssVar } = a;
    const modes = x.modes ? Object.entries(x.modes).map(([m, v]) => `${m} ${v}`).join(' · ') : String(x.value);
    return [`${x.path}${cssVar ? `  →  var(${cssVar})` : ''}  ${modes}${x.deprecated ? '  [deprecated]' : ''}`,
      ...(x.readableOn?.length ? [`  readable on (4.5:1 in every mode): ${x.readableOn.join(', ')}`] : [])];
  }
  const { name, entry: e } = a;
  const lines = [`${name}${e.selector ? `  (${e.selector})` : ''}${e.status ? `  [${e.status}]` : ''}`];
  if (e.description && !/captured from Figma by rms-design-system-engine/.test(e.description)) lines.push(`  ${e.description}`);
  const props = Object.entries(e.props ?? {});
  if (props.length) lines.push('  props, written exactly like this:');
  for (const [figma, p] of props) {
    const code = p.codeName ?? figma;
    const values = p.codeValues ?? p.values;
    const what = p.type === 'enum' ? values.map(String).join(' | ') : p.type;
    const def = p.default != null && p.default !== '' ? `default ${p.default}` : '';
    const differs = code !== figma || !!p.codeValues;
    // The catalog's default is Figma's: beside the code's own names only when both sides write them the same.
    const figmaSide = differs ? `   Figma: ${figma}${p.values ? ` = ${p.values.join(' | ')}` : ''}${def ? `, ${def}` : ''} (not in parity with the code)` : '';
    lines.push(`    ${code}: ${what}${!differs && def ? `   ${def}` : ''}${figmaSide}`);
    const wrong = Object.entries(p.rejected ?? {});
    if (wrong.length) lines.push(`      not: ${wrong.slice(0, 6).map(([w, r]) => `${w} (use ${r})`).join(', ')}`);
  }
  if (e.slots?.length) lines.push(`  slots: ${e.slots.map((s) => (typeof s === 'string' ? s : s.name)).join(', ')}`);
  if (e.neverCombineWith?.length) lines.push(`  never contains: ${e.neverCombineWith.join(', ')}`);
  if (e.whenNotToUse) lines.push(`  when not to use: ${e.whenNotToUse}`);
  if (e.useInstead?.length) lines.push(`  use instead: ${e.useInstead.join(', ')}`);
  return lines;
}

async function main() {
  const ROOT = process.cwd();
  const args = process.argv.slice(2).filter((a) => a !== '--query');
  const json = args.includes('--json');
  const terms = args.filter((a) => a !== '--json');   // a CSS variable (--x) is a term, not an option
  let cfg = {};
  try { cfg = JSON.parse(readFileSync(join(ROOT, 'ds-config.json'), 'utf8')); } catch { /* defaults */ }
  const dir = resolve(ROOT, cfg.contracts?.out ?? 'contracts');
  // No catalog yet: the audit writes it, so run it once, quietly, instead of handing that step to the agent
  // (an agent asked to answer a question stops and asks whether it may run the audit first).
  if (!existsSync(join(dir, 'catalog.json')) && existsSync(join(ROOT, 'ds-config.json')) && terms.length && envVar(process.env, 'QUERY_NO_AUDIT') !== '1') {
    const t0 = Date.now();
    spawnSync(process.execPath, [join(dirname(fileURLToPath(import.meta.url)), 'audit.mjs')], { cwd: ROOT, stdio: 'ignore', timeout: 600000, env: { ...process.env, DESIGN_SYSTEM_ENGINE_QUERY_NO_AUDIT: '1' } });
    if (existsSync(join(dir, 'catalog.json')) && !json) console.log(`\nℹ️  No catalog yet: ran the audit once to write it (${Math.round((Date.now() - t0) / 1000)}s). Later questions answer at once.`);
  }
  if (!existsSync(join(dir, 'catalog.json'))) {
    console.log(`\n⏭  no ${join(cfg.contracts?.out ?? 'contracts', 'catalog.json')} yet: run rms-design-system-engine once to write it, then ask again.\n`);
    process.exit(2);
  }
  if (!terms.length) {
    console.log('\nUsage: rms-design-system-engine --query <component or token> [more …] [--json]\n');
    process.exit(2);
  }
  const catalog = JSON.parse(readFileSync(join(dir, 'catalog.json'), 'utf8'));
  let tokens = [];
  try { tokens = flattenTokens(JSON.parse(readFileSync(join(dir, 'tokens.json'), 'utf8'))); } catch { /* components only */ }
  const spec = resolveNamingSpec(cfg);
  const varOf = (p) => { try { return tokenToVar(p, spec); } catch { return null; } };
  const answers = terms.map((t) => answer(t, { catalog, tokens, varOf }));
  // Build mode: a component still to build gets its build sheet, the exact lines the engine then checks.
  const sheets = {};
  if (cfg.build === true && answers.some((a) => a.kind === 'component')) {
    const { componentsToBuild, projectDerivedContract, buildSheetLines } = await import('./build-list.mjs');
    const { loadLocator } = await import('./component-locator.mjs');
    const toBuild = new Set(await componentsToBuild(ROOT, cfg));
    const loc = await loadLocator(ROOT, cfg);
    const d = projectDerivedContract(ROOT, cfg, (n) => loc.classFor(n), varOf);
    const read = (p) => { try { return JSON.parse(readFileSync(join(ROOT, p), 'utf8')); } catch { return {}; } };
    const struct = read(cfg.paths?.snapshotStructure ?? 'src/figma-structure.snapshot.json').components ?? {};
    const props = read(cfg.paths?.compPropsSnapshot ?? 'src/figma-component-props.snapshot.json');
    const nesting = read('component-composition.snapshot.json');
    const typography = read(cfg.paths?.snapshotVars ?? 'src/figma-vars.snapshot.json').typography ?? {};
    for (const a of answers) if (a.kind === 'component' && toBuild.has(a.name)) sheets[a.name] = buildSheetLines(a.name, d, { struct, props, nesting, typography, file: cfg.componentFiles?.[a.name] ?? null });
  }
  if (json) console.log(JSON.stringify(answers.map((a) => (sheets[a.name] ? { ...a, buildSheet: sheets[a.name] } : a)), null, 2));
  else {
    console.log('');
    for (const a of answers) { for (const l of [...answerLines(a), ...(sheets[a.name] ?? [])]) console.log(l); console.log(''); }
    const first = Object.keys(sheets)[0];
    if (first) console.log(`NEXT: build ${first} as written above, then run rms-design-system-engine --component ${first} until it passes\n`);
    else if (answers.some((a) => a.kind === 'component')) console.log('NEXT: write the UI with these components and names, building nothing by hand that one of them covers, then check it with rms-design-system-engine --check-ui <file>\n');
  }
  process.exit(answers.every((a) => a.kind !== 'none') ? 0 : 1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
