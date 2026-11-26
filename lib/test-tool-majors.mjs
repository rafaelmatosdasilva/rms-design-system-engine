// test-tool-majors.mjs - a new major of what the suite proves the engine against, found every week.
//
// The tools under test/ are the apps the suite proves the engine against: a Vue app, a Next.js app, an Angular one,
// each at one major. Dependabot moves their minor and patch versions every day, and leaves their majors out
// (.github/dependabot.yml): a new major of a framework is another app to prove, beside the one before since teams
// move on at their own pace, so it is a pull request of its own and never a bump. Next 16 and React 19 came as bumps
// on 25 November 2026 and both failed, so the majors were left out. Left out, they would never be seen again: this
// asks the npm registry once a week for every dependency of those folders, and keeps one issue current while any has
// a major the folder does not pin.
//
// The folders it reads are exactly the ones whose majors Dependabot leaves out, and test/test-tool-majors.test.mjs
// holds the two lists together, so a folder added to one and not the other fails the suite.
//
//   pinsOf(root, folder)        → [{ folder, name, pinned }]: each dependency and the major its package.json pins
//   majorsLeftOut(dependabotYml) → { '/test/.x-tools': '*' | [names] }: what Dependabot leaves out, as it reads
//   askAll(root, { fetchImpl }) → [{ folder, name, pinned, latest, behind, why }]
//   lines(state), issueBody(state, repo), run(mode)
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { keepIssue } from './pinned-standards.mjs';

const ENGINE = dirname(dirname(fileURLToPath(import.meta.url)));

// Each folder, what it stands for, and which of its dependencies are watched (every one, or only those named: the CI
// tools move every major by Dependabot but TypeScript's, whose 7 has no JavaScript API for the engine to read JSX with).
export const WATCHED = [
  { folder: 'test/.vue-tools', what: 'the Vue app built with Vite' },
  { folder: 'test/.vue-cli-tools', what: 'the Vue app built with Vue CLI' },
  { folder: 'test/.nuxt-tools', what: 'the Nuxt app' },
  { folder: 'test/.react-tools', what: 'the React app built with Vite and webpack' },
  { folder: 'test/.next-tools', what: 'the Next.js app' },
  { folder: 'test/.cra-tools', what: 'the Create React App app' },
  { folder: 'test/.angular-tools', what: 'the Angular app' },
  { folder: 'test/.lit-tools', what: 'the Lit app' },
  { folder: 'test/.storybook-tools', what: 'the Storybook the stories are drawn in' },
  { folder: 'test/.lint-tools', what: 'the linters the engine runs and its own code is held to' },
  { folder: 'test/.ci-tools', what: 'TypeScript, which reads JSX and Props', only: ['typescript'] },
];

// Dependabot leaves these majors out too, and nothing asks about them: Svelte is parked (the owner's decision,
// 20 November 2026), so a new Svelte major is no work to propose. What the engine reads of Svelte is kept working.
export const NOT_ASKED = [{ folder: 'test/.svelte-tools', why: 'Svelte is parked' }];

// "15", "^4.6.4", "~2.1.0", "5.0.1" → 15, 4, 2, 5. A range this cannot read is null, and said.
export const majorOf = (range) => { const m = /^\s*[\^~>=v]*\s*(\d+)/.exec(String(range ?? '')); return m ? Number(m[1]) : null; };

export function pinsOf(root, { folder, only }) {
  let pkg;
  try { pkg = JSON.parse(readFileSync(join(root, folder, 'package.json'), 'utf8')); } catch { return [{ folder, name: null, pinned: null, why: `${folder}/package.json cannot be read` }]; }
  const deps = { ...pkg.dependencies, ...pkg.devDependencies };
  return Object.entries(deps).filter(([name]) => !only || only.includes(name)).map(([name, range]) => ({ folder, name, range, pinned: majorOf(range) }));
}

