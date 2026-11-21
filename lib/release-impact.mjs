// release-impact.mjs - what another release of the system would break in the prototypes, before anyone moves to it.
//
// A team that moves to a new release in the middle of its work finds out what broke by opening every prototype. The
// engine already holds a page to the system in front of it, so it can hold each prototype to another release just
// the same: the system at that release is read from git into a folder of its own, its components read as the page
// check reads them, and every prototype is checked against both. What fails only at the other release is what moving
// would break; what passes only there is what it would fix. Nothing is written into the system's folder or the
// prototypes'.
//
//   releaseImpact({ ROOT, cfg, release })  → { release, here, pages: [{ file, breaks, fixes }], removed, error? }
//   releaseLines(result)                    → the lines a report prints
import { mkdtempSync, rmSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve, relative } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { pageSystem, checkPage, syntaxOf } from './page-check.mjs';
import { repoOf, refInfo } from './fixed-point.mjs';
import { slashed } from './shown-path.mjs';

const git = (cwd, args, opts = {}) => execFileSync('git', args, { cwd, stdio: ['ignore', 'pipe', 'ignore'], ...opts });

// The prototypes the team keeps: the page files in prototype.dir, one level deep and in its folders.
function prototypePages(dir) {
  const out = [];
  const walk = (d, depth = 0) => {
    let es; try { es = readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of es) {
      const p = join(d, e.name);
      if (e.isDirectory() && depth < 3 && !/^(node_modules|\.|.*\.handoffs$)/.test(e.name)) walk(p, depth + 1);
      else if (e.isFile() && syntaxOf(e.name) && !/\.(js|ts)$/.test(e.name)) out.push(p);
    }
  };
  walk(dir);
  return out.sort();
}

// The settings as the release's folder reads them: paths that lead outside the system (the products beside it, the
// prototypes, the copies) stay where they are, so only the system itself changes.
function settingsFor(ROOT, cfg, at) {
  const keep = (p) => (p ? resolve(ROOT, p) : p);
  return {
    ...cfg,
    ...(cfg.pluginDirs ? { pluginDirs: Object.fromEntries(Object.entries(cfg.pluginDirs).map(([k, v]) => [k, keep(v)])) } : {}),
    ...(cfg.prototype ? { prototype: { ...cfg.prototype, dir: keep(cfg.prototype.dir ?? 'prototypes') } } : {}),
    ...(Array.isArray(cfg.copies) ? { copies: cfg.copies.map((c) => ({ ...c, dir: keep(c.dir), from: resolve(at, c.from ?? '.') })) } : {}),
  };
}

const errorsOf = (r) => new Set(r.findings.filter((f) => f.level === 'error').map((f) => `line ${f.line}: ${f.message}`));

export async function releaseImpact({ ROOT, cfg = {}, release } = {}) {
  const repo = repoOf(ROOT);
  if (!repo) return { release, error: 'the system is in no git repository, so no other release can be read' };
  const info = refInfo(repo, release);
  if (!info) return { release, error: `${release} is not a release of the system's repository` };
  const dir = resolve(ROOT, cfg.prototype?.dir ?? 'prototypes');
  const pages = prototypePages(dir);
  if (!pages.length) return { release, error: `no prototype page in ${slashed(relative(ROOT, dir)) || '.'}` };
  const sub = slashed(relative(repo, ROOT));   // the system may sit in a folder of its repository
  const tmp = mkdtempSync(join(tmpdir(), 'release-'));
  try {
    const archive = git(repo, ['archive', '--format=tar', info.commit], { maxBuffer: 1 << 30 });
    execFileSync('tar', ['-x', '-C', tmp], { input: archive, stdio: ['pipe', 'ignore', 'ignore'] });
    const at = sub ? join(tmp, sub) : tmp;
    const here = await pageSystem(ROOT, cfg);
    const there = await pageSystem(at, settingsFor(ROOT, cfg, at));
    // A page imports the system by its path in the system's own folder: at the other release, that path is the same
    // file of the release's folder.
    for (const [f, n] of [...there.byFile]) there.byFile.set(resolve(ROOT, slashed(relative(at, f))), n);
    for (const d of [...there.roots]) there.roots.add(resolve(ROOT, slashed(relative(at, d))));
    const removed = Object.keys(here.components).filter((n) => !there.components[n]).sort();
    const out = [];
    for (const file of pages) {
      let text; try { text = readFileSync(file, 'utf8'); } catch { continue; }
      const now = errorsOf(checkPage(file, text, here));
      const then = errorsOf(checkPage(file, text, there));
      out.push({ file: slashed(relative(ROOT, file)), breaks: [...then].filter((e) => !now.has(e)), fixes: [...now].filter((e) => !then.has(e)) });
    }
    return { release, commit: info.commit, here: refInfo(repo)?.tag ?? refInfo(repo)?.short ?? null, pages: out, removed };
  } finally { try { rmSync(tmp, { recursive: true, force: true }); } catch { /* the folder is the system's temp, cleaned by it */ } }
}

export function releaseLines(r) {
  if (r.error) return [`RELEASE ${r.release}  ⏭ ${r.error}`];
  const broken = r.pages.filter((p) => p.breaks.length);
  const out = [`RELEASE ${r.release}  against ${r.here ?? 'the system here'}: ${broken.length ? `${broken.length} of ${r.pages.length} prototypes would break` : `none of the ${r.pages.length} prototypes would break`}`];
  if (r.removed.length) out.push(`   components ${r.release} no longer has: ${r.removed.join(', ')}`);
  for (const p of r.pages) {
    if (!p.breaks.length && !p.fixes.length) continue;
    out.push(`   ${p.file}`);
    for (const e of p.breaks) out.push(`      ❌ ${e}`);
    for (const e of p.fixes) out.push(`      ✓ fixed by ${r.release}: ${e}`);
  }
  return out;
}
