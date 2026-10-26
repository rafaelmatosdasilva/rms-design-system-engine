// styleguide-files.mjs - the style guide as a page and the files beside it.
//
// The page links its own styles and code, its fonts and its data as files of their own, in one folder beside it and
// each named by what it holds (assets/styleguide.<hash>.css): the page and that folder are all a person downloads to
// open it on their computer. A host serves them once and a browser keeps them, so a visitor coming back after a rebuild
// downloads only what changed (the page and its data), and the component panel, the same page in a frame, reads
// everything from the browser's cache. Classic <script src> files and plain <link> stylesheets, never fetch or a module:
// the page still opens from disk, double-clicked.
//
//   splitPage(html, base)        → { html, files: Map(name → text) }   the page as it links its files
//   writeStyleguide(path, html)  → { files: [names], bytes }           writes the page and its files, removes stale ones
//   readPage(path)               → the page with every file it links written back in (one text, as before the split)
//   pageData(path)               → its data (sg-data), parsed
//   copyPage(path, folder)       → the page as index.html and its files, copied there (node styleguide-files.mjs page folder)
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, readdirSync, unlinkSync, existsSync, mkdirSync, copyFileSync } from 'node:fs';
import { join, dirname, basename, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// What the template marks to go into a file: <!--sg-file:name--> right before its <style> or <script>.
const FILE_MARK = /<!--sg-file:([\w-]+)-->\s*<(style|script)>([\s\S]*?)<\/\2>/g;
const DATA_TAG = /<script type="application\/json" id="sg-data">([\s\S]*?)<\/script>/;
const FONT_STYLE = /<style data-font-from="([^"]*)">([\s\S]*?)<\/style>/g;
// The folder beside the page its files go in.
export const ASSETS = 'assets';
// The files this module writes (and may remove): its names, a hash of ten hex digits, .css or .js; in the assets folder,
// or beside the page as an earlier build wrote them (removed once no page links them).
const OWN_NAME = /^(?:styleguide|fonts|[\w+-]+\.data)\.[0-9a-f]{10}\.(?:css|js)$/;
export const isOwnFile = (rel) => OWN_NAME.test(rel) || (String(rel).startsWith(ASSETS + '/') && OWN_NAME.test(String(rel).slice(ASSETS.length + 1)));
const hashOf = (text) => createHash('sha1').update(text).digest('hex').slice(0, 10);

