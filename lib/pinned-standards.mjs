// pinned-standards.mjs - every outside fact the engine pins, and how to ask whether it has moved.
//
// DSDS is asked for its newest tag every week, and its pin moves only through a pull request that says what passed
// (dsds-release.mjs, .github/workflows/dsds-release.yml). The engine pins other outside facts the same way and
// nothing asked about any of them: a version of an accessibility rule set, a report format, a table of what browsers
// run. A pin nobody asks about goes stale unseen, which is how DSDS came to be eight months behind before anything
// said so. This is the one list of them, and what each is asked.
//
// A pin with no source to ask is kept in the list and reported as unwatched rather than left out: the list is what
// says the engine pins it at all, and "nothing can ask about this" is the finding, not a reason to hide it.
//
//   pinnedNow(root)        → [{ ...entry, pinned }]: each pin as it reads in the repository right now
//   newestOf(entry, opts)  → { latest, behind, why }: what its source says, where there is one to ask
//   staleLines(state)      → [line]: what to say about the set, for an issue or a run
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const ENGINE = dirname(dirname(fileURLToPath(import.meta.url)));

// kind: how its source is asked.
//   github-tags  the newest tag of a repository          npm  the newest version of a package
//   age          no version at all, only when it was read (a curated table): old past `months`
//   none         nothing to ask, and why
export const PINNED = [
  { id: 'dsds', what: 'the design system documentation schema the contracts are written in',
    file: 'lib/contract-dsds.mjs', reads: /^export const DSDS_VERSION = '([^']+)';$/m,
    ask: { kind: 'github-tags', repo: 'somerandomdude/design-system-documentation-schema' },
    watchedBy: '.github/workflows/dsds-release.yml' },
  { id: 'axe-core', what: 'the accessibility rules the browser checks run',
    file: 'lib/a11y-check.mjs', reads: /^const AXE_VERSION = '([^']+)';$/m,
    ask: { kind: 'npm', name: 'axe-core' } },
  { id: 'ibm-equal-access', what: 'the second rule engine the accessibility check runs beside axe-core, when installed',
    file: 'lib/a11y-ibm.mjs', reads: /^export const IBM_VERSION = '([^']+)';$/m,
    ask: { kind: 'npm', name: 'accessibility-checker-engine' } },
  { id: 'act-rules', what: 'the W3C\'s ACT Rules test cases the engine\'s own checks are held against',
    file: 'lib/act-rules.mjs', reads: /^export const ACT_COMMIT = '([^']+)';$/m,
    ask: { kind: 'none', why: 'the W3C publishes the cases from a branch, with no release or tag: the pin is a commit, moved by hand after a run (node lib/act-rules.mjs run)' } },
  { id: 'sarif', what: 'the report format GitHub code scanning reads',
    file: 'lib/findings-report.mjs', reads: /^export const SARIF_VERSION = '([^']+)';$/m,
    ask: { kind: 'none', why: 'a finished standard that moves by a new major version, announced rather than tagged' } },
  { id: 'open-component-specs', what: 'the component specs format the contracts are also written in',
    file: 'lib/contract-spec.mjs', reads: /^export const SPEC_VERSION = '([^']+)';$/m,
    ask: { kind: 'none', why: 'the engine records no source for it, so nothing can ask: give it one, or say here that it is frozen' } },
  { id: 'web-features', what: 'the web platform\'s data of which browser version runs which web feature',
    file: 'lib/web-features-data.mjs', reads: /^export const WF_VERSION = '([^']+)';$/m,
    ask: { kind: 'npm', name: 'web-features' } },
  { id: 'web-features-table', what: 'the engine\'s own table of the same, the whole path with no data',
    file: 'lib/web-features.mjs', reads: /as it stood in (\w+ \d{4})/,
    ask: { kind: 'age', months: 6 } },
];

