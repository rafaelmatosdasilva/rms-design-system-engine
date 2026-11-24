// not-run.mjs - a section of a report that could not run says so, in its own place.
//
// A section printed only `if (result)` is absent in two different cases: it ran and found nothing, and it never ran
// at all. From outside the two look the same, and the first one is reassuring - so a report with no 📱 section reads
// as a page that fits at every width, and a page never opened in a browser reads as a page with nothing wrong.
//
// The audit's gates have told the two apart for a long time: a gate carries `notRun` with its reason and prints as
// `Not run`, never as a pass (audit-parse.mjs). The prototype's own sections never did. `--no-browser`, a page whose
// checks failed, a missing Chrome, a measurement that came back empty or a product with no designed screen each took
// whole sections out of the report and left nothing in their place. It has been measured once already: a copy with no
// `node_modules` skipped every width check silently, and the run read as clean.
//
//   notRunLines(sections) → [line]: `⏭  <label> · <label>  Not run: <why>`, one line per reason. Sections that
//     did not run for the same reason are one line, because what every one of them shares is said once and never
//     repeated on each
//   browserWhy({ asked, errors, seen }) → the one reason every browser-measured section of a run shares, or null
//     when they ran
//   NO_SCREEN: why a page is held against no designed screen when the product has none for it
//
// A section whose `why` is null is not reported: null means it ran, or that there is nothing to say about it. The
// reason is always the caller's, never made up here - a wrong reason is worse than the silence it replaced.
//
// Pure: nothing is read or written here.

export const notRunLine = (labels, why) => `⏭  ${[].concat(labels).map((l) => String(l).trim()).join(' · ')}  Not run: ${why}`;

// One line per reason, in the order the sections are given, each naming every section that did not run for it.
export function notRunLines(sections = []) {
  const byWhy = new Map();
  for (const s of sections ?? []) {
    if (!s || s.ran || !s.why) continue;
    if (!byWhy.has(s.why)) byWhy.set(s.why, []);
    byWhy.get(s.why).push(s.label);
  }
  return [...byWhy].map(([why, labels]) => notRunLine(labels, why));
}

// Why none of a run's browser-measured sections ran. In this order, because each one makes the next unknowable: the
// browser was not asked for, the page had errors so nothing was drawn, or the browser itself said why.
export function browserWhy({ asked = true, errors = 0, seen = null } = {}) {
  if (!asked) return 'the browser was not asked for (--no-browser)';
  if (errors) return `the page has ${errors} error${errors === 1 ? '' : 's'}, so nothing was drawn to measure`;
  return seen?.why ?? null;
}

// A page the product has no designed screen for is not a page that matches its design: it is a page nothing was held
// against. The two were the same line until now.
export const NO_SCREEN = 'this product has no designed screen for this page, so there is nothing to hold it against';
