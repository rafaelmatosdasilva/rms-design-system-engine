// The Documentation page's rows a system with no intent layer can clear: its Do and don't written in Figma, the code or
// the contract; its properties in the engine's own contract; a text style's description.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, cpSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { guidanceView, tokenDescriptions, staticRole } from '../styleguide-data.mjs';
import { contextFrom } from '../prototype-context.mjs';
import { varsFromItems } from '../figma-capture.mjs';
import { readPage } from '../styleguide-files.mjs';
import { bareEnv, budget } from './helpers.mjs';

const ENGINE = dirname(dirname(fileURLToPath(import.meta.url)));

test('Do and don\'t lines are read from Figma, the code and the contract, each under its source', () => {
  const g = guidanceView({
    description: 'A filter.\nDo: keep its label short.\nDo not: put two choices in one.\nWhen not to use: for links.',
    note: 'Do and don\'t\n- Do: one per row\n- Don\'t: nest them',
    authored: { doDont: ['Do: say what it filters', 'Don\'t: hide it'] },
  });
  assert.deepEqual(g.doDont.text, ['Do: keep its label short.', 'Don\'t: put two choices in one.'], 'Do not: reads as Don\'t:');
  assert.equal(g.doDont.from, 'Figma');
  assert.deepEqual(g.doDont.also.map((a) => [a.from, a.text]), [['the code', ['Do: one per row', 'Don\'t: nest them']], ['contract.authored.json', ['Do: say what it filters', 'Don\'t: hide it']]]);
  // A Do: line never runs into the section before it, and the four sections read as before.
  assert.deepEqual(g.sections.find((s) => s.key === 'whenNotToUse').text, ['for links.']);
  assert.deepEqual(guidanceView({ description: 'Limitations: one line only.\nDo: keep it short.' }).sections.find((s) => s.key === 'limitations').text, ['one line only.']);
  // "Do not use it when" and "Don't use it for" stay When not to use; nothing written, no Do and don't.
  assert.equal(guidanceView({ description: 'Do not use it when: a list.' }).doDont, undefined);
  assert.deepEqual(guidanceView({ description: 'Do not use it when: a list.' }).sections[1].text, ['a list.']);
  assert.deepEqual(guidanceView({ authored: { doDont: '- Do: one\n- do not: two' } }).doDont.text, ['Do: one', 'Don\'t: two'], 'a string, one line each');
});

test('a plain element at a component\'s root, with nothing to press, type in or go to, has no role: read from its code', () => {
  assert.deepEqual(staticRole('<span class="badge high"><span class="badge-label">High</span></span>'), { tag: 'span' });
  assert.deepEqual(staticRole('<!-- a card -->\n<div class="card"><button>Go</button></div>'), { tag: 'div' }, 'a container is plain, whatever it holds');
  assert.equal(staticRole('<button class="chip">x</button>'), null, 'a control');
  assert.equal(staticRole('<div class="node" tabindex="0">x</div>'), null, 'a Tab stop');
  assert.equal(staticRole('<div role="status">x</div>'), null, 'a role said');
  assert.equal(staticRole('<span onclick="go()">x</span>'), null, 'a click handler');
  assert.equal(staticRole('<nav class="tabs"></nav>'), null, 'a landmark');
  assert.equal(staticRole(''), null);
});

test('an agent composing a prototype reads the Do: and Don\'t: lines beside the pictures\' captions', () => {
  const cat = { components: { chip: { description: 'A filter.\nDo: one filter per chip.', props: {} } } };
  const intent = { components: { chip: { design: { annotations: [] }, code: {} } } };
  const authored = { components: { chip: { guidance: { doDont: ['Don\'t: a sentence in a chip'] } } } };
  const ctx = contextFrom(cat, intent, null, { authored, examples: { chip: [{ kind: 'do', caption: 'Chips above the list' }] } });
  assert.deepEqual(ctx.components.chip.dos, ['Chips above the list', 'one filter per chip.']);
  assert.deepEqual(ctx.components.chip.donts, ['a sentence in a chip']);
  assert.ok(ctx.components.chip.never.some((n) => n.sentence === 'Don\'t: a sentence in a chip'), 'a Don\'t rules a use out');
});

test('a text style\'s description is kept from the capture and read as its token\'s', async () => {
  const items = [
    { k: 'collection', id: 'c1', v: { id: 'c1', name: 'Sizing', modes: [{ modeId: 'm1', name: 'Default' }], variableIds: ['v1'] } },
    { k: 'var', id: 'v1', v: { id: 'v1', name: 'gap/m', resolvedType: 'FLOAT', variableCollectionId: 'c1', valuesByMode: { m1: 8 }, scopes: ['GAP'], description: 'Space between items.', remote: false } },
    { k: 'text', id: 's1', v: { id: 's1', name: 'body/m', fontSize: 14, fontName: { family: 'Inter', style: 'Regular' }, lineHeight: { unit: 'PIXELS', value: 20 }, letterSpacing: { unit: 'PIXELS', value: 0 }, paragraphSpacing: 0, textCase: 'ORIGINAL', boundVariables: {}, description: 'Body text.' } },
    { k: 'text', id: 's2', v: { id: 's2', name: 'label', fontSize: 11, fontName: { family: 'Inter', style: 'Medium' }, lineHeight: { unit: 'AUTO' }, letterSpacing: { unit: 'PIXELS', value: 0 }, paragraphSpacing: 0, textCase: 'ORIGINAL', boundVariables: {}, description: '' } },
  ];
  const snap = await varsFromItems(items, {});
  assert.deepEqual(snap.textStyleMeta, { 'body/m': { description: 'Body text.', deprecated: false } }, 'a style with no description is left out');
  const said = tokenDescriptions(snap);
  assert.equal(said('text style body/m'), 'Body text.');
  assert.equal(said('text style m'), 'Body text.', 'by its short name too');
  assert.equal(said('text style label'), '');
  assert.equal(said('gap/m'), 'Space between items.');
  assert.equal(tokenDescriptions({ tokenMeta: { 'brand/color': { description: 'Brand.' } } })('brand'), 'Brand.', 'a colour by its name without /color');
});

