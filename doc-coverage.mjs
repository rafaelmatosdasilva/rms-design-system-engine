// doc-coverage.mjs - what an agent cannot learn about each component from its documentation, without asking one: each
// prop, event and slot no comment and no intent layer line names, each list whose items no comment describes, each field
// the product's code gives that no comment lists, and a component with no page, no purpose or no example.
//
//   docCoverage(page, context) → { components: { name: { missing: [{ kind, what, why, write }], said, total } }, totals }
//
// Pure. page: page-check.mjs pageSystem (with .uses); context: its pageContext (the intent layer, read without Figma).

import { itemsOf } from './prop-shapes.mjs';

const words = (t) => new Set(String(t ?? '').toLowerCase().match(/[a-z_$][\w$:-]*/g) ?? []);
// What to write, and where, as one plain sentence a person can follow.
export const WRITE = {
  prop: 'Describe each one in its code comment, with @name, its {Type} and what it does.',
  event: 'Say when each one is sent and what it carries, in its code comment or on its intent layer page.',
  slot: 'Say what goes in each one, in its code comment or on its intent layer page.',
  fields: 'In the prop\'s code comment, add a line for each field with its {Type} and what it holds.',
  field: 'Add each one to the prop\'s code comment.',
  page: 'Write its page in the intent layer.',
  purpose: 'Say what it is for on its intent layer page.',
  example: 'Add an example of it in use to its intent layer page. The engine can write one from the product\'s own code.',
  values: 'Say what each allowed value means, in its code comment or on its intent layer page, not only that it is allowed.',
  keyboard: 'Say what Tab, Enter, Space, Escape and the arrow keys do in it, on its intent layer page.',
  apart: 'Say what each one is for on both intent layer pages, in words the other page does not use.',
  overflow: 'Say what it does when its content does not fit (it scrolls, wraps, is cut with an ellipsis or grows, and up to what size), on its intent layer page.',
  oneAction: 'Say what it shows with one action only (which button stays, how wide and where), on its intent layer page.',
};

