// governance.mjs - how the team says changes are made, held against what its history shows was done.
//
// A system's contribution guide, its release process and its changelog say how a change is made: a breaking change
// takes a major version, an entry in the changelog and a migration note, commit messages follow a convention, an issue
// left with no activity is closed after so many days. This reads those documents for the rules they state, then walks
// the last releases (version tags) against them, and says where what happened parts from what the paper says.
//
// Only what the team's own documents ask for is checked: a rule the paper does not state is never held against them,
// and with no documents nothing is said. A breaking change is only what can be told mechanically: a commit marked so
// the Conventional Commits way (`feat!:`, a `BREAKING CHANGE:` footer) or with BREAKING in its subject, and the
// breaking changes the engine itself recorded for a version when it published the contracts (releases.mjs). A change
// not released yet is not held to a version, an entry or a note: it has not shipped.
//
// Pure: it is given the documents' text, the releases with their commits, the changelog and the open issues, and reads
// nothing itself. The audit reads them (System health, and the issues plan for the tracker).
//
//   paperRules(docs, changelog)                    → { major, changelog, migration, conventional, staleDays, duplicateDays }
//                                                    each { file, ...} when a document states it, else null
//   breakingOf(commit)                             → why the commit is breaking, or null
//   changelogSection(text, version)                → that version's section of a changelog, or null
//   governanceGaps({ rules, releases, records, changelog, migrationDocs }) → { breaking: [...], unconventional, checked }
//   governanceLines(gaps, rules)                   → the System health lines
//   trackerGaps(issues, rules, { now })            → { stale, duplicates }
//   trackerLines(gaps, rules)                      → the lines said beside the issues plan

// A version written into a pattern as itself: every character a pattern reads specially is escaped, backslash included.
const reEsc = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// The documents a team writes how it works in, in the system's repository, and its changelog.
export const GOVERNANCE_DOCS = ['CONTRIBUTING.md', '.github/CONTRIBUTING.md', 'docs/CONTRIBUTING.md', 'docs/contributing.md',
  'RELEASING.md', 'RELEASE.md', 'docs/RELEASING.md', 'docs/releasing.md', 'docs/release.md', 'docs/releases.md',
  'GOVERNANCE.md', 'docs/GOVERNANCE.md', 'docs/governance.md'];
export const CHANGELOGS = ['CHANGELOG.md', 'CHANGES.md', 'HISTORY.md', 'docs/CHANGELOG.md', 'docs/changelog.md'];
// A file of migration notes: its name says so (MIGRATION.md, docs/upgrading-to-v3.md).
export const isMigrationDoc = (file) => /(^|\/)[^/]*(migrat|upgrad)[^/]*\.mdx?$/i.test(String(file ?? ''));
// A version tag: v1.2.3 or 1.2.3, a pre-release left out.
export const isVersionTag = (tag) => /^v?\d+\.\d+\.\d+$/.test(String(tag ?? ''));

const nums = (v) => String(v ?? '').replace(/^v/, '').split('.').map((x) => parseInt(x, 10) || 0);

// The sentences of a document: a list's bullets and a table's rows are each one, as a paragraph's sentences are.
const sentences = (text) => String(text ?? '')
  .replace(/```[\s\S]*?```/g, ' ')
  .split(/\n\s*(?:[-*+]|\d+[.)])\s+|\n\s*\|\s*|\n{2,}|\n#+\s|(?<=[.!?])\s+(?=[A-Z`])/)
  .map((s) => s.replace(/\s+/g, ' ').trim()).filter(Boolean);

