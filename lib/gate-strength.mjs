// gate-strength.mjs - what each gate actually is, and where it can be gone around.
//
// Every gate is tried against a fault on purpose (test/planted-faults.test.mjs): each one passes a clean project and
// names the mistake in a broken one. That says a gate works. It does not say what the gate *is* - and the same
// finding is advice on one project and a refused merge on the next, depending on a setting nobody writes down.
//
// Two kinds of switch exist in the code, and from outside they look identical:
//   • a HARDENING switch, read as `cfg.xStrict === true`, is off unless a team turns it on. Until then its finding
//     prints as `ℹ️` and the gate passes: advice an agent may ignore.
//   • a WEAKENING switch, read as `cfg.xStrict !== false`, is on unless a team turns it off. Its finding fails the
//     run, and the setting is the way around it.
// A gate with neither always fails on its fault, and nothing in the configuration excuses it.
//
// This is read from the code, never asserted beside it: the test walks `lib/` for both spellings and fails when a
// switch exists that this file does not name, so a new one cannot be added quietly. What a gate promises is a thing
// people plan around, and the honest answer is sometimes "advice, until you ask for more".
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const LIB = dirname(fileURLToPath(import.meta.url));

export const ADVICE = 'advice';                  // prints, never fails: an agent may ignore it
export const STOPS = 'stops the merge';          // fails the run, and the run's exit code stops the merge
export const STRENGTHS = [ADVICE, STOPS];

// Each switch: which way it leans, and what it decides. `harden` is off by default (the finding is advice until a
// team asks for more); `weaken` is on by default (the finding stops the merge until a team asks for less).
export const SWITCHES = {
  coverageStrict: { kind: 'harden', about: 'a component no check models at all' },
  deadCssStrict: { kind: 'harden', about: 'CSS no rule uses any more' },
  fillCoverageStrict: { kind: 'harden', about: 'a background nothing asserts, so a missing fill would ship unseen' },
  htmlCompositionStrict: { kind: 'harden', about: 'a sub-component Figma nests that the code does not use' },
  htmlRealizationStrict: { kind: 'harden', about: 'a prop Figma has that the code does not realise' },
  orphanUsedStrict: { kind: 'harden', about: 'a token bound in Figma that no CSS variable carries' },
  reimplementationStrict: { kind: 'harden', about: 'a component built by hand where the system has one' },
  renderedModeStrict: { kind: 'harden', about: 'a rendered assertion that covers some modes and not all' },
  templateCompositionStrict: { kind: 'harden', about: 'a page missing a component its Figma template composes' },
  versionLockStrict: { kind: 'harden', about: 'a product left on an older version of the system' },
  renderedParityStrict: { kind: 'weaken', about: 'what the browser draws against what the design says' },
  screenComponentsStrict: { kind: 'weaken', about: 'a designed screen built from something other than the system' },
  screenElementStrict: { kind: 'harden', about: 'an element on a screen the code never builds' },
};
export const SWITCH_KEYS = Object.keys(SWITCHES);
export const hardening = () => SWITCH_KEYS.filter((k) => SWITCHES[k].kind === 'harden');
export const weakening = () => SWITCH_KEYS.filter((k) => SWITCHES[k].kind === 'weaken');

// What one switch does with a given configuration. → { on, strength, around }
export function switchState(key, cfg = {}) {
  const s = SWITCHES[key];
  if (!s) return null;
  const on = s.kind === 'harden' ? cfg[key] === true : cfg[key] !== false;
  return {
    key,
    about: s.about,
    on,
    strength: on ? STOPS : ADVICE,
    // Where it can be gone around, in the words a person would put in ds-config.json.
    around: on ? (s.kind === 'harden' ? `${key}: false` : `${key}: false`) : null,
    toHarden: on ? null : `${key}: true`,
  };
}

// Every switch, with what it is doing right now. → [{ key, about, on, strength, around, toHarden }]
export const switchStates = (cfg = {}) => SWITCH_KEYS.map((k) => switchState(k, cfg));

// The switches a module actually reads, from its source. The code spells the same question five ways - `=== true`,
// `!== false`, `!!cfg.x`, `cfg.x &&`, `cfg.x ?` - and only `!== false` means on by default, so every spelling is
// read here rather than the two that happen to be commonest. A comment is not a reading: lines that are only a
// comment are dropped first, or this file's own prose would count as code.
const CODE_ONLY = (src) => String(src).split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');
export function switchesIn(source) {
  const out = new Map();
  const code = CODE_ONLY(source);
  for (const m of code.matchAll(/cfg\.([a-z][a-zA-Z]*Strict)\s*!==\s*false/g)) out.set(m[1], 'weaken');
  for (const m of code.matchAll(/cfg\.([a-z][a-zA-Z]*Strict)\b(?!\s*!==\s*false)/g)) if (!out.has(m[1])) out.set(m[1], 'harden');
  return out;
}

// Every switch the engine reads, walked from lib/. → Map<key, 'harden' | 'weaken'>; a key read both ways is
// 'weaken', the kinder reading, and the test says so rather than this file choosing quietly.
export const SELF = 'gate-strength.mjs';
export function switchesInEngine(dir = LIB, read = readFileSync, list = readdirSync) {
  const found = new Map();
  // This file names every switch to describe it; counting itself would make the table true by construction.
  for (const f of list(dir).filter((n) => n.endsWith('.mjs') && n !== SELF)) {
    for (const [k, kind] of switchesIn(read(join(dir, f), 'utf8'))) {
      if (!found.has(k) || kind === 'weaken') found.set(k, kind);
    }
  }
  return found;
}

// What to print under a run, so a person reads what the gates on this project actually are rather than assuming
// every ❌ would have stopped them.
export function strengthLines(cfg = {}) {
  const states = switchStates(cfg);
  const advice = states.filter((s) => !s.on);
  const out = [`Gates: ${states.length - advice.length} of ${states.length} switched checks stop the merge here; ${advice.length} are advice.`];
  for (const s of advice) out.push(`   advice only: ${s.about} — ${s.toHarden} to make it stop the merge`);
  for (const s of states.filter((x) => x.on && SWITCHES[x.key].kind === 'weaken')) out.push(`   stops the merge: ${s.about} — ${s.around} to make it advice`);
  return out;
}
