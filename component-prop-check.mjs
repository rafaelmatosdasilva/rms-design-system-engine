// component-prop-check.mjs - Gate: Component prop parity (Figma properties <-> code props)
// Run from project root: node scripts/component-prop-check.mjs
//
// Compares each Figma component's PROPERTY NAMES (size, showLabel, labelContent, ...)
// against the code component's declared props. Reads props straight from the code, so
// it does NOT depend on Figma Code Connect (not every Figma account has it). Supports
// Vue (defineProps / props option) and React (Props type / destructured params /
// propTypes); add more via PROP_EXTRACTORS.
//
// Catches exactly what token/CSS gates cannot:
//   - a Figma property that is MISSING from the code component's props
//   - a property whose NAME differs (Figma "size" vs code "buttonSize", or "Size" vs "size")
//
// Reads at project root:
//   ds-config.json                     - paths, componentSelectors, componentFiles,
//                                        componentSrcDirs, knownUnimplementedComponents,
//                                        knownPropExceptions
//   figma-component-props.snapshot.json - Figma property definitions (written by audit.mjs)
//
// Exit 0 = every Figma property maps to a matching code prop (or is exempt).
// Exit 1 = a property is missing in code, or a name differs, or a component with Figma
//          properties has no code component (no silent skips).
// Exit 2 = the component-props snapshot is missing (gate did NOT run, never a pass) -
//          it should be committed; run the audit with FIGMA_TOKEN to generate it.

import { counterpart } from './prop-vocabulary.mjs';
import { roleWord, roleMarkupFindings } from './role-markup.mjs';   // a Figma role, read in the component's markup
import { readFileSync, existsSync, writeFileSync } from 'fs';
import { join, relative, resolve } from 'path';
import { loadLocator } from './component-locator.mjs';
import { createApiReader } from './component-api.mjs';
import { inProgressNames } from './in-progress.mjs';   // I52: work in progress is not drift
import { stateAxisTest, cleanFigmaProp } from './figma-props.mjs';

const ROOT = process.cwd();

let cfg = {};
try { cfg = JSON.parse(readFileSync(join(ROOT, 'ds-config.json'), 'utf8')); } catch {
  console.error('❌ ds-config.json not found at project root.'); process.exit(1);
}

const SNAP_PATH = cfg.paths?.compPropsSnapshot ??
  (cfg.paths?.snapshotVars ?? 'src/figma-vars.snapshot.json').replace(/[^/\\]+$/, 'figma-component-props.snapshot.json');

if (!existsSync(join(ROOT, SNAP_PATH))) {
  console.log(`\n⚠️  ${SNAP_PATH} not found at project root.`);
  console.log('   This snapshot lists each Figma component\'s properties and should be committed.');
  console.log('   Run /rms-design-system-engine once - it captures this via the Figma plugin (no token,');
  console.log('   any plan) - then commit it.');
  console.log('   (exit 2 - treated as "not run", never a pass)\n');
  process.exit(2);
}
const SNAP = JSON.parse(readFileSync(join(ROOT, SNAP_PATH), 'utf8'));

// An EMPTY snapshot (no component has properties) is NOT a real pass - it is "nothing to
// compare". This happens when the Figma file is not published as a library, so REST
// /component_sets returns nothing and the refresh writes an empty snapshot. Treat it as
// "not run" (exit 2), and record it so the report can say so, instead of a false green.
if (!Object.entries(SNAP).some(([k, v]) => k !== '_updated' && v?.properties && Object.keys(v.properties).length)) {
  try { writeFileSync(join(ROOT, 'component-prop-result.json'), JSON.stringify({ pass: null, empty: true, rows: [], summary: { total: 0, match: 0, diverged: 0 } }, null, 2) + '\n'); } catch { /* optional */ }
  console.log(`\n⏭  ${SNAP_PATH} has no component properties - PROPS not verified (not a pass).`);
  console.log('   The snapshot is empty. An unpublished Figma file returns nothing from REST /component_sets;');
  console.log('   capture the props via the Figma plugin (any plan, no token) and commit the snapshot.');
  console.log('   (exit 2 - treated as "not run", never a pass)\n');
  process.exit(2);
}