// Each pin as the repository has it now. A pin that cannot be read is said so: the line it is read from may have been
// renamed, and a watch that silently reads nothing is worse than none.
export function pinnedNow(root, list = PINNED) {
  return list.map((e) => {
    let text;
    try { text = readFileSync(join(root, e.file), 'utf8'); } catch { return { ...e, pinned: null, why: `${e.file} is not there` }; }
    const m = e.reads.exec(text);
    return { ...e, pinned: m ? m[1] : null, ...(m ? {} : { why: `${e.file} no longer has the line this reads the pin from` }) };
  });
}

const num = (v) => String(v ?? '').trim().replace(/^v/, '').split('.').map((x) => Number(x) || 0);
export const isNewer = (a, b) => { const [x, y] = [num(a), num(b)]; for (let i = 0; i < Math.max(x.length, y.length); i++) { if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) > (y[i] ?? 0); } return false; };

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
// "November 2026" → how many months ago it was, by the day given.
export function monthsSince(written, now = new Date()) {
  const m = /^(\w+)\s+(\d{4})$/.exec(String(written ?? '').trim());
  if (!m) return null;
  const month = MONTHS.indexOf(m[1].toLowerCase());
  if (month < 0) return null;
  return (now.getUTCFullYear() - Number(m[2])) * 12 + (now.getUTCMonth() - month);
}

// What its source says now. fetchImpl is given in, so nothing here reaches the network in a test.
// → { latest, behind, why }
export async function newestOf(entry, { fetchImpl = fetch, now = new Date() } = {}) {
  const { ask, pinned } = entry;
  if (!pinned) return { latest: null, behind: false, why: entry.why ?? 'its pin could not be read' };
  if (ask.kind === 'none') return { latest: null, behind: false, why: ask.why };
  if (ask.kind === 'age') {
    const old = monthsSince(pinned, now);
    if (old === null) return { latest: null, behind: false, why: 'when it was read is not written in a way this reads' };
    return { latest: null, behind: old >= ask.months, why: `read ${old} month${old === 1 ? '' : 's'} ago, and it is read again every ${ask.months}` };
  }
  try {
    if (ask.kind === 'npm') {
      const r = await fetchImpl(`https://registry.npmjs.org/${ask.name}/latest`, { signal: AbortSignal.timeout(30000) });
      if (!r.ok) return { latest: null, behind: false, why: `the registry answered ${r.status}` };
      const latest = (await r.json())?.version ?? null;
      return { latest, behind: !!latest && isNewer(latest, pinned), why: null };
    }
    if (ask.kind === 'github-tags') {
      const r = await fetchImpl(`https://api.github.com/repos/${ask.repo}/tags?per_page=100`, { headers: { accept: 'application/vnd.github+json' }, signal: AbortSignal.timeout(30000) });
      if (!r.ok) return { latest: null, behind: false, why: `GitHub answered ${r.status}` };
      const tags = (await r.json()) ?? [];
      const latest = tags.map((t) => String(t?.name ?? '')).filter((n) => /^v?\d+\.\d+\.\d+$/.test(n)).sort((a, b) => (isNewer(a, b) ? -1 : 1))[0] ?? null;
      return { latest: latest ? latest.replace(/^v/, '') : null, behind: !!latest && isNewer(latest, pinned), why: null };
    }
  } catch (e) { return { latest: null, behind: false, why: `its source could not be reached: ${String(e?.message ?? e).split('\n')[0]}` }; }
  return { latest: null, behind: false, why: `no way to ask for "${ask.kind}"` };
}

// Every pin, asked. → [{ id, what, file, pinned, latest, behind, why, watchedBy }]
export async function askAll(root, { fetchImpl = fetch, now = new Date(), list = PINNED } = {}) {
  const out = [];
  for (const e of pinnedNow(root, list)) out.push({ ...e, ...(await newestOf(e, { fetchImpl, now })) });
  return out;
}

