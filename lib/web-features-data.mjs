// web-features-data.mjs - the web platform's own support data, pinned and cached, for the browser support check.
//
// The browser support check (web-features.mjs) kept a table of its own of which browser version runs which feature,
// curated by hand: it goes stale, and a stale one passes a feature a team's browser does not run. The browser vendors
// keep the same facts as data (web-features, the Baseline data behind the platform's reference documentation and its
// compatibility tables, Apache-2.0). This keeps one pinned copy of it in the engine's own cache, as axe-core is kept:
// downloaded once from the npm registry, checked against its pinned SHA-384, never put in the project, and moved only
// through a pull request that says what passed (pinned-standards.mjs watches the version). The engine's own table stays
// as the whole path for a run with no copy (offline, never fetched) or with the data turned off
// (ds-config.json → "webFeatures": { "data": false }).
//
// The version and the hash move together, always: a version raised on its own leaves every download refused and the
// check on its table. Read the new file's hash and set both in the same edit:
//   node -e "import('./lib/web-features-data.mjs').then(async (m) => console.log(await m.hashOf('<version>')))"
//
//   WF_VERSION, WF_SHA384
//   wfCachePath(home)            → where the pinned copy is kept
//   cachedWebFeatures(home)      → the parsed data from the cache, when it is there and whole, else null
//   fetchWebFeatures(opts)       → the parsed data: the cache, else downloaded, checked and cached; null when neither
//   hashOf(version)              → the SHA-384 of that version's data.json (for raising the pin)
import { readFileSync, writeFileSync, mkdirSync, renameSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { fileFromTgz } from './a11y-check.mjs';

export const WF_VERSION = '3.47.0';
export const WF_SHA384 = '8MpV254LZQ7HvXpvLRd+LD6peamNWl0nVZ81G5eM2ppZBPZtqeF9v09mT+3+E4t8';

const intact = (s) => typeof s === 'string' && createHash('sha384').update(s).digest('base64') === WF_SHA384;
const tarball = (version) => `https://registry.npmjs.org/web-features/-/web-features-${version}.tgz`;

export const wfCachePath = (home = homedir()) => join(home, '.cache', 'rms-design-system-engine', `web-features-${WF_VERSION}.json`);

export function cachedWebFeatures(home = homedir()) {
  try { const s = readFileSync(wfCachePath(home), 'utf8'); return intact(s) ? JSON.parse(s) : null; } catch { return null; }
}

// get: how the package is downloaded (the registry by default; a test hands its own).
export async function fetchWebFeatures({ home = homedir(), get = null } = {}) {
  const had = cachedWebFeatures(home);
  if (had) return had;
  let s;
  try {
    const buf = get ? await get(tarball(WF_VERSION)) : Buffer.from(await (await fetch(tarball(WF_VERSION), { signal: AbortSignal.timeout(30000) })).arrayBuffer());
    s = fileFromTgz(buf, 'package/data.json');
  } catch { return null; }
  if (!intact(s)) return null;   // not the pinned file: never read it
  // Written beside it, then moved into place: several runs at once never read half a file.
  try { const at = wfCachePath(home); mkdirSync(dirname(at), { recursive: true }); const tmp = `${at}.${process.pid}.tmp`; writeFileSync(tmp, s); renameSync(tmp, at); } catch { /* the cache is optional */ }
  try { return JSON.parse(s); } catch { return null; }
}

export async function hashOf(version) {
  const buf = Buffer.from(await (await fetch(tarball(version))).arrayBuffer());
  return createHash('sha384').update(fileFromTgz(buf, 'package/data.json')).digest('base64');
}

// Only run when invoked directly: the install and --update fetch it, so a first run offline still reads the data.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href && process.argv.includes("--fetch")) {
  fetchWebFeatures().then((d) => console.log(d ? `✅ web-features ${WF_VERSION} is ready for the browser support check (${wfCachePath()}).` : `⚠️  web-features ${WF_VERSION} could not be downloaded: the browser support check uses its own table until it can.`));
}
