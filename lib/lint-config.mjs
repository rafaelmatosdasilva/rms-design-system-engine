// lint-config.mjs - the rules a team already wrote into its linters, read as decided: a code rule its stylelint or
// ESLint config settles is the team's, said with the file and line where it was written, never asked again.
//
// The code's construction rules (code-grammar.mjs) put each way of writing a component to the team as a question until
// it decides. A team that set a class-name pattern, forbade a hex colour or chose how props are cased has decided it
// already, in its own config. Only what the engine understands is read, and a setting decides a rule only when it says
// what the rule says (vue/prop-name-casing camelCase decides "a yes/no prop is named in camelCase", never one in
// kebab-case). A setting turned off decides nothing.
//
//   lintConfigs(ROOT)                → [{ tool, file, settings: { name: { value, line } } }]: the project's stylelint and
//                                      ESLint configs (.stylelintrc*, stylelint.config.*, .eslintrc*, eslint.config.*,
//                                      package.json's stylelint and eslintConfig), JSON parsed, a script read as text
//   decidedByLint(rules, configs)    → { ruleId: { tool, file, line, setting, value } }, the rules a setting decides
//   teamLint(ROOT, configs, files, { run, keepIt }) → [{ tool, file, ran, counts, findings } | { tool, file, ran: false, why }]:
//                                      everything the team's own linters report, presets included, run from the
//                                      project's node_modules only (never fetched), kept beside the engine's output until
//                                      a file it reads changes; one that cannot run says why
//   lintReports(ROOT, decided, files, { run, keepIt }) → { setting: count }: what teamLint reports for each setting that
//                                      decides a rule
//
// The engine changes no code and no config: it reads them.
import { readFileSync, statSync, writeFileSync, mkdirSync } from 'node:fs';
import { projectBin, runBin } from './project-bin.mjs';
import { resolve, join, dirname } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { OUT_DIR } from './names.mjs';

const STYLELINT = ['.stylelintrc', '.stylelintrc.json', '.stylelintrc.js', '.stylelintrc.cjs', '.stylelintrc.mjs', 'stylelint.config.js', 'stylelint.config.cjs', 'stylelint.config.mjs'];
const ESLINT = ['eslint.config.js', 'eslint.config.mjs', 'eslint.config.cjs', '.eslintrc', '.eslintrc.json', '.eslintrc.js', '.eslintrc.cjs'];

