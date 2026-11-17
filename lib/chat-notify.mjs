// chat-notify.mjs - one short message to the team's chat when a run finishes.
//
// A scheduled run or a style guide build finishes and only the person who looks finds out: a regression found at
// night waits until somebody opens the page. This posts one line to a webhook the team gives, saying what the run
// found and where to read it, and nothing else - a chat message nobody can act on is noise, and a long one is worse.
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

// The run in one line: what failed, what is open, and where the whole of it is. No name of a person, no file
// contents - a chat is read by more people than the repository is.
export function runMessage({ project = null, failed = 0, checks = 0, differences = 0, findings = 0, report = null, url = null } = {}) {
  const who = project ? `${project}: ` : '';
  const how = failed ? `${failed} of ${checks} checks fail` : checks ? `all ${checks} checks pass` : 'the run finished';
  const open = [differences ? `${differences} difference${differences === 1 ? '' : 's'} open` : null,
    findings ? `${findings} finding${findings === 1 ? '' : 's'}` : null].filter(Boolean).join(' · ');
  return `${who}${how}${open ? ` · ${open}` : ''}${report ? ` · ${report}` : ''}${url ? ` · ${url}` : ''}`;
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
