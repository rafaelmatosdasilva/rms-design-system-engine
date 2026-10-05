// figma-edits.mjs - the Figma side of the hand-back, made by the engine and applied only when a person says yes.
//
// handback.mjs lists what Figma should change when the code leads. This turns the part that needs no judgment into
// edits the engine itself writes, so no agent improvises them:
//   • a component whose code is a real control (a <button>, an <input type="checkbox">, role="switch"…) and whose
//     Figma component states no role gets the annotation "Role: <role>", the vocabulary the engine reads back;
//   • a component whose Figma role says one thing and whose code another is listed as a decision, never applied.
//   • what the prototypes needed and the system lacks (gaps.json) becomes the design team's to do list: a page
//     "Design system to do" with a frame "Gaps from prototypes", one card per need, the most needed first. Written
//     afresh each time; nothing else in the file is touched.
// What needs a person's words or a design decision (descriptions, missing components, layout) is never written here:
// the to do list only names the need, for the design team to decide.
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

// The to do list for the design team, from every prototype's gaps (gaps.json → merged): one edit, or none.
export const TODO_PAGE = 'Design system to do', TODO_FRAME = 'Gaps from prototypes';
export function gapEdits(merged = []) {
  const items = (merged ?? []).filter((g) => g?.need).map((g) => ({ need: String(g.need), kind: g.kind ?? 'component', closest: g.closest ?? null, used: g.used ?? null, note: g.note ?? null, prototypes: g.prototypes ?? [] }));
  if (!items.length) return [];
  const protos = new Set(items.flatMap((g) => g.prototypes));
  return [{ kind: 'todo', page: TODO_PAGE, frame: TODO_FRAME, items, why: `${items.length} need${items.length === 1 ? '' : 's'} the system lacks, from ${protos.size} prototype${protos.size === 1 ? '' : 's'}, the most needed first` }];
}
const todoText = (g) => {
  const n = g.prototypes.length;
  return [`${g.kind}`, g.used ? `meanwhile: ${g.used}` : g.closest ? `closest: ${g.closest}` : null, g.note, n ? `needed in ${n} prototype${n === 1 ? '' : 's'}: ${g.prototypes.join(', ')}` : null].filter(Boolean).join(' · ');
};

// The Figma plugin script for the edits a person approved (decisions are never in it). Idempotent: a node that
// already states a role is left as it is. Returns { changed, skipped, missing } for the agent to report.
export function applyScript(edits = []) {
  const todo = edits.filter((e) => e.kind === 'role' && e.nodeId && e.label).map((e) => ({ id: e.nodeId, component: e.component, label: e.label }));
  const list = edits.find((e) => e.kind === 'todo');
  const cards = list ? list.items.map((g) => ({ title: g.need, text: todoText(g) })) : null;
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
${cards ? `// The design team's to do list: its own page and frame, written afresh; nothing else in the file is touched.
const cards = ${JSON.stringify(cards, null, 2)};
let page = figma.root.children.find((p) => p.name === ${JSON.stringify(list.page)});
if (!page) { page = figma.createPage(); page.name = ${JSON.stringify(list.page)}; }
if (page.loadAsync) await page.loadAsync();
const old = page.children.find((n) => n.name === ${JSON.stringify(list.frame)});
const at = old ? { x: old.x, y: old.y } : { x: 0, y: 0 };
if (old) old.remove();
await figma.loadFontAsync({ family: 'Inter', style: 'Regular' });
await figma.loadFontAsync({ family: 'Inter', style: 'Bold' });
const text = (chars, style, size) => { const t = figma.createText(); t.fontName = { family: 'Inter', style }; t.fontSize = size; t.characters = chars; return t; };
const list = figma.createFrame();
list.name = ${JSON.stringify(list.frame)}; list.layoutMode = 'VERTICAL'; list.itemSpacing = 12; list.paddingTop = list.paddingBottom = list.paddingLeft = list.paddingRight = 24;
list.primaryAxisSizingMode = 'AUTO'; list.counterAxisSizingMode = 'AUTO'; list.x = at.x; list.y = at.y;
list.appendChild(text(${JSON.stringify(list.frame)} + ' · ' + cards.length + ' need' + (cards.length === 1 ? '' : 's') + ', the most needed first', 'Bold', 20));
for (const c of cards) {
  const card = figma.createFrame();
  card.name = c.title; card.layoutMode = 'VERTICAL'; card.itemSpacing = 4; card.paddingTop = card.paddingBottom = card.paddingLeft = card.paddingRight = 12;
  card.primaryAxisSizingMode = 'AUTO'; card.counterAxisSizingMode = 'AUTO'; card.cornerRadius = 8;
  card.strokes = [{ type: 'SOLID', color: { r: 0.8, g: 0.8, b: 0.8 } }];
  card.appendChild(text(c.title, 'Bold', 14));
  card.appendChild(text(c.text, 'Regular', 12));
  list.appendChild(card);
}
page.appendChild(list);
const todo = ${JSON.stringify(list.page)} + ' › ' + ${JSON.stringify(list.frame)} + ': ' + cards.length + ' need' + (cards.length === 1 ? '' : 's');
return { changed, skipped, missing, todo };` : 'return { changed, skipped, missing };'}
`;
}

// The lines the run prints: what would change, what a person decides.
export function editLines(edits, { fileKey = null } = {}) {
  const roles = edits.filter((e) => e.kind === 'role'), todo = edits.find((e) => e.kind === 'todo'), decide = edits.filter((e) => e.decision);
  const apply = edits.filter((e) => !e.decision);
  if (!edits.length) return ['✅ Figma states every role the code has, and no prototype needs anything the system lacks: nothing to send back.'];
  return [
    ...(roles.length ? [`Figma changes the engine can make (${roles.length}), each read from the code:`, ...roles.map((e) => `   • ${e.component}: add the annotation "${e.label}" (${e.why})`)] : ['✅ Figma states every role the code has.']),
    ...(todo ? [`The design team's to do list in Figma, page "${todo.page}", frame "${todo.frame}" (${todo.why}), written afresh:`, ...todo.items.map((g) => `   • ${g.need}: ${todoText(g)}`)] : []),
    ...(decide.length ? [`For a person to decide (${decide.length}), never applied:`, ...decide.map((e) => `   • ${e.component}: ${e.why}`)] : []),
    ...(apply.length ? [`NEXT: show the person the ${roles.length ? `${roles.length} change${roles.length === 1 ? '' : 's'}` : ''}${roles.length && todo ? ' and ' : ''}${todo ? 'to do list' : ''} above and ask; only when they say yes, run the script in .design-system-engine-out/handback/figma-apply.js with the Figma MCP's use_figma${fileKey ? ` (fileKey ${fileKey})` : ''}, report what it returns, then refresh the Figma snapshots (rms-design-system-engine --refresh-figma)`] : []),
  ];
}

export function writeFigmaEdits(dir, edits) {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'figma-edits.json'), JSON.stringify(edits, null, 2) + '\n');
  writeFileSync(join(dir, 'figma-apply.js'), applyScript(edits));
  return { json: join(dir, 'figma-edits.json'), script: join(dir, 'figma-apply.js') };
}
