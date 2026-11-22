// issues-github.mjs - the issues plan carried out on GitHub, as issues-gitlab.mjs carries it out on GitLab.
//
// The plan (issues.mjs, request-issues.mjs) is made without any host in the picture: this file knows one host and does
// what it is told. It opens and closes the engine's own issues (found by the key in their body), reads the others
// only to find one a person opened for the same need, never edits an issue a person wrote, never assigns anyone, and
// comments only to say why it closed one. A token with issues:write on the repository is enough.
//
// Token: GITHUB_TOKEN, from the environment or a .env where the engine runs, never logged, and sent only to github.com
// or a host named in GITHUB_HOST (github-source.mjs tokenAllowedFor).
import { plainGet, plainSend, envFrom } from './gitlab-source.mjs';
import { parseGithubProject, tokenAllowedFor } from './github-source.mjs';

const PAGE = 100;

// The repository's issues, pull requests left out (GitHub lists them as issues). state: open or all.
// → [{ iid, title, body, state: 'opened' | 'closed', reason, url, labels }], in the shape the plans read GitLab's.
export async function openIssues(base, headers, { get = plainGet, pages = 5, state = 'open' } = {}) {
  const out = [];
  for (let page = 1; page <= pages; page++) {
    const r = await get(`${base}/issues?state=${state === 'opened' ? 'open' : state}&per_page=${PAGE}&page=${page}`, { headers });
    if (!r?.ok) break;
    const list = await r.json();
    if (!Array.isArray(list) || !list.length) break;
    for (const i of list) if (!i.pull_request) out.push({ iid: i.number, title: i.title ?? '', body: i.body ?? '', state: i.state === 'closed' ? 'closed' : 'opened',
      ...(i.state_reason ? { reason: i.state_reason } : {}), ...(i.html_url ? { url: i.html_url } : {}),
      ...(i.created_at ? { createdAt: i.created_at } : {}), ...(i.updated_at ? { updatedAt: i.updated_at } : {}), ...(Array.isArray(i.labels) ? { labels: i.labels.map((l) => (typeof l === 'string' ? l : l?.name)).filter(Boolean) } : {}) });
    if (list.length < PAGE) break;
  }
  return out;
}

// A sender for sendIssues: one call per issue.
export const githubSender = (base, headers, { send = plainSend } = {}) => async (what) => {
  const call = async (url, method, body) => {
    const r = await send(url, { method, headers, body });
    if (!r?.ok) throw new Error(`GitHub answered ${r?.status ?? 0}`);
    return r;
  };
  if (what.do === 'open') return call(`${base}/issues`, 'POST', { title: what.title, body: what.body });
  if (what.do === 'close') {
    if (what.note) await call(`${base}/issues/${what.iid}/comments`, 'POST', { body: what.note });
    return call(`${base}/issues/${what.iid}`, 'PATCH', { state: 'closed', state_reason: 'completed' });
  }
  throw new Error(`nothing known to do: ${what.do}`);
};

// Where the issues go and how to talk to it, from the link the project names. No token: the plan is still computed
// and written, and says it was not sent. → { base, headers, where } or { why }
export function issuesProject(link, { ROOT = process.cwd(), env = process.env } = {}) {
  const p = parseGithubProject(String(link ?? ''), env);
  if (!p?.path) return { why: `the issues project is not a GitHub link: ${link}` };
  const token = envFrom('GITHUB_TOKEN', env, [ROOT]);
  if (!token) return { why: 'no GitHub token here, so nothing was sent (put it in .env as GITHUB_TOKEN; never in the chat)' };
  if (!tokenAllowedFor(p.host, env)) return { why: `a GITHUB_TOKEN is set but not sent to ${p.host}: add GITHUB_HOST=${p.host} to .env to allow it` };
  const headers = { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'User-Agent': 'rms-design-system-engine', 'X-GitHub-Api-Version': '2022-11-28' };
  return { base: `${p.apiBase}/repos/${p.path}`, headers, where: p.path };
}
