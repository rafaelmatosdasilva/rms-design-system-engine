// class-use.mjs - which classes and ids a page's code really puts on elements.
//
// A use is a class attribute (in markup or in a markup string), className = '…', classList.add/toggle/replace('…'),
// setAttribute('class' | 'id', '…') or an id attribute. A CSS rule naming a class, or a comment or a sentence with the
// word in it, is not a use. Gate [10] (a DS component a product screen uses in Figma, which its code never uses) and the
// style guide's Used in area read the same answer from here.

const stripComments = (t) => String(t ?? '').replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/<!--[\s\S]*?-->/g, ' ');

function eachUse(text, add) {
  const t = stripComments(text).replace(/<style\b[\s\S]*?<\/style>/gi, ' ').replace(/(^|[\s;{}()])\/\/[^\n]*/g, '$1');
  for (const m of t.matchAll(/\b(?:class|id)\s*=\s*(["'`])([\s\S]*?)\1/g)) add(m[2].replace(/\$\{[^}]*\}/g, ' '));
  for (const m of t.matchAll(/\b(?:class|id)\s*=\s*\\(["'])([\s\S]*?)\\\1/g)) add(m[2]);
  for (const m of t.matchAll(/\bclassName\s*[+]?=\s*(["'`])([\s\S]*?)\1/g)) add(m[2].replace(/\$\{[^}]*\}/g, ' '));
  for (const m of t.matchAll(/\bclassList\.(?:add|toggle|replace)\(([^)]*)\)/g)) for (const q of m[1].matchAll(/(["'`])([^"'`]*)\1/g)) add(q[2]);
  for (const m of t.matchAll(/setAttribute\(\s*["'](?:class|id)["']\s*,\s*(["'`])([^"'`]*)\1/g)) add(m[2]);
}
const words = (v) => new Set(String(v).split(/[^A-Za-z0-9_-]+/).filter(Boolean));

export function usedClasses(text) {
  const out = new Set();
  eachUse(text, (v) => { for (const w of words(v)) out.add(w); });
  return out;
}

// How many times each class or id is put on an element: once per attribute or call that names it.
export function classUseCounts(text) {
  const out = new Map();
  eachUse(text, (v) => { for (const w of words(v)) out.set(w, (out.get(w) ?? 0) + 1); });
  return out;
}
