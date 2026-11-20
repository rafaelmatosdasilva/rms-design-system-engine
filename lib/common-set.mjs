// common-set.mjs - the components nearly every product builds with, and what of it the system lacks, in Figma, in the code, documented.
//
// Nearly every product needs the same components: a button, a link, a text input, a dialog, a toast and the rest of
// COMMON_SET. A system that lacks one leaves each product to build its own, and an agent to invent one. This lists the
// system against that set in three columns (in Figma, in the code, in the intent layer), and names each one missing
// everywhere and each that exists on some sides only. The same for the five token categories: a system with colour
// tokens and raw spacing, radii, shadows and type is tokenised in one category of five.
//
// A system's components are matched to the set by meaning, not exact name: a name's last word (its head noun, so
// IconButton is a button and CardHeader is no card) against each entry's aliases (modal is a dialog, snackbar a
// toast), the longest alias first (TextField is a text input, not a form field).
//
// A gap the team leaves on purpose is written in ds-config.json → commonSet.leaveOut, { toast: "why" }, a component's
// or a token category's id as the key: it is said as kept with its reason, never as missing. Pure: the audit reads the
// sides and prints commonSetLines (the 🧭 System health block).
import { tokenKind } from './edit-check.mjs';
import { colorHex } from './css-values.mjs';

// id, then the names it goes by. Each alias is words, matched on a name's last words.
export const COMMON_SET = [
  ['button', ['button', 'btn']],
  ['link', ['link', 'anchor', 'hyperlink']],
  ['text input', ['text input', 'input', 'text field', 'textfield', 'text box', 'textbox']],
  ['select', ['select', 'dropdown', 'combobox', 'combo box', 'select menu', 'listbox']],
  ['checkbox', ['checkbox', 'check box']],
  ['radio', ['radio', 'radio button', 'radio group']],
  ['switch', ['switch', 'toggle', 'toggle switch']],
  ['form field', ['form field', 'field', 'form group', 'form item', 'form control', 'form row']],
  ['dialog', ['dialog', 'modal', 'modal dialog']],
  ['menu', ['menu', 'dropdown menu', 'context menu', 'popup menu', 'action menu']],
  ['tabs', ['tab', 'tab bar', 'tab list', 'tab group']],
  ['table', ['table', 'data table', 'datatable', 'data grid', 'datagrid']],
  ['card', ['card', 'tile']],
  ['alert', ['alert', 'banner', 'callout', 'inline message', 'message bar', 'notice']],
  ['toast', ['toast', 'snackbar', 'snack bar', 'notification']],
  ['tooltip', ['tooltip', 'tool tip']],
  ['avatar', ['avatar']],
  ['badge', ['badge', 'tag', 'pill', 'lozenge']],
  ['icon', ['icon', 'glyph']],
  ['pagination', ['pagination', 'pager', 'paginator']],
  ['progress', ['progress', 'progress bar', 'progress circle', 'progress ring', 'spinner', 'loader', 'loading', 'activity indicator']],
  ['skeleton', ['skeleton', 'skeleton loader', 'shimmer']],
  ['empty state', ['empty state', 'empty', 'blank slate', 'zero state']],
].map(([id, aliases]) => ({ id, aliases }));

export const TOKEN_CATEGORIES = ['colour', 'spacing', 'radius', 'elevation', 'typography'];

// A word in its singular (tabs → tab), "progress" and "status" kept as they are.
const one = (w) => (w.length > 3 && /s$/.test(w) && !/(ss|us)$/.test(w) ? w.slice(0, -1) : w);
const wordsOf = (s) => String(s ?? '').replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean).map(one);
const ALIASES = COMMON_SET.flatMap((c) => c.aliases.map((a) => ({ id: c.id, words: wordsOf(a) }))).sort((a, b) => b.words.length - a.words.length);

// The entry of the set a component name is, or null. Each part of a Figma path (Button/Primary) is read: the first that
// matches says it.
export function commonOf(name) {
  for (const part of String(name ?? '').split('/')) {
    const w = wordsOf(part);
    if (!w.length) continue;
    const hit = ALIASES.find((a) => a.words.length <= w.length && a.words.every((x, i) => x === w[w.length - a.words.length + i]));
    if (hit) return hit.id;
  }
  return null;
}