// What the keyboard behaviour of a component is said with. An agent asked "what does Enter do here?" finds nothing
// in a page that never names a key, and then writes the behaviour it guesses.
const KEYS = /\b(tab|shift ?\+ ?tab|enter|return|space(bar)?|escape|esc|arrow|up and down|left and right|home|end|page ?up|page ?down|keyboard|focus(es|ed)? (moves|returns|goes))\b/i;
// A component whose keyboard behaviour is the browser's own: nothing to write, and asking for it would be noise.
const NO_KEYS = /^(icon|image|img|avatar|badge|chip|tag|divider|separator|spacer|skeleton|spinner|progress|text|heading|title|label|caption|logo|illustration|thumbnail|surface|card)/i;
// The edges a screen meets first and a page rarely says: content that does not fit, and one action where there are two.
const FITS = /\b(scroll(s|ing|able)?|overflow(s)?|truncat\w*|ellipsis|wraps?|wrapping|max(imum)?[- ]?(height|width|lines?)|line[- ]clamp|clamp(ed)?|does ?n[o']t fit|too long|long (text|content|labels?|titles?)|grows?|expands? to fit)\b/i;
const ONE = /\b(one|single|only one|a lone|just one) (button|action|cta)s?\b|\bone[- ]button\b|\bwithout (a |the )?(secondary|second|left|cancel) (button|action)\b/i;
// Props that each give a button or an action of its own (buttonPrimaryLabel, secondaryAction, leftButtonParams).
const ACTION = /(button|action|cta)/i;
// Two components an agent will confuse: names alike to the eye, as a reader skimming a list sees them.
const alike = (a, b) => {
  const x = a.toLowerCase().replace(/[^a-z0-9]/g, ''), y = b.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (x === y) return false;
  return x.startsWith(y) || y.startsWith(x) || (Math.abs(x.length - y.length) <= 2 && [...x].filter((ch, i) => ch !== y[i]).length <= 2);
};

export function docCoverage(page, context = null) {
  const components = {};
  let said = 0, total = 0;
  for (const [name, c] of Object.entries(page.components ?? {})) {
    const k = context?.components?.[name], il = k?.intentLayer;
    const ilWords = words([k?.purpose, k?.guidelines, ...(il ? [il.purpose, ...il.whenToUse, ...il.whenNotToUse, ...il.mistakes, ...il.limitations, ...il.rules, ...(il.examples ?? [])] : [])].join(' '));
    const cw = new Set(c.commentWords ?? []);
    const named = (x) => cw.has(String(x).toLowerCase()) || ilWords.has(String(x).toLowerCase());
    // What its generated definitions say of it (an event, a prop, a slot), when they say more than its name.
    const defines = (kind, x) => (il?.defined?.[kind] ?? []).some((d) => d.said && [d.term, d.codeTerm].filter(Boolean).some((t) => t.toLowerCase() === String(x).toLowerCase()));
    const missing = [];
    // Counted as they are asked, not re-derived afterwards: a new kind of question would otherwise be missing
    // from a component's score while counting against it.
    let asked = 0;
    const check = (ok, item) => { total++; asked++; if (ok) said++; else missing.push({ ...item, write: WRITE[item.kind] }); };
    check(!!il, { kind: 'page', what: name, why: 'it has no page in the intent layer' });
    if (il) {
      check(!!(k.purpose || il.purpose), { kind: 'purpose', what: name, why: 'its page does not say what it is for' });
      check(!!(il.examples ?? []).length, { kind: 'example', what: name, why: 'its page shows no example of it in use' });
    }
    for (const [p, d] of Object.entries(c.props ?? {})) {
      check(!!d.description || named(p) || defines('props', p), { kind: 'prop', what: p, why: `nothing says what ${p} does` });
      const listy = /array|object/.test(String(d.type ?? '').toLowerCase());
      if (listy) check(!!c.fields?.[p], { kind: 'fields', what: p, why: `nothing says what ${p} holds` });
      // A field the product's own code gives that no comment lists.
      const real = page.uses?.[`${name}\u0000${p}`];
      if (real && c.fields?.[p]) {
        const given = new Set(real.values.flatMap((v) => itemsOf(v)).flatMap((x) => Object.keys(x)));
        for (const f of given) check(f in c.fields[p], { kind: 'field', what: `${p}.${f}`, why: `the product gives ${p} a "${f}" no comment lists` });
      }
    }
    // An allowed value an agent can choose but nothing explains: it knows size takes s, m and l, and not which to
    // pick. Asked only where there is a choice to make and a page to make it on.
    if (il) for (const [p, d] of Object.entries(c.props ?? {})) {
      const values = Array.isArray(d.options) ? d.options : Array.isArray(d.values) ? d.values : [];
      if (values.length < 2) continue;
      check(values.some((v) => named(v)) || defines('props', p), { kind: 'values', what: `${p} (${values.slice(0, 4).join(', ')}${values.length > 4 ? '…' : ''})`, why: `nothing says which of ${p}'s values to choose` });
    }
    // What the keyboard does in it. An agent writing a page meets this question and, finding no answer, invents one.
    if (il && !NO_KEYS.test(name)) {
      const text = [k?.purpose, k?.guidelines, il.purpose, ...(il.whenToUse ?? []), ...(il.rules ?? []), ...(il.limitations ?? []), ...(il.mistakes ?? [])].join(' ');
      check(KEYS.test(text) || KEYS.test([...(c.commentWords ?? [])].join(' ')), { kind: 'keyboard', what: name, why: `nothing says what the keyboard does in ${name}` });
    }
    // What it does when its content does not fit: asked where it holds content (a slot, a longer text, a list).
    if (il) {
      const text = [k?.purpose, k?.guidelines, il.purpose, ...(il.whenToUse ?? []), ...(il.whenNotToUse ?? []), ...(il.rules ?? []), ...(il.limitations ?? []), ...(il.mistakes ?? [])].join(' ');
      const holds = (c.slots?.named ?? []).length || c.slots?.default || Object.entries(c.props ?? {}).some(([p, d]) => /description|content|message|body|items|list|rows|options/i.test(p) || /array/i.test(String(d?.type ?? '')));
      if (holds) check(FITS.test(text) || FITS.test([...(c.commentWords ?? [])].join(' ')), { kind: 'overflow', what: name, why: `nothing says what ${name} does when its content does not fit` });
      // One action where it takes two or more: which stays, how wide, where.
      const actions = Object.keys(c.props ?? {}).filter((p) => ACTION.test(p));
      if (actions.length >= 2) check(ONE.test(text), { kind: 'oneAction', what: name, why: `nothing says what ${name} shows with one action only` });
    }
    for (const e of c.events ?? []) check(named(e) || defines('events', e), { kind: 'event', what: e, why: `nothing says when ${e} is sent or what it carries` });
    for (const sl of c.slots?.named ?? []) check(named(sl) || defines('slots', sl), { kind: 'slot', what: sl, why: `nothing says what goes in the ${sl} slot` });
    components[name] = { missing, asked, said: 0, total: 0 };
  }
  // Two components whose names look alike, whose pages say nothing that tells them apart: asked once, against both.
  // This is the question an agent gets wrong silently — it picks the one it saw first and nothing ever says it chose
  // the wrong one. A pair where at least one page uses a word the other does not is answered; where neither does, it
  // is a gap belonging to both.
  const names = Object.keys(components);
  const purposeOf = (n) => {
    const k = context?.components?.[n], il = k?.intentLayer;
    return words([k?.purpose, il?.purpose, ...(il?.whenToUse ?? [])].join(' '));
  };
  for (let i = 0; i < names.length; i++) for (let j = i + 1; j < names.length; j++) {
    if (!alike(names[i], names[j])) continue;
    const a = purposeOf(names[i]), b = purposeOf(names[j]);
    const apart = [...a].some((w) => !b.has(w)) && [...b].some((w) => !a.has(w));
    total++;
    // Asked of both, so neither reads as fully documented while the pair is indistinguishable.
    for (const n of [names[i], names[j]]) components[n].asked++;
    if (apart) { said++; continue; }
    for (const n of [names[i], names[j]]) components[n].missing.push({ kind: 'apart', what: `${names[i]} and ${names[j]}`, why: `nothing tells ${names[i]} and ${names[j]} apart: an agent picks whichever it saw first`, write: WRITE.apart });
  }
  // Each component's own counts.
  for (const [name, c] of Object.entries(components)) {
    c.total = c.asked; c.said = Math.max(0, c.asked - c.missing.length);
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
    const LABEL = { overflow: 'nothing on content that does not fit', oneAction: 'nothing on one action only', prop: 'props', event: 'events', slot: 'slots', fields: 'lists with nothing on what they hold', field: 'fields the product gives', values: 'values nothing helps choose between', apart: 'nothing tells these apart' };
    out.push(`  ${name}: ${Object.entries(by).map(([k, v]) => (LABEL[k] ? `${LABEL[k]}${v.every((x) => x === name) ? '' : ` ${v.slice(0, 6).join(', ')}${v.length > 6 ? ` +${v.length - 6}` : ''}`}` : `no ${k}`)).join(' · ')}`);
  }
  if (list.length > top) out.push(`  … and ${list.length - top} more (the Documentation page lists each)`);
  return out;
}
