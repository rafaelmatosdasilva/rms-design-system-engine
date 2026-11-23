// a2ui-catalog.mjs - the system's component catalog written as an A2UI catalog, and A2UI's messages read for the check.
//
// A2UI (a2ui.org) is the open protocol an agent uses to place a host's own components: the host registers a catalog,
// the only components the agent may place, each with its properties as JSON Schema, and the agent streams them as
// updateComponents messages. A team that writes that catalog by hand has two lists of its components, and the second
// drifts from the system on the first change. This one is written from the same contracts as catalog.json
// (ui-catalog.mjs): the system's real components with their allowed values, and nothing invented.
//
// It holds to the A2UI version the team declares (ds-config.json "a2ui": { "version": "1.0" }), never to a guess at
// the newest: the protocol's catalog rules changed between versions, and a host on one rejects a catalog for another.
// Only versions whose catalog and message shapes are published in full are written: 0.9 (0.9.1) and 1.0.
//
//   a2uiVersion(cfg)                     → { version, catalogId } | { error } | null (nothing declared)
//   a2uiCatalog(catalog, { version, catalogId, title }) → the catalog document for that version
//   a2uiMessages(ui)                     → { components, version, surfaceId } when ui is A2UI's envelope, else null
//
// Pure: no I/O. contract-gen.mjs writes contracts/a2ui-catalog.json; ui-check.mjs reads the envelope.

export const A2UI_VERSIONS = { '0.9': '0.9.1', '1.0': '1.0' };
const COMMON = 'common_types.json#/$defs';
// A name A2UI can carry: an identifier (Unicode UAX #31, as the 1.0 catalog rules ask).
const IDENT = /^[\p{L}_][\p{L}\p{N}_]*$/u;

// The components and properties the catalog leaves out because A2UI cannot carry their names, each as it is called.
export function unfitNames(catalog) {
  const out = [];
  for (const [name, c] of Object.entries(catalog?.components ?? {})) {
    if (/^(removed|obsolete)$/i.test(c.status ?? '')) continue;
    if (!IDENT.test(name)) { out.push(name); continue; }
    for (const [k, e] of Object.entries(c.props ?? {})) if (e.type !== 'children' && !IDENT.test(e.codeName ?? k)) out.push(`${name}.${e.codeName ?? k}`);
  }
  return out;
}

// The version the team declared, as one of the versions written. A version not written is said, never rounded.
export function a2uiVersion(cfg = {}, systemName = 'design-system') {
  const a = cfg?.a2ui;
  if (a == null || a === false) return null;
  const raw = String(typeof a === 'object' ? a.version ?? '' : a).trim().replace(/^v/i, '');
  if (!raw) return { error: 'ds-config.json "a2ui" names no version: write the A2UI version your host renders, such as { "version": "1.0" }' };
  const version = A2UI_VERSIONS[raw] ? raw : Object.keys(A2UI_VERSIONS).find((k) => A2UI_VERSIONS[k] === raw);
  if (!version) return { error: `A2UI ${raw} is not one the engine writes a catalog for (${Object.values(A2UI_VERSIONS).join(', ')}): its catalog's shape is not published in full` };
  const slug = String(systemName).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'design-system';
  const catalogId = typeof a === 'object' && a.catalogId ? String(a.catalogId) : `urn:${slug}:a2ui-catalog:${A2UI_VERSIONS[version]}`;
  return { version, catalogId, declaredId: Boolean(typeof a === 'object' && a.catalogId) };
}

// One property, as A2UI writes it: a choice is its values, a yes-or-no a boolean, words a string, a slot a child.
function property(e) {
  const out = {};
  if (e.type === 'enum' && e.values?.length) {
    const yesNo = e.values.length === 2 && e.values.every((v) => /^(true|false)$/i.test(String(v)));
    if (yesNo) out.type = 'boolean';
    else { out.type = 'string'; out.enum = e.values.map(String); }
  } else if (e.type === 'boolean') out.type = 'boolean';
  else out.type = 'string';
  if (e.description) out.description = e.description;
  if (e.default != null) {
    const d = out.type === 'boolean' ? /^true$/i.test(String(e.default)) : String(e.default);
    if (out.type !== 'string' || !out.enum || out.enum.includes(d)) out.default = d;
  }
  return out;
}

