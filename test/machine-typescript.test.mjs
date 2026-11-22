// The machine's TypeScript is found without npm on the PATH: an agent's shell often has node but not the PATH a
// login profile sets up (nvm, Volta, Homebrew), and the JSX components then never loaded although TypeScript was there.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tempDir } from './helpers.mjs';
import { globalModuleDirs, machineTypeScript, machineTsc, askNpm } from '../lib/project-typescript.mjs';

const fakeTs = 'module.exports = { transpileModule() {}, createSourceFile() {}, JsxEmit: {}, ScriptTarget: {}, ModuleKind: {}, ScriptKind: {} };';
function machine() {
  const root = tempDir('machine-ts-');
  const lib = join(root, 'nvm', 'versions', 'node', 'v24', 'lib', 'node_modules');
  mkdirSync(join(lib, 'typescript', 'bin'), { recursive: true });
  writeFileSync(join(lib, 'typescript', 'package.json'), '{"name":"typescript","main":"index.js"}');
  writeFileSync(join(lib, 'typescript', 'index.js'), fakeTs);
  writeFileSync(join(lib, 'typescript', 'bin', 'tsc'), '');
  return { root, lib, execPath: join(root, 'nvm', 'versions', 'node', 'v24', 'bin', 'node') };
}
const none = () => null;

test('without npm on the PATH, the global folder beside the running node is found and its TypeScript loads', () => {
  const m = machine();
  const dirs = globalModuleDirs({ env: {}, execPath: m.execPath, home: m.root, platform: 'darwin', npmRoot: none });
  assert.equal(dirs[0], m.lib);
  assert.ok(machineTypeScript(dirs)?.transpileModule);
  assert.deepEqual(machineTsc(dirs), { cmd: process.execPath, args: [join(m.lib, 'typescript', 'bin', 'tsc')] });
});

test("the prefix in ~/.npmrc and npm's own prefix variable are global folders too, each listed once", () => {
  const m = machine();
  const prefix = join(m.root, '.npm-global');
  mkdirSync(join(prefix, 'lib', 'node_modules'), { recursive: true });
  writeFileSync(join(m.root, '.npmrc'), 'registry=https://registry.example.com/\nprefix=~/.npm-global\n');
  const dirs = globalModuleDirs({ env: { npm_config_prefix: prefix }, execPath: join(m.root, 'elsewhere', 'bin', 'node'), home: m.root, platform: 'darwin', npmRoot: none });
  assert.deepEqual(dirs.filter((d) => d.startsWith(m.root)), [join(prefix, 'lib', 'node_modules')]);
});

test('no global folder with a usable TypeScript: none is found, nothing is guessed', () => {
  const m = machine();
  writeFileSync(join(m.lib, 'typescript', 'index.js'), "module.exports = { version: '7.0.0' };");
  assert.equal(machineTypeScript([m.lib]), null);
  assert.equal(machineTypeScript([]), null);
  assert.equal(machineTsc([]), null);
});

// npm on Windows is npm.cmd, which no program is started as: asking it by name there found no global folder, so a
// machine's TypeScript was never found on Windows. There npm's own script is run with the node beside it.
test('npm is asked for its global folder the way each system starts it', () => {
  const calls = [];
  const run = (cmd, args) => { calls.push([cmd, ...args]); return 'C:\\npm-global\\node_modules\n'; };
  const node = join('C:', 'node', 'node.exe'), cli = join('C:', 'node', 'node_modules', 'npm', 'bin', 'npm-cli.js');
  assert.equal(askNpm({ platform: 'win32', execPath: node, exists: (p) => p === cli, run }), 'C:\\npm-global\\node_modules');
  assert.deepEqual(calls.at(-1), [node, cli, 'root', '-g']);
  assert.equal(askNpm({ platform: 'win32', execPath: node, exists: () => false, run }), null, 'no npm beside node: none asked');
  assert.equal(askNpm({ platform: 'linux', run }), 'C:\\npm-global\\node_modules');
  assert.deepEqual(calls.at(-1), ['npm', 'root', '-g']);
});
