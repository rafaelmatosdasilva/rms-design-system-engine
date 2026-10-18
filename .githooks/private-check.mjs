#!/usr/bin/env node
// private-check.mjs - nothing private ever enters this public repository.
//
// The engine is built against private projects and from private notes, and the repository is public: a fork or a
// search must find nothing of them. This refuses, in any file, commit message or added line:
//   - a private name: a client, its apps, its design system's names, a person credited as a source, a company the
//     work drew on, the private backlog (stored ONLY as hashes, so this file does not leak them either);
//   - a person's first name used as a reviewer or an author in examples (a role says it: "QA", "Design");
//   - an email address that is not a placeholder (example.com and the like) or a no-reply address;
//   - an item code of the private backlog (a capital letter and digits, in brackets, after "idea", or opening a
//     comment or a test name);
//   - a person credited as a source (a first and last name after "by", or before an article's title).
//
//   node .githooks/private-check.mjs                 every file of the repository (--records: the eval records too)
//   node .githooks/private-check.mjs --staged        the lines a commit adds (the pre-commit hook)
//   node .githooks/private-check.mjs --message FILE  a commit message (the commit-msg hook)
import { createHash } from 'node:crypto';
import { readFileSync, realpathSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// Runs of 1 to 4 words, joined with "-" and with nothing ("Some Name", "some-name", "someName").
export const FORBIDDEN = new Set([
  // the private test beds: clients, their apps and repositories, their design systems' names
  'c411366b16d3e6f1', '1c52ae64d0c2147e', '5d986e63ff2f763b', '6d276d4c8562f9ca', 'e25e4e0bdefb175a',
  'f482813e1f552975', 'a014e20238d85a8b', '465a31889376534d', 'a17b72836b3c767c', '214bd8fc72fc14a5',
  '7645004daad329c8', '8a85212edd9b1cbf', '6f7e1788cf61f933', '58fc42db10026dd2', 'dc90e782ef3514fa',
  '4b58e238abcdc554', 'ea44371c73220699',
  '8d808f2ceea98a66', '13e1c22c1e6e6168', 'ac5f628a2d3196cb', '6cbf681846a571eb', '40c1f88fbe317aa3',
  'd1d40828ba0a9a71', '3ed4ed1073d30d61',
  // people and companies the work drew on
  '1c2563a021738678', '72b8db31f2f39c41', '607bed4f8e5226fb', '45efe0b1fdb47eaa', '609984247e6fcfb0',
  '93a2053547af3262', '58e0ef06e87c9414', '8a85e1283b16be7b',
  // the private backlog and the owner's personal address
  '0cfbd5a35f88c2ef', '49f94064933b52f6', '7b682e980cda89ba', 'a2ecd660a27c8db8', 'ea6214d81b87a69a',
  'd79e4b5fcb6c289d', '6d381e28f97ddd5f',
]);
// First names once used as people in examples: matched as a whole capitalised word only (short names would match
// inside joined words otherwise).
export const FORBIDDEN_FIRST_NAMES = new Set(['24d4b96f58da6d4a', '8a5b4ac36aba7445', '3d099d0f13df9d0b']);
export const hash = (s) => createHash('sha256').update(s).digest('hex').slice(0, 16);
const seen = new Map();   // a word run is hashed once per run of the check
const isForbidden = (s) => { let v = seen.get(s); if (v === undefined) { v = FORBIDDEN.has(hash(s)); if (seen.size < 2e6) seen.set(s, v); } return v; };

// The one public page that may be named: the owner's design system went public, and its living style guide, built by
// this engine, is the README's example of the output. Only this exact address is allowed, nothing else of that project.
export const PUBLIC_EXAMPLE = 'https://rafaelmatosdasilva.github.io/rms-ds-figma-plugins/';

export function forbiddenHits(text) {
  const words = text.split(PUBLIC_EXAMPLE).join(' ').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  const hits = new Set();
  for (let i = 0; i < words.length; i++) {
    for (let n = 1; n <= 4 && i + n <= words.length; n++) {
      const run = words.slice(i, i + n);
      for (const cand of [run.join('-'), run.join('')]) if (isForbidden(cand)) hits.add(`${i}:${n}`);
    }
  }
  return hits.size;
}

// An address is fine when it is a placeholder, a no-reply, a git remote, or the credentials of a URL in a test.
const PLACEHOLDER_DOMAIN = /(^|\.)(example(\.(com|org|net))?|test|invalid|localhost)$/i;
const FILE_LIKE = /\.(png|jpe?g|svg|gif|webp|avif|otf|ttf|woff2?|css|js|mjs|json)$/i;
function personalEmails(text) {
  const out = [];
  for (const m of text.matchAll(/(^|[^\w.%+:/-])([\w.%+-]+)@([\w-]+(?:\.[\w-]+)+)/g)) {
    const [, , local, domain] = m;
    if (PLACEHOLDER_DOMAIN.test(domain) || FILE_LIKE.test(`@${domain}`) || /^git$/i.test(local)) continue;
    if (/^(no-?reply|noreply\+?.*)$/i.test(local) || /(^|\.)users\.noreply\.github\.com$/i.test(domain)) continue;
    out.push(`${local}@${domain}`);
  }
  return out;
}

// A backlog item code: a capital letter and one to three digits. Colour spaces and the like are not codes.
const NOT_A_CODE = new Set(['D50', 'D65', 'P3', 'A4', 'A11']);
const CODE = String.raw`[A-Z]\d{1,3}`;
const CODE_FORMS = [
  new RegExp(String.raw`\[(?:[a-z]+ )?(${CODE})\]`, 'g'),                                   // in square brackets
  new RegExp(String.raw`\((?:idea |ideas )?(${CODE})(?=[,)/ ]|\s(?:and|to|follow-up))`, 'g'),  // in parentheses
  new RegExp(String.raw`\bideas? (${CODE})\b`, 'g'),                                        // after "idea"
  new RegExp(String.raw`(?:^|//|/\*|\*|#)\s*(${CODE}):\s`, 'gm'),                           // opening a comment
  new RegExp(String.raw`\btest\(\s*['"\`](${CODE})[: ]`, 'g'),                              // opening a test name
  new RegExp(String.raw`[:;] (${CODE})(?:,| and )`, 'g'),                                     // leading a list of changes
];
function backlogCodes(text) {
  const out = [];
  for (const re of CODE_FORMS) for (const m of text.matchAll(re)) if (!NOT_A_CODE.has(m[1])) out.push(m[0].trim());
  return out;
}

// A person credited as a source. Product and place names that read the same way are not people.
const NOT_A_PERSON = /^(Google Fonts|Hard Rule|Naming Convention|Design Tokens|Code Connect|Dev Mode|Figma \w+|Claude \w+|Tailwind \w+|Style Dictionary|Material Design|Storybook \w+|Chrome \w+|Visual Studio|Git \w+)$/;
function credits(text) {
  const out = [];
  for (const m of text.matchAll(/\b(?:by|per|after|according to|cf\.?)\s+([A-Z][a-z]+ (?:[A-Z][a-z]+ )?[A-Z][a-z]+)\b/g)) if (!NOT_A_PERSON.test(m[1])) out.push(m[0]);
  for (const m of text.matchAll(/\(([A-Z][a-z]+ [A-Z][a-z]+), ["“]/g)) if (!NOT_A_PERSON.test(m[1])) out.push(m[0]);
  for (const m of text.matchAll(/\b([A-Z][a-z]+(?: [A-Z][a-z]+)?)'s (?:article|post|essay|talk|benchmark|framework|book|newsletter|thread)\b/g)) out.push(m[0]);
  return out;
}

function firstNames(text) {
  const out = [];
  for (const m of text.matchAll(/\b[A-Z][a-z]{1,5}\b/g)) if (FORBIDDEN_FIRST_NAMES.has(hash(m[0].toLowerCase()))) out.push(m[0]);
  return out;
}

// Every private thing in a text: [{ kind, what }], `what` withheld for the hashed names (naming them would leak them).
export function privateFindings(text, { names = true } = {}) {
  const out = [];
  if (names && forbiddenHits(text)) out.push({ kind: 'private name', what: '(a client, a person, a company or the backlog)' });
  for (const w of firstNames(text)) out.push({ kind: 'a person\'s first name', what: w });
  for (const w of personalEmails(text)) out.push({ kind: 'email address', what: w });
  for (const w of backlogCodes(text)) out.push({ kind: 'backlog item code', what: w });
  for (const w of credits(text)) out.push({ kind: 'a person credited', what: w });
  return out;
}

const git = (args) => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 28 });
// Measurement records hold what the agents replied, word for word (56 MB): they are checked for private names only,
// as they are committed (--staged), and in a whole-repository run only with --records.
const RECORD = /^test\/skill-evals\/records\//;
const TEXT_FILE = (f) => /\.(mjs|cjs|js|jsx|tsx?|vue|svelte|md|json|jsonl|ya?ml|sh|html|css|txt)$/.test(f) || !/\./.test(f.split('/').pop());

export function repoFindings({ records = false } = {}) {
  const files = [...new Set([...git(['ls-files']).split('\n'), ...git(['ls-files', '--others', '--exclude-standard']).split('\n')])]
    .filter(Boolean).filter(TEXT_FILE);
  const out = [];
  for (const f of files) {
    let text; try { text = readFileSync(join(ROOT, f), 'utf8'); } catch { continue; }
    if (RECORD.test(f) && !records) continue;
    if (RECORD.test(f)) { if (forbiddenHits(text)) out.push({ file: f, line: 0, kind: 'private name', what: '' }); continue; }
    // Names first over the whole file (a name split over two lines is still one name), then line by line.
    const named = forbiddenHits(text) > 0;
    text.split('\n').forEach((l, i) => { for (const x of privateFindings(l, { names: named })) out.push({ file: f, line: i + 1, ...x }); });
    if (named && !out.some((x) => x.file === f && x.kind === 'private name')) out.push({ file: f, line: 0, kind: 'private name', what: '' });
  }
  return out;
}

// The lines a commit adds, read from the staged diff, with the file and line each lands on.
export function stagedFindings() {
  const out = [];
  let file = '', line = 0;
  for (const l of git(['diff', '--cached', '--unified=0', '--no-color', '--no-ext-diff']).split('\n')) {
    if (l.startsWith('+++ ')) { file = l.replace(/^\+\+\+ (b\/)?/, ''); continue; }
    const h = l.match(/^@@ -\S+ \+(\d+)/); if (h) { line = Number(h[1]); continue; }
    if (l.startsWith('+')) {
      const text = l.slice(1);
      const found = RECORD.test(file) ? (forbiddenHits(text) ? [{ kind: 'private name', what: '' }] : []) : privateFindings(text);
      for (const x of found) out.push({ file, line, ...x });
      line++;
    }
  }
  return out;
}

export function messageFindings(text) {
  return privateFindings(text.split('\n').filter((l) => !/^#/.test(l) && !/^Co-Authored-By: .*<noreply@anthropic\.com>$/.test(l)).join('\n'));
}

if (process.argv[1] && realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1])) {
  const args = process.argv.slice(2);
  const at = args.indexOf('--message');
  const found = at >= 0 ? messageFindings(readFileSync(args[at + 1], 'utf8')).map((x) => ({ file: 'the commit message', line: 0, ...x }))
    : args.includes('--staged') ? stagedFindings() : repoFindings({ records: args.includes('--records') });
  if (!found.length) process.exit(0);
  console.error('Refused: this repository is public, and this carries something private.');
  for (const x of found) console.error(`  ${x.file}${x.line ? ':' + x.line : ''}  ${x.kind}${x.what ? ': ' + x.what : ''}`);
  console.error('Say it generically (a role, a placeholder address, "a published article"), and leave the backlog out.');
  process.exit(1);
}
