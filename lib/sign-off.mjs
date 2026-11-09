// sign-off.mjs - a change to the system itself waits for a named person to sign it off, and the one who made it never does.
//
// Using the system is anyone's: a page that places a button. Authoring it is not: an edit that gives a shared component a
// new option, or the theme a new token, changes what every product gets. The edit check tells the agent what it added;
// this holds that edit until someone named has said yes, the way the guard holds ds-config.json. The engine's own builds
// in Figma record theirs (--figma-build, --figma-change --signed-off); a code edit records its with --sign-off.
//
// A second reviewer: the agent that made a change never signs it off. When the guard holds an edit it writes down who made
// it (the agent's session, the hook's session_id), and a sign-off whose reviewer is that author is refused with a plain
// reason: the same name (decided-by.mjs), the same agent session, or an agent's own name given where a person's goes. The
// reviewer is the person (--sign-off --by) or, where ds-config.json review.second is "agent-or-person", a second pass
// (--second-review, second-review.mjs): another agent session re-runs the engine's checks on the change and, when they find
// nothing, records itself as the reviewer. Each sign-off keeps its author and its reviewer, for History.
//
//   additionsOf({ file, before, after, cfg, root }) → [{ kind: 'token' | 'option', what, component? }]: what an edit adds
//     to the system itself: a custom property the theme file did not declare; a quoted option next to a component's
//     own options (its contract's) that the contract does not have
//   readSignOffs(root) / recordSignOff(root, { what, by, at, author, reviewer, review }) / signedOff(root, what)
//   SIGN_OFFS: the record, beside the project's other decisions
//   HELD: what the guard held and who made it (.design-system-engine-out, the engine's own); recordHeld / heldOf
//   reviewMode(cfg) → 'person' | 'agent-or-person'; authorNow(env) / sessionOf(env): the agent session running now
//   refusal({ author, reviewer }) → the plain reason a sign-off is refused, or null; whoSaid(x) → its words for a person
//
// No network, no Figma.
import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from 'node:fs';
import { join, relative, resolve, dirname } from 'node:path';

