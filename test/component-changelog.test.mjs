// component-changelog.mjs: each component's code history followed through its own rules, and each read of Figma that
// changed what Figma says of it, from a project's git history.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { ruleChanges, changelogs, figmaChangelogs, releaseLog } from '../component-changelog.mjs';
import { tempDir } from './helpers.mjs';

test('ruleChanges: each declaration changed, added or removed, in a few words', () => {
  const patch = ['   .chip {', '-    padding: var(--padding-s); /* old */', '+    padding: var(--padding-m);', '+    gap: 4px;', '-    color: red;', '   }'];
  assert.deepEqual(ruleChanges(patch), ['padding --padding-s → --padding-m', 'gap 4px added', 'color red removed']);
  assert.deepEqual(ruleChanges(['+ a: 1;', '+ b: 2;', '+ c: 3;', '+ d: 4;', '+ e: 5;']), ['a 1 added', 'b 2 added', 'c 3 added', 'd 4 added', 'and 1 more']);
});

const run = (dir, ...a) => spawnSync('git', a, { cwd: dir, encoding: 'utf8', env: { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' } });
test('a change inside a rule counts, not only one to the line that names the class; Figma reads say what changed', () => {
  const dir = tempDir('changelog-');
  run(dir, 'init', '-q', '-b', 'main');
  const css = (pad) => `.other { color: red; }\n.chip {\n  padding: ${pad};\n  gap: 4px;\n}\n`;
  const snap = (opts) => JSON.stringify({ chip: { properties: { 'Size#1:0': { type: 'VARIANT', variantOptions: opts, defaultValue: opts[0] } } } }, null, 2);
  const vars = (c) => JSON.stringify({ light: { 'chip/background': c } }, null, 2);
  writeFileSync(join(dir, 'theme.css'), css('8px')); writeFileSync(join(dir, 'props.json'), snap(['S'])); writeFileSync(join(dir, 'vars.json'), vars('#fff'));
  run(dir, 'add', '-A'); run(dir, 'commit', '-qm', 'first');
  // An annotated tag made later than its commit: the release is dated by the tag.
  spawnSync('git', ['tag', '-a', 'v1.0.0', '-m', 'v1.0.0'], { cwd: dir, env: { ...process.env, GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t', GIT_COMMITTER_DATE: '2030-01-02T10:00:00Z' } });
  writeFileSync(join(dir, 'theme.css'), css('12px')); run(dir, 'commit', '-qam', 'chip padding follows Figma');
  writeFileSync(join(dir, 'props.json'), snap(['S', 'M'])); writeFileSync(join(dir, 'vars.json'), vars('#f7f7f7')); run(dir, 'commit', '-qam', 'Figma read again');
  const code = changelogs(dir, [{ name: 'chip', files: ['theme.css'], ranges: [['theme.css', 2, 5]] }]).chip;
  assert.deepEqual(code.map((r) => [r.subject, r.release, r.changed]), [['chip padding follows Figma', null, ['padding 8px → 12px']], ['first', 'v1.0.0', ['padding 8px added', 'gap 4px added']]]);
  assert.deepEqual(code.map((r) => (r.releasedAt ? new Date(r.releasedAt).toISOString() : null)), [null, '2030-01-02T10:00:00.000Z'], 'the day it was tagged, not its last commit');
  // The release log: every commit, whatever it changed, by release; what is not released yet first.
  assert.deepEqual(releaseLog(dir).map((g) => [g.release, g.commits.map((c) => c.subject)]), [[null, ['Figma read again', 'chip padding follows Figma']], ['v1.0.0', ['first']]]);
  const fig = figmaChangelogs(dir, { props: 'props.json', vars: 'vars.json' }, ['chip']).chip;
  assert.deepEqual(fig.map((r) => r.changed), [['property Size VARIANT · S · S → VARIANT · S, M · S', 'chip/background light #fff → #f7f7f7'], ['read from Figma for the first time']]);
});

test('ticketOf: the ticket a commit was made for, its address, and what the commit says without it', async () => {
  const { ticketOf, ticketLinks } = await import('../component-changelog.mjs');
  assert.deepEqual(ticketOf('#4521 - fixed the chip padding', { changelog: { ticketUrl: 'https://issues.example/t/{id}' } }), { ticket: '#4521', ticketUrl: 'https://issues.example/t/4521', says: 'fixed the chip padding' });
  assert.deepEqual(ticketOf('KIT-88: tile caption wraps', { changelog: { ticket: '[A-Z]+-\\d+' } }), { ticket: 'KIT-88', ticketUrl: null, says: 'tile caption wraps' });
  assert.equal(ticketOf('Tile caption wraps (#12)'), null, 'a pull request at its end is not a ticket');
  assert.equal(ticketOf('Fixed the menu position'), null);
  // No address set: the project's own changelog says how it links a ticket.
  const dir = tempDir('tickets-');
  spawnSync('mkdir', ['-p', join(dir, 'docs')]);
  writeFileSync(join(dir, 'docs', 'CHANGELOG.md'), '## 1.0.0\n* [#77](https://tracker.example/issues/77) - first\n');
  assert.equal(ticketLinks(dir), 'https://tracker.example/issues/{id}');
  assert.equal(ticketOf('#4521 - x', {}, dir).ticketUrl, 'https://tracker.example/issues/4521');
});
