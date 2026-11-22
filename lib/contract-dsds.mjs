// contract-dsds.mjs - the component contracts, viewed in DSDS (designsystemdocspec.org, the version DSDS_VERSION names), for a team that already
// documents its system in that format and wants the engine's facts in the same shape.
//
//   dsdsEntry(contract, { file, framework })   → one DSDS component entry, from one contract
//   dsdsDocuments(built, { system, framework }) → [{ rel, doc }]: an index (system.dsds.json) and one file per component
//
// DSDS keeps one origin per fact: a component's API belongs to its own format, token values to DTCG, the guidance to
// the team's pages. So the view says what the engine knows and links the rest: the contract as the entry's spec, the
// code file as its source, Figma's node as a ref, and the intent layer's page as one (never its words copied back).
// What it does hold is what the contract computes from Figma and the code and nothing in DSDS says elsewhere: the
// variant and state traits, what the component nests (uses), what to use instead (alternatives), its status, and the
// guidance written in the contract itself (whenNotToUse). Each guideline says it came from the contract.
//
// Every document it writes is checked against DSDS's own published schema for that version (test/contract-dsds.test.mjs,
// the schema fetched into test/.dsds/), and a weekly job tries each new DSDS release the same way before the version
// here moves (dsds-release.mjs). So the shape follows the format's own rules: a deprecated status says why
// (deprecationNotice) and names what replaces it (replacedBy), a link's rel is one DSDS names, an enum trait's values are
// objects with their own description, an id is in the form DSDS allows, and the engine's own fields sit under one
// namespaced key in $extensions.
//
// Pure: no file is read or written here (contract-gen.mjs writes them).

import { verifiedBy } from './rule-checks.mjs';

export const DSDS_VERSION = '0.23.1';
export const DSDS_SCHEMA = `https://designsystemdocspec.org/v${DSDS_VERSION}/dsds.bundled.yaml`;
// DSDS asks for a namespaced key (at least one dot): the engine's, by the host its published pages live on.
export const DSDS_EXT = 'io.github.rafaelmatosdasilva.rms-design-system-engine';
const EXT = DSDS_EXT;

// An id DSDS can point at: the contract's name, in lower case words joined by dashes (buttonPrimary → button-primary).
export const dsdsId = (name) => String(name ?? '').replace(/([a-z0-9])([A-Z])/g, '$1-$2').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase();
// A trait's or a value's id is the API's own name, and DSDS allows letters, digits, _ and $ in words joined by dashes:
// a name with a space or a dot in it (Figma's "Show icon") keeps its words, joined by a dash.
export const dsdsApiId = (name) => String(name ?? '').trim().replace(/[^A-Za-z0-9_$]+/g, '-').replace(/^-+|-+$/g, '') || 'value';

// A deprecated status: why, and what replaces it, as DSDS requires them.
function statusOf(st, name) {
  const status = STATUS[st.state] ?? dsdsId(st.state) ?? 'stable';
  if (status !== 'deprecated') return { status, ...(st.rationale ? { note: st.rationale } : {}) };
  const by = st.supersededBy ? dsdsId(st.supersededBy) : null;
  const notice = st.rationale || (st.supersededBy ? `Use ${st.supersededBy} instead.` : `${name} is deprecated, and no reason is recorded.`);
  return { status, deprecationNotice: notice, ...(by ? { replacedBy: [{ to: by }] } : {}) };
}

const STATUS = { current: 'stable', deprecated: 'deprecated', experimental: 'experimental' };

