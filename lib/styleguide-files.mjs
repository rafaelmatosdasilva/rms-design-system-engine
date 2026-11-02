// styleguide-files.mjs - the style guide as a page and the files beside it.
//
// The page links its own styles and code, its fonts and its data as files of their own, in one folder beside it and
// each named by what it holds (assets/styleguide.<hash>.css): the page and that folder are all a person downloads to
// open it on their computer. A host serves them once and a browser keeps them, so a visitor coming back after a rebuild
// downloads only what changed (the page and its data), and the component panel, the same page in a frame, reads
// everything from the browser's cache. Classic <script src> files and plain <link> stylesheets, never fetch or a module:
// the page still opens from disk, double-clicked.
//
// The pictures the data carries (a component's Figma images, a screen's shot) go into files of their own too
// (assets/img/<hash>.png), the data keeping their address. A picture hardly compresses, so written into the data it was
// most of what a visitor waited for before the page showed anything (on one guide 690 pictures, 11 MB of 27); as files,
// the browser fetches only the ones on screen and keeps them. A small one stays in the data: a file of its own would
// cost more than it saves. Whatever reads the page back (readPage) gets them written back in, as before.
//
// What only a component's own page reads (its code, its whole changelog, its Code Connect, its Figma images) goes into
// a file of its own too, its part (assets/<base>.part.<hash>.js), loaded when that component's page or panel opens. The
// first screen (Status, the menu, the overview) reads the rest of the data, and of a part only the little it uses (the
// root element of the component's template, the release and date of each change), which stays in the data. A large
// guide's data was mostly these, read by nobody until a component opened. Whatever reads the page back gets every part
// written back in, as before.
//
// The data and the parts are loaded by a few lines in the page (BOOT), never a fixed <script src>: the component panel,
// the same page in a frame, takes them from the page around it (the same files, so the same data), as that page read
// them, and downloads nothing a second time, on a host that sends no cache header too.
//
//   splitPage(html, base)        → { html, files: Map(name → text or bytes) }   the page as it links its files
//   pageLinks(html, read)        → the files a page uses beside it: what it links, and the parts and pictures its data names
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
const OWN_NAME = /^(?:styleguide|fonts|[\w+-]+\.(?:data|part))\.[0-9a-f]{10}\.(?:css|js)$/;
// The pictures taken out of the data: in their own folder in the assets, named by their bytes.
export const PICTURES = `${ASSETS}/img`;
const OWN_PICTURE = /^assets\/img\/[0-9a-f]{10}\.(?:png|jpg|webp|gif)$/;
export const isOwnFile = (rel) => OWN_NAME.test(rel) || OWN_PICTURE.test(rel) || (String(rel).startsWith(ASSETS + '/') && OWN_NAME.test(String(rel).slice(ASSETS.length + 1)));
const hashOf = (text) => createHash('sha1').update(text).digest('hex').slice(0, 10);
const DATA_FILE = /\.data\.[0-9a-f]{10}\.js$/;
// A component's part, beside the data in the assets folder, named in the data by its address.
const PART_FILE = /\.part\.[0-9a-f]{10}\.js$/;
export const isPartFile = (rel) => PART_FILE.test(String(rel));
const PART_REF = /"((?:assets\/)?[\w+-]+\.part\.[0-9a-f]{10}\.js)"/g;
export const partsOf = (text) => [...String(text ?? '').matchAll(PART_REF)].map((m) => m[1]);

// A picture in the data as JSON writes it (base64 holds no quote or escape); one shorter than this stays there.
const PICTURE_IN_DATA = /"data:image\/(png|jpeg|webp|gif);base64,([A-Za-z0-9+/]+={0,2})"/g;
const PICTURE_MIN = 2048;
const PICTURE_REF = /"(assets\/img\/[0-9a-f]{10}\.(png|jpg|webp|gif))"/g;
const EXT = { png: 'png', jpeg: 'jpg', webp: 'webp', gif: 'gif' };
const MIME = { png: 'png', jpg: 'jpeg', webp: 'webp', gif: 'gif' };
// The data with each picture put in a file (put(rel, bytes)) and named by its address; the pictures a data text names.
function picturesOut(json, put) {
  return json.replace(PICTURE_IN_DATA, (all, kind, b64) => {
    if (b64.length < PICTURE_MIN) return all;
    const bytes = Buffer.from(b64, 'base64'), rel = `${PICTURES}/${hashOf(bytes)}.${EXT[kind]}`;
    put(rel, bytes);
    return `"${rel}"`;
  });
}
export const picturesOf = (text) => [...String(text ?? '').matchAll(PICTURE_REF)].map((m) => m[1]);
// The data with each picture it names written back in (readBytes(rel) → its bytes); one that cannot be read stays an address.
function picturesIn(json, readBytes) {
  return json.replace(PICTURE_REF, (all, rel, ext) => { const b = readBytes(rel); return b ? `"data:image/${MIME[ext]};base64,${Buffer.from(b).toString('base64')}"` : all; });
}

