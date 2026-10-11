// authority.mjs - the order of authority (K3): when two sources disagree, which one decides.
//
// 1. the goal of the people who use the product (the job they came to do), 2. verified research, 3. the system's
// documented standards (Figma, the contracts, the team's guidelines, WCAG 2.2 at level AA), 4. accepted past decisions
// (accepted differences, what Figma and the code last agreed on, the reasons written beside a change), 5. general
// heuristics (layout rules of thumb, the engine's advice). A higher one wins; WCAG 2.2 AA is the floor every level keeps,
// since meeting it is part of every user's goal. The agent says which source decided each call, and never puts its own
// preference above a documented standard. Written into llms.txt for any agent, and onto each finding's record.

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { PROJECT } from './names.mjs';

export const AUTHORITY = [
  { key: 'goal', name: 'The goal of the people who use the product' },
  { key: 'research', name: 'Verified research' },
  { key: 'standard', name: "The system's documented standards" },
  { key: 'decision', name: 'Accepted past decisions' },
  { key: 'heuristic', name: 'General heuristics' },
];

// The level a check's rule stands on, by the name it reports under: advice on the system's shape and the prototype's
// visual review are heuristics, the debt a team accepted is a past decision, everything else (each gate, accessibility,
// the system's own rules) is a documented standard.
const HEURISTIC = /^(System health|Prune candidates|Visual review|Right-to-left|Built around a component|Primitives written by hand|Tailwind arbitrary values|AI-readiness)/i;
const DECISION = /^(Exemption debt|Accepted|Baseline|Last agreed)/i;
export function authorityOf(check) {
  const c = String(check ?? '');
  return HEURISTIC.test(c) ? 'heuristic' : DECISION.test(c) ? 'decision' : 'standard';
}

// This system's own source at each level, in plain words, for llms.txt. cfg: ds-config.json; root: the project.
// → markdown lines.
export function authorityLines(cfg = {}, root = '.') {
  const list = (xs) => [xs ?? []].flat().filter((x) => typeof x === 'string' && x.trim());
  const research = list(cfg.research);
  const guidelines = list(cfg.guidelines?.sources);
  const decisions = [
    existsSync(join(root, PROJECT.baseline.now)) ? `the accepted differences in ${PROJECT.baseline.now}` : null,
    existsSync(join(root, PROJECT.agreed.now)) ? `what Figma and the code last agreed on (${PROJECT.agreed.now})` : null,
    existsSync(join(root, cfg.contracts?.authored ?? 'contract.authored.json')) ? `the notes and reasons in ${cfg.contracts?.authored ?? 'contract.authored.json'}` : null,
    existsSync(join(root, 'DECISIONS.md')) ? 'DECISIONS.md' : null,
  ].filter(Boolean);
  const says = {
    goal: 'what the task says they need to get done.',
    research: research.length ? `${research.join(', ')}.` : 'none recorded for this system (`research` in ds-config.json lists it).',
    standard: `${[(cfg.figmaFileKey || cfg.figma?.fileKey) ? 'the Figma file' : null, 'the contracts and tokens here', ...guidelines.map((g) => `the guidelines in ${g}`), 'WCAG 2.2 at level AA'].filter(Boolean).join(', ')}.`,
    decision: decisions.length ? `${decisions.join(', ')}.` : 'none recorded yet.',
    heuristic: 'layout and visual rules of thumb, and the engine\'s advice.',
  };
  return ['## When sources disagree', '',
    'The higher one decides. Say which source decided each call, and never put your own preference above a documented standard. WCAG 2.2 at level AA is the floor at every level.', '',
    ...AUTHORITY.map((a, i) => `${i + 1}. **${a.name}**: ${says[a.key]}`), ''];
}
