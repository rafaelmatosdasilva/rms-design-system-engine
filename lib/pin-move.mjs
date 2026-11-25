// pin-move.mjs - a pinned package's new version found, tried and proposed, as DSDS's is (dsds-release.mjs).
//
// pinned-standards.mjs asks every pin's source each week and keeps one issue current while any is behind. For DSDS
// that issue is never needed: its own watch tries the new release and opens a pull request that moves the pin. The
// pins the npm registry can be asked about (axe-core, IBM's checker, web-features, Playwright) had only the issue,
// so each one waited for a person to read it, fetch the new file, work out its hash and edit two lines by hand.
//
// Each of them is pinned twice: its version, and a hash of the file the engine fetches for it, which the engine checks
// before it runs a byte of it. A version raised on its own makes every copy fail that check, and the engine runs
// without the tool, so the two always move together. Here, each pin's move says where both lines are, how the new hash
// is worked out from the registry's own package (the same file the engine fetches), and which tests try it.
//
// .github/workflows/pin-move.yml runs it: a job with nothing it can write moves the pin in its own copy and runs those
// tests (the new version's code runs only there), and a second job, which runs none of it, moves the pin, commits and
// opens one pull request a pin with what passed. A person merges it.
//
//   node lib/pin-move.mjs behind                 → [{ id, pinned, latest }] as JSON: the pins below that are behind
//   node lib/pin-move.mjs hash <id> <version>    → the hash the engine would check for that version
//   node lib/pin-move.mjs move <id> <version> <hash>   → both lines moved, and nothing else
//   node lib/pin-move.mjs tries <id>             → the tests that try it, on one line
//   node lib/pin-move.mjs before <id>            → what to run before them, when the tool needs more than its pin
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ENGINE = dirname(dirname(fileURLToPath(import.meta.url)));
const tgz = (name, version) => `https://registry.npmjs.org/${name}/-/${name.split('/').pop()}-${version}.tgz`;
const fetchBuf = async (url, fetchImpl) => {
  const r = await fetchImpl(url, { signal: AbortSignal.timeout(60000) });
  if (!r.ok) throw new Error(`${url} answered ${r.status}`);
  return Buffer.from(await r.arrayBuffer());
};
const sha384Of = async (name, version, file, fetchImpl) => {
  const { fileFromTgz } = await import('./a11y-check.mjs');
  const inner = fileFromTgz(await fetchBuf(tgz(name, version), fetchImpl), file);
  if (inner == null) throw new Error(`${file} is not in ${name} ${version}`);
  return createHash('sha384').update(inner).digest('base64');
};

// Each pin's two lines, how its hash is worked out, and the tests that hold the engine to what the tool says.
export const MOVES = {
  'axe-core': {
    file: 'lib/a11y-check.mjs',
    version: [/^const AXE_VERSION = '[^']+';$/m, (v) => `const AXE_VERSION = '${v}';`],
    hash: [/^export const AXE_SHA384 = '[^']+';$/m, (h) => `export const AXE_SHA384 = '${h}';`],
    hashOf: (v, f) => sha384Of('axe-core', v, 'package/axe.min.js', f),
    tries: ['test/a11y-check.test.mjs', 'test/a11y-complete.test.mjs'],
  },
  'ibm-equal-access': {
    file: 'lib/a11y-ibm.mjs',
    version: [/^export const IBM_VERSION = '[^']+';$/m, (v) => `export const IBM_VERSION = '${v}';`],
    hash: [/^export const IBM_SHA384 = '[^']+';$/m, (h) => `export const IBM_SHA384 = '${h}';`],
    hashOf: (v, f) => sha384Of('accessibility-checker-engine', v, 'package/ace.js', f),
    tries: ['test/a11y-ibm.test.mjs'],
  },
  'web-features': {
    file: 'lib/web-features-data.mjs',
    version: [/^export const WF_VERSION = '[^']+';$/m, (v) => `export const WF_VERSION = '${v}';`],
    hash: [/^export const WF_SHA384 = '[^']+';$/m, (h) => `export const WF_SHA384 = '${h}';`],
    hashOf: (v, f) => sha384Of('web-features', v, 'package/data.json', f),
    tries: ['test/web-features.test.mjs'],
  },
  playwright: {
    file: 'lib/playwright.mjs',
    version: [/^export const PW_VERSION = '[^']+';$/m, (v) => `export const PW_VERSION = '${v}';`],
    hash: [/^export const PW_INTEGRITY = '[^']+';$/m, (h) => `export const PW_INTEGRITY = '${h}';`],
    hashOf: async (v, f) => `sha512-${createHash('sha512').update(await fetchBuf(tgz('playwright-core', v), f)).digest('base64')}`,
    // Playwright's own browsers are fetched for the version tried, as the suite's Playwright job fetches them.
    before: 'node lib/playwright.mjs --fetch --browsers --with-deps',
    tries: ['test/playwright.test.mjs', 'test/browsers.test.mjs'],
  },
};

// A version or a hash that is not one: never written into the engine's code, whatever a registry answered.
const VERSION = /^\d+\.\d+\.\d+$/, HASH = /^(sha512-)?[A-Za-z0-9+/]{40,}={0,2}$/;

// Both lines moved in the text, or an error that says which line it could not find. Pure.
export function moved(id, text, version, hash) {
  const m = MOVES[id];
  if (!m) throw new Error(`no move for "${id}": ${Object.keys(MOVES).join(', ')}`);
  if (!VERSION.test(String(version))) throw new Error(`"${version}" is not a plain version`);
  if (!HASH.test(String(hash))) throw new Error(`"${hash}" is not a hash`);
  let out = text;
  for (const [re, line, value] of [[...m.version, version], [...m.hash, hash]]) {
    if (!re.test(out)) throw new Error(`${m.file} no longer has the line ${re} reads`);
    out = out.replace(re, line(value));
  }
  return out;
}

export function move(id, version, hash, root = ENGINE) {
  const file = join(root, MOVES[id]?.file ?? '');
  writeFileSync(file, moved(id, readFileSync(file, 'utf8'), version, hash));
  return MOVES[id].file;
}

// The pins with a move that are behind, as pinned-standards.mjs asks them.
export async function behind(root = ENGINE, { fetchImpl = fetch } = {}) {
  const { askAll, PINNED } = await import('./pinned-standards.mjs');
  const state = await askAll(root, { fetchImpl, list: PINNED.filter((p) => MOVES[p.id]) });
  return state.filter((s) => s.behind && VERSION.test(String(s.latest))).map((s) => ({ id: s.id, pinned: s.pinned, latest: s.latest }));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [cmd, id, version, hash] = process.argv.slice(2);
  try {
    if (cmd === 'behind') console.log(JSON.stringify(await behind()));
    else if (cmd === 'hash') { if (!MOVES[id]) throw new Error(`no move for "${id}"`); console.log(await MOVES[id].hashOf(version, fetch)); }
    else if (cmd === 'move') console.log(`moved ${move(id, version, hash)} to ${version}`);
    else if (cmd === 'tries') { if (!MOVES[id]) throw new Error(`no move for "${id}"`); console.log(MOVES[id].tries.join(' ')); }
    else if (cmd === 'before') { if (!MOVES[id]) throw new Error(`no move for "${id}"`); console.log(MOVES[id].before ?? ''); }
    else { console.error('usage: node lib/pin-move.mjs behind | hash <id> <version> | move <id> <version> <hash> | tries <id>'); process.exit(2); }
  } catch (e) { console.error(`✗ ${e.message}`); process.exit(1); }
}