const KNOWN_UNIMPLEMENTED = await inProgressNames(ROOT, cfg);
const KNOWN_PROP_EXCEPTIONS = new Set(cfg.knownPropExceptions ?? []);   // "Component/prop"
const COMPONENT_SELECTORS = cfg.componentSelectors ?? {};
// Documented intentional renames: Figma property name -> code prop name, per component.
// e.g. { "buttonPrimary": { "size": "buttonSize", "labelContent": "label" } }
const PROP_ALIASES = cfg.componentPropAliases ?? {};

// Phase B: read authored Figma->code prop bindings from the COMMITTED contract.authored.json (the
// hub of decisions), so a rename or a slot can live there instead of only in ds-config.json. That
// file holds decisions only (no captured DS values), so it is committed and applies in CI - unlike
// the local, gitignored contracts/ views. Per component: bindings.<figmaProp> = { attribute:
// "codeName" } (rename) | { slot: "slotName" } | { attribute:true } | { slot:true }. Read once here;
// additive - a missing file/binding simply falls back to today's inference + componentPropAliases.
const AUTHORED_PATH = cfg.contracts?.authored ? resolve(ROOT, cfg.contracts.authored) : join(ROOT, 'contract.authored.json');
let AUTHORED_DOC = null;
try { AUTHORED_DOC = JSON.parse(readFileSync(AUTHORED_PATH, 'utf8')); } catch { /* absent -> inference only */ }
function contractBindings(figmaName) {
  const attr = {}, slot = {};
  const bindings = AUTHORED_DOC?.components?.[figmaName]?.bindings;
  if (bindings && typeof bindings === 'object') {
    for (const [fp, b] of Object.entries(bindings)) {
      if (!b || typeof b !== 'object') continue;
      if (typeof b.attribute === 'string') attr[fp] = b.attribute;   // Figma prop -> renamed code attribute
      if (b.slot === true) slot[fp] = true;                          // -> default slot
      else if (typeof b.slot === 'string') slot[fp] = b.slot;        // -> named code slot
    }
  }
  return { attr, slot };
}

const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, '');
// Parity on a value is the exact name (I58, the owner's rule): "L" and "large", or "Large" and "large", are not the
// same value, whatever they mean. Only a boolean is written two ways for one value (Figma True, code true).
const sameValue = (a, b) => String(a) === String(b) || (/^(true|false)$/i.test(String(a)) && String(a).toLowerCase() === String(b).toLowerCase());
// A suggestion for the person fixing it, never part of the verdict: which code value it most likely is.
const valueHint = (figma, code) => {
  const exactLetters = code.find((c) => norm(c) === norm(figma));
  if (exactLetters) return ` (the code writes it "${exactLetters}")`;
  const c = counterpart(figma, code);
  return c ? ` (the code likely names it "${c}")` : '';
};
// Parity on a prop NAME is the exact name as well: Figma "Size" and code "size" are two names. The pairing
// below still finds the code prop (so its values are compared too); the name is then reported with what
// differs: the letters whose case differs, and spaces or separators. A documented alias or a contract binding
// is the team's decision and is kept as it is.
const nameDiff = (figma, code) => {
  const strip = (x) => x.replace(/[^A-Za-z0-9]/g, '');
  const a = strip(figma), b = strip(code);
  const letters = [...a].map((ch, i) => (ch !== b[i] ? `${ch} → ${b[i] ?? ''}` : null)).filter(Boolean);
  const seps = figma.replace(/[A-Za-z0-9]/g, '') !== code.replace(/[A-Za-z0-9]/g, '');
  return [letters.length ? `letter case ${letters.slice(0, 4).join(', ')}${letters.length > 4 ? ', …' : ''}` : '', seps ? 'spaces or separators' : ''].filter(Boolean).join('; ');
};
// Figma property keys carry a node-id suffix: "Show Label#958:0" -> "Show Label".
const LOCATOR = await loadLocator(ROOT, cfg);   // the one shared component finder

