// A model judges each Showroom screen against its brief, only when asked (page-judgment.mjs). The model is never
// called here: every answer comes from a stand-in for the person's command.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { decisionsFrom, decisionsFor, judgmentPrompt, parseAnswer, parseJudgment, judgePages, judgmentLine, judgmentLines, showroomReviews, outline, componentsOf, captureShots, RESULT_FILE, CACHE_FILE, DEFAULT_CMD } from '../lib/page-judgment.mjs';
import { proposedRules, proposalFor } from '../lib/lessons.mjs';
import { route } from '../lib/route.mjs';
import { tempDir, fixtureProject, budget } from './helpers.mjs';
import { readPage } from '../lib/styleguide-files.mjs';

const ENGINE = dirname(dirname(fileURLToPath(import.meta.url)));
const DEMO = fileURLToPath(new URL('./fixtures/demo-ds', import.meta.url));
const SCREEN = (title, extra = '') => `import { Button } from '../src/components/Button.jsx';
export default function ${title}() {
  return (<main>
    <h1>${title}</h1>
    <Button label="Pay" variant="primary" />
    <Button label="Delete account" variant="danger" />${extra}
  </main>);
}
`;
// Three screens, each with a picture of its own (only its bytes matter: they are hashed, never drawn here).
const demoWith = (screens, { pictures = true } = {}) => {
  const root = tempDir('page-judgment-');
  cpSync(DEMO, root, { recursive: true });
  mkdirSync(join(root, 'showroom'), { recursive: true });
  for (const [name, { code, meta, brief }] of Object.entries(screens)) {
    writeFileSync(join(root, 'showroom', `${name}.jsx`), code ?? SCREEN(name));
    if (meta) writeFileSync(join(root, 'showroom', `${name}.json`), JSON.stringify(meta));
    if (brief) writeFileSync(join(root, 'showroom', `${name}.brief.md`), brief);
    if (pictures) writeFileSync(join(root, 'showroom', `${name}.png`), Buffer.from(`picture of ${name}`));
  }
  return root;
};
const cfgOf = (root) => JSON.parse(readFileSync(join(root, 'ds-config.json'), 'utf8'));
// The person's command, as claude -p --output-format json prints it: the answer, and what it cost.
const answer = (findings, cost = 0.04) => JSON.stringify({ type: 'result', subtype: 'success', is_error: false, result: JSON.stringify({ findings }), total_cost_usd: cost });
const breaksPrimary = [
  { decision: 'component', verdict: 'holds', severity: 'low', evidence: 'Each part is the system\'s own button.', check: 'Every button is the system\'s Button.' },
  { decision: 'primary', verdict: 'breaks', severity: 'high', evidence: 'Pay and Delete account read with the same weight, side by side.', check: 'Only Pay is filled.' },
  { decision: 'destructive', verdict: 'breaks', severity: 'high', evidence: 'Delete account is red and as large as Pay.', check: 'Delete account is a quiet button, after Pay.' },
];

test('the decisions judged are a fixed list: all by default, fewer when ds-config.json names them, never one of its own', () => {
  assert.deepEqual(decisionsFrom({}).decisions.map((d) => d.id), ['component', 'primary', 'destructive', 'layout']);
  const some = decisionsFrom({ pageJudgment: { decisions: ['primary', 'tone of voice', 'primary'] } });
  assert.deepEqual(some.decisions.map((d) => d.id), ['primary']);
  assert.deepEqual(some.unknown, ['tone of voice'], 'a name the engine does not judge is said, not asked');
  assert.match(some.decisions[0].rule, /one main action that reads first/, 'each with the rule a repeat proposes');
  // The layout is judged only against a brief.
  const all = decisionsFrom({}).decisions;
  assert.deepEqual(decisionsFor(all, { brief: null }).ask.map((d) => d.id), ['component', 'primary', 'destructive']);
  assert.deepEqual(decisionsFor(all, { brief: null }).unjudged, [{ decision: 'layout', label: 'Arranged as its brief says', why: 'no brief for this screen' }]);
  assert.equal(decisionsFor(all, { brief: 'Pay first.' }).ask.length, 4);
});

