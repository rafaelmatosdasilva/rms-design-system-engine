// invented.mjs - the names agents actually invented here, kept so the catalog rejects them by name next time.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { inventionsIn, noteInvented, readInvented, rejectedFrom, INVENTED_FILE } from '../invented.mjs';
import { buildCatalog } from '../ui-catalog.mjs';

const findings = [
  { rule: 1, level: 'error', id: 'a', message: '"Pill" is not in the catalog (did you mean Chip?)' },
  { rule: 1, level: 'error', id: 'b', message: '"Widget" is not in the catalog' },
  { rule: 2, level: 'error', id: 'c', message: 'Badge has no prop "colour" (did you mean tone?)' },
  { rule: 2, level: 'error', id: 'd', message: 'Badge.tone = "danger" is not one of info, warn' },
  { rule: 4, level: 'warning', id: 'e', message: '"x" is not attached to the tree' },
];

test('what a check saw an agent invent: the wrong name, and the right one where the check knew it', () => {
  const inv = inventionsIn(findings);
  assert.deepEqual(inv.components.Pill, { right: 'Chip', times: 1 });
  // A name nobody could correct still counts: that it was invented is worth knowing.
  assert.deepEqual(inv.components.Widget, { right: null, times: 1 });
  assert.deepEqual(inv.props['Badge.colour'], { right: 'tone', times: 1 });
  // With no "did you mean", the first allowed value is the one to write.
  assert.equal(inv.values['Badge.tone.danger'].right, 'info');
  // A finding about something else is not an invention.
  assert.equal(Object.keys(inv.components).length, 2);
});

test('inventions add up across runs, and feed the catalog so the next agent reads them beside the real values', () => {
  const dir = mkdtempSync(join(tmpdir(), 'invented-'));
  assert.deepEqual(readInvented(dir), { components: {}, props: {}, values: {} });

  noteInvented(dir, findings);
  noteInvented(dir, findings);
  assert.ok(existsSync(join(dir, INVENTED_FILE)));
  assert.equal(readInvented(dir).components.Pill.times, 2, 'the same invention twice is the same name, counted');

  // Into the catalog: an invented value is rejected by name, beside what words alone would reject.
  const built = [{ name: 'Badge', contract: { props: [{ name: 'tone', type: 'enum', options: ['info', 'warn'] }] } }];
  const plain = buildCatalog(built);
  const withInv = buildCatalog(built, { invented: readInvented(dir) });
  assert.equal(plain.components.Badge.props.tone.rejected?.danger, undefined, 'words alone do not know this project');
  assert.equal(withInv.components.Badge.props.tone.rejected.danger, 'info');

  // Only what can be corrected: a table entry with no right answer would send an agent nowhere.
  assert.deepEqual(rejectedFrom({ values: { 'Badge.tone.odd': { right: null } } }, 'Badge', 'tone'), {});
  // An unwritable folder is never an error: the check still reported.
  assert.doesNotThrow(() => noteInvented('/nowhere-at-all/x', findings));
});
