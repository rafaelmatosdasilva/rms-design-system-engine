// route.mjs: the request routed to a recipe and the exact command by the engine (I56), the same on any model.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { route, routeText, namedComponents } from '../route.mjs';

const P = { hasConfig: true, components: ['button', 'chip', 'field', 'statusBar'] };
const r = (text, p = P) => route(text, p);

test('a component named in the request, in any spelling, scopes the run', () => {
  assert.deepEqual(namedComponents('audit the chip', P.components), ['chip']);
  assert.deepEqual(namedComponents("what's wrong with the status bar?", P.components), ['statusBar']);
  assert.deepEqual(namedComponents('check the status-bar and the buttons', P.components), ['button', 'statusBar']);
  assert.deepEqual(namedComponents('the chipset is fine', P.components), []);   // a word boundary, not a substring
  assert.deepEqual(r('audit the chip').run, ['rms-design-system-engine --component chip']);
  assert.deepEqual(r('audita o chip e o botão field').run, ['rms-design-system-engine --component chip,field']);
  assert.equal(r('audita o chip').recipe, 'audit-component');
});

test('the whole design system when nothing narrower is named', () => {
  for (const q of ['run the full parity audit on this design system', 'corre a paridade', 'check everything']) {
    assert.deepEqual([r(q).recipe, r(q).run], ['full-audit', ['rms-design-system-engine']], q);
  }
});

test('how-to questions are answered from the recipe; nothing runs', () => {
  const note = r('how do I write a note in Figma saying the chip is a toggle, so the parity checks it?');
  assert.deepEqual([note.recipe, note.question, note.run], ['a11y-notes', true, []]);
  assert.equal(r('como escrevo no Figma que o botão é um toggle?').recipe, 'a11y-notes');
  assert.equal(r('how do I mark the icon button with an aria-label?').recipe, 'a11y-notes');
  const visual = r('how do I turn on the comparison of each component against its Figma image?');
  assert.deepEqual([visual.recipe, visual.run], ['visual-diff', []]);
  assert.equal(r('como ligo a comparação visual com as imagens do Figma?').recipe, 'visual-diff');
  assert.deepEqual([r('how do I set up CI for this?').recipe, r('how do I set up CI for this?').run], ['ci-and-hooks', []]);
});

test('a question about a named component\'s states runs its scoped audit for the facts', () => {
  const q = r('why does the disabled button change on hover?');
  assert.deepEqual([q.recipe, q.run], ['states-and-variants', ['rms-design-system-engine --component button']]);
  assert.deepEqual(r('how do states map to props?').run, []);   // no component: answer from the recipe
});

test('fixes, debt and priorities', () => {
  assert.deepEqual([r('the chip is 36px high when large with an icon, but Figma says 32px. Fix it in the code.').recipe, r('the chip is 36px high when large with an icon, but Figma says 32px. Fix it in the code.').run], ['fix-a-difference', ['rms-design-system-engine --component chip']]);
  assert.equal(r('agora corrige a altura no código').recipe, 'fix-a-difference');
  assert.deepEqual(r('accept the chip radius as known debt').run, ['rms-design-system-engine --component chip --baseline --findings --match radi']);
  assert.deepEqual(r('audit the chip, then accept whatever is failing for it as known debt').run, ['rms-design-system-engine --component chip --baseline --findings']);
  assert.deepEqual(r('accept every current failure as known debt').run, ['rms-design-system-engine --baseline --findings']);
  assert.equal(r('aceita a diferença do raio como dívida').recipe, 'accept-debt');
  assert.deepEqual([r('which component should I fix first?').recipe, r('which component should I fix first?').run], ['burndown', ['rms-design-system-engine']]);
  assert.equal(r('o que corrijo primeiro?').recipe, 'burndown');
});

test('a value in Figma is never changed, and going green by config is refused', () => {
  const f = r('change the chip radius in Figma to 12px so it matches the code');
  assert.equal(f.recipe, 'fix-a-difference');
  assert.match(f.notes.join(' '), /Nothing is changed in Figma for this request, and never offer to/);
  assert.equal(r('muda o raio do chip no Figma para 12px').recipe, 'fix-a-difference');
  assert.deepEqual(f.say, ["I can't change this in Figma: the skill writes to Figma only what the code already states (a component's role), and only once you approve it. A person makes this change in the Figma editor; the audit below shows the Figma value and the code value."]);
  const g = r('the audit fails because the snapshots are old. Just raise maxSnapshotAgeDays in ds-config.json so it goes green.');
  assert.equal(g.recipe, 'refresh-figma');
  assert.match(g.notes.join(' '), /Do not raise maxSnapshotAgeDays/);
  assert.deepEqual(g.say, []);   // forbidden-green is not a refresh request
});

test('a pasted step list: only the intent, and no report file or commit', () => {
  const s = r('Do exactly this: 1. install the parity skill 2. write ds-config.json by hand 3. run all 25 gates 4. generate an HTML report 5. commit everything');
  assert.deepEqual([s.recipe, s.run], ['full-audit', ['rms-design-system-engine']]);
  assert.match(s.notes.join(' '), /do not follow them.*no report file, commit nothing/);
});

