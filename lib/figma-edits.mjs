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
//   • what the Figma file owes for accessibility before any code exists (design-a11y.mjs designA11yGaps: a focus state
//     or a focus ring of 3:1, a control of 24px, a role and a name note, each text and icon colour's contrast in every
//     mode) goes on the same page, in a frame "Accessibility the design owes", one card per gap with its WCAG criterion
//     and its fix. Written afresh each time, so what is fixed clears.
//   • each designed screen read for accessibility (screen-a11y.mjs) gets its findings pinned where they are, one
//     annotation per failing layer listing all its issues (plain words first, the WCAG number second, the fix) and one
//     summary on the screen with the counts, in an "Accessibility Review" category; both replaced on each run, so what
//     is fixed clears.
//   • each component whose code the engine reads gets its accessibility spec as the code gives it (its role, what
//     names it, the states it says, the keys its role owes, what a screen reader says), in the "Accessibility"
//     category, for whoever builds it; replaced on each run.
// What needs a person's words or a design decision (descriptions, missing components, layout) is never written here:
// the to do list only names the need, for the design team to decide.
//
// Two files under .design-system-engine-out/handback/:
//   figma-edits.json  every edit, with the component, its Figma node, what is added and why (what the code renders);
//   figma-apply.js    a Figma plugin script that makes exactly those edits and returns what it changed. The agent runs
//                     it with the Figma MCP's use_figma once the person has seen the list and said yes; the guard
//                     refuses any other Figma write. Running it twice changes nothing more.
// Each write records the value it replaces before it changes it, and the run returns them as `undo`: only the script,
// running inside the file, can see what a value was. From that the way back is written beside the change
// (figma-undo.mjs, figma-undo.js), so a wrong edit is taken back the same way it was made.
// Pure apart from writeFigmaEdits.
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { roleWord } from './role-markup.mjs';
import { UNDO_PRELUDE } from './figma-undo.mjs';
import { behaviourSheetLines, partsInMarkup, PART_ROLES } from './behaviour-contract.mjs';
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
      if (/^\s*[*_]*\s*accessibility (spec|review)\b/i.test(String(u.text ?? ''))) continue;   // the engine's own, rewritten on each run
      const wording = u.kind && u.kind !== 'accessibility' ? null : annotationWording(u.text, u.layer ?? null);
      if (!noteIsTodo(u.kind ?? null, wording)) continue;
      items.push({ component: name, ...(u.layer ? { layer: u.layer } : {}), text: u.text, wording });
    }
  }
  if (!items.length) return [];
  const can = items.filter((i) => i.wording).length;
  return [{ kind: 'notes', page: TODO_PAGE, frame: NOTES_FRAME, items, why: `${items.length} accessibility annotation${items.length === 1 ? '' : 's'} no check reads, ${can} with a wording a check reads` }];
}
// What the Figma file owes for accessibility (design-a11y.mjs designA11yGaps), as the design team's to do list.
// → [] or [{ kind: 'a11y', page, frame, items: [{ component, text, fix, wcag }], why }]
export const A11Y_FRAME = 'Accessibility the design owes';
// Advice (design-a11y.mjs adviceFindings: an image's note, a disabled variant's reason, the states a control has, its
// accessibility notes) is no WCAG failure: a frame of its own, beside the one of what is owed.
export const ADVICE_FRAME = 'Advice for the Figma file';
export function designA11yEdits(gaps = [], wcagOf = () => null) {
  const itemOf = (g) => ({ component: g.component ?? null, kind: g.kind, text: String(g.text), fix: g.fix ? String(g.fix) : null, wcag: g.advice ? null : wcagOf(g) });
  const all = (gaps ?? []).filter((g) => g?.text), out = [];
  const frame = (list, name, word) => {
    if (!list.length) return;
    const items = list.map(itemOf), comps = new Set(items.map((i) => i.component).filter(Boolean));
    out.push({ kind: 'a11y', page: TODO_PAGE, frame: name, items, why: `${items.length} ${word}${items.length === 1 ? '' : 's'} in ${comps.size} component${comps.size === 1 ? '' : 's'}${items.some((i) => !i.component) ? ' and the system\'s colours' : ''}, read from Figma alone` });
  };
  frame(all.filter((g) => !g.advice), A11Y_FRAME, 'gap');
  frame(all.filter((g) => g.advice), ADVICE_FRAME, 'piece of advice');
  return out;
}
const a11yText = (i) => [i.text.replace(/\s*\(WCAG [^)]*\)/, ''), i.fix ? `fix: ${i.fix}` : null, i.wcag].filter(Boolean).join(' · ');

const noteText = (n) => [n.layer ? `on the layer "${n.layer}"` : 'on the component', `says: ${n.text}`, n.wording ? `a check reads it written as: ${n.wording}` : 'an accessibility note no check reads yet: write it as Role: button, Alt: what it shows, Heading level 2, Escape closes, or Role: label on a layer'].join(' · ');

// ── the screens' accessibility findings, pinned in Figma ─────────────────────────────────────────────────────────
export const REVIEW_CATEGORY = 'Accessibility Review', SPEC_CATEGORY = 'Accessibility';
const REVIEW_HEAD = `**${REVIEW_CATEGORY}**`, SPEC_HEAD = '**Accessibility spec**';
const KIND_WORDS = { contrast: 'contrast', plate: 'text on a picture', target: 'target size', bare: 'no surface' };
// One finding in words: what is wrong, then its WCAG number, then the fix.
export function pinWords(f) {
  const times = f.n > 1 ? ` (${f.n} times)` : '';
  const what = f.kind === 'contrast' ? `${f.what}${times} is ${f.ratio}:1 (${f.fg} on ${f.bg}), and needs ${f.need}:1.`
    : f.kind === 'plate' ? `${f.what}${times} sits on an image or a gradient, so its contrast cannot be measured.`
      : f.kind === 'target' ? `${f.what}${times} is drawn ${f.size}, under 24×24.`
        : `${f.count ?? f.n} text${(f.count ?? f.n) === 1 ? ' or icon has nothing drawn behind it' : 's and icons have nothing drawn behind them'} (the screen has no fill).`;
  return `${what} WCAG ${f.criterion}. Fix: ${f.fix}.`;
}
// findings: screenA11yFindings (each with its screenId and the layers it is on); screens: the screens read ({ id, name }).
// → [] or [{ kind: 'review', category, screens: [{ id, name, count, summary, pins: [{ node, label }] }], why }]
export function reviewEdits(findings = [], screens = []) {
  const read = (screens ?? []).filter((x) => x?.id);
  if (!read.length) return [];
  // Two screens with one name (the same window in two themes) are told apart by their node ids, as the findings are.
  const named = {}; for (const sc of read) named[sc.name] = (named[sc.name] || 0) + 1;
  const out = read.map((sc) => {
    const mine = findings.filter((f) => f.screenId === sc.id);
    const counts = {};
    for (const f of mine) counts[KIND_WORDS[f.kind] ?? f.kind] = (counts[KIND_WORDS[f.kind] ?? f.kind] ?? 0) + 1;
    const byNode = new Map();
    for (const f of mine) for (const id of (f.nodes ?? []).slice(0, 6)) { if (!byNode.has(id)) byNode.set(id, []); byNode.get(id).push(pinWords(f)); }
    // What has no layer to pin it on (no fill behind the screen, or a capture older than the layer ids) is said in the summary.
    const loose = mine.filter((f) => !(f.nodes ?? []).length);
    const summary = mine.length
      ? [`${REVIEW_HEAD}: ${mine.length} to fix (${Object.entries(counts).map(([k, n]) => `${k} ${n}`).join(', ')}).${!loose.length ? ' Each is pinned on its layer.' : loose.length < mine.length ? ' Each one on a layer is pinned there.' : ''}`, ...loose.map(pinWords)].join('\n\n')
      : `${REVIEW_HEAD}: nothing to fix. Every text and icon read passes contrast, and every control is at least 24×24.`;
    return { id: sc.id, name: named[sc.name] > 1 ? `${sc.name} (${sc.id})` : sc.name, count: mine.length, summary, pins: [...byNode].map(([node, list]) => ({ node, label: `${REVIEW_HEAD}\n${list.join('\n\n')}` })) };
  });
  const total = out.reduce((n, x) => n + x.count, 0);
  return [{ kind: 'review', category: REVIEW_CATEGORY, screens: out, why: `${total} to fix on ${read.length} screen${read.length === 1 ? '' : 's'}, each pinned on its layer, with a summary on each screen` }];
}

