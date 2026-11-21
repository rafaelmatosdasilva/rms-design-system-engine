// project-bin.mjs - a tool the project installed (its ESLint, its Stylelint, its Storybook), run the same way everywhere.
//
// A package's command in node_modules/.bin is a shell script on macOS and Linux and a .cmd file on Windows, and Node
// runs neither the same way on both: a .cmd needs a shell, and a shell script is not a program Windows can start. So the
// engine runs the package's own script with the Node it runs on, read from the package's own package.json (its "bin"),
// which is the same file on every machine and needs no shell. Only a package that names no script is run from .bin,
// as it was.
//
//   binIn(nodeModules, name)  → { file, args } to run, or null when the tool is not installed there
//   projectBin(ROOT, name)    → the same, from the project's own node_modules
//   runBin(bin, args, run, opts) → run(file, [...bin.args, ...args], opts): what a caller's own runner returns
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';

export function binIn(nodeModules, name, { pkg = name } = {}) {
  try {
    const dir = join(nodeModules, pkg);
    const meta = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
    const rel = typeof meta.bin === 'string' ? meta.bin : meta.bin?.[name];
    if (rel && existsSync(join(dir, rel))) return { file: process.execPath, args: [join(dir, rel)] };
  } catch { /* no package of that name: its command in .bin, if any */ }
  const sh = join(nodeModules, '.bin', name);
  if (process.platform === 'win32' && existsSync(`${sh}.cmd`)) return { file: `${sh}.cmd`, args: [], shell: true };
  return existsSync(sh) ? { file: sh, args: [] } : null;
}

export const projectBin = (ROOT, name, opts) => binIn(join(ROOT, 'node_modules'), name, opts);

export function runBin(bin, args, run, opts = {}) {
  return run(bin.file, [...bin.args, ...args], { ...opts, ...(bin.shell ? { shell: true } : {}) });
}

// The folder a bin's script lives in, for a caller that resolves files beside it.
export const binDir = (bin) => (bin?.args?.[0] ? dirname(bin.args[0]) : null);
