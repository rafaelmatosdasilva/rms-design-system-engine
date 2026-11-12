// lint-config.mjs - the rules a team already wrote into its own linters, read as decisions it has already made.
//
// The code's construction rules put each line to the team as a question ("A yes/no prop is named in camelCase?
// 368 of 369 do. Is it the rule?"). A team that wrote that very rule into its ESLint or stylelint config has already
// answered it, in the place its own tooling enforces it, and asking again is asking twice. This reads those configs
// and, for each setting the engine understands, marks the matching construction rule as the team's, saying where it
// was written.
//
// Only settings that say the same thing as a rule the engine mines are read. Nothing else in a config is interpreted,
// and a setting that is turned off ("off", 0) decides nothing. The engine never writes a lint config.
//
//   lintDecisions(ROOT, cfg) → { answers: { <rule id>: true }, from: { <rule id>: 'where it was written' }, files }
//   decisionsIn(configs)     → the same, from [{ file, data }] already read (pure)
//
// Configs read, where a project has them: .eslintrc(.json|.js|.cjs|.yaml|.yml), eslint.config.(js|mjs|cjs),
// package.json's "eslintConfig", .stylelintrc(.json|…), stylelint.config.(js|cjs|mjs) and package.json's "stylelint".
// A config written as JavaScript is read as text, never run: a config file is code, and running a project's code to
// read a setting is not something a check should do.
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

export const ESLINT_FILES = ['.eslintrc.json', '.eslintrc', '.eslintrc.yaml', '.eslintrc.yml', '.eslintrc.js', '.eslintrc.cjs', 'eslint.config.js', 'eslint.config.mjs', 'eslint.config.cjs'];
export const STYLELINT_FILES = ['.stylelintrc.json', '.stylelintrc', '.stylelintrc.yaml', '.stylelintrc.yml', '.stylelintrc.js', '.stylelintrc.cjs', 'stylelint.config.js', 'stylelint.config.cjs', 'stylelint.config.mjs'];

// A rule's setting as written: "error", 2, ["error", { … }]. Off is "off", 0 or a list beginning with one.
const level = (v) => (Array.isArray(v) ? v[0] : v);
export const isOn = (v) => { const l = level(v); return !(l === 'off' || l === 0 || l === false || l == null); };
const options = (v) => (Array.isArray(v) ? v.slice(1) : []);

// The case a pattern or an option names, in the engine's own words (caseOf's).
export function caseNamed(x) {
  const s = String(x ?? '');
  if (/^camelCase$/i.test(s)) return 'camelCase';
  if (/^PascalCase$/i.test(s)) return 'PascalCase';
  if (/^(kebab-case|kebabCase|param-case)$/i.test(s)) return 'kebab-case';
  if (/^(snake_case|snakeCase)$/i.test(s)) return 'snake_case';
  // A regular expression a team writes for its class names: the common shapes, never a guess at an arbitrary one.
  if (/\^\[a-z\]\[a-zA-Z0-9\]\*\$/.test(s)) return 'camelCase';
  if (/\^\[a-z0-9\\?-\]\+\$|\^\(\[a-z\]\[a-z0-9\]\*\)\(-\[a-z0-9\]\+\)\*\$/.test(s)) return 'kebab-case';
  return null;
}

// Which construction rule each setting the engine understands decides. A rule here is one the engine mines itself:
// a lint setting that says something the engine never reads decides nothing.
const PROP_CASE_RULES = ['code-boolean-prop-case', 'code-option-prop-case', 'code-text-prop-case', 'code-number-prop-case'];

