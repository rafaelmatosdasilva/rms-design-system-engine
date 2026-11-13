// The hand-back as a Figma plugin (figma-plugin.mjs): a designer reviews and applies it inside Figma, with Undo.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pluginFiles, RECORD_KEY } from '../lib/figma-plugin.mjs';
import { applyScript, editLines, specFrameEdits, descriptionEdits, writeFigmaEdits } from '../lib/figma-edits.mjs';
import { tempDir } from './helpers.mjs';

const spec = { component: 'cardTile', nodeId: '1:2', fingerprint: 'abc123', title: 'cardTile · spec', parts: [{ n: 1, name: 'label' }],
  sections: [{ title: 'Anatomy', lines: ['Height 40px', '1  label'] }] };
const edits = [...specFrameEdits([spec]), ...descriptionEdits({ items: [{ kind: 'component', name: 'cardTile', nodeId: '1:2', text: 'A tile <for> cards.' }], n: 1, of: 1 })];

test('the plugin is the hand-back script itself, parses, and asks for no network', () => {
  const script = applyScript(edits), lines = editLines(edits);
  const f = pluginFiles({ script, lines });
  const manifest = JSON.parse(f['manifest.json']);
  assert.equal(manifest.main, 'code.js');
  assert.equal(manifest.ui, 'ui.html');
  assert.deepEqual(manifest.networkAccess.allowedDomains, ['none']);
  assert.ok(f['code.js'].includes(script), 'the apply is the script as written, never a second copy of its logic');
  assert.ok(f['code.js'].includes(RECORD_KEY), 'it keeps what the change replaced in the file, for Undo');
  // It parses as the plugin's main file Figma runs (figma and __html__ are Figma's own globals, never called here).
  new Function('figma', '__html__', f['code.js']);
  // The list is the engine's own words, escaped, with no NEXT line meant for an agent.
  assert.ok(!/NEXT:/.test(f['ui.html']));
  assert.ok(!f['ui.html'].includes('<for>'));
  const script_ = f['ui.html'].match(/<script>([\s\S]*)<\/script>/)[1];
  new Function('parent', 'onmessage', script_);
});

test('a hand-back with changes writes the plugin beside its script', () => {
  const dir = tempDir('figma-plugin');
  writeFigmaEdits(dir, edits);
  const p = join(dir, 'figma-plugin');
  for (const name of ['manifest.json', 'code.js', 'ui.html']) assert.ok(existsSync(join(p, name)), name);
  assert.match(readFileSync(join(p, 'ui.html'), 'utf8'), /cardTile/);
});