// A JSON text as JavaScript that makes it: the object itself (JSON is JavaScript), measured faster to load and lighter
// than a string parsed after. A < the inline tag had to escape is itself again. A key __proto__ would set the object's
// prototype there, not a key: such data stays text, parsed as JSON.
const unescapeLt = (json) => String(json).replace(/(\\+)u003c/g, (m, bs) => (bs.length % 2 ? bs.slice(1) + '<' : m));
const hasProto = (text) => /"__proto__"\s*:/.test(text);
const asText = (text) => 'String.raw`' + text.replace(/`/g, '\\u0060').replace(/\$\{/g, '\\u0024{') + '`';
const fromText = (lit) => lit.slice('String.raw`'.length, -1);
// The data as a script: a function that makes it (SG_DATA_OF), called once for the page (SG_DATA). The component panel
// calls its text again for a copy of its own, as it was before the page's code changed anything (BOOT). Data with a key
// __proto__ stays text (SG_DATA_JSON), parsed by the page.
export function dataScript(json) {
  const text = unescapeLt(json);
  if (!hasProto(text)) return `self.SG_DATA_OF=(function(){return ${text};});self.SG_DATA=self.SG_DATA_OF();\n`;
  return 'self.SG_DATA_JSON=' + asText(text) + ';\n';
}
// The JSON text a data script holds (an earlier build's too: self.SG_DATA=<data>;).
export function dataOfScript(js) {
  const t = String(js);
  const m = /^self\.SG_DATA_OF=\(function\(\)\{return ([\s\S]*);\}\);self\.SG_DATA=self\.SG_DATA_OF\(\);\s*$/.exec(t) ?? /^self\.SG_DATA=([\s\S]*);\s*$/.exec(t) ?? /^self\.SG_DATA_JSON=String\.raw`([\s\S]*)`;\s*$/.exec(t);
  return m ? m[1] : null;
}
// A component's part as a script: a function that makes it, kept by the component's name (SG_PARTS) until the page
// takes it. part: { keys: every key of the component in its order, fields: what of it the part holds }.
export function partScript(name, json) {
  const text = unescapeLt(json);
  return `(self.SG_PARTS=self.SG_PARTS||{})[${JSON.stringify(name)}]=(function(){return ${hasProto(text) ? `JSON.parse(${asText(text)})` : text};});\n`;
}
// The component's name and the part's JSON text a part script holds.
export function partOfScript(js) {
  const m = /^\(self\.SG_PARTS=self\.SG_PARTS\|\|\{\}\)\[("(?:[^"\\]|\\.)*")\]=\(function\(\)\{return ([\s\S]*);\}\);\s*$/.exec(String(js ?? ''));
  if (!m) return null;
  let name; try { name = JSON.parse(m[1]); } catch { return null; }
  const body = m[2], raw = /^JSON\.parse\((String\.raw`[\s\S]*`)\)$/.exec(body);
  return { name, json: raw ? fromText(raw[1]) : body };
}

// What of a component only its own page reads, taken into its part; each says what the data keeps of it for the first
// screen (Status, the overview, the menu, the search), or undefined for nothing. A value it keeps whole is not taken.
// Each kept bit is read where the page reads the whole value today, so the first screen shows exactly what it showed.
const LATER = {
  // Its file in the code: the page reads its text on its own page (Download file); the first screen only its template's
  // root element (the role it gives a component with none stated), so only that start of it stays.
  source: (v) => (v && typeof v === 'object' && typeof v.text === 'string' ? { ...v, text: (/<template>\s*<[a-zA-Z-]+/.exec(v.text) ?? [''])[0] } : v),
  // Its changes: the overview and the logo read the release and the date of each, History which components a commit
  // changed (by its sha; its rows come from the release log). With no release log History lists these rows themselves,
  // so they stay whole.
  changelog: (v, data) => (Array.isArray(v) && (data.releaseLog ?? []).length
    ? v.map((r) => (r && typeof r === 'object' ? pick(r, r.sha ? ['sha', 'date', 'release'] : ['sha', 'subject', 'date', 'release']) : r)) : v),
  codeConnect: () => undefined,
  codeLists: () => undefined,
  figmaShots: () => undefined,
};
const pick = (o, keys) => Object.fromEntries(Object.keys(o).filter((k) => keys.includes(k)).map((k) => [k, o[k]]));
// The data with each component's part taken out (put(name, partJson) → its address), and the parts' addresses in the
// data (sgParts: { name: address }). A component whose name another shares stays whole: its part could not be told apart.
function partsOut(json, put) {
  let data;
  try { data = JSON.parse(json); } catch { return json; }
  if (!data || !Array.isArray(data.components)) return json;
  const names = {};
  for (const c of data.components) if (c && typeof c.name === 'string') names[c.name] = (names[c.name] ?? 0) + 1;
  const parts = {};
  data.components = data.components.map((c) => {
    if (!c || typeof c !== 'object' || typeof c.name !== 'string' || names[c.name] > 1) return c;
    const fields = {}, slim = {};
    for (const k of Object.keys(c)) {
      const keep = Object.hasOwn(LATER, k) ? LATER[k](c[k], data) : c[k];
      if (keep === c[k]) slim[k] = c[k]; else { fields[k] = c[k]; if (keep !== undefined) slim[k] = keep; }
    }
    if (!Object.keys(fields).length) return c;
    parts[c.name] = put(c.name, JSON.stringify({ keys: Object.keys(c), fields }));
    return slim;
  });
  if (!Object.keys(parts).length) return json;
  data.sgParts = parts;
  return JSON.stringify(data);
}
// The data with each part it names written back in (read(address) → the part script, or null), every component's keys
// in their first order. One that cannot be read stays as the data has it, still named in sgParts.
function partsIn(json, read) {
  if (!/"sgParts"\s*:/.test(json)) return json;
  let data;
  try { data = JSON.parse(json); } catch { return json; }
  const parts = data?.sgParts;
  if (!parts || typeof parts !== 'object' || !Array.isArray(data.components)) return json;
  data.components = data.components.map((c) => {
    const f = c && parts[c.name];
    const p = f ? partOfScript(read(f)) : null;
    let part = null; try { part = p && p.name === c.name ? JSON.parse(p.json) : null; } catch { part = null; }
    if (!part || !Array.isArray(part.keys) || !part.fields) return c;
    delete parts[c.name];
    const whole = Object.fromEntries(part.keys.map((k) => [k, Object.hasOwn(part.fields, k) ? part.fields[k] : c[k]]));
    for (const k of Object.keys(c)) if (!Object.hasOwn(whole, k)) whole[k] = c[k];
    return whole;
  });
  if (!Object.keys(parts).length) delete data.sgParts;
  return JSON.stringify(data);
}

// How the page loads its data and parts (the data file's address in data-src): written in while the page is read, so its
// code finds them there (document.write, the one way a classic script can load another before the next one runs, from
// disk too). The component panel (?embed) is this page in a frame, from the same address: when the page around it holds
// the same data file, it makes its own copy from that page's (its function's text, run here, so the copy is this
// frame's and as it was before that page's code changed it) instead of downloading it again; a parent of another
// origin, or with other data, and it loads it as any page does.
const BOOT_DATA = "(function(f){self.SG_DATA_FILE=f;var up=null;try{up=window.parent!==window&&window.parent.SG_DATA_FILE===f?window.parent:null;}catch(e){up=null;}"
  + "try{if(up&&up.SG_DATA_OF){self.SG_DATA=(0,eval)('('+up.SG_DATA_OF+')()');return;}if(up&&typeof up.SG_DATA_JSON==='string'){self.SG_DATA_JSON=up.SG_DATA_JSON;return;}}catch(e){/* loaded as usual */}"
  + "document.write('<script src='+JSON.stringify(f)+'><\\/script>');})(document.currentScript.getAttribute('data-src'));";
// Then the parts the address opens on, before the page's code runs: the component it names (#c-chip), or every one with
// ?all (?all&only=a,b: those), as the engine's checks open it, so those draw as before. SG_PART_TAKE(name): the part the
// page around the panel already holds, copied the same way. The page's code loads any other part when it opens.
const BOOT_PARTS = "(function(){var D=self.SG_DATA;if(!D&&typeof self.SG_DATA_JSON==='string'){try{D=self.SG_DATA=JSON.parse(self.SG_DATA_JSON);}catch(e){return;}}"
  + "var P=D&&D.sgParts;if(!P)return;var parts=self.SG_PARTS=self.SG_PARTS||{},files=self.SG_PART_FILES=self.SG_PART_FILES||{},up=null;"
  + "try{up=window.parent!==window&&window.parent.SG_DATA_FILE===self.SG_DATA_FILE&&window.parent.SG_PARTS?window.parent:null;}catch(e){up=null;}"
  + "self.SG_PART_TAKE=function(n){try{if(up&&up.SG_PARTS[n]&&(up.SG_PART_FILES||{})[n]===P[n]){parts[n]=(0,eval)('('+up.SG_PARTS[n]+')');files[n]=P[n];return true;}}catch(e){/* loaded as usual */}return false;};"
  + "var all=/[?&]all\\b/.test(location.search),only=/[?&]only=([^&]*)/.exec(location.search),id=(/^#([^\\/?]*)/.exec(location.hash)||[])[1]||'',tags='';"
  + "only=only?decodeURIComponent(only[1]).split(','):null;"
  + "Object.keys(P).forEach(function(n){if(!(all?!only||only.indexOf(n)>=0:'c-'+n.replace(/[^\\w-]+/g,'-')===id)||parts[n]||self.SG_PART_TAKE(n))return;files[n]=P[n];tags+='<script src='+JSON.stringify(P[n])+'><\\/script>';});"
  + "if(tags)document.write(tags);})();";
const bootTags = (file) => `<script id="sg-data" data-src="${file}">${BOOT_DATA}</script><script data-sg-parts>${BOOT_PARTS}</script>`;
const BOOT_DATA_TAG = /<script id="sg-data" data-src="((?:assets\/)?[^"/]+\.data\.[0-9a-f]{10}\.js)">[\s\S]*?<\/script>/;
const BOOT_PARTS_TAG = /<script data-sg-parts>[\s\S]*?<\/script>/;

