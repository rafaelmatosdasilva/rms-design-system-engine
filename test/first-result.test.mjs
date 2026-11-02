// The value straight after setup (first-result.mjs): one component Figma and the code pair most fully, checked, and its
// three main findings, each with what to do, then three requests to try next. Setup's last line points at it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, existsSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { pickComponent, mainFindings, withFixes, whoActs, firstResultLines } from '../lib/first-result.mjs';
import { budget, tempDir } from './helpers.mjs';

const ENGINE = dirname(dirname(fileURLToPath(import.meta.url)));

test('the component paired most fully: in Figma and in the code, with the most variants and props named', () => {
  const structure = { cardTile: { variants: { 'size=Small': {}, 'size=Large': {} }, nodeId: '1:2' }, chip: { variants: { 'state=On': {} } }, onlyFigma: { variants: { a: {}, b: {}, c: {} } } };
  const files = { cardTile: ['src/CardTile.vue'], chip: ['src/Chip.vue'], onlyFigma: [] };
  const props = { chip: { properties: { label: {}, state: {}, icon: {} } } };
  assert.equal(pickComponent({ structure, files, props }), 'chip', 'three props named outweigh one more variant');
  assert.equal(pickComponent({ structure, files }), 'cardTile');
  assert.equal(pickComponent({ structure: { onlyFigma: {} }, files: {} }), null, 'nothing in both');
});

test('its main findings: what fails first, one a check, its fix when the run printed one, the system\'s own to fill in', () => {
  const lines = [
    'Data is up to date :: ⚠️ figma/vars.snapshot.json is 40 days old',
    'Token values :: ❌ [sizing/-] radius/control → --acme-radius-control',
    'Token values :: Fix:  styles/tokens.css:10 - change --acme-radius-control: 4px → 6px',
    'Structure :: ⚠️ cardTile: size=Large has no counterpart in code',
    'Structure :: ⚠️ cardTile: size=Small is 2px taller',
    'Figma file hygiene :: cardTile: no description',
  ];
  const records = [
    { check: 'Data is up to date', evidence: 'figma/vars.snapshot.json is 40 days old', component: null, verdict: 'fails', difference: false, side: 'decide' },
    { check: 'Token values', evidence: '[sizing/-] radius/control → --acme-radius-control', component: null, verdict: 'fails', difference: true, side: 'decide' },
    { check: 'Structure', evidence: 'cardTile: size=Large has no counterpart in code', component: 'cardTile', verdict: 'advisory', difference: true, side: 'decide' },
    { check: 'Structure', evidence: 'cardTile: size=Small is 2px taller', component: 'cardTile', verdict: 'advisory', difference: true, side: 'decide' },
    { check: 'Figma file hygiene', evidence: 'cardTile: no description', component: 'cardTile', verdict: 'advisory', difference: true, side: 'figma' },
  ];
  const found = withFixes(records, lines);
  assert.equal(found.find((f) => f.check === 'Token values').fix, 'styles/tokens.css:10 - change --acme-radius-control: 4px → 6px');
  const main = mainFindings(found, 'cardTile');
  assert.deepEqual(main.map((f) => f.check), ['Figma file hygiene', 'Structure', 'Token values'], 'its own first, one a check, then the system\'s; never the data\'s age');
  assert.equal(whoActs(main[0]), 'In Figma, by whoever keeps the file');
  const out = firstResultLines({ component: 'cardTile', findings: main, report: 'out/first-result.txt' });
  assert.match(out[0], /^🎯 First result: cardTile, the component Figma and the code pair most fully, checked against Figma \(its whole report: out\/first-result\.txt\)\.$/);
  assert.ok(out.includes('      What to do: styles/tokens.css:10 - change --acme-radius-control: 4px → 6px (you decide which side is right, then one side changes).'));
  assert.deepEqual(out.slice(-3), ['   /rms-design-system-engine check the cardTile and show it in the style guide', '   /rms-design-system-engine which component should I fix first?', '   /rms-design-system-engine check everything']);
  assert.match(firstResultLines({ component: 'chip', findings: [], asked: true })[1], /Nothing to fix in chip/);
});

test('the command on a system set up: one component checked, its findings and what to ask next; with no Figma data, the first run first', { timeout: budget(300000) }, () => {
  const dir = tempDir('first-result-');
  cpSync(join(ENGINE, 'test', 'fixtures', 'harbor-ds'), dir, { recursive: true });
  const run = () => spawnSync(process.execPath, [join(ENGINE, 'audit.mjs'), '--first-result'], { cwd: dir, encoding: 'utf8', env: { ...process.env, NO_COLOR: '1' } });
  const r = run();
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /SUMMARY\n🎯 First result: \w+, the component Figma and the code pair most fully, checked against Figma/);
  assert.match(r.stdout, /\n {3}1\. .+\n {6}What to do: .+/);
  assert.match(r.stdout, /Ask next:\n {3}\/rms-design-system-engine check the \w+ and show it in the style guide/);
  assert.match(r.stdout, /NEXT: show the person these findings/);
  assert.ok(existsSync(join(dir, '.design-system-engine-out', 'first-result.txt')), 'the whole report kept');
  rmSync(join(dir, 'figma', 'structure.snapshot.json'));
  const none = run();
  assert.match(none.stdout, /No Figma data yet: the first run reads it\.\nNEXT: rms-design-system-engine {3}\(the first run: it reads Figma when it can, then audits\), then rms-design-system-engine --first-result/);
});
