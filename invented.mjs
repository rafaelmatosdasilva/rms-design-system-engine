// invented.mjs - the names agents actually invented in this system, kept so the catalog can reject them by name.
//
// The table of rejected names (prop-vocabulary.mjs) is built from words that mean the same: a system whose values are
// "error" and "warn" rejects "danger" because danger means error. That catches what a reasonable agent would guess.
// It does not catch what agents in this project actually guessed, which is the list worth having: a name invented
// once will be invented again, by the same model on the same documentation.
//
// --check-ui already knows them. Every time it says `"X" is not in the catalog (did you mean Y?)` or `has no prop
// "k"`, an agent invented a name and the check knew the right one. Nothing kept them, so the same invention was
// caught again on the next page instead of being prevented on it.
//
// Local and cumulative, in the engine's output folder. Fed back into the catalog, so the next agent reads "danger →
// error" beside the values themselves rather than finding out after it wrote the page.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { OUT_DIR } from './names.mjs';

export const INVENTED_FILE = `${OUT_DIR}/invented.json`;
const fileOf = (ROOT) => join(ROOT, INVENTED_FILE);

// A page written as code is checked by another road (page-check.mjs), which keeps its own record of what agents got
// wrong there: by component, with each mistake's message. Those messages carry the same "did you mean" the
// composition check writes, so the inventions in them belong in the same table. Read rather than copied, so there is
// one record of each kind of mistake and not two saying different things.
const PAGE_RECORD = `${OUT_DIR}/prototypes/inventions.json`;
function fromPageChecks(ROOT) {
  try {
    const j = JSON.parse(readFileSync(join(ROOT, PAGE_RECORD), 'utf8'));
    return inventionsIn((j.runs ?? []).flatMap((r) => r.items ?? []));
  } catch { return { components: {}, props: {}, values: {} }; }
}

// Only what this file holds. What is written back must never carry the other record's entries into it: they would
// then be read twice, once from each file, and every lesson would count double.
function readOwn(ROOT) {
  const ok = (o) => (o && typeof o === 'object' && !Array.isArray(o) ? o : {});
  try { const j = JSON.parse(readFileSync(fileOf(ROOT), 'utf8')); return { components: ok(j.components), props: ok(j.props), values: ok(j.values) }; } catch { return { components: {}, props: {}, values: {} }; }
}

// Both records as one table: what the composition check saw, and what the page check saw.
// → { components: { wrong: { right, times } }, props: { "Component.prop": { right, times } }, values: { ... } }
export function readInvented(ROOT) {
  const ok = (o) => (o && typeof o === 'object' && !Array.isArray(o) ? o : {});
  const own = readOwn(ROOT);
  const page = fromPageChecks(ROOT);
  const out = { components: {}, props: {}, values: {} };
  for (const kind of ['components', 'props', 'values']) {
    for (const [wrong, e] of [...Object.entries(page[kind]), ...Object.entries(own[kind])]) {
      const had = out[kind][wrong];
      out[kind][wrong] = { right: e?.right ?? had?.right ?? null, times: (had?.times ?? 0) + (e?.times ?? 1) };
    }
  }
  return out;
}

// The inventions in one check's findings. Pure, so a caller can read a saved run as well as a live one.
// A finding whose message names no right answer still counts: that a name was invented is worth knowing even when
// the check could not say what was meant.
export function inventionsIn(findings = []) {
  const out = { components: {}, props: {}, values: {} };
  for (const f of findings) {
    const m = String(f?.message ?? '');
    const guess = /\(did you mean ([^)]+)\?\)/.exec(m)?.[1]?.trim() ?? null;
    let hit = /^"([^"]+)" is not in the catalog/.exec(m);
    if (hit) { out.components[hit[1]] = { right: guess, times: 1 }; continue; }
    hit = /^(\w[\w-]*) has no prop "([^"]+)"/.exec(m);
    if (hit) { out.props[`${hit[1]}.${hit[2]}`] = { right: guess, times: 1 }; continue; }
    hit = /^(\w[\w-]*)\.([\w-]+) = "([^"]+)" is not one of (.+)$/.exec(m);
    if (hit) out.values[`${hit[1]}.${hit[2]}.${hit[3]}`] = { right: guess ?? hit[4].split(',')[0].trim(), times: 1 };
  }
  return out;
}

// Add what this check found to what the project has seen before. Never throws: a project whose output folder cannot
// be written still gets its check.
export function noteInvented(ROOT, findings = []) {
  const now = inventionsIn(findings);
  const all = readOwn(ROOT);
  for (const kind of ['components', 'props', 'values']) {
    for (const [wrong, e] of Object.entries(now[kind])) {
      const had = all[kind][wrong];
      all[kind][wrong] = { right: e.right ?? had?.right ?? null, times: (had?.times ?? 0) + 1 };
    }
  }
  try { mkdirSync(dirname(fileOf(ROOT)), { recursive: true }); writeFileSync(fileOf(ROOT), JSON.stringify({ $description: 'Names agents invented in this project, from --check-ui. Fed back into the catalog so the next one reads them beside the real names.', at: new Date().toISOString(), ...all }, null, 2) + '\n'); } catch { /* the check still reported */ }
  return all;
}

// The invented value names for one component's prop, as the catalog's rejected table wants them: { wrong: right }.
// Only those with a right answer: a table entry that cannot say what to write instead would send an agent nowhere.
export function rejectedFrom(invented, component, prop) {
  const out = {};
  for (const [key, e] of Object.entries(invented?.values ?? {})) {
    const [c, p, ...rest] = key.split('.');
    if (c !== component || p !== prop || !e?.right) continue;
    out[rest.join('.')] = e.right;
  }
  return out;
}
