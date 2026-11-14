// font-face.mjs - one font face, however each place names it.
//
// The same face carries different names in its file, the CSS and Figma: Figma says family "Inter", style "Semi Bold";
// the file is Inter-SmBld.otf; the CSS may say font-family "Inter SemiBold" with weight 400, or "Inter" with 600. Held
// name against name they differ, and a font is reported missing, or a family wrong, that is the same face. This reads
// each name as a face (the family it belongs to, its weight, whether it is italic), so the face is compared, not the
// name. A weight is read only from a whole word of the name (Semi Bold, SmBld, -700), never from inside one: the family
// "Gilt" is no Light.
//
//   weightOf(word)             → 100…900 | null   ("semibold", "SmBld", "700", "Semi Bold")
//   faceOf(name, style?)       → { family, weight, italic }   (family lowercased, its weight and italic words taken off)
//   sameFace(a, b)             → true | false   a, b: { family, style?, weight? } (weight: a CSS weight, 400 or "bold")
// Pure.

// The words a font's weight is written in, its usual short forms included, each squashed (no case, spaces or hyphens).
export const WEIGHT_WORDS = [
  ['hairline', 100], ['thin', 100], ['th', 100],
  ['extralight', 200], ['ultralight', 200], ['xlight', 200], ['extlt', 200], ['xlt', 200],
  ['light', 300], ['lt', 300],
  ['book', 400], ['regular', 400], ['normal', 400], ['roman', 400], ['reg', 400], ['rg', 400],
  ['medium', 500], ['med', 500], ['md', 500],
  ['semibold', 600], ['demibold', 600], ['smbld', 600], ['sembd', 600], ['semibd', 600], ['dmbd', 600], ['sbold', 600],
  ['bold', 700], ['bd', 700],
  ['extrabold', 800], ['ultrabold', 800], ['xbold', 800], ['xtrabold', 800], ['exbd', 800], ['xbd', 800],
  ['black', 900], ['heavy', 900], ['blk', 900], ['hvy', 900],
];
const WEIGHT = new Map(WEIGHT_WORDS);
const ITALIC = /^(italic|oblique|it|ital)$/;
const CSS_WEIGHT = { normal: 400, bold: 700 };

const squash = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
// A name's words: split at spaces, hyphens and underscores, and where a lower letter meets a capital (SmBld → Sm Bld).
const wordsOf = (s) => String(s ?? '').replace(/^["']|["']$/g, '').split(/[\s_\-]+|(?<=[a-z0-9])(?=[A-Z])/).filter(Boolean);

export function weightOf(word) {
  const w = squash(word);
  if (/^[1-9]00$/.test(w)) return +w;
  return WEIGHT.get(w) ?? null;
}

export function faceOf(name, style = null) {
  const first = String(name ?? '').split(',')[0].trim();
  const words = wordsOf(first);
  let italic = false, weight = null;
  // From the end: its italic word, then the longest run of one to three words that is a weight (Semi Bold, Sm Bld).
  for (let guard = 0; guard < 4 && words.length > 1; guard++) {
    if (ITALIC.test(words[words.length - 1].toLowerCase())) { italic = true; words.pop(); continue; }
    let took = false;
    for (let k = Math.min(3, words.length - 1); k >= 1; k--) {
      const w = weightOf(words.slice(-k).join(''));
      if (w != null && weight == null) { weight = w; words.splice(-k); took = true; break; }
    }
    if (!took) break;
  }
  if (style != null) {
    const sw = wordsOf(style).filter((x) => { if (ITALIC.test(x.toLowerCase())) { italic = true; return false; } return true; });
    const w = weightOf(sw.join(''));
    if (w != null) weight = w;
  }
  return { family: squash(words.join(' ')), weight, italic };
}

export function sameFace(a, b) {
  const fa = faceOf(a?.family, a?.style), fb = faceOf(b?.family, b?.style);
  if (!fa.family || fa.family !== fb.family) return false;
  const cssW = (x) => (x == null || x === '' ? null : CSS_WEIGHT[String(x).trim().toLowerCase()] ?? (Number.isFinite(+x) ? +x : null));
  // A name's own weight word says the face; without one, the weight the CSS sets for it (or Figma's style) does.
  const wa = fa.weight ?? cssW(a?.weight), wb = fb.weight ?? cssW(b?.weight);
  return wa == null || wb == null || wa === wb;
}
