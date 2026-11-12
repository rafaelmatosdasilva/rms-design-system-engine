// prototype-directions.mjs - several directions for one request, each one the system's own.
//
// A request gets one answer today: the catalog names the components it touches, and whoever reads it writes a page.
// That is one direction out of several the system already supports, chosen by whoever happened to read first, and
// a reviewer never sees what else was possible - the alternatives are only visible to somebody who knows the
// templates by heart.
//
// So the directions are named before anything is written: each starts from a shell the documentation actually
// offers, leans on components the system actually has, and says what it does differently. Nothing here invents a
// direction to reach a number. A system with one documented shell has one direction, and says so - three made-up
// ones would be worse than the single honest answer it replaced, because each would read as a thing the team had
// decided.
import { templateChoices, cut } from './prototype-context.mjs';

const norm = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
const bare = (s) => norm(s).replace(/template$/, '');
// A template that lays a panel, a drawer or a dialog over a page is not a direction for a page: it lives inside
// one. The same reading askFirst makes when it offers a shell to start from.
export const OVER = /\b(side[- ]?layers?|side[- ]?panels?|panels?|drawers?|overlays?|modals?|dialogs?|sheets?|popovers?|toasts?|banners?)\b/i;
const spaced = (n) => String(n).replace(/([a-z])([A-Z])/g, '$1 $2');

// What a shell is for, in the documentation's own first sentence: its intent layer page where there is one, else
// its own entry in the catalog. A shell nothing is written about says so, rather than being dressed up.
export function purposeOf(ctx, t) {
  const own = t.purpose ?? ctx?.components?.[t.name]?.purpose ?? null;
  if (own) return cut(String(own).split(/(?<=[.!?])\s/)[0].trim(), 120);
  const rule = (ctx?.rules ?? []).find((r) => bare(String(r.title).split(' · ')[0].replace(/\s*\([^)]*\)\s*$/, '')) === bare(t.name));
  const first = rule ? String(rule.text).split('\n').map((l) => l.trim()).filter(Boolean)[0] : null;
  return first ? cut(first.split(/(?<=[.!?])\s/)[0].trim(), 120) : null;
}

// The shells a request could start from: every template the documentation describes that is a page rather than
// something laid over one, the ones the request names first. A template with no documentation is still a shell,
// and says it has none rather than being left out.
export function shellsFor(ctx, focus) {
  const named = new Set((focus?.components ?? []).map((c) => norm(c.name)));
  const sections = (focus?.sections ?? []).map((s) => norm(String(s.title).split(' (')[0]));
  return templateChoices(ctx ?? {})
    .map((t) => ({ ...t, purpose: purposeOf(ctx, t) }))
    .filter((t) => !OVER.test(`${spaced(t.name)} ${t.purpose ?? ''}`))
    .map((t) => ({ ...t, named: named.has(norm(t.name)) || sections.includes(norm(t.name)) }))
    .sort((a, b) => Number(b.named) - Number(a.named) || a.name.localeCompare(b.name));
}

export const MOST = 3;

// → [{ name, shell, purpose, uses, why }], one a direction, most decisive first. Never more than the system has.
export function directionsFor(ctx, focus, { most = MOST } = {}) {
  if (!ctx || !focus) return [];
  const shells = shellsFor(ctx, focus).slice(0, most);
  if (!shells.length) return [];
  const parts = (focus.components ?? []).map((c) => c.name);
  return shells.map((s) => ({
    name: s.name,
    shell: s.name,
    purpose: s.purpose,
    // The components the request already points at, which every direction is built from: what differs is the shell
    // they sit in, not whether the page is the system's.
    uses: parts.slice(0, 6),
    why: s.named ? 'the request names it' : 'another shell the documentation offers',
  }));
}

// What a person is told. One direction is one direction: the lines say so rather than dressing it as a choice.
export function directionLines(ds = []) {
  if (!ds.length) return [];
  if (ds.length === 1) {
    const d = ds[0];
    return ['', `ONE DIRECTION  the documentation describes one shell for this: ${d.shell}${d.purpose ? ` — ${d.purpose}` : ''}`,
      '   Build it. Another direction would be invented, not the system\'s.'];
  }
  const out = ['', `${ds.length} DIRECTIONS  each built on the system, to compare before one is chosen:`];
  for (const [i, d] of ds.entries()) {
    out.push(`   ${i + 1}. ${d.shell}${d.purpose ? ` — ${d.purpose}` : ' — the documentation says nothing about what it is for'} (${d.why})`);
    if (d.uses.length) out.push(`      built from: ${d.uses.join(', ')}`);
  }
  out.push('   Build each as its own prototype and compare them; the components are the same, the shell is what differs.');
  return out;
}