// The page as it links its files. base: the page's own name (index), which names its data file.
// A page with no mark (a project's own template) stays as it is.
export function splitPage(html, base = 'index') {
  const files = new Map();
  if (!/<!--sg-file:[\w-]+-->/.test(html)) return { html, files };
  const put = (name, ext, text) => { const f = `${ASSETS}/${name}.${hashOf(text)}.${ext}`; files.set(f, text); return f; };
  let out = html.replace(FILE_MARK, (all, name, tag, body) => (tag === 'style' ? `<link rel="stylesheet" href="${put(name, 'css', body)}">` : `<script src="${put(name, 'js', body)}"></script>`));
  out = out.replace(FONT_STYLE, (all, from, body) => `<link rel="stylesheet" href="${put('fonts', 'css', body)}" data-font-from="${from}">`);
  const name = String(base).replace(/[^\w+-]+/g, '-');
  out = out.replace(DATA_TAG, (all, json) => {
    const index = partsOut(picturesOut(json, (rel, bytes) => files.set(rel, bytes)), (comp, part) => put(`${name}.part`, 'js', partScript(comp, part)));
    return bootTags(put(`${name}.data`, 'js', dataScript(index)));
  });
  return { html: out, files };
}

// The local files a page links (src= and href= that are a file beside it).
export const linksOf = (html) => [...String(html).matchAll(/\b(?:src|href)="([^"#?:]+)"/g)].map((m) => m[1]).filter((f) => !f.startsWith('/') && !f.includes('..'));
// The files a page uses beside it: what it links, and the parts and pictures named in the data file it links (a part's
// pictures too). read(rel) → that file's text, or null when it cannot be read: then what it names is not known, and
// unknown says so.
export function pageLinks(html, read) {
  const out = linksOf(html);
  let unknown = false;
  for (const l of out.filter((f) => DATA_FILE.test(f))) {
    const t = read(l);
    if (t == null) { unknown = true; continue; }
    const parts = partsOf(t);
    out.push(...picturesOf(t), ...parts);
    for (const p of parts) { const pt = read(p); if (pt == null) unknown = true; else out.push(...picturesOf(pt)); }
  }
  return Object.assign(out, { unknown });
}

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
  const read = (rel) => { try { return readFileSync(join(dir, rel), 'utf8'); } catch { return null; } };
  let unknown = false;
  for (const f of readdirSync(dir)) if (/\.html?$/i.test(f)) { const h = read(f); if (h == null) continue; const l = pageLinks(h, read); l.forEach((x) => used.add(x)); unknown ||= l.unknown; }
  const list = (d) => { try { return readdirSync(join(dir, d)).map((f) => `${d}/${f}`); } catch { return []; } };
  // A part or a picture is removed only when every page's data could be read: one that could not may still name it.
  const mine = [...readdirSync(dir), ...list(ASSETS).filter((f) => !(unknown && isPartFile(f))), ...(unknown ? [] : list(PICTURES))];
  for (const f of mine) if (isOwnFile(f) && !used.has(f)) { try { unlinkSync(join(dir, f)); } catch { /* gone already */ } }
  return { files: [...page.files.keys()], bytes };
}

// The page with every file it links written back in: one text, as the page was before the split, for whatever reads
// the page's styles, code or data from its text (the style guide check, the accessibility bake, the tests).
// readFile: how a file is read (a test's own); readBytes: how a picture is.
export function inlinePage(html, dir, readFile = (p) => readFileSync(p, 'utf8'), readBytes = (p) => readFileSync(p)) {
  const read = (rel) => { try { return readFile(join(dir, rel)); } catch { return null; } };
  const bytes = (rel) => { try { return readBytes(join(dir, rel)); } catch { return null; } };
  const dataTag = (all, f) => { const j = dataOfScript(read(f) ?? ''); return j == null ? all : `<script type="application/json" id="sg-data">${picturesIn(partsIn(j, read), bytes).replace(/</g, '\\u003c')}</script>`; };
  let out = String(html);
  // The page's own loader (BOOT), or an earlier build's plain tag; its parts' loader goes with it.
  if (BOOT_DATA_TAG.test(out)) { const was = out; out = out.replace(BOOT_DATA_TAG, dataTag); if (out !== was && !BOOT_DATA_TAG.test(out)) out = out.replace(BOOT_PARTS_TAG, ''); }
  return out
    .replace(/<script src="((?:assets\/)?[^"/]+\.data\.[0-9a-f]{10}\.js)" id="sg-data"><\/script>/, dataTag)
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
  const files = [...new Set(pageLinks(html, (rel) => { try { return readFileSync(join(dir, rel), 'utf8'); } catch { return null; } }))].filter((f) => isOwnFile(f) && existsSync(join(dir, f)));
  for (const f of files) { mkdirSync(dirname(join(toDir, f)), { recursive: true }); copyFileSync(join(dir, f), join(toDir, f)); }
  writeFileSync(join(toDir, 'index.html'), html);
  return ['index.html', ...files];
}

//   node styleguide-files.mjs <page.html> <folder>   copyPage, for the publishing job (as lib/styleguide-files.mjs, or the
//   engine's styleguide-files.mjs that the teams' publishing jobs run)
const SELF = fileURLToPath(import.meta.url);
if (process.argv[1] && [SELF, join(dirname(dirname(SELF)), 'styleguide-files.mjs')].includes(resolve(process.argv[1]))) {
  const [page, to] = process.argv.slice(2);
  if (!page || !to) { console.error('usage: node styleguide-files.mjs <page.html> <folder>'); process.exit(1); }
  console.log(`Copied ${copyPage(resolve(page), resolve(to)).join(', ')} into ${to}`);
}