// A setting's value as written: JSON when it reads as JSON once quoted keys and single quotes are put right, else the
// first thing it says (a word, a string, a number). Each setting with the line it is on; a setting written twice is
// the later one, as a config read top to bottom ends on it.
function settingsIn(text, { json = false } = {}) {
  const out = {};
  const t = String(text ?? '');
  if (json) {
    try { const o = JSON.parse(t.replace(/^\s*\/\/.*$/gm, '')); for (const [k, v] of Object.entries(o?.rules ?? {})) out[k] = { value: v, line: lineOfKey(t, k) }; return out; } catch { /* read as text below */ }
  }
  const src = t.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' ')).replace(/(^|[^:\\])\/\/[^\n]*/g, (m, p) => p + ' '.repeat(m.length - p.length));
  for (const m of src.matchAll(/(["'])((?:@[\w-]+\/)?[\w-]+(?:\/[\w-]+)*)\1\s*:\s*/g)) {
    const at = m.index + m[0].length, rest = src.slice(at);
    let raw;
    if (rest[0] === '[' || rest[0] === '{') {
      let depth = 0, q = null, i = 0;
      for (; i < rest.length; i++) { const c = rest[i]; if (q) { if (c === '\\') i++; else if (c === q) q = null; continue; } if (c === '"' || c === "'" || c === '`') q = c; else if (c === '[' || c === '{') depth++; else if (c === ']' || c === '}') { depth--; if (!depth) break; } }
      raw = rest.slice(0, i + 1);
    } else raw = (/^(?:'[^']*'|"[^"]*"|`[^`]*`|-?[\d.]+|true|false|null|[\w.]+)/.exec(rest) ?? [null])[0];
    if (raw == null) continue;
    out[m[2]] = { value: parseLoose(raw), line: src.slice(0, m.index).split('\n').length };
  }
  return out;
}
function parseLoose(raw) {
  const s = String(raw).trim();
  const j = s.replace(/'((?:[^'\\]|\\.)*)'/g, (m, x) => JSON.stringify(x.replace(/\\'/g, "'"))).replace(/([{,]\s*)([A-Za-z_$][\w$]*)\s*:/g, '$1"$2":').replace(/,\s*([}\]])/g, '$1');
  try { return JSON.parse(j); } catch { /* a value that is code, not data */ }
  const first = /^\[\s*(['"]?)([^'",\]]+)\1/.exec(s);
  return first ? [first[2]] : s.replace(/^['"`]|['"`]$/g, '');
}
const lineOfKey = (t, k) => { const i = t.indexOf(`"${k}"`); return i < 0 ? 1 : t.slice(0, i).split('\n').length; };

export function lintConfigs(ROOT) {
  const out = [];
  const read = (f) => { try { return readFileSync(resolve(ROOT, f), 'utf8'); } catch { return null; } };
  for (const [tool, names] of [['stylelint', STYLELINT], ['eslint', ESLINT]]) {
    for (const f of names) {
      const t = read(f);
      if (t == null) continue;
      out.push({ tool, file: f, settings: settingsIn(t, { json: !/\.(c|m)?js$/.test(f) }) });
      break;
    }
  }
  const pkg = read('package.json');
  if (pkg) {
    let p = null; try { p = JSON.parse(pkg); } catch { /* none */ }
    for (const [tool, key] of [['stylelint', 'stylelint'], ['eslint', 'eslintConfig']]) {
      if (!p?.[key]?.rules || out.some((c) => c.tool === tool)) continue;
      out.push({ tool, file: 'package.json', settings: Object.fromEntries(Object.entries(p[key].rules).map(([k, v]) => [k, { value: v, line: lineOfKey(pkg, k) }])) });
    }
  }
  return out;
}

// Whether a setting is on, and what it says beyond that: ESLint's "error", 2, ["warn", "camelCase"]; stylelint's true,
// "pattern", ["pattern", { … }], null for off.
function onAndOptions(tool, v) {
  if (tool === 'eslint') {
    const level = Array.isArray(v) ? v[0] : v;
    if (level === 'off' || level === 0 || level == null) return null;
    return { options: Array.isArray(v) ? v.slice(1) : [] };
  }
  if (v === null || v === false) return null;
  return { primary: Array.isArray(v) ? v[0] : v, options: Array.isArray(v) ? v.slice(1) : [] };
}

const caseIn = (says) => (/in (camelCase|PascalCase|kebab-case|snake_case|lower case)/.exec(says) ?? [])[1] ?? null;
// The class a part's or a variant's rule writes, as its own says it (button__label, button--large), to hold a pattern to.
const exampleIn = (says) => (/\(([\w-]+)\)/.exec(says) ?? [])[1] ?? (/name of its own \((\w+)\)/.exec(says) ?? [])[1] ?? null;
const STRICT = [[/^(\/?color\/?|color|border-color|background-color|fill|stroke)$/, ['code-border-token', 'code-shadow-token']], [/^(box-shadow|\/?shadow\/?)$/, ['code-shadow-token']],
  [/^(font-size|font|line-height|\/?font\/?)$/, ['code-text-token']], [/^(border-radius|\/?radius\/?)$/, ['code-radius-token']], [/^opacity$/, ['code-opacity-token']]];

// Each setting the engine understands, with the rules it may decide and whether it says what each one says.
const MAP = [
  { tool: 'eslint', setting: 'vue/prop-name-casing', rules: /^code-(boolean|option|text|number)-prop-case$/, says: (r, o) => caseIn(r.says) === (o.options[0] ?? 'camelCase') },
  { tool: 'eslint', setting: 'react/boolean-prop-naming', rules: /^code-boolean-prop-prefix$/, says: (r, o) => { const re = o.options[0]?.rule; const w = /begins with "(\w+)"/.exec(r.says)?.[1]; try { return !!(re && w && new RegExp(re).test(`${w}Thing`)); } catch { return false; } } },
  { tool: 'eslint', setting: 'vue/require-prop-comment', rules: /^code-prop-comment$/ },
  { tool: 'eslint', setting: 'vue/no-bare-strings-in-template', rules: /^code-words-through-props$/ },
  { tool: 'eslint', setting: 'react/jsx-no-literals', rules: /^code-words-through-props$/ },
  { tool: 'stylelint', setting: 'selector-class-pattern', rules: /^code-(part|variant)-class$/, says: (r, o) => { const ex = exampleIn(r.says); try { return !!(ex && new RegExp(String(o.primary)).test(ex)); } catch { return false; } } },
  { tool: 'stylelint', setting: 'color-no-hex', rules: /^code-(border|shadow)-token$/ },
  { tool: 'stylelint', setting: 'color-named', rules: /^code-(border|shadow)-token$/, says: (r, o) => o.primary === 'never' },
  ...['scale-unlimited/declaration-strict-value', 'declaration-strict-value'].map((setting) => ({ tool: 'stylelint', setting, rules: /^code-(border|shadow|text|radius|opacity)-token$/,
    says: (r, o) => [].concat(o.primary ?? []).some((p) => STRICT.some(([re, ids]) => re.test(String(p)) && ids.includes(r.id))) })),
];

export function decidedByLint(rules = [], configs = []) {
  const out = {};
  for (const r of rules) for (const m of MAP) {
    if (out[r.id] || !m.rules.test(r.id)) continue;
    const c = configs.find((x) => x.tool === m.tool && x.settings[m.setting]);
    if (!c) continue;
    const s = c.settings[m.setting], o = onAndOptions(m.tool, s.value);
    if (!o || (m.says && !m.says(r, o))) continue;
    out[r.id] = { tool: m.tool, file: c.file, line: s.line, setting: m.setting, value: s.value };
  }
  return out;
}

// What the team's own linter says for each setting that decides a rule: its count of reports, run from the project's
// node_modules/.bin (a linter not installed is not run, and nothing is fetched). The answer is kept with a stamp of the
// files and configs it read, so a build that changed none of them reads it again instead of running the linter.
export function lintReports(ROOT, decided = {}, files = [], opts = {}) {
  const by = {};
  for (const d of Object.values(decided)) (by[d.tool] ??= { file: d.file, settings: new Set() }).settings.add(d.setting);
  if (!Object.keys(by).length || !files.length) return {};
  const out = {};
  for (const l of teamLint(ROOT, Object.entries(by).map(([tool, b]) => ({ tool, file: b.file })), files, opts)) {
    if (!l.ran) continue;
    for (const s of by[l.tool].settings) out[s] = l.counts[s] ?? 0;
  }
  return out;
}

// What the team's own linters report on the files given, whatever their config says: a config that only extends a
// preset (next/core-web-vitals, plugin:vue/recommended) sets no rule the engine reads as decided, and is still the
// team's choice of rules. Each linter with a config is run as the team runs it, from the project's node_modules/.bin
// with its own config, never one the engine brings, fetched or wrote. One that cannot run says why, in the linter's
// own first line (a config its version cannot load, a plugin missing): a setup that is broken is a finding of its own,
// and the engine never runs another version in its place.
// configs: lintConfigs' list. → [{ tool, file, ran: true, counts: { rule: n }, findings: [{ rule, file, line, message }] }
//                                 | { tool, file, ran: false, version?, why }], why in the linter's own words
export function teamLint(ROOT, configs = [], files = [], { run = execFileSync, now = Date.now, keepIt = true } = {}) {
  const stampOf = (fs) => createHash('sha1').update(fs.map((f) => { try { const s = statSync(resolve(ROOT, f)); return `${f}:${s.size}:${s.mtimeMs}`; } catch { return `${f}:-`; } }).join('|')).digest('hex').slice(0, 16);
  const keep = join(ROOT, OUT_DIR, 'lint-reports.json');
  let kept = {}; try { kept = JSON.parse(readFileSync(keep, 'utf8')); } catch { /* none yet */ }
  const out = [];
  let changed = false;
  for (const { tool, file } of configs) {
    if (out.some((l) => l.tool === tool)) continue;
    const mine = files.filter((f) => (tool === 'stylelint' ? /\.(css|scss|less|vue|svelte)$/i : /\.(vue|jsx|tsx|js|ts|svelte)$/i).test(f));
    if (!mine.length) continue;
    const bin = projectBin(ROOT, tool);
    if (!bin) { out.push({ tool, file, ran: false, why: 'it is not installed in the project\'s node_modules: install the project\'s packages to run it' }); continue; }
    const stamp = stampOf([...new Set([...mine, file])]);
    if (kept[tool]?.stamp === stamp && kept[tool].findings) { out.push({ tool, file, ...pick(kept[tool]) }); continue; }
    let stdout, stderr = '';
    try { stdout = String(runBin(bin, tool === 'stylelint' ? ['--formatter', 'json', ...mine] : ['--format', 'json', ...mine], run, { cwd: ROOT, timeout: 90000, maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] })); }
    catch (e) { stdout = String(e?.stdout ?? ''); stderr = String(e?.stderr ?? e?.message ?? ''); }   // a linter that finds something exits with 1 and still answers
    // Stylelint 16 and later answer on stderr, ESLint on stdout. A file is named in filePath by ESLint (its source is the
    // file's text) and in source by Stylelint.
    const list = jsonList(stdout) ?? (tool === 'stylelint' ? jsonList(stderr) : null);
    let result;
    if (!list) { const w = whyNot(stderr || stdout); result = { ran: false, ...(w.version ? { version: w.version } : {}), why: w.error }; }
    else {
      const counts = {}, findings = [];
      for (const f of list) for (const w of (tool === 'stylelint' ? f.warnings : f.messages) ?? []) {
        const rule = (tool === 'stylelint' ? w.rule : w.ruleId) ?? null;
        if (rule) counts[rule] = (counts[rule] ?? 0) + 1;
        findings.push({ rule, file: relOf(ROOT, tool === 'stylelint' ? f.source : f.filePath), line: w.line ?? null, message: String(w.text ?? w.message ?? '').split('\n')[0].replace(/\s*\([\w/@-]+\)$/, '').slice(0, 200) });
      }
      result = { ran: true, counts, findings };
    }
    out.push({ tool, file, ...result });
    if (result.ran) { kept[tool] = { stamp, ...result, at: new Date(now()).toISOString() }; changed = true; }
  }
  if (changed && keepIt) try { mkdirSync(dirname(keep), { recursive: true }); writeFileSync(keep, JSON.stringify(kept, null, 1) + '\n'); } catch { /* kept next time */ }
  return out;
}
const pick = (k) => ({ ran: true, counts: k.counts ?? {}, findings: k.findings ?? [] });
const relOf = (ROOT, f) => { const r = resolve(String(f ?? '')), base = resolve(ROOT) + '/'; return r.startsWith(base) ? r.slice(base.length) : String(f ?? ''); };
function jsonList(text) {
  const t = String(text ?? ''), a = t.indexOf('['), b = t.lastIndexOf(']');
  if (a < 0 || b < a) return null;
  try { const v = JSON.parse(t.slice(a, b + 1)); return Array.isArray(v) ? v : null; } catch { return null; }
}
// The linter's own reason in one line: past its banner ("Oops! Something went wrong! :(", its version), its stack and
// the lines that draw where it was (each begins with a dash or a bar), to the first line that says what failed. → { version, error }
function whyNot(text) {
  const lines = String(text ?? '').split('\n').map((l) => l.trim()).filter(Boolean);
  const version = lines.map((l) => /^ESLint:\s*([\d.]+)/.exec(l)?.[1]).find(Boolean) ?? null;
  const said = lines.find((l) => !/^(Oops!|ESLint:\s*[\d.]+$|at\s|Referenced from|[-|])/.test(l)) ?? 'it stopped without saying why';
  return { version, error: said.slice(0, 200) };
}
