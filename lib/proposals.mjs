// proposals.mjs - proposals drafted from how the system is used.
//
// Several products overriding the same property of a component, or designers detaching the same component in their
// screens, is the system asking for a change. Each is read today one product at a time, where it looks like that
// product's choice. This gathers the overrides the products' code makes (a rule of a product's own that styles a
// system component's class, an inline style on its tag) and the detaches their Figma screens record (the screen
// capture's detached frames), and when the same one repeats in two or more products, drafts a proposal with that
// evidence: what to change, where it was seen and what it would reach. A person accepts it, rejects it or asks for
// research (--proposal <id> --accept | --reject "<why>" | --research, --by "<who>"). A rejected one is kept with its
// reason, so it does not come back each quarter as new.
//
//   codeOverrides(files, classes)        → [{ component, property, value, product, file, line }]
//   figmaDetaches(screens, { productOf, names }) → [{ component, product, screen }]
//   proposals({ overrides, detaches, reach, decided, least }) → [{ id, kind, component, property?, what, seen, reach, decision }]
//   proposalLines(list), proposalsMarkdown(list)
//   readDecided(ROOT), recordDecision(ROOT, id, decision)

import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { slashed } from './shown-path.mjs';

export const DECISIONS_FILE = 'design-system-engine-proposals.json';
export const VERDICTS = ['accepted', 'rejected', 'research'];

const esc = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const norm = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
const STYLES = /\.(css|scss|less)$/i, MARKUP = /\.(vue|svelte|jsx|tsx|html?)$/i;

// The CSS of a file with each rule's line: a stylesheet whole, a component file's <style> blocks.
function sheetsOf(file, text) {
  if (STYLES.test(file)) return [{ css: text, from: 0 }];
  if (!/\.(vue|svelte|html?)$/i.test(file)) return [];
  const out = [];
  for (const m of text.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)) out.push({ css: m[1], from: text.slice(0, m.index + m[0].indexOf('>') + 1).split('\n').length - 1 });
  return out;
}

