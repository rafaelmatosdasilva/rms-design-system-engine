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
//   Review a page whose component changed after it was written or last confirmed (intent-truth.mjs, stale): does it
//         still hold? A yes records the confirmation (who and when), and the page is not marked again until the
//         component changes again; a no leaves it marked until the page is edited.
// A decision the engine has no ground to propose an answer for is shown as it is, for a person.
//
// Evidence first: each proposal also lists its candidates (candidatesFor), every answer it could take with what speaks
// for it, where that comes from (Figma, the code, the products' use of it from the usage map, the team's pages, past
// decisions) and how strong it is. The engine's own answer stays the proposed one; when another has as much behind it or
// more, the proposal says the evidence is split, and a person decides. A page to review proposes whichever has more.
//
// Who decides: ds-config.json → owners (decided-by.mjs → ownerOf). Each proposal names the one it waits on (decider); an
// answer given by someone else is kept, and said.

import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { projectPath } from './names.mjs';
import { ownerOf, notTheOwner } from './decided-by.mjs';

const norm = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
const words = (n) => String(n ?? '').replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
const noExt = (f) => String(f ?? '').replace(/^\.?\//, '').replace(/\.[\w]+$/, '');
const dirOf = (f) => noExt(f).split('/').slice(0, -1).join('/');
const base = (f) => noExt(f).split('/').pop();

export const DECISIONS = (ROOT) => resolve(ROOT, projectPath(ROOT, 'intentDecisions'));
export function readDecisions(ROOT) { try { return JSON.parse(readFileSync(DECISIONS(ROOT), 'utf8')); } catch { return {}; } }
// keys: [key]; answer: 'yes' | 'no'. proposals: { key: proposal } to keep each one's words with its answer. said: the
// decision as the person gave it (the words copied from the style guide), kept beside it as they wrote it.
export function decide(ROOT, keys, answer, proposals = {}, { now = new Date().toISOString(), by = null, said = null } = {}) {
  const d = readDecisions(ROOT);
  for (const k of keys) { const effect = proposals[k]?.effect ?? d[k]?.effect; d[k] = { answer, proposal: proposals[k]?.proposal ?? d[k]?.proposal ?? null, ...(effect ? { effect } : {}), by: by || null, at: now, ...(said ? { said } : {}) }; }
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

// A proposal's answers, each with what it does: its own list (options: [{ answer, label, does }]) when it has more than
// two, else yes and no. --intent-decide takes any of them; the Documentation page shows each with its command.
export function optionsOf(x) {
  if (Array.isArray(x?.options) && x.options.length) return x.options.map((o) => ({ answer: String(o.answer).toLowerCase(), label: o.label ?? `If ${o.answer}`, does: o.does ?? '' }));
  return [{ answer: 'yes', label: 'If yes', does: x?.yes ?? '' }, { answer: 'no', label: 'If no', does: x?.no ?? '' }];
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
  // Review: its component changed after the page was written or last confirmed.
  for (const p of report.pages) {
    const f = (p.wrong ?? []).find((x) => x.kind === 'stale');
    if (!f || !p.component) continue;
    out.set(`review:${p.name}`, { kind: 'review', subject: p.component, page: p.name, since: f.at ?? null, proposal: `Does ${p.name}'s page still hold for ${p.component} as it is now?`, evidence: [f.truth], effect: 'confirm', stale: f,
      options: [{ answer: 'yes', label: 'It still holds', does: `Recorded as confirmed, with who and when: the page is not marked again until ${p.component} changes again.` }, { answer: 'no', label: 'It needs editing', does: 'The page stays marked to review until it is edited.' }] });
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

// ── Evidence first ──────────────────────────────────────────────────────────────────────────────────────────────────
// Every answer a proposal could take, each with its evidence: { from, says, strength } (strong, some, weak), from what
// the engine already read: the proposal's own grounds, the usage map (usage: { name: livesIn }, the contracts' and the
// catalog's), the team's pages (report) and its past answers (decisions). → [{ answer, says, evidence, weight }], most
// weight first. weight: strong 3, some 2, weak 1, added up.
const WEIGHT = { strong: 3, some: 2, weak: 1 };
const FROM = [[/Figma name|Figma library|Figma marks|Figma's/i, 'Figma'], [/^The page says/i, "The team's pages"], [/code|\.vue|\.jsx?|\.tsx?|\.svelte|used only by|use[s]? it/i, 'The code'], [/./, 'The engine']];
const fromOf = (says) => FROM.find(([re]) => re.test(says))[1];
export function candidatesFor(key, x, { usage = {}, decisions = {}, report = { pages: [] } } = {}) {
  const yes = { answer: 'yes', says: x.kind === 'review' ? 'It still holds: confirm it.' : x.proposal, evidence: [] };
  const no = { answer: 'no', says: x.kind === 'review' ? 'It needs editing.' : x.no ?? 'Not as proposed.', evidence: [] };
  const lives = usage[x.subject] ?? null;
  const products = (lives?.products ?? []).filter((p) => p.name);
  const screens = lives?.screens ?? [];
  const n = (k, one, many = `${one}s`) => `${k} ${k === 1 ? one : many}`;
  // Past answers to proposals of the same kind and effect: how the team settled the same question before.
  const past = Object.entries(decisions).filter(([k]) => k !== key && k.split(':')[0] === x.kind);
  const pastSame = (pred) => past.filter(([k, d]) => pred(k, d));
  if (x.kind === 'review') {
    const f = x.stale ?? {};
    if (f.gone?.length) no.evidence.push({ from: 'The content check', says: `The page still names ${f.gone.map((g) => `\`${g}\``).join(', ')}, which ${x.subject} no longer has.`, strength: 'strong' });
    else yes.evidence.push({ from: 'The content check', says: `Nothing the page names was taken out of ${x.subject}.`, strength: 'some' });
    const added = (f.changed ?? []).filter((c) => /new props|new tokens|takes .* now/.test(c));
    if (added.length) no.evidence.push({ from: "The engine's record", says: `${capital(added.join('; '))}: the page may need a line about ${added.length === 1 ? 'it' : 'them'}.`, strength: 'weak' });
    if ((f.changed ?? []).every((c) => / changed in the code$/.test(c))) yes.evidence.push({ from: "The code's history", says: 'Only its code file changed: no prop, value or token did.', strength: 'weak' });
    const before = decisions[key];
    if (before?.answer === 'yes') yes.evidence.push({ from: 'Past decisions', says: `${before.by ?? 'Someone'} confirmed it before, on ${String(before.at ?? '').slice(0, 10)}.`, strength: 'weak' });
  } else {
    // The proposal's own grounds, by where each comes from.
    for (const e of x.evidence ?? []) yes.evidence.push({ from: fromOf(e), says: e, strength: /only|one code file|Figma's own|Figma name puts|marks deprecated|The page says/i.test(e) ? 'strong' : 'some' });
    // The products' own use of it: a part nobody places on its own is not placed by products either.
    const own = x.kind === 'add' && x.effect === 'write' ? yes : no;
    const other = own === yes ? no : yes;
    if (x.kind !== 'fix' && lives) {
      if (products.length) own.evidence.push({ from: 'Products', says: `${products.map((p) => p.name).slice(0, 4).join(', ')} use${products.length === 1 ? 's' : ''} it in ${n(products.reduce((t, p) => t + p.files, 0), 'file')}${x.kind === 'add' && x.effect === 'write' ? '' : ', on its own'}.`, strength: products.length > 1 ? 'strong' : 'some' });
      else other.evidence.push({ from: 'Products', says: 'No product\'s code uses it.', strength: 'some' });
      if (screens.length) own.evidence.push({ from: 'Figma', says: `${n(screens.length, 'Figma screen')} draw it (${screens.slice(0, 3).map((s) => s.screen).join(', ')}).`, strength: 'weak' });
      if (lives.inside?.length) other.evidence.push({ from: 'The usage map', says: `It sits inside ${lives.inside.slice(0, 3).join(', ')}.`, strength: 'weak' });
    }
    if (x.kind === 'fix') {
      no.evidence.push({ from: 'The content check', says: `${x.subject} is not a component, prop, token or file the system has.`, strength: 'some' });
      const kept = pastSame((k, d) => k.endsWith(`:${x.subject}`) && d.answer === 'yes');
      if (kept.length) yes.evidence.push({ from: 'Past decisions', says: `The team kept ${x.subject} on ${n(kept.length, 'other page')}.`, strength: 'strong' });
    } else {
      // The same kind of answer: its effect as kept, else (an answer kept before effects were) its first word.
      const same = pastSame((k, d) => (d.effect ? d.effect === x.effect : String(d.proposal ?? '').split(' ')[0] === String(x.proposal).split(' ')[0]));
      const ys = same.filter(([, d]) => d.answer === 'yes').length, ns = same.filter(([, d]) => d.answer === 'no').length;
      if (ys) yes.evidence.push({ from: 'Past decisions', says: `The team said yes to ${n(ys, 'proposal')} like it before.`, strength: ys > 2 ? 'some' : 'weak' });
      if (ns) no.evidence.push({ from: 'Past decisions', says: `The team said no to ${n(ns, 'proposal')} like it before.`, strength: ns > 2 ? 'some' : 'weak' });
    }
    // The team's pages: the other parts the layer already documents in their parent's page.
    if (x.kind === 'add' && x.effect === 'documented') {
      const parts = (report.pages ?? []).filter((p) => p.about?.partOf).length;
      if (parts) yes.evidence.push({ from: "The team's pages", says: `The layer documents ${n(parts, 'other part')} in their parent's page already.`, strength: 'weak' });
    }
  }
  const weigh = (c) => ({ ...c, weight: c.evidence.reduce((t, e) => t + (WEIGHT[e.strength] ?? 1), 0) });
  return [weigh(yes), weigh(no)].sort((a, b) => b.weight - a.weight);
}
const capital = (s) => String(s).charAt(0).toUpperCase() + String(s).slice(1);

// The proposal with its candidates, the one it proposes (recommends), whether the evidence is split, and who decides.
export function withEvidence(key, x, ctx = {}) {
  const candidates = candidatesFor(key, x, ctx);
  // The engine's own answer stands; another with as much behind it makes it split, never swapped.
  const own = x.kind === 'review' ? candidates[0] : candidates.find((c) => c.answer === 'yes');
  const split = candidates.some((c) => c !== own && c.weight >= own.weight);
  return { ...x, candidates, recommends: own.answer, ...(split ? { split: true } : {}) };
}

// The report as the team's decisions leave it: a yes to "documented" takes the component off the pages to write, a
// yes to "keep" takes the finding off its page (and a page with nothing else wrong to Keep), a yes to keep a page in
// place takes off its Move. → { noPage, pages } with each page's proposal attached (proposal: { key, …, answer }).
export function applyDecisions({ report, noPage, proposals, decisions }) {
  const answer = (k) => decisions[k]?.answer ?? null;
  // Who answered it and when, beside the answer: the page says it.
  const said = (k) => decisions[k] ? { by: decisions[k].by ?? null, at: decisions[k].at ?? null, ...(notTheOwner(decisions[k].by, proposals.get(k)?.decider) ? { notOwner: true } : {}) } : {};
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

// Who a proposal waits on (ds-config.json → owners): one about a page, its component's owner, else its area's
// (patterns/Checkout); one about a component with no page, that component's, a part's (listMain/Row) its root's unless
// it has one of its own. → { name, team, key } | null
export function deciderFor(x, report, owners) {
  const p = x.page && report.pages.find((q) => q.name === x.page);
  return ownerOf(owners, ...(p ? [p.component ?? p.about?.partOf ?? p.about?.is, `${p.layer}/${p.name}`, x.subject] : [x.subject, String(x.subject).split('/')[0]]));
}

// The answers that still answer today's proposals: a confirmation (review:<page>) older than its component's latest change
// is not an answer to this one, and the page is asked again. → decisions without them
export function currentAnswers(proposals, decisions) {
  return Object.fromEntries(Object.entries(decisions).filter(([k, d]) => { const x = proposals.get(k); return !(x?.kind === 'review' && x.since && d.at && Date.parse(d.at) < Date.parse(x.since)); }));
}

// What in the layer waits on a person, each with the one it waits on: every proposal not answered yet, and every page with
// lines drafted for it (one item a page, its drafts reviewed together). decided: decidedLayer's. → [{ what, page,
// subject, key?, drafts?, decider }]
export function pendingOf(decided, cfg = {}) {
  if (!decided) return [];
  const out = [];
  for (const [k, x] of decided.proposals) if (!decided.decisions[k] && (x.kind !== 'add' || decided.noPage.includes(x.subject))) out.push({ what: 'proposal', key: k, page: x.page ?? null, subject: x.subject, decider: x.decider ?? null });
  for (const p of decided.report.pages) if ((p.drafts ?? []).length) out.push({ what: 'drafts', page: p.name, subject: p.component ?? p.name, drafts: p.drafts.length, decider: ownerOf(cfg.owners, p.component ?? p.about?.partOf ?? p.name, `${p.layer}/${p.name}`) });
  if (decided.snap?.system?.drafts?.length) out.push({ what: 'drafts', page: 'the System page', subject: 'system', drafts: decided.snap.system.drafts.length, decider: ownerOf(cfg.owners, 'system') });
  return out;
}

// Where each component is used (usage-map.mjs), as the audit last wrote it into the catalog and the contracts: no new
// read of the products. → { name: livesIn }
export function usageOf(ROOT, cfg = {}) {
  const dir = resolve(ROOT, cfg.contracts?.out ?? 'contracts');
  const out = {};
  try { for (const [n, e] of Object.entries(JSON.parse(readFileSync(join(dir, 'catalog.json'), 'utf8')).components ?? {})) if (e?.livesIn) out[n] = e.livesIn; } catch { /* no catalog */ }
  if (Object.keys(out).length) return out;
  const walk = (d) => { let es = []; try { es = readdirSync(d, { withFileTypes: true }); } catch { return; } for (const x of es) { const p = join(d, x.name); if (x.isDirectory()) walk(p); else if (x.name.endsWith('.contract.json')) { try { const c = JSON.parse(readFileSync(p, 'utf8')); if (c.livesIn && c.name) out[c.name] = c.livesIn; } catch { /* unreadable */ } } } };
  walk(dir);
  return out;
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
  const found = proposalsFor({ ROOT, report, snap, names, codeFiles, facts, noPage });
  const kept = readDecisions(ROOT);
  const decisions = currentAnswers(found, kept);
  // Its evidence, and the one it waits on (ds-config.json → owners).
  const usage = usageOf(ROOT, cfg);
  const proposals = new Map([...found].map(([k, x]) => [k, { ...withEvidence(k, x, { usage, decisions, report }), decider: deciderFor(x, report, cfg.owners) }]));
  const done = applyDecisions({ report, noPage, proposals, decisions });
  return { snap, report: { ...report, pages: done.pages }, noPage: done.noPage, addProposals: done.addProposals, proposals, decisions, wrongOf, names };
}
