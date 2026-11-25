// wordpress-theme.mjs - the contracts' WordPress view: the system as a WordPress theme's files, what theme.json can say of
// it and nothing else (no PHP, no block of the system's own). Written with the contracts on every run, beside their DSDS
// and open specs views, and by `rms-design-system-engine --wordpress [<theme folder>]`.
//
//   ds-config.json → "wordpress": { "theme": "<the theme's folder>" }   (then every run also writes the patch below)
//
// The tokens come from the same dictionary as the control center's Tokens page (token-exports.mjs fromVariables, from the
// list of Figma's variables styleguide-data.mjs allVariables reads), so the view and the page never give two answers. The
// components come from their contracts (contract-wordpress.mjs):
//   contracts/wordpress/theme.json              every token's first mode as presets, and the components styled with them
//                                               where WordPress keeps each (styles.elements, styles.blocks)
//   contracts/wordpress/styles/<mode>.json      a style variation for each other mode a site switches to (Dark, a brand)
//   contracts/wordpress/styles/blocks/<x>.json  a block's style for each other look of its component (Outline)
// All of them the engine's own files, written again whole on every run.
//
// With the theme's folder, the theme's own theme.json and styles/ are compared with them, and what would bring the
// theme in line is written as one patch, <out>/wordpress/theme.diff, for a person to apply in that folder (git apply).
// The theme is code people wrote, so it is changed only with --apply, which the person chose when asked (the router
// asks every time a theme is named; never a setting, never an audit). The patch keeps everything the system does not
// own (styles, templates, layout, a font's files), and a preset only the theme has stays and is named, for a person to
// take to Figma or remove.
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { join, resolve, dirname, relative } from 'node:path';
import { homedir } from 'node:os';
import { themeFiles } from './sign-off.mjs';
import { slashed } from './shown-path.mjs';
import { fromVariables, wordpressFiles, mergeTheme, resolveValue } from './token-exports.mjs';
import { tokenText } from './dtcg.mjs';
import { wordpressComponents } from './contract-wordpress.mjs';
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

// The contracts' own folder, as contract-gen.mjs writes it.
export const contractsDir = (ROOT, cfg = {}) => (cfg.contracts?.out ? resolve(ROOT, cfg.contracts.out) : join(ROOT, 'contracts'));

