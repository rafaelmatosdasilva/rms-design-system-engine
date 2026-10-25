// intent-answers.mjs - what the team's answers to the engine's proposals (intent-proposals.mjs) change in the intent layer's
// own files, made with the other fixes (intent-changes.mjs → prepareLayerFix), so an answer is all a person gives:
//   Move  yes: the page stays, with a line saying it is not used on its own (intent-changes.mjs → planOf, partOf).
//         no:  what only this page says goes to the page of the component that uses it, as drafts; this page is taken
//              out, and the layer's table of code files notes it is a part, so the layer does not make it again.
//   Fix   yes: the name is no longer a finding (intent-truth.mjs).
//         no:  the sentence is written again with what the system has, as a draft. Until the team answers, it is held.
//   Add   a page to write (a yes to writing it, a no to it being documented in another's page): its page is started,
//         a spec and a page beside its siblings', a row in the layer's table of code files, its lines drafted as any
//         page's; a no to writing it takes it off the pages to write (intent-proposals.mjs).
import { mdAdd, mdRemove, jsonAdd, jsonText, specIndex, specOf } from './intent-changes.mjs';
import { linesOf } from './intent-truth.mjs';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { extractProps, extractEvents, extractSlots } from './component-source.mjs';

const flat = (s) => String(s ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
const noExt = (f) => String(f ?? '').replace(/^\.?\//, '').replace(/\.[\w]+$/, '');
const kebab = (s) => String(s).replace(/([a-z0-9])([A-Z])/g, '$1-$2').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase();
const words = (s) => String(s).replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[^A-Za-z0-9]+/g, ' ').trim().split(/\s+/).map((w) => w[0].toUpperCase() + w.slice(1)).join(' ');
const answerOf = (decisions, k) => decisions[k]?.answer ?? null;
// The written sections a part's lines are taken from, and where each goes on its parent's page.
const MERGED = { Intent: 'When to use', 'When to use': 'When to use', 'When not to use': 'When not to use', 'Common mistakes': 'Common mistakes', Limitations: 'Limitations', Rules: 'Rules' };

// What the answers ask of the layer. → { hold: Set(fix keys still to answer), merges: [{ part, into }], creates: [{ name, code }] }
export function answersFor({ snap, report, proposals, decisions, codeFiles = {} }) {
  const hold = new Set(), merges = [], creates = [];
  const byName = new Map(snap.entities.map((e) => [e.name, e]));
  for (const [k, x] of proposals) {
    const a = answerOf(decisions, k);
    if (x.kind === 'fix' && !a) hold.add(k);
    if (x.kind === 'move' && a === 'no') {
      const part = byName.get(x.page);
      const into = snap.entities.find((e) => e !== part && e.code && (x.by ?? []).some((f) => noExt(e.code) === noExt(f)));
      if (part && into) merges.push({ part, into });
    }
    if (x.kind === 'add' && ((x.effect === 'write' && a === 'yes') || (x.effect === 'documented' && a === 'no')) && !report.pages.some((p) => p.component === x.subject)) creates.push({ name: x.subject, code: codeFiles[x.subject] ?? null });
  }
  return { hold, merges, creates };
}

// The layer's table of code files (a Markdown table whose rows name `src/…` files): the one that already notes parts
// ("Part of …"), as the layer's own generator reads it; else the one with the most rows.
function tableOfCode(files) {
  let best = null;
  for (const [f, t] of files) {
    if (!/\.md$/i.test(f)) continue;
    const rows = t.match(/^\|[^\n]*`src\/[^`]+`[^\n]*\|\s*$/gm) ?? [];
    const parts = rows.filter((r) => /\|\s*Part of\b/.test(r)).length;
    if (rows.length && (parts > (best?.parts ?? 0) || (parts === (best?.parts ?? 0) && rows.length > (best?.n ?? 0)))) best = { f, n: rows.length, parts };
  }
  return best?.f ?? null;
}
// A row's note starts with "Part of `<parent>`." — how such a table marks a part (it then gets no page of its own).
export function markPart(text, code, parent) {
  return text.split('\n').map((l) => {
    if (!l.startsWith('|') || !l.includes('`' + code + '`')) return l;
    const cells = l.replace(/^\||\|\s*$/g, '').split('|');
    if (/^\s*Part of\b/.test(cells.slice(2).join('|'))) return l;
    const last = cells.length - 1;
    cells[last] = ` Part of \`${parent}\`. ${cells[last].trim()} `.replace(/\s+$/, ' ');
    return '|' + cells.join('|') + '|';
  }).join('\n');
}
// A row for a new code file, after its siblings' (same folder), else at the table's end.
export function addRow(text, name, code, note) {
  const lines = text.split('\n'), row = `| \`${name}\` | \`${code}\` | ${note} |`;
  if (lines.some((l) => l.includes('`' + code + '`'))) return text;
  const dir = code.split('/').slice(0, -1).join('/') + '/';
  let at = -1, end = -1;
  lines.forEach((l, i) => { if (/^\|.*`src\/[^`]+`/.test(l)) { end = i; if (l.includes('`' + dir)) at = i; } });
  const i = at >= 0 ? at : end; if (i < 0) return text;
  lines.splice(i + 1, 0, row);
  return lines.join('\n');
}

// The lines many pages say alike, their own names aside (a component's name, its code name, anything in backticks):
// what a generator or a template wrote, never what is true of one part. → (entity, text) → true when it is one of them.
// files: the layer's own files, so its specs count too (a line taken out of most pages may still be in their specs).
export function commonLines(entities, { min = 5, files = new Map() } = {}) {
  const shape = (e, t) => {
    let x = String(t).replace(/`[^`]*`/g, '{}');
    for (const w of [e.name, e.code, e.id, ...(e.aliases ?? [])].filter(Boolean).sort((a, b) => String(b).length - String(a).length)) x = x.split(w).join('{}');
    return x.toLowerCase().replace(/\s+/g, ' ').trim();
  };
  const count = new Map();
  const tally = (e, texts) => { for (const k of new Set(texts.map((t) => shape(e, t.replace(/^\s*[-*]\s+/, ''))).filter(Boolean))) count.set(k, (count.get(k) ?? 0) + 1); };
  for (const e of entities) tally(e, linesOf(e).flatMap((l) => l.text.split('\n')));
  // A spec's list items, its title and the code file it names as its own names.
  for (const [f, t] of files) {
    if (!/\.md$/i.test(f)) continue;
    const name = /^#\s+(.+)$/m.exec(t)?.[1]?.trim(), code = /^\s*[-*]\s*Source:\s*`([^`]+)`/mi.exec(t)?.[1];
    if (!code) continue;
    tally({ name, code }, t.split('\n').filter((l) => /^\s*[-*]\s+/.test(l) && !/^\s*[-*]\s*[\w ]+:\s*`/.test(l)));
  }
  return (e, t) => (count.get(shape(e, t)) ?? 0) >= min;
}

// Merges: the part's lines its parent's page does not say, drafted there (each with the part's name); the part's page
// taken out and the table noting it is a part, so the layer makes no page for it again. Its spec stays, as a part's spec
// does. next: Map(path → text | null for a file taken out).
export function applyMerges(merges, files, next, { layout = null, common = () => false } = {}) {
  const idx = specIndex(files), text = (f) => (next.has(f) ? next.get(f) : files.get(f)), pages = [];
  const table = tableOfCode(files);
  for (const { part, into } of merges) {
    // What its parent says already, and what is written on every page alike, is not moved.
    const said = new Set([...linesOf(into).map((l) => l.text), ...(part.repeatedLines ?? []), ...(into.repeatedLines ?? [])].flatMap((t) => String(t).split('\n')).map((t) => flat(t.replace(/^\s*[-*]\s+/, ''))));
    const src = specOf(into, idx);
    const moved = [];
    for (const l of linesOf(part)) {
      const where = MERGED[l.where]; if (!where) continue;
      for (const t of l.text.split('\n').map((x) => x.replace(/^\s*[-*]\s+/, '').trim()).filter(Boolean)) {
        if (said.has(flat(t)) || common(part, t) || /\binternal part of\b/i.test(t)) continue;   // the engine's own line about the part stays with it
        const line = `${part.name}: ${t}`;
        if (src) next.set(src.spec, mdAdd(text(src.spec), where, line));
        if (files.has(into.file)) { let doc; try { doc = JSON.parse(text(into.file)); } catch { doc = null; } if (doc) { const entry = (Array.isArray(doc.entries) ? doc.entries : [doc]).find((x) => x.name === into.name) ?? doc; jsonAdd(entry, where, line, { layout }); next.set(into.file, jsonText(doc, files.get(into.file))); } }
        moved.push({ where, text: line }); said.add(flat(t));
      }
    }
    if (files.has(part.file)) next.set(part.file, null);
    if (table && part.code) next.set(table, markPart(text(table), String(part.code).replace(/^\.?\//, ''), into.name));
    pages.push({ name: part.name, into: into.name, moved, file: part.file });
  }
  return pages;
}

// What a component's code takes and sends, from its file. → { props, events, slots } (names), or null when unread.
export function apiOf(ROOT, file) {
  let text; try { text = readFileSync(resolve(ROOT, file), 'utf8'); } catch { return null; }
  const props = [...extractProps(file, text)], sl = extractSlots(text);
  return { props, events: extractEvents(file, text, props), slots: [...(sl.hasDefault ? ['default'] : []), ...sl.named] };
}
// A spec's API lines in the form its sibling writes them ("- Props: a, b"), each from the code. → text or ''
function apiSection(sibText, api) {
  const sec = /^##\s+API\s*\n([\s\S]*?)(?=^##\s|(?![\s\S]))/m.exec(sibText ?? '');
  if (!sec || !api) return '';
  const lines = [...sec[1].matchAll(/^-\s*([A-Za-z ]+):/gm)].map((m) => {
    const k = /prop/i.test(m[1]) ? 'props' : /emit|event/i.test(m[1]) ? 'events' : /slot/i.test(m[1]) ? 'slots' : null;
    return k ? `- ${m[1]}: ${api[k].length ? api[k].join(', ') : 'none'}` : null;
  }).filter(Boolean);
  return lines.length ? `\n## API\n\n${lines.join('\n')}\n` : '';
}

// A new page's files, beside its siblings' (the pages whose code is in the same folder): its spec (title, Metadata with
// its Source, Status Draft) and its page, the layer's own shape, with nothing written yet. → { entity, spec, file,
// files: Map } or null when the layer has no page to model it on.
export function startPage({ name, code }, snap, files, { api = null } = {}) {
  if (!code) return null;
  const dir = code.split('/').slice(0, -1).join('/') + '/';
  const sib = snap.entities.find((e) => e.code && String(e.code).replace(/^\.?\//, '').startsWith(dir) && files.has(e.file))
    ?? snap.entities.find((e) => e.kind === 'component' && e.code && files.has(e.file));
  if (!sib) return null;
  const title = words(name.replace(/\//g, ' '));
  const file = sib.file.replace(/[^/]+$/, `${kebab(code.split('/').pop().replace(/\.\w+$/, ''))}.dsds.json`);
  const idx = specIndex(files), sibSpec = specOf(sib, idx)?.spec;
  const spec = (sibSpec ? sibSpec.replace(/[^/]+$/, '') : 'specs/components/') + `${kebab(title)}.md`;
  if (files.has(file) || files.has(spec)) return null;
  let doc; try { doc = JSON.parse(files.get(sib.file)); } catch { return null; }
  const model = Array.isArray(doc.entries) ? doc.entries[0] : doc;
  const page = { kind: model.kind ?? 'component', id: `${model.kind ?? 'component'}-${kebab(title)}`, name: title, description: '', ...(model.metadata ? { metadata: { ...model.metadata, tags: [model.kind ?? 'component', ...String(name).split(/[/]/).map(kebab)], aliases: [name], ...(model.metadata.status ? { status: { status: 'draft' } } : {}) } } : {}), sections: [] };
  const md = `# ${title}\n\n## Metadata\n\n- Name: ${title}\n- Category: Component\n- Status: Draft\n- Source: \`${code}\`\n` + apiSection(sibSpec && files.get(sibSpec), api);
  const entity = { kind: 'component', layer: sib.layer, name: title, id: page.id, file, code, purpose: [], whenToUse: [], whenNotToUse: [], mistakes: [], limitations: [], rules: [], sections: [] };
  return { entity, spec, file, files: new Map([[spec, md], [file, jsonText(page, files.get(sib.file))]]) };
}
export { tableOfCode };

// Which of a family's sections the layer gives each of its pages with a spec of their own: learned from the layer's pages,
// whose sections it titles "<Family> family / <section>". → Set of section titles, lower case
export function familyCarried(files) {
  const out = new Set();
  for (const [f, t] of files) {
    if (!/\.json$/i.test(f) || !t.includes(' family / ')) continue;
    for (const m of t.matchAll(/"title":\s*"[^"]+? family \/ ([^"]+)"/g)) out.add(m[1].trim().toLowerCase());
  }
  return out;
}
const sectionsOf = (md) => {
  const out = []; let cur = null;
  for (const l of String(md ?? '').split('\n')) {
    const h = /^##\s+(.+?)\s*$/.exec(l);
    if (h) { cur = { title: h[1], lines: [] }; out.push(cur); } else if (cur) cur.lines.push(l);
  }
  return out;
};
// A spec of its own nobody has written yet (nothing of a person's on what it is for or when to use it) takes from its
// family's spec what the layer would no longer give its page, so what agents read stays: of the sections the layer gives
// a family's pages ("<Family> family / …"), the ones it cannot give (not one list) and what is under their ### headings;
// of the others, every line.
// The family's drafts stay with the family. Its sections then follow the order a spec keeps (what it is for, when to use
// it or not, its rules, mistakes, limitations; then the rest). → the own spec's text
const STRUCTURE = ['purpose', 'when to use', 'when not to use', 'rules', 'common mistakes', 'limitations'];
export function seedFromFamily(own, family, carried = new Set()) {
  const ownSecs = sectionsOf(own);
  const written = ownSecs.filter((x) => /^(purpose|intent|when to use|when not to use)$/i.test(x.title)).some((x) => x.lines.some((l) => /^\s*[-*]\s+(?!\*\*Draft:\*\*)\S/.test(l) || (/\S/.test(l) && !/^\s*[-*]\s/.test(l))));
  if (written) return own;
  const head = String(own).split(/\n(?=##\s)/)[0];   // the title, before the first section
  const secs = ownSecs.map((x) => ({ title: x.title, lines: x.lines.slice() }));
  const find = (t) => secs.find((x) => x.title.toLowerCase() === t.toLowerCase());
  let changed = false;
  for (const f of sectionsOf(family)) {
    if (/^metadata$/i.test(f.title)) continue;
    const isItem = (l) => /^\s*[-*]\s+/.test(l), isDraft = (l) => /^\s*[-*]\s+\*\*Draft:\*\*/.test(l);
    const carriedHere = carried.has(f.title.toLowerCase());
    // Prose (a paragraph) as list items under a carried section; the whole section, drafts aside, under one it is not.
    // The layer carries a family section only when it is one list (an intro line or two before it at most), and never
    // what is under its ### headings: those are what the spec takes, drafts aside.
    const sub = f.lines.findIndex((l) => /^###\s/.test(l));
    const top = sub < 0 ? f.lines : f.lines.slice(0, sub), under = sub < 0 ? [] : f.lines.slice(sub).filter((l) => !isDraft(l));
    const first = top.findIndex(isItem);
    const oneList = first >= 0 && top.slice(first).every((l) => !/\S/.test(l) || isItem(l) || /^\s{2,}\S/.test(l)) && !/^\s*(\||```|#)/m.test(top.slice(0, first).join('\n'));
    const lines = carriedHere ? [...(oneList ? [] : top.filter((l) => !isDraft(l))), ...under] : f.lines.filter((l) => !isDraft(l));
    if (!lines.some((l) => /\S/.test(l))) continue;
    const at = find(f.title);
    if (at) { const have = new Set(at.lines.map((l) => l.replace(/^\s*[-*]\s+/, '').trim())); const add = lines.filter((l) => /\S/.test(l) && !have.has(l.replace(/^\s*[-*]\s+/, '').trim())); if (add.length) { const firstDraft = at.lines.findIndex(isDraft); at.lines.splice(firstDraft < 0 ? at.lines.length : firstDraft, 0, ...add); changed = true; } }
    else { secs.push({ title: f.title, lines: ['', ...lines.filter((l, i, a) => /\S/.test(l) || (i > 0 && /\S/.test(a[i - 1])))], family: true }); changed = true; }
  }
  if (!changed) return own;
  // Metadata first; then what it is for and when to use it, in that order; then the family's other sections; then the rest.
  const rank = (x, i) => /^metadata$/i.test(x.title) ? -1 : STRUCTURE.includes(x.title.toLowerCase()) ? STRUCTURE.indexOf(x.title.toLowerCase()) : x.family ? 100 + i : 1000 + i;
  const ordered = secs.map((x, i) => ({ x, r: rank(x, i) })).sort((p, q) => p.r - q.r).map((p) => p.x);
  return (head.replace(/\s*$/, '\n\n') + ordered.map((x) => `## ${x.title}\n${x.lines.join('\n').replace(/^\n*/, '\n').replace(/\s*$/, '')}\n`).join('\n')).replace(/\n{3,}/g, '\n\n');
}

// The drafts a family's spec holds for one page alone (on its page, on no other page) moved into that page's own spec,
// under the same heading: the layer gives a page its family's sections without their drafts. → { own, family } (texts)
export function ownDrafts(e, own, family, entities = []) {
  const said = (x) => new Set(linesOf(x).flatMap((l) => String(l.text).split('\n')).map((t) => flat(t.replace(/^\s*[-*]\s+/, ''))));
  const mine = said(e), others = entities.filter((x) => x !== e && x.name !== e.name).map(said);
  let heading = null;
  for (const l of String(family ?? '').split('\n')) {
    const h = /^##\s+(.+?)\s*$/.exec(l); if (h) { heading = h[1]; continue; }
    const m = /^\s*[-*]\s+\*\*Draft:\*\*\s*(.+)$/.exec(l); if (!m || !heading) continue;
    const t = m[1].trim(), k = flat('**Draft:** ' + t), k2 = flat(t);
    if (!(mine.has(k) || mine.has(k2)) || others.some((o) => o.has(k) || o.has(k2))) continue;
    own = mdAdd(own, heading, t); family = mdRemove(family, '**Draft:** ' + t);
  }
  return { own, family };
}

// A page written from a family's spec that several pages share gets a spec of its own beside it, so what is written for
// it is its own: its title, Metadata naming its code file and the family spec (whose shared sections the layer still
// gives it), its API from the code in the form its split siblings write it; and, where the layer's scripts pair code
// files with spec names, its entry beside its siblings'. Nothing else is written in it: the drafts that follow are.
// → { spec, family, files: Map(path → text) } or null (its spec is its own already, or the layer has a file there).
// entities: the layer's pages, so the drafts the family's spec holds for this page alone (on its page, on no other) move
// with it: the layer leaves a family's drafts out of the pages it gives the family's sections to.
export function ownSpec(e, files, { api = null, entities = [] } = {}) {
  const code = String(e.code ?? '').replace(/^\.?\//, ''); if (!code) return null;
  const fam = specOf(e, specIndex(files)); if (!fam?.shared) return null;
  const stem = kebab(e.name), spec = fam.spec.replace(/[^/]+$/, '') + stem + '.md';
  if (files.has(spec)) return null;
  const model = [...files].find(([f, t]) => /\.md$/i.test(f) && /^\s*[-*]\s*Family spec:/mi.test(t) && /^##\s+API\s*$/m.test(t))?.[1];
  const md = `# ${e.name}\n\n## Metadata\n\n- Name: ${e.name}\n- Category: Component variant\n- Status: Active\n- Source: \`${code}\`\n- Family spec: \`${fam.spec}\`\n` + apiSection(model, api);
  const out = new Map([[spec, md]]);
  const moved = ownDrafts(e, seedFromFamily(md, files.get(fam.spec), familyCarried(files)), files.get(fam.spec), entities);
  out.set(spec, moved.own); if (moved.family !== files.get(fam.spec)) out.set(fam.spec, moved.family);
  const pair = /^(\s*)(['"])(src\/[^'"]+)\2\s*:\s*(['"])([a-z0-9-]+)\4\s*,?\s*$/;
  for (const [f, t] of files) {
    if (!/\.(m?js|cjs)$/i.test(f)) continue;
    const lines = t.split('\n'), at = lines.map((l, i) => (pair.test(l) ? i : -1)).filter((i) => i >= 0);
    if (at.length < 3 || lines.some((l) => pair.exec(l)?.[3] === code)) continue;
    const dir = code.split('/').slice(0, -1).join('/') + '/';
    const near = at.filter((i) => pair.exec(lines[i])[3].startsWith(dir)), i = (near.length ? near : at).at(-1);
    // After the entry it follows, in the map's own form: that entry takes a comma if it was the last, and the new one
    // ends as that one did.
    const m = pair.exec(lines[i]), last = !/,\s*$/.test(lines[i]);
    if (last) lines[i] = lines[i].replace(/\s*$/, ',');
    lines.splice(i + 1, 0, `${m[1]}${m[2]}${code}${m[2]}: ${m[4]}${stem}${m[4]}${last ? '' : ','}`);
    out.set(f, lines.join('\n'));
  }
  return { spec, family: fam.spec, files: out };
}
