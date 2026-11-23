// contract-dsds.mjs - the whole system as the engine knows it, viewed in DSDS (designsystemdocspec.org), for a team that
// already documents its system in that format and wants the engine's facts in the same shape.
//
//   dsdsEntry(contract, { file, framework, ... })  → one DSDS component entry, from one contract
//   dsdsDocuments(built, { system, framework, version, tokens, modes, pages, construction, ... })
//                                                   → [{ rel, doc }]: an index (system.dsds.json) and the files it refers to
//   dsdsVersionFor(declared)                        → { version, said }: the version the view is written in, and why
//
// DSDS keeps one origin per fact: a component's API belongs to its own format, token values to DTCG, the guidance to
// the team's pages. So the view says what the engine knows and links the rest: the contract as the entry's spec, the
// code file as its source, Figma's node as a ref, and the intent layer's page as one (never its words copied back).
// What it does hold is what the engine computes from Figma and the code and nothing in DSDS says elsewhere:
//   - components: the variant and state traits, what each nests and the tokens it paints with (uses), what to use
//     instead (alternatives), what never goes with it (combos), its status, overall and on each platform, and the
//     guidance written in the contract itself (whenNotToUse, the differences kept on purpose);
//   - tokens and themes, in tokens.dsds.json: one entry a token, pointing at its place in the DTCG file the engine
//     writes (its value is never copied), the surfaces a text colour reads on as a combo, and one theme a mode;
//   - the intent layer's patterns, flows and foundations, one entry each, linking the team's page and naming the
//     components it uses;
//   - shared rules: how the system builds a component in Figma and in the code (construction.json), each rule written
//     once, at the level the engine holds it to.
// Each entry carries a uuid that survives a rename: made from what stays when a name changes (the Figma node, the code
// file, the page's file), and kept from the view already written when one of those still matches.
//
// Every document is checked against DSDS's own published schema for each version the view is written in
// (test/contract-dsds.test.mjs, the schemas fetched into test/.dsds/), and a weekly job tries each new DSDS release the
// same way before the pin here moves (dsds-release.mjs). The view is written in the version the team's intent layer
// declares when the engine has been tried against it (DSDS_TRIED), and in the pinned one otherwise, said plainly. A
// field an older version does not have (uuid, before 0.23.1) is kept under the engine's own $extensions key there.
//
// Pure: no file is read or written here (contract-gen.mjs writes them).

import { createHash } from 'node:crypto';
import { verifiedBy } from './rule-checks.mjs';

export const DSDS_VERSION = '0.23.1';
// The older releases the view has been tried against: each one's published schema accepts every document written in
// it (test/contract-dsds.test.mjs). 0.21 and before shape an entry differently, and are not offered. When the pin moves,
// the version it moved from is added here once the tests pass against it.
export const DSDS_TRIED_OLDER = ['0.23.0', '0.22.0'];
export const DSDS_TRIED = [DSDS_VERSION, ...DSDS_TRIED_OLDER];
export const dsdsSchemaUrl = (v) => `https://designsystemdocspec.org/v${v}/dsds.bundled.yaml`;
export const DSDS_SCHEMA = dsdsSchemaUrl(DSDS_VERSION);
// DSDS asks for a namespaced key (at least one dot): the engine's, by the host its published pages live on.
export const DSDS_EXT = 'io.github.rafaelmatosdasilva.rms-design-system-engine';
const EXT = DSDS_EXT;

