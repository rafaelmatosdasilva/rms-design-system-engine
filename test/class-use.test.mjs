// class-use.mjs: which classes a page's code really puts on elements (Gate [10] and the style guide's Used in).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { usedClasses } from '../class-use.mjs';

test('a class on an element, in a markup string or from script is a use; a CSS rule or a comment is not', () => {
  const page = `<style>.panel { padding: 4px; }</style><!-- the panel, drawn by hand -->
<div class="left-panel card" id="side"></div>
<script>
  // a highlight is pinned here
  const row = '<div class="listItem listItem--on">' + name + '</div>';
  el.className = 'toast ' + kind; el.classList.add('is-open', "loader"); el.setAttribute('class', 'badge');
  const t = \`<span class="chip \${size}">\`;
</script>`;
  const u = usedClasses(page);
  for (const k of ['left-panel', 'card', 'side', 'listItem', 'listItem--on', 'toast', 'is-open', 'loader', 'badge', 'chip']) assert.ok(u.has(k), k);
  for (const k of ['panel', 'highlight', 'pinned']) assert.ok(!u.has(k), k + ' is not used');
});
