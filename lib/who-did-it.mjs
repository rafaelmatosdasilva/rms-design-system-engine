// who-did-it.mjs - who did a piece of work, for the style guide's History: the line that sits beside the one a
// decision already has (Answered by), so every row names the people behind it.
//
// Every row of History that is work rather than a decision rests on a commit: a read of Figma is the commit that saved
// its snapshots, a change to the intent layer is the layer's own commit, a change to a component's code is the
// product's. git keeps two people on each: the author, who made the change, and the committer, who brought it in (a
// maintainer who merged, rebased or cherry-picked someone else's work). Both are named when they differ, so a row never
// hides who wrote a change and never credits someone with work they did not do. A commit pushed exactly as it was
// written has its author as its committer, so only one name shows: git does not keep who pushed.
//
// A run the engine makes in a pipeline is a different case. A pipeline started by a push, by hand or by a merge
// request has a person behind it, and the pipeline says who. A scheduled one has nobody: GitLab names whoever owns
// the schedule, who did nothing that night. So a commit the engine makes from a schedule says so in a Run-by trailer,
// and its row says the schedule did it, never the owner.
//
//   runOf(env)               → { how: 'person', name, email, source } | { how: 'schedule' | 'trigger' | 'pipeline',
//                              source } | null (not a pipeline: the run's own git says who)
//   runTrailer(run)          → 'Run-by: schedule' for a run with nobody behind it, null otherwise
//   runFromTrailer(value)    → { how } from a commit's Run-by trailer, null when it has none
//   doneBy({ author, committer, run }) → 'Done by <author>' | 'Done by <author> · pushed by <who brought it in>' | 'Done by the schedule' | null
// Pure.

// GitLab's pipeline sources a person starts: who started it is the one GitLab names. Any other (a schedule, a
// trigger token, a parent pipeline) has nobody behind it.
const PERSON_SOURCES = new Set(['push', 'web', 'merge_request_event', 'api', 'chat', 'external_pull_request_event']);
const NOBODY = new Set(['schedule', 'trigger', 'pipeline']);

export function runOf(env = process.env) {
  if (env.GITLAB_CI) {
    const source = String(env.CI_PIPELINE_SOURCE ?? '').trim();
    const name = String(env.GITLAB_USER_NAME ?? '').trim();
    if (PERSON_SOURCES.has(source) && name) return { how: 'person', name, email: String(env.GITLAB_USER_EMAIL ?? '').trim() || null, source };
    return { how: source === 'schedule' ? 'schedule' : source === 'trigger' ? 'trigger' : 'pipeline', source: source || 'pipeline' };
  }
  if (env.GITHUB_ACTIONS) {
    const source = String(env.GITHUB_EVENT_NAME ?? '').trim();
    if (source === 'schedule') return { how: 'schedule', source };
    const name = String(env.GITHUB_ACTOR ?? '').trim();
    return name ? { how: 'person', name, email: null, source } : { how: 'pipeline', source: source || 'pipeline' };
  }
  return null;
}

export function runTrailer(run) { return run && NOBODY.has(run.how) ? `Run-by: ${run.how}` : null; }

export function runFromTrailer(value) {
  const v = String(value ?? '').trim().toLowerCase().split(/[\s,]+/)[0];
  return NOBODY.has(v) ? { how: v } : null;
}

// A name that is an account rather than a person: a host's own (GitHub, GitLab, web-flow), an app ([bot]), or a
// project or group access token's (project_12_bot_ab12…). Said as a pipeline, never as if it were somebody.
const isBot = (name) => /\[bot\]$|(^|_)bot(_[0-9a-f]+)?$|^(github|gitlab|web-flow|gitlab-ci|github-actions)$/i.test(String(name ?? '').trim());
// A Windows sign-in keeps its machine or domain before the name (GONCALO-CORREIA\\goncalo.correia): the name alone.
const clean = (name) => String(name ?? '').replace(/^[^\\\s]*\\/, '').replace(/\s+/g, ' ').trim();
const same = (a, b) => clean(a).toLowerCase() === clean(b).toLowerCase();
const RUN_SAYS = { schedule: 'the schedule', trigger: 'a pipeline trigger', pipeline: 'a pipeline' };

// Several commits (a change read as the range between two commits): each one's line, the same people once, in the
// order they worked. → 'Done by Quokka, Wombat' | null.
export function doneByAll(lines) {
  const who = [];
  // One person under two names (an account's username, teresa.deus, and the name they sign with, Teresa Deus): once,
  // by the name they sign with.
  const key = (n) => clean(n).toLowerCase().replace(/[._-]+/g, ' ');
  const signed = (n) => /\s/.test(clean(n));
  for (const l of lines) {
    const t = String(l ?? '').replace(/^Done by /, '').trim();
    if (!t) continue;
    const i = who.findIndex((w) => key(w) === key(t));
    if (i < 0) who.push(t); else if (!signed(who[i]) && signed(t)) who[i] = t;
  }
  return who.length ? `Done by ${who.join(', ')}` : null;
}

export function doneBy({ author = null, committer = null, run = null } = {}) {
  if (run && RUN_SAYS[run.how]) return `Done by ${RUN_SAYS[run.how]}`;
  const a = clean(author), c = clean(committer);
  if (!a && !c) return null;
  const who = !a || isBot(a) ? 'a pipeline' : a;
  const brought = c && !isBot(c) && !same(c, a) ? ` · pushed by ${c}` : '';
  return `Done by ${who}${brought}`;
}
