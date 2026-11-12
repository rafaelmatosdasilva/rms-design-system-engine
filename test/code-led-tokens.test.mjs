// A token the code changed first, written back to Figma (code-led-tokens.mjs): who changed first is read from the code
// as it was when Figma was last read, never guessed from a difference alone.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { codeLedPlan, figmaValues, themeAt, keepCodeAtRead, codeAtRead, figmaTerms, sameToken, chunkOf } from '../lib/code-led-tokens.mjs';
import { tokensBackEdits, applyScript, editLines } from '../lib/figma-edits.mjs';
import { undoScript } from '../lib/figma-undo.mjs';
import { tempDir } from './helpers.mjs';

const toVar = (n) => '--' + n.split('/').join('-');
const toToken = (c) => c.replace(/^--/, '').split('-').join('/');
const F = (entries) => new Map(entries.map(([name, values, extra = {}]) => [name, { values, collection: extra.collection ?? 'Theme', kind: extra.kind ?? 'COLOR' }]));
const C = (entries) => new Map(entries.map(([css, values]) => [css, values]));

test('the code led only where it held what Figma holds when Figma was read, and moved since', () => {
  const figma = F([['acme/brand/color', { light: '#0037fa', dark: '#7594ff' }], ['acme/info/color', { light: '#111111' }], ['acme/ok/color', { light: '#00aa00' }]]);
  const codeThen = C([['--acme-brand-color', { light: '#0037fa', dark: '#7594ff' }], ['--acme-info-color', { light: '#222222' }], ['--acme-ok-color', { light: '#00aa00' }]]);
  const codeNow = C([['--acme-brand-color', { light: '#0040ff', dark: '#7594ff' }], ['--acme-info-color', { light: '#333333' }], ['--acme-ok-color', { light: '#00AA00' }]]);
  const p = codeLedPlan({ figma, codeNow, codeThen, toVar, toToken });
  // brand light: the code held Figma's value then and moved since → written back.
  assert.deepEqual(p.changes.map((c) => [c.name, c.mode, c.figma, c.code]), [['acme/brand/color', 'light', '#0037fa', '#0040ff']]);
  // info: already different when Figma was read → nobody can tell who is right.
  assert.deepEqual(p.drift.map((c) => c.name), ['acme/info/color']);
  // ok: the same colour written another way is no difference at all.
  assert.equal(p.counts.changes + p.counts.drift + p.counts.unknown, 2);
});

test('with no past to read, every difference is listed and none is written', () => {
  const p = codeLedPlan({ figma: F([['acme/brand/color', { light: '#0037fa' }]]), codeNow: C([['--acme-brand-color', { light: '#0040ff' }]]), codeThen: null, toVar, toToken });
  assert.deepEqual([p.counts.changes, p.counts.unknown], [0, 1]);
});

test('a number Figma writes with px is the number the code writes bare (a font weight), never a difference', () => {
  assert.equal(sameToken('500px', '500'), true);
  assert.equal(sameToken('8px', '0.5rem'), true);
  assert.equal(sameToken('#fff', '#FFFFFF'), true);
  assert.equal(sameToken('500px', '700'), false);
  const p = codeLedPlan({ figma: F([['acme/weight', { light: '500px' }, { kind: 'FLOAT' }]]), codeNow: C([['--acme-weight', { light: '500' }]]), codeThen: null, toVar, toToken });
  assert.equal(p.counts.unknown, 0);
});

test('a value that replaces an alias in Figma names the alias it breaks', () => {
  const figma = F([['acme/button/color', { light: '#0037fa' }]]);
  const p = codeLedPlan({ figma, codeNow: C([['--acme-button-color', { light: '#0040ff' }]]), codeThen: C([['--acme-button-color', { light: '#0037fa' }]]),
    toVar, toToken, aliases: { light: { 'acme/button/color': ['acme/brand/color'] } } });
  assert.equal(p.changes[0].breaksAlias, 'acme/brand/color');
});

test('a token the code added since Figma was read is made, in the collection most of its layer is in', () => {
  const figma = F([['acme/brand/color', { light: '#0037fa' }, { collection: 'Theme' }], ['acme/info/color', { light: '#111' }, { collection: 'Theme' }], ['acme/gap/s', { light: '4px' }, { collection: 'Spacing', kind: 'FLOAT' }]]);
  const codeThen = C([['--acme-brand-color', { light: '#0037fa' }], ['--acme-old-color', { light: '#999' }]]);
  const codeNow = C([['--acme-brand-color', { light: '#0037fa' }], ['--acme-new-color', { light: '#abcdef' }], ['--acme-old-color', { light: '#999' }]]);
  const p = codeLedPlan({ figma, codeNow, codeThen, toVar, toToken });
  assert.deepEqual(p.created.map((n) => [n.name, n.collection]), [['acme/new/color', 'Theme']]);
  // One the code had already when Figma was read is not "added since": it is not made.
  assert.ok(!p.created.some((n) => n.name === 'acme/old/color'));
});