// Everything above, made. built: the contracts this run made ([{ name, contract }]), contractTokens: their DTCG
// dictionary (a text style's composite lives only there). → { error } when there is nothing to make it from, else { out,
// theme, variations, blocks, components, fluid, left, dropped, count, captured, folder, patch, files: [{ file, made,
// changed, added, onlyTheirs, unreadable }] }
export async function writeWordpress(ROOT, cfg = {}, { theme = null, apply = false, dir = join(contractsDir(ROOT, cfg), 'wordpress'), built = [], contractTokens = {} } = {}) {
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
  // The components, in the words theme.json has: each token by the theme's own name for it, else its value.
  const leafAt = (path) => { let at = contractTokens; for (const k of path.split('.')) { at = at && typeof at === 'object' && Object.hasOwn(at, k) ? at[k] : undefined; } return at && typeof at === 'object' && '$value' in at ? at : null; };
  const dotted = (t) => String(t).split('/').map((x) => x.trim()).filter(Boolean).join('.');
  const components = wordpressComponents(built.map((b) => b.contract).filter(Boolean), {
    refOf: (t) => made.refs[dotted(t)] ?? null,
    valueOf: (t) => { const leaf = leafAt(dotted(t)); return leaf ? tokenText(resolveValue(contractTokens, leaf.$value)) : null; },
  });
  if (components.styles) made.theme.styles = components.styles;
  const ours = [['theme.json', made.theme], ...made.variations.map((v) => [v.file, v.theme]), ...components.variations.map((v) => [v.file, v.theme])];

  // The engine's own copy, made again whole: a mode Figma no longer has loses its file.
  const out = dir;
  rmSync(out, { recursive: true, force: true });
  for (const [file, json] of ours) { mkdirSync(dirname(join(out, file)), { recursive: true }); writeFileSync(join(out, file), jsonText(json)); }

  const folder = themeFolder(ROOT, cfg, theme);
  // When Figma was read: the command makes the theme from the capture and never reads Figma itself, so the run says it.
  const captured = typeof vars._updated === 'string' && !Number.isNaN(Date.parse(vars._updated)) ? vars._updated.slice(0, 10) : null;
  const res = { out: slashed(relative(ROOT, out)) || '.', captured, theme: made.theme, variations: made.variations, blocks: components.variations, components, fluid: made.fluid, left: made.left, dropped, count: all.length, folder: null, patch: null, files: [] };
  if (!folder) return res;
  if (!existsSync(join(folder, 'theme.json')) && !existsSync(folder)) return { ...res, error: `the theme's folder ${slashed(folder)} is not there` };
  res.folder = slashed(folder);
  let diff = '';
  const after = [];
  for (const [file, json] of ours) {
    const at = join(folder, file), before = existsSync(at) ? readFileSync(at, 'utf8') : null;
    let theirs = null;
    if (before != null) { try { theirs = JSON.parse(before); } catch { res.files.push({ file, unreadable: true }); continue; } }
    const m = mergeTheme(theirs, json), text = jsonText(m.theme, before);
    diff += unifiedDiff(file, before, text);
    if (text !== before) after.push([at, text]);
    res.files.push({ file, made: before == null, changed: m.changed, added: m.added, onlyTheirs: m.onlyTheirs });
  }
  if (diff) { writeFileSync(join(out, PATCH_FILE), diff); res.patch = slashed(relative(ROOT, join(out, PATCH_FILE))); }
  // Asked for in so many words, that request alone (--apply, never a setting and never an audit): the theme's files get
  // what the patch says, each written in its own way as the patch has it, and the patch stays as the record of it.
  if (apply && after.length) {
    for (const [at, text] of after) { mkdirSync(dirname(at), { recursive: true }); writeFileSync(at, text); }
    res.applied = after.length;
    const whole = slashed(join(out, PATCH_FILE));   // whole, since it is run from the theme's folder, and quoted past a space
    res.undo = /\s/.test(whole) ? `"${whole}"` : whole;
  }
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
  const c = r.components ?? { mapped: [], left: [] };
  if (c.mapped.length) out.push(`   ${plural(c.mapped.length, 'component style')}: ${c.mapped.slice(0, 6).map((m) => `${m.component} as ${m.as}`).join(' · ')}${c.mapped.length > 6 ? ` · ${c.mapped.length - 6} more` : ''}`);
  if (c.left.length) {
    const comps = [...new Set(c.left.map((x) => x.component))];
    out.push(`   Not in theme.json, with why (${plural(comps.length, 'component')}): ${c.left.slice(0, 5).map((x) => `${x.component}, ${x.why}`).join(' · ')}${c.left.length > 5 ? ` · ${c.left.length - 5} more` : ''}`);
  }
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
  out.push(r.applied ? `   Applied to the theme in ${r.folder}: ${plural(r.applied, 'file')} written. The patch is kept as the record → ${r.patch} (git apply -R ${r.undo ?? r.patch} in that folder undoes it).`
    : r.patch ? `   Patch for the theme → ${r.patch}: apply it in ${r.folder} with git apply, or ask for it applied (--apply). Nothing in the theme was changed.` : '   The theme is in line with Figma: no patch.');
  return out;
}

// What an audit says of the view: one line when no theme is named (the view is there for whoever wants it, as the DSDS
// and specs views are), every line when one is, and nothing for a project with no Figma to make it from unless it named
// a theme. → lines
export function auditLines(r, cfg = {}) {
  if (!r) return [];
  const named = !!cfg.wordpress?.theme;
  if (r.error) return named ? wordpressLines(r) : [];
  if (named) return wordpressLines(r);
  const n = (r.components?.mapped ?? []).length, v = r.variations.length + (r.blocks ?? []).length;
  return [`ℹ️  WordPress view → ${r.out}/theme.json: the tokens as its presets${n ? `, ${n} component${n === 1 ? '' : 's'} as its styles` : ''}${v ? `, ${v} style variation${v === 1 ? '' : 's'}` : ''}, for a team whose site is a WordPress theme (wordpress.theme for the patch).`];
}