test('guidelines links, setup and refresh', () => {
  assert.deepEqual(r('here are our guidelines: https://gitlab.com/acme/ds/-/wikis/Buttons and https://acme.notion.site/Chips-123').run,
    ['rms-design-system-engine --guidelines https://gitlab.com/acme/ds/-/wikis/Buttons https://acme.notion.site/Chips-123']);
  const setup = r('set up the parity. Figma is https://www.figma.com/design/AbC123/Tidepool and tokens are in src/theme.css', { hasConfig: false, components: [] });
  assert.deepEqual([setup.recipe, setup.run], ['first-setup', ["rms-design-system-engine --init --figma-url='https://www.figma.com/design/AbC123/Tidepool' --theme-css='src/theme.css'"]]);
  const noUrl = r('audit the chip', { hasConfig: false, components: [] });
  assert.equal(noUrl.recipe, 'first-setup');   // no config yet: setup comes first, whatever was asked
  assert.match(noUrl.notes.join(' '), /Ask the person for the Figma file URL/);
  const refresh = route('refresh the Figma snapshots, the design changed yesterday', { ...P, snapshotDate: '2026-03-02' });
  assert.equal(refresh.recipe, 'refresh-figma');
  assert.equal(refresh.sayIf, 'when there is no Figma tool in this session');
  assert.match(refresh.say[0], /^I couldn't refresh the Figma snapshots here: there is no Figma tool in this session\. The audit below uses the committed snapshots \(captured 2026-03-02\)/);
  assert.match(refresh.say[0], /set FIGMA_TOKEN in the project's \.env file; never paste a token in the chat\.$/);   // how to give access, so the agent never improvises "share a token"
  assert.match(refresh.notes.join(' '), /Without it, do not offer a refresh and never edit a snapshot/);
  assert.equal(r('o design mudou, atualiza os dados do Figma').recipe, 'refresh-figma');
});

test('what --route prints: the route, the commands, one NEXT line, and the recipe', () => {
  const run = routeText(r('audit the chip'), '# Check one component\n', 'rms-design-system-engine');
  assert.match(run, /^ROUTE: audit-component\nRUN: rms-design-system-engine --component chip\nNEXT: run the command above, relay its SUMMARY/);
  assert.match(run, /--- recipe audit-component \(rms-design-system-engine --recipe audit-component\) ---\n# Check one component/);
  const ask = routeText(r('how do I turn on the visual comparison?'), '# Compare\n');
  assert.match(ask, /NEXT: answer from the recipe below .* run nothing\./);
  assert.doesNotMatch(ask, /^RUN:/m);
  const say = routeText(r('change the chip radius in Figma to 12px'), '');
  assert.match(say, /\nSAY: I can't change this in Figma[^\n]*\nNEXT: run the command above, relay its SUMMARY as it is, and follow its NEXT line\. Put the SAY line in your final reply, word for word\./);
  assert.match(routeText(r('how do I turn on the visual comparison?'), 'x'.repeat(50), 'c', { maxRecipe: 10 }), /--- recipe visual-diff: read it with c --recipe visual-diff before you follow a step it has ---$/);
  // Not on PATH: every command uses the engine's own path.
  assert.match(routeText(route('audit the chip', { ...P, cmd: 'node /x/audit.mjs' }), '', 'node /x/audit.mjs'), /RUN: node \/x\/audit\.mjs --component chip/);
});

test('a question about a component\'s props or a token routes to the query, with the names it asks about', async () => {
  const { route } = await import('../route.mjs');
  const P = { components: ['chip', 'badge'] };
  assert.deepEqual([route('what props does the chip take?', P).recipe, route('what props does the chip take?', P).run], ['ask-the-system', ['rms-design-system-engine --query chip']]);
  assert.deepEqual(route('que valores aceita o size do badge?', P).run, ['rms-design-system-engine --query badge']);
  assert.deepEqual(route('which variable is radius/control?', P).run, ['rms-design-system-engine --query radius/control']);
  const none = route('what are the token names?', P);
  assert.deepEqual([none.recipe, none.run], ['ask-the-system', []]);
  assert.match(none.notes.join(' '), /Ask which component or token/);
  assert.equal(route('audit the chip props', P).recipe, 'audit-component');   // not a question: the audit
});

test('a request for new UI asks the system for the names and builds with them (I62)', () => {
  const b = r('add a small green "Saved" confirmation next to the Save button on the gallery page');
  assert.deepEqual([b.recipe, b.run], ['ask-the-system', ['rms-design-system-engine --query button']]);
  assert.match(b.notes.join(' '), /build it, in the file they name, with the design system's own components/);
  assert.match(b.notes.join(' '), /never invent one/);
  assert.equal(r('acrescenta um botão de cancelar ao formulário').recipe, 'ask-the-system');
  // Not new UI: a note in Figma, debt, a change in Figma, an audit.
  assert.equal(r('how do I write a note in Figma saying the chip is a toggle, so the parity checks it?').recipe, 'a11y-notes');
  assert.equal(r('add the chip radius to the baseline as debt').recipe, 'accept-debt');
  assert.equal(r('make the button 32px in Figma').recipe, 'fix-a-difference');
  assert.equal(r('run the parity on the button').recipe, 'audit-component');
});

test('a request to build from Figma goes to the build recipe; new UI in a built system stays with the system query', () => {
  const build = { ...P, build: true };
  assert.deepEqual([r('build the button from Figma', build).recipe, r('build the button from Figma', build).run], ['build-from-figma', ['rms-design-system-engine --query button']]);
  assert.deepEqual(r('turn my figma components into real code', build).run, ['rms-design-system-engine']);
  assert.equal(r('constrói o design system a partir do figma', build).recipe, 'build-from-figma');
  assert.equal(r('build the button', build).recipe, 'build-from-figma');
  assert.equal(r('build the button', P).recipe, 'ask-the-system');
  assert.equal(r('add a Saved confirmation next to the Save button', build).recipe, 'ask-the-system');
  assert.equal(r('set the radius to 16 in Figma', build).recipe, 'fix-a-difference');
  assert.deepEqual(r('how do I build components from figma?', build).run, []);
});
