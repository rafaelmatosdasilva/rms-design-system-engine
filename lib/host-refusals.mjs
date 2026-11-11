// host-refusals.mjs - a refusal that names the permission it lacks, and where to add it.
//
// GitLab's refusal said which scope the token needs (`read_api`) and whoever hit it fixed it in a minute. Figma's
// said the request failed. Notion's said `Notion API 403`. The same wall every time, and only one of them is a wall
// with a door written on it: the others leave a person guessing between a token that is wrong, a scope nobody
// granted, a page nobody shared, and a plan that does not include the thing at all - four different fixes behind
// one number.
//
// Each host answers the same questions here, once: what the status means, which permission is missing, and where
// that permission is given. Every refusal in the engine reads from this, so a caller cannot invent a vaguer
// sentence than the one the host already has, and a scope that changes is corrected in one place.
//
// The token itself is never printed, and never any part of it: a refusal is read in a terminal somebody is sharing.

export const HOSTS = {
  figma: {
    name: 'Figma',
    token: 'FIGMA_TOKEN',
    needs: 'file_content:read (and file_dev_resources:read for Code Connect)',
    where: 'figma.com → Settings → Security → Personal access tokens',
    reach: 'the file must be in a team the token\'s account can open',
  },
  github: {
    name: 'GitHub',
    token: 'GITHUB_TOKEN',
    needs: 'read access to the repository (Contents: Read)',
    where: 'github.com → Settings → Developer settings → Personal access tokens',
    reach: 'the repository must be one that token can read',
  },
  gitlab: {
    name: 'GitLab',
    token: 'GITLAB_TOKEN',
    needs: 'the read_api scope',
    where: 'your GitLab → Preferences → Access tokens (a project token: Settings → Access tokens)',
    reach: 'the token must have access to this project',
  },
  notion: {
    name: 'Notion',
    token: 'NOTION_TOKEN',
    needs: 'read content',
    where: 'notion.so/profile/integrations → your integration → Capabilities',
    reach: 'the page must be shared with the integration (open the page → ⋯ → Connections → add it)',
  },
  confluence: {
    name: 'Confluence',
    token: 'CONFLUENCE_TOKEN',
    needs: 'the Read permission for this space',
    where: 'id.atlassian.com → Security → API tokens (the account is CONFLUENCE_EMAIL)',
    reach: 'the space must be one that account can read',
  },
};

export const HOST_KEYS = Object.keys(HOSTS);
const hostOf = (host) => (typeof host === 'object' && host ? host : HOSTS[String(host).toLowerCase()] ?? null);

// One refusal, in words a person can act on. status: the HTTP status. opts:
//   what   - what was being read or written ("the guidelines page"), named in the sentence
//   needs  - the permission this particular call wants, when it is more than the host's usual (a write)
//   detail - anything the host itself said that is worth repeating
// → a single line, or null for a status that is not a refusal.
export function refusal(host, status, { what = null, needs = null, detail = null } = {}) {
  const h = hostOf(host);
  if (!h) return null;
  const code = Number(status);
  const of = what ? ` ${what}` : '';
  const add = detail ? ` (${String(detail).split('\n')[0].trim()})` : '';
  const want = needs ?? h.needs;
  if (code === 401) return `${h.name} did not accept the token (401)${of ? ` for${of}` : ''}: ${h.token} is wrong, expired or revoked${add}. A new one: ${h.where}`;
  if (code === 403) return `${h.name} refused${of} (403): the token in ${h.token} needs ${want}, and ${h.reach}${add}. Add it at ${h.where}`;
  // A private thing with no access reads exactly like one that is not there, so 404 says both rather than sending
  // somebody to check a link that was right all along.
  if (code === 404) return `${h.name} did not find${of || ' it'} (404): the link may be wrong, or it is private and the token in ${h.token} cannot reach it — ${h.reach}${add}. Add it at ${h.where}`;
  if (code === 429) return `${h.name} is rate limiting this run (429)${of ? ` on${of}` : ''}${add}: it will work again shortly; a token in ${h.token} raises the limit. Make one at ${h.where}`;
  return null;
}

// The same, for a status this does not name: the host and the number, so nothing is swallowed.
export function said(host, status, opts = {}) {
  const h = hostOf(host);
  if (!h) return `the request failed (${status})`;
  return refusal(h, status, opts) ?? `${h.name} answered ${status}${opts.what ? ` for ${opts.what}` : ''}`;
}

// Whether a status is one a permission would fix: used to decide between "ask the person" and "try again".
export const isRefusal = (status) => [401, 403, 404].includes(Number(status));
