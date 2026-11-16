// dsds-release.mjs - each new DSDS release found, fetched and tried before the engine moves to it.
//
// DSDS is before 1.0 and allows a breaking change in a minor release. The engine writes DSDS (contract-dsds.mjs) and reads
// it (doc-source-dsds.mjs), pinned to one version, and its tests check what it writes against that version's own
// schema and the examples DSDS publishes with it. Nothing noticed a new release until a team's tooling rejected a file.
// So a weekly job (.github/workflows/dsds-release.yml) asks DSDS's repository for its newest tag; when it is newer than
// the pin, it fetches that release, moves the pin, runs the tests and DSDS's own reference validator over what the
// engine writes, and opens a pull request with what passed and what did not. A person merges it, or decides what the
// engine does about a change of meaning. Nothing here runs when a team runs the engine: no DSDS file is fetched on
// anyone's machine.
//
// DSDS's files are fetched, never committed (test/.dsds/, ignored by git): its licence and its comments name people and
// companies, and this repository names none. The Tests workflow fetches the pinned release before the suite runs, and
// a person runs `fetch` once; a DSDS test with nothing fetched fails and says that command, never skips.
//
//   node lib/dsds-release.mjs check                → { current, latest, newer, mayBreak }, printed as JSON
//   node lib/dsds-release.mjs fetch [<version>]    → that release (the pinned one when none is said) into test/.dsds/
//   node lib/dsds-release.mjs pin <version>        → moves the pin, and nothing else
//   node lib/dsds-release.mjs update <version>     → fetch, then pin
//   node lib/dsds-release.mjs emit <folder>        → writes the view of a sample system there, for the reference validator
//
// DSDS publishes its examples as YAML and the engine reads no YAML (it has no dependency): `update` turns each into JSON
// with the Ruby the CI runner has (its standard library reads YAML safely), and says so plainly when there is none.
// A fetched file is data, never code: JSON parsed, YAML read with safe_load, nothing run from it.
import { readFileSync, writeFileSync, mkdirSync, rmSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { DSDS_VERSION, dsdsDocuments } from './contract-dsds.mjs';

export const DSDS_REPO = 'somerandomdude/design-system-documentation-schema';
const ENGINE = dirname(dirname(fileURLToPath(import.meta.url)));
export const FIXTURES = join(ENGINE, 'test', '.dsds');
const PIN_FILE = join(ENGINE, 'lib', 'contract-dsds.mjs');
const PIN = /^export const DSDS_VERSION = '([^']+)';$/m;

// '0.23.1' → [0, 23, 1]; a tag that is not a plain release (v1.0.0-rc.1) is not one.
export const parseVersion = (v) => { const m = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(String(v ?? '').trim()); return m ? m.slice(1).map(Number) : null; };
export const compareVersions = (a, b) => { const x = parseVersion(a), y = parseVersion(b); for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] - y[i]; return 0; };

// The newest plain release among the tags, without its v.
export function newestTag(tags) {
  const releases = tags.map((t) => (typeof t === 'string' ? t : t?.name)).filter((t) => parseVersion(t)).map((t) => t.replace(/^v/, ''));
  return releases.sort(compareVersions).at(-1) ?? null;
}

// Before 1.0 a minor release may break; after it, only a major one.
export function mayBreak(from, to) {
  const a = parseVersion(from), b = parseVersion(to);
  if (!a || !b) return true;
  return b[0] !== a[0] || (b[0] === 0 && b[1] !== a[1]);
}