// ── Read the code: which file is each component, and its props ────────────────
// component-api.mjs is the one reader (shared with the code capture): standard files the project
// already produces (Custom Elements Manifest, docgen JSON, Storybook index, Code Connect), the
// project's own TypeScript compiler when installed, then text patterns. Each prop says how sure
// the reading is; when two sources disagree the value is reported as unreadable, never as wrong.
let FIGMA_NODE_IDS = {};
try {
  const st = JSON.parse(readFileSync(join(ROOT, cfg.paths?.snapshotStructure ?? 'src/figma-structure.snapshot.json'), 'utf8')).components ?? {};
  FIGMA_NODE_IDS = Object.fromEntries(Object.entries(st).filter(([, v]) => v?.nodeId).map(([k, v]) => [k, v.nodeId]));
} catch { /* optional: joins Code Connect files by node id */ }
const API = createApiReader(ROOT, cfg, { classFor: LOCATOR.classFor, nodeIds: FIGMA_NODE_IDS });
const resolveFile = (figmaName) => API.fileFor(figmaName);

// ── Compare Figma properties to code props, per component ─────────────────────
// Deterministic: a Figma property pairs with a code prop by name (normalised), or an explicit
// documented alias; a paired name that is not written exactly the same is a NAME difference. Everything else Figma-side is MISSING (fail), and
// leftover code props are EXTRA (advisory). Renames are then offered as SUGGESTIONS
// only - pairing names automatically is unreliable (a boolean "showLabel" is not the
// text prop "label"), so it never decides pass/fail; document a real rename as an alias.
// A Figma "State" variant (hover/focus/active/...) is not a code prop - it maps to CSS
// pseudo-classes, which Gate 11 (All states are built) verifies. Skip it here so a
// component that implements states in CSS isn't wrongly flagged as missing a `state` prop.
// Skips: a property named state/states, or a VARIANT whose options are all interaction states.
// ds-config states (I40): a declared enum axis (prop with a value, such as State=Hover) is a state axis
// too. A boolean prop (isDisabled) stays a code prop. Shared with the Figma prop types (figma-props.mjs).
const isStateAxis = stateAxisTest(cfg);

const MISSING = [], NOFILE = [], EXTRA = [], SUGGEST = [], OK = [], VALUE_FAIL = [], VALUE_INFO = [], SLOT_FAIL = [], NAME_FAIL = [], ROLE_FAIL = [];
const rows = [];   // structured parity rows: { component, figmaProp, figmaValue, codeProp, codeValue, status }

// How a Figma property definition reads in the report: 's · m · l', 'boolean', 'text', 'icon (instance)'.
const figmaValueOf = (def) => {
  if (!def) return '(unknown)';
  if (def.type === 'VARIANT' && Array.isArray(def.variantOptions)) return def.variantOptions.join(' · ');
  if (def.type === 'BOOLEAN') return 'boolean';
  if (def.type === 'TEXT') return 'text';
  if (def.type === 'INSTANCE_SWAP') return def.defaultValue ? `icon (${def.defaultValue})` : 'icon (instance)';
  return String(def.type || '(value)').toLowerCase();
};

