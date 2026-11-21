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
import { spawn, spawnSync } from 'node:child_process';
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
// A step that reads Figma through an agent's own Figma tool: a terminal has none, so the person is told what to connect.
const FIGMA_TOOL = /\bfigma mcp\b|figma tool of this session|\buse_figma\b/i;
export const FIGMA_ASK = 'Apply these changes in Figma?';
export const FIGMA_HOW = 'This step reads Figma, and a terminal has no Figma tool of its own. Connect one the engine runs itself, then ask again: figma-cli with Figma Desktop open · Figma Console MCP set up in this project (.mcp.json) · FIGMA_TOKEN in .env, for what the Figma API gives (the variables and the components).';
// Code written from words: "Write the UI with these components…", "Build button as written above, then run…".
const WRITE = /^(write|build)\b.*?\b(then (run|check)|with these components)/i;
// The engine's check a write step names after it ("then run rms-design-system-engine --component button until it
// passes"): its arguments, or null when it holds a value only the person has.
function checkIn(says, cmd) {
  const after = /\bthen (?:run|check it with)\s+([\s\S]*)$/i.exec(says)?.[1];
  const args = after ? commandIn(after.replace(/\s+(until|and fix)\b[\s\S]*$/i, ''), cmd) : null;
  return args && args.length && !args.some((a) => /<[^>]+>/.test(a)) ? args : null;
}
export const HAND_ASK = (name) => `Hand this to ${name} to write?`;
export const NO_AGENT = 'Writing this code needs an agent, and none with the engine is set up on this computer: Claude Code, Codex or Cursor, set up with the engine (install.sh). Or write it yourself, then ask the engine to check it.';

// A step the engine cannot take from a terminal: a person's review elsewhere.
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
  if (FIGMA_TOOL.test(says)) {
    // A change to the design file the person says yes to first: the script the engine wrote, run once they do.
    const script = /only when (they|the person) say(s)? yes/i.test(says) ? /(\S*figma-apply\.js)\b/.exec(says)?.[1] ?? null : null;
    return script ? { kind: 'figma-write', says, script } : { kind: 'figma', says };
  }
  // Code to write from words (a component from its sheet, a page from the cards): an agent's step, or the person's.
  if (WRITE.test(says)) return { kind: 'write', says, check: checkIn(says, cmd) };
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
// A patch a step wrote for a person to apply (handback.mjs: "review, then git apply it"). → its path, or null.
export const patchIn = (out) => (/git apply/.test(String(out)) ? /(\S*handback\/[\w.-]+\.(?:diff|patch))\b/.exec(String(out))?.[1] ?? null : null);
// How many lines a patch changes: one is the one change a request can say yes to on its own.
export const patchChanges = (diff) => String(diff ?? '').split('\n').filter((l) => /^-(?!--)/.test(l)).length;
export const PATCH_ASK = 'Apply this patch to your code?';
// A request that asks for a change in the code itself ("fix it in the code", "corrige a altura no código"): a change it
// asks for in Figma, or a list of steps that never names the code, is no yes to a patch.
export const asksCodeChange = (text, asksForChange) => asksForChange(text) && /\b(in|no|na|em|to|ao)\s+(the\s+|our\s+|o\s+|nosso\s+)?(code|codebase|css|c[oó]digo)\b/i.test(text) && !/\b(in|on|no|na|em) figma\b/i.test(text);

