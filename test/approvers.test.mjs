// Who may approve each kind of change, by name: the team's list in ds-config.json, else the file's code owners (approvers.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tempDir } from './helpers.mjs';
import { kindOfFile, readCodeOwners, ownersOf, approversFor, approvalRefusal, missingApprovals, missingLine } from '../lib/approvers.mjs';

test('a file says what kind of change an edit of it is', () => {
  const cfg = { paths: { themeCSS: 'src/theme.css' } };
  assert.equal(kindOfFile('src/theme.css', cfg), 'token');
  assert.equal(kindOfFile('./design-system-engine-kept.json', cfg), 'exception');
  assert.equal(kindOfFile('ds-config.json', cfg), 'exception');
  assert.equal(kindOfFile('.design-system-engine-refs/chip.png', cfg), 'reference');
  assert.equal(kindOfFile('src/Chip.vue', cfg), null);
});

test('code owners are read as GitHub reads them: the last rule that matches wins', () => {
  const root = tempDir('owners-');
  mkdirSync(join(root, '.github'), { recursive: true });
  writeFileSync(join(root, '.github/CODEOWNERS'), '# owners\n*            @acme/web\nsrc/theme.css @acme/brand @lead\n/docs/       @acme/docs\n*.png        @acme/qa\n[Section]\n');
  const rules = readCodeOwners(root);
  assert.deepEqual(ownersOf('src/theme.css', rules), ['@acme/brand', '@lead']);
  assert.deepEqual(ownersOf('docs/a/b.md', rules), ['@acme/docs']);
  assert.deepEqual(ownersOf('refs/chip.png', rules), ['@acme/qa']);
  assert.deepEqual(ownersOf('src/Chip.vue', rules), ['@acme/web']);
  assert.deepEqual(readCodeOwners(tempDir('none-')), []);
});

test('the team\'s list for a kind comes first, then an agent\'s, then the code owners; anyone else is refused', () => {
  const rules = [{ pattern: 'src/theme.css', owners: ['@brand-lead'] }];
  const cfg = { review: { approvers: { token: ['Design lead', '@brand-lead'], agent: ['QA', 'agent'] } } };
  assert.deepEqual(approversFor({ kind: 'token', file: 'src/theme.css', cfg, rules }), { names: ['Design lead', '@brand-lead'], from: 'ds-config.json review.approvers.token' });
  assert.deepEqual(approversFor({ kind: 'option', file: 'src/Chip.vue', cfg, rules, agent: true }).from, 'ds-config.json review.approvers.agent');
  assert.deepEqual(approversFor({ kind: 'value', file: 'src/theme.css', cfg: {}, rules }), { names: ['@brand-lead'], from: 'CODEOWNERS' });
  assert.equal(approversFor({ kind: 'value', file: 'src/a.css', cfg: {}, rules }), null, 'nobody named: anyone but the author, as before');
  const ap = approversFor({ kind: 'token', cfg, rules });
  assert.equal(approvalRefusal({ reviewer: { kind: 'person', name: 'brand-lead' }, approvers: ap, kind: 'token' }), null, 'a handle with or without its @');
  assert.match(approvalRefusal({ reviewer: { kind: 'person', name: 'Intern' }, approvers: ap, kind: 'token' }), /^Intern may not approve a new token: Design lead, @brand-lead may \(ds-config.json review.approvers.token\)/);
  assert.match(approvalRefusal({ reviewer: { kind: 'agent', session: 'abc' }, approvers: ap, kind: 'token' }), /^A second agent review may not approve/);
  assert.equal(approvalRefusal({ reviewer: { kind: 'agent', session: 'abc' }, approvers: approversFor({ kind: 'option', cfg, agent: true }) }), null, 'an agent the team named');
  assert.equal(approvalRefusal({ reviewer: { kind: 'person', name: 'Anyone' }, approvers: null }), null);
});

test('each held change nobody signed says who it waits for', () => {
  const held = { 'the token --x': { what: 'the token --x', kind: 'token', file: 'src/theme.css' }, 'Chip size=XL': { what: 'Chip size=XL', kind: 'option', file: 'src/Chip.vue', author: { kind: 'agent', session: 's' } } };
  const m = missingApprovals(held, [{ what: 'Chip size=XL', by: 'QA' }], { cfg: { review: { approvers: { token: ['Design lead'] } } } });
  assert.deepEqual(m, [{ what: 'the token --x', kind: 'token', names: ['Design lead'], from: 'ds-config.json review.approvers.token' }]);
  assert.equal(missingLine(m[0]), 'the token --x: waits for Design lead (ds-config.json review.approvers.token)');
  assert.equal(missingLine({ what: 'y', names: [] }), 'y: waits for a named person other than whoever made it');
});
