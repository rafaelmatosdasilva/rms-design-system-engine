// figma-docs-edits.mjs - what the engine knows, written into the Figma file where designers read it, only after a
// person says yes. Three parts of the hand-back (figma-edits.mjs runs them in the same script, each write recording
// what it replaces, so figma-undo.mjs writes the way back):
//
//   • descriptions  what the intent layer says each component and token is for, written as the description of its
//                   component set and its variable. Only what the layer holds as the team's word: a drafted line
//                   (**Draft:**) was set apart when the layer was read and is never written, and nothing is drafted
//                   here. A description Figma has already is kept: where it says something else, the run lists it
//                   for a person and leaves it. A file of a few thousand variables goes in chunks: each run writes at
//                   most DESC_CHUNK and says how many are left, and running it again goes on where it stopped.
//   • spec pages    a frame beside each component set, "Spec · <name>": its anatomy (an instance of its default
//                   variant with a numbered marker on each named part), its properties with their options and
//                   default, its sizes and spacing and the tokens it binds in each variant (from the structure
//                   capture), and its role and what a screen reader says (from the code and the last check). The
//                   frame is the engine's own: written afresh on every yes, so it is never left stale.
//   • tokens        a token whose value the code changed since the two sides last agreed (agreed.mjs: code-moved),
//                   written into its Figma variable in that mode; one only the code has, created in the collection
//                   of the variable whose name it shares the most with. A token both sides changed is a conflict,
//                   shown and never resolved here; a Figma value that is an alias is never written over (the code's
//                   raw value would break the alias), only shown.
//
//   descriptionEdits({ entities, components, variables, spec }) → [{ kind: 'descriptions', components, variables, why }]
//   specPageEdits({ props, structure, views, heard })          → [{ kind: 'specpage', component, nodeId, sections, why }]
//   tokenEdits({ facts, agreed, aliases, codeTokens, figmaNames, spec }) → [{ kind: 'tokens', changes, create, conflicts, why }]
//   docsScript(edits)  → the plugin script lines that make them (inside figma-edits.mjs applyScript)
//   docsLines(edits)   → what the run prints before anyone says yes
// Pure.
import { lit } from './figma-undo.mjs';
import { tokenToVar, varToToken } from './naming-convention.mjs';
import { parseColor } from './css-values.mjs';
import { classify } from './agreed.mjs';

const norm = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
const flat = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();
const plural = (n, one, many = one + 's') => `${n} ${n === 1 ? one : many}`;
export const DESC_CHUNK = 400;

// ── Descriptions ─────────────────────────────────────────────────────────────────────────────────────────────────────
// What a page says a thing is for: its purpose lines, else its summary. Drafts never reach here (doc-source-dsds.mjs
// sets them apart as it reads), and a line still marked as one is left out all the same.
const DRAFTED = /^\s*(?:\*\*|__)?draft\b/i;
export function purposeOf(e) {
  const lines = (e?.purpose ?? []).map((x) => flat(x?.text ?? x)).filter((t) => t && !DRAFTED.test(t));
  const text = lines.length ? lines.join(' ') : flat(e?.summary ?? '');
  return text && !DRAFTED.test(text) ? text : '';
}