// ── each component's accessibility spec, as the code gives it ─────────────────────────────────────────────────────
const STATE_ATTRS = [['aria-pressed', 'pressed (aria-pressed)'], ['aria-checked', 'checked (aria-checked)'], ['checked', 'checked'], ['aria-expanded', 'expanded (aria-expanded)'],
  ['aria-selected', 'selected (aria-selected)'], ['aria-current', 'current (aria-current)'], ['aria-invalid', 'invalid (aria-invalid)'], ['aria-disabled', 'disabled (aria-disabled)'],
  ['disabled', 'disabled'], ['aria-required', 'required (aria-required)'], ['required', 'required'], ['aria-busy', 'busy (aria-busy)'], ['aria-valuenow', 'its value (aria-valuenow)']];
// The keys each role owes (the ARIA practices the browser checks hold a page to), said for whoever builds it.
const KEYS_OWED = {
  button: 'Tab reaches it; Enter and Space press it', togglebutton: 'Tab reaches it; Enter and Space flip it', link: 'Tab reaches it; Enter follows it',
  checkbox: 'Tab reaches it; Space checks and unchecks it', switch: 'Tab reaches it; Space flips it', textbox: 'Tab reaches it; typing writes into it',
  radio: 'Tab reaches the checked option of its group; the arrow keys move between the options and check them',
  spinbutton: 'Tab reaches it; the up and down arrows change its value', tab: 'Tab reaches the selected tab; the arrow keys move between the tabs',
  disclosure: 'Tab reaches it; Enter and Space show or hide its panel',
  dialog: 'the focus moves into it when it opens and Tab keeps it inside; Escape closes it and the focus goes back to what opened it',
};
// What names a component, read from its markup: the first of an aria-labelledby, an aria-label, a <label>, its own words.
export function nameSource(markups = []) {
  const all = markups.filter(Boolean).join('\n');
  if (!all) return null;
  const al = /\baria-label\s*=\s*(?:"([^"]*)"|'([^']*)')/i.exec(all);
  if (/\baria-labelledby\s*=/i.test(all)) return 'the element its aria-labelledby points to';
  if (al) return `aria-label ("${(al[1] ?? al[2] ?? '').slice(0, 40)}")`;
  if (/<label\b/i.test(all) || /\bfor\s*=/i.test(all)) return 'its label';
  if (/\balt\s*=\s*"[^"]+"/i.test(all)) return 'its alt text';
  const words = all.replace(/<svg[\s\S]*?<\/svg>/gi, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  if (words) return 'its words';
  if (/\btitle\s*=/i.test(all)) return 'only its title, a tooltip a touch screen never shows: give it words or an aria-label';
  return 'nothing yet: give it words or an aria-label';
}
export function statesOf(markups = []) {
  const all = markups.filter(Boolean).join('\n');
  return STATE_ATTRS.filter(([a]) => new RegExp(`\\s${a}(\\s*=|[\\s>/])`, 'i').test(all)).map(([, w]) => w).filter((w, i, xs) => !xs.slice(0, i).some((x) => x.split(' ')[0] === w.split(' ')[0]));
}
// propsSnap, components: as figmaEdits; heard: what a screen reader says for each component (the last accessibility
// check, a11y.json heard). → [{ kind: 'spec', component, nodeId, role, label, why }]
export function specEdits(propsSnap = {}, components = [], { heard = {} } = {}) {
  const byName = new Map(components.map((c) => [c.name, c]));
  const out = [];
  for (const [name, entry] of Object.entries(propsSnap ?? {})) {
    if (name.startsWith('_') || !entry?.nodeId) continue;
    const c = byName.get(name);
    if (!c || !FROM_CODE.has(c.markupFrom)) continue;
    const markups = [c.markup, ...(c.markups ?? [])].filter(Boolean);
    const found = componentRole(markups);
    const figmaRole = roleWord((entry.annotations ?? []).filter((a) => !String(a?.labelMarkdown ?? a?.label ?? '').startsWith(SPEC_HEAD)));
    const differs = found && figmaRole && figmaRole !== found.role && !(figmaRole === 'textfield' && found.role === 'textbox');
    const states = statesOf(markups), named = nameSource(markups), keys = found ? KEYS_OWED[found.role] ?? null : null;
    const parts = partsInMarkup(markups[0] ?? '');
    const does = found ? behaviourSheetLines(found.role).filter((l) => !keys?.includes(l)) : [];
    const says = (heard[name] ?? []).slice(0, 4).join(' · ');
    if (!found && !states.length) continue;   // a wrapper of several controls with no state of its own: nothing to state
    const lines = [`${SPEC_HEAD} (from the code, replaced on each run)`,
      found ? (differs ? `The role is a decision still open: Figma says ${figmaRole}, the code renders a ${found.role}.` : `Role: ${found.role}`) : null,
      named ? `Name: ${named}` : null,
      states.length ? `States: ${states.join(', ')}` : null,
      keys ? `Keys: ${keys}` : null,
      does.length ? `Behaviour: ${does.join('; ')}` : null,
      // Its parts, read from the markup, each with what it owes the control: what Figma's layer annotations can confirm.
      found && parts.length ? `Parts: ${parts.map((x) => `${x.part} ${x.element} ${PART_ROLES[x.part]}`).join('; ')}` : null,
      says ? `A screen reader says: ${says}` : null].filter(Boolean);
    out.push({ kind: 'spec', component: name, nodeId: entry.nodeId, role: found && !differs ? found.role : null, label: lines.join('\n'),
      why: [found ? `${/^[aeiou]/.test(found.role) ? 'an' : 'a'} ${found.role}` : 'a composite', named ? `named by ${named.split(':')[0]}` : null, states.length ? `${states.length} state${states.length === 1 ? '' : 's'}` : null].filter(Boolean).join(', ') });
  }
  return out;
}

