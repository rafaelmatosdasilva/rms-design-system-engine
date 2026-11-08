// The features page lists what to ask in Claude Code: a What to ask table under each part, and Set up. Each request on
// it is one the engine routes to its own command, no other page lists requests, and every link into it lands on a
// heading.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { route } from '../lib/route.mjs';

const ENGINE = dirname(dirname(fileURLToPath(import.meta.url)));
const read = (f) => readFileSync(join(ENGINE, f), 'utf8');
const PAGE = read('docs/features.md');
// The other pages people read: the README and the technical documentation.
const OTHERS = ['README.md', ...readdirSync(join(ENGINE, 'docs')).filter((f) => f.endsWith('.md') && f !== 'features.md').map((f) => `docs/${f}`)];

test('each request on the features page reaches a command of its own, never the catch-all in its place', () => {
  const P = { hasConfig: true, components: ['badge', 'button', 'chip', 'field', 'modal', 'panel'] };
  const asks = [...PAGE.matchAll(/^\| `\/rms-design-system-engine ([^`]+)` \|/gm)].map((m) => m[1].replace('<link>', 'https://www.notion.so/acme/guidelines'));
  assert.ok(asks.length > 20, 'the page lists its requests');
  // The whole check is what these ask for; every other request has a route of its own.
  const whole = new Set(['check everything', 'what is left to build?']);
  const bad = asks.filter((a) => { const r = route(a, P); return !whole.has(a) && r.recipe === 'full-audit' && r.run.join() === 'rms-design-system-engine'; });
  assert.deepEqual(bad, []);
});

test('the other pages link to the features page instead of listing requests', () => {
  const bad = [];
  // The README's one example request is its Get started line; the technical documentation names none.
  for (const f of OTHERS.filter((x) => x !== 'README.md')) for (const m of read(f).matchAll(/`\/rms-design-system-engine [a-z][^`]*`/g)) bad.push(`${f}: ${m[0]}`);
  if (!read('README.md').includes('docs/features.md')) bad.push('README.md: no link to the features page');
  if (!read('docs/README.md').includes('](features.md')) bad.push('docs/README.md: no link to the features page');
  assert.deepEqual(bad, []);
});

test('every link into the features page lands on one of its headings', () => {
  const slug = (h) => h.trim().toLowerCase().replace(/[^\w\s-]/g, '').replace(/\s/g, '-');
  const anchors = new Set([...PAGE.matchAll(/^#+ (.+)$/gm)].map((m) => slug(m[1])));
  const bad = [];
  for (const f of OTHERS) for (const m of read(f).matchAll(/(?:\]\(|docs\/)features\.md#([^)\s"]+)/g)) if (!anchors.has(m[1])) bad.push(`${f}: #${m[1]}`);
  assert.deepEqual(bad, []);
});
