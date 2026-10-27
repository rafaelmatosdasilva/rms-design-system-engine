// writes.mjs - what each project lets the engine change, and where it must never.
//
// Until now nothing said it. `stores` names where the engine's own files are kept and the host decides who may push,
// but no setting told a session that it may change the design file in one project and must never in another. So the
// answer was the same everywhere, and it was always the most cautious one: write a script, show it, ask again.
//
// One answer per place, in ds-config.json:
//   "writes": { "figma": "ask", "generated": "yes", "engine": "yes", "issues": "ask" }
//   yes  write it, and say what changed.
//   ask  show the exact change and wait for a yes, every time.
//   no   never. The change goes on the Tasks page, for whoever owns that place.
// Not set is `ask`: the engine asks once, at setup or the first time it has something to write there, and records the
// answer, so every session and every run read the same one rather than each asking again.
//
// Two things the config cannot override. On CI nobody is there to answer, so `ask` is `no`; and CI never writes the
// design file or the team's issue tracker whatever the config says, because a run nobody is watching changing what
// people made - or filling their tracker - is how a team stops trusting the engine. Both are said out loud, never
// silently.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

// Each place, what it is called, and whether CI may ever write it.
// The product's code is not here, and never will be: the engine does not change code people wrote. What it finds
// there is handed back as a patch for a person to apply and shown on the component's own page in the style guide.
// A setting with one possible answer is a lie, so there is none.
export const PLACES = ['figma', 'generated', 'engine', 'issues'];
export const PLACE = {
  figma: { said: 'the design file', holds: 'what Figma shows: a role, a name, an annotation, a component', onCI: false },
  generated: { said: 'the code the engine generated', holds: 'the tokens, the contracts, the style guide: files the engine wrote before', onCI: true },
  engine: { said: "the engine's own files", holds: "the authored contract, the structure contract's notes, the kept differences", onCI: true },
  issues: { said: "the team's issue tracker", holds: 'one issue per difference a check finds, closed when no run finds it any more', onCI: false },
};
export const ANSWERS = ['yes', 'ask', 'no'];

// What a place's answer is for this run, and why it is that. → { answer, set, why }
// set: whether the project answered it (an unanswered place is `ask`, and the engine asks once and records it).
export function mayWrite(cfg = {}, place, { ci = !!process.env.CI } = {}) {
  if (!PLACE[place]) throw new Error(`no such place: ${place}`);
  const given = cfg?.writes?.[place];
  const set = ANSWERS.includes(given);
  const answer = set ? given : 'ask';
  if (ci && !PLACE[place].onCI) return { answer: 'no', set, why: `on CI the engine never writes ${PLACE[place].said}: nobody is watching the run` };
  if (ci && answer === 'ask') return { answer: 'no', set, why: 'on CI there is nobody to ask' };
  if (!set) return { answer, set, why: `${PLACE[place].said} has no answer in ds-config.json yet, so the engine asks and records what you say` };
  return { answer, set, why: null };
}

// The places the project has not answered: what the engine asks about, once.
export const unanswered = (cfg = {}) => PLACES.filter((p) => !ANSWERS.includes(cfg?.writes?.[p]));

// Record one answer in ds-config.json, leaving every other setting as it is (and the file's own formatting where it
// has none of its own to keep). Only a person's answer reaches here: the engine never answers for them.
export function recordWrite(ROOT, place, answer, { file = 'ds-config.json' } = {}) {
  if (!PLACE[place]) throw new Error(`no such place: ${place}`);
  if (!ANSWERS.includes(answer)) throw new Error(`an answer is ${ANSWERS.join(', ')}: ${answer}`);
  const path = join(ROOT, file);
  let cfg = {};
  if (existsSync(path)) { try { cfg = JSON.parse(readFileSync(path, 'utf8')); } catch { throw new Error(`${file} is not valid JSON: the answer was not recorded`); } }
  cfg.writes = { ...(cfg.writes ?? {}), [place]: answer };
  writeFileSync(path, JSON.stringify(cfg, null, 2) + '\n');
  return cfg.writes;
}

// What a person reads: one line per place, with what it holds and what the answer means here.
export function writesLines(cfg = {}, { ci = !!process.env.CI } = {}) {
  const out = [`What this project lets the engine change${ci ? ' (on CI)' : ''}:`];
  for (const p of PLACES) {
    const { answer, set, why } = mayWrite(cfg, p, { ci });
    const said = answer === 'yes' ? 'writes it, and says what changed' : answer === 'ask' ? 'shows the change and waits for a yes' : 'never: the change goes on the Tasks page';
    out.push(`  ${PLACE[p].said}: ${said}${set ? '' : ' (not answered yet)'}${why && set ? ` - ${why}` : ''}`);
    out.push(`    ${PLACE[p].holds}`);
  }
  const left = unanswered(cfg);
  if (left.length) out.push(`  ${left.length} place${left.length === 1 ? '' : 's'} with no answer: set them in ds-config.json → writes, or answer once when the engine next has something to write there.`);
  return out;
}

// What an agent is told before it changes anything: the one sentence that decides whether it may.
export function writeRule(cfg = {}, place, { ci = !!process.env.CI } = {}) {
  const { answer, why } = mayWrite(cfg, place, { ci });
  const head = `${PLACE[place].said}: `;
  if (answer === 'yes') return `${head}write it, and say what changed.`;
  if (answer === 'ask') return `${head}show the person the exact change and wait for a yes. Never write it on your own.`;
  return `${head}never write it${why ? ` (${why})` : ''}. Put the change on the Tasks page, for whoever owns it.`;
}
