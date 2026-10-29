// a11y-no-worse.mjs - accessibility never gets worse. A merge request (or pull request) fails when it adds an
// accessibility blocker the last build on the base branch did not have; what it fixed is said as good news.
//
// It reads the result the accessibility check already keeps (.design-system-engine-out/a11y.json) and nothing else:
//   recordOf(result, at)            → the record a build on the base branch keeps (--a11y-no-worse --record), in
//                                     .design-system-engine-out/a11y-last-build.json (the pipeline keeps it in its cache)
//   blockers(result)                → Map key → { line, where }: this result's blockers, each keyed stably
//   compare(record, result)         → { added, fixed, notChecked } (lists of lines)
//   noWorse(record, result)         → { code, lines }: 0 no new blocker (or no record yet), 1 a new one, 2 nothing to compare
//
// Only blockers count: measured on the page against a WCAG A or AA criterion. A warning (read from the code, can be
// wrong) and an advisory (beyond AA) never fail it. Only components and products' pages are compared: a finding on the
// page around them (the style guide's own frame) names neither, and is left out. Prototypes are never part of it.
// A blocker the base branch already had is not new, whatever its measured value does now. The engine changes no code:
// it reports, and the pipeline decides what a non-zero exit stops.
import { readFileSync } from 'node:fs';

export const RECORD_FILE = 'a11y-last-build.json';
export const RESULT_FILE = 'a11y.json';

// Where a finding is: its component, or its product's page (with the component on it, when one is named).
function whereOf(i) {
  if (i.product) return { key: `product:${i.product}:${i.component ?? ''}`, said: i.component ? `${i.product}, ${i.component}` : `${i.product} (its page)` };
  if (i.component) return { key: `component:${i.component}`, said: i.component };
  return null;
}

