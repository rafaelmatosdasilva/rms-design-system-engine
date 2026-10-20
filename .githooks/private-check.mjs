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
//   - a person credited as a source (a first and last name after "by", or before an article's title);
//   - a name of a project the engine worked on, read from that project on this computer and kept outside the
//     repository (private-terms.mjs): its components, tokens, brands, fonts, repository and hosts;
//   - a Figma file key other than the placeholders and the public ones below;
//   - a company's own host (gitlab.company.com, jira.…, *.internal, a private IP address);
//   - a path on someone's computer (/Users/name/…, /home/name/…, C:\Users\name\…);
//   - a secret: an access token or key (figd_, ghp_, github_pat_, sk-…, AKIA…, xox…-, a private key);
//   - a private file: a font anywhere, an image, a document or an archive outside test/fixtures/, and data copied
//     from a Figma file (a JSON with many node ids) outside test/fixtures/;
//   - a commit whose author or committer address is not a no-reply or placeholder one.
//
//   node .githooks/private-check.mjs                 every file of the repository (--records: the eval records too)
//   node .githooks/private-check.mjs --staged        the lines and files a commit adds (the pre-commit hook)
//   node .githooks/private-check.mjs --message FILE  a commit message (the commit-msg hook)
//   node .githooks/private-check.mjs --push          every commit a push sends, its refs read from stdin (pre-push)
//   node .githooks/private-check.mjs --range A..B    every commit in a range (CI; A of zeros: all of B's history)
//   node .githooks/private-check.mjs --text FILE     any text (a pull request's title and description, in CI)
import { createHash } from 'node:crypto';
import { readFileSync, realpathSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { localTerms, PUBLIC_HOST } from './private-terms.mjs';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// Runs of 1 to 4 words, joined with "-" and with nothing ("Some Name", "some-name", "someName").
export const FORBIDDEN = new Set([
  // the private test beds: clients, their apps and repositories, their design systems' names
  'c411366b16d3e6f1', '1c52ae64d0c2147e', '5d986e63ff2f763b', '6d276d4c8562f9ca', 'e25e4e0bdefb175a',
  'f482813e1f552975', 'a014e20238d85a8b', '465a31889376534d', 'a17b72836b3c767c', '214bd8fc72fc14a5',
  '7645004daad329c8', '8a85212edd9b1cbf', '6f7e1788cf61f933', '58fc42db10026dd2', 'dc90e782ef3514fa',
  '4b58e238abcdc554', 'ea44371c73220699', 'e3c328cd1a70a88b',
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
// Short private names refused only as a word of their own: joined from shorter words they would match ordinary code
// ("for (k in m)"). Hashed as the list above.
export const FORBIDDEN_WORDS = new Set([
  '872b449a658da8f8', '8d3b9db31d6ccf7c',
]);
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
      if (n === 1 && FORBIDDEN_WORDS.has(hash(run[0]))) hits.add(`${i}:1`);
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

// ── Patterns: what leaks without naming anyone ─────────────────────────────────────────────────────────────────
// The Figma files that may be named: a placeholder, the owner's public board, the fictional fixture's file.
const FIGMA_OK = new Set(['AbCdEf123456XyZ', 'W5UEjkrLv5t4fqsGPQWqk8', 'b0LpOCBsaRgo8lUqbkQNaY']);
function figmaKeys(text) {
  const out = [];
  for (const m of text.matchAll(/figma\.com\/(?:design|file|board|proto|make|slides|deck)\/([A-Za-z0-9]{15,})/g)) if (!FIGMA_OK.has(m[1])) out.push(m[1]);
  for (const m of text.matchAll(/["']?(?:figma)?[Ff]ile_?[Kk]ey["']?\s*[:=]\s*["']([A-Za-z0-9]{15,})["']/g)) if (!FIGMA_OK.has(m[1])) out.push(m[1]);
  return [...new Set(out)];
}
// A placeholder host: example, test, invalid and localhost, and the invented companies of the examples.
const PLACEHOLDER_HOST = /(^|\.)(example|test|invalid|localhost|local\.test)$|(^|\.)(acme|northwind|tidal|tidepool|contoso|fabrikam|your-host|yourcompany|company)(\.[a-z]+)*$/i;
const INTERNAL_PREFIX = /^(gitlab|git|scm|svn|jira|confluence|wiki|intranet|intra|portal|artifactory|nexus|sonar|sonarqube|jenkins|ci|build|vpn|sso|auth|login|idp|grafana|kibana|vault|registry|docker|harbor|teamcity|bamboo|redmine|youtrack|sharepoint|teams)\./i;
const INTERNAL_TLD = /\.(internal|local|lan|corp|intra|intranet|home|priv|private|localdomain)$/i;
const PRIVATE_IP = /^(10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+|169\.254\.\d+\.\d+)$/;
function internalHosts(text) {
  const out = [];
  for (const m of text.matchAll(/(?:https?:\/\/|git@|ssh:\/\/(?:[\w.-]+@)?|\bwww\.)([a-z0-9][a-z0-9.-]*[a-z0-9])(?=[:/\s"'`)\]>]|$)/gi)) {
    const h = m[1].toLowerCase();
    if (PUBLIC_HOST.test(h) || PLACEHOLDER_HOST.test(h) || /^(127\.|0\.0\.0\.0|localhost)/.test(h)) continue;
    if (INTERNAL_PREFIX.test(h) || INTERNAL_TLD.test(h) || PRIVATE_IP.test(h) || /\.atlassian\.net$|\.slack\.com$|\.sharepoint\.com$|\.service-now\.com$/.test(h)) out.push(h);
  }
  for (const m of text.matchAll(/\b(10\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|172\.(?:1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3})\b/g)) out.push(m[1]);
  return [...new Set(out)];
}
// A path on someone's computer. A placeholder user (me, you, user, name, a, runner…) is fine.
const PLACEHOLDER_USER = /^(me|a|b|you|user|users|name|username|runner|demo|example|someone|dev|developer|<[^>]*>|\$\w+|\$\{[^}]*\}|\{[^}]*\}|\*|\.\.\.)$/i;
function localPaths(text) {
  const out = [];
  const user = (u) => u.replace(/[,;:.!?]+$/, '');
  for (const m of text.matchAll(/(?:^|[^\w.])\/(Users|home)\/([^\s/"'`)\]\\]+)/g)) if (!PLACEHOLDER_USER.test(user(m[2]))) out.push(`/${m[1]}/${user(m[2])}/`);
  for (const m of text.matchAll(/\b[A-Za-z]:\\{1,2}Users\\{1,2}([^\s\\"'`]+)/g)) if (!PLACEHOLDER_USER.test(user(m[1]))) out.push(`C:\\Users\\${user(m[1])}\\`);
  for (const m of text.matchAll(/-Users-([A-Za-z][\w.]*)-/g)) if (!PLACEHOLDER_USER.test(m[1])) out.push(`-Users-${m[1]}-`);
  return [...new Set(out)];
}
// A secret: the forms of the tokens and keys of the services the engine meets.
const SECRETS = [
  /\bfigd_[A-Za-z0-9_-]{20,}/g, /\bgh[pousr]_[A-Za-z0-9]{30,}/g, /\bgithub_pat_[A-Za-z0-9_]{30,}/g, /\bglpat-[A-Za-z0-9_-]{20,}/g,
  /\bsk-(?:ant-|proj-)?[A-Za-z0-9_-]{20,}/g, /\bAKIA[0-9A-Z]{16}\b/g, /\bxox[abprs]-[A-Za-z0-9-]{10,}/g, /\bAIza[0-9A-Za-z_-]{35}\b/g,
  /\bntn_[A-Za-z0-9]{30,}/g, /\bsecret_[A-Za-z0-9]{40,}/g, /-----BEGIN [A-Z ]*PRIVATE KEY-----/g,
  /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g,
];
function secrets(text) {
  const out = [];
  for (const re of SECRETS) for (const m of text.matchAll(re)) out.push(m[0].slice(0, 8) + '…');
  return [...new Set(out)];
}

// Every private thing in a text: [{ kind, what }], `what` withheld for the hashed names (naming them would leak them).
export function privateFindings(text, { names = true } = {}) {
  const out = [];
  if (names && forbiddenHits(text)) out.push({ kind: 'private name', what: '(a client, a person, a company or the backlog)' });
  for (const w of firstNames(text)) out.push({ kind: 'a person\'s first name', what: w });
  for (const w of personalEmails(text)) out.push({ kind: 'email address', what: w });
  for (const w of backlogCodes(text)) out.push({ kind: 'backlog item code', what: w });
  for (const w of credits(text)) out.push({ kind: 'a person credited', what: w });
  if (names) for (const h of localTerms().find(text)) out.push({ kind: 'a project\'s own name', what: `${h.term} (from ${h.from})` });
  for (const w of figmaKeys(text)) out.push({ kind: 'Figma file key', what: w });
  for (const w of internalHosts(text)) out.push({ kind: 'a company host', what: w });
  for (const w of localPaths(text)) out.push({ kind: 'a path on someone\'s computer', what: w });
  for (const w of secrets(text)) out.push({ kind: 'a secret', what: w });
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

// The lines a diff adds, with the file and line each lands on. The eval records (agents' replies word for word) are
// checked for names, secrets and paths only: they quote the engine's own examples.
function diffFindings(diff, at = '') {
  const out = [];
  let file = '', line = 0;
  for (const l of diff.split('\n')) {
    if (l.startsWith('+++ ')) { file = l.replace(/^\+\+\+ (b\/)?/, ''); continue; }
    const h = l.match(/^@@ -\S+ \+(\d+)/); if (h) { line = Number(h[1]); continue; }
    if (l.startsWith('+')) {
      const text = l.slice(1);
      const found = RECORD.test(file)
        ? [...(forbiddenHits(text) ? [{ kind: 'private name', what: '' }] : []), ...secrets(text).map((w) => ({ kind: 'a secret', what: w })), ...localPaths(text).map((w) => ({ kind: 'a path on someone\'s computer', what: w }))]
        : privateFindings(text);
      for (const x of found) out.push({ file: at + file, line, ...x });
      line++;
    }
  }
  return out;
}

// What a file is, whatever it says: a font anywhere; an image, a document or an archive outside the fictional
// fixtures; data copied from a Figma file (a JSON with many node ids) outside them; and its own name.
const FIXTURE = /^test\/fixtures\//;
const FONT = /\.(otf|ttf|woff2?|eot)$/i;
const BINARY = /\.(png|jpe?g|gif|webp|avif|bmp|tiff?|heic|ico|svg|pdf|fig|sketch|xd|psd|ai|zip|tgz|gz|bundle|7z|rar|mp4|mov|webm|docx?|xlsx?|pptx?|key|numbers|pages)$/i;
export function fileFindings(file, readText = () => '', at = '') {
  const out = [];
  const say = (kind, what) => out.push({ file: at + file, line: 0, kind, what });
  if (FONT.test(file)) say('a font file', 'fonts are licensed: never in the repository');
  else if (BINARY.test(file) && !FIXTURE.test(file)) say('a private file', 'an image, a document or an archive belongs in test/fixtures/ only, and only an invented one');
  else if (/\.json$/i.test(file) && !FIXTURE.test(file) && !RECORD.test(file)) {
    let t = ''; try { t = readText(); } catch { /* deleted */ }
    const ids = (t.match(/"\d+:\d+"/g) || []).length;
    if (ids >= 20) say('data copied from a Figma file', `${ids} node ids: a fixture is invented and lives in test/fixtures/`);
  }
  for (const x of privateFindings(file)) out.push({ file: at + file, line: 0, kind: 'its name: ' + x.kind, what: x.what });
  return out;
}

// The lines and files a commit adds, read from the staged diff.
export function stagedFindings() {
  const out = diffFindings(git(['diff', '--cached', '--unified=0', '--no-color', '--no-ext-diff']));
  for (const f of git(['diff', '--cached', '--name-only', '--diff-filter=ACMR']).split('\n').filter(Boolean)) out.push(...fileFindings(f, () => git(['show', `:${f}`])));
  return out;
}

// A commit as a push or CI sees it: its message, its author and committer, the lines and files it adds.
const SAFE_ADDRESS = (e) => /(^|[.+])no-?reply@|@users\.noreply\.github\.com$|^noreply@/i.test(e) || PLACEHOLDER_DOMAIN.test(e.split('@')[1] ?? '');
export function commitFindings(sha) {
  const at = sha.slice(0, 7) + ' ';
  const out = messageFindings(git(['log', '-1', '--format=%B', sha])).map((x) => ({ file: at + 'its message', line: 0, ...x }));
  for (const e of new Set(git(['log', '-1', '--format=%ae%n%ce', sha]).split('\n').filter(Boolean))) if (!SAFE_ADDRESS(e)) out.push({ file: at + 'its author', line: 0, kind: 'a personal address', what: `${e} (use the no-reply address: git config user.email <id>+<user>@users.noreply.github.com)` });
  out.push(...diffFindings(git(['show', '--format=', '--unified=0', '--no-color', '--no-ext-diff', '--root', sha]), at));
  for (const f of git(['show', '--format=', '--name-only', '--diff-filter=ACMR', '--root', sha]).split('\n').filter(Boolean)) out.push(...fileFindings(f, () => git(['show', `${sha}:${f}`]), at));
  return out;
}
const ZERO = /^0+$/;
// Every commit in a range (A..B; A empty or zeros: all of B's history).
export function rangeFindings(range) {
  const [a, b] = range.includes('..') ? range.split('..') : ['', range];
  // A start this clone does not have (a force-pushed branch's old tip) checks all of B's history.
  const known = a && !ZERO.test(a) && (() => { try { execFileSync('git', ['cat-file', '-e', `${a}^{commit}`], { cwd: ROOT, stdio: 'ignore' }); return true; } catch { return false; } })();
  const shas = git(['rev-list', ...(known ? [`${a}..${b}`] : [b])]).split('\n').filter(Boolean);
  return shas.flatMap(commitFindings);
}
// What a push sends: for each ref, the commits the remote does not have yet, and the ref's own name.
export function pushFindings(stdin) {
  const out = [];
  for (const l of String(stdin).split('\n').filter(Boolean)) {
    const [lref, lsha, rref, rsha] = l.split(/\s+/);
    if (!lsha || ZERO.test(lsha)) continue;
    for (const x of privateFindings(`${lref} ${rref}`)) out.push({ file: 'the branch or tag name', line: 0, ...x });
    const shas = git(['rev-list', lsha, ...(rsha && !ZERO.test(rsha) ? [`^${rsha}`] : ['--not', '--remotes'])]).split('\n').filter(Boolean);
    for (const s of shas) out.push(...commitFindings(s));
  }
  return out;
}

export function messageFindings(text) {
  return privateFindings(text.split('\n').filter((l) => !/^#/.test(l) && !/^Co-Authored-By: .*<noreply@anthropic\.com>$/.test(l)).join('\n'));
}

if (process.argv[1] && realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1])) {
  const args = process.argv.slice(2);
  const at = args.indexOf('--message');
  const arg = (f) => args[args.indexOf(f) + 1];
  const found = at >= 0 ? messageFindings(readFileSync(args[at + 1], 'utf8')).map((x) => ({ file: 'the commit message', line: 0, ...x }))
    : args.includes('--staged') ? stagedFindings()
    : args.includes('--push') ? pushFindings(readFileSync(0, 'utf8'))
    : args.includes('--range') ? rangeFindings(arg('--range'))
    : args.includes('--text') ? privateFindings(readFileSync(arg('--text'), 'utf8')).map((x) => ({ file: 'the text', line: 0, ...x }))
    : repoFindings({ records: args.includes('--records') });
  if (!found.length) process.exit(0);
  console.error('Refused: this repository is public, and this carries something private.');
  for (const x of found) console.error(`  ${x.file}${x.line ? ':' + x.line : ''}  ${x.kind}${x.what ? ': ' + x.what : ''}`);
  console.error('Say it generically: an invented name (Acme, cardTile), a role, a placeholder address or path, "a published article"; leave the backlog out.');
  console.error('A name that is the engine\'s own and only looks like a project\'s: node .githooks/private-terms.mjs --allow <name>.');
  process.exit(1);
}
