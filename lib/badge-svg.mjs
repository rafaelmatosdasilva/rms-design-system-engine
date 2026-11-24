// badge-svg.mjs - the README's two live badges, drawn here instead of fetched from an outside renderer.
//
// GitHub serves no README image from its origin: every one is fetched through its own proxy (camo), and an image the
// proxy cannot reach in about four seconds comes out as a broken icon for everybody, cached that way for a while.
// Every badge in this README but two is already this repository's own SVG, hosted with the owner's profile, and those
// are fetched straight from raw.githubusercontent.com, which GitHub does not proxy, so they never break. The two live
// ones - the suite's count and the OpenSSF Scorecard - were the exception, drawn by img.shields.io, and so the only
// two that went through camo. On 24 November 2026 both showed broken while shields itself answered every request in
// under two seconds: the proxy was the whole fault, and badges on shields' own README broke the same way that hour.
//
// So the two are drawn here and written to the `badges` branch as SVG, beside every other badge on one origin. They
// stay live, because the workflow that produces each number writes its badge in the same run: the suite writes its
// count (tests.yml), and the Scorecard badge is written from the public API that this repository's own scorecard.yml
// publishes to (badges.yml). Nothing is fetched when the README is read, so there is nothing left to time out.
//
// The look is the one every other badge here already has, so the row reads as one set: rounded, two-toned, a dark
// label beside a lighter value, white text at 4.5:1 or more on each, one outline icon set (Tabler) at one size, and
// shields' two-layer text shadow.
//
// The widths below are Verdana's own, measured once from rendered badges, because the text has to be about as wide as
// the box that holds it. They need not be exact: every string is drawn with lengthAdjust="spacingAndGlyphs", so the
// glyphs are fitted to the width given, and a percent either way is not visible. Measuring them is what keeps this
// free of any dependency, which is a promise the README makes.
//
//   node lib/badge-svg.mjs tests <count>        -> the suite's badge, green
//   node lib/badge-svg.mjs tests --failing      -> the suite's badge, red, saying only that it failed
//   node lib/badge-svg.mjs scorecard <score>    -> the Scorecard badge
import { pathToFileURL } from 'node:url';

// Verdana advance widths for every printable ASCII character, at the font size the badge is drawn with (110, then
// scaled by a tenth). Anything outside this range is counted as an average letter rather than dropped, so a stray
// character makes the box slightly wrong instead of making the text overflow it.
const WIDTHS = [
  38.8, 43.2, 50.4, 90, 69.6, 118, 79.6, 29.2, 50, 50, 69.6, 90, 40, 50, 40, 50, 69.6, 69.6, 69.6,
  69.6, 69.6, 69.6, 69.6, 69.6, 69.6, 69.6, 50, 50, 90, 90, 90, 60, 110, 74.8, 75.2, 76.8, 84.8, 69.2,
  62.8, 85.2, 82.4, 46, 50, 76, 61.2, 92.4, 82, 86.4, 66, 86.4, 76.4, 74.8, 67.6, 80.4, 74.8, 108.4, 75.2,
  67.6, 72.4, 50, 50, 50, 90, 70, 50, 66, 69.2, 59.2, 69.2, 66.8, 42.8, 69.2, 70.4, 32, 34.4, 65.6, 32,
  106, 70.4, 68.4, 69.2, 69.2, 47.6, 56.4, 44, 70.4, 63.2, 90.4, 63.2, 63.2, 57.2, 70, 50, 70, 90,
];
const AVERAGE = 66;
const textWidth = (s) => [...s].reduce((t, c) => {
  const w = WIDTHS[c.codePointAt(0) - 32];
  return t + (w === undefined ? AVERAGE : w);
}, 0);

// Tabler outline icons, drawn in the label at the size every other badge here uses. Each is the icon that badge
// already carried, so nothing about the row changes but where it is drawn.
export const ICONS = {
  circleCheck: '<path d="M12 12m-9 0a9 9 0 1 0 18 0a9 9 0 1 0 -18 0" /><path d="M9 12l2 2l4 -4" />',
  shieldCheck: '<path d="M11.46 20.846a12 12 0 0 1 -7.96 -14.846a12 12 0 0 0 8.5 -3a12 12 0 0 0 8.5 3a12 12 0 0 1 -.09 7.06" /><path d="M15 19l2 2l4 -4" />',
};

const escape = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
// Rounded to a whole tenth of a pixel, as every badge in this row is, so the numbers in the file read the same way.
const round10 = (n) => Math.round(n / 10) * 10;

