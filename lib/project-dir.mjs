// Where the project is. The engine works on the folder it runs in, unless told another: `--project=<folder>` or
// `--project=<git link>` (cloned beside where it runs, once), or a GitLab or GitHub project link (read through that
// host's API into a mirror beside where it runs, brought up to the branch's latest commit on every run:
// gitlab-source.mjs, github-source.mjs). The answer is remembered in the folder it ran from (.design-system-engine-project), so every
// later run there goes to the same project without being told again.
// Imported for its effect, before anything reads the working folder.
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join, resolve, basename, dirname } from 'path';
import { fileURLToPath } from 'url';
import { homedir } from 'os';
import { spawnSync } from 'child_process';
import { parseGitlabProject, syncGitlab, projectFromState, describe, hostEnvFrom, isMirrorOf, STATE_FILE } from './gitlab-source.mjs';
import { parseGithubProject, syncGithub, describe as describeGithub, STATE_FILE as GITHUB_STATE } from './github-source.mjs';
import { slashed } from './shown-path.mjs';

// Where the project points is remembered in POINTER; whether a folder holds code is has-code.mjs's, which reads and
// moves nothing, so the router can ask it too.
import { hasCode, POINTER } from './has-code.mjs';
export { hasCode, POINTER };

const OWNER_REPO = /^[A-Za-z0-9][\w-]*\/[\w.-]+$/;   // acme/ui-kit: a GitHub repository
const isGitLink = (v) => /^(https?:\/\/|git@|ssh:\/\/)/i.test(v) || (OWNER_REPO.test(v) && !existsSync(v));

// → the project folder for a --project answer: a folder as it is; a git link cloned beside where the engine runs
// (owner/repo means GitHub), or the clone already there.
export function projectFor(value, from = process.cwd(), { git = (args, cwd) => spawnSync('git', args, { cwd, stdio: 'inherit' }) } = {}) {
  const v = String(value).trim().replace(/^~(?=\/|$)/, homedir());
  if (!isGitLink(v)) return { dir: resolve(from, v) };
  const url = OWNER_REPO.test(v) ? `https://github.com/${v}.git` : v;
  const name = basename(url.replace(/\.git$/, '').replace(/[:/]+$/, '')).replace(/[^\w.-]/g, '') || 'project';
  const dir = join(from, name);
  if (existsSync(join(dir, '.git'))) return { dir, url };
  const r = git(['clone', url, dir], from);
  if (r.status !== 0) return { dir: null, url, error: `could not clone ${url}` };
  return { dir, url, cloned: true };
}

function arg(flag) { const hit = process.argv.slice(2).filter((a) => a === flag || a.startsWith(flag + '=')).pop(); if (!hit) return null; if (hit.includes('=')) return hit.slice(flag.length + 1); const i = process.argv.lastIndexOf(hit); return process.argv[i + 1] ?? null; }

// The effect: move to the project before the engine reads its folder.
export const PROJECT_FROM = process.cwd();
let asked = arg('--project');
// A company's profile (profile.mjs), given with --profile: read once here, where the run starts and its .env is; where
// the code is comes from it when --project does not say. audit.mjs writes the rest of it into ds-config.json.
export let PROFILE_READ = null;
const profileAsked = arg('--profile');
if (profileAsked && !profileAsked.startsWith('--')) {
  // Making the company's command only reads it: the run stays where it started.
  const onlyReads = process.argv.includes('--make-command');
  const { readProfile } = await import('./profile.mjs');
  PROFILE_READ = await readProfile(profileAsked, { from: PROJECT_FROM });
  if (PROFILE_READ.error) console.error(`⚠️  Profile not read: ${PROFILE_READ.error}`);
  // Not a project and nothing to read the profile with: stopped here, never taken on as a first setup (it would ask
  // for a Figma file the profile already names).
  if (PROFILE_READ.error && PROFILE_READ.project === false && !onlyReads && !asked) {
    console.error(`NEXT: tell the person this ran in ${PROFILE_READ.where}, which is not their project; ask where their project's folder is (the one with its .env) and run the same command from there.`);
    process.exit(2);
  }
  // A profile that could not be read says nothing about where the project is: the run carries on with the setup
  // already there, which is what the warning above promises.
  else if (!asked && !onlyReads && PROFILE_READ.profile?.project) asked = String(PROFILE_READ.profile.project);
}
// Whether the person has said where the code is: told now (--project, `.` for this folder) or remembered from before.
export let PROJECT_GIVEN = Boolean(asked);
// The commit this run checks, when the project is read from GitLab or GitHub (null otherwise): which host it came
// from, so what the run says names that host, and the file the mirror keeps its record in.
export let CODE_SOURCE = null;
// The line the summary closes on: the host, the project, the branch and the commit this run checked.
export function codeCheckedLine(s) {
  if (!s) return '';
  const when = s.committedAt ? ` (${s.committedAt.slice(0, 10)})` : '';
  const stale = s.stale ? ` - ${s.host} was not reached, so this is the copy of that commit` : '';
  return `\nCode checked: ${s.host} ${s.path} @ ${s.ref} ${s.sha.slice(0, 8)}${when}${stale}\n`;
}
// Commands that only print (a recipe, the router, the version) use the mirror as it is, without asking GitLab.
const PRINT_ONLY = ['--version', '--route', '--recipe', '--reference', '--summary', '--help'];
const printOnly = process.argv.slice(2).some((a) => PRINT_ONLY.some((f) => a === f || a.startsWith(f + '=')));
// The engine's own files of the mirror, when a setting keeps them in a folder of their own (workspace.mjs): put into
// the mirror now, taken back when the run ends.
export let WORKSPACE = null;
// The same for either host: ask it for the branch's latest commit, say which one this run reads, and work in the
// mirror. GitHub's reader is GitLab's twin by design, so there is one path here and not two.
// What a GitHub mirror says it is, read back from the file it wrote.
function stateOf(dir) {
  try {
    const st = JSON.parse(readFileSync(join(dir, GITHUB_STATE), 'utf8'));
    return st?.source ? parseGithubProject(st.source, { GITHUB_HOST: st.host }) : null;
  } catch { return null; }
}