// ── HTML-realization mode (frameworkComponents:false, opt-in) ─────────────────
// A plain-HTML/CSS DS consumer has no prop-based components, so the name-matching below finds
// "no code file" for everything and the gate would just SKIP. Instead, verify each Figma
// property is REALIZED by a concrete code artifact: a CSS class / #id / element, or (for an
// interaction state) a pseudo-class Gate [11] already covers. Deterministic + map-driven:
//   ds-config.json → htmlRealizations[Component][property] = '.class' | '#id' | 'tag' | 'state:'
// An unmapped property is an advisory TODO by default (a fail under htmlRealizationStrict); a
// mapped artifact that is absent from the source is always a fail. Opt in with
// ds-config.json → htmlRealization: true. Default off → this block is skipped and the normal
// framework prop-matching (below) runs, which the orchestrator SKIPS when frameworkComponents:false.
if (cfg.frameworkComponents === false && cfg.htmlRealization) {
  const REAL = cfg.htmlRealizations ?? {};
  const STRICT = !!cfg.htmlRealizationStrict;
  // Realization source = the plugin markup/CSS AND the theme CSS: a DS class is DEFINED in the
  // theme (`.tag-label { … }`) and USED in the plugin markup (`class="tag-label"`), and either
  // location realizes the property. Merge both so a class token is found wherever it lives.
  const asList = (v) => (Array.isArray(v) ? v : (v ? [v] : []));
  const srcPaths = [...asList(cfg.paths?.pluginCSS), ...asList(cfg.paths?.themeCSS)];
  const srcBlob = srcPaths.map(p => { try { return readFileSync(join(ROOT, p), 'utf8'); } catch { return ''; } }).join('\n');
  const present = (a) => {
    if (!a) return false;
    if (a.startsWith('state:')) return true;                       // realized as a CSS state - Gate [11]
    if (a.startsWith('.') || a.startsWith('#')) {
      // Match the class/id token wherever it appears: a CSS selector (`.tag-label`), or a markup
      // class/id attribute (`class="tag-label"`, `id="x"`). So bound the bare name by any
      // non-identifier char rather than requiring the leading `.`/`#`.
      const name = a.slice(1).replace(/[.*+?^${}()|[\]\\]/g, m => '\\' + m);
      return new RegExp(`(?:^|[^\\w-])${name}(?![\\w-])`).test(srcBlob);
    }
    return srcBlob.includes(a);                                    // bare element / attribute token
  };
  const REALIZED = [], UNREALIZED = [], UNMAPPED = [], VIASTATE = [];
  for (const [figmaName, entry] of Object.entries(SNAP)) {
    if (figmaName === '_updated' || !entry?.properties) continue;
    if (KNOWN_UNIMPLEMENTED.has(figmaName)) continue;
    const map = REAL[figmaName] ?? {};
    for (const [rawKey, def] of Object.entries(entry.properties)) {
      const prop = cleanFigmaProp(rawKey);
      if (!prop) continue;
      if (isStateAxis(prop, def)) { VIASTATE.push(`${figmaName}/${prop}`); continue; }   // Gate [11]
      const artifact = map[prop] ?? map[norm(prop)];
      if (artifact == null) { UNMAPPED.push(`${figmaName}/${prop}`); continue; }
      if (String(artifact).startsWith('state:')) { VIASTATE.push(`${figmaName}/${prop}`); continue; }
      if (present(artifact)) REALIZED.push(`${figmaName}/${prop} → ${artifact}`);
      else UNREALIZED.push(`${figmaName}: property "${prop}" maps to ${artifact} but it is not in the plugin source`);
    }
  }
  console.log('\nGate [12] - HTML realization  (frameworkComponents:false - each Figma property → a code artifact)\n');
  console.log(`  ✅ REALIZED     ${REALIZED.length}   (property mapped to a CSS class/id/element present in code)`);
  console.log(`  ➡️  VIA STATE    ${VIASTATE.length}   (interaction state - realized as a pseudo-class, Gate [11])`);
  console.log(`  ⚠️  UNMAPPED     ${UNMAPPED.length}   (no htmlRealizations entry yet${STRICT ? ' - FAILS under htmlRealizationStrict' : ' - advisory'})`);
  console.log(`  ❌ UNREALIZED   ${UNREALIZED.length}   (mapped artifact missing from the code)`);
  for (const u of UNREALIZED) console.log(`     ❌ ${u}`);
  if (UNMAPPED.length && STRICT) for (const u of UNMAPPED) console.log(`     ❌ UNMAPPED ${u} (htmlRealizationStrict)`);
  else if (UNMAPPED.length) console.log(`     ⚠️  author ds-config.json → htmlRealizations to verify these: ${UNMAPPED.slice(0, 12).join(', ')}${UNMAPPED.length > 12 ? ` … (+${UNMAPPED.length - 12})` : ''}`);
  const hardFail = UNREALIZED.length + (STRICT ? UNMAPPED.length : 0);
  console.log(hardFail ? `\n❌ HTML realization: ${hardFail} unrealized/unmapped\n` : `\n✅ HTML realization: every mapped Figma property is realized in code\n`);
  process.exit(hardFail ? 1 : 0);
}

