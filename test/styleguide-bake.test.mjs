// The style guide's accessibility, tried while the page is built and kept in it (styleguide-bake.mjs): the results go
// in once, replace an earlier build's, and never close the page's own script early.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { withBaked, withoutBaked, BAKED_ID } from '../styleguide-bake.mjs';

test('the results are kept in the page right after its data, before its script reads them; an earlier build\'s replaced', () => {
  const page = '<html><body><main></main><script type="application/json" id="sg-data">{}</script><script>var x = 1;</script></body></html>';
  const one = withBaked(page, { at: 't1', results: { chip: { sig: 'a', live: { tried: 4 }, items: [] } } });
  assert.match(one, new RegExp(`id="sg-data">\\{\\}</script><script id="${BAKED_ID}" type="application/json">\\{"at":"t1".*</script><script>var x = 1;</script></body></html>$`));
  // A page with no data of its own: before its first script.
  assert.match(withBaked('<body><script>go()</script></body>', { at: 't', results: {} }), new RegExp(`^<body><script id="${BAKED_ID}"[^>]*>.*</script><script>go\\(\\)</script></body>$`));
  const two = withBaked(one, { at: 't2', results: {} });
  assert.equal(two.split(BAKED_ID).length, 2, 'one set of results, never two');
  assert.match(two, /"at":"t2"/);
  assert.equal(withoutBaked(two), page, 'taken out, the page is as it was built');
});

test('what a component holds never closes the script it is kept in', () => {
  const out = withBaked('<body></body>', { at: 't', results: { x: { items: [{ html: '</script><img src=x onerror=alert(1)>' }] } } });
  assert.equal(out.match(/<\/script>/g).length, 1);
  assert.equal(JSON.parse(out.match(/<script[^>]*>([\s\S]*?)<\/script>/)[1]).results.x.items[0].html, '</script><img src=x onerror=alert(1)>');
});
