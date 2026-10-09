// build-freshness.mjs - is each product's built page the build of what is there now (Gate [1], build freshness)?
//
// File dates alone cannot say: a checkout, a branch switch or a save with nothing new makes the theme or a source
// newer than the build while the content is the one it was built from. So whenever the dates say a build is
// current, what it was built from (the source and the theme files) and what it is (the built page) are recorded by
// content. A later newer date is a stale build only when that content changed. A build never seen current is
// judged by its dates, as before.
import { existsSync, readFileSync, statSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { createHash } from 'node:crypto';

const hashOf = (files) => {
  const h = createHash('sha256');
  for (const f of files) h.update(readFileSync(f)).update('\0');
  return h.digest('hex').slice(0, 16);
};

// products: [{ name, src, out }] (absolute paths); themes: absolute paths; recordFile: where the record is kept.
// Returns { stale: ['name' | 'name (theme newer)'], datesOnly: ['name'] }: datesOnly moved in date, not in content.
export function buildFreshness({ products, themes, recordFile }) {
  let record = {};
  try { record = JSON.parse(readFileSync(recordFile, 'utf8')); } catch { /* none yet */ }
  const themeFiles = themes.filter((p) => existsSync(p));
  const themeTime = Math.max(0, ...themeFiles.map((p) => statSync(p).mtimeMs));
  const stale = [], datesOnly = [];
  let changed = false;
  for (const { name, src, out } of products) {
    if (!existsSync(src) || !existsSync(out)) continue;
    const outTime = statSync(out).mtimeMs;
    const srcNewer = statSync(src).mtimeMs > outTime;
    const themeNewer = themeTime > outTime;
    const now = { inputs: hashOf([src, ...themeFiles]), output: hashOf([out]) };
    if (!srcNewer && !themeNewer) {
      if (record[name]?.inputs !== now.inputs || record[name]?.output !== now.output) { record[name] = now; changed = true; }
    } else if (record[name]?.inputs === now.inputs && record[name]?.output === now.output) datesOnly.push(name);
    else stale.push(srcNewer ? name : `${name} (theme newer)`);
  }
  if (changed) {
    try { mkdirSync(dirname(recordFile), { recursive: true }); writeFileSync(recordFile, JSON.stringify(record, null, 2) + '\n'); } catch { /* read-only project: dates only */ }
  }
  return { stale, datesOnly };
}

export const buildRecordPath = (ROOT, outDir) => join(ROOT, outDir, 'build-freshness.json');
