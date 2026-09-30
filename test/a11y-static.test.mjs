// I34: accessibility checks that need no browser. What they find, and the look-alikes they leave alone.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { markupFindings, cssFindings, styleOnly, staticA11y } from '../a11y-static.mjs';
import { makeFixture } from './helpers.mjs';

const kinds = (xs) => xs.map((x) => [x.line, x.kind]);

test('a control with no accessible name', () => {
  assert.deepEqual(kinds(markupFindings('<button class="x"><svg viewBox="0 0 1 1"/></button>')), [[1, 'name']]);
  assert.deepEqual(kinds(markupFindings('<button aria-label="Close"><svg/></button>')), []);
  assert.deepEqual(kinds(markupFindings('<button type="button"><span aria-hidden="true"></span><span>Save</span></button>')), []);
  assert.deepEqual(kinds(markupFindings('<button onClick={f}>{label}</button>')), []);           // text from a prop
  assert.deepEqual(kinds(markupFindings('<button {...props}><Icon /></button>')), []);           // attributes from outside
  assert.deepEqual(kinds(markupFindings('<button><slot></slot></button>')), []);
  assert.deepEqual(kinds(markupFindings('<button id="go"><span id="frame-name"></span></button>')), []);   // filled by a script
  assert.deepEqual(kinds(markupFindings('<img src="a.png">\n<img src="b.png" alt="">')), [[1, 'name']]);
  assert.deepEqual(kinds(markupFindings('<input type="text">\n<label>Name <input type="text"></label>\n<input id="q"><input type="hidden">')), [[1, 'name']]);
});

test('keyboard and aria mistakes', () => {
  assert.deepEqual(kinds(markupFindings('<a tabindex="3" href="#">x</a>\n<div tabIndex={0}>ok</div>')), [[1, 'keyboard']]);
  assert.deepEqual(kinds(markupFindings('<div onClick={go}>Open</div>\n<div role="button" tabIndex={0} onClick={go}>Open</div>')), [[1, 'keyboard']]);
  assert.deepEqual(kinds(markupFindings('<div @click="go">x</div>')), [[1, 'keyboard']]);
  assert.deepEqual(kinds(markupFindings('<span aria-lable="x" aria-label="y" aria-pressed="false"></span>')), [[1, 'aria']]);
});

test('a removed focus outline must be put back somewhere', () => {
  assert.deepEqual(kinds(cssFindings('.btn { outline: none; }')), [[1, 'focus']]);
  assert.deepEqual(kinds(cssFindings('.btn { outline: none; }\n.btn:focus-visible { box-shadow: 0 0 0 2px blue; }')), []);
  assert.deepEqual(kinds(cssFindings('.btn:focus { outline: 0; box-shadow: 0 0 0 2px blue; }')), []);   // replaced in the same rule
  assert.deepEqual(kinds(cssFindings('.field__input { outline: 0; }\n.field:focus-within { border-color: blue; }')), []);   // shown on the field
  assert.deepEqual(kinds(cssFindings('/* .x { outline: none } */\n.y { outline-offset: 2px; }')), []);
  assert.deepEqual(kinds(cssFindings('.b:hover { outline: none; }\n.b:disabled:hover { outline: none; }')), []);   // not focus
  assert.deepEqual(kinds(cssFindings('.searchInput { outline: 0; }\n.searchBox:not(.ro):focus-within { border-color: blue; }')), []);
  assert.deepEqual(kinds(cssFindings('.menu { outline: 0; }\n.card:focus-within { border-color: blue; }')), [[1, 'focus']]);   // an unrelated wrapper
  assert.deepEqual(kinds(cssFindings('.a { outline: none; }', '.a { outline: none; }\n.a:focus-visible { outline: 2px solid; }')), []);   // put back in another file
  assert.deepEqual(kinds(cssFindings('@media (min-width: 1px) {\n  .b { outline: none; }\n}')), [[2, 'focus']]);
});

test('a component file keeps its own line numbers', () => {
  const vue = '<template>\n<div/>\n</template>\n<style>\n.c { outline: none; }\n</style>\n';
  assert.deepEqual(kinds(cssFindings(styleOnly(vue))), [[5, 'focus']]);
});

test('the whole project: files found on their own, build output and dependencies skipped', () => {
  const dir = makeFixture({
    'src/Icon.jsx': 'export const X = () => <button><svg/></button>;',
    'src/theme.css': '.btn { outline: none; }',
    'node_modules/pkg/a.html': '<img src="x">',
    'dist/app.html': '<img src="x">',
  });
  const r = staticA11y(dir);
  assert.deepEqual(r.findings.map((f) => [f.file, f.kind]).sort(), [['src/Icon.jsx', 'name'], ['src/theme.css', 'focus']]);
});
