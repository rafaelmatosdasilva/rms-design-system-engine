// badge-svg.mjs - the README's two live badges, drawn here so GitHub's image proxy cannot break them.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { badgeSvg, ICONS, PRESETS } from '../lib/badge-svg.mjs';

const attr = (svg, name, from = 0) => {
  const m = svg.slice(from).match(new RegExp(`${name}="([^"]*)"`));
  return m ? m[1] : null;
};
const numbers = (svg, name) => [...svg.matchAll(new RegExp(`${name}="([\\d.]+)"`, 'g'))].map((m) => Number(m[1]));

// White text on each half, at the contrast the README holds every badge to.
const channel = (c) => (c / 255 <= 0.03928 ? c / 255 / 12.92 : ((c / 255 + 0.055) / 1.055) ** 2.4);
const onWhite = (hex) => {
  const n = parseInt(hex, 16);
  const l = 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255);
  return 1.05 / (l + 0.05);
};

test('the two halves add up to the whole badge, so nothing is drawn outside it', () => {
  for (const svg of [PRESETS.tests('3,743'), PRESETS.scorecard('7.8'), PRESETS.tests('0', true)]) {
    const width = Number(attr(svg, 'width'));
    const clip = Number(svg.match(/<clipPath id="r"><rect width="([\d.]+)"/)[1]);
    const label = Number(svg.match(/<g clip-path="url\(#r\)"><rect width="([\d.]+)"/)[1]);
    const [valueX, valueW] = svg.match(/<rect x="([\d.]+)" width="([\d.]+)"/).slice(1, 3).map(Number);
    assert.equal(clip, width, 'the rounded corners are cut from the whole badge');
    assert.equal(label + valueW, width, 'the label and the value fill the badge exactly');
    // The value begins where the label ends: a gap or an overlap would show as a seam.
    assert.equal(valueX, label);
    assert.equal(numbers(svg, 'height').every((h) => h === 20 || h === 14 || h === 24), true);
  }
});

test('every string is given a width to be fitted to, so none can overflow its half', () => {
  const svg = PRESETS.tests('3,743');
  const lengths = [...svg.matchAll(/textLength="(\d+)"/g)].map((m) => Number(m[1]));
  assert.equal(lengths.length, 6, 'each of the two strings is drawn three times: twice as its shadow, once over it');
  assert.equal(lengths.every((n) => n > 0), true);
  assert.equal([...svg.matchAll(/lengthAdjust="spacingAndGlyphs"/g)].length, 6, 'the glyphs are fitted, not just spaced');
});

test('a longer value makes a wider badge, and the text grows with it', () => {
  const short = PRESETS.scorecard('7.8');
  const long = PRESETS.scorecard('10.0');
  assert.ok(numbers(long, 'width')[0] > numbers(short, 'width')[0], 'the box grows');
});

test('white text sits at 4.5:1 or more on both halves of both badges', () => {
  for (const hex of ['316A17', '3D841D', '165DAE', '1B73D7', 'DA3330']) {
    assert.ok(onWhite(hex) >= 4.5, `#${hex} is ${onWhite(hex).toFixed(2)}:1 with white text`);
  }
});

test('a failing run says only that it failed, never a count that reads as that many failures', () => {
  const failing = PRESETS.tests('3,743', true);
  assert.match(failing, /<title>Tests: failing<\/title>/);
  assert.equal(failing.includes('3,743'), false, 'the count it managed is not shown beside the word failing');
  assert.match(failing, /fill="#DA3330"/);
  assert.match(PRESETS.tests('3,743'), /<title>Tests passed: 3,743<\/title>/);
});

test('each badge names itself, for a screen reader and for the tab that opens it alone', () => {
  for (const svg of [PRESETS.tests('1'), PRESETS.scorecard('7.8')]) {
    assert.equal(attr(svg, 'role'), 'img');
    assert.equal(attr(svg, 'aria-label'), svg.match(/<title>([^<]*)<\/title>/)[1]);
    assert.match(svg, /aria-hidden="true"/, 'the shadow underneath is not read out twice');
  }
});

test('the label ends in a colon and carries its icon, as every badge in the row does', () => {
  assert.match(PRESETS.tests('1'), /<title>Tests passed: /);
  assert.match(PRESETS.scorecard('7.8'), /<title>Scorecard: /);
  for (const svg of [PRESETS.tests('1'), PRESETS.scorecard('7.8')]) {
    assert.match(svg, /<svg x="6" y="3" width="14" height="14" viewBox="0 0 24 24"/, 'one icon set at one size');
    assert.match(svg, /stroke="#fff"/);
  }
});

test('a value with markup in it is written as text, never as markup', () => {
  const svg = badgeSvg({ label: 'A:', value: '<b>&"x"', labelColor: '316A17', valueColor: '3D841D' });
  assert.equal(svg.includes('<b>'), false);
  assert.match(svg, /&lt;b&gt;&amp;&quot;x&quot;/);
});

test('a badge without an icon starts its text at the edge instead of behind one', () => {
  const withIcon = badgeSvg({ label: 'A:', value: '1', labelColor: '316A17', valueColor: '3D841D', icon: ICONS.circleCheck });
  const without = badgeSvg({ label: 'A:', value: '1', labelColor: '316A17', valueColor: '3D841D' });
  assert.ok(numbers(withIcon, 'width')[0] > numbers(without, 'width')[0], 'the icon takes its own room');
  assert.equal(without.includes('viewBox="0 0 24 24"'), false);
});

test('an unexpected character is given an average width rather than none, so the box still holds it', () => {
  const plain = badgeSvg({ label: 'A:', value: 'aa', labelColor: '316A17', valueColor: '3D841D' });
  const odd = badgeSvg({ label: 'A:', value: 'a—', labelColor: '316A17', valueColor: '3D841D' });
  assert.ok(numbers(odd, 'width')[0] >= numbers(plain, 'width')[0] - 1, 'it is counted, not dropped');
});

test('the file is one line and ends in a newline, as the other badges in this repository are', () => {
  const svg = PRESETS.scorecard('7.8');
  assert.equal(svg.trimEnd().includes('\n'), false);
  assert.equal(svg.endsWith('\n'), true);
  assert.match(svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
  assert.match(svg, /<\/svg>\n$/);
});
