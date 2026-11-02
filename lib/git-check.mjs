// git-check.mjs - the design system's findings in a project's git hooks: a commit warns, a push refuses.
//
// Installed with the project's hooks (hooks-install.mjs) as .git/hooks/pre-commit and pre-push, it runs
// `rms-design-system-engine --git-check commit|push`. Both read only what the change adds, never the whole system:
//   • the lines the commit stages, or the commits the push sends, read against what they replace;
//   • on those lines, what the edit check finds (edit-check.mjs): a value written by hand, a token declared nowhere, a
//     prop a component does not take, an import or a nesting the system never writes, and the rest of its kinds;
//   • the differences the last full audit found (findings.json) about a component or a token those lines use, where
//     the audit fails on it: a difference the team accepted as debt, kept on purpose or that is Figma's work alone is
//     never one of them.
// A commit only warns and always goes ahead, so a commit is never slowed or stopped by debt it did not touch. A push
// refuses (exit 1) while one is left: the layer that refuses is the one that cannot be talked round, and it refuses
// only for what the pushed code uses. A finding a person marked wrong is shown, never refused on. Nothing is run that
// waits on the network or a browser: the audit's findings are read as the last full run left them.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { addedLines, editCheckRun, editTruth, checkedFile } from './edit-check.mjs';
import { OUT_DIR } from './names.mjs';
import { readWrong } from './wrong.mjs';
import { keptKey } from './kept.mjs';

const EMPTY_TREE = '4b825dc642cb6eb9a060e54bf8d69288fbee4904';   // git's empty tree: the base of a branch's first push
const ZERO = /^0+$/;
// The edit check's kinds that are no part of the design system: a comment that switches a check off, an accessibility
// problem in the markup. The agent's hook hands them back; a person's commit is not held for them.
const NOT_SYSTEM = new Set(['silencer', 'a11y']);
const normName = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');

const gitIn = (root) => (args) => {
  try { return execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 256 * 1024 * 1024 }); } catch { return null; }
};

// What git hands pre-push on stdin: one line per ref it sends, `<local ref> <local sha> <remote ref> <remote sha>`.
// → [{ local, remote }], a deleted ref left out.
export function pushRefs(stdin) {
  return String(stdin ?? '').split('\n').map((l) => l.trim().split(/\s+/)).filter((w) => w.length >= 4 && !ZERO.test(w[1]))
    .map(([, local, , remote]) => ({ local, remote: ZERO.test(remote) ? null : remote }));
}

// The base a pushed commit is read against: what the remote has, else (a new branch) the parent of its oldest commit
// no remote has yet. null when every commit is on a remote already.
function pushBase(git, { local, remote }) {
  if (remote && git(['cat-file', '-e', `${remote}^{commit}`]) !== null) return remote;
  const fresh = (git(['rev-list', '--reverse', local, '--not', '--remotes']) ?? '').split('\n').filter(Boolean);
  if (!fresh.length) return null;
  return git(['rev-parse', '--verify', '--quiet', `${fresh[0]}^`])?.trim() || EMPTY_TREE;
}

// The style, markup and component files the change touches, each as it was and as the change makes it, relative to
// the project (git's --relative: a project in a folder of a larger repository reads only its own files).
// stage: 'commit' (the index against HEAD) or 'push' (each ref against its base). → [{ rel, before, after }]
export function changedFiles(root, { stage, stdin = '', git = gitIn(root) } = {}) {
  const list = (out) => String(out ?? '').split('\0').filter(Boolean).filter(checkedFile);
  const files = new Map();
  if (stage === 'commit') {
    const head = git(['rev-parse', '--verify', '--quiet', 'HEAD']) !== null;   // a first commit is read against nothing
    for (const rel of list(git(['diff', '--cached', '--name-only', '--diff-filter=ACMR', '--relative', '-z']))) {
      const after = git(['show', `:./${rel}`]);
      if (after !== null) files.set(rel, { rel, before: head ? git(['show', `HEAD:./${rel}`]) : null, after });
    }
    return [...files.values()];
  }
  for (const ref of pushRefs(stdin)) {
    const base = pushBase(git, ref);
    if (!base) continue;
    for (const rel of list(git(['diff', '--name-only', '--diff-filter=ACMR', '--relative', '-z', base, ref.local]))) {
      const after = git(['show', `${ref.local}:./${rel}`]);
      if (after === null) continue;
      const before = base === EMPTY_TREE ? null : git(['show', `${base}:./${rel}`]);
      const k = `${rel}\0${after}`;
      if (!files.has(k)) files.set(k, { rel, before, after });
    }
  }
  return [...files.values()];
}

