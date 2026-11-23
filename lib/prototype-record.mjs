// prototype-record.mjs - each prototype's own evaluation, kept beside it.
//
// What every check found has only ever been kept in one place, in the engine's output folder, keyed by page: good
// for counting across a project, no use to the prototype itself. A prototype is a part of its own now - read from
// the team's store into prototypes/ and sent back from it - and what travels with it is the page, its handoff and
// what people said about it. Its evaluation did not travel at all. So somebody opening a prototype from the store
// could see the page and not one thing about whether it holds up.
//
// It is written beside the page, as the handoff and the comments are: prototypes/<name>.check.json. The team's
// store carries it, the style guide reads it to show each component the prototypes that used it, and a person
// looking at a prototype a month later can see what the last check of it found without running anything.
//
// It records what was found, never a verdict of its own: the components it used and how often, the mistakes with
// why each happened, what the system lacked for it, the states it owes. A record that judged would be a second
// opinion to keep in step with the first.
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';

export const checkFile = (name) => `${name}.check.json`;
const DESCRIPTION = 'What the last check of this prototype found: the components it used, the mistakes with why each happened, what the system lacked, and the states it owes. Written beside the page by rms-design-system-engine --prototype, and carried with it wherever the prototype goes.';

// What one check found, in the shape kept beside the page.
// used: { component: times }; items: the mistakes, each with its why (page-check.mjs whyOf); gaps: what the system
// lacked; owed: the states the page owes.
// checkedAt: where the check read it (fixed-point.mjs): the system's release and the commits, so a record opened months
// later says which system it was held to, and an old pass never reads as a current one.
// request: what was asked for (the prompt the prototype was built from, --for), by: who asked it, askedAt: when, each
// when it is known.
// widths: each screen width the page was drawn at, whether it fits there (widthResults), when it was drawn.
// problems: what the review found, each with its proposed grade and the reviewer's (review-severity.mjs).
// pretends: what the prototype only pretends to do (pretends.mjs).
export function checkRecord({ name, file, used = {}, items = [], gaps = [], owed = [], ok = null, checkedAt = null, request = null, by = null, askedAt = null, widths = null, problems = null, pretends = null, at = new Date().toISOString() } = {}) {
  const kinds = {};
  for (const i of items) kinds[i.kind ?? 'other'] = (kinds[i.kind ?? 'other'] ?? 0) + 1;
  return {
    $description: DESCRIPTION, name, file, at,
    ...(request ? { request, ...(by ? { by } : {}), ...(askedAt ? { askedAt } : {}) } : {}),
    ...(widths?.length ? { widths } : {}),
    ...(checkedAt ? { checkedAt } : {}),
    ok: ok == null ? !items.length && !owed.length : ok,
    used: Object.fromEntries(Object.entries(used).sort((a, b) => b[1] - a[1])),
    mistakes: items.length,
    // The half a person can act on, told from the half the agent owes, as every other count of these is told. Left
    // out where nothing was classified at all: a zero here would read as "the documentation owed none of them",
    // which is a different thing from "nobody worked out whose fault each was".
    ...(items.some((i) => 'gap' in i) ? { gapsInDocumentation: items.filter((i) => i.gap).length } : {}),
    kinds,
    items: items.slice(0, 50).map((i) => ({ component: i.component ?? null, kind: i.kind ?? null, message: i.message, ...('gap' in i ? { gap: !!i.gap, why: i.why ?? null } : {}) })),
    lacked: gaps.map((g) => ({ need: g.need, searched: g.searched ?? null, why: g.why ?? null })),
    owes: owed.map((o) => o.kind ?? o.state).filter(Boolean),
    // Each problem the review found, the grade proposed for it with why, and the reviewer's grade where one was given
    // (review-severity.mjs): the proposal is the engine's, the grade is the person's.
    ...(problems?.length ? { review: problems.slice(0, 80).map((p) => ({ id: p.id, source: p.source, message: p.message, proposed: p.proposed, ...(p.grade ? { grade: p.grade } : {}) })) } : {}),
    // What the prototype only pretends to do (pretends.mjs): a success with nothing sent, a figure, a quote or a logo
    // nobody gave. Kept so whoever opens it later knows which parts are not real.
    ...(pretends?.length ? { pretends: pretends.map((p) => ({ kind: p.kind, text: p.text, message: p.message })) } : {}),
  };
}

