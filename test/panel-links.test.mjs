// Every side panel and every filter has its own address in the style guide (templates/styleguide.template.html).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const tpl = readFileSync(fileURLToPath(new URL('../templates/styleguide.template.html', import.meta.url)), 'utf8');

test('the address is written in place, a filter at All and a closed panel leaving nothing', () => {
  const src = /function setHashQuery\(o\) \{[\s\S]*?\n  \}/.exec(tpl)[0];
  let replaced = null;
  const win = { location: { hash: '#documentation?show=toReview', search: '' }, history: { replaceState: (_, __, h) => { replaced = h; win.location.hash = h.replace(/^[^#]*/, ''); } } };
  const set = new Function('location', 'history', 'ALL', `${src}; return setHashQuery;`)(win.location, win.history, false);
  set({ panel: 'doc:specs/a.dsds.json' });
  assert.equal(win.location.hash, '#documentation?show=toReview&panel=doc:specs/a.dsds.json', 'readable, its slashes and colons kept');
  set({ show: 'all' });
  assert.equal(win.location.hash, '#documentation?panel=doc:specs/a.dsds.json');
  set({ panel: null });
  assert.equal(win.location.hash, '#documentation');
  assert.ok(replaced, 'no new history entry: replaceState');
});

test('each panel names itself in the address while it is open, and a link opens it and its filter', () => {
  assert.match(tpl, /if \(m\._key\) setHashQuery\(\{ panel: m\._key \}\);/, 'opened: its key written');
  assert.match(tpl, /m\._shut = function \(\) \{ if \(m\._key && [^}]*setHashQuery\(\{ panel: null \}\);/, 'closed: removed');
  assert.match(tpl, /m\._key = ilKey\(p, i\);/, 'a Documentation page by its file');
  assert.match(tpl, /var ilKey = function \(p, i\) \{ return 'doc:' \+ \(p\.tokens \? 'tokens' : p\.absent \? 'system' : p\.file/, 'the Tokens and system rows by name');
  assert.match(tpl, /m\._key = rowKey\(d\);/, 'a row by its area and its own key');
  assert.match(tpl, /var sc = m\.querySelector\('\.sg-row-detail'\); if \(sc\) sc\.scrollTop = 0;/, 'every panel opens at its top');
  assert.match(tpl, /if \(e\.isTrusted\) setHashQuery\(\{ show: k \}\);/, 'a page bar chip');
  assert.match(tpl, /setHashQuery\(\{ st: b\.dataset\.st \}\)/, 'an area chip');
  assert.match(tpl, /qWant\('show'\)\) whenThere/);
  assert.match(tpl, /\/\^doc:\/\.test\(panelWant\) \? \(target\._openKey && target\._openKey\(panelWant\)\) : \/\^row:\/\.test\(panelWant\) \? openRowKey\(panelWant\)/);
});
