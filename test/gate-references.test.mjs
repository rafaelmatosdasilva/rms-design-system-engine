// The guides name gates by the numbers the report prints (1 to 25); a number from an older numbering (Gate [10g],
// Gate [3f]) sends an agent to the wrong gate. Every "Gate [N]" is one of the report's, and a name written beside it
// is that gate's.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ENGINE = dirname(dirname(fileURLToPath(import.meta.url)));
const names = [...readFileSync(join(ENGINE, 'audit.mjs'), 'utf8').matchAll(/addGate\('([^']+?)  \(/g)].map((m) => m[1]);

test('the audit numbers 25 gates, the names the guides use', () => assert.equal(names.length, 25));

test('every "Gate [N]" in the guides is one of the report\'s gates, and a name beside it is that gate\'s', () => {
  const files = ['rms-design-system-engine.md', 'README.md', ...readdirSync(join(ENGINE, 'reference')).map((f) => `reference/${f}`), ...readdirSync(join(ENGINE, 'cookbook')).map((f) => `cookbook/${f}`), ...readdirSync(join(ENGINE, 'docs')).map((f) => `docs/${f}`)].filter((f) => f.endsWith('.md'));
  const bad = [];
  for (const f of files) {
    const text = readFileSync(join(ENGINE, f), 'utf8');
    for (const m of text.matchAll(/Gates? ((?:\[\d+[a-z]?\][/, ]*)+)(?: \(([^)]+)\))?/g)) {
      const nums = [...m[1].matchAll(/\[(\d+)([a-z]?)\]/g)];
      for (const [, n, letter] of nums) if (letter || Number(n) < 1 || Number(n) > 25) bad.push(`${f}: ${m[0]}`);
      if (m[2] && nums.length === 1 && !m[2].split(' / ').every((x) => names.some((g) => g.toLowerCase().startsWith(x.trim().toLowerCase().slice(0, 12))))) bad.push(`${f}: ${m[0]} (name)`);
      if (m[2] && nums.length === 1 && !names[Number(nums[0][1]) - 1]?.toLowerCase().startsWith(m[2].trim().toLowerCase().slice(0, 12))) bad.push(`${f}: ${m[0]} names another gate than [${nums[0][1]}] ${names[Number(nums[0][1]) - 1]}`);
    }
  }
  assert.deepEqual(bad, []);
});