test('with no intent layer, a component\'s Do and don\'t and its properties in the engine\'s contract are written, never to do', { timeout: budget(300000) }, async (t) => {
  const { findChrome, launchChrome, connectCDP, openPage, waitForTrue, FILE_PAGE_LOADED } = await import('../cdp.mjs');
  const chromePath = findChrome({ playwright: true });
  if (!chromePath || typeof WebSocket === 'undefined') { t.skip('no Chrome'); return; }
  const dir = mkdtempSync(join(tmpdir(), 'doc-rows-'));
  cpSync(join(ENGINE, 'test', 'fixtures', 'harbor-ds'), dir, { recursive: true });
  const authored = JSON.parse(readFileSync(join(dir, 'contract.authored.json'), 'utf8'));
  authored.components.button.guidance = { doDont: ['Do: one per form', 'Don\'t: two side by side'] };
  writeFileSync(join(dir, 'contract.authored.json'), JSON.stringify(authored, null, 2));
  mkdirSync(join(dir, 'contracts'), { recursive: true });
  writeFileSync(join(dir, 'contracts', 'button.contract.json'), JSON.stringify({ id: 'button', props: [{ name: 'variant' }, { name: 'size' }] }));
  const r = spawnSync(process.execPath, [join(ENGINE, 'audit.mjs'), '--styleguide', '--no-a11y-bake'], { cwd: dir, encoding: 'utf8', env: { ...bareEnv(), NO_COLOR: '1', CI: '1' }, timeout: budget(250000) });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const file = join(dir, '.design-system-engine-out', 'styleguide', 'index.html');
  const data = JSON.parse(/<script type="application\/json" id="sg-data">([\s\S]*?)<\/script>/.exec(readPage(file))[1]);
  assert.equal(data.components.find((c) => c.name === 'button').guidance.doDont.from, 'contract.authored.json');
  const c = await launchChrome(chromePath);
  const { send, close } = await connectCDP(c.wsUrl);
  try {
    const { sessionId } = await openPage(send, 'file://' + file + '#c-button');
    assert.ok(await waitForTrue(send, sessionId, FILE_PAGE_LOADED, { attempts: 400 }));
    const run = async (expression) => (await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }, sessionId)).result.value;
    assert.ok(await waitForTrue(send, sessionId, '!!document.querySelector("#c-button .pg-knowledge tbody tr")', { attempts: 400, tolerateErrors: true }));
    const rows = await run(`JSON.stringify([...document.querySelectorAll('#c-button .pg-knowledge tbody tr')].map((tr) => [tr.cells[1].textContent.trim(), tr.dataset.status, tr.cells[2].textContent.trim()]))`);
    const of = (kind) => JSON.parse(rows).find((x) => x[0] === kind);
    assert.deepEqual(of('Do and don\'t').slice(1), ['done', 'Contract'], 'written in the contract: done, its source named');
    assert.equal(of('Properties')[1], 'done', 'the engine\'s own contract is the one every agent reads');
    // A component with nothing written: still to write.
    await run(`location.hash = '#c-badge'`);
    assert.ok(await waitForTrue(send, sessionId, '!!document.querySelector("#c-badge .pg-knowledge tbody tr")', { attempts: 400, tolerateErrors: true }));
    const how = await run(`(() => { const tr = [...document.querySelectorAll('#c-badge .pg-knowledge tbody tr')].find((x) => /Do and don't/.test(x.cells[1].textContent)); return tr ? tr.dataset.status : 'none'; })()`);
    assert.equal(how, 'todo', 'nothing written for badge: still to write');
    const role = await run(`(() => { const tr = [...document.querySelectorAll('#c-badge .pg-knowledge tbody tr')].find((x) => x.cells[1].textContent.trim() === 'Role'); return tr ? tr.dataset.status + '|' + tr.cells[2].textContent.trim() : 'none'; })()`);
    assert.equal(role, 'done|Code', 'its root a plain span: no role, read from the code');
  } finally { close(); c.kill(); }
  const tpl = readFileSync(join(ENGINE, 'templates', 'styleguide.template.html'), 'utf8');
  assert.match(tpl, /'Do and don\\'t': 'Write it in any one place the engine reads, each line starting with Do: or Don\\'t:[^']*' \+ \(DATA\.intentLayer \? [^)]*\) \+ 'its description in Figma; the comment above its rule in the code; or contract\.authored\.json under guidance\.doDont\./);
});
