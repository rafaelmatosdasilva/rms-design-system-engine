// Each component's motion or effects read from Figma in checked answers (capture-chunks.mjs): the checksums first, then
// only the components whose checksum no record kept from the last capture has.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { effectsCaptureScript } from '../effects-parity.mjs';
import { motionCaptureScript } from '../motion-parity.mjs';
import { startChunks, takeAnswer, readKept } from '../capture-chunks.mjs';
import { tempDir } from './helpers.mjs';

const ENGINE = fileURLToPath(new URL('..', import.meta.url));

// A Figma of two pages of invented components (tile sets and lone marks), each with a shadow, each set with a
// transition between its variants; the first page also opens a cardTile as an overlay.
function fakeFigma() {
  const shadow = (i) => [{ type: 'DROP_SHADOW', visible: true, color: { r: 0, g: 0, b: 0, a: 0.2 }, offset: { x: 0, y: i }, radius: 4, spread: 0 }];
  const variant = (id, name, props, reactions = []) => ({ id, type: 'COMPONENT', name, variantProperties: props, effects: shadow(1), fills: [], children: [], reactions });
  const nodes = new Map();
  const page = (p, n) => {
    const sets = [], solo = [];
    for (let i = 0; i < n; i++) {
      const a = variant(`${p}:${i}:a`, 'state=rest', { state: 'rest' }, [{ trigger: { type: 'ON_HOVER' }, actions: [{ type: 'NODE', destinationId: `${p}:${i}:b`, transition: { type: 'SMART_ANIMATE', duration: 0.2, easing: { type: 'EASE_OUT' } } }] }]);
      const b = variant(`${p}:${i}:b`, 'state=hover', { state: 'hover' });
      const set = { id: `${p}:${i}`, type: 'COMPONENT_SET', name: `tile${p}x${i}`, children: [a, b] };
      a.parent = set; b.parent = set; sets.push(set);
      solo.push({ id: `${p}:${i}:m`, type: 'COMPONENT', name: `mark${p}x${i}`, effects: shadow(i + 2), fills: [], children: [], parent: null });
    }
    const card = { id: `${p}:card`, type: 'COMPONENT', name: 'cardTile', parent: null };
    nodes.set(card.id, card);
    const opener = p === 0 ? [{ id: `${p}:open`, type: 'FRAME', name: 'opener', reactions: [{ trigger: { type: 'ON_CLICK' }, actions: [{ type: 'NODE', navigation: 'OVERLAY', destinationId: card.id, transition: { type: 'MOVE_IN', duration: 0.3, easing: { type: 'EASE_OUT' } } }] }] }] : [];
    return { id: `page${p}`, sets, solo, loadAsync: async () => {}, findAllWithCriteria: ({ types }) => (types[0] === 'COMPONENT_SET' ? sets : [...sets.flatMap((s) => s.children), ...solo]), findAll: (f) => opener.filter(f) };
  };
  const pages = [page(0, 12), page(1, 9)];
  return { pages, root: { children: pages }, variables: { getVariableByIdAsync: async () => null }, getStyleByIdAsync: async () => null, getNodeByIdAsync: async (id) => nodes.get(id) ?? null };
}
const run = (script, figma) => new Function('figma', `return (async () => {\n${script}\n})()`)(figma);
const KINDS = { effects: effectsCaptureScript, motion: motionCaptureScript };

// A whole capture: the script the last step asked for, run in Figma, its answer saved as it came, until done.
async function capture(kind, figma, dir, budget, { calls = [] } = {}) {
  let step = startChunks(dir, kind);
  for (let n = 0; n < 200; n++) {
    calls.push(step);
    const answer = await run(KINDS[kind](null, { ...step, budget }), figma);
    assert.ok(JSON.stringify(answer).length < Math.max(budget * 2, 4000), 'each answer stays near its budget');
    step = takeAnswer(dir, kind, JSON.stringify(answer));
    assert.ok(!step.error, step.error);
    if (step.done) return step;
  }
  throw new Error('never done');
}

