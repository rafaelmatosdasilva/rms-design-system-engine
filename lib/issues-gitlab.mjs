// issues-gitlab.mjs - the issues plan carried out on GitLab, and nowhere else.
//
// Kept apart from issues.mjs on purpose: the plan - what to open, what to close, what to leave alone - is a decision
// about the design system, and it is made and read without any host in the picture. This file knows one host and
// does what it is told, so another host is another file and nothing above it changes.
//
// It opens and closes issues and leaves everything else alone. It never edits an issue a person wrote (it finds its
// own by the key in the body), never assigns anyone, and never comments except the line that says why it closed.
// Reporter is enough for all of it, so GitLab still decides who may.
import { plainGet, plainSend, projectApi, tokenFrom, hostEnvFrom, parseGitlabProject } from './gitlab-source.mjs';

const PAGE = 100;

// Every open issue of the project, as the plan reads them. → [{ iid, title, body, state }]
export async function openIssues(base, headers, { get = plainGet, pages = 5 } = {}) {
  const out = [];
  for (let page = 1; page <= pages; page++) {
    const r = await get(`${base}/issues?state=opened&per_page=${PAGE}&page=${page}`, { headers });
    if (!r?.ok) break;
    const list = await r.json();
    if (!Array.isArray(list) || !list.length) break;
    for (const i of list) out.push({ iid: i.iid, title: i.title ?? '', body: i.description ?? '', state: i.state ?? 'opened' });
    if (list.length < PAGE) break;
  }
  return out;
}

// A sender for sendIssues: one call per issue, the engine's own mark on what it opens.
export const gitlabSender = (base, headers, { send = plainSend } = {}) => async (what) => {
  const call = async (url, body) => {
    const r = await send(url, { method: 'POST', headers, body });
    if (!r?.ok) throw new Error(`GitLab answered ${r?.status ?? 0}`);
    return r;
  };
  if (what.do === 'open') return call(`${base}/issues`, { title: what.title, description: what.body });
  if (what.do === 'close') {
    if (what.note) await call(`${base}/issues/${what.iid}/notes`, { body: what.note });
    const r = await send(`${base}/issues/${what.iid}?state_event=close`, { method: 'PUT', headers });
    if (!r?.ok) throw new Error(`GitLab answered ${r?.status ?? 0}`);
    return r;
  }
  throw new Error(`nothing known to do: ${what.do}`);
};

// Where the issues go and how to talk to it, from the link the project names. No token, no API: the plan is still
// computed and written, and says it was not sent. → { base, headers, where } or { why }
export async function issuesProject(link, { ROOT = process.cwd(), env = process.env, get = plainGet } = {}) {
  const p = parseGitlabProject(String(link ?? ''), env);
  if (!p?.path) return { why: `the issues project is not a GitLab link: ${link}` };
  const token = tokenFrom({ ...hostEnvFrom(env, [ROOT]), ...env }, [ROOT]);
  if (!token) return { why: 'no GitLab token here, so nothing was sent (put it in .env as GITLAB_TOKEN; never in the chat)' };
  const headers = { 'PRIVATE-TOKEN': token };
  const { base, path } = await projectApi(p.origin, p.path, (u) => get(u, { headers }));
  return { base, headers, where: path };
}