// The first version each field is in. Written only from it on; before it, kept under $extensions.
const SINCE = { uuid: '0.23.1' };
const parse = (v) => /^v?(\d+)\.(\d+)\.(\d+)$/.exec(String(v ?? '').trim())?.slice(1).map(Number) ?? null;
const compare = (a, b) => { const x = parse(a), y = parse(b); for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] - y[i]; return 0; };
const hasField = (version, field) => compare(version, SINCE[field]) >= 0;
const listed = (xs) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}`);

// The version the view is written in, for the version a team's intent layer declares. → { version, said }, said null
// when there is nothing to tell (no version declared, or one the engine writes).
export function dsdsVersionFor(declared) {
  if (declared == null || String(declared).trim() === '') return { version: DSDS_VERSION, said: null };
  const v = String(declared).trim().replace(/^v/, '');
  if (!parse(v)) return { version: DSDS_VERSION, said: `The intent layer says it is written in DSDS "${declared}", which is not a version: the engine's view is written in DSDS ${DSDS_VERSION}.` };
  const tried = DSDS_TRIED.find((t) => compare(t, v) === 0);
  if (tried) return { version: tried, said: null };
  if (compare(v, DSDS_VERSION) > 0) return { version: DSDS_VERSION, said: `The intent layer is written in DSDS ${v}, newer than any the engine has been tried against: its view is written in DSDS ${DSDS_VERSION} until an engine update brings ${v}.` };
  return { version: DSDS_VERSION, said: `The intent layer is written in DSDS ${v}, which the engine has not been tried against (it writes ${listed(DSDS_TRIED)}): its view is written in DSDS ${DSDS_VERSION}, which tools made for ${v} may not read.` };
}

// An id DSDS can point at: the contract's name, in lower case words joined by dashes (buttonPrimary → button-primary).
export const dsdsId = (name) => String(name ?? '').replace(/([a-z0-9])([A-Z])/g, '$1-$2').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase();
// A trait's or a value's id is the API's own name, and DSDS allows letters, digits, _ and $ in words joined by dashes:
// a name with a space or a dot in it (Figma's "Show icon") keeps its words, joined by a dash.
export const dsdsApiId = (name) => String(name ?? '').trim().replace(/[^A-Za-z0-9_$]+/g, '-').replace(/^-+|-+$/g, '') || 'value';
// A token's id is its path in the DTCG file, its groups joined by dots, each in the form DSDS allows a token id
// (letters, digits, _ and $ in words joined by dashes). Figma's slashes are the same groups (button/text/color).
export const dsdsTokenId = (path) => (Array.isArray(path) ? path : String(path ?? '').split('/')).map((s) => dsdsApiId(s)).filter(Boolean).join('.');