for (const kind of Object.keys(KINDS)) {
  test(`${kind}: the checksums first, then the components, in answers that each fit; the same as one large answer`, async () => {
    const figma = fakeFigma();
    const whole = await capture(kind, figma, tempDir(`whole-${kind}-`), 1e9);
    const calls = [], dir = tempDir(`chunks-${kind}-`);
    const j = await capture(kind, figma, dir, 500, { calls });
    assert.ok(calls.filter((c) => c.call === 'sums').length > 1, 'the checksums in several pages');
    assert.ok(calls.filter((c) => c.call === 'read').length > 2, 'the components in several answers');
    assert.deepEqual(j.body, whole.body, 'joined in the file\'s order, as one answer gives');
    assert.equal(j.read, j.of); assert.equal(j.reused, 0);
    assert.ok(j.body.components.tile1x8 && (kind === 'effects' ? j.body.components.mark0x3.effects : j.body.components.tile1x8[0].trigger === 'ON_HOVER'));
    if (kind === 'motion') assert.deepEqual(j.body.overlays.map((o) => o.component), ['cardTile'], 'the overlay a page opens, once');
    assert.ok(!existsSync(join(dir, `${kind}-pass.json`)), 'the pass is closed once all are held');
    assert.equal(Object.keys(readKept(dir, kind)).length, j.of, 'each component\'s record kept for the next capture');
  });

  test(`${kind}: a later capture reads again only the components whose checksum changed, the rest reused and checked`, async () => {
    const figma = fakeFigma(), dir = tempDir(`again-${kind}-`);
    await capture(kind, figma, dir, 500);
    // A designer changes one tile's hover transition and one mark's shadow.
    const tile = figma.pages[1].sets[4];
    tile.children[0].reactions[0].actions[0].transition.duration = 0.35;
    tile.children[0].effects = [{ ...tile.children[0].effects[0], radius: 12 }];
    figma.pages[0].solo[2].effects = [{ ...figma.pages[0].solo[2].effects[0], radius: 9 }];
    const calls = [], j = await capture(kind, figma, dir, 500, { calls });
    const reads = calls.filter((c) => c.call === 'read');
    const changed = kind === 'effects' ? ['0:2:m', '1:4'] : ['1:4'];
    assert.equal(reads.length, 1, 'one read');
    assert.deepEqual(reads[0].ids.sort(), changed.sort(), 'only what changed is read again');
    assert.equal(j.read, changed.length); assert.equal(j.reused, j.of - changed.length);
    const fresh = await capture(kind, figma, tempDir(`fresh-${kind}-`), 1e9);
    assert.deepEqual(j.body, fresh.body, 'the same as a capture that reads everything');
    // A kept record edited by hand no longer matches its checksum: it is read again, never used.
    const f = join(dir, `${kind}-kept.json`), kept = JSON.parse(readFileSync(f, 'utf8'));
    kept.items['0:5'].r.name = 'acmeTile';
    writeFileSync(f, JSON.stringify(kept));
    const calls2 = [], k = await capture(kind, figma, dir, 500, { calls: calls2 });
    assert.deepEqual(calls2.filter((c) => c.call === 'read').flatMap((c) => c.ids), ['0:5']);
    assert.deepEqual(k.body, fresh.body);
  });
}

