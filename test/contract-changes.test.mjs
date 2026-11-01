// What a merge request changes in the component contracts, shown on it: each change per component, the breaking ones
// as contract-gen.mjs says them, the products that use it, and a non-zero exit only for a breaking change nothing
// accounts for (a sign-off, a release, a new major).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { slimOf, recordOf, compare, verdict, accountedFor, baseOfFolder } from '../contract-changes.mjs';
import { tempDir } from './helpers.mjs';

const ENGINE = dirname(dirname(fileURLToPath(import.meta.url)));

const tile = (over = {}) => ({
  name: 'cardTile', version: '1.2.0',
  props: [
    { name: 'Size', type: 'enum', default: 'M', options: ['S', 'M', 'L'], bindings: { figma: { kind: 'VARIANT' }, code: { prop: 'size' } } },
    { name: 'Label', type: 'text', default: 'Save', bindings: { figma: { kind: 'TEXT' }, code: { prop: 'label' } } },
  ],
  states: [{ name: 'State=Hover', when: { State: 'Hover' } }],
  slots: [{ name: 'Icon' }], codeSlots: [{ name: 'default' }],
  codeOnly: [{ name: 'onPick' }], events: [{ name: 'pick' }],
  anatomy: { root: { gapToken: '{gap.s}' } }, tokens: { used: ['tile/fill'] },
  livesIn: { products: [{ name: 'Northwind', files: 3, uses: 4 }] },
  ...over,
});

test('each change per component: added, removed, changed, with the breaking ones marked and who uses it', () => {
  const base = recordOf([tile(), { name: 'buttonClock', props: [], anatomy: { root: {} } }]);
  const next = tile({
    props: [
      { name: 'Size', type: 'enum', default: 'S', options: ['S', 'M', 'XL'], bindings: { figma: { kind: 'VARIANT' }, code: { prop: 'size' } } },
      { name: 'Tone', type: 'enum', default: 'Calm', options: ['Calm', 'Loud'], bindings: { figma: { kind: 'VARIANT' }, code: null } },
    ],
    states: [], slots: [], codeOnly: [{ name: 'onPick' }, { name: 'dense' }], events: [], tokens: { used: ['tile/fill', 'tile/stroke'] },
  });
  const [removed, changed] = compare(base, recordOf([next]));
  assert.equal(removed.name, 'buttonClock');
  assert.deepEqual(removed.breaking, ['buttonClock: component removed']);
  const say = changed.items.map((i) => `${i.change} ${i.what}${i.detail ? `: ${i.detail}` : ''}${i.breaking ? ' !' : ''}`);
  assert.deepEqual(say, [
    'added prop Tone: Calm, Loud',
    'changed prop Size default: "M" → "S" !',
    'added prop Size options: XL',
    'removed prop Size options: L !',
    'removed prop Label !',
    'removed state State=Hover !',
    'removed slot Icon',
    'added code prop dense',
    'removed event pick',
    'added token tile/stroke',
  ]);
  assert.equal(changed.breaking.length, 4, 'contract-gen.mjs\'s own rules');
  assert.deepEqual(changed.usedBy, [{ name: 'Northwind', files: 3 }]);
});

