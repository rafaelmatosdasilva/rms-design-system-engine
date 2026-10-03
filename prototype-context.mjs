// prototype-context.mjs - what the team has written about its system, put in front of whoever makes a prototype.
//
// Figma alone gives a component and its options. What a component is for, when not to use it, what to use instead,
// and how the product's pages are arranged live elsewhere: the Figma description and annotations, the code's notes,
// the authored contract (whenNotToUse, useInstead, status), the team's guidelines (Notion, GitLab, committed files),
// and the authored layers of the design intent (patterns, templates, pages, flows). This reads all of it, as the
// design intent does (intent-gen.mjs), without writing anything, and shapes it for the prototype catalog and check.
//
// loadContext is the only part that reads files; the rest is pure.
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';

const clean = (s) => String(s ?? '').replace(/@(deprecated|experimental|status|use-?instead|superseded-?by|replaced-?by|since|why|rationale)\b[ \t]*:?[^\n@]*/gi, ' ').replace(/\s+/g, ' ').trim();
const cut = (s, n) => (s.length > n ? `${s.slice(0, n - 1).replace(/\s+\S*$/, '')}…` : s);
const LAYERS = ['patterns', 'templates', 'pages', 'flows'];

// The design intent, read: the file the audit keeps when there is one (it holds what the team authored), refreshed
// from the sources without writing. A project with no Figma snapshots yet has only the catalog.
export async function loadContext(ROOT, cfg = {}, catalog = { components: {} }) {
  let intent = null;
  const themeCss = Array.isArray(cfg.paths?.themeCSS) ? cfg.paths.themeCSS[0] : cfg.paths?.themeCSS;
  const file = cfg.docs?.out ? resolve(ROOT, cfg.docs.out) : join(themeCss ? dirname(resolve(ROOT, themeCss)) : ROOT, 'design-intent.json');
  try {
    if (existsSync(resolve(ROOT, cfg.paths?.snapshotStructure ?? 'figma-structure.snapshot.json'))) {
      const { generateIntent } = await import('./intent-gen.mjs');
      intent = (await generateIntent(ROOT, cfg, { write: false })).intent;
    }
  } catch { /* the catalog alone still says what each component is for */ }
  if (!intent) { try { intent = JSON.parse(readFileSync(file, 'utf8')); } catch { /* none */ } }
  return contextFrom(catalog, intent);
}

// { components: { name: { purpose, role, notes, notFor, useInstead, status, guidelines } }, rules: [{ title, text }] }
export function contextFrom(catalog = { components: {} }, intent = null) {
  const components = {};
  for (const [name, c] of Object.entries(catalog.components ?? {})) {
    const i = intent?.components?.[name] ?? {};
    const annotations = (i.design?.annotations ?? []).map((a) => clean(a?.label ?? a)).filter(Boolean);
    const role = annotations.map((a) => a.match(/^role\s*:\s*(.+)$/i)?.[1]).find(Boolean) ?? null;
    const notes = [...annotations.filter((a) => !/^role\s*:/i.test(a)), clean(i.code?.note), clean(i.code?.cssComment), clean(i.authored)].filter(Boolean);
    const purpose = clean(c.description) || clean(i.design?.description);
    components[name] = {
      purpose: purpose || null,
      role,
      notes: [...new Set(notes)],
      notFor: clean(c.whenNotToUse ?? i.guidance?.whenNotToUse) || null,
      useInstead: c.useInstead ?? i.guidance?.useInstead ?? null,
      status: c.status ?? (i.status?.state && i.status.state !== 'current' ? i.status.state : null),
      guidelines: clean(i.guidelines) || null,
    };
  }
  const rules = [];
  if (intent?.guidelines?.general) rules.push({ title: 'guidelines', text: String(intent.guidelines.general).trim(), sources: intent.guidelines._sources ?? [] });
  for (const L of LAYERS) {
    const a = intent?.[L]?.authored;
    const text = typeof a === 'string' ? a.trim() : a && typeof a === 'object' ? JSON.stringify(a, null, 1) : '';
    if (text) rules.push({ title: L, text });
  }
  return { components, rules };
}

// Whether a component says anything beyond its name.
const said = (k) => k && (k.purpose || k.role || k.notes.length || k.notFor || k.guidelines || k.useInstead?.length || k.status);

// One block per component for the catalog: what it is for, its role, when not to use it, the team's notes.
export function purposeLines(ctx, names, { width = 360 } = {}) {
  const list = names.filter((n) => said(ctx.components[n]));
  if (!list.length) return [];
  const pad = Math.max(...list.map((n) => n.length));
  const out = [];
  for (const n of list) {
    const k = ctx.components[n];
    const head = [k.purpose, k.role ? `Role ${k.role}.` : null, k.status ? `[${k.status}${k.useInstead?.length ? `: use ${k.useInstead.join(' or ')}` : ''}]` : null].filter(Boolean).join(' ');
    out.push(`  ${n.padEnd(pad)}  ${cut(head || '(no description yet)', width)}`);
    const more = (label, text) => out.push(`  ${' '.repeat(pad)}    ${label} ${cut(text, width)}`);
    if (k.notFor) more('not for', `${k.notFor}${k.useInstead?.length && !k.status ? `; use ${k.useInstead.join(' or ')}` : ''}`);
    for (const note of k.notes.slice(0, 2)) more('note', note);
    if (k.guidelines) more('guidelines', k.guidelines);
  }
  return out;
}

// The team's product rules for the catalog: general guidelines and the authored patterns, templates, pages and flows.
export function ruleLines(ctx, { width = 900 } = {}) {
  return ctx.rules.map((r) => `  ${r.title}: ${cut(r.text.replace(/\s+/g, ' '), width)}`);
}

// After a prototype is drawn: what the documentation says about each system component it uses, beside what the
// prototype uses it for (its labels and texts), so a use the component is not for stands out.
export function usesAgainstPurpose(ctx, nodes) {
  const byComponent = new Map();
  for (const n of nodes) {
    const k = ctx.components[n.component];
    if (!k) continue;
    const p = n.props ?? {};
    const what = p.standInFor ? `stand-in for ${p.standInFor}` : [p.Label, p.label, p.text, p.Text, p.placeholder, p.Placeholder, p['aria-label']].find((v) => typeof v === 'string' && v.trim()) ?? null;
    if (!byComponent.has(n.component)) byComponent.set(n.component, []);
    if (what) byComponent.get(n.component).push(what);
  }
  return [...byComponent].filter(([name]) => said(ctx.components[name])).map(([name, uses]) => {
    const k = ctx.components[name];
    const rule = [k.purpose, k.role ? `Role ${k.role}.` : null, k.notFor ? `Not for ${k.notFor.replace(/^not for\s*/i, '')}` : null, k.guidelines ? `Guidelines: ${cut(k.guidelines, 240)}` : null].filter(Boolean).join(' ');
    return { component: name, uses: [...new Set(uses)], rule };
  });
}
