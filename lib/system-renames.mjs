// system-renames.mjs - an icon or a token the system renamed, found in its own history, so the check says the new name.
//
// A page written against one release uses an icon or a token another release no longer has, and the check said only
// that it does not exist. Most of the time it was renamed, and the fix is a one-word change nobody is told. The
// system's git history knows: an icon's file renamed (git's own rename detection), and a token's declaration taken out
// in the same commit that declared another with the same value. Nothing is guessed from the names.
//
//   iconRenames(repo)        → Map(old icon name → new), from renamed files
//   tokenRenames(repo)       → Map(--old → --new), from a declaration moved to a new name with the same value
//   renamedTo(map, name)     → the name it was renamed to, followed through later renames, or null
import { spawnSync } from 'node:child_process';
import { basename, extname } from 'node:path';

const git = (cwd, args) => { const r = spawnSync('git', args, { cwd, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, timeout: 30000 }); return r.status === 0 ? r.stdout : ''; };
const head = (repo) => git(repo, ['rev-parse', 'HEAD']).trim();
const memo = new Map();
const once = (kind, repo, make) => { if (!repo) return new Map(); const k = `${kind}:${repo}:${head(repo)}`; if (!memo.has(k)) memo.set(k, make()); return memo.get(k); };

const ICON_FILE = /\.(svg|png|vue|jsx|tsx)$/i;
const bare = (f) => basename(f, extname(f));

// Oldest first, so a later rename of the same icon wins.
export function iconRenames(repo) {
  return once('icons', repo, () => {
    const out = new Map();
    const lines = git(repo, ['log', '--all', '--reverse', '-M', '--diff-filter=R', '--name-status', '--format=']).split('\n');
    for (const l of lines) {
      const m = /^R\d*\t(.+)\t(.+)$/.exec(l);
      if (!m || !ICON_FILE.test(m[1]) || !ICON_FILE.test(m[2])) continue;
      const from = bare(m[1]), to = bare(m[2]);
      if (from !== to) out.set(from, to);
    }
    return out;
  });
}

const DECL = /^([+-])\s*(--[\w-]+)\s*:\s*([^;]+?)\s*;/;
export function tokenRenames(repo) {
  return once('tokens', repo, () => {
    const out = new Map();
    const text = git(repo, ['log', '--all', '--reverse', '-p', '-U0', '--format=format:@@COMMIT', '--', '*.css', '*.scss', '*.less']);
    for (const commit of text.split('@@COMMIT').slice(1)) {
      const gone = new Map(), added = new Map();
      for (const l of commit.split('\n')) {
        if (/^(\+\+\+|---) /.test(l)) continue;
        const m = DECL.exec(l);
        if (!m) continue;
        (m[1] === '-' ? gone : added).set(m[2], m[3]);
      }
      for (const [name, value] of gone) {
        if (added.has(name)) continue;                                   // its value changed, not its name
        const to = [...added].filter(([n, v]) => v === value && !gone.has(n)).map(([n]) => n);
        if (to.length === 1) out.set(name, to[0]);                       // one new name with that value: a rename
      }
    }
    return out;
  });
}

export function renamedTo(map, name) {
  if (!map?.size || !name) return null;
  let at = map.get(name) ?? null;
  for (let i = 0; at && map.has(at) && i < 20; i++) at = map.get(at);
  return at;
}
