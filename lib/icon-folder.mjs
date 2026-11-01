// icon-folder.mjs - a system's icons kept as one SVG file each (src/assets/icons/m/alert-m.svg, loaded by path by its
// icon component), read as one <symbol> sheet, the form the style guide and the icon checks read a sprite in.
//
//   findIconFolder(root)            → the folder that holds the icons, relative to root, or null
//   folderSymbols(root, folder)     → [{ id, file, symbol }], one per SVG file, sorted by id
//   iconFolder(root, cfg)           → paths.iconFolder when set, else findIconFolder(root)
//   codeConnectIcons(root)          → [{ id, icon, name, url }], Figma's icons as Code Connect's batch files map them
//
// A folder counts as the icon folder when it is named icon or icons and holds at least MIN_FILES SVG files at any depth;
// the one under src/ comes first, then the one with the most files. Each symbol's id is its path inside the folder with
// the slashes as dashes (m/alert-m.svg → m-alert-m); the ids an SVG file uses inside it (a clip path, a gradient) take
// the symbol's id in front, so two files that both say id="clip0" stay apart on one page.
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';

const SKIP = new Set(['node_modules', '.git', 'dist', 'build', 'coverage', '.design-system-engine-out', '.cache']);
const MIN_FILES = 5;

// Every .svg file under dir, at any depth, as paths relative to dir with forward slashes.
export function svgFiles(dir) {
  const out = [];
  const walk = (d) => {
    let names; try { names = readdirSync(d); } catch { return; }
    for (const n of names) {
      if (SKIP.has(n) || n.startsWith('.')) continue;
      const p = join(d, n); let st; try { st = statSync(p); } catch { continue; }
      if (st.isDirectory()) walk(p);
      else if (/\.svg$/i.test(n)) out.push(relative(dir, p).split(/[\\/]+/).join('/'));
    }
  };
  walk(dir);
  return out.sort();
}

// The folder that holds the system's icons, relative to root (forward slashes), or null.
export function findIconFolder(root, { maxDepth = 5 } = {}) {
  const found = [];
  const walk = (d, depth) => {
    if (depth > maxDepth) return;
    let names; try { names = readdirSync(d); } catch { return; }
    for (const n of names) {
      if (SKIP.has(n) || n.startsWith('.')) continue;
      const p = join(d, n); let st; try { st = statSync(p); } catch { continue; }
      if (!st.isDirectory()) continue;
      if (/^icons?$/i.test(n)) {
        const count = svgFiles(p).length;
        if (count >= MIN_FILES) { found.push({ rel: relative(root, p).split(/[\\/]+/).join('/'), count }); continue; }
      }
      walk(p, depth + 1);
    }
  };
  walk(root, 0);
  found.sort((a, b) => (b.rel.startsWith('src/') ? 1 : 0) - (a.rel.startsWith('src/') ? 1 : 0) || b.count - a.count || a.rel.localeCompare(b.rel));
  return found[0]?.rel ?? null;
}

