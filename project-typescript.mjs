// project-typescript.mjs - which TypeScript the engine may use. By default the project's own, else one installed for the
// whole machine (a global npm folder, NODE_PATH, tsc on the PATH), so a project without one still has its JSX and Props
// read. DESIGN_SYSTEM_ENGINE_TYPESCRIPT=project limits it to the project's own: what a run finds then depends on the
// project alone, never on what the machine has installed (the engine's tests set it where they expect no TypeScript).
import { resolve, dirname, join, sep } from 'node:path';

export const projectTypeScriptOnly = () => process.env.DESIGN_SYSTEM_ENGINE_TYPESCRIPT === 'project';

// A TypeScript the engine can actually use: it turns JSX into DOM calls (transpileModule) and reads a Props type by
// syntax (createSourceFile). TypeScript 7 is a rewrite that exposes only its version, so neither is there. Today
// `npm i -g typescript` installs it, which is why "a TypeScript is installed" and "a TypeScript the engine can use"
// stopped being the same thing: without this check a run fails deep inside a transpile, or on a missing ScriptKind,
// with a message that names nothing someone can act on.
export const usableTypeScript = (ts) => Boolean(ts?.transpileModule && ts?.createSourceFile && ts?.JsxEmit && ts?.ScriptTarget && ts?.ModuleKind && ts?.ScriptKind);

// What to say when none was usable, wherever that is reported.
export const TYPESCRIPT_HINT = 'install typescript 5 in the project, or npm i -g typescript@5 (version 7 reads no JSX)';

// A file the project installed: inside node_modules in the project's folder or one above it (a workspace's hoisted
// packages), never a machine-wide folder reached through NODE_PATH.
export function withinProject(ROOT, file) {
  if (!file) return false;
  for (let d = resolve(ROOT); ; d = dirname(d)) {
    if (String(file).startsWith(join(d, 'node_modules') + sep)) return true;
    if (dirname(d) === d) return false;
  }
}
