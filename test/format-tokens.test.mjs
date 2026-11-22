// Dates, numbers and money read as part of the system: format tokens per market, complete in every market, and code
// that formats by hand where the system has a format (format-tokens.mjs, the edit check).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatCollections, formatGaps, gapLine, formatFindings } from '../lib/format-tokens.mjs';

const vars = { modeVariants: {
  Market: { modes: [{ name: 'United Kingdom', snapshotKey: 'uk' }, { name: 'Brazil', snapshotKey: 'br' }], vars: {
    'format/date': { kind: 'string', values: { uk: 'DD/MM/YYYY', br: 'DD/MM/YYYY ' } },
    'format/currency': { kind: 'string', values: { uk: '£#,##0.00', br: '' } },
    'label/hello': { kind: 'string', values: { uk: 'Hello', br: 'Olá' } },
  } },
  Theme: { modes: [{ name: 'light', snapshotKey: 'light' }, { name: 'dark', snapshotKey: 'dark' }], vars: { 'format/date': { kind: 'string', values: { light: 'a', dark: 'b' } } } },
  Locale: { modes: [{ name: 'en-GB', snapshotKey: 'en-gb' }, { name: 'pt-BR', snapshotKey: 'pt-br' }], vars: { 'size/gap': { kind: 'scalar', values: { 'en-gb': '8px', 'pt-br': '12px' } } } },
} };

test('a collection of markets with format tokens is read, each format complete in every market', () => {
  const c = formatCollections(vars);
  assert.deepEqual(c.map((x) => [x.collection, Object.keys(x.tokens)]), [['Market', ['format/date', 'format/currency']]], 'a theme is no market, and a locale with no format holds none');
  const gaps = formatGaps(c);
  assert.deepEqual(gaps, [{ collection: 'Market', token: 'format/currency', missing: ['br'] }]);
  assert.equal(gapLine(gaps[0]), 'format/currency (Market) has no value in br');
});

test('code that formats by hand is said with the system\'s formats, and nothing is said without them', () => {
  const c = formatCollections(vars);
  const code = [
    "const d = new Intl.DateTimeFormat('en-US').format(at);",
    "const t = at.toLocaleDateString('pt-BR');",
    "const s = dayjs(at).format('DD/MM/YYYY');",
    "const p = '$' + price;",
    'const q = `${amount} €`;',
    "const ok = new Intl.NumberFormat(locale).format(n);",
  ].join('\n');
  const f = formatFindings(code, c);
  assert.deepEqual(f.map((x) => [x.line, x.kind]), [[1, 'locale'], [2, 'locale'], [3, 'date'], [4, 'money'], [5, 'money']]);
  assert.match(f[0].says, /^Intl\.DateTimeFormat\('en-US'\) writes the market in the code, where the system keeps its formats per market: format\/date, format\/currency \(Market\)/);
  assert.deepEqual(formatFindings(code, []), []);
});

test('the edit check says it on the line an edit added', async () => {
  const { editFindings } = await import('../lib/edit-check.mjs');
  const { steeringTruth } = await import('../lib/steering-check.mjs');
  const full = "export const when = (d) => d.toLocaleDateString('en-US');\n";
  const out = editFindings([full.trim()], full, { truth: steeringTruth({}), tokenByValue: new Map(), formats: formatCollections(vars) }, { file: 'src/when.ts' });
  assert.ok(out.some((x) => x.kind === 'format' && /toLocaleDateString\('en-US'\) writes the market in the code/.test(x.text)), JSON.stringify(out));
});