const headers = () => ({ accept: 'application/vnd.github+json', 'user-agent': 'rms-design-system-engine', ...(process.env.GITHUB_TOKEN ? { authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {}) });
async function getJson(url, { fetchImpl = fetch } = {}) {
  const r = await fetchImpl(url, { headers: headers() });
  if (!r.ok) throw new Error(`${url} answered ${r.status}`);
  return r.json();
}
async function getText(url, { fetchImpl = fetch } = {}) {
  const r = await fetchImpl(url, { headers: { 'user-agent': 'rms-design-system-engine' } });
  if (!r.ok) throw new Error(`${url} answered ${r.status}`);
  return r.text();
}
const raw = (version, path) => `https://raw.githubusercontent.com/${DSDS_REPO}/v${version}/${path}`;

export async function check({ fetchImpl = fetch, current = DSDS_VERSION } = {}) {
  const tags = await getJson(`https://api.github.com/repos/${DSDS_REPO}/tags?per_page=100`, { fetchImpl });
  const latest = newestTag(tags);
  const newer = !!latest && compareVersions(latest, current) > 0;
  return { current, latest, newer, mayBreak: newer ? mayBreak(current, latest) : false };
}

// YAML text → the value, through Ruby's own safe reader. Dates stay the text they were written as.
export function yamlToJson(text) {
  const r = spawnSync('ruby', ['-ryaml', '-rjson', '-rdate', '-e', 'puts JSON.generate(YAML.safe_load(STDIN.read, permitted_classes: [Date], aliases: true))'], { input: text, encoding: 'utf8', timeout: 20000 });
  if (r.error?.code === 'ENOENT') throw new Error('turning DSDS\'s YAML examples into JSON needs Ruby, which is not installed here');
  if (r.status !== 0) throw new Error(`a YAML example could not be read: ${String(r.stderr).trim().split('\n')[0]}`);
  return JSON.parse(r.stdout);
}

// examples/entries/button.yaml → examples_entries_button.json, one flat folder.
export const exampleName = (path) => path.replace(/\.ya?ml$/i, '').replace(/[/\\]/g, '_') + '.json';

export async function fetchRelease(version, { fetchImpl = fetch, into = FIXTURES } = {}) {
  if (!parseVersion(version)) throw new Error(`${version} is not a release version`);
  const dir = join(into, `v${version}`);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(join(dir, 'examples'), { recursive: true });
  const schema = await getText(raw(version, 'schema/dsds.bundled.schema.json'), { fetchImpl });
  JSON.parse(schema);   // a schema that is not JSON stops here, before anything moves
  writeFileSync(join(dir, 'dsds.bundled.schema.json'), schema);
  writeFileSync(join(dir, 'LICENSE'), await getText(raw(version, 'LICENSE'), { fetchImpl }));
  const suite = await getText(raw(version, 'schema/conformance-suite.json'), { fetchImpl });
  JSON.parse(suite);
  writeFileSync(join(dir, 'conformance-suite.json'), suite);
  const tree = await getJson(`https://api.github.com/repos/${DSDS_REPO}/git/trees/v${version}?recursive=1`, { fetchImpl });
  const yamls = (tree.tree ?? []).filter((t) => t.type === 'blob' && /^examples\/.+\.ya?ml$/i.test(t.path)).map((t) => t.path);
  for (const path of yamls) writeFileSync(join(dir, 'examples', exampleName(path)), JSON.stringify(yamlToJson(await getText(raw(version, path), { fetchImpl }))) + '\n');
  writeFileSync(join(dir, 'README.md'), [
    `# DSDS ${version}`,
    '',
    `DSDS's published schema, conformance suite and examples at v${version}, from https://github.com/${DSDS_REPO} (Apache-2.0, see LICENSE).`,
    'The examples are DSDS\'s YAML turned into JSON, one file each, named for their path. Fetched by `node lib/dsds-release.mjs fetch`, ignored by git. Do not edit.',
    '',
  ].join('\n'));
  return { dir, examples: yamls.length };
}

// The pin, and the one line of the golden reports that names it ("the 4 contracts in DSDS 0.23.1,"), so a pull request
// that only moves the pin does not fail the demo systems' reports for that line alone. → the version it moved from.
export function movePin(version, { file = PIN_FILE, goldens = goldenReports() } = {}) {
  const text = readFileSync(file, 'utf8');
  const from = PIN.exec(text)?.[1];
  if (!from) throw new Error(`no DSDS_VERSION line in ${file}`);
  writeFileSync(file, text.replace(PIN, `export const DSDS_VERSION = '${version}';`));
  const said = new RegExp(`( contracts? in DSDS )${from.replace(/\./g, '\\.')}(,)`, 'g');
  for (const g of goldens) { const t = readFileSync(g, 'utf8'); if (said.test(t)) writeFileSync(g, t.replace(said, `$1${version}$2`)); }
  return from;
}

// Every golden report of the demo systems (test/fixtures/<system>/expected-report*.txt).
export function goldenReports(root = join(ENGINE, 'test', 'fixtures')) {
  const out = [];
  for (const d of readdirSync(root, { withFileTypes: true })) if (d.isDirectory()) for (const f of readdirSync(join(root, d.name))) if (/^expected-report.*\.txt$/.test(f)) out.push(join(root, d.name, f));
  return out;
}

// The folder a DSDS test reads, for the pinned version: there, or a failure that says how to get it.
export function fixtureDir(version = DSDS_VERSION, { into = FIXTURES } = {}) {
  const dir = join(into, `v${version}`);
  if (!existsSync(join(dir, 'dsds.bundled.schema.json')) || !existsSync(join(dir, 'conformance-suite.json'))) {
    throw new Error(`DSDS ${version} is not fetched: run node lib/dsds-release.mjs fetch (it needs the network once, and Ruby)`);
  }
  return dir;
}

// Fetch the release, drop every other version's copy, move the pin: the tests then run against the new one.
export async function update(version, opts = {}) {
  const into = opts.into ?? FIXTURES;
  const got = await fetchRelease(version, { ...opts, into });
  for (const d of readdirSync(into)) if (d !== `v${version}` && /^v\d/.test(d)) rmSync(join(into, d), { recursive: true, force: true });   // only this folder's own copies
  movePin(version, opts);
  return got;
}

// A small system that exercises every part of the view, for the reference validator to read as a team's would be.
export const SAMPLE = [
  { name: 'button', file: 'Button.contract.json', contract: { id: 'sample.button', name: 'button', description: 'The main action of a view.', status: { state: 'current' },
    props: [{ name: 'size', type: 'enum', default: 'm', options: ['s', 'm', 'l'] }, { name: 'Show icon', type: 'enum', default: 'False', options: ['False', 'True'] }, { name: 'disabled', type: 'boolean', default: false }],
    states: [{ name: 'hover', selector: ':hover' }], relationships: { composesWith: ['icon'], neverCombineWith: ['link'] }, whenNotToUse: 'For navigation: use a link.',
    source: { code: { file: 'src/Button.vue' }, figma: { file: 'KEY', nodeId: '1:2' } } } },
  { name: 'icon', file: 'Icon.contract.json', contract: { id: 'sample.icon', name: 'icon', description: 'A symbol that names an action or a thing.' } },
  { name: 'link', file: 'Link.contract.json', contract: { id: 'sample.link', name: 'link', description: 'Goes to another page.' } },
  { name: 'linkButton', file: 'LinkButton.contract.json', contract: { id: 'sample.linkButton', name: 'linkButton', description: 'A link drawn as a button.', status: { state: 'deprecated', supersededBy: 'link', rationale: 'A link looks like a link.' }, useInstead: ['button'] } },
];

export function emit(folder, { built = SAMPLE, system = 'Sample' } = {}) {
  const docs = dsdsDocuments(built, { system });
  for (const { rel, doc } of docs) { mkdirSync(dirname(join(folder, rel)), { recursive: true }); writeFileSync(join(folder, rel), JSON.stringify(doc, null, 2) + '\n'); }
  // The contracts the view points at, so a reference that a file exists can be checked too.
  // From components/<id>.dsds.json the view points at ../../<file>: the folder above this one.
  for (const { file, contract } of built) writeFileSync(join(folder, '..', file), JSON.stringify(contract, null, 2) + '\n');
  return docs.map((d) => d.rel);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [cmd, arg] = process.argv.slice(2);
  try {
    if (cmd === 'check') console.log(JSON.stringify(await check()));
    else if (cmd === 'fetch') { const v = arg ?? DSDS_VERSION; const r = await fetchRelease(v); console.log(`DSDS ${v}: the schema, the conformance suite and ${r.examples} examples in ${r.dir.replace(ENGINE + '/', '')}.`); }
    else if (cmd === 'pin' && parseVersion(arg)) { movePin(arg); console.log(`The DSDS pin is ${arg}.`); }
    else if (cmd === 'update' && arg) { const r = await update(arg); console.log(`DSDS ${arg}: the schema, the conformance suite and ${r.examples} examples in ${r.dir.replace(ENGINE + '/', '')}, and the pin moved.`); }
    else if (cmd === 'emit' && arg) { mkdirSync(arg, { recursive: true }); console.log(emit(arg).join('\n')); }
    else { console.error('usage: node lib/dsds-release.mjs check | fetch [<version>] | pin <version> | update <version> | emit <folder>'); process.exit(2); }
  } catch (e) { console.error(`✗ ${e.message}`); process.exit(1); }
}