// A uuid made from a key, the same every build (a name-based uuid, version 5's layout): the same key gives the same uuid.
export function uuidOf(key) {
  const h = createHash('sha1').update(`rms-design-system-engine:dsds:${key}`).digest('hex').slice(0, 32).split('');
  h[12] = '5';
  h[16] = ((parseInt(h[16], 16) & 0x3) | 0x8).toString(16);
  const s = h.join('');
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20, 32)}`;
}

// What stays when a component is renamed, most lasting first: its Figma node, then its code file, then its contract.
export function keysOf(c) {
  const fig = c?.source?.figma, node = fig?.nodeId || c?.figmaNodeId;
  return [
    ...(node ? [`figma:${fig?.file ? `${fig.file}/` : ''}${node}`] : []),
    ...(c?.source?.code?.file ? [`code:${c.source.code.file}`] : []),
    ...(c?.id ? [`contract:${c.id}`] : c?.name ? [`contract:${c.name}`] : []),
  ];
}

// The uuids of a view written before, by each of its entries' keys: so an entry renamed since keeps its uuid while any
// of its keys still matches. docs: the documents read back ([{ doc }] or the docs themselves). → Map(key → uuid)
export function uuidsFrom(docs = []) {
  const out = new Map();
  for (const d of docs) for (const e of (d?.doc ?? d)?.entries ?? []) {
    const ext = e?.$extensions?.[EXT];
    const uuid = e?.uuid ?? ext?.uuid;
    if (uuid) for (const k of ext?.keys ?? []) if (!out.has(k)) out.set(k, uuid);
  }
  return out;
}

// The uuid an entry gets: one written before under any of its keys, else one made from its first key.
function uuidFor(keys, previous) {
  for (const k of keys) if (previous?.has(k)) return previous.get(k);
  return keys.length ? uuidOf(keys[0]) : null;
}

// The uuid, where the version has the field, else under the engine's key; and the keys it was found by.
function stamp(entry, { keys, previous, version, ext = {} }) {
  const uuid = uuidFor(keys, previous);
  const out = { ...entry };
  if (uuid && hasField(version, 'uuid')) out.uuid = uuid;
  out.$extensions = { [EXT]: { generated: true, ...ext, ...(uuid && !hasField(version, 'uuid') ? { uuid } : {}), ...(keys.length ? { keys } : {}) } };
  return out;
}

// A deprecated status: why, and what replaces it, as DSDS requires them.
function statusOf(st, name) {
  const status = STATUS[st.state] ?? dsdsId(st.state) ?? 'stable';
  if (status !== 'deprecated') return { status, ...(st.rationale ? { note: st.rationale } : {}) };
  const by = st.supersededBy ? dsdsId(st.supersededBy) : null;
  const notice = st.rationale || (st.supersededBy ? `Use ${st.supersededBy} instead.` : `${name} is deprecated, and no reason is recorded.`);
  return { status, deprecationNotice: notice, ...(by ? { replacedBy: [{ to: by }] } : {}) };
}

const STATUS = { current: 'stable', deprecated: 'deprecated', experimental: 'experimental' };

// The status overall and on each platform. A component Figma has and no platform's code has yet is planned on each
// platform the system ships on (what the engine calls not built yet), beside its overall status when it has one.
function metadataStatus(c, name, platforms) {
  const overall = c.status?.state ? statusOf(c.status, name) : null;
  const notBuilt = platforms.length && !c.source?.code?.file && !c.codeOnly && (c.source?.figma || c.figmaNodeId) && overall?.status !== 'deprecated';
  if (!notBuilt) return overall;
  return [...(overall ? [overall] : []), ...platforms.map((platform) => ({ platform, status: 'planned' }))];
}

// The names a contract lists that the view has an entry for, as their ids. known: Set of ids, or null for all.
const resolved = (names, known) => [...new Set((names ?? []).map(dsdsId))].filter((id) => id && (!known || known.has(id)));

// opts: file (the contract's path from the entry's file), framework, version, platforms (the system's), known (the ids
// of every entry, so a pointer is written only where it resolves), tokenIds (Map of a token name to its id), previous
// (uuidsFrom of the view written before).
export function dsdsEntry(c, { file = null, framework = null, version = DSDS_VERSION, platforms = [], known = null, tokenIds = null, previous = null } = {}) {
  const name = c.name || String(c.id ?? '').replace(/^[^.]+\./, '');
  // The placeholder a contract carries until someone writes one says nothing about the component: left empty here.
  const description = /— captured from Figma by rms-design-system-engine\.$/.test(c.description ?? '') ? '' : (c.description || '');
  const id = dsdsId(name);
  const entry = { id, kind: 'component', name, description };
  const status = metadataStatus(c, name, platforms);
  if (status) entry.metadata = { status };
  // What it is built from: the components it nests, and the tokens it paints with, where the view has them.
  const tokens = tokenIds ? [...new Set((c.tokens?.used ?? []).map((t) => tokenIds.get(t)).filter(Boolean))] : [];
  const uses = [...resolved(c.relationships?.composesWith, known).filter((x) => x !== id), ...tokens].map((to) => ({ to }));
  if (uses.length) entry.uses = uses;
  // What to use instead; a replacement is the status's own (replacedBy), written once, on that field.
  const alts = resolved(c.useInstead, known).filter((x) => x !== id).map((to) => ({ to }));
  if (alts.length) entry.alternatives = alts;
  const refs = [];
  const fig = c.source?.figma;
  if (fig?.file && (fig.nodeId || c.figmaNodeId)) refs.push({ href: `https://www.figma.com/design/${fig.file}?node-id=${String(fig.nodeId || c.figmaNodeId).replace(':', '-')}`, rel: 'design', note: 'Figma' });
  const page = c.intentPage ?? c.intent?.source;
  if (page) refs.push({ href: page, rel: 'relates-to', note: 'the team\'s own page, where the guidance is written' });
  if (refs.length) entry.refs = refs;
  // What never goes together, as DSDS says it: a combo on this component, where each one named has an entry. One the
  // view has no entry for stays a sentence, since a combo pointing nowhere is one DSDS refuses.
  const never = c.relationships?.neverCombineWith ?? [];
  const together = known ? resolved(never, known).filter((x) => x !== id) : [];
  const apart = never.filter((n) => !together.includes(dsdsId(n)));
  // The guidance the contract itself holds (written in contract.authored.json); the intent layer's stays on its page.
  const items = [];
  // Each says how it is held (rule-checks.mjs verifiedBy): what never goes together is the edit check's nesting rules,
  // a difference kept on purpose is the audit's to hold to its values, and when not to use it is a person's judgement.
  if (c.whenNotToUse) items.push({ statement: c.whenNotToUse, level: 'should-not', ...verifiedBy({ status: 'judgment' }) });
  for (const n of apart) items.push({ statement: `Never put ${name} together with ${n}.`, level: 'must-not', ...verifiedBy({ status: 'checked', by: 'edit', check: 'the edit check\'s nesting rules' }) });
  for (const k of c.kept ?? []) items.push({ statement: `${k.what}: ${k.truth ? `follow ${k.truth === 'figma' ? 'Figma' : 'the code'}` : 'kept on purpose'}, because ${k.reason}`, level: 'should', ...verifiedBy({ status: 'checked', by: 'kept', check: 'the audit\'s kept differences, which fail again once a value moves' }) });
  if (items.length) entry.sections = [{ kind: 'guidelines', for: 'all', title: 'From the contract', items }];
  const code = c.source?.code?.file;
  if (code) entry.sourceFiles = [{ platform: framework || platformOf(code), file: code }];
  if (file) entry.specs = [{ href: file, role: 'DS Contracts' }];
  // Traits: Figma's variant properties and booleans, and the states, each as Figma and the code agree on them.
  const traits = [];
  for (const p of c.props ?? []) {
    // A variant whose only values are False and True (Figma draws a boolean that way too) is a boolean.
    const yesNo = p.type === 'enum' && Array.isArray(p.options) && p.options.length === 2 && p.options.every((o) => /^(true|false)$/i.test(String(o)));
    const tid = dsdsApiId(p.name);
    if (yesNo) traits.push({ traitType: 'variant', kind: 'boolean', id: tid, description: `${name}'s ${p.name}${p.default != null ? `, ${/^true$/i.test(String(p.default)) ? 'on' : 'off'} unless set` : ''}.` });
    else if (p.type === 'enum' && Array.isArray(p.options) && p.options.length) {
      // Each value is an object of its own in DSDS, with a description; two that make one id keep the first.
      const values = [];
      for (const o of p.options.map(String)) { const vid = dsdsApiId(o); if (!values.some((v) => v.id === vid)) values.push({ id: vid, ...(vid !== o ? { name: o } : {}), description: `${name} with ${p.name} ${o}${String(p.default) === o ? ', the default' : ''}.` }); }
      traits.push({ traitType: 'variant', kind: 'enum', id: tid, description: `${name}'s ${p.name}${p.default != null ? `, ${p.default} unless set` : ''}.`, values });
    } else if (p.type === 'boolean') traits.push({ traitType: 'variant', kind: 'boolean', id: tid, description: `${name}'s ${p.name}${p.default != null ? `, ${p.default ? 'on' : 'off'} unless set` : ''}.` });
  }
  for (const s of c.states ?? []) if (s?.name && !traits.some((t) => t.id === dsdsApiId(s.name))) traits.push({ traitType: 'state', kind: 'boolean', id: dsdsApiId(s.name), description: `${name} ${s.name}${s.selector ? ` (${s.selector})` : ''}.` });
  if (traits.length) entry.traits = traits;
  if (together.length) entry.combos = [{ subject: id, level: 'must-not', items: together, note: `Never put ${name} together with ${listed(together)}: the edit check's nesting rules hold it.` }];
  return stamp(entry, { keys: keysOf(c), previous, version, ext: { contract: c.id ?? null } });
}

