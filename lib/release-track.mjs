// release-track.mjs - which release of the system a prototype should be held to, and when a newer one is out.
//
// A prototype is pinned to a release of the system (--prototype --pin), and the release that matters is the one the
// team building the feature uses. Nobody writes that down the same way twice, and the products already say it: their
// lockfile, their package.json, or ds-config.json products.uses (releases.mjs productsOf). So the pin is offered the
// release the products use, matched to the system's own tag, and a pin that disagrees with them is said. And a release
// newer than the pinned one is said when the work on a prototype starts, before a page is built on the old one.
//
//   tagFor(repo, version)                 → the system's tag for a version (v2.3.0 or 2.3.0), or null
//   productReleases(ROOT, cfg, { repo })  → [{ name, uses, from, tag }] for each product that says what it uses
//   pinAdvice(products, pinnedRef)        → { offer, disagree: [{ name, uses, tag }], several } for the pin
//   newerReleases(repo, ref)              → the system's release tags after ref, oldest first
//   trackLines({ disagree, newer, pinned }) → the lines a check prints for both
import { spawnSync } from 'node:child_process';
import { productsOf, compareVersions } from './releases.mjs';

const git = (cwd, args) => { const r = spawnSync('git', args, { cwd, encoding: 'utf8', timeout: 10000 }); return r.status === 0 ? r.stdout : ''; };
const RELEASE_TAG = /^v?\d+\.\d+\.\d+$/;
const tagsOf = (repo) => git(repo, ['tag', '--list']).split('\n').map((t) => t.trim()).filter((t) => RELEASE_TAG.test(t));

// A version as a product writes it (2.3.0, ^2.3.0 where no lockfile pinned it, v2.3.0) to the tag that cut it.
export function tagFor(repo, version, tags = tagsOf(repo)) {
  const v = String(version ?? '').replace(/^[\^~=<>\s]+/, '').trim();
  if (!/^v?\d+\.\d+\.\d+/.test(v)) return null;
  const bare = v.replace(/^v/, '');
  return tags.find((t) => t === `v${bare}`) ?? tags.find((t) => t === bare) ?? null;
}

export function productReleases(ROOT, cfg = {}, { repo = ROOT, tags = null } = {}) {
  const all = tags ?? tagsOf(repo);
  return productsOf(ROOT, cfg).filter((p) => p.uses).map((p) => ({ name: p.name, uses: p.uses, from: p.from, tag: tagFor(repo, p.uses, all) }));
}

// The release to offer a new pin, and the products a pin disagrees with. One release the products agree on is the
// offer; several are said, and the person chooses (--system).
export function pinAdvice(products = [], pinnedRef = null) {
  const tags = [...new Set(products.map((p) => p.tag).filter(Boolean))];
  const offer = tags.length === 1 ? tags[0] : null;
  const disagree = pinnedRef ? products.filter((p) => p.tag && p.tag !== pinnedRef) : [];
  return { offer, several: tags.length > 1 ? tags : [], disagree };
}

export function newerReleases(repo, ref, tags = tagsOf(repo)) {
  if (!ref || !RELEASE_TAG.test(ref)) return [];
  return tags.filter((t) => compareVersions(t, ref) > 0).sort(compareVersions);
}

export function trackLines({ disagree = [], newer = [], pinned = null } = {}) {
  const out = [];
  for (const p of disagree) out.push(`the product ${p.name} uses ${p.tag} (${p.from}), and the prototype is pinned to ${pinned}: the team building it reads the system at ${p.tag}`);
  if (newer.length) out.push(`a newer release of the system is out: ${newer.at(-1)}${newer.length > 1 ? ` (${newer.length} since ${pinned})` : ''}. --prototype --against ${newer.at(-1)} says what it would break, before a page is built on ${pinned}`);
  return out;
}
