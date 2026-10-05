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

// A part in a state: null leaves it out; one that names its component replaces it; one that does not changes it, its
// props over the part's own ({ "props": { "Error": "True" } } keeps the field and sets its Error).
function merged(node, next) {
  if (next === null) return null;
  if (next.component) return { id: node.id, ...next };
  return { ...node, ...next, id: node.id, props: { ...(node.props ?? {}), ...(next.props ?? {}) } };
}

// A value written as the person would say it, read as the system writes it: an option in another case ("false" for
// False), true or false for an option of False and True, "true" or "false" for a boolean. Every part, in every state.
// → the notes on what was read, ["button.Disabled false read as False"]
export function normaliseValues(raw, catalog = { components: {} }) {
  const notes = [];
  const seen = new WeakSet();
  // A state's part that names no component is the part of that id: its component, read from the page.
  const byId = new Map();
  (function ids(o) { if (!o || typeof o !== 'object') return; if (Array.isArray(o)) { o.forEach(ids); return; } if (o.id != null && typeof o.component === 'string') byId.set(String(o.id), o.component); for (const v of Object.values(o)) ids(v); })(raw);
  const walk = (o, key = null) => {
    if (!o || typeof o !== 'object' || seen.has(o)) return;
    seen.add(o);
    if (Array.isArray(o)) { o.forEach((x) => walk(x)); return; }
    const name = typeof o.component === 'string' ? o.component : key != null && o.props ? byId.get(String(key)) : null;
    const def = name ? catalog.components?.[name] : null;
    if (def && o.props && typeof o.props === 'object') {
      for (const [k, v] of Object.entries(o.props)) {
        const p = def.props?.[k] ?? Object.entries(def.props ?? {}).find(([, e]) => e.codeName === k)?.[1];
        if (!p) continue;
        const allowed = k === p.codeName && p.codeValues ? p.codeValues : p.values;
        if (p.type === 'enum' && Array.isArray(allowed) && !allowed.includes(v) && (typeof v === 'string' || typeof v === 'boolean')) {
          const hit = allowed.find((a) => String(a).toLowerCase() === String(v).toLowerCase());
          if (hit !== undefined) { o.props[k] = hit; notes.push(`${name}.${k} ${JSON.stringify(v)} read as ${JSON.stringify(hit)}`); }
        } else if (p.type === 'boolean' && typeof v === 'string' && /^(true|false)$/i.test(v)) { o.props[k] = /^true$/i.test(v); notes.push(`${name}.${k} ${JSON.stringify(v)} read as ${o.props[k]}`); }
      }
    }
    for (const [k, v] of Object.entries(o)) walk(v, k);
  };
  walk(raw);
  return notes;
}

// The composition in one state: each part named replaced (null leaves it out). Works on either form. → { ui, unknown }
export function applyState(ui, overrides = {}) {
  const ids = new Set(Object.keys(overrides));
  const seen = new Set();
  const swap = (node) => {
    if (!node || typeof node !== 'object') return node;
    if (node.id != null && ids.has(String(node.id))) {
      seen.add(String(node.id));
      return merged(node, overrides[node.id]);
    }
    return Array.isArray(node.children) ? { ...node, children: node.children.map(swap).filter((k) => k !== null) } : node;
  };
  let out;
  if (Array.isArray(ui?.components)) {
    const gone = new Set();
    const components = ui.components.map((c) => {
      if (c.id == null || !ids.has(String(c.id))) return c;
      seen.add(String(c.id));
      const next = merged(c, overrides[c.id]);
      if (next === null) gone.add(String(c.id));
      return next;
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
  // A list: a part that holds two or more of the same system component, or of the same arrangement (a row each with a
  // name and a tag), or a component named or made for one. Fields, buttons and switches side by side are a form or a set
  // of choices, not a list: a page shows them whatever the data.
  const control = (n) => { const role = context?.components?.[n.component]?.role ?? ''; return /^(textbox|searchbox|combobox|button|togglebutton|checkbox|radio|switch|spinbutton|slider|tab)$/i.test(role) || FIELD.test(n.component.replace(/([a-z])([A-Z])/g, '$1 $2')) || /button|switch|toggle|checkbox|radio|chip/i.test(n.component); };
  const kidsOf = (n) => (n.children ?? []).map((k) => byId.get(typeof k === 'object' ? k.id : k)).filter(Boolean);
  const shape = (n) => `${n.component}(${kidsOf(n).map(shape).join(',')})`;
  const holdsContent = (n) => kidsOf(n).some((k) => (own(k) && !control(k)) || k.component === 'Text' || holdsContent(k));
  for (const n of nodes) {
    const kids = kidsOf(n);
    const counts = new Map();
    for (const k of kids) if (own(k) && !control(k)) counts.set(k.component, (counts.get(k.component) ?? 0) + 1);
    const repeated = [...counts].find(([, c]) => c >= 2);
    if (repeated) { owe('empty', `it shows a list of ${repeated[0]}`); break; }
    const shapes = new Map();
    for (const k of kids) if (!own(k) && (k.children ?? []).length && holdsContent(k)) shapes.set(shape(k), (shapes.get(shape(k)) ?? 0) + 1);
    const alike = [...shapes].find(([, c]) => c >= 2);
    if (alike) { owe('empty', `it shows a list: ${alike[1]} ${alike[0].split('(')[0]}s alike${n.id ? ` in ${n.id}` : ''}`); break; }
  }
  if (request && /\b(list|lists|table|feed|inbox|results|catalog(ue)?|gallery|history|lista|tabela)\b/i.test(request)) owe('empty', 'the request asks for a list');
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
