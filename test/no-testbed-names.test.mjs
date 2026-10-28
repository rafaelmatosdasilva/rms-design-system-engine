// The engine must stay generic and this repository is public: it is exercised against private projects and built
// from private notes while it is built, and nothing from them (app names, repo names, their design system's
// component or class names, people's names, personal addresses, the private backlog and its item codes) may end up
// in the engine's code, tests, examples, docs or commit messages. This guard fails the moment one does; the
// pre-commit and commit-msg hooks in .githooks run the same check before anything is committed.
// The forbidden names are stored ONLY as hashes, so neither this file nor the check leaks them.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync, execFileSync } from 'node:child_process';
import { writeFileSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { forbiddenHits, privateFindings, messageFindings, repoFindings, PUBLIC_EXAMPLE, ROOT } from '../.githooks/private-check.mjs';
import { projectTerms } from '../.githooks/private-terms.mjs';
import { tempDir } from './helpers.mjs';

export { forbiddenHits };

test('nothing private anywhere in the engine repo', () => {
  const found = repoFindings();
  assert.deepEqual(found, [], 'private content found: ' + found.map((x) => `${x.file}:${x.line} ${x.kind} ${x.what}`).join('; '));
});

test('the matcher normalises spacing, case and separators', () => {
  assert.equal(forbiddenHits('a perfectly generic sentence about buttons and tokens'), 0);
});

test('the public example page is the only address of the owner\'s design system allowed', () => {
  assert.equal(forbiddenHits(PUBLIC_EXAMPLE), 0);
  assert.ok(forbiddenHits(PUBLIC_EXAMPLE.replace('.github.io', '.example.com')) > 0, 'the same name anywhere else is still found');
});

// Each planted case is built from parts, so this file does not carry what it plants.
const kinds = (text) => privateFindings(text).map((x) => x.kind);
const code = (letter, n) => letter + String(n);

test('a person, a personal address, the backlog and its codes are refused', () => {
  assert.ok(kinds(['by', 'Jo' + 'hn', 'Sm' + 'ith', 'on tokens'].join(' ')).includes('a person credited'));
  assert.ok(kinds(`(${'Ja' + 'ne'} ${'Ro' + 'e'}, "Tokens at scale")`).includes('a person credited'));
  assert.ok(kinds(`${'Some' + 'one'}'s article on tokens`).includes('a person credited'));
  assert.ok(kinds(`write to ${'some.one'}@${'mail'}.com`).includes('email address'));
  assert.ok(kinds(`// the reviewer is ${'A' + 'na'}`).includes('a person\'s first name'));
  assert.ok(kinds(`the fix (${code('I', 42)}) lands`).includes('backlog item code'));
  assert.ok(kinds(`test('[${code('E', 7)}] a title'`).includes('backlog item code'));
  assert.ok(kinds(`// ${code('G', 5)}: a reason`).includes('backlog item code'));
  assert.ok(kinds(`idea ${code('I', 56)} moves it`).includes('backlog item code'));
  assert.ok(kinds(`what changed: ${code('K', 17)}, the guidance rated`).includes('backlog item code'));
  assert.ok(kinds(['the', 'design', 'system', 'engine', [...'golkcab'].reverse().join('')].join('-')).includes('private name'));
});

test('placeholders, no-reply addresses, colour spaces and products are not private', () => {
  assert.deepEqual(kinds('demo@example.com, git@gitlab.example.com, noreply@anthropic.com, user:secret@gitlab.com'), []);
  assert.deepEqual(kinds('icon@1x.png; Display P3 (D65); a heading H2; fonts from Google Fonts; by the design team'), []);
  assert.deepEqual(kinds('valuesByMode: { S1: 12, S2: 8 }'), []);
  assert.deepEqual(messageFindings('Clean the docs\n\n# a comment git adds\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>\n'), []);
});

test('a word of the web a project happens to use is no project\'s: the name it really chose still is', () => {
  const dir = tempDir('web-words-');
  try {
    writeFileSync(join(dir, 'figma-component-props.snapshot.json'), JSON.stringify({
      components: { CardTile: { properties: { textContent: { type: 'TEXT' }, required: { type: 'BOOLEAN' }, download: { type: 'BOOLEAN' }, classList: { type: 'TEXT' }, quokkaLabel: { type: 'TEXT' } } } },
    }));
    const { terms } = projectTerms(dir);
    // The platform's own names for things. The engine writes them in its own files, so taking one for a secret
    // refuses an honest commit; four did before this list existed.
    for (const w of ['textcontent', 'required', 'download', 'classlist']) assert.equal(terms.has(w), false, `${w} is the web's word, not a project's`);
    // What the project actually named stays refused, which is the whole point of the guard.
    assert.equal(terms.has('quokkalabel'), true, [...terms.keys()].join(' '));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('the commit hooks refuse a private change and let a clean one through', () => {
  const dir = tempDir('private-check-');
  try {
    const git = (...a) => execFileSync('git', a, { cwd: dir, encoding: 'utf8' });
    git('init', '-q'); git('config', 'user.email', 'demo@example.com'); git('config', 'user.name', 'Demo');
    const check = (...a) => spawnSync(process.execPath, [join(ROOT, '.githooks', 'private-check.mjs'), ...a], { cwd: dir, encoding: 'utf8' });
    // The check reads the staged diff of the repository it runs in: run it from a copy of itself there.
    execFileSync('mkdir', ['-p', join(dir, '.githooks')]);
    for (const f of ['private-check.mjs', 'private-terms.mjs']) execFileSync('cp', [join(ROOT, '.githooks', f), join(dir, '.githooks', f)]);
    const staged = () => spawnSync(process.execPath, [join(dir, '.githooks', 'private-check.mjs'), '--staged'], { cwd: dir, encoding: 'utf8', env: { ...process.env, RMS_PRIVATE_TERMS_DIR: dir } });
    writeFileSync(join(dir, 'a.md'), 'A clean line about tokens.\n'); git('add', 'a.md');
    assert.equal(staged().status, 0, staged().stderr);
    writeFileSync(join(dir, 'b.md'), `Mail ${'some.one'}@${'mail'}.com about it (${code('I', 42)}).\n`); git('add', 'b.md');
    const r = staged();
    assert.equal(r.status, 1);
    assert.match(r.stderr, /b\.md:1 {2}email address/);
    assert.match(r.stderr, /backlog item code/);
    const msg = join(dir, 'MSG'); writeFileSync(msg, `Fix it, ${code('E', 7)}: done\n\n// ${code('G', 5)}: why\n`);
    assert.equal(check('--message', msg).status, 1);
    writeFileSync(msg, 'Fix the chip radius\n');
    assert.equal(check('--message', msg).status, 0);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

// ── What leaks without naming anyone ───────────────────────────────────────────────────────────────────────────
// Every planted case is built from parts: this file is checked too, and must carry none of them.
const j = (...p) => p.join('');

test('a Figma file key, a company host, a path on a computer and a secret are refused', () => {
  assert.ok(kinds(`see https://www.figma.com/${'design'}/${j('Zq8', 'Yw7', 'Xv6', 'Wu5', 'Vt4', 'Us3', 'Tr2')}/file`).includes('Figma file key'));
  assert.ok(kinds(`"figmaFileKey": "${j('Qa1', 'Sb2', 'Tc3', 'Ud4', 'Ve5', 'Wf6')}"`).includes('Figma file key'));
  assert.ok(kinds(`clone https://${j('git', 'lab')}.${j('glo', 'bex')}.com/web/lib`).includes('a company host'));
  assert.ok(kinds(`https://${j('ji', 'ra')}.${j('glo', 'bex')}.io/browse/X-1`).includes('a company host'));
  assert.ok(kinds(`the wiki at https://docs.${j('glo', 'bex')}.${j('inter', 'nal')}/a`).includes('a company host'));
  assert.ok(kinds(`ssh ${j('19', '2.168')}.1.20`).includes('a company host'));
  assert.ok(kinds(`open ${'/'}${j('Us', 'ers')}/${j('ja', 'ne')}/Documents/acme`).includes('a path on someone\'s computer'));
  assert.ok(kinds(`at ${'/'}${j('ho', 'me')}/${j('ja', 'ne')}/src`).includes('a path on someone\'s computer'));
  assert.ok(kinds(`C:${'\\'}${j('Us', 'ers')}${'\\'}${j('ja', 'ne')}${'\\'}ds`).includes('a path on someone\'s computer'));
  assert.ok(kinds(`a scratch folder: -${j('Us', 'ers')}-${j('ja', 'ne')}-Documents-x`).includes('a path on someone\'s computer'));
  for (const t of [j('fi', 'gd_', 'a'.repeat(30)), j('gh', 'p_', 'b'.repeat(36)), j('github', '_pat_', 'c'.repeat(40)), j('gl', 'pat-', 'd'.repeat(22)),
    j('s', 'k-ant-', 'e'.repeat(30)), j('AK', 'IA', 'ABCDEFGHIJKLMNOP'), j('xo', 'xb-', '1'.repeat(12)), j('-----BEGIN ', 'RSA PRIVATE', ' KEY-----')]) {
    assert.ok(kinds(`token: ${t}`).includes('a secret'), t.slice(0, 6));
  }
});

test('placeholders and public addresses are not private', () => {
  assert.deepEqual(kinds('https://www.figma.com/design/AbCdEf123456XyZ/demo and https://gitlab.com/acme/ui and https://github.com/acme/ui'), []);
  assert.deepEqual(kinds('git@gitlab.example.com:acme/ds.git, https://git.acme.io/ds, https://code.acme.example, https://wiki.example.com'), []);
  assert.deepEqual(kinds('/Users/me/dev/ds, /home/user/engine, /Users/you/My Projects, http://localhost:5173, 127.0.0.1'), []);
  assert.deepEqual(kinds('C:\\Users\\${name}\\ds and /Users/<you>/ds'), []);
});

test('a font, an image outside the fixtures and a copied Figma file are refused; an invented fixture is not', async () => {
  const { fileFindings } = await import('../.githooks/private-check.mjs');
  const k = (f, text = '') => fileFindings(f, () => text).map((x) => x.kind);
  assert.ok(k('assets/Brand-Bold.woff2').includes('a font file'));
  assert.ok(k('test/fixtures/demo/Brand.otf').includes('a font file'), 'a font is refused even in a fixture');
  assert.ok(k('docs/screen.png').includes('a private file'));
  assert.ok(k('logo.svg').includes('a private file'));
  assert.deepEqual(k('test/fixtures/demo-ds/shot.png'), []);
  const nodes = JSON.stringify(Object.fromEntries(Array.from({ length: 25 }, (_, i) => [`c${i}`, { nodeId: `${100 + i}:${200 + i}` }])));
  assert.ok(k('snapshots/figma-structure.json', nodes).includes('data copied from a Figma file'));
  assert.deepEqual(k('test/fixtures/demo-ds/figma-structure.json', nodes), []);
  assert.deepEqual(k('src/small.json', '{"a": "1:2"}'), []);
});

test('a project the engine worked on gives its own names, and only those a person chose', async () => {
  const { projectTerms } = await import('../.githooks/private-terms.mjs');
  const dir = tempDir('terms-');
  try {
    const name = j('Zor', 'ble');
    writeFileSync(join(dir, 'ds-config.json'), JSON.stringify({ name: `${name} DS`, figmaUrl: `https://www.figma.com/design/${j('Pq9', 'Or8', 'Ns7', 'Mt6', 'Lu5', 'Kv4')}/x` }));
    writeFileSync(join(dir, 'figma-component-props.snapshot.json'), JSON.stringify({ [j('header', 'Quokka')]: { nodeId: '1:2', properties: { [j('show', 'Wombat') + '#1:2']: { type: 'BOOLEAN' }, size: { type: 'VARIANT', variantOptions: [j('Zib', 'bets'), 'large'] } } }, buttonPrimary: { nodeId: '1:3', properties: {} } }));
    writeFileSync(join(dir, 'figma-vars.snapshot.json'), JSON.stringify({ typography: { [j('Glim', 'mox')]: { 'base/font/family': j('Plo', 'nk Sans'), [j('quok', 'ka')]: 1 } } }));
    writeFileSync(join(dir, 'figma-structure.snapshot.json'), JSON.stringify({ components: { [j('header', 'Quokka')]: { paddingVar: 'x', radiusPx: 4 } } }));
    const t = [...projectTerms(dir).terms.keys()];
    for (const want of [j('zor', 'ble'), j('header', 'quokka'), j('show', 'wombat'), j('plo', 'nksans'), j('pq9', 'or8', 'ns7', 'mt6', 'lu5', 'kv4')]) assert.ok(t.includes(want), want);
    // One plain word counts only where a dictionary can tell it is no word (a computer without one counts none).
    const dict = ['/usr/share/dict/words', '/usr/share/dict/web2', '/usr/dict/words', '/usr/share/dict/american-english'].some((f) => { try { return statSync(f).isFile(); } catch { return false; } });
    if (dict) for (const want of [j('zib', 'bets'), j('glim', 'mox')]) assert.ok(t.includes(want), want);
    for (const not of ['buttonprimary', 'large', 'paddingvar', 'radiuspx', 'nodeid', 'size']) assert.ok(!t.includes(not), not);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('the names of the projects on this computer are refused in a commit, and an allowed one is not', () => {
  const home = tempDir('terms-home-');
  const proj = tempDir('terms-proj-');
  try {
    const comp = j('header', 'Quokka');
    writeFileSync(join(proj, 'ds-config.json'), '{}');
    writeFileSync(join(proj, 'figma-component-props.snapshot.json'), JSON.stringify({ [comp]: { properties: {} }, [j('card', 'Wombat')]: { properties: {} } }));
    writeFileSync(join(proj, 'figma-vars.snapshot.json'), JSON.stringify({ typography: { light: { 'base/font/family': `${j('Zor', 'ble')} ${j('Gro', 'tesk')}` } } }));
    writeFileSync(join(home, 'private-projects.json'), JSON.stringify({ projects: [proj] }));
    const env = { ...process.env, RMS_PRIVATE_TERMS_DIR: home };
    const text = join(home, 'say.txt');
    const check = () => spawnSync(process.execPath, [join(ROOT, '.githooks', 'private-check.mjs'), '--text', text], { encoding: 'utf8', env });
    writeFileSync(text, `the ${comp} and the card-wombat\n`);
    const r = check();
    assert.equal(r.status, 1);
    assert.match(r.stderr, /a project's own name: headerquokka/);
    assert.match(r.stderr, /a project's own name: cardwombat/, 'a kebab-case spelling is the same name');
    writeFileSync(text, `set in ${j('Zor', 'ble')} ${j('Gro', 'tesk')}, the brand font\n`);
    assert.match(check().stderr, /a project's own name: zorblegrotesk/, 'a font written as words apart is found in prose');
    writeFileSync(text, 'a header, quokka and a card wombat in a sentence\n');
    assert.equal(check().status, 0, 'words apart in a sentence make no name');
    spawnSync(process.execPath, [join(ROOT, '.githooks', 'private-terms.mjs'), '--allow', comp], { env });
    writeFileSync(text, `the ${comp}\n`);
    assert.equal(check().status, 0, check().stderr);
  } finally { rmSync(home, { recursive: true, force: true }); rmSync(proj, { recursive: true, force: true }); }
});

test('a project is never remembered from a temporary folder or while tests run', async () => {
  const { rememberProject } = await import('../.githooks/private-terms.mjs');
  const dir = tempDir('remember-');
  try { writeFileSync(join(dir, 'ds-config.json'), '{}'); assert.equal(rememberProject(dir), false); } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('a push is refused for any commit it sends: its lines, its files, its author', () => {
  const dir = tempDir('private-push-');
  try {
    const git = (...a) => execFileSync('git', a, { cwd: dir, encoding: 'utf8' });
    git('init', '-q', '-b', 'main'); git('config', 'user.email', 'demo@example.com'); git('config', 'user.name', 'Demo');
    execFileSync('mkdir', ['-p', join(dir, '.githooks')]);
    for (const f of ['private-check.mjs', 'private-terms.mjs']) execFileSync('cp', [join(ROOT, '.githooks', f), join(dir, '.githooks', f)]);
    const push = (stdin) => spawnSync(process.execPath, [join(dir, '.githooks', 'private-check.mjs'), '--push'], { cwd: dir, encoding: 'utf8', input: stdin, env: { ...process.env, RMS_PRIVATE_TERMS_DIR: dir } });
    writeFileSync(join(dir, 'a.md'), 'A clean line.\n'); git('add', '-A'); git('commit', '-qm', 'Clean', '--no-verify');
    const clean = git('rev-parse', 'HEAD').trim();
    assert.equal(push(`refs/heads/main ${clean} refs/heads/main ${'0'.repeat(40)}\n`).status, 0);
    writeFileSync(join(dir, 'b.md'), `See https://${j('git', 'lab')}.${j('glo', 'bex')}.com/x\n`); git('add', '-A'); git('commit', '-qm', 'Docs', '--no-verify');
    writeFileSync(join(dir, 'Brand.woff2'), 'x'); git('add', '-A');
    git('-c', `user.email=${j('ja', 'ne')}@${j('gm', 'ail')}.com`, 'commit', '-qm', 'Font', '--no-verify');
    const head = git('rev-parse', 'HEAD').trim();
    const r = push(`refs/heads/main ${head} refs/heads/main ${clean}\n`);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /b\.md:1 {2}a company host/);
    assert.match(r.stderr, /Brand\.woff2 {2}a font file/);
    assert.match(r.stderr, /its author {2}a personal address/);
    assert.doesNotMatch(r.stderr, /a\.md/, 'a commit the remote already has is not checked again');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
