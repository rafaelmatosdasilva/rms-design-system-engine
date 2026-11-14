// What a property may hold, compared on both sides: two properties with the same name and different content are two
// components that happen to look alike.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { codeHolds, figmaHolds, holdsDiffer, holdsWords } from '../lib/prop-holds.mjs';
import { codeHalf } from '../lib/contract-code.mjs';
import { textComponentApi } from '../lib/component-source.mjs';
import { parityRows } from '../lib/styleguide-data.mjs';

test('the code\'s type says what a prop may hold', () => {
  assert.deepEqual(codeHolds('string'), { kind: 'words' });
  assert.deepEqual(codeHolds("'Save' | 'Cancel'"), { kind: 'words' });
  assert.deepEqual(codeHolds('React.ReactNode'), { kind: 'anything' });
  assert.deepEqual(codeHolds('ReactNode | undefined'), { kind: 'anything' });
  assert.deepEqual(codeHolds('VNode[]'), { kind: 'anything' });
  assert.deepEqual(codeHolds('typeof Icon | typeof Spinner'), { kind: 'one of', of: ['Icon', 'Spinner'] });
  assert.deepEqual(codeHolds('ReactElement<typeof Icon>'), { kind: 'one of', of: ['Icon'] });
  assert.deepEqual(codeHolds('React.ComponentType<IconProps>'), { kind: 'component' });
  // A type the reading cannot place says nothing, never a guess.
  assert.equal(codeHolds('ButtonOptions'), null);
  assert.equal(codeHolds('() => void'), null);
  assert.equal(codeHolds(''), null);
});

test('Figma\'s property kind says what it may hold', () => {
  assert.deepEqual(figmaHolds({ type: 'TEXT' }), { kind: 'words' });
  assert.deepEqual(figmaHolds({ type: 'SLOT' }), { kind: 'anything' });
  assert.deepEqual(figmaHolds({ type: 'SLOT', slotSettings: { allowPreferredValuesOnly: true }, preferredValues: [{ key: 'a' }, { key: 'b' }] }), { kind: 'one of', count: 2 });
  assert.deepEqual(figmaHolds({ type: 'INSTANCE_SWAP' }), { kind: 'component' });
  assert.deepEqual(figmaHolds({ type: 'INSTANCE_SWAP', preferredValues: [{ key: 'a' }] }, ['Icon']), { kind: 'one of', of: ['Icon'] });
  assert.equal(figmaHolds({ type: 'BOOLEAN' }), null);
  assert.equal(holdsWords({ kind: 'one of', of: ['Icon', 'Badge', 'Spinner'] }), 'one of Icon, Badge or Spinner');
});

test('the two differ by kind, and a set differs only by names both sides give', () => {
  assert.deepEqual(holdsDiffer({ kind: 'words' }, { kind: 'anything' }), { figma: 'words', code: 'anything' });
  assert.equal(holdsDiffer({ kind: 'words' }, { kind: 'words' }), null);
  assert.equal(holdsDiffer({ kind: 'one of', count: 2 }, { kind: 'one of', of: ['Icon', 'Spinner'] }), null);
  assert.equal(holdsDiffer({ kind: 'component' }, { kind: 'one of', of: ['Icon'] }), null);
  assert.deepEqual(holdsDiffer({ kind: 'one of', of: ['Icon'] }, { kind: 'one of', of: ['Icon', 'Spinner'] }), { figma: 'one of Icon', code: 'one of Icon or Spinner' });
  assert.deepEqual(holdsDiffer({ kind: 'one of', of: ['Icon'] }, { kind: 'anything' }), { figma: 'one of Icon', code: 'anything' });
  assert.equal(holdsDiffer(null, { kind: 'anything' }), null);
});

test('the text reader reads a type of content, never a default written after a colon', () => {
  const api = textComponentApi('cardTile.tsx', `interface CardTileProps {
  title?: string;
  media: typeof Image | typeof Video;
  children: React.ReactNode;
}
export function CardTile({ title = 'Untitled', media, children }: CardTileProps) { return null; }
const defaults = { caption: 'Save', };`);
  assert.deepEqual(api.props.title.holds, { kind: 'words' });
  assert.deepEqual(api.props.media.holds, { kind: 'one of', of: ['Image', 'Video'] });
  assert.deepEqual(api.props.children.holds, { kind: 'anything' });
});

test('the contract records what each side holds, and the team\'s answer names the side to fix', () => {
  const contractProps = [{ name: 'children', bindings: { figma: { kind: 'TEXT', property: 'children' }, code: null } }];
  const figmaProps = { 'children#1:0': { type: 'TEXT', defaultValue: 'Save' } };
  const api = { props: { children: { holds: { kind: 'anything' } } } };
  const half = codeHalf(contractProps, figmaProps, api);
  const p = half.props[0];
  assert.equal(p.bindings.figma.holds, 'words');
  assert.equal(p.bindings.code.holds, 'anything');
  assert.deepEqual(p.differences.find((d) => d.kind === 'holds'), { kind: 'holds', figma: 'words', code: 'anything' });
  const decided = codeHalf(contractProps, figmaProps, api, { authored: { holds: { children: 'words' } } });
  assert.equal(decided.props[0].differences.find((d) => d.kind === 'holds').right, 'figma');
  // The same kind on both sides is no difference.
  const same = codeHalf(contractProps, figmaProps, { props: { children: { holds: { kind: 'words' } } } });
  assert.equal((same.props[0].differences ?? []).some((d) => d.kind === 'holds'), false);
});

test('the parity table says it as a difference, with both sides', () => {
  const rows = parityRows({ name: 'button', propsSnap: { button: { properties: { 'label#1:0': { type: 'TEXT', defaultValue: 'Save' } } } }, codeProps: { label: { holds: { kind: 'anything' } } } });
  const r = rows.find((x) => x.type === 'Prop' && x.figma?.name === 'label');
  assert.equal(r.status, 'differs');
  assert.deepEqual(r.holdsDiffers, { figma: 'words', code: 'anything' });
});
