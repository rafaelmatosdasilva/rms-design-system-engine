// A page's example is what an agent copies: one written for an older version of the component is built again as it was.
// So each call of the component in a page's code blocks is held to what the component takes today.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { factsFrom, checkPage, examplesOf } from '../lib/intent-truth.mjs';

const facts = () => factsFrom({ components: { cardTile: { file: 'src/CardTile.vue', props: {
  size: { type: 'variant', options: ['s', 'm', 'l'], from: 'the code' }, title: { type: 'string' }, elevated: { type: 'boolean' } } } } });
const page = (code) => ({ name: 'cardTile', sections: [{ title: 'Usage', text: 'Put one on a list.\n\n```vue\n' + code + '\n```\n' }] });

test('an example that sets a prop the component no longer has, or a value it no longer takes, is out of date', () => {
  const f = examplesOf(page('<CardTile size="xl" title="Hello" tone="brand" @click="open" :key="id" class="wide" />'), facts(), 'cardTile');
  assert.deepEqual(f.map((x) => [x.kind, x.where, x.says]), [
    ['stale', 'Usage, an example', '`size` = `xl` on cardTile'],
    ['stale', 'Usage, an example', '`tone` on cardTile'],
  ]);
  assert.match(f[0].truth, /`size` takes `s`, `m`, `l`/);
  assert.match(f[1].truth, /cardTile has no prop `tone`, so the example no longer builds as written/);
  assert.equal(f[0].line, '<CardTile size="xl" title="Hello" tone="brand" @click="open" :key="id" class="wide" />');
});

test('what is not the example\'s own literal is left alone, and a page with nothing wrong has nothing to say', () => {
  // An expression is the product's value, a kebab-case tag and a camelCase prop are the same component and prop.
  assert.deepEqual(examplesOf(page('<card-tile :size="big ? \'l\' : \'s\'" v-bind="rest" elevated title="Hi" />'), facts(), 'cardTile'), []);
  assert.deepEqual(examplesOf(page('<CardTile size="m" />\n<OtherThing tone="x" />'), facts(), 'cardTile'), []);
  // The whole review says it with the page's other findings.
  assert.ok(checkPage(page('<CardTile tone="brand" />'), facts(), { component: 'cardTile' }).some((x) => x.kind === 'stale' && /`tone`/.test(x.says)));
  // A component the engine knows no props of is not held to any.
  assert.deepEqual(examplesOf(page('<CardTile tone="brand" />'), factsFrom({ components: { cardTile: { props: {} } } }), 'cardTile'), []);
});
