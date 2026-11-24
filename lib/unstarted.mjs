// unstarted.mjs - a run of the suite that failed only because GitHub never gave one of its jobs a machine is run again.
//
// On 24 November 2026 main's suite went red, and the README's tests badge with it, with not one test failing: the
// macOS Playwright job waited 25 minutes for a runner, was cancelled with no step run, and the `test` job that adds up
// the results counted it as a failure, as it must, since nothing was checked on macOS. Two other runs that hour failed
// the same way. A run that was never started says nothing about the code, and the badge and the checks a pull request
// waits on read it as if it did.
//
// So when the suite finishes failing, this reads its jobs: when every job that ran passed, and the only red is a job
// that never started (no step) and the jobs that only add the others up, the failed jobs are run again, once. A job
// that ran and failed is never run again here, whatever it was: that is a result. And a run already on its second
// attempt is left as it is, so a machine that never comes leaves the run red and main-red.mjs's streak counts it.
//
//   unstartedOnly(jobs)            → { rerun: boolean, unstarted: [name], failed: [name] }
//   node lib/unstarted.mjs <run id> <attempt>   (the workflow passes the run that finished)

// The jobs that only add the others up or draw from them: red when one above them is, never a result of their own.
export const ROLL_UPS = new Set(['test', 'badge']);

const done = (c) => c === 'success' || c === 'skipped' || c === 'neutral';
const neverStarted = (j) => (j.conclusion === 'cancelled' || j.conclusion === 'failure') && !(j.steps ?? []).length;

export function unstartedOnly(jobs = []) {
  const unstarted = [], failed = [];
  for (const j of jobs) {
    if (done(j.conclusion) || ROLL_UPS.has(j.name)) continue;
    (neverStarted(j) ? unstarted : failed).push(j.name);
  }
  return { rerun: unstarted.length > 0 && failed.length === 0, unstarted, failed };
}

// ── Asking GitHub ─────────────────────────────────────────────────────────────────
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const gh = (args) => execFileSync('gh', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

export function run(id, attempt, { repo = process.env.GITHUB_REPOSITORY ?? '', jobs = null, rerun = (r) => gh(['run', 'rerun', String(r), '--failed', '--repo', repo]) } = {}) {
  const got = jobs ?? JSON.parse(gh(['api', `repos/${repo}/actions/runs/${id}/attempts/${attempt}/jobs`, '--jq', '.jobs'])).map((j) => ({ name: j.name, conclusion: j.conclusion, steps: j.steps }));
  const v = unstartedOnly(got);
  if (!v.rerun) {
    console.log(v.failed.length ? `Left as it is: ${v.failed.join(', ')} ran and failed, which is a result.` : 'Nothing that never started to run again.');
    return { ...v, ran: false };
  }
  if (Number(attempt) > 1) {
    console.log(`Left as it is: ${v.unstarted.join(', ')} never got a machine on attempt ${attempt} either, so the run stays red and says so.`);
    return { ...v, ran: false };
  }
  console.log(`Every job that ran passed. ${v.unstarted.join(', ')} never got a machine, so the failed jobs run again, once.`);
  rerun(id);
  return { ...v, ran: true };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [id, attempt] = process.argv.slice(2);
  if (!id || !attempt) { console.error('usage: node lib/unstarted.mjs <run id> <attempt>'); process.exit(2); }
  run(id, attempt);
}