const platformOf = (file) => /\.vue$/i.test(file) ? 'vue' : /\.(tsx|jsx)$/i.test(file) ? 'react' : /\.svelte$/i.test(file) ? 'svelte' : /\.html?$/i.test(file) ? 'html' : 'web';

// ── Tokens and themes ─────────────────────────────────────────────────────────────────────────────────────────────────
const MODES_EXT = 'com.rms.design-system-engine';
const TYPE_WORD = { color: 'colour', dimension: 'dimension', typography: 'text style', fontFamily: 'font family', fontWeight: 'font weight', duration: 'duration', cubicBezier: 'easing', number: 'number', shadow: 'shadow' };

// Every token of a DTCG dictionary, with its path. → [{ path, leaf }]
export function tokenLeaves(tokens, path = []) {
  const out = [];
  for (const [k, v] of Object.entries(tokens ?? {})) {
    if (k.startsWith('$') || !v || typeof v !== 'object') continue;
    if ('$value' in v) out.push({ path: [...path, k], leaf: v });
    else out.push(...tokenLeaves(v, [...path, k]));
  }
  return out;
}

// One token entry: what it is, where its value is (a JSON Pointer into the DTCG file), and the surfaces a text colour
// reads on, as a combo. byName: Map of a token's Figma name to its id, for those surfaces.
function tokenEntry({ path, leaf }, { href, byName }) {
  const id = dsdsTokenId(path), name = path.join('/');
  const type = leaf.$type || null;
  const description = String(leaf.$description ?? '').trim() || `The ${TYPE_WORD[type] ?? type ?? 'design'} token ${name}. Its value is in the DTCG file this entry points at.`;
  const entry = { id, kind: 'token', name, description };
  if (leaf.$deprecated) entry.metadata = { status: { status: 'deprecated', deprecationNotice: typeof leaf.$deprecated === 'string' ? leaf.$deprecated : `${name} is deprecated, and no reason is recorded.` } };
  if (type && /^[a-z][a-zA-Z0-9]*$/.test(type)) entry.tokenType = type;
  entry.source = { href: `${href}#/${path.map((s) => String(s).replace(/~/g, '~0').replace(/\//g, '~1')).join('/')}` };
  // The surfaces it reads on at 4.5:1 or more in every mode (readableOn), and the one it was made for (goesWith).
  const own = leaf.$extensions?.[MODES_EXT] ?? {};
  const on = [...new Set((own.readableOn ?? []).map((s) => byName.get(s)).filter((s) => s && s !== id))];
  if (on.length) {
    const made = own.goesWith?.ok !== false ? byName.get(own.goesWith?.surface) : null;
    entry.combos = [{ subject: `{${id}}`, level: 'should', items: on.map((s) => `{${s}}`), note: `Reads at 4.5:1 or more on each of these, in every mode${made && on.includes(made) ? `, and was made for ${made}` : ''}.` }];
  }
  return entry;
}

