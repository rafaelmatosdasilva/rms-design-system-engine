// chat-notify.mjs - one short message to the team's chat when a run finishes.
//
// A scheduled run or a style guide build finishes and only the person who looks finds out: a regression found at
// night waits until somebody opens the page. This posts one line to a webhook the team gives, saying what the run
// found, what changed since the run before, and where to read it (or, for a build, whether the page was built and
// published), and nothing else - a chat message nobody can act on is noise, and a long one is worse.
//
// The address is a secret and is never read from ds-config.json, never written to a file and never printed: it comes
// from the environment, so a public repository cannot carry it and a run's own log cannot leak it. A team puts it in
// its CI's secrets and passes --notify; with the variable unset the flag says so and the run is unchanged. It must be
// https, so the run's contents are not posted in the clear.
//
// What is sent is one field of JSON. Most services read { text } - and the engine keeps no list of which service is
// at which address: a list of vendors' hostnames ages, and a team whose chat is its own (Mattermost, Rocket.Chat, a
// proxy of its own) would be refused by one for no reason. A service that reads another field is named by the team:
//   DSE_CHAT_FORMAT=content   sends { content }, which is what Discord reads
// Anything else sends { text }. The engine invents no other field, so nothing depends on a shape a vendor may change.
export const ENV = 'DSE_CHAT_WEBHOOK';
export const FORMAT_ENV = 'DSE_CHAT_FORMAT';

// The one field this posts, by what the team said its service reads.
export const bodyFor = (text, format = process.env[FORMAT_ENV]) => (String(format ?? '').trim().toLowerCase() === 'content' ? { content: text } : { text });

// An address the run will post to: https, and nothing else. http would put the run's contents on the wire in the
// clear, and a path of a file is not an address at all.
export const canPostTo = (url) => { try { return new URL(String(url)).protocol === 'https:'; } catch { return false; } };

// What changed since the run before, from the project's parity history (one entry a run, each check passing or not):
// the checks that failed this time and passed before come first, since what got worse is what the team acts on, then
// the ones fixed. A check either run has no word for (added, renamed, or limited by the Figma plan) is left out, as is
// a run with no run before it. A message that said only this run's count could not tell a new failure from an old
// one, and the old one is the one everybody has already seen.
//   sinceLast(history) → { worse: [check], better: [check] } | null
export function sinceLast(history = []) {
  const runs = (Array.isArray(history) ? history : []).filter((h) => Array.isArray(h?.gates));
  if (runs.length < 2) return null;
  const [before, now] = runs.slice(-2);
  const was = new Map(before.gates.filter((g) => !g.planLimited).map((g) => [g.label, !!g.pass]));
  const worse = [], better = [];
  for (const g of now.gates) {
    if (g.planLimited || !was.has(g.label) || was.get(g.label) === !!g.pass) continue;
    (g.pass ? better : worse).push(g.label);
  }
  return { worse, better };
}
const sinceText = (since) => {
  if (!since) return null;
  if (!since.worse.length && !since.better.length) return 'no check changed since the last run';
  return [since.worse.length ? `worse since the last run: ${since.worse.join(', ')}` : null,
    since.better.length ? `fixed since the last run: ${since.better.join(', ')}` : null].filter(Boolean).join(' · ');
};

// The run in one line: what failed, what changed since the run before, what is open, and where the whole of it is.
// No name of a person, no file contents - a chat is read by more people than the repository is.
export function runMessage({ project = null, failed = 0, checks = 0, differences = 0, findings = 0, report = null, url = null, since = null } = {}) {
  const who = project ? `${project}: ` : '';
  const how = failed ? `${failed} of ${checks} checks fail` : checks ? `all ${checks} checks pass` : 'the run finished';
  const changed = sinceText(since);
  const open = [differences ? `${differences} difference${differences === 1 ? '' : 's'} open` : null,
    findings ? `${findings} finding${findings === 1 ? '' : 's'}` : null].filter(Boolean).join(' · ');
  return `${who}${how}${changed ? ` · ${changed}` : ''}${open ? ` · ${open}` : ''}${report ? ` · ${report}` : ''}${url ? ` · ${url}` : ''}`;
}

// A style guide build in one line, when it finishes: built or not, what the page holds, whether its own check found
// a problem, and whether it went to the page the team opens. A build in CI finished without a word, so a page that
// failed to build, or built and was never published, was found when somebody opened an old one.
export function buildMessage({ project = null, built = true, components = null, problems = 0, published = null, why = null, url = null } = {}) {
  const who = project ? `${project}: ` : '';
  if (!built) return `${who}the style guide was not built${why ? `: ${why}` : ''}${url ? ` · ${url}` : ''}`;
  const parts = ['style guide built', components,
    problems ? `its page check found ${problems} problem${problems === 1 ? '' : 's'}, so it was not published` : null,
    !problems && published === true ? 'published to the page the team opens' : null,
    !problems && published === false ? 'not published: the team\'s page is behind it' : null].filter(Boolean);
  return `${who}${parts.join(' · ')}${url ? ` · ${url}` : ''}`;
}

// The page of the run that is posting, where its host gives one: GitLab names it outright, GitHub gives the parts.
// A message saying something failed is read by somebody who then wants to see it. → url | null
export function jobUrl(env = process.env) {
  if (env.CI_JOB_URL) return env.CI_JOB_URL;
  const { GITHUB_SERVER_URL: host, GITHUB_REPOSITORY: repo, GITHUB_RUN_ID: run } = env;
  return host && repo && run ? `${host}/${repo}/actions/runs/${run}` : null;
}

// Post it. → { sent, why }: why says what to do about it, and is what the run prints.
export async function notify(text, { url = process.env[ENV] ?? null, format = process.env[FORMAT_ENV], post = fetch } = {}) {
  if (!url) return { sent: false, why: `no chat address: set ${ENV} in the run's environment (a secret in CI), and this posts one line there` };
  if (!canPostTo(url)) return { sent: false, why: `${ENV} is not an https address: nothing was sent, since a run's contents are not posted in the clear` };
  try {
    const r = await post(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(bodyFor(text, format)) });
    if (r && r.ok === false) return { sent: false, why: `the chat service answered ${r.status}${r.statusText ? ` ${r.statusText}` : ''}` };
    return { sent: true, why: 'said in the team\'s chat' };
  } catch (e) { return { sent: false, why: `the chat service could not be reached: ${String(e?.message ?? e).split('\n')[0]}` }; }
}
