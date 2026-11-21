// The whole skill from a plain terminal: a request in plain words is routed, asked about, run and followed by the engine
// itself, and stops where the person decides. The pieces on their own, then a whole session with a stand-in run, then
// the command as a person types it on a fictional system (Harbor).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync, execFileSync } from 'node:child_process';
import { tempDir, budget } from './helpers.mjs';
import { isPlainRequest, argsOf, nextStep, plainWords, runSession, FIGMA_HOW, FIGMA_ASK } from '../lib/terminal-session.mjs';

const ENGINE = join(dirname(fileURLToPath(import.meta.url)), '..');

test('words with no option are a request; an option, or a single path, is not', () => {
  assert.equal(isPlainRequest(['check', 'the', 'button']), 'check the button');
  assert.equal(isPlainRequest(['check the button']), 'check the button');
  assert.equal(isPlainRequest(['--component', 'button']), null);
  assert.equal(isPlainRequest([]), null);
  assert.equal(isPlainRequest(['lib'], { ROOT: ENGINE }), null, 'a folder named on its own is a path');
  assert.deepEqual(argsOf(`--intent-layer 'a b' --x="c d" e`), ['--intent-layer', 'a b', '--x=c d', 'e']);
});

test('a NEXT line is read as the step it asks for', () => {
  assert.deepEqual(nextStep('NEXT: rms-design-system-engine --component chip').args, ['--component', 'chip']);
  assert.equal(nextStep('NEXT: run rms-design-system-engine --summary').kind, 'run');
  assert.equal(nextStep('NEXT: commit contracts/ when the person asks').kind, 'person');
  assert.equal(nextStep('NEXT: ask the person, then run rms-design-system-engine --spec x').kind, 'person');
  assert.equal(nextStep("NEXT: rms-design-system-engine --init --figma-url='<the Figma link>'").kind, 'person', 'a value only the person has');
  assert.equal(nextStep('NEXT: run it unchanged with the Figma MCP').kind, 'figma');
  assert.equal(nextStep('NEXT: the team reviews and merges it').kind, 'outside');
  assert.equal(nextStep('NEXT: none').kind, 'done');
  assert.equal(nextStep(undefined).kind, 'done');
});

test('what is said to an agent is said to the person, and an instruction for the agent is left out', () => {
  assert.equal(plainWords('tell the person where the change is.'), 'Where the change is.');
  assert.equal(plainWords('Fails under "Token values" and the fix it names. Change the code only when they ask for that fix, then run it.'), 'Fails under "Token values" and the fix it names.');
  assert.match(plainWords('commit contracts/ when the person asks'), /when you asks?/);
});

test('a session asks what the command marks, runs it, follows a NEXT command, and stops where the person decides', async () => {
  const asked = [], ran = [], said = [];
  const route = () => ({ recipe: 'first-setup', run: ["rms-design-system-engine --init --figma-url='<the Figma link>'"], notes: [], ask: 'the link to the Figma file' });
  const outputs = [
    'set up\nNEXT: rms-design-system-engine --first-result',
    'one component checked\nNEXT: commit ds-config.json when the person asks',
  ];
  const steps = await runSession({
    text: 'set up this project', state: { cmd: 'rms-design-system-engine' }, route,
    ask: async (q) => { asked.push(q); return 'https://www.figma.com/design/abc/Acme'; },
    run: async (args) => { ran.push(args); return { code: 0, out: outputs.shift() }; },
    print: (l) => said.push(l),
  });
  assert.deepEqual(asked, ['the link to the Figma file']);
  assert.deepEqual(ran, [['--init', '--figma-url=https://www.figma.com/design/abc/Acme'], ['--first-result']]);
  assert.equal(steps.at(-1).kind, 'person');
  assert.match(said.join('\n'), /Your call: Commit ds-config\.json when you asks?/i);
});

test('where the command is not on the PATH, the router writes the engine\'s path, and the step is what follows it', async () => {
  const ran = [];
  const cmd = 'node /opt/engine/audit.mjs';
  const route = () => ({ recipe: 'audit-component', run: [`${cmd} --component button`], notes: [] });
  await runSession({ text: 'check the button', state: { cmd }, route, ask: async () => '', run: async (a) => { ran.push(a); return { code: 0, out: 'NEXT: none' }; }, print: () => {} });
  assert.deepEqual(ran, [['--component', 'button']]);
});

