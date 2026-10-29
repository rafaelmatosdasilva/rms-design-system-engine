// sign-off.mjs - a change to the system itself waits for a named person to sign it off.
//
// Using the system is anyone's: a page that places a button. Authoring it is not: an edit that gives a shared component a
// new option, or the theme a new token, changes what every product gets. The edit check tells the agent what it added;
// this holds that edit until someone named has said yes, the way the guard holds ds-config.json. The engine's own builds
// in Figma record theirs (--figma-build, --figma-change --signed-off); a code edit records its with --sign-off.
//
//   additionsOf({ file, before, after, cfg, root }) → [{ kind: 'token' | 'option', what, component? }]: what an edit adds
//     to the system itself: a custom property the theme file did not declare; a quoted option next to a component's
//     own options (its contract's) that the contract does not have
//   readSignOffs(root) / recordSignOff(root, { what, by, at }) / signedOff(root, what)
//   SIGN_OFFS: the record, beside the project's other decisions
//
// No network, no Figma.
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

export const SIGN_OFFS = 'design-system-engine-signoffs.json';
const read = (p) => { try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return null; } };
const norm = (p) => String(p ?? '').split('\\').join('/').replace(/^\.\//, '');

// The theme files: where the system's own tokens are declared.
const themeFiles = (cfg = {}) => [cfg.paths?.themeCSS ?? 'src/theme.css'].flat().filter(Boolean).map(norm);
const declared = (css) => new Set([...String(css ?? '').matchAll(/(?:^|[;{\s])(--[\w-]+)\s*:/g)].map((m) => m[1]));

// Each component's contract by its code file, with the options of each of its props that has them.
function contractsByFile(root, cfg = {}) {
  const dir = resolve(root, cfg.contracts?.out ?? 'contracts');
  const out = new Map();
  const walk = (d) => { let es = []; try { es = readdirSync(d, { withFileTypes: true }); } catch { return; } for (const e of es) { const p = join(d, e.name); if (e.isDirectory()) walk(p); else if (e.name.endsWith('.contract.json')) { const c = read(p); const f = c?.source?.code?.file; if (f) out.set(norm(f), c); } } };
  walk(dir);
  return out;
}

export function additionsOf({ file, before = '', after = '', cfg = {}, root = process.cwd() } = {}) {
  const rel = norm(relative(resolve(root), resolve(root, String(file ?? ''))));
  const out = [];
  if (themeFiles(cfg).includes(rel)) {
    const had = declared(before);
    for (const t of declared(after)) if (!had.has(t)) out.push({ kind: 'token', what: `the token ${t}` });
  }
  const c = contractsByFile(root, cfg).get(rel);
  if (c) {
    const name = c.name ?? String(c.id ?? '').replace(/^[^.]+\./, '');
    const quoted = (line) => [...line.matchAll(/(['"`])([\w-]+)\1/g)].map((m) => m[2]);
    const wasLines = new Set(String(before).split('\n').map((l) => l.trim()));
    const added = String(after).split('\n').map((l) => l.trim()).filter((l) => l && !wasLines.has(l));
    for (const p of c.props ?? []) {
      const opts = (p.options ?? []).map(String);
      if (opts.length < 2) continue;
      for (const line of added) {
        const q = quoted(line);
        if (!q.some((x) => opts.includes(x))) continue;
        for (const x of q) if (!opts.includes(x) && !out.some((o) => o.what === `${name} ${p.name}=${x}`)) out.push({ kind: 'option', component: name, what: `${name} ${p.name}=${x}` });
      }
    }
  }
  return out;
}

export function readSignOffs(root) { const r = read(join(root, SIGN_OFFS)); return Array.isArray(r?.signOffs) ? r.signOffs : []; }
export function recordSignOff(root, { what, by, at = new Date().toISOString() }) {
  const all = readSignOffs(root).filter((s) => s.what !== what);
  all.push({ what, by, at });
  writeFileSync(join(root, SIGN_OFFS), JSON.stringify({ _note: 'What a named person signed off to add to the system itself (rms-design-system-engine --sign-off). Written by the engine; the guard lets an edit that adds one of these through.', signOffs: all }, null, 2) + '\n');
  return all;
}
export const signedOff = (root, what) => existsSync(join(root, SIGN_OFFS)) && readSignOffs(root).some((s) => s.what === what && s.by);
