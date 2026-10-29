// releases.mjs - which system version each product uses, and what a newer one changes for it.
//
// Each time the contracts are published with a breaking change (a prop, an option or a state removed, a default
// changed, a token removed: contract-gen.mjs), the release is recorded with the system's version, the day and what
// broke, in design-system-engine-releases.json (committed), and the day by which the products move to it (the release's
// day and ds-config.json migrationDays, 90 by default). Each product says the version it uses: ds-config.json products
// { "<name>": { "dir": "<folder>", "uses": "<version>" } }, or, for a product in its own folder (products or pluginDirs),
// its package.json's dependency on the system's package. A product behind is then told, release by release, which of
// the changes since its version its own files touch (a component by its name or its tag, a token by its CSS name), and
// by when: a report that blocks nothing. A product past that day still on an older version is named as late.
import { existsSync, readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join, resolve, relative } from 'node:path';

export const RELEASES_FILE = 'design-system-engine-releases.json';
const SKIP = /^(node_modules|dist|build|coverage|\.git|\.design-system-engine-out)$/;

const nums = (v) => String(v ?? '').replace(/^[^\d]*/, '').split(/[.+-]/).slice(0, 3).map((x) => parseInt(x, 10) || 0);
// -1, 0 or 1: a before b, the same, a after b.
export const compareVersions = (a, b) => { const x = nums(a), y = nums(b); for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] < y[i] ? -1 : 1; return 0; };

// The system's version: ds-config.json systemVersion, else its package.json's.
export function systemVersion(ROOT, cfg = {}) {
  if (cfg.systemVersion) return String(cfg.systemVersion);
  try { return JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).version ?? null; } catch { return null; }
}
const systemPackage = (ROOT) => { try { return JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).name ?? null; } catch { return null; } };

export function readReleases(ROOT) {
  try { const j = JSON.parse(readFileSync(join(ROOT, RELEASES_FILE), 'utf8')); return Array.isArray(j.releases) ? j.releases : []; } catch { return []; }
}

// The breaking changes of a publish as the record keeps them: [{ kind: 'component' | 'token', name, says }].
export function changesOf(breaking = []) {
  return breaking.filter((c) => c?.level === 'breaking' && !/bump the major/.test(c.msg ?? '')).map((c) => {
    const token = /^token "([^"]+)"/.exec(c.msg ?? '');
    return token ? { kind: 'token', name: c.ref ?? token[1], says: c.msg } : { kind: 'component', name: String(c.msg ?? '').split(':')[0].trim(), says: c.msg };
  });
}

// Record a release: one entry per version (a publish of the same version again replaces its changes).
export function recordRelease(ROOT, { version, changes, at = new Date().toISOString(), days = 90 }) {
  if (!version || !changes?.length) return null;
  const all = readReleases(ROOT).filter((r) => r.version !== version);
  const moveBy = new Date(Date.parse(at) + days * 864e5).toISOString().slice(0, 10);
  const entry = { version, at, moveBy, changes };
  all.push(entry);
  all.sort((a, b) => compareVersions(a.version, b.version));
  writeFileSync(join(ROOT, RELEASES_FILE), JSON.stringify({ version: 1, $description: 'The system\'s releases with a breaking change: what broke and the day by which the products move. Written by rms-design-system-engine --contracts-out; commit it.', releases: all }, null, 1) + '\n');
  return entry;
}

// The products and the version each uses. → [{ name, dir, uses, from }]
export function productsOf(ROOT, cfg = {}) {
  const pkg = systemPackage(ROOT), out = new Map();
  const fromPackage = (dir) => { try { const j = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')); const v = pkg && ({ ...j.dependencies, ...j.devDependencies, ...j.peerDependencies })[pkg]; return v ? String(v).replace(/^[\^~>=<\s]+/, '') : null; } catch { return null; } };
  for (const [name, d] of Object.entries(cfg.pluginDirs ?? {})) { const dir = resolve(ROOT, d); out.set(name, { name, dir, uses: fromPackage(dir), from: 'package.json' }); }
  for (const [name, p] of Object.entries(cfg.products ?? {})) {
    const dir = p?.dir ? resolve(ROOT, p.dir) : out.get(name)?.dir ?? null;
    out.set(name, { name, dir, uses: p?.uses ? String(p.uses) : (dir ? fromPackage(dir) : null) ?? out.get(name)?.uses ?? null, from: p?.uses ? 'ds-config.json' : 'package.json' });
  }
  return [...out.values()];
}

// A product's own source files, read once. → [{ file, text }]
function filesOf(dir, limit = 4000) {
  const out = [];
  const walk = (d) => {
    if (out.length >= limit) return;
    let es; try { es = readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of es) {
      if (SKIP.test(e.name)) continue;
      const p = join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.(vue|svelte|jsx?|tsx?|html|css|scss)$/.test(e.name)) { try { out.push({ file: relative(dir, p), text: readFileSync(p, 'utf8') }); } catch { /* unreadable */ } }
    }
  };
  if (dir && existsSync(dir)) walk(dir);
  return out;
}

// What the releases after a product's version change for it: each change its files touch, with those files.
// cssOf(token) → the token's custom property. → { product, uses, latest, behind: [{ version, moveBy, late, touched: [{ change, files }] }] }
export function productImpact(product, releases = [], { cssOf = (t) => `--${String(t).split('/').join('-')}`, today = new Date().toISOString().slice(0, 10), files = null } = {}) {
  const latest = releases.length ? releases[releases.length - 1].version : null;
  const after = releases.filter((r) => !product.uses || compareVersions(r.version, product.uses) > 0);
  const read = files ?? filesOf(product.dir);
  const kebab = (n) => String(n).replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
  const behind = after.map((r) => ({
    version: r.version, moveBy: r.moveBy, late: !!(r.moveBy && r.moveBy < today && product.uses),
    touched: r.changes.map((c) => {
      const words = c.kind === 'token' ? [cssOf(c.name), c.name] : [c.name, kebab(c.name)];
      const hit = read.filter((f) => words.some((w) => new RegExp(`(^|[^\\w-])${w.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}(?![\\w-])`, 'i').test(f.text))).map((f) => f.file);
      return { change: c, files: hit };
    }).filter((t) => t.files.length),
  }));
  return { product: product.name, uses: product.uses, latest, behind };
}

// The lines for the person, one block a product.
export function impactLines(impacts = []) {
  const lines = [];
  for (const i of impacts) {
    if (!i.behind.length) { lines.push(`${i.product}: on ${i.uses ?? 'a version it does not say'}${i.latest ? `, nothing since that breaks it (latest ${i.latest})` : ''}.`); continue; }
    const hits = i.behind.flatMap((b) => b.touched);
    lines.push(`${i.product}: on ${i.uses ?? 'a version it does not say'}, ${i.behind.length} release${i.behind.length === 1 ? '' : 's'} behind (latest ${i.latest})${hits.length ? `; ${hits.length} change${hits.length === 1 ? '' : 's'} since touch its files:` : ', and none of their changes touch its files.'}`);
    for (const b of i.behind) for (const t of b.touched.slice(0, 8)) lines.push(`  ${b.version}${b.late ? ` (move by ${b.moveBy}: late)` : b.moveBy ? ` (move by ${b.moveBy})` : ''}: ${t.change.says} - ${t.files.slice(0, 3).join(', ')}${t.files.length > 3 ? ` and ${t.files.length - 3} more` : ''}`);
  }
  return lines;
}
