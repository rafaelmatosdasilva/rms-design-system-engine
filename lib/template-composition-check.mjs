// template-composition-check.mjs - Gate: Template / page composition parity (Figma -> code).
// Run from project root: node scripts/template-composition-check.mjs
//
// The component/sub-component gates verify a single component against Figma. They stop at the
// component boundary: nothing checks whether a whole TEMPLATE or PAGE assembles the components
// Figma says it should. A designer re-composes a template frame in Figma (adds a Filters bar,
// swaps a SidePanel for a DetailFullPage) and no component-level gate notices - the template code
// silently drifts from the design. This gate closes that gap, one level ABOVE the component:
// for each registered template frame it takes the ordered set of DS components the frame composes
// and requires the template's code file to use each of them.
//
// Direction: Figma -> code (a template composes X; the code for that template must use X).
// It reuses the exact same "is this DS component used in this file?" detection as the
// sub-component gate (base selector, JSX tag, or import), so it never depends on Code Connect.
//
// Scope is OPT-IN and generic, exactly like screens[]/docs.surfaces:
//   ds-config.json -> "templates": [ { "name": "Consult", "nodeId": "12:345", "file"?: "..." }, ... ]
// With no templates[] configured the gate is a no-op PASS (a DS without templates is unaffected,
// byte-identical). Inert (exit 0) until figma-templates.snapshot.json exists, so it never
// false-positives before the first capture.
//
// Reads at project root:
//   ds-config.json                      - templates[], templateSrcDirs, componentSelectors,
//                                         componentFiles, componentSrcDirs,
//                                         knownUnimplementedComponents, knownTemplateExceptions,
//                                         templateCompositionStrict
//   figma-templates.snapshot.json       - { templates: { "<name>": { name, nodeId, components: [...] } } }
//                                         (captured in Phase 1 by refreshTemplateComposition in audit.mjs)
//
// Exit 0 = every composed component is used by its template code (or advisory-only / inert).
// Exit 1 = a composed component is missing from the template code AND templateCompositionStrict.

import { readFileSync } from 'fs';
import { join, relative } from 'path';
import { inProgressNames } from './in-progress.mjs';   // work in progress is not drift
import { templatesSnapshot, templateComposition } from './template-composition.mjs';

const ROOT = process.cwd();
let cfg = {};
try { cfg = JSON.parse(readFileSync(join(ROOT, 'ds-config.json'), 'utf8')); } catch {
  console.error('❌ ds-config.json not found at project root.'); process.exit(1);
}

// ── Opt-in: no templates configured → no-op PASS (DS without templates unaffected) ──
const TEMPLATES_CFG = (cfg.templates ?? []).filter(t => t && t.name);
if (!TEMPLATES_CFG.length) {
  console.log('✅ [template-composition] no templates[] configured — skipped');
  process.exit(0);
}

// ── Inert until the snapshot is captured (mirrors screen-element-check) ──────────
const SNAP_PATH = 'figma-templates.snapshot.json';
const found = templatesSnapshot(ROOT, cfg);
if (!found) {
  console.log(`⚠️  [template-composition] ${SNAP_PATH} not found — run /rms-design-system-engine to capture it`);
  console.log('   (it records, per template frame, the DS components it composes; captured via REST /nodes,');
  console.log('    any plan). Inert until then — never a false failure.');
  process.exit(0);
}
if (!found.templates) {
  console.log(`⚠️  [template-composition] ${relative(ROOT, found.file)} unreadable — skipped`);
  process.exit(0);
}

const STRICT = cfg.templateCompositionStrict === true;
const rows = templateComposition(ROOT, cfg, { inProgress: await inProgressNames(ROOT, cfg), snapshot: found.templates });

// ── Compare ───────────────────────────────────────────────────────────────────
const MISSING = [], NOFILE = [], ORDER = [], OK = [];
let templatesChecked = 0;
for (const t of rows) {
  if (t.inProgress) continue;
  const composed = t.parts.filter(p => p.state !== 'in-progress');
  if (!composed.length) continue;
  templatesChecked++;
  if (!t.file) {
    NOFILE.push(`${t.name}: Figma composes [${composed.map(p => p.name).join(', ')}] but no template code file found — set ds-config.json → templates[].file for "${t.name}"`);
    continue;
  }
  for (const p of composed) {
    if (p.state === 'exempt') OK.push(`${t.name} → ${p.name} (exempt)`);
    else if (p.state === 'used') OK.push(`${t.name} → ${p.name}`);
    else MISSING.push(`${t.name}: Figma composes "${p.name}" but the template code doesn't use it  (${t.file})`);
  }
  // Order advisory (never fails): a different order can be a real layout drift or a harmless import order.
  if (t.order) ORDER.push(`${t.name}: Figma order [${t.order.figma.join(' → ')}] vs code order [${t.order.code.join(' → ')}]  (${t.file})`);
}

// ── Report ────────────────────────────────────────────────────────────────────
console.log(`\n✅ USES      ${OK.length}   (template code uses the component Figma composes)`);
console.log(`${STRICT ? '❌' : '⚠️ '} MISSING   ${MISSING.length}   (Figma composes a component the template code doesn't use${STRICT ? '' : ' — advisory'})`);
console.log(`❌ NO FILE   ${NOFILE.length}   (template with composed components, no code file found)`);
if (ORDER.length) console.log(`ℹ️ ORDER     ${ORDER.length}   (composition order differs — advisory)`);

if (MISSING.length) { console.log('\n─── Composed component missing in template code ──'); for (const l of MISSING) console.log(`  ${STRICT ? '❌' : '⚠️ '} ${l}`); }
if (NOFILE.length)  { console.log('\n─── No template code file found ──'); for (const l of NOFILE) console.log(`  ❌ ${l}`); }
if (ORDER.length)   { console.log('\n─── Composition order differs (advisory) ──'); for (const l of ORDER.slice(0, 20)) console.log(`  ℹ️ ${l}`); }

// NO FILE is always a hard fail (a configured template with no resolvable code is a real setup
// gap). MISSING is a hard fail only under templateCompositionStrict; advisory otherwise, so a
// brand-new gate never breaks a build the day it is added.
const fail = NOFILE.length + (STRICT ? MISSING.length : 0);
if (fail) { console.log(`\n❌ Template composition: ${fail} issue(s) across ${templatesChecked} template(s)\n`); process.exit(1); }
console.log(`\n✅ Every template uses the components Figma composes${MISSING.length ? ` (${MISSING.length} advisory)` : ''}. ✓\n`);
process.exit(0);