// The ids a team leaves out on purpose, with why: ds-config.json → commonSet.leaveOut. → Map(id → reason)
export function leftOut(cfg = {}) {
  const raw = cfg?.commonSet?.leaveOut ?? {};
  const out = new Map();
  for (const [k, v] of Object.entries(raw && typeof raw === 'object' ? raw : {})) out.set(String(k).toLowerCase().trim(), String(v ?? '').trim());
  return out;
}

// sides: { figma, code, documented }, each the component names that side has, or null when the engine has nothing of
// that side to read (no Figma capture, no code, no intent layer), so it is never said to lack anything.
// → { sides: [side read], rows: [{ id, figma, code, documented, kept }] } with each side's names (null for a side unread)
export function commonSet(sides = {}, { leaveOut = new Map() } = {}) {
  const read = ['figma', 'code', 'documented'].filter((s) => Array.isArray(sides[s]));
  const rows = COMMON_SET.map(({ id }) => {
    const row = { id, kept: leaveOut.has(id) ? leaveOut.get(id) || null : undefined };
    for (const s of read) row[s] = [...new Set(sides[s].filter((n) => commonOf(n) === id))];
    return row;
  });
  return { sides: read, rows };
}

// The token categories a system defines. figmaVars: the vars snapshot. themeCss: the theme's text. raw: the census's
// byKind (values written by hand, raw-census.mjs), or null when the census did not run.
// → [{ id, figma: n | null, code: n | null, raw: n | null, kept }]
export function tokenCategories({ figmaVars = null, themeCss = null, raw = null } = {}, { leaveOut = new Map() } = {}) {
  const count = () => Object.fromEntries(TOKEN_CATEGORIES.map((c) => [c, new Set()]));
  const byName = (name) => {
    const n = String(name).toLowerCase();
    if (/shadow|elevation/.test(n)) return 'elevation';
    const k = tokenKind(n.replace(/\//g, '-'));
    if (k === 'font size') return 'typography';
    if (k) return k;
    if (/font|typograph|line-?height|leading|letter-?spacing|tracking|(^|[-/])type([-/]|$)/.test(n)) return 'typography';
    return null;
  };
  let figma = null, code = null;
  if (figmaVars && typeof figmaVars === 'object') {
    figma = count();
    for (const m of Object.values(figmaVars.color ?? {})) for (const n of Object.keys(m ?? {})) figma[byName(n) === 'elevation' ? 'elevation' : 'colour'].add(n);
    for (const n of Object.keys(figmaVars.sizing ?? {})) { const c = byName(n); if (c) figma[c].add(n); }
    for (const n of Object.keys(figmaVars.typography ?? {})) figma.typography.add(n);
    for (const n of Object.keys(figmaVars.effects ?? {})) figma.elevation.add(n);
    for (const p of [].concat(figmaVars.primitives ?? [])) { const n = typeof p === 'string' ? p : p?.name; const c = n && byName(n); if (c) figma[c].add(n); }
  }
  if (typeof themeCss === 'string' && themeCss.trim()) {
    code = count();
    for (const m of themeCss.matchAll(/(--[\w-]+)\s*:\s*([^;}\n]+)/g)) {
      const [name, value] = [m[1], m[2].trim()];
      const c = byName(name) ?? (/colou?r/i.test(name) || colorHex(value) ? 'colour' : null);
      if (c) code[c].add(name);
    }
  }
  const rawOf = { colour: 'colour', spacing: 'spacing', radius: 'radius', elevation: 'shadow', typography: 'font size' };
  return TOKEN_CATEGORIES.map((id) => ({
    id,
    figma: figma ? figma[id].size : null,
    code: code ? code[id].size : null,
    raw: raw ? (raw[rawOf[id]] ?? 0) : null,
    kept: leaveOut.has(id) ? leaveOut.get(id) || null : undefined,
  }));
}

const SIDE = { figma: 'Figma', code: 'the code', documented: 'the intent layer' };
const and = (l) => (l.length < 2 ? l.join('') : `${l.slice(0, -1).join(', ')} and ${l[l.length - 1]}`);
const or = (l) => (l.length < 2 ? l.join('') : `${l.slice(0, -1).join(', ')} or ${l[l.length - 1]}`);
const keptBullet = (id, reason) => `   · ${id} is left out on purpose${reason ? `: ${reason}` : ''}`;
const HOW = 'ds-config.json → commonSet.leaveOut';

// The System health lines: what of the common set the system lacks, and which token categories it leaves raw.
// set: commonSet's. cats: tokenCategories'. Silent when nothing is missing and nothing is kept. → [line]
export function commonSetLines(set, cats = [], { each = 8 } = {}) {
  const out = [];
  if (set?.sides?.length) {
    const has = (r) => set.sides.filter((s) => r[s].length);
    const total = COMMON_SET.length;
    const kept = set.rows.filter((r) => r.kept !== undefined);
    const open = set.rows.filter((r) => r.kept === undefined);
    const missing = open.filter((r) => !has(r).length);
    const partial = open.filter((r) => { const h = has(r).length; return h && h < set.sides.length; });
    if (missing.length || partial.length || kept.length) {
      const inSystem = set.rows.filter((r) => has(r).length).length;
      const per = set.sides.map((s) => `${SIDE[s]} ${set.rows.filter((r) => r[s].length).length}`).join(', ');
      out.push(`The system has ${inSystem} of the ${total} components nearly every product builds with (${per})${missing.length
        ? `. Missing on every side, so each product builds its own: ${missing.map((r) => r.id).join(', ')}`
        : ''}${missing.length || partial.length ? `. Add each, or say why it stays out in ${HOW}` : ''}${partial.length || kept.length ? ':' : '.'}`);
      for (const r of partial.slice(0, each)) {
        const h = has(r), lack = set.sides.filter((s) => !r[s].length);
        const names = [...new Set(h.flatMap((s) => r[s]))].filter((n) => n.toLowerCase() !== r.id);
        out.push(`   · ${r.id}${names.length ? ` (${names.slice(0, 3).join(', ')})` : ''} is in ${and(h.map((s) => SIDE[s]))} but not in ${or(lack.map((s) => SIDE[s]))}`);
      }
      if (partial.length > each) out.push(`   · and ${partial.length - each} more on some sides only`);
      for (const r of kept) out.push(keptBullet(r.id, r.kept));
    }
  }
  const read = cats.filter((c) => c.figma != null || c.code != null);
  if (read.length) {
    const tok = (c) => (c.figma ?? 0) + (c.code ?? 0) > 0;
    const open = read.filter((c) => c.kept === undefined);
    const raw = open.filter((c) => !tok(c));
    const sided = open.filter((c) => tok(c) && c.figma != null && c.code != null && (!c.figma || !c.code));
    const kept = read.filter((c) => c.kept !== undefined && !tok(c));
    if (raw.length || sided.length || kept.length) {
      const done = read.filter(tok);
      const rawSay = (c) => `${c.id}${c.raw ? ` (${c.raw} value${c.raw === 1 ? '' : 's'} written by hand in the styles)` : ''}`;
      out.push(`The system is tokenised in ${done.length} of the ${TOKEN_CATEGORIES.length} token categories${done.length ? ` (${done.map((c) => c.id).join(', ')})` : ''}${raw.length
        ? `. No tokens for ${and(raw.map(rawSay))}. Add tokens for ${raw.length === 1 ? 'it' : 'them'}, or say why ${raw.length === 1 ? 'it stays' : 'they stay'} out in ${HOW}`
        : ''}${sided.length || kept.length ? ':' : '.'}`);
      for (const c of sided) out.push(`   · ${c.id} has tokens in ${c.figma ? 'Figma' : 'the code'} but none in ${c.figma ? `the code${c.raw ? `, which writes ${c.raw} value${c.raw === 1 ? '' : 's'} of it by hand` : ''}` : 'Figma'}`);
      for (const c of kept) out.push(keptBullet(c.id, c.kept));
    }
  }
  return out;
}