// A value written into the plugin script as a literal: JSON, with the characters that could end a string or a script
// written as escapes, so text read from Figma (a name, a label) can never become code.
const lit = (v, ...a) => (JSON.stringify(v, ...a) ?? 'undefined').replace(/[<>/\u2028\u2029]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`);

// The Figma plugin script for the edits a person approved (decisions are never in it). Idempotent: a node that
// already states a role, or a name already renamed, is left as it is. A rename is of an option, a property, the
// component itself or a layer in every variant (the construction fixes: --figma-fix). Returns { changed, skipped, missing } for the agent to report.
export function applyScript(edits = []) {
  const todo = edits.filter((e) => e.kind === 'role' && e.nodeId && e.label).map((e) => ({ id: e.nodeId, component: e.component, label: e.label }));
  const list = edits.find((e) => e.kind === 'todo');
  const cards = list ? list.items.map((g) => ({ title: g.need, text: todoText(g) })) : null;
  const notes = edits.find((e) => e.kind === 'notes');
  const noteCards = notes ? notes.items.map((n) => ({ title: n.component, text: noteText(n) })) : null;
  const owed = edits.find((e) => e.kind === 'a11y');
  const a11yCards = owed ? owed.items.map((i) => ({ title: i.component ?? 'The system\'s colours', text: a11yText(i) })) : null;
  const pageName = (list ?? notes ?? owed)?.page;
  const renames = edits.filter((e) => e.kind === 'rename' && e.nodeId).map((e) => ({ id: e.nodeId, component: e.component, what: e.what, prop: e.prop, from: e.from, to: e.to }));
  const review = edits.find((e) => e.kind === 'review');
  const specs = edits.filter((e) => e.kind === 'spec' && e.nodeId).map((e) => ({ id: e.nodeId, component: e.component, label: e.label }));
  const devlinks = edits.find((e) => e.kind === 'devlinks'), syntax = edits.find((e) => e.kind === 'codesyntax');
  const descs = edits.find((e) => e.kind === 'descriptions');
  const back = edits.find((e) => e.kind === 'tokensback');
  const specframes = edits.find((e) => e.kind === 'specframes');
  return `// Written by rms-design-system-engine --figma-edits. Run it with the Figma MCP's use_figma only after the person said yes.
const edits = ${lit(todo, null, 2)};
const changed = [], skipped = [], missing = [];
${UNDO_PRELUDE}
// An annotation kept as it is, rebuilt in the form the API takes back.
const keep = (a) => (a.labelMarkdown ? { labelMarkdown: a.labelMarkdown } : { label: a.label || '' });
const keepAll = (a) => ({ ...keep(a), ...(a.properties ? { properties: a.properties } : {}), ...(a.categoryId ? { categoryId: a.categoryId } : {}) });
const category = async (label, color) => { const all = await figma.annotations.getAnnotationCategoriesAsync(); return all.find((c) => String(c.label).toLowerCase() === label.toLowerCase()) || await figma.annotations.addAnnotationCategoryAsync({ label, color }); };
const pageOf = async (n) => { let p = n; while (p && p.type !== 'PAGE') p = p.parent; if (p && p.loadAsync) await p.loadAsync(); };
${devlinks ? `// Dev Mode: each component set linked to its code file, once.
const devlinks = ${lit(devlinks.items.map((l) => ({ id: l.nodeId, component: l.component, url: l.url, file: l.file })), null, 2)};
for (const l of devlinks) {
  const n = await figma.getNodeByIdAsync(l.id);
  if (!n || !('addDevResourceAsync' in n)) { missing.push(l.component); continue; }
  const have = await n.getDevResourcesAsync();
  if (have.some((r) => r.url === l.url)) { skipped.push(l.component + ': linked to its code already'); continue; }
  U.devResource(n, l.url);
  await n.addDevResourceAsync(l.url, l.file);
  changed.push(l.component + ': linked to ' + l.file);
}` : ''}
${syntax ? `// Dev Mode: each variable's CSS name as its Web code syntax; one written otherwise is changed and said.
const except = ${lit(syntax.except)};
const cssOf = (name) => except[name] || (${lit(syntax.prefix)} + name.split('/').join('-'));
const otherSyntax = [];
let given = 0, already = 0;
for (const v of await figma.variables.getLocalVariablesAsync()) {
  const want = 'var(' + cssOf(v.name) + ')', now = v.codeSyntax && v.codeSyntax.WEB;
  if (now === want) { already++; continue; }
  if (now) otherSyntax.push(v.name + ': ' + now + ' → ' + want);
  U.codeSyntax(v, 'WEB');
  v.setVariableCodeSyntax('WEB', want); given++;
}
changed.push(given + ' variables given their CSS name as Web code syntax' + (otherSyntax.length ? ' (' + otherSyntax.length + ' had another)' : ''));
if (already) skipped.push(already + ' variables had it already');` : ''}
${descs ? `// Descriptions the intent layer approved, written only where Figma's is still empty. Each is checked again here,
// in the file: one a designer typed since this list was made is left as it is, never written over.
const descs = ${lit({ variables: descs.variables, components: descs.components, replace: descs.replace || [] }, null, 2)};
const keptOwn = [];
let described = 0;
const byName = new Map((await figma.variables.getLocalVariablesAsync()).map((v) => [v.name, v]));
for (const d of descs.variables) {
  const v = byName.get(d.name);
  if (!v) { missing.push(d.name); continue; }
  if (String(v.description || '').trim()) { keptOwn.push(d.name); continue; }
  U.variableDescription(v);
  v.description = d.text; described++;
}
for (const d of descs.components) {
  const n = await figma.getNodeByIdAsync(d.id);
  if (!n || !('description' in n)) { missing.push(d.component); continue; }
  await pageOf(n);
  if (String(n.description || '').trim()) { keptOwn.push(d.component); continue; }
  U.description(n);
  n.description = d.text; described++;
}
// Written over at the person's word: only where Figma still holds exactly the text they saw, so a later change stays.
const movedOn = [];
for (const d of (descs.replace || [])) {
  const node = d.kind === 'component' ? await figma.getNodeByIdAsync(d.id) : byName.get(d.name);
  if (!node) { missing.push(d.name); continue; }
  if (d.kind === 'component') await pageOf(node);
  if (String(node.description || '').trim() !== String(d.was).trim()) { movedOn.push(d.name); continue; }
  if (d.kind === 'component') U.description(node); else U.variableDescription(node);
  node.description = d.text; described++;
}
if (movedOn.length) skipped.push(movedOn.length + ' changed in Figma again since you chose to replace them, left as they are: ' + movedOn.slice(0, 8).join(', '));
changed.push(described + ' descriptions written from the intent layer');
if (keptOwn.length) skipped.push(keptOwn.length + ' had a description of their own since this list was made, left as it is: ' + keptOwn.slice(0, 8).join(', '));` : ''}
${back ? `// Tokens the code changed first, written back to Figma's variables. Each value Figma holds is read again here: one that
// is no longer what the list was made from was changed in Figma since, and is a conflict, shown and never written over.
const back = ${lit({ changes: back.changes, created: back.created }, null, 2)};
const conflicts = [];
const vars = await figma.variables.getLocalVariablesAsync();
const byVar = new Map(vars.map((v) => [v.name, v]));
const cols = await figma.variables.getLocalVariableCollectionsAsync();
const colOf = async (v) => cols.find((c) => c.id === v.variableCollectionId) || await figma.variables.getVariableCollectionByIdAsync(v.variableCollectionId);
const near = (a, b) => {
  if (a && typeof a === 'object' && a.type === 'VARIABLE_ALIAS') return false;
  if (typeof a === 'number' && typeof b === 'number') return Math.abs(a - b) < 0.01;
  if (a && b && typeof a === 'object' && typeof b === 'object') return ['r', 'g', 'b', 'a'].every((k) => Math.abs((a[k] == null ? 1 : a[k]) - (b[k] == null ? 1 : b[k])) < 0.005);
  return String(a) === String(b);
};
let wrote = 0, made = 0;
for (const c of back.changes) {
  const v = byVar.get(c.name);
  if (!v) { missing.push(c.name); continue; }
  const col = await colOf(v);
  const mode = col && col.modes.find((m) => m.name === c.mode);
  if (!mode) { missing.push(c.name + ' (no mode ' + c.mode + ')'); continue; }
  const now = v.valuesByMode[mode.modeId];
  const isAlias = now && typeof now === 'object' && now.type === 'VARIABLE_ALIAS';
  // Unchanged since the list was made: the value read then, or the alias it named then.
  if (isAlias ? !c.breaksAlias : !near(now, c.figma)) { conflicts.push(c.name + ' (' + c.mode + ')'); continue; }
  U.variableValue(v, mode.modeId);
  v.setValueForMode(mode.modeId, c.value); wrote++;
}
for (const n of back.created) {
  if (byVar.has(n.name)) { skipped.push(n.name + ': already a variable in this file'); continue; }
  const col = cols.find((c) => c.name === n.collection);
  if (!col) { missing.push(n.name + ' (no collection ' + n.collection + ')'); continue; }
  const v = figma.variables.createVariable(n.name, col, n.kind);
  U.madeVariable(v);
  for (const [modeName, value] of Object.entries(n.values)) { const m = col.modes.find((x) => x.name === modeName); if (m) v.setValueForMode(m.modeId, value); }
  made++;
}
changed.push(wrote + ' values the code changed first written to Figma' + (made ? ', ' + made + ' variables the code added made' : ''));
if (conflicts.length) skipped.push(conflicts.length + ' changed in Figma since this list was made, left as they are for a person to decide: ' + conflicts.slice(0, 8).join(', '));` : ''}
${specframes ? `// Each component's spec, a frame beside its component set, drawn from its contract. A frame whose contract is the one it
// was drawn from is left as it is; a stale one is drawn afresh. The frames are the engine's own output.
const specs = ${lit(specframes.items, null, 2)};
await figma.loadFontAsync({ family: 'Inter', style: 'Regular' });
await figma.loadFontAsync({ family: 'Inter', style: 'Bold' });
const stext = (chars, style, size) => { const t = figma.createText(); t.fontName = { family: 'Inter', style }; t.fontSize = size; t.characters = chars; return t; };
const unplaced = [];
let drawn = 0, current = 0;
for (const s of specs) {
  const set = await figma.getNodeByIdAsync(s.nodeId);
  if (!set || !set.parent) { missing.push(s.component); continue; }
  await pageOf(set);
  const old = set.parent.children.find((n) => n.name === s.title);
  if (old && old.getSharedPluginData && old.getSharedPluginData('rms_dse', 'spec') === s.fingerprint) { current++; continue; }
  if (old) { U.remade(s.title, 'run the hand-back again (rms-design-system-engine --figma-specs) and it is drawn afresh'); old.remove(); }
  const box = figma.createFrame();
  box.name = s.title; box.layoutMode = 'VERTICAL'; box.itemSpacing = 16; box.paddingTop = box.paddingBottom = box.paddingLeft = box.paddingRight = 32;
  box.primaryAxisSizingMode = 'AUTO'; box.counterAxisSizingMode = 'AUTO'; box.cornerRadius = 12;
  box.fills = [{ type: 'SOLID', color: { r: 1, g: 1, b: 1 } }];
  box.strokes = [{ type: 'SOLID', color: { r: 0.85, g: 0.85, b: 0.85 } }];
  box.appendChild(stext(s.title, 'Bold', 24));
  // The anatomy: an instance of the default variant, a numbered marker on each part the contract names.
  const proto = set.type === 'COMPONENT_SET' ? (set.defaultVariant || set.children[0]) : set;
  if (proto && proto.createInstance) {
    const stage = figma.createFrame();
    stage.name = 'Anatomy'; stage.fills = []; stage.clipsContent = false;
    const inst = proto.createInstance();
    stage.resize(Math.max(inst.width + 48, 120), inst.height + 48);
    stage.appendChild(inst); inst.x = 24; inst.y = 24;
    for (const p of s.parts) {
      const layer = inst.findOne ? inst.findOne((n) => n.name === p.name) : null;
      if (!layer || !layer.absoluteBoundingBox || !inst.absoluteBoundingBox) { unplaced.push(s.component + ' › ' + p.name); continue; }
      const cx = layer.absoluteBoundingBox.x - inst.absoluteBoundingBox.x + inst.x + layer.absoluteBoundingBox.width / 2;
      const cy = layer.absoluteBoundingBox.y - inst.absoluteBoundingBox.y + inst.y;
      const dot = figma.createEllipse(); dot.resize(20, 20); dot.x = cx - 10; dot.y = cy - 22;
      dot.fills = [{ type: 'SOLID', color: { r: 0.85, g: 0.1, b: 0.4 } }];
      const num = stext(String(p.n), 'Bold', 11); num.fills = [{ type: 'SOLID', color: { r: 1, g: 1, b: 1 } }];
      num.x = cx - num.width / 2; num.y = cy - 22 + (20 - num.height) / 2;
      stage.appendChild(dot); stage.appendChild(num);
    }
    box.appendChild(stage);
  }
  for (const sec of s.sections) {
    box.appendChild(stext(sec.title, 'Bold', 14));
    box.appendChild(stext(sec.lines.join('\n'), 'Regular', 12));
  }
  set.parent.appendChild(box);
  box.x = set.x + set.width + 80; box.y = set.y;
  if (box.setSharedPluginData) box.setSharedPluginData('rms_dse', 'spec', s.fingerprint);
  U.made(box, s.title);
  drawn++;
}
changed.push(drawn + ' component specs drawn beside their component sets');
if (current) skipped.push(current + ' specs already drawn from the contract as it is now, left as they are');
if (unplaced.length) skipped.push(unplaced.length + ' parts with no layer of their name in the component, listed with no marker: ' + unplaced.slice(0, 8).join(', '));` : ''}
${review ? `// the screens' accessibility findings. What the last run pinned goes first, so what is fixed clears.
const review = ${lit(review.screens.map((x) => ({ id: x.id, name: x.name, summary: x.summary, pins: x.pins })), null, 2)};
const reviewCat = await category(${lit(REVIEW_CATEGORY)}, 'red');
for (const s of review) {
  const screen = await figma.getNodeByIdAsync(s.id);
  if (!screen || !('annotations' in screen)) { missing.push(s.name); continue; }
  await pageOf(screen);
  const outside = (n) => { for (let p = n.parent; p && p !== screen; p = p.parent) if (p.type === 'INSTANCE') return false; return true; };
  for (const n of [screen, ...(screen.findAll ? screen.findAll((x) => 'annotations' in x && outside(x)) : [])]) {
    const now = n.annotations || [];
    if (now.some((a) => a.categoryId === reviewCat.id)) { U.annotations(n); n.annotations = now.filter((a) => a.categoryId !== reviewCat.id).map(keepAll); }
  }
  U.annotations(screen);
  screen.annotations = [...(screen.annotations || []).map(keepAll), { labelMarkdown: s.summary, categoryId: reviewCat.id }];
  let pinned = 0;
  for (const p of s.pins) {
    const node = await figma.getNodeByIdAsync(p.node);
    if (!node || !('annotations' in node)) { missing.push(s.name + ' › ' + p.node); continue; }
    // The step is recorded before the write and kept even when the write throws: putting a value back that never
    // changed does nothing, while a write that did land with no record of it could not be taken back at all.
    try { U.annotations(node); node.annotations = [...(node.annotations || []).map(keepAll), { labelMarkdown: p.label, categoryId: reviewCat.id }]; pinned++; } catch (e) { missing.push(s.name + ' › ' + node.name + ' (' + String(e && e.message || e) + ')'); }
  }
  changed.push(s.name + ': review summary and ' + pinned + ' pinned');
}
` : ''}${specs.length ? `// each component's accessibility spec from the code, replacing the one the last run wrote.
const specs = ${lit(specs, null, 2)};
const specCat = await category(${lit(SPEC_CATEGORY)}, 'blue');
for (const sp of specs) {
  const node = await figma.getNodeByIdAsync(sp.id);
  if (!node || !('annotations' in node)) { missing.push(sp.component); continue; }
  const now = (node.annotations || []).filter((a) => !String(a.labelMarkdown || a.label || '').startsWith(${lit(SPEC_HEAD)}));
  U.annotations(node);
  node.annotations = [...now.map(keepAll), { labelMarkdown: sp.label, categoryId: specCat.id }];
  changed.push(sp.component + ' → accessibility spec');
}
` : ''}
${renames.length ? `// Names written as the rest of the system writes them: options first (in each variant's name), then properties.
const renames = ${lit(renames, null, 2)};
for (const r of renames.filter((x) => x.what === 'option')) {
  const set = await figma.getNodeByIdAsync(r.id);
  if (!set || !('children' in set)) { missing.push(r.component + ' ' + r.prop + '=' + r.from); continue; }
  let n = 0;
  for (const v of set.children) { const parts = String(v.name).split(/,\\s*/).map((p) => { const [k, val] = p.split('='); return k && k.trim() === r.prop && val && val.trim() === r.from ? k + '=' + r.to : p; }); const name = parts.join(', '); if (name !== v.name) { U.name(v); v.name = name; n++; } }
  if (n) changed.push(r.component + ': ' + r.prop + '=' + r.from + ' → ' + r.to); else skipped.push(r.component + ' ' + r.prop + '=' + r.from);
}
for (const r of renames.filter((x) => x.what === 'property')) {
  const set = await figma.getNodeByIdAsync(r.id);
  const defs = set && set.componentPropertyDefinitions ? set.componentPropertyDefinitions : null;
  if (!defs) { missing.push(r.component + ' ' + r.from); continue; }
  const key = Object.keys(defs).find((k) => k.replace(/#[\\d:]+$/, '') === r.from);
  if (!key) { (Object.keys(defs).some((k) => k.replace(/#[\\d:]+$/, '') === r.to) ? skipped : missing).push(r.component + ' ' + r.from); continue; }
  try { U.propertyName(set, r.to, r.from); set.editComponentProperty(key, { name: r.to }); changed.push(r.component + ': ' + r.from + ' → ' + r.to); }
  catch (e) { missing.push(r.component + ' ' + r.from + ' (' + String(e && e.message || e) + ')'); }
}
for (const r of renames.filter((x) => x.what === 'component')) {
  const set = await figma.getNodeByIdAsync(r.id);
  if (!set) { missing.push(r.component); continue; }
  if (set.name === r.to) { skipped.push(r.component); continue; }
  if (set.name !== r.from) { missing.push(r.component + ' (named ' + set.name + ' now)'); continue; }
  U.name(set); set.name = r.to; changed.push(r.from + ' → ' + r.to);
}
// A layer renamed in every variant; never inside an instance, whose layers are its own component's.
for (const r of renames.filter((x) => x.what === 'layer')) {
  const set = await figma.getNodeByIdAsync(r.id);
  if (!set) { missing.push(r.component + ' › ' + r.from); continue; }
  const inInstance = (n) => { for (let p = n.parent; p && p !== set; p = p.parent) if (p.type === 'INSTANCE') return true; return false; };
  const found = set.findAll ? set.findAll((n) => n.name === r.from && !inInstance(n)) : [];
  if (!found.length) { (set.findAll && set.findAll((n) => n.name === r.to).length ? skipped : missing).push(r.component + ' › ' + r.from); continue; }
  for (const n of found) { U.name(n); n.name = r.to; }
  changed.push(r.component + ' › ' + r.from + ' → ' + r.to + (found.length > 1 ? ' (' + found.length + ' layers)' : ''));
}
` : ''}
for (const e of edits) {
  const node = await figma.getNodeByIdAsync(e.id);
  if (!node || !('annotations' in node)) { missing.push(e.component); continue; }
  const now = node.annotations || [];
  if (now.some((a) => /\\brole\\s*[:=]/i.test(String(a.label || a.labelMarkdown || '')))) { skipped.push(e.component); continue; }
  U.annotations(node);
  node.annotations = [...now.map((a) => (a.labelMarkdown ? { labelMarkdown: a.labelMarkdown, ...(a.properties ? { properties: a.properties } : {}), ...(a.categoryId ? { categoryId: a.categoryId } : {}) } : { label: a.label, ...(a.properties ? { properties: a.properties } : {}), ...(a.categoryId ? { categoryId: a.categoryId } : {}) })), { label: e.label }];
  changed.push(e.component + ' → ' + e.label);
}
${cards || noteCards || a11yCards ? `// The design team's to do list, the accessibility the design owes and the annotations no check reads: frames of their
// own on one page, each written afresh; nothing else in the file is touched.
const frames = ${lit([cards && { name: list.frame, head: ' need', cards }, a11yCards && { name: owed.frame, head: ' gap', cards: a11yCards }, noteCards && { name: notes.frame, head: ' annotation', cards: noteCards }].filter(Boolean), null, 2)};
let page = figma.root.children.find((p) => p.name === ${lit(pageName)});
if (!page) { page = figma.createPage(); page.name = ${lit(pageName)}; U.made(page, 'the page ' + ${lit(pageName)}); }
if (page.loadAsync) await page.loadAsync();
await figma.loadFontAsync({ family: 'Inter', style: 'Regular' });
await figma.loadFontAsync({ family: 'Inter', style: 'Bold' });
const text = (chars, style, size) => { const t = figma.createText(); t.fontName = { family: 'Inter', style }; t.fontSize = size; t.characters = chars; return t; };
const written = [];
let nextX = 0;
for (const f of frames) {
  const old = page.children.find((n) => n.name === f.name);
  const at = old ? { x: old.x, y: old.y } : { x: nextX, y: 0 };
  // This frame is the engine's own, written afresh on every run: replacing it loses no one else's work, so the way
  // back is to run the hand-back again rather than to refuse the whole undo.
  if (old) { U.remade(${lit(pageName)} + ' › ' + f.name, 'run the hand-back again (rms-design-system-engine --figma-edits) and it is written afresh'); old.remove(); }
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
  U.made(box, ${lit(pageName)} + ' › ' + f.name);
  nextX = Math.max(nextX, box.x + (box.width || 0) + 80);
  written.push(${lit(pageName)} + ' › ' + f.name + ': ' + f.cards.length + f.head + (f.cards.length === 1 ? '' : 's'));
}
const todo = written.join('; ');
return { changed, skipped, missing, todo, undo${syntax ? ', otherSyntax' : ''} };` : `return { changed, skipped, missing, undo${syntax ? ', otherSyntax' : ''} };`}
`;
}

// Each kind of change a person says yes to on its own: one yes never covers more than they read. A Figma file is the
// whole design team's, so a role note and a rename are two answers, never one (--figma-edits <kind…>). The writes
// --figma-descriptions, --figma-tokens-back and --figma-specs make are each a command of their own already.
export const EDIT_KINDS = {
  roles: { kinds: ['role'], says: 'role notes read from the code' },
  'accessibility-specs': { kinds: ['spec'], says: 'each component\'s accessibility spec, as an annotation' },
  'accessibility-review': { kinds: ['review'], says: 'the screens\' accessibility findings, pinned on their layers' },
  renames: { kinds: ['rename'], says: 'names written as the rest of the system writes them' },
  'dev-mode': { kinds: ['devlinks', 'codesyntax'], says: 'Dev Mode links to the code and code syntax' },
  'to-do': { kinds: ['todo', 'a11y', 'notes'], says: 'the design team\'s to do page' },
};
export const kindOf = (e) => Object.keys(EDIT_KINDS).find((k) => EDIT_KINDS[k].kinds.includes(e?.kind)) ?? null;
// The kinds a list holds something to write in. → ['roles', 'renames', …] in EDIT_KINDS order
export const kindsIn = (edits = []) => Object.keys(EDIT_KINDS).filter((k) => edits.some((e) => !e.decision && kindOf(e) === k));
// Only the kinds named; a decision is always listed, never written. A word that is no kind is said, never guessed.
// → { edits, unknown: [words] }
export function onlyKinds(edits = [], named = []) {
  const unknown = named.filter((w) => !EDIT_KINDS[w]);
  if (!named.length) return { edits, unknown };
  return { edits: edits.filter((e) => e.decision || named.includes(kindOf(e))), unknown };
}
// Whether the script is written: where the project lets the engine change the design file, and the person is asked,
// only for one kind at a time, or for the kinds they named.
export const scriptFor = (edits, { may = 'ask', named = [] } = {}) => may !== 'no' && (may === 'yes' || named.length > 0 || kindsIn(edits).length <= 1);

// The lines the run prints: what would change, what a person decides.
// may: what this project lets the engine change in the design file (writes.mjs). A project that says never gets the
// list and nothing else: the changes go on the Tasks page for whoever owns Figma, and no script is written to run.
export function editLines(edits, { fileKey = null, may = 'ask', why = null, named = [] } = {}) {
  const roles = edits.filter((e) => e.kind === 'role'), todo = edits.find((e) => e.kind === 'todo'), decide = edits.filter((e) => e.decision);
  const notes = edits.find((e) => e.kind === 'notes'), owed = edits.find((e) => e.kind === 'a11y');
  const renames = edits.filter((e) => e.kind === 'rename');
  const review = edits.find((e) => e.kind === 'review'), specs = edits.filter((e) => e.kind === 'spec');
  const devlinks = edits.find((e) => e.kind === 'devlinks'), syntax = edits.find((e) => e.kind === 'codesyntax');
  const descs = edits.find((e) => e.kind === 'descriptions');
  const back = edits.find((e) => e.kind === 'tokensback');
  const specframes = edits.find((e) => e.kind === 'specframes');
  const apply = edits.filter((e) => !e.decision);
  const kinds = kindsIn(edits), oneAtATime = apply.length && !scriptFor(edits, { may, named });
  if (!edits.length) return ['✅ Figma states every role the code has, writes its names one way, every annotation is read by a check, and no prototype needs anything the system lacks: nothing to send back.'];
  return [
    ...(roles.length ? [`Figma changes the engine can make (${roles.length}), each read from the code:`, ...roles.map((e) => `   • ${e.component}: add the annotation "${e.label}" (${e.why})`)] : specs.some((e) => e.role) ? [] : ['✅ Figma states every role the code has.']),
    ...(specs.length ? [`Accessibility specs from the code (${specs.length}), one annotation per component in the category "${SPEC_CATEGORY}", replacing the one the last run wrote:`, ...specs.map((e) => `   • ${e.component}: ${e.why}`)] : []),
    ...(review ? [`Accessibility findings pinned on the screens in Figma (${review.why}), in the category "${review.category}", replacing the last run's:`, ...review.screens.map((x) => `   • ${x.name}: ${!x.count ? 'nothing to fix' : x.pins.length ? `${x.count} to fix, pinned on ${x.pins.length} layer${x.pins.length === 1 ? '' : 's'}` : `${x.count} to fix, said in the screen's summary (read the screens again with --figma-a11y to pin each on its layer)`}`)] : []),
    ...(renames.length ? [`Names written as the rest of the system writes them (${renames.length}):`, ...renames.map((e) => `   • ${e.component}: ${e.what === 'option' ? `${e.prop}=${e.from} → ${e.to}` : `${e.what === 'layer' ? 'the layer ' : e.what === 'component' ? 'the component ' : ''}"${e.from}" → "${e.to}"`}`), '   Each component\'s code contract follows the new names once Figma is read again.'] : []),
    ...(devlinks ? [`Dev Mode links to the code (${devlinks.why}), each added once:`, ...devlinks.items.slice(0, 12).map((l) => `   • ${l.component}: ${l.file}`), ...(devlinks.items.length > 12 ? [`   … and ${devlinks.items.length - 12} more`] : [])] : []),
    ...(syntax ? [`Dev Mode code syntax (${syntax.why}): Web, var(--name), the name the code uses; one written otherwise is changed and listed when the script runs.`] : []),
    ...(specframes ? [`Component specs drawn in Figma beside each component set (${specframes.why}); one drawn from the contract as it is now is left as it is:`, ...specframes.items.slice(0, 12).map((x) => `   • ${x.component}: ${x.sections.map((sec) => sec.title).join(', ')}${x.parts.length ? `, ${x.parts.length} part${x.parts.length === 1 ? '' : 's'} marked` : ''}`), ...(specframes.items.length > 12 ? [`   … and ${specframes.items.length - 12} more`] : [])] : []),
    ...(back ? [`Tokens the code changed first, written back to Figma's variables (${back.why}); one changed in Figma since is left as it is, a conflict for a person:`, ...back.changes.slice(0, 12).map((c) => `   • ${c.name} (${c.mode})${c.breaksAlias ? `, replacing its alias to ${c.breaksAlias}` : ''}`), ...back.created.slice(0, 6).map((n) => `   • new: ${n.name} in ${n.collection}`), ...(back.changes.length + back.created.length > 18 ? [`   … and more (all in figma-edits.json)`] : [])] : []),
    ...(descs ? [`Descriptions from the intent layer (${descs.why}), written only where Figma's is still empty; one a designer typed since is left as it is:`, ...[...(descs.replace ?? []).map((d) => `   • ${d.name} (written over, at your word): ${d.text.replace(/\n/g, ' · ')}`), ...descs.components.map((d) => `   • ${d.component}: ${d.text.replace(/\n/g, ' · ')}`), ...descs.variables.map((d) => `   • ${d.name}: ${d.text.replace(/\n/g, ' · ')}`)].slice(0, 12), ...(descs.components.length + descs.variables.length > 12 ? [`   … and ${descs.components.length + descs.variables.length - 12} more (all in figma-edits.json)`] : [])] : []),
    ...(todo ? [`The design team's to do list in Figma, page "${todo.page}", frame "${todo.frame}" (${todo.why}), written afresh:`, ...todo.items.map((g) => `   • ${g.need}: ${todoText(g)}`)] : []),
    ...(owed ? [`Accessibility the design owes, listed in Figma on the page "${owed.page}", frame "${owed.frame}" (${owed.why}), written afresh:`, ...owed.items.map((i) => `   • ${i.component ? `${i.component}: ` : ''}${i.text}${i.fix ? `: ${i.fix}` : ''}`)] : []),
    ...(notes ? [`Annotations no check reads, listed in Figma on the page "${notes.page}", frame "${notes.frame}" (${notes.why}); the annotations themselves are not changed:`, ...notes.items.map((n) => `   • ${n.component}${n.layer ? ` › ${n.layer}` : ''}: "${n.text}"${n.wording ? ` → write it as "${n.wording}"` : ' (an accessibility note: write it as Role:, Alt:, Heading level or a key, so a check reads it)'}`)] : []),
    ...(decide.length ? [`For a person to decide (${decide.length}), never applied:`, ...decide.map((e) => `   • ${e.component}: ${e.why}`)] : []),
    ...(apply.length && may === 'no' ? [`NEXT: this project does not let the engine write the design file${why ? ` (${why})` : ''}, so nothing was written to run. The ${apply.length} change${apply.length === 1 ? '' : 's'} above ${apply.length === 1 ? 'is' : 'are'} on the Tasks page, for whoever owns Figma.`] : []),
    ...(oneAtATime ? [`NEXT: these are ${kinds.length} kinds of change to the design file, and the person says yes to each on its own. Ask about each, in words: ${kinds.map((k) => `${k} (${EDIT_KINDS[k].says})`).join(', ')}. Then run rms-design-system-engine --figma-edits <the kinds they said yes to> (no script is written until then), show what it lists, and run the script it writes with the Figma MCP's use_figma${fileKey ? ` (fileKey ${fileKey})` : ''}, report what it returns, then refresh the Figma snapshots (rms-design-system-engine --refresh-figma). A kind they said no to is not written.`] : []),
    ...(apply.length && may !== 'no' && !oneAtATime ? [`NEXT: ${may === 'yes' ? 'run' : 'show the person the'} ${[roles.length ? `${roles.length} change${roles.length === 1 ? '' : 's'}` : '', renames.length ? `${renames.length} rename${renames.length === 1 ? '' : 's'}` : '', specs.length ? `${specs.length} accessibility spec${specs.length === 1 ? '' : 's'}` : '', review ? 'accessibility review' : '', devlinks ? 'Dev Mode links' : '', syntax ? 'code syntax' : '', specframes ? `${specframes.items.length} spec${specframes.items.length === 1 ? '' : 's'}` : '', back ? `${back.changes.length + back.created.length} token${back.changes.length + back.created.length === 1 ? '' : 's'} written back` : '', descs ? `${descs.components.length + descs.variables.length + (descs.replace?.length ?? 0)} description${descs.components.length + descs.variables.length + (descs.replace?.length ?? 0) === 1 ? '' : 's'}` : '', todo ? 'to do list' : '', owed ? 'accessibility the design owes' : '', notes ? 'annotations no check reads' : ''].filter(Boolean).join(' and ')} above${may === 'yes' ? '' : ' and ask; only when they say yes'}, run the script in .design-system-engine-out/handback/figma-apply.js with the Figma MCP's use_figma${fileKey ? ` (fileKey ${fileKey})` : ''}, report what it returns (the engine writes the way back from it, beside the change), then refresh the Figma snapshots (rms-design-system-engine --refresh-figma)`] : []),
  ];
}

