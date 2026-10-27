// icon-inventory-check.mjs - part of Gate 15 (Icons).
// Run from project root: node scripts/icon-inventory-check.mjs
//
// The other icon checks verify the icons the CODE declares. This closes the loop the
// other way: every icon the DS defines in FIGMA must have a code symbol. The DS icon
// set often lives in a SEPARATE Figma library file, so the inventory is captured from
// that library (REST /components on its file key with a token, OR the plugin) into
// figma-icons.snapshot.json: { "icons": ["arrow-left", "check", ...] }.
//
// Inert until that snapshot exists, so it never false-positives before capture.
//
// A system that keeps its icons as one SVG file each (icon-folder.mjs) is read from that folder. With no snapshot,
// Figma's list is taken from Code Connect's batch files, which link each Figma icon to its file: every icon is then
// matched on its path, and the files Figma has no icon for are listed too (advisory: they may be the product's own).
//
// Exit 0 = every Figma icon has a code symbol (or nothing to check).
// Exit 1 = a Figma icon has no code symbol (an unimplemented DS icon).

import { readFileSync, existsSync, readdirSync } from 'fs';
import { codeRoots } from './code-roots.mjs';
import { join, extname } from 'path';
import { ENGINE_DIRS } from './names.mjs';
import { iconFolder, svgFiles, symbolId, codeConnectIcons } from './icon-folder.mjs';

const ROOT = process.cwd();
let cfg = {};
try { cfg = JSON.parse(readFileSync(join(ROOT, 'ds-config.json'), 'utf8')); } catch {
  console.error('❌ ds-config.json not found at project root.'); process.exit(1);
}

// The inventory lives in figma-icon-inventory.snapshot.json when figma-icons.snapshot.json holds the
// icon path data (paths.snapshotIcons pointing at it); otherwise in figma-icons.snapshot.json.
const SNAP = existsSync(join(ROOT, 'figma-icon-inventory.snapshot.json')) ? 'figma-icon-inventory.snapshot.json' : 'figma-icons.snapshot.json';
const FOLDER = iconFolder(ROOT, cfg);
const folderIds = FOLDER ? svgFiles(join(ROOT, FOLDER)).map((rel) => symbolId(rel)).filter(Boolean) : [];
if (!existsSync(join(ROOT, SNAP))) {
  const linked = folderIds.length ? codeConnectIcons(ROOT) : [];
  if (!linked.length) {
    console.log(folderIds.length
      ? `⏭  icon inventory: ${folderIds.length} icon file(s) in ${FOLDER}, but Figma's icons are not captured (no ${SNAP}, no Code Connect batch linking them) - skipped`
      : `⏭  icon inventory: no ${SNAP} - skipped (capture it to enable)`);
    process.exit(0);
  }
  // Figma's icons as Code Connect links them, each to its file in the folder.
  const have = new Set(folderIds), inFigma = new Set(linked.map((l) => l.id));
  const MISSING = linked.filter((l) => !have.has(l.id));
  const CODE_ONLY = folderIds.filter((id) => !inFigma.has(id));
  console.log(`\n   ${linked.length} Figma icon(s) linked by Code Connect, ${folderIds.length} file(s) in ${FOLDER}`);
  console.log(`✅ IN BOTH     ${linked.length - MISSING.length}`);
  console.log(`❌ MISSING     ${MISSING.length}   (Figma icon whose file is not in the folder)`);
  console.log(`ℹ️  CODE ONLY   ${CODE_ONLY.length}   (file with no Figma icon linked: the product's own, or a link to add)`);
  if (MISSING.length) { console.log('\n─── Figma icons with no file ──'); for (const l of MISSING.slice(0, 40)) console.log(`  ❌ Figma icon "${l.name}" has no file at ${FOLDER}/${l.icon}.svg${l.url ? `  (${l.url})` : ''}`); }
  if (CODE_ONLY.length) { console.log('\n─── Files with no Figma icon linked ──'); for (const id of CODE_ONLY.slice(0, 40)) console.log(`  ℹ️  ${id}`); if (CODE_ONLY.length > 40) console.log(`  … ${CODE_ONLY.length - 40} more`); }
  if (!MISSING.length) console.log('   Every Figma icon has its file. ✓');
  process.exit(MISSING.length ? 1 : 0);
}
let icons = [];
try { icons = JSON.parse(readFileSync(join(ROOT, SNAP), 'utf8')).icons ?? []; } catch { /* malformed */ }
if (!Array.isArray(icons) || !icons.length) {
  console.log(`⏭  icon inventory: ${SNAP} has no icons - skipped`);
  process.exit(0);
}

const PREFIX = cfg.iconSpritePrefix ?? 'icon-';
const EXEMPT = new Set((cfg.knownUnimplementedIcons ?? []).map(s => norm(s)));
function norm(s) { return String(s).toLowerCase().replace(/[^a-z0-9]/g, ''); }

// ── Collect the icon names the CODE defines (sprite symbols + #icon-... references) ──
const SKIP_DIR = new Set(['node_modules', 'dist', 'build', '.git', '.next', 'coverage', ...ENGINE_DIRS]);
const EXT = new Set(['.vue', '.tsx', '.jsx', '.ts', '.js', '.html', '.svg', '.svelte', '.css']);
function walk(dir, out) {
  let entries = [];
  try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    if (e.name.startsWith('.') && e.name !== '.') continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) { if (!SKIP_DIR.has(e.name)) walk(p, out); }
    else if (EXT.has(extname(e.name))) out.push(p);
  }
}
const files = [];
for (const root of codeRoots(ROOT)) walk(root, files);
const codeIcons = new Set();
const pfx = PREFIX.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const symRe  = new RegExp(`<symbol[^>]*\\bid\\s*=\\s*['"\`]${pfx}([\\w-]+)['"\`]`, 'gi');
const hrefRe = new RegExp(`href\\s*=\\s*['"\`]?#${pfx}([\\w-]+)`, 'gi');
const idRe   = new RegExp(`['"\`]#?${pfx}([\\w-]+)['"\`]`, 'gi');
for (const f of files) {
  let t = ''; try { t = readFileSync(f, 'utf8'); } catch { continue; }
  for (const re of [symRe, hrefRe, idRe]) { re.lastIndex = 0; let m; while ((m = re.exec(t))) codeIcons.add(norm(m[1])); }
}
// An icon kept as its own file is in the code by its path in the folder (m/alert-m.svg) and by its file name.
for (const id of folderIds) codeIcons.add(norm(id));
if (FOLDER) for (const rel of svgFiles(join(ROOT, FOLDER))) codeIcons.add(norm(rel.split('/').pop().replace(/\.svg$/i, '')));

// ── Compare ─────────────────────────────────────────────────────────────────
const OK = [], MISSING = [];
for (const name of icons) {
  const n = norm(name);
  if (!n || EXEMPT.has(n)) continue;
  if (codeIcons.has(n)) OK.push(name);
  else MISSING.push(`Figma icon "${name}" has no code symbol (${PREFIX}${name}) - the DS icon is not implemented`);
}

console.log(`\n✅ IN CODE   ${OK.length}`);
console.log(`❌ MISSING   ${MISSING.length}   (Figma icon with no code symbol)`);
if (MISSING.length) { console.log('\n─── Figma icons missing from the code sprite ──'); for (const l of MISSING.slice(0, 40)) console.log(`  ❌ ${l}`); }
else console.log('   Every Figma icon has a code symbol. ✓');

process.exit(MISSING.length ? 1 : 0);
