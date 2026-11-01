// family-consistency.mjs - components of one type built the same way.
//
// A system whose buttons take "disabled" as a property of its own on some and as an option of "state" on others, or
// call the same text "labelContent" on one and "Label" on another, makes every person and agent guess which way this
// button goes. This compares the components of one type with each other in Figma (not with the code): the type is the
// first word of their names (buttonPrimary, buttonSecondary and buttonGhost are buttons), a type of three components
// or more. For each type:
//   - shape: a state (disabled, selected, error...) that is a property of its own on some and an option of a "state"
//     property on others: the way most of them do it wins;
//   - name: one thing (the same words, once "content", "text" and the like are set aside, and the same kind of
//     property) called differently: the name most of them use wins;
//   - missing: a property at least two thirds of them have (four or more of them), one lacks: to check, since a
//     component may leave it out on purpose.
// Each finding names the way the others do it; keeping it as it is, as a known exception, is always an option.
//
//   import { familyFindings, familyLine } from './family-consistency.mjs'
//   familyFindings({ buttonPrimary: { properties: { disabled: { type: 'VARIANT', variantOptions: ['false', 'true'] } } }, ... })
//   → [{ component, family, kind: 'shape' | 'name' | 'missing', name, want, why }]
import { wordsOf } from './naming-consistency.mjs';

// States a component can carry as a property of its own (true or false) or as an option of a state property.
const STATES = ['disabled', 'selected', 'error', 'loading', 'active', 'checked', 'readonly', 'focused', 'pressed', 'current', 'validated', 'filled'];
// Words that say how a property holds a thing, not what it is: labelContent and Label are both the label.
const HOLDS = new Set(['content', 'text', 'value', 'string', 'is', 'has']);
const STATE_PROP = /^(state|status|states)$/i;

const clean = (n) => String(n ?? '').replace(/#[\d:]+$/, '').trim();
const isOnOff = (d) => d?.type === 'BOOLEAN' || (d?.type === 'VARIANT' && (d.variantOptions ?? []).length > 0 && (d.variantOptions ?? []).every((o) => /^(true|false|on|off|yes|no)$/i.test(String(o))));
const kindOf = (d) => (isOnOff(d) ? 'onoff' : d?.type === 'VARIANT' ? 'variant' : String(d?.type ?? '').toLowerCase());
const conceptOf = (name) => wordsOf(name).filter((w) => !HOLDS.has(w)).join(' ');
const plural = (w) => (/(s|x|ch|sh)$/.test(w) ? w + 'es' : w + 's');

export function familiesOf(snapshot = {}) {
  const comps = Object.entries(snapshot.components ?? snapshot)
    .filter(([n, v]) => !/^[._]/.test(n) && !n.includes('/') && v && typeof v === 'object' && (v.properties || v.props));
  const by = new Map();
  for (const [n, v] of comps) {
    const w = wordsOf(n);
    if (w.length < 2) continue;   // "button" alone names the type, not one of its kinds
    if (!by.has(w[0])) by.set(w[0], []);
    by.get(w[0]).push({ name: n, words: w, props: Object.entries(v.properties ?? v.props ?? {}).map(([k, d]) => ({ name: clean(k), def: d ?? {} })) });
  }
  // A type named in two words when every one of them starts so (menuItemPlain, menuItemPrice: menuItem).
  return [...by].filter(([, list]) => list.length >= 3).map(([first, list]) => {
    const two = list.every((c) => c.words.length > 2 && c.words[1] === list[0].words[1]);
    return { family: two ? first + list[0].words[1][0].toUpperCase() + list[0].words[1].slice(1) : first, list };
  });
}

export function familyFindings(snapshot = {}) {
  const out = [];
  for (const { family, list } of familiesOf(snapshot)) {
    const many = plural(family);
    // Shape: a state as a property of its own, or as an option of a state property.
    for (const st of STATES) {
      const own = [], inState = [];
      for (const c of list) {
        const p = c.props.find((x) => wordsOf(x.name).filter((w) => w !== 'is').join('') === st && isOnOff(x.def));
        const s = c.props.find((x) => STATE_PROP.test(x.name) && (x.def.variantOptions ?? []).some((o) => String(o).toLowerCase() === st));
        if (p) own.push({ c, p }); else if (s) inState.push({ c, s });
      }
      if (!own.length || !inState.length || own.length === inState.length) continue;   // as many each way: no way most of them use
      const ownWins = own.length > inState.length;
      const theirs = ownWins ? 'a property of its own (on or off)' : `an option of ${inState[0].s.name}`;
      const why = `${ownWins ? own.length : inState.length} of the ${own.length + inState.length} ${many} with a ${st} state make it ${theirs}`;
      for (const x of ownWins ? inState : own) out.push({ component: x.c.name, family, kind: 'shape', name: st, want: ownWins ? `make ${st} a property of its own (on or off)` : `make ${st} an option of ${inState[0].s.name}`, why });
    }
    // Name: one thing, of one kind, called differently.
    const named = new Map();   // concept|kind → Map(name → [components])
    for (const c of list) for (const p of c.props) {
      const concept = conceptOf(p.name); if (!concept) continue;
      const key = concept + '|' + kindOf(p.def);
      if (!named.has(key)) named.set(key, new Map());
      const m = named.get(key); if (!m.has(p.name)) m.set(p.name, []); m.get(p.name).push(c.name);
    }
    for (const m of named.values()) {
      if (m.size < 2) continue;
      const ranked = [...m].sort((a, b) => b[1].length - a[1].length);
      const [top, users] = ranked[0];
      if (users.length === ranked[1][1].length) continue;   // no way most of them use: nothing to follow
      for (const [n, comps] of ranked.slice(1)) for (const comp of comps) out.push({ component: comp, family, kind: 'name', name: n, want: `call it "${top}"`, why: `${users.length} of the ${many} call it "${top}"` });
    }
    // Missing: what most of them have.
    if (list.length >= 4) {
      const has = new Map();   // concept|kind → { name, comps:Set }
      for (const c of list) for (const p of c.props) {
        if (p.def.type === 'TEXT' || p.def.type === 'INSTANCE_SWAP' || STATE_PROP.test(p.name)) continue;   // its words and icons are its own
        const key = conceptOf(p.name) + '|' + kindOf(p.def);
        if (!has.has(key)) has.set(key, { name: p.name, comps: new Set() });
        has.get(key).comps.add(c.name);
      }
      // A state another one carries as an option of its state property is there too (shaped otherwise: that is a shape finding).
      for (const [key, v] of has) {
        const concept = key.split('|')[0];
        if (STATES.includes(concept.replace(/ /g, ''))) for (const c of list) if (c.props.some((x) => STATE_PROP.test(x.name) && (x.def.variantOptions ?? []).some((o) => String(o).toLowerCase() === concept.replace(/ /g, '')))) v.comps.add(c.name);
      }
      for (const { name, comps } of has.values()) {
        if (comps.size * 3 < list.length * 2 || comps.size === list.length) continue;
        for (const c of list) if (!comps.has(c.name)) out.push({ component: c.name, family, kind: 'missing', name, want: `check whether it needs ${name}`, why: `${comps.size} of the ${list.length} ${many} have ${name}` });
      }
    }
  }
  return out;
}

// The line the audit prints for each, under the props check: a decision the Figma file owns.
export function familyLine(f) {
  const what = f.kind === 'shape' ? `its ${f.name} state is built differently` : f.kind === 'name' ? `its property "${f.name}" is named differently` : `it has no ${f.name}`;
  return `${f.component} is built differently from the other ${f.family} components: ${what} (${f.why}); ${f.want}, or keep it as a known exception`;
}