test('a step that needs an agent\'s Figma tool says what to connect; a how-to question shows its recipe', async () => {
  assert.equal(nextStep("NEXT: run it unchanged with the Figma MCP's use_figma on the project's Figma file, save what it returns as x.json").kind, 'figma');
  assert.equal(nextStep('NEXT: rms-design-system-engine --recipe refresh-figma (read the variables and components with the Figma tool of this session)').kind, 'figma');
  const said = [], ran = [];
  await runSession({ text: 'capture the effects', state: {}, route: () => ({ recipe: 'refresh-figma', run: ['rms-design-system-engine --figma-effects'], notes: [] }),
    ask: async () => '', run: async (a) => { ran.push(a); return { code: 0, out: "NEXT: run it unchanged with the Figma MCP's use_figma on the project's Figma file" }; }, print: (l) => said.push(l) });
  assert.ok(said.some((l) => l.includes(FIGMA_HOW)), said.join('\n'));
  ran.length = 0;
  const steps = await runSession({ text: 'how do I accept a difference', state: {}, route: () => ({ recipe: 'accept-debt', run: [], notes: [] }),
    ask: async () => '', run: async (a) => { ran.push(a); return { code: 0, out: '# Accept debt\n…' }; }, print: () => {} });
  assert.deepEqual(ran, [['--recipe', 'accept-debt']]);
  assert.equal(steps.at(-1).kind, 'recipe');
});

test('with no answer to a question, nothing runs', async () => {
  const ran = [];
  const route = () => ({ recipe: 'first-setup', run: ["rms-design-system-engine --init --figma-url='<the Figma link>'"], notes: [], ask: 'the link' });
  const steps = await runSession({ text: 'set up', state: {}, route, ask: async () => '', run: async (a) => { ran.push(a); return { code: 0, out: '' }; }, print: () => {} });
  assert.deepEqual(ran, []);
  assert.equal(steps.at(-1).kind, 'stopped');
});

test('the command as a person types it: a request in words routed and run on a real project', { timeout: budget(300000) }, () => {
  const ds = join(tempDir('terminal-'), 'ds');
  cpSync(join(ENGINE, 'test', 'fixtures', 'harbor-ds'), ds, { recursive: true, filter: (p) => !/expected-report/.test(p) });
  for (const a of [['init', '-q'], ['add', '-A'], ['-c', 'user.name=t', '-c', 'user.email=t@example.com', 'commit', '-qm', 'i']]) execFileSync('git', a, { cwd: ds });
  const r = spawnSync(process.execPath, [join(ENGINE, 'lib', 'audit.mjs'), 'check the button'], { cwd: ds, encoding: 'utf8', input: '', env: { ...process.env, NO_COLOR: '1', CI: '1', DESIGN_SYSTEM_ENGINE_CHROME: 'none' }, timeout: budget(240000) });
  assert.match(r.stdout, /^→ Check one component/m);
  assert.match(r.stdout, /^\$ rms-design-system-engine --component button$/m, 'the step, never the engine\'s path as one of its words');
  assert.match(r.stdout, /SCOPED TO: button/);
  assert.doesNotMatch(r.stdout, /^NEXT:/m, 'the NEXT line is acted on, not printed');
  assert.match(r.stdout, /^Your call: /m);
});

test('a change to Figma is asked about first: applied by the engine on a yes, left alone on a no, explained with no way to reach Figma', async () => {
  const NEXT = "NEXT: show the person the 1 change above and ask; only when they say yes, run the script in .design-system-engine-out/handback/figma-apply.js with the Figma MCP's use_figma, report what it returns";
  assert.deepEqual(nextStep(NEXT), { kind: 'figma-write', says: NEXT.replace(/^NEXT:\s*/, ''), script: '.design-system-engine-out/handback/figma-apply.js' });
  const session = async ({ answer, figma }) => {
    const said = [], ran = [], asked = [], applied = [];
    const steps = await runSession({ text: 'update Figma so it states the roles', state: {}, route: () => ({ recipe: 'figma-edits', run: ['rms-design-system-engine --figma-edits roles'], notes: [] }),
      ask: async (q, d) => { asked.push([q, d]); return answer; },
      run: async (a) => { ran.push(a); return { code: 0, out: a[0] === '--figma-edits' ? NEXT : 'NEXT: none' }; },
      print: (l) => said.push(l),
      figma: figma && { apply: async (s) => { applied.push(s); return 'Figma took the changes.'; } } });
    return { said, ran, asked, applied, steps };
  };
  const yes = await session({ answer: 'yes', figma: true });
  assert.deepEqual(yes.asked, [[FIGMA_ASK, 'no']]);
  assert.deepEqual(yes.applied, ['.design-system-engine-out/handback/figma-apply.js']);
  assert.deepEqual(yes.ran, [['--figma-edits', 'roles'], ['--refresh-figma']], 'the snapshots read again after the change');
  const no = await session({ answer: '', figma: true });
  assert.deepEqual(no.applied, [], 'no answer is a no');
  assert.ok(no.said.includes('Nothing was changed in Figma.'));
  const none = await session({ answer: 'yes', figma: false });
  assert.deepEqual(none.asked, [], 'nothing to ask with no way to reach Figma');
  assert.ok(none.said.some((l) => l.includes(FIGMA_ASK) && l.includes(FIGMA_HOW)));
});