// One theme a mode, when the system has more than one: the first is each token's own value, every other one extends
// it with the values kept under each token's $extensions. modes: [{ name, snapshotKey }] (ds-config.json figma.modes).
function themeEntries(modes, { system, href, leaves, version, previous, taken }) {
  if (!Array.isArray(modes) || modes.length < 2) return [];
  const out = [];
  let base = null;
  for (const [i, m] of modes.entries()) {
    const name = String(m?.name ?? m?.snapshotKey ?? '').trim();
    const id = dsdsId(name);
    if (!id || taken.has(id)) continue;
    taken.add(id);
    const key = m?.snapshotKey ?? name;
    const differ = leaves.filter(({ leaf }) => leaf.$extensions?.[MODES_EXT]?.modes?.[key] !== undefined).length;
    const scheme = /dark/i.test(name) ? 'dark' : /light/i.test(name) ? 'light' : null;
    const first = i === 0 || !base;
    const entry = {
      id, kind: 'theme', name,
      description: first ? `${system} in ${name}, its first mode: each token's own value.` : `${system} in ${name}: ${differ} token${differ === 1 ? '' : 's'} take${differ === 1 ? 's' : ''} another value here.`,
      ...(first ? {} : { extends: [{ to: base }] }),
      ...(scheme ? { colorScheme: scheme } : {}),
      source: { href, note: first ? 'Each token\'s $value is this mode\'s.' : `This mode's values are under each token's $extensions["${MODES_EXT}"].modes["${key}"].` },
    };
    out.push(stamp(entry, { keys: [`mode:${key}`], previous, version }));
    if (first) base = id;
  }
  return out;
}

