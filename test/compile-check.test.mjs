// I66: a generated .tsx/.jsx candidate type-checks against the design system's own props, written as the code
// writes them. Only what the catalog states is checked; any other prop, the HTML elements and other imports pass.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { compileShim, prepare, parseTscOutput, typeErrors, findTsc } from '../compile-check.mjs';
import { score } from '../eval-run.mjs';
import { makeFixture } from './helpers.mjs';

const catalog = { components: {
  badge: { props: { Tone: { type: 'enum', values: ['Neutral', 'Danger'], codeName: 'tone', codeValues: ['neutral', 'danger'] }, Label: { type: 'text', codeName: 'label' } } },
  button: { props: { Variant: { type: 'enum', values: ['Primary', 'Secondary'] }, Disabled: { type: 'enum', values: ['False', 'True'], codeName: 'disabled' } } },
} };

test('the types come from the catalog, as the code writes them', () => {
  const shim = compileShim(catalog);
  assert.match(shim, /declare function Badge\(props: \{ tone\?: "neutral" \| "danger"; label\?: string; children\?: any; \[other: string\]: unknown \}\): any;/);
  assert.match(shim, /declare function Button\(props: \{ Variant\?: "Primary" \| "Secondary"; disabled\?: boolean;/);   // Figma's values where the code has none; True/False is a boolean
  assert.match(shim, /interface IntrinsicElements \{ \[tag: string\]: any \}/);
});

test('imports become blank lines, so line numbers stay; the code\'s own component names are the components', () => {
  const code = "import { useState } from 'react';\nimport { HbBadge } from './HbBadge';\nimport './x.css';\nexport const A = () => <HbBadge tone=\"error\" />;";
  const p = prepare(code, catalog);
  assert.equal(p.split('\n').length, code.split('\n').length);
  assert.match(p.split('\n')[0], /declare const useState: any;/);
  assert.match(p.split('\n')[0], /declare const HbBadge: typeof Badge;/);
  assert.equal(p.split('\n')[3], 'export const A = () => <HbBadge tone="error" />;');
  assert.deepEqual(parseTscOutput("/x/.parity-out/compile/a.tsx(4,26): error TS2322: Type '\"error\"' is not assignable to type '\"neutral\" | \"danger\"'.\nother.ts(1,1): error TS1: no", 'a.tsx'),
    [{ line: 4, code: 'TS2322', message: "Type '\"error\"' is not assignable to type '\"neutral\" | \"danger\"'." }]);
});

const tsc = findTsc(process.cwd());
test('the compiler finds a value a prop does not take, and nothing else', { skip: !tsc && 'no TypeScript compiler here' }, () => {
  const dir = makeFixture({});
  const code = [
    "import { useState } from 'react';",
    "import { Badge } from '../ds';",
    'export function S() {',
    '  const [n] = useState(0);',
    '  return (<div className="row">',
    '    <Badge tone="error" label="Failed" />',
    '    <Badge tone="danger" label={`${n}`} onClick={() => {}} data-x="1" />',
    '    <Button Variant="primary" disabled>Retry</Button>',
    '    <input size={20} />',
    '  </div>);',
    '}',
  ].join('\n');
  const r = typeErrors(code, catalog, { ROOT: dir, tsc, id: 's' });
  assert.equal(r.ran, true);
  assert.deepEqual(r.errors.map((e) => e.line), [6, 8]);
  assert.match(r.errors[0].message, /"error"/);
  assert.match(r.errors[1].message, /"primary"/);
  // In the eval: each type error is a violation, and the candidate is not clean.
  const s = score(code, { cssVars: new Set(), dsClasses: new Set(), componentClass: new Map(), compile: { catalog, tsc, ROOT: dir, ext: 'tsx', dir: join(dir, 'c') } }, { id: 's' });
  assert.equal(s.metrics.typeErrors, 2);
  assert.equal(s.metrics.clean, false);
  assert.ok(s.violations.some((v) => v.type === 'type-error' && /^line 6: /.test(v.value)));
  // A clean candidate stays clean.
  const ok = score('export const A = () => <Badge tone="neutral" />;', { cssVars: new Set(), dsClasses: new Set(), componentClass: new Map(), compile: { catalog, tsc, ROOT: dir, ext: 'tsx', dir: join(dir, 'c') } }, { id: 'ok' });
  assert.equal(ok.metrics.typeErrors, 0);
  assert.equal(ok.metrics.clean, true);
});

test('without a compiler or a catalog, the check says why and does not run', () => {
  assert.match(typeErrors('<A/>', catalog, { tsc: null }).why, /no TypeScript compiler/);
  assert.match(typeErrors('<A/>', {}, { tsc: { cmd: 'tsc', args: [] } }).why, /no contracts\/catalog\.json/);
});
