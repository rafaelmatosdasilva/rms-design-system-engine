// Documentation has four sources and no other (docSrcNames, 22-one-table-for-every-issue.js): Figma, the code, the
// contract, the intent layer. The team's own pages are its intent layer, a picture is Figma's, and the code counts only
// where it says something itself.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const src = readFileSync(join(dirname(dirname(fileURLToPath(import.meta.url))), 'templates', 'styleguide', 'js', '22-one-table-for-every-issue.js'), 'utf8');
const fn = (name) => { const i = src.indexOf(`  function ${name}(`); return src.slice(i, src.indexOf('\n  }\n', i) + 4); };
const docSrcNames = new Function(fn('srcNames') + src.slice(src.indexOf('  var DOC_SOURCES'), src.indexOf('\n', src.indexOf('  var DOC_SOURCES'))) + fn('docSrcNames') + 'return docSrcNames;')();

test('four sources, no other: the team\'s pages are its intent layer, a picture is Figma\'s', () => {
  assert.deepEqual(docSrcNames(['docs/guidelines.md', 'A Notion page', 'Its contract (contracts/chip.contract.json)', 'Figma\'s description']), ['Intent layer', 'Contract', 'Figma']);
  assert.deepEqual(docSrcNames(['The references\' pictures']), ['Figma']);
  assert.deepEqual(docSrcNames(['Something else entirely']), [], 'what is none of the four is no source of documentation');
});

test('the code is a source where it says something itself, never a file path a line cites', () => {
  assert.deepEqual(docSrcNames(['packages/ui/src/theme.css', 'ui-shared.js']), [], 'a file a line merely names documents nothing');
  assert.deepEqual(docSrcNames(['The comment above it in Chip.vue']), ['Code']);
  assert.deepEqual(docSrcNames(['Its code (Chip.vue)']), ['Code'], 'its element, read from its own code');
});
