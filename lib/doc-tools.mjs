// doc-tools.mjs - an intent layer kept in a documentation tool: a Notion page (its child pages, and the rows of its
// databases) or a Confluence page (its descendants). Each is read through the
// tool's API into Markdown files, one a page, under folders named after the pages above it ("Components/Button.md"),
// so doc-source-markdown.mjs reads them as it reads a docs folder: kinds by folder, sections by heading, drafts and open
// questions set apart. A host here has the shape doc-host.mjs gives (head, files, changed, lastChange), and files()
// also gives each page's own link in the tool (urls), since no link can be built from a path.
//
// Tokens, from the environment or the project's .env, each sent only to its own tool:
//   Notion      NOTION_TOKEN (an internal integration's, the page shared with it)       → api.notion.com
//   Confluence  CONFLUENCE_TOKEN, with CONFLUENCE_EMAIL on Atlassian's cloud (basic auth) → the page's own host;
//               none for a site that lets anyone read it, which is asked first with no sign-in
// READ-ONLY: only GETs (and Notion's database query, a POST that reads). The engine never writes to these tools: the
// Documentation page lists each change for a person. DEGRADE-SAFE: a failure is { error } in plain words.

import { createHash } from 'node:crypto';
import { said } from './host-refusals.mjs';
import { envFrom, plainGet, plainSend } from './gitlab-source.mjs';
import { blocksToMarkdown, pageIdFromUrl } from './notion-fetch.mjs';
import { decodeEntities } from './doc-source-markdown.mjs';

