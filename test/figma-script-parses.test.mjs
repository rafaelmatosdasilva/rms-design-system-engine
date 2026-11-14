// Every hand-back script the engine writes must parse before anyone runs it: a line of the generator that writes a raw
// newline into a quoted string made the spec frames' script fail in Figma with a syntax error, and no test read it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyScript, specFrameEdits, descriptionEdits, tokensBackEdits } from '../lib/figma-edits.mjs';

const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
// The script is the body use_figma runs: it ends in a return, so it is read as an async function's body (parsed, never run).
const parses = (script) => { new AsyncFunction(script); return true; };

const spec = { component: 'cardTile', nodeId: '1:2', fingerprint: 'abc123', title: 'cardTile · spec', parts: [{ n: 1, name: 'label' }],
  sections: [{ title: 'Anatomy', lines: ['Height 40px', '1  label · color: color/text'] }, { title: 'States', lines: ['hover · focus'] }] };

test('the hand-back script parses for each kind of edit, and for all of them together', () => {
  const kinds = {
    role: [{ kind: 'role', nodeId: '1:2', component: 'cardTile', label: 'Heading\nwith "quotes"' }],
    rename: [{ kind: 'rename', nodeId: '1:2', component: 'cardTile', what: 'prop', prop: 'Size', from: 'sz', to: 'size' }],
    spec: [{ kind: 'spec', nodeId: '1:2', component: 'cardTile', label: 'line one\nline two' }],
    specframes: specFrameEdits([spec]),
    descriptions: descriptionEdits({ items: [{ kind: 'variable', name: 'color/text', text: 'For body text.\nUsed by: cardTile' }, { kind: 'component', name: 'cardTile', nodeId: '1:2', text: 'A tile.\nCode: src/cardTile.vue' }], n: 1, of: 1 }),
    tokensback: tokensBackEdits({ changes: [{ name: 'color/text', mode: 'light', figma: '#000', code: '#111', kind: 'COLOR' }], created: [], n: 1, of: 1 }, { terms: (v) => v }),
  };
  for (const [kind, edits] of Object.entries(kinds)) {
    assert.ok(edits.length, `${kind} gives an edit`);
    assert.ok(parses(applyScript(edits)), `${kind} parses`);
  }
  assert.ok(parses(applyScript(Object.values(kinds).flat())));
  // The spec's lines are joined by a newline inside the script, never by one written into its source.
  assert.match(applyScript(kinds.specframes), /sec\.lines\.join\('\\n'\)/);
});
