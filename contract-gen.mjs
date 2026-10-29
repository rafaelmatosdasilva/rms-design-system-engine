// ── Standard contract emitter ────────────────────────────────────────────────
// Emits the design-system contract in the STANDARD format the project follows, into ONE
// local (gitignored) contracts/ folder:
//   • tokens  → one W3C DTCG dictionary (tokens.json): $type/$value, nested by dot-path,
//               per-mode values under $extensions. From the figma-vars snapshot.
//   • components → one standard <name>.contract.json each: id / version /
//               description / props[] (bindings.figma + bindings.code) / anatomy /
//               states / variants / semantics. Tokens are referenced by {family.token},
//               never copied in.
//   • schema  → contract.schema.json validates every emitted contract.
//
// It is an AUDITOR output, not a generator: nothing here produces CSS or Figma.
//
// CAPTURED vs AUTHORED are split by file so decisions can be committed while values stay
// local. CAPTURED fields (id, figmaNodeId, props types/defaults/options + bindings.figma,
// anatomy, states, variants, tokens) are refreshed from the snapshots every run into the
// local views. AUTHORED fields (version, description, notes, semantics, props[].bindings.code)
// live in a SINGLE committed file, contract.authored.json (project root), which the generator
// reads (and scaffolds once if missing) and Gate 14 also reads — so bindings apply in CI.
//
// Generic: no project names, tokens, or components are hardcoded.

