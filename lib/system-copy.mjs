// system-copy.mjs - a copy of the system inside a product, held to the release it was copied from.
//
// Some teams copy the system's components into their own repository at a release, pin that release, and import from
// the copy. Read as it is, the copy passes for the system: a component someone changed inside it, or a copy left on an
// old release, looks like the system itself. So each file of the copy is held to the same file of the system at the
// pinned release, through git, and is one of these:
//   same                  the file as the release has it;
//   older                 a version the system once had and has moved on from: bring the copy up to the release;
//   in a later release    content a newer release of the system already has: move to that release, nothing to ask;
//   changed               content the system never had: a change made inside the copy. A fix made there (an
//                         accessibility one most of all) reaches no other product, and is lost when the product is
//                         built from the system, so each is the system's to take or refuse. Grouped by the product
//                         commit that made it, which is the change a person made and the request it becomes.
// A file the release has and the copy lacks is said too, as is one only the copy has.
//
// What brings the copy to its release (the older files and the missing ones) is handed back as a patch, for a person
// to apply in the product (.design-system-engine-out/handback/copy-<copy>.diff). The changes made inside the copy are
// never in it: they are requests. Nothing in the copy or the system is written.
//
// Files are compared by their git object ids: the release's in one listing, the copy's hashed here, so a copy of
// hundreds of files is read in a moment, and what each file was found to be is kept by its content
// (.design-system-engine-out/copies/seen.json), so the next run reads again only what changed.
//
// The copy is the team's setting (ds-config.json → copies): [{ "dir": "<the copy, from the system's folder>",
// "from": "<the folder it copies, inside the system>" }]. The release is the pin of the product's repository
// (fixed-point.mjs), else the copy's own "release".
//
//   copyCheck(ROOT, copy, { release, at, cache })  → { release, files: [{ rel, state, commit?, tag? }], counts, changes, patch? }
//   copyLines(result)                              → the lines a report prints
import { readdirSync, readFileSync, writeFileSync, mkdirSync, mkdtempSync, rmSync, realpathSync } from 'node:fs';
import { join, resolve, relative, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { repoOf, readPin } from './fixed-point.mjs';
import { OUT_DIR } from './names.mjs';

const git = (cwd, args, input) => { try { return execFileSync('git', args, { cwd, encoding: 'utf8', input, maxBuffer: 1 << 28, stdio: [input == null ? 'ignore' : 'pipe', 'pipe', 'ignore'] }).trim(); } catch { return null; } };
const SKIP = /(^|\/)(node_modules|dist|build|\.git)(\/|$)/;
const slash = (p) => String(p).split('\\').join('/');
const blobOf = (buf) => createHash('sha1').update(`blob ${buf.length}\0`).update(buf).digest('hex');   // git's own object id

// rel → object id, for every file under prefix at a ref of a repository.
function treeAt(repo, ref, prefix) {
  const out = new Map();
  const p = prefix && prefix !== '.' ? prefix : '';
  for (const line of (git(repo, ['ls-tree', '-r', '--full-tree', ref, ...(p ? ['--', p] : [])]) ?? '').split('\n')) {
    const m = /^\d+ blob ([0-9a-f]+)\t(.+)$/.exec(line);
    if (!m) continue;
    const rel = p ? slash(m[2]).slice(p.length + 1) : slash(m[2]);
    if (rel && !SKIP.test(rel)) out.set(rel, m[1]);
  }
  return out;
}

// The copy's files, by object id: at a ref of the product's repository, or the folder as it is.
function copyFiles(product, dir, at) {
  if (at && product) return treeAt(product, at, slash(relative(product, dir)));
  const out = new Map();
  const walk = (d, rel = '') => {
    let es; try { es = readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of es) {
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (SKIP.test(r)) continue;
      if (e.isDirectory()) walk(join(d, e.name), r);
      else if (e.isFile()) { try { out.set(r, blobOf(readFileSync(join(d, e.name)))); } catch { /* unreadable: left out */ } }
    }
  };
  walk(dir);
  return out;
}

// The releases after the pinned one, oldest first: tags whose commit holds the pinned release's.
function laterReleases(repo, pinnedCommit) {
  return (git(repo, ['tag', '--contains', pinnedCommit, '--sort=v:refname']) ?? '').split('\n').filter(Boolean)
    .filter((t) => git(repo, ['rev-parse', `${t}^{commit}`]) !== pinnedCommit);
}

function readSeen(ROOT) { try { return JSON.parse(readFileSync(join(ROOT, OUT_DIR, 'copies', 'seen.json'), 'utf8')); } catch { return {}; } }
function writeSeen(ROOT, seen) { try { mkdirSync(join(ROOT, OUT_DIR, 'copies'), { recursive: true }); writeFileSync(join(ROOT, OUT_DIR, 'copies', 'seen.json'), JSON.stringify(seen) + '\n'); } catch { /* next run reads it all again */ } }

// copy: { dir, from }. release: the system's ref the copy is held to. at: the product's ref (null: its folder).
// cache: false to read everything again.
export function copyCheck(ROOT_, copy, { release = null, at = null, cache = true } = {}) {
  // git answers with real paths (a temporary folder behind a symlink, /var → /private/var): every path held to its
  // repository is real too, or what is relative to it walks out of it.
  const ROOT = (() => { try { return realpathSync.native(ROOT_); } catch { return ROOT_; } })();
  const dir = (() => { const d = resolve(ROOT, copy.dir); try { return realpathSync.native(d); } catch { return d; } })(), from = slash(copy.from ?? '.').replace(/^\.\/?|\/$/g, '');
  const product = repoOf(dir);
  const sysRepo = repoOf(ROOT);
  const pinned = release ?? readPin(product, at)?.system?.ref ?? readPin(product)?.system?.ref ?? copy.release ?? null;
  if (!sysRepo) return { error: 'the system is in no git repository, so no release can be read' };
  if (!pinned) return { error: `no release to hold ${copy.dir} to: pin it (--prototype --pin) or name it in copies → release` };
  const pinnedCommit = git(sysRepo, ['rev-parse', '--verify', '--quiet', `${pinned}^{commit}`]);
  if (!pinnedCommit) return { error: `${pinned} is not a release of the system's repository` };
  const sysPrefix = slash(relative(sysRepo, resolve(ROOT, from)));
  const release_ = treeAt(sysRepo, pinnedCommit, sysPrefix);
  const copy_ = copyFiles(product, dir, at);
  const seen = cache ? readSeen(ROOT) : {};
  let later = null;   // the later releases' trees, read once and only when a file needs them
  const laterOf = () => (later ??= laterReleases(sysRepo, pinnedCommit).map((t) => ({ tag: t, tree: treeAt(sysRepo, t, sysPrefix) })));
  const files = [];
  for (const [rel, blob] of copy_) {
    const want = release_.get(rel);
    if (want === blob) { files.push({ rel, state: 'same' }); continue; }
    const key = `${pinnedCommit}:${rel}:${blob}`;
    let found = seen[key];
    if (!found) {
      const newer = laterOf().find((r) => r.tree.get(rel) === blob);
      const known = git(sysRepo, ['cat-file', '-e', `${blob}^{blob}`]) !== null;
      found = newer ? { state: 'in a later release', tag: newer.tag } : known ? { state: 'older' } : { state: want ? 'changed' : 'only in the copy' };
      seen[key] = found;
    }
    files.push({ rel, ...found, ...(found.state === 'changed' || found.state === 'only in the copy' ? { commit: lastCommit(product, join(dir, rel), at) } : {}) });
  }
  for (const rel of release_.keys()) if (!copy_.has(rel)) files.push({ rel, state: 'missing from the copy' });
  if (cache) writeSeen(ROOT, seen);
  const counts = {};
  for (const f of files) counts[f.state] = (counts[f.state] ?? 0) + 1;
  // Each change a person made inside the copy, by the commit that made it: one request for the system each.
  const changes = new Map();
  for (const f of files.filter((x) => x.state === 'changed' || x.state === 'only in the copy')) {
    const k = f.commit?.sha ?? 'uncommitted';
    if (!changes.has(k)) changes.set(k, { commit: f.commit ?? null, files: [] });
    changes.get(k).files.push(f.rel);
  }
  const result = { copy: copy.dir, from: from || '.', release: pinned, files: files.sort((a, b) => a.rel.localeCompare(b.rel)), counts, changes: [...changes.values()] };
  const patch = copyPatch(ROOT, { sysRepo, product, dir, sysPrefix, pinnedCommit, release_, copy_, files: result.files, at, name: copy.dir });
  if (patch) result.patch = patch;
  return result;
}

function lastCommit(repo, abs, at) {
  if (!repo) return null;
  const out = git(repo, ['log', '-1', '--format=%h%x09%s', ...(at ? [at] : []), '--', slash(relative(repo, abs))]);
  if (!out) return null;
  const [sha, subject] = out.split('\t');
  return { sha, subject: subject ?? '' };
}

// The patch that brings the copy to its release: the older files and the missing ones, as the product applies it from
// its own root. The files changed inside the copy are left out: they are the system's to take or refuse.
function copyPatch(ROOT, { sysRepo, product, dir, sysPrefix, pinnedCommit, files, at, name }) {
  const todo = files.filter((f) => f.state === 'older' || f.state === 'missing from the copy');
  if (!todo.length || !product) return null;
  const tmp = mkdtempSync(join(tmpdir(), 'copy-patch-'));
  const parts = [];
  try {
    const inSystem = (rel) => (sysPrefix && sysPrefix !== '.' ? `${sysPrefix}/${rel}` : rel);
    for (const f of todo) {
      const target = slash(relative(product, join(dir, f.rel)));
      const a = join(tmp, 'a', f.rel), b = join(tmp, 'b', f.rel);
      mkdirSync(dirname(b), { recursive: true });
      writeFileSync(b, execFileSync('git', ['show', `${pinnedCommit}:${inSystem(f.rel)}`], { cwd: sysRepo }));
      let left = '/dev/null';
      if (f.state === 'older') {
        mkdirSync(dirname(a), { recursive: true });
        writeFileSync(a, at ? execFileSync('git', ['show', `${at}:${target}`], { cwd: product }) : readFileSync(join(dir, f.rel)));
        left = a;
      }
      let out = '';
      try { execFileSync('git', ['diff', '--no-index', '--no-color', '--', left, b], { cwd: tmp, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }); } catch (e) { out = String(e.stdout ?? ''); }   // a difference exits 1
      if (!out) continue;
      parts.push(out.split('\n').map((l) => l
        .replace(/^diff --git .*$/, `diff --git a/${target} b/${target}`)
        .replace(/^--- (?!\/dev\/null).*$/, `--- a/${target}`)
        .replace(/^\+\+\+ .*$/, `+++ b/${target}`)).join('\n'));
    }
  } finally { try { rmSync(tmp, { recursive: true, force: true }); } catch { /* temp */ } }
  if (!parts.length) return null;
  const file = join(ROOT, OUT_DIR, 'handback', `copy-${slash(name).replace(/[^\w.-]+/g, '-').replace(/^-+|-+$/g, '')}.diff`);
  try { mkdirSync(dirname(file), { recursive: true }); writeFileSync(file, parts.join('\n').replace(/\n*$/, '\n')); } catch { return null; }
  return { file: slash(relative(ROOT, file)), files: todo.length, applyIn: slash(relative(ROOT, product)) || '.' };
}

export function copyLines(r) {
  if (!r) return [];
  if (r.error) return [`COPY OF THE SYSTEM  ⏭ ${r.error}`];
  const c = r.counts, n = (k) => c[k] ?? 0;
  const clean = !n('older') && !n('changed') && !n('only in the copy') && !n('missing from the copy') && !n('in a later release');
  const out = [`COPY OF THE SYSTEM  ${r.copy}, held to ${r.release}: ${clean ? `the same as the release, ${n('same')} files` : `${n('same')} the same · ${n('older')} from an older release · ${n('in a later release')} from a later release · ${n('changed')} changed in the copy · ${n('only in the copy')} only in the copy · ${n('missing from the copy')} missing from the copy`}`];
  if (n('older')) out.push(`   ❌ bring the copy up to ${r.release}: ${r.files.filter((f) => f.state === 'older').map((f) => f.rel).slice(0, 8).join(', ')}${n('older') > 8 ? ', …' : ''}`);
  if (n('missing from the copy')) out.push(`   ❌ missing from the copy: ${r.files.filter((f) => f.state === 'missing from the copy').map((f) => f.rel).slice(0, 8).join(', ')}${n('missing from the copy') > 8 ? ', …' : ''}`);
  if (r.patch) out.push(`   ✏️  the patch that brings ${r.patch.files} file${r.patch.files === 1 ? '' : 's'} to ${r.release}: ${r.patch.file} (git apply it in ${r.patch.applyIn})`);
  const byTag = new Map();
  for (const f of r.files.filter((x) => x.state === 'in a later release')) { if (!byTag.has(f.tag)) byTag.set(f.tag, []); byTag.get(f.tag).push(f.rel); }
  for (const [tag, list] of byTag) out.push(`   ⚠️  already in ${tag}: ${list.slice(0, 6).join(', ')}${list.length > 6 ? `, and ${list.length - 6} more` : ''}. Move the pin to ${tag} rather than ask the system for it`);
  for (const ch of r.changes) out.push(`   ❌ changed in the copy${ch.commit ? ` by ${ch.commit.sha} "${ch.commit.subject}"` : ', not committed'}: ${ch.files.slice(0, 6).join(', ')}${ch.files.length > 6 ? `, and ${ch.files.length - 6} more` : ''}. The system's to take or refuse: a request each`);
  return out;
}