export const SIGN_OFFS = 'design-system-engine-signoffs.json';
const read = (p) => { try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return null; } };
const norm = (p) => String(p ?? '').split('\\').join('/').replace(/^\.\//, '');

// The theme files: where the system's own tokens are declared.
export const themeFiles = (cfg = {}) => [cfg.paths?.themeCSS ?? 'src/theme.css'].flat().filter(Boolean).map(norm);
const declared = (css) => new Set([...String(css ?? '').matchAll(/(?:^|[;{\s])(--[\w-]+)\s*:/g)].map((m) => m[1]));
// Each token a stylesheet declares, with the value it gives it (the first, where it is declared more than once).
export const declaredValues = (css) => { const out = new Map(); for (const m of String(css ?? '').matchAll(/(?:^|[;{\s])(--[\w-]+)\s*:\s*([^;}\n]+)/g)) if (!out.has(m[1])) out.set(m[1], m[2].trim()); return out; };

// Each component's contract by its code file, with the options of each of its props that has them.
export function contractsByFile(root, cfg = {}) {
  const dir = resolve(root, cfg.contracts?.out ?? 'contracts');
  const out = new Map();
  const walk = (d) => { let es = []; try { es = readdirSync(d, { withFileTypes: true }); } catch { return; } for (const e of es) { const p = join(d, e.name); if (e.isDirectory()) walk(p); else if (e.name.endsWith('.contract.json')) { const c = read(p); const f = c?.source?.code?.file; if (f) out.set(norm(f), c); } } };
  walk(dir);
  return out;
}

export function additionsOf({ file, before = '', after = '', cfg = {}, root = process.cwd() } = {}) {
  const rel = norm(relative(resolve(root), resolve(root, String(file ?? ''))));
  const out = [];
  if (themeFiles(cfg).includes(rel)) {
    const had = declared(before);
    for (const t of declared(after)) if (!had.has(t)) out.push({ kind: 'token', what: `the token ${t}` });
  }
  const c = contractsByFile(root, cfg).get(rel);
  if (c) {
    const name = c.name ?? String(c.id ?? '').replace(/^[^.]+\./, '');
    const quoted = (line) => [...line.matchAll(/(['"`])([\w-]+)\1/g)].map((m) => m[2]);
    const wasLines = new Set(String(before).split('\n').map((l) => l.trim()));
    const added = String(after).split('\n').map((l) => l.trim()).filter((l) => l && !wasLines.has(l));
    for (const p of c.props ?? []) {
      const opts = (p.options ?? []).map(String);
      if (opts.length < 2) continue;
      for (const line of added) {
        const q = quoted(line);
        if (!q.some((x) => opts.includes(x))) continue;
        for (const x of q) if (!opts.includes(x) && !out.some((o) => o.what === `${name} ${p.name}=${x}`)) out.push({ kind: 'option', component: name, what: `${name} ${p.name}=${x}` });
      }
    }
  }
  return out;
}

export function readSignOffs(root) { const r = read(join(root, SIGN_OFFS)); return Array.isArray(r?.signOffs) ? r.signOffs : []; }
export function recordSignOff(root, { what, by, at = new Date().toISOString(), author = null, reviewer = null, review = null, component = null }) {
  const all = readSignOffs(root).filter((s) => s.what !== what);
  all.push({ what, by, at, ...(component ? { component } : {}), ...(author ? { author } : {}), reviewer: reviewer ?? { kind: 'person', name: by }, ...(review ? { review } : {}) });
  writeFileSync(join(root, SIGN_OFFS), JSON.stringify({ _note: 'What a named person signed off to add to the system itself (rms-design-system-engine --sign-off), with who made the change and who reviewed it. Written by the engine; the guard lets an edit that adds one of these through.', signOffs: all }, null, 2) + '\n');
  return all;
}
export const signedOff = (root, what) => existsSync(join(root, SIGN_OFFS)) && readSignOffs(root).some((s) => s.what === what && s.by);

// ── Who made it, who reviewed it ──
export const HELD = '.design-system-engine-out/held-for-sign-off.json';
export const REVIEW_MODES = ['person', 'agent-or-person'];
export const reviewMode = (cfg = {}) => (REVIEW_MODES.includes(cfg.review?.second) ? cfg.review.second : 'person');
// The agent session running now: Claude Code's, else one the team's own runner names (DESIGN_SYSTEM_ENGINE_SESSION).
export const sessionOf = (env = process.env) => String(env.DESIGN_SYSTEM_ENGINE_SESSION || env.CLAUDE_CODE_SESSION_ID || '').trim() || null;
export const authorNow = (env = process.env) => { const session = sessionOf(env); return session ? { kind: 'agent', session } : null; };

export function readHeld(root) { const r = read(join(root, HELD)); return r && typeof r.held === 'object' && r.held ? r.held : {}; }
export const heldOf = (root, what) => readHeld(root)[what] ?? null;
// What the guard held: the edit (its file and tool input, to check it again), who made it and when. The latest hold of
// the same thing wins: it is the edit that will be made.
export function recordHeld(root, items = [], { file = null, edit = null, author = null, at = new Date().toISOString() } = {}) {
  const all = readHeld(root);
  for (const a of items) {
    // The same edit held again keeps its review; a different one is reviewed again.
    const prev = all[a.what], same = prev && prev.file === file && JSON.stringify(prev.edit) === JSON.stringify(edit);
    all[a.what] = { what: a.what, kind: a.kind, ...(a.component ? { component: a.component } : {}), file, edit, author: same && prev.author ? prev.author : author, at: same ? prev.at : at, ...(same && prev.review ? { review: prev.review } : {}) };
  }
  mkdirSync(dirname(join(root, HELD)), { recursive: true });
  writeFileSync(join(root, HELD), JSON.stringify({ _note: 'What the guard held for a sign-off, with who made it. Written by the engine.', held: all }, null, 2) + '\n');
  return all;
}
export function recordReview(root, what, review) {
  const all = readHeld(root);
  if (!all[what]) return null;
  all[what].review = review;
  writeFileSync(join(root, HELD), JSON.stringify({ _note: 'What the guard held for a sign-off, with who made it. Written by the engine.', held: all }, null, 2) + '\n');
  return all[what];
}

// An agent's own name where a person's goes: the agent signing for itself.
const AGENT_NAME = /^(?:the\s+)?(?:claude(?:\s+code)?|agent|the agent|ai|assistant|bot|copilot|cursor|codex|gpt[\w.-]*|chatgpt|gemini|llm)$/i;
const flat = (s) => String(s ?? '').trim().toLowerCase();
// The words a person reads for one side: a person by name, or an agent by its session.
export const whoSaid = (x) => !x ? null : x.kind === 'agent' ? `${x.name ?? 'an agent'}${x.session ? ` (session ${String(x.session).slice(0, 8)})` : ''}` : x.name ?? null;
// Why a sign-off is refused, or null: its reviewer is its author.
export function refusal({ author = null, reviewer = null } = {}) {
  if (!reviewer || (!reviewer.name && !reviewer.session)) return 'A sign-off names who reviewed the change: a person by name, or a second review (--second-review).';
  if (reviewer.kind !== 'agent' && AGENT_NAME.test(String(reviewer.name ?? '').trim())) return `"${reviewer.name}" is not a person's name: the agent that made a change never signs it off. Ask the person who signs it off, and record the name they give.`;
  if (!author) return null;
  if (author.session && reviewer.session && author.session === reviewer.session) return `This agent session (${String(author.session).slice(0, 8)}) made the change, so it cannot review it: run --second-review from another agent session, or ask a person to sign it off.`;
  if (author.name && reviewer.name && flat(author.name) === flat(reviewer.name)) return `${author.name} made this change, so ${author.name} cannot sign it off: the one who made a change never reviews it. Ask someone else, or run a second review (--second-review) where ds-config.json review.second allows it.`;
  return null;
}
