// names.mjs - the one place that knows the names the engine uses in a project.
//
// Every file the engine keeps in a project, its output folder and its environment variables
// (DESIGN_SYSTEM_ENGINE_X) are named here, so a gate never spells one itself.
export const SKILL = 'rms-design-system-engine';

// key → { now }: paths relative to the project root.
export const PROJECT = {
  out:         { now: '.design-system-engine-out' },
  refs:        { now: '.design-system-engine-refs' },
  map:         { now: 'design-system-engine-map.mjs' },
  baseline:    { now: 'design-system-engine-baseline.json' },
  agreed:      { now: 'design-system-engine-agreed.json' },
  history:     { now: 'design-system-engine-history.json' },
  checkResult: { now: 'design-system-engine-check-result.json' },
};

// The engine's output folder, and where the code capture goes in it by default.
export const OUT_DIR = PROJECT.out.now;
export const REFS_DIR = PROJECT.refs.now;

// Folders the engine writes: never read as the project's own source.
export const ENGINE_DIRS = [PROJECT.out.now, PROJECT.refs.now];

const entry = (key) => {
  const n = PROJECT[key];
  if (!n) throw new Error(`names.mjs: unknown project name "${key}"`);
  return n;
};

// The name to read.
export const projectPath = (root, key) => entry(key).now;

// The name to write.
export const newPath = (key) => entry(key).now;

// The code capture's path, relative to the project root.
export function codeSnapshotPath(cfg) {
  return cfg?.codeReading?.out || `${OUT_DIR}/code.snapshot.json`;
}

// An environment variable: DESIGN_SYSTEM_ENGINE_<key>.
export function envVar(env, key) {
  return env[`DESIGN_SYSTEM_ENGINE_${key}`];
}
