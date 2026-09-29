// skill-files.mjs - the guide's recipes and reference, read through the engine (idea I55).
//
// The command file an agent loads holds only the rules that always apply and an index. The rest lives
// beside the engine and is printed on demand, so it is found wherever the skill is installed (a linked
// command, a copied one, or `node <install-dir>/audit.mjs`):
//   rms-figma-code-parity --recipe [name]      a task recipe (cookbook/<name>.md); no name lists them
//   rms-figma-code-parity --reference [name]   a reference file (reference/<name>.md); no name lists them
//   rms-figma-code-parity --doctor             checks the install, with the one fix for each problem
//   rms-figma-code-parity --guide classic      links the command to the guide as it was before the split
import { readFileSync, existsSync, readdirSync, lstatSync, readlinkSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';

export const KINDS = { recipe: 'cookbook', reference: 'reference' };
export const GUIDE = 'rms-figma-code-parity.md';
export const CLASSIC_TAG = 'guide-monolith';

// The same guide as a native Claude Code Skill: the main file under a frontmatter, with the recipes and the
// reference beside it as files. Built from the main file, never kept as a second copy.
export const SKILL_DESCRIPTION = 'Checks a design system\'s code against its Figma file (tokens, structure, states, variants, accessibility) and reports what is not in parity, with the file and line to change. Use when the user asks for a parity audit, to compare code with Figma, to check a component against its design, or runs /rms-figma-code-parity.';
export function skillMd(guideText) {
  return `---\nname: rms-figma-code-parity\ndescription: ${JSON.stringify(SKILL_DESCRIPTION)}\n---\n\n${guideText}`;
}

// Each file with its first "Use when" line (recipes) or first heading (reference).
export function listDocs(engineDir, kind) {
  const dir = join(engineDir, KINDS[kind]);
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((f) => f.endsWith('.md')).sort().map((f) => {
    const text = readFileSync(join(dir, f), 'utf8');
    const when = text.match(/^\*\*Use when\.?\*\*\s*(.+)$/m)?.[1] ?? text.match(/^#\s+(.+)$/m)?.[1] ?? '';
    return { name: f.replace(/\.md$/, ''), when: when.trim() };
  });
}

export function readDoc(engineDir, kind, name) {
  const safe = String(name ?? '').replace(/\.md$/, '');
  if (!/^[a-z0-9][a-z0-9-]*$/.test(safe)) return null;
  const file = join(engineDir, KINDS[kind], `${safe}.md`);
  return existsSync(file) ? readFileSync(file, 'utf8') : null;
}

// Prints what --recipe / --reference show. Returns the exit code.
export function printDoc(engineDir, kind, name, log = console.log) {
  const list = listDocs(engineDir, kind);
  if (!name) {
    if (!list.length) { log(`No ${kind === 'recipe' ? 'recipes' : 'reference files'} in this version of the skill: the guide itself holds everything.`); return 2; }
    log(kind === 'recipe' ? 'Recipes (rms-figma-code-parity --recipe <name>):' : 'Reference (rms-figma-code-parity --reference <name>):');
    for (const d of list) log(`  ${d.name.padEnd(22)} ${d.when}`);
    return 0;
  }
  const text = readDoc(engineDir, kind, name);
  if (text == null) {
    log(`No ${kind} named "${name}".${list.length ? ` Known: ${list.map((d) => d.name).join(', ')}.` : ''}`);
    return 2;
  }
  log(text.replace(/\n$/, ''));
  return 0;
}

// The install, row by row: [{ ok, what, fix }].
export function doctor({ engineDir, projectDir, home = process.env.HOME ?? '', nodeVersion = process.versions.node, findChrome = () => null, hooksStatus = () => ({ installed: false }) } = {}) {
  const rows = [];
  const add = (ok, what, fix) => rows.push({ ok, what, fix: ok ? null : fix });
  const major = Number(String(nodeVersion).split('.')[0]);
  add(major >= 22, `Node ${nodeVersion}`, 'install Node 22 or newer (the browser reading needs its built-in WebSocket)');
  const cmd = join(home, '.claude', 'commands', GUIDE);
  let link = null, cmdOk = false, cmdWhat = 'the /rms-figma-code-parity command';
  try {
    const st = lstatSync(cmd);
    if (st.isSymbolicLink()) { link = resolve(join(home, '.claude', 'commands'), readlinkSync(cmd)); cmdOk = existsSync(link); cmdWhat += ` → ${link}`; }
    else { cmdOk = readFileSync(cmd, 'utf8') === readFileSync(join(engineDir, GUIDE), 'utf8'); cmdWhat += cmdOk ? ' (a copy, up to date)' : ' (a copy that differs from this engine\'s guide)'; }
  } catch { cmdWhat += ' (not installed)'; }
  add(cmdOk, cmdWhat, 'run rms-figma-code-parity --link-command (a link follows every update; a copy goes stale)');
  const recipes = listDocs(engineDir, 'recipe');
  const indexed = existsSync(join(engineDir, GUIDE)) && /--recipe/.test(readFileSync(join(engineDir, GUIDE), 'utf8'));
  add(!indexed || recipes.length > 0, indexed ? `${recipes.length} recipes beside the engine` : 'the guide holds everything (no recipes in this version)', 'the cookbook/ folder is missing: run rms-figma-code-parity --update');
  const chrome = findChrome();
  add(!!chrome, chrome ? `Chrome: ${chrome}` : 'Chrome not found', 'install Chrome or Chromium, or set CHROME_PATH (the browser reading and the accessibility check need it)');
  if (projectDir && existsSync(join(projectDir, 'ds-config.json'))) {
    let cfg = {};
    try { cfg = JSON.parse(readFileSync(join(projectDir, 'ds-config.json'), 'utf8')); } catch { add(false, 'ds-config.json', 'ds-config.json is not valid JSON; fix it'); }
    if (cfg.hooks === false) add(true, 'hooks: turned off in ds-config.json', null);
    else {
      const h = hooksStatus(projectDir);
      add(h.installed && h.exists !== false, h.installed ? (h.exists === false ? 'hooks installed, but they point at an engine that is gone' : 'hooks installed in this project') : 'hooks not installed in this project', 'run rms-figma-code-parity --install-hooks');
    }
  }
  return rows;
}

// The classic guide, as it was before the split, from the engine's git history (a tag).
export function classicGuide(engineDir, tag = CLASSIC_TAG) {
  try { return execFileSync('git', ['show', `${tag}:${GUIDE}`], { cwd: engineDir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 16 * 1024 * 1024 }); }
  catch { return null; }
}

// Writes it beside the engine (never tracked) and returns its path, or null when the tag is not there.
// An install is a shallow clone (install.sh uses --depth 1), so the tag is usually not there: fetch just it.
export function fetchClassic(engineDir, tag = CLASSIC_TAG) {
  if (classicGuide(engineDir, tag) != null) return true;
  try { execFileSync('git', ['fetch', '--depth', '1', 'origin', 'tag', tag, '--no-tags'], { cwd: engineDir, stdio: 'ignore', timeout: 30000 }); } catch { return false; }
  return classicGuide(engineDir, tag) != null;
}
export function writeClassicGuide(engineDir, tag = CLASSIC_TAG) {
  const text = fetchClassic(engineDir, tag) ? classicGuide(engineDir, tag) : null;
  if (text == null) return null;
  const file = join(engineDir, '.classic-guide.md');
  writeFileSync(file, text);
  return file;
}

// Opt-in, local only (I55): with PARITY_USAGE_LOG=1, each route, recipe, reference and run is appended to
// <project>/.parity-out/skill-usage.json, to see which recipes real requests use. Never sent anywhere; the
// request text is not kept, only the route it got. Returns true when it wrote.
export function logUsage(projectDir, entry, { env = process.env, now = () => new Date() } = {}) {
  if (env.PARITY_USAGE_LOG !== '1') return false;
  try {
    const dir = join(projectDir, '.parity-out');
    const file = join(dir, 'skill-usage.json');
    let list = [];
    try { list = JSON.parse(readFileSync(file, 'utf8')); } catch { /* first entry */ }
    if (!Array.isArray(list)) list = [];
    list.push({ at: now().toISOString(), ...entry });
    mkdirSync(dir, { recursive: true });
    writeFileSync(file, JSON.stringify(list.slice(-1000), null, 2) + '\n');
    return true;
  } catch { return false; }
}

// The guide set an evaluation measures: the main file, every recipe and every reference file (I55). A change
// to any of them needs a fresh evaluation; test/skill-evals.test.mjs holds RESULTS.md to this hash.
export function guideSetHash(engineDir) {
  const files = [GUIDE, ...['recipe', 'reference'].flatMap((k) => listDocs(engineDir, k).map((d) => join(KINDS[k], `${d.name}.md`)))];
  const h = createHash('sha256');
  for (const f of files.sort()) h.update(`${f}\n`).update(readFileSync(join(engineDir, f), 'utf8'));
  return h.digest('hex').slice(0, 12);
}
