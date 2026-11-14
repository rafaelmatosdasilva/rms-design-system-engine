// The states a component must have, as the team's intent layer names them, held against Figma and the code
// (owed-states.mjs, owed-states-check.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { tempDir } from './helpers.mjs';
import { owedOf, figmaStatesOf, codeStatesOf, missingOwed, conceptOfState } from '../lib/owed-states.mjs';
import { readMarkdown } from '../lib/doc-source-markdown.mjs';
import { syncIntentLayer } from '../lib/intent-layer.mjs';

const ENGINE = join(dirname(fileURLToPath(import.meta.url)), '..');

test('a required state is read as a concept, each line as written; one the engine cannot read is said, never dropped', () => {
  assert.deepEqual(owedOf(['Disabled', 'Loading: a spinner replaces the label', 'Read-only', 'error and empty', 'Shown in purple']),
    { owed: ['disabled', 'loading', 'readonly', 'error', 'empty'], unread: ['Shown in purple'] });
  assert.equal(conceptOfState('isInactive'), 'disabled', 'inactive is disabled, never active');
  assert.equal(conceptOfState('Invalid'), 'error');
  assert.equal(conceptOfState('Primary'), null);
});

test('each side is asked: Figma by its variants and booleans, the code by its props, markup and styles', () => {
  const figma = figmaStatesOf({ State: { type: 'VARIANT', variantOptions: ['Default', 'Hover', 'Error'] }, 'isLoading#1:2': { type: 'BOOLEAN' }, Disabled: { type: 'VARIANT', variantOptions: ['False', 'True'] } });
  assert.deepEqual([...figma].sort(), ['disabled', 'error', 'hover', 'loading']);
  const code = codeStatesOf({ text: '<button :disabled="disabled" :aria-busy="loading">', css: '.field:hover {} .field[aria-invalid="true"] {}', props: ['readOnly'] });
  assert.deepEqual([...code].sort(), ['disabled', 'error', 'hover', 'loading', 'readonly']);
  assert.deepEqual(missingOwed({ owed: ['disabled', 'readonly'], figma, code }), [{ state: 'readonly', side: 'Figma' }]);
  assert.deepEqual(missingOwed({ owed: ['loading'], figma: null, code: new Set() }), [{ state: 'loading', side: 'code' }], 'a side the component is not on is not asked');
});

test('a page Required states section is what is owed; a plain States section stays a fact', () => {
  const { entities } = readMarkdown(new Map([
    ['docs/components/field.md', '# Field\n\nWhere a person types one value.\n\n## Required states\n\n- Error\n- Read-only\n\n## States\n\n- Default\n- Focus\n'],
  ]), { root: 'docs' });
  const f = entities.find((e) => e.name === 'Field');
  assert.deepEqual(f.owedStates, ['Error', 'Read-only']);
  assert.ok(f.facts.includes('States'));
});

test('in the audit: a required state one side lacks is said, with the page it comes from, and the gate does not fail on it', async () => {
  const root = tempDir('owed-states-');
  cpSync(join(ENGINE, 'test', 'fixtures', 'harbor-ds'), root, { recursive: true });
  mkdirSync(join(root, 'docs', 'components'), { recursive: true });
  writeFileSync(join(root, 'docs', 'components', 'button.md'), '# Button\n\nThe main action.\n\n## Required states\n\n- Disabled\n- Loading: a spinner replaces the label\n- Shown in purple\n');
  const cfg = JSON.parse(readFileSync(join(root, 'ds-config.json'), 'utf8'));
  cfg.intentLayer = 'docs';
  writeFileSync(join(root, 'ds-config.json'), JSON.stringify(cfg, null, 2));
  await syncIntentLayer(root, cfg);
  const r = spawnSync(process.execPath, [join(ENGINE, 'lib', 'owed-states-check.mjs')], { cwd: root, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /⚠️ {2}MISSING {3}\d+/);
  assert.match(r.stdout, /button owes the disabled state, as its page says \(docs\/components\/button\.md\): Figma has no disabled variant or property/);
  assert.match(r.stdout, /button owes the loading state[^\n]*Figma has no loading variant or property; the code has nothing for it/);
  assert.match(r.stdout, /button: "Shown in purple" is no state the engine can check/);
  // A project whose pages name no required state: nothing to check, said so.
  const quiet = tempDir('owed-states-none-');
  cpSync(join(ENGINE, 'test', 'fixtures', 'harbor-ds'), quiet, { recursive: true });
  assert.match(spawnSync(process.execPath, [join(ENGINE, 'lib', 'owed-states-check.mjs')], { cwd: quiet, encoding: 'utf8' }).stdout, /⏭ {2}owed states: no intent layer read - nothing to check/);
});
