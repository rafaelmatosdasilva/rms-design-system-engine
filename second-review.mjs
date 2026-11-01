// second-review.mjs - a second pass on a change to the system itself, by another agent session than the one that made it.
//
// The agent that made a change never signs it off (sign-off.mjs). Where ds-config.json review.second is
// "agent-or-person", a second agent may: it runs the engine's own checks again on the change the guard held (or on a
// change waiting in Figma) and, when they find nothing, records itself as the reviewer. Where it is "person" (the
// default), the same pass runs and its findings are kept for the person who signs it off, but only a person accepts it.
// What the checks look at:
//   • the held edit as it would be made: the edit check's findings on the lines it adds (edit-check.mjs);
//   • a new token whose value another token of the theme already has, and a new option that differs from one the
//     component has only by its case or punctuation: the system would hold the same thing twice;
//   • how hard it is to undo (local-shared.mjs): a removal, a rename or a breaking change waits on a person whatever the
//     setting, and so does a change of high risk;
//   • a change waiting in Figma (component-change.mjs): what is still to answer and what it breaks.
//
//   reviewHeld(root, cfg, what, { env }) → { what, of: 'edit' | 'figma' | null, findings: [string], checks: [string], scope,
//     reviewer, author, refused } (refused: why this session cannot review it; of null: nothing waits under that name)
import { readFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { heldOf, sessionOf, refusal, themeFiles, contractsByFile } from './sign-off.mjs';
import { addedLines, editFindings, editTruth } from './edit-check.mjs';
import { editScope, changeScope, usageFrom } from './local-shared.mjs';

const OUT = '.design-system-engine-out';
const read = (p) => { try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return null; } };
const squash = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');

// The edit as it would leave the file, the way the guard reads it.
function afterOf(before, edit) {
  const input = edit?.input ?? {};
  if (edit?.tool === 'Write') return String(input.content ?? '');
  const one = (t, e) => (e.replace_all ? t.split(String(e.old_string ?? '')).join(String(e.new_string ?? '')) : t.replace(String(e.old_string ?? ''), String(e.new_string ?? '')));
  if (edit?.tool === 'Edit') return one(before, input);
  if (edit?.tool === 'MultiEdit') return (input.edits ?? []).reduce(one, before);
  return before;
}

// The theme's declarations, name → value.
const declarations = (css) => new Map([...String(css ?? '').matchAll(/(?:^|[;{\s])(--[\w-]+)\s*:\s*([^;}]+)/g)].map((m) => [m[1], m[2].trim()]));

export function reviewHeld(root, cfg = {}, what, { env = process.env } = {}) {
  const session = sessionOf(env);
  const reviewer = { kind: 'agent', name: 'a second agent review', session };
  const ctx = { usage: usageFrom(root, cfg), owners: cfg.owners };
  const out = { what, of: null, findings: [], checks: [], scope: null, reviewer, author: null, refused: null };
  const held = heldOf(root, what);
  const change = held ? null : read(join(root, OUT, 'changes', `${what}.change.json`));
  if (!held && !change) return out;
  out.of = held ? 'edit' : 'figma';
  out.author = held ? held.author ?? null : change.author ?? null;
  if (!session) { out.refused = 'A second review is another agent session\'s pass, and none is running here (no CLAUDE_CODE_SESSION_ID, nor DESIGN_SYSTEM_ENGINE_SESSION for a runner of your own). A person signs it off with --sign-off --by "<who>".'; return out; }
  out.refused = refusal({ author: out.author, reviewer });
  if (out.refused) return out;

  if (held) {
    const abs = resolve(root, held.file ?? '');
    let before = ''; try { before = existsSync(abs) ? readFileSync(abs, 'utf8') : ''; } catch { /* a new file */ }
    const after = afterOf(before, held.edit);
    // The edit check, on the lines the edit adds.
    out.checks.push('the edit check on the lines it adds');
    const added = addedLines({ tool_name: 'Write', tool_input: { content: after } }, { headText: before });
    const isTheme = themeFiles(cfg).includes(String(held.file ?? '').split('\\').join('/'));
    try {
      const declaredBefore = new Set([...before.matchAll(/(--[\w-]+)\s*:/g)].map((m) => m[1]));
      for (const f of editFindings(added, after, editTruth(root, cfg), { isTheme, sheet: /\.(css|scss|sass|less)$/i.test(abs), component: /\.(vue|svelte)$/i.test(abs), declaredBefore, file: held.file })) out.findings.push(`${held.file}${f.line ? `:${f.line}` : ''} ${f.text}`);
    } catch (e) { out.findings.push(`the edit check could not run (${e.message}): a person reviews it`); }
    // The same thing twice: a token's value another token has, an option another way of writing one the component has.
    if (held.kind === 'token' && isTheme) {
      out.checks.push('a token the theme already has under another name');
      const name = /--[\w-]+/.exec(what)?.[0], now = declarations(after), v = name ? now.get(name) : null;
      const same = v ? [...declarations(before)].filter(([n, x]) => n !== name && x === v).map(([n]) => n) : [];
      if (same.length) out.findings.push(`${name} is ${v}, which the theme already has as ${same.slice(0, 3).join(', ')}: use it instead, or say why the system needs both`);
    }
    if (held.kind === 'option' && held.component) {
      out.checks.push('an option the component already has, written another way');
      const c = [...contractsByFile(root, cfg).values()].find((x) => (x.name ?? '') === held.component);
      const [, prop, option] = /\s([\w-]+)=([\w-]+)$/.exec(what) ?? [];
      const opts = (c?.props ?? []).find((p) => p.name === prop)?.options ?? [];
      const twin = opts.map(String).find((o) => o !== option && squash(o) === squash(option));
      if (twin) out.findings.push(`${held.component} already has ${prop}=${twin}: ${option} is the same option written another way`);
    }
    try { out.scope = editScope({ file: held.file, before, after, root, files: { theme: new Set(themeFiles(cfg)), components: contractsByFile(root, cfg) } }, ctx); } catch { /* reviewed without it */ }
  } else {
    out.checks.push('what is still to answer', 'what it breaks');
    for (const q of change.questions ?? []) out.findings.push(`still to answer: ${q.ask}`);
    for (const b of change.breaking ?? []) out.findings.push(`it breaks ${b.what}`);
    out.scope = changeScope(change, ctx);
  }
  // Hard to undo, or high risk: a person's call whatever the setting.
  out.checks.push('how hard it is to undo');
  if (out.scope && (out.scope.undo === 'hard' || out.scope.risk === 'high')) out.findings.push(`${out.scope.undo === 'hard' ? 'it is hard to undo (a removal, a rename or a breaking change)' : 'it is of high risk'}: a person signs it off${out.scope.decider ? `, ${out.scope.decider.name} for this system` : ''}`);
  return out;
}
