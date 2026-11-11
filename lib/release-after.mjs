// release-after.mjs - what a person does to see a release, gathered from its pull requests.
//
// A release listed the pull requests it carried and never said whether anybody had to do anything. People's installs
// follow main every day (self-update.mjs), so most releases ask nothing at all - and the few that do (the library
// read again, a setting the setup writes, pages the style guide builds) read exactly like the rest. Whoever opened
// the release had to work it out from a list of titles, which nobody does.
//
// Each pull request answers it once, when it is opened, as a label beside its release label. The notes then gather
// those answers above everything else, so the first thing read is whether this release wants anything of the reader.
// A pull request with no label asks nothing: that is what almost every one of them is, and the pull request that
// does want something says so, the way the release label is chosen.
import { pathToFileURL } from 'node:url';

// Each thing a release can ask of a person, in the order the notes list them: the label a pull request carries, and
// the line the notes print. `nothing` has no line, being the absence of one.
export const AFTER = {
  figma: { label: 'after: refresh figma', line: 'Refresh Figma, so the engine reads your library again' },
  setup: { label: 'after: run setup', line: 'Run setup again, so your configuration takes what changed' },
  styleguide: { label: 'after: build the style guide', line: 'Build the style guide again, so its pages show what changed' },
  nothing: { label: 'after: nothing', line: null },
};
export const AFTER_LABELS = Object.fromEntries(Object.entries(AFTER).map(([k, v]) => [k, v.label]));
export const AFTER_KEYS = Object.keys(AFTER);

// The key a pull request's labels ask for, or 'nothing' when they ask for none. Two labels on one pull request is a
// mistake nobody should have to guess about: the first in AFTER's order wins, and both are kept so the caller can
// say so.
export function afterOf(labels = []) {
  const held = AFTER_KEYS.filter((k) => (labels ?? []).includes(AFTER[k].label));
  return { key: held[0] ?? 'nothing', also: held.slice(1) };
}

// What a release asks of a person. prs: [{ number, labels }] → [{ key, line, prs: [number] }], in AFTER's order and
// only for the things something actually asks; 'nothing' never appears, being the absence of a thing to do.
export function afterFor(prs = []) {
  const by = new Map();
  for (const pr of prs) {
    const { key } = afterOf(pr?.labels);
    if (key === 'nothing') continue;
    (by.get(key) ?? by.set(key, []).get(key)).push(pr.number);
  }
  return AFTER_KEYS.filter((k) => by.has(k)).map((key) => ({ key, line: AFTER[key].line, prs: by.get(key).filter(Boolean).sort((a, b) => a - b) }));
}

export const NOTHING_LINE = 'Nothing to do: your install follows main and already has this.';
export const HEADING = '## What to do';

// The section that goes above the generated notes. A release that asks nothing still says so, in one line: silence
// would read as "nobody wrote it down", which is the thing this replaces.
export function afterSection(prs = []) {
  const want = afterFor(prs);
  const body = want.length
    ? want.map((w) => `- ${w.line}${w.prs.length ? ` (${w.prs.map((n) => `#${n}`).join(', ')})` : ''}`).join('\n')
    : `- ${NOTHING_LINE}`;
  return `${HEADING}\n\n${body}\n`;
}

// The notes as published: what this says, then what GitHub generated.
export function notesWith(section, generated) {
  const gen = String(generated ?? '').replace(/^\s+/, '');
  return gen ? `${section}\n${gen}\n`.replace(/\n{3,}$/, '\n') : section;
}

// node lib/release-after.mjs '<[{ "number": 1, "labels": [] }, …] as JSON>' → the section, on stdout
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  let prs = [];
  try { prs = JSON.parse(process.argv[2] ?? '[]'); } catch { prs = []; }
  process.stdout.write(afterSection(Array.isArray(prs) ? prs : []));
}
