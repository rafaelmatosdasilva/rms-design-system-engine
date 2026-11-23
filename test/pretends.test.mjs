import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pretendsOf, pretendsFindings } from '../lib/pretends.mjs';
import { checkRecord } from '../lib/prototype-record.mjs';
import { fixtureProject, budget } from './helpers.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const page = (...children) => ({ component: 'Page', children });
const text = (t) => ({ component: 'Text', props: { text: t } });

test('a part that leads to a success with nothing sent is said, a part that leads elsewhere is not', () => {
  const ui = page(
    { component: 'Button', id: 'send', props: { label: 'Send', goesTo: '#saved' } },
    { component: 'Button', id: 'next', props: { label: 'Next', goesTo: 'details' } },
    { component: 'Button', id: 'done', props: { label: 'Finish', goesTo: 'order-confirmed' } },
  );
  const p = pretendsOf(ui, { states: [{ name: 'saved' }], pages: ['details', 'order-confirmed'] });
  assert.deepEqual(p.map((x) => [x.kind, x.text]), [['success', 'Send'], ['success', 'Finish']]);
  assert.match(p[0].message, /"Send" shows the saved state with nothing sent: the prototype only pretends it worked/);
  assert.match(p[1].message, /the order-confirmed page/);
});

test('a figure, a quote or a logo the request never gave is said, and one it gave is not', () => {
  const ui = page(
    text('Trusted by 12,400 teams'), text('Save 30% this month'), text('From $49/mo'), text('Step 2 of 3'), text('Since 2019'),
    text('“It cut our review time in half, honestly the best tool we bought”'),
    { component: 'Missing', id: 'brand', props: { need: 'a customer logo strip', kind: 'component' } },
  );
  const none = pretendsOf(ui, {});
  assert.deepEqual(none.map((x) => [x.kind, x.text]), [['figure', '12,400'], ['figure', '30%'], ['figure', '$49'], ['quote', 'It cut our review time in half, honestly the best tool we bo'], ['logo', 'a customer logo strip']]);
  assert.match(none[0].message, /nothing says where it came from/);
  const asked = pretendsOf(ui, { request: 'A pricing page: plans from $49 a month, 30% off this month, used by 12,400 teams, with our customer logos' });
  assert.deepEqual(asked.map((x) => x.kind), ['quote']);
  assert.match(asked[0].message, /the request never gave it/);
  const f = pretendsFindings(asked);
  assert.equal(f[0].level, 'warning');
  assert.equal(f[0].kind, 'pretends');
  // Kept with the check, so whoever opens the prototype later knows which parts are not real.
  assert.deepEqual(checkRecord({ name: 'x', file: 'x.json', pretends: asked }).pretends.map((x) => x.kind), ['quote']);
  assert.ok(!('pretends' in checkRecord({ name: 'x', file: 'x.json' })));
});

test('--prototype says what the page pretends, as warnings that never stop the drawing', () => {
  const dir = fixtureProject(join(HERE, 'fixtures', 'demo-ds'), 'pretends-');
  mkdirSync(join(dir, 'prototypes'), { recursive: true });
  writeFileSync(join(dir, 'prototypes', 'pricing.json'), JSON.stringify({ prototype: page(text('Trusted by 12,400 teams')) }));
  const r = spawnSync(process.execPath, [join(HERE, '..', 'audit.mjs'), '--prototype', 'prototypes/pricing.json', '--no-browser'], { cwd: dir, encoding: 'utf8', env: { ...process.env, NO_COLOR: '1' }, timeout: budget(180000) });
  assert.match(r.stdout, /"12,400" \(in Text\) is a figure nothing says where it came from/);
  const rec = JSON.parse(readFileSync(join(dir, 'prototypes', 'pricing.check.json'), 'utf8'));
  assert.deepEqual(rec.pretends.map((x) => x.text), ['12,400']);
});
