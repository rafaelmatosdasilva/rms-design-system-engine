// query.mjs - ask the design system a question from the terminal.
// Run from project root:  rms-design-system-engine --query <term> [<term> …] [--json]
//
// An agent about to write UI asks for one component or token instead of reading the whole catalog, and
// gets the names exactly as they are written: a guessed name is the most common way generated code
// drifts. Read-only, over what every audit run already writes (contracts/catalog.json, contracts/tokens.json):
//   • a component: its selector and code file, each prop with its values and default as the code writes
//     them, Figma's own names where they differ (that is a parity difference), the names an agent is
//     likely to guess wrong, slots, what it must never contain, when not to use it and what to use instead, and where
//     it lives (the products and files that use it, what it sits inside and holds, the Figma screens that draw it);
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
import { usageLines } from './usage-map.mjs';

const norm = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');

// DTCG tokens → [{ path: 'surface/base/color', value, modes }]
export function flattenTokens(tree, prefix = []) {
  const out = [];
  for (const [k, v] of Object.entries(tree ?? {})) {
    if (k.startsWith('$') || !v || typeof v !== 'object') continue;
    const ext = v.$extensions?.['com.rms.design-system-engine'];
    if ('$value' in v) out.push({ path: [...prefix, k].join('/'), value: v.$value, modes: ext?.modes ?? null, readableOn: ext?.readableOn ?? null, goesWith: ext?.goesWith ?? null, deprecated: v.$deprecated === true, ...(typeof v.$description === 'string' && v.$description.trim() ? { description: v.$description.trim() } : {}) });
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
  return { kind: 'none', term, near: nearest(term, comps, tokens, varOf) };
}

// The words of a name or a sentence (buttonPrimary, surface/base/color, "the main action"), lowercased.
const words = (s) => String(s ?? '').replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 1);
// Two words alike: the same, one the other's start (button, buttons), the same stem (loading, loader), or a letter
// apart in a long one (two swapped count as one).
const stem = (w) => (w.length > 5 ? w.replace(/(ing|ers|er|ed|es|s)$/, '') : w);
const alike = (a, b) => a === b || (Math.min(a.length, b.length) >= 4 && (a.startsWith(b) || b.startsWith(a) || stem(a) === stem(b))) || (Math.min(a.length, b.length) >= 5 && distance(a, b) <= 1);
function distance(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) {
    d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);   // two letters swapped
  }
  return d[a.length][b.length];
}

// The closest component and token names to a term that matches none: a name the term is part of (or the other way
// round), one spelled a letter or two apart (bdage for badge), and one whose words, or the words of its description,
// are the term's (the main action finds buttonPrimary, divider colour finds border/divider/color). → [name], at most 8
export function nearest(term, comps = [], tokens = [], varOf = () => null) {
  const t = norm(term), tw = words(term);
  if (!t) return [];
  const scored = [];
  const score = (name, alsoNames, text) => {
    const n = norm(name);
    let s = 0;
    if (n.includes(t) || t.includes(n)) s += 10;
    else if (t.length >= 4 && distance(n, t) <= Math.max(1, Math.floor(t.length / 5))) s += 8;
    const own = [...words(name), ...alsoNames.flatMap(words)], said = words(text);
    let all = tw.length > 0;
    for (const w of tw) { if (own.some((x) => alike(w, x))) s += 3; else if (said.some((x) => alike(w, x))) s += 2; else all = false; }
    if (all && tw.length > 1) s += 3;   // every word of it, in its name or its description
    if (s >= (tw.length > 1 ? 3 : 2)) scored.push([name, s]);
  };
  for (const [n, e] of comps) score(n, [e?.selector ?? ''], e?.description ?? '');
  for (const x of tokens) score(x.path, [varOf(x.path) ?? ''], x.description ?? '');
  return scored.sort((a, b) => b[1] - a[1] || a[0].length - b[0].length).slice(0, 8).map(([n]) => n);
}