// The catalog document. catalog: buildCatalog()'s. Each component's properties are its own, under the names the code
// takes (an agent's output is drawn by the host's code), its children a ChildList, a slot a ComponentId.
export function a2uiCatalog(catalog, { version = '1.0', catalogId, title = 'Design system' } = {}) {
  const full = A2UI_VERSIONS[version];
  if (!full) throw new Error(`A2UI ${version} is not written`);
  const components = {};
  for (const [name, c] of Object.entries(catalog?.components ?? {})) {
    // A component the team took out of the system is not one an agent may place, and a name A2UI cannot carry
    // (one with a space) is said by unfitNames(), never renamed here.
    if (/^(removed|obsolete)$/i.test(c.status ?? '') || !IDENT.test(name)) continue;
    const properties = { component: { const: name } };
    let children = false;
    for (const [k, e] of Object.entries(c.props ?? {})) {
      if (e.type === 'children') { children = true; continue; }
      const key = e.codeName ?? k;
      if (key === 'id' || key === 'component' || key === 'children' || key === 'child' || !IDENT.test(key)) continue;
      properties[key] = e.type === 'slot' ? { $ref: `${COMMON}/ComponentId`, ...(e.description ? { description: e.description } : {}) } : property(e);
    }
    if (children || c.children?.length) properties.children = { $ref: `${COMMON}/ChildList`, ...(c.children?.length ? { description: `Holds ${c.children.join(', ')} in the system.` } : {}) };
    const said = [c.description, c.status ? `${c.status}${c.useInstead?.length ? `: use ${c.useInstead.join(' or ')}` : ''}` : null, c.whenNotToUse ? `Not for: ${c.whenNotToUse}` : null].filter(Boolean).join(' ');
    components[name] = {
      type: 'object',
      ...(said ? { description: said } : {}),
      allOf: [{ $ref: `${COMMON}/ComponentCommon` }],
      properties,
      required: ['component'],
      unevaluatedProperties: false,
    };
  }
  return {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    $id: catalogId,
    catalogId,
    ...(version === '1.0' ? { protocolVersion: full } : {}),
    title: `${title} components`,
    description: `The components an agent may place, written by rms-design-system-engine from the design system's contracts for A2UI ${full}. Do not edit by hand: it is written again with the contracts.`,
    components,
  };
}

// A2UI's envelope: one message ({ version, updateComponents: { surfaceId, components } }), a list of messages, or
// the lines of a JSONL stream already parsed. → the components of every updateComponents in order, later ids
// replacing earlier ones as a host stores them, or null when ui is not A2UI's envelope.
export function a2uiMessages(ui) {
  const list = Array.isArray(ui) ? ui : ui && typeof ui === 'object' ? [ui] : [];
  const updates = list.filter((m) => m && typeof m === 'object' && m.updateComponents && typeof m.updateComponents === 'object');
  if (!updates.length) return null;
  const byId = new Map();
  for (const m of updates) for (const c of Array.isArray(m.updateComponents.components) ? m.updateComponents.components : []) if (c && typeof c === 'object') byId.set(c.id, c);
  const versions = [...new Set(list.map((m) => m?.version).filter((v) => v != null).map(String))];
  const surfaces = [...new Set(updates.map((m) => m.updateComponents.surfaceId).filter(Boolean))];
  return { components: [...byId.values()], versions, surfaces, messages: updates.length };
}

// Whether the messages say the version the team declared. → a finding's message, or null.
export function versionMismatch(versions, declared) {
  if (!declared || !versions?.length) return null;
  const said = versions.map((v) => v.replace(/^v/i, ''));
  const ok = said.every((v) => v === declared || v === A2UI_VERSIONS[declared] || (declared === '0.9' && /^0\.9(\.\d+)?$/.test(v)));
  return ok ? null : `the messages say A2UI ${said.join(', ')}, and the team declared ${A2UI_VERSIONS[declared]} (ds-config.json "a2ui"): the host renders the declared version`;
}