for (const [figmaName, entry] of Object.entries(SNAP)) {
  if (figmaName === '_updated' || !entry?.properties) continue;
  const figDefs = new Map(Object.entries(entry.properties)
    .filter(([k, v]) => !isStateAxis(cleanFigmaProp(k), v))   // states are Gate 11's job, not props
    .map(([k, v]) => [cleanFigmaProp(k), v]));   // name -> {type, defaultValue, variantOptions}
  const figNames = [...figDefs.keys()].filter(Boolean);
  if (!figNames.length) continue;
  if (KNOWN_UNIMPLEMENTED.has(figmaName)) continue;

  const { file, how } = resolveFile(figmaName);
  // The role Figma's annotation declares, read in the component's own markup (role-markup.mjs).
  if (file) {
    const role = roleWord(entry.annotations);
    if (role) { let src = ''; try { src = readFileSync(file, 'utf8'); } catch { /* unreadable: nothing to say */ }
      const miss = roleMarkupFindings(src, role);
      if (miss.length) ROLE_FAIL.push(`${figmaName}: Figma's annotation says role ${role}; the code needs ${miss.join(' and ')}  (${relative(ROOT, file)})`); }
  }
  if (!file) {
    NOFILE.push(`${figmaName}: has Figma properties [${figNames.join(', ')}] but no code component found (${how}) - set ds-config.json → componentFiles["${figmaName}"], or exempt via knownUnimplementedComponents`);
    for (const fp of figNames) rows.push({ component: figmaName, figmaProp: fp, figmaValue: figmaValueOf(figDefs.get(fp)), codeProp: 'not in code', codeValue: `(no code file: ${how})`, status: 'missing' });
    continue;
  }
  const api = API.apiFor(figmaName);
  const codeNorm     = new Map(Object.keys(api.props).map(p => [norm(p), p]));   // normName -> original
  const codeDefaults = new Map(Object.entries(api.props).filter(([, f]) => f.default != null).map(([p, f]) => [norm(p), f.default]));
  const codeOptions  = new Map(Object.entries(api.props).filter(([, f]) => Array.isArray(f.options)).map(([p, f]) => [norm(p), f.options.map(String)]));
  const unsure       = new Map(Object.entries(api.props).filter(([, f]) => f.confidence === 'uncertain').map(([p, f]) => [norm(p), f.readings]));
  const cbind    = contractBindings(figmaName);                            // authored Figma->code bindings (the contract hub)
  // A Code Connect mapping is pairing evidence; a documented alias or a contract binding wins over it.
  const aliases  = { ...(api.codeConnect ?? {}), ...(PROP_ALIASES[figmaName] ?? {}), ...cbind.attr };
  const rel = relative(ROOT, file);

  // #1/#3: for a matched prop, compare Figma's default value, variant options and type
  // against the code. Pushes to VALUE_FAIL/VALUE_INFO (text output + exit code) AND returns
  // the report row's { status, codeValue }. Only fails on values actually readable from the
  // code (a default or a string-literal union); a parsing gap stays a non-failing 'match'.
  const checkValues = (fp, def, codeName) => {
    if (KNOWN_PROP_EXCEPTIONS.has(`${figmaName}/${fp}`)) return { status: 'match', codeValue: '(exempt)' };
    const cn = norm(codeName);
    if (unsure.has(cn)) {
      const r = Object.entries(unsure.get(cn)).map(([src, v]) => `${src} ${JSON.stringify(v)}`).join(' · ');
      VALUE_INFO.push(`${figmaName}/${fp}: the code sources disagree on "${codeName}" (${r}) - not compared  (${rel})`);
      return { status: 'match', codeValue: '(readings disagree)' };
    }
    const figDefault = def?.defaultValue;
    const codeDefault = codeDefaults.get(cn);
    // A wrong default and a variant the code names differently are two findings: both are listed.
    const defaultDiffers = figDefault != null && figDefault !== '' && codeDefault != null && !sameValue(figDefault, codeDefault);
    if (defaultDiffers)
      VALUE_FAIL.push(`${figmaName}/${fp}: default differs - Figma "${figDefault}" vs code "${codeName}=${codeDefault}"${valueHint(figDefault, [codeDefault])}  (${rel})`);
    const opts = def?.type === 'VARIANT' && Array.isArray(def.variantOptions) && def.variantOptions.length ? codeOptions.get(cn) : null;
    if (defaultDiffers && !opts) return { status: 'value', codeValue: `default ${codeDefault}` };
    if (opts) {
      const miss = def.variantOptions.filter(o => !opts.some((c) => sameValue(o, c)));
      if (miss.length)
        VALUE_FAIL.push(`${figmaName}/${fp}: code prop "${codeName}" is missing Figma variant option(s) ${miss.map(o => `"${o}"${valueHint(o, opts)}`).join(', ')}  (${rel})`);
      return { status: miss.length || defaultDiffers ? 'value' : 'match', codeValue: opts.join(' · ') };
    }
    if (def?.type === 'VARIANT' && Array.isArray(def.variantOptions) && def.variantOptions.length) {
      VALUE_INFO.push(`${figmaName}/${fp}: Figma variants [${def.variantOptions.join(', ')}] - could not read the code prop's allowed values to verify  (${rel})`);
      return { status: 'match', codeValue: '(present)' };
    }
    if (def?.type === 'BOOLEAN') {
      if (codeDefault != null && codeDefault !== 'true' && codeDefault !== 'false')
        VALUE_INFO.push(`${figmaName}/${fp}: Figma BOOLEAN but code default "${codeDefault}" is not boolean - check the prop type  (${rel})`);
      return { status: 'match', codeValue: 'boolean' };
    }
    return { status: 'match', codeValue: codeDefault != null ? `default ${codeDefault}` : '(present)' };
  };

  const codeSlots = { named: new Map(api.slots.named.map((n) => [norm(n), n])), hasDefault: api.slots.default };   // norm → as written
  const matchedCode = new Set();
  const missingHere = [];
  for (const fp of figNames) {
    const def = figDefs.get(fp);
    const figmaValue = figmaValueOf(def);
    const pushRow = (codeProp, codeValue, status) => rows.push({ component: figmaName, figmaProp: fp, figmaValue, codeProp, codeValue, status });

    if (KNOWN_PROP_EXCEPTIONS.has(`${figmaName}/${fp}`)) { OK.push(`${figmaName}/${fp} (exempt)`); pushRow(fp, '(exempt)', 'match'); continue; }

    // An INSTANCE_SWAP (e.g. an icon) is NOT assumed to be a slot: the code may expose it as
    // a prop OR a slot. Match either, and report the actual representation.
    if (def?.type === 'INSTANCE_SWAP') {
      const fn = norm(fp);
      if (codeNorm.has(fn)) {
        matchedCode.add(fn);
        const cp = codeNorm.get(fn);
        if (cp !== fp) { NAME_FAIL.push(`${figmaName}/${fp}: the code names it "${cp}" (${nameDiff(fp, cp)})  (${rel})`); pushRow(cp, 'prop', 'name'); continue; }
        OK.push(`${figmaName}/${fp} (prop)`); pushRow(cp, 'prop', 'match'); continue;
      }
      const aliasTo0 = aliases[fp] && norm(aliases[fp]);
      if (aliasTo0 && codeNorm.has(aliasTo0)) { matchedCode.add(aliasTo0); OK.push(`${figmaName}/${fp} → ${aliases[fp]} (prop, alias)`); pushRow(aliases[fp], 'prop', 'match'); continue; }
      if (codeSlots.named.has(fn)) {
        const cs = codeSlots.named.get(fn);
        if (cs !== fp) { NAME_FAIL.push(`${figmaName}/${fp}: the code names its slot "${cs}" (${nameDiff(fp, cs)})  (${rel})`); pushRow(cs, 'slot', 'name'); continue; }
        OK.push(`${figmaName}/${fp} (slot)`); pushRow(cs, 'slot', 'match'); continue;
      }
      if (codeSlots.hasDefault)   { OK.push(`${figmaName}/${fp} (default slot)`); pushRow('(default slot)', 'slot', 'match'); continue; }
      // A contract-authored slot binding resolves a slot whose code NAME differs from the Figma prop.
      const sb = cbind.slot[fp];
      if (typeof sb === 'string' && codeSlots.named.has(norm(sb))) { OK.push(`${figmaName}/${fp} → ${sb} (slot, contract)`); pushRow(sb, 'slot', 'match'); continue; }
      SLOT_FAIL.push(`${figmaName}: Figma instance-swap "${fp}" has no code prop or slot  (${rel})`);
      pushRow('not in code', '-', 'missing'); continue;
    }

    const fn = norm(fp);
    // A name the project recorded for this prop (contract.authored.json bindings, componentPropAliases) is the
    // agreed one: it is read before the letter-case comparison, so Disabled bound to "disabled" is a match.
    const bound = aliases[fp] != null ? Object.keys(api.props).find((p) => p === aliases[fp]) : null;
    if (bound) { matchedCode.add(norm(bound)); OK.push(`${figmaName}/${fp} → ${bound} (alias)`); const v = checkValues(fp, def, bound); pushRow(bound, v.codeValue, v.status); continue; }
    if (codeNorm.has(fn)) {
      matchedCode.add(fn);
      const cp = codeNorm.get(fn);
      const v = checkValues(fp, def, cp);
      if (cp !== fp) { NAME_FAIL.push(`${figmaName}/${fp}: the code names it "${cp}" (${nameDiff(fp, cp)})  (${rel})`); pushRow(cp, v.codeValue, 'name'); continue; }
      OK.push(`${figmaName}/${fp}`); pushRow(cp, v.codeValue, v.status); continue;
    }
    const aliasTo = aliases[fp] && norm(aliases[fp]);
    if (aliasTo && codeNorm.has(aliasTo)) { matchedCode.add(aliasTo); OK.push(`${figmaName}/${fp} → ${aliases[fp]} (alias)`); const v = checkValues(fp, def, codeNorm.get(aliasTo)); pushRow(aliases[fp], v.codeValue, v.status); continue; }
    missingHere.push(fp);   // row added after rename-pairing below
    MISSING.push(`${figmaName}: Figma property "${fp}" has no code prop  (${rel})`);
  }
  // A code prop that is not a design decision is never "not in Figma": an event handler (onClick), and the plumbing
  // every component passes through (children, className, style, ref, key, id, aria-*, data-*).
  const PLUMBING = /^(on[A-Z]\w*|children|className|class|style|ref|key|id|aria-[\w-]+|data-[\w-]+)$/;
  const extraHere = [...codeNorm.entries()].filter(([cn, cp]) => !matchedCode.has(cn) && !PLUMBING.test(cp));

  // Pair an unmatched Figma prop with an unused code prop when one name clearly contains the
  // other (>=3 chars) → a RENAME row (and consume that code prop so it isn't also 'extra').
  const pairedCode = new Set();
  for (const fp of missingHere) {
    const fn = norm(fp);
    const def = figDefs.get(fp);
    const hit = extraHere.find(([cn]) => !pairedCode.has(cn) && cn.length >= 3 && fn.length >= 3 && (cn.includes(fn) || fn.includes(cn)));
    if (hit) {
      pairedCode.add(hit[0]);
      SUGGEST.push(`${figmaName}: Figma "${fp}" might be code "${hit[1]}" - if so add componentPropAliases["${figmaName}"]["${fp}"] = "${hit[1]}"`);
      rows.push({ component: figmaName, figmaProp: fp, figmaValue: figmaValueOf(def), codeProp: hit[1], codeValue: '(rename?)', status: 'rename' });
    } else {
      rows.push({ component: figmaName, figmaProp: fp, figmaValue: figmaValueOf(def), codeProp: 'not in code', codeValue: '-', status: 'missing' });
    }
  }

  for (const [cn, cp] of extraHere) {
    if (pairedCode.has(cn)) continue;   // already shown as a rename row
    EXTRA.push(`${figmaName}: code prop "${cp}" has no Figma property  (${rel})`);
    rows.push({ component: figmaName, figmaProp: 'not in Figma', figmaValue: '-', codeProp: cp, codeValue: '(present)', status: 'extra' });
  }
}