// The command to run after an answer, for an agent reading it as data: the closest name asked again, the component
// built from its sheet, or the UI checked once written with what was found.
export function nextFor(a, { sheet = false, notBuilt = false } = {}) {
  if (a.kind === 'none') return a.near.length ? `rms-design-system-engine --query ${a.near[0]}` : null;
  if (a.kind === 'component' && sheet) return `rms-design-system-engine --component ${a.name}`;
  if (a.kind === 'component' && notBuilt) return null;
  return 'rms-design-system-engine --check-ui <file>';
}

// The contrast a pair gives where its two colours are closest, and whether the names promise what the values break.
const pairNote = (g) => (g.ratio == null ? '' : ` (${g.ratio}:1${g.ok ? '' : ', under 4.5:1: the names say they go together, the values do not'})`);

export function answerLines(a) {
  if (a.kind === 'none') return [`${a.term}: no component or token of that name${a.near.length ? `. Closest: ${a.near.join(', ')}` : ''}`];
  if (a.kind === 'token') {
    const { token: x, cssVar } = a;
    const modes = x.modes ? Object.entries(x.modes).map(([m, v]) => `${m} ${v}`).join(' · ') : String(x.value);
    return [`${x.path}${cssVar ? `  →  var(${cssVar})` : ''}  ${modes}${x.deprecated ? '  [deprecated]' : ''}`,
      ...(x.description ? [`  for: ${x.description}`] : []),   // what it is for, from its Figma description
      // The one surface it was made for, before the list of every surface it would work on: an agent given only the
      // shortlist picks a different grey on every card.
      ...(x.goesWith ? [`  goes on: ${x.goesWith.surface}${pairNote(x.goesWith)}`] : []),
      ...(x.readableOn?.length ? [`  also readable on (4.5:1 in every mode): ${x.readableOn.join(', ')}`] : [])];
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
  if (e.example?.code) lines.push(`  as the code writes it: ${e.example.code}  (${e.example.file}:${e.example.line})`);
  if (e.slots?.length) lines.push(`  slots: ${e.slots.map((s) => (typeof s === 'string' ? s : s.name)).join(', ')}`);
  if (e.neverCombineWith?.length) lines.push(`  never contains: ${e.neverCombineWith.join(', ')}`);
  if (e.whenNotToUse) lines.push(`  when not to use: ${e.whenNotToUse}`);
  if (e.useInstead?.length) lines.push(`  use instead: ${e.useInstead.join(', ')}`);
  // Where it lives: the products that use it, what it sits inside and holds, the Figma screens that draw it.
  if (e.livesIn) lines.push(...usageLines(e.livesIn));
  // Figma has it, the code does not: its class styles nothing, so an agent that places it ends up writing its CSS.
  if (a.notBuilt) lines.push(`  not in the code yet: ${e.selector ?? name} has no styles, so placing it draws nothing. Do not write its CSS in a screen: build with a component the code has, and say ${name} is not built`);
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
  // "construction": how the system builds a component in Figma (contracts/construction.json), unless a component has
  // that name.
  const grammarTerm = (t) => /^(construction|grammar)$/i.test(t) && !catalog.components?.[t];
  if (terms.some(grammarTerm)) {
    let g = null;
    try { g = JSON.parse(readFileSync(join(dir, 'construction.json'), 'utf8')); } catch { /* none yet */ }
    const { grammarLines } = await import('./construction-grammar.mjs');
    const lines = grammarLines(g);
    if (json) console.log(JSON.stringify(g, null, 2));
    else {
      console.log('');
      for (const l of lines.length ? lines : ['No construction grammar yet: it is mined from the Figma capture, so refresh Figma (--recipe refresh-figma) and run rms-design-system-engine.']) console.log(l);
      for (const q of g?.questions ?? []) console.log(`? ${q.ask} (the team answers: rms-design-system-engine --construction ${q.id} yes|no)`);
      console.log('');
    }
    if (terms.every(grammarTerm)) process.exit(lines.length ? 0 : 1);
  }
  const answers = terms.filter((t) => !grammarTerm(t)).map((t) => answer(t, { catalog, tokens, varOf }));
  // The components Figma has and the code does not (experimental, not built yet, or still to build).
  let unbuilt = new Set();
  if (answers.some((a) => a.kind === 'component')) {
    try { const { inProgressList } = await import('./in-progress.mjs'); unbuilt = new Set((await inProgressList(ROOT, cfg)).filter((x) => x.figma && !x.code).map((x) => x.name)); } catch { /* every one is taken as built */ }
  }
  // Build mode: a component still to build gets its build sheet, the exact lines the engine then checks.
  const sheets = {};
  if (cfg.build === true && answers.some((a) => a.kind === 'component')) {
    const { componentsToBuild, projectDerivedContract, buildSheetLines } = await import('./build-list.mjs');
    const { loadLocator } = await import('./component-locator.mjs');
    const { inProgressList } = await import('./in-progress.mjs');
    // Any component Figma has and the code does not gets its sheet when asked for, an experimental one too: it stays
    // off the build list (Figma may still change it), but whoever builds it builds it from the same facts.
    const toBuild = new Set([...await componentsToBuild(ROOT, cfg), ...(await inProgressList(ROOT, cfg)).filter((x) => x.figma && !x.code).map((x) => x.name)]);
    const loc = await loadLocator(ROOT, cfg);
    const d = projectDerivedContract(ROOT, cfg, (n) => loc.classFor(n), varOf);
    const read = (p) => { try { return JSON.parse(readFileSync(join(ROOT, p), 'utf8')); } catch { return {}; } };
    const struct = read(cfg.paths?.snapshotStructure ?? 'src/figma-structure.snapshot.json').components ?? {};
    const props = read(cfg.paths?.compPropsSnapshot ?? 'src/figma-component-props.snapshot.json');
    const nesting = read('component-composition.snapshot.json');
    const typography = read(cfg.paths?.snapshotVars ?? 'src/figma-vars.snapshot.json').typography ?? {};
    for (const a of answers) if (a.kind === 'component' && toBuild.has(a.name)) sheets[a.name] = buildSheetLines(a.name, d, { struct, props, nesting, typography, file: cfg.componentFiles?.[a.name] ?? null });
  }
  if (json) console.log(JSON.stringify(answers.map((a) => {
    const one = sheets[a.name] ? { ...a, buildSheet: sheets[a.name] } : unbuilt.has(a.name) ? { ...a, notBuilt: true } : a;
    const next = nextFor(a, { sheet: !!sheets[a.name], notBuilt: unbuilt.has(a.name) });
    return next ? { ...one, next } : one;
  }), null, 2));
  else {
    console.log('');
    for (const a of answers) { for (const l of [...answerLines(sheets[a.name] ? a : { ...a, notBuilt: unbuilt.has(a.name) }), ...(sheets[a.name] ?? [])]) console.log(l); console.log(''); }
    const first = Object.keys(sheets)[0];
    const built = answers.filter((a) => a.kind === 'component' && !unbuilt.has(a.name));
    if (first) console.log(`NEXT: build ${first} as written above, then run rms-design-system-engine --component ${first} until it passes\n`);
    else if (built.length) console.log('NEXT: write the UI with these components and names, building nothing by hand that one of them covers, then check it with rms-design-system-engine --check-ui <file>\n');
    else if (answers.some((a) => a.kind === 'token')) console.log('NEXT: write the UI with these variables, then check it with rms-design-system-engine --check-ui <file>\n');
    const missed = answers.filter((a) => a.kind === 'none' && a.near.length);
    if (missed.length && !first && !built.length) console.log(`NEXT: ask again with the closest name: rms-design-system-engine --query ${missed.map((a) => a.near[0]).join(' ')}\n`);
    if (!first && !built.length && answers.some((a) => a.kind === 'component')) console.log(`NEXT: ${answers.filter((a) => a.kind === 'component').map((a) => a.name).join(', ')} is not in the code: do not stop to ask which way. Write the UI now with components and variables the code has (rms-design-system-engine --query <name>), and say in the reply that ${answers.filter((a) => a.kind === 'component').map((a) => a.name).join(', ')} is not built and what the system lacks for the request (a colour it has none of: "the system has no green")\n`);
  }
  process.exit(answers.every((a) => a.kind !== 'none') ? 0 : 1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