// ── Pages of the intent layer ─────────────────────────────────────────────────────────────────────────────────────────
const PAGE_LAYERS = { patterns: 'pattern', flows: 'flow', foundations: 'foundation' };

// The team's patterns, flows and foundations, one entry each: the components it uses and a link to its page. Its words
// stay on the page. pages: [{ entity, components, contract }] with components the names it uses and contract the path of
// its pattern contract, when there is one, from the entry's own file.
function pageEntry({ entity, components = [], contract = null }, { system, version, previous, known }) {
  const kind = PAGE_LAYERS[entity?.layer];
  const name = String(entity?.name ?? '').trim();
  const id = dsdsId(name);
  if (!kind || !id) return null;
  const entry = { id, kind: 'entry', name, description: `The ${kind} ${name} of ${system}. Its guidance is on the team's own page, linked here.` };
  if (entity.status) { const st = statusOf({ state: entity.status }, name); if (st.status !== 'deprecated') entry.metadata = { status: st }; }
  const uses = resolved(components, known).filter((x) => x !== id).map((to) => ({ to }));
  if (uses.length) entry.uses = uses;
  const refs = [];
  if (entity.url) refs.push({ href: entity.url, rel: 'relates-to', note: 'the team\'s own page, where the guidance is written' });
  if (contract) refs.push({ href: contract, rel: 'relates-to', note: `its ${kind} contract, the page's rules in a form an agent and a check can read` });
  if (refs.length) entry.refs = refs;
  return { layer: entity.layer, entry: stamp(entry, { keys: [`page:${entity.file ?? entity.id ?? name}`], previous, version }) };
}

// ── Shared rules ──────────────────────────────────────────────────────────────────────────────────────────────────────
// How the system builds a component, in Figma and in the code (construction.json): each rule written once, as the
// engine holds it. A rule every component follows is a must (breaking it fails), one most follow or the team decided
// is a should, one still to decide is left out.
function sharedRules(construction, { system }) {
  const out = [];
  for (const [side, where] of [['figma', 'Figma'], ['code', 'the code']]) {
    const rules = (construction?.[side]?.rules ?? []).filter((r) => r?.says && (r.status === 'rule' || r.status === 'fix'));
    if (!rules.length) continue;
    const items = [];
    for (const r of rules) {
      const rid = dsdsId(r.id ?? r.says);
      if (!rid || items.some((x) => x.id === rid)) continue;
      items.push({ id: rid, statement: `${String(r.says).replace(/\.$/, '')}.`, level: r.status === 'rule' ? 'must' : 'should', ...verifiedBy({ status: 'checked', by: 'construction', check: `--construction-check, on ${where}${r.of ? `: ${r.follows ?? 0} of ${r.of} components follow it` : ''}` }) });
    }
    out.push({ id: `construction-${side}`, name: `How ${system} builds a component in ${where}`, description: `The rules ${system}'s components follow in ${where}, read from the components themselves.`, sections: [{ kind: 'guidelines', for: 'all', title: `Building a component in ${where}`, items }], $extensions: { [EXT]: { generated: true, from: 'contracts/construction.json' } } });
  }
  return out;
}

