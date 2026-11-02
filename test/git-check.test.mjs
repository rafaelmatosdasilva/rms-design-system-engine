// git-check: the design system's findings in a project's git hooks. A commit warns and goes ahead; a push refuses.
// Both read only what the change adds and the audit's differences about what those lines use, never the rest of the
// system's differences.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join, dirname } from 'node:path';
import { readFileSync, writeFileSync, mkdirSync, statSync, existsSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { pushRefs, usedBy, auditFindingsFor, changedFiles, gitCheck, gitCheckText } from '../lib/git-check.mjs';
import { installHooks, installGitHooks, gitHooksStatus, upgradeHooks } from '../lib/hooks-install.mjs';
import { makeFixture } from './helpers.mjs';

const ENGINE = dirname(dirname(fileURLToPath(import.meta.url)));
// A git that reads no person's own settings, and writes as a role.
const ENV = { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1', GIT_AUTHOR_NAME: 'QA', GIT_AUTHOR_EMAIL: 'qa@example.com', GIT_COMMITTER_NAME: 'QA', GIT_COMMITTER_EMAIL: 'qa@example.com' };
const git = (dir, ...args) => execFileSync('git', args, { cwd: dir, env: ENV, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

const theme = ':root {\n  --text-primary: #1b2433;\n  --card-tile-background: #ffffff;\n  --chip-background: #e8eef9;\n}\n';
const catalog = { components: { cardTile: { props: {} }, chip: { props: {} } } };
const finding = (component, evidence, extra = {}) => ({ id: evidence, check: 'Component values', component, evidence, verdict: 'fails', side: 'decide', difference: true, ...extra });
const findings = {
  at: '2026-11-01T10:00:00.000Z',
  findings: [
    finding('cardTile', 'cardTile: padding is 12px in the code, 16px in Figma'),
    finding('chip', 'chip: radius is 4px in the code, 8px in Figma'),   // a component the change does not use
    finding(null, '--text-primary is #1b2433 in the code, #1a2233 in Figma'),
    finding('cardTile', 'cardTile: the border is accepted debt', { verdict: 'advisory' }),
    finding('cardTile', 'cardTile: the shadow is not drawn in Figma', { side: 'figma' }),
  ],
};
function project() {
  const dir = makeFixture({
    'ds-config.json': { paths: { themeCSS: 'src/theme.css' } },
    'src/theme.css': theme,
    'contracts/catalog.json': catalog,
    '.design-system-engine-out/findings.json': findings,
    '.gitignore': '.design-system-engine-out/\n',
    'src/pages/Home.jsx': '<main>\n  <Chip label="Old" />\n</main>\n',
  });
  git(dir, 'init', '-q', '-b', 'main');
  git(dir, 'add', '-A');
  git(dir, 'commit', '-q', '-m', 'base');
  return dir;
}

test('what git hands pre-push: each ref sent, a deleted one left out, a new branch with no remote base', () => {
  const z = '0'.repeat(40), a = 'a'.repeat(40), b = 'b'.repeat(40);
  assert.deepEqual(pushRefs(`refs/heads/main ${a} refs/heads/main ${b}\nrefs/heads/new ${b} refs/heads/new ${z}\n(delete) ${z} refs/heads/old ${a}\n`),
    [{ local: a, remote: b }, { local: b, remote: null }]);
  assert.deepEqual(pushRefs(''), []);
});

test('what lines use: a component by its tag, its import or its class, and every token they name', () => {
  const u = usedBy(['<CardTile title="x" />', 'import { Chip, Other } from "acme-ui";', '.page { color: var(--text-primary); }', '<acme-card-tile>', '<div className="cardTile big">', '<button>'], ['cardTile', 'chip', 'button']);
  assert.deepEqual([...u.components].sort(), ['cardTile', 'chip']);   // <button> is the HTML element, never the system's
  assert.deepEqual([...u.tokens], ['--text-primary']);
  assert.deepEqual([...usedBy(['obj.cardTile = 1', 'const chip = 2'], ['cardTile', 'chip']).components], []);   // a word in code is no use of it
  assert.deepEqual([...usedBy(['<section class="tile">'], ['cardTile'], { selectors: { cardTile: '.tile' } }).components], ['cardTile']);
});

test('the audit\'s differences about what is used, only where its check fails and the code has the work', () => {
  const used = { components: new Set(['cardTile']), tokens: new Set(['--text-primary']) };
  const got = auditFindingsFor(findings.findings, used);
  assert.deepEqual(got.map((r) => r.evidence), ['cardTile: padding is 12px in the code, 16px in Figma', '--text-primary is #1b2433 in the code, #1a2233 in Figma']);
  // A finding a person marked wrong is shown, and says so.
  const wrong = [{ key: 'Component values :: cardTile: padding is 12px in the code, 16px in Figma' }];
  assert.deepEqual(auditFindingsFor(findings.findings, used, { wrong }).map((r) => r.wrong), [true, false]);
  assert.deepEqual(auditFindingsFor(findings.findings, { components: new Set(), tokens: new Set() }), []);
});

test('a commit warns about what it stages and goes ahead; nothing about what it does not use', () => {
  const dir = project();
  writeFileSync(join(dir, 'src/pages/Home.jsx'), '<main>\n  <Chip label="Old" />\n  <CardTile title="New" />\n  <p style={{ color: "#1b2433" }}>Hi</p>\n</main>\n');
  writeFileSync(join(dir, 'src/pages/Draft.css'), '.draft { color: #123456; }\n');   // not staged: not in the commit
  git(dir, 'add', 'src/pages/Home.jsx');
  assert.deepEqual(changedFiles(dir, { stage: 'commit' }).map((f) => f.rel), ['src/pages/Home.jsx']);
  const r = gitCheck(dir, { stage: 'commit', cfg: { paths: { themeCSS: 'src/theme.css' } } });
  assert.equal(r.refuse, false);
  assert.deepEqual(r.edits.map((e) => `${e.rel}:${e.line} ${e.text}`), ['src/pages/Home.jsx:4 #1b2433 is written by hand; use var(--text-primary)']);
  // The chip was there before: its difference is the system's backlog, not this commit's.
  assert.deepEqual(r.audit.map((a) => a.component), ['cardTile']);
  const text = gitCheckText(r);
  assert.match(text, /^rms-design-system-engine: 2 design-system findings in what this commit uses\. A warning: the commit goes ahead, and a push refuses them until fixed\./);
  assert.match(text, /\n  src\/pages\/Home\.jsx:4  #1b2433 is written by hand; use var\(--text-primary\)\n/);
  assert.match(text, /From the last full audit \(2026-11-01 10:00\), about a component or token this code uses:\n  cardTile: Component values: cardTile: padding is 12px/);
  // "hooks": false turns it off; a clean change says nothing.
  assert.equal(gitCheck(dir, { stage: 'commit', cfg: { hooks: false } }).edits.length, 0);
  git(dir, 'reset', '-q');
  writeFileSync(join(dir, 'src/pages/Home.jsx'), '<main>\n  <Chip label="Old" />\n  <p>New</p>\n</main>\n');
  git(dir, 'add', 'src/pages/Home.jsx');
  assert.equal(gitCheckText(gitCheck(dir, { stage: 'commit', cfg: { paths: { themeCSS: 'src/theme.css' } } })), '');
  // A line that changes the chip uses it: its difference comes with the change.
  writeFileSync(join(dir, 'src/pages/Home.jsx'), '<main>\n  <Chip label="New" />\n</main>\n');
  git(dir, 'add', 'src/pages/Home.jsx');
  assert.deepEqual(gitCheck(dir, { stage: 'commit', cfg: { paths: { themeCSS: 'src/theme.css' } } }).audit.map((a) => a.component), ['chip']);
});

test('a push refuses what the commits it sends use, read against what the remote has', () => {
  const dir = project();
  const remote = makeFixture({});
  git(remote, 'init', '-q', '--bare');
  git(dir, 'remote', 'add', 'origin', remote);
  git(dir, 'push', '-q', 'origin', 'main');
  writeFileSync(join(dir, 'src/pages/Card.jsx'), '<CardTile title="New" />\n');
  git(dir, 'add', '-A'); git(dir, 'commit', '-q', '-m', 'card');
  const head = git(dir, 'rev-parse', 'HEAD').trim(), base = git(dir, 'rev-parse', 'origin/main').trim();
  const r = gitCheck(dir, { stage: 'push', stdin: `refs/heads/main ${head} refs/heads/main ${base}\n`, cfg: { paths: { themeCSS: 'src/theme.css' } } });
  assert.equal(r.refuse, true);
  assert.deepEqual(r.audit.map((a) => a.evidence), ['cardTile: padding is 12px in the code, 16px in Figma']);
  assert.match(gitCheckText(r), /^rms-design-system-engine: push refused: 1 design-system finding in what this push uses\./);
  // A new branch: only the commits no remote has yet.
  const z = '0'.repeat(40);
  assert.equal(gitCheck(dir, { stage: 'push', stdin: `refs/heads/card ${head} refs/heads/card ${z}\n`, cfg: {} }).refuse, true);
  assert.equal(gitCheck(dir, { stage: 'push', stdin: `refs/heads/main ${base} refs/heads/old ${z}\n`, cfg: {} }).files, 0);   // already on the remote
  // Only a finding a person marked wrong: shown, and the push goes ahead.
  writeFileSync(join(dir, 'design-system-engine-wrong.json'), JSON.stringify({ findings: [{ key: 'Component values :: cardTile: padding is 12px in the code, 16px in Figma', check: 'Component values', what: 'x', why: 'misread' }] }));
  const w = gitCheck(dir, { stage: 'push', stdin: `refs/heads/main ${head} refs/heads/main ${base}\n`, cfg: {} });
  assert.equal(w.refuse, false);
  assert.match(gitCheckText(w), /marked wrong by a person: shown, never refused/);
});

test('installed as the repository\'s own git hooks: git runs them, a commit warns, a push is refused', () => {
  const dir = project();
  const remote = makeFixture({});
  git(remote, 'init', '-q', '--bare');
  git(dir, 'remote', 'add', 'origin', remote);
  git(dir, 'push', '-q', 'origin', 'main');
  const r = installGitHooks(dir, { engineDir: ENGINE });
  assert.deepEqual(r.written, ['pre-commit', 'pre-push']);
  assert.deepEqual(gitHooksStatus(dir).hooks, { 'pre-commit': 'ours', 'pre-push': 'ours' });
  assert.ok(statSync(join(r.dir, 'pre-push')).mode & 0o100);
  assert.match(readFileSync(join(r.dir, 'pre-push'), 'utf8'), /exec node '.*audit\.mjs' --git-check push/);
  assert.doesNotMatch(readFileSync(join(r.dir, 'pre-commit'), 'utf8'), new RegExp(dir));   // worktrees share hooks: no absolute project path
  assert.deepEqual(installGitHooks(dir, { engineDir: ENGINE }).written, []);   // idempotent
  writeFileSync(join(dir, 'src/pages/Card.jsx'), '<CardTile title="New" />\n');
  git(dir, 'add', '-A');
  const c = spawnSync('git', ['commit', '-q', '-m', 'card'], { cwd: dir, env: ENV, encoding: 'utf8' });
  assert.equal(c.status, 0);   // the commit goes ahead
  assert.match(c.stderr, /A warning: the commit goes ahead/);
  const p = spawnSync('git', ['push', '-q', 'origin', 'main'], { cwd: dir, env: ENV, encoding: 'utf8' });
  assert.notEqual(p.status, 0);
  assert.match(p.stderr, /push refused: 1 design-system finding/);
  assert.notEqual(git(dir, 'rev-parse', 'HEAD').trim(), git(remote, 'rev-parse', 'main').trim());
  // --remove-hooks takes out only its own.
  installGitHooks(dir, { engineDir: ENGINE, remove: true });
  assert.deepEqual(gitHooksStatus(dir).hooks, { 'pre-commit': 'none', 'pre-push': 'none' });
});

test('a hook of the project\'s own, or a hooks folder it commits, is never written: the line to add is said', () => {
  const dir = project();
  const hooks = join(dir, '.git', 'hooks');
  mkdirSync(hooks, { recursive: true });
  writeFileSync(join(hooks, 'pre-push'), '#!/bin/sh\nnpm test\n');
  const r = installGitHooks(dir, { engineDir: ENGINE });
  assert.deepEqual(r.written, ['pre-commit']);
  assert.equal(readFileSync(join(hooks, 'pre-push'), 'utf8'), '#!/bin/sh\nnpm test\n');
  assert.deepEqual(r.kept.map((k) => k.name), ['pre-push']);
  assert.match(r.kept[0].line, /^node '.*audit\.mjs' --git-check push \|\| exit 1$/);
  // Once the person adds it, it is counted as there.
  writeFileSync(join(hooks, 'pre-push'), `#!/bin/sh\n${r.kept[0].line}\nnpm test\n`);
  assert.equal(gitHooksStatus(dir).hooks['pre-push'], 'added');
  assert.deepEqual(installGitHooks(dir, { engineDir: ENGINE }).kept, []);
  installGitHooks(dir, { engineDir: ENGINE, remove: true });
  assert.ok(existsSync(join(hooks, 'pre-push')));   // the project's own stays
  // core.hooksPath to a committed folder: the project's files.
  const other = project();
  git(other, 'config', 'core.hooksPath', '.githooks');
  const o = installGitHooks(other, { engineDir: ENGINE });
  assert.deepEqual(o.written, []);
  assert.deepEqual(o.kept.map((k) => k.name), ['pre-commit', 'pre-push']);
  assert.equal(existsSync(join(other, '.githooks')), false);
});

test('--install-hooks writes the git hooks beside the Claude Code ones; a project set up before gets them on its next run', () => {
  const dir = project();
  const r = installHooks(dir, { engineDir: ENGINE });
  assert.deepEqual(r.git.written, ['pre-commit', 'pre-push']);
  installGitHooks(dir, { engineDir: ENGINE, remove: true });
  assert.equal(upgradeHooks(dir, {}, { engineDir: ENGINE, env: {} }), true);
  assert.deepEqual(gitHooksStatus(dir).hooks, { 'pre-commit': 'ours', 'pre-push': 'ours' });
  assert.equal(upgradeHooks(dir, {}, { engineDir: ENGINE, env: {} }), false);   // already current
  assert.equal(upgradeHooks(dir, { hooks: false }, { engineDir: ENGINE, env: {} }), false);
  installHooks(dir, { remove: true });
  assert.deepEqual(gitHooksStatus(dir).hooks, { 'pre-commit': 'none', 'pre-push': 'none' });
});

test('the command: a commit exits 0 with its warning, a push exits 1, no project here passes', () => {
  const dir = project();
  writeFileSync(join(dir, 'src/pages/Card.jsx'), '<CardTile title="New" />\n');
  git(dir, 'add', '-A');
  const run = (args, input = '', cwd = dir) => spawnSync(process.execPath, [join(ENGINE, 'audit.mjs'), ...args], { cwd, env: ENV, input, encoding: 'utf8' });
  const c = run(['--git-check', 'commit']);
  assert.equal(c.status, 0, c.stdout + c.stderr);
  assert.match(c.stderr, /1 design-system finding in what this commit uses/);
  git(dir, 'commit', '-q', '-m', 'card');
  const head = git(dir, 'rev-parse', 'HEAD').trim(), base = git(dir, 'rev-parse', 'HEAD^').trim();
  const p = run(['--git-check', 'push'], `refs/heads/main ${head} refs/heads/main ${base}\n`);
  assert.equal(p.status, 1);
  assert.match(p.stderr, /push refused/);
  assert.equal(run(['--git-check', 'push'], '', makeFixture({})).status, 0);
  assert.equal(run(['--git-check']).status, 2);
});