export function dsdsEntry(c, { file = null, framework = null } = {}) {
  const name = c.name || String(c.id ?? '').replace(/^[^.]+\./, '');
  // The placeholder a contract carries until someone writes one says nothing about the component: left empty here.
  const description = /— captured from Figma by rms-design-system-engine\.$/.test(c.description ?? '') ? '' : (c.description || '');
  const entry = { id: dsdsId(name), kind: 'component', name, description };
  if (c.status?.state) entry.metadata = { status: statusOf(c.status, name) };
  const uses = (c.relationships?.composesWith ?? []).map((n) => ({ to: dsdsId(n) }));
  if (uses.length) entry.uses = uses;
  // What to use instead; a replacement is the status's own (replacedBy), written once, on that field.
  const alts = [...new Set((c.useInstead ?? []).map(dsdsId))].filter(Boolean).map((to) => ({ to }));
  if (alts.length) entry.alternatives = alts;
  const refs = [];
  const fig = c.source?.figma;
  if (fig?.file && (fig.nodeId || c.figmaNodeId)) refs.push({ href: `https://www.figma.com/design/${fig.file}?node-id=${String(fig.nodeId || c.figmaNodeId).replace(':', '-')}`, rel: 'design', note: 'Figma' });
  const page = c.intentPage ?? c.intent?.source;
  if (page) refs.push({ href: page, rel: 'relates-to', note: 'the team\'s own page, where the guidance is written' });
  if (refs.length) entry.refs = refs;
  // The guidance the contract itself holds (written in contract.authored.json); the intent layer's stays on its page.
  const items = [];
  // Each says how it is held (rule-checks.mjs verifiedBy): what never goes together is the edit check's nesting rules,
  // a difference kept on purpose is the audit's to hold to its values, and when not to use it is a person's judgement.
  if (c.whenNotToUse) items.push({ statement: c.whenNotToUse, level: 'should-not', ...verifiedBy({ status: 'judgment' }) });
  for (const n of c.relationships?.neverCombineWith ?? []) items.push({ statement: `Never put ${name} together with ${n}.`, level: 'must-not', ...verifiedBy({ status: 'checked', by: 'edit', check: 'the edit check\'s nesting rules' }) });
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
    const id = dsdsApiId(p.name);
    if (yesNo) traits.push({ traitType: 'variant', kind: 'boolean', id, description: `${name}'s ${p.name}${p.default != null ? `, ${/^true$/i.test(String(p.default)) ? 'on' : 'off'} unless set` : ''}.` });
    else if (p.type === 'enum' && Array.isArray(p.options) && p.options.length) {
      // Each value is an object of its own in DSDS, with a description; two that make one id keep the first.
      const values = [];
      for (const o of p.options.map(String)) { const vid = dsdsApiId(o); if (!values.some((v) => v.id === vid)) values.push({ id: vid, ...(vid !== o ? { name: o } : {}), description: `${name} with ${p.name} ${o}${String(p.default) === o ? ', the default' : ''}.` }); }
      traits.push({ traitType: 'variant', kind: 'enum', id, description: `${name}'s ${p.name}${p.default != null ? `, ${p.default} unless set` : ''}.`, values });
    } else if (p.type === 'boolean') traits.push({ traitType: 'variant', kind: 'boolean', id, description: `${name}'s ${p.name}${p.default != null ? `, ${p.default ? 'on' : 'off'} unless set` : ''}.` });
  }
  for (const s of c.states ?? []) if (s?.name && !traits.some((t) => t.id === dsdsApiId(s.name))) traits.push({ traitType: 'state', kind: 'boolean', id: dsdsApiId(s.name), description: `${name} ${s.name}${s.selector ? ` (${s.selector})` : ''}.` });
  if (traits.length) entry.traits = traits;
  entry.$extensions = { [EXT]: { generated: true, contract: c.id ?? null } };
  return entry;
}

const platformOf = (file) => /\.vue$/i.test(file) ? 'vue' : /\.(tsx|jsx)$/i.test(file) ? 'react' : /\.svelte$/i.test(file) ? 'svelte' : /\.html?$/i.test(file) ? 'html' : 'web';

// built: [{ name, contract, file }] with file the contract's path relative to the contracts folder. → [{ rel, doc }]
export function dsdsDocuments(built, { system = 'Design system', framework = null } = {}) {
  const out = [];
  const seen = new Set();
  for (const { name, contract, file } of built) {
    const entry = dsdsEntry(contract, { file: file ? `../../${file}` : null, framework });
    if (!entry.id || seen.has(entry.id)) continue;   // two contracts making one id: the first kept
    seen.add(entry.id);
    out.push({ rel: `components/${entry.id}.dsds.json`, doc: { $schema: DSDS_SCHEMA, schemaVersion: DSDS_VERSION, name: system, entries: [entry] }, name });
  }
  const index = {
    $schema: DSDS_SCHEMA, schemaVersion: DSDS_VERSION, name: system,
    entries: [{ id: dsdsId(system) || 'system', kind: 'system', name: system, description: `${system}'s components as the engine reads them from Figma and the code: generated, do not edit (the guidance lives on the team's own pages).` }],
    refs: out.map((d) => ({ href: d.rel, rel: 'file' })),
  };
  return [{ rel: 'system.dsds.json', doc: index }, ...out.map(({ rel, doc }) => ({ rel, doc }))];
}
