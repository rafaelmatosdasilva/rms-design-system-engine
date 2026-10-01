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
//     apply passes when that message asks for a change, and asks first when it does not.
// As a UserPromptSubmit hook (I56), a request made with /rms-design-system-engine is routed by the engine before
// the agent reads it: the route, the exact command and the sentences to say arrive with the request, so
// picking them is never the agent's decision, even when it skips the router.
// As a PostToolUse hook (I62), a UI edit is checked when it is made: what it added that the design system does
// not have goes back to the agent with the right name (edit-check.mjs). "editCheck": false turns that part off.
// Anything else, or any project without a ds-config.json, or one with "hooks": false, passes untouched.
// The engine's own writes (node … audit.mjs, rms-design-system-engine) are never blocked.
import { readFileSync, existsSync } from 'node:fs';
import { join, basename, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { route, routeText, projectState } from './route.mjs';
import { readDoc } from './skill-files.mjs';
import { editCheck, editHookOutput } from './edit-check.mjs';
import { PROJECT } from './names.mjs';

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
    if (e.type !== 'user' || e.message?.role !== 'user') continue;
    const c = e.message.content;
    const text = typeof c === 'string' ? c : Array.isArray(c) ? c.filter((x) => x?.type === 'text').map((x) => x.text).join('\n') : '';
    if (text.trim()) last = text;
  }
  return last;
}

// The files where the system's decisions are recorded (I73), under the new names and the old ones. 'agreed' is
// written by the engine only; the others change when the person asks.
const ACCEPT_ASKED = /\baccept|known (debt|difference)|as debt|d[ií]vida|aceit|\bbaseline|ratchet|lock (it |them )?in/i;   // the router's accept-debt words, or the baseline named
const EXCEPTION_ASKED = /\b(exception|exempt|ignore|skip|mapping|map|exce[çc][õoã]|isen[çc]|ignor|mapa|mapeamento)\w*/i;
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
  exceptions: { asked: EXCEPTION_ASKED, reason: (f) => `${f} holds the system's exception lists: adding to them hides a finding instead of fixing it. Confirm the person asked for this exception, or fix what the audit reports.` },
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
    if (engine && /(^|\s)--baseline\b/.test(cmd) && userText !== null && !ACCEPT_ASKED.test(userText)) return { decision: 'ask', reason: DECISION.debt.reason('The baseline') };
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
      const out = promptOutput(routePrompt(event, { root, cfg }));
      if (out) process.stdout.write(out);
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