const MAX_PAGES = 1500;
const slug = (s) => String(s ?? '').trim().replace(/[\\/:*?"<>|#]+/g, ' ').replace(/\s+/g, ' ').trim() || 'Untitled';
const yaml = (s) => JSON.stringify(String(s ?? ''));
// A page as a Markdown file: its title and what the tool knows of it in the front matter, then its body.
const asFile = (path, title, body, meta = {}) => ({
  path, data: Buffer.from(['---', `title: ${yaml(title)}`, ...Object.entries(meta).filter(([, v]) => v != null && v !== '').map(([k, v]) => `${k}: ${yaml(v)}`), '---', '', String(body ?? '').trim(), ''].join('\n')),
});
const digest = (parts) => createHash('sha1').update(parts.join('\n')).digest('hex');
const getter = (fetchImpl, headers) => async (url) => { try { return await fetchImpl(url, { method: 'GET', headers }); } catch { return { ok: false, status: 0 }; } };
// Which permission is missing and where it is given comes from one table (host-refusals.mjs), so a refusal here
// says as much as GitLab's always did: "the page is not shared, or the link is wrong" named neither.
const why = (tool, status, token) => (status ? said(tool, status, { needs: token.includes(' and ') ? `${token} to be set, and read access` : null }) : `could not reach ${tool}`);
// Each page dated by the tool's own "last edited", so a host can say when a page last changed.
function dated(list) { const at = new Map(list.map((p) => [p.path, p.at])); return async (path) => at.get(path) ?? null; }

// ── Notion ──────────────────────────────────────────────────────────────────────────────────────────────────────────
// The page named, its child pages (a folder each when they have children of their own) and the rows of the databases
// in it (a page each, its properties as front matter: Kind, Status, Component, Aliases, by name, any case).
export function notionHost(ROOT, c, { env = process.env, fetchImpl = plainGet, sendImpl = plainSend } = {}) {
  const id = pageIdFromUrl(c.url);
  if (!id) return { error: `${c.url} is not a Notion page link` };
  const token = envFrom('NOTION_TOKEN', env, [ROOT]);
  const headers = { ...(token ? { Authorization: `Bearer ${token}` } : {}), 'Notion-Version': '2022-06-28', 'User-Agent': 'rms-design-system-engine' };
  const get = getter(fetchImpl, headers);
  const api = 'https://api.notion.com/v1';
  let tree = null;
  const children = async (bid) => {
    const out = []; let cursor = null;
    do {
      const r = await get(`${api}/blocks/${bid}/children?page_size=100${cursor ? `&start_cursor=${encodeURIComponent(cursor)}` : ''}`);
      if (!r.ok) throw Object.assign(new Error(why('Notion', r.status, 'NOTION_TOKEN')), { status: r.status });
      const j = await r.json(); out.push(...(j.results ?? [])); cursor = j.has_more ? j.next_cursor : null;
    } while (cursor);
    return out;
  };
  const content = async (blocks) => {
    // A block's own children (a toggle's, a list item's) are part of the page; a child page is a page of its own.
    for (const b of blocks) if (b.has_children && b.type !== 'child_page' && b.type !== 'child_database') b._children = await content(await children(b.id));
    return blocks.filter((b) => b.type !== 'child_page' && b.type !== 'child_database');
  };
  const prop = (props, ...names) => { for (const [k, v] of Object.entries(props ?? {})) if (names.includes(k.toLowerCase())) { const t = v?.type; const x = v?.[t]; return t === 'select' || t === 'status' ? x?.name : t === 'multi_select' ? (x ?? []).map((o) => o.name).join(', ') : Array.isArray(x) ? x.map((r) => r.plain_text ?? '').join('') : typeof x === 'string' ? x : null; } return null; };
  const walk = async () => {
    const pages = [];
    const visit = async (bid, folder, depth) => {
      if (depth > 6 || pages.length >= MAX_PAGES) return;
      for (const b of await children(bid)) {
        if (b.type === 'child_page') {
          const title = b.child_page?.title ?? 'Untitled';
          pages.push({ id: b.id, title, path: `${folder}${slug(title)}.md`, at: b.last_edited_time ?? null });
          if (b.has_children) await visit(b.id, `${folder}${slug(title)}/`, depth + 1);
        } else if (b.type === 'child_database') {
          const name = b.child_database?.title || 'Database';
          let cursor = null;
          do {
            const r = await sendImpl(`${api}/databases/${b.id}/query`, { method: 'POST', headers, body: { page_size: 100, ...(cursor ? { start_cursor: cursor } : {}) } });
            if (!r.ok) throw Object.assign(new Error(why('Notion', r.status, 'NOTION_TOKEN')), { status: r.status });
            const j = await r.json();
            for (const row of j.results ?? []) {
              const props = row.properties ?? {};
              const t = Object.values(props).find((p) => p?.type === 'title');
              const title = (t?.title ?? []).map((x) => x.plain_text ?? '').join('') || 'Untitled';
              pages.push({ id: row.id, title, path: `${folder}${slug(name)}/${slug(title)}.md`, at: row.last_edited_time ?? null, url: row.url ?? null,
                meta: { kind: prop(props, 'kind', 'type', 'layer'), status: prop(props, 'status'), component: prop(props, 'component', 'code', 'source'), aliases: prop(props, 'aliases') } });
            }
            cursor = j.has_more ? j.next_cursor : null;
          } while (cursor);
        }
      }
    };
    await visit(id, '', 0);
    return pages;
  };
  return {
    kind: 'notion', name: 'Notion', url: c.url,
    async head() {
      if (!token) return { error: 'no NOTION_TOKEN in .env: make an internal integration in Notion, share the page with it, and put its token in .env as NOTION_TOKEN=... (never in the chat)' };
      try { tree = await walk(); } catch (e) { return { error: e.message }; }
      const d = digest(tree.map((p) => `${p.id} ${p.at}`));
      return { ref: 'latest', sha: d, digest: d, committedAt: tree.map((p) => p.at).filter(Boolean).sort().pop() ?? '' };
    },
    async files() {
      try {
        tree ??= await walk();
        const files = [], urls = {};
        for (const p of tree) {
          const md = blocksToMarkdown(await content(await children(p.id)));
          if (!md.trim() && !p.meta) continue;   // a page that only holds others: a folder
          files.push(asFile(p.path, p.title, md, p.meta ?? {}));
          urls[p.path] = p.url ?? `https://www.notion.so/${p.id.replace(/-/g, '')}`;
        }
        return { files, paths: files.map((f) => f.path), urls };
      } catch (e) { return { error: e.message }; }
    },
    async changed() { return null; },
    lastChange: (path) => dated(tree ?? [])(path),
  };
}

// ── Confluence ──────────────────────────────────────────────────────────────────────────────────────────────────────
// The page named and its descendants, each its storage format turned into Markdown. Cloud (…atlassian.net/wiki) and
// Data Center (any host; CONFLUENCE_TOKEN a personal access token, as a bearer).
// A page's link, in each form Confluence gives one: …/spaces/<space>/pages/<id>/<title>, …/pages/viewpage.action?pageId=<id>
// and …/display/<space>/<title>, which names no id (it is looked up by space and title). The site's own path before
// it (/wiki on the cloud, /confluence or any other on Data Center) is where its API lives.
const LINK = /^(.*?)\/(?:spaces\/[^/]+\/pages\/(\d+)|pages\/viewpage\.action$|display\/([A-Z][A-Z0-9_]*|~[^/]+)\/([^/]+))/;
export function parseConfluence(link) {
  let u; try { u = new URL(String(link ?? '').trim()); } catch { return null; }
  const m = LINK.exec(u.pathname);
  const id = m?.[2] ?? (m && /viewpage\.action$/.test(u.pathname) ? u.searchParams.get('pageId') : null);
  const named = m?.[3] ? { space: decodeURIComponent(m[3]), title: decodeURIComponent(m[4].replace(/\+/g, ' ')) } : null;
  if (!id && !named) return null;
  return { origin: u.origin, base: `${u.origin}${m[1]}`, host: u.host, id, named };
}
// Confluence's storage format (XHTML with ac: macros) → Markdown: headings, paragraphs, lists, tables a row a line, code
// macros fenced; other macros and images out.
// Every tag out, again until none is left (one taken out may join the halves of another), then any lone < left of one.
const noTags = (t, by = '') => { let s = String(t ?? ''), was; do { was = s; s = s.replace(/<[^<>]*>/g, by); } while (s !== was); return s.replace(/</g, ''); };
export function storageToMarkdown(xml) {
  let s = String(xml ?? '');
  // Code first, set aside, so nothing below reads it as markup.
  const code = [];
  s = s.replace(/<ac:structured-macro[^>]*ac:name="code"[^>]*>[\s\S]*?<ac:plain-text-body><!\[CDATA\[([\s\S]*?)\]\]><\/ac:plain-text-body>[\s\S]*?<\/ac:structured-macro>/g, (m, c) => { code.push(c); return `\n\n\u0000${code.length - 1}\u0000\n\n`; });
  // A link to another page (or a file, or a person) keeps its words: what it shows, else the page's title. A real
  // page's "See also <the page>" read as "See also" when links were dropped with the other macros.
  s = s.replace(/<ac:link\b[^>]*>([\s\S]*?)<\/ac:link>/g, (m, inner) => {
    const shown = /<ac:plain-text-link-body><!\[CDATA\[([\s\S]*?)\]\]><\/ac:plain-text-link-body>/.exec(inner)?.[1] ?? /<ac:link-body>([\s\S]*?)<\/ac:link-body>/.exec(inner)?.[1];
    return shown ?? /ri:(?:content-title|filename|value)="([^"]*)"/.exec(inner)?.[1] ?? '';
  });
  s = s.replace(/<ac:image[\s\S]*?<\/ac:image>/g, '').replace(/<ac:structured-macro[^>]*ac:name="(?:toc|children|jira|attachments|gallery)"[\s\S]*?<\/ac:structured-macro>/g, '');
  s = s.replace(/<ac:structured-macro[^>]*\/>/g, '').replace(/<\/?ac:(?:structured-macro|rich-text-body|parameter|layout|layout-section|layout-cell)[^>]*>/g, '\n');
  s = s.replace(/<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/g, (m, n, t) => `\n${'#'.repeat(Number(n))} ${noTags(t).trim()}\n`);
  s = s.replace(/<tr[^>]*>([\s\S]*?)<\/tr>/g, (m, row) => `\n| ${[...row.matchAll(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/g)].map((c) => noTags(c[1], ' ').replace(/\s+/g, ' ').trim()).join(' | ')} |`);
  s = s.replace(/<a [^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g, (m, h, t) => `[${noTags(t)}](${h})`);
  s = s.replace(/<li[^>]*>([\s\S]*?)<\/li>/g, (m, t) => `\n- ${noTags(t.replace(/<(?:strong|b)>([\s\S]*?)<\/(?:strong|b)>/g, '**$1**')).replace(/\s+/g, ' ').trim()}`);
  s = s.replace(/<(?:strong|b)>([\s\S]*?)<\/(?:strong|b)>/g, '**$1**').replace(/<code>([\s\S]*?)<\/code>/g, '`$1`');
  // A list or a table ends with a blank line, so the paragraph after it is not read as its last item's continuation.
  s = s.replace(/<\/(?:ul|ol|table)>/g, '\n\n');
  s = s.replace(/<\/p>|<br\s*\/?>/g, '\n').replace(/<p[^>]*>/g, '\n');
  s = noTags(s);
  s = decodeEntities(s).split('\n').map((l) => l.replace(/\s+$/, '')).join('\n').replace(/\n{3,}/g, '\n\n').trim();
  return s.replace(/\u0000(\d+)\u0000/g, (m, i) => `\`\`\`\n${code[Number(i)]}\n\`\`\``);
}
export function confluenceHost(ROOT, c, { env = process.env, fetchImpl = plainGet } = {}) {
  const p = parseConfluence(c.url);
  if (!p) return { error: `${c.url} is not a Confluence page link (…/spaces/<space>/pages/<id>/…, …/pages/viewpage.action?pageId=<id> or …/display/<space>/<title>)` };
  const token = envFrom('CONFLUENCE_TOKEN', env, [ROOT]), email = envFrom('CONFLUENCE_EMAIL', env, [ROOT]);
  const headers = { Accept: 'application/json', 'User-Agent': 'rms-design-system-engine', ...(token ? { Authorization: email ? `Basic ${Buffer.from(`${email}:${token}`).toString('base64')}` : `Bearer ${token}` } : {}) };
  const get = getter(fetchImpl, headers);
  const api = `${p.base}/rest/api`;
  // A refusal with no token set is the page asking for a sign-in; with one, the token's own.
  const refused = (status) => (!token && [401, 403, 404].includes(Number(status))
    ? `Confluence did not let this run read the page without signing in (${status}): put CONFLUENCE_TOKEN in .env by hand (never in the chat), an API token with CONFLUENCE_EMAIL on Atlassian's cloud, a personal access token on Data Center`
    : why('Confluence', status, email ? 'CONFLUENCE_EMAIL and CONFLUENCE_TOKEN' : 'CONFLUENCE_TOKEN'));
  const EXPAND = 'expand=version,body.storage';
  const page = (x, path) => ({ id: String(x.id), title: x.title, path, at: x.version?.when ?? null, v: x.version?.number, body: x.body?.storage?.value ?? '', url: x._links?.webui ? `${p.base}${x._links.webui}` : null });
  let pages = null;
  const list = async () => {
    let r;
    if (p.id) {
      const root = await get(`${api}/content/${p.id}?${EXPAND}`);
      if (!root.ok) throw new Error(refused(root.status));
      r = await root.json();
    } else {
      const found = await get(`${api}/content?spaceKey=${encodeURIComponent(p.named.space)}&title=${encodeURIComponent(p.named.title)}&type=page&${EXPAND}`);
      if (!found.ok) throw new Error(refused(found.status));
      r = (await found.json()).results?.[0];
      if (!r) throw new Error(`Confluence has no page "${p.named.title}" in the space ${p.named.space} that this run can read: the link may be wrong, or the page needs a sign-in (CONFLUENCE_TOKEN in .env)`);
    }
    const id = String(r.id), top = slug(r.title);
    const out = [page(r, `${top}.md`)];
    // Every page under it at once, in folders by the pages between: the quick way, where the site answers it.
    const all = [];
    for (let start = 0; all.length < MAX_PAGES; start += 50) {
      const d = await get(`${api}/content/${id}/descendant/page?limit=50&start=${start}&expand=version,ancestors,body.storage`);
      if (!d.ok) { if ([401, 403].includes(Number(d.status))) throw new Error(refused(d.status)); all.length = 0; all.failed = true; break; }
      const j = await d.json();
      for (const x of j.results ?? []) {
        const up = (x.ancestors ?? []).map((a) => String(a.id)); const from = up.indexOf(id);
        const folders = (x.ancestors ?? []).slice(from + 1).map((a) => slug(a.title));
        all.push(page(x, `${[top, ...folders].join('/')}/${slug(x.title)}.md`));
      }
      if ((j.results ?? []).length < 50) break;
    }
    if (!all.failed) return out.concat(all);
    // Some sites answer that call with an error (a real Data Center answered 500 for every page), so the pages are
    // walked a level at a time instead, each page's children under its own folder.
    const walk = [[id, top]];
    while (walk.length && out.length < MAX_PAGES) {
      const [at, folder] = walk.shift();
      for (let start = 0; out.length < MAX_PAGES; start += 50) {
        const d = await get(`${api}/content/${at}/child/page?limit=50&start=${start}&${EXPAND}`);
        if (!d.ok) throw new Error(refused(d.status));
        const j = await d.json();
        for (const x of j.results ?? []) { out.push(page(x, `${folder}/${slug(x.title)}.md`)); walk.push([String(x.id), `${folder}/${slug(x.title)}`]); }
        if ((j.results ?? []).length < 50) break;
      }
    }
    return out;
  };
  return {
    kind: 'confluence', name: p.host, url: c.url,
    async head() {
      try { pages = await list(); } catch (e) { return { error: e.message }; }
      const d = digest(pages.map((x) => `${x.id} ${x.v}`));
      return { ref: 'latest', sha: d, digest: d, committedAt: pages.map((x) => x.at).filter(Boolean).sort().pop() ?? '' };
    },
    async files() {
      try {
        pages ??= await list();
        const files = pages.map((x) => asFile(x.path, x.title, storageToMarkdown(x.body)));
        return { files, paths: files.map((f) => f.path), urls: Object.fromEntries(pages.filter((x) => x.url).map((x) => [x.path, x.url])) };
      } catch (e) { return { error: e.message }; }
    },
    async changed() { return null; },
    lastChange: (path) => dated(pages ?? [])(path),
  };
}
