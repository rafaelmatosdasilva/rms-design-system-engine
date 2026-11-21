// demo-code.mjs - a prototype's own code kept apart from what only simulates or stages it, by the team's convention.
//
// A prototype holds three things a developer treats differently: code to adopt, code that only stands in for a
// service, and code that only makes the demonstration work (a scenario picker, seeded data, a switch). Mixed up, the
// developer rebuilds all of it or ships the demonstration. The team says where each lives, and the check holds the
// prototype to it. The convention is the team's own setting (ds-config.json → prototype.demo); with none, nothing is
// said, since a folder name the engine guessed would be a rule nobody wrote.
//
//   prototype.demo: {
//     "simulated": ["src/mocks"],          folders of code that stands in for a service
//     "staging":   ["src/demo"],           folders of code that only stages the demonstration
//     "marker":    "PROTOTYPE_DEMO_MODE",  the word that marks a demonstration branch inside a product file
//     "words":     ["mock", "fixture"]     a file named with one of these is demonstration code wherever it is
//   }
//
//   demoConvention(cfg)                    → the convention, or null when the team set none
//   kindOf(rel, text, conv)                → 'product' | 'simulated' | 'staging' | 'mixed' | 'copy' | 'outside'
//                                            (copy: a copy of the system, which the building team takes from the system)
//   demoFindings(files, conv)              → [{ file, line?, message }]: demonstration code out of its place
//   demoSummary(files, conv)               → { counts: { kind: n }, mixed: [{ file, lines }] }
//   demoLines(summary, findings)           → the lines a report prints
const slash = (p) => String(p ?? '').split('\\').join('/').replace(/^\.\//, '').replace(/\/+$/, '');
const list = (v) => (Array.isArray(v) ? v : v ? [v] : []).map(slash).filter(Boolean);

export function demoConvention(cfg = {}) {
  const d = cfg?.prototype?.demo;
  if (!d || typeof d !== 'object') return null;
  const conv = { simulated: list(d.simulated), staging: list(d.staging), marker: typeof d.marker === 'string' && d.marker ? d.marker : null, words: list(d.words).map((w) => w.toLowerCase()), source: slash(d.source ?? 'src') };
  return conv.simulated.length || conv.staging.length || conv.marker ? conv : null;
}

const under = (rel, dirs) => dirs.some((d) => rel === d || rel.startsWith(d + '/'));
const named = (rel, words) => { const parts = rel.toLowerCase().split('/'); return words.some((w) => parts.some((p) => p.replace(/\.[^.]+$/, '').split(/[^a-z0-9]+/).includes(w))); };

// rel: the file's path from the prototype's repository. Outside the source folder (documents, captures, settings) a
// file is none of the three.
export function kindOf(rel, text, conv) {
  const r = slash(rel);
  if (under(r, conv.copies ?? [])) return 'copy';
  if (under(r, conv.simulated)) return 'simulated';
  if (under(r, conv.staging)) return 'staging';
  if (conv.source && !under(r, [conv.source])) return 'outside';
  if (conv.marker && String(text ?? '').includes(conv.marker)) return 'mixed';
  return 'product';
}

// files: [{ rel, text }] - the prototype's files (those the work changed, as the caller chooses).
export function demoFindings(files, conv) {
  if (!conv) return [];
  const out = [];
  for (const f of files) {
    const kind = kindOf(f.rel, f.text, conv);
    if ((kind === 'product' || kind === 'mixed') && named(slash(f.rel), conv.words)) {
      const where = [...conv.simulated, ...conv.staging];
      out.push({ file: f.rel, message: `${f.rel} is named as demonstration code and sits with the product's: move it to ${where.length ? where.join(' or ') : 'its own folder'}` });
    }
  }
  return out;
}

export function demoSummary(files, conv) {
  if (!conv) return null;
  const counts = { product: 0, mixed: 0, simulated: 0, staging: 0, copy: 0, outside: 0 }, mixed = [];
  for (const f of files) {
    const kind = kindOf(f.rel, f.text, conv);
    counts[kind]++;
    if (kind === 'mixed') {
      const lines = String(f.text ?? '').split('\n').map((l, i) => (l.includes(conv.marker) ? i + 1 : null)).filter(Boolean);
      mixed.push({ file: f.rel, lines });
    }
  }
  return { counts, mixed };
}

export function demoLines(summary, findings = []) {
  if (!summary) return [];
  const c = summary.counts;
  const out = [`PRODUCT AND DEMONSTRATION  ${c.product} to adopt · ${c.mixed} mixed · ${c.simulated} simulated service · ${c.staging} staging only${c.copy ? ` · ${c.copy} in the copy of the system, taken from the system` : ''} · ${c.outside} outside the source`];
  for (const m of summary.mixed) out.push(`   ${m.file}: a product file with demonstration branches, to take out at lines ${m.lines.join(', ')}`);
  for (const f of findings) out.push(`   ❌ ${f.message}`);
  return out;
}
