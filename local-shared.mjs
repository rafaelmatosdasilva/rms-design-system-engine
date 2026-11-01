// local-shared.mjs - whether a gap or a change stays in one product (local) or changes what other products get (shared).
//
// What the engine finds and what an agent proposes is not all the same weight. A value written by hand on one product's
// own screen is that product's to fix; a new option on a shared component, a token, a contract or a Figma component is
// the system's, and every product that uses it gets the change. So each item is sorted, with its reason in one line:
//   • where it lives: the system (its theme, its components, their contracts, its Figma file) or one product (its own
//     screens, its own CSS). One the engine cannot place is treated as shared until someone says, because sending a
//     local item to the owner costs a question and letting a shared one through costs every product;
//   • the effect on other products: how many products' code uses the component (the usage map, livesIn.products);
//   • how hard it is to undo: a removal, a rename or a breaking change is hard (a product may already lean on what is
//     gone), a changed value less so, an addition is easy;
//   • ambiguity: when the item is a decision between two sides, or the engine could not tell where it lives.
// The last three set its risk (high, medium, low), said in the reason. Only a shared item has a decider (ds-config.json
// owners, decided-by.mjs ownerOf) and waits on them; a local one is its product team's and never waits.
//
//   scopeOf(item, { usage, owners }) → { scope: 'local' | 'shared', reason, risk, undo, reach, ambiguous, decider }
//     item: { home: 'system' | 'product' | null, kind, change: 'add' | 'remove' | 'rename' | 'breaking' | 'change' | 'fix',
//       what, component?, product?, reach?, ambiguous? }
//   todoScope(task, ctx) / editScope({ file, before, after, root, cfg, usage }) / changeScope(change, ctx): the same for a
//     style guide task, an agent's edit and a change made in Figma
//   proposalScope(proposal, { page }, ctx): the intent layer's Fix, Add, Move and reviews (intent-proposals.mjs): a page
//     of a product's flow or screen is local, any other page (a component's, a template's, the system's) is shared
//   findingScope(finding, ctx) / issueScopeLine(scope): an issue the engine opens, and the one line its body says it in
//   productIn(text, productOf): the one product the files a finding or a task names belong to (ctx.productOf: a file
//     path → its product's name, or null for the system's own; usage-map.mjs productResolver)
//   sideScope({ name, side: 'figma' | 'code' }, ctx): a component only one side has (only in Figma: the system's to build,
//     so shared; only in one product's code: that product's own, so local)
//   scopeSummary(items) → { shared, local, waiting: [{ name, n }] }; scopeLine(summary) → "2 shared, waiting on Cards
//     team (2); 3 local, each product team's own"
//   usageFrom(ROOT, cfg) → { <component>: livesIn }: the usage map as the last audit wrote it into the catalog and contracts
//
// Pure but for usageFrom and editScope, which read the project's files.
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { ownerOf, waitingOn } from './decided-by.mjs';

export const SCOPES = ['local', 'shared'];

