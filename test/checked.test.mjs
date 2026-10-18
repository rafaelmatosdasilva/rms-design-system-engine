// What a person checked by hand: recorded with the component as it was, current until the component changes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { componentSignature, recordCheck, removeCheck, readChecked, checksFor } from '../checked.mjs';

test('a check stays current until the component changes, and only that component', () => {
  const dir = mkdtempSync(join(tmpdir(), 'checked-'));
  mkdirSync(join(dir, 'src'));
  const css = '.badge { color: red; }\n.chip { padding: 4px; }\n';
  writeFileSync(join(dir, 'src', 'theme.css'), css);
  const cfg = { paths: { themeCSS: 'src/theme.css' } };
  const before = componentSignature(dir, cfg, 'badge', '.badge');
  recordCheck(dir, { component: 'badge', sc: '1.3.3', by: 'QA', at: '2026-10-11T10:00:00.000Z', signature: before });
  recordCheck(dir, { component: 'badge', sc: '1.3.3', by: 'Design', at: '2026-10-12T10:00:00.000Z', signature: before });   // one per criterion: the last
  recordCheck(dir, { component: 'badge', sc: '1.4.5', by: 'QA', at: '2026-10-11T10:00:00.000Z', signature: before });
  assert.deepEqual(readChecked(dir).map((c) => [c.sc, c.by]), [['1.3.3', 'Design'], ['1.4.5', 'QA']]);
  assert.deepEqual(checksFor(readChecked(dir), 'badge', before)['1.3.3'], { by: 'Design', at: '2026-10-12T10:00:00.000Z', current: true });
  // Another component's rule changing leaves the badge as it was; its own rule changing does not.
  writeFileSync(join(dir, 'src', 'theme.css'), css.replace('4px', '6px'));
  assert.equal(componentSignature(dir, cfg, 'badge', '.badge'), before);
  writeFileSync(join(dir, 'src', 'theme.css'), css.replace('red', 'darkred'));
  const after = componentSignature(dir, cfg, 'badge', '.badge');
  assert.notEqual(after, before);
  assert.equal(checksFor(readChecked(dir), 'badge', after)['1.3.3'].current, false);
  // Taken back: gone from the record.
  assert.equal(removeCheck(dir, 'badge', '1.3.3'), true);
  assert.equal(removeCheck(dir, 'badge', '1.3.3'), false);
  assert.deepEqual(JSON.parse(readFileSync(join(dir, 'design-system-engine-checked.json'), 'utf8')).checks.map((c) => c.sc), ['1.4.5']);
});