// What Dependabot leaves out, read from its own file: for each npm directory, '*' when every major is left out, or
// the names whose majors are. Read by its lines, as GitHub writes and reads it, so nothing is installed to read it.
export function majorsLeftOut(yml) {
  const out = {};
  for (const block of String(yml).split(/\n {2}- package-ecosystem: /).slice(1)) {
    const dir = /^\s*directory: (\S+)/m.exec(block)?.[1];
    if (!block.startsWith('npm') || !dir) continue;
    const ignore = /\n {4}ignore:\n([\s\S]*?)(?=\n {4}\S|$)/.exec(block)?.[1] ?? '';
    const names = [...ignore.matchAll(/- dependency-name: '?([^'\n]+)'?\n\s+update-types:\n\s+- version-update:semver-major/g)].map((m) => m[1].trim());
    if (names.length) out[dir] = names.includes('*') ? '*' : names;
  }
  return out;
}

// What the registry says of one dependency. fetchImpl is given in, so nothing here reaches the network in a test.
export async function newestMajor(pin, { fetchImpl = fetch } = {}) {
  if (pin.pinned === null) return { latest: null, behind: false, why: pin.why ?? `its range "${pin.range}" is not one this reads` };
  try {
    const r = await fetchImpl(`https://registry.npmjs.org/${pin.name.replaceAll('/', '%2F')}/latest`, { signal: AbortSignal.timeout(30000) });
    if (!r.ok) return { latest: null, behind: false, why: `the registry answered ${r.status}` };
    const latest = (await r.json())?.version ?? null;
    const major = majorOf(latest);
    return { latest, behind: major !== null && major > pin.pinned, why: null };
  } catch (e) { return { latest: null, behind: false, why: `the registry could not be reached: ${String(e?.message ?? e).split('\n')[0]}` }; }
}

export async function askAll(root = ENGINE, { fetchImpl = fetch, list = WATCHED } = {}) {
  const out = [];
  for (const f of list) for (const pin of pinsOf(root, f)) out.push({ ...pin, what: f.what, ...(await newestMajor(pin, { fetchImpl })) });
  return out;
}

// The majors behind first, by folder, then what could not be asked, then a count of the rest.
export function lines(state = []) {
  const behind = state.filter((s) => s.behind);
  const unasked = state.filter((s) => !s.behind && s.why);
  const fine = state.length - behind.length - unasked.length;
  const out = [];
  if (behind.length) {
    out.push(`${behind.length} new major${behind.length === 1 ? '' : 's'} the suite does not prove:`);
    for (const s of behind) out.push(`- **${s.name} ${majorOf(s.latest)}** (newest \`${s.latest}\`) · ${s.folder} pins ${s.pinned}, for ${s.what}`);
  }
  if (unasked.length) {
    out.push(`${unasked.length} that could not be asked:`);
    for (const s of unasked) out.push(`- **${s.name ?? s.folder}** · ${s.folder} · ${s.why}`);
  }
  if (fine) out.push(`${fine} other${fine === 1 ? '' : 's'} on the newest major.`);
  return out;
}

export const ISSUE_TITLE = 'A test tool has a new major';

export function issueBody(state, repo = '') {
  return [
    'A new major came out of something the suite proves the engine against, and Dependabot leaves majors out of its bumps.',
    '', ...lines(state), '',
    'Each is a pull request of its own, never a bump. A framework\'s new major is proven beside the one before, since teams move on at their own pace: a second app in its test, the engine fixed where it reads the new build differently, and the docs saying which majors are proven. A linter\'s or a compiler\'s moves with the fixes it asks for.',
    '', `Asked every week by \`.github/workflows/pinned-standards.yml\`${repo ? ` in ${repo}` : ''} (\`lib/test-tool-majors.mjs\`), and this issue closes when every major is proven.`,
  ].join('\n');
}

// report: say it and stop. check: say it, and keep the one issue current. → the state
export async function run(mode = 'report', { root = ENGINE, repo = process.env.GITHUB_REPOSITORY ?? '', fetchImpl = fetch } = {}) {
  const state = await askAll(root, { fetchImpl });
  for (const l of lines(state)) console.log(l);
  if (mode === 'check' && repo) keepIssue(repo, ISSUE_TITLE, state.some((s) => s.behind) ? issueBody(state, repo) : null, 'The suite proves the newest major of every test tool it watches.');
  return state;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const mode = process.argv[2] ?? 'report';
  if (!['report', 'check'].includes(mode)) { console.error('usage: node lib/test-tool-majors.mjs [report | check]'); process.exit(2); }
  const state = await run(mode);
  process.exit(state.some((s) => s.behind) ? 1 : 0);
}
