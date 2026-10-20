// font-embed.mjs - the webfonts a page links from a font service (fonts.googleapis.com), written into the page as data, so
// it draws in its own fonts on any computer: offline, behind a firewall that blocks the service, or opened as a file.
//
//   embedRemoteFonts(html, { cacheDir, fetchText, fetchBytes, subsets }) → { html, embedded: [url], kept: [{ url, why }] }
//
// Each <link rel="stylesheet"> to the service becomes a <style> with its @font-face rules, every font file in them as a
// data: address. Only the subsets kept (latin and latin-ext by default) are written, the rest left out to keep the page
// small. A stylesheet or a file that cannot be read leaves its link as it was, and says why. What was read is kept in
// cacheDir, so a later build reads nothing again.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const SERVICE = /^https:\/\/fonts\.googleapis\.com\//;
// A current browser's name: the service answers it with woff2 files, the smallest.
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const MIME = { woff2: 'font/woff2', woff: 'font/woff', ttf: 'font/ttf', otf: 'font/otf' };

const key = (s) => createHash('sha1').update(s).digest('hex').slice(0, 16);
const unescape = (s) => String(s).replace(/&amp;/g, '&').replace(/&quot;/g, '"');

async function cached(cacheDir, url, ext, read) {
  const file = cacheDir ? join(cacheDir, key(url) + ext) : null;
  if (file && existsSync(file)) return readFileSync(file);
  const data = await read(url);
  if (file) { mkdirSync(cacheDir, { recursive: true }); writeFileSync(file, data); }
  return Buffer.isBuffer(data) ? data : Buffer.from(data);
}

const timeout = () => (typeof AbortSignal !== 'undefined' && AbortSignal.timeout ? AbortSignal.timeout(20000) : undefined);
const netText = async (url) => { const r = await fetch(url, { headers: { 'user-agent': UA }, signal: timeout() }); if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.text(); };
const netBytes = async (url) => { const r = await fetch(url, { headers: { 'user-agent': UA }, signal: timeout() }); if (!r.ok) throw new Error(`HTTP ${r.status}`); return Buffer.from(await r.arrayBuffer()); };

// The service's stylesheet → its @font-face rules for the subsets kept; a stylesheet that names no subset keeps them all.
export function keepSubsets(css, subsets = ['latin', 'latin-ext']) {
  const rules = [...String(css).matchAll(/(?:\/\*\s*([\w-]+)\s*\*\/\s*)?(@font-face\s*\{[^}]*\})/g)];
  const named = rules.some((m) => m[1]);
  return rules.filter((m) => !named || subsets.includes(m[1])).map((m) => m[2]);
}

export async function embedRemoteFonts(html, { cacheDir = null, fetchText = netText, fetchBytes = netBytes, subsets = ['latin', 'latin-ext'] } = {}) {
  const embedded = [], kept = [];
  const links = [...String(html).matchAll(/<link\b[^>]*\brel=["']?stylesheet["']?[^>]*>/gi)]
    .map((m) => ({ tag: m[0], url: unescape((/\bhref=["']([^"']+)["']/i.exec(m[0]) || [])[1] || '') }))
    .filter((l) => SERVICE.test(l.url));
  let out = String(html);
  for (const l of links) {
    try {
      const css = (await cached(cacheDir, l.url, '.css', fetchText)).toString('utf8');
      const faces = [];
      for (const face of keepSubsets(css, subsets)) {
        let f = face;
        for (const u of [...new Set([...face.matchAll(/url\(\s*['"]?(https?:[^'")\s]+)['"]?\s*\)/g)].map((m) => m[1]))]) {
          const ext = (/\.(woff2|woff|ttf|otf)(?:$|\?)/i.exec(u) || [])[1]?.toLowerCase() ?? 'woff2';
          const data = await cached(cacheDir, u, '.' + ext, fetchBytes);
          f = f.split(u).join(`data:${MIME[ext]};base64,${data.toString('base64')}`);
        }
        faces.push(f);
      }
      if (!faces.length) throw new Error('no @font-face in it');
      out = out.split(l.tag).join(`<style data-font-from="${l.url.replace(/&/g, '&amp;').replace(/"/g, '&quot;')}">\n${faces.join('\n')}\n</style>`);
      embedded.push(l.url);
    } catch (e) {
      kept.push({ url: l.url, why: String(e?.message || e).split('\n')[0] });
    }
  }
  return { html: out, embedded, kept };
}

// The families the page's CSS names in a font-family that nothing carries: no @font-face for them and no font service
// link naming them, and not one a computer has by itself (sans-serif, system-ui, Arial, Menlo…).
const GENERIC = /^(?:sans-serif|serif|monospace|cursive|fantasy|emoji|math|fangsong|system-ui|ui-[\w-]+|-apple-system|blinkmacsystemfont|inherit|initial|unset|revert|arial|helvetica|helvetica neue|times|times new roman|georgia|verdana|tahoma|trebuchet ms|courier|courier new|menlo|monaco|consolas|sf mono|sf pro(?: [\w ]+)?|segoe ui(?: [\w ]+)?|apple color emoji|segoe ui emoji|segoe ui symbol|noto color emoji|liberation mono|dejavu sans mono|sfmono-regular|andale mono|lucida console)$/i;
export function missingFamilies(html) {
  const css = [...String(html).matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)].map((m) => m[1]).join('\n');
  const carried = new Set([...css.matchAll(/@font-face\s*\{[^}]*?font-family:\s*['"]?([^;'"}]+)/gi)].map((m) => m[1].trim().toLowerCase()));
  for (const m of String(html).matchAll(/<link\b[^>]*href=["']https:\/\/fonts\.googleapis\.com\/css2?\?([^"']+)["']/gi))
    for (const f of unescape(m[1]).matchAll(/family=([^:&]+)/g)) carried.add(decodeURIComponent(f[1].replace(/\+/g, ' ')).toLowerCase());
  const named = new Map();
  for (const m of css.replace(/@font-face\s*\{[^}]*\}/g, '').matchAll(/(?:^|[;{\s])font-family\s*:\s*([^;}]+)/gi))
    {
      // The family it asks for first: the rest are fallbacks, there for a computer that lacks it.
      const f = m[1].split(',')[0].replace(/!important/i, '').trim().replace(/^['"]|['"]$/g, '').trim();
      if (!f || /[()]/.test(f) || GENERIC.test(f) || carried.has(f.toLowerCase())) continue;
      if (!named.has(f.toLowerCase())) named.set(f.toLowerCase(), f);
    }
  return [...named.values()];
}

// Each family a font service has, as its stylesheet's address: the widest weights it takes (a variable font's whole
// range, else its usual weights), asked in turn until the service answers. → [{ family, url }], [{ family, why }]
export async function serviceFonts(families, { fetchText = netText, cacheDir = null } = {}) {
  const asks = ['ital,wght@0,100..900;1,100..900', 'ital,wght@0,200..900;1,200..900', 'ital,wght@0,300..800;1,300..800', 'wght@100..900', 'wght@300..800', 'ital,wght@0,400;0,700;1,400;1,700', 'wght@400;700', ''];
  const found = [], missing = [];
  for (const family of families) {
    const base = 'https://fonts.googleapis.com/css2?family=' + encodeURIComponent(family).replace(/%20/g, '+');
    let hit = null;
    for (const a of asks) {
      const url = base + (a ? ':' + a : '') + '&display=swap';
      try { await cached(cacheDir, url, '.css', fetchText); hit = url; break; } catch { /* the next */ }
    }
    if (hit) found.push({ family, url: hit }); else missing.push({ family, why: 'not on the font service' });
  }
  return { found, missing };
}
