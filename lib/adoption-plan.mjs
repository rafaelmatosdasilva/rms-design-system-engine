// adoption-plan.mjs - what it takes to bring a product onto the system, in steps, each with the check that says done.
// Run from project root:  rms-design-system-engine --adoption-plan [<product>]
//
// The engine already finds how a product left the system (product-departures.mjs, written by the full check to
// departures.json): the versions it is behind, the near-copies of the system's components in its styles, the components
// it built beside the system's. It also counts every value typed by hand in a product's styles, with the token to use
// when the system has one (raw-census.mjs). This turns those findings into a plan. Each item gets one of four answers,
// and each answer says who acts:
//   use      - the system has it (a component or a token): the product's team switches, and the engine can draw the patch
//   ask      - the system lacks it: the system's team decides, in Figma first and then in code, before the product moves
//   keep     - a person says it stays, with the reason, and the engine stops counting it (kept differences)
//   upgrade  - the product runs an older version of the system: move it up, the majors one at a time
// Each item is sized by how many places it touches. The items go into steps, the ones that need no decision first, and
// each step ends on the engine check that goes quiet once it is done. The engine never makes the move itself: the plan
// is handed back, as every patch is.
//
//   adoptionPlan({ product, departure, census, latest })  → { product, items, steps, unseen }
//   readPlanInputs(ROOT, cfg, OUT_DIR)                     → { products: [{ name, departure, census }], latest, at, unseen }
//   planLines(plan) / planMarkdown(plan)

import { readFileSync, existsSync } from 'node:fs';
import { join, relative, resolve, extname } from 'node:path';

const CMD = 'rms-design-system-engine';
export const ANSWERS = {
  use: { word: 'Use the system\'s', who: 'the product\'s team' },
  ask: { word: 'Ask the system', who: 'the system\'s team' },
  keep: { word: 'Keep, with a reason', who: 'a person decides' },
  upgrade: { word: 'Move up a version', who: 'the product\'s team' },
};
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
export const sizeOf = (places) => (places <= 3 ? 'S' : places <= 15 ? 'M' : 'L');

// One product's plan. departure: its record in departures.json ({ gap, forks, parallels }) or null. census: the census
// of its own style files ({ files: [{ file, findings }] }) or null.
export function adoptionPlan({ product, departure = null, census = null, latest = null } = {}) {
  const items = [];
  const unseen = [];
  // Values typed by hand: one item per token to use (all the places that should say it), and one per kind the system
  // has no token for.
  if (census) {
    const byToken = new Map(), noToken = new Map();
    for (const f of census.files ?? []) for (const x of f.findings ?? []) {
      const tok = (Array.isArray(x.token) ? x.token[0] : x.token) ?? (Array.isArray(x.tokens) ? x.tokens[0] : null);
      const at = `${f.file}:${x.line}`;
      if (tok) { const e = byToken.get(tok) ?? { value: x.value, places: [] }; e.places.push(at); byToken.set(tok, e); }
      else { const k = `${x.kind} ${x.value}`; const e = noToken.get(k) ?? { kind: x.kind, value: x.value, places: [] }; e.places.push(at); noToken.set(k, e); }
    }
    for (const [tok, e] of byToken) items.push({ answer: 'use', what: `${e.value} typed by hand where the token ${tok} says it`, use: tok, places: e.places, kind: 'token' });
    for (const e of noToken.values()) items.push({ answer: e.places.length >= 3 ? 'ask' : 'keep', what: `${e.kind} ${e.value} typed by hand, with no token in the system`, places: e.places, kind: 'token', why: e.places.length >= 3 ? `used in ${e.places.length} places, so likely a token the system lacks` : 'used in few places: a token, or a value kept on purpose' });
  } else unseen.push('the product\'s styles, not read');
  if (departure) {
    const byLike = new Map();
    for (const c of [...(departure.forks ?? []).map((f) => ({ ...f, how: 'a copy of its styles' })), ...(departure.parallels ?? []).map((p) => ({ ...p, how: `its own ${p.name}` }))]) {
      const e = byLike.get(c.like) ?? { places: [], how: new Set() };
      e.places.push(`${c.file}${c.line ? `:${c.line}` : ''}`);
      e.how.add(c.how);
      byLike.set(c.like, e);
    }
    for (const [like, e] of byLike) items.push({ answer: 'use', what: `${[...e.how].join(' and ')} where the system has ${like}`, use: like, places: e.places, kind: 'component', why: 'what the product changed in it may be a need the system should hear about: ask before deleting it' });
    if (departure.gap) {
      const g = departure.gap;
      items.push({ answer: 'upgrade', what: `on ${g.uses}, the system is on ${g.latest}${g.majors ? ` (${plural(g.majors, 'major', 'majors')} behind)` : ` (${plural(g.minors, 'minor', 'minors')} behind)`}${g.days != null ? `, for ${plural(g.days, 'day', 'days')}` : ''}`, places: [], kind: 'version', majors: g.majors });
    }
  } else unseen.push(`the product's copies, own components and version: run ${CMD} once (it writes departures.json)`);
  for (const it of items) it.size = it.kind === 'version' ? (it.majors > 1 ? 'L' : it.majors ? 'M' : 'S') : sizeOf(it.places.length);
  // Steps: what needs no decision first, so the product's count falls at once, then what the system's team answers.
  const steps = [];
  const of = (pred) => items.filter(pred).sort((a, b) => b.places.length - a.places.length);
  const tokens = of((i) => i.answer === 'use' && i.kind === 'token');
  const comps = of((i) => i.answer === 'use' && i.kind === 'component');
  const ver = of((i) => i.answer === 'upgrade');
  const asks = of((i) => i.answer === 'ask');
  const keeps = of((i) => i.answer === 'keep');
  if (ver.length) steps.push({ title: 'Move onto the latest version', items: ver, done: `the full check lists ${product} with no version behind`, run: CMD });
  if (tokens.length) steps.push({ title: 'Say each value with the system\'s token', items: tokens, done: `${CMD} --census lists no value in ${product} that a token says`, run: `${CMD} --census` });
  if (comps.length) steps.push({ title: 'Use the system\'s components', items: comps, done: `the full check lists no copy or own version of a system component in ${product}`, run: CMD });
  if (asks.length) steps.push({ title: 'Ask the system for what it lacks', items: asks, done: 'the system has answered each (a token or component added, or a reason it will not be), drawn in Figma before it is built in code', run: `${CMD} --proposals` });
  if (keeps.length) steps.push({ title: 'Decide what stays', items: keeps, done: 'each is either moved to the system\'s token or kept with its reason', run: `${CMD} --census` });
  return { product, items, steps, unseen, latest };
}

