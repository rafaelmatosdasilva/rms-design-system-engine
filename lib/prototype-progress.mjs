// prototype-progress.mjs - is it actually getting better?
//
// Every page check already keeps what it found, with why each mistake happened: a gap in the documentation, or
// something written that the agent did not follow (page-check.mjs → prototypes/inventions.json, the last 300 runs).
// Nobody read it as a direction. So a person writing the documentation the engine asked for had no way to see
// whether writing it changed anything, which is the one question that decides whether they keep going.
//
// This answers it from what is already there, and refuses to answer when it cannot:
//   • mistakes a page, early against late, so the number is comparable however many pages were drawn;
//   • the share of them that were the documentation's fault, because that is the half a person can act on;
//   • and nothing at all when there is too little to say. Two runs are not a trend, and a tool that draws one
//     from two runs is a tool that will say the opposite next week.
//
// Pure: it reads the record and says what it says.

// How many runs on each side before early and late mean anything. Under this, the answer is "not yet".
export const ENOUGH = 6;
// A difference smaller than this, as a share, is the same number said twice. Mistakes a page is noisy: one page
// with a bad day moves it, and a tool that calls that progress teaches people to ignore it.
export const MOVED = 0.15;

const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const round = (n) => Math.round(n * 100) / 100;

// Each run as one number: mistakes on that page, and how many of them the documentation owed.
const perRun = (r) => ({ at: r.at, page: r.page, errors: r.errors ?? (r.items ?? []).length, gaps: (r.items ?? []).filter((i) => i.gap).length });

// The direction, from the runs kept. → { runs, pages, early, late, change, say, gapShare, enough }
//   early / late: { runs, perPage, gapShare } for the first and last half
//   change: how much mistakes a page moved, as a share of the early number (negative: fewer)
export function progressOf(record = {}, { enough = ENOUGH, moved = MOVED } = {}) {
  const runs = (record.runs ?? []).map(perRun).filter((r) => r.at);
  const pages = new Set(runs.map((r) => r.page)).size;
  const out = { runs: runs.length, pages, enough: runs.length >= enough * 2 };
  if (!runs.length) return { ...out, say: 'no page has been checked yet.' };
  const share = (list) => (list.reduce((n, r) => n + r.errors, 0) ? list.reduce((n, r) => n + r.gaps, 0) / list.reduce((n, r) => n + r.errors, 0) : 0);
  out.gapShare = round(share(runs));
  if (!out.enough) {
    return { ...out, say: `${runs.length} page check${runs.length === 1 ? '' : 's'} so far, ${round(mean(runs.map((r) => r.errors)))} mistake${runs.length === 1 ? '' : 's'} a page. Too few to say which way it is going: ${enough * 2} is where early and late start meaning anything.` };
  }
  const half = Math.floor(runs.length / 2);
  const first = runs.slice(0, half), last = runs.slice(-half);
  const side = (l) => ({ runs: l.length, perPage: round(mean(l.map((r) => r.errors))), gapShare: round(share(l)) });
  out.early = side(first); out.late = side(last);
  out.change = out.early.perPage ? round((out.late.perPage - out.early.perPage) / out.early.perPage) : 0;
  const way = Math.abs(out.change) < moved ? 'same' : out.change < 0 ? 'better' : 'worse';
  out.way = way;
  out.say = way === 'same'
    ? `${out.late.perPage} mistakes a page over the last ${last.length} checks, against ${out.early.perPage} over the first ${first.length}: the same number said twice.`
    : `${out.late.perPage} mistakes a page over the last ${last.length} checks, against ${out.early.perPage} over the first ${first.length}: ${Math.abs(Math.round(out.change * 100))}% ${way === 'better' ? 'fewer' : 'more'}.`;
  return out;
}

// What a person reads at the end of a check, in three lines at most. The point is the second one: the share the
// documentation owed is the half they can do something about, and watching it fall is the whole loop working.
export function progressLines(p) {
  if (!p.runs) return [];
  const out = [`📈 ${p.say}`];
  if (p.enough) {
    const was = Math.round((p.early.gapShare ?? 0) * 100), now = Math.round((p.late.gapShare ?? 0) * 100);
    out.push(`   ${now}% of them were things the documentation did not say, against ${was}% early on${now < was ? ': writing what was missing is working' : now > was ? ': the documentation is falling behind what agents are asked for' : ''}.`);
  } else if (p.gapShare != null) {
    out.push(`   ${Math.round(p.gapShare * 100)}% of them were things the documentation did not say - that is the half you can act on.`);
  }
  out.push(`   Read from ${p.runs} check${p.runs === 1 ? '' : 's'} of ${p.pages} page${p.pages === 1 ? '' : 's'}, kept as each one ran.`);
  return out;
}