test('the verdict: a breaking change nothing accounts for fails; a sign-off, a release or a new major accounts for it; failOn says how strict', () => {
  const base = recordOf([tile()], { branch: 'main', commit: 'a1b2c3d4e5f6', systemVersion: '1.2.0' });
  const broke = recordOf([tile({ props: [tile().props[0]] })]);
  const none = verdict(base, broke, { products: [{ name: 'Northwind', uses: '1.1.0' }] });
  assert.equal(none.code, 1);
  assert.match(none.lines.join('\n'), /❌ cardTile: 1 change, 1 breaking change\n {3}− prop Label \(breaking\)\n {3}used by: Northwind \(3 files\), on 1\.1\.0/);
  assert.match(none.lines.join('\n'), /--sign-off "breaking change to cardTile"/);
  assert.match(none.markdown, /### Component contracts changed since the base branch \(main, a1b2c3d4\)/);
  const c = compare(base, broke)[0];
  assert.equal(accountedFor(c, { signedOff: (w) => w === 'breaking change to cardTile' }), 'signed off');
  assert.equal(accountedFor(c, { releases: [{ version: '2.0.0', changes: [{ kind: 'component', name: 'cardTile' }] }], base, compareVersions: (a, b) => (a > b ? 1 : a < b ? -1 : 0) }), 'release 2.0.0');
  assert.equal(accountedFor(c, { releases: [{ version: '1.0.0', changes: [{ kind: 'component', name: 'cardTile' }] }], base, compareVersions: (a, b) => (a > b ? 1 : a < b ? -1 : 0) }), null, 'a release older than the base accounts for nothing');
  assert.equal(accountedFor(compare(base, recordOf([tile({ version: '2.0.0', props: [tile().props[0]] })]))[0]), 'its version 2.0.0');
  const ok = verdict(base, broke, { account: () => 'signed off' });
  assert.equal(ok.code, 0);
  assert.match(ok.lines[0], /^⚠️ {2}cardTile: 1 change, 1 breaking change \(accounted for: signed off\)/);
  assert.equal(verdict(base, broke, { account: () => 'signed off', failOn: 'breaking' }).code, 1);
  assert.equal(verdict(base, broke, { failOn: 'never' }).code, 0);
  const added = verdict(base, recordOf([tile({ props: [...tile().props, { name: 'Tone', options: ['Calm'] }] })]));
  assert.equal(added.code, 0, 'an addition never fails it');
  assert.match(added.lines.join('\n'), /✅ No breaking change/);
});

test('nothing kept from the base branch passes and says so; no contracts built cannot be compared; nothing changed says so', () => {
  const now = recordOf([tile()]);
  assert.equal(verdict(null, now).code, 0);
  assert.match(verdict(null, now).lines[0], /No contracts kept from the base branch yet/);
  assert.equal(verdict(now, recordOf([])).code, 2);
  assert.match(verdict(now, now).lines[0], /no component changed/);
  assert.deepEqual(slimOf(tile()).tokens, ['gap.s', 'tile/fill'], 'the anatomy\'s tokens and the ones it paints with');
});

test('--contract-changes on a merge request: --record on the base branch, then a removed option fails until a person signs it off; --base reads a published folder', () => {
  const root = tempDir('acme-contract-changes-');
  cpSync(join(ENGINE, 'test', 'fixtures', 'demo-ds'), root, { recursive: true });
  const run = (...args) => { try { return { code: 0, out: execFileSync(process.execPath, [join(ENGINE, 'audit.mjs'), ...args], { cwd: root, encoding: 'utf8', env: { ...process.env, CI_COMMIT_BRANCH: 'main' } }) }; } catch (e) { return { code: e.status, out: `${e.stdout}${e.stderr}` }; } };
  const first = run('--contract-changes');
  assert.equal(first.code, 0, first.out);
  assert.match(first.out, /No contracts kept from the base branch yet/);
  const kept = run('--contract-changes', '--record');
  assert.equal(kept.code, 0, kept.out);
  const rec = JSON.parse(readFileSync(join(root, '.design-system-engine-out', 'contracts-last-build.json'), 'utf8'));
  assert.equal(rec.branch, 'main');
  assert.ok(rec.contracts.chip, 'the chip kept');
  // A published folder as the base: the same contracts, so nothing changed.
  const pub = join(root, 'published');
  mkdirSync(pub, { recursive: true });
  cpSync(join(root, 'contracts', 'chip.contract.json'), join(pub, 'chip.contract.json'));
  const same = run('--contract-changes', '--base', 'published');
  assert.match(same.out, /button: added/, 'a component the published folder does not have is new');
  assert.equal(same.code, 0);
  // The merge request takes an option away from the chip.
  const snap = join(root, 'src', 'figma-component-props.snapshot.json');
  const props = JSON.parse(readFileSync(snap, 'utf8'));
  const size = Object.keys(props.chip.properties).find((k) => k.startsWith('Size'));
  props.chip.properties[size].variantOptions = ['M'];
  writeFileSync(snap, JSON.stringify(props));
  const mr = run('--contract-changes');
  assert.equal(mr.code, 1, mr.out);
  assert.match(mr.out, /❌ chip: 1 change, 1 breaking change\n {3}− prop Size options: L \(breaking\)\n {3}used by: Gallery/);
  assert.match(readFileSync(join(root, '.design-system-engine-out', 'contract-changes.md'), 'utf8'), /\*\*chip\*\*: 1 change, 1 breaking change/);
  run('--sign-off', 'breaking change to chip', '--by', 'QA');
  const signed = run('--contract-changes');
  assert.equal(signed.code, 0, signed.out);
  assert.match(signed.out, /accounted for: signed off/);
  assert.equal(run('--contract-changes', '--fail-on=sometimes').code, 2, 'a failOn it does not know is said');
});