// A symbol id from a file's path inside the folder: m/alert-m.svg → m-alert-m.
export function symbolId(rel) {
  return String(rel).replace(/\.svg$/i, '').split(/[\\/]+/).join('-').replace(/[^A-Za-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '');
}

// One SVG file's markup as a <symbol> with the given id, or null when it holds no <svg>. Its viewBox is the file's own,
// else 0 0 width height; the ids it uses inside are prefixed with the symbol's id, and every reference to them follows.
export function svgToSymbol(id, svg) {
  const text = String(svg).replace(/<\?xml[\s\S]*?\?>/g, '').replace(/<!DOCTYPE[\s\S]*?>/gi, '').replace(/<!--[\s\S]*?-->/g, '');
  const m = /<svg\b([^>]*)>([\s\S]*)<\/svg>/i.exec(text);
  if (!m) return null;
  const attr = (name) => new RegExp(`\\s${name}\\s*=\\s*["']([^"']*)["']`, 'i').exec(m[1])?.[1] ?? null;
  const num = (v) => parseFloat(String(v ?? '').replace(/px$/, ''));
  const viewBox = attr('viewBox') ?? (num(attr('width')) > 0 && num(attr('height')) > 0 ? `0 0 ${num(attr('width'))} ${num(attr('height'))}` : null);
  let inner = m[2].trim();
  const own = [...new Set([...inner.matchAll(/\sid\s*=\s*["']([^"']+)["']/g)].map((x) => x[1]))];
  for (const old of own) {
    const neu = `${id}__${old}`;
    const esc = old.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    inner = inner
      .replace(new RegExp(`(\\sid\\s*=\\s*["'])${esc}(["'])`, 'g'), `$1${neu}$2`)
      .replace(new RegExp(`url\\(\\s*(["']?)#${esc}\\1\\s*\\)`, 'g'), `url(#${neu})`)
      .replace(new RegExp(`((?:xlink:)?href\\s*=\\s*["'])#${esc}(["'])`, 'g'), `$1#${neu}$2`);
  }
  // The file's own painting on its <svg> (fill="none" on a stroked icon, its stroke width, caps and joins), kept on the
  // symbol so every shape inside inherits it as it did in the file: without it a stroked outline fills black.
  const paint = ['fill', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin', 'stroke-miterlimit', 'fill-rule', 'clip-rule', 'color']
    .map((n) => [n, attr(n)]).filter(([, v]) => v != null).map(([n, v]) => ` ${n}="${v}"`).join('');
  return `<symbol id="${id}"${viewBox ? ` viewBox="${viewBox}"` : ''}${paint}>${inner}</symbol>`;
}

// One symbol per SVG file in the folder (root-relative), sorted by id: [{ id, file, symbol }].
export function folderSymbols(root, folder) {
  const dir = join(root, folder);
  if (!folder || !existsSync(dir)) return [];
  const out = [];
  for (const rel of svgFiles(dir)) {
    const id = symbolId(rel);
    let svg; try { svg = readFileSync(join(dir, rel), 'utf8'); } catch { continue; }
    const symbol = id && !out.some((x) => x.id === id) && svgToSymbol(id, svg);   // two files that make one id: the first kept
    if (symbol) out.push({ id, file: `${folder}/${rel}`, symbol });
  }
  return out.sort((a, b) => a.id.localeCompare(b.id));
}

// The icon folder: the one ds-config.json names (paths.iconFolder), else the one found.
export function iconFolder(root, cfg = {}) {
  const set = cfg.paths?.iconFolder;
  return set && existsSync(join(root, set)) ? String(set).replace(/\/+$/, '') : findIconFolder(root);
}

// Figma's icons as Code Connect's batch files (*.figma.batch.json) map them: each entry links a Figma component (its
// url) to the icon file it stands for ("icon": "l/error-l"), so Figma's list and the folder meet on the file's path
// with no list written by hand. Entries without an icon path are not icons; [] when there is no such file.
export function codeConnectIcons(root, { maxDepth = 6 } = {}) {
  const files = [];
  const walk = (d, depth) => {
    if (depth > maxDepth) return;
    let names; try { names = readdirSync(d); } catch { return; }
    for (const n of names) {
      if (SKIP.has(n) || n.startsWith('.')) continue;
      const p = join(d, n); let st; try { st = statSync(p); } catch { continue; }
      if (st.isDirectory()) walk(p, depth + 1);
      else if (/\.figma\.batch\.json$/i.test(n)) files.push(p);
    }
  };
  walk(root, 0);
  const out = new Map();
  for (const f of files.sort()) {
    let list; try { list = JSON.parse(readFileSync(f, 'utf8')).components; } catch { continue; }
    for (const c of Array.isArray(list) ? list : []) {
      if (typeof c?.icon !== 'string' || !c.icon.trim()) continue;
      const id = symbolId(c.icon);
      if (id && !out.has(id)) out.set(id, { id, icon: c.icon, name: c.component ?? c.icon, url: c.url ?? null });
    }
  }
  return [...out.values()].sort((a, b) => a.id.localeCompare(b.id));
}
