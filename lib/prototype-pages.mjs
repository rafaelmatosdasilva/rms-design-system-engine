// prototype-pages.mjs - each prototype as a part of its own in the style guide: one page for it, and a list of them all.
//
// A prototype keeps its own things beside it (the page, its check record, its handoff and its versions, its notes, the
// comments on it, its pictures), and the style guide showed it only inside the pages of the components it used.
// Whoever picked a prototype up, the team that builds it or the system's team, had nowhere to see it whole. This reads
// what is kept, for every prototype the project has, and writes nothing but the pictures it keeps beside each one:
//
//   prototypePages(ROOT, { dir, outDir })  → [{ name, file, product, state, asked, screens, states, check, lacked,
//                                              versions, notes, comments }]
//   prototypeFiles(ROOT, { dir })          → { name: { file, product, dir } }
//   keepScreens(ROOT, name, protoDir)      → the pictures the last draw took, kept beside the prototype
//
// A team keeps its prototypes in a folder per product (prototypes/<Product>/<name>.vue): the folder names the product,
// and a prototype at the top of the folder belongs to none. Everything about one sits beside it, so the store it is
// shared through carries all of it (stores.mjs).
//
// Its state is said in the page's own words, from what was found, never a verdict of its own: Fix (its last check found
// something), Missing (the system lacks something it needs), Not checked, Done.
import { readFileSync, readdirSync, existsSync, statSync, mkdirSync, copyFileSync } from 'node:fs';
import { join, relative, dirname } from 'node:path';
import { spawnSync } from 'node:child_process';
import { readChecks } from './prototype-record.mjs';
import { versionsOf, sinceLines } from './handoff-versions.mjs';
import { readNotes } from './handoff-notes.mjs';
import { readComments } from './comments.mjs';
import { slashed } from './shown-path.mjs';

const PAGE = /\.(json|html|jsx|tsx|vue)$/;
const OWN = /\.(check|comments|handoff)\.json$|\.handoff-notes\.md$|^conventions\.json$/;
const SIDE = /\.(handoffs|screens)$/;   // a prototype's own folders, never a product's

const readJson = (f) => { try { return JSON.parse(readFileSync(f, 'utf8')); } catch { return null; } };
const isDir = (p) => { try { return statSync(p).isDirectory(); } catch { return false; } };
// A PNG's size from its header, at the scale it was taken (a draw pictures at 1).
const picture = (file, label) => {
  try { const b = readFileSync(file); return { label, src: `data:image/png;base64,${b.toString('base64')}`, w: b.readUInt32BE(16), h: b.readUInt32BE(20) }; } catch { return null; }
};

// Every prototype the project has: a page at the top of the folder, or in a product's folder in it.
export function prototypeFiles(ROOT, { dir = 'prototypes' } = {}) {
  const out = {};
  const pages = (rel, product) => { try { for (const f of readdirSync(join(ROOT, rel))) if (PAGE.test(f) && !OWN.test(f) && !isDir(join(ROOT, rel, f))) out[f.replace(/\.[^.]+$/, '')] ??= { file: `${rel}/${f}`, product, dir: rel }; } catch { /* no folder */ } };
  pages(dir, null);
  let subs = []; try { subs = readdirSync(join(ROOT, dir)).filter((f) => !SIDE.test(f) && isDir(join(ROOT, dir, f))); } catch { /* no folder */ }
  for (const s of subs) pages(`${dir}/${s}`, s);
  // A prototype only a check names (its page in a store not read here yet).
  for (const [n, r] of Object.entries(readChecks(ROOT, dir))) out[n] ??= { file: r.file ?? null, product: null, dir };
  return Object.fromEntries(Object.entries(out).sort(([a], [b]) => a.localeCompare(b)));
}
export const prototypeNames = (ROOT, opts) => Object.keys(prototypeFiles(ROOT, opts));

// The pictures a draw takes (<out>/prototypes/<name>@<width>.png, and <name>.<state>.png), kept beside the prototype in
// <name>.screens/, so they travel with it. The engine's own folder is this computer's; the prototype's is the team's.
export function keepScreens(ROOT, name, protoDir, { outDir = '.design-system-engine-out' } = {}) {
  const from = join(ROOT, outDir, 'prototypes'), to = join(protoDir, `${name}.screens`);
  let files = []; try { files = readdirSync(from).filter((f) => f.startsWith(`${name}@`) || (f.startsWith(`${name}.`) && f.endsWith('.png') && !f.endsWith('.diff.png'))).filter((f) => f.endsWith('.png')); } catch { return 0; }
  if (!files.length) return 0;
  mkdirSync(to, { recursive: true });
  for (const f of files) copyFileSync(join(from, f), join(to, f.slice(name.length)));
  return files.length;
}

