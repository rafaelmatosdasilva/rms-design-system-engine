// selector-list.mjs - reading a CSS selector the way the browser does, for the checks that look a selector up.
//
// splitSelectors: a selector list split at its own commas only, never at one inside :not(.a, .b), :is(), :where(),
// :has() or an attribute value, so `.row:not(.selected, .no-button):hover svg` stays one selector.
// withoutHeardState: a selector without the attributes a screen reader hears ([aria-…], [role…]). A contract writes a
// state as the element shows and announces it (`.node.node-disabled[aria-disabled="true"]`); the CSS styles the
// class (`.node.node-disabled`), and the attribute is the markup's duty, checked by the accessibility check.

export function splitSelectors(list) {
  const out = [];
  let depth = 0, quote = null, cur = '';
  for (const ch of String(list ?? '')) {
    if (quote) { cur += ch; if (ch === quote) quote = null; continue; }
    if (ch === '"' || ch === "'") { quote = ch; cur += ch; continue; }
    if (ch === '(' || ch === '[') depth++;
    else if ((ch === ')' || ch === ']') && depth > 0) depth--;
    if (ch === ',' && depth === 0) { out.push(cur.trim()); cur = ''; continue; }
    cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out.filter(Boolean);
}

const HEARD = /\[\s*(?:aria-[\w-]+|role)\s*(?:[~|^$*]?=\s*(?:"[^"]*"|'[^']*'|[^\]\s]+)\s*(?:[is]\s*)?)?\]/gi;
export function withoutHeardState(selector) {
  return String(selector ?? '').replace(HEARD, '').replace(/\s+/g, ' ').trim();
}
