// component-faults.mjs - what a screen runs into in a component's own code, read without running it.
//
// Parity compares a component with Figma; this reads the component on its own, for the faults a screen meets the first
// time it uses it, before any difference with Figma shows:
//   unstyled:  a class its template sets that no rule of the project styles (a block drawn with the browser's defaults).
//   twice:     one click fires the same event twice: a child emits it and the click also reaches a parent that emits it.
//   sameSlot:  a slot inside a v-for that passes nothing to it, so every row shows the same content.
//   once:      a prop read only when the component is mounted: changing it later does nothing.
//   breaks:    a longer text prop shown with its line breaks lost (no white-space: pre-line on it).
//   unlike:    the same prop takes HTML in one component of a family and only text in another.
//   shrinks:   a slot Figma stretches its content in sits in a column of the code that shrinks it to its own width.
//   hidesMore: an on/off Figma says hides some layers hides more in the code (Figma's showArea hides the area; the code's
//              hides the label with it), read from what each Figma on/off shows (its toggles) and the code's v-if.
// Vue single-file components only, read from their text: pure, framework-light and advisory. A fault is a fact about
// the code, with the file and line it is on; whether to change the component is the team's call.
//
//   componentFaults(components, { sourceOf, styles }) → [{ component, kind, says, file, line }]
//     components: [{ name, file, text }]   sourceOf(tag) → { name, file, text } | null   styles: every style text

const norm = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
const lineAt = (text, i) => String(text).slice(0, i).split('\n').length;
export const KINDS = { shrinks: 'Shrinks what Figma stretches', hidesMore: 'Hides more than in Figma', unstyled: 'No style', twice: 'Fires twice', sameSlot: 'Same content in every row', once: 'Read once', breaks: 'Line breaks lost', unlike: 'Takes HTML in one, text in another' };

