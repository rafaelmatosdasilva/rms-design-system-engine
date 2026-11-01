// contract-changes.mjs - what a merge request (or pull request) changes in the component contracts, shown on it: per
// component, the props, options, states, slots, code props, events and tokens added, removed or changed, which of those
// break a product (contract-gen.mjs's own rules), and which products use the component.
//
//   slimOf(contract)                        → what is compared of one contract (and kept for the base branch)
//   recordOf(contracts, { at, commit, branch, systemVersion }) → the record a build on the base branch keeps
//                                             (--contract-changes --record), in .design-system-engine-out/contracts-last-build.json
//   compare(base, now)                      → [{ name, change: added | removed | changed, items, breaking, usedBy }]
//   verdict(base, now, { failOn, accountedFor, products }) → { code, lines, markdown }
//
// The base is the base branch's record, or the contracts published last (--base <folder>). A breaking change is a prop,
// an option or a state removed, or a default changed (contract-gen.mjs diffContract), and a component removed. One is
// accounted for when it is signed off (--sign-off "breaking change to <component>"), recorded as a release
// (design-system-engine-releases.json), or the component's own version has a new major (contract.authored.json).
// failOn: 'unaccounted' (the default: only a breaking change nothing accounts for fails), 'breaking' (any breaking
// change fails) or 'never' (it only reports). The engine changes no code: it reports, and the pipeline decides.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { diffContract } from './contract-gen.mjs';

export const RECORD_FILE = 'contracts-last-build.json';
export const REPORT_FILE = 'contract-changes.md';
export const FAIL_ON = ['unaccounted', 'breaking', 'never'];

const names = (list) => [...new Set((list ?? []).map((x) => (typeof x === 'string' ? x : x?.name)).filter(Boolean))].sort();