async function fromHost(p, dir) {
  const github = Boolean(p.apiBase);
  const r = github ? await syncGithub(p, { from: PROJECT_FROM, dir, offline: printOnly })
    : await syncGitlab(p, { from: PROJECT_FROM, dir, offline: printOnly });
  console.error(github ? describeGithub(r) : describe(r));
  if (r.dir) {
    CODE_SOURCE = { host: github ? 'GitHub' : 'GitLab', stateFile: github ? GITHUB_STATE : STATE_FILE, path: r.path, ref: r.ref, sha: r.sha, committedAt: r.committedAt, stale: Boolean(r.stale) };
    const { openWorkspace } = await import('./workspace.mjs');
    WORKSPACE = openWorkspace(p, r.dir, { from: PROJECT_FROM });
    if (WORKSPACE) { console.error(WORKSPACE.note); process.on('exit', WORKSPACE.close); }
  }
  return r;
}
if (asked) {
  const gl = parseGitlabProject(asked, { ...process.env, GITLAB_HOST: hostEnvFrom(process.env, [PROJECT_FROM]) })
    ?? parseGithubProject(asked, process.env);
  // Run from inside the copy of that same project: brought up to date in place, with the .env of the folder that holds it.
  const p = gl ? await fromHost(gl, isMirrorOf(PROJECT_FROM, gl) ? PROJECT_FROM : undefined) : projectFor(asked, PROJECT_FROM);
  if (!p.dir || !existsSync(p.dir)) { console.error(`❌ No project at ${asked}${p.error ? `: ${p.error}` : ''}.\nNEXT: ask the person where their code is (a folder on this computer or a link to its repository on GitHub or GitLab), then run again with --project=<it>`); process.exit(2); }
  if (p.cloned) console.log(`⬇  Cloned ${p.url} into ${p.dir}`);
  if (resolve(p.dir) !== resolve(PROJECT_FROM)) { try { writeFileSync(join(PROJECT_FROM, POINTER), resolve(p.dir) + '\n'); } catch { /* read-only: not remembered */ } }
  process.chdir(p.dir);
} else if (!existsSync(join(PROJECT_FROM, 'ds-config.json')) && existsSync(join(PROJECT_FROM, POINTER))) {
  const dir = readFileSync(join(PROJECT_FROM, POINTER), 'utf8').trim();
  if (dir && existsSync(dir)) {
    const gl = existsSync(join(dir, STATE_FILE)) ? projectFromState(dir) : stateOf(dir);
    if (gl) await fromHost(gl, dir);                                      // a mirror: up to the latest commit first
    process.chdir(dir); PROJECT_GIVEN = true; console.error(`📁 Project: ${dir}`);
  }
} else if (existsSync(join(PROJECT_FROM, STATE_FILE)) || existsSync(join(PROJECT_FROM, GITHUB_STATE))) {   // run inside a mirror: refresh it in place
  const gl = existsSync(join(PROJECT_FROM, STATE_FILE)) ? projectFromState(PROJECT_FROM) : stateOf(PROJECT_FROM);
  if (gl) await fromHost(gl, PROJECT_FROM);
}
// On the engine's own maintainers' computers the project is remembered, so the privacy check refuses its names from now
// on (.githooks/private-terms.mjs). Such a computer keeps the list, or its engine checkout runs the privacy hooks. Only
// asking the checkout that runs missed every project: the installed copy of the engine runs them all and has no hooks of
// its own, and a worktree's .git is a file, so the list stayed empty and refused no one's names. Nothing is written
// anywhere else, and a computer with no list and no hooks (everyone else's) is never written to.
try {
  const engine = dirname(dirname(fileURLToPath(import.meta.url)));
  const terms = await import('../.githooks/private-terms.mjs');
  const hooks = (spawnSync('git', ['-C', engine, 'config', '--get', 'core.hooksPath'], { encoding: 'utf8' }).stdout ?? '').trim() === '.githooks';
  if (terms.keepsList() || hooks) {
    terms.rememberProject(process.cwd()); terms.rememberProject(PROJECT_FROM);
    // The company the project is for, asked once on such a computer: its legal name is in no file, often. The agent asks
    // the person and keeps the answer there (private-terms.mjs --company), never in the project's files.
    if (terms.askCompany(process.cwd())) console.error(`🔒 This computer keeps the engine's private names. Which company is this project for?\nNEXT: ask the person for the company's legal name, then run: node "${slashed(join(engine, '.githooks', 'private-terms.mjs'))}" --company "<its legal name>" "${process.cwd()}"`);
  }
} catch { /* an install without the privacy hooks */ }
