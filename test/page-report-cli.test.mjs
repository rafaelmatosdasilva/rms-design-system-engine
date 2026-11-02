// `--prototype <a page in the system's own code>`, run end to end. The middle of the prototype loop: an agent
// writes the page, runs this, and fixes what it says until the page is ready.
//
// It crashed on every project for a week - a name that was not in scope, reached for before anything was checked -
// and nothing caught it. Every test of this path read the pure functions; the command sweep had every flag of
// --prototype and not the page; and the one project the sweep runs on has no components in code, so the command
// returns before it ever reaches the line. The skill evaluation paid for it: agents ran the command, got a Node
// stack back, could not act on it, and ran it again, nineteen times in one run, until the turns ran out.
//
// So this test is the command, on a project whose components are in code, with the three flags it takes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { fixtureProject, budget } from './helpers.mjs';

const ENGINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const REF = join(ENGINE, 'test', 'skill-evals', 'build-reference');
const PAGE = `import { Field } from '@/components/Field';
import { Button } from '@/components/Button';

export function SignIn() {
  return (
    <main>
      <h1>Sign in</h1>
      <Field label="Email" />
      <Button label="Sign in" />
    </main>
  );
}
`;

// Tidepool with its system built in code, which is the shape every real project has and the demo project does not.
function project() {
  const dir = fixtureProject(join(ENGINE, 'test', 'fixtures', 'tidepool-figma'), 'page-cli-');
  for (const p of ['src/styles/tokens.css', 'src/components/button.css', 'src/components/Button.jsx',
    'src/components/field.css', 'src/components/Field.jsx', 'src/components/chip.css', 'src/components/Chip.jsx']) {
    mkdirSync(dirname(join(dir, p)), { recursive: true });
    writeFileSync(join(dir, p), readFileSync(join(REF, p), 'utf8'));
  }
  mkdirSync(join(dir, 'prototypes'), { recursive: true });
  writeFileSync(join(dir, 'prototypes', 'SignIn.jsx'), PAGE);
  return dir;
}
const run = (dir, ...args) => spawnSync(process.execPath, [join(ENGINE, 'audit.mjs'), ...args],
  { cwd: dir, encoding: 'utf8', env: { ...process.env, NO_COLOR: '1' }, timeout: budget(240000) });

test('--prototype <page>: the page checked against the system, and never a stack trace', { timeout: budget(300000) }, () => {
  const dir = project();
  const r = run(dir, '--prototype', 'prototypes/SignIn.jsx', '--no-browser');
  const out = `${r.stdout}${r.stderr}`;
  // The one rule the whole command has to keep: it may say the page is wrong, it may never fall over.
  assert.doesNotMatch(out, /\n\s+at .+\.mjs:\d+|is not defined|is not a function|Cannot read properties of (undefined|null)/, out.slice(0, 600));
  // And it reached the page: it names what the page is made of, from the system.
  assert.match(out, /Field|Button/, out.slice(0, 600));
  assert.match(out, /^(✅|✓|❌)/m, 'it says where the page stands');
});

test('--prototype <page> --comment: what a person said is kept with the page, and read back on the next run', { timeout: budget(300000) }, () => {
  const dir = project();
  // The flag whose command line was the one not in scope: it took the whole command down before anything was read.
  const said = run(dir, '--prototype', 'prototypes/SignIn.jsx', '--comment', 'the Sign in button reads as secondary');
  const out = `${said.stdout}${said.stderr}`;
  assert.doesNotMatch(out, /is not defined|\n\s+at .+\.mjs:\d+/, out.slice(0, 600));
  assert.equal(existsSync(join(dir, 'prototypes', 'SignIn.comments.json')), true, out.slice(0, 400));
  assert.match(out, /reads as secondary/);
  // Every later run of that page shows it, above what the check found: a person's words outrank a rule.
  const again = run(dir, '--prototype', 'prototypes/SignIn.jsx', '--no-browser');
  assert.match(`${again.stdout}`, /reads as secondary/, 'an open comment is shown to whoever works on the page next');
});

test('--prototype <page> --handoff: the page a developer gets, written whatever the check said', { timeout: budget(300000) }, () => {
  const dir = project();
  const r = run(dir, '--prototype', 'prototypes/SignIn.jsx', '--handoff', '--no-browser');
  const out = `${r.stdout}${r.stderr}`;
  assert.doesNotMatch(out, /is not defined|\n\s+at .+\.mjs:\d+/, out.slice(0, 600));
  assert.equal(existsSync(join(dir, 'prototypes', 'SignIn.handoff.md')), true, out.slice(0, 400));
  const md = readFileSync(join(dir, 'prototypes', 'SignIn.handoff.md'), 'utf8');
  assert.match(md, /Field|Button/, 'it opens with what the page is made of');
});
