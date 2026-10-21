// The team's guidance rated for what an agent can take from it, component by component and as a whole, with
// what to add; an extraction test that asks a model only when the person asks; the guidelines as a level of the
// guidance evaluation; and each component's rating in its Documentation area of the style guide.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, cpSync, readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { systemFacts, rateComponent, rateGuidance, sectionsFrom, figmaWords, extractionQuestions, extractionPrompt, scoreExtraction, askModel, ratingLines, readFacts } from '../guidance-rating.mjs';
import { levelContext } from '../eval-run.mjs';
import { bareEnv } from './helpers.mjs';

const ENGINE = dirname(dirname(fileURLToPath(import.meta.url)));
const HARBOR = join(ENGINE, 'test', 'fixtures', 'harbor-ds');
const cfgOf = (dir) => JSON.parse(readFileSync(join(dir, 'ds-config.json'), 'utf8'));

const BUTTON = `The main action of a form or a dialog.

When to use: the one action that moves the person forward, such as Save or Continue.
When not to use: navigation (use a link) or a destructive action.
Role: button. Screen readers announce its label.

Its \`variant\` is Primary or Secondary, and its \`size\` is Small or Large.

Example:
\`\`\`html
<button class="hb-button">Continue</button>
\`\`\`
`;
const GUIDE = `Harbor guidance.\n\n## button\n${BUTTON}\n## Badge\nShows a status.\nWhen to use: a short status of an item.\nRole: status. Use \`--hb-old-tone\` for its colour.\n\n## Card\nNot a component here.\n`;

const harbor = () => {
  const dir = mkdtempSync(join(tmpdir(), 'guidance-rating-'));
  cpSync(HARBOR, dir, { recursive: true });
  writeFileSync(join(dir, 'guidelines.md'), GUIDE);
  const cfg = cfgOf(dir); cfg.guidelines = { sources: ['guidelines.md'] };
  writeFileSync(join(dir, 'ds-config.json'), JSON.stringify(cfg, null, 2));
  return dir;
};

test('the system\'s facts from the Figma snapshots: each component with its properties and options, and every token', () => {
  const { facts } = readFacts(HARBOR, cfgOf(HARBOR));
  assert.deepEqual(Object.keys(facts.components).sort(), ['badge', 'button', 'iconButton']);
  assert.deepEqual(facts.components.button.props.map((p) => p.name), ['variant', 'size', 'label']);
  assert.deepEqual(facts.components.button.props[0].options, ['Primary', 'Secondary']);
  assert.ok(facts.tokens.has('radius/control') && facts.tokens.has('status/neutral/color'));
});

test('a component is ready with what it is, when to use it and when not, its role and an example; its properties are its contract\'s', () => {
  const { facts } = readFacts(HARBOR, cfgOf(HARBOR));
  const r = rateComponent('button', BUTTON, facts);
  assert.equal(r.cls, 'ready', JSON.stringify(r));
  assert.deepEqual(r.unknown, []);
  // No property named: still ready, and never asked to name them (the contract carries them from Figma and the code).
  const unnamed = rateComponent('button', BUTTON.replace(/Its `variant`[^\n]*\n/, ''), facts);
  assert.equal(unnamed.cls, 'ready', JSON.stringify(unnamed));
  assert.equal(unnamed.props, undefined);
  assert.ok(!unnamed.add.some((a) => /propert/.test(a)));
  // Nothing written: thin, and the first thing to add is its own section under its exact name.
  const none = rateComponent('iconButton', '', facts);
  assert.equal(none.cls, 'thin');
  assert.match(none.add[0], /a section headed iconButton/);
  // Some of it, and a name that exists nowhere in the system.
  const some = rateComponent('badge', 'Shows a status of the item.\nWhen to use: a short status.\nRole: status. Use `--hb-old-tone`.', facts);
  assert.equal(some.cls, 'partial');
  assert.deepEqual(some.unknown, ['--hb-old-tone']);
  assert.ok(some.add.some((a) => /when not to use/.test(a)) && some.add.some((a) => /exists nowhere/.test(a)));
  // A family of names (a *) exists when one of the system's names starts with it; one that none starts with does not.
  const family = rateComponent('badge', 'Shows a status of the item.\nUse `--status-*` and `radius/*` for it, never `--hb-gone-*`.', facts);
  assert.deepEqual(family.unknown, ['--hb-gone-*']);
});

test('the whole guidance: a class from how many components are ready, the headings that name no component', () => {
  const dir = harbor();
  const { facts, props } = readFacts(dir, cfgOf(dir));
  const gl = { sections: [{ heading: 'button', body: BUTTON }, { heading: 'Badge', body: 'Shows a status.' }, { heading: 'Card', body: 'x' }], general: 'Harbor guidance.' };
  const view = sectionsFrom(gl, facts, figmaWords(props));
  assert.ok(view.sections.badge, 'a heading in another case still names the component');
  assert.match(view.sections.iconButton, /Role: button/, "Figma's annotations count as guidance");
  const r = rateGuidance(view, facts);
  assert.deepEqual([r.ready, r.partial, r.thin, r.total], [1, 0, 2, 3]);
  assert.equal(r.cls, 'thin');
  assert.deepEqual(r.unmatched, ['Card']);
  const lines = ratingLines(r);
  assert.match(lines[0], /📘 Guidance for agents: Thin\. 1 of 3 components ready, 0 partial, 2 thin\./);
  assert.ok(lines.some((l) => /Headings that name no component: Card/.test(l)));
});

