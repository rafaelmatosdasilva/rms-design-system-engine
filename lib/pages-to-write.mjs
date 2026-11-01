// pages-to-write.mjs - the components no intent page documents, most used first, and the lines a page started for one
// begins with.
//
// Reach is the usage map's (each contract's livesIn, as the audit last wrote it): how many products use the component,
// in how many files, how many times. A component documented somewhere else is not a page to write: one the team or the
// engine says is documented in another's page (an Add whose answer is that page), a part of another component (its
// contract's partOf), or an icon or a sub-part (a name under another's, tileList/row) that only sits inside a component
// the layer documents (livesIn.inside). Those are listed apart, with why.
//
// The first ones (intentLayer.startPages a run, 10 unless set; 0 starts none) get a page through the same path a yes to
// writing one takes (intent-answers.mjs → startPage), only those the products use. What it starts with comes from its
// contract and is drafted, never written as the team's: what it is for (its description) and when to use it (the
// products that use it, the values its props take, its states, what it holds and sits inside). Nothing else is said.
//
//   rankPages({ noPage, usage, contracts, proposals, documented }) → { ranked: [{ name, rank, code, reach }], skipped }
//   seedLines(contract, reach, { check }) → [{ where, text }] (drafts)
//   startLimit(cfg) → how many a run starts
//   pagesToWriteLines(ranked, skipped, { limit }) → the list to read in a terminal

const ICON = /^icons?(?:$|[-_/ A-Z])|[-_/ ]icons?$/i;
const n = (k, one, many = `${one}s`) => `${k} ${k === 1 ? one : many}`;
const listed = (xs) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}`);

// How far a component reaches, from its livesIn: the products (by name), the files and the uses across them.
export function reachOf(lives) {
  const ps = lives?.products ?? [];
  return { products: ps.map((p) => p.name).filter(Boolean), files: ps.reduce((t, p) => t + (p.files ?? 0), 0), uses: ps.reduce((t, p) => t + (p.uses ?? 0), 0) };
}

// noPage: the components no page documents (as the team's answers leave them: intent-proposals.mjs → decidedLayer).
// usage: { name: livesIn }. contracts: Map(name → contract). proposals: Map(key → proposal). documented(name): whether a
// page documents it. codeFiles: { name: file }.
export function rankPages({ noPage = [], usage = {}, contracts = new Map(), proposals = new Map(), documented = () => false, codeFiles = {} } = {}) {
  const ranked = [], skipped = [];
  for (const name of noPage) {
    const c = contracts.get(name) ?? null, lives = usage[name] ?? c?.livesIn ?? null;
    const add = proposals.get(`add:${name}`);
    if (add?.effect === 'documented') { skipped.push({ name, why: `documented in ${add.host}'s page` }); continue; }
    if (c?.partOf) { skipped.push({ name, why: `a part of ${c.partOf}` }); continue; }
    const host = (lives?.inside ?? []).find((p) => documented(p));
    if (host && (ICON.test(name) || name.includes('/'))) { skipped.push({ name, why: `${ICON.test(name) ? 'an icon' : 'a part'} inside ${host}, documented there` }); continue; }
    ranked.push({ name, code: codeFiles[name] ?? c?.source?.code?.file ?? null, reach: reachOf(lives) });
  }
  ranked.sort((a, b) => b.reach.products.length - a.reach.products.length || b.reach.files - a.reach.files || b.reach.uses - a.reach.uses || a.name.localeCompare(b.name));
  ranked.forEach((r, i) => { r.rank = i + 1; });
  return { ranked, skipped };
}

// How many pages a run starts: ds-config.json → intentLayer.startPages (0 for none), 10 unless set.
export function startLimit(cfg = {}) {
  const v = typeof cfg.intentLayer === 'object' ? cfg.intentLayer?.startPages : undefined;
  return Number.isInteger(v) && v >= 0 ? v : 10;
}
// The ones a run starts: the first of them the products use, with a code file to start the page from.
export const toStart = (ranked, limit) => ranked.filter((r) => r.code && r.reach.uses > 0).slice(0, limit);

// A description that only says where it came from is no description.
const PLACEHOLDER = /captured from figma by rms-design-system-engine\.?$|^(todo|tbd|description)\.?$/i;
// The names its props are written with in the code (the contract's binding), else its own.
const codeName = (p) => (typeof p?.bindings?.code?.prop === 'string' ? p.bindings.code.prop : typeof p?.bindings?.code?.attribute === 'string' ? p.bindings.code.attribute : null);
const tick = (s) => `\`${s}\``;

