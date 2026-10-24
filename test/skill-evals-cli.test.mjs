// The skill evaluation keeps which bundled skills the agent's command line had in each run, and says when they changed,
// so a new command line is never read as a change in the guide.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cliOf, cliChange, cliLine } from './skill-evals/lib.mjs';
import { resultsEntry } from './skill-evals/record.mjs';

const init = (skills, version = '2.1.0') => [{ type: 'system', subtype: 'init', claude_code_version: version, skills }, { type: 'result' }];
const row = (skills, version) => ({ cli: cliOf(init(skills, version)) });

test('a run keeps its command line version and bundled skills, never the guide itself', () => {
  assert.deepEqual(cliOf(init(['verify', 'debug', 'rms-design-system-engine'])), { version: '2.1.0', skills: ['debug', 'verify'] });
  assert.equal(cliOf([{ type: 'result' }]), null);
});

test('a skill added since the runs before, or runs that differ, is said; the same skills say nothing', () => {
  assert.equal(cliChange([row(['debug'])], [row(['debug'])]), null);
  const c = cliChange([row(['debug', 'run'], '2.2.0')], [row(['debug'], '2.1.0')]);
  assert.deepEqual([c.added, c.removed, c.within], [['run'], [], false]);
  assert.match(cliLine(c), /2\.1\.0 → 2\.2\.0; added run.*not from the guide/);
  assert.equal(cliChange([row(['debug']), row(['debug', 'run'])]).within, true);
  assert.equal(cliChange([{ pass: true }], []), null, 'rows from before it was kept say nothing');
});

test('the RESULTS.md entry says the command line changed, apart from the guide', () => {
  const stats = { tasks: 1, more: [], pass: 1, runs: 1, cost: 0.1, input: 1000, violations: 0, failed: [], engine: 'abc', project: 'p' };
  const e = resultsEntry({ title: 't', what: 'w', guideSet: 'g', now: { 'claude-x': stats }, name: 'n', cli: cliLine(cliChange([row(['debug', 'run'], '2.2.0')], [row(['debug'], '2.1.0')])) });
  assert.match(e, /\*\*The agent's command line changed\.\*\* The agent's command line bundles other skills/);
});