// What the documents ask for, each with the file that asks it and the words it says it in.
export function paperRules(docs = [], changelog = null) {
  const rules = { major: null, changelog: null, migration: null, conventional: null, staleDays: null, duplicateDays: null };
  const said = (key, file, s, more = {}) => { if (!rules[key]) rules[key] = { file, says: s.slice(0, 160), ...more }; };
  for (const { file, text } of docs) {
    for (const s of sentences(text)) {
      if ((/\bbreaking\b/i.test(s) && /\bmajor\b/i.test(s)) || /\bsemantic versioning\b|\bsemver\b/i.test(s)) said('major', file, s);
      if (/\bchange-?log\b/i.test(s) && /\b(add|adds|added|update|updates|entry|entries|record|recorded|document|documented|write|written|note|noted|list|listed|must|should)\b/i.test(s)) said('changelog', file, s);
      if (/\b(migration|upgrade)\s+(guide|note|notes|path|steps|instructions)\b|\bmigrat(e|ion)\b/i.test(s) && /\bbreaking\b|\bmajor\b/i.test(s)) said('migration', file, s);
      if (/\bconventional commits?\b/i.test(s)) said('conventional', file, s);
      const days = /\b(\d{1,3})\s*days?\b/i.exec(s)?.[1];
      if (days && /\bissues?\b/i.test(s) && /\b(stale|inactiv\w*|no (activity|reply|response|update)|without (any )?(activity|a reply|a response|updates?))\b/i.test(s)) said('staleDays', file, s, { days: Number(days) });
      if (days && /\bduplicates?\b/i.test(s)) said('duplicateDays', file, s, { days: Number(days) });
    }
  }
  // A changelog that says every notable change is written in it states the rule itself (Keep a Changelog's opening).
  if (!rules.changelog && changelog?.text) {
    const s = sentences(changelog.text).find((x) => /\ball notable changes\b.*\b(documented|recorded|listed|written)\b/i.test(x));
    if (s) said('changelog', changelog.file, s);
  }
  return rules;
}

// A commit is breaking when it says so: `type!:` or `type(scope)!:`, a BREAKING CHANGE footer, or BREAKING in its subject.
export function breakingOf(c = {}) {
  const subject = String(c.subject ?? '');
  if (/^\w+(\([^)]*\))?!:\s/.test(subject)) return 'marked ! in its subject';
  if (/^BREAKING[ -]CHANGES?:/m.test(String(c.body ?? ''))) return 'a BREAKING CHANGE footer';
  if (/\bBREAKING\b/.test(subject)) return 'BREAKING in its subject';
  return null;
}

