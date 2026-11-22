// story-props.mjs - a component's stories and examples, held to the values its props take today.
//
// A story is code nobody calls: it builds as long as its file is valid, so a value taken out of a prop (a size the
// system dropped) goes on being set in every story and example that set it before. The page still draws, with the
// component falling back to whatever it does with a value it no longer knows, and every person and agent who copies
// the story copies the value. The edit check already hands back such a value when an agent writes it; this reads the
// files nobody is editing.
//
// What is read, from the story and example files beside a component (code-grammar.mjs storiesOf), never run:
//   • the args a story is drawn with: the file's own (export default { args }), each story's (export const Small =
//     { args }, or Small.args = { … });
//   • each call of the component written in the file (<Button size="xs" />, in a render function, a Vue template or
//     an examples file), its literal values only.
// A value counts only for a prop whose values the code lists (a union of strings, an enum), letter case aside, as the
// edit check reads it. A value written as code (a variable, an expression), a yes or no, a prop the code lists nothing
// for, and an arg that is no prop at all (content a story passes to its own render) are left alone: precise before
// complete.
//
//   storyBreaks({ name, api, stories }) → [{ file, line, story, prop, value, takes }]
//   storyBreakLine(b)                    → one line for a person
import { objectAfter } from './tailwind-classes.mjs';
import { callsIn } from './intent-examples.mjs';

const norm = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
const pascal = (s) => String(s).replace(/(^|[-_\s]+)(\w)/g, (_, __, c) => c.toUpperCase());
const kebab = (s) => String(s).replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
const lineAt = (text, i) => String(text).slice(0, i).split('\n').length;

// The props whose values the code lists, by every way a story might write the name (size, Size, is-open for isOpen).
function listed(api = {}) {
  const out = new Map();
  for (const [name, p] of Object.entries(api?.props ?? {})) {
    const takes = (p?.options ?? []).map(String);
    if (takes.length < 2 || takes.every((v) => /^(true|false)$/i.test(v))) continue;
    out.set(norm(name), { name, takes });
  }
  return out;
}

// The story a place in the file belongs to: the story named before it (export const Small, or Small.args =), else the
// file's own args, which every story starts from.
function storyAt(text, i) {
  const before = String(text).slice(0, i);
  const named = [...before.matchAll(/export\s+const\s+([A-Z][\w$]*)|\b([A-Z][\w$]*)\.args\s*=/g)].pop();
  const meta = before.lastIndexOf('export default');
  if (named && named.index > meta) return named[1] ?? named[2];
  return meta >= 0 ? 'the file\'s own args' : null;
}

// Each args object in the file, where it starts. → [{ at, args }]
function argsIn(text) {
  const out = [];
  for (const m of String(text).matchAll(/\bargs\s*[:=]\s*\{/g)) {
    const args = objectAfter(text.slice(m.index), /^args$/);
    if (args && typeof args === 'object' && !Array.isArray(args)) out.push({ at: m.index, args });
  }
  return out;
}

// One component's stories and examples, held to its props. component: { name, api, stories: [{ file, text }] }.
export function storyBreaks({ name, api, stories = [] } = {}) {
  const props = listed(api);
  if (!props.size || !stories.length) return [];
  const out = [];
  const seen = new Set();
  const held = (file, line, story, key, value) => {
    if (value === null || value === undefined || typeof value === 'boolean' || typeof value === 'object') return;
    const p = props.get(norm(key));
    if (!p || p.takes.some((t) => t.toLowerCase() === String(value).toLowerCase())) return;
    const k = `${file}|${line}|${p.name}|${value}`;
    if (seen.has(k)) return;
    seen.add(k);
    out.push({ file, line, story, prop: p.name, value: String(value), takes: p.takes });
  };
  const tags = [...new Set([name, pascal(name), kebab(pascal(name))])];
  for (const { file, text } of stories) {
    if (!text) continue;
    for (const { at, args } of argsIn(text)) {
      const line = lineAt(text, at), story = storyAt(text, at);
      for (const [k, v] of Object.entries(args)) held(file, line, story, k, v);
    }
    for (const call of callsIn(text, tags)) {
      for (const a of call.attrs ?? []) {
        // A literal only: :size="x" and size={x} are expressions, a spread is the story's args again.
        if (a.spread || !a.quoted || a.braced || /^(:|v-bind:|@|#|v-)/.test(a.name)) continue;
        // The end of the call's own line, so a story named on that line (export const Drawn = { render: () => <Chip /> }) is its.
        const at = String(text).split('\n').slice(0, call.line).join('\n').length;
        held(file, call.line, storyAt(text, at), a.name, a.raw);
      }
    }
  }
  return out;
}

export const storyBreakLine = (b) => `${b.file}:${b.line}${b.story ? ` (${b.story})` : ''} sets ${b.prop}="${b.value}", which ${b.prop} no longer takes: it takes ${b.takes.join(', ')}`;
