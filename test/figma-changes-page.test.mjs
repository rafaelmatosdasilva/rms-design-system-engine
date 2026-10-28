// The changes made to components in Figma, where people see them (component-change.mjs → changesView, the style guide's
// Changes in Figma page and each component's History), and where a component is used in every team file (Figma's library
// analytics, figma-analytics.mjs), or why those files were not seen.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tempDir } from './helpers.mjs';
import { changesView, changeLines } from '../component-change.mjs';
import { libraryUsage } from '../figma-analytics.mjs';

const change = (component, at, extra = {}) => ({ kind: 'change', component, at, asked: `add xl to ${component}'s size`, ops: [{ op: 'addOption', axis: 'size', option: 'xl', like: 'l' }], report: { skeleton: [], architecture: [{ change: 'added', what: 'option size=xl' }], variables: [] }, breaking: [], held: [{ what: 'a new option' }], faults: [], ...extra });

test('every change the engine kept: waiting, made as said, not as said, newest first, one change shown once', () => {
  const root = tempDir('fc-');
  const dir = join(root, '.design-system-engine-out', 'changes');
  mkdirSync(join(dir, 'done'), { recursive: true });
  writeFileSync(join(dir, 'chip.change.json'), JSON.stringify(change('chip', '2026-10-28T10:00:00Z', { done: [{ at: 'x', mismatch: [], real: { skeleton: [] } }] })));
  writeFileSync(join(dir, 'done', 'chip-2026-10-28.json'), JSON.stringify(change('chip', '2026-10-28T10:00:00Z', { done: [{ at: 'x', mismatch: [], real: { skeleton: [] } }] })));
  writeFileSync(join(dir, 'done', 'tag-2026-10-27.json'), JSON.stringify(change('tag', '2026-10-27T10:00:00Z', { done: [{ at: 'y', mismatch: [{ change: 'added', what: 'frame Extra' }] }] })));
  writeFileSync(join(dir, 'button.change.json'), JSON.stringify(change('button', '2026-10-29T10:00:00Z')));
  const v = changesView(root, { readdirSync, readFileSync, join });
  assert.deepEqual(v.map((x) => [x.component, x.status]), [['button', 'waiting'], ['chip', 'made'], ['tag', 'not as said']]);
  assert.deepEqual(v[0].steps, ['a new option size=xl, its variants copied from l']);
  assert.deepEqual(changesView(tempDir('fc-none-'), { readdirSync, readFileSync, join }), []);
});

test('instances in every team file from Figma\'s library analytics, a set\'s variants added up; else why not', async () => {
  const rows = [{ component_set_name: 'chip', component_name: 'size=s', usages: 30, files_using: 4 }, { component_set_name: 'chip', component_name: 'size=l', usages: 12, files_using: 6 }, { component_name: 'tag', usages: 5, files_using: 1 }];
  const ok = async () => ({ ok: true, status: 200, json: async () => ({ rows }) });
  assert.deepEqual(await libraryUsage('chip', { fileKey: 'K1', token: 't', get: ok }), { instances: 42, files: 6 });
  assert.deepEqual(await libraryUsage('nothing', { fileKey: 'K1', token: 't', get: ok }), { instances: 0, files: 0 });
  assert.match((await libraryUsage('chip', { fileKey: 'K2', token: 't', get: async () => ({ ok: false, status: 403 }) })).unseen, /Enterprise plan/);
  assert.match((await libraryUsage('chip', { fileKey: 'K3', token: null })).unseen, /no FIGMA_TOKEN/);
  // The report says it, or says why those files were not seen.
  const with_ = changeLines({ component: 'chip', asked: '', ops: [], report: {}, breaking: [], held: [], named: [], faults: [], questions: [], usedBy: { products: [], inside: [], screens: 0, library: { instances: 42, files: 6 } } }).join('\n');
  assert.match(with_, /42 instances in 6 team files \(Figma's library analytics\)/);
  const without = changeLines({ component: 'chip', asked: '', ops: [], report: {}, breaking: [], held: [], named: [], faults: [], questions: [], usedBy: { products: [], inside: [], screens: 0, library: { unseen: 'no FIGMA_TOKEN, so Figma\'s library analytics were not read' } } }).join('\n');
  assert.match(without, /Team files the engine does not read are not counted \(no FIGMA_TOKEN/);
});

test('the style guide has the Changes in Figma page, and each component\'s History links each change', () => {
  const tpl = readFileSync(new URL('../templates/styleguide.template.html', import.meta.url), 'utf8');
  assert.match(tpl, /section\('figma-changes', 'Changes', 'Changes in Figma'/);
  assert.match(tpl, /card\('What the change said it does'[\s\S]*card\('What Figma shows once it was made'/);
  assert.match(tpl, /#figma-changes\?panel=' \+ esc\(encodeURIComponent\('doc:fc:'/);
  assert.match(readFileSync(new URL('../styleguide-gen.mjs', import.meta.url), 'utf8'), /view\.figmaChanges = fc/);
});
