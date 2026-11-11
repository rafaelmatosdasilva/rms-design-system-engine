// theme-editor.mjs - the themes the style guide's theme editor starts from (templates/styleguide/js/36-theme-editor.js).
//
// The editor makes a new theme of the system in the page: tokens over the system, never a change to its code. A theme it
// saves is kept in that browser and as a file, <name>.theme.json, in the person's own themes folder: one subfolder per
// system (<folder>/<system>/), kept apart from the system's project and from the engine, so nothing a person tries
// lands in a repository by accident. The next build reads that folder back into the page, with the team's themes store
// (stores.themes, read into the engine's own folder) first, so a theme a colleague made is there too.
//
//   systemSlug(cfg)             → the system's name as a folder name (Acme DS → acme-ds)
//   themesFolder(cfg)           → the person's themes folder (styleguide.themes, else THEMES_HOME), ~ as written
//   ownThemeDirs(ROOT, cfg)     → the folders this person keeps theme files in, for this system: the themes folder's
//                                 and each style guide module's data folder's (a module of a team's own keeps its data so)
//   readThemes(dirs)            → every theme in them, once each: by its id, else by its file name; the first folder wins
//   editorData(ROOT, cfg, opts) → what the page's editor reads: { system, folder, files } (opts.storeDir: the team's store)

import { readdirSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { SKILL } from './names.mjs';

// Each person's own, outside every project: beside the engine's other files of this computer.
export const THEMES_HOME = `~/.claude/${SKILL}-themes`;

export const systemSlug = (cfg = {}) => String(cfg.name || 'system').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'system';
const home = (ROOT, p) => resolve(ROOT, String(p).replace(/^~(?=$|\/)/, homedir()));
export const themesFolder = (cfg = {}) => (typeof cfg.styleguide?.themes === 'string' && cfg.styleguide.themes.trim()) || THEMES_HOME;

export function ownThemeDirs(ROOT, cfg = {}) {
  const sys = systemSlug(cfg);
  const modules = (Array.isArray(cfg.styleguide?.modules) ? cfg.styleguide.modules : []).map((m) => (m && typeof m === 'object' && m.data ? home(ROOT, m.data) : join(home(ROOT, m && typeof m === 'object' ? m.path : m), 'data')));
  return [...new Set([home(ROOT, themesFolder(cfg)), ...modules].map((d) => join(d, sys)))];
}

export function readThemes(dirs) {
  const readDir = (d) => { try { return readdirSync(d).filter((f) => /\.json$/i.test(f)).sort().map((f) => { try { return { file: f, ...JSON.parse(readFileSync(join(d, f), 'utf8')) }; } catch { return null; } }).filter((t) => t && typeof t === 'object'); } catch { return []; } };
  const out = [], seen = new Set();
  for (const d of dirs) for (const x of readDir(d)) { const k = x.id ? `id:${x.id}` : `file:${x.file}`; if (!seen.has(k)) { seen.add(k); out.push(x); } }
  return out;
}

// The folder is said in the page as written (~ for the home folder), never as this computer's full path: the page is
// published for the team.
export function editorData(ROOT, cfg = {}, { storeDir = null } = {}) {
  const folder = themesFolder(cfg).replace(homedir(), '~');
  const files = readThemes([...(storeDir ? [storeDir] : []), join(home(ROOT, themesFolder(cfg)), systemSlug(cfg))]);
  return { system: systemSlug(cfg), folder, files };
}
