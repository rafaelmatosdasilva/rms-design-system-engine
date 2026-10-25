// doc-coverage.mjs - what an agent cannot learn about each component from its documentation, without asking one: each
// prop, event and slot no comment and no intent layer line names, each list whose items no comment describes, each field
// the product's code gives that no comment lists, and a component with no page, no purpose or no example.
//
//   docCoverage(page, context) → { components: { name: { missing: [{ kind, what, why, write }], said, total } }, totals }
//
// Pure. page: page-check.mjs pageSystem (with .uses); context: its pageContext (the intent layer, read without Figma).

import { itemsOf } from './prop-shapes.mjs';

const words = (t) => new Set(String(t ?? '').toLowerCase().match(/[a-z_$][\w$:-]*/g) ?? []);
const WRITE = {
  prop: 'in its code comment (@name {Type} what it does)', event: 'in its code comment or its intent layer page: when it is sent and what it carries',
  slot: 'in its code comment or its intent layer page: what goes in it', fields: 'in its code comment, under the prop (- field {Type} what it holds)',
  field: 'in its code comment, under the prop', page: 'its page in the intent layer', purpose: 'its page in the intent layer: what it is for',
  example: 'its page in the intent layer: an example of it in use (the engine writes one from the product\'s own code)',
};

export function docCoverage(page, context = null) {
  const components = {};
  let said = 0, total = 0;
  for (const [name, c] of Object.entries(page.components ?? {})) {
    const k = context?.components?.[name], il = k?.intentLayer;
    const ilWords = words([k?.purpose, k?.guidelines, ...(il ? [il.purpose, ...il.whenToUse, ...il.whenNotToUse, ...il.mistakes, ...il.limitations, ...il.rules, ...(il.examples ?? [])] : [])].join(' '));
    const cw = new Set(c.commentWords ?? []);
    const named = (x) => cw.has(String(x).toLowerCase()) || ilWords.has(String(x).toLowerCase());
    const missing = [];
    const check = (ok, item) => { total++; if (ok) said++; else missing.push({ ...item, write: WRITE[item.kind] }); };
    check(!!il, { kind: 'page', what: name, why: 'it has no page in the intent layer' });
    if (il) {
      check(!!(k.purpose || il.purpose), { kind: 'purpose', what: name, why: 'its page does not say what it is for' });
      check(!!(il.examples ?? []).length, { kind: 'example', what: name, why: 'its page shows no example of it in use' });
    }
    for (const [p, d] of Object.entries(c.props ?? {})) {
      check(!!d.description || named(p), { kind: 'prop', what: p, why: `nothing says what ${p} does` });
      const listy = /array|object/.test(String(d.type ?? '').toLowerCase());
      if (listy) check(!!c.fields?.[p], { kind: 'fields', what: p, why: `nothing says what ${p} holds` });
      // A field the product's own code gives that no comment lists.
      const real = page.uses?.[`${name}\u0000${p}`];
      if (real && c.fields?.[p]) {
        const given = new Set(real.values.flatMap((v) => itemsOf(v)).flatMap((x) => Object.keys(x)));
        for (const f of given) check(f in c.fields[p], { kind: 'field', what: `${p}.${f}`, why: `the product gives ${p} a "${f}" no comment lists` });
      }
    }
    for (const e of c.events ?? []) check(named(e), { kind: 'event', what: e, why: `nothing says when ${e} is sent or what it carries` });
    for (const sl of c.slots?.named ?? []) check(named(sl), { kind: 'slot', what: sl, why: `nothing says what goes in the ${sl} slot` });
    components[name] = { missing, said: 0, total: 0 };
  }
  // Each component's own counts.
  for (const [name, c] of Object.entries(components)) {
    const all = c.missing.length;
    const comp = page.components[name];
    const asked = 1 + (context?.components?.[name]?.intentLayer ? 2 : 0) + Object.keys(comp.props ?? {}).length + Object.values(comp.props ?? {}).filter((d) => /array|object/.test(String(d.type ?? '').toLowerCase())).length + (comp.events ?? []).length + (comp.slots?.named ?? []).length;
    c.total = asked; c.said = Math.max(0, asked - all);
  }
  return { components, totals: { said, total, missing: total - said } };
}

// The lines a report prints: the components with the most left unsaid first. → lines
export function coverageLines(cov, { top = 25 } = {}) {
  const list = Object.entries(cov.components).filter(([, c]) => c.missing.length).sort((a, b) => b[1].missing.length - a[1].missing.length);
  const out = [`What an agent cannot learn from the documentation: ${cov.totals.missing} of ${cov.totals.total} things unsaid, in ${list.length} component${list.length === 1 ? '' : 's'}.`];
  for (const [name, c] of list.slice(0, top)) {
    const by = {};
    for (const m of c.missing) (by[m.kind] = by[m.kind] ?? []).push(m.what);
    const LABEL = { prop: 'props', event: 'events', slot: 'slots', fields: 'lists with nothing on what they hold', field: 'fields the product gives' };
    out.push(`  ${name}: ${Object.entries(by).map(([k, v]) => (LABEL[k] ? `${LABEL[k]} ${v.slice(0, 6).join(', ')}${v.length > 6 ? ` +${v.length - 6}` : ''}` : `no ${k}`)).join(' · ')}`);
  }
  if (list.length > top) out.push(`  … and ${list.length - top} more (the Documentation page lists each)`);
  return out;
}
