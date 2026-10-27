// contract-dsds.mjs - the component contracts, viewed in DSDS 0.23 (designsystemdocspec.org), for a team that already
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
// Pure: no file is read or written here (contract-gen.mjs writes them).

export const DSDS_VERSION = '0.23.0';
export const DSDS_SCHEMA = `https://designsystemdocspec.org/v${DSDS_VERSION}/dsds.bundled.yaml`;
const EXT = 'rms-design-system-engine';

// An id DSDS can point at: the contract's name, in lower case words joined by dashes (buttonPrimary → button-primary).
export const dsdsId = (name) => String(name ?? '').replace(/([a-z0-9])([A-Z])/g, '$1-$2').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase();

const STATUS = { current: 'stable', deprecated: 'deprecated', experimental: 'experimental' };

export function dsdsEntry(c, { file = null, framework = null } = {}) {
  const name = c.name || String(c.id ?? '').replace(/^[^.]+\./, '');
  // The placeholder a contract carries until someone writes one says nothing about the component: left empty here.
  const description = /— captured from Figma by rms-design-system-engine\.$/.test(c.description ?? '') ? '' : (c.description || '');
  const entry = { id: dsdsId(name), kind: 'component', name, description };
  if (c.status?.state) entry.metadata = { status: { status: STATUS[c.status.state] ?? c.status.state, ...(c.status.rationale ? { note: c.status.rationale } : {}) } };
  const uses = (c.relationships?.composesWith ?? []).map((n) => ({ to: dsdsId(n) }));
  if (uses.length) entry.uses = uses;
  const alts = [...new Set([...(c.useInstead ?? []), ...(c.status?.supersededBy ? [c.status.supersededBy] : [])])].map((n) => ({ to: dsdsId(n) }));
  if (alts.length) entry.alternatives = alts;
  const refs = [];
  const fig = c.source?.figma;
  if (fig?.file && (fig.nodeId || c.figmaNodeId)) refs.push({ href: `https://www.figma.com/design/${fig.file}?node-id=${String(fig.nodeId || c.figmaNodeId).replace(':', '-')}`, rel: 'figma' });
  const page = c.intentPage ?? c.intent?.source;
  if (page) refs.push({ href: page, rel: 'documentation', note: 'the team\'s own page, where the guidance is written' });
  if (refs.length) entry.refs = refs;
  // The guidance the contract itself holds (written in contract.authored.json); the intent layer's stays on its page.
  const items = [];
  if (c.whenNotToUse) items.push({ statement: c.whenNotToUse, level: 'should-not' });
  for (const n of c.relationships?.neverCombineWith ?? []) items.push({ statement: `Never put ${name} together with ${n}.`, level: 'must-not' });
  for (const k of c.kept ?? []) items.push({ statement: `${k.what}: ${k.truth ? `follow ${k.truth === 'figma' ? 'Figma' : 'the code'}` : 'kept on purpose'}, because ${k.reason}`, level: 'should' });
  if (items.length) entry.sections = [{ kind: 'guidelines', for: 'all', title: 'From the contract', items }];
  const code = c.source?.code?.file;
  if (code) entry.sourceFiles = [{ platform: framework || platformOf(code), file: code }];
  if (file) entry.specs = [{ href: file, role: 'DS Contracts' }];
  // Traits: Figma's variant properties and booleans, and the states, each as Figma and the code agree on them.
  const traits = [];
  for (const p of c.props ?? []) {
    // A variant whose only values are False and True (Figma draws a boolean that way too) is a boolean.
    const yesNo = p.type === 'enum' && Array.isArray(p.options) && p.options.length === 2 && p.options.every((o) => /^(true|false)$/i.test(String(o)));
    if (yesNo) traits.push({ traitType: 'variant', kind: 'boolean', id: p.name, description: `${name}'s ${p.name}${p.default != null ? `, ${/^true$/i.test(String(p.default)) ? 'on' : 'off'} unless set` : ''}.` });
    else if (p.type === 'enum' && Array.isArray(p.options) && p.options.length) traits.push({ traitType: 'variant', kind: 'enum', id: p.name, description: `${name}'s ${p.name}${p.default != null ? `, ${p.default} unless set` : ''}.`, values: p.options.map(String) });
    else if (p.type === 'boolean') traits.push({ traitType: 'variant', kind: 'boolean', id: p.name, description: `${name}'s ${p.name}${p.default != null ? `, ${p.default ? 'on' : 'off'} unless set` : ''}.` });
  }
  for (const s of c.states ?? []) if (s?.name && !traits.some((t) => t.id === s.name)) traits.push({ traitType: 'state', kind: 'boolean', id: s.name, description: `${name} ${s.name}${s.selector ? ` (${s.selector})` : ''}.` });
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
    refs: out.map((d) => ({ href: d.rel, rel: 'entry' })),
  };
  return [{ rel: 'system.dsds.json', doc: index }, ...out.map(({ rel, doc }) => ({ rel, doc }))];
}
