// Each release carries a software bill of materials (CycloneDX), the file procurement and security scanners ask for:
// the engine with its archive's hash, no npm dependency, and axe-core as the one optional download.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { writeFileSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sbom, axeVersion } from '../lib/release-sbom.mjs';
import { tempDir } from './helpers.mjs';

const ENGINE = dirname(dirname(fileURLToPath(import.meta.url)));

test('the SBOM names the engine, its archive\'s hash, no dependency, and axe-core as optional', () => {
  const b = sbom({ tag: 'v4.3.0', sha256: 'ab'.repeat(32), axe: '4.14.1', timestamp: '2026-11-19T00:00:00Z' });
  assert.equal(b.bomFormat, 'CycloneDX');
  assert.equal(b.specVersion, '1.6');
  assert.match(b.serialNumber, /^urn:uuid:[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  const c = b.metadata.component;
  assert.deepEqual([c.name, c.version, c.purl, c.licenses[0].license.id], ['rms-design-system-engine', '4.3.0', 'pkg:npm/rms-design-system-engine@4.3.0', 'MIT']);
  assert.deepEqual(c.hashes, [{ alg: 'SHA-256', content: 'ab'.repeat(32) }]);
  assert.deepEqual(b.dependencies, [{ ref: c['bom-ref'], dependsOn: [] }], 'nothing to run but Node');
  assert.deepEqual(b.components.map((x) => [x.name, x.version, x.scope]), [['axe-core', '4.14.1', 'optional']]);
  assert.equal(sbom({ tag: 'v4.3.0', sha256: 'ab'.repeat(32), axe: '4.14.1' }).serialNumber, b.serialNumber, 'the same release, the same serial number');
});

test('axe-core is listed at the version the accessibility check pins, and the package has no dependency', () => {
  assert.match(axeVersion() ?? '', /^\d+\.\d+\.\d+$/);
  const pkg = JSON.parse(readFileSync(join(ENGINE, 'package.json'), 'utf8'));
  assert.deepEqual([pkg.dependencies, pkg.optionalDependencies, pkg.peerDependencies], [undefined, undefined, undefined], 'an SBOM that lists no dependency must be true');
});

test('from the command line: the archive\'s SHA-256, as the release workflow runs it', () => {
  const dir = tempDir('sbom-');
  const archive = join(dir, 'rms-design-system-engine-v4.3.0.tar.gz');
  writeFileSync(archive, 'an archive');
  const r = spawnSync(process.execPath, [join(ENGINE, 'lib', 'release-sbom.mjs'), 'v4.3.0', archive], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  const b = JSON.parse(r.stdout);
  assert.equal(b.metadata.component.hashes[0].content, createHash('sha256').update('an archive').digest('hex'));
  assert.equal(spawnSync(process.execPath, [join(ENGINE, 'lib', 'release-sbom.mjs')], { encoding: 'utf8' }).status, 2, 'no tag or archive: it says how to run it');
});

test('the release workflow writes the SBOM beside the archive, signs both and attaches it', () => {
  const wf = readFileSync(join(ENGINE, '.github', 'workflows', 'release.yml'), 'utf8');
  assert.match(wf, /node lib\/release-sbom\.mjs "\$\{\{ steps\.tag\.outputs\.next \}\}" "\$name\.tar\.gz" > "\$name\.cdx\.json"/);
  assert.match(wf, /subject-path: \|\n\s+\$\{\{ env\.ARCHIVE \}\}\n\s+\$\{\{ env\.SBOM \}\}/, 'its provenance is signed with the archive\'s');
  assert.match(wf, /gh release upload [^\n]*"\$SBOM"/);
});
