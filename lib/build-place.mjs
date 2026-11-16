// build-place.mjs - where each part is built, held strictly: a style guide is built from the design system's own
// project, never inside a repository the team keeps as a store (its intent layer, its snapshots, its published guide).
//
// A store's README carries the engine's own section (readmes.mjs), naming what the engine keeps there. That section is
// the engine's mark that the folder is a store, whatever setup a run found there: a session asked to "update the style
// guide" inside the intent layer built a lookalike there (no themes, no accessibility, another system's name), and the
// team's real guide stayed behind. So a build or a publish there stops, says what the folder is and where the guide
// is built, unless the person asks for it here (--here) (the owner's, 16 November 2026).
//
//   storeHere(ROOT)            → { parts: [what the engine keeps here, in words] } when ROOT is a store, else null
//   guideHere(ROOT, argv, env) → { stop, lines }: whether a style guide build or publish may run in ROOT (never held on CI)

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SKILL } from './names.mjs';

const SECTION = new RegExp(`<!-- ${SKILL}:start[^>]*-->([\\s\\S]*?)<!-- ${SKILL}:end -->`);

// The parts a store's section lists: the first cell of each row of its first table, past the head.
export function storeHere(ROOT) {
  let text;
  try { text = readFileSync(join(ROOT, 'README.md'), 'utf8'); } catch { return null; }
  const m = SECTION.exec(text);
  if (!m || !new RegExp(`## What ${SKILL} keeps here`).test(m[1])) return null;
  // Only the first table (What · Where · Written by): the section's others (who can do what) are not what it keeps.
  const lines = m[1].split('\n'), head = lines.findIndex((l) => /^\|\s*What\s*\|/.test(l)), parts = [];
  for (let i = head + 2; head >= 0 && i < lines.length && /^\|/.test(lines[i]); i++) { const c = lines[i].split('|')[1].trim(); if (c) parts.push(c); }
  return { parts };
}

// A pipeline is never stopped: a store whose own CI builds the guide (readmes.mjs: "a pipeline here runs the engine") is
// where the team decided it is built. What is held is a person's run, asked in the wrong folder.
export function guideHere(ROOT, argv = process.argv, env = process.env) {
  if (argv.includes('--here') || env.CI) return { stop: false, lines: [] };
  const s = storeHere(ROOT);
  if (!s) return { stop: false, lines: [] };
  const what = s.parts.length ? s.parts.map((p) => p.replace(/\.$/, '')).join(' · ') : 'what the engine keeps for the team';
  return {
    stop: true,
    lines: [
      `❌ Not built here: this folder is one of the team's stores, not a design system project. It keeps: ${what}.`,
      '   A style guide built here would be a copy with none of the team\'s setup (its themes, its accessibility results, its logo), and nobody else would see it.',
      '   The style guide is built from the design system\'s own project (where ds-config.json and the components are), and published to the team\'s style guide store with --publish-styleguide.',
      'NEXT: tell the person this folder is a store and where the guide is built, and build nothing here. Only if they say to build it in this folder anyway, run the same command again with --here.',
    ],
  };
}