// figma: { apply(script) → what Figma returned } when the engine can reach Figma itself (Figma Console MCP), else null.
// patch: { read(file) → the diff, apply(file) → { ok, said } } to apply a patch a step wrote, else null.
// asksForChange(text): whether the request itself asks for the change (guard.mjs), so the request is the yes.
// agent: { name, hand(text) → { code } } the agent installed with the engine that writes code from words, else null.
export async function runSession({ text, state, route, recipeTitle = (n) => n, ask, run, print, figma = null, patch = null, asksForChange = () => false, agent = null }) {
  const r = route(text, state);
  const steps = [];
  print(`→ ${recipeTitle(r.recipe)}`);
  for (const s of r.say ?? []) print(plainWords(s));
  if (!r.run.length) {
    // A how-to question: the recipe that answers it, in the engine's own words.
    const { out } = await run(['--recipe', r.recipe]);
    if (!String(out ?? '').trim()) print(`This one is answered by the recipe: ${CLI} --recipe ${r.recipe}`);
    steps.push({ kind: 'recipe', recipe: r.recipe });
    return steps;
  }
  // The command the router writes is the engine's name, or its full path where the name is not on the PATH
  // (node /…/audit.mjs): what follows it is the step's arguments.
  const cmd = state?.cmd ?? CLI;
  const stepArgs = (c) => argsOf(c.startsWith(cmd) ? c.slice(cmd.length) : c.replace(/^\S+/, ''));
  let queue = r.run.map(stepArgs);
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
    print(`\n$ ${cmd} ${args.join(' ')}`);   // what runs, as the person would type it: the engine's name, or its path
    const { code, out } = await run(args);
    steps.push({ kind: 'run', args, code });
    // A patch the step wrote: shown, and applied only on a yes. The request is that yes when it asked for this one change,
    // as Claude Code's guard reads it (asksForChange); a patch of more than one change is always asked about.
    const file = patch ? patchIn(out) : null;
    if (file) {
      const diff = patch.read(file);
      if (diff) {
        print(`\nThe patch (${file}):\n${diff.trimEnd()}`);
        const asked = asksCodeChange(text, asksForChange) && patchChanges(diff) === 1;
        const yes = asked || /^(y|yes|s|sim)$/i.test(String(await ask(PATCH_ASK, 'no')).trim());
        if (yes) {
          const r = patch.apply(file);
          print(r.ok ? `${asked ? 'You asked for this change: applied.' : 'Applied.'} Review it with git diff, and commit it when it is right.` : `The patch did not apply: ${r.said}`);
          steps.push({ kind: r.ok ? 'patch-applied' : 'patch-failed', file });
          if (r.ok) return steps;
        } else { print('Nothing was changed in your code.'); steps.push({ kind: 'patch-declined', file }); }
      }
    }
    const next = String(out).split('\n').filter((l) => /^NEXT:/.test(l)).pop();
    const step = nextStep(next, state?.cmd ?? CLI);
    if (step.kind === 'run' && i + 1 < MAX_STEPS) { queue.push(step.args); continue; }
    if (step.kind === 'figma-write') {
      // Asked first, as an agent asks: nothing reaches the design file without the person's yes.
      if (!figma) { print(`\n${FIGMA_ASK} ${FIGMA_HOW}`); steps.push({ kind: 'figma', says: step.says }); continue; }
      const yes = /^(y|yes|s|sim)$/i.test(String(await ask(FIGMA_ASK, 'no')).trim());
      if (!yes) { print('Nothing was changed in Figma.'); steps.push({ kind: 'figma-declined' }); continue; }
      try { print(String(await figma.apply(step.script))); }
      catch (e) { print(`Figma did not take the changes: ${e.message}`); steps.push({ kind: 'figma-failed' }); continue; }
      steps.push({ kind: 'figma-applied', script: step.script });
      if (i + 1 < MAX_STEPS) queue.push(['--refresh-figma']);
      continue;
    }
    // A question answered: the query's word on writing UI is for whoever writes it, and nobody asked for code.
    if (step.kind === 'write' && r.recipe === 'ask-the-system' && r.kind !== 'build-ui') { steps.push({ kind: 'done' }); continue; }
    if (step.kind === 'write') {
      // The request handed whole to the agent the person set up with the engine, which takes the same road with its
      // guide and hooks. The request is the yes when it asked for this code, as Claude Code's guard reads it.
      print(`\nNext: ${plainWords(step.says)}`);
      if (!agent) { print(NO_AGENT); steps.push({ kind: 'write', says: step.says }); continue; }
      const yes = asksForChange(text) || /^(y|yes|s|sim)$/i.test(String(await ask(HAND_ASK(agent.name), 'no')).trim());
      if (!yes) { print('Left for you to write.'); steps.push({ kind: 'write-declined' }); continue; }
      print(`Handed to ${agent.name}:`);
      const { code: handed } = await agent.hand(text);
      steps.push({ kind: 'handed', agent: agent.name, code: handed });
      // An agent that stopped (a usage limit, no login) is said so, never read as work done: the check below still runs.
      if (handed !== 0) print(`${agent.name} stopped before it finished (exit ${handed}): what it said is above. The engine checks what is there now.`);
      // Checked by the engine itself once the agent is done, whatever the agent said.
      if (step.check) { print(`\n$ ${cmd} ${step.check.join(' ')}`); const c = await run(step.check); steps.push({ kind: 'run', args: step.check, code: c.code }); }
      return steps;
    }
    if (step.kind === 'figma') { print(`\n${FIGMA_HOW}`); steps.push({ kind: 'figma', says: step.says }); }
    else if (step.kind === 'person') { print(`\nYour call: ${plainWords(step.says)}`); steps.push({ kind: 'person', says: step.says }); }
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
    const child = spawn(process.execPath, [script, ...args], { cwd: ROOT, stdio: ['inherit', 'pipe', 'inherit'], env: { ...process.env, DESIGN_SYSTEM_ENGINE_SESSION: 'terminal' } });
    let out = '', buf = '';
    child.stdout.on('data', (d) => {
      out += d; buf += d;
      const lines = buf.split('\n'); buf = lines.pop();
      for (const l of lines) if (!/^NEXT:/.test(l)) process.stdout.write(l + '\n');
    });
    child.on('close', (code) => { if (buf && !/^NEXT:/.test(buf)) process.stdout.write(buf + '\n'); last = code ?? 1; done({ code: last, out }); });
  });
  // Figma reached by the engine itself, where this project set Figma Console MCP up: the one way a terminal writes Figma.
  const figma = await figmaWriter(ROOT);
  // A patch is applied as a person applies it, with git apply, in this project only.
  const patch = {
    read: (file) => { try { return readFileSync(resolve(ROOT, file), 'utf8'); } catch { return null; } },
    apply: (file) => {
      const r = spawnSync('git', ['apply', resolve(ROOT, file)], { cwd: ROOT, encoding: 'utf8' });
      return { ok: r.status === 0, said: String(r.stderr || r.stdout || '').trim() };
    },
  };
  const { asksForChange } = await import('./guard.mjs');
  const agent = handAgent({ ROOT });
  await runSession({ text, state, route, recipeTitle, ask, run, print: (l) => console.log(l), figma, patch, asksForChange, agent });
  return last;
}

