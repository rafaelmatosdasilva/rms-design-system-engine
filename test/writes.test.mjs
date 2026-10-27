// writes.mjs - what each project lets the engine change, and where it must never. The config decides, except for
// the two things it cannot override: on CI nobody is there to answer, and CI never writes the design file or the
// product's code whatever the config says.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { PLACES, PLACE, ANSWERS, mayWrite, unanswered, recordWrite, writesLines, writeRule } from '../writes.mjs';
import { makeFixture } from './helpers.mjs';

test('one answer per place; not answered is ask, and the engine records what the person says', () => {
  assert.deepEqual(PLACES, ['figma', 'code', 'generated', 'engine']);
  assert.deepEqual(ANSWERS, ['yes', 'ask', 'no']);
  const cfg = { writes: { figma: 'yes', code: 'no' } };
  assert.equal(mayWrite(cfg, 'figma', { ci: false }).answer, 'yes');
  assert.equal(mayWrite(cfg, 'code', { ci: false }).answer, 'no');
  // Unanswered is ask, and says so, so the engine knows to ask once rather than asking every run.
  const open = mayWrite(cfg, 'generated', { ci: false });
  assert.equal(open.answer, 'ask');
  assert.equal(open.set, false);
  assert.match(open.why, /no answer in ds-config.json yet/);
  assert.deepEqual(unanswered(cfg), ['generated', 'engine']);
  assert.deepEqual(unanswered({}), PLACES);
  // A value that is not an answer is not one: it falls back to asking rather than being read as a yes.
  assert.equal(mayWrite({ writes: { figma: 'sure' } }, 'figma', { ci: false }).answer, 'ask');
  assert.throws(() => mayWrite({}, 'nowhere'), /no such place/);
});

test('CI cannot be talked into it: nobody to ask, and never the design file or the code', () => {
  const all = { writes: { figma: 'yes', code: 'yes', generated: 'yes', engine: 'yes' } };
  assert.equal(mayWrite(all, 'figma', { ci: true }).answer, 'no');
  assert.equal(mayWrite(all, 'code', { ci: true }).answer, 'no');
  assert.match(mayWrite(all, 'code', { ci: true }).why, /nobody is watching the run/);
  // What CI may write, it writes: the files the engine wrote before are its own to keep fresh.
  assert.equal(mayWrite(all, 'generated', { ci: true }).answer, 'yes');
  assert.equal(mayWrite(all, 'engine', { ci: true }).answer, 'yes');
  // And ask is no on CI, because there is nobody to ask.
  assert.equal(mayWrite({ writes: { generated: 'ask' } }, 'generated', { ci: true }).answer, 'no');
  assert.match(mayWrite({}, 'engine', { ci: true }).why, /nobody to ask/);
  assert.equal(PLACE.figma.onCI, false);
  assert.equal(PLACE.generated.onCI, true);
});

test('an answer is recorded in ds-config.json, and every other setting is left as it was', () => {
  const dir = makeFixture('writes');
  writeFileSync(join(dir, 'ds-config.json'), JSON.stringify({ paths: { themeCSS: 'src/theme.css' }, writes: { figma: 'ask' } }, null, 2));
  assert.deepEqual(recordWrite(dir, 'code', 'no'), { figma: 'ask', code: 'no' });
  const after = JSON.parse(readFileSync(join(dir, 'ds-config.json'), 'utf8'));
  assert.equal(after.paths.themeCSS, 'src/theme.css', 'nothing else is touched');
  assert.equal(after.writes.code, 'no');
  assert.throws(() => recordWrite(dir, 'code', 'maybe'), /an answer is yes, ask, no/);
  assert.throws(() => recordWrite(dir, 'nowhere', 'no'), /no such place/);
  // A config that is not valid JSON is never overwritten: the answer is lost, the project's file is not.
  writeFileSync(join(dir, 'ds-config.json'), '{ not json');
  assert.throws(() => recordWrite(dir, 'code', 'no'), /not valid JSON/);
  assert.equal(readFileSync(join(dir, 'ds-config.json'), 'utf8'), '{ not json');
});

test('what a person reads, and the one sentence an agent is given before it changes anything', () => {
  const lines = writesLines({ writes: { figma: 'ask', code: 'no' } }, { ci: false }).join('\n');
  assert.match(lines, /the design file: shows the change and waits for a yes/);
  assert.match(lines, /the product's code: never: the change goes on the Tasks page/);
  assert.match(lines, /2 places with no answer/);
  assert.match(writesLines({}, { ci: true }).join('\n'), /\(on CI\)/);
  assert.match(writeRule({ writes: { code: 'yes' } }, 'code', { ci: false }), /on a branch and through a pull request/);
  assert.match(writeRule({ writes: { figma: 'ask' } }, 'figma', { ci: false }), /wait for a yes\. Never write it on your own\./);
  assert.match(writeRule({ writes: { figma: 'yes' } }, 'figma', { ci: true }), /never write it .*nobody is watching/);
  assert.match(writeRule({}, 'engine', { ci: false }), /show the person the exact change/);
});

// The answer reaches what the agent reads, not only what the engine does: a request that would change the design
// file carries this project's own answer, so an agent is never told to ask where the answer is already no.
test('what the agent is told about a Figma change follows the project\'s answer', async () => {
  const { route } = await import('../route.mjs');
  const ask = route('add the roles to figma', { writes: { figma: 'ask' } });
  assert.match(ask.notes.join('\n'), /show the person the list and ask/);
  const never = route('add the roles to figma', { writes: { figma: 'no' } });
  assert.match(never.notes.join('\n'), /never lets it write the design file: no script is written/);
  assert.match(never.notes.join('\n'), /Tasks page for whoever owns Figma/);
  const yes = route('add the roles to figma', { writes: { figma: 'yes' } });
  assert.match(yes.notes.join('\n'), /this project lets the engine change the design file, so run/);
  // A project that says nothing is asked, as before this setting existed.
  assert.match(route('add the roles to figma').notes.join('\n'), /show the person the list and ask/);
});