export function slimOf(c) {
  const code = (p) => p.bindings?.code?.prop ?? p.bindings?.code?.slot ?? null;
  return {
    name: c.name, version: c.version ?? null,
    props: (c.props ?? []).map((p) => ({ name: p.name, ...(p.type ? { type: p.type } : {}), ...(p.default !== undefined ? { default: p.default } : {}), ...(Array.isArray(p.options) ? { options: p.options } : {}), ...(code(p) ? { code: code(p) } : {}) })),
    states: names(c.states).map((name) => ({ name })),
    slots: names([...(c.slots ?? []), ...(c.codeSlots ?? [])]),
    codeOnly: names(c.codeOnly), events: names(c.events),
    tokens: [...new Set([...(c.tokens?.used ?? []), ...JSON.stringify(c.anatomy ?? {}).match(/\{[^{}"]+\}/g)?.map((t) => t.slice(1, -1)) ?? []])].sort(),
    ...(c.status ? { status: c.status } : {}),
    ...(c.livesIn?.products?.length ? { usedBy: c.livesIn.products.map((p) => ({ name: p.name ?? 'this project', files: p.files ?? null, ...(p.own || p.name == null ? { own: true } : {}) })) } : {}),
  };
}

export function recordOf(contracts, { at = new Date().toISOString(), commit = null, branch = null, systemVersion = null } = {}) {
  return { version: 1, at, ...(commit ? { commit } : {}), ...(branch ? { branch } : {}), ...(systemVersion ? { systemVersion } : {}),
    contracts: Object.fromEntries(contracts.map((c) => [c.name, slimOf(c)]).sort(([a], [b]) => a.localeCompare(b))) };
}

// Every *.contract.json under a folder (a published one, or the local contracts), parsed. → [contract]
export function contractsIn(dir) {
  const out = [];
  const walk = (d) => { let es = []; try { es = readdirSync(d, { withFileTypes: true }); } catch { return; } for (const e of es) { const p = join(d, e.name); if (e.isDirectory()) { if (!/^(dsds|specs|node_modules)$/.test(e.name)) walk(p); } else if (e.name.endsWith('.contract.json')) { try { const c = JSON.parse(readFileSync(p, 'utf8')); if (c?.name) out.push(c); } catch { /* unreadable */ } } } };
  walk(dir);
  return out;
}
// A published folder read as a base: the same shape as a record.
export const baseOfFolder = (dir, info = {}) => recordOf(contractsIn(dir), { at: null, ...info });

const said = (v) => JSON.stringify(v);
const listDiff = (was = [], now = []) => ({ added: now.filter((x) => !was.includes(x)), removed: was.filter((x) => !now.includes(x)) });

// One component's changes: [{ what, change, detail?, breaking? }], with the breaking ones as contract-gen.mjs says them.
function changesOf(a, b) {
  const items = [];
  const breaking = diffContract(a, b, b.name).filter((c) => c.level === 'breaking' && !/bump the major/.test(c.msg)).map((c) => c.msg);
  const breaks = (needle) => breaking.some((m) => m.includes(needle));
  const pa = new Map(a.props.map((p) => [p.name, p])), pb = new Map(b.props.map((p) => [p.name, p]));
  for (const [n, p] of pb) if (!pa.has(n)) items.push({ what: `prop ${n}`, change: 'added', ...(p.options ? { detail: p.options.join(', ') } : {}) });
  for (const [n, p] of pa) {
    const q = pb.get(n);
    if (!q) { items.push({ what: `prop ${n}`, change: 'removed', breaking: breaks(`prop "${n}" removed`) }); continue; }
    if (said(p.default) !== said(q.default)) items.push({ what: `prop ${n} default`, change: 'changed', detail: `${said(p.default)} → ${said(q.default)}`, breaking: breaks(`prop "${n}" default changed`) });
    if (said(p.type) !== said(q.type)) items.push({ what: `prop ${n} type`, change: 'changed', detail: `${p.type ?? 'none'} → ${q.type ?? 'none'}` });
    const o = listDiff((p.options ?? []).map(String), (q.options ?? []).map(String));
    if (o.added.length) items.push({ what: `prop ${n} options`, change: 'added', detail: o.added.join(', ') });
    if (o.removed.length) items.push({ what: `prop ${n} options`, change: 'removed', detail: o.removed.join(', '), breaking: breaks(`prop "${n}" removed option(s)`) });
    if ((p.code ?? null) !== (q.code ?? null)) items.push({ what: `prop ${n} in the code`, change: 'changed', detail: `${p.code ?? 'none'} → ${q.code ?? 'none'}` });
  }
  const s = listDiff(a.states.map((x) => x.name), b.states.map((x) => x.name));
  for (const x of s.added) items.push({ what: `state ${x}`, change: 'added' });
  for (const x of s.removed) items.push({ what: `state ${x}`, change: 'removed', breaking: breaks(`state "${x}" removed`) });
  for (const [key, word] of [['slots', 'slot'], ['codeOnly', 'code prop'], ['events', 'event'], ['tokens', 'token']]) {
    const d = listDiff(a[key] ?? [], b[key] ?? []);
    for (const x of d.added) items.push({ what: `${word} ${x}`, change: 'added' });
    for (const x of d.removed) items.push({ what: `${word} ${x}`, change: 'removed' });
  }
  if (b.status?.state === 'deprecated' && a.status?.state !== 'deprecated') items.push({ what: 'status', change: 'changed', detail: `deprecated${b.status.supersededBy ? `, use ${b.status.supersededBy}` : ''}` });
  return { items, breaking };
}

export function compare(base, now) {
  const was = base?.contracts ?? {}, is = now?.contracts ?? {};
  const out = [];
  for (const name of [...new Set([...Object.keys(was), ...Object.keys(is)])].sort()) {
    const a = was[name], b = is[name];
    if (!a) { out.push({ name, change: 'added', items: [], breaking: [], usedBy: b.usedBy ?? [] }); continue; }
    if (!b) { out.push({ name, change: 'removed', items: [], breaking: [`${name}: component removed`], usedBy: a.usedBy ?? [] }); continue; }
    const { items, breaking } = changesOf(a, b);
    if (items.length || breaking.length) out.push({ name, change: 'changed', items, breaking, usedBy: b.usedBy ?? a.usedBy ?? [], versions: [a.version, b.version] });
  }
  return out;
}

const major = (v) => parseInt(String(v ?? '0').replace(/^[^\d]*/, '').split('.')[0], 10) || 0;
// What accounts for one component's breaking change: its sign-off, a release that names it, or its own major raised.
// signedOff(what) → boolean; releases: readReleases(); base: the record (its systemVersion).
export function accountedFor(c, { signedOff = () => false, releases = [], base = null, compareVersions = null } = {}) {
  if (signedOff(`breaking change to ${c.name}`) || c.breaking.every((m) => signedOff(m))) return 'signed off';
  const newer = (r) => !base?.systemVersion || !compareVersions || compareVersions(r.version, base.systemVersion) > 0;
  const rel = releases.find((r) => newer(r) && (r.changes ?? []).some((x) => x.kind === 'component' && x.name === c.name));
  if (rel) return `release ${rel.version}`;
  if (c.versions && major(c.versions[1]) > major(c.versions[0])) return `its version ${c.versions[1]}`;
  return null;
}

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const MARK = { added: '+', removed: '−', changed: '~' };

// products: [{ name, uses }] (releases.mjs productsOf), to say the version each product that uses a component is on.
export function verdict(base, now, { failOn = 'unaccounted', account = () => null, products = [] } = {}) {
  if (!now || !Object.keys(now.contracts ?? {}).length) return { code: 2, lines: ['❌ No component contract could be built from this code (no Figma snapshot or component it reads), so nothing can be compared.'], markdown: '' };
  if (!base) return { code: 0, lines: ['✅ No contracts kept from the base branch yet, so nothing to compare: passing.', '   A build on the base branch keeps them with rms-design-system-engine --contract-changes --record (or compare with the last publish: --base <folder>).'], markdown: '' };
  const changed = compare(base, now);
  const since = `the base branch${base.branch ? ` (${base.branch}${base.commit ? `, ${String(base.commit).slice(0, 8)}` : ''})` : base.commit ? ` (${String(base.commit).slice(0, 8)})` : ''}`;
  if (!changed.length) return { code: 0, lines: [`✅ The contracts say what they said on ${since}: no component changed.`], markdown: `No component contract changed since ${since}.\n` };
  const lines = [], md = [`### Component contracts changed since ${since}`, ''];
  const open = [];
  for (const c of changed) {
    const by = c.usedBy.length ? c.usedBy.map((u) => { const p = products.find((x) => x.name === u.name); return `${u.name}${u.files ? ` (${plural(u.files, 'file', 'files')})` : ''}${p?.uses ? `, on ${p.uses}` : ''}`; }).join('; ') : 'no product the usage map knows';
    const why = c.breaking.length ? account(c) : null;
    if (c.breaking.length && !why) open.push(c);
    const what = `${c.change === 'changed' ? plural(c.items.length, 'change', 'changes') : c.change}${c.breaking.length ? `, ${plural(c.breaking.length, 'breaking change', 'breaking changes')}${why ? ` (accounted for: ${why})` : ''}` : ''}`;
    lines.push(`${c.breaking.length ? (why ? '⚠️ ' : '❌') : '•'} ${c.name}: ${what}`); md.push(`- **${c.name}**: ${what}`);
    for (const i of c.items) { const l = `   ${MARK[i.change]} ${i.what}${i.detail ? `: ${i.detail}` : ''}${i.breaking ? ' (breaking)' : ''}`; lines.push(l); md.push(`  - ${l.trim()}`); }
    if (c.change === 'removed') { lines.push('   − the whole component (breaking)'); md.push('  - − the whole component (breaking)'); }
    lines.push(`   used by: ${by}`); md.push(`  - used by: ${by}`);
  }
  const breakingN = changed.filter((c) => c.breaking.length).length;
  const fail = failOn === 'never' ? false : failOn === 'breaking' ? breakingN > 0 : open.length > 0;
  if (open.length) {
    lines.push(`❌ ${plural(open.length, 'component has', 'components have')} a breaking change nothing accounts for: ${open.map((c) => c.name).join(', ')}.`);
    lines.push(`   Account for each one: a person signs it off (rms-design-system-engine --sign-off "breaking change to ${open[0].name}" --by "<who>"), or the component's version gets a new major in contract.authored.json, or it ships as a release.`);
  } else if (breakingN) lines.push(`✅ Every breaking change is accounted for.`);
  else lines.push('✅ No breaking change.');
  if (failOn !== 'unaccounted') lines.push(`   failOn is ${failOn}: ${failOn === 'never' ? 'it only reports' : 'any breaking change fails it'}.`);
  lines.push('   Compared: each component\'s props, options, states, slots, code props, events and tokens. The code is not changed.');
  md.push('', open.length ? `**A breaking change nothing accounts for** in ${open.map((c) => c.name).join(', ')}.` : breakingN ? 'Every breaking change is accounted for.' : 'No breaking change.');
  return { code: fail ? 1 : 0, lines, markdown: md.join('\n') + '\n' };
}