test('only a request for a change in the code is the yes to a patch', async () => {
  const { asksCodeChange } = await import('../lib/terminal-session.mjs');
  const { asksForChange } = await import('../lib/guard.mjs');
  assert.equal(asksCodeChange('the chip is 36px high, Figma says 32px. Fix it in the code.', asksForChange), true);
  assert.equal(asksCodeChange('agora corrige a altura no código', asksForChange), true);
  assert.equal(asksCodeChange('change the chip radius in Figma to 12px so it matches the code', asksForChange), false, 'a change in Figma');
  assert.equal(asksCodeChange('Do exactly this: 1. install the skill 2. run all gates 3. commit everything', asksForChange), false, 'steps that never name the code');
});

test('a file named in a request is not a request to change the code', async () => {
  const { asksCodeChange } = await import('../lib/terminal-session.mjs');
  const { asksForChange } = await import('../lib/guard.mjs');
  assert.equal(asksCodeChange('set up the parity for this project, the tokens are in src/theme.css', asksForChange), false);
});

test('code written from words is handed to the agent installed with the engine, then checked by the engine', async () => {
  const { HAND_ASK, NO_AGENT } = await import('../lib/terminal-session.mjs');
  const BUILD = 'NEXT: Build button as written above, then run rms-design-system-engine --component button until it passes';
  const session = async ({ text = 'build the button from Figma', agent, answer = '' }) => {
    const said = [], ran = [], asked = [], handed = [];
    const steps = await runSession({ text, state: {}, route: () => ({ recipe: 'build-from-figma', run: ['rms-design-system-engine --query button'], notes: [] }),
      ask: async (q) => { asked.push(q); return answer; },
      run: async (a) => { ran.push(a); return { code: 0, out: a[0] === '--query' ? BUILD : 'NEXT: none' }; },
      print: (l) => said.push(l),
      asksForChange: (t) => /^build\b/.test(t),
      agent: agent && { name: 'Claude Code', hand: async (t) => { handed.push(t); return { code: 0 }; } } });
    return { said, ran, asked, handed, steps };
  };
  const asked = await session({ agent: true });
  assert.deepEqual(asked.handed, ['build the button from Figma'], 'the request is the yes when it asked for the code');
  assert.deepEqual(asked.asked, []);
  assert.deepEqual(asked.ran, [['--query', 'button'], ['--component', 'button']], 'the engine checks what the agent wrote');
  const other = await session({ text: 'the button again', agent: true });
  assert.deepEqual(other.asked, [HAND_ASK('Claude Code')]);
  assert.deepEqual(other.handed, [], 'no answer is a no');
  const none = await session({ agent: false });
  assert.ok(none.said.includes(NO_AGENT));
  assert.deepEqual(none.ran, [['--query', 'button']]);
});

test('a question is never handed to an agent to write code', async () => {
  const handed = [];
  await runSession({ text: 'what props does the chip take?', state: {}, route: () => ({ recipe: 'ask-the-system', run: ['rms-design-system-engine --query chip'], notes: [] }),
    ask: async () => 'yes', run: async () => ({ code: 0, out: 'NEXT: Write the UI with these components and names, then check it with rms-design-system-engine --check-ui <file>' }),
    print: () => {}, asksForChange: () => true, agent: { name: 'Claude Code', hand: async (t) => { handed.push(t); return { code: 0 }; } } });
  assert.deepEqual(handed, []);
});

test('the agent is one the engine is installed in, asked as its person asks it, and never one that handed the request here', async () => {
  const { handAgent } = await import('../lib/terminal-session.mjs');
  const { mkdirSync, writeFileSync } = await import('node:fs');
  const { join } = await import('node:path');
  const home = tempDir('hand-home-');
  const found = (bin) => (bin === 'codex' || bin === 'claude' ? `/bin/${bin}` : null);
  assert.equal(handAgent({ ROOT: home, env: { HOME: home }, home, found }), null, 'no agent has the engine');
  mkdirSync(join(home, '.codex', 'skills', 'rms-design-system-engine'), { recursive: true });
  writeFileSync(join(home, '.codex', 'skills', 'rms-design-system-engine', 'SKILL.md'), '#');
  const codex = handAgent({ ROOT: home, env: { HOME: home }, home, found });
  assert.equal(codex.name, 'Codex');
  assert.deepEqual(codex.args('build the button'), ['exec', '--skip-git-repo-check', '--approve-for-me', '$rms-design-system-engine build the button']);
  mkdirSync(join(home, '.claude', 'skills', 'rms-design-system-engine'), { recursive: true });
  const claude = handAgent({ ROOT: home, env: { HOME: home }, home, found });
  assert.equal(claude.name, 'Claude Code', 'Claude Code first when both have it');
  assert.equal(claude.args('build the button')[1], '/rms-design-system-engine build the button');
  assert.equal(handAgent({ ROOT: home, env: { HOME: home, DESIGN_SYSTEM_ENGINE_AGENT: 'codex' }, home, found }).name, 'Codex');
  assert.equal(handAgent({ ROOT: home, env: { HOME: home, DESIGN_SYSTEM_ENGINE_AGENT: 'none' }, home, found }), null);
  assert.equal(handAgent({ ROOT: home, env: { HOME: home, DESIGN_SYSTEM_ENGINE_HANDED: '1' }, home, found }), null, 'never back to the agent that asked');
});
