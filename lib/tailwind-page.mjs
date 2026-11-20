// tailwind-page.mjs - a Tailwind system's compiled CSS on its style guide page, its reset kept to the drawings.
//
// A Tailwind system's theme file is also Tailwind's entry (@import "tailwindcss"; @theme …): the page carried it as
// written, so its variables applied but none of its utilities did, and every component was drawn unstyled (found on a
// shadcn/ui system, a switch drawn 16px by 6px and grey). Its build compiles it while the components are drawn, and
// that compiled sheet is what the page needs. Tailwind's base layer (its preflight reset and the system's own base
// rules: * { margin: 0 }, button { background: transparent }, body { background: var(--background) }) is written for
// a whole product page, so on the page it is kept to the places a component is drawn (@scope), never the guide around them.
//
//   isTailwindEntry(text)   → true when a stylesheet is Tailwind's entry, to be compiled
//   tailwindForPage(css)    → the compiled sheet with each @layer base { … } kept to the drawings
//   DRAWN                   → the page's places a component is drawn

// Where the page draws a component: the playground's preview, its variants, compare and anatomy stages, the frame of
// a width, a screen of the Showroom, a thumbnail, a type specimen's stage, and the place a check draws out of sight.
export const DRAWN = ['.pg-preview', '.pg-variant-stage', '.pg-compare-stage', '.pg-frame-stage', '.pg-anat-stage', '.pg-offstage',
  '.sg-showroom', '.sg-showroom-stage', '.sg-thumb', '.sg-ts-stage', '.sg-bk-rl-stage', '.sg-spec-stage'];

export const isTailwindEntry = (text) => /@import\s+(?:url\(\s*)?["']tailwindcss(?:\/[\w./-]*)?["']|@tailwind\s+(?:base|components|utilities)\b/.test(String(text ?? ''));

// The index of the brace that closes the one opened at `open`, past strings and comments.
function closing(css, open) {
  let depth = 0;
  for (let i = open; i < css.length; i++) {
    const c = css[i];
    if (c === '"' || c === "'") { const q = c; for (i++; i < css.length && css[i] !== q; i++) if (css[i] === '\\') i++; continue; }
    if (c === '/' && css[i + 1] === '*') { const e = css.indexOf('*/', i + 2); i = e < 0 ? css.length : e + 1; continue; }
    if (c === '{') depth++;
    else if (c === '}' && --depth === 0) return i;
  }
  return -1;
}

export function tailwindForPage(css, drawn = DRAWN) {
  const src = String(css ?? '');
  const scope = `@scope (${drawn.join(', ')})`;
  let out = '', at = 0;
  for (const m of src.matchAll(/@layer\s+base\s*\{/g)) {
    if (m.index < at) continue;
    const open = m.index + m[0].length - 1, end = closing(src, open);
    if (end < 0) break;
    out += src.slice(at, open + 1) + `\n${scope} {\n${src.slice(open + 1, end)}\n}\n}`;
    at = end + 1;
  }
  return out + src.slice(at);
}
