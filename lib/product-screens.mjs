// product-screens.mjs - a product's screens drawn from the system's own components, each region marked by where it
// comes from, and the screens that moved since the last run.
//
// A system's team sees its components on its own pages and in its stories, and almost never in the screens that use
// them until a product files a bug. This reads each built page of a product (paths.plugins and pluginCSS, as the other
// product checks do), never running it and never changing it, and gives, region by region (its header, its navigation,
// each section by its heading):
//   • system:   the part is the system's own component, written with its class;
//   • product:  the part does a job a system component does, built by the product instead (its own look-alike);
//   • stand-in: the part does a job the system has no component for, drawn as a box with the need written on it.
// The screen is then drawn in the engine's own workshop: the same composition the prototype route draws from the system's
// components (page-rebuild.mjs), written to the engine's output folder, never into the team's Storybook or the product.
// Each run keeps the marks (workshop/<product>.json), so the next one says which screens drifted: a part that was the
// system's and is now the product's own, a stand-in the system now has a component for, a region added or gone.
//
//   markScreen(html, { catalog, name })   → { name, prototype, regions: [{ name, parts: [{ job, element, from, component? }] }], counts }
//   screenDrift(before, now)               → [{ screen, changes: [string] }]
//   screenLines(screens, drift)            → the run's lines
import { readHtml, rebuild } from './page-rebuild.mjs';

const norm = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
// The class each system component is written with: its catalog selector, else its name.
const classOf = (name, entry) => norm(String(entry?.selector ?? name).replace(/^\./, '').split(/[\s.,:[]/)[0]);

export function markScreen(html, { catalog = { components: {} }, name = 'screen' } = {}) {
  const r = rebuild(readHtml(html), { catalog, name });
  const sys = new Map(Object.entries(catalog.components ?? {}).map(([n, e]) => [classOf(n, e), n]));
  const counts = { system: 0, product: 0, 'stand-in': 0 };
  const regions = (r.regions ?? []).map((g) => ({
    name: g.name,
    parts: (g.parts ?? []).map((p) => {
      const own = (p.classes ?? []).map(norm).find((c) => sys.has(c));
      const from = own ? 'system' : p.with ? 'product' : 'stand-in';
      counts[from]++;
      return { job: p.job, element: p.element, from, ...(own ? { component: sys.get(own) } : p.with ? { component: p.with } : {}) };
    }),
  }));
  return { name, prototype: r.prototype, regions, counts, gaps: r.gaps ?? [] };
}

// What moved on each screen since the record before: a part's source changed, a region came or went. Matched by the
// region's name and each part's job and place among the parts doing it, so a page's text changing is never drift.
export function screenDrift(before = {}, now = {}) {
  const out = [];
  for (const [screen, s] of Object.entries(now)) {
    const was = before[screen];
    if (!was) continue;
    const changes = [];
    const regionsWas = new Map((was.regions ?? []).map((g) => [g.name, g]));
    for (const g of s.regions ?? []) {
      const w = regionsWas.get(g.name);
      if (!w) { changes.push(`${g.name} is new`); continue; }
      // The nth part doing a job in a region: its element's description names its class, which is what changes.
      const keyed = (parts) => { const seen = {}; return (parts ?? []).map((p) => [`${p.job}|${(seen[p.job] = (seen[p.job] ?? 0) + 1)}`, p]); };
      const partsWas = new Map(keyed(w.parts));
      for (const [k, p] of keyed(g.parts)) {
        const q = partsWas.get(k);
        if (q && q.from !== p.from) changes.push(`${g.name}: the ${p.job} (${p.element}) was ${q.from === 'system' ? 'the system\'s' : q.from === 'product' ? 'the product\'s own' : 'a stand-in'} and is now ${p.from === 'system' ? `the system's ${p.component}` : p.from === 'product' ? 'the product\'s own' : 'a stand-in'}`);
      }
    }
    for (const g of was.regions ?? []) if (!(s.regions ?? []).some((x) => x.name === g.name)) changes.push(`${g.name} is gone`);
    if (changes.length) out.push({ screen, changes });
  }
  return out;
}

export function screenLines(product, screens = [], drift = [], { dir = '' } = {}) {
  if (!screens.length) return [`${product}: no built page to read (paths.plugins with its built page).`];
  const total = screens.reduce((o, s) => ({ system: o.system + s.counts.system, product: o.product + s.counts.product, standIn: o.standIn + s.counts['stand-in'] }), { system: 0, product: 0, standIn: 0 });
  const lines = [`🖼  ${product}: ${screens.length} screen${screens.length === 1 ? '' : 's'} drawn from the system's components (${total.system} parts the system's, ${total.product} the product's own, ${total.standIn} stand-ins)${dir ? `, in ${dir}` : ''}`];
  for (const s of screens) {
    lines.push(`   ${s.name}: ${s.counts.system} the system's · ${s.counts.product} its own · ${s.counts['stand-in']} stand-ins`);
    for (const g of s.regions) {
      const mine = g.parts.filter((p) => p.from !== 'system');
      if (mine.length) lines.push(`      ${g.name}: ${mine.slice(0, 4).map((p) => `${p.job} (${p.element}) ${p.from === 'product' ? `built by the product where the system has ${p.component}` : 'a stand-in: the system has no component for it'}`).join(' · ')}${mine.length > 4 ? ` · and ${mine.length - 4} more` : ''}`);
    }
  }
  if (drift.length) {
    lines.push(`   Since the last run, ${drift.length} screen${drift.length === 1 ? '' : 's'} drifted:`);
    for (const d of drift) lines.push(`      ${d.screen}: ${d.changes.slice(0, 4).join(' · ')}${d.changes.length > 4 ? ` · and ${d.changes.length - 4} more` : ''}`);
  }
  return lines;
}