// What to say about them: the ones behind first, then the ones nothing can ask about, then the rest in one line.
// An issue is opened on the first two - a pin nobody can ask about is a standing fact somebody has to decide on.
export function staleLines(state = []) {
  const behind = state.filter((s) => s.behind);
  const unwatched = state.filter((s) => !s.behind && (s.ask.kind === 'none' || s.pinned === null || (s.why && s.latest === null && s.ask.kind !== 'age')));
  const fine = state.filter((s) => !behind.includes(s) && !unwatched.includes(s));
  const lines = [];
  if (behind.length) {
    lines.push(`${behind.length} pinned standard${behind.length === 1 ? ' is' : 's are'} behind:`);
    for (const s of behind) lines.push(`- **${s.id}** (${s.what}): pinned at \`${s.pinned}\`${s.latest ? `, newest is \`${s.latest}\`` : ''}${s.why ? ` - ${s.why}` : ''} · ${s.file}${s.watchedBy ? ` · a watch of its own moves this one (${s.watchedBy})` : ''}`);
  }
  if (unwatched.length) {
    lines.push(`${unwatched.length} pinned standard${unwatched.length === 1 ? '' : 's'} nothing can ask about:`);
    for (const s of unwatched) lines.push(`- **${s.id}** (${s.what}): pinned at \`${s.pinned ?? 'nothing this reads'}\` · ${s.file} · ${s.why}`);
  }
  if (fine.length) lines.push(`${fine.length} other${fine.length === 1 ? '' : 's'} up to date: ${fine.map((s) => `${s.id} \`${s.pinned}\``).join(' · ')}`);
  return lines;
}

// ── Saying it, and keeping one issue current ─────────────────────────────────────
// The same shape as the release watch (release-due.mjs): one issue while something is behind, brought up to date
// while it lasts, closed when nothing is. A new issue each week for the same standard is how a watch gets muted.
export const ISSUE_TITLE = 'A pinned standard has moved';

export function issueBody(state, repo = '') {
  const behind = state.filter((s) => s.behind);
  return [
    `${behind.length} of the ${state.length} outside standards this engine pins ${behind.length === 1 ? 'has' : 'have'} moved since the pin was set.`,
    '', ...staleLines(state), '',
    'Each is a decision, not a chore: moving a pin changes what the engine writes or checks, so it goes through a pull request that says what passed.',
    'A standard with a watch of its own (DSDS) moves through that watch, never here.',
    '', `Asked every week by \`.github/workflows/pinned-standards.yml\`${repo ? ` in ${repo}` : ''}, and this issue closes when nothing is behind.`,
  ].join('\n');
}

const gh = (args) => { try { return execFileSync('gh', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim(); } catch { return ''; } };
const openIssue = (repo) => { try { return JSON.parse(gh(['issue', 'list', '--repo', repo, '--state', 'open', '--search', `"${ISSUE_TITLE}" in:title`, '--json', 'number,title']) || '[]').find((i) => i.title === ISSUE_TITLE) ?? null; } catch { return null; }; };

// report: say it and stop. check: say it, and keep the one issue current. → the state
export async function run(mode = 'report', { root = ENGINE, repo = process.env.GITHUB_REPOSITORY ?? '', fetchImpl = fetch, now = new Date() } = {}) {
  const state = await askAll(root, { fetchImpl, now });
  for (const l of staleLines(state)) console.log(l);
  if (mode !== 'check' || !repo) return state;
  const behind = state.filter((s) => s.behind), existing = openIssue(repo);
  if (behind.length && !existing) { gh(['issue', 'create', '--repo', repo, '--title', ISSUE_TITLE, '--body', issueBody(state, repo)]); console.log('opened an issue: a pinned standard has moved'); }
  else if (behind.length && existing) { gh(['issue', 'edit', String(existing.number), '--repo', repo, '--body', issueBody(state, repo)]); console.log(`issue #${existing.number} brought up to date`); }
  else if (!behind.length && existing) { gh(['issue', 'close', String(existing.number), '--repo', repo, '--comment', 'Every pinned standard is the newest its source has, or has no source to ask.']); console.log(`issue #${existing.number} closed: nothing is behind`); }
  return state;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const mode = process.argv[2] ?? 'report';
  if (!['report', 'check'].includes(mode)) { console.error('usage: node lib/pinned-standards.mjs [report | check]'); process.exit(2); }
  const state = await run(mode);
  // Exit 1 when one is behind, so a person running it by hand is told without reading, and a job can fail on it.
  process.exit(state.some((s) => s.behind) ? 1 : 0);
}
