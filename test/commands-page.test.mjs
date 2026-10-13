// docs/commands.md lists what to ask in Claude Code, grouped by type: each request on it is one the engine routes to
// its own command, the other pages link to it rather than list requests, and every link into it lands on a heading.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { route } from '../route.mjs';

const ENGINE = dirname(dirname(fileURLToPath(import.meta.url)));
const read = (f) => readFileSync(join(ENGINE, f), 'utf8');
const PAGE = read('docs/commands.md');

test('each request on the commands page reaches a command of its own, never the catch-all in its place', () => {
  const P = { hasConfig: true, components: ['badge', 'button', 'chip', 'field', 'modal', 'panel'] };
  const asks = [...PAGE.matchAll(/^\| `\/rms-design-system-engine ([^`]+)` \|/gm)].map((m) => m[1].replace('<link>', 'https://www.notion.so/acme/guidelines'));
  assert.ok(asks.length > 20, 'the page lists its requests');
  // The whole check is what these ask for; every other request has a route of its own.
  const whole = new Set(['check everything', 'what is left to build?']);
  const bad = asks.filter((a) => { const r = route(a, P); return !whole.has(a) && r.recipe === 'full-audit' && r.run.join() === 'rms-design-system-engine'; });
  assert.deepEqual(bad, []);
});

test('the other pages link to the commands page instead of listing requests', () => {
  const bad = [];
  for (const f of ['docs/features.md', 'docs/details.md']) {
    const text = read(f);
    for (const m of text.matchAll(/`\/rms-design-system-engine [a-z][^`]*`/g)) bad.push(`${f}: ${m[0]}`);
    if (!text.includes('](commands.md')) bad.push(`${f}: no link to the commands page`);
  }
  if (!read('README.md').includes('docs/commands.md')) bad.push('README.md: no link to the commands page');
  assert.deepEqual(bad, []);
});

test('every link into the commands page lands on one of its headings', () => {
  const slug = (h) => h.trim().toLowerCase().replace(/[^\w\s-]/g, '').replace(/\s/g, '-');
  const anchors = new Set([...PAGE.matchAll(/^#+ (.+)$/gm)].map((m) => slug(m[1])));
  const bad = [];
  for (const f of ['docs/features.md', 'docs/details.md']) for (const m of read(f).matchAll(/\]\(commands\.md#([^)]+)\)/g)) if (!anchors.has(m[1])) bad.push(`${f}: #${m[1]}`);
  assert.deepEqual(bad, []);
});
