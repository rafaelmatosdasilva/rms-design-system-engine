// A team's own Storybook, built with real Storybook, as the pages the browser checks run on: parity, accessibility and
// behaviours, each story read as the Figma variant its args show.
//
// The stories are Harbor's (test/fixtures/harbor-stories, laid over harbor-ds), built with the Storybook pinned here
// the way CI installs it:
//   npm ci --prefix test/.storybook-tools
// Nothing here is a stand-in for Storybook: the index, the pages and the args are what `storybook build` wrote.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync, spawn } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, symlinkSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { findChrome } from '../lib/cdp.mjs';
import { budget, fixtureProject } from './helpers.mjs';

const ENGINE = dirname(dirname(fileURLToPath(import.meta.url)));
const TOOLS = join(ENGINE, 'test', '.storybook-tools', 'node_modules');
const CHROME = findChrome({ playwright: true });
const READY = CHROME && typeof WebSocket !== 'undefined' && existsSync(join(TOOLS, 'storybook')) && existsSync(join(TOOLS, '@storybook', 'vue3-vite'))
  ? false : 'no Chrome, or no Storybook build tools (npm ci --prefix test/.storybook-tools)';

const run = (dir, script, args = []) => spawnSync(process.execPath, [join(ENGINE, 'lib', script), ...args], {
  cwd: dir, encoding: 'utf8', env: { ...process.env, NO_COLOR: '1', CHROME_PATH: CHROME }, timeout: budget(280000) });

// Harbor with its stories, and a disclosure a team added: Figma's annotation gives it its role, and only a page that
// runs its script can open it. Built once, as a team's CI builds it, and read by every test below.
let dir = null, a11y = null, said = '';
before(async () => {
  if (READY) return;
  dir = fixtureProject(join(ENGINE, 'test', 'fixtures', 'harbor-ds'), 'storybook-real-', { overlay: join(ENGINE, 'test', 'fixtures', 'harbor-stories') });
  const props = join(dir, 'figma', 'props.snapshot.json');
  writeFileSync(props, JSON.stringify({ ...JSON.parse(readFileSync(props, 'utf8')), disclosure: { nodeId: '9:1', properties: {}, annotations: [{ label: 'Role: disclosure' }] } }, null, 2));
  // Figma draws a Large button taller than the default: the Large story is held to that variant, and the code, which
  // draws every size at 36px, differs there.
  const structure = join(dir, 'figma', 'structure.snapshot.json'), st = JSON.parse(readFileSync(structure, 'utf8'));
  st.components.button.variants['variant=Primary, size=Large'] = { h: 44 };
  writeFileSync(structure, JSON.stringify(st, null, 2));
  symlinkSync(TOOLS, join(dir, 'node_modules'), 'dir');
  const built = spawnSync(join(TOOLS, '.bin', 'storybook'), ['build', '-o', 'storybook-static', '--quiet'], {
    cwd: dir, encoding: 'utf8', env: { ...process.env, STORYBOOK_DISABLE_TELEMETRY: '1', NO_COLOR: '1' }, timeout: budget(240000) });
  assert.equal(built.status, 0, `storybook build: ${built.stderr || built.stdout}`.slice(0, 1500));
  const r = run(dir, 'a11y-check.mjs', ['--json-out', join(dir, 'a11y.json')]);
  said = `${r.stdout}\n${r.stderr}`;
  a11y = JSON.parse(readFileSync(join(dir, 'a11y.json'), 'utf8'));
});

test('a Storybook built to files is found with nothing set up, and its stories are the pages checked', { skip: READY, timeout: budget(600000) }, () => {
  assert.match(said, /reading the Storybook built in storybook-static on \d{4}-\d{2}-\d{2}/, said.slice(0, 800));
  assert.match(said, /11 page\(s\) found — checking 11, covering 4 of 4 components/);
  for (const page of ['Button · Primary', 'Badge · Danger', 'IconButton · Default', 'Disclosure · Closed']) assert.ok(a11y.target.includes(page), page);
});

