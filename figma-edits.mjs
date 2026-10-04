// figma-edits.mjs - the Figma side of the hand-back, made by the engine and applied only when a person says yes.
//
// handback.mjs lists what Figma should change when the code leads. This turns the part that needs no judgment into
// edits the engine itself writes, so no agent improvises them:
//   • a component whose code is a real control (a <button>, an <input type="checkbox">, role="switch"…) and whose
//     Figma component states no role gets the annotation "Role: <role>", the vocabulary the engine reads back;
//   • a component whose Figma role says one thing and whose code another is listed as a decision, never applied.
// What needs a person's words or a design decision (descriptions, missing components, layout) is never written here.
//
// Two files under .design-system-engine-out/handback/:
//   figma-edits.json  every edit, with the component, its Figma node, what is added and why (what the code renders);
//   figma-apply.js    a Figma plugin script that makes exactly those edits and returns what it changed. The agent runs
//                     it with the Figma MCP's use_figma once the person has seen the list and said yes; the guard
//                     refuses any other Figma write. Running it twice changes nothing more.
// Pure apart from writeFigmaEdits.
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { roleWord } from './role-markup.mjs';

const attr = (attrs, name) => { const m = new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|\\{\\s*["']?([^}"']*)["']?\\s*\\})`, 'i').exec(attrs); return m ? (m[1] ?? m[2] ?? m[3] ?? '').trim() : null; };
const has = (attrs, name) => new RegExp(`\\b${name}\\b`, 'i').test(attrs);

// The role words the engine checks (role-markup.mjs ROLES), from the ARIA a page may write.
const ARIA_ROLE = { button: 'button', switch: 'switch', checkbox: 'checkbox', radio: 'radio', tab: 'tab', dialog: 'dialog', alertdialog: 'dialog', link: 'link', textbox: 'textbox', searchbox: 'textbox', spinbutton: 'spinbutton', img: 'img' };

// The role of one element: its tag and attributes. null when it is not a control the engine checks.
function elementRole(tag, attrs) {
  const explicit = attr(attrs, 'role');
  if (explicit) return ARIA_ROLE[explicit.toLowerCase()] ?? null;
  tag = tag.toLowerCase();
  if (tag === 'button') return has(attrs, 'aria-pressed') ? 'togglebutton' : has(attrs, 'aria-expanded') ? 'disclosure' : 'button';
  if (tag === 'a' && has(attrs, 'href')) return 'link';
  if (tag === 'textarea') return 'textbox';
  if (tag === 'dialog') return 'dialog';
  if (tag === 'input') {
    const type = (attr(attrs, 'type') ?? 'text').toLowerCase();
    if (type === 'checkbox') return 'checkbox';
    if (type === 'radio') return 'radio';
    if (type === 'number') return 'spinbutton';
    if (/^(button|submit|reset)$/.test(type)) return 'button';
    if (/^(text|search|email|tel|url|password)$/.test(type)) return 'textbox';
    return null;
  }
  if (/^h[1-6]$/.test(tag)) return 'heading';
  return null;
}

// The role the code gives a component, read from its markup: the root element's, or, for a <label> or a plain
// wrapper around exactly one control, that control's. A wrapper around several controls (a stepper, a group) is a
// composite: no single role, so null. → { role, element } or null.
export function codeRole(markup) {
  const html = String(markup ?? '');
  const tags = [...html.matchAll(/<([a-zA-Z][\w-]*)\b([^>]*)>/g)].map((m) => ({ tag: m[1], attrs: m[2], text: m[0] }));
  if (!tags.length) return null;
  const root = tags[0];
  const own = elementRole(root.tag, root.attrs);
  if (own) return { role: own, element: root.text };
  if (!/^(label|div|span|li)$/i.test(root.tag)) return null;
  const controls = tags.slice(1).map((t) => ({ ...t, role: elementRole(t.tag, t.attrs) })).filter((t) => t.role && t.role !== 'heading' && t.role !== 'img');
  if (controls.length !== 1) return null;
  // A plain wrapper counts only around a field or a choice: a card with one button inside is not a button.
  if (!/^label$/i.test(root.tag) && !/^(textbox|checkbox|radio|switch|spinbutton)$/.test(controls[0].role)) return null;
  return { role: controls[0].role, element: `${root.text}…${controls[0].text}` };
}

// The role of a component across every instance the code shows: the one most instances have. A number field among
// text fields is still a text field (a spinbutton is a typed textbox); instances that disagree otherwise are left out.
// → { role, element, agree, of } or null.
export function componentRole(markups = []) {
  const found = [...new Set(markups.filter(Boolean))].map(codeRole).filter(Boolean);
  if (!found.length) return null;
  const roles = new Set(found.map((f) => f.role));
  const merged = roles.size === 2 && roles.has('textbox') && roles.has('spinbutton') ? found.map((f) => ({ ...f, role: 'textbox' })) : found;
  const count = {};
  for (const f of merged) count[f.role] = (count[f.role] ?? 0) + 1;
  const [role, n] = Object.entries(count).sort((a, b) => b[1] - a[1])[0];
  if (Object.keys(count).length > 1 && n * 2 <= merged.length) return null;   // no clear majority: a person decides
  const pick = found.find((f) => f.role === role) ?? found[merged.findIndex((f) => f.role === role)];
  return { role, element: pick.element, agree: n, of: merged.length };
}

// Where a markup came from in the agreed view: only what the code itself shows counts (never one drawn from a role).
const FROM_CODE = new Set(['page', 'script', 'jsx', 'contract', 'probe']);

// propsSnap: the component-props snapshot (annotations, node ids) · components: the agreed view's components
// ({ name, markup, markups, markupFrom }) → [{ kind, component, nodeId, label?, figmaRole?, codeRole, element, why }].
export function figmaEdits(propsSnap = {}, components = []) {
  const byName = new Map(components.map((c) => [c.name, c]));
  const out = [];
  for (const [name, entry] of Object.entries(propsSnap ?? {})) {
    if (name.startsWith('_') || !entry?.nodeId) continue;
    const c = byName.get(name);
    if (!c || !FROM_CODE.has(c.markupFrom)) continue;
    const found = componentRole([c.markup, ...(c.markups ?? [])]);
    if (!found) continue;
    const figmaRole = roleWord(entry.annotations ?? []);
    if (!figmaRole) {
      out.push({ kind: 'role', component: name, nodeId: entry.nodeId, label: `Role: ${found.role}`, codeRole: found.role, element: found.element,
        why: `${found.of > 1 ? `${found.agree} of ${found.of} instances in the code render` : 'the code renders'} ${found.element.length > 90 ? `${found.element.slice(0, 87)}…` : found.element}, and Figma states no role` });
    } else if (figmaRole !== found.role && !(figmaRole === 'textfield' && found.role === 'textbox')) {
      out.push({ kind: 'role-differs', component: name, nodeId: entry.nodeId, figmaRole, codeRole: found.role, element: found.element, decision: true,
        why: `Figma says ${figmaRole}, the code renders a ${found.role}: a person decides which is right` });
    }
  }
  return out;
}

// The Figma plugin script for the edits a person approved (decisions are never in it). Idempotent: a node that
// already states a role is left as it is. Returns { changed, skipped, missing } for the agent to report.
export function applyScript(edits = []) {
  const todo = edits.filter((e) => e.kind === 'role' && e.nodeId && e.label).map((e) => ({ id: e.nodeId, component: e.component, label: e.label }));
  return `// Written by rms-design-system-engine --figma-edits. Run it with the Figma MCP's use_figma only after the person said yes.
