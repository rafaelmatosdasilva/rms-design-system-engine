// prototype-pages.mjs - each prototype as a part of its own in the style guide: one page for it, and a list of them all.
//
// A prototype keeps its own things beside it (the page, its check record, its handoff and its versions, its notes, the
// comments on it), and the style guide showed it only inside the pages of the components it used. Whoever picked a
// prototype up, the team that builds it or the system's team, had nowhere to see it whole. This reads what is already
// kept, for every prototype the project has, and writes nothing:
//
//   prototypePages(ROOT, { dir, outDir })  → [{ name, state, screens, check, lacked: [{ need, times }], versions, notes, comments }]
//
// Its screens are the pictures the last draw took of it (<out>/prototypes/<name>@<width>.png), carried as data like
// every picture on the page (styleguide-files.mjs writes them out). Its state is said from what was found, never a
// verdict of its own: not checked, holds, has findings, or lacks something in the system.
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { readChecks } from './prototype-record.mjs';
import { versionsOf, sinceLines } from './handoff-versions.mjs';
import { readNotes } from './handoff-notes.mjs';
import { readComments } from './comments.mjs';

// The widths a draw pictures, narrowest first, as a person reads them.
const WIDTHS = ['phone', 'tablet', 'desktop'];
const OWN = /\.(check|comments|handoff)\.json$|\.handoff-notes\.md$/;

const readJson = (f) => { try { return JSON.parse(readFileSync(f, 'utf8')); } catch { return null; } };
// A PNG's size from its header, at the scale it was taken (a draw pictures at 1).
const picture = (file, label) => {
  try {
    const b = readFileSync(file);
    return { label, src: `data:image/png;base64,${b.toString('base64')}`, w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
  } catch { return null; }
};

// Every prototype the project has: a page in its folder, or a check kept beside one. What the engine's own folder
// remembers of a prototype that is gone (an older draw's gaps) is no prototype of the project's.
// → { name: its page's file in the folder, or null when only its check is kept }
export function prototypeFiles(ROOT, { dir = 'prototypes' } = {}) {
  const out = {};
  try { for (const f of readdirSync(join(ROOT, dir))) if (/\.(json|html|jsx|tsx|vue)$/.test(f) && !OWN.test(f)) out[f.replace(/\.[^.]+$/, '')] ??= `${dir}/${f}`; } catch { /* no folder */ }
  for (const [n, r] of Object.entries(readChecks(ROOT, dir))) out[n] ??= r.file ?? null;
  return Object.fromEntries(Object.entries(out).sort(([a], [b]) => a.localeCompare(b)));
}
export const prototypeNames = (ROOT, opts) => Object.keys(prototypeFiles(ROOT, opts));

// What a version's handoff changed since the one before, as plain lines (the page's own words, not Markdown).
const sinceSaid = (since) => sinceLines(since).filter((l) => /^- /.test(l)).map((l) => l.slice(2));

export function prototypePages(ROOT, { dir = 'prototypes', outDir = '.design-system-engine-out' } = {}) {
  const checks = readChecks(ROOT, dir);
  const gaps = readJson(join(ROOT, outDir, 'prototypes', 'gaps.json'))?.byPrototype ?? {};
  const drawn = join(ROOT, outDir, 'prototypes');
  return Object.entries(prototypeFiles(ROOT, { dir })).map(([name, file]) => {
    const r = checks[name] ?? null;
    const screens = WIDTHS.map((w) => picture(join(drawn, `${name}@${w}.png`), w)).filter(Boolean);
    if (!screens.length && existsSync(join(drawn, `${name}.png`))) { const p = picture(join(drawn, `${name}.png`), 'as drawn'); if (p) screens.push(p); }
    // What the system lacks for it: the check's own when there is one, else what the last draw found.
    // One line a need, however many places on the page lack it, with how many.
    const lacked = [];
    for (const need of (r ? r.lacked ?? [] : gaps[name] ?? []).map((g) => g.need).filter(Boolean)) {
      const had = lacked.find((x) => x.need === need);
      if (had) had.times++; else lacked.push({ need, times: 1 });
    }
    const versions = versionsOf(join(ROOT, dir), name).map((v, i) => ({ version: v.version, at: v.at ?? null, since: i ? sinceSaid(v.since ?? null) : [] }));
    let notesText = null; try { notesText = readFileSync(join(ROOT, dir, `${name}.handoff-notes.md`), 'utf8'); } catch { /* none written */ }
    const notes = readNotes(notesText);
    const comments = readComments(ROOT, name).map((c) => ({ id: c.id, says: c.says, by: c.by ?? null, at: c.at ?? null, on: c.on ?? null, done: !!c.done, answer: c.answer ?? null }));
    const check = r ? { at: r.at ?? null, ok: !!r.ok, mistakes: r.mistakes ?? 0, owes: r.owes ?? [], used: r.used ?? {}, items: (r.items ?? []).map((i) => ({ component: i.component, message: i.message })), system: r.checkedAt?.system ?? null, commit: r.checkedAt?.commit ?? null, tag: r.checkedAt?.tag ?? null } : null;
    const state = !check ? 'not checked' : check.mistakes || check.owes.length ? 'findings' : lacked.length ? 'lacks' : 'holds';
    return {
      name, file, state, screens, check, lacked,
      versions,
      notes: notes ? notes.parts.map((p) => ({ title: p.title, owner: p.owner, date: p.date, body: p.body, empty: p.empty })) : null,
      comments,
    };
  });
}
