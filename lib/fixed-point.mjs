// fixed-point.mjs - a prototype checked at a fixed point: its tag, and the system and intent layer it pinned.
//
// What is handed over is a tag, and whoever receives it has to get the same answer when they check it again. Read from
// the folder as it is today, a check proves nothing about what was delivered: the branch has moved, a file was saved
// and not committed, the system was updated underneath. So a prototype names, once, the system and the intent layer
// it is built on, in a file of its own repository (the pin), and a check can read the page at a git ref and say
// whether the system and the layer in front of it are the ones the page pinned.
//
//   PIN_FILE                               the pin's name, at the root of the prototype's own repository
//   repoOf(dir)                            → the git repository that holds a folder, or null
//   readPin(repo, ref?) / pinOf(…)          → the pin as committed at ref (else as it is in the folder), or null
//   writePin(repo, pin)                    → writes it (only on request: --prototype --pin)
//   fileAt(repo, ref, rel)                 → a file's text at a ref, or null
//   fixedPoint({ ROOT, cfg, file, at })    → { prototype, system, intentLayer, evidence, why }: what was read, and
//                                            whether it may stand as evidence
//   fixedPointLines(fp)                    → the lines a report prints
//
// Git only, through the git the person already has. Never writes anything but the pin, and that only when asked.
import { readFileSync, writeFileSync, existsSync, realpathSync } from 'node:fs';
import { join, resolve, relative, dirname } from 'node:path';
import { execFileSync } from 'node:child_process';
import { intentLayerConfig } from './doc-source-dsds.mjs';

export const PIN_FILE = 'design-system-pin.json';

