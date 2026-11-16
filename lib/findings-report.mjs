// findings-report.mjs - the run's findings in the file the team's own review surface already reads.
//
// A finding on a page of its own is read less than one beside the line it is about. GitHub's code scanning reads
// SARIF 2.1.0 and GitLab's code quality reads a JSON array of its own, and both put a finding on the line in the
// diff and give the merge a status to wait on. The engine already writes every finding once, as a record with its
// check, the rule that check stands on, what it found and a stable id (findingRecords in run-diff.mjs): this turns
// those records into each format and invents nothing.
//
// Where a finding is:
//   - the place its own evidence names ("Clean CSS :: ⚠️  cardTile override (src/CardTile.vue:3)"), file and line;
//   - else the file the catalog says that component lives in, with no line, since the run never read one;
//   - else nowhere, and it is said so rather than placed somewhere it is not. GitLab's format has no entry without a
//     path, so those are left out of it and counted (`placeless`), and the run says how many and where to read them.
//
// Severity is the verdict the run already reached, never a judgement of its own: a check that fails is an error (a
// GitLab "major"), one that is advisory a warning (a "minor"). A team decides what blocks a merge in its own CI.
//
// A pointer is left out of both. The run prints lines that point at a finding rather than being one - what was
// skipped, how much was compared, who last changed it - and they carry their gate's verdict, so a report that kept
// them badged "Build freshness skipped on CI" as an error of the code under review (isPointer, run-diff.mjs).
import { basename } from 'node:path';
import { isPointer } from './run-diff.mjs';

export const TOOL = 'rms-design-system-engine';
export const HOME = 'https://github.com/rafaelmatosdasilva/rms-design-system-engine';

// A path with a line in a finding's own words: "(src/CardTile.vue:3)", "apps/shop/src/Cart.vue:12". A URL is never
// one (its "://" and its host), nor a version ("0.23.1"): a path has an extension of letters and no space in it.
const PLACE = /(?<![:\w/])((?:[\w.@-]+\/)*[\w.@-]+\.[A-Za-z]\w{0,7})(?::(\d+))?\b/g;
export function placeOf(evidence) {
  // A link is not a place: its host reads as a path ("example.com/a.html") and its page is nobody's file.
  const text = String(evidence ?? '').replace(/\b[a-z][\w+.-]*:\/\/\S+/gi, ' ');
  for (const m of text.matchAll(PLACE)) {
    const [, file, line] = m;
    if (/^\d/.test(basename(file))) continue; // a version, a size, a measurement
    return { file, line: line ? Number(line) : null };
  }
  return null;
}

// Where each finding is, by the two readings above. → { file, line } | null
export function whereOf(record, livesIn = {}) {
  const said = placeOf(record?.evidence);
  if (said) return said;
  const lives = record?.component ? livesIn[record.component] : null;
  return lives ? { file: lives, line: null } : null;
}

const slug = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'check';
const LEVEL = { fails: 'error', advisory: 'warning' };
const GITLAB = { fails: 'major', advisory: 'minor' };

// Every distinct check as a SARIF rule, with the rule it stands on in plain words where the run knows it.
function rulesOf(records, gates = []) {
  const rule = new Map(gates.filter((g) => g.rule).map((g) => [g.check, g.rule]));
  const seen = new Map();
  for (const r of records) {
    if (seen.has(r.check)) continue;
    const says = r.rule ?? rule.get(r.check) ?? null;
    seen.set(r.check, { id: slug(r.check), name: r.check,
      shortDescription: { text: r.check },
      ...(says ? { fullDescription: { text: says } } : {}),
      ...(r.authority ? { properties: { authority: r.authority } } : {}),
      helpUri: HOME });
  }
  return [...seen.values()];
}

// The run's findings as a SARIF 2.1.0 log. → object
export const reported = (records = []) => records.filter((r) => !isPointer(r.evidence));

export function sarifOf(records = [], { gates = [], livesIn = {}, version = null } = {}) {
  const results = reported(records).map((r) => {
    const at = whereOf(r, livesIn);
    return { ruleId: slug(r.check), level: LEVEL[r.verdict] ?? 'note',
      message: { text: r.evidence },
      locations: at ? [{ physicalLocation: { artifactLocation: { uri: at.file }, ...(at.line ? { region: { startLine: at.line } } : {}) } }] : [],
      ...(r.id ? { partialFingerprints: { engineFindingId: String(r.id) } } : {}),
      properties: { ...(r.component ? { component: r.component } : {}), ...(r.authority ? { authority: r.authority } : {}),
        ...(r.product ? { product: r.product } : {}), check: r.check } };
  });
  return { $schema: 'https://json.schemastore.org/sarif-2.1.0.json', version: '2.1.0',
    runs: [{ tool: { driver: { name: TOOL, informationUri: HOME, ...(version ? { version } : {}), rules: rulesOf(reported(records), gates) } },
      results,
      invocations: [{ executionSuccessful: true, properties: { placeless: results.filter((x) => !x.locations.length).length } }] }] };
}

// The run's findings as GitLab's code quality report. A finding with no path is left out: the format has no entry
// without one. → { report: [entry], placeless: n }
export function codeQualityOf(records = [], { livesIn = {} } = {}) {
  const report = [], placeless = [];
  for (const r of reported(records)) {
    const at = whereOf(r, livesIn);
    if (!at) { placeless.push(r); continue; }
    report.push({ description: r.evidence, check_name: r.check, fingerprint: String(r.id ?? ''),
      severity: GITLAB[r.verdict] ?? 'info',
      location: { path: at.file, ...(at.line ? { lines: { begin: at.line } } : {}) } });
  }
  return { report, placeless: placeless.length };
}

// Each report with the numbers the run says about it, counted from the report itself: a line that counts the records
// and a file that holds fewer disagree the moment either changes. → { body, count, placeless }
export function sarifReport(records = [], opts = {}) {
  const body = sarifOf(records, opts);
  const results = body.runs[0].results;
  return { body, count: results.length, placeless: results.filter((r) => !r.locations.length).length };
}
export function codeQualityReport(records = [], opts = {}) {
  const { report, placeless } = codeQualityOf(records, opts);
  return { body: report, count: report.length, placeless };
}

// What the run says when it has written one. The count that has no place is said, never hidden: a report that shows
// 40 of 52 findings and says nothing reads as all of them.
export function reportLine(kind, file, { count, placeless }) {
  const where = kind === 'sarif' ? 'GitHub code scanning' : 'GitLab code quality';
  const left = placeless ? ` (${placeless} of them name no file, so ${kind === 'sarif' ? 'they carry no line' : 'they are not in it'} - the run\'s own report has every one)` : '';
  return `📤 ${count} finding${count === 1 ? '' : 's'} for ${where} → ${file}${left}`;
}