const short = (places, n = 3) => (places.length ? `${places.slice(0, n).join(' · ')}${places.length > n ? ` · and ${places.length - n} more` : ''}` : '');
export function planLines(plan) {
  const total = plan.items.length;
  const lines = [`🧭 Adoption plan · ${plan.product}: ${total ? `${plural(total, 'item', 'items')} in ${plural(plan.steps.length, 'step', 'steps')}` : 'nothing to move'} (${['S', 'M', 'L'].map((s) => `${plan.items.filter((i) => i.size === s).length} ${s}`).join(' · ')})`];
  plan.steps.forEach((s, i) => {
    lines.push(`   ${i + 1}. ${s.title} (${plural(s.items.length, 'item', 'items')}, ${ANSWERS[s.items[0].answer].who})`);
    for (const it of s.items.slice(0, 8)) lines.push(`      · [${it.size}] ${it.what}${it.places.length ? ` (${short(it.places)})` : ''}`);
    if (s.items.length > 8) lines.push(`      · and ${s.items.length - 8} more in the plan's file`);
    lines.push(`      Done when ${s.done}.`);
  });
  for (const u of plan.unseen) lines.push(`   Not seen: ${u}`);
  return lines;
}

export function planMarkdown(plan, { at = null } = {}) {
  const out = [`# Adoption plan: ${plan.product}`, '', `What it takes to bring ${plan.product} onto the system${at ? ` (${at})` : ''}, in the order that needs the fewest decisions first. The engine changes nothing: each step is the product's team's or the system's team's to make.`, ''];
  out.push('| Answer | Who acts | Items |', '|---|---|---|', ...Object.entries(ANSWERS).map(([k, a]) => `| ${a.word} | ${a.who} | ${plan.items.filter((i) => i.answer === k).length} |`), '');
  plan.steps.forEach((s, i) => {
    out.push(`## ${i + 1}. ${s.title}`, '', `Done when ${s.done} (\`${s.run}\`).`, '');
    for (const it of s.items) {
      out.push(`- **${it.size}** ${it.what}${it.why ? `. ${it.why[0].toUpperCase()}${it.why.slice(1)}` : ''}`);
      for (const p of it.places) out.push(`  - \`${p}\``);
    }
    out.push('');
  });
  if (plan.unseen.length) out.push('## Not seen', '', ...plan.unseen.map((u) => `- ${u}`), '');
  return out.join('\n');
}

// ── reading what the plan rests on ──
export async function readPlanInputs(ROOT, cfg = {}, OUT_DIR = '.design-system-engine-out') {
  const unseen = [];
  let dep = null;
  try { dep = JSON.parse(readFileSync(join(ROOT, OUT_DIR, 'departures.json'), 'utf8')); } catch { /* none yet */ }
  const rel = await import('./releases.mjs');
  const named = rel.productsOf(ROOT, cfg);
  let tokens = null, censusText = null, styleOnly = null, projectStyleFiles = null;
  try {
    const rc = await import('./raw-census.mjs'), { editTruth } = await import('./edit-check.mjs'), st = await import('./a11y-static.mjs');
    const theme = [cfg.paths?.themeCSS ?? 'src/theme.css'].flat().map((p) => { try { return readFileSync(resolve(ROOT, p), 'utf8'); } catch { return ''; } }).join('\n');
    const truth = editTruth(ROOT, cfg);
    tokens = rc.censusTokens(theme, truth.tokenByValue); tokens.sizes = truth.sizes;
    censusText = rc.censusText; styleOnly = st.styleOnly; projectStyleFiles = st.projectStyleFiles;
  } catch { unseen.push('the system\'s tokens, so values typed by hand were not counted'); }
  const products = named.map((p) => {
    let census = null;
    if (tokens && p.dir && existsSync(p.dir)) {
      const files = [];
      for (const f of projectStyleFiles(p.dir, { html: true })) {
        let text = ''; try { text = readFileSync(f, 'utf8'); } catch { continue; }
        if (['.vue', '.svelte', '.html', '.htm'].includes(extname(f).toLowerCase())) text = styleOnly(text);
        const findings = censusText(text, tokens);
        if (findings.length) files.push({ file: relative(ROOT, f), findings });
      }
      census = { files };
    }
    return { name: p.name, departure: (dep?.products ?? []).find((d) => d.product === p.name) ?? (dep ? { gap: null, forks: [], parallels: [] } : null), census };
  });
  return { products, latest: dep?.latest ?? rel.systemVersion(ROOT, cfg), at: dep?.at ?? null, unseen };
}