import { readFileSync, existsSync, writeFileSync, mkdirSync, readdirSync, unlinkSync, rmdirSync, rmSync } from 'node:fs';
import { dirname, resolve, join, relative, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { pruneCandidates } from './prune-check.mjs';
import { withTextScaleKeys } from './naming-convention.mjs';
import { buildStamp, mayWrite } from './stamp.mjs';
import { shortStyleNames, componentStyleKey } from './text-styles.mjs';
import { resolveStatus, parseStatusTags, lintStatusFields, statusFindings, statusLine } from './decision-status.mjs';
import { buildCatalog, catalogTable } from './ui-catalog.mjs';
import { readInvented, inventedFor } from './invented.mjs';
import { loadLocator } from './component-locator.mjs';
import { codeComponents } from './component-source.mjs';
import { readableOn, pairsOf, pairLines } from './token-pairs.mjs';
import { primitiveGuideLines } from './primitives.mjs';
import { authorityLines } from './authority.mjs';
import { readIntentLayer, matchComponents, codeFilesOf, componentIntent, layerPages, short } from './intent-layer.mjs';
import { checkedLayer } from './intent-truth.mjs';
import { codeHalf, codeSlots, figmaStatesVariants, stateTokens, accessibilityOf } from './contract-code.mjs';
import { roleWord } from './role-markup.mjs';
import { execFileSync } from 'node:child_process';
import { mirrorState, ensureHistory, commitsOf } from './gitlab-history.mjs';

// The last commit that changed a file: from git where the project is a checkout, else from the GitLab mirror's history
// (gitlab-history.mjs). Per file, so a component whose file did not change keeps the same contract. null: not known.
export function lastCommitOf(ROOT, file) {
  if (!file) return null;
  try {
    const sha = execFileSync('git', ['log', '-1', '--format=%H', '--', file], { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    if (/^[0-9a-f]{40}$/.test(sha)) return sha;
  } catch { /* not a checkout */ }
  try { return commitsOf(ROOT, [file], { max: 1 })?.[0]?.sha ?? null; } catch { return null; }
}

// The contract format's version, written in every contract and in its schema: raised when a field changes meaning.
export const CONTRACT_VERSION = 1;

function readJSON(p) { try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return null; } }
function ensureDir(p) { try { mkdirSync(p, { recursive: true }); } catch { /* best-effort */ } }

// A DS token name like "buttonPrimary/background/color" → path ["buttonPrimary","background","color"].
const tokenPath = (name) => String(name).split('/').map(s => s.trim()).filter(Boolean);
// → a reference string "{buttonPrimary.background.color}" (the standard {family.token} syntax).
const tokenRef  = (name) => '{' + tokenPath(name).join('.') + '}';

// Set a leaf at a nested path, creating groups as needed. Skips (returns false) if the
// path would overwrite an existing leaf or descend through one (name collision).
function setDeep(root, path, leaf) {
  let o = root;
  for (let i = 0; i < path.length - 1; i++) {
    if (o[path[i]] == null) o[path[i]] = {};
    else if (typeof o[path[i]] !== 'object' || o[path[i]].$value !== undefined) return false;
    o = o[path[i]];
  }
  const last = path[path.length - 1];
  if (o[last] !== undefined && o[last].$value === undefined && typeof o[last] === 'object') return false;
  o[last] = leaf;
  return true;
}

function countLeaves(node) {
  if (node == null || typeof node !== 'object') return 0;
  if (node.$value !== undefined) return 1;
  let n = 0;
  for (const k of Object.keys(node)) if (!k.startsWith('$')) n += countLeaves(node[k]);
  return n;
}

const stripFigmaId = (key) => String(key).split('#')[0].trim();

// Figma property types considered STATES (vs plain VARIANTS) for anatomy grouping.
const STATE_NAMES = new Set(['state', 'disabled', 'hover', 'focus', 'active', 'selected', 'pressed', 'loading', 'checked', 'filled']);

// ── DTCG token dictionary ────────────────────────────────────────────────────
// Where a text style's composite token lives: typography.<style>, or textStyle.<style> when Figma also has variables
// named under it (typography/m/font-size makes typography.m a group, which a token cannot also be).
export function textStylePath(style, vars = {}) {
  const grouped = Object.keys(vars?.sizing ?? {}).some((k) => k.startsWith(`typography/${style}/`));
  return grouped ? ['textStyle', style] : ['typography', style];
}
function buildTokens(vars, modes) {
  const out = {
    $description: 'Design-system tokens (W3C DTCG). Auto-generated from the Figma snapshot by rms-design-system-engine — do not edit by hand. Project-specific DS data: keep LOCAL, never commit to the public skill.',
  };
  const lightKey = modes?.[0]?.snapshotKey || 'light';
  const darkKey  = modes?.[1]?.snapshotKey || null;
  // Optional per-token metadata sidecar { "<name>": { description?, deprecated? } }, captured from
  // each Figma variable's own description (deprecated via a "@deprecated" marker). Additive: absent
  // leaves the DTCG defaults ($deprecated:false, no $description).
  // when the description also says what won or why (@use-instead / @why, or text after
  // @deprecated), $deprecated carries that explanation as a string - the DTCG spec allows
  // $deprecated to be a string explaining the deprecation - so an agent reads the replacement
  // instead of finding two tokens that both look valid.
  const meta = vars.tokenMeta || {};
  const applyMeta = (leaf, name) => {
    const m = meta[name];
    if (m && typeof m === 'object') {
      if (typeof m.description === 'string' && m.description.trim()) leaf.$description = m.description.trim();
      const tags = parseStatusTags(m.description);
      if (m.deprecated === true || tags.state === 'deprecated') {
        const why = [tags.supersededBy ? `Use ${tags.supersededBy} instead.` : '', tags.rationale || ''].filter(Boolean).join(' ');
        leaf.$deprecated = why || true;
      }
    }
    return leaf;
  };

  // setDeep returns false on a name collision (a token path that would overwrite a leaf or descend
  // through one, e.g. a color "spacing" and a sizing "spacing/xs"). Record the drop so it is surfaced
  // loudly instead of a token silently vanishing from the dictionary ("silence is never a pass").
  const dropped = [];
  const place = (name, path, leaf) => { if (!setDeep(out, path, leaf)) dropped.push(name); };

  // color — resolved per mode; base $value is the first mode, other modes under $extensions.
  const cLight = vars.color?.[lightKey] || {};
  const cDark  = darkKey ? (vars.color?.[darkKey] || {}) : null;
  const readable = readableOn(vars.color);   // the surfaces each text colour meets 4.5:1 on, in every mode
  // And the one surface each was made for, read from the names and confirmed against the values: an agent given the
  // shortlist picks a different grey on every card, so it is given the answer as well.
  const goesWith = new Map(pairsOf(vars.color).map((x) => [x.text, x]));
  for (const name of Object.keys(cLight)) {
    const leaf = { $type: 'color', $value: cLight[name], $deprecated: false };
    if (cDark && cDark[name] !== undefined && cDark[name] !== cLight[name]) {
      leaf.$extensions = { 'com.rms.design-system-engine': { modes: { [lightKey]: cLight[name], [darkKey]: cDark[name] } } };
    }
    if (readable[name]) (leaf.$extensions ??= { 'com.rms.design-system-engine': {} })['com.rms.design-system-engine'].readableOn = readable[name];
    const pair = goesWith.get(name);
    if (pair) (leaf.$extensions ??= { 'com.rms.design-system-engine': {} })['com.rms.design-system-engine'].goesWith = { surface: pair.surface, ratio: pair.ratio, by: pair.by, ok: pair.ok };
    place(name, tokenPath(name), applyMeta(leaf, name));
  }
  // sizing — mode-agnostic dimensions (px).
  for (const [name, val] of Object.entries(vars.sizing || {})) {
    place(name, tokenPath(name), applyMeta({ $type: 'dimension', $value: String(val), $deprecated: false }, name));
  }
  // typography — DTCG composite type.
  // Each style under its short name (its last segment when no other style shares it), as components refer to it.
  for (const [key, name] of shortStyleNames(vars.typography || {})) {
    const val = vars.typography[key];
    if (val && typeof val === 'object') {
      place(name, textStylePath(name, vars), applyMeta({
        $type: 'typography',
        $value: { fontSize: val.size, fontWeight: String(val.weight), lineHeight: val.lh },
        $deprecated: false,
      }, name));
    }
  }
  // breakpoints — dimensions, when present.
  for (const [name, val] of Object.entries(vars.breakpoints || {})) {
    place(name, ['breakpoint', name], applyMeta({ $type: 'dimension', $value: String(val), $deprecated: false }, name));
  }
  return { tokens: out, dropped, pairs: pairsOf(vars.color) };
}

// ── Component contract pieces ─────────────────────────────────────────────────
// A SLOT is a place in the component for other components (its children), not words.
const FIGMA_KIND_TO_TYPE = { VARIANT: 'enum', BOOLEAN: 'boolean', TEXT: 'text', INSTANCE_SWAP: 'instance', SLOT: 'children' };

function buildProps(props, propDescriptions = {}) {
  const properties = props?.properties || {};
  const out = [];
  for (const [key, def] of Object.entries(properties)) {
    const name = stripFigmaId(key);
    const p = {
      name,
      type: FIGMA_KIND_TO_TYPE[def.type] || 'unknown',
      default: def.defaultValue,
      bindings: {
        figma: { kind: def.type, property: name },   // CAPTURED — from Figma
        code: null,                                   // AUTHORED — filled by hand, preserved
      },
    };
    // A slot that takes only the components Figma lists for it (none listed: it takes any).
    if (def.type === 'SLOT' && def.slotSettings?.allowPreferredValuesOnly && (def.preferredValues ?? []).length) p.slot = { preferredOnly: true, preferred: def.preferredValues.length };
    // Figma component-property definitions carry no per-prop description, so this is authored
    // (contract.authored.json → components[name].propDescriptions), with a forward-compat capture path.
    const desc = def.description ?? propDescriptions[name];
    if (typeof desc === 'string' && desc.trim()) p.description = desc.trim();
    if (Array.isArray(def.variantOptions)) p.options = def.variantOptions;
    out.push(p);
  }
  return out;
}

function insetOf(paddingVar) {
  if (!paddingVar) return null;
  const inset = {};
  if (paddingVar.tb) inset.blockToken = tokenRef(paddingVar.tb);
  if (paddingVar.lr) inset.inlineToken = tokenRef(paddingVar.lr);
  return Object.keys(inset).length ? inset : null;
}

function buildAnatomy(contract, structure, vars = {}) {
  const c = contract || {};
  const s = structure || {};
  const root = {};

  // Padding bound to a border's width (base/border/top) is the room Figma leaves for the stroke, which the code's border
  // takes: recorded as that, never as the component's padding.
  const pad = c.paddingVar || s.paddingVar;
  const inset = insetOf(pad);
  const borderRoom = !c.paddingVar && pad && [pad.tb, pad.lr].filter(Boolean).every((v) => /(^|[/.])(border|stroke)s?([/.]|$)/i.test(String(v)));
  if (inset) root[borderRoom ? 'borderInset' : 'inset'] = inset;

  // A gap spaces two items or more: on a frame that lays out one (a button's single content frame) it does nothing, so
  // whatever variable Figma bound there is not the component's spacing.
  const gap = c.gapVar ?? s.gapVar;
  const items = c.inFlow ?? s.inFlow;
  if (gap && (c.gapVar || items == null || items >= 2)) root.gapToken = tokenRef(gap);
  else if (c.gapPx === 0) root.gap = 0;

  const radius = c.innerRadiusVar || s.innerRadiusVar;
  if (radius) root.radiusToken = tokenRef(radius);

  if (c.strokeSides) root.stroke = c.strokeSides;

  const h = c.h ?? s.h;
  if (h != null) root.height = h;

  // A size bound to a scale's variable records the scale ('s'): the token is that scale's style the weight names, else
  // its regular one (text-styles.mjs componentStyleKey).
  const fontSize = c.fontSizeVar || s.fontSizeVar;
  const styleShort = new Map(shortStyleNames(vars.typography || {}));
  if (fontSize) root.typographyToken = '{' + textStylePath(styleShort.get(componentStyleKey(vars.typography, fontSize, c.fontWeightVar || s.fontWeightVar)) ?? fontSize, vars).join('.') + '}';

  const anatomy = { root };

  // children → named parts: the hand-authored contract's, then the frames inside it Figma binds a padding or a gap on
  // (the structure snapshot's childFramePadding / childFrameGaps), where the component's real spacing often sits.
  const captured = new Map();
  for (const k of s.childFramePadding ?? []) if (k?.name) captured.set(k.name, { ...(captured.get(k.name) ?? { name: k.name }), paddingVar: k.paddingVar });
  for (const k of s.childFrameGaps ?? []) if (k?.name) captured.set(k.name, { ...(captured.get(k.name) ?? { name: k.name }), gapVar: k.gapVar, gapPx: k.gapPx });
  const authoredNames = new Set((c.children || []).map((ch) => ch?.name).filter(Boolean));
  for (const ch of [...(c.children || []), ...[...captured.values()].filter((k) => !authoredNames.has(k.name))]) {
    if (!ch || !ch.name) continue;
    const part = {};
    if (ch.cssSelector) part.selector = ch.cssSelector;
    if (ch.gapVar) part.gapToken = tokenRef(ch.gapVar);
    else if (ch.gapPx === 0) part.gap = 0;
    const ci = insetOf(ch.paddingVar);
    if (ci) part.inset = ci;
    anatomy[ch.name] = part;
  }
  return anatomy;
}

function buildStatesVariants(contract, props) {
  const pm = contract?.propertyMap || {};
  const properties = props?.properties || {};
  const states = [];
  const variants = [];
  for (const [figProp, mapping] of Object.entries(pm)) {
    if (mapping == null || typeof mapping !== 'object') continue;   // TEXT/INSTANCE_SWAP or single-selector: skip
    const isState = STATE_NAMES.has(figProp.toLowerCase());
    for (const [opt, selector] of Object.entries(mapping)) {
      if (typeof selector !== 'string') continue;
      const entry = { when: { [figProp]: opt }, selector };
      if (isState) { entry.name = `${figProp}=${opt}`; states.push(entry); }
      else variants.push(entry);
    }
  }
  return { states, variants };
}

// code (optional): { api (structure-capture.mjs apiEntry), text (its source), aliases, stateBindings, publish, idPrefix,
// schemaRef, figmaFile } - the code half of the contract (contract-code.mjs). publish: the contract is written for others to
// read (an intent layer): it links the intent page instead of copying it, and leaves out where it is used locally.
function buildContract(name, { contract, structure, props, authored, composition, componentNames, vars = {}, intentPage = null, code = null }) {
  const c = contract?.[name];
  const s = structure?.[name];
  const p = props?.[name];
  const a = authored || {};
  const { states, variants } = buildStatesVariants(c, p);

  const out = {
    $schema: code?.schemaRef ?? './contract.schema.json',
    schemaVersion: CONTRACT_VERSION,
    id: (code?.idPrefix ?? 'rms.') + name,
    name,
    version: a.version || '0.1.0',                                                  // AUTHORED (from contract.authored.json)
    description: a.description                                                       // AUTHORED, else CAPTURED Figma component description
                 || (p?.description ? String(p.description).slice(0, 300)
                 : (c?._note ? String(c._note).slice(0, 300)
                 : `${name} — captured from Figma by rms-design-system-engine.`)),
    figmaNodeId: p?.nodeId || s?.nodeId || null,                                    // CAPTURED
    props: buildProps(p, a.propDescriptions),                                        // CAPTURED (+ bindings.code + authored descriptions)
    anatomy: buildAnatomy(c, s, vars),                                               // CAPTURED
    states,                                                                          // CAPTURED
    variants,                                                                        // CAPTURED
    semantics: a.semantics || { element: null, aria: {} },                          // AUTHORED
    notes: a.notes || '',                                                            // AUTHORED
    // No time of writing here (it is in built.json): a component that did not change gives the same file.
    'x-design-system-engine': {
      note: code?.publish
        ? 'Generated by rms-design-system-engine from Figma, the code and its Code Connect files. Never edit by hand: change Figma, the code or contract.authored.json, run the engine again and publish the result.'
        : 'Generated LOCAL view (rms-design-system-engine). CAPTURED fields refresh from the Figma snapshots and the code each run; AUTHORED fields (version, description, notes, semantics, props[].bindings.code) come from the committed contract.authored.json — edit them THERE, not here. This file is gitignored; do not hand-edit.',
      sources: 'figma-vars / figma-structure / figma-component-props snapshots + the code + Code Connect + structure-contract.mjs + contract.authored.json',
    },
  };

  // Decision status + the *why*: current / deprecated / experimental, what superseded it and
  // why. AUTHORED fields win; tags in the CAPTURED Figma description fill the gaps. Emitted only when
  // the DS actually says something, so a DS with no convention is unchanged.
  {
    const status = resolveStatus(a, p?.description);
    if (status) out.status = status;
  }

  // AUTHORED agent guidance: when NOT to use this component, and what to use instead.
  // Optional and additive — absent leaves the contract unchanged.
  if (typeof a.whenNotToUse === 'string' && a.whenNotToUse.trim()) out.whenNotToUse = a.whenNotToUse.trim();
  {
    const ui = Array.isArray(a.useInstead)
      ? a.useInstead.filter((x) => typeof x === 'string' && x.trim()).map((x) => x.trim())
      : (typeof a.useInstead === 'string' && a.useInstead.trim() ? [a.useInstead.trim()] : []);
    if (ui.length) out.useInstead = ui;
  }

  // The team's intent layer (intent-layer.mjs): why it exists and how to use it, as its page says, with the page's
  // link. Kept apart from the authored guidance above so each line keeps where it came from.
  // Published into the intent layer itself, the contract links the page instead of copying it, so the layer never reads
  // its own words back.
  if (intentPage && code?.publish) out.intentPage = intentPage.url ?? intentPage.file;
  else if (intentPage) {
    const it = { source: intentPage.url ?? intentPage.file };
    for (const k of ['purpose', 'whenToUse', 'whenNotToUse', 'mistakes', 'limitations', 'rules']) if (intentPage[k]) it[k] = intentPage[k];
    if (Object.keys(it).length > 1) out.intent = it;
  }

  // Relationships: composesWith is DERIVED from the composition snapshot (the real DS
  // components this one nests — icons and raw selectors are excluded); neverCombineWith is
  // AUTHORED (only the genuinely invalid pairings). Emitted only when non-empty.
  {
    const kids = Array.isArray(composition?.[name]) ? composition[name] : [];
    const known = componentNames instanceof Set ? componentNames : new Set(componentNames || []);
    const composesWith = [...new Set(kids.map(stripFigmaId).filter((k) => known.has(k) && k !== name))];
    const neverCombineWith = Array.isArray(a.neverCombineWith)
      ? [...new Set(a.neverCombineWith.filter((x) => typeof x === 'string' && x.trim()).map((x) => x.trim()))]
      : [];
    if (composesWith.length || neverCombineWith.length) {
      out.relationships = {};
      if (composesWith.length) out.relationships.composesWith = composesWith;
      if (neverCombineWith.length) out.relationships.neverCombineWith = neverCombineWith;
    }
  }

  // AUTHORED bindings come from the committed contract.authored.json, keyed by Figma prop name.
  const bindings = a.bindings || {};
  for (const pp of out.props) {
    const b = bindings[pp.name];
    if (b && typeof b === 'object') pp.bindings.code = b;   // { attribute } | { slot } | { attribute: true } ...
  }

  // The code half (contract-code.mjs): each Figma property's code prop or slot with the code's own facts, what its Code
  // Connect file says it decides, where the two differ; the props only the code has; events, slots, states, the tokens
  // each state paints with, and accessibility, each saying where it came from.
  if (code) {
    out.source = {
      ...(p || s ? { figma: { ...(code.figmaFile ? { file: code.figmaFile } : {}), nodeId: p?.nodeId || s?.nodeId || null, name } } : {}),
      ...(code.api?.file ? { code: { file: code.api.file, ...((code.api.codeConnectTag ?? code.api.tag) ? { tag: code.api.codeConnectTag ?? code.api.tag } : {}), ...(code.api.syntax ? { syntax: code.api.syntax } : {}), ...(code.commit ? { commit: code.commit } : {}) } } : {}),
      ...(code.api?.codeConnectFile ? { codeConnect: code.api.codeConnectFile } : {}),
    };
    const half = codeHalf(out.props, p?.properties, code.api, { authored: a, aliases: code.aliases });
    out.props = half.props;
    if (half.codeOnly.length) out.codeOnly = half.codeOnly;
    if (half.events.length) out.events = half.events;
    const cs = codeSlots(code.api, out.props);
    if (cs.length) out.codeSlots = cs;
    if (!out.states.length && !out.variants.length) Object.assign(out, figmaStatesVariants(p?.properties, code.text));
    const tk = stateTokens(code.stateBindings, p?.properties, code.componentTokens);
    if (tk) out.tokens = tk;
    const acc = accessibilityOf(code.text, { figmaRole: roleWord(p?.annotations), authored: a.semantics });
    if (acc) out.accessibility = acc;
    // Published, a contract says what is known: the whole description, and no empty placeholder for what nobody wrote.
    if (code.publish) {
      if (!a.description && p?.description) out.description = String(p.description).trim();
      if (!a.semantics) delete out.semantics;
      if (!a.notes) delete out.notes;
    }
  }

  // Usage scaffold: a grounded, ready-to-fill example derived from THIS contract - the authored
  // semantic element (when known) plus each prop with a concrete example value (its default, else its
  // first variant option). Nothing is invented: every value comes from the captured props / authored
  // semantics, so an agent instantiates the component with real names instead of guessing. Framework
  // syntax is intentionally left to the agent (we give the element + prop values, not JSX vs class).
  // Emitted only when there is something concrete to show.
  {
    const exampleProps = {};
    for (const pr of out.props) {
      const val = (pr.default != null && pr.default !== '') ? pr.default
        : (Array.isArray(pr.options) && pr.options.length ? pr.options[0] : undefined);
      if (val !== undefined) exampleProps[pr.name] = val;
    }
    const usage = {};
    if (out.semantics && out.semantics.element) usage.element = out.semantics.element;
    if (Object.keys(exampleProps).length) usage.props = exampleProps;
    if (Object.keys(usage).length) out.usage = usage;
  }

  // Slot constraints: surface the component's slots for the agent - each Figma INSTANCE_SWAP
  // property (or a prop the contract binds to a code slot) is a place another component goes. `accepts`
  // is the component's own composesWith universe (what it actually nests), so the agent has the valid
  // set without guessing. Derived from the contract's own props + relationships; emitted only when there
  // are slots.
  // A boolean property names the layers it shows or hides (captured as toggles), so a generator and
  // the code know which part it controls.
  for (const pr of out.props) if (pr.type === 'boolean' && Array.isArray(s?.toggles?.[pr.name])) pr.toggles = s.toggles[pr.name];

  {
    const structureEntry = s;
    const accepts = out.relationships?.composesWith || [];
    const slots = out.props
      .filter((p) => p.bindings?.figma?.kind === 'INSTANCE_SWAP'
        || (p.bindings?.code && (p.bindings.code.slot === true || typeof p.bindings.code.slot === 'string')))
      .map((p) => {
        const s = { name: p.name, default: p.default ?? null };
        if (typeof p.bindings?.code?.slot === 'string') s.code = p.bindings.code.slot;
        // Figma's preferred values for the slot (captured as names in the structure snapshot's
        // slots) are the design's own list; the nesting universe is the fallback.
        const preferred = structureEntry?.slots?.[p.name];
        if (Array.isArray(preferred) && preferred.length) { s.accepts = preferred; s.acceptsFrom = 'figma preferred values'; }
        else if (accepts.length) s.accepts = accepts;
        return s;
      });
    if (slots.length) out.slots = slots;
  }
  return out;
}

// ── Schema + minimal validator (no external deps) ─────────────────────────────
// Every field a contract can carry is declared, so a reader knows the whole shape and an unknown field is an error.
const str = { type: 'string' }, strs = { type: 'array', items: { type: 'string' } };
const sourced = (value) => ({ type: 'object', required: ['value', 'from'], properties: { value, from: { enum: ['figma', 'code', 'authored'] } }, additionalProperties: false });
const CODE_SIDE = {
  type: ['object', 'null'],
  description: 'The code prop or slot this Figma property is, with the code\'s own facts (null: none found).',
  properties: {
    prop: str, slot: str, attribute: { type: ['string', 'boolean'] },
    derived: { const: true, description: 'The code value is computed from the Figma value (a part of its words, an icon resolved from it), not the value itself.' },
    key: { type: 'string', description: 'The key of the object prop it fills (Code Connect writes :opts="{ caption: … }").' },
    as: { enum: ['prop', 'slot', 'defaultSlot'] },
    source: { enum: ['authored', 'alias', 'codeConnect', 'name', 'convention'], description: 'Who decided the pairing: a binding written by hand, a documented alias, Code Connect, the same name, or the naming convention (labelContent and label).' },
    type: str, options: { type: 'array' }, default: {}, defaultExpression: { type: 'string', description: 'A default the code builds (an object, a list), as the code writes it.' }, required: { type: 'boolean' }, description: str,
    confidence: { enum: ['verified', 'single-source', 'uncertain'] },
    valueMap: { type: 'object', description: 'Figma value → code value, from Code Connect.' },
    inverted: { const: true, description: 'The code prop holds the opposite of the Figma value (Figma showClose on = code hideClose false).' },
  },
};
const CONTRACT_SCHEMA = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'https://rms-design-system-engine/contract.schema.json',
  title: 'rms-design-system-engine component contract',
  description: 'One component: its Figma properties and the code prop each one is, where the two differ, what only the code has, its events, slots, states, tokens and accessibility. Generated; never edited by hand.',
  type: 'object',
  required: ['schemaVersion', 'id', 'name', 'version', 'props', 'anatomy'],
  additionalProperties: false,
  properties: {
    $schema: str,
    schemaVersion: { const: CONTRACT_VERSION },
    id: { type: 'string', pattern: '^[A-Za-z0-9_.:/-]+$' },
    name: str,
    version: str,
    description: str,
    figmaNodeId: { type: ['string', 'null'] },
    source: {
      type: 'object', additionalProperties: false,
      properties: {
        figma: { type: 'object', properties: { file: str, nodeId: { type: ['string', 'null'] }, name: str, alsoDrawnAs: { type: 'array', description: 'Other Figma components drawn of the same code file.', items: { type: 'object', required: ['name'], properties: { name: str, nodeId: { type: ['string', 'null'] } } } } }, additionalProperties: false },
        code: { type: 'object', properties: { file: str, tag: str, syntax: str, commit: { type: 'string', description: 'The last commit that changed its code file.' } }, additionalProperties: false },
        codeConnect: str,
      },
    },
    props: {
      type: 'array',
      description: 'One per Figma property.',
      items: {
        type: 'object',
        required: ['name', 'bindings'],
        properties: {
          name: str, type: str, default: {}, options: { type: 'array' }, description: str, toggles: strs,
          slot: { type: 'object' },
          bindings: {
            type: 'object',
            required: ['figma', 'code'],
            properties: {
              figma: { type: 'object', required: ['kind', 'property'], properties: { kind: str, property: str, default: {}, defaultNodeId: str, options: { type: 'array' } } },
              code: CODE_SIDE,
            },
          },
          conditions: {
            type: 'array', description: 'Code attributes this property decides are written (from Code Connect): only when it is on, or off when negated, or equal to a value.',
            items: { type: 'object', required: ['code', 'role'], properties: { code: str, role: { const: 'condition' }, negated: { type: 'boolean' }, equals: {}, unclear: { const: true, description: 'It decides the attribute in a way the reader does not follow (inside a computed value): which way is not said.' }, source: { enum: ['convention'], description: 'Read from the naming convention (showLabel and label), not from Code Connect.' } } },
          },
          differences: {
            type: 'array', description: 'Where Figma and the code disagree on this property.',
            items: { type: 'object', required: ['kind'], properties: { kind: { enum: ['default', 'options', 'name'] }, figma: {}, code: {}, onlyInFigma: { type: 'array' }, onlyInCode: { type: 'array' } } },
          },
          suggestion: { type: 'string', description: 'A code prop with a near name, never taken as the binding: record it to make it one.' },
          alsoWrites: { ...strs, description: 'Other code attributes (or keys of one, opts.caption) its Code Connect file fills with the same value.' },
        },
      },
    },
    codeOnly: {
      type: 'array', description: 'Code props no Figma property is paired with. setBy: the Figma properties that still reach it (deciding whether it is written, or filling it beside another prop).',
      items: { type: 'object', required: ['name'], properties: { name: str, type: str, options: { type: 'array' }, default: {}, defaultExpression: str, required: { type: 'boolean' }, description: str, confidence: str, setBy: strs } },
    },
    events: { type: 'array', items: { type: 'object', required: ['name'], properties: { name: str, payload: strs }, additionalProperties: false } },
    codeSlots: { type: 'array', items: { type: 'object', required: ['name'], properties: { name: str, props: strs, figmaProperty: str }, additionalProperties: false } },
    anatomy: { type: 'object', required: ['root'] },
    states: { type: 'array', items: { type: 'object', properties: { name: str, when: { type: 'object' }, selector: str, from: { enum: ['figma', 'code'] } } } },
    variants: { type: 'array', items: { type: 'object', properties: { when: { type: 'object' }, selector: str, from: { enum: ['figma', 'code'] } } } },
    tokens: { type: 'object', properties: { used: strs, byState: { type: 'object', additionalProperties: strs } }, additionalProperties: false },
    accessibility: {
      type: 'object', additionalProperties: false,
      properties: { element: sourced(str), role: sourced(str), aria: sourced(strs), keyboard: sourced(strs) },
    },
    semantics: { type: 'object' },
    notes: str,
    whenNotToUse: str,
    status: {
      type: 'object',
      required: ['state'],
      properties: {
        state: { enum: ['current', 'deprecated', 'experimental'] },
        supersededBy: str, since: str, rationale: str, source: str,
      },
    },
    useInstead: strs,
    intent: {
      type: 'object',
      required: ['source'],
      properties: { source: str, purpose: str, whenToUse: strs, whenNotToUse: strs, mistakes: strs, limitations: strs, rules: strs },
    },
    intentPage: { type: 'string', description: 'Its page in the intent layer, linked (a published contract never copies it).' },
    partOf: { type: 'string', description: 'The component this one is a part of: placed only inside it, never on its own.' },
    parts: { type: 'array', description: 'Its parts: components placed only inside it, each with what its documentation says.', items: { type: 'object', properties: { name: { type: 'string' }, docs: { type: 'array', items: { type: 'string' } } } } },
    decidedAgainst: { type: 'array', description: 'What the team looked at for it and turned down, and why: never propose it again.', items: { type: 'string' } },
    invented: { type: 'array', description: 'Names agents in this project wrote for it that it does not have, each with the right one: never write the wrong one.', items: { type: 'object', required: ['kind', 'wrong', 'right'], properties: { kind: { enum: ['prop', 'value', 'event'] }, wrong: { type: 'string' }, right: { type: 'string' }, times: { type: 'integer' } } } },
    kept: { type: 'array', description: 'Differences between Figma and the code the team kept on purpose: follow the side it says is right.', items: { type: 'object', required: ['what', 'reason'], properties: { check: str, what: str, truth: { enum: ['figma', 'code'] }, reason: str, at: str } } },
    relationships: { type: 'object', properties: { composesWith: strs, neverCombineWith: strs } },
    usage: { type: 'object', properties: { element: str, props: { type: 'object' } } },
    slots: { type: 'array', items: { type: 'object', required: ['name'] } },
    livesIn: { type: 'object' },
    'x-design-system-engine': { type: 'object' },
  },
};

// Minimal structural validator covering the schema above (required keys, no unknown field, prop shape).
// Returns a list of human-readable error strings (empty = valid).
function validateContract(c) {
  const errs = [];
  for (const k of CONTRACT_SCHEMA.required) if (c[k] === undefined) errs.push(`missing "${k}"`);
  for (const k of Object.keys(c)) if (!(k in CONTRACT_SCHEMA.properties)) errs.push(`unknown field "${k}"`);
  if (c.schemaVersion !== undefined && c.schemaVersion !== CONTRACT_VERSION) errs.push(`"schemaVersion" must be ${CONTRACT_VERSION}`);
  if (c.id !== undefined && !/^[A-Za-z0-9_.:/-]+$/.test(String(c.id))) errs.push('"id" has characters an id cannot have');
  if (c.anatomy !== undefined && (typeof c.anatomy !== 'object' || c.anatomy.root === undefined)) errs.push('"anatomy.root" is required');
  if (c.props !== undefined) {
    if (!Array.isArray(c.props)) errs.push('"props" must be an array');
    else c.props.forEach((p, i) => {
      if (!p || typeof p !== 'object') { errs.push(`props[${i}] not an object`); return; }
      if (!p.name) errs.push(`props[${i}] missing "name"`);
      if (!p.bindings || typeof p.bindings !== 'object') { errs.push(`props[${i}] missing "bindings"`); return; }
      const f = p.bindings.figma;
      if (!f || f.kind === undefined || f.property === undefined) errs.push(`props[${i}].bindings.figma needs {kind, property}`);
      if (!('code' in p.bindings)) errs.push(`props[${i}].bindings missing "code"`);
    });
  }
  for (const k of ['codeOnly', 'events', 'codeSlots']) if (c[k] !== undefined && (!Array.isArray(c[k]) || c[k].some((x) => !x?.name))) errs.push(`"${k}" must be a list of entries with a name`);
  return errs;
}

// Lint the hand-edited contract.authored.json so a malformed binding is surfaced loudly
// instead of being silently ignored (which would resurface the false positive it was meant
// to fix). Non-failing — returns a list of human-readable issue strings. Only shape checks:
// bindings must be { attribute: string|true } and/or { slot: string|true }; unknown keys
// (typos like "atribute") are flagged with a hint.
function lintAuthored(doc) {
  const issues = [];
  const comps = doc?.components;
  if (!comps || typeof comps !== 'object') return issues;
  for (const [name, entry] of Object.entries(comps)) {
    if (!entry || typeof entry !== 'object') { issues.push(`${name}: entry must be an object`); continue; }
    // Optional agent-guidance fields (checked even when there are no bindings).
    if ('whenNotToUse' in entry && typeof entry.whenNotToUse !== 'string') issues.push(`${name}.whenNotToUse must be a string`);
    if ('useInstead' in entry) {
      const ok = typeof entry.useInstead === 'string' || (Array.isArray(entry.useInstead) && entry.useInstead.every((x) => typeof x === 'string'));
      if (!ok) issues.push(`${name}.useInstead must be a string or a list of strings`);
    }
    if ('neverCombineWith' in entry && !(Array.isArray(entry.neverCombineWith) && entry.neverCombineWith.every((x) => typeof x === 'string'))) issues.push(`${name}.neverCombineWith must be a list of strings`);
    issues.push(...lintStatusFields(name, entry));
    const b = entry.bindings;
    if (b === undefined) continue;
    if (typeof b !== 'object' || Array.isArray(b)) { issues.push(`${name}.bindings must be an object`); continue; }
    for (const [prop, bind] of Object.entries(b)) {
      if (!bind || typeof bind !== 'object' || Array.isArray(bind)) {
        issues.push(`${name}.bindings.${prop} must be like { attribute: "codeName" } or { slot: "slotName" }`); continue;
      }
      for (const k of Object.keys(bind)) {
        if (k === 'attribute' || k === 'slot') continue;
        const lk = k.toLowerCase();
        const hint = (lk.startsWith('at') || lk.includes('trib')) ? ' (did you mean "attribute"?)'
                   : lk.startsWith('sl') ? ' (did you mean "slot"?)'
                   : ' (expected "attribute" or "slot")';
        issues.push(`${name}.bindings.${prop}: unknown key "${k}"${hint}`);
      }
      if (!('attribute' in bind) && !('slot' in bind)) issues.push(`${name}.bindings.${prop}: needs "attribute" or "slot"`);
      if ('attribute' in bind && !(typeof bind.attribute === 'string' || bind.attribute === true)) issues.push(`${name}.bindings.${prop}.attribute must be a string or true`);
      if ('slot' in bind && !(typeof bind.slot === 'string' || bind.slot === true)) issues.push(`${name}.bindings.${prop}.slot must be a string or true`);
    }
  }
  return issues;
}

// ── Change detection + reference integrity (the auditor's "time axis") ─────────
// Flatten a DTCG dictionary to a Map of dot-path -> { deprecated }.
function flattenTokens(node, prefix = [], out = new Map()) {
  if (!node || typeof node !== 'object') return out;
  // $deprecated is true or (DTCG) a string explaining it; both mean deprecated.
  if (node.$value !== undefined) { out.set(prefix.join('.'), { deprecated: node.$deprecated === true || (typeof node.$deprecated === 'string' && node.$deprecated !== ''), type: node.$type }); return out; }
  for (const k of Object.keys(node)) { if (!k.startsWith('$')) flattenTokens(node[k], [...prefix, k], out); }
  return out;
}
// The DTCG $type each anatomy slot expects, so a token of the wrong type (a color used where a
// dimension belongs) is caught. Unlisted slots skip the type check (existence only).
const REF_KEY_TYPE = { radiusToken: 'dimension', gapToken: 'dimension', inlineToken: 'dimension', blockToken: 'dimension', typographyToken: 'typography' };
// Every {family.token} reference inside a contract's anatomy, with the slot key it sits under.
function collectRefSlots(contract, out = []) {
  const walk = (v, key) => {
    if (typeof v === 'string') { const m = v.match(/^\{(.+)\}$/); if (m) out.push({ ref: m[1], key }); }
    else if (Array.isArray(v)) v.forEach((x) => walk(x, key));
    else if (v && typeof v === 'object') for (const k of Object.keys(v)) walk(v[k], k);
  };
  walk(contract.anatomy, 'anatomy');
  return out;
}

// Which components reference each token (dot path → [component, …]): the style guide's To do names the one component a
// single-use token belongs to.
export function tokenUsers(built) {
  const out = new Map();
  for (const { name, contract } of built) {
    for (const ref of new Set(collectRefSlots(contract).map((r) => r.ref))) { if (!out.has(ref)) out.set(ref, []); out.get(ref).push(name); }
  }
  return out;
}

// Blast radius: how many components depend on each token / component, so a change to a shared
// contract reads as authorship rather than a quiet local tweak. Counts only - the
// engine SURFACES the reach, it never enforces authority. Pure and testable.
export function usageCounts(built) {
  const tokens = new Map();       // token dot-path -> Set(component that references it)
  const components = new Map();   // component -> Set(component that composes it)
  for (const { name, contract } of built) {
    for (const ref of new Set(collectRefSlots(contract).map((r) => r.ref))) {
      if (!tokens.has(ref)) tokens.set(ref, new Set());
      tokens.get(ref).add(name);
    }
    for (const child of (contract.relationships?.composesWith || [])) {
      if (!components.has(child)) components.set(child, new Set());
      components.get(child).add(name);
    }
  }
  const sizes = (m) => new Map([...m].map(([k, v]) => [k, v.size]));
  return { tokens: sizes(tokens), components: sizes(components) };
}

const semverMajor = (v) => { const n = parseInt(String(v ?? '0').split('.')[0], 10); return Number.isFinite(n) ? n : 0; };

// Classify the change between a component's previous emitted contract and the new one.
// breaking = a consumer relying on the old shape breaks (prop/option/state removed, default
// changed); additive = new prop/option/state. Advisory only — never fails the audit.
function diffContract(prev, next, name) {
  const out = [];
  if (!prev) return out;   // first emit — nothing to compare
  const pmap = new Map((prev.props || []).map((p) => [p.name, p]));
  const nmap = new Map((next.props || []).map((p) => [p.name, p]));
  for (const [pn, pp] of pmap) {
    const np = nmap.get(pn);
    if (!np) { out.push({ level: 'breaking', msg: `${name}: prop "${pn}" removed` }); continue; }
    if (JSON.stringify(pp.default) !== JSON.stringify(np.default))
      out.push({ level: 'breaking', msg: `${name}: prop "${pn}" default changed (${JSON.stringify(pp.default)} -> ${JSON.stringify(np.default)})` });
    const po = new Set(pp.options || []); const no = new Set(np.options || []);
    const removed = [...po].filter((o) => !no.has(o));
    const added   = [...no].filter((o) => !po.has(o));
    if (removed.length) out.push({ level: 'breaking', msg: `${name}: prop "${pn}" removed option(s) ${removed.join(', ')}` });
    if (added.length)   out.push({ level: 'additive', msg: `${name}: prop "${pn}" added option(s) ${added.join(', ')}` });
  }
  for (const pn of nmap.keys()) if (!pmap.has(pn)) out.push({ level: 'additive', msg: `${name}: prop "${pn}" added` });
  const ps = new Set((prev.states || []).map((s) => s.name).filter(Boolean));
  const ns = new Set((next.states || []).map((s) => s.name).filter(Boolean));
  for (const s of ps) if (!ns.has(s)) out.push({ level: 'breaking', msg: `${name}: state "${s}" removed` });
  for (const s of ns) if (!ps.has(s)) out.push({ level: 'additive', msg: `${name}: state "${s}" added` });
  // A component newly marked deprecated is a heads-up for everything that composes it.
  if (next.status?.state === 'deprecated' && prev.status?.state !== 'deprecated')
    out.push({ level: 'deprecation', msg: `component "${name}" deprecated${next.status.supersededBy ? ` (use ${next.status.supersededBy})` : ''}` });
  // Semver guard: a breaking change should carry a major-version bump.
  if (out.some((c) => c.level === 'breaking') && semverMajor(next.version) <= semverMajor(prev.version))
    out.push({ level: 'breaking', msg: `${name}: breaking change but version still ${next.version} — bump the major in contract.authored.json` });
  return out.map((c) => ({ ...c, component: name }));   // tag with the component for blast-radius
}
// Structural token diff (removals break consumers silently; additions are safe; a token newly
// flagged $deprecated is a heads-up). Value changes are NOT here — the parity gates already
// report value drift against Figma.
function diffTokens(prevFlat, nextFlat) {
  const out = [];
  for (const name of prevFlat.keys()) if (!nextFlat.has(name)) out.push({ level: 'breaking', msg: `token "${name}" removed`, ref: name });
  for (const [name, meta] of nextFlat) {
    if (!prevFlat.has(name)) out.push({ level: 'additive', msg: `token "${name}" added`, ref: name });
    else if (meta.deprecated && !prevFlat.get(name).deprecated) out.push({ level: 'deprecation', msg: `token "${name}" deprecated`, ref: name });
  }
  return out;
}

// A machine-readable index for AI agents (the llms.txt convention): components, where their
// contracts live, and the token dictionary. Generated, local (lives beside the contracts).
// An index an agent can read whole (2 to 4 MB llms files no agent can load). Past this size the catalog
// table stays in catalog.json and the index says to ask for one component with --query.
export const LLMS_MAX_BYTES = 64 * 1024;
// Each token's Figma description worth an agent's reading, the brand's first and the rest in the dictionary's order:
// never one that only names what it sets (font-weight) or says only that it is deprecated. → [{ path, description }]
export function tokenGuidance(tree) {
  const out = [];
  const walk = (node, path) => {
    for (const [k, v] of Object.entries(node ?? {})) {
      if (k.startsWith('$') || !v || typeof v !== 'object') continue;
      const p = [...path, k];
      if ('$value' in v) {
        const d = String(v.$description ?? '').replace(/@deprecated\b/gi, '').trim();
        if (d.length >= 8 && /\s/.test(d)) out.push({ path: p.join('/'), description: d });
      } else walk(v, p);
    }
  };
  walk(tree, []);
  const brand = (x) => /\bbrand/i.test(x.description);
  return [...out.filter(brand), ...out.filter((x) => !brand(x))];
}

export function buildLlms(built, tokens, tokenCount, catalog = null, { maxBytes = LLMS_MAX_BYTES, primitives = [], authority = [], intentLayer = null, pairs = [], from = 'Figma + code', decidedAgainst = [], partOf = {}, guidance = [] } = {}) {
  const families = Object.keys(tokens).filter((k) => !k.startsWith('$'));
  const lines = ['# Design system — machine-readable index', '',
    `> Generated by rms-design-system-engine from ${from}. ${built.length} components, ${tokenCount} W3C DTCG tokens. Each component links to its contract.`, '',
    // A mandate, not only a list: an index that says what exists but not that it must be used left agents
    // building their own; one sentence saying the system is installed moved most of them onto it.
    '**Use these components.** This design system is part of this project: build nothing by hand that a component below already covers, and write every component, prop, value and token name exactly as it is written here. Not sure of a name? Ask `rms-design-system-engine --query <name>` instead of guessing.', '',
    // The order of authority: which source decides when two disagree, with this system's own sources named.
    ...authority,
    '## Components', ''];
  for (const { name, contract } of built) {
    // A part is never placed on its own: it is listed under its root, not as a component to choose.
    if (partOf[name]) continue;
    const desc = String(contract.description || '').replace(/\s+/g, ' ').trim();
    // Its props: Figma's, else (a system read from its code alone) the code's own, as the catalog has them.
    const props = ((contract.props || []).length ? contract.props.map((p) => p.name) : Object.keys(catalog?.components?.[name]?.props ?? {})).join(', ');
    const tag = contract.status && contract.status.state !== 'current' ? `[${contract.status.state}] ` : '';
    lines.push(`- ${tag}[${name}](./${name}.contract.json):${desc ? ` ${desc}` : ''}${props ? `${desc ? '  ' : ' '}· props: ${props}` : ''}`);
    if (contract.status && contract.status.state !== 'current') lines.push(`    - status: ${statusLine(contract.status)}`);
    // Agent guidance + relationships, one sub-line each when present.
    const rel = contract.relationships || {};
    // From the intent layer: what it is for, when its description says nothing, and its first "when not to use".
    // The whole page is in the contract (intent); one line each keeps the index readable whole.
    const it = contract.intent;
    if (it?.purpose && !desc) lines.push(`    - for: ${short(it.purpose)}`);
    if (contract.whenNotToUse) lines.push(`    - avoid: ${String(contract.whenNotToUse).replace(/\s+/g, ' ').trim()}`);
    else if (it?.whenNotToUse?.length) lines.push(`    - avoid: ${short(it.whenNotToUse[0])}`);
    if (Array.isArray(contract.useInstead) && contract.useInstead.length) lines.push(`    - use instead: ${contract.useInstead.join(', ')}`);
    // What agents here wrote instead of its names: the next one reads the right name before it guesses.
    if (contract.invented?.length) lines.push(`    - agents here wrote (never write it): ${contract.invented.slice(0, 6).map((x) => `${x.kind} ${x.wrong} → ${x.right}`).join(', ')}`);
    if (Array.isArray(rel.composesWith) && rel.composesWith.length) lines.push(`    - composes: ${rel.composesWith.join(', ')}`);
    const parts = Object.keys(partOf).filter((p) => partOf[p].root === name).sort();
    if (parts.length) lines.push(`    - parts (placed only inside it, never on their own): ${parts.join(', ')}`, ...parts.flatMap((p) => (partOf[p].docs ?? []).slice(0, 2).map((d) => `        - ${p}: ${short(d)}`)));
    if (Array.isArray(rel.neverCombineWith) && rel.neverCombineWith.length) lines.push(`    - never with: ${rel.neverCombineWith.join(', ')}`);
  }
  // The intent layer's other pages (patterns, templates, pages, flows, foundations): each one's name and what it is for.
  if (intentLayer?.pages?.length) {
    lines.push('', '## Patterns, templates and pages', '', `From the team's intent layer (${intentLayer.source}). Compose screens the way these say.`);
    for (const pg of intentLayer.pages) lines.push(`- ${pg.name} (${pg.kind})${pg.purpose ? `: ${short(pg.purpose)}` : ''}`);
  }
  // The team's own guidance in its design file: the notes on its foundations, brand and pattern pages, outside any
  // component (annotation-categories.mjs fileGuidance), by page, so an agent reads the brand's rules where they are.
  if (guidance.length) {
    lines.push('', '## The design file\'s own guidance', '', 'Notes the team wrote in Figma outside any component (its foundations, brand and pattern pages). Follow them:');
    const byPage = new Map();
    for (const g of guidance) byPage.set(g.page, [...(byPage.get(g.page) ?? []), g]);
    for (const [page, list] of byPage) { lines.push(`- ${page}:`); for (const g of list.slice(0, 12)) lines.push(`    - ${g.node}${g.kind ? ` (${g.kind})` : ''}: ${short(g.text)}`); if (list.length > 12) lines.push(`    - … and ${list.length - 12} more on that page`); }
  }
  // The owner's primitives table: composition is written with these, never with a styled plain element.
  if (primitives.length) lines.push('', '## Primitives', '', 'Write the component, never a plain element (div, span, p) styled like it:', ...primitives);
  lines.push('', '## Tokens', '', `- [tokens.json](./tokens.json) — W3C DTCG dictionary (${tokenCount} tokens; families: ${families.join(', ')}).`, '');
  // The colour pairs, so a text or icon colour is never put on a surface it was not made for. Written here because
  // this is the file an agent reads whole: a pair looked up one token at a time is a pair nobody looks up.
  if (pairs.length) lines.push(...pairLines(pairs).map((l, i) => (i ? l : `**${l}**`)), '');
  // What each token is for, in the team's own words (its Figma description), the brand's first: guidance an agent
  // otherwise only gets one token at a time, and so picks a colour by its name alone.
  const said = tokenGuidance(tokens);
  if (said.length) {
    // Tokens that say the same are one line: the words once, the tokens after them.
    const by = new Map();
    for (const x of said) by.set(x.description, [...(by.get(x.description) ?? []), x.path]);
    lines.push(`**What the tokens are for, in the team's words (their Figma descriptions, ${said.length} tokens):**`,
      ...[...by].map(([d, ps]) => `  ${short(d)}: ${ps.slice(0, 6).join(', ')}${ps.length > 6 ? ` and ${ps.length - 6} more` : ''}`), '');
  }
  // What the team already ruled out, and why (decisions.mjs): an agent that does not know an option was looked at and
  // turned down proposes it again. Before the catalog, so a long catalog never pushes it out.
  if (decidedAgainst.length) lines.push('## Decided against', '', 'The team looked at these and turned them down. Do not propose them again:', ...decidedAgainst, '');
  if (catalog && Object.keys(catalog.components).length) {
    lines.push('## Catalog (for UI generators)', '',
      '- [catalog.json](./catalog.json) — every component with its props, allowed values and allowed children. Check generated UI with `rms-design-system-engine --check-ui <file>`.', '',
      ...catalog.rules.map((r, i) => `${i + 1}. ${r}`), '');
    const withTable = [...lines, catalogTable(catalog), ''].join('\n');
    if (Buffer.byteLength(withTable) <= maxBytes) return withTable;
    lines.push(`The full table (${Object.keys(catalog.components).length} components) is too long to read at once: ask for one component with \`rms-design-system-engine --query <name>\`, or read catalog.json.`, '');
  }
  return lines.join('\n');
}

// Where a contract is written, relative to the contracts folder: by its name (layout "name": name.contract.json, a slash
// in the name a folder), or by its code file (layout "code"), each part of the path in kebab-case, a prefix of it swapped
// as contracts.paths says ({ "src/components/": "components/" }: src/components/cards/MediaTile.vue →
// components/cards/media-tile.contract.json). Laid out by the code, a component with no code file, or one outside every
// prefix contracts.paths names, has no place (null).
export function contractFileFor(name, codeFile, { layout = 'name', paths = null } = {}) {
  if (layout !== 'code') return name + '.contract.json';
  if (!codeFile) return null;
  const rel = String(codeFile).replace(/\\/g, '/');
  const entry = Object.entries(paths ?? {}).sort((x, y) => y[0].length - x[0].length).find(([from]) => rel.startsWith(from));
  if (paths && !entry) return null;
  const rest = entry ? entry[1] + rel.slice(entry[0].length) : rel;
  const kebab = (seg) => seg.replace(/([a-z0-9])([A-Z])/g, '$1-$2').replace(/([A-Z]+)([A-Z][a-z])/g, '$1-$2').toLowerCase();
  return rest.replace(/\.[^./]+$/, '').split('/').filter(Boolean).map(kebab).join('/') + '.contract.json';
}

// Every *.contract.json under a published folder (absolute paths).
function contractFilesIn(dir) {
  const out = [];
  const walk = (d) => { let es = []; try { es = readdirSync(d, { withFileTypes: true }); } catch { return; } for (const e of es) { const p = join(d, e.name); if (e.isDirectory()) walk(p); else if (e.name.endsWith('.contract.json')) out.push(p); } };
  walk(dir);
  return out.sort();
}

// The README of a published folder: what a contract holds, where each part comes from, how complete they are, and the
// components not written. The same inputs give the same text (no date), so an unchanged system gives no diff.
export function publishedReadme(built, skipped = [], { schema = 'contract.schema.json', figmaFile = null, undefinedRefs = [] } = {}) {
  const cs = built.map((b) => b.contract);
  const n = (f) => cs.filter(f).length;
  const figmaProps = cs.flatMap((c) => (c.props ?? []).filter((p) => p.bindings?.figma));
  const paired = figmaProps.filter((p) => p.bindings?.code || p.conditions?.length).length;
  const differ = figmaProps.filter((p) => p.differences?.length).length;
  const lines = [
    '# Component contracts', '',
    'One contract per component, generated by rms-design-system-engine from the Figma library and the code. **Do not edit these files by hand**: change the code, the Figma library or the project\'s authored decisions (contract.authored.json), then regenerate and open a merge request:', '',
    '```bash', 'rms-design-system-engine --contracts-out <this folder>', '```', '',
    `Each file is valid against [${schema}](${schema}) (JSON Schema 2020-12).`, '',
    '## What a contract holds', '',
    '| Field | What it says | From |', '|---|---|---|',
    '| `id`, `name`, `description`, `source` | Which component, the Figma node and code file it was read from, and the last commit that changed that file | Figma, code |',
    '| `props[]` | Each Figma property with the code prop or slot it is (`bindings.code`), who decided the pairing (`source`), the attributes it only decides (`conditions`), and where Figma and the code differ (`differences`) | Figma, code, Code Connect, authored |',
    '| `codeOnly[]` | Code props Figma has no property for | code |',
    '| `events[]`, `codeSlots[]` | What the component emits (with its payload), and the slots it takes content in (with what each hands its content) | code |',
    '| `slots[]` | Each Figma instance swap: a place another component goes, and which ones it accepts | Figma |',
    '| `states[]`, `variants` | Its states (Figma\'s state axis and the code\'s pseudo-classes) and other variants | Figma, code |',
    '| `anatomy`, `tokens` | Its root and inner frames (padding, gap, radius, height, text style; `borderInset` where Figma\'s padding is the room for a border) and the tokens each state uses | Figma |',
    '| `accessibility` | Its element, role, ARIA and keyboard, each value with where it was read | Figma annotations, code, authored |',
    '| `intentPage` | The component\'s page in the intent layer (what it is for, when to use it) | intent layer |',
    '| `kept[]` | Differences between Figma and the code the team kept on purpose: what differs, which side is right (`truth`) and why. Follow that side; never change it back | the team\'s decisions |', '',
    '## Coverage', '',
    '| | |', '|---|---|',
    `| Contracts | ${cs.length} |`,
    `| With a Figma component | ${n((c) => c.source?.figma)} |`,
    `| With a code file | ${n((c) => c.source?.code?.file)} |`,
    `| Figma properties paired with the code | ${paired} of ${figmaProps.length} |`,
    `| Figma properties where Figma and the code differ | ${differ} |`,
    `| With states | ${n((c) => c.states?.length)} |`,
    `| With events | ${n((c) => c.events?.length)} |`,
    `| With accessibility | ${n((c) => c.accessibility && Object.keys(c.accessibility).length)} |`,
    `| With an intent layer page | ${n((c) => c.intentPage)} |`,
    `| With differences kept on purpose | ${n((c) => c.kept?.length)} |`,
    ...(figmaFile ? ['', `Figma file: \`${figmaFile}\`.`] : []),
  ];
  // A token Figma binds that the captured variables do not have (a variable of another library, a renamed one): kept as
  // Figma binds it, listed here so it is fixed in Figma.
  if (undefinedRefs.length) {
    lines.push('', '## Tokens Figma binds that the variables do not have', '', 'Fix these in Figma (bind a variable of the system), then publish again:', '');
    for (const u of [...new Set(undefinedRefs)].sort()) lines.push(`- ${u.replace(/: references undefined token /, ': ')}`);
  }
  if (skipped.length) {
    lines.push('', '## Not written', '', 'Figma components with no contract file of their own:', '', '| Component | Why |', '|---|---|');
    const cell = (t) => (String(t).trim() ? String(t).trim().replace(/\|/g, '\\|') : '(a component with no name)');
    for (const s of [...skipped].sort((a, b) => a.name.localeCompare(b.name))) lines.push(`| ${cell(s.name)} | ${cell(s.why)} |`);
  }
  return lines.join('\n') + '\n';
}

// ── Entry point ───────────────────────────────────────────────────────────────
export async function generateContracts(ROOT, cfg, opts = {}) {
  const paths = cfg.paths || {};
  // A project set up without a Figma file (figmaFileKey "") and no Figma data: the contracts are built from the code
  // alone, the components the code has, with no Figma tokens or props, so what is written about each component (its
  // notes, the authored contract, the intent layer) still reaches llms.txt, the catalog and the prototypes.
  const codeOnly = cfg.figmaFileKey === '' && !existsSync(resolve(ROOT, paths.snapshotVars || 'figma-vars.snapshot.json'));
  const vars = codeOnly ? {} : readJSON(resolve(ROOT, paths.snapshotVars || 'figma-vars.snapshot.json'));
  if (!vars) throw new Error(`vars snapshot not found (${paths.snapshotVars})`);
  const structure = withTextScaleKeys(readJSON(resolve(ROOT, paths.snapshotStructure || 'figma-structure.snapshot.json'))?.components || {});
  const props = readJSON(resolve(ROOT, paths.compPropsSnapshot || 'figma-component-props.snapshot.json')) || {};
  // Optional composition snapshot ({ "<Component>": ["Child", ...] }) drives relationships.composesWith.
  // Absent → relationships are simply omitted (additive, never an error).
  const composition = readJSON(resolve(ROOT, paths.compositionSnapshot || 'component-composition.snapshot.json')) || {};
  // The differences the team kept on purpose (kept.mjs): each contract carries its own, so an agent follows the side the
  // team chose instead of "fixing" it to the other.
  const keptAll = (await import('./kept.mjs')).readKept(ROOT);

  let CONTRACT = {};
  const contractPath = resolve(ROOT, cfg.paths?.structureContract || 'structure-contract.mjs');
  if (existsSync(contractPath)) {
    try { CONTRACT = (await import(pathToFileURL(contractPath).href)).CONTRACT || {}; } catch { /* keep going */ }
  }

  // Output: ONE local directory holding the standard triple — per-component contracts, the
  // DTCG token dictionary, and the schema (the standard per-component shape, without extra folders). Kept
  // local by default (a single .gitignore below) since it carries the DS's real values.
  // Override any path via cfg.contracts.{out,tokensOut,schemaOut}.
  const cc = cfg.contracts || {};
  // Published for a shared repository (--contracts-out): only the contracts, the schema and a README go there.
  const publishTo = opts.publishTo ? resolve(ROOT, opts.publishTo) : null;
  const outDir    = publishTo ?? (cc.out ? resolve(ROOT, cc.out) : join(ROOT, 'contracts'));
  const tokensOut = cc.tokensOut && !publishTo ? resolve(ROOT, cc.tokensOut) : join(outDir, 'tokens.json');
  const schemaOut = cc.schemaOut && !publishTo ? resolve(ROOT, cc.schemaOut) : join(outDir, 'contract.schema.json');
  // The AUTHORED layer is a SINGLE committed file at the project root (decisions only, no captured
  // values), so it is safe to share and applies in CI — unlike the local, gitignored generated views.
  const authoredPath = cc.authored ? resolve(ROOT, cc.authored) : join(ROOT, 'contract.authored.json');

  // Which components to emit. Default: EVERY component the scan found — the union of the
  // structure snapshot, the hand-authored contract, and the props snapshot. Nothing is
  // hardcoded to a project or a component. Narrow to specific names with cfg.contracts.only:
  // [names] (or the legacy cfg.contracts.pilot) when you deliberately want a subset.
  // The code's API of each component (structure-capture.mjs apiEntry: props, events, slots, Code Connect), read now so
  // every contract carries its code half, and the components only the code has get a contract of their own.
  const publish = publishTo ? true : cc.publish ?? opts.publish ?? false;
  const layout = cc.layout ?? opts.layout ?? (publishTo ? 'code' : 'name');
  const nodeIds = Object.fromEntries(Object.entries(props).filter(([, e]) => e?.nodeId).map(([n, e]) => [n, e.nodeId]));
  let apiReader = null, apiEntryOf = () => null;
  try {
    const sc = await import('./structure-capture.mjs');
    let classFor0 = null; try { classFor0 = (await loadLocator(ROOT, cfg)).classFor; } catch { /* by name */ }
    apiReader = sc.apiReaderFor(ROOT, cfg, { classFor: classFor0, nodeIds });
    const cache = new Map();
    apiEntryOf = (n) => { if (!apiReader) return null; if (!cache.has(n)) { let e = null; try { e = sc.apiEntry(ROOT, apiReader, n); } catch { /* unreadable */ } cache.set(n, e); } return cache.get(n); };
  } catch { /* no code reading: contracts from Figma alone */ }
  const figmaNames = [...new Set([...Object.keys(structure), ...Object.keys(CONTRACT), ...Object.keys(props).filter((k) => !k.startsWith('_'))])];
  const codeNames = (() => {
    if (!codeOnly && cc.codeOnlyComponents === false) return [];
    let found = []; try { found = codeComponents(ROOT, cfg); } catch { return []; }
    if (codeOnly) return found.map((k) => k.name);
    // Only the components whose file no Figma component is read from get a contract of their own, from the code alone,
    // named as the project declares it (componentFiles), else by its file when that name is not ambiguous (two
    // Primary.vue in two folders are named by nobody: declare them).
    const figmaFiles = new Set(figmaNames.map((n) => apiEntryOf(n)?.file).filter(Boolean));
    const taken = new Set(figmaNames.map((n) => n.toLowerCase()));
    const out = [], files = new Set();
    for (const [n, f] of Object.entries(cfg.componentFiles ?? {})) {
      const file = String(f).replace(/\\/g, '/');
      if (taken.has(n.toLowerCase()) || figmaFiles.has(file) || files.has(file) || !existsSync(resolve(ROOT, file))) continue;
      out.push(n); files.add(file);
    }
    const base = new Map(); for (const k of found) base.set(k.name.toLowerCase(), (base.get(k.name.toLowerCase()) ?? 0) + 1);
    for (const k of found) if (base.get(k.name.toLowerCase()) === 1 && !figmaFiles.has(k.file) && !files.has(k.file) && !taken.has(k.name.toLowerCase())) { out.push(k.name); files.add(k.file); }
    return out;
  })();
  const allNames = [...new Set([...figmaNames, ...codeNames])];
  let targets = cc.only ?? opts.only ?? cc.pilot ?? opts.pilot ?? 'all';
  if (targets === 'all' || (Array.isArray(targets) && targets.includes('*'))) targets = allNames;
  if (typeof targets === 'string') targets = [targets];
  targets = targets.filter((n) => structure[n] || CONTRACT[n] || props[n] || codeNames.includes(n));
  // A component Figma gives no name (only spaces) has none to write a contract by: it is listed apart, by its node, for
  // the design team to name, and never written as " .contract.json".
  const unnamed = targets.filter((n) => !String(n).trim()).map((n) => ({ name: '', why: `no name in Figma: name it there (node ${props[n]?.nodeId ?? structure[n]?.nodeId ?? 'unknown'})` }));
  targets = targets.filter((n) => String(n).trim());

  // What this run is built from: an older run never replaces contracts built from newer inputs.
  const builtFile = join(outDir, 'built.json');
  const stamp = buildStamp(ROOT, { vars });
  const may = publishTo ? { ok: true } : mayWrite(builtFile, stamp, { ROOT, force: opts.force ?? process.argv.includes('--force'), label: relative(ROOT, outDir) || outDir });
  if (!may.ok) return { kept: may.line, outDir, tokensOut, schemaOut, authoredPath, components: [], invalid: [], tokenCount: 0, authoredIssues: [], droppedTokens: [], breaking: [], undefinedRefs: [], typeMismatches: [], prune: null, statusIssues: [], statusCounts: {} };

  // Load the committed AUTHORED layer. Scaffold it once if missing (empty bindings per component);
  // never rewrite it afterwards, so it stays user-owned with clean git diffs.
  let authoredDoc = readJSON(authoredPath);
  if (!authoredDoc) {
    authoredDoc = {
      _note: 'Hand-authored contract layer (rms-design-system-engine) — COMMIT this file. It holds decisions only (Figma->code bindings, semantics, notes), never captured DS values, so it is safe to share and applies in CI. The generated contracts/ + tokens.json are local, gitignored views built from this + the Figma snapshots. Resolve a prop rename or slot by adding, under a component: "bindings": { "<figmaProp>": { "attribute": "codeName" } }  or  { "slot": "slotName" }. Optional agent guidance per component: "whenNotToUse" (string), "useInstead" (string or list), "neverCombineWith" (list of component names). Optional decision status: "status" (current | deprecated | experimental), "supersededBy" (the component that won), "since", "rationale" (the why). Optional, at the top: "construction": { "<rule id>": true | false }, the answer of the team to a question of the construction grammar (contracts/construction.json).',
      components: Object.fromEntries(allNames.map((n) => [n, { bindings: {} }])),
    };
    if (!publishTo) try { writeFileSync(authoredPath, JSON.stringify(authoredDoc, null, 2) + '\n'); } catch { /* best-effort */ }
  }
  const authoredIssues = lintAuthored(authoredDoc);   // malformed bindings → surfaced, never silently ignored

  // Keep the generated DS data LOCAL by default — the token file and contracts carry
  // real, project-specific token values (proprietary). Drop a .gitignore in each output
  // dir so they are never pushed by accident. Opt out with cfg.contracts.gitignore=false.
  if (cc.gitignore !== false && !publishTo) {
    for (const d of new Set([outDir, dirname(tokensOut)])) {
      ensureDir(d);
      try { writeFileSync(join(d, '.gitignore'), '# rms-design-system-engine generated DS data — kept local, do not commit.\n*\n'); } catch { /* best-effort */ }
    }
  }

  // 1) DTCG token dictionary (diff the structural shape vs the previous emit).
  const prevTokens = publishTo ? null : readJSON(tokensOut);
  const { tokens, dropped: droppedTokens, pairs: tokenPairList } = buildTokens(vars, cfg.figma?.modes);
  if (!publishTo) { ensureDir(dirname(tokensOut)); writeFileSync(tokensOut, JSON.stringify(tokens, null, 2) + '\n'); }
  const tokenChanges = prevTokens ? diffTokens(flattenTokens(prevTokens), flattenTokens(tokens)) : [];   // first run has no baseline
  const tokenMap = flattenTokens(tokens);   // name -> { deprecated, type }

  // 2) Schema.
  ensureDir(dirname(schemaOut));
  writeFileSync(schemaOut, JSON.stringify(CONTRACT_SCHEMA, null, 2) + '\n');

  // Where each component lives: the products' files that use it, what it sits inside and holds, the Figma screens
  // that draw it. Read from the same files the catalog's real examples come from, and written into each contract.
  let code = null, selectorFor = null, classFor = null, files = [], lives = {};
  try { code = await (await import('./code-capture.mjs')).readFreshSnapshot(ROOT, cfg); } catch { /* optional */ }
  try { const loc = await loadLocator(ROOT, cfg); selectorFor = loc.selectorFor; classFor = loc.classFor; } catch { /* optional */ }
  // From the code alone: each component's class and props as its own file declares them, where no capture says them.
  if (codeOnly) {
    try {
      const { textComponentApi } = await import('./component-source.mjs');
      const own = Object.fromEntries(codeComponents(ROOT, cfg).map((k) => [k.name, k]));
      code = { ...(code ?? {}), api: { ...(code?.api ?? {}) } };
      for (const [n, k] of Object.entries(own)) if (!code.api[n]) { try { code.api[n] = { file: k.file, ...textComponentApi(k.file, readFileSync(resolve(ROOT, k.file), 'utf8')) }; } catch { /* unreadable */ } }
      const sel0 = selectorFor, cls0 = classFor;
      selectorFor = (n) => (own[n] ? '.' + own[n].cls : sel0 ? sel0(n) : null);
      classFor = (n) => (own[n] ? '.' + own[n].cls : cls0 ? cls0(n) : null);
    } catch { /* optional */ }
  }
  // Each component's code API read from its own file where no fresh capture holds it (the capture is older than the
  // code, or was never made): the props an agent may pass are the code's, so they are never left to a guess.
  if (cfg.frameworkComponents !== false) {
    try {
      const { apiReaderFor, apiEntry } = await import('./structure-capture.mjs');
      const reader = apiReaderFor(ROOT, cfg, { classFor: classFor ?? undefined });
      code = { ...(code ?? {}), api: { ...(code?.api ?? {}) } };
      for (const n of targets.filter((x) => structure[x] || props[x])) if (!code.api[n]?.file) { try { const a = apiEntry(ROOT, reader, n); if (a.file) code.api[n] = a; } catch { /* unreadable */ } }
    } catch { /* optional */ }
  }
  try {
    const { productFiles, usageMap } = await import('./usage-map.mjs');
    files = productFiles(ROOT, cfg);
    const screens = readJSON(resolve(ROOT, paths.snapshotScreenComponents || 'figma-screen-components.snapshot.json')) || {};
    lives = usageMap(targets, { files, classFor, composition, codeNesting: code?.nesting ?? {}, screens });
  } catch { /* best-effort */ }

  // 3) Per-component contracts + validate + change/reference detection.
  ensureDir(outDir);
  const emitted = [];
  const invalid = [];
  const built = [];
  const breaking = [...tokenChanges];
  const undefinedRefs = [];
  const typeMismatches = [];
  const componentNames = new Set(allNames);   // real DS components, to filter composesWith
  // The intent layer's page for each component, when ds-config.json names one (intent-layer.mjs).
  const IL = readIntentLayer(ROOT, cfg);
  const intentPages = IL ? matchComponents(targets, IL.entities, codeFilesOf(ROOT, cfg)) : new Map();
  // What the system contradicts on each page (intent-truth.mjs): those lines are not written into a contract.
  const wrongOf = checkedLayer(ROOT, cfg, IL);
  const stateBindings = readJSON(resolve(ROOT, paths.stateBindings || 'component-state-bindings.json')) || {};
  const stateTokensFile = readJSON(resolve(ROOT, paths.stateTokens || 'component-state-tokens.json'))?._components || {};
  // Laid out by the code, one contract per code file: when several Figma components are drawn of one file (two states
  // drawn as two components), the contract is the one with Figma properties (else the first), and names the others.
  const placeOf = new Map(targets.map((n) => [n, contractFileFor(n, apiEntryOf(n)?.file ?? null, { layout, paths: cc.paths ?? null })]));
  const sharing = new Map();
  for (const n of targets) { const f = placeOf.get(n); if (f) sharing.set(f, [...(sharing.get(f) ?? []), n]); }
  const lead = new Map([...sharing].map(([f, ns]) => [f, ns.find((n) => Object.keys(props[n]?.properties ?? {}).length) ?? ns[0]]));
  const skipped = [...unnamed];
  // Every decision the team made, wherever it was made (decisions.mjs): what each component was decided against.
  let decided = null, ruledOutLines = () => [];
  // The parts the last style guide build found (component-parts.mjs), when it ran.
  const partsFound = (await import('./component-parts.mjs')).readParts(ROOT, (await import('./names.mjs')).OUT_DIR, { readFileSync, join });
  try { const dm = await import('./decisions.mjs'); decided = dm.gatherDecisions(ROOT); ruledOutLines = dm.ruledOutLines; } catch { /* none */ }
  // Published, each contract names the last commit that changed its file: a mirror's history is fetched once for all.
  if (publish && mirrorState(ROOT)) { try { ensureHistory(ROOT, { paths: [...new Set(targets.map((n) => apiEntryOf(n)?.file).filter(Boolean))].map((path) => ({ path })) }); } catch { /* the commits stay unknown */ } }
  let invented = null;   // readInvented, once, with the first component
  for (const name of targets) {
    const api = apiEntryOf(name);
    const relFile = placeOf.get(name);
    // Laid out by the code, a component with no code file has no place: it is listed, never written somewhere invented.
    if (!relFile) { skipped.push({ name, why: 'no code file' }); continue; }
    if (lead.get(relFile) !== name) { skipped.push({ name, why: `drawn of the same code file as ${lead.get(relFile)}` }); continue; }
    const file = join(outDir, relFile);
    const prev = readJSON(file);                                              // previous emit (for the diff)
    let text = ''; try { if (api?.file) text = readFileSync(resolve(ROOT, api.file), 'utf8'); } catch { /* unreadable */ }
    const codePart = apiReader ? { api, text, aliases: cfg.componentPropAliases?.[name] ?? null, stateBindings: stateBindings[name] ?? null, componentTokens: stateTokensFile[name]?.tokens ?? null, publish, idPrefix: cc.idPrefix, schemaRef: relative(dirname(file), schemaOut).split(/[\\/]+/).join('/').replace(/^(?!\.)/, './'), figmaFile: cfg.figmaFileKey || undefined, commit: publish ? lastCommitOf(ROOT, api?.file) : null } : null;
    const contract = buildContract(name, { contract: CONTRACT, structure, props, authored: authoredDoc.components?.[name], composition, componentNames, vars, intentPage: intentPages.has(name) ? componentIntent(intentPages.get(name), IL._source, wrongOf(intentPages.get(name))) : null, code: codePart });
    // What agents here wrote for it instead of its own names, each with the right one (invented.mjs).
    const wrote = inventedFor(invented ??= readInvented(ROOT), name);
    if (wrote.length) contract.invented = wrote;
    const keptHere = keptAll.filter((d) => d.component === name);
    if (keptHere.length) contract.kept = keptHere.map((d) => ({ check: d.check, what: d.what, ...(d.truth ? { truth: d.truth } : {}), reason: d.reason, ...(d.at ? { at: String(d.at).slice(0, 10) } : {}) }));
    // From the code alone, no description is a placeholder saying it came from Figma.
    if ((codeOnly || !(props[name] || structure[name])) && /— captured from Figma by rms-design-system-engine\.$/.test(contract.description)) contract.description = '';
    if (lives[name] && !publish) contract.livesIn = lives[name];
    // What the team decided against for it, and why (decisions.mjs). Local only: published into the intent layer, the
    // layer already holds these words.
    if (!publish && decided) { const against = ruledOutLines(decided, name); if (against.length) contract.decidedAgainst = against; }
    // A part: placed only inside its root; a root: its parts, each with what its page says of it (component-parts.mjs).
    if (partsFound?.partOf?.[name]) contract.partOf = partsFound.partOf[name].root;
    const myParts = Object.entries(partsFound?.partOf ?? {}).filter(([, p]) => p.root === name);
    if (myParts.length) contract.parts = myParts.map(([p, x]) => ({ name: p, docs: x.docs ?? [] }));
    const also = (sharing.get(relFile) ?? []).filter((n) => n !== name);
    if (also.length && contract.source) contract.source.figma = { ...(contract.source.figma ?? {}), alsoDrawnAs: also.map((n) => ({ name: n, nodeId: props[n]?.nodeId ?? structure[n]?.nodeId ?? null })) };
    const errs = validateContract(contract);
    mkdirSync(dirname(file), { recursive: true });   // a component named with a slash (table/row) gets its folder
    writeFileSync(file, JSON.stringify(contract, null, 2) + '\n');
    emitted.push(name);
    built.push({ name, contract });
    if (errs.length) invalid.push({ name, errs });
    breaking.push(...diffContract(prev, contract, name));
    for (const { ref, key } of collectRefSlots(contract)) {
      const t = tokenMap.get(ref);
      if (!t) { undefinedRefs.push(`${name}: references undefined token {${ref}}`); continue; }
      const expected = REF_KEY_TYPE[key];
      if (expected && t.type && t.type !== expected) typeMismatches.push(`${name}: {${ref}} is a ${t.type} but a ${expected} is expected (${key})`);
    }
  }

  // Blast radius: attach how many components depend on each changed token/component.
  const usage = usageCounts(built);
  for (const c of breaking) {
    const n = c.ref != null ? usage.tokens.get(c.ref) : (c.component != null ? usage.components.get(c.component) : undefined);
    if (n) c.consumers = n;
  }

  // Published: the contracts the code no longer has are removed, a README says what is there, and nothing local is written.
  if (publishTo) {
    const written = new Set(emitted.map((n) => resolve(outDir, placeOf.get(n))));
    const removed = contractFilesIn(outDir).filter((f) => !written.has(f));
    for (const f of removed) { try { unlinkSync(f); } catch { /* already gone */ } }
    // The folders those leave empty go too (never the published folder itself).
    for (const f of removed) for (let d = dirname(f); d.startsWith(outDir + sep) && d !== outDir; d = dirname(d)) { try { if (readdirSync(d).length) break; rmdirSync(d); } catch { break; } }
    writeFileSync(join(outDir, 'README.md'), publishedReadme(built, skipped, { schema: relative(outDir, schemaOut), figmaFile: cfg.figmaFileKey || null, undefinedRefs }));
    return { outDir, schemaOut, components: emitted, skipped, removed: removed.map((f) => relative(outDir, f)), invalid, breaking, undefinedRefs, typeMismatches, authoredIssues, droppedTokens, tokenCount: 0 };
  }

  // A contract an older run wrote for a component with no name (" .contract.json") is taken out: it names nothing.
  for (const f of contractFilesIn(outDir)) if (!f.slice(f.lastIndexOf(sep) + 1).replace(/\.contract\.json$/, '').trim()) { try { unlinkSync(f); } catch { /* already gone */ } }

  // 4) AI index (llms.txt) — a machine-readable summary for agents, local beside the contracts.
  // The component catalog for UI generators (ui-catalog.mjs): from the contracts, plus the code
  // snapshot's prop names and nesting when it still matches the code.
  let catalog = null;
  try {
    // A real use of each component from the code: the products' code first, then the system's own pages.
    const examples = {};
    try {
      const { realExample } = await import('./ui-catalog.mjs');
      for (const { name } of built) {
        const ex = realExample(name, classFor ? classFor(name) : null, files);
        if (ex) examples[name] = ex;
      }
    } catch { /* optional */ }
    // The names agents invented here, so the catalog rejects them by name rather than only by meaning.
    catalog = buildCatalog(built, { code, selectorFor, examples, invented: readInvented(ROOT) });
    for (const [name, e] of Object.entries(catalog.components ?? {})) if (lives[name]) e.livesIn = lives[name];
    writeFileSync(join(outDir, 'catalog.json'), JSON.stringify(catalog, null, 2) + '\n');
  } catch { /* best-effort */ }
  const llmsOut = cc.llmsOut ? resolve(ROOT, cc.llmsOut) : join(outDir, 'llms.txt');
  let guidance = []; try { const ac = await import('./annotation-categories.mjs'); guidance = ac.fileGuidance(ac.loadCategories(ROOT, cfg), cfg); } catch { /* no categories captured */ }
  try { writeFileSync(llmsOut, buildLlms(built, tokens, countLeaves(tokens), catalog, { guidance, primitives: primitiveGuideLines(cfg), authority: authorityLines(cfg, ROOT), intentLayer: IL ? { source: IL._source?.url ?? 'intent layer', pages: layerPages(IL) } : null, pairs: tokenPairList, from: codeOnly ? 'the code alone (no Figma file)' : 'Figma + code', partOf: partsFound?.partOf ?? {}, decidedAgainst: decided ? decided.all.filter((d) => d.ruledOut.length && d.kind !== 'debt' && d.kind !== 'checked').map((d) => `- ${d.page ?? d.component ?? 'The system'}: ${d.ruledOut.join(', ')}${d.why ? `, because ${d.why.replace(/^\w/, (c) => c.toLowerCase()).replace(/\.$/, '')}` : ''}.`) : [] }) + '\n'); } catch { /* best-effort */ }

  // The same contracts in DSDS 0.23 (contract-dsds.mjs), for a team that documents its system in that format: an index
  // and a file a component, under dsds/, each linking its contract. Rewritten whole each build, so none outlives its
  // component.
  let dsdsOut = null;
  try {
    const { dsdsDocuments } = await import('./contract-dsds.mjs');
    const dir = join(outDir, 'dsds');
    const docs = dsdsDocuments(built.map((b) => ({ ...b, file: placeOf.get(b.name) })), { system: cfg.name || 'Design system', framework: cfg.framework || null });
    try { rmSync(join(dir, 'components'), { recursive: true, force: true }); } catch { /* none yet */ }
    for (const { rel, doc } of docs) { ensureDir(dirname(join(dir, rel))); writeFileSync(join(dir, rel), JSON.stringify(doc, null, 2) + '\n'); }
    dsdsOut = dir;
  } catch { /* best-effort */ }

  // How the system builds a component in Figma (construction-grammar.mjs): each rule most of its components follow,
  // with who does not, and the questions the team answers in the authored contract (construction). Rewritten each build.
  let constructionOut = null;
  try {
    const { grammarOf } = await import('./construction-grammar.mjs');
    const values = readJSON(join(ROOT, 'component-values.snapshot.json')) || {};
    const varNames = readJSON(resolve(ROOT, paths.snapshotVars || 'figma-vars.snapshot.json'))?.variableScopes ?? {};
    const skeleton = readJSON(resolve(ROOT, (await import('./figma-capture.mjs')).componentFiles(cfg).skeleton)) || {};
    const g = grammarOf({ props, structure, values, varNames, skeleton }, { answers: authoredDoc.construction ?? {} });
    if (g.figma.rules.length || g.figma.unsettled.length) {
      constructionOut = join(outDir, 'construction.json');
      writeFileSync(constructionOut, JSON.stringify({ _built: stamp, _note: 'How this system builds a component in Figma, mined from its own components (rms-design-system-engine). Each line is a rule (every component follows it), to fix (most do, or the team decided it) or to decide (rms-design-system-engine --construction <rule id> yes|no).', ...g }, null, 2) + '\n');
    }
  } catch { /* best-effort */ }

  // Figma prop types: the component properties as TypeScript, for a compile-time prop check.
  let propTypesOut = null;
  try {
    const { propTypesDts } = await import('./figma-props.mjs');
    const dts = propTypesDts(props, { cfg, authored: authoredDoc.components ?? {} });
    if (/export interface/.test(dts)) {
      propTypesOut = cc.propTypesOut ? resolve(ROOT, cc.propTypesOut) : join(outDir, 'figma-props.d.ts');
      ensureDir(dirname(propTypesOut));
      writeFileSync(propTypesOut, dts);
    }
  } catch { /* best-effort */ }

  // Prune candidates: a lean-library advisory over what we just built. Surfaced, never enforced.
  const prune = pruneCandidates({ built, usage, tokensDict: tokens, vars });

  // Decision status cross-checks: guidance that still points at a deprecated component, a
  // replacement that does not exist or is itself deprecated, a deprecation with no what/why.
  const statusIssues = statusFindings(built);
  const statusCounts = built.reduce((acc, b) => { const st = b.contract.status?.state; if (st) acc[st] = (acc[st] || 0) + 1; return acc; }, {});

  try { ensureDir(outDir); writeFileSync(builtFile, JSON.stringify({ _built: stamp }, null, 2) + '\n'); } catch { /* best-effort */ }
  return { stamp, tokensOut, schemaOut, outDir, authoredPath, llmsOut, dsdsOut, constructionOut, propTypesOut, catalogOut: catalog ? join(outDir, 'catalog.json') : null, tokenCount: countLeaves(tokens), components: emitted, skipped, invalid, authoredIssues, breaking, undefinedRefs, typeMismatches, droppedTokens, prune, statusIssues, statusCounts };
}