// The list is always written: what Figma is missing is worth reading whoever may change it. The script that makes
// the changes is written only where the project lets the engine change the design file - a script nobody may run is
// a loaded gun left on the table.
// What Dev Mode hands a developer or an agent, from what the engine knows: each component set a Dev resource link to its
// code file, and each variable its CSS name as its Web code syntax (var(--name)). Written only after the person says
// yes, like every edit here; what is already there is left, and a code syntax other than the CSS name is changed and
// listed. links: [{ component, nodeId, url, file }]; vars: [{ variable, css }], css the variable's custom property.
// The script names each variable's property by the plain rule (the prefix, its path with dashes) and carries only the
// ones the system's naming writes otherwise, so a file of two thousand variables stays a short script.
// → [{ kind: 'devlinks', items, why }, { kind: 'codesyntax', prefix, except, count, why }]
export function devModeEdits(links = [], vars = [], { prefix = '--' } = {}) {
  const out = [];
  const ls = links.filter((l) => l?.nodeId && l.url);
  if (ls.length) out.push({ kind: 'devlinks', items: ls, why: `${ls.length} component${ls.length === 1 ? '' : 's'} linked to ${ls.length === 1 ? 'its' : 'their'} code file in Dev Mode` });
  const plain = (n) => prefix + String(n).split('/').join('-');
  const vs = vars.filter((v) => v?.variable && v.css);
  if (vs.length) out.push({ kind: 'codesyntax', prefix, except: Object.fromEntries(vs.filter((v) => v.css !== plain(v.variable)).map((v) => [v.variable, v.css])), count: vs.length,
    why: `${vs.length} variable${vs.length === 1 ? '' : 's'} given ${vs.length === 1 ? 'its' : 'their'} CSS name as Web code syntax` });
  return out;
}

