// class-use.mjs - which classes and ids a page's code really puts on elements.
//
// A use is a class attribute (in markup or in a markup string), className = '…', classList.add/toggle/replace('…'),
// setAttribute('class' | 'id', '…') or an id attribute. A CSS rule naming a class, or a comment or a sentence with the
// word in it, is not a use. Gate [10] (a DS component a product screen uses in Figma, which its code never uses) and the
// style guide's Used in area read the same answer from here.

const stripComments = (t) => String(t ?? '').replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/<!--[\s\S]*?-->/g, ' ');

export function usedClasses(text) {
  const t = stripComments(text).replace(/<style\b[\s\S]*?<\/style>/gi, ' ').replace(/(^|[\s;{}()])\/\/[^\n]*/g, '$1');
  const out = new Set();
  const add = (v) => { for (const w of String(v).split(/[^A-Za-z0-9_-]+/)) if (w) out.add(w); };
  for (const m of t.matchAll(/\b(?:class|id)\s*=\s*(["'`])([\s\S]*?)\1/g)) add(m[2].replace(/\$\{[^}]*\}/g, ' '));
  for (const m of t.matchAll(/\b(?:class|id)\s*=\s*\\(["'])([\s\S]*?)\\\1/g)) add(m[2]);
  for (const m of t.matchAll(/\bclassName\s*[+]?=\s*(["'`])([\s\S]*?)\1/g)) add(m[2].replace(/\$\{[^}]*\}/g, ' '));
  for (const m of t.matchAll(/\bclassList\.(?:add|toggle|replace)\(([^)]*)\)/g)) for (const q of m[1].matchAll(/(["'`])([^"'`]*)\1/g)) add(q[2]);
  for (const m of t.matchAll(/setAttribute\(\s*["'](?:class|id)["']\s*,\s*(["'`])([^"'`]*)\1/g)) add(m[2]);
  return out;
}
