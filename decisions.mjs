// decisions.mjs - one log of what the team decided, so nobody proposes a rejected option twice.
//
// The engine already records every decision a person makes, but each in its own file and each for its own reason: a
// difference kept on purpose with why, a proposal answered yes or no, a difference accepted as debt, a component
// checked by hand, a need the system lacks with what was looked at and why none of it fitted. Nothing gathered them,
// so a decision was only ever seen by whoever ran the command that made it.
//
// Gathered here, two things follow. A person reads one page per component beside its Changelog, instead of four
// files. And an agent is told what was already ruled out and why, which is the part that pays: an agent that does
// not know a thing was considered and rejected proposes it again, confidently, every time it is asked. The log
// answers that before the question is asked.
//
// Never written to by this module: every decision is made where it is made, by a person, and this reads them.
// A DECISIONS.md the team wrote by hand is read as one more source and never overwritten - what a person wrote
// about their own system is not the engine's to rewrite.
import { readFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { projectPath } from './names.mjs';

// What each kind of decision is called where a person reads it, and whether it rules an option out for an agent.
export const KINDS = {
  kept: { said: 'kept on purpose', rules: true },
  answered: { said: 'answered', rules: true },
  gap: { said: 'nothing fitted', rules: true },
  debt: { said: 'accepted for now', rules: false },
  checked: { said: 'checked by hand', rules: false },
  written: { said: 'written by the team', rules: true },
};

const trim = (s, n = 300) => { const t = String(s ?? '').replace(/\s+/g, ' ').trim(); return t.length > n ? `${t.slice(0, n - 1).replace(/\s+\S*$/, '')}…` : t; };
const norm = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');

// Every decision in one shape, whatever file it came from.
// → { component, kind, what, ruledOut: [string], why, by, at, from }
export function decisionsFrom({ kept = [], answered = {}, gaps = [], debt = [], checked = [], written = [] } = {}) {
  const out = [];
  const add = (d) => { if (d.what) out.push({ component: null, ruledOut: [], why: null, by: null, at: null, ...d, what: trim(d.what), why: d.why ? trim(d.why) : null }); };

  // A difference the team decided to keep: the side it did not take is ruled out, and the reason is why.
  for (const k of kept) {
    const side = k.truth === 'figma' ? "the code's value" : k.truth === 'code' ? "Figma's value" : null;
    add({ component: k.component ?? null, kind: 'kept', what: `${k.check ? `${k.check}: ` : ''}${k.what ?? k.key}`, ruledOut: side ? [side] : [], why: k.reason, by: k.by, at: k.at, from: 'the kept differences' });
  }
  // A proposal the engine made and a person answered. A no is the sharpest thing in this file: it is an option
  // somebody looked at and did not want, and it is exactly what an agent proposes again.
  for (const [key, a] of Object.entries(answered ?? {})) {
    const text = a?.proposal ?? key;
    add({ component: componentOf(key), kind: 'answered', what: `${a?.answer === 'no' ? 'No' : 'Yes'}: ${text}`, ruledOut: a?.answer === 'no' ? [trim(text)] : [], why: a?.why ?? null, by: a?.by, at: a?.at, from: 'the answered proposals' });
  }
  // A need nothing in the system fitted: what was looked at is what was ruled out, with why in the team's own words.
  for (const g of gaps) {
    const looked = (Array.isArray(g.searched) ? g.searched : String(g.searched ?? '').split(/[,;]\s*/)).map((x) => String(x).trim()).filter(Boolean);
    if (!g.why && !looked.length) continue;
    add({ component: null, kind: 'gap', what: `nothing fitted "${g.need}"`, ruledOut: looked, why: g.why, at: g.at ?? null, from: 'the prototypes\' gap list' });
  }
  for (const d of debt) add({ component: d.component ?? null, kind: 'debt', what: d.label ?? d.what ?? d.key, why: d.reason ?? null, by: d.by, at: d.at, from: 'the accepted differences' });
  for (const c of checked) add({ component: c.component ?? c.name ?? null, kind: 'checked', what: c.what ?? `${c.component ?? c.name} checked against its design`, why: c.reason ?? null, by: c.by, at: c.at, from: 'the checks made by hand' });
  for (const w of written) add({ ...w, kind: 'written', from: w.from ?? 'DECISIONS.md' });

  return out.sort((a, b) => String(b.at ?? '').localeCompare(String(a.at ?? '')));
}

// The component a proposal's key is about, where its key names one (`chip:purpose` → chip).
function componentOf(key) {
  const m = /^([A-Za-z][\w-]*)\s*[:/]/.exec(String(key ?? ''));
  return m ? m[1] : null;
}

// The whole log, and the same decisions by component. → { all, byComponent, general, total, ruledOut }
export function decisionView(all = []) {
  const byComponent = {};
  const general = [];
  for (const d of all) {
    if (d.component) (byComponent[d.component] ??= []).push(d);
    else general.push(d);
  }
  return { all, byComponent, general, total: all.length, ruledOut: all.filter((d) => d.ruledOut.length && KINDS[d.kind]?.rules).length };
}

// Everything the engine and the team recorded, read from where each is kept. cfg is read for nothing but the paths.
export function gatherDecisions(ROOT, { gaps = null, writtenFile = 'DECISIONS.md' } = {}) {
  const json = (p, fallback) => { try { return JSON.parse(readFileSync(resolve(ROOT, p), 'utf8')); } catch { return fallback; } };
  const kept = json(projectPath(ROOT, 'kept'), []);
  const answered = json(projectPath(ROOT, 'intentDecisions'), {});
  const base = json(projectPath(ROOT, 'baseline'), {});
  const debt = Array.isArray(base?.findings) ? base.findings : Array.isArray(base?.accepted) ? base.accepted : [];
  const checkedFile = json(projectPath(ROOT, 'checked'), {});
  const checked = Object.entries(checkedFile?.components ?? {}).map(([name, c]) => ({ name, ...(c ?? {}) }));
  const merged = gaps ?? json(join('.design-system-engine-out', 'prototypes', 'gaps.json'), {}).merged ?? [];
  const written = existsSync(resolve(ROOT, writtenFile)) ? writtenDecisions(readFileSync(resolve(ROOT, writtenFile), 'utf8'), writtenFile) : [];
  return decisionView(decisionsFrom({ kept: Array.isArray(kept) ? kept : [], answered, gaps: merged, debt, checked, written }));
}

// A DECISIONS.md the team wrote: each `## <heading>` a decision, the component when the heading names one, and a
// line opening "Ruled out:" or "Instead of:" naming what was not taken. Read as written, never rewritten.
export function writtenDecisions(text, from = 'DECISIONS.md') {
  const out = [];
  const parts = String(text ?? '').split(/^##\s+/m).slice(1);
  for (const p of parts) {
    const [head, ...rest] = p.split('\n');
    const body = rest.join('\n').trim();
    const ruled = [...body.matchAll(/^\s*(?:ruled out|instead of|not)\s*:\s*(.+)$/gim)].flatMap((m) => m[1].split(/[,;]\s*/).map((x) => x.trim()).filter(Boolean));
    const why = /^\s*(?:why|because)\s*:\s*(.+)$/im.exec(body)?.[1] ?? body.split('\n').find((l) => l.trim() && !/^\s*(ruled out|instead of|not|why|because)\s*:/i.test(l)) ?? null;
    out.push({ component: componentOf(`${head.trim()}:`) ?? null, what: head.trim(), ruledOut: ruled, why, from });
  }
  return out;
}

// What an agent is told about one component before it proposes anything: what was ruled out, and why. Only the kinds
// that rule something out, newest first; a decision with no reason is still said, because "somebody decided against
// this" is already more than the agent knew.
export function ruledOutLines(view, name, { most = 4 } = {}) {
  const key = norm(name);
  const mine = (view.byComponent?.[name] ?? Object.entries(view.byComponent ?? {}).find(([n]) => norm(n) === key)?.[1] ?? [])
    .filter((d) => d.ruledOut.length && KINDS[d.kind]?.rules);
  // A general decision that names this component rules it out everywhere, not only on its own page.
  const named = (view.general ?? []).filter((d) => d.ruledOut.some((x) => norm(x).includes(key)) || norm(d.what).includes(key));
  const list = [...mine, ...named].slice(0, most);
  return list.map((d) => `decided against: ${d.ruledOut.join(', ') || d.what}${d.why ? ` - ${d.why}` : ''} (${KINDS[d.kind].said}${d.by ? `, ${d.by}` : ''}${d.at ? `, ${String(d.at).slice(0, 10)}` : ''})`);
}

// The log a person reads: the decisions about each component, then the ones about the system as a whole.
export function decisionsMarkdown(view, { title = 'Decisions' } = {}) {
  const lines = [`# ${title}`, '',
    `> Gathered by rms-design-system-engine from where each decision was made: the kept differences, the answered proposals, the accepted differences, the checks made by hand, the prototypes' gap list, and a DECISIONS.md the team wrote. Nothing here is written by the engine, and nothing here is rewritten by it.`, ''];
  if (!view.total) { lines.push('Nothing decided yet.'); return lines.join('\n') + '\n'; }
  lines.push(`${view.total} decision${view.total === 1 ? '' : 's'}, ${view.ruledOut} of them ruling an option out.`, '');
  const one = (d) => `- **${d.what}**${d.ruledOut.length ? ` — ruled out: ${d.ruledOut.join(', ')}` : ''}${d.why ? `  \n  Why: ${d.why}` : ''}  \n  *${KINDS[d.kind].said}${d.by ? `, ${d.by}` : ''}${d.at ? `, ${String(d.at).slice(0, 10)}` : ''}, from ${d.from}*`;
  for (const name of Object.keys(view.byComponent).sort()) {
    lines.push(`## ${name}`, '', ...view.byComponent[name].map(one), '');
  }
  if (view.general.length) lines.push('## The system as a whole', '', ...view.general.map(one), '');
  return lines.join('\n') + '\n';
}