test('an answer cut or edited, a page of checksums out of order, or Figma changed in between: refused or read again', async () => {
  const figma = fakeFigma(), dir = tempDir('refused-');
  const kind = 'effects', script = (step) => effectsCaptureScript(null, { ...step, budget: 600 });
  const first = startChunks(dir, kind);
  const sums = await run(script(first), figma);
  assert.ok(sums.next, 'more than one page');
  const step = takeAnswer(dir, kind, JSON.stringify(sums));
  assert.equal(step.call, 'sums');
  assert.match(takeAnswer(dir, kind, JSON.stringify(sums)).error, /starts at page 1, item 1, but the next to read starts at page 1, item \d+/);
  // The rest of the checksums, then a read whose record was edited while it was saved.
  let s = step;
  while (s.call === 'sums') s = takeAnswer(dir, kind, JSON.stringify(await run(script(s), figma)));
  assert.equal(s.call, 'read');
  const read = await run(script(s), figma);
  const edited = JSON.parse(JSON.stringify(read)); edited.items[0][2].rec.opacity = 0.5;
  assert.match(takeAnswer(dir, kind, JSON.stringify(edited)).error, /does not match its checksum/);
  // Figma changes after the checksums were read: what was read is kept and the checksums are read again.
  figma.pages[0].sets[0].children[0].effects = [];
  const r = takeAnswer(dir, kind, `The tool returned:\n${JSON.stringify(await run(script(s), figma))}\n`);
  assert.deepEqual(r.restart, { changed: ['0:0'], gone: [] });
  assert.deepEqual(r.start, { page: 0, item: 0 });
  // A whole answer from a script that reads all at once is taken as it is; one of the script before this version is not.
  assert.deepEqual(takeAnswer(dir, kind, JSON.stringify({ components: { cardTile: {} } })), { done: true, whole: true, body: { components: { cardTile: {} } } });
  assert.match(takeAnswer(dir, kind, JSON.stringify({ components: {}, start: { page: 0, item: 0 }, next: null })).error, /before this version/);
  assert.match(takeAnswer(dir, kind, '{"x":1}').error, /not an answer of the effects capture script/);
  assert.match(takeAnswer(dir, kind, JSON.stringify({ capture: 'effects', kind: 'read', items: [] })).error, /no effects capture started/);
});

test('--figma-effects writes each next script until all are read, then keeps the snapshot; the next capture reads only what changed', async () => {
  const dir = tempDir('cli-effects-');
  writeFileSync(join(dir, 'ds-config.json'), JSON.stringify({ paths: { snapshotVars: 'src/figma-vars.snapshot.json' } }));
  const cli = (...args) => spawnSync(process.execPath, [join(ENGINE, 'audit.mjs'), ...args], { cwd: dir, encoding: 'utf8', env: { ...process.env, NO_COLOR: '1' } });
  const cap = join(dir, '.design-system-engine-out', 'figma-capture');
  const figma = fakeFigma();
  const all = async () => {
    const out = [cli('--figma-effects').stdout];
    for (let n = 0; n < 20 && !/read from Figma →/.test(out.at(-1)); n++) {
      writeFileSync(join(cap, 'effects.json'), JSON.stringify(await run(readFileSync(join(cap, 'effects-capture.js'), 'utf8'), figma)));
      const r = cli('--figma-effects', join('.design-system-engine-out', 'figma-capture', 'effects.json'));
      assert.equal(r.status, 0, r.stdout + r.stderr);
      out.push(r.stdout);
    }
    return out;
  };
  const one = await all();
  assert.match(one[0], /It reads each component's checksum first, then only the components that changed since the last capture/);
  assert.match(one.join('\n'), /✓ the checksums of 42 components read: 42 to read\./);
  assert.match(one.at(-1), /✓ every checksum matches: 42 components read\.\n✓ the effects of 42 components read from Figma → src\/figma-effects\.snapshot\.json/);
  const snap = JSON.parse(readFileSync(join(dir, 'src/figma-effects.snapshot.json'), 'utf8'));
  assert.equal(snap.components.mark1x2.effects[0].y, 4);
  figma.pages[1].solo[2].effects = [{ ...figma.pages[1].solo[2].effects[0], offset: { x: 0, y: 6 } }];
  const two = await all();
  assert.match(two.join('\n'), /1 to read, 41 unchanged since the last capture and kept/);
  assert.match(two.at(-1), /✓ every checksum matches: 1 component read, 41 unchanged since the last capture and kept\./);
  assert.equal(JSON.parse(readFileSync(join(dir, 'src/figma-effects.snapshot.json'), 'utf8')).components.mark1x2.effects[0].x, 0);
  assert.equal(JSON.parse(readFileSync(join(dir, 'src/figma-effects.snapshot.json'), 'utf8')).components.mark1x2.effects[0].y, 6);
});