// The files a line names (src/a/b.vue, apps/x/y.css:12), and the one product they all belong to. A line that names a
// system file too, or two products, is no one product's: null.
const FILE = /(?:^|[\s(`'"=])((?:\.{0,2}\/)?(?:[\w@.+-]+\/)+[\w@.+-]+\.[a-z]{1,6})(?::\d+)?/gi;
export function productIn(text, productOf) {
  if (typeof productOf !== 'function') return null;
  const files = [...new Set([...String(text ?? '').matchAll(FILE)].map((m) => m[1]).filter((f) => !/^https?:/.test(f) && !/\/\//.test(f)))];
  if (!files.length) return null;
  const names = new Set(files.map((f) => { try { return productOf(f) ?? ''; } catch { return ''; } }));
  return names.size === 1 && !names.has('') ? [...names][0] : null;
}

// Where each component is used, as the audit last wrote it: the catalog's livesIn, else each contract's. No new read of
// the products. → { name: livesIn }
export function usageFrom(ROOT, cfg = {}) {
  const dir = resolve(ROOT, cfg.contracts?.out ?? 'contracts');
  const out = {};
  try { for (const [n, e] of Object.entries(JSON.parse(readFileSync(join(dir, 'catalog.json'), 'utf8')).components ?? {})) if (e?.livesIn) out[n] = e.livesIn; } catch { /* no catalog */ }
  if (Object.keys(out).length) return out;
  const walk = (d) => { let es = []; try { es = readdirSync(d, { withFileTypes: true }); } catch { return; } for (const x of es) { const p = join(d, x.name); if (x.isDirectory()) walk(p); else if (x.name.endsWith('.contract.json')) { try { const c = JSON.parse(readFileSync(p, 'utf8')); if (c.livesIn && c.name) out[c.name] = c.livesIn; } catch { /* unreadable */ } } } };
  walk(dir);
  return out;
}

// The products whose code uses a component (the system's own pages are not a product). → [names] or null when unknown
const productsUsing = (usage, component) => {
  const l = component ? usage?.[component] ?? Object.entries(usage ?? {}).find(([n]) => n.toLowerCase() === String(component).toLowerCase())?.[1] : null;
  return l ? (l.products ?? []).map((p) => p?.name).filter(Boolean) : null;
};
const UNDO = { remove: 'hard', rename: 'hard', breaking: 'hard', change: 'medium', add: 'easy', fix: 'easy' };
const UNDO_SAID = { hard: 'hard to undo', medium: 'can be undone', easy: 'easy to undo' };
const listed = (names, most = 3) => names.slice(0, most).join(', ') + (names.length > most ? ` and ${names.length - most} more` : '');

export function scopeOf(item = {}, { usage = {}, owners = null } = {}) {
  const change = UNDO[item.change] ? item.change : 'change';
  const undo = UNDO[change];
  const using = Array.isArray(item.reach) ? item.reach : productsUsing(usage, item.component);
  const reach = typeof item.reach === 'number' ? item.reach : using ? using.length : null;
  const unplaced = item.home !== 'system' && item.home !== 'product';
  const ambiguous = !!item.ambiguous || unplaced;
  const shared = item.home === 'system' || unplaced;
  const points = (undo === 'hard' ? 2 : undo === 'medium' ? 1 : 0) + (reach == null ? 1 : reach >= 3 ? 2 : reach >= 1 ? 1 : 0) + (ambiguous ? 1 : 0);
  const risk = !shared ? (undo === 'hard' || ambiguous ? 'medium' : 'low') : points >= 3 ? 'high' : points >= 2 ? 'medium' : 'low';
  const what = String(item.what ?? item.component ?? 'it').trim();
  let reason;
  if (shared) {
    const where = unplaced ? `the engine cannot tell whether ${what} stays in one product` : `${what} is the system's`;
    const who = reach == null ? 'every product that uses it gets the change' : reach === 0 ? 'no product\'s code uses it yet, every new one gets it' : `${reach} product${reach === 1 ? '' : 's'} use${reach === 1 ? 's' : ''} it${using?.length ? ` (${listed(using)})` : ''}`;
    reason = `${where}: ${who}; ${UNDO_SAID[undo]}${ambiguous && !unplaced ? ', and it is a decision' : ''}`;
  } else {
    reason = `${what} stays in ${item.product ? item.product : 'one product'}: no other product gets it; ${UNDO_SAID[undo]}`;
  }
  const decider = shared ? ownerOf(owners, ...[item.component, item.area, item.kind === 'token' ? 'tokens' : null, 'system'].filter(Boolean)) : null;
  return { scope: shared ? 'shared' : 'local', reason: `${shared ? 'Shared' : 'Local'}: ${reason}, ${risk} risk.`, risk, undo, reach, ambiguous, decider };
}

// A task on the style guide's Tasks list: one about a product (its page, its screens, its version, a retired token it
// still swaps in its own code) is the product's; the rest (the system's tokens, its text styles, a decision on a
// component's file, the modes) is the system's.
export function todoScope(t = {}, ctx = {}) {
  const product = t.product ?? (/^Products$/.test(t.area ?? '') ? String(t.type ?? '').split(',')[0].trim() || null : null) ?? productIn([t.file, t.where, t.todo].filter(Boolean).join(' '), ctx.productOf);
  const ofProduct = !!product || /^Pages,/.test(t.type ?? '') || (t.kind === 'Retired' && t.who === 'code');
  const change = t.kind === 'Retired' && t.who !== 'code' ? 'remove' : t.who === 'both' ? 'change' : 'fix';
  return scopeOf({ home: ofProduct ? 'product' : 'system', kind: t.kind, change, what: ofProduct ? (product ? `${product}'s ${String(t.kind ?? 'task').toLowerCase()}` : 'the products\' own pages') : t.component ?? (t.kind ? `the system's ${String(t.kind).toLowerCase()}` : 'the system'), component: t.component ?? null, product, area: t.area, ambiguous: t.who === 'both' }, ctx);
}

// An agent's edit, by the file it changes: the theme or a system component's code is the system's (what it removes or
// renames is hard to undo, what it adds is easy); any other file is the product's own (or the system's own pages, which
// no product gets). files: { theme: Set of theme paths, components: Map of code path → contract }.
export function editScope({ file, before = '', after = '', root = process.cwd(), files = null, productOf = null } = {}, ctx = {}) {
  const rel = String(relative(resolve(root), resolve(root, String(file ?? '')))).split('\\').join('/');
  const decl = (css) => new Set([...String(css ?? '').matchAll(/(?:^|[;{\s])(--[\w-]+)\s*:/g)].map((m) => m[1]));
  if (files?.theme?.has(rel)) {
    const had = decl(before), now = decl(after);
    const gone = [...had].filter((t) => !now.has(t)), added = [...now].filter((t) => !had.has(t));
    return scopeOf({ home: 'system', kind: 'token', change: gone.length ? 'remove' : added.length ? 'add' : 'change', what: gone.length ? `removing ${listed(gone, 2)} from the theme` : added.length ? `the token ${listed(added, 2)}` : 'the theme' }, ctx);
  }
  const c = files?.components?.get(rel);
  if (c) {
    const name = c.name ?? String(c.id ?? '').replace(/^[^.]+\./, '');
    const opts = (c.props ?? []).flatMap((p) => (p.options ?? []).map(String));
    const gone = opts.filter((o) => new RegExp(`(['"\`])${o.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\1`).test(before) && !new RegExp(`(['"\`])${o.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\1`).test(after));
    return scopeOf({ home: 'system', kind: 'component', change: gone.length ? 'remove' : 'change', what: gone.length ? `removing ${name}'s ${listed(gone, 2)}` : `${name}'s code`, component: name }, ctx);
  }
  const product = productOf ? productOf(resolve(root, rel)) : null;
  return scopeOf({ home: 'product', kind: 'page', change: 'fix', what: rel, product }, ctx);
}

// A change made in Figma through the engine (component-change.mjs): the system's component, breaking when it removes
// what a product may lean on, an addition when all it does is add.
export function changeScope(ch = {}, ctx = {}) {
  const change = (ch.breaking ?? []).length ? 'breaking' : (ch.held ?? []).length ? 'add' : 'change';
  const reach = ch.usedBy?.products ? ch.usedBy.products.filter((p) => !/^the system's own pages/.test(p)).map((p) => p.replace(/ \(\d+ files?\)$/, '')) : undefined;
  return scopeOf({ home: 'system', kind: 'figma', change, what: `${ch.component}'s Figma component`, component: ch.component, ...(reach ? { reach } : {}) }, ctx);
}

// A proposal of the intent layer's (intent-proposals.mjs), by the page it is about: a flow's or a page's (a product's
// own screens) stays in that product; a component's, a template's, a pattern's or a foundation's is what every product
// reads, so it is shared. An Add is a component with no page yet, so the system's. What a yes does sets how hard it is
// to undo: a page written or a name kept is easy, a page moved can be undone, a decision withdrawn is a decision.
const PRODUCT_LAYERS = new Set(['flows', 'pages']);
export function proposalScope(x = {}, { page = null } = {}, ctx = {}) {
  const ofProduct = !!page && (PRODUCT_LAYERS.has(page.layer) || !!page.product);
  const component = page ? page.component ?? page.about?.partOf ?? page.about?.is ?? null : x.subject ?? null;
  const change = x.kind === 'add' ? 'add' : x.kind === 'move' ? 'change' : x.kind === 'recheck' ? 'change' : 'fix';
  const what = page ? `${page.name}'s page` : `${x.subject}'s page`;
  return scopeOf({ home: ofProduct ? 'product' : 'system', kind: 'page', change, what, component: ofProduct ? null : component, product: page?.product ?? null, ambiguous: !!x.split }, ctx);
}

// A difference the engine opens an issue for: one about a product (its screen, its own CSS: a control a product's page
// builds by hand where the system has the component) is that product's; one about a component, a token or Figma is the
// system's. A finding with no product of its own is given the one the files it names belong to (ctx.productOf).
const PRODUCT_CHECK = /^No hand-built DS components/i;
export function findingScope(f = {}, ctx = {}) {
  const product = f.product ?? productIn([f.file, f.evidence].filter(Boolean).join(' '), ctx.productOf);
  if (product || f.home === 'product' || PRODUCT_CHECK.test(String(f.check ?? ''))) return scopeOf({ home: 'product', kind: f.check ?? 'finding', change: 'fix', what: f.component ? `${f.component} in ${product ?? 'a product\'s own screen'}` : `${product ? `${product}'s` : 'a product\'s'} own screen`, product }, ctx);
  return scopeOf({ home: 'system', kind: f.component ? 'component' : 'token', change: 'fix', what: f.component ?? (f.check ? `the system's ${String(f.check).toLowerCase()}` : 'the system'), component: f.component ?? null }, ctx);
}
// The one line an issue's body says it in: "Shared: waits on Cards team — <reason>" or "Local: the product team's own —
// <reason>".
export function issueScopeLine(sc) {
  if (!sc) return '';
  const why = String(sc.reason ?? '').replace(/^(Shared|Local):\s*/, '');
  return sc.scope === 'shared' ? `Shared: waits on ${sc.decider?.name ?? 'whoever decides for the system (ds-config.json owners)'} — ${why}` : `Local: the product team's own — ${why}`;
}

// A component only one side has. Only in Figma, not built yet: the system's to build, shared. Only in the code: one
// product's own when only one product's code uses it (the usage map), local; else the system's, shared.
export function sideScope({ name, side = 'code', file = null } = {}, ctx = {}) {
  if (side === 'figma') return scopeOf({ home: 'system', kind: 'component', change: 'add', what: name, component: name, reach: productsUsing(ctx.usage, name) ?? [] }, ctx);
  const using = productsUsing(ctx.usage, name);
  if (using?.length === 1) return scopeOf({ home: 'product', kind: 'component', change: 'change', what: `${name}${file ? ` (${file})` : ''}`, product: using[0] }, ctx);
  return scopeOf({ home: 'system', kind: 'component', change: 'change', what: name, component: name }, ctx);
}

// How many of each, and on whom the shared ones wait. items: [{ scope: { scope, decider } }] or the scopes themselves.
export function scopeSummary(items = []) {
  const scopes = items.map((x) => x?.scope && typeof x.scope === 'object' ? x.scope : x).filter((s) => s && SCOPES.includes(s.scope));
  const shared = scopes.filter((s) => s.scope === 'shared');
  return { shared: shared.length, local: scopes.length - shared.length, waiting: waitingOn(shared) };
}
export function scopeLine(s) {
  if (!s || (!s.shared && !s.local)) return '';
  const on = s.waiting?.length ? `, waiting on ${s.waiting.map((w) => `${w.name} (${w.n})`).join(', ')}` : s.shared ? ', with no owner named (ds-config.json owners)' : '';
  return [s.shared ? `${s.shared} shared${on}` : '', s.local ? `${s.local} local, each product team's own` : ''].filter(Boolean).join('; ');
}
