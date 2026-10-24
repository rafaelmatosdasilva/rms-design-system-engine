// One request drawn in separate sessions gives the same page: the same components, spacing tokens and text styles,
// and what differs between the sessions is said. An invented app (Tidepool's settings) drawn three times.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { drawnWith, consistency, consistencyLines } from './skill-evals/proto-tasks.mjs';

const page = (heading, gap) => JSON.stringify({ prototype: { component: 'Stack', padding: 'padding/m', gap, children: [
  { component: 'Text', as: 'h1', style: heading, text: 'Settings' }, { component: 'Button', label: 'Save' }] } });
const row = (task, text) => ({ task, changed: ['prototypes/settings-2.json'], files: { 'prototypes/settings-2.json': text } });

test('a drawn page is read as its components, spacing tokens and text styles', () => {
  const d = drawnWith({ changed: ['p.json'], read: () => page('m', 'padding/s') });
  assert.deepEqual(d, { components: ['button', 'stack', 'text'], spacing: ['padding/m', 'padding/s'], text: ['m'] });
});

test('three sessions that drew the same page are the same; one that differs is said, with how many drew what', () => {
  const same = consistency([row('settings', page('m', 'padding/s')), row('settings', page('m', 'padding/s')), row('settings', page('m', 'padding/s'))]);
  assert.deepEqual(same.map((c) => [c.task, c.runs, c.same]), [['settings', 3, true]]);
  const lines = consistencyLines([row('settings', page('m', 'padding/s')), row('settings', page('m', 'padding/s')), row('settings', page('s', 'padding/xs'))]);
  assert.match(lines[0], /settings \(3 sessions\): spacing tokens differ \(padding\/s in 2 of 3, padding\/xs in 1 of 3\); text styles differ \(m in 2 of 3, s in 1 of 3\)/);
  assert.deepEqual(consistency([row('one', page('m', 'padding/s'))]), [], 'one session has nothing to compare');
});
