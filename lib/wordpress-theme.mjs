// wordpress-theme.mjs - the system's tokens as a WordPress theme's files, from Figma's variables, with no control center.
//
//   rms-design-system-engine --wordpress [<theme folder>]
//   ds-config.json → "wordpress": { "theme": "<the theme's folder>" }   (then every audit makes them too)
//
// Made from the same dictionary as the control center's Tokens page (token-exports.mjs fromVariables, from the list of
// Figma's variables styleguide-data.mjs allVariables reads), so the command and the page never give two answers:
//   <out>/wordpress/theme.json          every token's first mode, its presets named by the code's own variables
//   <out>/wordpress/styles/<mode>.json  a style variation for each other mode a site switches to (Dark, a second brand)
// Both are the engine's own files, written again on every run.
//
// With the theme's folder, the theme's own theme.json and styles/ are compared with them, and what would bring the
// theme in line is written as one patch, <out>/wordpress/theme.diff, for a person to apply in that folder (git apply).
// Nothing in the theme is ever changed here: it is code people wrote. The patch keeps everything the system does not
// own (styles, templates, layout, a font's files), and a preset only the theme has stays and is named, for a person to
// take to Figma or remove.
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { join, resolve, dirname, relative } from 'node:path';
import { homedir } from 'node:os';
import { OUT_DIR } from './names.mjs';
import { themeFiles } from './sign-off.mjs';
import { slashed } from './shown-path.mjs';
import { fromVariables, wordpressFiles, mergeTheme } from './token-exports.mjs';
import { unifiedDiff } from './text-diff.mjs';

export const PATCH_FILE = 'theme.diff';

// The theme's folder: the one given, else wordpress.theme. A theme.json named is read as its folder, and a leading ~ is
// the person's home (the router quotes the folder it was given, and a quoted ~ reaches here as it was typed).
export function themeFolder(ROOT, cfg = {}, given = null, home = homedir()) {
  const f = given ?? cfg.wordpress?.theme;
  if (!f || typeof f !== 'string') return null;
  const p = /^~([/\\]|$)/.test(f) ? join(home, f.slice(1)) : resolve(ROOT, f);
  return /\.json$/i.test(p) ? dirname(p) : p;
}

// JSON written the way the file it replaces is: its indent (WordPress's own files use tabs), its line ends (a file
// checked out on Windows has \r\n) and its last newline, so the patch holds only what changed.
export function jsonText(value, like = null) {
  const m = like ? /^\{\r?\n([ \t]+)\S/.exec(like) : null;
  const indent = m ? (m[1].startsWith('\t') ? '\t' : m[1].length) : '\t';
  const eol = like && /\r\n/.test(like) ? '\r\n' : '\n';
  return JSON.stringify(value, null, indent).split('\n').join(eol) + (like != null && !/\n$/.test(like) ? '' : eol);
}

// The system's name, as the control center says it: ds-config.json's name, else its package.json's.
function systemName(ROOT, cfg) {
  if (cfg.name) return cfg.name;
  try { return JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).name ?? null; } catch { return null; }
}