// built: [{ name, contract, file }] with file the contract's path relative to the contracts folder. → [{ rel, doc }]
// opts:
//   system, framework     the system's name and its code's framework
//   version               the DSDS version to write (one of DSDS_TRIED; dsdsVersionFor chooses it)
//   tokens, tokensHref    the DTCG dictionary, and its file's path from the dsds folder (both, or no tokens are written)
//   modes                 [{ name, snapshotKey }]: a theme each, when there are two or more
//   pages                 [{ entity, components, contract }]: the intent layer's patterns, flows and foundations, with
//                         contract the pattern contract's path relative to the contracts folder, as built's file is
//   construction          construction.json's content: its rules, as shared rules
//   sourceRoot            the project's root from the dsds folder, where each component's code file is read from
//   previous              uuidsFrom(the view written before)
export function dsdsDocuments(built, { system = 'Design system', framework = null, version = DSDS_VERSION, tokens = null, tokensHref = null, modes = [], pages = [], construction = null, sourceRoot = null, previous = null } = {}) {
  if (!DSDS_TRIED.includes(version)) version = DSDS_VERSION;
  const head = { $schema: dsdsSchemaUrl(version), schemaVersion: version, name: system };
  const out = [];
  const taken = new Set([dsdsId(system) || 'system']);
  // Every id first, so a pointer is written only where it resolves.
  const comps = [];
  for (const b of built) { const id = dsdsId(b.contract?.name || b.name || String(b.contract?.id ?? '').replace(/^[^.]+\./, '')); if (id && !taken.has(id)) { taken.add(id); comps.push({ ...b, id }); } }
  const leaves = tokens && tokensHref ? tokenLeaves(tokens) : [];
  const byName = new Map();
  for (const { path } of leaves) { const id = dsdsTokenId(path); byName.set(path.join('/'), id); byName.set(path.join('.'), id); }
  const tokenIds = new Map(byName);
  const pageList = (pages ?? []).filter((p) => PAGE_LAYERS[p?.entity?.layer] && dsdsId(p.entity.name));
  const pageIds = new Set();
  for (const p of pageList) { const id = dsdsId(p.entity.name); if (!taken.has(id)) { taken.add(id); pageIds.add(id); } }
  const known = new Set([...comps.map((c) => c.id), ...pageIds]);
  // The platforms the system ships on: each code file's, so a status per platform names one the system declares.
  const platforms = [...new Set(comps.map((b) => b.contract?.source?.code?.file ? (framework || platformOf(b.contract.source.code.file)) : null).filter(Boolean))].sort();
  for (const { name, contract, file, id } of comps) {
    const entry = dsdsEntry(contract, { file: file ? `../../${file}` : null, framework, version, platforms, known, tokenIds, previous });
    out.push({ rel: `components/${id}.dsds.json`, doc: { ...head, entries: [entry] }, name });
  }
  // Tokens and themes, in one file beside the index.
  if (leaves.length) {
    const tokenEntries = [];
    const seen = new Set();
    for (const l of leaves) { const id = dsdsTokenId(l.path); if (id && !seen.has(id)) { seen.add(id); tokenEntries.push(tokenEntry(l, { href: tokensHref, byName })); } }
    const themes = themeEntries(modes, { system, href: tokensHref, leaves, version, previous, taken });
    out.push({ rel: 'tokens.dsds.json', doc: { ...head, entries: [...tokenEntries, ...themes] } });
  }
  // The intent layer's pages: patterns/, flows/ and foundations/, one file each.
  for (const p of pageList) {
    const id = dsdsId(p.entity.name);
    if (!pageIds.has(id)) continue;
    pageIds.delete(id);   // the first page of a name kept
    const made = pageEntry({ ...p, contract: p.contract ? `../../${p.contract}` : null }, { system, version, previous, known });
    if (made) out.push({ rel: `${made.layer}/${id}.dsds.json`, doc: { ...head, entries: [made.entry] } });
  }
  const shared = sharedRules(construction, { system });
  const index = {
    ...head,
    entries: [{
      id: dsdsId(system) || 'system', kind: 'system', name: system,
      description: `${system} as the engine reads it from Figma, the code and the team's own pages: generated, do not edit (the guidance lives on the team's own pages).`,
      // The platforms each status and source file names, and where those files are: DSDS reads a source file from its
      // own document's folder unless the system says where the code lives.
      ...(platforms.length || sourceRoot ? { metadata: { ...(platforms.length ? { platforms } : {}), ...(sourceRoot ? { sourceRoot } : {}) } } : {}),
    }],
    ...(shared.length ? { shared } : {}),
    refs: out.map((d) => ({ href: d.rel, rel: 'file' })),
  };
  return [{ rel: 'system.dsds.json', doc: index }, ...out.map(({ rel, doc }) => ({ rel, doc }))];
}
