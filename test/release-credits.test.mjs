// The release notes thank whoever reported what a release fixed, by their handle, only when they asked to be.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { consented, creditsFor, creditsSection, CONSENT, HEADING } from '../lib/release-credits.mjs';

const ENGINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const ticked = `### What happened\n\nIt broke.\n\n### When it is fixed\n\n- [X] ${CONSENT}, by my GitHub handle, in the release that fixes this.\n`;
const unticked = ticked.replace('[X]', '[ ]');
const issue = (number, login, body, more = {}) => ({ number, author: { login, ...more }, body });

test('only the box the reporter ticked in their own issue names them', () => {
  assert.equal(consented(ticked), true);
  assert.equal(consented(ticked.replace('[X]', '[x]')), true);
  assert.equal(consented(unticked), false);
  assert.equal(consented('Please thank me in the release notes!'), false, 'words alone are not the box');
  assert.equal(consented(undefined), false);
});

test('one line a person, every issue they reported and the pull requests that fixed them', () => {
  const prs = [
    { number: 40, issues: [issue(12, 'acme-dev', ticked), issue(13, 'quiet-one', unticked)] },
    { number: 41, issues: [issue(14, 'acme-dev', ticked), issue(15, 'dependabot[bot]', ticked), issue(16, 'helper', ticked, { is_bot: true })] },
    { number: 42, issues: [] },
  ];
  assert.deepEqual(creditsFor(prs), [{ handle: 'acme-dev', issues: [12, 14], prs: [40, 41] }]);
  assert.equal(creditsSection(prs), `${HEADING}\n\n- @acme-dev, for reporting #12, #14 (fixed in #40, #41)\n`);
  assert.equal(creditsSection([{ number: 1, issues: [issue(2, 'someone', unticked)] }]), '', 'nobody to thank: no section at all');
  assert.equal(creditsSection(undefined), '');
});

test('every issue form carries the box, unticked unless the reporter ticks it, and the release workflow reads it', () => {
  const dir = join(ENGINE, '.github', 'ISSUE_TEMPLATE');
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.yml') && x !== 'config.yml')) {
    const t = readFileSync(join(dir, f), 'utf8');
    assert.match(t, new RegExp(`id: credit[\\s\\S]*- label: ${CONSENT}[\\s\\S]*required: false`), f);
  }
  const wf = readFileSync(join(ENGINE, '.github', 'workflows', 'release.yml'), 'utf8');
  assert.match(wf, /closingIssuesReferences/);
  assert.match(wf, /node lib\/release-credits\.mjs "\$fixed"/);
  assert.match(wf, /issues: read/);
  const out = execFileSync(process.execPath, [join(ENGINE, 'lib', 'release-credits.mjs'), JSON.stringify([{ number: 9, issues: [issue(3, 'acme-dev', ticked)] }])], { encoding: 'utf8' });
  assert.match(out, /^## Thanks\n\n- @acme-dev, for reporting #3 \(fixed in #9\)/);
});
