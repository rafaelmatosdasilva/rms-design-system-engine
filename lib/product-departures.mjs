// product-departures.mjs - the signs a product has quietly left the system, gathered per product.
//
// One product left on an older version is already a gate (releases.mjs, --products). A product leaves in other ways
// too, and each is a need the system did not meet: it stopped upgrading (so many versions behind, for so long), it
// copied one of the system's components and changed it (system-advice.mjs productCopies, the near-copies), or it built
// its own component beside the system's (its own Button, its own Modal where the system has a dialog). Said together,
// one block a product, each with what the product built instead and where, so the system's team can ask what it needed.
// A product on the latest version with no copy and no component of its own says nothing.
//
// Pure, but versionsOf, which reads the system's git tags.
import { spawnSync } from 'node:child_process';
import { compareVersions } from './releases.mjs';

const nums = (v) => String(v ?? '').replace(/^[^\d]*/, '').split(/[.+-]/).slice(0, 3).map((x) => parseInt(x, 10) || 0);
const squash = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

// The system's versions, each with the day it came out when anything says: its version tags (v1.2.0, an annotated
// tag's own date, else its commit's) and the releases it recorded (design-system-engine-releases.json).
// → [{ version, at }] in version order.
export function versionsOf(ROOT, releases = []) {
  const out = new Map();
  const r = spawnSync('git', ['for-each-ref', '--format=%(refname:short)%09%(creatordate:iso-strict)', 'refs/tags/v[0-9]*'], { cwd: ROOT, encoding: 'utf8', timeout: 5000 });
  for (const line of r.status === 0 ? String(r.stdout ?? '').split('\n') : []) {
    const [tag, at] = line.split('\t');
    if (tag && /^v\d+(\.\d+){0,2}$/.test(tag)) out.set(tag.slice(1), { version: tag.slice(1), at: at || null });
  }
  for (const x of releases ?? []) if (x?.version && !out.get(String(x.version))?.at) out.set(String(x.version), { version: String(x.version), at: x.at ?? null });
  return [...out.values()].sort((a, b) => compareVersions(a.version, b.version));
}

// How far a product's version is from the system's latest. versions: versionsOf's list (may be empty).
// → null when it is on the latest (or either is unknown), else { uses, latest, majors, minors, since, at, days }:
// majors and minors behind (counted over the versions the system lists, else from the numbers), and, when the version
// after the product's has a day, that version, its day and the days since.
export function versionGap(uses, latest, versions = [], { today = new Date().toISOString().slice(0, 10) } = {}) {
  if (!uses || !latest || compareVersions(uses, latest) >= 0) return null;
  const [um, un] = nums(uses), [lm, ln] = nums(latest);
  const after = versions.filter((v) => compareVersions(v.version, uses) > 0 && compareVersions(v.version, latest) <= 0);
  const majors = lm - um;
  let minors;
  if (after.length) {
    // Each minor line after the product's, a major's own x.0 counted as the major it is.
    minors = new Set(after.map((v) => nums(v.version)).filter(([m, n]) => (m === um && n > un) || (m > um && n > 0)).map(([m, n]) => `${m}.${n}`)).size;
  } else minors = majors ? ln : ln - un;
  const first = after[0] ?? null;
  const days = first?.at ? Math.max(0, Math.round((Date.parse(today) - Date.parse(first.at.slice(0, 10))) / 864e5)) : null;
  return { uses, latest, majors, minors, since: first?.at ? first.version : null, at: first?.at ? first.at.slice(0, 10) : null, days };
}

// Names that are the same component under another word: a product's own Modal is a parallel of the system's dialog.
export const ALIASES = [['dialog', 'modal'], ['toast', 'snackbar'], ['switch', 'toggle'], ['chip', 'tag']];

