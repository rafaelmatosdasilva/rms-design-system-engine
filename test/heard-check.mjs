// heard-check.mjs - whether a real screen reader run heard every component, for the screen reader workflow
// (.github/workflows/screen-readers.yml). Given the projects it ran in, it reads each one's heard-by-reader.json
// (screen-reader.mjs) and fails when no reader ran, a component could not be heard, nothing at all was heard, or the reader said nothing on every control. What a
// reader said apart from the browser does not fail it: that is the measurement, advisory, and the record keeps it.
//
//   node test/heard-check.mjs <reader> <project> [<project>...]
import { pathToFileURL } from 'node:url';
import { readHeard, heardLine } from '../lib/screen-reader.mjs';

export function heardProblems(run, which) {
  if (!run) return ['no run was written'];
  if (!run.reader) return [`no screen reader ran: ${run.why ?? 'it did not say why'}${run.how ? ` (${run.how})` : ''}`];
  const out = [];
  if (run.reader.which !== which) out.push(`${run.reader.name} ran, not ${which}`);
  for (const f of run.failed ?? []) out.push(`not heard: ${f}`);
  const comps = Object.keys(run.components ?? {});
  if (!comps.length) out.push('no component was heard');
  else if (!comps.some((n) => run.components[n].lines?.length)) out.push('every component was opened, and no control on any of them was heard');
  // A reader that said nothing on every control did not hear them: it ran beside the page, not on it.
  else if (comps.flatMap((n) => run.components[n].lines ?? []).every((l) => !String(l.said ?? '').trim())) out.push('the reader said nothing on any control, so it was not reading the page');
  return out;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [which, ...dirs] = process.argv.slice(2);
  let bad = 0;
  for (const dir of dirs) {
    const run = readHeard(dir);
    console.log(`${dir}: ${heardLine(run) ?? 'no run'}`);
    for (const [name, c] of Object.entries(run?.components ?? {})) for (const l of c.lines ?? []) console.log(`   ${l.ok ? 'same ' : 'apart'} ${name} ${l.desc}: the browser says "${l.want}", the reader said "${l.said}"`);
    for (const [name, c] of Object.entries(run?.components ?? {})) if (c.saidInstead) console.log(`   ${name}: what the reader said instead: ${c.saidInstead.map((x) => `"${x}"`).join(' · ')}`);
    for (const p of heardProblems(run, which)) { console.log(`::error title=${which} on ${dir}::${p}`); bad++; }
  }
  process.exit(bad ? 1 : 0);
}