// The element the finding is on, as its selector names it: the first word before " in …", a reason in brackets or a
// quoted text. Numbers are taken out (a generated id, a size in the words), so a value that moves is the same element.
export function elementOf(selector) {
  const s = String(selector ?? '').trim();
  const first = s.split(/ in |\s\(|\s"|: |, /)[0].trim().split(/\s+/)[0] ?? '';
  return first.replace(/\d+(\.\d+)?/g, '#');
}

// The variant the element shows, in words: its classes other than the component's own (cardTile's `.card-tile` and a
// BEM prefix `card-tile--`), else the element itself.
const kebab = (s) => String(s ?? '').replace(/([a-z0-9])([A-Z])/g, '$1-$2').replace(/[\s_/]+/g, '-').toLowerCase();
export function variantOf(element, component) {
  const own = kebab(component);
  const classes = (element.match(/\.(-?[_a-zA-Z][\w-]*)/g) ?? []).map((c) => c.slice(1));
  const rest = classes.map((c) => (own && c.startsWith(`${own}--`) ? c.slice(own.length + 2) : own && c.startsWith(`${own}__`) ? c.slice(own.length + 2) : c))
    .filter((c) => c && kebab(c) !== own && c !== String(component ?? ''));
  return rest.length ? rest.join(' ') : element;
}

// What was measured, when the finding has a number: a contrast as 3.1:1, a target as its size.
function measured(i) {
  if (i.contrast != null) return ` ${i.contrast}:1`;
  if (i.size) return ` ${i.size}`;
  return '';
}

// This result's blockers, each keyed by where it is, the element and its variant, the state, the colour mode, the
// criterion and the kind of finding. A finding in several colour modes is one key per mode, so a mode that starts
// failing is new. → Map key → { line, where }
export function blockers(result) {
  const out = new Map();
  for (const i of result?.issues ?? []) {
    if ((i.severity ?? 'blocker') !== 'blocker') continue;
    const where = whereOf(i);
    if (!where) continue;
    const element = elementOf(i.selector);
    const variant = [variantOf(element, i.component ?? ''), i.state].filter(Boolean).join(', ');
    const kind = String(i.issue ?? '').replace(/^axe:/, '');
    const criterion = i.wcag ? `${i.wcag} ` : '';
    const modes = [...new Set([i.theme, ...(i.modes ?? [])].filter(Boolean))];
    for (const mode of modes.length ? modes : [null]) {
      const key = [where.key, element, i.state ?? '', mode ?? '', i.wcag ?? '', i.issue].join(' | ');
      if (out.has(key)) continue;
      out.set(key, { where: where.said, line: `${where.said}, ${variant}${mode ? ` (${mode})` : ''}, ${criterion}${kind}${measured(i)}` });
    }
  }
  return out;
}

// What a build on the base branch keeps: when, which result, and its blockers.
export function recordOf(result, { at = new Date().toISOString(), commit = null, branch = null } = {}) {
  const b = blockers(result);
  return { version: 1, at, ...(commit ? { commit } : {}), ...(branch ? { branch } : {}), checkedAt: result?.checkedAt ?? null,
    blockers: [...b].map(([key, v]) => ({ key, where: v.where, line: v.line })).sort((x, y) => x.key.localeCompare(y.key)) };
}

export function readJson(file) {
  try { return JSON.parse(readFileSync(file, 'utf8')); } catch { return null; }
}

// A component this run could not read or draw: its blockers on the base branch are not checked, never fixed.
const notReadIn = (result, where) => (result?.notRead ?? []).some((n) => String(n).split(/[\s(,]/)[0] === where.split(',')[0].trim());

export function compare(record, result) {
  const was = new Map((record?.blockers ?? []).map((b) => [b.key, b]));
  const now = blockers(result);
  const added = [...now].filter(([k]) => !was.has(k)).map(([, v]) => v.line).sort();
  const gone = [...was.values()].filter((b) => !now.has(b.key));
  const notChecked = gone.filter((b) => notReadIn(result, b.where)).map((b) => b.line).sort();
  const fixed = gone.filter((b) => !notReadIn(result, b.where)).map((b) => b.line).sort();
  return { added, fixed, notChecked };
}

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

// The verdict for a merge request: the lines to print and the exit code.
export function noWorse(record, result) {
  if (!result?.checkedAt) return { code: 2, lines: ['❌ No accessibility result from this run (.design-system-engine-out/a11y.json): run the audit first (rms-design-system-engine --only accessibility), then this.'] };
  if (!record) return { code: 0, lines: ['✅ No accessibility result kept from the base branch yet, so nothing to compare: passing.', '   A build on the base branch keeps one with rms-design-system-engine --a11y-no-worse --record.'] };
  if (record.checkedAt && result.checkedAt <= record.checkedAt) return { code: 2, lines: [`❌ This run's accessibility result is the base branch's own (checked ${record.checkedAt}): the check did not measure anything in this run, so nothing can be compared.`] };
  const { added, fixed, notChecked } = compare(record, result);
  const lines = [];
  const since = `the last build on the base branch${record.branch ? ` (${record.branch}` : ''}${record.commit ? `${record.branch ? ', ' : ' ('}${String(record.commit).slice(0, 8)}` : ''}${record.branch || record.commit ? ')' : ''}`;
  if (added.length) {
    lines.push(`❌ ${plural(added.length, 'accessibility blocker', 'accessibility blockers')} that ${since} did not have:`);
    for (const l of added) lines.push(`   new: ${l}`);
  } else lines.push(`✅ No accessibility blocker that ${since} did not have.`);
  if (fixed.length) {
    lines.push(`🎉 ${plural(fixed.length, 'blocker', 'blockers')} fixed since then:`);
    for (const l of fixed) lines.push(`   fixed: ${l}`);
  }
  if (notChecked.length) {
    lines.push(`⚠️  ${plural(notChecked.length, 'blocker', 'blockers')} from then not checked in this run (the component was not read):`);
    for (const l of notChecked) lines.push(`   not checked: ${l}`);
  }
  if (result.leftOut?.length) lines.push(`⚠️  Left out of this run: ${result.leftOut.join('; ')}. What only that part finds is not compared.`);
  lines.push(`   Compared: blockers on components and products' pages (warnings and advisories never fail this). The code is not changed: fix what is new, then run it again.`);
  return { code: added.length ? 1 : 0, lines };
}
