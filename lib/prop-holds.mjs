// prop-holds.mjs - what a property may hold, as each side declares it, so two with the same name are compared on what
// goes in and not only on what they are called.
//
// A button's text is `children` in Figma and in the code, and the two match by name. But Figma's is a text property and
// takes words, and the code's is a ReactNode and takes anything, an icon or a spinner included: two properties with the
// same name and different content are two components that happen to look alike. Each side's declaration is read as one
// of four kinds:
//   words      - text only: a Figma TEXT property, a code `string` (or a number, which renders as text)
//   component  - one component, which may be swapped: a Figma INSTANCE_SWAP with no list, a code ComponentType
//   one of     - one of a set of components: a swap or a slot that takes only its preferred ones, a code union of them
//                (`typeof Icon | typeof Spinner`, `ReactElement<typeof Icon>`), with the set's names when they are known
//   anything   - any content: a Figma SLOT that takes any component, a code ReactNode, VNode, slot or element
// A declaration the reading cannot place (an object, a function, a type of the system's own) is none of them: nothing
// is said of it, never a guess.
//
//   figmaHolds(def, names)     → { kind, of? } | null   (def: a property definition of the Figma props snapshot;
//                                names: its preferred components by name, the structure snapshot's slots[property])
//   codeHolds(typeText)        → { kind, of? } | null   (the prop's type as the code writes it)
//   holdsDiffer(figma, code)   → { figma, code } in words | null
//   holdsWords(h)              → the kind said in words ("words", "one of Icon or Spinner", "anything")
// Pure.

const ANY = /^(React\.)?(ReactNode|ReactChild|ReactFragment|ReactPortal|PropsWithChildren)\b|^(JSX\.Element|React\.JSX\.Element)$|^(VNode|VNodeChild|Slot|Snippet|TemplateResult|Node|HTMLElement|Element|ChildNode|unknown|any)\b|^(React\.)?ReactElement$/;
const COMPONENT = /^(React\.)?(ComponentType|ElementType|FC|FunctionComponent|ComponentClass|Component)\b|^(Component|DefineComponent|SvelteComponent|ConcreteComponent)\b/;
const WORDS = /^(string|number|String|Number|`[^`]*`|'[^']*'|"[^"]*")$/;

// A union split at its top level only: `ReactElement<typeof A | typeof B>` is one member.
const members = (t) => {
  const out = []; let depth = 0, cur = '';
  for (const ch of String(t)) {
    if ('<({['.includes(ch)) depth++;
    if ('>)}]'.includes(ch)) depth--;
    if (ch === '|' && depth === 0) { out.push(cur.trim()); cur = ''; } else cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out.filter((m) => m && !/^(null|undefined|void|false|true|boolean)$/.test(m));
};
const typeofName = (m) => m.match(/^typeof\s+([A-Za-z_$][\w$.]*)$/)?.[1] ?? null;

export function codeHolds(typeText) {
  const t = String(typeText ?? '').replace(/\s+/g, ' ').trim();
  if (!t) return null;
  const ms = members(t);
  if (!ms.length) return null;
  // typeof A | typeof B, or one element of them: ReactElement<typeof A | typeof B>, ReactElement<AProps, typeof A>.
  const named = [];
  for (const m of ms) {
    const direct = typeofName(m);
    if (direct) { named.push(direct); continue; }
    const inner = m.match(/^(?:React\.)?(?:ReactElement|ComponentProps|VNode)<(.+)>$/)?.[1];
    const names = inner ? members(inner.split(',').pop()).map(typeofName) : [];
    if (names.length && names.every(Boolean)) { named.push(...names); continue; }
    named.length = 0; break;
  }
  if (named.length) return { kind: 'one of', of: [...new Set(named)] };
  if (ms.every((m) => WORDS.test(m))) return { kind: 'words' };
  if (ms.some((m) => ANY.test(m))) return { kind: 'anything' };
  if (ms.every((m) => COMPONENT.test(m))) return { kind: 'component' };
  return null;
}

export function figmaHolds(def, preferredNames = []) {
  if (!def || typeof def !== 'object') return null;
  const preferred = Math.max((def.preferredValues ?? []).length, (Array.isArray(preferredNames) ? preferredNames : []).length);
  const names = (Array.isArray(preferredNames) ? preferredNames : []).filter((x) => typeof x === 'string' && x);
  const set = () => ({ kind: 'one of', ...(names.length ? { of: names } : { count: preferred }) });
  if (def.type === 'TEXT') return { kind: 'words' };
  if (def.type === 'SLOT') return def.slotSettings?.allowPreferredValuesOnly && preferred ? set() : { kind: 'anything' };
  if (def.type === 'INSTANCE_SWAP') return preferred ? set() : { kind: 'component' };
  return null;
}

const listed = (xs) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} or ${xs[xs.length - 1]}`);
export function holdsWords(h) {
  if (!h) return null;
  if (h.kind === 'one of') return h.of?.length ? `one of ${listed(h.of)}` : h.count ? `one of ${h.count} components` : 'one of a set of components';
  if (h.kind === 'component') return 'one component';
  return h.kind;
}

// The two differ when they are kinds apart: words against anything, one component against any content. A set against
// another set differs only when both name theirs and the names are not the same ones (a count says nothing to compare).
export function holdsDiffer(figma, code) {
  if (!figma || !code) return null;
  const norm = (s) => String(s).toLowerCase().replace(/[\s_-]+/g, '');
  if (figma.kind === code.kind) {
    if (figma.kind !== 'one of' || !figma.of?.length || !code.of?.length) return null;
    const a = figma.of.map(norm).sort().join('|'), b = code.of.map(norm).sort().join('|');
    if (a === b) return null;
  }
  // One component that may be swapped and a set of them hold the same kind of content: not a difference by itself.
  if (new Set([figma.kind, code.kind]).size === 2 && [figma.kind, code.kind].every((k) => k === 'component' || k === 'one of') && !(figma.of?.length && code.of?.length)) return null;
  return { figma: holdsWords(figma), code: holdsWords(code) };
}
