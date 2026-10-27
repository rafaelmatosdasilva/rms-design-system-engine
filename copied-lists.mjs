// copied-lists.mjs - a list on an intent-layer page that copies what the engine already generates: a prop table copied
// from the code, a list of the system's components, a list of its tokens. Right today or not, it goes stale, and an
// agent takes it for the whole catalog. Each is flagged with the generated file to point to instead.
//
//   copiedLists(e, facts, { component, contractOf, tokensFile }) → [finding]   (finding: kind 'copy', as intent-truth's)
//
// A list is the rows of one table or one run of bullets. It is a copy when most of its rows name one kind of thing the
// system has, each once (a prop of the page's component, most of one token family, or eight components or more, a
// catalog's worth), and,
// for components and tokens, say nothing beyond the name: a table that says what each token is for, or when to choose each component, is guidance and kept.
// A prop table is a copy either way: its descriptions are the code's comments, and the contract carries them.

const norm = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
const MIN = 4, CATALOG = 8;
// Words a row of a copied table is made of, besides its names: types, defaults and the table's own words.
const PLAIN = new Set(['string', 'number', 'boolean', 'bool', 'object', 'array', 'function', 'any', 'true', 'false', 'null', 'undefined', 'default', 'optional', 'required', 'yes', 'no', 'type', 'prop', 'props', 'value', 'values', 'name', 'token', 'tokens', 'component', 'components', 'px', 'rem', 'em']);
const said = (row, names) => {
  let t = String(row).replace(/`[^`]*`/g, ' ').replace(/--[\w-]+/g, ' ').replace(/\b[\w-]+(\/[\w-]+)+/g, ' ');
  for (const n of names) t = t.split(n).join(' ');
  return t.toLowerCase().split(/[^a-z]+/).filter((w) => w.length > 2 && !PLAIN.has(w)).length >= 3;
};

// The rows of each table and each run of bullets in a text: [[row]].
export function listsIn(text) {
  const out = []; let cur = [], kind = null;
  const flush = () => { if (cur.length) out.push(cur); cur = []; kind = null; };
  for (const raw of String(text ?? '').split('\n')) {
    const l = raw.trim();
    const k = /^\|/.test(l) ? 'table' : /^([-*•]|\d+[.)])\s+/.test(l) ? 'bullets' : null;
    if (!k || (kind && k !== kind)) { flush(); if (!k) continue; }
    kind = k;
    if (k === 'table' && /^\|?\s*:?-{2,}/.test(l)) continue;   // the line under a table's head
    cur.push(k === 'table' ? l.replace(/^\||\|$/g, '').split('|').map((c) => c.trim()) : [l.replace(/^([-*•]|\d+[.)])\s+/, '')]);
  }
  flush();
  return out;
}

export function copiedLists(e, facts, { component = null, contractOf = () => null, tokensFile = 'tokens.json', tokenFileOf = () => null, catalog = 'the contracts' } = {}) {
  const props = component ? Object.keys(facts.components?.[component]?.props ?? {}) : [];
  const propSet = new Map(props.map((p) => [norm(p), p]));
  const tokens = new Set([...(facts.tokens ?? [])].map(norm));
  const out = [];
  const sections = [...(e.sections ?? []).map((s) => ({ where: s.title, text: String(s.text ?? '') }))];
  for (const { where, text } of sections) for (const rows of listsIn(text)) {
    const body = rows.length > 1 && rows[0].length > 1 && !rows[0].some((c) => propSet.has(norm(c.replace(/`/g, '')))) ? rows.slice(1) : rows;   // a table's head
    if (body.length < MIN) continue;
    const first = (r) => { const m = /`([^`]+)`/.exec(r.join(' ')); return (m ? m[1] : r[0]).replace(/[`*]/g, '').trim(); };
    const kinds = body.map((r) => { const n = first(r), k = norm(n.replace(/^:/, ''));
      return propSet.has(k) ? 'prop' : facts.comps?.has(k) ? 'component' : tokens.has(k) || tokens.has(norm('--' + n.replace(/\//g, '-'))) ? 'token' : null; });
    const top = ['prop', 'component', 'token'].map((k) => [k, kinds.filter((x) => x === k).length]).sort((a, b) => b[1] - a[1])[0];
    if (top[1] < MIN || top[1] < body.length * 0.6) continue;
    const of = body.filter((r, i) => kinds[i] === top[0]);
    // A sequence (the same name twice: a stack, an order) is a rule, not a copy; a few components picked out (which
    // ones behave so) are guidance; a catalog lists many, each once.
    if (new Set(of.map((r) => norm(first(r)))).size < of.length) continue;
    if (top[0] === 'component' && of.length < CATALOG) continue;
    // Tokens: a copy when it lists most of one family (every spacing/gap/*), not a few picked out with a rule.
    if (top[0] === 'token') {
      const css = of.map((r) => { const n = first(r); return n.startsWith('--') ? n : '--' + n.replace(/\//g, '-'); });
      let pre = css[0]; for (const c of css) while (!c.startsWith(pre)) pre = pre.slice(0, -1);
      pre = pre.slice(0, pre.lastIndexOf('-') + 1);
      const family = [...(facts.tokens ?? [])].filter((t) => pre.length > 3 && String(t).startsWith(pre));
      if (family.length < MIN || css.length < family.length * 0.8) continue;
    }
    if (top[0] !== 'prop' && of.filter((r) => said(r.join(' '), [first(r)])).length >= of.length * 0.5) continue;   // guidance, not a copy
    const contract = top[0] === 'prop' ? contractOf(component) : null;
    // The file its tokens come from, by their own entries in the layer, else the layer's tokens file.
    const from = top[0] === 'token' ? of.map((r) => tokenFileOf(first(r)) ?? tokenFileOf(first(r) + '/color')).find(Boolean) : null;
    const target = top[0] === 'prop' ? (contract ? `its contract (${contract})` : 'its contract') : top[0] === 'component' ? catalog : `the tokens file (${from ?? tokensFile})`;
    const what = top[0] === 'prop' ? `${of.length} of ${component}'s props` : `${of.length} ${top[0]}s`;
    out.push({ kind: 'copy', where, line: of.map(first).slice(0, 4).join(', ') + (of.length > 4 ? ', …' : ''), says: `a list of ${what}`, truth: `The engine generates this list${top[0] === 'prop' ? ' from the code' : ''}. A copy here goes out of date, and an agent takes it for the whole list.`, source: top[0] === 'prop' ? 'the code' : top[0] === 'component' ? 'Figma and the code' : 'Figma', fix: `Replace the list under ${where} with a link to ${target}.` });
  }
  return out;
}
