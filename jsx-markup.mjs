// jsx-markup.mjs - the markup a React component renders, read from its source without running it.
//
// The rendered checks draw a component to measure it. Drawn from the CSS alone it is a bare <div class="x">, which
// can pass where the real component fails: a <span> ignores a CSS height, an <input> carries its own line height, a
// child the CSS styles is missing. This reads the JSX the component returns and writes it as plain HTML with its
// default content: the element types, the classes that are always there, string attributes, the default text of a
// prop. Expressions it cannot know (a condition, a spread, another component) are left out, never guessed.
//
// Pure: jsxMarkup(source, cls) → an HTML string, or null when there is no JSX to read.

const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);

// The defaults of the destructured props: function X({ Label = "New", size = 'm' }) → { Label: 'New', size: 'm' }.
export function propDefaults(source) {
  const out = {};
  const m = String(source).match(/(?:function\s+[A-Z][\w$]*|(?:const|let|var)\s+[A-Z][\w$]*\s*=\s*(?:function\s*)?)\s*\(\s*\{([\s\S]*?)\}\s*[,)]/);
  if (!m) return out;
  for (const d of m[1].matchAll(/([A-Za-z_$][\w$]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|`([^`$]*)`|(\d+(?:\.\d+)?)|(true|false))/g)) out[d[1]] = d[2] ?? d[3] ?? d[4] ?? d[5] ?? d[6];
  return out;
}

// The static text of a class expression: "a b", 'a', `a ${x ? 'b' : ''}` → "a", or a const holding one of those.
function staticClass(expr, source) {
  const e = expr.trim();
  let s = e.match(/^["'`]([\s\S]*)["'`]$/)?.[1];
  if (s == null && /^[A-Za-z_$][\w$]*$/.test(e)) {
    const def = String(source).match(new RegExp(`(?:const|let|var)\\s+${e}\\s*=\\s*(["'\`])([\\s\\S]*?)\\1`));
    s = def?.[2];
  }
  if (s == null) return null;
  return s.replace(/\$\{[\s\S]*?\}/g, ' ').split(/\s+/).filter((w) => /^[A-Za-z_-][\w-]*$/.test(w)).join(' ');
}

// The returned JSX: from the `<` after `return` (or an arrow's `=> (`) to the end of its root element.
// The exported component's JSX, not a helper's defined above it (function Icon() { … } export function Chip() { … }).
function returnedJsx(source) {
  const s = String(source);
  const exported = s.search(/export\s+(?:default\s+)?(?:function\b|(?:const|let|var)\s+[A-Z])/);
  const rel = s.slice(Math.max(0, exported)).search(/(?:return|=>)\s*\(?\s*<[A-Za-z]/);
  const start = rel < 0 ? -1 : Math.max(0, exported) + rel;
  if (start < 0) return null;
  let i = s.indexOf('<', start);
  let depth = 0;
  while (i < s.length) {
    if (s[i] === '{') { i = skipBraces(s, i); continue; }
    if (s[i] === '<') {
      const close = s[i + 1] === '/';
      const end = tagEnd(s, i);
      const selfClose = s[end - 1] === '/';
      const name = s.slice(i + (close ? 2 : 1)).match(/^[\w.-]*/)[0];
      if (close) depth--; else if (!selfClose && !VOID.has(name.toLowerCase())) depth++;
      i = end + 1;
      if (depth === 0) return s.slice(s.indexOf('<', start), i);
      continue;
    }
    i++;
  }
  return null;
}
function skipBraces(s, i) {
  let d = 0;
  for (; i < s.length; i++) {
    const c = s[i];
    if (c === '"' || c === "'" || c === '`') { const q = c; i++; while (i < s.length && s[i] !== q) { if (s[i] === '\\') i++; i++; } continue; }
    if (c === '{') d++; else if (c === '}') { d--; if (d === 0) return i + 1; }
  }
  return s.length;
}
function tagEnd(s, i) {
  for (; i < s.length; i++) {
    if (s[i] === '{') { i = skipBraces(s, i) - 1; continue; }
    if (s[i] === '"' || s[i] === "'") { const q = s[i]; i++; while (i < s.length && s[i] !== q) i++; continue; }
    if (s[i] === '>') return i;
  }
  return s.length;
}

// A tag's attributes: name="v", name='v', name={expr}, a bare name, or a {...spread}.
function attributes(text) {
  const out = [];
  let i = 0;
  while (i < text.length) {
    if (/\s/.test(text[i])) { i++; continue; }
    if (text[i] === '{') { const end = skipBraces(text, i); out.push({ spread: true }); i = end; continue; }
    const key = text.slice(i).match(/^[A-Za-z_:][\w:.-]*/)?.[0];
    if (!key) { i++; continue; }
    i += key.length;
    while (/\s/.test(text[i] ?? '')) i++;
    if (text[i] !== '=') { out.push({ key }); continue; }
    i++;
    while (/\s/.test(text[i] ?? '')) i++;
    if (text[i] === '"' || text[i] === "'") { const q = text[i]; const end = text.indexOf(q, i + 1); out.push({ key, value: text.slice(i + 1, end) }); i = end + 1; }
    else if (text[i] === '{') { const end = skipBraces(text, i); out.push({ key, expr: text.slice(i + 1, end - 1) }); i = end; }
    else { const v = text.slice(i).match(/^\S+/)[0]; out.push({ key, value: v }); i += v.length; }
  }
  return out;
}

const esc = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');

export function jsxMarkup(source, cls) {
  const jsx = returnedJsx(source);
  if (!jsx) return null;
  const defaults = propDefaults(source);
  const own = String(cls ?? '').replace(/^\./, '');
  let out = '', i = 0, root = true;
  const skipped = [];   // the names of component tags left out, so their closing tags go too
  while (i < jsx.length) {
    const c = jsx[i];
    if (c === '{') {
      const end = skipBraces(jsx, i);
      const expr = jsx.slice(i + 1, end - 1).trim();
      // A prop's default text ({Label}, {children}); anything conditional or computed is left out.
      if (/^[A-Za-z_$][\w$]*$/.test(expr) && defaults[expr] != null) out += esc(defaults[expr]);
      i = end; continue;
    }
    if (c === '<') {
      const end = tagEnd(jsx, i);
      const raw = jsx.slice(i, end + 1);
      const close = raw[1] === '/';
      const name = raw.slice(close ? 2 : 1).match(/^[\w.-]*/)[0];
      i = end + 1;
      if (!name) continue;   // a fragment
      if (/^[A-Z]/.test(name) || name.includes('.')) { if (!close && !raw.endsWith('/>')) skipped.push(name); else if (close) skipped.pop(); continue; }
      if (close) { out += `</${name}>`; continue; }
      const attrs = [];
      let classes = null;
      for (const a of attributes(raw.slice(name.length + 1, raw.endsWith('/>') ? -2 : -1))) {
        if (a.spread) continue;
        if (a.key === 'className' || a.key === 'class') { classes = staticClass(a.expr ?? JSON.stringify(a.value ?? ''), source); continue; }
        if (a.expr != null) { if (a.expr.trim() === 'true') attrs.push(a.key); continue; }   // computed: left out
        if (/^on[A-Z]/.test(a.key) || a.key === 'key' || a.key === 'ref' || a.key === 'style') continue;
        attrs.push(a.value == null ? a.key : `${a.key === 'htmlFor' ? 'for' : a.key}="${esc(a.value)}"`);
      }
      let list = (classes ?? '').split(/\s+/).filter(Boolean);
      if (root && own && !list.includes(own)) list = [own, ...list];   // the component's own class is on its root
      root = false;
      out += `<${name}${list.length ? ` class="${list.join(' ')}"` : ''}${attrs.length ? ' ' + attrs.join(' ') : ''}>`;
      if (raw.endsWith('/>') && !VOID.has(name.toLowerCase())) out += `</${name}>`;   // <span /> is an empty span
      continue;
    }
    out += c; i++;
  }
  // JSX drops the whitespace of a line break between tags and text: so does this.
  return out.replace(/>\s*\n\s*/g, '>').replace(/\s*\n\s*</g, '<').replace(/\s+/g, ' ').trim();
}
