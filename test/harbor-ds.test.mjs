// I44, part 2: Harbor, a second fictional design system in test/fixtures/harbor-ds, audited end to end and
// compared with a committed report. Its conventions differ from the demo's on purpose, so a check that only
// works for one library's habits shows here: Vue components with <script setup>, a class dark mode
// (:root.theme-dark), a variable prefix (--hb-), snapshot files under their own names, a focus ring drawn
// with an outline, and fixed-height controls that never sit in a flex column. Every name is invented.
//
// Deliberate differences:
//   • a token value (radius/control is 6px in Figma, 4px in code)
//   • prop values named differently (Figma Tone=Neutral, the code tone="neutral"): the same meaning, not the
//     same name, so not in parity; and the prop's own name (Figma Tone, code tone). The button's props and
//     values are written exactly as Figma's and pass
//   • an icon-only button with no accessible name, and an outline removed with no focus style back
//   • an AGENTS.md that states tone="error" (the system says danger) and a variable that does not exist
//   • the Figma file's own hygiene (component-values.snapshot.json): a raw fill, a detached instance, a variant
//     with no auto layout, a component with no description
// And conventions that are not differences: the focus ring's outline lengths, which Figma has no value for,
// and fixed heights with no flex-shrink:0 (advisory only).
//
// Without Chrome only: expected-report-static.txt. UPDATE_GOLDEN=1 rewrites it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { bareEnv, auditFixture, golden } from './helpers.mjs';

const FIXTURE = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'harbor-ds');

test('Harbor design system, without Chrome: every deliberate difference is found, nothing else fails, and the report matches its golden', { timeout: 300000 }, () => {
  const r = auditFixture(FIXTURE, bareEnv(), 'harbor-ds-');
  assert.equal(r.code, 1, r.out.slice(-3000));
  // A token value.
  assert.match(r.out, /❌ \[sizing\/-\] radius\/control → --hb-radius-control/);
  // A class dark mode is read like any other.
  assert.match(r.out, /✅ OK\s+7\/7/);
  // Prop values: only the exact name is parity; the hint names the code's spelling.
  assert.match(r.out, /badge\/Tone: default differs - Figma "Neutral" vs code "tone=neutral" \(the code writes it "neutral"\)/);
  assert.match(r.out, /badge\/Tone: code prop "tone" is missing Figma variant option\(s\) "Neutral" \(the code writes it "neutral"\), "Success" \(the code writes it "success"\), "Danger" \(the code writes it "danger"\)/);
  assert.match(r.out, /badge\/Tone: the code names it "tone" \(letter case T → t\)/);
  assert.match(r.out, /button\/variant\s+Primary · Secondary\s+variant\s+Primary · Secondary\s+✓/);
  assert.match(r.out, /button\/size\s+Small · Large\s+size\s+Small · Large\s+✓/);
  // Accessibility from the code.
  assert.match(r.out, /components\/HbIconButton\.vue:3  a button with only an icon inside/);
  assert.match(r.out, /styles\/tokens\.css:\d+  \.hb-icon-button removes the focus outline/);
  assert.doesNotMatch(r.out, /\.hb-button:focus-visible removes/);
  // Agent instruction files.
  assert.match(r.out, /AGENTS\.md:3  tone="error" is not a value this prop takes; the system has tone="danger"/);
  assert.match(r.out, /AGENTS\.md:4  --hb-radius-pill is not a declared CSS variable/);
  // The Figma file's own hygiene, advice for whoever keeps the file, never a gate and never in the burndown.
  assert.match(r.out, /🎨 Figma file hygiene: 2 of 3 components \(1 value with no variable or style · 1 detached instance · 1 variant with no auto layout · 1 with no description\)/);
  assert.match(r.out, /badge: fill #b42318 on Tone=Danger\/Label has no variable or style/);
  assert.match(r.out, /iconButton: Default\/Glyph is detached from its instance/);
  assert.match(r.out, /● Figma hygiene\s+1\/3 components/);
  // Conventions, not differences: a focus ring and fixed heights outside a flex column.
  assert.match(r.out, /✅ Clean - no literal diverges from Figma/);
  assert.match(r.out, /✅ PASS  3 component\(s\) - no phantom CSS borders/);
  assert.match(r.out, /⚠️  NO-SHRINK 3\/3 .* advisory/);
  assert.match(r.out, /✅  \[13\]/);
  assert.match(r.out, /\*\*Not in parity\.\*\* 2 of 25 gates fail\./);
  golden(FIXTURE, 'expected-report-static.txt', r.out);
});

test('Harbor, scoped to one component: a page showing several components and a native <button> pull nothing in', { timeout: 300000 }, () => {
  const r = auditFixture(FIXTURE, bareEnv(), 'harbor-ds-', ['--component', 'badge']);
  assert.match(r.out, /SCOPED TO: badge/);
  assert.doesNotMatch(r.out, /nested components pulled in/);
  assert.match(r.out, /📉 Burndown, open findings per component: badge 3 · /);
  assert.match(r.out, /🎨 Figma file hygiene: 1 of 1 component \(1 value with no variable or style\)/);
  assert.doesNotMatch(r.out, /iconButton: /);
});