// → { apply(script) } when Figma Console MCP is set up in the project and not switched off, else null. The script is
// the one the engine wrote (figma-edits.mjs), run in the design system's file.
async function figmaWriter(ROOT) {
  const fc = await import('./figma-console.mjs');
  if (fc.figmaConsoleOff(process.env) || !fc.findFigmaConsole(ROOT)) return null;
  let cfg = {};
  try { cfg = JSON.parse(readFileSync(join(ROOT, 'ds-config.json'), 'utf8')); } catch { /* no config: the file active in Figma */ }
  return {
    async apply(script) {
      const code = readFileSync(resolve(ROOT, script), 'utf8');
      const runner = await fc.figmaConsoleRunner(ROOT, cfg);
      let said;
      try { said = await runner.run(code); } finally { runner.close(); }
      // The way back, written from what the run reported, as the guard writes it after an agent's run (noteFigmaRun).
      const { noteFigmaRun } = await import('./guard.mjs');
      let response = said;
      try { response = JSON.parse(said); } catch { /* a plain answer */ }
      const back = noteFigmaRun({ tool_name: 'use_figma', tool_input: { code }, tool_response: response }, { root: ROOT, cfg });
      return ['Figma took the changes.', ...(back ?? []).map(plainWords)].join('\n');
    },
  };
}

// The agents a terminal hands code to, each as install.sh sets it up with the engine: the program, whether the engine is
// installed for it, and how it is asked one request (its own guide and hooks on, as the person has them). Asked in
// this order. DESIGN_SYSTEM_ENGINE_AGENT names one (claude, codex, cursor) or none. Never one the engine installed.
const SKILL_ASK = { claude: '/', codex: '$' };
export const AGENTS = [
  { id: 'claude', name: 'Claude Code', bin: 'claude', installed: ({ home }) => existsSync(join(home, '.claude', 'skills', CLI)) || existsSync(join(home, '.claude', 'commands', `${CLI}.md`)),
    args: (text) => ['-p', `${SKILL_ASK.claude}${CLI} ${text}`, '--permission-mode', 'acceptEdits', '--allowedTools', `Bash(${CLI}:*) Bash(node:*) Read Edit Write Glob Grep`] },
  { id: 'codex', name: 'Codex', bin: 'codex', installed: ({ env, home }) => existsSync(join(env.CODEX_HOME || join(home, '.codex'), 'skills', CLI, 'SKILL.md')),
    args: (text) => ['exec', '--skip-git-repo-check', '--approve-for-me', `${SKILL_ASK.codex}${CLI} ${text}`] },
  { id: 'cursor', name: 'Cursor', bin: 'cursor-agent', installed: ({ ROOT }) => { try { return readFileSync(join(ROOT, 'AGENTS.md'), 'utf8').includes(CLI); } catch { return false; } },
    args: (text) => ['-p', '--force', text] },
];
const onPath = (bin, env) => (env.PATH ?? '').split(process.platform === 'win32' ? ';' : ':').filter(Boolean).map((d) => join(d, process.platform === 'win32' ? `${bin}.cmd` : bin)).find((f) => existsSync(f)) ?? null;
// → { name, hand(text) } or null. A session an agent started itself never hands back (DESIGN_SYSTEM_ENGINE_HANDED).
export function handAgent({ ROOT, env = process.env, home = env.HOME || env.USERPROFILE || '', found = onPath, start = spawn } = {}) {
  if (env.DESIGN_SYSTEM_ENGINE_HANDED === '1') return null;
  const named = env.DESIGN_SYSTEM_ENGINE_AGENT;
  if (named === 'none') return null;
  for (const a of AGENTS.filter((x) => !named || x.id === named)) {
    const bin = found(a.bin, env);
    if (!bin || !a.installed({ ROOT, env, home })) continue;
    return {
      name: a.name,
      args: a.args,
      hand: (text) => new Promise((done) => {
        const child = start(bin, a.args(text), { cwd: ROOT, stdio: ['ignore', 'inherit', 'inherit'], env: { ...env, DESIGN_SYSTEM_ENGINE_HANDED: '1' }, shell: process.platform === 'win32' });
        child.on('close', (code) => done({ code: code ?? 1 }));
        child.on('error', () => done({ code: 1 }));
      }),
    };
  }
  return null;
}