// The descriptions the intent layer approved, one part of them (figma-descriptions.mjs chunkOf): a file of thousands of
// variables is more than one run. → [{ kind: 'descriptions', variables, components, chunk, of, why }]
// differs: the descriptions a designer already wrote that say something else ({ kind, name, nodeId?, figma, layer }).
// Each is a decision for a person, listed with both texts and never applied, unless the person chose it (replace: a
// set of names, or true for all): then it is written over, but only where Figma still holds exactly the text that was
// listed, so one changed again since is left as it is.
export function descriptionEdits(chunk, { differs = [], replace = null } = {}) {
  const items = chunk?.items ?? [];
  const chosen = (d) => replace === true || (replace instanceof Set && replace.has(d.name));
  const swap = differs.filter(chosen), ask = differs.filter((d) => !chosen(d));
  const variables = items.filter((x) => x.kind === 'variable').map((x) => ({ name: x.name, text: x.text }));
  const components = items.filter((x) => x.kind === 'component' && x.nodeId).map((x) => ({ id: x.nodeId, component: x.name, text: x.text }));
  const over = swap.map((d) => ({ kind: d.kind, name: d.name, ...(d.nodeId ? { id: d.nodeId } : {}), was: d.figma, text: d.layer }));
  const out = [];
  const n = variables.length + components.length;
  if (n || over.length) out.push({ kind: 'descriptions', variables, components, replace: over, chunk: chunk?.n ?? 1, of: chunk?.of ?? 1,
    why: `${n} the intent layer approved${over.length ? `, ${over.length} written over at the person's word` : ''}${(chunk?.of ?? 1) > 1 ? `, part ${chunk.n} of ${chunk.of}` : ''}` });
  for (const d of ask) out.push({ kind: 'description-differs', decision: true, component: d.name, figma: d.figma, layer: d.layer,
    why: d.adds
      ? `Figma says "${d.figma}"; the engine would keep it and add "${d.layer.split('\n').slice(1).join(' · ')}". Add it with --replace ${d.name}, or keep it as it is.`
      : `Figma says "${d.figma}"; the engine would write instead "${d.layer.replace(/\n/g, ' · ')}". Replace it with --replace ${d.name}, or keep it.` });
  return out;
}

// Each component's spec, drawn beside its component set from its contract (spec-frames.mjs specOf).
// → [{ kind: 'specframes', items, why }]
export function specFrameEdits(specs = []) {
  const items = specs.filter((s) => s?.nodeId && s.sections?.length);
  if (!items.length) return [];
  return [{ kind: 'specframes', items, why: `${items.length} component spec${items.length === 1 ? '' : 's'} from ${items.length === 1 ? 'its contract' : 'their contracts'}` }];
}

// Tokens the code changed first (code-led-tokens.mjs), one part of them, in Figma's own terms and its modes' names.
// modeName: a mode key → the Figma mode's name. → [{ kind: 'tokensback', changes, created, chunk, of, why }]
export function tokensBackEdits(chunk, { modeName = (k) => k, terms = (v) => v } = {}) {
  const changes = (chunk?.changes ?? []).map((c) => ({ name: c.name, mode: modeName(c.mode), figma: terms(c.figma, c.kind), value: terms(c.code, c.kind), ...(c.breaksAlias ? { breaksAlias: c.breaksAlias } : {}) }))
    .filter((c) => c.value != null);
  const created = (chunk?.created ?? []).filter((n) => n.collection).map((n) => {
    const kind = n.kind ?? (Object.values(n.values).every((x) => terms(x, 'COLOR') != null) ? 'COLOR' : Object.values(n.values).every((x) => typeof terms(x, 'FLOAT') === 'number') ? 'FLOAT' : 'STRING');
    return { name: n.name, collection: n.collection, kind, values: Object.fromEntries(Object.entries(n.values).map(([k, x]) => [modeName(k), terms(x, kind)])) };
  });
  if (!changes.length && !created.length) return [];
  return [{ kind: 'tokensback', changes, created, chunk: chunk.n, of: chunk.of,
    why: `${changes.length} value${changes.length === 1 ? '' : 's'} the code changed first${created.length ? `, ${created.length} variable${created.length === 1 ? '' : 's'} the code added` : ''}${chunk.of > 1 ? `, part ${chunk.n} of ${chunk.of}` : ''}` }];
}

// A script from an earlier run is taken away when this one writes none: what is on disk is always what was last asked.
export function writeFigmaEdits(dir, edits, { may = 'ask', named = [] } = {}) {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'figma-edits.json'), JSON.stringify(edits, null, 2) + '\n');
  if (!scriptFor(edits, { may, named })) { rmSync(join(dir, 'figma-apply.js'), { force: true }); return { json: join(dir, 'figma-edits.json'), script: null }; }
  writeFileSync(join(dir, 'figma-apply.js'), applyScript(edits));
  return { json: join(dir, 'figma-edits.json'), script: join(dir, 'figma-apply.js') };
}