// ── The template as a tree ───────────────────────────────────────────────────────────────────────────────────
// Its outermost <template>, read as elements: { tag, attrs: [[name, value]], kids, texts, at (offset), parent }.
function templateRange(src) {
  const s = String(src);
  const start = s.search(/<template\b[^>]*>/);
  const end = s.lastIndexOf('</template>');
  return start < 0 || end < start ? null : [s.indexOf('>', start) + 1, end];
}
function attrsOf(raw) {
  const out = [];
  for (const m of String(raw).matchAll(/([:@#]?[A-Za-z_][\w:.@#-]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'))?/g)) out.push([m[1], m[2] ?? m[3] ?? null]);
  return out;
}
const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);
export function templateTree(src) {
  const r = templateRange(src);
  if (!r) return null;
  // Comments blanked to spaces, so every offset is still the file's.
  const s = String(src).slice(0, r[1]).replace(/<!--[\s\S]*?-->/g, (c) => c.replace(/[^\n]/g, ' '));
  const root = { tag: '#root', attrs: [], kids: [], texts: [], at: r[0], parent: null };
  let cur = root, i = r[0];
  const re = /<\/?([A-Za-z][\w.-]*)((?:[^>"']|"[^"]*"|'[^']*')*?)(\/?)>/g;
  re.lastIndex = i;
  for (let m; (m = re.exec(s)); ) {
    if (m.index > i) cur.texts.push({ text: s.slice(i, m.index), at: i });
    i = re.lastIndex;
    if (m[0][1] === '/') { for (let n = cur; n && n !== root; n = n.parent) if (n.tag === m[1]) { cur = n.parent; break; } continue; }
    const el = { tag: m[1], attrs: attrsOf(m[2]), kids: [], texts: [], at: m.index, parent: cur };
    cur.kids.push(el);
    if (!m[3] && !VOID.has(m[1].toLowerCase())) cur = el;
  }
  return root;
}
const walk = (n, f) => { for (const k of n.kids) { f(k); walk(k, f); } };
const attr = (el, re) => el.attrs.find(([k]) => re.test(k));
// A component's tag (TileCard, tile-card), not an element of the page.
const isComponent = (tag) => /[A-Z]/.test(tag) || (tag.includes('-') && !/^(font-face|annotation-xml)$/.test(tag));
const ancestors = (el) => { const out = []; for (let n = el.parent; n && n.tag !== '#root'; n = n.parent) out.push(n); return out; };

// ── What a stylesheet defines ────────────────────────────────────────────────────────────────────────────────
// Every class a rule of these styles names (.a, :deep(.a)), and the ones Sass writes by nesting (.a { &-b }) → a-b.
export function classesDefined(styles = []) {
  const out = new Set(), suffixes = new Set();
  for (const t of styles) {
    const s = String(t).replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
    for (const m of s.matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)) out.add(m[1]);
    for (const m of s.matchAll(/&([-_][\w-]+)/g)) suffixes.add(m[1]);
  }
  return { has: (c) => out.has(c) || [...suffixes].some((x) => c.endsWith(x) && out.has(c.slice(0, -x.length))) };
}
// The classes an element sets: static ones, and the literal names of a bound one (['a', { b: x, 'c-d': y }]).
function classesOf(el) {
  const out = [];
  for (const [k, v] of el.attrs) {
    if (k === 'class' && v) out.push(...v.split(/\s+/).filter(Boolean));
    if ((k === ':class' || k === 'v-bind:class') && v) {
      // A quoted name is a class; a bare word is a class only as an object's key ({ expanded, active: x }), never as a
      // variable in an array ([size, alignment]) whose value is the class.
      for (const m of v.matchAll(/['"`]([^'"`$]*)['"`]\s*(?=[:,\]}]|$)/g)) out.push(...m[1].split(/\s+/));
      for (const o of v.replace(/\$\{[^}]*\}/g, ' ').matchAll(/\{([^{}]*)\}/g)) for (const e of o[1].split(',')) { const k = /^\s*([A-Za-z_][\w-]*)\s*(:|$)/.exec(e); if (k) out.push(k[1]); }
    }
  }
  return out.filter((c) => /^-?[A-Za-z_][\w-]*$/.test(c));
}
// Hooks for scripts and tests, never meant to be styled.
const HOOK = /^(js|qa|test|e2e|cy|data)[-_]/i;

// ── Events ───────────────────────────────────────────────────────────────────────────────────────────────────
const emitted = (handler) => [...String(handler ?? '').matchAll(/\$?emit\(\s*['"]([\w:-]+)['"]/g)].map((m) => m[1]);
// A native click handler that lets the click go on to its parents (no .stop, no .self), and what it emits.
const clickEmits = (el) => el.attrs.filter(([k]) => /^(@|v-on:)click(\.|$)/.test(k) && !/\.(stop|self)\b/.test(k)).flatMap(([, v]) => emitted(v));

// ── The script ───────────────────────────────────────────────────────────────────────────────────────────────
function scriptOf(src) { return [...String(src).matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map((m) => ({ text: m[1], at: m.index + m[0].indexOf('>') + 1 })); }
function blockAfter(text, i) {
  // From an opening ( or { at or after i, to its match.
  const open = text.slice(i).search(/[({]/); if (open < 0) return null;
  let d = 0;
  for (let j = i + open; j < text.length; j++) { const c = text[j]; if (c === '(' || c === '{') d++; else if (c === ')' || c === '}') { d--; if (!d) return [i + open, j]; } }
  return null;
}
const stripComments = (t) => String(t).replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, ' ')).replace(/(^|[^:'"\\])\/\/[^\n]*/g, (c, p) => p + ' '.repeat(c.length - p.length));
function propNames(script) {
  const d = /defineProps\s*(?:<[^>]*>)?\s*\(/.exec(script) ?? /\bprops\s*:\s*(?=[{[])/.exec(script);
  if (!d) return [];
  const b = blockAfter(script, d.index + d[0].length - 1); if (!b) return [];
  let body = script.slice(b[0] + 1, b[1]);
  if (/^\s*\{/.test(body)) { const o = body.indexOf('{'); body = body.slice(o + 1, body.lastIndexOf('}')); }
  if (/^\s*\[/.test(body)) return [...body.matchAll(/['"]([\w-]+)['"]/g)].map((m) => m[1]);
  // The keys at its first level only.
  const out = []; let depth = 0;
  for (const m of body.matchAll(/[{}()[\]]|(?:^|[,{\s])['"]?([A-Za-z_$][\w$]*)['"]?\s*:/g)) {
    if (m[0] === '{' || m[0] === '(' || m[0] === '[') depth++; else if (m[0] === '}' || m[0] === ')' || m[0] === ']') depth--;
    else if (depth === 0 && m[1]) out.push(m[1]);
  }
  return out;
}

// ── One component ────────────────────────────────────────────────────────────────────────────────────────────
// ── What an on/off hides ─────────────────────────────────────────────────────────────────────────────────────
// The names a condition depends on: its own words, and the words of each computed or function it calls, a few deep
// (showRegion → props.readOnly, showArea).
function dependsOn(expr, defs, depth = 3, seen = new Set()) {
  const out = new Set();
  for (const m of String(expr ?? '').matchAll(/(?:props\.)?([A-Za-z_$][\w$]*)/g)) {
    const w = m[1]; if (out.has(w)) continue; out.add(w);
    if (depth && defs.has(w) && !seen.has(w)) { seen.add(w); for (const x of dependsOn(defs.get(w), defs, depth - 1, seen)) out.add(x); }
  }
  return out;
}
// Each computed, function and arrow function of the script, by name, with its body.
function definitions(script) {
  const defs = new Map();
  for (const m of script.matchAll(/(?:const|let)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:computed\s*\(|(?:async\s*)?\([^)]*\)\s*=>|function\b)/g)) { const b = blockAfter(script, m.index + m[0].length - 1); if (b) defs.set(m[1], script.slice(b[0], b[1] + 1)); }
  for (const m of script.matchAll(/function\s+([A-Za-z_$][\w$]*)\s*\(/g)) { const b = blockAfter(script, script.indexOf('{', m.index)); if (b) defs.set(m[1], script.slice(b[0], b[1] + 1)); }
  return defs;
}
const baseOf = (b) => norm(String(b).replace(/^show/i, ''));
// The names a condition shows a part for, as they stand (label, props.helperText), not one compared or passed to a call
// (Number(percentage) >= 100 is a threshold, not the percentage shown).
const bare = (expr) => String(expr ?? '').replace(/[\w$.]+\([^()]*\)/g, ' ').replace(/[\w$.'"]+\s*(===?|!==?|>=?|<=?)\s*[\w$.'"-]+/g, ' ')
  .split(/&&|\|\||[()!?:]/).map((t) => t.trim().replace(/^props\./, '').replace(/\.value$/, '')).filter((t) => /^[A-Za-z_$][\w$]*$/.test(t));
// toggles: { figmaBoolean: [the layers it shows] } for this component, as Figma's structure records them.
function hidesMore(c, tree, script, props, toggles, push) {
  const defs = definitions(script);
  const cond = (el) => (el.attrs.find(([k]) => /^v-(if|else-if|show)$/.test(k)) ?? [])[1] ?? null;
  for (const [b, layers] of Object.entries(toggles ?? {})) {
    const p = props.find((x) => norm(x) === norm(b));
    if (!p) continue;
    const own = new Set((layers ?? []).map(norm));
    const told = new Map();
    walk(tree, (el) => {
      const e = cond(el);
      if (!e || new RegExp(`!\\s*(props\\.)?${p}\\b`).test(e) || !dependsOn(e, defs).has(p)) return;
      // Every part inside what it hides that another of Figma's on/offs shows, and this one leaves showing in Figma.
      const look = (x) => {
        // Its class names it only when it is not the switch's own part (a marker shown with the switch is named for what it marks).
        const mine = new RegExp(`(^|[^\\w.])(props\\.)?${p}\\b`).test(cond(x) ?? '');
        const words = bare(cond(x)).concat(x.texts.flatMap((t) => [...String(t.text).matchAll(/\{\{([\s\S]*?)\}\}/g)].map((m) => m[1].trim()))).concat(mine ? [] : classesOf(x));
        for (const [b2, l2] of Object.entries(toggles)) {
          if (b2 === b || told.has(b2) || !/^show/i.test(b2)) continue;
          const base = baseOf(b2);
          // Figma hides it too: its own layers are the part's, or hold it (Label Container holds the label).
          if (base.length < 4 || (l2 ?? []).every((l) => own.has(norm(l))) || [...own].some((l) => l.includes(base))) continue;
          const hit = words.find((w) => { const n = norm(w); return n !== norm(p) && n.length >= 4 && (n.startsWith(base) || (base.startsWith(n) && n.length >= base.length - 4)); });
          if (hit) told.set(b2, { at: x.at, part: String(b2).replace(/^show/i, '').replace(/^./, (ch) => ch.toLowerCase()), hit, cls: classesOf(x)[0] });
        }
      };
      // The innermost part first, so the line names the element itself, not the region around it.
      walk(el, look); look(el);
    });
    if (told.size) {
      const parts = [...told.values()];
      push('hidesMore', `turning \`${p}\` off in the code also hides its ${parts.map((x) => `${x.part}${x.cls ? ` (.${x.cls})` : ''}`).join(' and ')}: in Figma, ${b} hides only ${[...new Set(layers)].join(', ')}, and ${parts.length === 1 ? 'that part stays' : 'those parts stay'} on with ${[...told.keys()].join(' and ')}.`, parts[0].at);
    }
  }
}

// slots: { codeSlotName: figmaSlotName } for the slots Figma stretches its content in (stretchChildOnInsert).
function shrinks(c, tree, own, slots, push) {
  walk(tree, (el) => {
    if (el.tag !== 'slot') return;
    const name = el.attrs.find(([k]) => k === 'name')?.[1] ?? 'default';
    if (!(name in slots)) return;
    const box = el.parent;
    if (!box || box.tag === '#root' || box.tag === 'template') return;
    // The rules of the element around it: a column that places its children at their own width.
    const rules = classesOf(box).flatMap((k) => [...own.matchAll(new RegExp(`\\.${k}(?![\\w-])[^{]*\\{([^}]*)\\}`, 'g'))].map((m) => m[1]));
    const has = (re) => rules.some((r) => re.test(r));
    if (!has(/display\s*:\s*(inline-)?flex/) || !has(/flex-direction\s*:\s*column/) || !has(/align-items\s*:\s*(flex-start|start|center|flex-end|end|baseline)/)) return;
    const how = rules.map((r) => /align-items\s*:\s*([\w-]+)/.exec(r)?.[1]).find(Boolean);
    push('shrinks', `what goes in its "${name}" slot is drawn at its own width: the element around it (.${classesOf(box)[0]}) is a column with align-items: ${how}, while Figma's ${slots[name]} stretches what is put in it to the slot's width.`, el.at);
  });
}

export function faultsOf(c, { sourceOf = () => null, defined = null, styleText = '', hooked = () => false, toggles = null, stretched = null } = {}) {
  const out = [];
  const src = String(c.text ?? '');
  const tree = templateTree(src);
  if (!tree) return out;
  const push = (kind, says, at) => out.push({ component: c.name, kind, says, file: c.file, line: lineAt(src, at) });
  const own = [...src.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)].map((m) => m[1]).join('\n') + '\n' + styleText;

  // A class no rule styles and no script looks for. An element none of whose classes is styled is drawn with the
  // browser's defaults; a modifier no rule styles (.read-only on a styled element) changes nothing.
  if (defined) {
    const bare = new Map(), mods = new Map();
    walk(tree, (el) => {
      if (isComponent(el.tag)) return;
      const cls = classesOf(el).filter((k) => !HOOK.test(k) && !hooked(k));
      const none = cls.filter((k) => !defined.has(k));
      if (!none.length) return;
      const into = none.length === cls.length && classesOf(el).every((k) => !defined.has(k)) ? bare : mods;
      for (const k of none) if (!bare.has(k) && !mods.has(k)) into.set(k, el.at);
    });
    const say = (m) => [...m.keys()].slice(0, 8).map((n) => '.' + n).join(', ') + (m.size > 8 ? ', …' : '');
    if (bare.size) push('unstyled', `${bare.size === 1 ? 'an element' : `${bare.size} elements`} of its template with no rule for ${bare.size === 1 ? 'its class' : 'their classes'} (${say(bare)}): drawn with the browser's defaults, as if unstyled.`, [...bare.values()][0]);
    if (mods.size) push('unstyled', `${mods.size === 1 ? 'a class' : `${mods.size} classes`} it adds that no rule styles (${say(mods)}): setting ${mods.size === 1 ? 'it' : 'them'} changes nothing on screen.`, [...mods.values()][0]);
  }

  // One click, the same event twice: a parent re-emits what a child component emits, and the click on the child
  // reaches the parent's own click handler too.
  walk(tree, (el) => {
    const parentEvents = clickEmits(el);
    if (!parentEvents.length) return;
    walk(el, (k) => {
      if (!isComponent(k.tag)) return;
      for (const [name, v] of k.attrs) {
        const m = /^(?:@|v-on:)([\w:-]+)/.exec(name); if (!m || m[1] === 'click') continue;
        const again = emitted(v).filter((e) => parentEvents.includes(e));
        if (!again.length) continue;
        const child = sourceOf(k.tag); if (!child?.text) continue;
        const ct = templateTree(child.text); if (!ct) continue;
        let hit = null;
        walk(ct, (x) => { if (!hit && clickEmits(x).includes(m[1])) hit = x; });
        if (hit) push('twice', `one click on ${child.name}'s <${hit.tag}${classesOf(hit)[0] ? ` class="${classesOf(hit)[0]}"` : ''}> fires "${again[0]}" twice: ${child.name} emits "${m[1]}" (passed on as "${again[0]}") and the click also reaches the <${el.tag}> around it, which emits "${again[0]}" itself. Its click handler needs .stop.`, k.at);
      }
    });
  });

  // A slot repeated by a v-for with nothing passed to it.
  walk(tree, (el) => {
    if (el.tag !== 'slot') return;
    const loop = [el, ...ancestors(el)].find((a) => attr(a, /^v-for$/));
    if (!loop || el.attrs.some(([k]) => /^(:|v-bind)/.test(k))) return;
    const name = el.attrs.find(([k]) => k === 'name')?.[1] ?? 'default';
    push('sameSlot', `its "${name}" slot is inside a v-for and passes nothing to it, so every row shows the same content: give the slot the row (a scoped slot) or a slot per row.`, el.at);
  });

  // Text props: a line break lost, and HTML taken or not (said for the family, below).
  const scripts = scriptOf(src);
  const script = stripComments(scripts.map((s) => s.text).join('\n'));
  const props = propNames(script);
  // A prop that holds sentences (a description, a helper, a message), never a short label, a title or an error.
  const TEXTY = (p) => /(description|helper|hint|body|caption|content|info|message)/i.test(p) && !/error|label|title|placeholder|name|^text$/i.test(p);
  c.renders = {};
  walk(tree, (el) => {
    const html = attr(el, /^(v-html|:innerHTML)$/);
    const said = html ? [html[1]] : el.texts.map((t) => (/\{\{([\s\S]*?)\}\}/.exec(t.text) ?? [])[1]).filter(Boolean);
    for (const expr of said) {
      // A prop shown as it is, or the text a function of the component returns ({{ messageHandler() }}).
      const called = [...expr.matchAll(/\b([A-Za-z_$][\w$]*)\s*\(/g)].map((m) => m[1]).filter(TEXTY).map((f) => f + '()');
      for (const p of [...props, ...called]) {
        if (!TEXTY(p.replace(/\(\)$/, '')) || (!p.endsWith('()') && !new RegExp(`(^|[^\\w.])(props\\.)?${p}\\b`).test(expr))) continue;
        c.renders[p] = html ? 'html' : 'text';
        const cls = classesOf(el);
        const pre = cls.some((k) => new RegExp(`\\.${k}\\b[^{]*\\{[^}]*white-space\\s*:\\s*pre`, 'i').test(own)) || /white-space\s*:\s*pre/i.test(el.attrs.find(([k]) => k === 'style')?.[1] ?? '');
        if (!pre) push('breaks', `a line break in ${p.endsWith('()') ? `the text its \`${p}\` returns` : `its \`${p}\``} is lost: it is shown as one line${html ? ' (as HTML, only a <br> breaks it)' : ''}. A text from the back end or a translation with a new line needs white-space: pre-line on it.`, el.at);
      }
    }
  });

  // A slot Figma stretches its content in, shrunk by the code's layout around it.
  if (stretched && Object.keys(stretched).length) shrinks(c, tree, own, stretched, push);

  // An on/off that hides more in the code than Figma says it does.
  if (toggles && props.length) hidesMore(c, tree, script, props, toggles, push);

  // A prop read only when it is mounted (or copied into its own state once), never again.
  if (props.length) {
    const tpl = src.slice(...(templateRange(src) ?? [0, 0]));
    const onceRanges = [];
    for (const m of script.matchAll(/\b(onMounted|onBeforeMount|mounted|created|beforeMount)\s*(\(|\s*\(\s*\)\s*\{)/g)) { const b = blockAfter(script, m.index + m[0].length - 1); if (b) onceRanges.push(b); }
    for (const m of script.matchAll(/\b(ref|reactive|shallowRef)\s*\(\s*props\.[\w$]+/g)) { const b = blockAfter(script, m.index + m[1].length); if (b) onceRanges.push(b); }
    for (const p of props) {
      if (new RegExp(`(^|[^\\w.-])${p}\\b`).test(tpl.replace(/(?:^|\s)[:@#]?[\w.-]+(?==)/g, ' ')) ) continue;   // the template reads it: it follows
      if (/\btoRefs?\s*\(\s*props\b/.test(script) || new RegExp(`watch(Effect)?\\s*\\([^)]*props\\.${p}\\b|watch\\s*\\(\\s*\\(\\)\\s*=>\\s*props\\.${p}\\b|watch\\s*\\(\\s*props\\s*,`).test(script)) continue;
      const uses = [...script.matchAll(new RegExp(`\\b(props|this)\\.${p}\\b`, 'g'))];
      if (!uses.length || !uses.every((u) => onceRanges.some(([a, b]) => u.index > a && u.index < b))) continue;
      push('once', `\`${p}\` is read once, when it is mounted: changing it afterwards does nothing, so a screen cannot ${/open|expand|show|visible|collapsed/i.test(p) ? 'open or close it' : 'change it'} from outside. Follow it with a watch, or let the screen own it (v-model).`, scripts[0].at + uses[0].index);
    }
  }
  return out;
}

// ── Every component ──────────────────────────────────────────────────────────────────────────────────────────
// components: [{ name, file, text }]; styles: every style text of the project (global sheets and each <style> block).
// The files a component imports to draw itself (./bases/Base.vue, or a folder it picks one from at run time).
export function partsOf(c, files = []) {
  const dir = String(c.file ?? '').split('/').slice(0, -1).join('/');
  const join = (rel) => { const out = []; for (const seg of `${dir}/${rel}`.split('/')) { if (seg === '..') out.pop(); else if (seg !== '.') out.push(seg); } return out.join('/'); };
  const want = [];
  for (const m of String(c.text ?? '').matchAll(/from\s+['"](\.{1,2}\/[^'"]+\.vue)['"]/g)) want.push(join(m[1]));
  for (const m of String(c.text ?? '').matchAll(/import\(\s*`(\.{1,2}\/[^`$]*)\$\{/g)) want.push(join(m[1]).replace(/\/+$/, '') + '/');
  return files.filter((f) => f.file !== c.file && want.some((w) => (w.endsWith('/') ? f.file.startsWith(w) && !f.file.slice(w.length).includes('/') : f.file === w)));
}

// scripts: the project's script texts, where a class a script looks for (closest('.x'), classList…) is a hook, not a style.
// files: every .vue file ({ file, text }), so a component's own parts (a base it draws with) are read as its own.
// toggles: { component: { figmaBoolean: [the layers it shows] } }, from Figma's structure snapshot.
// stretched: { component: { codeSlotName: figmaSlotName } }, the slots Figma stretches what is put in them in.
export function componentFaults(components = [], { styles = [], scripts = [], sourceOf = null, files = [], toggles = {}, stretched = {} } = {}) {
  const defined = classesDefined(styles);
  const js = scripts.join('\n');
  const hookCache = new Map();
  const hooked = (k) => { if (!hookCache.has(k)) hookCache.set(k, new RegExp(`['"\`.]${k.replace(/[-]/g, '\\-')}['"\` \\]]`).test(js)); return hookCache.get(k); };
  const byTag = new Map();
  for (const c of components) {
    byTag.set(norm(c.name), c);
    const base = String(c.file ?? '').split('/').pop().replace(/\.\w+$/, '');
    // A file named for its folder's family (tiles/Plain.vue → TilePlain), as the code registers it.
    const folder = String(c.file ?? '').split('/').slice(-2, -1)[0] ?? '';
    for (const k of [base, folder + base, folder.replace(/s$/, '') + base]) if (k && !byTag.has(norm(k))) byTag.set(norm(k), c);
  }
  const find = sourceOf ?? ((tag) => byTag.get(norm(tag)) ?? null);
  const out = [];
  const listed = new Set(components.map((c) => c.file));
  const styleText = styles.join('\n');
  for (const c of components) {
    out.push(...faultsOf(c, { sourceOf: find, defined, hooked, styleText, toggles: toggles[c.name] ?? null, stretched: stretched[c.name] ?? null }));
    // What a part it draws with does wrong is the component's to fix: said on it, with the part's file.
    for (const part of partsOf(c, files).filter((f) => !listed.has(f.file))) {
      for (const f of faultsOf({ name: c.name, file: part.file, text: part.text }, { sourceOf: find, defined, hooked, styleText })) if ((f.kind === 'breaks' || f.kind === 'unstyled') && !out.some((o) => o.component === c.name && o.says === f.says)) out.push(f);
    }
  }
  // The same prop, HTML in one component of a family (the same folder) and text in another.
  const family = new Map();
  for (const c of components) {
    const dir = String(c.file ?? '').split('/').slice(0, -1).join('/');
    for (const [p, how] of Object.entries(c.renders ?? {})) { const k = `${dir}|${p}`; if (!family.has(k)) family.set(k, []); family.get(k).push({ c, how }); }
  }
  for (const [k, list] of family) {
    const html = list.filter((x) => x.how === 'html'), text = list.filter((x) => x.how === 'text');
    if (!html.length || !text.length) continue;
    const p = k.split('|')[1];
    for (const { c } of text) out.push({ component: c.name, kind: 'unlike', says: `its \`${p}\` takes text only, while ${html.map((x) => x.c.name).join(', ')} take${html.length === 1 ? 's' : ''} HTML for it: a bold word or a second line works there and not here.`, file: c.file, line: 1 });
  }
  return out;
}

// The lines the audit prints, one a fault: "<component>: <says>  (<file>:<line>)".
export function faultLines(faults) {
  return faults.map((f) => `${f.component}: ${KINDS[f.kind]}. ${f.says[0].toUpperCase()}${f.says.slice(1)}  (${f.file}:${f.line})`);
}
