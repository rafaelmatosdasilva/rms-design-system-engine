// prototype-states.mjs - a prototype's other states, and the ones its page owes.
//
// A page is more than its happy path: a list with nothing in it, a form sent with a mistake, data on its way. A
// composition names its other states beside it, each as the parts that differ, by id:
//   { "component": "Page", …, "states": { "empty": { "list": { "component": "emptyState", … } }, "error": { "email": {…} } } }
// (or "states" beside "prototype" in the file). A part replaced by null is left out of that state. Each state is checked
// and drawn as a whole page, with a switch on the prototype's bar.
//
// What the page owes: an empty state when it shows a list (a part repeated, or a component named or made for a list,
// table, grid or feed), an error state when it takes input (a field and a button), and every state the request or the
// team's guidelines name for this page or a component it uses ("every list has an empty state", "show a loading
// state"). One not given is a warning the reply owes: add it, or say why the page needs none.
import { nodesOf } from './prototype-pieces.mjs';

// The kinds of state the engine knows, each with the words a state's name or a sentence uses for it.
export const STATE_KINDS = [
  ['empty', /\b(empty|no (results?|items?|data)|nothing (here|yet|found)|zero|none yet|vazio|sem (resultados|dados|itens))\b/i],
  ['error', /\b(errors?|invalid|failed|failure|mistake|wrong|erro|inv[aá]lido|falh\w*)\b/i],
  ['loading', /\b(loading|skeleton|pending|spinner|in progress|carregando|a carregar)\b/i],
  ['offline', /\b(offline|no (connection|network)|sem (rede|liga[çc][ãa]o))\b/i],
  ['no permission', /\b(no (permission|access)|forbidden|not allowed|read[- ]only|sem (permiss[ãa]o|acesso))\b/i],
  ['success', /\b(success|saved|done|confirmed|sucesso|guardado|salvo)\b/i],
];
export const kindOf = (name) => STATE_KINDS.find(([, re]) => re.test(String(name)))?.[0] ?? null;

// The composition without its states, and each state's overrides. → { ui, states: [{ name, overrides }], findings }
export function splitStates(raw) {
  const findings = [];
  const outer = raw && typeof raw === 'object' ? raw : {};
  let ui = outer.prototype ?? outer;
  let given = outer.prototype ? outer.states : undefined;
  if (ui && typeof ui === 'object' && !Array.isArray(ui) && 'states' in ui) { const { states, ...rest } = ui; given = given ?? states; ui = rest; }
  const states = [];
  if (given != null) {
    if (typeof given !== 'object' || Array.isArray(given)) findings.push({ rule: 2, level: 'error', id: null, message: 'states is an object: each state\'s name, then the parts that differ by their "id" ({ "empty": { "<id>": { …the part in that state… } } })' });
    else for (const [name, overrides] of Object.entries(given)) {
      if (!overrides || typeof overrides !== 'object' || Array.isArray(overrides)) { findings.push({ rule: 2, level: 'error', id: null, message: `state "${name}" names the parts that differ by their "id": { "<id>": { …the part in that state… } }, or null to leave a part out` }); continue; }
      states.push({ name, overrides });
    }
  }
  return { ui, states, findings };
}

// The composition in one state: each part named replaced (null leaves it out). Works on either form. → { ui, unknown }
export function applyState(ui, overrides = {}) {
  const ids = new Set(Object.keys(overrides));
  const seen = new Set();
  const swap = (node) => {
    if (!node || typeof node !== 'object') return node;
    if (node.id != null && ids.has(String(node.id))) {
      seen.add(String(node.id));
      const next = overrides[node.id];
      return next === null ? null : { id: node.id, ...next };
    }
    return Array.isArray(node.children) ? { ...node, children: node.children.map(swap).filter((k) => k !== null) } : node;
  };
  let out;
  if (Array.isArray(ui?.components)) {
    const gone = new Set();
    const components = ui.components.map((c) => {
      if (c.id == null || !ids.has(String(c.id))) return c;
      seen.add(String(c.id));
      const next = overrides[c.id];
      if (next === null) { gone.add(String(c.id)); return null; }
      return { id: c.id, ...next };
    }).filter(Boolean).map((c) => (Array.isArray(c.children) ? { ...c, children: c.children.filter((k) => !gone.has(String(typeof k === 'object' ? k.id : k))) } : c));
    out = { ...ui, components };
  } else out = swap(ui);
  return { ui: out, unknown: [...ids].filter((id) => !seen.has(id)) };
}

