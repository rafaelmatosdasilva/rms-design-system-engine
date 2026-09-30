// I65: Lagoon, a fictional Tailwind v4 design system in test/fixtures/lagoon-tw, audited end to end and compared
// with a committed report. The theme is Tailwind's @theme (--color-…, --spacing-…, --radius-…, a class dark
// mode), the components write their measures as classes, and ds-config.json uses the "tailwind" naming preset.
//
// Deliberate differences:
//   • a Figma token the code does not declare (stroke/default → --stroke-default)
//   • the badge's prop named differently (Figma Tone, the code tone)
//   • the badge's corner written as a literal the theme does not have (rounded-[4px]; Figma binds radius/control, 6px)
//   • two values written in brackets that the theme already has (p-[12px] → p-3, bg-[#1f7a3a]/10 → bg-status-success/10)
// And conventions that are not differences: every theme variable is used through a utility (bg-action-primary,
// rounded-control, p-2), a variant written in brackets (data-[state=open]:) is not a value, and the button's
// height, padding, corner and colours are Figma's.
//
// Without Chrome only: expected-report-static.txt. UPDATE_GOLDEN=1 rewrites it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { bareEnv, auditFixture, golden } from './helpers.mjs';

const FIXTURE = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'lagoon-tw');

test('Lagoon, a Tailwind design system: every deliberate difference is found, nothing else fails, and the report matches its golden', { timeout: 300000 }, () => {
  const r = auditFixture(FIXTURE, bareEnv(), 'lagoon-tw-');
  assert.equal(r.code, 1, r.out.slice(-3000));
  // Token names through the preset: every @theme variable traces back to a Figma token and is used.
  assert.match(r.out, /✅ PASS  7 /);
  assert.match(r.out, /❌ \[sizing\/-\] stroke\/default → --stroke-default: CSS var not declared/);
  assert.match(r.out, /✅  \[7\] No invented CSS variables/);
  assert.match(r.out, /✅ 0 unused vars/);
  // The prop's name.
  assert.match(r.out, /badge\/Tone: the code names it "tone" \(letter case T → t\)/);
  // The classes against Figma, and the values in brackets against the theme.
  assert.match(r.out, /🎯 Tailwind classes against Figma: 1 measure in 2 components differs from what Figma states/);
  assert.match(r.out, /badge: corner, Figma radius\/control \(6px\), the code writes rounded-\[4px\]; write rounded-control/);
  assert.doesNotMatch(r.out, /button: (height|padding|corner|fill|text colour)/);
  assert.match(r.out, /🎯 Tailwind arbitrary values: 3 classes/);
  assert.match(r.out, /src\/pages\/Settings\.tsx:6  p-\[12px\]  the theme has this value: write p-3/);
  assert.match(r.out, /src\/pages\/Settings\.tsx:8  bg-\[#1f7a3a\]\/10  the theme has this value: write bg-status-success\/10/);
  assert.doesNotMatch(r.out, /data-\[state=open\]/);
  assert.match(r.out, /\*\*Not in parity\.\*\* 2 of 25 gates fail\./);
  assert.doesNotMatch(r.out, /printed no result line/);
  golden(FIXTURE, 'expected-report-static.txt', r.out);
});

test('--init on a Tailwind project sets the naming preset and reads the class dark mode', { timeout: 120000 }, async () => {
  const { fixtureProject } = await import('./helpers.mjs');
  const { spawnSync, execFileSync } = await import('node:child_process');
  const { readFileSync } = await import('node:fs');
  const dir = fixtureProject(FIXTURE, 'lagoon-init-');
  execFileSync('git', ['rm', '-q', 'ds-config.json'], { cwd: dir });
  const r = spawnSync(process.execPath, [join(dirname(dirname(fileURLToPath(import.meta.url))), 'audit.mjs'), '--init', '--figma-url=https://www.figma.com/design/LgNfIcT1234/Lagoon', '--theme-css=src/app.css', '--no-hooks'], { cwd: dir, encoding: 'utf8', env: { ...process.env, NO_COLOR: '1' } });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /Tailwind theme found: token names are matched as Tailwind writes them/);
  const cfg = JSON.parse(readFileSync(join(dir, 'ds-config.json'), 'utf8'));
  assert.equal(cfg.figma.namingConvention.preset, 'tailwind');
});
