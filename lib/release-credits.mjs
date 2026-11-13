// release-credits.mjs - the release notes thank whoever reported what a release fixed, when they asked to be.
//
// A fix that came from an issue said nothing of the person who reported it, so the people who took the time saw no
// sign it mattered. Each pull request names the issues it closes; each issue's reporter is thanked by their GitHub
// handle in the notes of the release that carries the fix, but only when they agreed to it in the issue itself: the
// issue forms carry a box for it, and an issue whose box is not ticked, or that was written without the form, thanks
// nobody. Only the person who wrote the issue is named, and never an account that is a bot.
//
//   consented(body)        → true when the issue's own "Thank me in the release notes" box is ticked
//   creditsFor(prs)        → [{ handle, issues: [number], prs: [number] }], one per person, in handle order
//     prs: [{ number, issues: [{ number, author: { login, is_bot? }, body }] }]
//   creditsSection(prs)    → the notes' "Thanks" section, or '' when nobody is to be thanked
//
// Run as `node lib/release-credits.mjs '<prs as JSON>'` it prints the section (the release workflow does).
import { pathToFileURL } from 'node:url';

export const CONSENT = 'Thank me in the release notes';
export const HEADING = '## Thanks';

// The box as GitHub writes a ticked one into the issue's body: "- [X] Thank me in the release notes…".
export const consented = (body) => new RegExp(`^\\s*[-*]\\s*\\[[xX]\\]\\s*${CONSENT}`, 'm').test(String(body ?? ''));
const isBot = (a) => !a?.login || a.is_bot === true || a.type === 'Bot' || /\[bot\]$|^(dependabot|github-actions|renovate)$/i.test(a.login);

export function creditsFor(prs = []) {
  const by = new Map();
  for (const pr of prs ?? []) for (const issue of pr?.issues ?? []) {
    if (!consented(issue?.body) || isBot(issue?.author)) continue;
    const handle = issue.author.login;
    const c = by.get(handle) ?? by.set(handle, { handle, issues: new Set(), prs: new Set() }).get(handle);
    c.issues.add(issue.number); c.prs.add(pr.number);
  }
  return [...by.values()].sort((a, b) => a.handle.localeCompare(b.handle))
    .map((c) => ({ handle: c.handle, issues: [...c.issues].sort((a, b) => a - b), prs: [...c.prs].sort((a, b) => a - b) }));
}

export function creditsSection(prs = []) {
  const cs = creditsFor(prs);
  if (!cs.length) return '';
  const list = (ns) => ns.map((n) => `#${n}`).join(', ');
  return `${HEADING}\n\n${cs.map((c) => `- @${c.handle}, for reporting ${list(c.issues)} (fixed in ${list(c.prs)})`).join('\n')}\n`;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  let prs = [];
  try { prs = JSON.parse(process.argv[2] ?? '[]'); } catch { prs = []; }
  process.stdout.write(creditsSection(prs));
}
