// dependabot-body.mjs - a Dependabot pull request's description cut to Dependabot's own words.
//
// Dependabot writes one line naming what it bumps and one "Updates <package> from <a> to <b>" line a package, then
// quotes each package's release notes, changelog and commits in collapsible blocks. Those quotes are the upstream's
// words, and they name people: a contributor credited in a changelog, a commit's author. The privacy check reads a
// pull request's text, because a squash merge writes it into the commit message, and on 25 November 2026 it refused a
// test tool's bump for a name in its quoted release notes, which held the bump unmerged.
//
// What the bump is, and to which version, is all the repository needs to keep: the quotes are a link away on the
// package's own site. So the description keeps every line outside the quoted blocks and drops the blocks.
//
//   ownWords(body)              → the description without its <details> blocks, trimmed
//   node lib/dependabot-body.mjs <file>   → prints it

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export function ownWords(body = '') {
  let out = String(body), prev;
  // Innermost first, so a block that holds another goes whole.
  do { prev = out; out = out.replace(/<details>(?:(?!<details>)[\s\S])*?<\/details>/g, ''); } while (out !== prev);
  return out.replace(/\n{3,}/g, '\n\n').trim();
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const file = process.argv[2];
  if (!file) { console.error('usage: node lib/dependabot-body.mjs <file>'); process.exit(2); }
  process.stdout.write(`${ownWords(readFileSync(file, 'utf8'))}\n`);
}
