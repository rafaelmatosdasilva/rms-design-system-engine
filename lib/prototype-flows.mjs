// prototype-flows.mjs - prototypes linked into flows, held to the flows the team wrote down.
//
// A part that leads to another page carries "goesTo": "<prototype name>" (or "<name>#<state>" for one of its states);
// a click on it opens that page. `--prototype --flow` reads every prototype in prototypes/ and lists how they link:
// where a flow starts, each link, a page nothing leads to, and a page that leads nowhere. The team's flows are read
// from its guidelines and the design intent's flows layer, written as steps ("Cart → Shipping → Payment", or a
// numbered list under a heading that says flow or journey): a step with no page, and two steps in a row that do not
// link, are what the reply owes.
import { nodesOf } from './prototype-pieces.mjs';
import { wordsOf } from './prototype-context.mjs';
import { intentOf } from './product-conventions.mjs';

// Where a value of goesTo points: { page, state }.
export const targetOf = (v) => { const [page, state] = String(v ?? '').split('#'); return { page: page.trim(), state: state ? state.replace(/^state=/, '').trim() : null }; };

// The links one prototype makes: [{ from, to, state, id, label }].
export function linksOf(name, ui) {
  const out = [];
  for (const n of nodesOf(ui).nodes) {
    const v = n.props?.goesTo;
    if (typeof v !== 'string' || !v.trim()) continue;
    const t = targetOf(v);
    const label = [n.props.Label, n.props.label, n.props.text, n.props.Text].find((x) => typeof x === 'string' && x.trim()) ?? n.component;
    out.push({ from: name, to: t.page, state: t.state, id: n.id, label });
  }
  return out;
}

// pages: { name: ui } → { names, links, forward, starts, deadEnds, missing, order }. A link whose words go back (Back,
// Previous) is a way back, not a step: the flow's order, its start and its ends come from the links that go on.
export function flowGraph(pages) {
  const names = Object.keys(pages);
  const links = names.flatMap((n) => linksOf(n, pages[n]));
  const forward = links.filter((l) => intentOf(l.label) !== 'back');
  const to = new Set(forward.map((l) => l.to)), from = new Set(forward.map((l) => l.from));
  const linked = names.filter((n) => to.has(n) || from.has(n));
  const starts = linked.filter((n) => from.has(n) && !to.has(n));
  // Each page's place in the flow: steps from a start, along the links that go on.
  const order = {}; const queue = starts.map((n) => [n, 0]);
  while (queue.length) { const [n, d] = queue.shift(); if (n in order) continue; order[n] = d; for (const l of forward.filter((x) => x.from === n)) queue.push([l.to, d + 1]); }
  return {
    names, links, forward, starts, order,
    deadEnds: linked.filter((n) => to.has(n) && !from.has(n)),
    missing: [...new Set(links.filter((l) => !names.includes(l.to)).map((l) => l.to))],
  };
}

// The flows the team wrote: [{ name, steps, from }]. Steps joined by arrows on one line, or a numbered or bulleted list
// in a section whose title or first line says flow, journey or funnel.
const FLOWISH = /\b(flows?|journeys?|funnels?|fluxos?|jornadas?)\b/i;
const ARROW = /\s*(?:→|->|=>|›|>)\s*/;
export function teamFlows(rules = []) {
  const out = [];
  for (const r of rules) {
    const text = String(r.text ?? '');
    for (const line of text.split(/\r?\n/)) {
      const clean = line.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, '').trim();
      const head = clean.match(/^([^:]{2,60}):\s*(.+)$/);
      const body = head ? head[2] : clean;
      const steps = body.split(ARROW).map((s) => s.replace(/[.;]+$/, '').trim()).filter(Boolean);
      if (steps.length >= 2 && ARROW.test(body) && steps.every((s) => s.length <= 40)) out.push({ name: head ? head[1].trim() : r.title, steps, from: r.file ?? r.title });
    }
    if (!FLOWISH.test(`${r.title ?? ''} ${text.split(/\r?\n/)[0] ?? ''}`)) continue;
    // A list: each item a step, in order.
    const items = text.split(/\r?\n/).map((l) => l.match(/^\s*(?:\d+[.)]|[-*•])\s+(.+)$/)?.[1]?.trim()).filter(Boolean)
      .map((s) => s.split(/[:–—(]/)[0].replace(/[.;]+$/, '').trim()).filter((s) => s && s.length <= 40);
    if (items.length >= 2 && !out.some((f) => f.from === (r.file ?? r.title) && f.steps.join() === items.join())) out.push({ name: r.title, steps: items, from: r.file ?? r.title });
  }
  return out;
}

// The page a step names: the prototype whose name, heading or words share the most with it. → name or null
export function stepPage(step, pages) {
  const w = wordsOf(step);
  if (!w.length) return null;
  let best = null, score = 0;
  for (const [name, p] of Object.entries(pages)) {
    const nw = wordsOf(name.replace(/[-_]/g, ' ')), hw = wordsOf(p.heading ?? '');
    const s = w.filter((x) => nw.includes(x)).length * 3 + w.filter((x) => hw.includes(x)).length * 2;
    if (s > score) { best = name; score = s; }
  }
  return score >= 2 ? best : null;
}

// What the reply owes: a link to a page not drawn, a step of the team's flow with no page, two steps in a row that do
// not link. Pages: { name: { ui, heading } }. → [{ level, kind: 'flow', need, message }]
export function flowFindings(pages, flows = []) {
  const uis = Object.fromEntries(Object.entries(pages).map(([n, p]) => [n, p.ui]));
  const g = flowGraph(uis);
  const out = [];
  for (const m of g.missing) {
    const by = g.links.filter((l) => l.to === m).map((l) => `${l.from} ("${l.label}")`);
    out.push({ level: 'warning', kind: 'flow', need: `${m} page`, message: `${by.join(', ')} goes to "${m}", which is not drawn yet: draw prototypes/${m}.json, or the flow stops there` });
  }
  for (const f of flows) {
    const mapped = f.steps.map((s) => ({ step: s, page: stepPage(s, pages) }));
    for (const m of mapped) if (!m.page) out.push({ level: 'warning', kind: 'flow', need: `${m.step} step`, message: `the flow "${f.name}" (${f.from}) has a step "${m.step}" and no prototype for it: draw it, or say why the flow leaves it out` });
    for (let i = 0; i + 1 < mapped.length; i++) {
      const a = mapped[i], b = mapped[i + 1];
      if (!a.page || !b.page || a.page === b.page) continue;
      if (!g.links.some((l) => l.from === a.page && l.to === b.page)) out.push({ level: 'warning', kind: 'flow', need: `${a.step} to ${b.step}`, message: `the flow "${f.name}" goes from "${a.step}" to "${b.step}", and ${a.page} has nothing that leads to ${b.page}: give its action "goesTo": "${b.page}"` });
    }
  }
  return out;
}
