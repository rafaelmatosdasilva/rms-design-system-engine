import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { fixtureProject, budget } from './helpers.mjs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { textWireframe, wireframeText } from '../lib/prototype-text.mjs';
import { reaches, TAKES_A_VALUE } from '../lib/prototype.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const tree = {
  id: 'p', component: 'Page', props: {}, children: [
    { id: 't', component: 'Text', props: { text: 'Settings', as: 'h1' }, children: [] },
    { id: 'r', component: 'Row', props: {}, children: [
      { id: 'a', component: 'Button', props: { label: 'Save', variant: 'primary' }, children: [] },
      { id: 'b', component: 'Buttn', props: { label: 'Back' }, children: [] },
    ] },
    { id: 'm', component: 'Missing', props: { need: 'a date picker' }, children: [] },
  ],
};

test('every line is the width asked for, and the page, boxes, heading and missing part are drawn as such', () => {
  const wf = textWireframe(tree, { width: 50 });
  for (const l of wf.lines) assert.equal([...l].length, 50, JSON.stringify(l));
  const text = wf.lines.join('\n');
  assert.match(wf.lines[0], /^╔═+╗$/);
  assert.match(text, /SETTINGS/);
  assert.match(text, /━{8}/);
  assert.match(text, /┌─ Button ─+┐/);
  assert.match(text, /"Save"/);
  assert.match(text, /variant primary/);
  assert.match(text, /┌┄ missing ┄+┐/);
  assert.match(text, /a date picker/);
});

test('a part the check found wrong is drawn where it is with a numbered mark, and never counted as a system component', () => {
  const findings = [{ id: 'b', rule: 1, level: 'error', message: '"Buttn" is not in the catalog (did you mean Button?)' }];
  const gaps = [{ node: 'r', kind: 'layout', need: 'a Row layout component' }];
  const wf = textWireframe(tree, { findings, gaps, width: 60 });
  assert.match(wf.lines.join('\n'), /┌─ Buttn ✗1 ─+┐/);
  assert.deepEqual(wf.notes, ['[1] "Buttn" is not in the catalog (did you mean Button?)']);
  assert.deepEqual(wf.used, [['Button', 1]]);
  const text = wireframeText('settings', wf);
  assert.match(text, /Components: Button\n/);
  assert.match(text, /Arranged by the engine, which no component of the system does: a Row layout component/);
  assert.match(text, /Marked in the drawing:\n\[1\]/);
});

test('a clean composition says so under the drawing', () => {
  const clean = { id: 'p', component: 'Page', props: {}, children: [{ id: 'a', component: 'Button', props: { label: 'Go' }, children: [] }] };
  assert.match(wireframeText('go', textWireframe(clean, { width: 40 })), /Every part is one the system holds/);
});

test('--width takes a value, so the number is never read as the composition', () => {
  assert.ok(TAKES_A_VALUE.includes('--width'));
  assert.equal(reaches(['page.json', '--text', '--width', '60']), 'one composition');
});

test('--prototype <file> --text draws the demo system\'s composition and writes it beside the prototypes', () => {
  const dir = fixtureProject(join(HERE, 'fixtures', 'demo-ds'), 'proto-text-');
  writeFileSync(join(dir, 'settings.json'), readFileSync(join(HERE, 'skill-evals', 'proto-fixtures', 'settings.json')));
  const r = spawnSync(process.execPath, [join(HERE, '..', 'audit.mjs'), '--prototype', 'settings.json', '--text', '--width', '60'], { cwd: dir, encoding: 'utf8', env: { ...process.env, NO_COLOR: '1' }, timeout: budget(120000) });
  const out = r.stdout;
  assert.match(out, /╔═{58}╗/);
  assert.match(out, /┌─ button ─+┐/);
  assert.match(out, /Components: .*button/);
  assert.match(readFileSync(join(dir, '.design-system-engine-out', 'prototypes', 'settings.txt'), 'utf8'), /SETTINGS/);
});