// That version's section of a changelog: from the heading that names it to the next heading as high or higher.
export function changelogSection(text, version) {
  const v = String(version ?? '').replace(/^v/, '');
  if (!text || !v) return null;
  const at = new RegExp(`(?<![\\d.])v?${reEsc(v)}(?![\\d.]*\\d)`);
  const lines = String(text).split('\n');
  const start = lines.findIndex((l) => /^#{1,6}\s/.test(l) && at.test(l));
  if (start < 0) return null;
  const level = /^#+/.exec(lines[start])[0].length;
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) { const h = /^(#+)\s/.exec(lines[i]); if (h && h[1].length <= level) { end = i; break; } }
  return lines.slice(start, end).join('\n');
}

// A step from one version to the next that may break: a major, or a minor while the major is 0 (semver's own rule).
export const breakingStep = (prev, tag) => { const a = nums(prev), b = nums(tag); return b[0] > a[0] || (a[0] === 0 && b[0] === 0 && b[1] > a[1]); };
const stepName = (prev, tag) => { const a = nums(prev), b = nums(tag); return b[0] > a[0] ? 'major' : b[1] > a[1] ? 'minor' : 'patch'; };

const norm = (s) => String(s ?? '').toLowerCase().replace(/[`*_]/g, '').replace(/\s+/g, ' ').trim();
// Whether a changelog section names a commit: its short hash, its pull request, its scope, or its own words.
const namesCommit = (section, c) => {
  const s = norm(section);
  const subject = String(c.subject ?? '');
  const pr = /\(#(\d+)\)\s*$/.exec(subject)?.[1] ?? /(?:!|#)(\d+)\b/.exec(String(c.body ?? ''))?.[1];
  const scope = /^\w+\(([^)]+)\)/.exec(subject)?.[1];
  const words = norm(subject.replace(/^\w+(\([^)]*\))?!?:\s*/, '').replace(/\s*\(#\d+\)\s*$/, '')).slice(0, 40);
  return (c.short && s.includes(String(c.short).toLowerCase().slice(0, 7)))
    || (pr && new RegExp(`[#!]${pr}\\b`).test(s))
    || (scope && s.includes(norm(scope)))
    || (words.length >= 8 && s.includes(words));
};
// Whether it names a change the engine recorded: the component, the token, or the token's last part.
const namesRecord = (section, r) => {
  const s = norm(section);
  const name = norm(r.name);
  return !!name && (s.includes(name) || s.includes(name.split('/').at(-1)) || s.includes(name.replace(/\//g, '-')));
};
const hasMigration = (section) => /\bmigrat|\bupgrad/i.test(String(section ?? ''));

// Where the history parts from the paper.
//   releases: [{ tag, prev, commits: [{ sha, short, subject, body }] }], newest first, each with the tag before it
//   records:  the engine's own release records, [{ version, changes: [{ kind, name, says }] }]
//   changelog: { file, text } | null, migrationDocs: [{ file, text }]
// → { breaking: [{ tag, what, ref, why, gaps: [...] }], unconventional: { of, commits }, checked: { releases, breaking } }
export function governanceGaps({ rules = {}, releases = [], records = [], changelog = null, migrationDocs = [] } = {}) {
  const out = { breaking: [], unconventional: null, checked: { releases: 0, breaking: 0 } };
  const shipped = releases.filter((r) => isVersionTag(r.tag));
  out.checked.releases = shipped.length;
  const noted = (tag) => migrationDocs.some((d) => changelogSection(d.text, tag) != null || new RegExp(`(?<![\\d.])v?${reEsc(String(tag).replace(/^v/, ''))}(?![\\d.]*\\d)`).test(d.text));
  const holdTo = (tag, prev, section, named) => {
    const gaps = [];
    if (rules.major && prev && !breakingStep(prev, tag)) gaps.push(`a ${stepName(prev, tag)} step from ${prev}`);
    if (rules.changelog) {
      if (!changelog) gaps.push('no changelog to name it');
      else if (section == null) gaps.push(`no ${tag} entry in ${changelog.file}`);
      else if (!named) gaps.push(`the ${tag} entry in ${changelog.file} does not name it`);
    }
    if (rules.migration && !hasMigration(section) && !noted(tag)) gaps.push('no migration note');
    return gaps;
  };
  for (const r of shipped) {
    const section = changelog ? changelogSection(changelog.text, r.tag) : null;
    for (const c of r.commits ?? []) {
      const why = breakingOf(c);
      if (!why) continue;
      out.checked.breaking++;
      const gaps = holdTo(r.tag, r.prev, section, section != null && namesCommit(section, c));
      if (gaps.length) out.breaking.push({ tag: r.tag, what: String(c.subject ?? '').slice(0, 80), ref: c.short ?? String(c.sha ?? '').slice(0, 7), why, gaps });
    }
    // The breaking changes the engine recorded for this version, when it published the contracts.
    const rec = records.find((x) => String(x.version ?? '').replace(/^v/, '') === String(r.tag).replace(/^v/, ''));
    for (const ch of rec?.changes ?? []) {
      out.checked.breaking++;
      const gaps = holdTo(r.tag, r.prev, section, section != null && namesRecord(section, ch));
      if (gaps.length) out.breaking.push({ tag: r.tag, what: String(ch.says ?? ch.name ?? '').slice(0, 80), ref: null, why: 'recorded when the contracts were published', gaps });
    }
  }
  if (rules.conventional) {
    const all = shipped.flatMap((r) => r.commits ?? []).filter((c) => !/^(Merge|Revert)\b/.test(String(c.subject ?? '')));
    const off = all.filter((c) => !/^\w+(\([^)]*\))?!?:\s\S/.test(String(c.subject ?? '')));
    if (off.length) out.unconventional = { of: all.length, commits: off };
  }
  return out;
}

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const asks = (rules) => {
  const by = new Map();
  for (const [k, what] of [['major', 'a major version'], ['changelog', 'a changelog entry'], ['migration', 'a migration note']]) {
    if (rules[k]) by.set(rules[k].file, [...(by.get(rules[k].file) ?? []), what]);
  }
  return [...by].map(([file, what]) => `${file} asks ${what.join(' · ')}`).join(' and ');
};

// The System health lines: a header line each, then up to eight `   · ` lines under it.
export function governanceLines(gaps, rules = {}) {
  const lines = [];
  if (!gaps) return lines;
  const n = gaps.breaking.length;
  if (n) {
    lines.push(`${plural(n, 'breaking change', 'breaking changes')} in the last ${plural(gaps.checked.releases, 'release', 'releases')} went out other than the team's own documents say (${asks(rules)} for a breaking change):`);
    for (const b of gaps.breaking.slice(0, 8)) lines.push(`   · ${b.tag}  ${b.what}${b.ref ? ` (${b.ref})` : ''}: ${b.gaps.join(' · ')}`);
    if (n > 8) lines.push(`   · and ${n - 8} more`);
  }
  const u = gaps.unconventional;
  if (u) lines.push(`${u.commits.length} of ${u.of} commits in the last ${plural(gaps.checked.releases, 'release', 'releases')} do not follow Conventional Commits, which ${rules.conventional.file} asks for (${u.commits.slice(0, 4).map((c) => `${c.short ?? String(c.sha ?? '').slice(0, 7)} "${String(c.subject ?? '').slice(0, 50)}"`).join(' · ')}${u.commits.length > 4 ? ' · …' : ''}).`);
  return lines;
}

const DAY = 864e5;
// The tracker against the team's own limits. issues: [{ iid, title, updatedAt?, createdAt?, labels? }], the engine's
// own issues left out by the caller. An issue with no date is never counted: what cannot be read is not held against it.
export function trackerGaps(issues = [], rules = {}, { now = Date.now() } = {}) {
  const age = (i, at) => { const t = Date.parse(i[at] ?? ''); return Number.isFinite(t) ? (now - t) / DAY : null; };
  const stale = rules.staleDays ? issues.filter((i) => { const a = age(i, 'updatedAt'); return a != null && a > rules.staleDays.days; }) : [];
  const duplicates = rules.duplicateDays ? issues.filter((i) => (i.labels ?? []).some((l) => /duplicate/i.test(String(l))) && (() => { const a = age(i, 'createdAt') ?? age(i, 'updatedAt'); return a != null && a > rules.duplicateDays.days; })()) : [];
  return { stale, duplicates };
}

export function trackerLines(gaps, rules = {}) {
  const lines = [];
  const ids = (list) => `${list.slice(0, 6).map((i) => `#${i.iid}`).join(' · ')}${list.length > 6 ? ' · …' : ''}`;
  if (gaps?.stale.length) lines.push(`${plural(gaps.stale.length, 'open issue has', 'open issues have')} had no activity for more than ${rules.staleDays.days} days, the limit ${rules.staleDays.file} sets (${ids(gaps.stale)}): close each, or say why it stays open.`);
  if (gaps?.duplicates.length) lines.push(`${plural(gaps.duplicates.length, 'open issue is', 'open issues are')} marked as a duplicate and still open after ${rules.duplicateDays.days} days, the limit ${rules.duplicateDays.file} sets (${ids(gaps.duplicates)}): close each into the issue it repeats.`);
  return lines;
}

// What the checks above are given, read from the system's repository through the two readers the caller passes:
// read(file) → its text or '' (a path relative to the repository), git(args) → its output or '' (run there).
// Nothing is read from the history unless a document states a rule to hold it to. → { rules, gaps } | null
export function readGovernance({ read, git, files = [], records = [], releases: most = 5 } = {}) {
  const docs = GOVERNANCE_DOCS.map((file) => ({ file, text: read(file) })).filter((d) => d.text);
  const cl = CHANGELOGS.map((file) => ({ file, text: read(file) })).find((d) => d.text) ?? null;
  const rules = paperRules(docs, cl);
  const any = rules.major || rules.changelog || rules.migration || rules.conventional;
  if (!any) return { rules, gaps: null };
  const tags = String(git(['tag', '-l', '--sort=-v:refname']) ?? '').split('\n').map((t) => t.trim()).filter(isVersionTag);
  if (!tags.length) return { rules, gaps: null };
  const commitsOf = (from, to) => String(git(['log', '--no-merges', '-300', '--format=%x1e%H%x1f%B', from ? `${from}..${to}` : to]) ?? '')
    .split('\x1e').filter((x) => x.trim()).map((x) => {
      const [sha, msg = ''] = x.replace(/^\n/, '').split('\x1f');
      const [subject = '', ...body] = msg.trim().split('\n');
      return { sha: sha.trim(), short: sha.trim().slice(0, 7), subject: subject.trim(), body: body.join('\n').trim() };
    });
  const releases = tags.slice(0, most).map((tag, i) => ({ tag, prev: tags[i + 1] ?? null, commits: commitsOf(tags[i + 1] ?? null, tag) }));
  const migrationDocs = files.filter(isMigrationDoc).map((file) => ({ file, text: read(file) })).filter((d) => d.text);
  return { rules, gaps: governanceGaps({ rules, releases, records, changelog: cl, migrationDocs }) };
}