// ── Report ────────────────────────────────────────────────────────────────────
console.log(`\n✅ OK        ${OK.length}`);
console.log(`❌ MISSING   ${MISSING.length}   (Figma property with no matching code prop)`);
console.log(`❌ NAME      ${NAME_FAIL.length}   (the code names a Figma property differently: letter case, spaces)`);
console.log(`❌ VALUE     ${VALUE_FAIL.length}   (wrong default, or a Figma variant the code doesn't accept)`);
console.log(`❌ SLOT      ${SLOT_FAIL.length}   (Figma instance-swap slot with no code slot)`);
console.log(`❌ NO FILE   ${NOFILE.length}   (Figma component with props, no code component found)`);
if (ROLE_FAIL.length)  console.log(`❌ ROLE      ${ROLE_FAIL.length}   (the markup does not hold what Figma's role annotation asks for)`);
if (EXTRA.length)      console.log(`ℹ️ EXTRA     ${EXTRA.length}   (code prop with no Figma property - advisory)`);
if (SUGGEST.length)    console.log(`ℹ️ RENAME?   ${SUGGEST.length}   (possible renames - advisory)`);
if (VALUE_INFO.length) console.log(`ℹ️ VALUE?    ${VALUE_INFO.length}   (could not read a code value to verify - advisory)`);

