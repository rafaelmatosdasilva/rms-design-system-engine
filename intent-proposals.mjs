// intent-proposals.mjs - for each decision on the Documentation page that is the team's (Fix, Add, Move), the answer the
// engine proposes and what it rests on, for a person to say yes or no to. A yes is kept in the project
// (design-system-engine-intent-decisions.json) and the engine acts on it from then on: a component documented in
// another's page is not asked a page of its own, a name the team keeps is no longer a finding, a page the team keeps
// is no longer asked to move. Each proposal says what its yes and its no do (yes, no); what an answer changes in the
// layer is made by intent-answers.mjs. Nothing here writes to the layer.
//
// What it proposes, from what the engine reads:
//   Add   a component with the same code file as one a page documents: that page is its page.
//         a part of a documented component (its Figma name under it, or its code file beside it): document it there.
//         else: write its page.
//   Fix   a name the page itself gives as Figma's (a sentence of it says so): Figma's own name, the engine reads no
//         such frame: keep it.
//         a newer version of a name the system has (tabGroupV2 of tabGroup), the older one marked deprecated: the page
//         names what replaces it, not in the system yet: keep it until it is.
//         a name that is a code file's (inputSearchRow for inputs/search/Row.vue): an internal part that exists: keep it.
//   Move  a page of a part whose own code file only its parent's code uses: an internal part; the page is written from
//         its file, so keep it there.
// A decision the engine has no ground to propose an answer for is shown as it is, for a person.

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { projectPath } from './names.mjs';

