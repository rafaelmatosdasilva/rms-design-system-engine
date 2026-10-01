#!/usr/bin/env node
// guard.mjs - the skill's never-rules as a Claude Code PreToolUse hook (idea I55), so they hold every time
// instead of depending on an agent remembering a paragraph.
//
// Installed per project by `rms-design-system-engine --install-hooks` (and by --init), in
// .claude/settings.local.json. It reads the tool call Claude Code is about to make (JSON on stdin) and:
//   • denies editing a Figma snapshot by hand: they come from the capture, never from a hand edit;
//   • asks the person before editing ds-config.json, committing, pushing, or applying the hand-back patch;
//   • keeps the records of the system's decisions for the person (I73): what was accepted as debt, the exception
//     lists and the approved reference pictures (replaced or deleted; a new one is not yet approved) change only
//     when the person's latest message asks for it, and the record of what both sides last agreed on is the
//     engine's alone, so an agent never makes a check pass by accepting its own differences;
//   • reads the person's latest message (the hook's transcript_path, idea I56): a code edit or the hand-back
//     apply passes when that message asks for a change, and asks first when it does not. A request made with a
//     command is its words after the command, never the guide Claude Code expands it into.
// As a Stop hook (I81), when the route gave sentences the person has to hear (the Figma snapshots were not
// refreshed, this skill does not change Figma) and the agent's last reply leaves them out, it sends the agent back
// once to add them.
// As a UserPromptSubmit hook (I56), a request made with /rms-design-system-engine is routed by the engine before
// the agent reads it: the route, the exact command and the sentences to say arrive with the request, so
// picking them is never the agent's decision, even when it skips the router.
// As a PostToolUse hook (I62), a UI edit is checked when it is made: what it added that the design system does
// not have goes back to the agent with the right name (edit-check.mjs). "editCheck": false turns that part off.
// Anything else, or any project without a ds-config.json, or one with "hooks": false, passes untouched.
// The engine's own writes (node … audit.mjs, rms-design-system-engine) are never blocked.
import { readFileSync, existsSync, writeFileSync, mkdirSync, unlinkSync } from 'node:fs';
import { join, basename, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { route, routeText, projectState, SAY } from './route.mjs';
import { readDoc } from './skill-files.mjs';
import { editCheck, editHookOutput } from './edit-check.mjs';
import { PROJECT, OUT_DIR } from './names.mjs';

const ENGINE = dirname(fileURLToPath(import.meta.url));

const SNAPSHOT = /figma-[\w.-]*\.snapshot\.json/;
const EDIT_TOOLS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit']);

const CODE = /\.(css|scss|sass|less|js|jsx|mjs|cjs|ts|tsx|vue|svelte|html?)$/i;
// A message that asks for a change: a change verb, and not a how/why question about one.
// Only the form that asks: "the design changed" or "o design mudou" describes, it does not ask for a change.
const CHANGE = /\b(fix|correct|change|update|apply|edit|set|repair|rename|replace|remove|add|make|corrig(e|ir|a)|corrij(a|am)|consert(a|ar|e)|mud(a|ar|e)|alter(a|ar|e)|aplic(a|ar|que)|atualiz(a|ar|e)|repar(a|ar|e)|substitu(i|ir|a)|remov(e|er|a)|acrescent(a|ar|e)|p[oõ]e|p[oô]r|coloc(a|ar|que))\b/i;
const ASKING_HOW = /^\s*(how|why|what|where|which|can i|should i|como|porqu|o que|onde|qual|posso)\b/i;
export function asksForChange(text) {
  const t = String(text ?? '').trim();
  return CHANGE.test(t) && !ASKING_HOW.test(t);
}

// The person's latest message in a Claude Code transcript (JSONL): the last user entry with text, not a tool
// result. null when there is no transcript to read (then the message-based rules do not apply).
export function lastUserText(transcriptPath) {
  if (!transcriptPath || !existsSync(transcriptPath)) return null;
  let last = null;
  for (const line of readFileSync(transcriptPath, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    let e; try { e = JSON.parse(line); } catch { continue; }
    // isMeta: what Claude Code adds itself (a command's guide, "already loaded"), never what the person typed.
    if (e.type !== 'user' || e.message?.role !== 'user' || e.isMeta) continue;
    const c = e.message.content;
    const text = typeof c === 'string' ? c : Array.isArray(c) ? c.filter((x) => x?.type === 'text').map((x) => x.text).join('\n') : '';
    // A command (/rms-design-system-engine audit the chip): the person's words are its arguments.
    if (/<command-name>[^<]*<\/command-name>/.test(text)) { last = /<command-args>([\s\S]*?)<\/command-args>/.exec(text)?.[1]?.trim() ?? ''; continue; }
    if (text.trim()) last = text;
  }
  return last;
}

// The agent's last reply in the transcript, and whether it used a Figma tool in this session.
function transcriptEntries(transcriptPath) {
  if (!transcriptPath || !existsSync(transcriptPath)) return [];
  return readFileSync(transcriptPath, 'utf8').split('\n').filter((l) => l.trim()).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
}
const assistantBlocks = (entries) => entries.filter((e) => e.type === 'assistant').flatMap((e) => (Array.isArray(e.message?.content) ? e.message.content : []));
export function figmaToolUsed(transcriptPath) {
  return assistantBlocks(transcriptEntries(transcriptPath)).some((b) => b?.type === 'tool_use' && /figma/i.test(String(b.name ?? '')));
}

// What the person has to hear when the route gave a SAY line (I81): the reply says it, in the line's words or its
// own. Checked by meaning, not by the exact sentence.
const SAID = {
  figma: {
    test: /(can['’]?t|cannot|can not|won['’]?t|will not|do(es)?\s?n['’]?o?t|never)\s+(change|edit|modify|write to|update|touch)\b[^.]{0,40}\bfigma\b|\bonly reads (it|figma)\b|\bread-only\b/i,
    what: 'that this skill does not change Figma',
  },
  noRefresh: {
    test: /(could\s?n['’]?t|could not|cannot|can['’]?t|unable to|did\s?n['’]?t|did not|was\s?n['’]?t|were\s?n['’]?t|not able to)\s+(be\s+)?(refresh|re-?capture)|\bnot\s+(been\s+)?(refreshed|re-?captured)\b|\bno figma (tool|access|connection|token)\b|\bwithout (a |any )?figma (tool|access|connection)\b/i,
    what: 'that the Figma snapshots were not refreshed in this run',
    unless: (transcriptPath) => figmaToolUsed(transcriptPath),   // it did refresh: the line is not true
  },
};
export const sayKind = (line) => (line === SAY.figma ? 'figma' : /^I couldn't refresh the Figma snapshots/.test(line) ? 'noRefresh' : null);
const saidFile = (root) => join(root, OUT_DIR, 'said.json');

// The UserPromptSubmit side: the sentences this prompt's route asks for, kept for the Stop check (or cleared).
export function rememberSay(root, event, say = []) {
  const file = saidFile(root);
  const lines = say.map((text) => ({ text, check: sayKind(text) })).filter((x) => x.check);
  try {
    if (lines.length) { mkdirSync(dirname(file), { recursive: true }); writeFileSync(file, JSON.stringify({ session: event.session_id ?? null, prompt: event.prompt_id ?? null, say: lines }, null, 2) + '\n'); }
    else if (existsSync(file)) unlinkSync(file);
  } catch { /* the check is a help, never a blocker */ }
}

// The Stop side: the reason to send the agent back, or null. Once only (stop_hook_active), and only for the prompt
// whose route asked for the lines.
export function stopCheck(event, { root }) {
  if (event?.stop_hook_active) return null;
  let said; try { said = JSON.parse(readFileSync(saidFile(root), 'utf8')); } catch { return null; }
  if (!said?.say?.length) return null;
  if (said.session && event.session_id && said.session !== event.session_id) return null;
  if (said.prompt && event.prompt_id && said.prompt !== event.prompt_id) return null;
  const reply = String(event.last_assistant_message ?? '') || assistantBlocks(transcriptEntries(event.transcript_path)).filter((b) => b?.type === 'text').map((b) => b.text).pop() || '';
  const missing = said.say.filter((s) => SAID[s.check] && !SAID[s.check].test.test(reply) && !SAID[s.check].unless?.(event.transcript_path));
  if (!missing.length) return null;
  return `rms-design-system-engine: your reply leaves out ${missing.map((s) => SAID[s.check].what).join(' and ')}. Reply again with your whole answer and ${missing.length > 1 ? 'these lines' : 'this line'} in it, word for word:\n${missing.map((s) => s.text).join('\n')}`;
}
export const stopOutput = (reason) => (reason ? JSON.stringify({ decision: 'block', reason }) : '');

// The files where the system's decisions are recorded (I73), under the new names and the old ones. 'agreed' is
// written by the engine only; the others change when the person asks.
const ACCEPT_ASKED = /\baccept|known (debt|difference)|as debt|d[ií]vida|aceit|\bbaseline|ratchet|lock (it |them )?in/i;   // the router's accept-debt words, or the baseline named
const EXCEPTION_ASKED = /\b(exception|exempt|ignore|skip|mapping|map|exce[çc][õoã]|isen[çc]|ignor|mapa|mapeamento|set ?up|configur|install|init)\w*/i;   // setting the project up writes the map too
const PICTURE_ASKED = /\b(approve|accept|update|aprov|aceit|atualiz)\w*\b[\s\S]{0,60}\b(pictures?|images?|screenshots?|references?|imagem|imagens|refer[eê]ncias?|capturas?)\b|\b(pictures?|images?|screenshots?|references?|imagem|imagens|refer[eê]ncias?|capturas?)\b[\s\S]{0,60}\b(approve|accept|update|aprov|aceit|atualiz)\w*/i;
export function decisionFile(path, cfg = {}) {
  const p = String(path ?? '').replace(/\\/g, '/'), b = basename(p);
  if ([PROJECT.baseline.now, PROJECT.baseline.old, cfg.baseline?.path && basename(cfg.baseline.path)].includes(b)) return 'debt';
  if (b === PROJECT.agreed.now || b === PROJECT.agreed.old) return 'agreed';
  if (b === PROJECT.map.now || b === PROJECT.map.old) return 'exceptions';
  const refs = [cfg.visualRefs, PROJECT.refs.now, PROJECT.refs.old].filter(Boolean).map((d) => String(d).replace(/^\.?\/+|\/+$/g, ''));
  if (refs.some((d) => p === d || p.endsWith(`/${d}`) || p.startsWith(`${d}/`) || p.includes(`/${d}/`))) return 'pictures';   // the folder itself too
  return null;
}
const DECISION = {
  debt: { asked: ACCEPT_ASKED, reason: (f) => `${f} is what the person accepted as debt: an agent never accepts its own differences. When the person asks to accept one, run rms-design-system-engine --baseline --findings --match <what they named>; otherwise report the difference and leave it failing.` },
  exceptions: { asked: EXCEPTION_ASKED, reason: (f) => `${f} holds the names the audit cannot work out and the system's exceptions: an entry added there can hide a finding instead of fixing it. Confirm the person asked for this change to it, or fix what the audit reports.` },
  pictures: { asked: PICTURE_ASKED, reason: (f) => `${f} is an approved reference picture: it changes only when a person approves the new one. Report the difference, or confirm the person approved it.` },
};
const decisionVerdict = (kind, file, userText) => {
  if (kind === 'agreed') return { decision: 'deny', reason: `${basename(file)} is the engine's record of what Figma and the code last agreed on: only the audit writes it. Run the audit instead.` };
  const d = DECISION[kind];
  return userText !== null && d.asked.test(userText) ? null : { decision: 'ask', reason: d.reason(basename(file)) };
};

// The files a shell command writes, moves or deletes: a redirect, tee, sed -i, perl -i, rm, mv (both ends), cp
// (the copy), git rm and git mv. Reading is never a write.
export function shellTargets(cmd) {
  const out = [...String(cmd ?? '').matchAll(/>{1,2}\s*(['"]?)([^\s'";|&>]+)\1/g)].map((m) => m[2]);
  for (const seg of String(cmd ?? '').split(/\|\||&&|[|;&\n]/)) {
    const w = [...seg.replace(/\d*>{1,2}\s*\S+/g, ' ').matchAll(/(['"])(.*?)\1|(\S+)/g)].map((m) => m[2] ?? m[3]);
    while (w.length && (/^\w+=/.test(w[0]) || w[0] === 'sudo')) w.shift();
    if (w[0] === 'git' && (w[1] === 'rm' || w[1] === 'mv')) w.shift();
    const [c, ...args] = w;
    const files = args.filter((a) => !a.startsWith('-'));
    if (['tee', 'rm', 'mv', 'unlink', 'truncate'].includes(c)) out.push(...files);
    else if (c === 'cp' && files.length) out.push(files[files.length - 1]);
    else if ((c === 'sed' && args.some((a) => /^(-[a-zA-Z]*i|--in-place)/.test(a))) || (c === 'perl' && args.some((a) => /^-[a-zA-Z]*i/.test(a)))) out.push(...files);
  }
  return out;
}

// { decision: 'deny' | 'ask', reason } or null to pass. userText: the person's latest message, or null.
export function judge(event, { cfg = {}, userText = null } = {}) {
  if (cfg.hooks === false) return null;
  const tool = event?.tool_name, input = event?.tool_input ?? {};
  const snapshotPaths = new Set(Object.entries(cfg.paths ?? {}).filter(([k, v]) => /^snapshot|Snapshot$/.test(k) && typeof v === 'string').map(([, v]) => basename(v)));
  const isSnapshot = (p) => SNAPSHOT.test(basename(String(p ?? ''))) || snapshotPaths.has(basename(String(p ?? '')));
  if (EDIT_TOOLS.has(tool)) {
    const file = input.file_path ?? input.notebook_path ?? input.path;
    if (isSnapshot(file)) return { decision: 'deny', reason: `${basename(file)} is written by the Figma capture, never by hand (a hand edit fakes a refresh). Refresh it with the capture (rms-design-system-engine --recipe refresh-figma), or leave it stale and say so.` };
    if (basename(String(file ?? '')) === 'ds-config.json') return { decision: 'ask', reason: 'ds-config.json is the project\'s parity setup. Confirm this edit is what you asked for (guidelines links go through rms-design-system-engine --guidelines, never a hand edit).' };
    const kind = decisionFile(file, cfg);
    if (kind && !(kind === 'pictures' && !existsSync(resolve(event.cwd ?? process.cwd(), String(file))))) return decisionVerdict(kind, file, userText);   // a new picture is not an approved one
    if (userText !== null && CODE.test(String(file ?? '')) && !asksForChange(userText)) return { decision: 'ask', reason: `The person's last message does not ask for a change to ${basename(file)}. Report the fix the audit names instead of making it, or confirm they asked for it.` };
    return null;
  }
  if (tool === 'Bash') {
    const cmd = String(input.command ?? '');
    const engine = /^\s*(node\s+\S*audit\.mjs|rms-design-system-engine)\b/.test(cmd);
    if (!engine && SNAPSHOT.test(cmd) && (/(>|>>)\s*\S*figma-[\w.-]*\.snapshot\.json/.test(cmd) || /\b(sed\s+(-[a-zA-Z]*i|--in-place)|perl\s+-[a-zA-Z]*i|tee)\b/.test(cmd) || /\b(cp|mv)\s+\S+\s+\S*figma-[\w.-]*\.snapshot\.json/.test(cmd))) {
      return { decision: 'deny', reason: 'Figma snapshots are written by the capture, never by a shell edit. Refresh them with the capture (rms-design-system-engine --recipe refresh-figma).' };
    }
    // Accepting debt is the person's decision, even through the engine: --baseline runs when they asked for it.
    if (/(^|[\s;&|(])(node\s+\S*audit\.mjs|rms-design-system-engine)\b[^|;&\n]*\s--baseline\b/.test(cmd) && userText !== null && !ACCEPT_ASKED.test(userText)) return { decision: 'ask', reason: DECISION.debt.reason('The baseline') };
    // A shell write, copy, move or delete of a decision file (the approved picture copied over, the debt rewritten).
    for (const f of shellTargets(cmd)) {
      const kind = decisionFile(f, cfg);
      if (!kind || (kind === 'pictures' && !existsSync(resolve(event.cwd ?? process.cwd(), f)))) continue;   // a new picture is not an approved one
      const v = decisionVerdict(kind, f, userText);
      if (v) return v;
    }
    if (/\bgit\b[^|;&\n]*\spush\b/.test(cmd)) return { decision: 'ask', reason: 'Pushing sends the work to the remote. Confirm the person asked for a push.' };
    if (/\bgit\b[^|;&\n]*\scommit\b/.test(cmd)) return { decision: 'ask', reason: 'Committing records the change. Confirm the person asked for a commit.' };
    if (/\bgit\b[^|;&\n]*\sapply\b/.test(cmd) && /handback|code-changes\.diff/.test(cmd) && !(userText !== null && asksForChange(userText))) return { decision: 'ask', reason: 'The hand-back patch is only applied when the person asks. Confirm they did.' };
  }
  return null;
}

// The route for a request made with the skill's command, as context for the agent; null for any other prompt.
const COMMAND = /^\s*\/rms-design-system-engine\b[ \t]*([\s\S]*)$/;
export const MAX_RECIPE = 6000;
export function routePrompt(event, { root, engineDir = ENGINE, cfg = {}, env = process.env } = {}) {
  if (cfg.hooks === false) return null;
  const text = String(event?.prompt ?? '').match(COMMAND)?.[1]?.trim();
  if (!text) return null;
  const state = projectState(root, { engineDir, env });
  const r = route(text, state);
  rememberSay(root, event, r.say);
  let recipe = '';
  try { recipe = readDoc(engineDir, 'recipe', r.recipe) ?? ''; } catch { /* the pointer line still names it */ }
  return `The engine already routed this request (rms-design-system-engine's project hook); follow it and do not run --route again.\n${routeText(r, recipe, state.cmd, { maxRecipe: MAX_RECIPE })}`;
}

export function promptOutput(context) {
  if (!context) return '';
  return JSON.stringify({ hookSpecificOutput: { hookEventName: 'UserPromptSubmit', additionalContext: context } });
}

export function hookOutput(verdict) {
  if (!verdict) return '';
  return JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: verdict.decision, permissionDecisionReason: `rms-design-system-engine: ${verdict.reason}` } });
}

// As a hook: stdin → stdout, always exit 0 (a broken guard must never block work; --doctor reports it).
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('guard.mjs')) {
  let raw = '';
  try { raw = readFileSync(0, 'utf8'); } catch { /* no input */ }
  try {
    const event = JSON.parse(raw || '{}');
    const root = resolve(event.cwd ?? process.cwd());
    const cfgPath = join(root, 'ds-config.json');
    if (event.hook_event_name === 'UserPromptSubmit') {
      let cfg = {};
      try { cfg = JSON.parse(readFileSync(cfgPath, 'utf8')); } catch { /* no or broken config: route it anyway (setup) */ }
      const context = routePrompt(event, { root, cfg });
      if (!context) rememberSay(root, event, []);   // a new message the router did not take: nothing left to say
      const out = promptOutput(context);
      if (out) process.stdout.write(out);
    } else if (event.hook_event_name === 'Stop') {
      let cfg = {};
      try { cfg = JSON.parse(readFileSync(cfgPath, 'utf8')); } catch { /* defaults */ }
      if (cfg.hooks !== false) { const out = stopOutput(stopCheck(event, { root })); if (out) process.stdout.write(out); }
    } else if (event.hook_event_name === 'PostToolUse') {
      if (existsSync(cfgPath)) {
        let cfg = {};
        try { cfg = JSON.parse(readFileSync(cfgPath, 'utf8')); } catch { /* defaults */ }
        const out = editHookOutput(editCheck(event, { root, cfg }));
        if (out) process.stdout.write(out);
      }
    } else if (existsSync(cfgPath)) {
      let cfg = {};
      try { cfg = JSON.parse(readFileSync(cfgPath, 'utf8')); } catch { /* a broken config still gets the default rules */ }
      const out = hookOutput(judge(event, { cfg, userText: lastUserText(event.transcript_path) }));
      if (out) process.stdout.write(out);
    }
  } catch { /* pass */ }
  process.exit(0);
}
