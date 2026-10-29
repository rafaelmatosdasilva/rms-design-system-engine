// Every command the engine has, run on a real project: none of them ever answers with a stack trace.
//
// This exists because of one word. Reading what a project lets the engine change used a name that was not in that
// scope, and `--figma-edits` exited with "cfg is not defined" before it listed anything. Every test around it read
// the pure functions and none ran the command, so 1739 tests passed with the command broken on every project in the
// world, and the skill evaluation paid for it: the agent ran the engine, got an error, could not say what the engine
// failed to say, and was marked down for it.
//
// So the guard is not about any one command. A command may fail: a check that finds a difference exits 1, one that
// needs a Figma token says so and exits 2, and both are the engine working. What a command may never do is fall over
// - a Node stack, a name that is not defined, a property read off nothing. That line is the whole test.
//
// Left out, and why: --watch-intent-layer (it never returns), --install-hooks and --remove-hooks (they change a
// project's git config), --commit and --publish-styleguide (they write somewhere real), --init and --reconfigure
// (covered by the setup tests, which check what they scaffold), and --refresh-figma and the captures (they want a
// token and a browser; their offline refusal is covered by their own tests).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { availableParallelism } from 'node:os';
import { budget, tempDir } from './helpers.mjs';

const ENGINE = dirname(dirname(fileURLToPath(import.meta.url)));
const DEMO = join(ENGINE, 'test', 'fixtures', 'demo-ds');

// What a fall is, in the words a reader would see: a stack line, a name that is not there, a read off nothing.
// A stack line is the loud way to fall. The quiet way is a name that is not in scope inside a try, printed as a
// note while the work it guarded never happens - the same defect, and the one that reached an evaluation twice.
export const FELL_OVER = /\n\s+at .+\.mjs:\d+|is not defined|is not a function|Cannot read properties of (undefined|null)/;

// Every command that should answer on any project, offline, without a token.
const COMMANDS = [
  // The command with no flag at all: the whole audit, which is what most people run and what every other command
  // hangs off. It was not here when a name that is not in scope printed itself as a note instead of a list.
  '',
  '--version', '--census', '--doctor', '--status', '--summary', '--trend', '--writes', '--findings', '--hygiene',
  '--duplication', '--agent-rules', '--annotation-categories', '--check-intent', '--code-drift',
  '--contract-completeness', '--exemption-debt', '--guidance-rating', '--guide-status', '--readmes', '--route',
  '--stores', '--styleguide-check', '--tailwind', '--unchecked', '--prune', '--figma-edits', '--query chip',
  '--check-ui apps/demo/src/App.vue', '--prototype --catalog', '--prototype --rules', '--prototype --coverage',
  '--prototype --consistency', '--prototype --flow', '--baseline', '--checked', '--ci-changed', '--a11y-no-worse', '--code-connect',
  '--contracts-out', '--docs', '--extract', '--intent', '--profile-export', '--rename-sweep', '--review-drafts',
  '--showroom-compare', '--update', '--check-update', '--from-figma-cli', '--figma-screens', '--figma-effects',
  '--figma-motion', '--figma-examples', '--figma-brands', '--brands-css', '--refresh-snapshots',
];

// Each in a project of its own, so one that writes something cannot make the next one read it.
const runOne = (command) => new Promise((done) => {
  const dir = tempDir('cmd-run-');
  cpSync(DEMO, dir, { recursive: true });
  execFile(process.execPath, [join(ENGINE, 'audit.mjs'), ...command.split(' ').filter(Boolean)], { cwd: dir, encoding: 'utf8', timeout: budget(90000), maxBuffer: 1 << 26 },
    (err, stdout, stderr) => done({ command, out: `${stdout ?? ''}${stderr ?? ''}`, timedOut: err?.killed === true }));
});

test('no command of the engine ever answers with a stack trace', { timeout: budget(240000) }, async () => {
  const left = [...COMMANDS];
  const results = [];
  // A few at a time, by what the machine has: the whole list one after another is minutes of gate for a guard that is
  // only about reaching each command's own code, and five at a time starved the browser test in the same run until it
  // read an empty page. The runner already has every test file going at once; this is on top of that, so it takes a
  // quarter of the machine and no more.
  const atOnce = Math.max(2, Math.round(availableParallelism() / 4));
  await Promise.all(Array.from({ length: atOnce }, async () => { while (left.length) results.push(await runOne(left.shift())); }));
  const fell = results.filter((r) => FELL_OVER.test(r.out));
  assert.deepEqual(fell.map((r) => `${r.command}: ${(r.out.match(FELL_OVER) ?? [''])[0].trim().slice(0, 80)}`), [], 'a command fell over');
  const stuck = results.filter((r) => r.timedOut);
  assert.deepEqual(stuck.map((r) => r.command), [], 'a command never came back');
  assert.equal(results.length, COMMANDS.length);
});