const norm = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
const words = (n) => String(n ?? '').replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
const noExt = (f) => String(f ?? '').replace(/^\.?\//, '').replace(/\.[\w]+$/, '');
const dirOf = (f) => noExt(f).split('/').slice(0, -1).join('/');
const base = (f) => noExt(f).split('/').pop();

export const DECISIONS = (ROOT) => resolve(ROOT, projectPath(ROOT, 'intentDecisions'));
export function readDecisions(ROOT) { try { return JSON.parse(readFileSync(DECISIONS(ROOT), 'utf8')); } catch { return {}; } }
// keys: [key]; answer: 'yes' | 'no'. proposals: { key: proposal } to keep each one's words with its answer.
export function decide(ROOT, keys, answer, proposals = {}, { now = new Date().toISOString(), by = null } = {}) {
  const d = readDecisions(ROOT);
  for (const k of keys) d[k] = { answer, proposal: proposals[k]?.proposal ?? d[k]?.proposal ?? null, by: by || null, at: now };
  writeFileSync(DECISIONS(ROOT), JSON.stringify(d, null, 2) + '\n');
  return d;
}
export const accepted = (decisions, key) => decisions[key]?.answer === 'yes';

// Who imports a code file: the project's code files that name its path (without extension) in an import.
function importersOf(ROOT, file, codeFiles) {
  const want = noExt(file).replace(/^src\//, '');
  const out = [];
  for (const f of new Set(Object.values(codeFiles))) {
    if (noExt(f) === noExt(file)) continue;
    let t = ''; try { t = readFileSync(resolve(ROOT, f), 'utf8'); } catch { continue; }
    if (t.includes(want) || t.includes(`./${base(file)}`) && dirOf(f) === dirOf(file)) out.push(f);
  }
  return out;
}

// Each page of an internal part (a Move: a code file only other components use, with no Figma component of its own) and
// the code files that use it. → Map(page name → [files])
export function partsOf(ROOT, report, codeFiles) {
  const out = new Map();
  for (const p of report.pages.filter((x) => x.action === 'move' && x.code)) { const by = importersOf(ROOT, p.code, codeFiles); if (by.length) out.set(p.name, by); }
  return out;
}

// What a yes and a no to keeping a name each do.
const keepOrRewrite = (name) => ({ yes: `The sentence stays as it is, and ${name} is no longer a finding.`, no: `The sentence is written again with what the system has, as a draft to review.` });

// → Map(key → { kind, subject, page?, proposal, evidence: [..], effect })
//   yes, no: what each answer does, said on the page beside the command that gives it.
//   report: useReport's; snap: the layer; names: the system's components; codeFiles: { name: file } (codeFilesOf);
//   facts: intent-truth's (for the Figma screens' words and the code's files); noPage: the components with no page.
export function proposalsFor({ ROOT, report, snap, names, codeFiles, facts, noPage }) {
  const out = new Map();
  const pageFor = new Map(report.pages.filter((p) => p.component).map((p) => [p.component, p]));
  const documentedFiles = new Map();
  for (const [n, p] of pageFor) if (codeFiles[n]) documentedFiles.set(noExt(codeFiles[n]), { name: n, page: p });
  // Add
  for (const n of noPage) {
    const key = `add:${n}`, file = codeFiles[n];
    const same = file && documentedFiles.get(noExt(file));
    if (same) { out.set(key, { kind: 'add', subject: n, proposal: `Its page is ${same.page.name}: no page of its own.`, evidence: [`${n} and ${same.name} are drawn from one code file, ${file}, and ${same.page.name} documents ${same.name}.`], effect: 'documented', yes: `No page of its own: ${same.page.name} documents it.`, no: 'It gets a page of its own, started from its code, its lines drafts to review.' }); continue; }
    const parent = n.includes('/') ? n.split('/')[0] : null;
    const byName = parent && pageFor.get(parent);
    const beside = !byName && file && [...documentedFiles.values()].find((d) => dirOf(codeFiles[d.name]) === dirOf(file) && /^(row|item|chip|label|divider|header|cell|background|bar|line|option)s?$/i.test(base(file)));
    const host = byName ? { name: parent, page: byName } : beside;
    if (host) {
      const ev = [byName ? `Its Figma name puts it inside ${parent}: ${n}.` : `Its code file, ${file}, is beside ${host.name}'s (${codeFiles[host.name]}).`];
      if (file) { const by = importersOf(ROOT, file, codeFiles); if (by.length) ev.push(`Only ${by.map((f) => base(f) + '.' + f.split('.').pop()).join(', ')} use${by.length === 1 ? 's' : ''} it in the code.`); }
      out.set(key, { kind: 'add', subject: n, proposal: `Document it in ${host.page.name}'s page, as a part of ${host.name}: no page of its own.`, evidence: ev, effect: 'documented', yes: `No page of its own: ${host.page.name}'s page documents it, as a part of ${host.name}.`, no: 'It gets a page of its own, started from its code, its lines drafts to review.' });
      continue;
    }
    out.set(key, { kind: 'add', subject: n, proposal: `Write its page.`, evidence: [file ? `It is in the code (${file}) and no page documents it.` : 'No page documents it.'], effect: 'write', yes: 'Its page is started from its code, its lines drafts to review.', no: 'No page: it is taken off the pages to write.' });
  }
  // Fix
  const byEntity = new Map(snap.entities.map((e) => [`${e.file}#${e.name}`, e]));
  for (const p of report.pages) {
    for (const f of (p.wrong ?? []).filter((x) => x.kind === 'name')) {
      const nameOf = String(f.says).replace(/`/g, '');
      const key = `fix:${p.name}:${nameOf}`;
      if (out.has(key)) continue;
      const e = byEntity.get(`${p.file}#${p.name}`);
      const allText = e ? [...e.purpose, ...e.whenToUse, ...e.whenNotToUse, ...e.mistakes, ...e.limitations, ...e.rules.map((r) => r.text ?? r), ...e.sections.map((x) => x.text)].join('\n') : '';
      // Figma's own names: those a sentence of the page gives as Figma's, then every name listed beside one of them.
      const sentences = allText.split(/(?<=[.!?])\s+|\n/);
      const ticks = (s) => [...s.matchAll(/`([^`\n]+)`/g)].map((m) => m[1].replace(/^\./, ''));
      const figmaNames = new Set(sentences.filter((s) => /\bfigma\b/i.test(s)).flatMap(ticks));
      for (const s of sentences) { const t = ticks(s); if (t.length > 1 && t.some((x) => figmaNames.has(x))) t.forEach((x) => figmaNames.add(x)); }
      const figmaSentence = figmaNames.has(nameOf) && sentences.find((s) => /\bfigma\b/i.test(s) && ticks(s).some((x) => figmaNames.has(x)));
      const older = (/^(.+?)v\d+$/i.exec(nameOf) ?? [])[1];
      const olderName = older && names.find((x) => norm(x) === norm(older));
      const fileLike = Object.values(codeFiles).concat(facts?.files ?? []).find((fp) => { const w = words(noExt(fp).replace(/^src\/components\/library\//, '').replace(/\//g, ' ')); const nw = words(nameOf); return nw.length > 1 && nw.every((x) => w.some((y) => y.startsWith(x) || x.startsWith(y))); });
      if (figmaSentence) out.set(key, { kind: 'fix', subject: nameOf, page: p.name, proposal: 'Keep it: it is a name of Figma\'s own, which the engine does not read.', evidence: [`The page says it is Figma's: "${figmaSentence.trim().slice(0, 200)}"`], effect: 'keep', ...keepOrRewrite(nameOf) });
      else if (olderName) {
        const dep = facts?.text && new RegExp(`${olderName}[^"\\n]{0,40}deprecated`, 'i').test(facts.text);
        out.set(key, { kind: 'fix', subject: nameOf, page: p.name, proposal: `Keep it: it names what replaces ${olderName}, which the system does not have yet; it clears once it does.`, evidence: [`The system has ${olderName}${dep ? ', which Figma marks deprecated' : ''}, and no ${nameOf} yet.`], effect: 'keep', ...keepOrRewrite(nameOf) });
      } else if (fileLike) out.set(key, { kind: 'fix', subject: nameOf, page: p.name, proposal: `Keep it: it names ${fileLike}, a part in the code.`, evidence: [`${fileLike} is in the code${(() => { const by = importersOf(ROOT, fileLike, codeFiles); return by.length ? `, used only by ${by.map((x) => base(x)).join(', ')}` : ''; })()}.`], effect: 'keep', ...keepOrRewrite(nameOf) });
    }
  }
  // Move
  for (const p of report.pages.filter((x) => x.action === 'move')) {
    const file = p.code;
    const by = file ? importersOf(ROOT, file, codeFiles) : [];
    const users = [...new Set(by.map((f) => snap.entities.find((x) => x.code && noExt(x.code) === noExt(f))?.name ?? base(f)))].join(' and ');
    if (file && by.length) out.set(`move:${p.name}`, { kind: 'move', subject: p.name, page: p.name, proposal: 'Keep its page: it documents an internal part, and the layer writes the page from its own code file.', evidence: [`${file} is used only by ${by.map((x) => base(x)).join(', ')} in the code.`, 'The Figma library has no component of its own for it.'], effect: 'keep', by, yes: `The page stays, with a line saying it is not used on its own: use ${users}.`, no: `What only this page says goes to ${users}'s page, as drafts to review, and this page is taken out.` });
  }
  return out;
}

// The report as the team's decisions leave it: a yes to "documented" takes the component off the pages to write, a
// yes to "keep" takes the finding off its page (and a page with nothing else wrong to Keep), a yes to keep a page in
// place takes off its Move. → { noPage, pages } with each page's proposal attached (proposal: { key, …, answer }).
export function applyDecisions({ report, noPage, proposals, decisions }) {
  const answer = (k) => decisions[k]?.answer ?? null;
  // Who answered it and when, beside the answer: the page says it.
  const said = (k) => decisions[k] ? { by: decisions[k].by ?? null, at: decisions[k].at ?? null } : {};
  // Off the pages to write: one documented in another's page (a yes to that), or one the team said needs none (a no to writing it).
  const left = noPage.filter((n) => { const x = proposals.get(`add:${n}`), a = answer(`add:${n}`); return !((a === 'yes' && x?.effect === 'documented') || (a === 'no' && x?.effect === 'write')); });
  const pages = report.pages.map((p) => {
    let q = { ...p };
    if (q.wrong?.length) {
      const kept = q.wrong.filter((f) => !(f.kind === 'name' && accepted(decisions, `fix:${p.name}:${String(f.says).replace(/`/g, '')}`)));
      if (kept.length !== q.wrong.length) { q.wrong = kept; if (!kept.length && q.action === 'fix') { q.action = 'keep'; q.decision = 'Keep'; q.todo = []; } }
    }
    if (q.action === 'move' && accepted(decisions, `move:${p.name}`)) { q.action = 'keep'; q.decision = 'Keep'; q.todo = []; }
    q.proposals = [...proposals.values()].filter((x) => x.page === p.name && (x.kind !== 'fix' || (p.wrong ?? []).some((f) => String(f.says).replace(/`/g, '') === x.subject))).map((x) => ({ ...x, key: [...proposals].find(([, v]) => v === x)[0], answer: answer([...proposals].find(([, v]) => v === x)[0]), ...said([...proposals].find(([, v]) => v === x)[0]) }));
    return q;
  });
  const addProposals = Object.fromEntries(left.map((n) => [n, proposals.has(`add:${n}`) ? { ...proposals.get(`add:${n}`), key: `add:${n}`, answer: answer(`add:${n}`), ...said(`add:${n}`) } : null]));
  return { noPage: left, pages, addProposals };
}

// Everything above for a project, as the style guide and the command read it: the layer as last read, checked, its
// proposals and the team's decisions applied. → { report (decided), noPage, proposals, addProposals, decisions } or null
export async function decidedLayer(ROOT, cfg) {
  const il = await import('./intent-layer.mjs');
  const truth = await import('./intent-truth.mjs');
  const snap = il.readIntentLayer(ROOT, cfg);
  if (!snap) return null;
  const names = il.systemNames(ROOT, cfg);
  const codeFiles = il.codeFilesOf(ROOT, cfg);
  const facts = truth.systemFacts(ROOT, cfg, { record: false });
  const wrongOf = truth.checkedLayer(ROOT, cfg, snap);
  const report = il.useReport(snap, il.matchComponents(names, snap.entities, codeFiles), { names, codeExists: (f) => existsSync(resolve(ROOT, f)), from: il.namesFrom(ROOT, cfg), wrongOf });
  const noPage = il.pagesToWrite(names, (n) => report.pages.some((p) => p.component === n), codeFiles);
  const proposals = proposalsFor({ ROOT, report, snap, names, codeFiles, facts, noPage });
  const decisions = readDecisions(ROOT);
  const done = applyDecisions({ report, noPage, proposals, decisions });
  return { snap, report: { ...report, pages: done.pages }, noPage: done.noPage, addProposals: done.addProposals, proposals, decisions, wrongOf, names };
}
