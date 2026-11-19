// release-sbom.mjs - the release's software bill of materials, for .github/workflows/release.yml.
//
// What a release is made of, in CycloneDX 1.6 JSON, the format procurement and security scanners read: the engine
// itself (its version, licence, the archive's SHA-256 and where its source is) and what it ships with. It ships with
// no npm dependency, so that list is empty, and says so rather than leaving it out. axe-core is the one piece the
// installer downloads beside it, for the accessibility checks: listed as optional, at the version the engine pins.
// Chrome, Node and TypeScript are the person's own and not listed. The test tools are never shipped.
//
//   node release-sbom.mjs <tag> <archive> [timestamp]  -> prints the SBOM
//   sbom({ tag, sha256, axe, timestamp })              -> the SBOM as an object

import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = 'https://github.com/rafaelmatosdasilva/rms-design-system-engine';

// The axe-core version the accessibility check pins (a11y-check.mjs), read from its source as pinned-standards does.
export const axeVersion = () => /const AXE_VERSION = '([^']+)'/.exec(readFileSync(join(HERE, 'a11y-check.mjs'), 'utf8'))?.[1] ?? null;

export function sbom({ tag, sha256, axe = axeVersion(), timestamp = new Date().toISOString() }) {
  const version = String(tag).replace(/^v/, '');
  const ref = `pkg:npm/rms-design-system-engine@${version}`;
  const axeRef = axe ? `pkg:npm/axe-core@${axe}` : null;
  return {
    bomFormat: 'CycloneDX',
    specVersion: '1.6',
    serialNumber: `urn:uuid:${uuidOf(`${ref}:${sha256}`)}`,
    version: 1,
    metadata: {
      timestamp,
      component: {
        type: 'application',
        'bom-ref': ref,
        name: 'rms-design-system-engine',
        version,
        purl: ref,
        licenses: [{ license: { id: 'MIT' } }],
        hashes: sha256 ? [{ alg: 'SHA-256', content: sha256 }] : [],
        externalReferences: [
          { type: 'vcs', url: REPO },
          { type: 'distribution', url: `${REPO}/releases/tag/${tag}` },
          { type: 'security-contact', url: `${REPO}/security/advisories/new` },
        ],
      },
    },
    components: axeRef ? [{
      type: 'library',
      'bom-ref': axeRef,
      name: 'axe-core',
      version: axe,
      purl: axeRef,
      scope: 'optional',
      licenses: [{ license: { id: 'MPL-2.0' } }],
      description: 'Downloaded by the installer for the accessibility checks; not inside the archive.',
    }] : [],
    // The engine needs nothing to run but Node: its own entry says so, with no package under it.
    dependencies: [{ ref, dependsOn: [] }],
  };
}

// A stable UUID (version 5 style, from SHA-1) for one release's SBOM: the same release, the same serial number.
function uuidOf(text) {
  const h = createHash('sha1').update(text).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-${((parseInt(h[16], 16) & 3) | 8).toString(16)}${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const [tag, archive, timestamp] = process.argv.slice(2);
  if (!tag || !archive) { console.error('node release-sbom.mjs <tag> <archive> [timestamp]'); process.exit(2); }
  const sha256 = createHash('sha256').update(readFileSync(archive)).digest('hex');
  process.stdout.write(JSON.stringify(sbom({ tag, sha256, ...(timestamp ? { timestamp } : {}) }), null, 2) + '\n');
}
