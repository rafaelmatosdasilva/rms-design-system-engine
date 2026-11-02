// A file that is not a composition at all is said once, with the shape.
//
// Watched in a measured run: an agent wrote a format of its own invention - { name, layout, gap, components: [{
// type, label, level }] } - and the engine answered with ten findings. The root is not a component. "undefined" is
// not in the catalog. id "undefined" is used more than once, in three places. Every one of them true, and not one
// of them the thing that was wrong.
//
// Ten symptoms of one mistake read as ten mistakes. The agent fixed them one at a time for thirty turns and was
// never told the file was the wrong shape.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { fixtureProject, budget } from './helpers.mjs';

const ENGINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const REF = join(ENGINE, 'test', 'skill-evals', 'build-reference');

// Two projects, because the right answer is not the same in both. Where the system is components in code, a page
// is written in that code and a composition is the wrong kind of file however well formed it is. Where it is not,
// a composition is the only kind of file there is.
function project({ code = true } = {}) {
  const dir = fixtureProject(join(ENGINE, 'test', 'fixtures', 'tidepool-figma'), 'not-a-comp-');
  const files = code ? ['src/styles/tokens.css', 'src/components/chip.css', 'src/components/Chip.jsx'] : ['src/styles/tokens.css', 'src/components/chip.css'];
  for (const p of files) {
    mkdirSync(dirname(join(dir, p)), { recursive: true });
    writeFileSync(join(dir, p), readFileSync(join(REF, p), 'utf8'));
  }
  mkdirSync(join(dir, 'prototypes'), { recursive: true });
  return dir;
}

const INVENTED = {
  name: 'Notification Settings', layout: 'column', gap: 'var(--padding-m)',
  components: [{ type: 'heading', label: 'Notification Settings', level: 1 }, { type: 'layout', children: [] }],
};
const run = (dir, file) => spawnSync(process.execPath, [join(ENGINE, 'audit.mjs'), '--prototype', `prototypes/${file}`, '--no-browser'],
  { cwd: dir, encoding: 'utf8', env: { ...process.env, NO_COLOR: '1' }, timeout: budget(240000) });

test('a format of the agent\'s own invention is told it is the wrong shape, once', { timeout: budget(300000) }, () => {
  const dir = project({ code: false });
  writeFileSync(join(dir, 'prototypes', 'Wrong.json'), JSON.stringify(INVENTED));
  const out = `${run(dir, 'Wrong.json').stdout}`;
  assert.match(out, /is not a composition: a composition is one part, with the parts inside it/);
  // The shape itself, so the next write is in it.
  assert.match(out, /"component": "Page".*"children": \[ \{ "component"/);
  // And what this file has instead, so the author can map one onto the other.
  assert.match(out, /This file has "name", "layout", "gap", "components" at its root and no "component"/);
  // One answer, not ten symptoms of it.
  assert.equal((out.match(/❌/g) ?? []).length, 1, out.slice(0, 600));
  for (const symptom of [/is not in the catalog/, /is used more than once/, /is not a component in the output/]) assert.doesNotMatch(out, symptom);
});

test('a composition is still checked as it always was', { timeout: budget(300000) }, () => {
  const dir = project();
  writeFileSync(join(dir, 'prototypes', 'Real.json'), JSON.stringify({ component: 'Page', props: { padding: 'padding/m' }, children: [{ component: 'chip', props: { Label: 'Email' } }] }));
  const out = `${run(dir, 'Real.json').stdout}`;
  assert.doesNotMatch(out, /is not a composition/);
  assert.match(out, /chip/);
  // A composition wrapped as { prototype: … } is one too: the wrapper is how a drawn one comes back.
  writeFileSync(join(dir, 'prototypes', 'Wrapped.json'), JSON.stringify({ prototype: { component: 'Page', children: [{ component: 'chip', props: { Label: 'A' } }] }, gaps: [] }));
  assert.doesNotMatch(`${run(dir, 'Wrapped.json').stdout}`, /is not a composition/);
});

// The same wrong file, in a project whose system is components in code. Watched in a measured run: the catalog said
// twice to write a .jsx, the agent wrote a .json, and being told to write a better composition would have sent it
// back to the wrong kind of file. So the answer here is not the shape of a composition: it is which file to write.
test('where the system is code, the wrong shape is told which file this project writes', { timeout: budget(300000) }, () => {
  const dir = project({ code: true });
  writeFileSync(join(dir, 'prototypes', 'Wrong.json'), JSON.stringify(INVENTED));
  const out = `${run(dir, 'Wrong.json').stdout}`;
  assert.match(out, /this project's components are code, so a page here is written in that code \(\.jsx\)/);
  // The file to write, by name, and the command that reads it: enough to act on without asking anything else.
  assert.match(out, /Write prototypes\/Wrong\.jsx with the system's own components/);
  assert.match(out, /--prototype --catalog/);
  // Not the shape of a composition, which is what it must not go and write.
  assert.doesNotMatch(out, /"component": "Page"/);
  assert.equal((out.match(/❌/g) ?? []).length, 1, out.slice(0, 600));
});