test('the code as it was when Figma was read, from git, else from what was kept at that read', () => {
  const calls = [];
  const git = (args) => { calls.push(args.join(' ')); if (args[0] === 'log') return 'abc1234def\n'; return ':root { --acme-brand-color: #0037fa; }'; };
  const at = themeAt('/x', ['theme.css'], '2026-10-07', { git });
  assert.equal(at.commit, 'abc1234def');
  assert.match(calls[0], /--before=2026-10-07/);
  assert.equal(themeAt('/x', ['theme.css'], '2026-10-07', { git: () => '' }), null, 'no commit that far back is no past');
  assert.equal(themeAt('/x', ['theme.css'], null), null);
  const ROOT = tempDir('code-at-read-');
  const kept = keepCodeAtRead(ROOT, 'out', '2026-11-12T10:00:00Z', C([['--acme-brand-color', { light: '#0037fa' }]]));
  assert.ok(existsSync(join(ROOT, kept)));
  assert.deepEqual(codeAtRead(ROOT, 'out', '2026-11-12T10:00:00Z').get('--acme-brand-color'), { light: '#0037fa' });
  // Kept at another read, it says nothing of this one.
  assert.equal(codeAtRead(ROOT, 'out', '2026-11-13T09:00:00Z'), null);
});

test('Figma\'s values come from the current snapshot or the older one alike', () => {
  const modes = [{ name: 'Light', snapshotKey: 'light' }, { name: 'Dark', snapshotKey: 'dark' }];
  const cur = figmaValues({ figmaTokens: { tokens: [{ name: 'acme/brand/color', collection: 'Theme', kind: 'COLOR', values: { Light: '#0037fa', Dark: '#7594ff' } }] } }, modes);
  assert.deepEqual(cur.get('acme/brand/color').values, { light: '#0037fa', dark: '#7594ff' });
  const old = figmaValues({ color: { light: { 'acme/brand/color': '#0037fa' } }, sizing: { 'acme/gap/s': '4px' } }, modes);
  assert.deepEqual(old.get('acme/brand/color').values, { light: '#0037fa' });
  assert.equal(old.get('acme/gap/s').kind, 'FLOAT');
  assert.deepEqual(figmaTerms('#ff0000', 'COLOR'), { r: 1, g: 0, b: 0, a: 1 });
  assert.equal(figmaTerms('8px', 'FLOAT'), 8);
  assert.equal(figmaTerms('nonsense', 'COLOR'), null);
});

test('the hand-back writes only what is unchanged since, makes what is new, and keeps the way back', () => {
  const plan = { changes: [{ name: 'acme/brand/color', css: '--acme-brand-color', mode: 'light', figma: '#0037fa', code: '#0040ff', kind: 'COLOR' }],
    created: [{ name: 'acme/new/color', css: '--acme-new-color', values: { light: '#abcdef' }, collection: 'Theme' }] };
  const edits = tokensBackEdits(chunkOf(plan, 1), { modeName: (k) => (k === 'light' ? 'Light' : k), terms: figmaTerms });
  assert.equal(edits[0].kind, 'tokensback');
  assert.equal(edits[0].changes[0].mode, 'Light');
  assert.deepEqual(edits[0].changes[0].value, figmaTerms('#0040ff', 'COLOR'));
  const script = applyScript(edits);
  // Read again in the file: a value no longer what the list was made from is a conflict, never written over.
  assert.match(script, /conflicts\.push\(c\.name/);
  assert.ok(script.indexOf('U.variableValue(v, mode.modeId)') < script.indexOf('v.setValueForMode(mode.modeId, c.value)'));
  assert.match(script, /U\.madeVariable\(v\)/);
  assert.match(editLines(edits).join('\n'), /Tokens the code changed first/);
  const undo = undoScript([{ kind: 'variableValue', id: 'V:1', modeId: 'M:1', was: { r: 0, g: 0, b: 1, a: 1 }, what: 'acme/brand/color' }, { kind: 'deleteVariable', id: 'V:2', what: 'acme/new/color' }]);
  assert.match(undo, /v\.setValueForMode\(s\.modeId, s\.was\)/);
  assert.match(undo, /v\.remove\(\)/);
});
