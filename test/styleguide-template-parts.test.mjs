// The style guide's template in parts: its file is the page's frame, its styles and its script are files of their own
// under templates/styleguide/, joined where each @part line stands. Every line names a part that is there, every part is
// joined once, and a project's own template (one file, or parts of its own) is read the same way.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ENGINE_TEMPLATE, PART, joinTemplate, readTemplate, templateText } from '../styleguide-template.mjs';
import { tempDir } from './helpers.mjs';

const ENGINE = dirname(dirname(fileURLToPath(import.meta.url)));

test('every part the frame names is there, and every part is joined once, styles in its style block and script in its script', () => {
  const frame = readFileSync(ENGINE_TEMPLATE, 'utf8');
  const named = [...frame.matchAll(PART)].map((m) => m[1] ?? m[2]);
  const parts = ['css', 'js'].flatMap((k) => readdirSync(join(ENGINE, 'templates', 'styleguide', k)).map((f) => `styleguide/${k}/${f}`));
  assert.deepEqual([...named].sort(), [...parts].sort(), 'no part left out, none named twice, none missing');
  assert.equal(new Set(named).size, named.length);
  assert.ok(named.every((p) => (p.startsWith('styleguide/css/') ? /\/\*@part /.test(frame.split(p)[0].split('\n').pop()) : /\/\/@part /.test(frame.split(p)[0].split('\n').pop()))), 'a style part as a style comment, a script part as a script comment');
  const whole = templateText();
  assert.doesNotMatch(whole, /@part styleguide\//, 'nothing left unjoined');
  assert.ok(frame.split('\n').length < 200, 'the frame stays a frame');
  assert.ok(whole.length > frame.length * 20);
  // The parts are in the order the page runs them: its styles before its script.
  assert.ok(named.findIndex((p) => p.startsWith('styleguide/js/')) > named.filter((p) => p.startsWith('styleguide/css/')).length - 1);
});

test('a template of one file is read as it is; parts of a project\'s own are joined; a part outside its folder, or not there, is left as written', () => {
  const dir = tempDir('tpl-parts-');
  writeFileSync(join(dir, 'one.html'), '<style>\na{}\n</style>\n');
  assert.equal(readTemplate(join(dir, 'one.html')), '<style>\na{}\n</style>\n');
  mkdirSync(join(dir, 'parts'), { recursive: true });
  writeFileSync(join(dir, 'parts', 'a.css'), 'a { color: red; }\n');
  writeFileSync(join(dir, 'parts', 'b.js'), 'var x = 1;\n');
  writeFileSync(join(dir, 'own.html'), '<style>\n/*@part parts/a.css*/\n</style>\n<script>\n  //@part parts/b.js\n</script>\n');
  assert.equal(readTemplate(join(dir, 'own.html')), '<style>\na { color: red; }\n</style>\n<script>\nvar x = 1;\n</script>\n');
  assert.equal(joinTemplate('/*@part ../secret.css*/\n', join(dir, 'parts')), '/*@part ../secret.css*/\n', 'never a file outside the template\'s folder');
  assert.equal(joinTemplate('//@part parts/none.js\n', dir), '//@part parts/none.js\n', 'a part not there stays, so the page says what is missing');
});