// What lines use from the system: the components they name (a tag, an import, the component's class) and the tokens.
// names: the system's components; selectors: ds-config.json componentSelectors. → { components: Set, tokens: Set }
export function usedBy(lines, names = [], { selectors = {} } = {}) {
  const byNorm = new Map(names.map((n) => [normName(n), n]));
  const byClass = new Map(names.map((n) => [String(selectors[n] ?? `.${n.charAt(0).toLowerCase()}${n.slice(1)}`).replace(/^\./, ''), n]));
  const components = new Set(), tokens = new Set();
  const tag = (t) => {
    const n = normName(t);
    if (/^[A-Z]/.test(t) && byNorm.has(n)) return byNorm.get(n);
    // A custom element: a short prefix before the component's name (<hb-chip>, <acme-card-tile>).
    if (t.includes('-')) for (const [k, name] of byNorm) if (n.endsWith(k) && /^[a-z]{1,4}$/.test(n.slice(0, -k.length))) return name;
    return null;
  };
  for (const l of lines.map(String)) {
    for (const m of l.matchAll(/--[A-Za-z_][\w-]*/g)) tokens.add(m[0]);
    for (const m of l.matchAll(/<([A-Za-z][\w.-]*)/g)) { const c = tag(m[1]); if (c) components.add(c); }
    const imported = /\bimport\s+([^'";]+?)\s+from\b/.exec(l)?.[1] ?? '';
    for (const m of imported.matchAll(/\b[A-Z]\w*\b/g)) { const c = byNorm.get(normName(m[0])); if (c) components.add(c); }
    // A class: a selector (.cardTile {), or a word of a class attribute (class="cardTile", className="cardTile big").
    const classes = [...l.matchAll(/(?:^|[^\w-])\.([A-Za-z_][\w-]*)/g)].map((m) => m[1]);
    for (const m of l.matchAll(/\bclass(?:Name)?\s*=\s*["'{`]+([^"'}`]*)/g)) classes.push(...m[1].split(/\s+/));
    for (const c of classes) if (byClass.has(c)) components.add(byClass.get(c));
  }
  return { components, tokens };
}

// The last full audit's differences about what the lines use, where its check fails. records: findings.json's findings.
// → [{ ...record, wrong: true|false }]
export function auditFindingsFor(records = [], used, { wrong = [] } = {}) {
  const comps = new Set([...used.components].map(normName));
  const marked = new Set(wrong.map((m) => m.key));
  return records.filter((r) => r && r.difference && r.verdict === 'fails' && r.side !== 'figma')
    .filter((r) => (r.component && comps.has(normName(r.component))) || [...String(r.evidence ?? '').matchAll(/--[A-Za-z_][\w-]*/g)].some((m) => used.tokens.has(m[0])))
    .map((r) => ({ ...r, wrong: marked.has(keptKey(`${r.check} :: ${r.evidence}`)) }));
}

// The check itself. → { stage, files, edits: [{ rel, line, text }], audit: [records], auditAt, refuse }
export function gitCheck(root, { stage, stdin = '', cfg = {}, git = gitIn(root) } = {}) {
  const none = { stage, files: 0, edits: [], audit: [], auditAt: null, refuse: false };
  if (cfg.hooks === false) return none;
  const files = changedFiles(root, { stage, stdin, git });
  if (!files.length) return none;
  const truth = editTruth(root, cfg);
  const edits = [], added = [];
  for (const f of files) {
    const event = { tool_name: 'Write', tool_input: { file_path: join(root, f.rel), content: f.after } };
    const lines = addedLines(event, { headText: f.before ?? '' });
    added.push(...lines);
    const run = editCheckRun(event, { root, cfg, headOf: () => f.before, truth });
    for (const x of run?.found ?? []) if (!NOT_SYSTEM.has(x.kind)) edits.push({ rel: f.rel, line: x.line ?? null, text: x.text });
  }
  let findings = null;
  try { findings = JSON.parse(readFileSync(join(root, OUT_DIR, 'findings.json'), 'utf8')); } catch { /* no full audit yet */ }
  let names = [...truth.truth.components];
  try { names = [...new Set([...names, ...Object.keys(JSON.parse(readFileSync(join(root, cfg.paths?.snapshotStructure ?? 'src/figma-structure.snapshot.json'), 'utf8')).components ?? {})])].filter((n) => !n.startsWith('_')); } catch { /* the catalog's names */ }
  const audit = findings?.findings ? auditFindingsFor(findings.findings, usedBy(added, names, { selectors: cfg.componentSelectors ?? {} }), { wrong: readWrong(root) }) : [];
  return { stage, files: files.length, edits, audit, auditAt: findings?.at ?? null, refuse: stage === 'push' && (edits.length > 0 || audit.some((r) => !r.wrong)) };
}

// What the hook prints: nothing when the change is clean.
export function gitCheckText(r) {
  const n = r.edits.length + r.audit.length;
  if (!n) return '';
  const what = r.stage === 'push' ? 'what this push uses' : 'what this commit uses';
  const head = r.stage === 'push'
    ? (r.refuse ? `rms-design-system-engine: push refused: ${n} design-system finding${n === 1 ? '' : 's'} in ${what}.` : `rms-design-system-engine: ${n} finding${n === 1 ? '' : 's'} in ${what}, each marked wrong by a person: the push goes ahead.`)
    : `rms-design-system-engine: ${n} design-system finding${n === 1 ? '' : 's'} in ${what}. A warning: the commit goes ahead, and a push refuses ${n === 1 ? 'it' : 'them'} until fixed.`;
  const lines = [head];
  for (const e of r.edits.slice(0, 20)) lines.push(`  ${e.rel}${e.line ? `:${e.line}` : ''}  ${e.text}`);
  if (r.edits.length > 20) lines.push(`  and ${r.edits.length - 20} more`);
  if (r.audit.length) {
    lines.push(`  From the last full audit${r.auditAt ? ` (${String(r.auditAt).slice(0, 16).replace('T', ' ')})` : ''}, about a component or token this code uses:`);
    for (const a of r.audit.slice(0, 20)) lines.push(`  ${a.component ? `${a.component}: ` : ''}${a.check ? `${a.check}: ` : ''}${a.evidence}${a.wrong ? ' (marked wrong by a person: shown, never refused)' : ''}`);
    if (r.audit.length > 20) lines.push(`  and ${r.audit.length - 20} more`);
  }
  lines.push('Only what this change uses is checked: the rest of the system\'s differences never stop a commit or a push.');
  if (r.audit.length) lines.push('A difference the change already fixed goes once the audit runs again (rms-design-system-engine).');
  if (r.refuse) lines.push('Fix each one and push again. Not sure of a name? rms-design-system-engine --query <name>.');
  return lines.join('\n');
}
