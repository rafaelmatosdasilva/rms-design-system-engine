// An advisory nothing can fix is said, not left to lower the score. Nothing here reaches the network or GitHub: the
// Scorecard's answer is given in, and the answers are read from a folder the test writes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { entriesIn, answers, dueSoon, unanswered, watchLines, flaggedNow, issueBody, SOON_DAYS } from '../lib/advisories-watch.mjs';
import { tempDir } from './helpers.mjs';

const TOML = `# Advisories this folder knowingly carries.
[[IgnoredVulns]]
id = "GHSA-aaaa-bbbb-cccc"
ignoreUntil = 2027-01-31
reason = "No fixed release exists, and it is reached only by the build's own options."

[[IgnoredVulns]]
id = "GHSA-dddd-eeee-ffff"
ignoreUntil = 2026-11-20
reason = "Fixed in 4.6.4, which this folder runs. The advisory's range has no upper bound."

[[IgnoredVulns]]
id = "GHSA-gggg-hhhh-iiii"
reason = "No date, which is the thing a date is for."
`;

test('an answer is its id, the date to look again, and why it stays', () => {
  const e = entriesIn(TOML, 'test/.tools');
  assert.equal(e.length, 3);
  assert.deepEqual(e[0], { id: 'GHSA-aaaa-bbbb-cccc', until: '2027-01-31', reason: "No fixed release exists, and it is reached only by the build's own options.", folder: 'test/.tools' });
  assert.equal(e[2].until, null, 'one written without a date');
  assert.deepEqual(entriesIn('', 'x'), [], 'a file with no answers is none, never a crash');
  assert.deepEqual(entriesIn('[[IgnoredVulns]]\nreason = "no id"', 'x'), [], 'an entry with no id answers nothing');
});

test('every answer the repository holds, wherever it keeps them', () => {
  const dir = tempDir('osv-');
  mkdirSync(join(dir, 'test', '.tools'), { recursive: true });
  mkdirSync(join(dir, 'node_modules', 'pkg'), { recursive: true });
  writeFileSync(join(dir, 'test', '.tools', 'osv-scanner.toml'), TOML);
  writeFileSync(join(dir, 'node_modules', 'pkg', 'osv-scanner.toml'), TOML);
  const found = answers(dir);
  assert.equal(found.length, 3, 'what is installed is not this repository\'s answer');
  assert.equal(found[0].folder, join('test', '.tools'));
});

// The date passing in silence is the whole failure: the answer stops applying without anyone deciding it should.
test('an answer running out is said before it does, and after', () => {
  const e = entriesIn(TOML, 'f');
  const before = dueSoon(e, new Date('2026-11-01'));
  assert.deepEqual(before.expired, []);
  assert.deepEqual(before.soon.map((x) => x.id), ['GHSA-dddd-eeee-ffff'], `19 days away, inside the ${SOON_DAYS}`);
  assert.deepEqual(before.undated.map((x) => x.id), ['GHSA-gggg-hhhh-iiii']);

  const after = dueSoon(e, new Date('2026-11-25'));
  assert.deepEqual(after.expired.map((x) => x.id), ['GHSA-dddd-eeee-ffff']);
  assert.equal(after.expired[0].days, -5);

  const far = dueSoon(e, new Date('2026-01-01'));
  assert.deepEqual([...far.expired, ...far.soon], [], 'nothing near is nothing to say');
});

test('an advisory with an answer, or with something coming, is not one nothing can fix', () => {
  const e = entriesIn(TOML, 'f');
  const flagged = ['GHSA-aaaa-bbbb-cccc', 'GHSA-jjjj-kkkk-llll', 'GHSA-mmmm-nnnn-oooo'];
  const open = ['Bump nuxt from 4.6.3 to 4.6.4 GHSA-jjjj-kkkk-llll dependabot/npm_and_yarn/nuxt-4.6.4'];
  assert.deepEqual(unanswered(flagged, e, open), ['GHSA-mmmm-nnnn-oooo'], 'one answered, one coming, one nobody has decided');
  assert.deepEqual(unanswered([], e, []), []);
});

test('the Scorecard is read, never run: the ids it still counts, and a bad answer is said rather than read as none', async () => {
  const ok = await flaggedNow({ fetchImpl: async () => ({ ok: true, json: async () => ({ checks: [{ name: 'Vulnerabilities', score: 7, details: ['Warn: Project is vulnerable to: GHSA-aaaa-bbbb-cccc', 'Warn: Project is vulnerable to: CVE-2026-1234 / GHSA-aaaa-bbbb-cccc'] }] }) }) });
  assert.deepEqual(ok.ids, ['GHSA-aaaa-bbbb-cccc', 'CVE-2026-1234'], 'each one once, however often it is named');
  assert.equal(ok.score, 7);

  const down = await flaggedNow({ fetchImpl: async () => { throw new Error('getaddrinfo ENOTFOUND api.securityscorecards.dev'); } });
  assert.deepEqual(down.ids, []);
  assert.match(down.why, /could not be read: getaddrinfo ENOTFOUND/);
  assert.match((await flaggedNow({ fetchImpl: async () => ({ ok: false, status: 404 }) })).why, /answered 404/);
});

test('what it says names the folder and the reason, so the decision can be made from the issue', () => {
  const lines = watchLines({ ...dueSoon(entriesIn(TOML, 'test/.tools'), new Date('2026-11-25')), unanswered: ['GHSA-pppp-qqqq-rrrr'] });
  const said = lines.join('\n');
  assert.match(said, /1 answer has run out, and the scanner counts it again:/);
  assert.match(said, /`GHSA-dddd-eeee-ffff` in test\/\.tools, 5 days ago — Fixed in 4\.6\.4/);
  assert.match(said, /flagged with nothing coming and no answer written/);
  assert.match(said, /no date to look again, which is what a date is for/);
  assert.deepEqual(watchLines({}), [], 'nothing to act on says nothing');

  assert.match(issueBody({}, lines), /fix it.*report the range upstream.*answer it/s, 'the issue says the three it can be, and chooses none');
});