// Kept beside the page, where the handoff and the comments are, so the team's store carries it too.
// What was asked for, by whom and when, is kept from the check before when this one does not know it: a prompt is said
// once, when the prototype is made, and a check a week later, by anyone, must not lose it or put another name on it.
export function writeCheck(root, dir, record) {
  const path = join(root, dir, checkFile(record.name));
  // Every ask is kept in order (asks): the first made the prototype, each later one changed it. A check that brings no
  // new ask keeps them as they were, and the record's request, by and askedAt stay the first ask's.
  let was = null; try { was = JSON.parse(readFileSync(path, 'utf8')); } catch { /* the first check */ }
  const asks = [...(was?.asks ?? (was?.request ? [{ request: was.request, by: was.by ?? null, at: was.askedAt ?? null }] : []))];
  if (record.request && asks.at(-1)?.request !== record.request) asks.push({ request: record.request, by: record.by ?? null, at: record.askedAt ?? null });
  if (asks.length) record = { ...record, request: asks[0].request, by: asks[0].by ?? undefined, askedAt: asks[0].at ?? undefined, asks };
  try { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, JSON.stringify(record, null, 2) + '\n'); return path; }
  catch { return null; }
}

// Every prototype's last check, by the name of the page. A folder with none says so by being empty: a prototype
// nobody has checked is not a prototype that passed.
// A team keeps them in a folder per product (prototypes/<Product>/), each check beside its page: read there too.
export function readChecks(root, dir = 'prototypes') {
  const out = {};
  const read = (rel) => {
    let files;
    try { files = readdirSync(join(root, rel), { withFileTypes: true }); } catch { return; }
    for (const f of files) {
      if (f.isDirectory()) { if (rel === dir && !/\.(handoffs|screens)$/.test(f.name)) read(`${rel}/${f.name}`); continue; }
      if (!f.name.endsWith('.check.json')) continue;
      try { const r = JSON.parse(readFileSync(join(root, rel, f.name), 'utf8')); if (r?.name) out[r.name] = r; } catch { /* not one of ours */ }
    }
  };
  read(dir);
  return out;
}

// Which prototypes used each component, newest first, for the style guide to show on its page.
// → { component: [{ name, times, at, ok, mistakes }] }
export function byComponent(checks = {}) {
  const out = {};
  for (const r of Object.values(checks)) {
    for (const [component, times] of Object.entries(r.used ?? {})) {
      (out[component] ??= []).push({ name: r.name, times, at: r.at ?? null, ok: !!r.ok, mistakes: r.mistakes ?? 0 });
    }
  }
  for (const list of Object.values(out)) list.sort((a, b) => String(b.at ?? '').localeCompare(String(a.at ?? '')));
  return out;
}

// What a person reads at the end of a check: one line, because the report above it already said everything.
export function checkLine(record, where) {
  const n = Object.keys(record.used ?? {}).length;
  return `🗂  Kept with the prototype: ${n} component${n === 1 ? '' : 's'} used, ${record.mistakes} mistake${record.mistakes === 1 ? '' : 's'}${record.owes.length ? `, ${record.owes.length} state${record.owes.length === 1 ? '' : 's'} owed` : ''}${record.checkedAt?.system ? `, held to the system at ${record.checkedAt.system}` : ''} → ${where}`;
}

// Where the prototypes are shared. A project that names no store for them (ds-config.json → stores.prototypes) keeps
// them on one computer, so a teammate never sees them: said after each check, with the one step that ends it, asked of
// the person once (their team's GitLab or GitHub repository) and written with --store. → the lines, or [] once named.
export function storeLines(root, cmd = 'rms-design-system-engine') {
  let cfg; try { cfg = JSON.parse(readFileSync(join(root, 'ds-config.json'), 'utf8')); } catch { return []; }
  if (cfg.stores?.prototypes) return [];
  return [`ℹ️  The prototypes are on this computer only: no repository is named for them, so nobody else on the team sees them.`,
    `NEXT: ask the person once for the GitLab or GitHub repository their team keeps prototypes in, then run ${cmd} --store prototypes=<that link>. Never pick one for them.`];
}

// Each screen width a page was drawn at, and whether it fits there: nothing runs past the screen's edge, is cut,
// spills or wraps with its words as written (a problem only with the words 40% longer is a translation's, said apart).
// The answer a team's own exit criterion asks ("Phone and Desktop"), kept with the prototype so a script reads it
// rather than working it out. fit: what the draw found ({ widths: ['Phone (375px)', …], findings }) → [{ width, fits,
// problems, longer }].
export function widthResults(fit) {
  if (!fit?.widths?.length) return [];
  const own = (fit.findings ?? []).filter((f) => f.kind !== 'target');   // a tap target's size is the system's own, said apart
  return fit.widths.map((w) => {
    const here = own.filter((f) => (f.widths ?? []).includes(w));
    const problems = here.filter((f) => f.asWritten).length;
    return { width: w, fits: !problems, problems, longer: here.length - problems };
  });
}
export const widthLine = (widths = []) => widths.length ? `📏 Each width: ${widths.map((w) => `${w.width} ${w.fits ? 'fits' : `${w.problems} problem${w.problems === 1 ? '' : 's'}`}`).join(' · ')}` : '';