// entities: the intent layer's (intent-layer.mjs readIntentLayer). components: { name: nodeId } of Figma's component
// sets. variables: Figma's variable names. A token page is matched by its variable name or its CSS name.
// matched: the components matched to their pages as the rest of the engine matches them (intent-layer.mjs
// matchComponents); without it, by name alone.
export function descriptionEdits({ entities = [], components = {}, variables = [], spec, matched = null } = {}) {
  const byComp = new Map(Object.keys(components).map((n) => [norm(n), n]));
  const byVar = new Map();
  for (const v of variables) { byVar.set(norm(v), v); if (spec) byVar.set(norm(tokenToVar(v, spec)), v); }
  const comps = [], vars = [], seenC = new Set(), seenV = new Set();
  for (const e of entities) {
    const text = purposeOf(e);
    if (!text) continue;
    if (e.kind === 'token') {
      const v = byVar.get(norm(e.name)) ?? byVar.get(norm(String(e.name).replace(/\//g, '-')));
      if (v && !seenV.has(v)) { seenV.add(v); vars.push({ variable: v, text }); }
      continue;
    }
    if (matched) continue;
    const c = byComp.get(norm(e.name));
    if (c && components[c] && !seenC.has(c)) { seenC.add(c); comps.push({ component: c, nodeId: components[c], text }); }
  }
  if (matched) for (const [c, e] of matched) { const text = e?.kind !== 'token' && purposeOf(e); if (text && components[c]) comps.push({ component: c, nodeId: components[c], text }); }
  if (!comps.length && !vars.length) return [];
  return [{ kind: 'descriptions', components: comps, variables: vars,
    why: [comps.length ? plural(comps.length, 'component') : '', vars.length ? plural(vars.length, 'token') : ''].filter(Boolean).join(' and ') + ' the intent layer says the purpose of' }];
}

// ── Spec pages ───────────────────────────────────────────────────────────────────────────────────────────────────────
const cleanProp = (k) => String(k).replace(/#[^#]*$/, '');
const TYPE_WORD = { VARIANT: 'variant', BOOLEAN: 'yes or no', TEXT: 'text', INSTANCE_SWAP: 'instance swap', SLOT: 'slot' };

function propLines(entry) {
  return Object.entries(entry?.properties ?? {}).map(([k, p]) => {
    const name = cleanProp(k), type = TYPE_WORD[p?.type] ?? String(p?.type ?? '').toLowerCase();
    const opts = Array.isArray(p?.variantOptions) && p.variantOptions.length ? `: ${p.variantOptions.join(', ')}` : '';
    const def = p?.defaultValue == null || p.defaultValue === '' ? '' : `, default ${typeof p.defaultValue === 'string' ? p.defaultValue : JSON.stringify(p.defaultValue)}`;
    return `${name} (${type})${opts}${def}`;
  });
}

// One variant's build as words: its height, padding, gap, corners and type, each with the variable it binds.
function buildWords(v = {}, base = {}) {
  const w = [];
  const got = (k) => v[k] !== undefined && JSON.stringify(v[k]) !== JSON.stringify(base[k]);
  if (got('h') && v.h != null) w.push(`height ${v.h}px`);
  if (got('paddingVar') && v.paddingVar) w.push(`padding ${v.paddingVar.tb ?? '?'} top and bottom, ${v.paddingVar.lr ?? '?'} sides`);
  if (got('gapVar') && v.gapVar) w.push(`gap ${v.gapVar}`);
  if (got('innerRadiusVar') && v.innerRadiusVar) w.push(`corners ${v.innerRadiusVar}`);
  if (got('fontSizeVar') && v.fontSizeVar) w.push(`type ${v.fontSizeVar}`);
  return w;
}
function colourWords(colors = {}) {
  return Object.entries(colors).map(([k, c]) => c?.token ? `${k} ${c.token}` : c?.hex ? `${k} ${c.hex} (no variable)` : null).filter(Boolean);
}

// props: the component props capture. structure: the structure capture's components. views: the style guide's view
// of each component (its role, its element). heard: what a screen reader said, by component (the last check).
export function specPageEdits({ props = {}, structure = {}, views = [], heard = {} } = {}) {
  const viewOf = new Map(views.map((v) => [v.name, v]));
  const out = [];
  for (const [name, entry] of Object.entries(props)) {
    if (name.startsWith('_') || !entry?.nodeId) continue;
    const st = structure[name] ?? null, view = viewOf.get(name) ?? null;
    const sections = [];
    const pl = propLines(entry);
    if (pl.length) sections.push({ title: 'Properties', lines: pl });
    if (st) {
      const base = { h: st.h, paddingVar: st.paddingVar, gapVar: st.gapVar, innerRadiusVar: st.innerRadiusVar, fontSizeVar: st.fontSizeVar };
      const lines = [];
      const first = [...buildWords(base), ...colourWords(st.colors)];
      if (first.length) lines.push(`${st.defaultVariant ?? 'Default'}: ${first.join(', ')}`);
      for (const [vn, v] of Object.entries(st.variants ?? {})) {
        if (vn === st.defaultVariant) continue;
        const diff = [...buildWords(v, base), ...colourWords(v.colors)];
        const op = Object.entries(st.variantOpacity ?? {}).find(([k]) => vn.includes(k))?.[1];
        if (op != null) diff.push(`opacity ${op}`);
        if (diff.length) lines.push(`${vn}: ${diff.join(', ')}`);
      }
      if (lines.length) sections.push({ title: 'Sizes, spacing and tokens', lines });
    }
    const a = view?.a11y ?? null, said = heard[name] ?? null;
    const al = [
      a?.role ? `Role: ${a.role}${a.element ? `, built as ${a.element}` : ''}` : '',
      ...[said].flat().filter(Boolean).slice(0, 4).map((x) => `A screen reader says: "${flat(x)}"`),
    ].filter(Boolean);
    if (al.length) sections.push({ title: 'Accessibility', lines: al });
    out.push({ kind: 'specpage', component: name, nodeId: entry.nodeId, sections,
      why: [pl.length ? plural(pl.length, 'property', 'properties') : '', st ? 'its variants' : '', al.length ? 'its accessibility' : ''].filter(Boolean).join(', ') || 'its anatomy' });
  }
  return out;
}

// ── Tokens ───────────────────────────────────────────────────────────────────────────────────────────────────────────
// A CSS value as the value a Figma variable takes: a colour as { r, g, b, a } from 0 to 1, a length in px or a plain
// number as a number. Anything else (rem, a calc, a string) is not written: there is no one Figma value for it.
export function figmaValue(v) {
  const s = String(v ?? '').trim();
  if (!s) return null;
  const c = parseColor(s);
  if (c) return { r: +(c[0] / 255).toFixed(4), g: +(c[1] / 255).toFixed(4), b: +(c[2] / 255).toFixed(4), a: c[3] == null ? 1 : +(+c[3]).toFixed(4) };
  const m = /^(-?\d*\.?\d+)(px)?$/.exec(s);
  return m ? Number(m[1]) : null;
}
const FACT = /^token (.+) \[(.+)\]$/;

// facts: the token facts compared this run (capture-compare.mjs compareTokens), agreed: the record of what the two
// sides last agreed on, aliases: Figma's aliases by variable (the variables capture), codeTokens: the code capture's
// tokens ({ '--css-var': { modes: { mode: { value } } } }), figmaNames: every Figma variable name.
export function tokenEdits({ facts = [], agreed = null, aliases = {}, codeTokens = {}, figmaNames = [], spec } = {}) {
  const changes = [], conflicts = [], create = [];
  for (const f of facts) {
    const m = FACT.exec(f.key ?? '');
    if (!m || f.same) continue;
    const [, variable, mode] = m;
    const moved = classify(f, agreed);
    if (moved === 'both-moved') { conflicts.push({ variable, mode, figma: f.figma, code: f.code, was: agreed?.facts?.[f.key] ?? null, why: 'both changed it since they agreed' }); continue; }
    if (moved !== 'code-moved') continue;
    if (aliases?.[variable]) { conflicts.push({ variable, mode, figma: f.figma, code: f.code, why: `Figma's value is an alias to ${aliases[variable]}, and the code's raw value would break it` }); continue; }
    const value = figmaValue(f.code);
    if (value == null) { conflicts.push({ variable, mode, figma: f.figma, code: f.code, why: 'the code\'s value has no one Figma value' }); continue; }
    changes.push({ variable, mode, before: f.figma, after: f.code, value });
  }
  // Tokens only the code declares: created in Figma under the name the naming convention gives back.
  if (spec) {
    const known = new Set(figmaNames.flatMap((n) => [norm(tokenToVar(n, spec)), norm(n)]));
    for (const [cssVar, t] of Object.entries(codeTokens ?? {})) {
      if (known.has(norm(cssVar))) continue;
      const name = varToToken(cssVar, spec);
      if (!name || known.has(norm(name))) continue;
      const values = {};
      for (const [mode, x] of Object.entries(t?.modes ?? {})) { const v = figmaValue(x?.value); if (v != null) values[mode] = v; }
      const kinds = new Set(Object.values(values).map((v) => (typeof v === 'number' ? 'FLOAT' : 'COLOR')));
      if (!Object.keys(values).length || kinds.size !== 1) continue;
      create.push({ variable: name, cssVar, type: [...kinds][0], values, shown: Object.fromEntries(Object.entries(t.modes).map(([k, x]) => [k, x?.value])) });
    }
  }
  if (!changes.length && !create.length && !conflicts.length) return [];
  return [{ kind: 'tokens', changes, create, conflicts,
    why: [changes.length ? `${plural(changes.length, 'value')} the code changed since the two sides agreed` : '', create.length ? `${plural(create.length, 'token')} only the code has` : ''].filter(Boolean).join(', ') || 'nothing to write, only to decide' }];
}

// ── What the run prints ──────────────────────────────────────────────────────────────────────────────────────────────
const shortV = (v) => (v == null ? 'none' : String(v).length > 40 ? String(v).slice(0, 39) + '…' : String(v));
export function docsLines(edits = []) {
  const d = edits.find((e) => e.kind === 'descriptions'), specs = edits.filter((e) => e.kind === 'specpage'), t = edits.find((e) => e.kind === 'tokens');
  const out = [];
  if (d) {
    out.push(`Descriptions from the intent layer (${d.why}), each written where Figma has none; one Figma has already is kept, and listed when it says something else:`);
    for (const c of d.components.slice(0, 12)) out.push(`   • ${c.component}: "${shortV(c.text)}"`);
    for (const v of d.variables.slice(0, Math.max(0, 12 - d.components.length))) out.push(`   • ${v.variable}: "${shortV(v.text)}"`);
    const more = d.components.length + d.variables.length - 12;
    if (more > 0) out.push(`   … and ${more} more`);
    if (d.variables.length > DESC_CHUNK) out.push(`   ${DESC_CHUNK} variables are written a run; the script says how many are left, and running it again goes on.`);
  }
  if (specs.length) {
    out.push(`Spec pages beside each component set (${specs.length}), "Spec · <name>": its anatomy numbered, its properties, its sizes, spacing and tokens in each variant, its role; written afresh on every run:`);
    for (const s of specs.slice(0, 12)) out.push(`   • ${s.component}: ${s.why}`);
    if (specs.length > 12) out.push(`   … and ${specs.length - 12} more`);
  }
  if (t) {
    if (t.changes.length) { out.push(`Token values the code changed first, written into Figma's variables (${t.changes.length}):`); for (const c of t.changes) out.push(`   • ${c.variable} [${c.mode}]: ${shortV(c.before)} → ${shortV(c.after)}`); }
    if (t.create.length) { out.push(`Tokens only the code has, created as Figma variables (${t.create.length}), each in the collection of the variable it shares the most of its name with:`); for (const c of t.create) out.push(`   • ${c.variable} (${c.cssVar}): ${Object.entries(c.shown).map(([m, v]) => `${m} ${shortV(v)}`).join(', ')}`); }
    if (t.conflicts.length) { out.push(`Token values for a person to decide (${t.conflicts.length}), never written:`); for (const c of t.conflicts) out.push(`   • ${c.variable} [${c.mode}]: Figma ${shortV(c.figma)}, the code ${shortV(c.code)}: ${c.why}`); }
  }
  return out;
}
// The words the NEXT line names them by.
export function docsNames(edits = []) {
  const t = edits.find((e) => e.kind === 'tokens');
  return [edits.some((e) => e.kind === 'descriptions') ? 'descriptions' : '', edits.some((e) => e.kind === 'specpage') ? 'spec pages' : '', t && (t.changes.length || t.create.length) ? 'token values' : ''].filter(Boolean);
}
// Edits with something the script writes (a token list of conflicts alone writes nothing).
export const docsWrites = (e) => e.kind === 'descriptions' || e.kind === 'specpage' || (e.kind === 'tokens' && (e.changes.length || e.create.length));

// ── The script ───────────────────────────────────────────────────────────────────────────────────────────────────────
// Runs inside figma-edits.mjs applyScript, after its prelude: U, changed, skipped, missing and pageOf are there.
export function docsScript(edits = []) {
  const d = edits.find((e) => e.kind === 'descriptions'), specs = edits.filter((e) => e.kind === 'specpage'), t = edits.find((e) => e.kind === 'tokens');
  const parts = [];
  if (d) parts.push(`// Descriptions from the intent layer: written where Figma has none; one there already is kept, and listed when it differs.
const descKept = [];
for (const c of ${lit(d.components, null, 2)}) {
  const n = await figma.getNodeByIdAsync(c.nodeId);
  if (!n || !('description' in n)) { missing.push(c.component); continue; }
  const now = String(n.description || '').trim();
  if (now === c.text) { skipped.push(c.component + ': described already'); continue; }
  if (now) { descKept.push(c.component + ': Figma says "' + now.slice(0, 80) + '"'); continue; }
  U.description(n); n.description = c.text; changed.push(c.component + ': described');
}
const descVars = ${lit(Object.fromEntries(d.variables.map((v) => [v.variable, v.text])))};
let descGiven = 0, descLeft = 0;
if (Object.keys(descVars).length) for (const v of await figma.variables.getLocalVariablesAsync()) {
  const want = descVars[v.name]; if (!want) continue;
  const now = String(v.description || '').trim();
  if (now === want) continue;
  if (now) { descKept.push(v.name + ': Figma says "' + now.slice(0, 80) + '"'); continue; }
  if (descGiven >= ${DESC_CHUNK}) { descLeft++; continue; }
  U.varDescription(v); v.description = want; descGiven++;
}
if (descGiven) changed.push(descGiven + ' variables described' + (descLeft ? '; ' + descLeft + ' left for the next run' : ''));
`);
  if (specs.length) parts.push(`// Spec pages: a frame beside each component set, the engine's own, written afresh on every run.
await figma.loadFontAsync({ family: 'Inter', style: 'Regular' });
await figma.loadFontAsync({ family: 'Inter', style: 'Bold' });
const specText = (chars, style, size) => { const x = figma.createText(); x.fontName = { family: 'Inter', style }; x.fontSize = size; x.characters = chars; return x; };
const AUTO_NAME = /^(frame|group|rectangle|vector|ellipse|line|polygon|star|boolean|union|subtract|instance|component)(\\s*\\d+)?$/i;
for (const sp of ${lit(specs.map((s) => ({ component: s.component, nodeId: s.nodeId, sections: s.sections })), null, 2)}) {
  const set = await figma.getNodeByIdAsync(sp.nodeId);
  if (!set || !set.parent) { missing.push(sp.component + ' (spec page)'); continue; }
  await pageOf(set);
  const title = 'Spec · ' + sp.component, host = set.parent;
  const old = (host.children || []).find((n) => n.type === 'FRAME' && n.name === title);
  const at = old ? { x: old.x, y: old.y } : { x: set.x + set.width + 120, y: set.y };
  if (old) { U.remade(title, 'run the hand-back again (rms-design-system-engine --figma-edits) and it is written afresh'); old.remove(); }
  const box = figma.createFrame();
  box.name = title; box.layoutMode = 'VERTICAL'; box.itemSpacing = 16; box.paddingTop = box.paddingBottom = box.paddingLeft = box.paddingRight = 32;
  box.primaryAxisSizingMode = 'AUTO'; box.counterAxisSizingMode = 'AUTO'; box.x = at.x; box.y = at.y;
  box.appendChild(specText(sp.component, 'Bold', 28));
  // Its anatomy: the default variant, a numbered marker on each part a person named, the names listed below it.
  const main = set.type === 'COMPONENT_SET' ? (set.defaultVariant || set.children[0]) : set.type === 'COMPONENT' ? set : null;
  if (main && main.createInstance) {
    box.appendChild(specText('Anatomy', 'Bold', 16));
    const stage = figma.createFrame(); stage.name = 'Anatomy'; stage.fills = []; stage.clipsContent = false;
    const inst = main.createInstance(); stage.appendChild(inst); inst.x = 24; inst.y = 24;
    stage.resize(Math.max(inst.width + 48, 120), inst.height + 48);
    const origin = inst.absoluteTransform, named = [];
    const walk = (n, depth) => { for (const c of (n.children || [])) { if (!c.visible) continue; if (!AUTO_NAME.test(c.name) && named.length < 12) named.push(c); if (depth < 2 && c.type !== 'INSTANCE') walk(c, depth + 1); } };
    walk(inst, 0);
    named.forEach((c, i) => {
      const dot = figma.createEllipse(); dot.resize(18, 18); dot.fills = [{ type: 'SOLID', color: { r: 0.85, g: 0.1, b: 0.35 } }];
      const dx = c.absoluteTransform[0][2] - origin[0][2], dy = c.absoluteTransform[1][2] - origin[1][2];
      dot.x = 24 + dx - 9; dot.y = 24 + dy - 9; stage.appendChild(dot);
      const num = specText(String(i + 1), 'Bold', 10); num.fills = [{ type: 'SOLID', color: { r: 1, g: 1, b: 1 } }]; num.x = dot.x + 5; num.y = dot.y + 3; stage.appendChild(num);
    });
    box.appendChild(stage);
    if (named.length) box.appendChild(specText(named.map((c, i) => (i + 1) + '. ' + c.name).join('\\n'), 'Regular', 13));
  }
  for (const s of sp.sections) { box.appendChild(specText(s.title, 'Bold', 16)); box.appendChild(specText(s.lines.join('\\n'), 'Regular', 13)); }
  host.appendChild(box);
  U.made(box, title);
  changed.push(sp.component + ': spec page');
}
`);
  if (t && (t.changes.length || t.create.length)) parts.push(`// Token values the code changed first, and tokens only the code has. A value that is an alias in Figma now is never
// written over; each write records the value it replaces.
const tokVars = await figma.variables.getLocalVariablesAsync();
const tokColls = await figma.variables.getLocalVariableCollectionsAsync();
const collOf = (v) => tokColls.find((c) => c.id === v.variableCollectionId);
const modeOf = (coll, mode) => { const m = coll.modes.find((x) => x.name.toLowerCase() === String(mode).toLowerCase()); return m ? m.modeId : coll.modes.length === 1 ? coll.defaultModeId : null; };
const tokKept = [];
for (const c of ${lit(t.changes, null, 2)}) {
  const v = tokVars.find((x) => x.name === c.variable);
  if (!v) { missing.push(c.variable); continue; }
  const coll = collOf(v), mid = coll && modeOf(coll, c.mode);
  if (!mid) { missing.push(c.variable + ' [' + c.mode + ']: no such mode'); continue; }
  const now = v.valuesByMode[mid];
  if (now && now.type === 'VARIABLE_ALIAS') { tokKept.push(c.variable + ' [' + c.mode + ']: an alias in Figma, left for a person'); continue; }
  U.varValue(v, mid, c.mode); v.setValueForMode(mid, c.value); changed.push(c.variable + ' [' + c.mode + '] → ' + c.after);
}
const shared = (a, b) => { const x = a.split('/'), y = b.split('/'); let i = 0; while (i < x.length && i < y.length && x[i] === y[i]) i++; return i; };
for (const c of ${lit(t.create, null, 2)}) {
  if (tokVars.some((x) => x.name === c.variable)) { skipped.push(c.variable + ': in Figma already'); continue; }
  const sib = tokVars.filter((x) => x.resolvedType === c.type).sort((a, b) => shared(b.name, c.variable) - shared(a.name, c.variable))[0];
  const coll = sib ? collOf(sib) : tokColls[0];
  if (!coll) { missing.push(c.variable + ': no collection to put it in'); continue; }
  const v = figma.variables.createVariable(c.variable, coll, c.type);
  U.madeVariable(v);
  for (const [mode, value] of Object.entries(c.values)) { const mid = modeOf(coll, mode) || coll.defaultModeId; v.setValueForMode(mid, value); }
  changed.push(c.variable + ': created in ' + coll.name);
}
`);
  return parts.join('');
}
// What the script returns besides changed, skipped and missing.
export const docsReturns = (edits = []) => [edits.some((e) => e.kind === 'descriptions') ? 'descKept' : '', edits.some((e) => e.kind === 'tokens' && (e.changes.length || e.create.length)) ? 'tokKept' : ''].filter(Boolean);
