// edit-check.mjs - every UI edit an agent makes is checked when it is made (idea I62).
//
// The audit checks when someone runs it; the agents that write most of the drift never do. S30 measured it:
// rules and an MCP server changed nothing for a small model (it never called the MCP), a hook that checked each
// edit took invented values to zero in 14 of 15 runs. So, as a Claude Code PostToolUse hook (installed with the
// guard), after an Edit, MultiEdit or Write on a UI file this reads only what the edit ADDED and returns what in
// it the design system does not have, with the right name:
//   • var(--x) that is declared nowhere (not in the theme, not in the file itself);
//   • a colour written as a literal: the token that has that value when one does, or "not a design-system colour";
//   • on a design-system component's tag, a prop value it does not take or a prop name written another way
//     (the catalog and the code API, exactly as the steering check reads them);
//   • in a Tailwind project, a class with a value in brackets (rounded-[4px]): the theme's utility when a theme
//     value is the same, or that it is not a design-system value (tailwind-check.mjs).
// Silent when the edit added none of these. Precise before complete: component tags the catalog does not know
// are the app's own components, never flagged; a custom-property declaration is a token being defined, and
// the theme file's own literals are its values.
import { readFileSync, existsSync } from 'node:fs';
import { join, relative, resolve, basename } from 'node:path';
import { execFileSync } from 'node:child_process';
import { steeringTruth, steeringFindings } from './steering-check.mjs';
import { usesTailwind, themeValues, arbitraryFindings } from './tailwind-check.mjs';
import { primitiveTable, projectClassRules, primitiveFindings, primitiveTag } from './primitives.mjs';
import { codeSnapshotPath } from './names.mjs';