// The lines a started page begins with, each from the contract, each a draft: what it is for (its description) and when
// to use it (where the products use it, the values its props take, its states, what it holds and sits inside). check:
// (text) → true when the content check finds nothing wrong in it; a line it finds anything in is not written.
// → [{ where: 'Purpose' | 'When to use', text }]
export function seedLines(contract, reach = { products: [], files: 0, uses: 0 }, { check = () => true, lives = null } = {}) {
  const out = [];
  const desc = String(contract?.description ?? '').replace(/\s+/g, ' ').trim();
  if (desc && !PLACEHOLDER.test(desc)) out.push({ where: 'Purpose', text: /[.!?]$/.test(desc) ? desc : `${desc}.` });
  if (reach.products.length) out.push({ where: 'When to use', text: `The products use it today: ${listed(reach.products.slice(0, 3))}${reach.products.length > 3 ? ` and ${n(reach.products.length - 3, 'more')}` : ''}, in ${n(reach.files, 'file')}.` });
  const props = [...(contract?.props ?? []).map((p) => ({ name: codeName(p) ?? p.name, options: p.bindings?.code?.options ?? p.options })), ...(contract?.codeOnly ?? []).map((p) => ({ name: p.name, options: p.options }))];
  for (const p of props.filter((x) => Array.isArray(x.options) && x.options.length > 1 && x.options.length <= 6 && x.options.every((o) => typeof o === 'string' && !/^(true|false)$/.test(o))).slice(0, 2)) {
    out.push({ where: 'When to use', text: `Pick its ${tick(p.name)} for the case: ${listed(p.options.map(tick)).replace(/ and (?=`[^`]*`$)/, ' or ')}.` });
  }
  const states = [...new Set((contract?.states ?? []).map((s) => s?.name).filter(Boolean))];
  if (states.length) out.push({ where: 'When to use', text: `It shows ${states.length === 1 ? 'a state' : 'the states'} ${listed(states)}.` });
  const l = lives ?? contract?.livesIn ?? null;
  if (l?.holds?.length) out.push({ where: 'When to use', text: `It holds ${listed(l.holds.slice(0, 4).map(tick))}.` });
  if (l?.inside?.length) out.push({ where: 'When to use', text: `It sits inside ${listed(l.inside.slice(0, 4).map(tick))}.` });
  return out.filter((x) => check(x.text));
}

// The ranked list as lines to read: each with its reach, the ones a run starts marked; the ones documented elsewhere after.
export function pagesToWriteLines(ranked, skipped = [], { limit = 10, most = 30 } = {}) {
  const start = new Set(toStart(ranked, limit).map((r) => r.name));
  const lines = [`Pages to write, most used first: ${n(ranked.length, 'component')} with no intent page${start.size ? ` (${start.size === 1 ? 'the first one the products use is' : `the first ${start.size} the products use are`} started on the next run that writes the layer, ${start.size === 1 ? 'its' : 'their'} lines drafts to review)` : ''}.`];
  for (const r of ranked.slice(0, most)) {
    const where = r.reach.products.length ? `${listed(r.reach.products.slice(0, 3))}${r.reach.products.length > 3 ? ` and ${r.reach.products.length - 3} more` : ''}: ${n(r.reach.files, 'file')}, ${n(r.reach.uses, 'use')}` : 'no product uses it yet';
    lines.push(`  ${String(r.rank).padStart(3)}. ${r.name} - ${where}${start.has(r.name) ? ' (started next)' : ''}`);
  }
  if (ranked.length > most) lines.push(`  … and ${ranked.length - most} more`);
  if (skipped.length) lines.push(`Documented in another page, so not listed: ${skipped.map((s) => `${s.name} (${s.why})`).join(', ')}.`);
  return lines;
}

// For a project: the layer as last read with the team's answers applied (intent-proposals.mjs → decidedLayer, or the one
// given), the usage map and the contracts as the audit last wrote them. → { ranked, skipped, limit } | null (no layer read)
export async function pagesToWriteOf(ROOT, cfg = {}, { decided = null } = {}) {
  const d = decided ?? await (await import('./intent-proposals.mjs')).decidedLayer(ROOT, cfg);
  if (!d) return null;
  const contracts = new Map([...(await import('./sign-off.mjs')).contractsByFile(ROOT, cfg).values()].map((c) => [c.name, c]));
  const usage = (await import('./local-shared.mjs')).usageFrom(ROOT, cfg);
  const codeFiles = (await import('./intent-layer.mjs')).codeFilesOf(ROOT, cfg);
  return { ...rankPages({ noPage: d.noPage, usage, contracts, proposals: d.proposals, documented: (x) => d.report.pages.some((p) => p.component === x), codeFiles }), limit: startLimit(cfg) };
}