export function decisionsIn(configs = []) {
  const answers = {}, from = {};
  const say = (ids, where) => { for (const id of [ids].flat()) { if (answers[id] === undefined) { answers[id] = true; from[id] = where; } } };
  for (const { file, data } of configs) {
    const rules = { ...(data?.rules ?? {}) };
    for (const r of [data].flat().concat(Array.isArray(data) ? data : [])) if (r && typeof r === 'object' && r.rules) Object.assign(rules, r.rules);
    for (const [name, value] of Object.entries(rules)) {
      if (!isOn(value)) continue;
      const opts = options(value);
      // A prop named in one case: the same thing the engine's prop-naming rules say.
      if (/(^|\/)prop-name-casing$/.test(name) && caseNamed(opts[0] ?? 'camelCase')) say(PROP_CASE_RULES, `${file} (${name})`);
      // Every class named by one pattern: the engine's own rules for a part's class and a variant's.
      if (/(^|\/)selector-class-pattern$/.test(name)) say(['code-part-class', 'code-variant-class'], `${file} (${name})`);
      // Values written with the system's tokens rather than by hand.
      if (/declaration-strict-value$/.test(name)) {
        const props = [opts[0] ?? []].flat().map(String);
        const has = (re) => props.some((p) => re.test(p));
        if (has(/color|fill|stroke|border/i)) say(['code-border-token'], `${file} (${name})`);
        if (has(/padding|margin|gap|spacing/i)) say(['code-spacing-token'], `${file} (${name})`);
        if (has(/radius/i)) say(['code-radius-token'], `${file} (${name})`);
        if (has(/shadow/i)) say(['code-shadow-token'], `${file} (${name})`);
        if (has(/font|line-height|letter-spacing/i)) say(['code-text-token'], `${file} (${name})`);
        if (has(/opacity/i)) say(['code-opacity-token'], `${file} (${name})`);
      }
      if (/(^|\/)color-no-hex$/.test(name)) say(['code-border-token'], `${file} (${name})`);
      // Every component carries its own documentation comment.
      if (/(^|\/)require-jsdoc$|jsdoc\/require-jsdoc$/.test(name)) say(['code-component-comment'], `${file} (${name})`);
      if (/jsdoc\/require-param-description$/.test(name)) say(['code-prop-comment'], `${file} (${name})`);
    }
  }
  return { answers, from };
}

// A config file read as data. JSON and YAML are parsed; a JavaScript config is read as text and only its rule names
// and their first option are taken, since running a project's own code to read a setting is not a check's business.
export function readConfig(path, read = (p) => readFileSync(p, 'utf8')) {
  let text = '';
  try { text = read(path); } catch { return null; }
  if (/\.(json|eslintrc|stylelintrc)$|rc$/.test(path) || text.trimStart().startsWith('{')) {
    try { return JSON.parse(text); } catch { /* not JSON: read as text below */ }
  }
  if (/\.(ya?ml)$/.test(path)) return yamlRules(text);
  return textRules(text);
}

// The rules block of a YAML config: "rules:" and the "name: value" lines under it. Only what this file is for.
export function yamlRules(text) {
  const rules = {};
  const lines = String(text).split('\n');
  let inRules = false, indent = 0;
  for (const l of lines) {
    if (/^\s*rules\s*:/.test(l)) { inRules = true; indent = l.search(/\S/); continue; }
    if (!inRules) continue;
    if (l.trim() && l.search(/\S/) <= indent) { inRules = false; continue; }
    const m = /^\s*["']?([\w@/-]+)["']?\s*:\s*(.*)$/.exec(l);
    if (m) rules[m[1]] = m[2].replace(/^\[|\].*$/g, '').split(',')[0].trim().replace(/^["']|["']$/g, '') || 'error';
  }
  return { rules };
}

// A JavaScript config read as text: each "name": value or 'name': value that names a rule, with its first option.
export function textRules(text) {
  const rules = {};
  for (const m of String(text).matchAll(/["']([\w@][\w@/-]*)["']\s*:\s*(\[[^\]]*\]|["'][\w-]+["']|\d)/g)) {
    const raw = m[2];
    let v;
    if (raw.startsWith('[')) {
      const parts = [...raw.matchAll(/["']([^"']*)["']|(\d+)/g)].map((x) => x[1] ?? Number(x[2]));
      v = parts;
    } else v = raw.replace(/^["']|["']$/g, '');
    rules[m[1]] = v;
  }
  return { rules };
}

// Every lint config a project has, and the decisions they carry.
export function lintDecisions(ROOT, cfg = {}, { exists = existsSync, read = (p) => readFileSync(p, 'utf8') } = {}) {
  const configs = [];
  for (const name of [...ESLINT_FILES, ...STYLELINT_FILES]) {
    const p = join(ROOT, name);
    if (!exists(p)) continue;
    const data = readConfig(p, read);
    if (data) configs.push({ file: name, data });
  }
  // package.json may hold either config inline.
  try {
    const pkg = JSON.parse(read(join(ROOT, 'package.json')));
    if (pkg.eslintConfig) configs.push({ file: 'package.json (eslintConfig)', data: pkg.eslintConfig });
    if (pkg.stylelint) configs.push({ file: 'package.json (stylelint)', data: pkg.stylelint });
  } catch { /* no package.json, or not readable */ }
  const { answers, from } = decisionsIn(configs);
  return { answers, from, files: configs.map((c) => c.file) };
}
