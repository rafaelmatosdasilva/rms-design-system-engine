// system-copy.mjs - a copy of the system inside a product, held to the release it was copied from.
//
// Some teams copy the system's components into their own repository at a release, pin that release, and import from
// the copy. Read as it is, the copy passes for the system: a component someone changed inside it, or a copy left on an
// old release, looks like the system itself. So each file of the copy is held to the same file of the system at the
// pinned release, through git, and is one of three things:
//   same       the file as the release has it;
//   older      a version the system once had and has since moved on from: bring the copy up to the release;
//   changed    content the system never had: a change made inside the copy. A fix made there (an accessibility one
//              most of all) reaches no other product, and is lost when the product is built from the system, so
//              each is the system's to take or refuse. Grouped by the product commit that made it, which is the
//              change a person made and the request it becomes.
// A file the release has and the copy lacks is said too, as is one only the copy has.
//
// The copy is the team's setting (ds-config.json → copies): [{ "dir": "<the copy, from the system's folder>",
// "from": "<the folder it copies, inside the system>" }]. The release is the pin of the product's repository
// (fixed-point.mjs), else the copy's own "release".
//
//   copyCheck(ROOT, copy, { release, at })  → { release, files: [{ rel, state, commit? }], counts, changes }
//   copyLines(result)                       → the lines a report prints
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve, relative } from 'node:path';
import { execFileSync } from 'node:child_process';
import { repoOf, readPin, fileAt } from './fixed-point.mjs';

const git = (cwd, args, input) => { try { return execFileSync('git', args, { cwd, encoding: 'utf8', input, stdio: [input == null ? 'ignore' : 'pipe', 'pipe', 'ignore'] }).trim(); } catch { return null; } };
const SKIP = /(^|\/)(node_modules|dist|build|\.git)(\/|$)/;
const slash = (p) => String(p).split('\\').join('/');

// The files of a folder in the working tree, or at a ref of its repository (a tag the product delivered).
function filesOf(repo, dir, at) {
  if (at) {
    const prefix = slash(relative(repo, dir));
    const out = git(repo, ['ls-tree', '-r', '--name-only', at, '--', prefix]);
    return (out ? out.split('\n') : []).filter(Boolean).map((p) => slash(p).slice(prefix.length + 1)).filter((p) => p && !SKIP.test(p));
  }
  const out = [];
  const walk = (d, rel = '') => {
    let es; try { es = readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of es) {
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (SKIP.test(r)) continue;
      if (e.isDirectory()) walk(join(d, e.name), r); else if (e.isFile()) out.push(r);
    }
  };
  walk(dir);
  return out;
}