// One string of text, drawn twice under itself for the shadow and once over it. The shadow is what gives the text its
// edge on a flat colour, and is the one thing here taken from shields' own look.
const text = (x, w, s) => {
  const t = escape(s);
  return `<text x="${x}" y="150" fill-opacity=".8" filter="url(#b)" textLength="${w}" lengthAdjust="spacingAndGlyphs">${t}</text>`
    + `<text x="${x}" y="150" fill-opacity=".3" textLength="${w}" lengthAdjust="spacingAndGlyphs">${t}</text>`;
};
const over = (x, w, s) =>
  `<text x="${x}" y="140" textLength="${w}" lengthAdjust="spacingAndGlyphs">${escape(s)}</text>`;

/**
 * One badge, as an SVG the README can point at directly.
 *
 * @param {object} badge
 * @param {string} badge.label       the dark half, ending in a colon as every badge here does
 * @param {string} badge.value       the lighter half
 * @param {string} badge.labelColor  the dark half's colour, without a leading #
 * @param {string} badge.valueColor  the lighter half's colour, without a leading #
 * @param {string} [badge.icon]      one of ICONS, drawn in the label
 * @returns {string} the whole file, one line, ending in a newline
 */
export function badgeSvg({ label, value, labelColor, valueColor, icon }) {
  const labelText = round10(textWidth(label));
  const valueText = round10(textWidth(value));
  // The label holds the icon at x=6 (14 wide), then five of space, then its text, then seven at the end; the value
  // has seven on each side of its own text. These are the spacings the badges beside it already use.
  const textStart = icon ? 25 : 5;
  const labelWidth = textStart + labelText / 10 + 7;
  const valueWidth = 7 + valueText / 10 + 7;
  const width = labelWidth + valueWidth;
  const title = `${label} ${value}`;
  return '<svg xmlns="http://www.w3.org/2000/svg" '
    + `width="${width}" height="20" role="img" aria-label="${escape(title)}">`
    + `<title>${escape(title)}</title>`
    + `<clipPath id="r"><rect width="${width}" height="20" rx="4"/></clipPath>`
    + `<g clip-path="url(#r)"><rect width="${labelWidth}" height="20" fill="#${labelColor}"/>`
    + `<rect x="${labelWidth}" width="${valueWidth}" height="20" fill="#${valueColor}"/></g>`
    + (icon
      ? '<svg x="6" y="3" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" '
        + `stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${icon}</svg>`
      : '')
    + '<filter id="b"><feGaussianBlur stdDeviation="16"/></filter>'
    + '<g fill="#fff" font-family="Verdana,Geneva,DejaVu Sans,sans-serif" text-rendering="geometricPrecision" '
    + 'font-size="110"><g transform="scale(.1)"><g aria-hidden="true" fill="#010101">'
    + text(textStart * 10, labelText, label)
    + text((labelWidth + 7) * 10, valueText, value)
    + '</g>'
    + over(textStart * 10, labelText, label)
    + over((labelWidth + 7) * 10, valueText, value)
    + '</g></g></svg>\n';
}

// The two the README shows. Their colours are the ones it already set: a dark green label beside a lighter green
// value, red when the suite fails, and the two blues for the Scorecard.
export const PRESETS = {
  tests: (value, failing) => badgeSvg({
    // A red run says only that it failed, never a count that would read as that many failures.
    label: failing ? 'Tests:' : 'Tests passed:',
    value: failing ? 'failing' : value,
    labelColor: '316A17',
    // 4.67:1 with its white text, the same as the green beside it. The red an outside renderer would have used sits
    // at 3.61:1, under the floor every other badge here is held to, so drawing it here is what makes it readable.
    valueColor: failing ? 'DA3330' : '3D841D',
    icon: ICONS.circleCheck,
  }),
  scorecard: (value) => badgeSvg({
    label: 'Scorecard:',
    value,
    labelColor: '165DAE',
    valueColor: '1B73D7',
    icon: ICONS.shieldCheck,
  }),
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [which, value] = process.argv.slice(2);
  const failing = process.argv.includes('--failing');
  if (which === 'tests') process.stdout.write(PRESETS.tests(value, failing));
  else if (which === 'scorecard') process.stdout.write(PRESETS.scorecard(value));
  else {
    console.error('say which badge: tests <count> [--failing], or scorecard <score>');
    process.exit(2);
  }
}
