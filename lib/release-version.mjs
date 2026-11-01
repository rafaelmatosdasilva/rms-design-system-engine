// release-version.mjs - the next release tag, for .github/workflows/release.yml.
//
// Releases are automatic: once a week, when main has commits since the last tag, the workflow tags the next
// version and publishes a GitHub Release whose notes list the pull requests merged since the one before.
// How big the step is comes from the pull requests themselves: each one carries a label chosen when it is opened.
//   release: major  - something that works differently for people already using the engine (v1.4.2 -> v2.0.0)
//   release: minor  - a new capability (v1.4.2 -> v1.5.0); a pull request with no release label counts as this
//   release: patch  - a fix, docs or internal work only (v1.4.2 -> v1.4.3)
// The biggest step among the merged pull requests wins. The first release takes the version in package.json.
//
//   node release-version.mjs <last tag or ""> <package.json version> [labels of each PR, as a JSON array of arrays]
//     -> prints the next tag

import { pathToFileURL } from 'node:url';

const SEMVER = /^v?(\d+)\.(\d+)\.(\d+)$/;
const ORDER = ['patch', 'minor', 'major'];
export const RELEASE_LABELS = { major: 'release: major', minor: 'release: minor', patch: 'release: patch' };

// The step for one release: the biggest step any merged pull request asks for.
export function bumpFor(prLabels = []) {
  if (!prLabels.length) return 'patch';
  let best = 0;
  for (const labels of prLabels) {
    const own = ORDER.filter((b) => (labels || []).includes(RELEASE_LABELS[b]));
    const step = own.length ? Math.max(...own.map((b) => ORDER.indexOf(b))) : ORDER.indexOf('minor');
    best = Math.max(best, step);
  }
  return ORDER[best];
}

export function nextVersion(lastTag, bump, pkgVersion) {
  if (!ORDER.includes(bump)) throw new Error(`unknown bump "${bump}": use patch, minor or major`);
  const last = String(lastTag || '').trim();
  if (!last) {
    if (!SEMVER.test(pkgVersion)) throw new Error(`package.json version "${pkgVersion}" is not x.y.z`);
    return 'v' + pkgVersion.replace(/^v/, '');
  }
  const m = last.match(SEMVER);
  if (!m) throw new Error(`last tag "${last}" is not vX.Y.Z`);
  let [maj, min, pat] = m.slice(1).map(Number);
  if (bump === 'major') { maj += 1; min = 0; pat = 0; }
  else if (bump === 'minor') { min += 1; pat = 0; }
  else pat += 1;
  return `v${maj}.${min}.${pat}`;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [lastTag = '', pkgVersion = '', labelsJson = '[]'] = process.argv.slice(2);
  try { console.log(nextVersion(lastTag, bumpFor(JSON.parse(labelsJson)), pkgVersion)); }
  catch (e) { console.error(e.message); process.exit(1); }
}