// copy: { dir, from }. release: the system's ref the copy is held to. at: the product's ref (null: its folder).
export function copyCheck(ROOT, copy, { release = null, at = null } = {}) {
  const dir = resolve(ROOT, copy.dir), from = slash(copy.from ?? '.').replace(/^\.\/?|\/$/g, '');
  const product = repoOf(dir);
  const sysRepo = repoOf(ROOT);
  const pinned = release ?? readPin(product, at)?.system?.ref ?? readPin(product)?.system?.ref ?? copy.release ?? null;
  if (!sysRepo) return { error: 'the system is in no git repository, so no release can be read' };
  if (!pinned) return { error: `no release to hold ${copy.dir} to: pin it (--prototype --pin) or name it in copies → release` };
  if (!git(sysRepo, ['rev-parse', '--verify', '--quiet', `${pinned}^{commit}`])) return { error: `${pinned} is not a release of the system's repository` };
  const sysPrefix = slash(relative(sysRepo, resolve(ROOT, from)));
  const inSystem = (rel) => (sysPrefix && sysPrefix !== '.' ? `${sysPrefix}/${rel}` : rel);
  const releaseFiles = new Set((git(sysRepo, ['ls-tree', '-r', '--name-only', pinned, '--', sysPrefix && sysPrefix !== '.' ? sysPrefix : '.']) ?? '').split('\n').filter(Boolean)
    .map((p) => (sysPrefix && sysPrefix !== '.' ? slash(p).slice(sysPrefix.length + 1) : slash(p))).filter((p) => p && !SKIP.test(p)));
  const copyFiles = filesOf(product ?? dir, dir, at);
  const files = [];
  for (const rel of copyFiles) {
    const text = at ? fileAt(product, at, slash(relative(product, join(dir, rel)))) : (() => { try { return readFileSync(join(dir, rel), 'utf8'); } catch { return null; } })();
    if (text == null) continue;
    const want = fileAt(sysRepo, pinned, inSystem(rel));
    if (want === text) { files.push({ rel, state: 'same' }); continue; }
    // Whether the system ever held this exact content: its blob in the system's history.
    const blob = git(sysRepo, ['hash-object', '--stdin'], text);
    const known = blob && git(sysRepo, ['cat-file', '-e', `${blob}^{blob}`]) !== null;
    if (want == null && !known) { files.push({ rel, state: 'only in the copy', commit: lastCommit(product, join(dir, rel), at) }); continue; }
    files.push(known ? { rel, state: 'older' } : { rel, state: 'changed', commit: lastCommit(product, join(dir, rel), at) });
  }
  const have = new Set(copyFiles);
  for (const rel of releaseFiles) if (!have.has(rel)) files.push({ rel, state: 'missing from the copy' });
  const counts = {};
  for (const f of files) counts[f.state] = (counts[f.state] ?? 0) + 1;
  // Each change a person made inside the copy, by the commit that made it: one request for the system each.
  const changes = new Map();
  for (const f of files.filter((x) => x.state === 'changed' || x.state === 'only in the copy')) {
    const k = f.commit?.sha ?? 'uncommitted';
    if (!changes.has(k)) changes.set(k, { commit: f.commit ?? null, files: [] });
    changes.get(k).files.push(f.rel);
  }
  return { copy: copy.dir, from: from || '.', release: pinned, files: files.sort((a, b) => a.rel.localeCompare(b.rel)), counts, changes: [...changes.values()] };
}

function lastCommit(repo, abs, at) {
  if (!repo) return null;
  const out = git(repo, ['log', '-1', '--format=%h%x09%s', ...(at ? [at] : []), '--', slash(relative(repo, abs))]);
  if (!out) return null;
  const [sha, subject] = out.split('\t');
  return { sha, subject: subject ?? '' };
}

export function copyLines(r) {
  if (!r) return [];
  if (r.error) return [`COPY OF THE SYSTEM  ⏭ ${r.error}`];
  const c = r.counts, n = (k) => c[k] ?? 0;
  const clean = !n('older') && !n('changed') && !n('only in the copy') && !n('missing from the copy');
  const out = [`COPY OF THE SYSTEM  ${r.copy}, held to ${r.release}: ${clean ? `the same as the release, ${n('same')} files` : `${n('same')} the same · ${n('older')} from an older release · ${n('changed')} changed in the copy · ${n('only in the copy')} only in the copy · ${n('missing from the copy')} missing from the copy`}`];
  if (n('older')) out.push(`   ❌ bring the copy up to ${r.release}: ${r.files.filter((f) => f.state === 'older').map((f) => f.rel).slice(0, 8).join(', ')}${n('older') > 8 ? ', …' : ''}`);
  if (n('missing from the copy')) out.push(`   ❌ missing from the copy: ${r.files.filter((f) => f.state === 'missing from the copy').map((f) => f.rel).slice(0, 8).join(', ')}${n('missing from the copy') > 8 ? ', …' : ''}`);
  for (const ch of r.changes) out.push(`   ❌ changed in the copy${ch.commit ? ` by ${ch.commit.sha} "${ch.commit.subject}"` : ', not committed'}: ${ch.files.slice(0, 6).join(', ')}${ch.files.length > 6 ? `, and ${ch.files.length - 6} more` : ''}. The system's to take or refuse: a request each`);
  return out;
}
