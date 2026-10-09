// The category of each Figma annotation: captured with the Plugin API, kept in its own snapshot, and what it means for
// the checks and the To do list (a requirement, or design intent).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { noteKey, captureScript, mergeCaptures, noteKind, isRequirement, requirementEntry, noteIsTodo, loadCategories, categoriesPath } from '../annotation-categories.mjs';
import { makeFixture } from './helpers.mjs';
import { OUT_DIR } from '../names.mjs';

const ENGINE = dirname(dirname(fileURLToPath(import.meta.url)));

test('a note is found by a key of its text that the Figma script computes the same way', () => {
  assert.equal(noteKey('Role:  button\n'), noteKey('Role: button'));              // spacing does not matter
  assert.notEqual(noteKey('Role: button'), noteKey('Role: link'));
  const line = captureScript().split('\n').find((l) => l.startsWith('function noteKey'));
  const figmaKey = new Function(line + '\nreturn noteKey;')();
  for (const t of ['Role: button', 'Background must match the containing surface.', '**Use:** – Close the flow', 'Ação: fechar']) assert.equal(figmaKey(t), noteKey(t), t);
});

test('captures fold into one snapshot; a page read again replaces its nodes, another page adds to them', () => {
  const a = { categories: { '0:2': { label: 'Accessibility', color: 'blue' } }, notes: { '1:1': { k1: '0:2' }, '1:2': { k2: '0:2' } } };
  const b = { categories: { '9:9': { label: 'Intent', color: 'pink' } }, notes: { '1:2': { k3: '9:9' } } };
  const r = mergeCaptures(null, [a, b]);
  assert.deepEqual(r.snapshot.notes, { '1:1': { k1: '0:2' }, '1:2': { k3: '9:9' } });
  assert.deepEqual([r.nodes, r.notes, r.categories], [2, 2, 2]);
  assert.match(r.snapshot._updated, /^\d{4}-/);
  assert.deepEqual(mergeCaptures(r.snapshot, [{ categories: {}, notes: { '2:2': { k4: '0:2' } } }]).nodes, 3, 'an earlier snapshot is kept and added to');
  assert.throws(() => mergeCaptures(null, [{ hello: 1 }]), /not a capture/);
});

test('a note\'s kind comes from its category name: the defaults, the project\'s own names, never a deleted category', () => {
  const cats = { categories: { i: { label: 'Intent' }, m: { label: 'Implementation' }, a: { label: 'Accessibility' }, c: { label: 'Content' }, d: { label: 'Development' }, x: { label: 'Notas de Acessibilidade' } },
    notes: { '1:1': { [noteKey('why')]: 'i', [noteKey('how')]: 'm', [noteKey('role')]: 'a', [noteKey('dev')]: 'd', [noteKey('pt')]: 'x', [noteKey('gone')]: 'zz' } } };
  const k = (text, cfg = {}) => noteKind({ label: text }, '1:1', cats, cfg);
  assert.deepEqual([k('why'), k('how'), k('role'), k('dev')], ['intent', 'implementation', 'accessibility', 'implementation']);
  assert.equal(k('pt'), null, 'a name the project did not map: read as before');
  assert.equal(k('pt', { annotations: { categories: { 'Notas de acessibilidade': 'accessibility' } } }), 'accessibility', 'mapped by the project, case and accents ignored');
  assert.equal(k('gone'), null, 'a category deleted from the file');
  assert.equal(k('never captured'), null);
  assert.equal(noteKind({ label: 'why' }, '1:1', null), null, 'no categories captured: every note as before');
  assert.equal(noteKind({ label: 'anything', categoryId: 'c' }, '9:9', cats), 'content', 'a note that carries its category id');
});