// The data as a script that sets a global: its JSON written as the object itself (JSON is JavaScript), measured
// faster to load and lighter than a string parsed after. A < the inline tag had to escape is itself again. A key
// __proto__ would set the object's prototype there, not a key: such data stays text, parsed as JSON by the page.
export function dataScript(json) {
  const text = String(json).replace(/(\\+)u003c/g, (m, bs) => (bs.length % 2 ? bs.slice(1) + '<' : m));
  if (!/"__proto__"\s*:/.test(text)) return `self.SG_DATA=${text};\n`;
  return 'self.SG_DATA_JSON=String.raw`' + text.replace(/`/g, '\\u0060').replace(/\$\{/g, '\\u0024{') + '`;\n';
}
// The JSON text a data script holds.
export function dataOfScript(js) {
  const m = /^self\.SG_DATA=([\s\S]*);\s*$/.exec(String(js)) ?? /^self\.SG_DATA_JSON=String\.raw`([\s\S]*)`;\s*$/.exec(String(js));
  return m ? m[1] : null;
}

// The page as it links its files. base: the page's own name (index), which names its data file.
// A page with no mark (a project's own template) stays as it is.
export function splitPage(html, base = 'index') {
  const files = new Map();
  if (!/<!--sg-file:[\w-]+-->/.test(html)) return { html, files };
  const put = (name, ext, text) => { const f = `${ASSETS}/${name}.${hashOf(text)}.${ext}`; files.set(f, text); return f; };
  let out = html.replace(FILE_MARK, (all, name, tag, body) => (tag === 'style' ? `<link rel="stylesheet" href="${put(name, 'css', body)}">` : `<script src="${put(name, 'js', body)}"></script>`));
  out = out.replace(FONT_STYLE, (all, from, body) => `<link rel="stylesheet" href="${put('fonts', 'css', body)}" data-font-from="${from}">`);
  out = out.replace(DATA_TAG, (all, json) => `<script src="${put(`${String(base).replace(/[^\w+-]+/g, '-')}.data`, 'js', dataScript(json))}" id="sg-data"></script>`);
  return { html: out, files };
}

// The local files a page links (src= and href= that are a file beside it).
export const linksOf = (html) => [...String(html).matchAll(/\b(?:src|href)="([^"#?:]+)"/g)].map((m) => m[1]).filter((f) => !f.startsWith('/') && !f.includes('..'));

// Writes the page and the files it links; then removes the files this module wrote that no page beside it links
// any more (an earlier build's), so the folder holds what its pages use. split: false writes the page whole.
export function writeStyleguide(outPath, html, { split = true } = {}) {
  const dir = dirname(outPath);
  mkdirSync(dir, { recursive: true });
  const page = split ? splitPage(html, basename(outPath).replace(/\.html?$/i, '')) : { html, files: new Map() };
  let bytes = Buffer.byteLength(page.html);
  for (const [name, text] of page.files) {
    bytes += Buffer.byteLength(text);
    const p = join(dir, name);
    if (!existsSync(p)) { mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, text); }   // named by what it holds: one already there is the same
  }
  writeFileSync(outPath, page.html);
  const used = new Set();
  for (const f of readdirSync(dir)) if (/\.html?$/i.test(f)) { try { linksOf(readFileSync(join(dir, f), 'utf8')).forEach((l) => used.add(l)); } catch { /* unreadable: links nothing */ } }
  const mine = [...readdirSync(dir), ...(() => { try { return readdirSync(join(dir, ASSETS)).map((f) => `${ASSETS}/${f}`); } catch { return []; } })()];
  for (const f of mine) if (isOwnFile(f) && !used.has(f)) { try { unlinkSync(join(dir, f)); } catch { /* gone already */ } }
  return { files: [...page.files.keys()], bytes };
}

// The page with every file it links written back in: one text, as the page was before the split, for whatever reads
// the page's styles, code or data from its text (the style guide check, the accessibility bake, the tests).
// readFile: how a file is read (a test's own).
export function inlinePage(html, dir, readFile = (p) => readFileSync(p, 'utf8')) {
  const read = (rel) => { try { return readFile(join(dir, rel)); } catch { return null; } };
  return String(html)
    .replace(/<script src="((?:assets\/)?[^"/]+\.data\.[0-9a-f]{10}\.js)" id="sg-data"><\/script>/, (all, f) => { const j = dataOfScript(read(f) ?? ''); return j == null ? all : `<script type="application/json" id="sg-data">${j.replace(/</g, '\\u003c')}</script>`; })
    .replace(/<link rel="stylesheet" href="((?:assets\/)?(?:styleguide|fonts)\.[0-9a-f]{10}\.css)"( data-font-from="[^"]*")?>/g, (all, f, from) => { const t = read(f); return t == null ? all : `<style${from ?? ''}>${t}</style>`; })
    .replace(/<script src="((?:assets\/)?styleguide\.[0-9a-f]{10}\.js)"><\/script>/g, (all, f) => { const t = read(f); return t == null ? all : `<script>${t}</script>`; });
}
export function readPage(file) { return inlinePage(readFileSync(file, 'utf8'), dirname(file)); }
export function pageData(file) {
  const m = DATA_TAG.exec(readPage(file));
  return m ? JSON.parse(m[1]) : null;
}
// The page, as index.html, and the files it links, copied into a folder (a Pages job's public/): never the rest of
// the page's folder.
export function copyPage(page, toDir) {
  const dir = dirname(page), html = readFileSync(page, 'utf8');
  mkdirSync(toDir, { recursive: true });
  const files = linksOf(html).filter((f) => isOwnFile(f) && existsSync(join(dir, f)));
  for (const f of files) { mkdirSync(dirname(join(toDir, f)), { recursive: true }); copyFileSync(join(dir, f), join(toDir, f)); }
  writeFileSync(join(toDir, 'index.html'), html);
  return ['index.html', ...files];
}

//   node styleguide-files.mjs <page.html> <folder>   copyPage, for the publishing job
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [page, to] = process.argv.slice(2);
  if (!page || !to) { console.error('usage: node styleguide-files.mjs <page.html> <folder>'); process.exit(1); }
  console.log(`Copied ${copyPage(resolve(page), resolve(to)).join(', ')} into ${to}`);
}