// The args are Storybook's own, read from the page it drew: nothing here parses a story file.
test("each story's args are read from the page Storybook drew, as the Figma variant they are", { skip: READY, timeout: budget(600000) }, () => {
  const of = (label) => a11y.stories.find((s) => `${s.component} · ${s.state}` === label);
  assert.deepEqual(of('Button · Large').args, { size: 'Large', label: 'Continue' });
  assert.equal(of('Button · Large').variant, 'size=Large');
  assert.equal(of('Button · Secondary').variant, 'variant=Secondary');
  assert.equal(of('Badge · Danger').variant, 'Tone=Danger', 'tone in the code, Tone in Figma: the same property');
  for (const s of a11y.stories.filter((x) => !['Button · Loading', 'Button · Huge'].includes(`${x.component} · ${x.state}`))) assert.deepEqual(s.missing, [], `${s.component} · ${s.state}`);
});

test('a story that shows a state Figma has no variant for is named, and only those', { skip: READY, timeout: budget(600000) }, () => {
  const lines = said.split('\n').filter((l) => l.includes('[stories]'));
  assert.equal(lines.length, 2, lines.join('\n'));
  assert.match(lines.find((l) => l.includes('Button · Loading')) ?? '', /shows loading, a state Figma never draws for it/);
  assert.match(lines.find((l) => l.includes('Button · Huge')) ?? '', /size=Huge, which Figma's size does not list \(it has Small, Large\)/);
  assert.deepEqual(a11y.stories.find((s) => s.state === 'Huge').missing, [{ arg: 'size', value: 'Huge', prop: 'size', options: ['Small', 'Large'] }]);
});

// A behaviour needs the component's own script, which a story runs. That it passed is recorded too: a passing behaviour
// leaves no finding, so otherwise a behaviour never tried would read the same as one that worked.
test('behaviours run on a story: the disclosure opens there, as only its own script can open it', { skip: READY, timeout: budget(600000) }, () => {
  const tried = (a11y.behaviours ?? []).find((b) => b.page === 'Disclosure · Closed' && b.component === 'disclosure');
  assert.ok(tried, JSON.stringify(a11y.behaviours));
  assert.equal(tried.behaviour, 'click-expand');
  assert.equal(tried.ok, true);
});

// A story's play function is the team's own script of a person using it: run as the page draws it, each one tried is
// recorded, and one that fails is a behaviour that breaks, with what Storybook said.
test("a story's play function is a behaviour tried: Opens passes, Closes On Escape fails with its own words", { skip: READY, timeout: budget(600000) }, () => {
  const play = (state) => (a11y.behaviours ?? []).find((b) => b.page === `Disclosure · ${state}` && b.behaviour === 'play');
  assert.equal(play('Opens')?.ok, true, JSON.stringify(a11y.behaviours));
  assert.equal(play('Closes On Escape')?.ok, false, 'Storybook names it from its export, word by word');
  assert.equal(play('Closed'), undefined, 'a story with no play function has none to try');
  const found = JSON.stringify(a11y).match(/Disclosure: the Closes On Escape story's play function \(the team's own script of a person using it\) fails: [^"]*/)?.[0] ?? '';
  assert.match(found, /Escape did not close the disclosure\./, JSON.stringify(a11y).slice(0, 2000));
  assert.doesNotMatch(JSON.stringify(a11y), /the Opens story's play function[^"]*fails/);
});

// Parity reads the code capture. Harbor has no built page and no style guide, so before its stories every component was
// a bare element of its class, measured without its content. Each is now measured where the team draws it.
test('parity measures each component on its own story when nothing else draws it', { skip: READY, timeout: budget(600000) }, () => {
  const r = run(dir, 'code-capture.mjs', ['--force']);
  assert.equal(r.status, 0, `${r.stdout}\n${r.stderr}`.slice(0, 1500));
  assert.doesNotMatch(r.stdout, /browser reading failed/);
  const snap = JSON.parse(readFileSync(join(dir, '.design-system-engine-out', 'code.snapshot.json'), 'utf8'));
  assert.equal(snap.components.button.instance.page, 'Storybook · Button · Primary');
  assert.equal(snap.components.badge.instance.page, 'Storybook · Badge · Neutral');
  assert.equal(snap.components.iconButton.instance.page, 'Storybook · IconButton · Default');
  assert.equal(snap.components.button.props.height.value, '36px', "Figma's button is 36px high");
  assert.equal(snap.components.button.props.height.confidence, 'verified', 'the browser and the CSS agree');
  assert.equal(snap.components.badge.props.height.value, '20px');
});

// Parity used to measure a component on its first story only. Each other story is now measured as its story draws it,
// and held to the Figma variant its args show.
test('each story is compared with its own Figma variant: Button · Large against size=Large', { skip: READY, timeout: budget(600000) }, async () => {
  const snap = JSON.parse(readFileSync(join(dir, '.design-system-engine-out', 'code.snapshot.json'), 'utf8'));
  const b = snap.components.button;
  assert.deepEqual(b.instance.story, { state: 'Primary', variant: 'variant=Primary', default: true }, 'the base is measured on a story that shows the default variant');
  assert.equal(b.stories.Large.variant, 'size=Large');
  assert.equal(b.stories.Secondary.variant, 'variant=Secondary');
  assert.equal(b.stories.Large.size.height, 36, 'measured as the story draws it');
  assert.equal(b.stories.Huge, undefined, 'a story showing only what Figma lacks has nothing to be held to: the run names it instead');
  const { compareComponents } = await import('../lib/capture-compare.mjs');
  const vars = JSON.parse(readFileSync(join(dir, 'figma', 'vars.snapshot.json'), 'utf8'));
  const structure = JSON.parse(readFileSync(join(dir, 'figma', 'structure.snapshot.json'), 'utf8')).components;
  const maps = { EXPLICIT: {}, EXPLICIT_SIZING: {}, SKIP_TOKENS: new Set(), NULL_TOKENS: new Set(), KNOWN_NULL: new Set(), SIZING_SKIP: new Map(), TYPO: {} };
  const r = compareComponents(snap, structure, vars, JSON.parse(readFileSync(join(dir, 'ds-config.json'), 'utf8')), maps);
  const large = r.differ.find((d) => d.component === 'button' && d.field === 'height (size=Large, story Large)');
  assert.ok(large, JSON.stringify(r.differ.filter((d) => d.component === 'button')));
  assert.equal(large.figma, 44);
  assert.equal(large.code, '36px');
});

// A copy of a component's markup runs nothing, so a component that needs its own script never answered a click in the
// Playground. With a Storybook the Playground draws the team's story live: published beside the page, its args set by
// the controls through Storybook's own channel (one load, no reload), and Inspect drawn over the story itself.
test('the Playground draws the live story: its controls set the args, and Inspect reads the story where it is drawn', { skip: READY, timeout: budget(600000) }, async () => {
  const r = run(dir, 'audit.mjs', ['--styleguide', '--no-a11y-bake']);
  assert.equal(r.status === 0 || r.status === 1, true, `${r.stdout}\n${r.stderr}`.slice(-2000));
  const out = join(dir, '.design-system-engine-out', 'styleguide');
  assert.ok(existsSync(join(out, 'storybook', 'iframe.html')), 'the Storybook is published beside the page');
  const { readPage, copyPage } = await import('../lib/styleguide-files.mjs');
  const data = JSON.parse(readPage(join(out, 'index.html')).match(/id="sg-data">([\s\S]*?)<\/script>/)[1]);
  assert.deepEqual(data.storybook, { base: 'storybook/' });
  assert.deepEqual(data.components.find((c) => c.name === 'button').stories.map((s) => s.state), ['Primary', 'Secondary', 'Large', 'Loading', 'Huge']);
  // A publishing job's copy carries it, or every live story would be a blank frame.
  const pub = join(dir, 'published');
  assert.ok(copyPage(join(out, 'index.html'), pub).includes('storybook/'));
  assert.ok(existsSync(join(pub, 'storybook', 'iframe.html')));

  const { serveStatic } = await import('../lib/storybook-stories.mjs');
  const { launchChrome, connectCDP, openPage, waitForTrue } = await import('../lib/cdp.mjs');
  const server = await serveStatic(out), c = await launchChrome(CHROME);
  try {
    const { send, close } = await connectCDP(c.wsUrl);
    const { sessionId } = await openPage(send, `${server.url}/index.html#c-button?variant=Secondary`);
    const ev = async (e) => (await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true }, sessionId)).result?.value;
    const story = `(() => { const f = [...document.querySelectorAll('.pg-story-frame')].find((x) => x.offsetParent); const b = f && f.classList.contains('is-drawn') && f.contentDocument && f.contentDocument.querySelector('#storybook-root .hb-button'); return b ? b.className : null; })()`;
    assert.ok(await waitForTrue(send, sessionId, `/hb-button--secondary/.test(${story} || '')`, { attempts: 600, intervalMs: 50 }), `the story drawn as the control says: ${await ev(story)}`);
    const frame = await ev(`(() => { const f = [...document.querySelectorAll('.pg-story-frame')].find((x) => x.offsetParent); return { h: parseFloat(f.style.height), body: Math.ceil(f.contentDocument.body.getBoundingClientRect().height), src: f.getAttribute('src') }; })()`);
    assert.equal(frame.h, frame.body, 'the frame is as tall as its story');
    assert.match(frame.src, /^storybook\/iframe\.html\?id=components-button--primary/, 'one story, its args set by the controls, never another page loaded');
    await ev(`[...document.querySelectorAll('.pg-stage-tools button')].find((b) => b.offsetParent && /Inspect/.test(b.textContent)).click()`);
    const hits = `(() => { const a = [...document.querySelectorAll('.pg-anatomy--live')].find((x) => x.offsetParent); return a ? [...a.querySelectorAll('[data-hit]')].map((h) => h.getAttribute('data-hit')) : []; })()`;
    assert.ok(await waitForTrue(send, sessionId, `${hits}.includes('part 0 button')`, { attempts: 200, intervalMs: 50 }), JSON.stringify(await ev(hits)));
    close();
  } finally { c.kill(); await server.close(); }
});

test('a Storybook the team hosts at another address: its controls set the story through its own channel, Inspect reads the copy', { skip: READY, timeout: budget(600000) }, async () => {
  const { serveStatic } = await import('../lib/storybook-stories.mjs');
  const { launchChrome, connectCDP, openPage, waitForTrue } = await import('../lib/cdp.mjs');
  const hosted = await serveStatic(join(dir, 'storybook-static'));
  const cfgFile = join(dir, 'ds-config.json'), was = readFileSync(cfgFile, 'utf8');
  // No build beside the code (storybook.static names none): the address is all the page has.
  writeFileSync(cfgFile, JSON.stringify({ ...JSON.parse(was), storybook: { url: hosted.url, static: 'no-build-here' } }, null, 2));
  let server = null, c = null;
  try {
    // Run beside this process, never blocking it: the address it reads is served from here.
    const r = await new Promise((ok) => {
      const p = spawn(process.execPath, [join(ENGINE, 'lib', 'audit.mjs'), '--styleguide', '--no-a11y-bake'], { cwd: dir, env: { ...process.env, NO_COLOR: '1', CHROME_PATH: CHROME } });
      let said = ''; p.stdout.on('data', (d) => { said += d; }); p.stderr.on('data', (d) => { said += d; });
      p.on('close', (status) => ok({ status, said }));
    });
    assert.equal(r.status === 0 || r.status === 1, true, r.said.slice(-2000));
    const out = join(dir, '.design-system-engine-out', 'styleguide');
    const { readPage } = await import('../lib/styleguide-files.mjs');
    const data = JSON.parse(readPage(join(out, 'index.html')).match(/id="sg-data">([\s\S]*?)<\/script>/)[1]);
    assert.deepEqual(data.storybook, { base: `${hosted.url}/`, hosted: true }, r.said.slice(-1500));
    assert.ok(!existsSync(join(out, 'storybook')), 'nothing copied: the stories load from where the team hosts them');
    assert.deepEqual(data.components.find((x) => x.name === 'button').stories.map((s) => s.state), ['Primary', 'Secondary', 'Large', 'Loading', 'Huge']);
    server = await serveStatic(out); c = await launchChrome(CHROME);
    assert.notEqual(new URL(server.url).origin, new URL(hosted.url).origin);
    const { send, close } = await connectCDP(c.wsUrl);
    const { sessionId } = await openPage(send, `${server.url}/index.html#c-button?variant=Secondary`);
    const ev = async (e) => (await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true }, sessionId)).result?.value;
    const shown = `(() => { const f = [...document.querySelectorAll('.pg-story-frame')].find((x) => x.offsetParent); return !!f && f.classList.contains('is-drawn') && parseFloat(f.style.height) > 0; })()`;
    assert.ok(await waitForTrue(send, sessionId, shown, { attempts: 600, intervalMs: 50 }), 'the story drawn, and sized from the copy');
    assert.equal(await ev(`(() => { try { return [...document.querySelectorAll('.pg-story-frame')].find((x) => x.offsetParent).contentDocument; } catch (e) { return 'refused'; } })()`), null, 'the page cannot read it');
    // What the story drew, read where it is, in its own frame: the control's Secondary, sent through Storybook's channel.
    const inStory = async () => {
      const { frameTree } = await send('Page.getFrameTree', {}, sessionId);
      const f = (frameTree.childFrames ?? []).map((x) => x.frame).find((x) => x.url.startsWith(hosted.url));
      if (!f) return '';
      const { executionContextId } = await send('Page.createIsolatedWorld', { frameId: f.id }, sessionId);
      return (await send('Runtime.evaluate', { expression: `(document.querySelector('#storybook-root .hb-button') || {}).className || ''`, contextId: executionContextId, returnByValue: true }, sessionId)).result?.value ?? '';
    };
    let cls = '';
    for (let i = 0; i < 200 && !/hb-button--secondary/.test(cls); i++) { cls = await inStory(); if (!/hb-button--secondary/.test(cls)) await new Promise((ok) => setTimeout(ok, 50)); }
    assert.match(cls, /hb-button--secondary/, 'the story drawn as the control says');
    await ev(`[...document.querySelectorAll('.pg-stage-tools button')].find((b) => b.offsetParent && /Inspect/.test(b.textContent)).click()`);
    const line = `([...document.querySelectorAll('.pg-anat-line')].find((x) => x.offsetParent) || {}).textContent || ''`;
    assert.ok(await waitForTrue(send, sessionId, `/at another address/.test(${line})`, { attempts: 200, intervalMs: 50 }), await ev(line));
    const hits = `(() => { const a = [...document.querySelectorAll('.pg-anatomy')].find((x) => x.offsetParent); return a ? a.querySelectorAll('[data-hit]').length : 0; })()`;
    assert.ok(await waitForTrue(send, sessionId, `${hits} > 0`, { attempts: 200, intervalMs: 50 }), 'Inspect marks the copy');
    close();
  } finally { writeFileSync(cfgFile, was); c?.kill(); await server?.close(); await hosted.close(); }
});