const edits = ${JSON.stringify(todo, null, 2)};
const changed = [], skipped = [], missing = [];
for (const e of edits) {
  const node = await figma.getNodeByIdAsync(e.id);
  if (!node || !('annotations' in node)) { missing.push(e.component); continue; }
  const now = node.annotations || [];
  if (now.some((a) => /\\brole\\s*[:=]/i.test(String(a.label || a.labelMarkdown || '')))) { skipped.push(e.component); continue; }
  node.annotations = [...now.map((a) => (a.labelMarkdown ? { labelMarkdown: a.labelMarkdown, ...(a.properties ? { properties: a.properties } : {}), ...(a.categoryId ? { categoryId: a.categoryId } : {}) } : { label: a.label, ...(a.properties ? { properties: a.properties } : {}), ...(a.categoryId ? { categoryId: a.categoryId } : {}) })), { label: e.label }];
  changed.push(e.component + ' → ' + e.label);
}
return { changed, skipped, missing };
`;
}

// The lines the run prints: what would change, what a person decides.
export function editLines(edits, { fileKey = null } = {}) {
  const apply = edits.filter((e) => !e.decision), decide = edits.filter((e) => e.decision);
  if (!edits.length) return ['✅ Figma states every role the code has: nothing to send back.'];
  return [
    ...(apply.length ? [`Figma changes the engine can make (${apply.length}), each read from the code:`, ...apply.map((e) => `   • ${e.component}: add the annotation "${e.label}" (${e.why})`)] : []),
    ...(decide.length ? [`For a person to decide (${decide.length}), never applied:`, ...decide.map((e) => `   • ${e.component}: ${e.why}`)] : []),
    ...(apply.length ? [`NEXT: show the person the ${apply.length} change${apply.length === 1 ? '' : 's'} above and ask; only when they say yes, run the script in .design-system-engine-out/handback/figma-apply.js with the Figma MCP's use_figma${fileKey ? ` (fileKey ${fileKey})` : ''}, report what it returns, then refresh the Figma snapshots (rms-design-system-engine --refresh-figma)`] : []),
  ];
}

export function writeFigmaEdits(dir, edits) {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'figma-edits.json'), JSON.stringify(edits, null, 2) + '\n');
  writeFileSync(join(dir, 'figma-apply.js'), applyScript(edits));
  return { json: join(dir, 'figma-edits.json'), script: join(dir, 'figma-apply.js') };
}