// The components a file defines, by the names it gives them, each with its line: a Vue or Svelte file (by its file's
// name, or a name: '…' it gives itself), a function, class or arrow component in JSX or TSX whose name starts with a
// capital, and a custom element (by its tag's last word). → [{ name, line }]
export function definedComponents(file, text) {
  const t = String(text ?? ''), out = [];
  const at = (i) => t.slice(0, i).split('\n').length;
  const base = String(file).split('/').pop().replace(/\.[^.]+$/, '');
  if (/\.(vue|svelte)$/i.test(file)) {
    const named = /\bname:\s*['"]([A-Za-z][\w-]*)['"]/.exec(t);
    out.push({ name: named ? named[1] : base, line: named ? at(named.index) : 1 });
  }
  if (/\.(jsx|tsx)$/i.test(file) || (/\.(js|ts)$/i.test(file) && /<[A-Za-z][\w.]*[\s/>]|React\.createElement\(/.test(t))) {
    for (const m of t.matchAll(/^\s*(?:export\s+(?:default\s+)?)?(?:function|class)\s+([A-Z][A-Za-z0-9]*)\b|^\s*(?:export\s+)?const\s+([A-Z][A-Za-z0-9]*)\s*(?::[^=]+)?=\s*(?:\([^)]*\)|[A-Za-z_]\w*)\s*=>|^\s*(?:export\s+)?const\s+([A-Z][A-Za-z0-9]*)\s*=\s*(?:React\.)?(?:forwardRef|memo)\(/gm)) {
      out.push({ name: m[1] ?? m[2] ?? m[3], line: at(m.index + m[0].search(/[A-Z]/)) });
    }
  }
  for (const m of t.matchAll(/customElements\.define\(\s*['"]([a-z][\w-]*-([a-z][\w]*))['"]/g)) out.push({ name: m[2], tag: m[1], line: at(m.index) });
  const seen = new Set();
  return out.filter((c) => !seen.has(squash(c.name)) && seen.add(squash(c.name)));
}

// A component a product defines beside one of the system's: the same name, the product's own name before it
// (ShopButton in shop), or a known alias of it (Modal where the system has a dialog). A file that brings in the
// system's package, or draws with the system's own class for that component, wraps the system's and is no parallel.
// files: [{ file, text }]. components: the system's names. → [{ file, line, name, like }]
export function parallelComponents(files, components, { product = '', pkg = null, classes = {} } = {}) {
  const sys = new Map(components.map((n) => [squash(n), n]));
  const alias = new Map();
  for (const pair of ALIASES) for (const a of pair) for (const b of pair) if (a !== b && sys.has(squash(b)) && !sys.has(squash(a))) alias.set(squash(a), sys.get(squash(b)));
  const own = squash(product);
  const esc = (s) => String(s).replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
  const imports = pkg ? new RegExp(`(?:from\\s+|import\\s*\\(?\\s*|require\\(\\s*)['"]${esc(pkg)}(?:/[^'"]*)?['"]`) : null;
  const out = [];
  for (const { file, text } of files ?? []) {
    if (/\.(test|spec|stories)\./.test(file)) continue;
    if (imports && imports.test(String(text ?? ''))) continue;
    for (const c of definedComponents(file, text)) {
      let k = squash(c.name);
      if (own && k.startsWith(own) && k.length > own.length) k = k.slice(own.length);
      const like = sys.get(k) ?? alias.get(k);
      if (!like) continue;
      const cls = typeof classes[like] === 'string' && /^\.[\w-]+$/.test(classes[like]) ? classes[like].slice(1) : null;
      if (cls && new RegExp(`class(?:Name)?\\s*=\\s*["'{\`][^"'}\`]*(?<![\\w-])${esc(cls)}(?![\\w-])`).test(String(text ?? ''))) continue;
      out.push({ file, line: c.line, name: c.tag ?? c.name, like });
    }
  }
  return out;
}

// One record a product: { product, gap, forks, parallels }, only for a product with something to say.
// products: [{ name, uses }]. copies: productCopies's rows, each with the product it is in (productOf(copy) → name).
export function departures({ products = [], latest = null, versions = [], copies = [], parallels = {}, productOf = (c) => c.product, today } = {}) {
  const out = [];
  for (const p of products) {
    const gap = versionGap(p.uses, latest, versions, today ? { today } : {});
    const forks = copies.filter((c) => productOf(c) === p.name);
    const own = parallels[p.name] ?? [];
    if (gap || forks.length || own.length) out.push({ product: p.name, gap, forks, parallels: own });
  }
  return out;
}

// The lines, one block a product: a head, then each need it shows with what it built instead.
export function departureLines(list = []) {
  const lines = [];
  for (const d of list) {
    const n = (d.gap ? 1 : 0) + d.forks.length + d.parallels.length;
    lines.push(`${d.product} has left the system in ${plural(n, 'place')}, each a need the system does not meet yet (ask its team what it needed):`);
    if (d.gap) {
      const g = d.gap, parts = [g.majors ? plural(g.majors, 'major') : null, g.minors ? plural(g.minors, 'minor') : null].filter(Boolean);
      lines.push(`   · stopped upgrading: on ${g.uses}, ${parts.length ? `${parts.join(' and ')} behind` : 'behind'} ${g.latest}${g.days != null ? `, for ${plural(g.days, 'day')} (${g.since} came out on ${g.at})` : ''}`);
    }
    for (const f of d.forks.slice(0, 8)) lines.push(`   · copied ${f.like} and changed it: ${f.file}:${f.line}  .${f.cls} (${f.same} of ${f.of} declarations alike${f.differ?.length ? `, differs in ${f.differ.slice(0, 4).join(', ')}` : ''})`);
    for (const x of d.parallels.slice(0, 8)) lines.push(`   · built its own ${x.like}: ${x.file}:${x.line}  ${x.name}`);
  }
  return lines;
}