// Each rule a product writes for one of the system's components: its selector names the component's class (alone, or
// with a modifier or a part of it), and each property it sets. classes: { component: '.class' }. files: { file, text,
// product, productName } (usage-map.mjs productFiles), only a product's own counted.
export function codeOverrides(files = [], classes = {}) {
  const cls = Object.entries(classes).map(([c, s]) => [c, String(s ?? '').match(/^\.([A-Za-z][\w-]*)/)?.[1]]).filter(([, k]) => k);
  const out = [];
  for (const f of files) {
    if (!f.product || !f.productName) continue;
    const text = String(f.text ?? '');
    for (const { css, from } of sheetsOf(f.file, text)) {
      const clean = css.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '));
      for (const m of clean.matchAll(/([^{}@;]+)\{([^{}]*)\}/g)) {
        const selector = m[1].trim();
        const hit = cls.find(([, k]) => new RegExp(`\\.${esc(k)}(?![\\w])|\\.${esc(k)}(?:--|__)`).test(selector));
        if (!hit) continue;
        const line = from + clean.slice(0, m.index + (m[1].length - m[1].trimStart().length)).split('\n').length;
        for (const d of m[2].matchAll(/([a-z-]+)\s*:\s*([^;]+)/gi)) {
          if (d[1].startsWith('--')) continue;
          out.push({ component: hit[0], property: d[1].toLowerCase(), value: d[2].trim(), product: f.productName, file: f.file, line, selector });
        }
      }
    }
    // An inline style on the component's own tag: style="padding: 4px" or style={{ padding: 4 }}.
    if (MARKUP.test(f.file)) for (const [c] of cls) {
      const tag = c.charAt(0).toUpperCase() + c.slice(1);
      for (const m of text.matchAll(new RegExp(`<${esc(tag)}(?=[\\s/>])[^>]*?\\sstyle\\s*=\\s*(?:"([^"]*)"|\\{\\{([^}]*)\\}\\})`, 'g'))) {
        const line = text.slice(0, m.index).split('\n').length;
        const decls = m[1] != null ? [...m[1].matchAll(/([a-z-]+)\s*:\s*([^;]+)/gi)].map((d) => [d[1], d[2]]) : [...m[2].matchAll(/([A-Za-z]+)\s*:\s*([^,]+)/g)].map((d) => [d[1].replace(/[A-Z]/g, (x) => `-${x.toLowerCase()}`), d[2]]);
        for (const [p, v] of decls) out.push({ component: c, property: p.toLowerCase(), value: String(v).trim().replace(/^['"]|['"]$/g, ''), product: f.productName, file: f.file, line, selector: 'style' });
      }
    }
  }
  return out;
}

// The detached frames each product's screens hold, by the system component each was. screens: the screen layout
// snapshot's screens ({ id, name, tree }), productOf(screen) → its product, names: the system's components.
export function figmaDetaches(screens = [], { productOf = () => null, names = [] } = {}) {
  const byKey = new Map(names.map((n) => [norm(n), n]));
  const out = [];
  for (const s of screens) {
    const product = productOf(s);
    if (!product) continue;
    const walk = (n) => {
      if (!n || typeof n !== 'object') return;
      if (n.detached) { const c = byKey.get(norm(n.detached)) ?? byKey.get(norm(String(n.detached).split(/[/,=]/)[0])); if (c) out.push({ component: c, product, screen: s.name }); }
      for (const k of n.children ?? []) walk(k);
    };
    walk(s.tree);
  }
  return out;
}

const uniq = (l) => [...new Set(l)];
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

// The proposals: an override of the same component's same property in at least `least` products, and a detach of the
// same component in as many. reach: { component: [products that use it] }. decided: readDecided().
export function proposals({ overrides = [], detaches = [], reach = {}, decided = {}, least = 2 } = {}) {
  const out = [];
  const groups = new Map();
  for (const o of overrides) { const k = `override:${o.component}:${o.property}`; groups.set(k, [...(groups.get(k) ?? []), o]); }
  for (const [id, list] of groups) {
    const products = uniq(list.map((o) => o.product));
    if (products.length < least) continue;
    const { component, property } = list[0];
    const values = uniq(list.map((o) => o.value));
    out.push({
      id, kind: 'override', component, property, products,
      what: `${component}'s ${property}: ${products.length} products set it themselves (${values.slice(0, 4).join(' · ')}${values.length > 4 ? ' · …' : ''}). Give ${component} an option for it, or change its ${property} if they agree.`,
      seen: list.map((o) => ({ product: o.product, at: `${o.file}:${o.line}`, value: o.value })),
      reach: reach[component] ?? products, decision: decided[id] ?? null,
    });
  }
  const dg = new Map();
  for (const d of detaches) dg.set(d.component, [...(dg.get(d.component) ?? []), d]);
  for (const [component, list] of dg) {
    const products = uniq(list.map((d) => d.product));
    if (products.length < least) continue;
    const id = `detach:${component}`;
    out.push({
      id, kind: 'detach', component, products,
      what: `${component} is detached in the screens of ${products.length} products. Ask what each changed after detaching it: that is what ${component} lacks.`,
      seen: list.map((d) => ({ product: d.product, at: d.screen })),
      reach: reach[component] ?? products, decision: decided[id] ?? null,
    });
  }
  return out.sort((a, b) => (a.decision ? 1 : 0) - (b.decision ? 1 : 0) || b.products.length - a.products.length || a.id.localeCompare(b.id));
}

const SAID = { accepted: 'accepted', rejected: 'rejected', research: 'asked for research' };
const decisionText = (d) => `${SAID[d.verdict] ?? d.verdict}${d.by ? ` by ${d.by}` : ''}${d.at ? ` on ${String(d.at).slice(0, 10)}` : ''}${d.reason ? `: ${d.reason}` : ''}`;

// The terminal's lines: each open proposal with its evidence, then each decided one in a line.
export function proposalLines(list = [], { cmd = 'rms-design-system-engine', most = 8 } = {}) {
  const open = list.filter((p) => !p.decision), done = list.filter((p) => p.decision);
  const lines = [];
  if (open.length) {
    lines.push(`📮 ${plural(open.length, 'proposal', 'proposals')} drafted from how the products use the system, each one the same workaround in two or more products:`);
    for (const p of open.slice(0, most)) {
      lines.push(`   ${p.id}`);
      lines.push(`      ${p.what}`);
      lines.push(`      seen: ${p.seen.slice(0, 4).map((s) => `${s.product} ${s.at}`).join(' · ')}${p.seen.length > 4 ? ` · and ${p.seen.length - 4} more` : ''}`);
      lines.push(`      would reach: ${p.reach.join(' · ')}`);
    }
    if (open.length > most) lines.push(`   and ${open.length - most} more`);
    lines.push(`   Decide each: ${cmd} --proposal <id> --accept, --reject "<why>" or --research, with --by "<who>".`);
  }
  for (const p of done) lines.push(`   ${p.id}: ${decisionText(p.decision)}`);
  return lines;
}

export function proposalsMarkdown(list = []) {
  if (!list.length) return '';
  const out = ['# Proposals drafted from how the system is used', '', 'Each is the same workaround in two or more products. A person accepts it, rejects it with a reason, or asks for research.', ''];
  for (const p of list) {
    out.push(`## ${p.id}`, '', p.what, '');
    if (p.decision) out.push(`**${decisionText(p.decision)}**`, '');
    out.push('Seen:', '', ...p.seen.map((s) => `- ${s.product}: ${s.at}${s.value ? ` (\`${s.value}\`)` : ''}`), '', `Would reach: ${p.reach.join(' · ')}`, '');
  }
  return out.join('\n');
}

// What people decided, kept in the project beside its other records: { id: { verdict, reason, by, at } }.
export function readDecided(ROOT) {
  try { return JSON.parse(readFileSync(join(ROOT, DECISIONS_FILE), 'utf8')).proposals ?? {}; } catch { return {}; }
}
export function recordDecision(ROOT, id, { verdict, reason = null, by, at = new Date().toISOString() }) {
  if (!VERDICTS.includes(verdict)) throw new Error(`a verdict is one of ${VERDICTS.join(', ')}`);
  if (!by) throw new Error('a decision says who made it (--by "<who>")');
  if (verdict === 'rejected' && !reason) throw new Error('a rejection says why (--reject "<why>"), so it does not come back');
  const all = readDecided(ROOT);
  all[id] = { verdict, ...(reason ? { reason } : {}), by, at };
  writeFileSync(join(ROOT, DECISIONS_FILE), JSON.stringify({ proposals: all }, null, 1) + '\n');
  return all[id];
}

// The whole reading for a project: its system's components and their classes, its products' files, its screens.
// → { list, overrides, detaches, screensRead }
export async function projectProposals(ROOT, cfg = {}) {
  const readJson = (p) => { try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return null; } };
  const names = Object.keys(readJson(resolve(ROOT, cfg.paths?.snapshotStructure ?? 'figma-structure.snapshot.json'))?.components ?? {}).filter((n) => !n.startsWith('_'));
  const { loadLocator } = await import('./component-locator.mjs');
  const locator = await loadLocator(ROOT, cfg);
  const classes = Object.fromEntries(names.map((n) => [n, locator.selectorFor(n)]).filter(([, s]) => s && /^\./.test(s)));
  const { productFiles } = await import('./usage-map.mjs');
  const files = productFiles(ROOT, cfg);
  // A product's stylesheets as well as its markup (the usage map reads markup only).
  const { sourceFiles } = await import('./code-roots.mjs'), { productResolver } = await import('./usage-map.mjs');
  const productOf = productResolver(ROOT, cfg);
  const sheets = sourceFiles(ROOT, cfg).filter((f) => STYLES.test(f.file) && f.file.startsWith('..')).map((f) => ({ ...f, product: true, productName: productOf(resolve(ROOT, f.file)) }));
  const overrides = codeOverrides([...files, ...sheets], classes);
  const figmaDir = dirname(cfg.paths?.snapshotStructure ?? 'figma-structure.snapshot.json');
  const layout = readJson(resolve(ROOT, cfg.paths?.screenLayout ?? slashed(join(figmaDir, 'figma-screen-layout.snapshot.json'))));
  let detaches = [];
  if (layout?.screens?.length) {
    const { productOfScreen } = await import('./screen-parity.mjs');
    const sc = readJson(resolve(ROOT, cfg.paths?.snapshotScreenComponents ?? slashed(join(figmaDir, 'figma-screen-components.snapshot.json'))))?.screens ?? {};
    const products = [...new Set(files.map((f) => f.productName).filter(Boolean))];
    detaches = figmaDetaches(layout.screens, { names, productOf: (s) => productOfScreen(s, { declared: [...(cfg.frames ?? []), ...(cfg.screens ?? [])], screenComponents: sc, products }) });
  }
  // What a change would reach: every product whose code uses the component.
  const reach = {};
  for (const n of names) {
    const c = classes[n]?.slice(1), tag = n.charAt(0).toUpperCase() + n.slice(1);
    const re = new RegExp(`<${esc(tag)}(?=[\\s/>])${c ? `|(?<![\\w-])${esc(c)}(?![\\w])` : ''}`);
    const ps = [...new Set(files.filter((f) => f.product && f.productName && re.test(f.text ?? '')).map((f) => f.productName))].sort();
    if (ps.length) reach[n] = ps;
  }
  const list = proposals({ overrides, detaches, reach, decided: readDecided(ROOT), least: Number(cfg.proposals?.least) || 2 });
  return { list, overrides, detaches, screensRead: !!layout?.screens?.length };
}
