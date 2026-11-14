#!/usr/bin/env node
// guard.mjs - the skill's never-rules as a Claude Code PreToolUse hook, so they hold every time
// instead of depending on an agent remembering a paragraph.
//
// Installed per project by `rms-design-system-engine --install-hooks` (and by --init), in
// .claude/settings.local.json. It reads the tool call Claude Code is about to make (JSON on stdin) and:
//   • denies editing a Figma snapshot by hand: they come from the capture, never from a hand edit;
//   • asks the person before editing ds-config.json, committing, pushing, applying the hand-back patch, or writing the
//     engine's rules into an agent's instruction file;
//   • holds an edit that adds to the design system itself (a token in the theme, an option on a component) until a named
//     person signed it off (sign-off.mjs, --sign-off), and asks before a sign-off the person did not give. It says why
//     the edit is shared and who decides it (local-shared.mjs, ds-config.json owners), and writes down the session that
//     made it, so that session never signs it off (a second reviewer, second-review.mjs);
//   • keeps the records of the system's decisions for the person: what was accepted as debt, the exception
//     lists and the approved reference pictures (replaced or deleted; a new one is not yet approved) change only
//     when the person's latest message asks for it, and the record of what both sides last agreed on is the
//     engine's alone, so an agent never makes a check pass by accepting its own differences;
//   • reads the person's latest message (the hook's transcript_path): a code edit or the hand-back
//     apply passes when that message asks for a change, and asks first when it does not. A request made with a
//     command is its words after the command, never the guide Claude Code expands it into.
// As a Stop hook, when the route gave sentences the person has to hear (the Figma snapshots were not
// refreshed, this skill does not change Figma) and the agent's last reply leaves them out, it sends the agent back
// once to add them.
// As a UserPromptSubmit hook, a request made with /rms-design-system-engine is routed by the engine before
// the agent reads it: the route, the exact command and the sentences to say arrive with the request, so
// picking them is never the agent's decision, even when it skips the router.
// As a PostToolUse hook, after the engine's own script wrote to Figma, the way back from that change is written from
// what the run itself reported (figma-undo.mjs): only the script could see what each value was before it changed it,
// so the record comes from the tool's own answer and never from an agent retyping it. The way back then runs like the
// change did, through use_figma, and only after the person says yes.
// As a PostToolUse hook, a UI edit is checked when it is made: what it added that the design system does
// not have goes back to the agent with the right name (edit-check.mjs). "editCheck": false turns that part off. The
// lines the agent wrote and what the check found are kept (lessons.mjs): a line a person later changes is a correction
// to confirm, and a finding made again and again becomes a proposed rule.
// Anything else, or any project without a ds-config.json, or one with "hooks": false, passes untouched.
// The engine's own writes (node … audit.mjs, rms-design-system-engine) are never blocked.
import { readFileSync, existsSync, writeFileSync, mkdirSync, unlinkSync } from 'node:fs';
import { join, basename, resolve, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { route, routeText, projectState, SAY, PROTOTYPE, STEP_LIST } from './route.mjs';
import { additionsOf, signedOff, SIGN_OFFS, HELD, recordHeld, reviewMode, themeFiles, contractsByFile, declaredValues } from './sign-off.mjs';
import { editScope, usageFrom } from './local-shared.mjs';
import { readDoc } from './skill-files.mjs';
import { editCheck, editCheckRun, editHookOutput, sessionLeftovers, editTruth } from './edit-check.mjs';
import { colorHex } from './css-values.mjs';
import { undoSteps, writeUndo, undoLines } from './figma-undo.mjs';
import { PROJECT, OUT_DIR } from './names.mjs';
import { agentSteps as agentStepsOf } from './lessons.mjs';

const ENGINE = dirname(dirname(fileURLToPath(import.meta.url)));   // the engine's folder: its modules are in lib/

const SNAPSHOT = /figma-[\w.-]*\.snapshot\.json/;
const EDIT_TOOLS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit']);

const CODE = /\.(css|scss|sass|less|js|jsx|mjs|cjs|ts|tsx|vue|svelte|html?)$/i;
// A message that asks for a change: a change verb, and not a how/why question about one.
// Only the form that asks: "the design changed" or "o design mudou" describes, it does not ask for a change.
const CHANGE = /\b(fix|correct|change|update|apply|edit|set|repair|rename|replace|remove|add|make|build|create|implement|write|generate|constr[oó]i\w*|cri(a|ar|e)|implement(a|ar|e)|escrev(e|er|a)|ger(a|ar|e)|corrig(e|ir|a)|corrij(a|am)|consert(a|ar|e)|mud(a|ar|e)|alter(a|ar|e)|aplic(a|ar|que)|atualiz(a|ar|e)|repar(a|ar|e)|substitu(i|ir|a)|remov(e|er|a)|acrescent(a|ar|e)|p[oõ]e|p[oô]r|coloc(a|ar|que))\b/i;
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

// What the person has to hear when the route gave a SAY line: the reply says it, in the line's words or its
// own. Checked by meaning, not by the exact sentence.
const SAID = {
  figma: {
    test: /(can['’]?t|cannot|can not|won['’]?t|will not|do(es)?\s?n['’]?o?t|never)\s+(change|edit|modify|write to|update|touch)\b[^.]{0,40}\bfigma\b|\bonly reads (it|figma)\b|\bread-only\b/i,
    what: 'that this skill does not change Figma',
  },
  noVariable: {
    test: /\b(no|not a|without( a)?|lacks?( a)?|has no|have no|isn['’]?t a|is not a)\s+(design[- ]system\s+)?(variable|token)s?\b|\bnot (bound to|in) (a |any )?(variable|token)/i,
    what: 'that Figma paints this component with colours the design system has no variable for',
  },
  noRefresh: {
    test: /(could\s?n['’]?t|could not|cannot|can['’]?t|unable to|did\s?n['’]?t|did not|was\s?n['’]?t|were\s?n['’]?t|not able to)\s+(be\s+)?(refresh|re-?capture)|\bnot\s+(been\s+)?(refreshed|re-?captured)\b|\bno figma (tool|access|connection|token)\b|\bwithout (a |any )?figma (tool|access|connection)\b/i,
    what: 'that the Figma snapshots were not refreshed in this run',
    unless: (transcriptPath) => figmaToolUsed(transcriptPath),   // it did refresh: the line is not true
  },
};
export const sayKind = (line) => (line === SAY.figma ? 'figma' : /^I couldn't refresh the Figma snapshots/.test(line) ? 'noRefresh' : /^Figma paints .* with colours that have no variable/.test(line) ? 'noVariable' : null);
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
// A reply that asks the person for a secret (a token, a key, a password) in the chat. A design token named in a
// question ("which colour token") is not one, nor a line that sends the secret to .env or says never to paste it.
export function asksForSecret(text) {
  return String(text ?? '').split(/(?<=[.!?\n])\s+/).some((s) =>
    /\b(paste|share|send|give|provide|tell)\b[^.]{0,40}((?<!\b(?:colou?r|fill|design|spacing|size|radius|radii|typography|text|font|semantic|primitive|surface|border|shadow|motion|theme|green|red|blue|positive|negative|success|warning|danger|error|brand)[\s/-]{1,2})(?<!--[\w-]+`?\s)token|api key|access key|password|secret)\b(?!\s+values?\b)/i.test(s)
    && !/\b(never|not|don['’]t|do not|won['’]t|will not|no need|without)\b|n['’]t ask/i.test(s)
    && !/\b[\w-]+\/token\b|\btoken\s+(name\s+)?to use\b|\b(which|what)\s+([\w-]+\s+)?token\b/i.test(s)
    // "Once you provide the color, I'll add it as a new token": a colour asked for, a design token added, not a secret
    // "Once you provide that, I'll add the token": a design token the agent adds, not one it asks for
    && !(/\b(paste|share|send|give|provide|tell)\b\s+(me\s+)?(the|a|your)?\s*(colou?r|hex|shade|green|red|blue)\b|\b(a|as a|the)\s+new\s+token\b|\bI['’]?ll\s+(add|create|write|declare)\b[^.]{0,30}\btoken\b|\btoken\s+(to|in)\s+the\s+(design system|system|theme)\b/i.test(s)
      && !/\b(api|access|personal|auth|figma|gitlab|github)\s+(token|key)\b|\byour\s+token\b|\bpassword\b|\bsecret\b/i.test(s))
    && !/\.env\b|\benv(ironment)? var|\bexport\s+[A-Z_]+|\b(give|send|tell|provide|show|share with) you\b/i.test(s));
}
const SECRET_LINE = 'A secret is never asked for in the chat: the person puts it in the project\'s .env file themselves (the engine names the variable), then asks you to run the command again.';

const readCfg = (root) => { try { return JSON.parse(readFileSync(join(root, 'ds-config.json'), 'utf8')); } catch { return null; } };
export function stopCheck(event, { root, cfg = null }) {
  const reply = String(event?.last_assistant_message ?? '') || assistantBlocks(transcriptEntries(event?.transcript_path)).filter((b) => b?.type === 'text').map((b) => b.text).pop() || '';
  // Whatever the route: a reply that asks for a secret goes back once.
  const secret = asksForSecret(reply);
  let said; try { said = JSON.parse(readFileSync(saidFile(root), 'utf8')); } catch { said = null; }
  const forThisPrompt = said?.say?.length && !(said.session && event.session_id && said.session !== event.session_id) && !(said.prompt && event.prompt_id && said.prompt !== event.prompt_id);
  // At most two hand-backs for one request: a reply sent back for one reason (a value left in a file) may come back
  // still without the line it owes, so the owed line gets one more. Without owed lines, once only, as before.
  const backs = forThisPrompt ? (said.backs ?? 0) : 0;
  if (event?.stop_hook_active && !(forThisPrompt && backs < 2)) return null;
  const counted = (reason) => {
    if (reason && forThisPrompt) { try { writeFileSync(saidFile(root), JSON.stringify({ ...said, backs: backs + 1 }, null, 2) + '\n'); } catch { /* a help, never a blocker */ } }
    return reason;
  };
  const missing = forThisPrompt ? said.say.filter((s) => SAID[s.check] && !SAID[s.check].test.test(reply) && !SAID[s.check].unless?.(event.transcript_path)) : [];
  // A prototype drawn for this request owes the person its gaps: each one the reply does not name is sent back, once.
  const owed = prototypeGapsOwed(root, reply);
  if (owed.length) missing.push(...owed.map((g) => ({ text: `- ${g.line}`, check: g.kind === 'consistency' ? 'differs' : g.kind === 'request' ? 'asked' : g.kind === 'screen' ? 'screen' : g.kind === 'a11y' ? 'a11y' : 'gap' })));
  // What the session's edits left in place that the system does not have (the edit check, run once more over the files).
  let left = [];
  try { const c = cfg ?? readCfg(root); if (c) left = sessionLeftovers(root, c); } catch { /* the check is a help, never a blocker */ }
  if (left.length) {
    return counted(`rms-design-system-engine: before you finish, the files you changed still hold what the design system does not have:\n${left.slice(0, 12).join('\n')}${left.length > 12 ? `\n  and ${left.length - 12} more` : ''}\nTake each out, or write the system's own value instead; when it has none, leave it out and tell the person. Then give your answer again${missing.length ? `, with ${missing.length > 1 ? 'these lines' : 'this line'} in it, word for word:\n${missing.map((s) => s.text).join('\n')}` : '.'}${secret ? ` ${SECRET_LINE}` : ''}`);
  }
  if (secret && !missing.length) return counted(`rms-design-system-engine: your reply asks the person for a secret in the chat. Reply again without asking for it. ${SECRET_LINE}`);
  if (!missing.length) return null;
  const lines = [...missing.map((s) => s.text), ...(secret ? [SECRET_LINE] : [])];
  const what = [...new Set(missing.map((s) => (s.check === 'gap' ? 'what the design system would need for the prototype (its gaps)' : s.check === 'differs' ? 'where the prototype differs from the product\'s other pages' : s.check === 'asked' ? 'what the request asked for that the prototype leaves out' : s.check === 'screen' ? 'where the drawn page differs from the designed screen' : s.check === 'a11y' ? 'what the drawn page makes hard to use' : SAID[s.check].what)))];
  return counted(`rms-design-system-engine: your reply leaves out ${what.join(' and ')}${secret ? ', and asks the person for a secret in the chat' : ''}. Reply again with your whole answer${secret ? ', asking for no secret,' : ''} and ${lines.length > 1 ? 'these lines' : 'this line'} in it, word for word:\n${lines.join('\n')}`);
}
// The gaps of the prototype the engine drew in the last half hour, not yet checked, that the reply does not name. A gap
// is named when most of its words are in the reply. Checked once: the record is marked done either way.
export function prototypeGapsOwed(root, reply, { now = Date.now() } = {}) {
  const file = join(root, OUT_DIR, 'prototypes', 'last.json');
  let last; try { last = JSON.parse(readFileSync(file, 'utf8')); } catch { return []; }
  if (!last?.pending || !(now - Date.parse(last.at) < 30 * 60 * 1000)) return [];
  try { writeFileSync(file, JSON.stringify({ ...last, pending: false }, null, 2) + '\n'); } catch { /* a help, never a blocker */ }
  const text = String(reply ?? '').toLowerCase();
  const STOP = new Set(['the', 'and', 'for', 'with', 'that', 'this', 'from', 'each', 'some', 'like', 'used', 'component', 'system']);
  return (last.gaps ?? []).filter((g) => {
    const words = (String(g.need).toLowerCase().match(/[a-z][a-z0-9-]{2,}/g) ?? []).filter((w) => !STOP.has(w));
    if (!words.length) return false;
    return words.filter((w) => text.includes(w.replace(/s$/, ''))).length < Math.ceil(words.length / 2);
  });
}

export const stopOutput = (reason) => (reason ? JSON.stringify({ decision: 'block', reason }) : '');

// The files where the system's decisions are recorded. 'agreed' is
// written by the engine only; the others change when the person asks.
const ACCEPT_ASKED = /\baccept|known (debt|difference)|as debt|d[ií]vida|aceit|\bbaseline|ratchet|lock (it |them )?in/i;   // the router's accept-debt words, or the baseline named
const SIGNOFF_ASKED = /\bsign(s|ed|ing)?\b[\w\s-]{0,20}?\boff\b|\b(approv\w*|aprov\w*|autoriz\w*|i agree|go ahead|yes)\b|\b(assin\w*|valid\w*)\b/i;   // the person signs it off, or says who does
// An edit that adds to the system itself (a token to the theme, an option to a component): held until a named person
// signed it off (sign-off.mjs), as ds-config.json is held. → a verdict, or null
function systemHold(event, file, cfg) {
  if (!file || !CODE.test(String(file))) return null;
  const root = resolve(event.cwd ?? process.cwd()), input = event.tool_input ?? {};
  let before = ''; try { before = readFileSync(resolve(root, String(file)), 'utf8'); } catch { /* a new file */ }
  let after = before;
  if (event.tool_name === 'Write') after = String(input.content ?? '');
  else if (event.tool_name === 'Edit') after = input.replace_all ? before.split(String(input.old_string ?? '')).join(String(input.new_string ?? '')) : before.replace(String(input.old_string ?? ''), String(input.new_string ?? ''));
  else if (event.tool_name === 'MultiEdit') for (const e of input.edits ?? []) after = e.replace_all ? after.split(String(e.old_string ?? '')).join(String(e.new_string ?? '')) : after.replace(String(e.old_string ?? ''), String(e.new_string ?? ''));
  else return null;
  let adds = [];
  try { adds = additionsOf({ file, before, after, cfg, root }).filter((a) => !signedOff(root, a.what)); } catch { return null; }
  if (!adds.length) return null;
  const list = adds.map((a) => a.what).join('; ');
  // Who made it, for the sign-off: the one who made a change never reviews it (sign-off.mjs). The hook's own session.
  const rel = relative(root, resolve(root, String(file)));
  try { recordHeld(root, adds, { file: rel, edit: { tool: event.tool_name, input: { ...input, file_path: rel } }, author: event.session_id ? { kind: 'agent', session: String(event.session_id) } : null }); } catch { /* held all the same */ }
  // Shared (local-shared.mjs): why, and on whom it waits.
  let scope = null;
  try { scope = editScope({ file: rel, before, after, root, files: { theme: new Set(themeFiles(cfg)), components: contractsByFile(root, cfg) } }, { usage: usageFrom(root, cfg), owners: cfg.owners }); } catch { /* said without it */ }
  const owner = scope?.decider?.name ?? null;
  const decider = owner ? `${owner}, who decides for it in ds-config.json owners` : "whoever owns the system, or the person if they do";
  const second = reviewMode(cfg) === 'agent-or-person' ? ` Or have a second agent session review it (rms-design-system-engine --second-review ${JSON.stringify(adds[0].what)}): never this one, which made the change.` : '';
  // A token that brings in a colour the system holds nowhere is a gap in the system, not a change waiting on a
  // signature. Told as one, first: the person hears the system has no such colour, and the work goes on with what it
  // has. Asked only to name who signs it off, an agent asked for a colour the system lacks offered to invent one and
  // stopped there, in two of ten runs of the same request (FINDINGS.md, a held edit said a new colour was a sign-off).
  const fresh = newColours(adds, after, root, cfg);
  if (fresh.length) {
    const rest = adds.filter((a) => !fresh.some((f) => f.what === a.what));
    const named = fresh.map((f) => `${f.token}: ${f.value}`).join('; ');
    return { decision: 'deny', reason: `This edit brings into the design system a colour it does not have (${named}): no token holds that value, and Figma has none. So the system has no colour for this. Tell the person so, plainly, and do what was asked with what the system has, or leave that part out and say it is missing: a new colour is for ${decider} to decide, not for this edit.${rest.length ? ` The edit also adds ${rest.map((a) => a.what).join('; ')}, which waits for a named person to sign it off.` : ''} If they decide to add it, they sign it off and you make the edit again: rms-design-system-engine --sign-off ${JSON.stringify(fresh[0].what)} --by "<who>"${adds.length > 1 ? ' for each' : ''}. Never your own name: the agent that made a change never signs it off.${second}` };
  }
  return { decision: 'deny', reason: `This edit adds to the design system itself (${list}), which every product then gets: it waits for a named person to sign it off.${scope?.scope === 'shared' ? ` ${scope.reason}` : ''} Tell the person what it adds and ask who signs it off (${owner ? `${owner} decides for it in ds-config.json owners` : "the system's owner, or themselves if they are"}); once they say, run rms-design-system-engine --sign-off ${JSON.stringify(adds[0].what)} --by "<who>"${adds.length > 1 ? ' for each' : ''}, then make the edit again. Never your own name: the agent that made a change never signs it off.${second} To use what the system has instead, take the closest one it already has and say so.` };
}
// The tokens an edit adds whose value is a colour the system holds nowhere: no token of the theme has it and Figma has
// none, which is what the edit check calls "not a design-system colour" in the theme (edit-check.mjs). Judged here, from
// the same truth, because a held edit is never made and so never reaches that check. A token that points at another
// (var(--x)) brings in nothing new, and one that is not a colour keeps the sign-off as it was. → [{ ...add, token, value }]
function newColours(adds, after, root, cfg) {
  const tokens = adds.filter((a) => a.kind === 'token');
  if (!tokens.length) return [];
  let truth; try { truth = editTruth(root, cfg); } catch { return []; }
  const values = declaredValues(after), out = [];
  for (const a of tokens) {
    const token = a.what.replace(/^the token /, ''), value = values.get(token), hex = value ? colorHex(value) : null;
    if (!hex || (truth.tokenByValue.get(hex) ?? []).length || truth.figmaValues.has(hex) || truth.figmaRaw.has(hex)) continue;
    out.push({ ...a, token, value });
  }
  return out;
}
const LESSON_ASKED = /\b(lessons?|learn\w*|remember|correct\w*|wrong|mistake|again)\b|\b(li[çc][ãa]o|li[çc][õo]es|aprend\w*|lembr\w*|errad[oa]|erro)\b/i;   // the person corrects, or answers a guard
const KEEP_ASKED = /\b(keep|kept|keeping)\b|\b(on purpose|intentional\w*|deliberate\w*|by design)\b|\b(mant[eé]m|manter|mantemos|mantenha|de prop[oó]sito|intencional\w*)\b/i;   // the person keeps a difference on purpose
const EXCEPTION_ASKED = /\b(exception|exempt|ignore|skip|mapping|map|exce[çc][õoã]|isen[çc]|ignor|mapa|mapeamento|set ?up|configur|install|init)\w*/i;   // setting the project up writes the map too
const NAMES_ASKED = /\b(renam|name|bind|alias|record|contract|map)\w*|\b(renome|nome|v[ií]ncul|regist|contrat|mape)\w*/i;   // the person asks to record or rename a binding
const CHECKED_ASKED = /\b(i|we)\s+(have\s+|'ve\s+)?(checked|verified|confirmed|reviewed|tested)\b|\bis checked\b|\b(are|were|was)\s+checked\b|\bmark\w*\b[\s\S]{0,60}\b(checked|done|verified)\b|\b(unmark|uncheck|to check again)\w*|\b(verifiquei|conferi|chequei|testei|est[áa] verificad|marc\w*[\s\S]{0,60}(verificad|feito|conferid))/i;   // the person says they checked it by hand
const PICTURE_ASKED = /\b(approve|accept|update|aprov|aceit|atualiz)\w*\b[\s\S]{0,60}\b(pictures?|images?|screenshots?|references?|imagem|imagens|refer[eê]ncias?|capturas?)\b|\b(pictures?|images?|screenshots?|references?|imagem|imagens|refer[eê]ncias?|capturas?)\b[\s\S]{0,60}\b(approve|accept|update|aprov|aceit|atualiz)\w*/i;
export function decisionFile(path, cfg = {}) {
  const p = String(path ?? '').replace(/\\/g, '/'), b = basename(p);
  if ([PROJECT.baseline.now, cfg.baseline?.path && basename(cfg.baseline.path)].includes(b)) return 'debt';
  if (b === PROJECT.agreed.now) return 'agreed';
  if (b === PROJECT.kept.now) return 'kept';
  if (b === PROJECT.checked.now) return 'checked';
  if (b === PROJECT.lessons.now) return 'lessons';
  if (b === PROJECT.map.now) return 'exceptions';
  if (b === basename(cfg.contracts?.authored ?? 'contract.authored.json')) return 'names';
  const refs = [cfg.visualRefs, PROJECT.refs.now].filter(Boolean).map((d) => String(d).replace(/^\.?\/+|\/+$/g, ''));
  if (refs.some((d) => p === d || p.endsWith(`/${d}`) || p.startsWith(`${d}/`) || p.includes(`/${d}/`))) return 'pictures';   // the folder itself too
  return null;
}
const DECISION = {
  debt: { asked: ACCEPT_ASKED, reason: (f) => `${f} is what the person accepted as debt: an agent never accepts its own differences. When the person asks to accept one, run rms-design-system-engine --baseline --findings --match <what they named>; otherwise report the difference and leave it failing.` },
  kept: { asked: KEEP_ASKED, reason: (f) => `${f} holds the differences the team decided to keep, each with the person's reason: an agent never keeps its own differences. When the person says to keep one, run rms-design-system-engine --keep --match <what they named> --reason "<their words>"; otherwise report the difference and leave it open.` },
  exceptions: { asked: EXCEPTION_ASKED, reason: (f) => `${f} holds the names the audit cannot work out and the system's exceptions: an entry added there can hide a finding instead of fixing it. Confirm the person asked for this change to it, or fix what the audit reports.` },
  names: { asked: NAMES_ASKED, reason: (f) => `${f} records which code name stands for each Figma name: a binding added there makes a differently named prop pass instead of fixing it. Confirm the person asked for this binding, or name the prop the way Figma does.` },
  checked: { asked: CHECKED_ASKED, reason: (f) => `${f} records what a person checked by hand: an agent never marks a check it did not make. When the person says they checked one, run rms-design-system-engine --checked <component> <criterion>; otherwise leave it to check.` },
  pictures: { asked: PICTURE_ASKED, reason: (f) => `${f} is an approved reference picture: it changes only when a person approves the new one. Report the difference, or confirm the person approved it.` },
  lessons: { asked: LESSON_ASKED, reason: (f) => `${f} holds what people corrected and what each correction became, with who said yes: an agent never writes a lesson or an answer of its own. When the person corrects something, run rms-design-system-engine --lesson "<what was wrong>" --why "<their reason>"; when they say yes or no to a guard, --lesson-answer <id> yes|no.` },
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
// A pasted list of steps ("4. generate an HTML report file"): the skill reports in the chat, so no report file is written.
const REPORT_FILE = /\.(html?|pdf)$/i;
const stepsReport = (file, userText) => userText !== null && STEP_LIST.test(userText) && REPORT_FILE.test(String(file ?? ''))
  ? { decision: 'deny', reason: `The request was a pasted list of steps, and the skill reports in the chat: write no report file (${basename(String(file))}). Reply with the result in the chat.` } : null;
export function judge(event, { cfg = {}, userText = null } = {}) {
  if (cfg.hooks === false) return null;
  const tool = event?.tool_name, input = event?.tool_input ?? {};
  const snapshotPaths = new Set(Object.entries(cfg.paths ?? {}).filter(([k, v]) => /^snapshot|Snapshot$/.test(k) && typeof v === 'string').map(([, v]) => basename(v)));
  const isSnapshot = (p) => SNAPSHOT.test(basename(String(p ?? ''))) || snapshotPaths.has(basename(String(p ?? '')));
  if (EDIT_TOOLS.has(tool)) {
    const file = input.file_path ?? input.notebook_path ?? input.path;
    const report = stepsReport(file, userText);
    if (report) return report;
    if (isSnapshot(file)) return { decision: 'deny', reason: `${basename(file)} is written by the Figma capture, never by hand (a hand edit fakes a refresh). Refresh it with the capture (rms-design-system-engine --recipe refresh-figma), or leave it stale and say so.` };
    if (basename(String(file ?? '')) === 'ds-config.json') return { decision: 'ask', reason: 'ds-config.json is the project\'s parity setup. Confirm this edit is what you asked for (guidelines links go through rms-design-system-engine --guidelines, never a hand edit).' };
    if (basename(String(file ?? '')) === basename(HELD)) return { decision: 'deny', reason: `${basename(HELD)} records what the guard held and who made it: written by the engine, never by hand.` };
    if (basename(String(file ?? '')) === SIGN_OFFS) return { decision: 'deny', reason: `${SIGN_OFFS} records who signed off what is added to the system: it is written by rms-design-system-engine --sign-off "<what>" --by "<who>", once the person names who signs it off, never by hand.` };
    const held = systemHold(event, file, cfg);
    if (held) return held;
    const kind = decisionFile(file, cfg);
    if (kind && !(kind === 'pictures' && !existsSync(resolve(event.cwd ?? process.cwd(), String(file))))) return decisionVerdict(kind, file, userText);   // a new picture is not an approved one
    // A prototype changes nothing in the system: it is a composition under prototypes/, drawn by the engine.
    if (userText !== null && PROTOTYPE.test(userText) && !ASKING_HOW.test(userText) && !/(^|\/)prototypes\/[^/]+\.json$/.test(String(file ?? '').split('\\').join('/'))) {
      return { decision: 'ask', reason: `The person asked for a prototype: it is made only of the design system's components, as a composition in prototypes/<name>.json that the engine draws (rms-design-system-engine --recipe prototype). Writing ${basename(String(file ?? ''))} would build or change something outside it; confirm the person asked for that.` };
    }
    if (userText !== null && CODE.test(String(file ?? '')) && !asksForChange(userText)) return { decision: 'ask', reason: `The person's last message does not ask for a change to ${basename(file)}. Report the fix the audit names instead of making it, or confirm they asked for it.` };
    return null;
  }
  // A write to Figma (the Figma MCP's use_figma): only the engine's own script, and only when the person said yes.
  if (/use_figma$/.test(String(tool ?? ''))) return figmaWriteVerdict(String(input.code ?? ''), { root: resolve(event.cwd ?? process.cwd()), userText });
  if (tool === 'Bash') {
    const cmd = String(input.command ?? '');
    const engine = /^\s*(node\s+\S*audit\.mjs|rms-design-system-engine)\b/.test(cmd);
    if (!engine && SNAPSHOT.test(cmd) && (/(>|>>)\s*\S*figma-[\w.-]*\.snapshot\.json/.test(cmd) || /\b(sed\s+(-[a-zA-Z]*i|--in-place)|perl\s+-[a-zA-Z]*i|tee)\b/.test(cmd) || /\b(cp|mv)\s+\S+\s+\S*figma-[\w.-]*\.snapshot\.json/.test(cmd))) {
      return { decision: 'deny', reason: 'Figma snapshots are written by the capture, never by a shell edit. Refresh them with the capture (rms-design-system-engine --recipe refresh-figma).' };
    }
    // Accepting debt is the person's decision, even through the engine: --baseline runs when they asked for it.
    if (/(^|[\s;&|(])(node\s+\S*audit\.mjs|rms-design-system-engine)\b[^|;&\n]*\s--baseline\b/.test(cmd) && userText !== null && !ACCEPT_ASKED.test(userText)) return { decision: 'ask', reason: DECISION.debt.reason('The baseline') };
    // Who signs off what is added to the system is the person's to say: --sign-off and --signed-off run when they said so.
    if (/(^|[\s;&|(])(node\s+\S*audit\.mjs|rms-design-system-engine)\b[^|;&\n]*\s--sign(ed)?-off\b/.test(cmd) && userText !== null && !SIGNOFF_ASKED.test(userText)) return { decision: 'ask', reason: 'A sign-off says a named person agreed to add this to the system. The person\'s last message does not say who signs it off: ask them, and record only the name they give.' };
    // Keeping a difference on purpose is the person's decision, even through the engine: --keep runs when they said so.
    if (/(^|[\s;&|(])(node\s+\S*audit\.mjs|rms-design-system-engine)\b[^|;&\n]*\s--keep\b/.test(cmd) && userText !== null && !KEEP_ASKED.test(userText)) return { decision: 'ask', reason: DECISION.kept.reason('The kept differences file') };
    // A check made by hand is the person's to record: --checked and --unchecked run when they said so.
    if (/(^|[\s;&|(])(node\s+\S*audit\.mjs|rms-design-system-engine)\b[^|;&\n]*\s--(un)?checked\b/.test(cmd) && userText !== null && !CHECKED_ASKED.test(userText)) return { decision: 'ask', reason: DECISION.checked.reason('A check made by hand') };
    // A shell write, copy, move or delete of a decision file (the approved picture copied over, the debt rewritten).
    for (const f of shellTargets(cmd)) { const report = stepsReport(f, userText); if (report) return report; }
    for (const f of shellTargets(cmd)) {
      const kind = decisionFile(f, cfg);
      if (!kind || (kind === 'pictures' && !existsSync(resolve(event.cwd ?? process.cwd(), f)))) continue;   // a new picture is not an approved one
      const v = decisionVerdict(kind, f, userText);
      if (v) return v;
    }
    // A lesson becomes a guard only on the person's yes or no: --lesson-answer runs when their message gives it.
    if (/(^|[\s;&|(])(node\s+\S*audit\.mjs|rms-design-system-engine)\b[^|;&\n]*\s--lesson-answer\b/.test(cmd) && !(userText !== null && (APPROVES.test(userText) || /^\s*(no|nope|n[ãa]o)\b/i.test(userText) || (/\b(yes|no|sim|n[ãa]o)\b/i.test(userText) && /\b(lessons?|li[çc][ãa]o|guards?|rules?|checks?|steps?|L\d+|R-[\w-]+)\b/i.test(userText))))) return { decision: 'ask', reason: 'A lesson becomes a check, an agent step or a rule only when the person says yes. Show them what it would become (rms-design-system-engine --lessons) and ask.' };
    // The engine's rules go into an agent's instruction file only once the person said yes.
    if (/(^|[\s;&|(])(node\s+\S*audit\.mjs|rms-design-system-engine)\b[^|;&\n]*\s--agent-rules\b[^|;&\n]*\s--write\b/.test(cmd) && !(userText !== null && (APPROVES.test(userText) || asksForChange(userText)))) return { decision: 'ask', reason: 'The engine\'s rules go into an instruction file only when the person says yes. Show them the section (rms-design-system-engine --agent-rules) and ask.' };
    if (/\bgit\b[^|;&\n]*\spush\b/.test(cmd)) return { decision: 'ask', reason: 'Pushing sends the work to the remote. Confirm the person asked for a push.' };
    if (/\bgit\b[^|;&\n]*\scommit\b/.test(cmd)) return { decision: 'ask', reason: 'Committing records the change. Confirm the person asked for a commit.' };
    if (/\bgit\b[^|;&\n]*\sapply\b/.test(cmd) && /handback|code-changes\.diff/.test(cmd) && !(userText !== null && asksForChange(userText))) return { decision: 'ask', reason: 'The hand-back patch is only applied when the person asks. Confirm they did.' };
  }
  return null;
}

// What changes a Figma file in a plugin script: an assignment to a node's properties, or a call that creates, removes,
// moves or edits. A script without one only reads.
const FIGMA_WRITE = /\.(annotations|name|description|characters|fills|strokes|effects|visible|opacity|x|y|cornerRadius|layoutMode|itemSpacing|padding\w*)\s*=(?!=)|\bfigma\.create\w*\(|\.(remove|resize|appendChild|insertChild|setProperties|editComponentProperty|addComponentProperty|deleteComponentProperty|setValueForMode|setBoundVariable\w*|swapComponent|detachInstance|set|setPluginData|setSharedPluginData|setVariableCodeSyntax|removeVariableCodeSyntax|addDevResourceAsync|editDevResourceAsync|deleteDevResourceAsync)\s*\(/;
// A yes to what was shown: an approval, or a request to make the change.
const APPROVES = /^\s*(yes|yeah|yep|ok(ay)?|sure|go( ahead)?|do it|please do|apply( them| it)?|sim|pode|manda)\b/i;
const norm = (t) => String(t ?? '').replace(/\s+/g, ' ').trim();
export function figmaWriteVerdict(code, { root, userText = null } = {}) {
  if (!FIGMA_WRITE.test(code)) return null;
  const body = (t) => norm(String(t).replace(/^\s*\/\/.*$/gm, ''));
  // The engine's own two scripts: the one that makes the change, and the one that puts it back (figma-undo.mjs). The
  // way back is as much the engine's write as the change was, so it passes the same way and nothing else does.
  const mine = [];
  for (const f of ['figma-apply.js', 'figma-undo.js']) {
    try { mine.push(readFileSync(join(root, OUT_DIR, 'handback', f), 'utf8')); } catch { /* none written */ }
  }
  const script = mine.find((s) => body(s) === body(code)) ?? null;
  if (!script) {
    return { decision: 'deny', reason: 'Figma is changed only through the engine: rms-design-system-engine --figma-edits lists what the code says Figma should state and writes the script for it (.design-system-engine-out/handback/figma-apply.js). Show the person that list, and run that script unchanged once they say yes. What needs a person (missing components, layout, a description the intent layer does not hold yet) is listed for the design team, never written.' };
  }
  if (userText !== null && !APPROVES.test(userText) && !asksForChange(userText)) {
    return { decision: 'ask', reason: 'This changes the Figma file. The person\'s last message does not say yes to the list rms-design-system-engine --figma-edits showed: show it and ask first.' };
  }
  return null;
}

// After the engine's own script ran in Figma (the PostToolUse hook on use_figma): the way back, written from what the
// run itself reported. Only the script could see what each value was before it changed it, and the run's answer is
// where it comes out, so the record is taken from the tool's own answer and never from an agent retyping it.
// The script that just ran says which command wrote it, on its first line, so the record names it too.
// Returns the lines to hand back to the agent, or null: a run that reported no record is never read as "nothing to
// undo", because a write with no way back is exactly what the person needs to be told about.
export function noteFigmaRun(event, { root, cfg = {} } = {}) {
  if (cfg.hooks === false) return null;
  if (!/use_figma$/.test(String(event?.tool_name ?? ''))) return null;
  const code = String(event?.tool_input?.code ?? '');
  if (!code || !FIGMA_WRITE.test(code)) return null;                 // a read changes nothing, so there is nothing to undo
  const dir = join(root, OUT_DIR, 'handback');
  const read = (f) => { try { return readFileSync(join(dir, f), 'utf8'); } catch { return null; } };
  const body = (t) => norm(String(t).replace(/^\s*\/\/.*$/gm, ''));
  const apply = read('figma-apply.js'), undoJs = read('figma-undo.js');
  try {
    // The way back ran: what it reported is kept beside the change, so --change-report can say whether the file is
    // back to the read before.
    if (undoJs && body(undoJs) === body(code)) {
      const r = event?.tool_response;
      const said = typeof r === 'string' ? r : JSON.stringify(r ?? null);
      // It refuses where part of the change has no way back, and then it changed nothing: said here, so the change
      // report never reads a refusal as a way back that ran and left the file wrong.
      const refused = /"refused"\s*:\s*true/.test(said);
      writeFileSync(join(dir, 'figma-undone.json'), JSON.stringify({ at: new Date().toISOString(), refused, said: said.slice(0, 20000) }, null, 2) + '\n');
      return refused
        ? ['⚠️  The way back refused to run and changed nothing: part of this change has no way back, and putting the rest back would leave the file looking undone when it is not. Tell the person, with what cannot be taken back (.design-system-engine-out/handback/figma-undo.json). The file\'s version history is the only way back from the whole change.']
        : ['The way back ran. NEXT: refresh the Figma snapshots (rms-design-system-engine --refresh-figma), then run rms-design-system-engine --change-report <component>: it says whether the read after is the same as the read before.'];
    }
    if (!apply || body(apply) !== body(code)) return null;            // not the engine's change: the PreToolUse hook denied it
    const what = /--(figma-edits|figma-change|figma-build)/.exec(apply)?.[1] ?? 'figma-apply';
    // A change just made is not a change taken back: whatever an earlier one left goes, before anything else, so the
    // change report can never read an older run's way back as this change's.
    try { unlinkSync(join(dir, 'figma-undone.json')); } catch { /* none from an earlier change */ }
    const undo = undoSteps(event?.tool_response);
    if (!undo) return ['⚠️  The run in Figma reported no way back, so the engine cannot take this change back: only the script could see what each value was before it changed it. Tell the person. The file\'s version history is the only way back, and it drops everyone else\'s work since.'];
    const out = writeUndo(dir, undo, { what: `--${what}` });
    return undoLines(out.record, { script: relative(root, out.script) });
  } catch { return null; }                                           // a help, never a blocker
}

// The route for a request made with the skill's command, or a company's (/rms-design-system-engine-<client>), as
// context for the agent; null for any other prompt.
const COMMAND = /^\s*\/rms-design-system-engine(?:-[a-z0-9][a-z0-9-]*)?(?=\s|$)[ \t]*([\s\S]*)$/;
export const MAX_RECIPE = 6000;
export function routePrompt(event, { root, engineDir = ENGINE, cfg = {}, env = process.env } = {}) {
  if (cfg.hooks === false) return null;
  const text = String(event?.prompt ?? '').match(COMMAND)?.[1]?.trim();
  if (!text) return null;
  const state = projectState(root, { engineDir, env });
  const r = route(text, state);
  rememberSay(root, event, r.say);
  // A prototype request is kept for the catalog, which puts what the person asked for against everything it knows.
  if (r.recipe === 'prototype') { try { const f = join(root, OUT_DIR, 'prototypes', 'request.json'); mkdirSync(dirname(f), { recursive: true }); writeFileSync(f, JSON.stringify({ at: new Date().toISOString(), text }, null, 2) + '\n'); } catch { /* a help, never a blocker */ } }
  let recipe = '';
  try { recipe = readDoc(engineDir, 'recipe', r.recipe) ?? ''; } catch { /* the pointer line still names it */ }
  // The steps lessons became in this project (a person corrected an agent and said yes to holding it as a step): said
  // with every request, so the agent reads them before it works rather than after the check hands its edit back.
  let steps = [];
  try { steps = agentStepsOf(root); } catch { /* none */ }
  const learned = steps.length ? `\nLearned in this project (each a correction a person said yes to holding as a step; follow them):\n${steps.map((x) => `- ${x}`).join('\n')}` : '';
  return `The engine already routed this request (rms-design-system-engine's project hook); follow it and do not run --route again.\n${routeText(r, recipe, state.cmd, { maxRecipe: MAX_RECIPE })}${learned}`;
}

export function promptOutput(context) {
  if (!context) return '';
  return JSON.stringify({ hookSpecificOutput: { hookEventName: 'UserPromptSubmit', additionalContext: context } });
}

export function hookOutput(verdict) {
  if (!verdict) return '';
  return JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: verdict.decision, permissionDecisionReason: `rms-design-system-engine: ${verdict.reason}` } });
}

// The guard in Cursor and Codex (agent-hooks.mjs): each tool's event turned into the one judged here, each verdict
// back into what that tool reads. The same rules, the same checks; only the words on the wire differ.
export async function otherToolHook(tool, raw, { root: at = null } = {}) {
  const ah = await import('./agent-hooks.mjs');
  const items = ah.normalize(tool, raw, { root: at ?? process.cwd() });
  const out = [];
  for (const it of items) {
    if (it.kind === 'none') continue;
    const event = it.event ?? {};
    const root = resolve(at ?? event.cwd ?? process.cwd());
    const cfgPath = join(root, 'ds-config.json');
    let cfg = {}; try { cfg = JSON.parse(readFileSync(cfgPath, 'utf8')); } catch { /* none or broken: the defaults */ }
    if (it.kind === 'reply') { ah.remember(root, { reply: it.text }); continue; }
    if (it.kind === 'prompt') {
      ah.remember(root, { prompt: event.prompt ?? '', session: event.session_id ?? null });
      const context = routePrompt(event, { root, cfg });
      if (!context) rememberSay(root, event, []);
      out.push({ kind: 'prompt', payload: context });
    } else if (it.kind === 'pre') {
      const verdict = existsSync(cfgPath) ? judge(event, { cfg, userText: ah.recall(root).prompt ?? null }) : null;
      out.push({ kind: tool === 'cursor' && event.tool_name !== 'Bash' && !/use_figma$/.test(String(event.tool_name)) ? 'pre-file' : 'pre', payload: verdict });
    } else if (it.kind === 'post') {
      if (!existsSync(cfgPath)) continue;
      const page = (await import('./page-check.mjs')).pageHookCheck(event, { root, cfg, outDir: OUT_DIR });
      const run = editCheckRun(event, { root, cfg });
      out.push({ kind: 'post', payload: [editCheck(event, { root, cfg, run }), page].filter(Boolean).join('\n\n') || null });
    } else if (it.kind === 'stop') {
      const ev = { ...event, last_assistant_message: event.last_assistant_message ?? ah.recall(root).reply ?? '' };
      const reason = cfg.hooks !== false ? stopCheck(ev, { root, cfg: existsSync(cfgPath) ? cfg : null }) : null;
      out.push({ kind: 'stop', payload: reason });
      if (existsSync(cfgPath)) { try { (await import('./git-rebuild.mjs')).rebuildIfBehind(root, { cfg, script: join(dirname(fileURLToPath(import.meta.url)), 'audit.mjs') }); } catch { /* the page stays as it was */ } }
    }
  }
  if (!out.length) return items.some((x) => x.kind === 'none') && tool === 'cursor' && /^(preToolUse|beforeShellExecution|beforeMCPExecution)$/.test(raw.hook_event_name) ? JSON.stringify({ permission: 'allow' }) : '';
  // A Codex patch of several files: the strictest verdict answers for all of them.
  const pre = out.filter((o) => o.kind === 'pre' || o.kind === 'pre-file');
  if (pre.length) return ah.encode(tool, pre[0].kind, ah.strictest(pre.map((o) => o.payload)));
  const post = out.filter((o) => o.kind === 'post');
  if (post.length) return ah.encode(tool, 'post', post.map((o) => o.payload).filter(Boolean).join('\n\n') || null);
  return ah.encode(tool, out[0].kind, out[0].payload);
}

// As a hook: stdin → stdout, always exit 0 (a broken guard must never block work; --doctor reports it).
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('guard.mjs')) {
  let raw = '';
  try { raw = readFileSync(0, 'utf8'); } catch { /* no input */ }
  const tool = (await import('./agent-hooks.mjs')).toolArg();
  if (tool !== 'claude') {
    try { const out = await otherToolHook(tool, JSON.parse(raw || '{}')); if (out) process.stdout.write(out); } catch { /* pass */ }
    process.exit(0);
  }
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
      if (cfg.hooks !== false) { const out = stopOutput(stopCheck(event, { root, cfg: existsSync(cfgPath) ? cfg : null })); if (out) process.stdout.write(out); }
      // At the end of each turn, once whatever the engine ran in it has finished (an update, a read of the code from
      // GitLab, an audit): a page built from an older engine or other code is built again, quickly, in a process of its
      // own (git-rebuild.mjs). It is how a project that is no git repository keeps its page as the engine and its code
      // are, with no job and no schedule.
      if (existsSync(cfgPath)) { try { (await import('./git-rebuild.mjs')).rebuildIfBehind(root, { cfg, script: join(dirname(fileURLToPath(import.meta.url)), 'audit.mjs') }); } catch { /* the page stays as it was */ } }
    } else if (event.hook_event_name === 'PostToolUse') {
      if (existsSync(cfgPath)) {
        let cfg = {};
        try { cfg = JSON.parse(readFileSync(cfgPath, 'utf8')); } catch { /* defaults */ }
        // A page in prototypes/ is held to the system too: its components, what each is given, where each goes.
        // The way back from a Figma write the engine just made, from what the run itself reported (figma-undo.mjs).
        // Not part of the UI edit check, so "editCheck": false never leaves a change with no way back.
        const undone = noteFigmaRun(event, { root, cfg });
        const page = (await import('./page-check.mjs')).pageHookCheck(event, { root, cfg, outDir: OUT_DIR });
        const run = editCheckRun(event, { root, cfg });
        // What lessons are made from: the lines this agent wrote (a person changing one later is a correction), and
        // what the check found in them (a finding made again and again becomes a proposed rule).
        try { if (run && cfg.hooks !== false) { const ls = await import('./lessons.mjs'); ls.noteAgentEdit(root, event, run.added); ls.noteEdit(root, run.rel, run.found); } } catch { /* a help, never a blocker */ }
        const out = editHookOutput([editCheck(event, { root, cfg, run }), page, undone ? undone.join('\n') : null].filter(Boolean).join('\n\n') || null);
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
