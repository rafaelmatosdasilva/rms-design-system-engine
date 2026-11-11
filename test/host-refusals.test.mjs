// A refusal that names the permission it lacks, and where to add it. GitLab's said which scope the token needs and
// whoever hit it fixed it in a minute; Figma's said the request failed, and Notion's said "Notion API 403" - the
// same wall, with four different fixes behind one number and no way to tell which.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { HOSTS, HOST_KEYS, refusal, said, isRefusal } from '../lib/host-refusals.mjs';

test('every host answers the same three questions: what is missing, where it is given, what it reaches', () => {
  for (const k of HOST_KEYS) {
    const h = HOSTS[k];
    for (const field of ['name', 'token', 'needs', 'where', 'reach']) assert.ok(h[field]?.trim(), `${k} has no ${field}`);
    assert.match(h.token, /^[A-Z][A-Z0-9_]*$/, `${k}'s token is the name of an environment variable`);
    // The question this item was raised on: a refusal that names neither the permission nor where it is given.
    const r = refusal(k, 403);
    assert.ok(r.includes(h.needs), `${k} 403 does not name the permission`);
    assert.ok(r.includes(h.where), `${k} 403 does not say where it is given`);
    assert.ok(r.includes(h.token), `${k} 403 does not name the variable the token is in`);
  }
  assert.ok(HOST_KEYS.includes('figma') && HOST_KEYS.includes('notion') && HOST_KEYS.includes('github') && HOST_KEYS.includes('gitlab'));
});

test('each status says the thing that is actually wrong, since one number has several fixes', () => {
  assert.match(refusal('notion', 401), /did not accept the token \(401\).*wrong, expired or revoked/);
  assert.match(refusal('notion', 403), /needs read content.*must be shared with the integration/);
  // A private thing with no access reads exactly like one that is not there: 404 says both, rather than sending
  // somebody to check a link that was right all along.
  assert.match(refusal('figma', 404), /link may be wrong, or it is private/);
  assert.match(refusal('github', 429), /rate limiting.*work again shortly/);
  assert.equal(refusal('github', 200), null, 'not a refusal');
  assert.equal(refusal('nowhere', 403), null, 'a host this does not know says nothing, rather than guessing');
});

test('a caller names what it was reading, and a write says the permission a write needs', () => {
  assert.match(refusal('notion', 403, { what: 'the guidelines page' }), /Notion refused the guidelines page \(403\)/);
  const write = refusal('github', 403, { what: 'the pull request', needs: 'write access (Contents and Pull requests)' });
  assert.match(write, /needs write access \(Contents and Pull requests\)/);
  assert.doesNotMatch(write, /Contents: Read/, 'the call\'s own permission replaces the host\'s usual one');
  // What the host itself said is worth repeating, on one line: a refusal is read in a terminal.
  assert.match(refusal('gitlab', 404, { detail: 'on gitlab.example.com\nand more' }), /\(on gitlab\.example\.com\)/);
});

test('a call that sent no token is not told its token lacks a permission', () => {
  // The words blamed a token that was never there, sending a person to check a setting they had not set. GitHub
  // reads public repositories with no token at all, so this is the common case, not an edge.
  const none = refusal('github', 404, { token: false });
  assert.match(none, /no GITHUB_TOKEN was sent/);
  assert.doesNotMatch(none, /the token in GITHUB_TOKEN cannot reach/);
  assert.match(refusal('github', 403, { token: false }), /no GITHUB_TOKEN was sent, and this needs/);
  // With one, it is the token that is short of something.
  assert.match(refusal('github', 403), /the token in GITHUB_TOKEN needs/);
  // 401 is only reachable with a token, so it reads the same either way.
  assert.equal(refusal('github', 401, { token: false }), refusal('github', 401));
});

test('a status the table does not name is still said, never swallowed', () => {
  assert.equal(said('figma', 500), 'Figma answered 500');
  assert.equal(said('figma', 500, { what: 'the file' }), 'Figma answered 500 for the file');
  assert.match(said('notion', 403), /needs read content/, 'a refusal still goes through the table');
  assert.equal(said('nowhere', 500), 'the request failed (500)');
});

test('what a permission would fix, and what it would not', () => {
  for (const s of [401, 403, 404]) assert.equal(isRefusal(s), true, String(s));
  for (const s of [200, 429, 500, 0]) assert.equal(isRefusal(s), false, String(s));
});

test('no refusal ever carries the token itself', () => {
  const secret = 'glpat-SHOULD-NEVER-APPEAR';
  for (const k of HOST_KEYS) for (const s of [401, 403, 404, 429]) {
    const line = refusal(k, s, { detail: secret, what: secret });
    // The caller is what puts text in; the table never reaches for an environment variable to print.
    assert.doesNotMatch(String(HOSTS[k].needs + HOSTS[k].where + HOSTS[k].reach), /glpat|ghp_|secret_|figd_/i, k);
    assert.ok(line.includes(HOSTS[k].token), `${k} names the variable, which is not its value`);
  }
});

test('every host that refuses in the engine reads its words from this table', () => {
  // Each of these wrote its own sentence, and only GitLab's named a scope. One table, so a new caller cannot
  // invent a vaguer one and a scope that changes is corrected once.
  for (const f of ['lib/doc-host.mjs', 'lib/doc-tools.mjs', 'lib/gitlab-source.mjs', 'lib/notion-fetch.mjs']) {
    const src = readFileSync(f, 'utf8');
    assert.match(src, /from '\.\/host-refusals\.mjs'/, `${f} does not read from the table`);
    assert.doesNotMatch(src, /needs the read_api scope/, `${f} still spells a scope of its own`);
  }
  assert.doesNotMatch(readFileSync('lib/notion-fetch.mjs', 'utf8'), /`Notion API \$\{/, 'the bare status is gone');
});
