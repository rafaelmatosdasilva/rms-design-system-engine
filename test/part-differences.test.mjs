// A difference names the part it is on (capture-compare.mjs): each part paired with its class by name is compared on its
// own element with the gap and the padding Figma binds on the frame of that name, and the difference carries the part,
// the rule and the line, so the hand-back points there (handback.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compareComponents, measuredLine } from '../lib/capture-compare.mjs';
import { figmaChanges } from '../lib/handback.mjs';

const maps = () => ({ EXPLICIT: {}, EXPLICIT_SIZING: {}, SKIP_TOKENS: new Set(), NULL_TOKENS: new Set(), KNOWN_NULL: new Set(), SIZING_SKIP: new Map(), TYPO: {} });
const cfg = { figma: { namingConvention: { dropSegments: ['color', 'default'] } } };
const vars = { sizing: { 'space/s': '8px', 'space/xs': '4px' } };
const fact = (value, v) => ({ value, var: v, rule: '.chip__content', at: 'src/chip.css:12', confidence: 'verified' });

test('a part\'s gap and padding compared on its own element, the difference naming the part and its line', () => {
  const code = { components: { chip: { confidence: 'high', instance: { hasText: true }, props: {}, parts: {
    'part-0': { name: 'Content', selector: '.chip__content', props: { columnGap: fact('4px', '--space-xs'), rowGap: fact('4px', '--space-xs'), paddingLeft: fact('8px', '--space-s'), paddingRight: fact('8px', '--space-s') } },
  } } } };
  const structure = { chip: { childFrameGaps: [{ name: 'Content', gapVar: 'space/s' }], childFramePadding: [{ name: 'Content', paddingVar: { lr: 'space/s' } }] } };
  const r = compareComponents(code, structure, vars, cfg, maps());
  const gap = r.differ.find((d) => d.field === 'gap');
  assert.equal(gap.part, 'Content');
  assert.equal(gap.at, 'src/chip.css:12');
  assert.match(measuredLine(gap), /^chip › Content gap: Figma space\/s/);
  assert.ok(!r.differ.some((d) => /padding/.test(d.field)), 'the padding agrees');
  assert.match(figmaChanges([{ d: gap }]), /- \*\*Content › gap\*\*: set it to/);
});

test('a part with no frame of its name in Figma, or none paired, adds nothing', () => {
  const code = { components: { chip: { confidence: 'high', instance: { hasText: true }, props: {}, parts: { 'part-0': { name: 'Label', props: { columnGap: fact('4px') } } } } } };
  const r = compareComponents(code, { chip: { childFrameGaps: [{ name: 'Content', gapVar: 'space/s' }] } }, vars, cfg, maps());
  assert.ok(![...r.differ, ...r.notComparable].some((d) => d.part), 'nothing said of a part Figma has no frame for');
});
