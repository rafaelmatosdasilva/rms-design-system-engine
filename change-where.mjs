// change-where.mjs - for the Changelog: what each commit was for when its message names no issue (the issue its merge or
// pull request closes, else that request itself), and where it changed the system besides a component's code: Figma's
// data, the documentation, the tokens, the version, the pipeline, the engine's setup, anything else by its folder. Read
// from the commit's own diff, so a row never says "no component" when the commit changed something.
//
//   requestOf(subject)              → { n } from a squash merge's "(#12)" or a merge commit's "Merge … #12 / !12"
//   closesOf(text, cfg)             → ['#45', 'ABC-12']: the issues a request's title and description say it closes
//   diffFiles(unifiedDiff)          → [{ path, diff }]: a commit's patch, file by file
//   whereOf(files, ctx)             → [{ kind, label, names?, count?, version? }]: the parts it changed, components left out
//   requestLabel(n, gitlab)         → '!12' on GitLab, 'PR #12' elsewhere

const sameWord = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function requestOf(subject) {
  const s = String(subject ?? '');
  const m = /\(#(\d+)\)\s*$/.exec(s) ?? /^Merge (?:pull|merge) request [#!](\d+)/i.exec(s) ?? /\bSee merge request [\w./-]*!(\d+)/i.exec(s);
  return m ? { n: m[1] } : null;
}
export const requestLabel = (n, gitlab) => (gitlab ? `!${n}` : `PR #${n}`);

// What a request says it closes: GitHub's and GitLab's closing words (closes, fixes, resolves, implements) before an
// issue (#45, group/project#45) or a tracker key (ABC-12), and the team's own pattern at the start of its title.
export function closesOf(text, cfg = {}) {
  const out = [];
  const add = (t) => { const v = String(t).trim(); if (v && !out.includes(v)) out.push(v); };
  for (const m of String(text ?? '').matchAll(/\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?|implement(?:s|ed)?)\s*:?\s+((?:[\w.-]+\/[\w.-]+)?#\d+|[A-Z][A-Z0-9]+-\d+)/gi)) add(m[1]);
  const own = cfg?.changelog?.ticket;
  if (own) { try { const m = new RegExp(`^\\s*\\[?(${own})\\]?`).exec(String(text ?? '')); if (m) add(m[1]); } catch { /* the team's pattern does not compile: said by ticketOf */ } }
  return out;
}

// A unified diff (git show / git log -p, or GitLab's per-file diffs joined) → [{ path, diff }].
export function diffFiles(text) {
  const out = [];
  let cur = null;
  for (const line of String(text ?? '').split('\n')) {
    const m = /^diff --git a\/(.+?) b\/(.+)$/.exec(line);
    if (m) { cur = { path: m[2], diff: '' }; out.push(cur); continue; }
    if (cur && cur.diff.length < 200000 && /^[+-](?![+-]{2} )/.test(line)) cur.diff += line + '\n';
  }
  return out;
}

const CHANGELOG = /(^|\/)changelog[^/]*\.md$/i;
const PIPELINE = /^\.github\/workflows\/|^\.gitlab-ci\.ya?ml$|^\.gitlab\//;
const SETUP = /(^|\/)(ds-config\.json|figma\.config\.json|products\.json)$/;
const FIGMA = /(^|\/)figma-[\w-]+\.snapshot\.json$/;
const DOCS = /\.mdx?$|(^|\/)docs?\/|(^|\/)(contract\.authored|design-intent|design-system-engine-kept)\.json$|(^|\/)structure-contract\.m?js$/i;
const TOKENS = /(^|\/)[\w.-]*tokens?[\w.-]*\.(json|css|scss)$|(^|\/)(theme|variables)[\w.-]*\.(css|scss)$/i;
const AGENTS = /^\.(claude|cursor|github\/copilot)[\/-]|(^|\/)(AGENTS|CLAUDE|GEMINI)\.md$|(^|\/)skills\//;
const TESTS = /(^|\/)(tests?|__tests__|e2e|spec)\/|\.(spec|test)\.[cm]?[jt]sx?$/;
const EXAMPLES = /(^|\/)(views|stories|showroom|playground|demos?|examples?)\/|\.stories\.[cm]?[jt]sx?$/;
const CODE = /\.(vue|svelte|[cm]?[jt]sx?|css|scss|less)$/;

// A file's "folder/File" without its extension, lower case: the documentation, the demo page and the test of a
// component sit under the same as its own code (chip/Chip.vue, docs/components/chip/Chip.md).
export const pathKey = (p) => { const parts = String(p).replace(/\.[^./]+$/, '').replace(/\.(spec|test|stories)$/i, '').toLowerCase().split('/'); return parts.slice(-2).join('/'); };

// The names a patch's changed lines speak of: the system's components (as words), CSS variables, and tokens written as
// paths (color/primary, spacing.gap.m).
function namesIn(diff, names) {
  const found = new Set();
  for (const n of names) if (new RegExp(`(^|[^\\w-])${sameWord(n)}([^\\w-]|$)`, 'm').test(diff)) found.add(n);
  return [...found];
}
const varsIn = (diff) => new Set([...String(diff).matchAll(/(--[a-z0-9][\w-]*)\s*:/gi)].map((m) => m[1]));
const tokenPathsIn = (diff) => new Set([...String(diff).matchAll(/"((?:[a-z][\w-]*[/.]){1,}[a-z0-9][\w-]*)"\s*:/gi)].map((m) => m[1]));

// ctx: { names (the system's components), componentFiles (Set of their files), themeFiles (the token stylesheets),
// styleguideDir (where the page is built, in the repository) }
export function whereOf(files = [], ctx = {}) {
  const names = ctx.names ?? [], own = ctx.componentFiles ?? new Set(), themes = new Set(ctx.themeFiles ?? []);
  const byKey = ctx.byKey ?? new Map();   // pathKey(a component's file) → its name
  const groups = { figma: [], docs: [], examples: [], tokens: [], code: [], tests: [], agents: [], version: [], pipeline: [], setup: [], styleguide: [], other: [] };
  for (const f of files) {
    const p = String(f.path ?? '');
    if (own.has(p)) continue;   // a component's own file: its chip says it
    if (p === 'package.json' || /(^|\/)package\.json$/.test(p) && !p.includes('node_modules')) {
      const only = String(f.diff ?? '').split('\n').filter(Boolean).every((l) => /^[+-]\s*"version"\s*:/.test(l));
      (only ? groups.version : groups.other).push(f); continue;
    }
    if (CHANGELOG.test(p)) { groups.version.push(f); continue; }
    if (PIPELINE.test(p)) { groups.pipeline.push(f); continue; }
    if (SETUP.test(p)) { groups.setup.push(f); continue; }
    if (FIGMA.test(p)) { groups.figma.push(f); continue; }
    if (ctx.styleguideDir && p.startsWith(ctx.styleguideDir.replace(/\/?$/, '/'))) { groups.styleguide.push(f); continue; }
    if (AGENTS.test(p)) { groups.agents.push(f); continue; }
    if (themes.has(p) || TOKENS.test(p)) { groups.tokens.push(f); continue; }
    if (TESTS.test(p)) { groups.tests.push(f); continue; }
    if (DOCS.test(p)) { groups.docs.push(f); continue; }
    if (EXAMPLES.test(p) && CODE.test(p)) { groups.examples.push(f); continue; }
    if (CODE.test(p)) { groups.code.push(f); continue; }
    groups.other.push(f);
  }
  // The components a group speaks of: by path (the same folder/File as a component's code), else by the words of its
  // changed lines.
  const of = (list) => [...new Set([...list.map((f) => byKey.get(pathKey(f.path))).filter(Boolean), ...namesIn(list.map((f) => f.diff ?? '').join('\n'), names)])];
  const out = [];
  const diffOf = (list) => list.map((f) => f.diff ?? '').join('\n');
  if (groups.figma.length) {
    const d = diffOf(groups.figma), comps = namesIn(d, names), toks = tokenPathsIn(diffOf(groups.figma.filter((f) => /vars/.test(f.path)))).size;
    out.push({ kind: 'figma', label: 'Figma', names: comps, count: comps.length, tokens: toks });
  }
  if (groups.docs.length) { const comps = of(groups.docs); out.push({ kind: 'docs', label: 'Documentation', names: comps, count: comps.length }); }
  if (groups.examples.length) { const comps = of(groups.examples); out.push({ kind: 'examples', label: 'Examples', names: comps, count: comps.length || groups.examples.length }); }
  if (groups.tokens.length) { const d = diffOf(groups.tokens); const n = new Set([...varsIn(d), ...tokenPathsIn(d)]).size; out.push({ kind: 'tokens', label: 'Tokens', count: n }); }
  if (groups.code.length) { const comps = groups.code.map((f) => byKey.get(pathKey(f.path))).filter(Boolean); out.push({ kind: 'code', label: 'Code', names: [...new Set(comps)], count: groups.code.length }); }
  if (groups.tests.length) { const comps = of(groups.tests); out.push({ kind: 'tests', label: 'Tests', names: comps, count: comps.length || groups.tests.length }); }
  if (groups.agents.length) out.push({ kind: 'agents', label: 'Agent files', count: groups.agents.length });
  if (groups.version.length) {
    const v = /^\+\s*"version"\s*:\s*"([^"]+)"/m.exec(diffOf(groups.version.filter((f) => /package\.json$/.test(f.path))))?.[1] ?? null;
    out.push({ kind: 'version', label: v ? `Version ${v}` : 'Version', version: v });
  }
  if (groups.styleguide.length) out.push({ kind: 'styleguide', label: 'Style guide' });
  if (groups.pipeline.length) out.push({ kind: 'pipeline', label: 'Pipeline' });
  if (groups.setup.length) out.push({ kind: 'setup', label: 'Setup' });
  if (groups.other.length) {
    const where = [...new Set(groups.other.map((f) => (f.path.includes('/') ? f.path.split('/')[0] + '/' : f.path)))];
    out.push({ kind: 'other', label: where.slice(0, 3).join(', ') + (where.length > 3 ? ` +${where.length - 3}` : ''), count: groups.other.length });
  }
  return out;
}