const UI = /\.(css|scss|sass|less|html?|vue|svelte|jsx|tsx)$/i;
const SKIP = /(^|\/)(node_modules|dist|build|contracts|\.design-system-engine-out|\.design-system-engine-refs|\.parity-out|\.parity-refs)\//;
const HEX = /#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})\b/g;
const NOT_COLOUR = /(href|to|src|action|xlink:href)\s*=\s*\{?\s*["'`]$|url\(\s*["']?$|&$/i;   // #add in a link is a fragment
// Outside a style sheet, a colour counts only where it styles something: after a colour-bearing property
// (color, background, border-color, fill, stroke, box-shadow; a JS style key like backgroundColor). A colour in a
// data table or a comment is data.
const STYLE_PROP = /(colou?r|background|border|fill|stroke|shadow|outline|caret|accent|decoration)[\w-]*["'`]?\s*[:=]\s*\{?\s*[^;:=]*$/i;
const COMMENT = /^\s*(\/\/|\/?\*|<!--)/;
const normName = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');

// A design-system component's tag on this line: <Chip>, <ButtonPrimary>, <hb-chip>. A lowercase single word
// (<button>, <input>) is the HTML element, whose attributes are the platform's, never the system's props.
export function componentTagIn(line, components) {
  const names = new Set(components.map(normName));
  for (const m of String(line).matchAll(/<([A-Za-z][\w.-]*)/g)) {
    const tag = m[1];
    if (/^[A-Z]/.test(tag) && names.has(normName(tag))) return tag;
    if (tag.includes('-')) { const n = normName(tag); for (const c of names) if (n.endsWith(c) && /^[a-z]{1,4}$/.test(n.slice(0, -c.length))) return tag; }
  }
  return null;
}

// #abc → #aabbcc, lower case; 8-digit keeps its alpha.
export function normHex(h) {
  let x = String(h).toLowerCase().replace('#', '');
  if (x.length === 3 || x.length === 4) x = [...x].map((c) => c + c).join('');
  return `#${x}`;
}

// The lines an edit added, as the tool call states them. Edit and MultiEdit: lines of the new text that the old
// text did not have. Write: lines the committed version did not have (all of them for a new file).
export function addedLines(event, { headText = null } = {}) {
  const input = event?.tool_input ?? {};
  const diff = (oldT, newT) => {
    const before = new Map();
    for (const l of String(oldT ?? '').split('\n')) before.set(l, (before.get(l) ?? 0) + 1);
    return String(newT ?? '').split('\n').filter((l) => {
      const n = before.get(l) ?? 0;
      if (n > 0) { before.set(l, n - 1); return false; }
      return l.trim().length > 0;
    });
  };
  if (event?.tool_name === 'Edit') return diff(input.old_string, input.new_string);
  if (event?.tool_name === 'MultiEdit') return (input.edits ?? []).flatMap((e) => diff(e.old_string, e.new_string));
  if (event?.tool_name === 'Write') return diff(headText ?? '', input.content);
  return [];
}

// What the check compares against, read once per edit from what the audit already wrote.
export function editTruth(ROOT, cfg = {}) {
  const read = (p) => { try { return readFileSync(resolve(ROOT, p), 'utf8'); } catch { return ''; } };
  const json = (p) => { try { return JSON.parse(read(p)); } catch { return {}; } };
  const themePaths = [cfg.paths?.themeCSS ?? 'src/theme.css', ...[cfg.paths?.pluginCSS ?? []].flat()].flat();
  const theme = themePaths.map(read).join('\n');
  const cssVars = [...new Set([...theme.matchAll(/(--[\w-]+)\s*:/g)].map((m) => m[1]))];
  const tokenByValue = new Map();
  for (const m of theme.matchAll(/(--[\w-]+)\s*:\s*(#[0-9a-fA-F]{3,8})\b/g)) {
    const k = normHex(m[2]);
    const list = tokenByValue.get(k) ?? [];
    if (!list.includes(m[1])) list.push(m[1]);
    tokenByValue.set(k, list);
  }
  const contracts = cfg.contracts?.out ?? 'contracts';
  const catalog = json(join(contracts, 'catalog.json'));
  const api = json(codeSnapshotPath(cfg)).api ?? {};
  const truth = steeringTruth({ catalog, api, cssVars });
  const tailwind = cfg.tailwind !== false && usesTailwind(theme, ROOT) ? themeValues(theme) : null;
  // The owner's primitives table (I42), with the project's class rules to read a styled element by its classes.
  const primitives = primitiveTable(cfg);
  const rules = primitives.length ? projectClassRules(ROOT) : new Map();
  return { truth, tokenByValue, tailwind, primitives, rules, themeFiles: new Set(themePaths.map((p) => resolve(ROOT, p))) };
}

// → [{ line, text }] for the lines the edit added. `fullText` is the file after the edit (for line numbers and
// the variables it declares itself).
export function editFindings(added, fullText, { truth, tokenByValue, tailwind = null, primitives = [], rules = new Map() }, { isTheme = false, sheet = false } = {}) {
  const out = [];
  const all = String(fullText ?? '').split('\n');
  const declared = new Set([...String(fullText ?? '').matchAll(/(--[\w-]+)\s*:/g)].map((m) => m[1]));
  const lineOf = (l) => { const i = all.indexOf(l); return i >= 0 ? i + 1 : null; };
  const seen = new Set();
  const push = (line, text) => { const k = `${line}|${text}`; if (!seen.has(k)) { seen.add(k); out.push({ line, text }); } };
  for (const l of added) {
    const line = lineOf(l);
    for (const f of steeringFindings(l, truth)) {
      if (f.kind === 'variable' && !declared.has(f.found)) push(line, `var(${f.found}) is not a declared CSS variable${f.want ? `; the system has ${f.want}` : ''}`);
      else if ((f.kind === 'prop value' || f.kind === 'prop name') && componentTagIn(l, truth.components)) {
        push(line, f.kind === 'prop name'
          ? `${f.found}= is not the prop's name as the code writes it; write ${f.want}=`
          : `${f.found} is not a value this prop takes${f.want ? `; write ${f.want}` : f.valid?.length ? `; it takes ${f.valid.join(', ')}` : ''}`);
      }
    }
    if (tailwind) for (const f of arbitraryFindings(l, tailwind)) push(line, `${f.cls} is outside the theme; ${f.fix ? `write ${f.fix}` : `${f.value} is not a design-system value`}`);
    if (isTheme || /^\s*--[\w-]+\s*:/.test(l) || COMMENT.test(l)) continue;   // a token being defined, the theme's own values, a comment
    // A custom-property declaration anywhere on the line (a minified :root{--x: #fff;…}) defines a token.
    const scan = l.replace(/--[\w-]+\s*:[^;}]*/g, ' ').replace(/var\([^)]*\)/g, ' ').replace(/&#x?[0-9a-fA-F]+;/g, ' ');
    for (const m of scan.matchAll(HEX)) {
      if (NOT_COLOUR.test(scan.slice(Math.max(0, m.index - 14), m.index))) continue;
      if (tailwind && scan[m.index - 1] === '[') continue;   // a Tailwind arbitrary value, reported above
      if (!sheet && !STYLE_PROP.test(scan.slice(0, m.index))) continue;
      if (/\.(fill|stroke|shadow)(Style|Color)\s*=\s*[^;]*$/.test(scan.slice(0, m.index))) continue;   // a canvas being painted, not the page
      const tokens = tokenByValue.get(normHex(m[0])) ?? [];
      push(line, tokens.length
        ? `${m[0]} is written by hand; use var(${tokens[0]})${tokens.length > 1 ? ` (or ${tokens.slice(1, 3).map((t) => `var(${t})`).join(', ')})` : ''}`
        : `${m[0]} is not a design-system colour; use one of its colour tokens`);
    }
  }
  // A plain element the edit added that is styled as a primitive the owner declared (I42).
  if (primitives.length && !sheet) {
    const addedAt = new Set(added.map(lineOf).filter(Boolean));
    for (const f of primitiveFindings(fullText, primitives, { rules })) {
      if (addedAt.has(f.line)) push(f.line, `<${f.tag}> styled by hand is the system's ${primitiveTag(f.primitive)}; use the component`);
    }
  }
  return out;
}

// The hook's answer: the reason Claude Code hands back to the agent, or null to stay silent.
export function editCheck(event, { root, cfg = {}, headOf = null } = {}) {
  if (cfg.hooks === false || cfg.editCheck === false) return null;
  const file = event?.tool_input?.file_path;
  if (!file || !UI.test(file)) return null;
  const abs = resolve(root, file), rel = relative(root, abs);
  if (rel.startsWith('..') || SKIP.test(rel) || /\.snapshot\.json$/.test(rel)) return null;
  if (/\.html?$/i.test(abs) && existsSync(abs.replace(/\.(html?)$/i, '.src.$1'))) return null;   // built from the .src beside it
  const head = headOf ? headOf(rel) : (() => { try { return execFileSync('git', ['show', `HEAD:${rel}`], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }); } catch { return null; } })();
  const added = addedLines(event, { headText: head });
  if (!added.length) return null;
  const ctx = editTruth(root, cfg);
  let full = ''; try { full = existsSync(abs) ? readFileSync(abs, 'utf8') : ''; } catch { /* the edit's own text is enough */ }
  const found = editFindings(added, full || added.join('\n'), ctx, { isTheme: ctx.themeFiles.has(abs), sheet: /\.(css|scss|sass|less)$/i.test(abs) });
  if (!found.length) return null;
  const lines = found.slice(0, 12).map((f) => `  ${basename(rel)}${f.line ? `:${f.line}` : ''}  ${f.text}`);
  return `rms-design-system-engine checked this edit against the design system: ${found.length} thing${found.length === 1 ? '' : 's'} it added the system does not have.\n${lines.join('\n')}${found.length > 12 ? `\n  and ${found.length - 12} more` : ''}\nFix ${found.length === 1 ? 'it' : 'them'} in this file now. Not sure of a name? rms-design-system-engine --query <name>.`;
}

export function editHookOutput(reason) {
  return reason ? JSON.stringify({ decision: 'block', reason }) : '';
}
