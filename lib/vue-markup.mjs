// vue-markup.mjs - the markup a Vue component renders, read from its single-file template without running it.
//
// As jsx-markup.mjs does for React: a component no page of the project shows is drawn from its own template rather than
// as a bare stand-in, so it is measured and checked as the element it is. The template is written as plain HTML with
// its default content: the elements, the classes that are always there (static `class`, and the string literals of a
// bound `:class` array), string attributes and bound string literals, the default words of a prop (`{{ label }}`), a
// slot's fallback content, one copy of a `v-for`, the first branch of a `v-if` chain. What it cannot know (another
// component, an expression, a condition's other branches, an event) is left out, never guessed.
//
// Pure: vueMarkup(source, cls) → an HTML string, or null when there is no template to read.
import { extractDefaults } from './component-source.mjs';

const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);
const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, '');
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

// The outermost <template> of a single-file component.
export function templateOf(source) {
  const s = String(source).replace(/<!--[\s\S]*?-->/g, '');
  const start = s.search(/<template\b[^>]*>/);
  const end = s.lastIndexOf('</template>');
  if (start < 0 || end < start) return null;
  return s.slice(s.indexOf('>', start) + 1, end);
}

// A tag's attributes as [name, value | null] pairs.
function attrsOf(raw) {
  const out = [];
  for (const m of String(raw).matchAll(/([:@#]?[A-Za-z_][\w:.@#-]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g)) out.push([m[1], m[2] ?? m[3] ?? m[4] ?? null]);
  return out;
}

// The string literals of a bound class: ['a', { b: x }, 'c'] → a c; 'a b' → a b. An object's keys are conditions.
function boundClasses(expr) {
  const e = String(expr ?? '').trim();
  const items = e.startsWith('[') ? e.slice(1, -1) : e;
  return [...items.replace(/\{[^}]*\}/g, ' ').matchAll(/['"`]([^'"`$]*)['"`]/g)].flatMap((m) => m[1].split(/\s+/)).filter((w) => /^-?[A-Za-z_][\w-]*$/.test(w));
}

export function vueMarkup(source, cls = null) {
  const tpl = templateOf(source);
  if (tpl == null) return null;
  const defaults = extractDefaults(String(source));
  const words = (expr) => { const k = norm(String(expr).trim()); return defaults.has(k) ? defaults.get(k) : (/^['"`][^'"`]*['"`]$/.test(String(expr).trim()) ? String(expr).trim().slice(1, -1) : ''); };
  const out = [];
  // Each open element: whether it is written (a native element) and whether its content is (a v-else branch is not).
  const stack = [];
  const hidden = () => stack.some((f) => f.skip);
  let lastIf = null;   // the depth of the last element that carried v-if, so its v-else branches are left out
  for (const m of tpl.matchAll(/<(\/?)([A-Za-z][\w.-]*)([^>]*?)(\/?)>|([^<]+)/g)) {
    if (m[5] != null) {
      if (hidden()) continue;
      const text = m[5].replace(/\{\{([\s\S]*?)\}\}/g, (_, x) => words(x));
      if (text.trim()) out.push(esc(text).replace(/&amp;(\w+;)/g, '&$1'));
      continue;
    }
    const [, closing, tag, raw, selfClose] = m;
    const lower = tag.toLowerCase();
    if (closing) {
      const f = stack.pop();
      if (f && f.write && !hidden()) out.push(`</${f.tag}>`);
      continue;
    }
    const attrs = attrsOf(raw);
    const has = (n) => attrs.some(([k]) => k === n);
    const depth = stack.length;
    // A v-else / v-else-if after a v-if at the same depth: its branch is left out (the first branch stands for the chain).
    const elseBranch = has('v-else') || has('v-else-if');
    if (has('v-if')) lastIf = depth;
    const skip = elseBranch && lastIf === depth;
    // Another component (PascalCase or a kebab name with a dash) or a wrapper (<template>, <slot>, <transition>): its
    // tag is not written; a slot's fallback content and a wrapper's content are.
    const component = /^[A-Z]/.test(tag) || (lower.includes('-') && !/^(?:[a-z]+-)?svg$/.test(lower));
    const wrapper = lower === 'template' || lower === 'slot' || lower === 'transition' || lower === 'keep-alive';
    const write = !component && !wrapper && !skip;
    const isVoid = VOID.has(lower) || selfClose === '/';
    if (write && !hidden()) {
      const classes = [];
      const parts = [];
      for (const [k, v] of attrs) {
        if (k === 'class' && v) classes.push(...v.split(/\s+/).filter(Boolean));
        else if ((k === ':class' || k === 'v-bind:class') && v) classes.push(...boundClasses(v));
        else if (/^(v-|@|#)/.test(k) || k === ':key' || k === 'key' || k === 'ref') continue;
        else if (k.startsWith(':') || k.startsWith('v-bind:')) {
          // A bound string literal, or a prop the component gives a default (:aria-label="label"): written with it.
          const ex = String(v ?? '').trim(), lit = ex.match(/^['"`]([^'"`$]*)['"`]$/);
          const val = lit ? lit[1] : /^[A-Za-z_$][\w$]*$/.test(ex) && defaults.has(norm(ex)) ? defaults.get(norm(ex)) : null;
          if (val != null) parts.push(`${k.replace(/^(?:v-bind)?:/, '')}="${esc(val)}"`);
        }
        else parts.push(v == null ? k : `${k}="${esc(v)}"`);
      }
      const cl = [...new Set(classes)];
      out.push(`<${lower}${cl.length ? ` class="${esc(cl.join(' '))}"` : ''}${parts.length ? ' ' + parts.join(' ') : ''}>`);
      // A self-closed element that HTML does not know as empty (an SVG <path/>) is closed, so what follows is not put in it.
      if (isVoid) { if (!VOID.has(lower)) out.push(`</${lower}>`); continue; }
    }
    if (component && (isVoid || selfClose === '/')) continue;   // another component, self-closing: nothing to write
    if (!isVoid) stack.push({ tag: lower, write, skip: skip || component });
  }
  const html = out.join('').trim();
  if (!/^<[a-z]/.test(html)) return null;
  // The root as the component's class names it, when the template's root carries it.
  if (cls && !new RegExp(`class="[^"]*\\b${String(cls).replace(/^\./, '').replace(/[^\w-]/g, '')}\\b`).test(html.slice(0, html.indexOf('>') + 1))) return null;
  return html;
}
