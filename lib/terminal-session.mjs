// terminal-session.mjs - the whole skill from a plain terminal, in plain words: `rms-design-system-engine "check the button"`.
//
// In an agent, the agent does three things around every command: it routes the request (--route), asks the person what
// the recipe needs, and follows each NEXT line until the work is done or the person has to decide. A person in a terminal
// had the commands and none of the three. This is the three, done by the engine itself, with the same router and the
// same NEXT lines an agent reads, so the terminal and the agent never take different roads:
//   - the request is routed (route.mjs) to its recipe and its command;
//   - what the recipe asks the person is asked here, one question a prompt, each answer put where the command marks
//     it (<the Figma link>, <the folder or link>), and which components when the request names none;
//   - each command runs with its output shown as it comes, and its NEXT line is followed: another of the engine's
//     commands runs at once, and the session stops where the person decides (a commit, an approval, a fix to make)
//     or where the work leaves the engine (a step in Figma), saying what that step is;
//   - the words meant for an agent ("tell the person", "relay its SUMMARY") are said to the person instead.
// Nothing here is a model: every sentence printed is the engine's own. A request whose recipe needs a model (the wording
// and page judges) runs it with the person's own key, as those commands already do.
//
//   isPlainRequest(args)              → the request text when the arguments are words and not options, else null
//   nextStep(line, cmd)               → { kind: 'run' | 'person' | 'outside' | 'done', args?, says }
//   argsOf(text)                      → the words of a command line, quotes kept as one word
//   plainWords(text)                  → an agent-facing sentence said to the person
//   runSession({ text, ROOT, engine, state, ask, run, print }) → the steps taken, for a test to read
import { existsSync, readFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { spawn } from 'node:child_process';
import readline from 'node:readline';

export const CLI = 'rms-design-system-engine';
const MAX_STEPS = 6;

// Words with no option among them are a request; a single word naming a file or folder is not (it is a path).
export function isPlainRequest(args = [], { ROOT = process.cwd() } = {}) {
  if (!args.length || args.some((a) => a.startsWith('-'))) return null;
  const text = args.join(' ').trim();
  if (!text) return null;
  if (args.length === 1 && !/\s/.test(text) && existsSync(resolve(ROOT, text))) return null;
  return text;
}

export function argsOf(text) {
  // As a shell reads them: a word may hold quoted parts anywhere in it (--figma-url='<the link>'), kept as one word.
  return (String(text).match(/(?:[^\s'"]+|'[^']*'|"[^"]*")+/g) ?? []).map((w) => w.replace(/'([^']*)'|"([^"]*)"/g, (_, a, b) => a ?? b));
}

// The command a sentence gives, from the engine's name to where the sentence moves on (a full stop, a semicolon, a
// bracket or a backtick outside quotes).
function commandIn(says, cmd) {
  const at = ['rms-design-system-engine', cmd].map((c) => says.indexOf(c)).filter((i) => i >= 0).sort((a, b) => a - b)[0];
  if (at == null) return null;
  const rest = says.slice(at).replace(/^\S+/, '');
  let q = null, end = rest.length;
  for (let i = 0; i < rest.length; i++) {
    const c = rest[i];
    if (q) { if (c === q) q = null; continue; }
    if (c === "'" || c === '"') { q = c; continue; }
    if (c === ';' || c === '`' || c === '(' || (c === '.' && (i + 1 === rest.length || /\s/.test(rest[i + 1])))) { end = i; break; }
  }
  return argsOf(rest.slice(0, end).trim());
}

// What the person decides, said by the NEXT line itself: the engine never runs past these.
const PERSON = /\b(ask the person|the person asks|when (they|the person) ask|only when (they|the person)|their (go|yes|answer)|the person (decides|reviews|commits|says|chooses|approves|applies)|approve|commit\b|push\b|merge\b|apply (it|the patch)|make the fix|fix each|decide)/i;
// A step the engine cannot take from a terminal: work in Figma through an agent's tool, a person's review elsewhere.
const OUTSIDE = /\b(figma mcp|in figma|the team reviews|once the merge request is merged|write it as operations)\b/i;

// A sentence that instructs whoever relays the result, not the person reading it: left out, so what is said is the step.
const FOR_AN_AGENT = /\b(only when (they|the person) ask|do not ask again|a request to fix it is that ask|relay|follow (its|the) next|in your (final )?reply|word for word|change nothing|run nothing)\b/i;
export function plainWords(text) {
  const kept = String(text ?? '').split(/(?<=[.!?])\s+|\s+\((?=[^)]*\b(?:a request|do not)\b)/).filter((x) => x && x.trim() && !FOR_AN_AGENT.test(x)).join(' ');
  return (kept || String(text ?? ''))
    .replace(/\b(tell|say to) the (person|user)( what| that)?\b:?\s*/gi, '')
    .replace(/\brelay (its|the) SUMMARY as it is,?\s*(and )?/gi, '')
    .replace(/\bfollow (its|the) NEXT line\.?/gi, '')
    .replace(/\bask the person\b/gi, 'decide')
    .replace(/\bthe (person|user)\b/gi, 'you')
    .replace(/\s{2,}/g, ' ')
    .trim()
    .replace(/^./, (c) => c.toUpperCase());
}

// The NEXT line of a command's output, read as the step it asks for.
export function nextStep(line, cmd = CLI) {
  const says = String(line ?? '').replace(/^NEXT:\s*/, '').trim();
  if (!says || /^none\b/i.test(says)) return { kind: 'done', says: '' };
  if (PERSON.test(says)) return { kind: 'person', says };
  if (OUTSIDE.test(says)) return { kind: 'outside', says };
  if (/^(run\s+)?`?(rms-design-system-engine|\S*audit\.mjs)\b/i.test(says)) {
    const args = commandIn(says, cmd) ?? [];
    if (args.some((a) => /<[^>]+>/.test(a))) return { kind: 'person', says, args };   // a value only the person has
    return { kind: 'run', args, says };
  }
  return { kind: 'outside', says };
}

// The question for each value a command marks for the person, and the command with the answers put in.
async function fillAsked(args, r, ask) {
  const marks = [...new Set(args.flatMap((a) => a.match(/<[^>]+>/g) ?? []))];
  let out = args;
  for (const mark of marks) {
    const q = marks.length === 1 && r.ask ? r.ask : mark.slice(1, -1);
    const answer = await ask(q, '');
    if (answer == null || answer === '') return null;
    out = out.map((a) => a.split(mark).join(answer));
  }
  return out;
}

// One session. ask(question, default) → the answer (a test passes its own); run(args) → { code, out } with the output
// already shown; print(line) shows a line to the person. Returns the steps taken.
export async function runSession({ text, state, route, recipeTitle = (n) => n, ask, run, print }) {
  const r = route(text, state);
  const steps = [];
  print(`→ ${recipeTitle(r.recipe)}`);
  for (const s of r.say ?? []) print(plainWords(s));
  if (!r.run.length) {
    print(`This one is answered by the recipe: ${CLI} --recipe ${r.recipe}`);
    steps.push({ kind: 'recipe', recipe: r.recipe });
    return steps;
  }
  let queue = r.run.map((c) => argsOf(c).slice(1));
  if (r.which) {
    const which = await ask(`Which component? (${r.which})`, 'all');
    if (which && which !== 'all') queue = queue.map((a) => [...a.filter((x) => !x.startsWith('--component')), `--component=${which.replace(/\s+/g, '')}`]);
  }
  for (let i = 0; i < MAX_STEPS && queue.length; i++) {
    let args = queue.shift();
    if (args.some((a) => /<[^>]+>/.test(a))) {
      args = await fillAsked(args, r, ask);
      if (!args) { print('Stopped: that step needs your answer.'); steps.push({ kind: 'stopped' }); return steps; }
    }
    print(`\n$ ${CLI} ${args.join(' ')}`);
    const { code, out } = await run(args);
    steps.push({ kind: 'run', args, code });
    const next = String(out).split('\n').filter((l) => /^NEXT:/.test(l)).pop();
    const step = nextStep(next, state?.cmd ?? CLI);
    if (step.kind === 'run' && i + 1 < MAX_STEPS) { queue.push(step.args); continue; }
    if (step.kind === 'person') { print(`\nYour call: ${plainWords(step.says)}`); steps.push({ kind: 'person', says: step.says }); }
    else if (step.kind === 'outside') { print(`\nNext, outside the engine: ${plainWords(step.says)}`); steps.push({ kind: 'outside', says: step.says }); }
    else steps.push({ kind: 'done' });
  }
  return steps;
}

// The request as a person types it, run from their terminal. → the exit code of the last step.
export async function terminalMain({ text, ROOT, engineDir, script }) {
  const { route, projectState } = await import('./route.mjs');
  const state = projectState(ROOT, { engineDir });
  const tty = !!process.stdin.isTTY;
  const recipeTitle = (name) => {
    for (const f of [join(engineDir, 'cookbook', `${name}.md`)]) {
      try { const h = /^#\s+(.+)$/m.exec(readFileSync(f, 'utf8')); if (h) return h[1].trim(); } catch { /* no recipe file */ }
    }
    return name;
  };
  // One question a prompt, the default shown. With no terminal to ask in, the default is taken, and none stops.
  const ask = (question, fallback = '') => new Promise((done) => {
    if (!tty) { console.log(`? ${plainWords(question)}${fallback ? ` [${fallback}]` : ''} (no terminal to ask in: ${fallback || 'stopped'})`); done(fallback); return; }
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(`? ${plainWords(question)}${fallback ? ` [${fallback}]` : ''} `, (a) => { rl.close(); done(a.trim() || fallback); });
  });
  // Each step's output shown as it comes, its own NEXT line kept for the session to act on rather than printed.
  let last = 0;
  const run = (args) => new Promise((done) => {
    const child = spawn(process.execPath, [script, ...args], { cwd: ROOT, stdio: ['inherit', 'pipe', 'inherit'], env: process.env });
    let out = '', buf = '';
    child.stdout.on('data', (d) => {
      out += d; buf += d;
      const lines = buf.split('\n'); buf = lines.pop();
      for (const l of lines) if (!/^NEXT:/.test(l)) process.stdout.write(l + '\n');
    });
    child.on('close', (code) => { if (buf && !/^NEXT:/.test(buf)) process.stdout.write(buf + '\n'); last = code ?? 1; done({ code: last, out }); });
  });
  await runSession({ text, state, route, recipeTitle, ask, run, print: (l) => console.log(l) });
  return last;
}