// The states the page owes, from what it shows, what was asked and what the team wrote.
// ctx: prototype-context's view (components with role, purpose, guidelines; rules). → [{ state, why }]
const LISTY = /\b(list|table|grid|feed|gallery|results?|rows?|items?|cards?|lista|tabela|resultados)\b/i;
const FIELD = /\b(field|input|textbox|textarea|text ?area|select|dropdown|combobox|search|campo)\b/i;
export function statesOwed(ui, { context = null, request = null, catalog = { components: {} } } = {}) {
  const { nodes } = nodesOf(ui);
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const own = (n) => !!catalog.components?.[n.component] || !!context?.components?.[n.component];
  const about = (n) => { const k = context?.components?.[n.component]; return `${n.component} ${k?.role ?? ''} ${k?.purpose ?? ''}`; };
  const out = [];
  const owe = (state, why) => { if (!out.some((o) => o.state === state)) out.push({ state, why }); };
  // A list: a part that holds two or more of the same system component, or a component named or made for one.
  for (const n of nodes) {
    const kids = (n.children ?? []).map((k) => byId.get(typeof k === 'object' ? k.id : k)).filter(Boolean);
    const counts = new Map();
    for (const k of kids) if (own(k)) counts.set(k.component, (counts.get(k.component) ?? 0) + 1);
    const repeated = [...counts].find(([, c]) => c >= 2);
    if (repeated) { owe('empty', `it shows a list of ${repeated[0]}`); break; }
  }
  const listy = nodes.find((n) => own(n) && LISTY.test(about(n).replace(/([a-z])([A-Z])/g, '$1 $2')));
  if (listy) owe('empty', `it shows ${listy.component}, made for a list`);
  // Input: a field and something that sends it.
  const field = nodes.find((n) => own(n) && (/^(textbox|textinput|textfield|searchbox|combobox)$/i.test(context?.components?.[n.component]?.role ?? '') || FIELD.test(n.component.replace(/([a-z])([A-Z])/g, '$1 $2'))));
  const action = nodes.find((n) => own(n) && (/^button$/i.test(context?.components?.[n.component]?.role ?? '') || /button/i.test(n.component)));
  if (field && action) owe('error', `it takes input (${field.component}) and sends it (${action.component})`);
  // What the request names, and what the team's guidelines ask of this page or of a component it uses.
  for (const [kind, re] of STATE_KINDS) {
    if (kind === 'success') continue;   // a confirmation is a moment, owed only when asked for
    if (request && re.test(request) && /\bstates?\b|estado/i.test(request)) owe(kind, 'the request asks for it');
  }
  const used = new Set(nodes.map((n) => n.component));
  const texts = [...(context?.rules ?? []).map((r) => ({ text: r.text, from: `the guidelines (${r.title})` })),
    ...Object.entries(context?.components ?? {}).filter(([name]) => used.has(name)).flatMap(([name, k]) => [k.guidelines, ...(k.notes ?? []), ...(k.limitations ?? [])].filter(Boolean).map((t) => ({ text: t, from: `${name}'s guidelines` })))];
  for (const t of texts) {
    for (const sentence of String(t.text).split(/(?<=[.!?])\s+/)) {
      if (!/\b(states?|estados?)\b/i.test(sentence) || !/\b(every|each|all|always|must|need|needs|should|show|has|have|todo|toda|sempre|deve|mostra)\b/i.test(sentence)) continue;
      for (const [kind, re] of STATE_KINDS) if (kind !== 'success' && re.test(sentence)) owe(kind, `${t.from}: "${sentence.trim().slice(0, 140)}"`);
    }
  }
  return out;
}

// The owed states the composition does not give, as findings the reply owes.
export function stateFindings(owed, states) {
  const have = new Set(states.map((s) => kindOf(s.name) ?? s.name.toLowerCase()));
  return owed.filter((o) => !have.has(o.state)).map((o) => ({ rule: null, source: 'the page\'s states', level: 'warning', id: null, said: `state:${o.state}`, kind: 'state', state: o.state,
    message: `no ${o.state} state, and the page owes one (${o.why}): add it under "states", the parts that differ by their "id", or say why it needs none` }));
}
