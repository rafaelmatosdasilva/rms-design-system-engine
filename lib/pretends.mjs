// pretends.mjs - what a prototype only pretends to do, said so nobody reads it as working or true.
//
// A prototype is meant to pretend: nothing is sent and the data is made up. What goes wrong is when that is not said.
// A form whose button shows "Saved" reads as a form that saves, and a page that says "12,400 teams" or quotes a
// customer reads as a page whose figures and quotes are real. Someone builds on it, or shows it to a client, and the
// number was the agent's. So the check says each of them, and the record beside the prototype keeps the list:
//   - a part that leads to a success (a state or a page called saved, done, confirmed) with nothing sent;
//   - a number, a quote or a logo on the page that the request never gave.
// Said, never failed: a prototype is allowed to pretend, as long as nobody is fooled by it.
//
//   pretendsOf(ui, { name, request, states, pages }) → [{ kind: 'success' | 'figure' | 'quote' | 'logo', id, text, message }]
//   pretendsFindings(list)                          → findings, as the prototype check gives them

import { nodesOf } from './prototype-pieces.mjs';
import { targetOf } from './prototype-flows.mjs';
import { kindOf } from './prototype-states.mjs';

// The words a part shows: its text options, and what a designed instance was given to show.
const TEXT_KEY = /^(text|label|title|heading|subtitle|caption|content|description|value|quote|body|message|helper|hint|placeholder|name)$/i;
const wordsOf = (p = {}) => Object.entries(p).flatMap(([k, v]) => (TEXT_KEY.test(k.replace(/[\s_-]/g, '')) ? (Array.isArray(v) ? v : [v]) : [])).filter((v) => typeof v === 'string' && v.trim());
const labelOf = (n) => wordsOf(n.props)[0] ?? n.component;

// A figure: money, a share, a count with separators or a k/M, a rating. A step number or a year is not one.
const FIGURES = [
  /[$€£¥]\s?\d[\d.,]*\s?[kKmMbB]?/g,
  /\b\d[\d.,]*\s?(?:€|EUR|USD|GBP)\b/g,
  /\b\d+(?:[.,]\d+)?\s?%/g,
  /\b\d{1,3}(?:[,.\s]\d{3})+\b/g,
  /\b\d+(?:[.,]\d+)?\s?[kKmM]\+?(?=\s|$)/g,
  /\b\d(?:[.,]\d)?\s?(?:★|stars?|\/\s?5)\b/g,
];
// A quote: words in quotation marks, long enough to be somebody's sentence.
const QUOTE = /[“"«]([^”"»]{24,})[”"»]/;
const LOGO = /\blogos?\b/i;

const norm = (s) => String(s ?? '').toLowerCase().replace(/\s+/g, ' ');
const digits = (s) => String(s).replace(/[^\d]/g, '');

// ui: the composition; request: what was asked for (the words the prototype was made from), when known; states: the
// composition's states ([{ name }]); pages: the other prototypes' names, for a part that leads to one.
export function pretendsOf(ui, { request = null, states = [], pages = [] } = {}) {
  const out = [];
  const asked = norm(request);
  const askedDigits = digits(request ?? '');
  const given = (x) => !!request && (asked.includes(norm(x)) || (digits(x).length >= 2 && askedDigits.includes(digits(x))));
  const add = (kind, n, text, message) => { if (!out.some((o) => o.kind === kind && o.text === text)) out.push({ kind, id: n.id ?? null, text, message }); };
  const unasked = request ? 'the request never gave it' : 'nothing says where it came from';
  for (const n of nodesOf(ui).nodes) {
    const p = n.props ?? {};
    // A success reached with nothing sent.
    if (typeof p.goesTo === 'string' && p.goesTo.trim()) {
      const t = targetOf(p.goesTo);
      const lands = (t.state && kindOf(t.state) === 'success') || (!t.state && kindOf(t.page) === 'success' && (pages.includes(t.page) || !pages.length));
      const own = !t.page && t.state && states.some((s) => s.name === t.state);
      if (lands || (own && kindOf(t.state) === 'success')) add('success', n, labelOf(n), `"${labelOf(n)}" shows ${t.state ? `the ${t.state} state` : `the ${t.page} page`} with nothing sent: the prototype only pretends it worked, so the handoff says so and nobody reads it as working`);
    }
    for (const w of wordsOf(p)) {
      for (const re of FIGURES) for (const m of w.matchAll(re)) {
        const f = m[0].trim();
        if (/^(19|20)\d{2}$/.test(digits(f)) && !/[%$€£¥kKmM]/.test(f)) continue;   // a year
        if (!given(f)) add('figure', n, f, `"${f}" (in ${n.component}) is a figure ${unasked}: a made-up number reads as a real one, so mark it as an example or use the real figure`);
      }
      const q = QUOTE.exec(w);
      if (q && !given(q[1].split(/\s+/).slice(0, 5).join(' '))) add('quote', n, q[1].slice(0, 60), `the quote "${q[1].slice(0, 50)}${q[1].length > 50 ? '…' : ''}" (in ${n.component}) is somebody's words ${unasked}: a made-up quote reads as a real customer's, so mark it as an example or use a real one`);
    }
    const logo = [p.need, p.standInFor, p.alt, p.src, ...wordsOf(p)].find((v) => typeof v === 'string' && LOGO.test(v));
    if (logo && !(request && LOGO.test(request))) add('logo', n, logo.slice(0, 60), `a logo (${n.component}: "${logo.slice(0, 40)}") ${unasked}: a company's mark on a page reads as that company's agreement, so leave it out or use one you were given`);
  }
  return out;
}

export const pretendsFindings = (list = []) => list.map((p) => ({ rule: null, source: 'what the prototype pretends', level: 'warning', id: p.id, kind: 'pretends', need: `${p.kind} ${p.text}`, message: p.message }));
