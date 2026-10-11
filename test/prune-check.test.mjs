// prune-check.mjs - "prune candidates" advisory (I8). Pure over emitted artifacts.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { collectDeprecatedTokens, pruneCandidates } from '../prune-check.mjs';

test('collectDeprecatedTokens finds $deprecated leaves by dot-path, skips live ones', () => {
  const dict = {
    $description: 'x',
    color: {
      old: { $value: '#000', $deprecated: true },
      good: { $value: '#111', $deprecated: false },
    },
    radii: { legacy: { $value: '2px', $deprecated: true } },
  };
  assert.deepEqual(collectDeprecatedTokens(dict).sort(), ['color.old', 'radii.legacy']);
  assert.deepEqual(collectDeprecatedTokens(null), []);
});

test('pruneCandidates flags deprecated tokens, single-option variants, single-use components', () => {
  const built = [
    { name: 'Button', contract: {
      props: [
        { name: 'size', type: 'enum', options: ['sm', 'md', 'lg'] },   // real axis - not flagged
        { name: 'tone', type: 'enum', options: ['brand'] },            // single-option - flagged
        { name: 'loading', type: 'boolean' },                          // not an enum - ignored
      ],
    } },
    { name: 'Icon', contract: { deprecated: true, props: [] } },       // explicitly deprecated component
    { name: 'Card', contract: { props: [] } },
  ];
  const usage = { components: new Map([['Icon', 1], ['Button', 2]]) };  // Icon used once, Card by nobody
  const tokensDict = { space: { old: { $value: '4px', $deprecated: true } } };

  const r = pruneCandidates({ built, usage, tokensDict });
  assert.deepEqual(r.deprecatedTokens, ['space.old']);
  assert.deepEqual(r.deprecatedComponents, ['Icon']);
  assert.deepEqual(r.singleOptionVariants, [{ component: 'Button', prop: 'tone', option: 'brand' }]);
  assert.deepEqual(r.singleUseComponents, ['Icon']);          // reach == 1
  assert.deepEqual(r.unreferencedComponents, ['Card']);       // reach == 0, reported separately
  assert.equal(r.total, 1 + 1 + 1 + 1);                       // token + component + variant + single-use
});

test('pruneCandidates accepts a plain-object reach map and empty inputs', () => {
  const r = pruneCandidates({ built: [{ name: 'A', contract: { props: [] } }], usage: { components: { A: 0 } } });
  assert.deepEqual(r.unreferencedComponents, ['A']);
  assert.equal(r.total, 0);                                   // unreferenced is NOT counted
  assert.deepEqual(pruneCandidates({}).total, 0);             // nothing in, nothing out
});

test('L9: the token budget, tokens equal to another in every mode and tokens only one component uses', async () => {
  const { sameInEveryMode } = await import('../prune-check.mjs');
  const vars = { color: {
    light: { 'text/primary': '#111', 'icon/primary': '#111', 'text/muted': '#666', 'primitives/gray/900': '#111', 'border/strong': '#111' },
    dark: { 'text/primary': '#eee', 'icon/primary': '#eee', 'text/muted': '#999', 'primitives/gray/900': '#eee', 'border/strong': '#fff' },
  } };
  assert.deepEqual(sameInEveryMode(vars), [['icon/primary', 'text/primary']]);   // border/strong parts in dark; primitives left out
  const pr = pruneCandidates({ built: [], usage: { components: {}, tokens: new Map([['color.text.primary', 1], ['color.text.muted', 3]]) }, vars });
  assert.deepEqual(pr.sameTokens, [['icon/primary', 'text/primary']]);
  assert.deepEqual(pr.singleUseTokens, ['color.text.primary']);
  assert.equal(pr.total, 2);
});
