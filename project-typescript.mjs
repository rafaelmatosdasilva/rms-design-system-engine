// project-typescript.mjs - which TypeScript the engine may use. By default the project's own, else one installed for the
// whole machine (a global npm folder, NODE_PATH, tsc on the PATH), so a project without one still has its JSX and Props
// read. DESIGN_SYSTEM_ENGINE_TYPESCRIPT=project limits it to the project's own: what a run finds then depends on the
// project alone, never on what the machine has installed (the engine's tests set it where they expect no TypeScript).
import { resolve, dirname, join, sep } from 'node:path';

export const projectTypeScriptOnly = () => process.env.DESIGN_SYSTEM_ENGINE_TYPESCRIPT === 'project';

// A file the project installed: inside node_modules in the project's folder or one above it (a workspace's hoisted
// packages), never a machine-wide folder reached through NODE_PATH.
export function withinProject(ROOT, file) {
  if (!file) return false;
  for (let d = resolve(ROOT); ; d = dirname(d)) {
    if (String(file).startsWith(join(d, 'node_modules') + sep)) return true;
    if (dirname(d) === d) return false;
  }
}
