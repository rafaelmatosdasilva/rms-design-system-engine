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
import { isPlainRequest, argsOf, nextStep, plainWords, runSession } from '../lib/terminal-session.mjs';

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
  assert.equal(nextStep('NEXT: run it unchanged with the Figma MCP').kind, 'outside');
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
  assert.match(r.stdout, /^\$ rms-design-system-engine --component button$/m);
  assert.match(r.stdout, /SCOPED TO: button/);
  assert.doesNotMatch(r.stdout, /^NEXT:/m, 'the NEXT line is acted on, not printed');
  assert.match(r.stdout, /^Your call: /m);
});