// Everything above, made. → { error } when there is nothing to make it from, else { out, theme, variations, fluid, left,
// dropped, count, captured, folder, patch, files: [{ file, made, changed, added, onlyTheirs, unreadable }] }
export async function writeWordpress(ROOT, cfg = {}, { theme = null, outDir = OUT_DIR } = {}) {
  const readJson = (rel) => { try { return JSON.parse(readFileSync(resolve(ROOT, rel), 'utf8')); } catch { return null; } };
  const vars = readJson(cfg.paths?.snapshotVars ?? 'src/figma-vars.snapshot.json');
  if (!vars) return { error: cfg.figmaFileKey === '' && !cfg.figmaSourceKey
    ? 'this project was set up from its code alone, with no Figma file, and the theme is made from Figma\'s variables: give the engine the Figma file\'s link first (--init --figma-url=<link>), then read it (--refresh-figma)'
    : 'there is no Figma variables snapshot to make it from (read Figma first: --refresh-figma)' };
  const css = themeFiles(cfg).map((f) => { try { return readFileSync(resolve(ROOT, f), 'utf8'); } catch { return ''; } }).join('\n');
  const { allVariables } = await import('./styleguide-data.mjs');
  const all = allVariables(vars, css, readJson(cfg.figmaCli?.designJson ?? 'design.json'));
  if (!all.length) return { error: 'the Figma variables snapshot holds no variables' };
  const name = systemName(ROOT, cfg);
  const { tokens, dropped } = fromVariables(all, { name });
  const made = wordpressFiles(tokens, { name });
  const ours = [['theme.json', made.theme], ...made.variations.map((v) => [v.file, v.theme])];

  // The engine's own copy, made again whole: a mode Figma no longer has loses its file.
  const out = join(ROOT, outDir, 'wordpress');
  rmSync(out, { recursive: true, force: true });
  for (const [file, json] of ours) { mkdirSync(dirname(join(out, file)), { recursive: true }); writeFileSync(join(out, file), jsonText(json)); }

  const folder = themeFolder(ROOT, cfg, theme);
  // When Figma was read: the command makes the theme from the capture and never reads Figma itself, so the run says it.
  const captured = typeof vars._updated === 'string' && !Number.isNaN(Date.parse(vars._updated)) ? vars._updated.slice(0, 10) : null;
  const res = { out: slashed(relative(ROOT, out)) || '.', captured, theme: made.theme, variations: made.variations, fluid: made.fluid, left: made.left, dropped, count: all.length, folder: null, patch: null, files: [] };
  if (!folder) return res;
  if (!existsSync(join(folder, 'theme.json')) && !existsSync(folder)) return { ...res, error: `the theme's folder ${slashed(folder)} is not there` };
  res.folder = slashed(folder);
  let diff = '';
  for (const [file, json] of ours) {
    const at = join(folder, file), before = existsSync(at) ? readFileSync(at, 'utf8') : null;
    let theirs = null;
    if (before != null) { try { theirs = JSON.parse(before); } catch { res.files.push({ file, unreadable: true }); continue; } }
    const m = mergeTheme(theirs, json);
    diff += unifiedDiff(file, before, jsonText(m.theme, before));
    res.files.push({ file, made: before == null, changed: m.changed, added: m.added, onlyTheirs: m.onlyTheirs });
  }
  if (diff) { writeFileSync(join(out, PATCH_FILE), diff); res.patch = slashed(relative(ROOT, join(out, PATCH_FILE))); }
  return res;
}

// What a run says about it, a line each. → lines
export function wordpressLines(r) {
  if (r.error) return [`⚠️  WordPress theme not made: ${r.error}.`];
  const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
  const kinds = [['color', 'palette', 'colour'], ['typography', 'fontSizes', 'font size'], ['typography', 'fontFamilies', 'font family', 'font families'], ['spacing', 'spacingSizes', 'spacing'], ['border', 'radiusSizes', 'radius', 'radii'], ['shadow', 'presets', 'shadow']]
    .map(([g, k, one, many]) => [r.theme.settings?.[g]?.[k]?.length ?? 0, one, many]).filter(([n]) => n).map(([n, one, many]) => plural(n, one, many));
  const custom = r.theme.settings?.custom ? ' and the rest under custom' : '';
  const out = [`🧩 WordPress theme → ${r.out}/theme.json: ${kinds.join(' · ') || 'no presets'}${custom}`,
    `   From Figma as captured ${r.captured ? `on ${r.captured}` : 'last (the capture has no date)'}: a change made in Figma since then needs Figma read again first (--refresh-figma).`];
  if (r.variations.length) out.push(`   ${plural(r.variations.length, 'style variation')} for the other modes: ${r.variations.map((v) => `${v.mode} (${v.file})`).join(' · ')}`);
  if (r.fluid) out.push(`   ${plural(r.fluid, 'font size')} fluid, from the narrowest screen's size to the widest's`);
  if (r.left) out.push(`   ${plural(r.left, 'token')} with a value per screen width that WordPress has no fluid form for (not a font size): theme.json has the first screen's`);
  if (r.dropped?.length) out.push(`   ${plural(r.dropped.length, 'token')} left out, another token having the same name: ${r.dropped.slice(0, 8).join(' · ')}`);
  if (!r.folder) return out;
  const said = (list) => list.slice(0, 6).join(' · ') + (list.length > 6 ? ` · ${list.length - 6} more` : '');
  for (const f of r.files) {
    if (f.unreadable) { out.push(`   ⚠️  ${f.file} in the theme is not valid JSON: not compared`); continue; }
    if (f.made) { out.push(`   ${f.file}: not in the theme yet, the patch adds it`); continue; }
    const moves = [f.changed.length ? `${f.changed.length} changed` : '', f.added.length ? `${f.added.length} added` : ''].filter(Boolean).join(', ');
    out.push(`   ${f.file}: ${moves || 'in line with Figma'}`);
    if (f.onlyTheirs.length) out.push(`     only in the theme, kept (a person adds it to Figma or removes it): ${said(f.onlyTheirs)}`);
  }
  out.push(r.patch ? `   Patch for the theme → ${r.patch}: apply it in ${r.folder} with git apply. Nothing in the theme was changed.` : '   The theme is in line with Figma: no patch.');
  return out;
}