const git = (cwd, args) => { try { return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch { return null; } };

export function repoOf(dir) {
  let d = resolve(dir);
  while (!existsSync(d)) { const up = dirname(d); if (up === d) return null; d = up; }
  return git(d, ['rev-parse', '--show-toplevel']);
}

export function fileAt(repo, ref, rel) {
  if (!repo || !ref) return null;
  try { return execFileSync('git', ['show', `${ref}:${String(rel).split('\\').join('/')}`], { cwd: repo, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }); } catch { return null; }
}

// A ref as git knows it: its commit, and the tag it is when it is one (a tag named, or a tag on that very commit).
export function refInfo(repo, ref = 'HEAD') {
  if (!repo) return null;
  const commit = git(repo, ['rev-parse', '--verify', '--quiet', `${ref}^{commit}`]);
  if (!commit) return null;
  const named = git(repo, ['rev-parse', '--verify', '--quiet', `refs/tags/${ref}`]) ? ref : null;
  const tag = named ?? git(repo, ['describe', '--tags', '--exact-match', commit]);
  const dirty = ref === 'HEAD' && !!git(repo, ['status', '--porcelain', '--untracked-files=no']);
  return { ref, commit, short: commit.slice(0, 8), tag: tag || null, dirty };
}

export function readPin(repo, ref = null) {
  if (!repo) return null;
  const text = ref ? fileAt(repo, ref, PIN_FILE) : (() => { try { return readFileSync(join(repo, PIN_FILE), 'utf8'); } catch { return null; } })();
  if (!text) return null;
  try { return JSON.parse(text); } catch { return null; }
}

export function writePin(repo, pin) {
  writeFileSync(join(repo, PIN_FILE), JSON.stringify(pin, null, 2) + '\n');
  return join(repo, PIN_FILE);
}

// The intent layer's own commit, where the engine can know it: a folder in a git repository. A layer read from a host
// (GitLab, GitHub) is read at the ref the setting names, and that is what is said.
export function intentLayerRef(ROOT, cfg = {}) {
  const c = intentLayerConfig(cfg);
  if (!c) return null;
  if (c.host === 'folder') {
    const dir = resolve(ROOT, c.folder ?? '.');
    const repo = repoOf(dir);
    const info = repo ? refInfo(repo) : null;
    return { where: c.folder ?? '.', commit: info?.commit ?? null, tag: info?.tag ?? null, dirty: info?.dirty ?? false };
  }
  return { where: c.url, commit: null, ref: c.ref ?? null, remote: true };
}

// What a pin says now, for --prototype --pin: the system's tag (else its commit), the intent layer's commit, and the
// commit the prototype's work starts from (its repository's HEAD, unless the pin already says).
export function pinNow({ ROOT, cfg = {}, protoRepo, system = null, from = null, before = null } = {}) {
  const sys = refInfo(ROOT, system ?? 'HEAD');
  const il = intentLayerRef(ROOT, cfg);
  return {
    system: sys ? { ref: system ?? sys.tag ?? sys.commit, commit: sys.commit } : null,
    intentLayer: il?.commit ? { commit: il.commit } : il?.ref ? { ref: il.ref } : null,
    from: from ?? before?.from ?? refInfo(protoRepo)?.commit ?? null,
  };
}

// The prototype at its ref, and the system and the layer as they are in front of the check, held to the pin.
// evidence: a tag, nothing uncommitted read, and the system and the layer the ones pinned.
export function fixedPoint({ ROOT, cfg = {}, file, at = null } = {}) {
  // Real paths, as git gives its own (a folder behind a symlink would put the page outside its repository).
  const real = (p) => { try { return realpathSync.native(p); } catch { return p; } };
  const abs = resolve(real(ROOT), file);
  const protoRepo = repoOf(dirname(abs));
  const why = [];
  const proto = protoRepo ? refInfo(protoRepo, at ?? 'HEAD') : null;
  const rel = protoRepo ? relative(protoRepo, abs) : file;
  if (!protoRepo) why.push('the prototype is in no git repository, so nothing fixes what was checked');
  else if (!proto) why.push(`${at} is not a ref of the prototype's repository`);
  else {
    if (!at) why.push('read from the folder, not at a ref: run it again with --at <tag>');
    else if (!proto.tag) why.push(`${at} is not a tag: a branch or a commit moves on, a tag does not`);
    if (!at && proto.dirty) why.push('the prototype\'s repository has changes nobody committed');
  }
  const pin = protoRepo ? readPin(protoRepo, at) ?? (at ? null : readPin(protoRepo)) : null;
  if (protoRepo && !pin) why.push(`no ${PIN_FILE} in the prototype's repository: run --prototype --pin once, before the first screen`);
  // The system in front of the check, against the one pinned.
  const here = refInfo(ROOT);
  const pinnedSys = pin?.system ?? null;
  const sysPinned = pinnedSys ? refInfo(ROOT, pinnedSys.ref ?? pinnedSys.commit) : null;
  const system = { pinned: pinnedSys?.ref ?? null, pinnedCommit: pinnedSys?.commit ?? sysPinned?.commit ?? null, here: here?.tag ?? here?.short ?? null, hereCommit: here?.commit ?? null, dirty: !!here?.dirty };
  system.same = !!(system.pinnedCommit && system.hereCommit && system.pinnedCommit === system.hereCommit && !system.dirty);
  if (pinnedSys && !system.same) why.push(system.dirty && system.pinnedCommit === system.hereCommit ? 'the system has changes nobody committed' : `the system here is ${system.here ?? 'unknown'}, the prototype pinned ${system.pinned}: check out ${system.pinned} in the system's folder`);
  // The layer, the same way where its commit can be known.
  const ilHere = intentLayerRef(ROOT, cfg);
  const pinnedIl = pin?.intentLayer ?? null;
  const intentLayer = ilHere ? { pinned: pinnedIl?.commit ?? pinnedIl?.ref ?? null, here: ilHere.commit ?? ilHere.ref ?? null, remote: !!ilHere.remote, where: ilHere.where } : null;
  if (intentLayer) {
    intentLayer.same = !!(intentLayer.pinned && intentLayer.here && String(intentLayer.here).startsWith(String(intentLayer.pinned).slice(0, 7)) && !ilHere.dirty);
    if (intentLayer.pinned && !intentLayer.same) why.push(ilHere.remote ? `the intent layer is read from ${ilHere.where}${ilHere.ref ? ` at ${ilHere.ref}` : ''}, which the engine cannot hold to ${intentLayer.pinned}` : `the intent layer here is at ${String(intentLayer.here ?? 'unknown').slice(0, 8)}, the prototype pinned ${String(intentLayer.pinned).slice(0, 8)}`);
  }
  return {
    prototype: proto ? { repo: protoRepo, file: rel, at: at ?? null, commit: proto.commit, tag: proto.tag, dirty: !at && proto.dirty } : null,
    pin, system, intentLayer, from: pin?.from ?? null,
    evidence: why.length === 0, why,
  };
}

export function fixedPointLines(fp) {
  if (!fp) return [];
  const p = fp.prototype;
  const out = [`CHECKED AT  ${fp.evidence ? 'a fixed point: this report stands as evidence' : 'a draft: good for iterating, not evidence'}`];
  if (p) out.push(`   prototype      ${p.file} at ${p.tag ? `tag ${p.tag}` : p.at ? p.at : 'the folder'} (${p.commit.slice(0, 8)}${p.dirty ? ', with uncommitted changes' : ''})`);
  if (fp.system) out.push(`   system         ${fp.system.here ?? 'unknown'}${fp.system.pinned ? `${fp.system.same ? ', as pinned' : `, pinned ${fp.system.pinned}`}` : ', nothing pinned'}`);
  if (fp.intentLayer) out.push(`   intent layer   ${String(fp.intentLayer.here ?? fp.intentLayer.where).slice(0, 40)}${fp.intentLayer.pinned ? `${fp.intentLayer.same ? ', as pinned' : `, pinned ${String(fp.intentLayer.pinned).slice(0, 8)}`}` : ', nothing pinned'}`);
  for (const w of fp.why) out.push(`   · ${w}`);
  return out;
}
