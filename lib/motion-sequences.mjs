// motion-sequences.mjs - a motion of several parts, kept as tokens, against the code's.
//
// One component's opening is often several parts moving in turn: its backdrop fades in, then its card rises, each with
// its own duration, curve and delay. Each part's motion is compared alone elsewhere (motion-components.mjs); how the
// parts move together, in what order and how long after each other, was left to whoever wrote the code. A team that
// keeps the sequence as tokens says it once, and the code is held to it here, part by part, with the form it takes for
// someone who asks for less motion.
//
// The tokens are the system's motion variables (the vars snapshot's motion map), named by the component, the motion,
// the part and what each says:
//   modal/open/backdrop/duration   200ms      modal/open/card/duration   240ms
//   modal/open/backdrop/easing     ease-out   modal/open/card/delay      80ms
//   modal/open/reduced/card/duration  0ms     (the reduced form: no motion, or a shorter one)
// A prefix before the component (motion/, motion/sequence/) is read too. The motion is open or close.
//
//   sequencesOf(motion)                          → { [component]: { open|close: { parts, reduced } } }
//   sequenceFindings(motion, sources, classFor)  → [{ component, motion, part, what, message, at }]
import { codeMotions, componentTransitions } from './motion-components.mjs';

const PROPS = { duration: 'ms', delay: 'delay', easing: 'easing', curve: 'easing', 'timing-function': 'easing' };
const ms = (v) => {
  if (typeof v === 'number') return v;
  const m = /^\s*(-?[\d.]+)\s*(ms|s)?\s*$/i.exec(String(v ?? ''));
  return m ? Math.round(parseFloat(m[1]) * (m[2]?.toLowerCase() === 's' ? 1000 : 1)) : null;
};
const ease = (v) => String(v ?? '').trim().toLowerCase().replace(/\s+/g, '');

export function sequencesOf(motion = {}) {
  const out = {};
  for (const [name, value] of Object.entries(motion ?? {})) {
    const seg = String(name).split('/').filter(Boolean);
    const prop = PROPS[String(seg.at(-1)).toLowerCase()];
    if (!prop || seg.length < 4) continue;
    const reduced = String(seg.at(-3)).toLowerCase() === 'reduced';
    const at = reduced ? seg.length - 4 : seg.length - 3;   // where open|close sits
    const kind = String(seg[at] ?? '').toLowerCase();
    if (!['open', 'close'].includes(kind) || at < 1) continue;
    const component = seg[at - 1], part = seg.at(-2);
    const m = ((out[component] ??= {})[kind] ??= { parts: {}, reduced: null });
    const into = reduced ? (m.reduced ??= {}) : m.parts;
    const p = (into[part] ??= {});
    p[prop] = prop === 'easing' ? String(value) : ms(value);
  }
  return out;
}

const kebab = (x) => String(x).replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

// sources: [{ file, text }]; classFor(name): the component's class.
const reEscape = (s) => String(s ?? '').replace(/[\\^$.*+?()[\]{}|/-]/g, '\\$&');

export function sequenceFindings(motion = {}, sources = [], classFor = () => null) {
  const out = [];
  for (const [component, kinds] of Object.entries(sequencesOf(motion))) {
    const cls = String(classFor(component) ?? '').replace(/^\./, '');
    if (!cls) continue;
    const moves = codeMotions(sources, cls);
    const calm = componentTransitions(sources, cls);
    const short = (part) => (part ? String(part).replace(new RegExp(`^${reEscape(cls)}(?:-|__)`), '') : null);
    for (const [kind, seq] of Object.entries(kinds)) {
      const code = moves.filter((m) => m.motion === kind);
      const names = Object.keys(seq.parts);
      // A part the code moves under its own name; of the parts no class names, the one that starts first (a backdrop
      // before its card) is the component's own element.
      const own = code.filter((m) => !m.part);
      const unnamed = names.filter((n) => !code.some((m) => m.part && kebab(short(m.part)) === kebab(n)))
        .sort((a, b) => (seq.parts[a].delay ?? 0) - (seq.parts[b].delay ?? 0));
      const find = (n) => code.find((m) => m.part && kebab(short(m.part)) === kebab(n)) ?? (unnamed[0] === n ? own[0] : null);
      const add = (part, what, message, at = null) => out.push({ component, motion: kind, part, what, message: `${component} ${kind}s, ${part}: ${message}`, at });
      for (const part of names) {
        const t = seq.parts[part], k = find(part);
        if (!k) { add(part, 'missing', `the tokens move it${t.ms != null ? ` in ${t.ms}ms` : ''}${t.delay ? ` after ${t.delay}ms` : ''}, and the code does not move it when the ${component} ${kind}s`); continue; }
        const at = `${k.selector}, ${k.file}:${k.line}`;
        if (t.ms != null && Math.abs(t.ms - k.ms) > 1) add(part, 'duration', `the tokens say ${t.ms}ms, the code takes ${k.ms}ms (${at})`, at);
        if (t.delay != null && Math.abs(t.delay - (k.delay ?? 0)) > 1) add(part, 'delay', `the tokens start it ${t.delay}ms in, the code ${k.delay ?? 0}ms in (${at})`, at);
        if (t.easing && ease(t.easing) !== ease(k.easing)) add(part, 'easing', `the tokens ease it ${t.easing}, the code ${k.easing} (${at})`, at);
      }
      // The reduced form: a part it leaves out, or gives no time, does not move for someone who asks for less motion.
      if (seq.reduced) for (const part of names) {
        const r = seq.reduced[part];
        const still = !r || r.ms === 0;
        const k = find(part); if (!k) continue;
        const stops = calm.some((x) => x.selector === k.selector && x.calm);
        if (still && !stops) add(part, 'reduced', `the reduced form keeps it still, and the code still moves it under prefers-reduced-motion (${k.selector}, ${k.file}:${k.line})`, `${k.file}:${k.line}`);
        else if (!still && stops) add(part, 'reduced', `the reduced form still moves it (${r.ms}ms), and the code stops it under prefers-reduced-motion (${k.selector}, ${k.file}:${k.line})`, `${k.file}:${k.line}`);
      }
    }
  }
  return out;
}
