// The two lists of a project's classes read against each other (class-debt.mjs): a class the markup puts on that no
// stylesheet styles, and a class a stylesheet defines that no markup ever uses.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classLists, markupClasses, definedClasses, builtPrefixes } from '../lib/class-debt.mjs';
import { codeRules } from '../lib/construction-page.mjs';

test('each side says what the other does not have', () => {
  const markup = [{ file: 'Card.vue', text: '<template><div class="acme-card"><p class="acme-card__body">x</p><i class="legacy-hook"></i></div></template>' }];
  const styles = [{ file: 'card.css', text: '.acme-card { color: red; }\n.acme-card__body { color: blue; }\n.nothing-uses-me { color: green; }' }];
  const d = classLists(markup, styles);
  assert.deepEqual(d.unstyled.map((x) => x.cls), ['legacy-hook']);
  assert.deepEqual(d.unused.map((x) => [x.cls, x.line]), [['nothing-uses-me', 3]]);
  assert.deepEqual(d.read, { markup: 1, styles: 1 });
});

test('a bound class is its quoted names, never the props that decide them', () => {
  // :class="{ 'error': errorState }" puts on `error`; errorState is the prop, and counting it would call it unstyled.
  const cls = markupClasses(`<div class="acme-note" :class="{ 'error': errorState, 'is-open': open }"></div>`);
  assert.deepEqual([...cls].sort(), ['acme-note', 'error', 'is-open']);
  assert.ok(!cls.has('errorState'));
  assert.deepEqual([...markupClasses('<div className={clsx("acme-tile", busy && "is-busy")}></div>')].sort(), ['acme-tile', 'is-busy']);
  // An id is no class: an SVG's clipPath id would otherwise read as a class nothing styles.
  assert.deepEqual([...markupClasses('<svg><clipPath id="clip0_1_2"/></svg>')], []);
});

test('what is not a class is never read as one', () => {
  // A comment naming a file or a URL, an attribute selector and a url() all hold dots.
  const css = `/* see parts/SideNote.vue */\n// the drawer's height\n.acme-row { background: url(http://www.w3.org/x.svg); }\na[href$=".pdf"] { color: red; }`;
  assert.deepEqual([...definedClasses(css, 'x.css').keys()], ['acme-row']);
});

test('a Sass line comment holding an apostrophe does not swallow the file', () => {
  // Without the line comments blanked, the apostrophe opens a string and every rule below it is lost.
  const css = `.acme-head { color: red; }\n// synced with the drawer's height\n.acme-foot { color: blue; }\n.acme-side { color: green; }`;
  assert.deepEqual([...definedClasses(css, 'x.scss').keys()], ['acme-head', 'acme-foot', 'acme-side']);
});

test('a class the code builds, and a framework\'s own, are never called unused', () => {
  assert.deepEqual([...builtPrefixes('const c = `acme-card--${kind}`;')], ['acme-card--']);
  const d = classLists(
    [{ file: 'a.vue', text: '<div :class="`acme-card--${kind}`"><span class="acme-card"></span></div>' }],
    [{ file: 'a.css', text: '.acme-card--wide { color: red; }\n.acme-card { color: blue; }\n.fade-enter-active { opacity: 0; }\n.router-link-active { color: red; }\n.state- { color: red; }' }],
  );
  assert.deepEqual(d.unused.map((x) => x.cls), []);
  assert.deepEqual(d.unstyled.map((x) => x.cls), []);
});

test('each one is a place to change on the Rules page, owned by engineering', () => {
  const rules = codeRules({ classes: { unstyled: [{ cls: 'legacy-hook', file: 'Card.vue', line: null }], unused: [{ cls: 'dead', file: 'card.css', line: 3 }] } });
  const styled = rules.find((r) => r.id === 'code-class-styled'), used = rules.find((r) => r.id === 'code-class-used');
  assert.equal(styled.status, 'fix');
  assert.equal(styled.side, 'code');
  assert.equal(styled.who, 'code');
  assert.deepEqual(styled.toFix.map((t) => [t.where, t.value]), [['Card.vue', '.legacy-hook']]);
  assert.deepEqual(used.toFix.map((t) => [t.where, t.value]), [['card.css:3', '.dead']]);
  // Nothing to change is a rule, not a finding.
  assert.equal(codeRules({ classes: { unstyled: [], unused: [] } }).find((r) => r.id === 'code-class-styled').status, 'rule');
  // No reading, no rule.
  assert.ok(!codeRules({}).some((r) => r.id === 'code-class-styled'));
});