test('the extraction test: questions from the facts, answers scored against them, the model asked through a command', () => {
  const { facts } = readFacts(HARBOR, cfgOf(HARBOR));
  const qs = extractionQuestions(facts);
  assert.deepEqual(qs.map((q) => q.id), ['badge.Tone', 'button.variant', 'button.size']);
  const prompt = extractionPrompt('GUIDE TEXT', qs);
  assert.match(prompt, /--- GUIDANCE ---\nGUIDE TEXT\n--- END ---/);
  assert.match(prompt, /2\) Which options does the variant property of the button component take\?/);
  const s = scoreExtraction(qs, '1) not in the document\n2) Primary, Secondary\n3) Small or Medium');
  assert.equal(s.byComponent.badge, 0);
  assert.equal(s.byComponent.button, 3 / 4);
  assert.equal(Math.round(s.score * 100), 43);
  // The person's own command: the prompt on stdin, the answer on stdout.
  const echo = `${process.execPath} -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>console.log(d.includes('GUIDE')?'1) ok':'no'))"`;
  assert.deepEqual(askModel('GUIDE', echo), { out: '1) ok\n', ok: true });
  assert.equal(askModel('x', 'exit 3').ok, false);
});

test('--guidance-rating writes the rating; --extract asks the model the person set, and each component keeps its share', () => {
  const dir = harbor();
  const run = (...a) => spawnSync(process.execPath, [join(ENGINE, 'audit.mjs'), '--guidance-rating', ...a], { cwd: dir, encoding: 'utf8', env: { ...bareEnv(), NO_COLOR: '1', CI: '1' }, timeout: 120000 });
  let r = run();
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /📘 Guidance for agents: (Thin|Partial)\./);
  assert.match(r.stdout, /badge \(partial\): add .*`--hb-old-tone` exists nowhere in the system/);
  const out = join(dir, '.design-system-engine-out', 'guidance-rating.json');
  const j = JSON.parse(readFileSync(out, 'utf8'));
  assert.deepEqual(j.sources, ['guidelines.md']);
  assert.equal(j.components.find((c) => c.name === 'button').cls, 'ready');
  // The extraction test, through the command in guidelines.extract.cmd.
  const answer = join(dir, 'answer.mjs');
  writeFileSync(answer, "process.stdin.resume(); process.stdin.on('end', () => console.log('1) Neutral, Success\\n2) Primary, Secondary\\n3) Small, Large'));\n");
  const cfg = cfgOf(dir); cfg.guidelines.extract = { cmd: `${process.execPath} ${answer}` };
  writeFileSync(join(dir, 'ds-config.json'), JSON.stringify(cfg, null, 2));
  r = run('--extract');
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /Extraction test: a model that saw only the guidance named 86% of the property options right\./);
  const k = JSON.parse(readFileSync(out, 'utf8'));
  assert.equal(k.components.find((c) => c.name === 'button').extracted, 1);
  assert.equal(Math.round(k.extraction.score * 100), 86);
});

test('the guidelines are a level of the guidance evaluation', () => {
  const dir = harbor();
  const c = levelContext(dir, cfgOf(dir), 'guidelines', { outDir: 'evals' });
  assert.deepEqual(c.files, ['guidelines.md']);
  assert.match(readFileSync(c.path, 'utf8'), /^# guidelines\.md\n\nHarbor guidance\./);
  assert.match(levelContext(HARBOR, cfgOf(HARBOR), 'guidelines').why, /no guidelines file/);
});

test('each component\'s Documentation area says what an agent can take from its guidance, and what to add', () => {
  const dir = harbor();
  // Its contract, as the engine writes it: its properties are read there, never asked for again.
  mkdirSync(join(dir, 'contracts'), { recursive: true });
  writeFileSync(join(dir, 'contracts', 'button.contract.json'), JSON.stringify({ id: 'button', props: [{ name: 'variant' }, { name: 'size' }, { name: 'label' }] }));
  const r = spawnSync(process.execPath, [join(ENGINE, 'audit.mjs'), '--styleguide', '--no-a11y-bake'], { cwd: dir, encoding: 'utf8', env: { ...bareEnv(), NO_COLOR: '1', CI: '1' }, timeout: 250000 });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const page = readFileSync(join(dir, '.design-system-engine-out', 'styleguide', 'index.html'), 'utf8');
  const data = JSON.parse(/<script type="application\/json" id="sg-data">([\s\S]*?)<\/script>/.exec(page)[1]);
  const of = (n) => (data.components ?? []).find((c) => c.name === n);
  assert.deepEqual(of('button').contract, { file: join('contracts', 'button.contract.json'), href: 'contracts/button.contract.json', props: ['variant', 'size', 'label'] });
  assert.match(page, /'props', 'Properties'/, 'its Properties row: done, the contract file named');
  // Its Contract button opens the copy beside the guide.
  assert.deepEqual(of('button').links.find((l) => l.label === 'Contract'), { label: 'Contract', url: 'contracts/button.contract.json' });
  assert.ok(existsSync(join(dir, '.design-system-engine-out', 'styleguide', 'contracts', 'button.contract.json')));
  assert.equal(of('badge').links.find((l) => l.label === 'Contract'), undefined, 'no contract, no button');
  assert.equal(of('button').agentRating.cls, 'ready');
  assert.equal(of('badge').agentRating.cls, 'partial');
  assert.deepEqual(of('badge').agentRating.from, ['guidelines.md', 'Figma']);   // every place it was read from
  assert.match(page, /'example', 'Example'/, 'its Example row in the template');
  assert.doesNotMatch(page, /'Properties named'/, 'its properties are in its contract, never asked for again');
  assert.doesNotMatch(page, /kind: 'For agents'/, 'no row that repeats the others');
  assert.ok(existsSync(join(dir, 'guidelines.md')));
});
