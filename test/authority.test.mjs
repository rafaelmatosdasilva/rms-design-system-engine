// The order of authority (K3): which source decides when two disagree, written into llms.txt with this system's own
// sources named, and the level each finding's rule stands on.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { AUTHORITY, authorityLines, authorityOf } from '../authority.mjs';
import { buildLlms } from '../contract-gen.mjs';

test('the order: the users\' goal, research, documented standards, past decisions, heuristics', () => {
  assert.deepEqual(AUTHORITY.map((a) => a.key), ['goal', 'research', 'standard', 'decision', 'heuristic']);
  assert.equal(authorityOf('Token values'), 'standard');
  assert.equal(authorityOf('Accessibility (WCAG 2.2)'), 'standard');
  assert.equal(authorityOf('Exemption debt'), 'decision');
  assert.equal(authorityOf('System health'), 'heuristic');
  assert.equal(authorityOf('Visual review'), 'heuristic');
});

test('llms.txt names this system\'s own source at each level, and says what to do with the order', () => {
  const dir = mkdtempSync(join(tmpdir(), 'authority-'));
  writeFileSync(join(dir, 'design-system-engine-baseline.json'), '{}');
  const lines = authorityLines({ figmaFileKey: 'abc', research: ['docs/research/onboarding.md'], guidelines: { sources: ['guidelines.md'] } }, dir);
  const text = lines.join('\n');
  assert.match(text, /^## When sources disagree/);
  assert.match(text, /Say which source decided each call, and never put your own preference above a documented standard\. WCAG 2\.2 at level AA is the floor at every level\./);
  assert.match(text, /1\. \*\*The goal of the people who use the product\*\*/);
  assert.match(text, /2\. \*\*Verified research\*\*: docs\/research\/onboarding\.md\./);
  assert.match(text, /3\. \*\*The system's documented standards\*\*: the Figma file, the contracts and tokens here, the guidelines in guidelines\.md, WCAG 2\.2 at level AA\./);
  assert.match(text, /4\. \*\*Accepted past decisions\*\*: the accepted differences in design-system-engine-baseline\.json\./);
  assert.match(text, /5\. \*\*General heuristics\*\*/);
  // Nothing recorded: said so, never left blank.
  assert.match(authorityLines({}, mkdtempSync(join(tmpdir(), 'authority-'))).join('\n'), /Verified research\*\*: none recorded for this system[\s\S]*Accepted past decisions\*\*: none recorded yet\./);
  // In llms.txt, right after the mandate to use the components.
  const llms = buildLlms([], {}, 0, null, { authority: lines });
  assert.ok(llms.indexOf('**Use these components.**') < llms.indexOf('## When sources disagree') && llms.indexOf('## When sources disagree') < llms.indexOf('## Components'));
});