const fail = MISSING.length + NAME_FAIL.length + NOFILE.length + VALUE_FAIL.length + SLOT_FAIL.length + ROLE_FAIL.length;

// Structured result for the parity report table (best-effort; never affects the gate result).
try {
  writeFileSync(join(ROOT, 'component-prop-result.json'), JSON.stringify({
    pass: fail === 0,
    rows,
    summary: { total: rows.length, match: rows.filter(r => r.status === 'match').length, diverged: rows.filter(r => r.status !== 'match').length },
  }, null, 2) + '\n');
} catch { /* result file is optional */ }
if (MISSING.length)    { console.log('\n─── Missing in code (rename the code prop to match, add the prop, or document an alias) ──'); for (const l of MISSING) console.log(`  ❌ ${l}`); }
if (NAME_FAIL.length)  { console.log('\n─── Named differently (rename the code prop or the Figma property so both write the same name) ──'); for (const l of NAME_FAIL) console.log(`  ❌ ${l}`); }
if (VALUE_FAIL.length) { console.log('\n─── Wrong value (default or variant options do not match Figma) ──'); for (const l of VALUE_FAIL) console.log(`  ❌ ${l}`); }
if (SLOT_FAIL.length)  { console.log('\n─── Missing slot (Figma instance swap with no code slot) ──'); for (const l of SLOT_FAIL) console.log(`  ❌ ${l}`); }
if (NOFILE.length)     { console.log('\n─── No code component found ──'); for (const l of NOFILE) console.log(`  ❌ ${l}`); }
if (ROLE_FAIL.length)  { console.log('\n─── Role (Figma\'s annotation says what the element is; the markup must be that) ──'); for (const l of ROLE_FAIL) console.log(`  ❌ ${l}`); }
if (SUGGEST.length)    { console.log('\n─── Possible renames (advisory) ──'); for (const l of SUGGEST) console.log(`  ℹ️ ${l}`); }
if (VALUE_INFO.length) { console.log('\n─── Values not verified (advisory) ──'); for (const l of VALUE_INFO.slice(0, 20)) console.log(`  ℹ️ ${l}`); }
if (EXTRA.length)      { console.log('\n─── Extra code props (advisory) ──'); for (const l of EXTRA.slice(0, 20)) console.log(`  ℹ️ ${l}`); }

if (fail) { console.log(''); process.exit(1); }
console.log('\nEvery Figma component property maps to a matching code prop, with the right default and variants. ✓\n');
process.exit(0);