// Its pictures, from beside it first, else from this computer's last draw: each width narrowest first, each state.
function picturesOf(ROOT, name, protoDir, outDir) {
  const kept = join(ROOT, protoDir, `${name}.screens`);
  const at = existsSync(kept) ? { dir: kept, pre: '' } : { dir: join(ROOT, outDir, 'prototypes'), pre: name };
  let files = []; try { files = readdirSync(at.dir).filter((f) => f.startsWith(at.pre) && f.endsWith('.png') && !f.endsWith('.diff.png')); } catch { return { screens: [], states: [] }; }
  const rest = (f) => f.slice(at.pre.length);
  const screens = files.filter((f) => rest(f).startsWith('@')).map((f) => picture(join(at.dir, f), rest(f).slice(1, -4).replace(/-/g, ' '))).filter(Boolean).sort((a, b) => a.w - b.w);
  const states = files.filter((f) => /^\.[^.@]+\.png$/.test(rest(f))).map((f) => picture(join(at.dir, f), rest(f).slice(1, -4).replace(/-/g, ' '))).filter(Boolean);
  // A draw before widths were pictured kept one picture of the page as drawn.
  if (!screens.length && existsSync(join(at.dir, `${at.pre}.png`)) && at.pre) { const p = picture(join(at.dir, `${at.pre}.png`), 'as drawn'); if (p) screens.push(p); }
  return { screens, states };
}

// Who added it and when, from the commit that did, for a prototype no check names an asker for.
function addedBy(ROOT, file) {
  if (!file) return null;
  const r = spawnSync('git', ['log', '--diff-filter=A', '--follow', '--format=%an|%aI', '--', file], { cwd: ROOT, encoding: 'utf8', timeout: 10000 });
  const last = String(r.stdout ?? '').trim().split('\n').filter(Boolean).pop();
  if (r.status !== 0 || !last) return null;
  const [by, at] = last.split('|');
  return by ? { by, at: at ?? null } : null;
}

// What a version's handoff changed since the one before, as plain lines (the page's own words, not Markdown).
const sinceSaid = (since) => sinceLines(since).filter((l) => /^- /.test(l)).map((l) => l.slice(2));

export function prototypePages(ROOT, { dir = 'prototypes', outDir = '.design-system-engine-out' } = {}) {
  const checks = readChecks(ROOT, dir);
  const gaps = readJson(join(ROOT, outDir, 'prototypes', 'gaps.json'))?.byPrototype ?? {};
  return Object.entries(prototypeFiles(ROOT, { dir })).map(([name, at]) => {
    const r = checks[name] ?? null;
    const { screens, states } = picturesOf(ROOT, name, at.dir, outDir);
    // What the system lacks for it, a line a need with how many places lack it: its check's own, else the last draw's.
    const lacked = [];
    for (const need of (r ? r.lacked ?? [] : gaps[name] ?? []).map((g) => g.need).filter(Boolean)) {
      const had = lacked.find((x) => x.need === need);
      if (had) had.times++; else lacked.push({ need, times: 1 });
    }
    const allVersions = versionsOf(join(ROOT, at.dir), name);
    const versions = allVersions.map((v, i) => ({ version: v.version, at: v.at ?? null, since: i ? sinceSaid(v.since ?? null) : [] }));
    let notesText = null; try { notesText = readFileSync(join(ROOT, at.dir, `${name}.handoff-notes.md`), 'utf8'); } catch { /* none written */ }
    const notes = readNotes(notesText);
    const comments = readComments(ROOT, name, { dir: at.dir }).map((c) => ({ id: c.id, says: c.says, by: c.by ?? null, at: c.at ?? null, on: c.on ?? null, done: !!c.done, answer: c.done?.answer ?? null }));
    const check = r ? { at: r.at ?? null, ok: !!r.ok, mistakes: r.mistakes ?? 0, owes: r.owes ?? [], used: r.used ?? {}, items: (r.items ?? []).map((i) => ({ component: i.component, message: i.message })), system: r.checkedAt?.system ?? null, commit: r.checkedAt?.commit ?? null, tag: r.checkedAt?.tag ?? null } : null;
    // What was asked, by whom and when: kept with its check, else with its latest handoff; who added it, else, from Git.
    const request = r?.request ?? [...allVersions].reverse().find((v) => v.request)?.request ?? null;
    const added = r?.by ? null : addedBy(ROOT, at.file);
    const asked = { request, by: r?.by ?? added?.by ?? null, at: r?.askedAt ?? added?.at ?? null };
    // Each ask in order: the one that made it, then each that changed it (Continue).
    const asks = (r?.asks ?? (request ? [{ request, by: asked.by, at: asked.at }] : [])).map((a) => ({ request: a.request, by: a.by ?? null, at: a.at ?? null }));
    const state = !check ? 'not checked' : check.mistakes || check.owes.length ? 'fix' : lacked.length ? 'missing' : 'done';
    return {
      name, file: at.file, product: at.product, state, asked, asks, screens, states, check, lacked,
      versions,
      notes: notes ? notes.parts.map((p) => ({ title: p.title, owner: p.owner, date: p.date, body: p.body, empty: p.empty })) : null,
      comments,
    };
  });
}
