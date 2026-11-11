// pattern-contract.mjs - a contract for each pattern and flow of the intent layer, as a component has one.
//
// A component's contract tells an agent how to use one piece of code: its props, its states, its tokens. A pattern
// (Save, Empty, Error) or a flow (Settings) is how several of them are put together, and that lived only as prose in
// the intent layer: an agent building a screen read it or did not, and nothing could hold it to it. This writes what
// the page says in a form an agent and a check can read: the components it uses (only names the system has), its rules
// at their level (must, should), when to use it and when not, and the mistakes to avoid, each from the page it came from.
//
//   patternContracts(entities, components) → [{ rel, contract }]
//     entities:   the intent layer's (doc-source-dsds.mjs readSnapshot().entities)
//     components: the system's component names
//     rel:        where it is written in the contracts folder: patterns/<page>.pattern.json, flows/<page>.pattern.json
//
// Named .pattern.json, never .contract.json: every reader of the folder takes a .contract.json for a component's.
// Pure: nothing is read or written here.

const LAYERS = { patterns: 'pattern', flows: 'flow' };
export const PATTERN_SUFFIX = '.pattern.json';

const texts = (x) => (Array.isArray(x) ? x : x == null ? [] : [x]).map((t) => (typeof t === 'string' ? t : t?.text ?? '')).map((t) => String(t).trim()).filter(Boolean);
const key = (n) => String(n ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');

// The components a sentence names, as the system writes them: in backticks (`ConfirmButton`), in any case.
function named(text, byKey) {
  const out = [];
  for (const m of String(text).matchAll(/`([^`]+)`/g)) { const c = byKey.get(key(m[1])); if (c && !out.includes(c)) out.push(c); }
  return out;
}

// Its file's own name, the page's address in the layer (specs/dsds/patterns/save.dsds.json → save).
export const pageKey = (file) => String(file ?? '').split('/').pop().replace(/\.dsds\.json$|\.json$|\.md$/i, '');
export const patternFileOf = (entity) => (LAYERS[entity?.layer] && entity?.file ? `${entity.layer}/${pageKey(entity.file)}${PATTERN_SUFFIX}` : null);

export function patternContracts(entities = [], components = []) {
  const byKey = new Map(components.map((c) => [key(c), c]));
  const out = [];
  for (const e of entities) {
    const kind = LAYERS[e?.layer], rel = patternFileOf(e);
    if (!kind || !rel) continue;
    const rules = (e.rules ?? []).map((r) => ({ text: String(r?.text ?? r ?? '').trim(), level: r?.level ?? 'should' })).filter((r) => r.text)
      .map((r) => { const uses = named(r.text, byKey); return { ...r, ...(uses.length ? { components: uses } : {}) }; });
    const all = [...texts(e.purpose), ...texts(e.whenToUse), ...texts(e.whenNotToUse), ...texts(e.mistakes), ...texts(e.limitations), ...rules.map((r) => r.text)];
    const uses = [...new Set(all.flatMap((t) => named(t, byKey)))];
    out.push({ rel, contract: {
      kind, name: e.name, id: e.id ?? `${kind}-${pageKey(e.file)}`, ...(e.status ? { status: e.status } : {}),
      purpose: texts(e.purpose).join(' '),
      components: uses,
      rules,
      whenToUse: texts(e.whenToUse), whenNotToUse: texts(e.whenNotToUse), mistakes: texts(e.mistakes), limitations: texts(e.limitations),
      from: e.file,
      'x-design-system-engine': { note: `Generated from the intent layer's ${kind} page (rms-design-system-engine): what it says, in a form an agent and a check can read. Edit the page, never this file.` },
    } });
  }
  return out;
}
