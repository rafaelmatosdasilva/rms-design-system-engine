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
//   • each Figma annotation no check reads (annotationUses gives it no use) goes on the same page, in a frame
//     "Annotations no check reads": its component and layer, its words, and the wording a check reads when the engine
//     can tell what it means ("button" → "Role: button"). The annotation itself is never changed.
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
import { noteIsTodo } from './annotation-categories.mjs';

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

// One way of writing names: each property or option written otherwise than most of the system's, renamed in its
// component set (naming-consistency.mjs). → [{ kind: 'rename', component, nodeId, what, prop, from, to, why }]
export function renameEdits(propsSnap = {}, findings = []) {
  return findings.map((f) => {
    const entry = propsSnap?.[f.component];
    if (!entry?.nodeId) return null;
    return { kind: 'rename', component: f.component, nodeId: entry.nodeId, what: f.kind, prop: f.kind === 'option' ? f.prop : f.name, from: f.name, to: f.want, why: f.why };
  }).filter(Boolean);
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

// An annotation's words as a check reads them, when what it means can be told; null when it is a note for people.
const ROLE_SAID = [[/\b(toggle ?button|toggle)\b/i, 'togglebutton'], [/\bswitch\b/i, 'switch'], [/\bcheck ?box\b/i, 'checkbox'], [/\bradio\b/i, 'radio'],
  [/\b(spin ?button|stepper|number (input|field))\b/i, 'spinbutton'], [/\b(text ?field|text ?input|text ?box|search ?(box|field|input)|input)\b/i, 'textbox'],
  [/\b(dialog|modal)\b/i, 'dialog'], [/\btab\b/i, 'tab'], [/\blink\b/i, 'link'], [/\b(disclosure|accordion|expander)\b/i, 'disclosure'], [/\bbutton\b/i, 'button']];
const PART_SAID = [[/\b(error|error ?(text|message))\b/i, 'errormessage'], [/\b(helper|hint|caption|description|supporting ?text)\b/i, 'description'], [/\blabel\b/i, 'label'],
  [/\b(icon|decoration|chevron|check ?mark)\b/i, 'indicator']];
export function annotationWording(text = '', layer = null) {
  const t = String(text).replace(/[*_`]/g, ' ');
  const quoted = (/["“']([^"”']{1,60})["”']/.exec(t) ?? [])[1];
  if (/\b(esc|escape)\b/i.test(t)) return 'Escape closes it';
  if (/\barrows?\b/i.test(t)) return 'The arrow keys move between its items';
  if (/\b(enter|space ?bar|space)\b/i.test(t)) return 'Enter and Space activate it';
  const level = /\b(?:heading|title)\b\D{0,12}([1-6])\b/i.exec(t) ?? /\bh([1-6])\b/i.exec(t);
  if (level) return `Heading level ${level[1]}`;
  if (quoted && /\b(alt|alternative|image|img|picture|illustration)\b/i.test(t)) return `Alt: ${quoted}`;
  if (quoted && /\b(name|label|announce|read|says?|screen ?reader|aria)\b/i.test(t)) return `aria-label: ${quoted}`;
  if (layer) { const p = PART_SAID.find(([re]) => re.test(t) || re.test(layer)); if (p) return `Role: ${p[1]}`; }
  const r = ROLE_SAID.find(([re]) => re.test(t));
  return r ? `Role: ${r[1]}` : null;
}

// Each Figma annotation no check reads, with the wording a check reads. usesOf: annotationUses (a11y-check.mjs), passed in
// so this file stays free of the browser check. → [] or [{ kind: 'notes', page, frame, items: [{ component, layer?, text, wording }], why }]
export const NOTES_FRAME = 'Annotations no check reads';
// Only a note that states accessibility is listed (annotation-categories.mjs noteIsTodo): its category says so, or
// the engine reads an accessibility meaning in it. A note in a design-intent category (Intent, Implementation…), or
// one with no category the engine reads nothing in, is for the agents, not a to do. cats, cfg: the categories.
export function annotationEdits(propsSnap = {}, usesOf = () => [], cats = null, cfg = {}) {
  const items = [];
  for (const [name, entry] of Object.entries(propsSnap ?? {})) {
    if (name.startsWith('_') || !entry || typeof entry !== 'object') continue;
    for (const u of usesOf(entry, { cats, cfg })) {
      if (u.uses.length) continue;
      const wording = u.kind && u.kind !== 'accessibility' ? null : annotationWording(u.text, u.layer ?? null);
      if (!noteIsTodo(u.kind ?? null, wording)) continue;
      items.push({ component: name, ...(u.layer ? { layer: u.layer } : {}), text: u.text, wording });
    }
  }
  if (!items.length) return [];
  const can = items.filter((i) => i.wording).length;
  return [{ kind: 'notes', page: TODO_PAGE, frame: NOTES_FRAME, items, why: `${items.length} accessibility annotation${items.length === 1 ? '' : 's'} no check reads, ${can} with a wording a check reads` }];
}
const noteText = (n) => [n.layer ? `on the layer "${n.layer}"` : 'on the component', `says: ${n.text}`, n.wording ? `a check reads it written as: ${n.wording}` : 'an accessibility note no check reads yet: write it as Role: button, Alt: what it shows, Heading level 2, Escape closes, or Role: label on a layer'].join(' · ');

// The Figma plugin script for the edits a person approved (decisions are never in it). Idempotent: a node that
// already states a role is left as it is. Returns { changed, skipped, missing } for the agent to report.
export function applyScript(edits = []) {
  const todo = edits.filter((e) => e.kind === 'role' && e.nodeId && e.label).map((e) => ({ id: e.nodeId, component: e.component, label: e.label }));
  const list = edits.find((e) => e.kind === 'todo');
  const cards = list ? list.items.map((g) => ({ title: g.need, text: todoText(g) })) : null;
  const notes = edits.find((e) => e.kind === 'notes');
  const noteCards = notes ? notes.items.map((n) => ({ title: n.component, text: noteText(n) })) : null;
  const pageName = (list ?? notes)?.page;
  const renames = edits.filter((e) => e.kind === 'rename' && e.nodeId).map((e) => ({ id: e.nodeId, component: e.component, what: e.what, prop: e.prop, from: e.from, to: e.to }));
  return `// Written by rms-design-system-engine --figma-edits. Run it with the Figma MCP's use_figma only after the person said yes.
const edits = ${JSON.stringify(todo, null, 2)};
const changed = [], skipped = [], missing = [];
${renames.length ? `// Names written as the rest of the system writes them: options first (in each variant's name), then properties.
const renames = ${JSON.stringify(renames, null, 2)};
for (const r of renames.filter((x) => x.what === 'option')) {
  const set = await figma.getNodeByIdAsync(r.id);
  if (!set || !('children' in set)) { missing.push(r.component + ' ' + r.prop + '=' + r.from); continue; }
  let n = 0;
  for (const v of set.children) { const parts = String(v.name).split(/,\\s*/).map((p) => { const [k, val] = p.split('='); return k && k.trim() === r.prop && val && val.trim() === r.from ? k + '=' + r.to : p; }); const name = parts.join(', '); if (name !== v.name) { v.name = name; n++; } }
  if (n) changed.push(r.component + ': ' + r.prop + '=' + r.from + ' → ' + r.to); else skipped.push(r.component + ' ' + r.prop + '=' + r.from);
}
for (const r of renames.filter((x) => x.what === 'property')) {
  const set = await figma.getNodeByIdAsync(r.id);
  const defs = set && set.componentPropertyDefinitions ? set.componentPropertyDefinitions : null;
  if (!defs) { missing.push(r.component + ' ' + r.from); continue; }
  const key = Object.keys(defs).find((k) => k.replace(/#[\\d:]+$/, '') === r.from);
  if (!key) { (Object.keys(defs).some((k) => k.replace(/#[\\d:]+$/, '') === r.to) ? skipped : missing).push(r.component + ' ' + r.from); continue; }
  try { set.editComponentProperty(key, { name: r.to }); changed.push(r.component + ': ' + r.from + ' → ' + r.to); }
  catch (e) { missing.push(r.component + ' ' + r.from + ' (' + String(e && e.message || e) + ')'); }
}
` : ''}
for (const e of edits) {
  const node = await figma.getNodeByIdAsync(e.id);
  if (!node || !('annotations' in node)) { missing.push(e.component); continue; }
  const now = node.annotations || [];
  if (now.some((a) => /\\brole\\s*[:=]/i.test(String(a.label || a.labelMarkdown || '')))) { skipped.push(e.component); continue; }
  node.annotations = [...now.map((a) => (a.labelMarkdown ? { labelMarkdown: a.labelMarkdown, ...(a.properties ? { properties: a.properties } : {}), ...(a.categoryId ? { categoryId: a.categoryId } : {}) } : { label: a.label, ...(a.properties ? { properties: a.properties } : {}), ...(a.categoryId ? { categoryId: a.categoryId } : {}) })), { label: e.label }];
  changed.push(e.component + ' → ' + e.label);
}
${cards || noteCards ? `// The design team's to do list and the annotations no check reads: frames of their own on one page, each written
// afresh; nothing else in the file is touched.
const frames = ${JSON.stringify([cards && { name: list.frame, head: ' need', cards }, noteCards && { name: notes.frame, head: ' annotation', cards: noteCards }].filter(Boolean), null, 2)};
let page = figma.root.children.find((p) => p.name === ${JSON.stringify(pageName)});
if (!page) { page = figma.createPage(); page.name = ${JSON.stringify(pageName)}; }
if (page.loadAsync) await page.loadAsync();
await figma.loadFontAsync({ family: 'Inter', style: 'Regular' });
await figma.loadFontAsync({ family: 'Inter', style: 'Bold' });
const text = (chars, style, size) => { const t = figma.createText(); t.fontName = { family: 'Inter', style }; t.fontSize = size; t.characters = chars; return t; };
const written = [];
let nextX = 0;
for (const f of frames) {
  const old = page.children.find((n) => n.name === f.name);
  const at = old ? { x: old.x, y: old.y } : { x: nextX, y: 0 };
  if (old) old.remove();
  const box = figma.createFrame();
  box.name = f.name; box.layoutMode = 'VERTICAL'; box.itemSpacing = 12; box.paddingTop = box.paddingBottom = box.paddingLeft = box.paddingRight = 24;
  box.primaryAxisSizingMode = 'AUTO'; box.counterAxisSizingMode = 'AUTO'; box.x = at.x; box.y = at.y;
  box.appendChild(text(f.name + ' · ' + f.cards.length + f.head + (f.cards.length === 1 ? '' : 's') + (f.head === ' need' ? ', the most needed first' : ''), 'Bold', 20));
  for (const c of f.cards) {
    const card = figma.createFrame();
    card.name = c.title; card.layoutMode = 'VERTICAL'; card.itemSpacing = 4; card.paddingTop = card.paddingBottom = card.paddingLeft = card.paddingRight = 12;
    card.primaryAxisSizingMode = 'AUTO'; card.counterAxisSizingMode = 'AUTO'; card.cornerRadius = 8;
    card.strokes = [{ type: 'SOLID', color: { r: 0.8, g: 0.8, b: 0.8 } }];
    card.appendChild(text(c.title, 'Bold', 14));
    card.appendChild(text(c.text, 'Regular', 12));
    box.appendChild(card);
  }
  page.appendChild(box);
  nextX = Math.max(nextX, box.x + (box.width || 0) + 80);
  written.push(${JSON.stringify(pageName)} + ' › ' + f.name + ': ' + f.cards.length + f.head + (f.cards.length === 1 ? '' : 's'));
}
const todo = written.join('; ');
return { changed, skipped, missing, todo };` : 'return { changed, skipped, missing };'}
`;
}

// The lines the run prints: what would change, what a person decides.
export function editLines(edits, { fileKey = null } = {}) {
  const roles = edits.filter((e) => e.kind === 'role'), todo = edits.find((e) => e.kind === 'todo'), decide = edits.filter((e) => e.decision);
  const notes = edits.find((e) => e.kind === 'notes');
  const renames = edits.filter((e) => e.kind === 'rename');
  const apply = edits.filter((e) => !e.decision);
  if (!edits.length) return ['✅ Figma states every role the code has, writes its names one way, every annotation is read by a check, and no prototype needs anything the system lacks: nothing to send back.'];
  return [
    ...(roles.length ? [`Figma changes the engine can make (${roles.length}), each read from the code:`, ...roles.map((e) => `   • ${e.component}: add the annotation "${e.label}" (${e.why})`)] : ['✅ Figma states every role the code has.']),
    ...(renames.length ? [`Names written as the rest of the system writes them (${renames.length}):`, ...renames.map((e) => `   • ${e.component}: ${e.what === 'option' ? `${e.prop}=${e.from} → ${e.to}` : `"${e.from}" → "${e.to}"`}`), '   Each component\'s code contract follows the new names once Figma is read again.'] : []),
    ...(todo ? [`The design team's to do list in Figma, page "${todo.page}", frame "${todo.frame}" (${todo.why}), written afresh:`, ...todo.items.map((g) => `   • ${g.need}: ${todoText(g)}`)] : []),
    ...(notes ? [`Annotations no check reads, listed in Figma on the page "${notes.page}", frame "${notes.frame}" (${notes.why}); the annotations themselves are not changed:`, ...notes.items.map((n) => `   • ${n.component}${n.layer ? ` › ${n.layer}` : ''}: "${n.text}"${n.wording ? ` → write it as "${n.wording}"` : ' (an accessibility note: write it as Role:, Alt:, Heading level or a key, so a check reads it)'}`)] : []),
    ...(decide.length ? [`For a person to decide (${decide.length}), never applied:`, ...decide.map((e) => `   • ${e.component}: ${e.why}`)] : []),
    ...(apply.length ? [`NEXT: show the person the ${[roles.length ? `${roles.length} change${roles.length === 1 ? '' : 's'}` : '', renames.length ? `${renames.length} rename${renames.length === 1 ? '' : 's'}` : '', todo ? 'to do list' : '', notes ? 'annotations no check reads' : ''].filter(Boolean).join(' and ')} above and ask; only when they say yes, run the script in .design-system-engine-out/handback/figma-apply.js with the Figma MCP's use_figma${fileKey ? ` (fileKey ${fileKey})` : ''}, report what it returns, then refresh the Figma snapshots (rms-design-system-engine --refresh-figma)`] : []),
  ];
}

export function writeFigmaEdits(dir, edits) {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'figma-edits.json'), JSON.stringify(edits, null, 2) + '\n');
  writeFileSync(join(dir, 'figma-apply.js'), applyScript(edits));
  return { json: join(dir, 'figma-edits.json'), script: join(dir, 'figma-apply.js') };
}