test('the prompt holds the screenshot, the code, what each component is for and the brief, and asks for JSON only', () => {
  const { decisions } = decisionsFrom({});
  const page = { children: [{ name: null, tag: 'main', attrs: {}, children: [
    { name: null, tag: 'div', attrs: {}, children: [{ name: 'buttonPrimary', tag: null, attrs: { variant: 'primary', onClick: 'pay' }, text: 'Pay', line: 4, children: [] }] },
    { name: 'buttonPrimary', tag: null, attrs: { variant: 'danger' }, text: 'Delete', line: 5, children: [] },
  ] }] };
  assert.deepEqual(componentsOf(page), ['buttonPrimary']);
  const o = outline(page);
  assert.match(o, /^<main>\n {2}buttonPrimary variant="primary" "Pay" {2}\(line 4\)\n {2}buttonPrimary variant="danger" "Delete" {2}\(line 5\)$/, 'a bare wrapper is left out; what decides how a part looks is kept');
  assert.doesNotMatch(o, /onClick/);
  const p = judgmentPrompt({ title: 'Checkout', file: 'showroom/Checkout.vue', shot: '/abs/shot.png', brief: 'Paying comes first.', components: [{ name: 'buttonPrimary', intent: 'The one main action of a screen.' }], outline: o }, decisions);
  assert.match(p, /read the image file at \/abs\/shot\.png/);
  assert.match(p, /Brief: \nPaying comes first\./);
  assert.match(p, /- buttonPrimary: The one main action of a screen\./);
  assert.match(p, /1\. component: The right component[\s\S]*4\. layout: Arranged as its brief says/);
  assert.match(p, /Answer with JSON only/);
  assert.match(p, /"decision":"component\|primary\|destructive\|layout"/);
  assert.match(judgmentPrompt({ title: 'X', shot: '/x.png', components: [], outline: '' }, decisions.slice(0, 1)), /Brief: none given[\s\S]*none of the system's components/);
});

test('the answer is read as the command printed it, and held to the rubric', () => {
  assert.deepEqual(parseAnswer(answer([], 0.0312)), { text: '{"findings":[]}', cost: 0.0312, error: null });
  assert.deepEqual(parseAnswer('{"findings":[]}'), { text: '{"findings":[]}', cost: null, error: null }, 'another command\'s plain answer: its cost is not known');
  assert.match(parseAnswer(JSON.stringify({ type: 'result', is_error: true, result: 'Credit balance is too low', total_cost_usd: 0 })).error, /Credit balance/);
  const { decisions } = decisionsFrom({ pageJudgment: { decisions: ['primary', 'destructive'] } });
  const got = parseJudgment('Here it is:\n```json\n' + JSON.stringify({ findings: [
    { decision: 'destructive', verdict: 'BREAKS', severity: 'high', evidence: 'Delete is red.', check: 'Delete is quiet.' },
    { decision: 'primary', verdict: 'holds', severity: 'loud', evidence: 'x'.repeat(900), check: 'Pay is filled.' },
    { decision: 'primary', verdict: 'breaks' },
    { decision: 'layout', verdict: 'breaks', severity: 'high', evidence: 'not asked', check: '' },
    { decision: 'component', verdict: 'maybe' },
  ] }) + '\n```', decisions);
  assert.deepEqual(got.map((f) => [f.decision, f.verdict, f.severity]), [['primary', 'holds', 'low'], ['destructive', 'breaks', 'high']], 'only the decisions asked, once each, in the rubric\'s order; a word not asked is taken as the default');
  assert.ok(got[0].evidence.length <= 400, 'its evidence kept short');
  assert.equal(got[1].label, 'Nothing destructive in front');
  assert.equal(parseJudgment('I think the page is fine.', decisions), null);
  assert.equal(parseJudgment('{"findings":[{"decision":"tone","verdict":"breaks"}]}', decisions), null);
});

test('--judge-pages: each screen judged once, kept by its screenshot and rubric, a repeat proposed as a rule, the cost said', async () => {
  const root = demoWith({ Checkout: {}, Settings: { meta: { title: 'Account settings' } }, Orders: { brief: 'The open orders first, then the past ones.' } });
  const cfg = cfgOf(root);
  const prompts = [];
  const ask = async (prompt) => { prompts.push(prompt); return { ok: true, out: answer(/brief/.test(prompt) && /Brief: \nThe open orders/.test(prompt) ? [...breaksPrimary, { decision: 'layout', verdict: 'holds', severity: 'low', evidence: 'Open orders lead.', check: 'Open orders come first.' }] : breaksPrimary) }; };
  const run = await judgePages(root, cfg, { ask, shoot: async () => { throw new Error('no screenshot is taken: each screen has its own picture'); }, now: '2026-11-01T10:00:00.000Z' });
  assert.equal(run.asked, 3);
  assert.equal(run.cached, 0);
  assert.equal(run.cost, 0.12);
  assert.deepEqual(run.screens.map((s) => s.screen), ['Checkout', 'Orders', 'Settings']);
  assert.equal(run.screens[2].title, 'Account settings');
  assert.deepEqual(run.screens[0].unjudged.map((u) => u.decision), ['layout'], 'no brief: its layout is not judged');
  assert.deepEqual(run.screens[1].unjudged, []);
  assert.match(prompts[0], new RegExp(`read the image file at ${join(root, 'showroom', 'Checkout.png').replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}`));
  assert.match(prompts[0], /Button label="Pay" variant="primary" {2}\(line 5\)/);
  assert.ok(existsSync(join(root, RESULT_FILE)) && existsSync(join(root, CACHE_FILE)));
  const line = judgmentLine(run);
  assert.match(line, /^⚖️ {2}Pages judged by a model: 3 screens, 6 decisions judged broken \(Checkout: one main action; Checkout: nothing destructive in front; Orders: one main action; …\)\. Advisory\. Cost \$0\.12 for 3 screens asked\.$/);
  const lines = judgmentLines(run);
  assert.match(lines.join('\n'), /Checkout {2}\(showroom\/Checkout\.jsx\): 2 decisions to look at\n {7}· One main action breaks \(high\): Pay and Delete account read with the same weight, side by side\. Check: Only Pay is filled\./);
  assert.match(lines.join('\n'), /Arranged as its brief says: not judged, no brief for this screen\./);
  // The same decision broken on three screens: a rule proposed for the guidelines, as the page review's are.
  const rules = proposedRules(root);
  const r = rules.find((x) => x.id === 'R-judge-primary');
  assert.ok(r, JSON.stringify(rules));
  assert.equal(r.times, 3);
  assert.equal(r.form, 'guideline');
  assert.equal(r.text, 'Each screen shows one main action that reads first; every other action looks secondary.');
  assert.ok(proposalFor(root, 'R-judge-destructive'), 'answerable by its id');
  assert.ok(!rules.some((x) => x.id === 'R-judge-component'), 'a decision that holds proposes nothing');

  // Run again: nothing changed, nothing asked, nothing paid; the repeat is not counted again.
  const again = await judgePages(root, cfg, { ask: async () => { throw new Error('asked again'); }, now: '2026-11-02T10:00:00.000Z' });
  assert.equal(again.asked, 0);
  assert.equal(again.cached, 3);
  assert.match(judgmentLine(again), /Cost 3 screens from the cache, nothing paid\.$/);
  assert.equal(proposedRules(root).find((x) => x.id === 'R-judge-primary').times, 3);

  // A new brief, or a new picture, is a new question: only that screen is asked.
  writeFileSync(join(root, 'showroom', 'Checkout.brief.md'), 'Paying is the one decision.');
  writeFileSync(join(root, 'showroom', 'Settings.png'), Buffer.from('a new picture of Settings'));
  const asked = [];
  const third = await judgePages(root, cfg, { ask: async (p) => { asked.push(/Screen: (.+?) \(/.exec(p)[1]); return { ok: true, out: '{"findings":[{"decision":"primary","verdict":"holds","severity":"low","evidence":"Pay leads.","check":"Pay is filled."}]}' }; } });
  assert.deepEqual(asked.sort(), ['Account settings', 'Checkout']);
  assert.equal(third.cached, 1);
  assert.equal(third.costKnown, false);
  assert.match(judgmentLine(third), /2 screens asked \(the command did not say what it cost\), 1 screen from the cache, nothing paid/);

  // The style guide reads the last judgment beside each screen's page review; nothing is asked there.
  const rv = await showroomReviews(root, cfg);
  assert.ok(rv.Checkout.review.score <= 10 && Array.isArray(rv.Checkout.review.findings));
  assert.equal(rv.Checkout.judged.findings[0].verdict, 'holds');
  assert.equal(rv.Orders.judged.findings.length, 4);
});

test('a screen with no picture and no built style guide is not judged, and the run says to build it; a failed answer is not kept', async () => {
  const root = demoWith({ Checkout: {}, Done: {} }, { pictures: false });
  writeFileSync(join(root, 'showroom', 'Done.png'), Buffer.from('picture of Done'));
  let n = 0;
  const run = await judgePages(root, cfgOf(root), { ask: async () => { n += 1; return { ok: true, out: 'Looks fine to me.' }; } });
  assert.equal(n, 1, 'only the screen with a picture is asked');
  assert.deepEqual(run.failed.map((f) => f.screen), ['Checkout', 'Done']);
  assert.match(run.failed[0].why, /no built style guide at \.design-system-engine-out\/styleguide\/index\.html/);
  assert.equal(run.failed[1].why, 'the answer was not the JSON asked for');
  assert.deepEqual(JSON.parse(readFileSync(join(root, CACHE_FILE), 'utf8')), {}, 'nothing kept: asked again next time');
  assert.match(judgmentLine(run), /^⚖️ {2}Pages not judged by a model: 2 screens could not be \(no built style guide at [^;]+; …\)\. Cost 1 screen asked \(the command did not say what it cost\)\.$/);
  // The command that could not run: said, with why.
  const down = await judgePages(root, cfgOf(root), { ask: async () => ({ ok: false, why: 'claude: command not found' }) });
  assert.equal(down.failed.find((f) => f.screen === 'Done').why, 'claude: command not found');
  // No Showroom at all: nothing to judge.
  assert.equal((await judgePages(tempDir('no-showroom-'), {}, { ask: async () => { throw new Error('asked'); } })).why, 'no Showroom screen to judge');
});

test('the default command reads only the screenshot, prints its price, and is asked from the project folder', async () => {
  assert.equal(DEFAULT_CMD, 'claude -p --output-format json --tools Read --allowedTools Read --strict-mcp-config');
  // pageJudgment.cmd: the person's own command, run in the project, the prompt on stdin (a stand-in that echoes JSON).
  const root = demoWith({ Done: { code: 'export default function Done() { return (<main><h1>Thank you</h1></main>); }\n' } });
  const script = join(root, 'answer.mjs');
  writeFileSync(script, `let s = ''; process.stdin.on('data', (d) => s += d).on('end', () => { if (!/Screenshot: read the image file at /.test(s)) process.exit(3); console.log(JSON.stringify({ result: JSON.stringify({ findings: [{ decision: 'primary', verdict: 'unclear', severity: 'low', evidence: 'No action on the screen.', check: 'There is one action, or none is needed.' }] }), total_cost_usd: 0.021, cwd: process.cwd() })); });`);
  const run = await judgePages(root, { ...cfgOf(root), pageJudgment: { cmd: `"${process.execPath}" answer.mjs`, decisions: ['primary'] } });
  assert.deepEqual(run.failed, []);
  assert.equal(run.cost, 0.021);
  assert.equal(run.screens[0].findings[0].verdict, 'unclear');
});

test('asked in Claude Code, judging the screens routes to --judge-pages; a prototype keeps its own route', () => {
  const P = { hasConfig: true, components: ['button'] };
  for (const t of ['judge the Showroom screens with a model', 'have a model judge our pages against their briefs', 'julga os ecrãs do showroom com um modelo']) assert.deepEqual(route(t, P).run, ['rms-design-system-engine --judge-pages'], t);
  assert.notDeepEqual(route('judge the prototype pages', P).run, ['rms-design-system-engine --judge-pages']);
  assert.match(readFileSync(join(ENGINE, 'docs', 'commands.md'), 'utf8'), /`\/rms-design-system-engine judge the Showroom screens with a model`/);
});

test('in the style guide: the page review under each screen, then the model\'s judgment, said to be one', () => {
  const tpl = readFileSync(join(ENGINE, 'templates', 'styleguide.template.html'), 'utf8');
  assert.match(tpl, /'<h3>Page review<\/h3><p class="sg-showroom-kind">Read from its code: '/);
  assert.match(tpl, /'<h3>Judged by a model<\/h3><p class="sg-showroom-kind">A model read its screenshot and its code against '/);
  assert.match(tpl, /Advisory: a person checks each one\./);
  assert.match(tpl, /window\.__dseShowroomJudge = function \(j\)/);
  assert.match(tpl, /\+ reviewHTML\(s\) \+ '<\/div>' \+/, 'under the screen, in its column');
  assert.match(readFileSync(join(ENGINE, 'lib', 'styleguide-gen.mjs'), 'utf8'), /showroomReviews\(ROOT, cfg\)/);
});

test('in the browser: a screen of the built style guide is shot at its size, and its page shows the review and the judgment', { timeout: budget(300000) }, async (t) => {
  const { findChrome, launchChrome, connectCDP, openPage, waitForTrue, FILE_PAGE_LOADED } = await import('../lib/cdp.mjs');
  const chromePath = findChrome({ playwright: true });
  if (!chromePath || typeof WebSocket === 'undefined') { t.skip('no Chrome'); return; }
  const dir = fixtureProject(join(ENGINE, 'test', 'fixtures', 'tidepool-figma'), 'pj-sg-');
  const ref = join(ENGINE, 'test', 'skill-evals', 'build-reference');
  for (const p of ['src/styles/tokens.css', 'src/components/chip.css', 'src/components/Chip.jsx']) { mkdirSync(dirname(join(dir, p)), { recursive: true }); writeFileSync(join(dir, p), readFileSync(join(ref, p), 'utf8')); }
  const b = spawnSync(process.execPath, [join(ENGINE, 'lib', 'audit.mjs'), '--styleguide', '--no-a11y-bake'], { cwd: dir, encoding: 'utf8', env: { ...process.env, NO_COLOR: '1' } });
  assert.equal(b.status, 0, b.stdout + b.stderr);
  // A Showroom screen in the page's data, as a build that drew one writes it, with its review and a judgment.
  const file = join(dir, '.design-system-engine-out', 'styleguide', 'index.html');
  const html = readPage(file);
  const tag = /<script type="application\/json" id="sg-data">([\s\S]*?)<\/script>/;
  const data = JSON.parse(tag.exec(html)[1]);
  data.showroom = [{ key: 'Checkout', title: 'Checkout', size: [640, 400], markup: '<main style="padding:24px;background:#fff"><h1>Checkout</h1><button>Pay</button> <button>Delete account</button></main>',
    review: { score: 7, findings: [{ kind: 'primary', message: 'Two buttons and no main one', line: 5 }] },
    judged: { at: '2026-11-01T10:00:00.000Z', findings: [{ decision: 'destructive', label: 'Nothing destructive in front', verdict: 'breaks', severity: 'high', evidence: 'Delete account is as large as Pay.', check: 'Delete account is quiet.' }], unjudged: [{ decision: 'layout', label: 'Arranged as its brief says', why: 'no brief for this screen' }] } }];
  writeFileSync(file, html.replace(tag, () => `<script type="application/json" id="sg-data">${JSON.stringify(data).replace(/</g, '\\u003c')}</script>`));
  // Its screenshot, at the size it is drawn at.
  const { shots, why } = await captureShots(dir, {}, ['Checkout'], { metas: { Checkout: {} } });
  assert.equal(why, null);
  const png = readFileSync(shots.Checkout);
  assert.equal(png.subarray(1, 4).toString(), 'PNG');
  assert.equal(png.readUInt32BE(16), 640, 'Figma\'s width, unscaled');
  // Its page: the review read from its code, then the judgment, said to be a model's.
  const browser = await launchChrome(chromePath, { tmpPrefix: 'dse-pj-' });
  const cdp = await connectCDP(browser.wsUrl);
  try {
    const { sessionId } = await openPage(cdp.send, `file://${file}#showroom/Checkout`);
    await waitForTrue(cdp.send, sessionId, FILE_PAGE_LOADED, { attempts: 400, intervalMs: 50 });
    await new Promise((r) => setTimeout(r, 500));
    const text = (await cdp.send('Runtime.evaluate', { expression: `(document.querySelector('[data-review-for="Checkout"]') || {}).textContent || ''`, returnByValue: true }, sessionId)).result.value;
    assert.match(text, /^Page reviewRead from its code: 7\/10\. 1 thing a page should not do\. Advisory\.Two buttons and no main oneLine 5Judged by a modelA model read its screenshot and its code against 1 named decision on 1 Nov 2026\. Advisory: a person checks each one\.Nothing destructive in frontBreaks · highDelete account is as large as Pay\.Check: Delete account is quiet\.Not judged: Arranged as its brief says \(no brief for this screen\)\.$/);
    // A judgment written in later (--judge-pages on a built page) takes the place of the one the build read.
    await cdp.send('Runtime.evaluate', { expression: `window.__dseShowroomJudge({ Checkout: { at: '2026-11-02T10:00:00.000Z', findings: [{ decision: 'primary', label: 'One main action', verdict: 'holds', severity: 'low', evidence: 'Pay leads.', check: 'Pay is filled.' }], unjudged: [] } })` }, sessionId);
    const after = (await cdp.send('Runtime.evaluate', { expression: `document.querySelector('[data-review-for="Checkout"]').textContent`, returnByValue: true }, sessionId)).result.value;
    assert.match(after, /One main actionHolds/);
    assert.doesNotMatch(after, /Nothing destructive/);
  } finally { try { cdp.close(); } catch { /* closed */ } try { browser.kill(); } catch { /* gone */ } }
});
