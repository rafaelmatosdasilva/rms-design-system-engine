// request-phrases.mjs - what a request asks for, read in pairs rather than one word at a time.
//
// A request was matched against each component one word at a time, which is why "sign in with a one-time code"
// came back with a component for signatures (sign), one for events in time (one-TIME) and one for showing source
// code (code), beside the single component that was right. Run on a real design system, three of the four best
// matches for that request were the wrong sense of a word the request happened to contain.
//
// A word is ambiguous; the pair it sits in rarely is. "one-time code" is not "code", "colour picker" is not
// "picker", "bulk action" is not "action". So the pairs of a request are read as well as its words, a component
// whose own words hold a pair counts for much more than one holding a single word, and what matched is said out
// loud so a thin match reads as thin rather than as an answer.
import { wordsOf } from './prototype-context.mjs';

// The adjacent pairs of a request, in its own order: "a one-time code page" → ["time code", "code page"].
// Pairs, not longer runs: two words are enough to fix a sense, and three stop matching anything real.
export function pairsOf(text) {
  // Paired as they were written, not after the small words were taken out: dropping those first made "a picker
  // and a drag-and-drop file well" offer "picker drag", two words that were never next to each other and name
  // nothing. Each raw token is reduced the way wordsOf reduces one, and a pair survives only where both halves
  // are words wordsOf would keep.
  const keep = new Set(wordsOf(text));
  // A hyphen separates words: "drag-and-drop" is three, not one. Kept whole it reduced to "drag" and paired with
  // whatever followed, so "drag-and-drop file" offered "drag file", a thing nobody asked for.
  const raw = String(text ?? '').replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase().match(/[a-zà-ú][a-zà-ú0-9]*/g) ?? [];
  const red = raw.map((t) => wordsOf(t)[0] ?? null);
  const out = [];
  for (let i = 0; i + 1 < red.length; i++) {
    const a = red[i], b = red[i + 1];
    if (a && b && a !== b && keep.has(a) && keep.has(b)) out.push(`${a} ${b}`);
  }
  return [...new Set(out)];
}

// What a component's own words share with a request: how many of its words, and whether any pair survived whole.
// → { pairs, words, score, sure }
//
// Pairs matter where they land, but real documentation paraphrases: the request said "one-time code" and the
// component says "one-time password or verification code", so the pair never meets literally. What did separate
// the right component from the wrong ones was plainer - it shared two words of the request where each wrong one
// shared exactly one. One word is a coincidence; two is a sense.
export function sharedWith(said, request) {
  const mine = new Set(wordsOf(said));
  const minePairs = new Set(pairsOf(said));
  const pairs = pairsOf(request).filter((p) => minePairs.has(p));
  const words = wordsOf(request).filter((w) => mine.has(w));
  return { pairs, words, score: pairs.length * 6 + words.length, sure: surety({ pairs, words }) };
}

// How sure a match is. A pair or two words is a sense; one word on its own is the kind of match that offered a
// signature image for "sign in" and a timeline for "one-time".
export function surety({ pairs = [], words = [] }) {
  if (pairs.length || words.length >= 2) return 'sense';
  return words.length ? 'one word' : 'none';
}
export const THIN = 'one word';

// What is said beside a component in the catalog: what it matched, and plainly when that was thin, so a reader
// never takes a coincidence for an answer.
export function matchNote(shared) {
  if (shared.pairs.length) return `"${shared.pairs[0]}"`;
  if (shared.sure === THIN) return `only the word "${shared.words[0]}" — check this is the sense you meant`;
  return shared.words.length ? shared.words.map((w) => `"${w}"`).join(', ') : '';
}

// A thing the request asks for that nothing answers with a sense. The request said "a colour picker" on a system
// with no colour picker, and two date pickers came back on the word "picker" alone: the one thing that should
// have been reported as missing was covered over by a wrong match. A need nothing meets is the finding, not an
// absence of findings.
//
// Read as the noun of each pair the request makes, which is how a person names a thing: "colour picker", "bulk
// action", "error state". A pair no component meets with a sense is said as a need, once.
// → [{ need, nearest, why }]
export function needsNothingMeets(request, components = []) {
  const out = [], seen = new Set();
  for (const pair of pairsOf(request)) {
    if (seen.has(pair)) continue;
    const met = components.find((c) => {
      const sh = sharedWith(c.said ?? '', pair);
      return sh.pairs.length || sh.words.length >= 2;
    });
    if (met) { seen.add(pair); continue; }
    // Only a pair some component half-answers is a need: a pair nothing holds at all is usually two ordinary
    // words of a sentence ("then a", "with an"), not a thing somebody asked for.
    const near = components.filter((c) => sharedWith(c.said ?? '', pair).words.length === 1);
    if (!near.length) continue;
    seen.add(pair);
    out.push({ need: pair, nearest: near.slice(0, 3).map((c) => c.name), why: 'matched on one word only, which is not the same thing' });
  }
  return out;
}

export function needLines(needs = []) {
  if (!needs.length) return [];
  return ['', `🔍 ASKED FOR, NOT FOUND  ${needs.length} thing(s) the request names that no component answers:`,
    ...needs.slice(0, 5).map((n) => `   • ${n.need} — nearest: ${n.nearest.join(', ')} (${n.why})`),
    '   Show each as a data-missing box with what it needs, so the design team sees it. Do not use the nearest as if it were the thing.'];
}
