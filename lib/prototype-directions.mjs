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
import { templateChoices, cut, wordsOf } from './prototype-context.mjs';

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
// How well a shell answers this request: the words of the request that its name or its own purpose uses. A system
// with three templates could be listed in any order and still read sensibly; one with a dozen cannot. Run on a
// real system, eight different requests - a sign-in, an edit form, a bulk-select list, a colour picker - were all
// given the same three shells in the same order, because nothing scored them. Three templates in a fixed order
// are not directions; a reader takes "3 DIRECTIONS" to mean the engine weighed them.
export function shellFit(t, focus, { common = new Set() } = {}) {
  const asked = new Set(wordsOf(focus?.request ?? ''));
  if (!asked.size) return 0;
  const said = wordsOf(`${spaced(t.name)} ${t.purpose ?? ''}`);
  // Only the words that tell these shells apart. Every page shell's own description says "page", so counting it
  // scored all of them the same and the order fell back to the alphabet - which is how eight different requests
  // came back with one answer. A word they all use is not a reason to pick any of them.
  return said.filter((w) => asked.has(w) && !common.has(w)).length;
}

// The words every shell uses about itself, which therefore separate none of them.
export function commonWords(shells) {
  if (shells.length < 2) return new Set();
  const counts = new Map();
  for (const t of shells) for (const w of new Set(wordsOf(`${spaced(t.name)} ${t.purpose ?? ''}`))) counts.set(w, (counts.get(w) ?? 0) + 1);
  return new Set([...counts].filter(([, n]) => n >= shells.length).map(([w]) => w));
}

export function shellsFor(ctx, focus) {
  const named = new Set((focus?.components ?? []).map((c) => norm(c.name)));
  const sections = (focus?.sections ?? []).map((s) => norm(String(s.title).split(' (')[0]));
  return templateChoices(ctx ?? {})
    .map((t) => ({ ...t, purpose: purposeOf(ctx, t) }))
    .filter((t) => !OVER.test(`${spaced(t.name)} ${t.purpose ?? ''}`))
    .map((t, _i, all) => ({ ...t, named: named.has(norm(t.name)) || sections.includes(norm(t.name)), fit: shellFit(t, focus, { common: commonWords(all) }) }))
    // The one the request names, then the one whose own words answer it best, then by name so two equal shells
    // are always in the same order rather than whatever the catalog happened to hold.
    .sort((a, b) => Number(b.named) - Number(a.named) || b.fit - a.fit || a.name.localeCompare(b.name));
}

export const MOST = 3;

// → [{ name, shell, purpose, uses, why }], one a direction, most decisive first. Never more than the system has.
export function directionsFor(ctx, focus, { most = MOST } = {}) {
  if (!ctx || !focus) return [];
  const shells = shellsFor(ctx, focus).slice(0, most);
  if (!shells.length) return [];
  const parts = (focus.components ?? []).map((c) => c.name);
  const everyShell = new Set(shellsFor(ctx, focus).map((x) => norm(x.name)));
  return shells.map((s) => ({
    name: s.name,
    shell: s.name,
    purpose: s.purpose,
    // The components the request points at, minus the shells themselves. On a real system the request named a
    // full-page detail template, and it was listed both as a direction and as a part inside the other two: a
    // shell is what a page starts from, never something laid inside one.
    uses: parts.filter((n) => !everyShell.has(norm(n))).slice(0, 6),
    why: s.named ? 'the request names it' : s.fit ? `its own words answer the request (${s.fit})` : 'another shell the documentation offers, which nothing in the request points to',
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
  // When the request chose none of them, say so. A shell's documentation speaks the system's vocabulary
  // ("inquiry/list experiences", "transactional experiences") and a designer writes "sign in with a one-time
  // code": the two share no words, so nothing here ranked them. Printing them under a heading that promises a
  // comparison would tell a reader the engine weighed something it did not.
  const chose = ds.some((d) => d.why !== null && !/nothing in the request points to/.test(d.why));
  const out = chose
    ? ['', `${ds.length} DIRECTIONS  each built on the system, to compare before one is chosen:`]
    : ['', `${ds.length} SHELLS  the documentation offers these to start a page from, and nothing in the request chooses between them — that choice is yours:`];
  for (const [i, d] of ds.entries()) {
    // The reason is dropped where the heading already gave it, or every line repeats the same sentence.
    const why = chose ? ` (${d.why})` : '';
    out.push(`   ${i + 1}. ${d.shell}${d.purpose ? ` — ${d.purpose}` : ' — the documentation says nothing about what it is for'}${why}`);
    if (d.uses.length) out.push(`      built from: ${d.uses.join(', ')}`);
  }
  out.push(chose
    ? '   Build each as its own prototype and compare them; the components are the same, the shell is what differs.'
    : '   Read what each is for above and pick one; or build more than one and compare them. The components are the same either way.');
  return out;
}
