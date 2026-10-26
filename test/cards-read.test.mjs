import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { noteCardsRead, cardsRead, CARDS_FILE, WINDOW_MS } from '../cards-read.mjs';

test('cards read: noted with when, read back within the window, forgotten after it', () => {
  const dir = mkdtempSync(join(tmpdir(), 'cards-'));
  assert.deepEqual([...cardsRead(dir)], [], 'nothing noted yet');

  const now = Date.UTC(2026, 9, 26, 9, 0, 0);
  noteCardsRead(dir, ['Chip', 'Button', '', '  '], now);
  assert.ok(existsSync(join(dir, CARDS_FILE)));
  assert.deepEqual([...cardsRead(dir, { now })].sort(), ['Button', 'Chip'], 'blank names are not cards');

  // Still there a moment later, gone once the window has passed.
  assert.equal(cardsRead(dir, { now: now + WINDOW_MS - 1000 }).size, 2);
  assert.equal(cardsRead(dir, { now: now + WINDOW_MS + 1000 }).size, 0);

  // A second reading adds to the first, and what fell out of the window is dropped from the file itself.
  noteCardsRead(dir, ['Badge'], now + WINDOW_MS + 1000);
  assert.deepEqual([...cardsRead(dir, { now: now + WINDOW_MS + 1000 })], ['Badge'], 'the old ones are gone, not just hidden');
  assert.deepEqual(Object.keys(JSON.parse(readFileSync(join(dir, CARDS_FILE), 'utf8'))), ['Badge']);

  // Nothing to note changes nothing, and a folder that cannot be written is not an error.
  assert.deepEqual(noteCardsRead(dir, []), {});
  assert.doesNotThrow(() => noteCardsRead('/nowhere-at-all/x', ['Chip']));
});