test('only accessibility and uncategorised notes are requirements; a note no check reads is work only when it states accessibility', () => {
  const cats = { categories: { i: { label: 'Intent' }, a: { label: 'Accessibility' } }, notes: { '1:1': { [noteKey('Use it for one action.')]: 'i', [noteKey('Role: button')]: 'a' }, '1:5': { [noteKey('The remove button is enabled with two lines.')]: 'i' } } };
  const entry = { nodeId: '1:1', annotations: [{ label: 'Use it for one action.' }, { label: 'Role: button' }, { label: 'Heading level 2' }],
    layerAnnotations: [{ layer: 'Row', nodeId: '1:5', annotations: [{ label: 'The remove button is enabled with two lines.' }] }] };
  const req = requirementEntry(entry, cats);
  assert.deepEqual(req.annotations.map((a) => a.label), ['Role: button', 'Heading level 2']);
  assert.deepEqual(req.layerAnnotations, [], 'an intent note on a layer is not a requirement either');
  assert.equal(requirementEntry(entry, null), entry, 'no categories: unchanged');
  assert.equal(isRequirement({ label: 'Use it for one action.' }, '1:1', cats), false);
  assert.deepEqual([noteIsTodo('accessibility', null), noteIsTodo(null, 'Role: button'), noteIsTodo(null, null), noteIsTodo('intent', 'Role: button'), noteIsTodo('implementation', null)], [true, true, false, false, false]);
});

test('the categories snapshot sits beside the component-props one, and a missing or broken one reads as none', () => {
  const dir = mkdtempSync(join(tmpdir(), 'cats-'));
  const cfg = { paths: { compPropsSnapshot: 'src/figma-component-props.snapshot.json' } };
  assert.equal(categoriesPath(dir, cfg), join(dir, 'src', 'figma-annotation-categories.snapshot.json'));
  assert.equal(categoriesPath(dir, { paths: { annotationCategoriesSnapshot: 'x.json' } }), join(dir, 'x.json'));
  assert.equal(loadCategories(dir, {}), null);
  writeFileSync(join(dir, 'figma-annotation-categories.snapshot.json'), '{ broken');
  assert.equal(loadCategories(dir, {}), null);
  writeFileSync(join(dir, 'figma-annotation-categories.snapshot.json'), JSON.stringify({ categories: {}, notes: {} }));
  assert.deepEqual(loadCategories(dir, {}), { categories: {}, notes: {} });
});

test('--annotation-categories: no file writes the read-only script; the files it returned become the snapshot', () => {
  const dir = makeFixture({ 'ds-config.json': { figmaFileKey: 'KEY123', paths: { compPropsSnapshot: 'props.json' } },
    'props.json': { chip: { nodeId: '1:2', annotations: [{ label: 'Role: button' }, { label: 'Why it exists' }] } } });
  const run = (...args) => execFileSync(process.execPath, [join(ENGINE, 'audit.mjs'), '--annotation-categories', ...args], { cwd: dir, encoding: 'utf8', timeout: 60000 });
  let out = run();
  assert.match(out, /figma-capture\/annotation-categories\.js/, out);
  assert.match(out, /on the file KEY123/, out);
  assert.match(out, /NEXT: rms-design-system-engine --annotation-categories \S*annotation-categories\.json/, out);
  assert.equal(readFileSync(join(dir, OUT_DIR, 'figma-capture', 'annotation-categories.js'), 'utf8'), captureScript());
  writeFileSync(join(dir, 'cap.json'), JSON.stringify({ categories: { i: { label: 'Intent' }, a: { label: 'Accessibility' } }, notes: { '1:2': { [noteKey('Why it exists')]: 'i' } } }));
  out = run('cap.json');
  assert.match(out, /Annotation categories kept: 2 categories, 1 categorised note on 1 node/, out);
  assert.match(out, /The component notes: 1 no category, 1 intent\./, out);
  assert.deepEqual(Object.keys(JSON.parse(readFileSync(join(dir, 'figma-annotation-categories.snapshot.json'), 'utf8')).notes), ['1:2']);
  writeFileSync(join(dir, 'junk.json'), '{"hello":1}');
  assert.throws(() => run('junk.json'), /not a capture/);
});
