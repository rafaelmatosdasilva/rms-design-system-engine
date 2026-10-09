// annotation-categories.mjs - what each Figma annotation is about, from the one category Figma lets a note carry.
//
// Figma gives every annotation at most one category, set per file (Intent, Implementation, Accessibility, Content…).
// The REST API does not return it: only the Plugin API reads it (annotation.categoryId, and
// figma.annotations.getAnnotationCategoriesAsync() for the names). So it is captured apart, by a short script the
// engine writes for the Figma tool of a session (captureScript), and kept in its own snapshot beside the
// component-props one, figma-annotation-categories.snapshot.json:
//   { _updated, categories: { "<id>": { label, color } }, notes: { "<nodeId>": { "<noteKey of its text>": "<id>" } } }
// The component-props snapshot keeps its shape; a note finds its category by its node and its text, so a note whose
// text changed in Figma reads as having none until the next capture.
//
// A note's kind decides what the engine does with it:
//   accessibility                               a requirement: the accessibility checks read it, and one no check
//                                               reads is a To do (written so a check reads it)
//   intent, implementation, content, authoring  design intent for people and agents: never a requirement, never a To do
//   null                                        no category, one the file deleted, or one the project did not map:
//                                               read as before, the text decides
// The project names its own categories in ds-config.json → annotations.categories ({ "<label>": "<kind>" }); the
// defaults cover Figma's presets and the usual names. The engine imposes no names.

import { readFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

export const KINDS = ['accessibility', 'intent', 'implementation', 'content', 'authoring'];
const DEFAULT_KINDS = {
  accessibility: 'accessibility', a11y: 'accessibility',
  intent: 'intent', documentation: 'intent', usage: 'intent',
  implementation: 'implementation', development: 'implementation', interaction: 'implementation',
  content: 'content', copy: 'content',
  authoring: 'authoring', designers: 'authoring', figma: 'authoring',
};
const norm = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase().replace(/\s+/g, ' ');

// A short, stable key for a note's text (FNV-1a over its words with the spacing collapsed). The capture script
// computes the same key in Figma, so the two sides match without carrying the whole text across.
export function noteKey(text) {
  const t = String(text ?? '').replace(/\s+/g, ' ').trim();
  let h = 0x811c9dc5;
  for (let i = 0; i < t.length; i++) { h ^= t.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16);
}
const textOf = (a) => String(a?.label ?? a?.labelMarkdown ?? (typeof a === 'string' ? a : '')).trim();

// The Plugin API script that reads the categories: the file's table, and each categorised note by node and text key.
// Every page by default; on a large file the agent runs it once per page (PAGE_IDS) and passes every result in.
export function captureScript() {
  return `// rms-design-system-engine: the category of each Figma annotation (read only). Run it with the Figma tool of this
// session; save what it returns as a .json file and pass it to: rms-design-system-engine --annotation-categories <file>
const PAGE_IDS = [];   // empty: every page. On a large file, run it once per page id and pass every file in.
function noteKey(text) { const t = String(text == null ? '' : text).replace(/\\s+/g, ' ').trim(); let h = 0x811c9dc5; for (let i = 0; i < t.length; i++) { h ^= t.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } return h.toString(16); }
const cats = await figma.annotations.getAnnotationCategoriesAsync();
const notes = {};
const pages = PAGE_IDS.length ? (await Promise.all(PAGE_IDS.map((id) => figma.getNodeByIdAsync(id)))).filter(Boolean) : figma.root.children;
for (const page of pages) {
  await page.loadAsync();
  for (const n of page.findAll((x) => Array.isArray(x.annotations) && x.annotations.length > 0)) {
    for (const a of n.annotations) if (a.categoryId) (notes[n.id] = notes[n.id] || {})[noteKey(a.label || a.labelMarkdown || '')] = a.categoryId;
  }
}
return JSON.stringify({ _updated: new Date().toISOString(), pages: PAGE_IDS.length ? PAGE_IDS : 'all', categories: Object.fromEntries(cats.map((c) => [c.id, { label: c.label, color: c.color }])), notes: notes });
`;
}

// Captures folded into one categories snapshot. prev: the snapshot there now (or null); captures: what the script
// returned, one or more (a later capture of a node replaces that node). → { snapshot, nodes, notes, categories }
export function mergeCaptures(prev = null, captures = []) {
  const out = { categories: { ...(prev?.categories ?? {}) }, notes: { ...(prev?.notes ?? {}) } };
  for (const c of captures) {
    if (!c || typeof c !== 'object' || typeof c.categories !== 'object' || typeof c.notes !== 'object') throw new Error('not a capture from the annotation-categories script (no categories and notes in it)');
    Object.assign(out.categories, c.categories);
    // A page read again replaces what was known of its nodes; a node it no longer holds stays as it was.
    for (const [node, keys] of Object.entries(c.notes)) out.notes[node] = { ...keys };
  }
  const notes = Object.values(out.notes).reduce((n, k) => n + Object.keys(k).length, 0);
  return { snapshot: { _updated: new Date().toISOString(), ...out }, nodes: Object.keys(out.notes).length, notes, categories: Object.keys(out.categories).length };
}

// Where the categories snapshot is: ds-config paths.annotationCategoriesSnapshot, else beside the component-props one.
export function categoriesPath(ROOT, cfg = {}) {
  if (cfg.paths?.annotationCategoriesSnapshot) return resolve(ROOT, cfg.paths.annotationCategoriesSnapshot);
  return join(dirname(resolve(ROOT, cfg.paths?.compPropsSnapshot ?? 'figma-component-props.snapshot.json')), 'figma-annotation-categories.snapshot.json');
}
// The categories snapshot, or null when none was captured (every note then reads as before).
export function loadCategories(ROOT, cfg = {}) {
  const p = categoriesPath(ROOT, cfg);
  if (!existsSync(p)) return null;
  try { const s = JSON.parse(readFileSync(p, 'utf8')); return s && typeof s.categories === 'object' && typeof s.notes === 'object' ? s : null; } catch { return null; }
}

// The kind of one note on a node, or null when it carries no category the engine can read.
export function noteKind(annotation, nodeId, cats = null, cfg = {}) {
  if (!cats) return null;
  const id = annotation?.categoryId ?? cats.notes?.[nodeId]?.[noteKey(textOf(annotation))];
  const label = id ? cats.categories?.[id]?.label : null;
  if (!label) return null;   // none recorded, or a category deleted from the file since
  const own = Object.fromEntries(Object.entries(cfg?.annotations?.categories ?? {}).map(([k, v]) => [norm(k), v]));
  const kind = own[norm(label)] ?? DEFAULT_KINDS[norm(label)];
  return KINDS.includes(kind) ? kind : null;
}
// A requirement is what the accessibility checks read: a note in the accessibility category, or one with no category
// (the text decides, as before). A note of any other kind is design intent.
export const isRequirement = (annotation, nodeId, cats, cfg) => { const k = noteKind(annotation, nodeId, cats, cfg); return k === null || k === 'accessibility'; };

// A component's snapshot entry with only the notes that are requirements, its own and its layers'.
export function requirementEntry(entry = {}, cats = null, cfg = {}) {
  if (!cats || !entry || typeof entry !== 'object') return entry;
  const annotations = (entry.annotations ?? []).filter((a) => isRequirement(a, entry.nodeId, cats, cfg));
  const layers = (entry.layerAnnotations ?? []).map((l) => ({ ...l, annotations: (l.annotations ?? []).filter((a) => isRequirement(a, l.nodeId, cats, cfg)) })).filter((l) => l.annotations.length);
  return { ...entry, annotations, ...(entry.layerAnnotations ? { layerAnnotations: layers } : {}) };
}

// Whether a note no check reads is work to do: one in the accessibility category always (written so a check reads
// it); one with no category when the engine can tell an accessibility meaning in it (a wording a check reads);
// never a note of another kind, which is design intent.
export const noteIsTodo = (kind, wording) => kind === 'accessibility' || (kind === null && !!wording);
