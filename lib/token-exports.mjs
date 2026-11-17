// token-exports.mjs - the same tokens, in the shape a team's own pipeline reads.
//
// The engine writes its tokens once, as a W3C DTCG dictionary (contract-gen.mjs): groups nested by dot-path, each
// leaf a $type and a $value, every other mode under $extensions. A team whose pipeline is built on Style Dictionary
// or Tokens Studio reads neither directly and converts it by hand, which goes stale on the first change.
//
// Both formats are written from that one dictionary and nothing else, so there is one model and three views of it:
//
//   styleDictionary(tokens)  → its own nested JSON: `value`, `type`, `comment` - the same tree without the $
//   tokensStudio(tokens)     → one set, each leaf `value` and a `type` of its own vocabulary
//
// What neither invents: a value the dictionary does not hold. A type the engine does not emit has no mapping here
// and the token keeps its own word rather than being guessed into one of theirs - a wrong type silently changes what
// a pipeline builds, where an unknown one stops it and asks.
//
// Modes: the dictionary keeps other modes under $extensions, and neither format has a place for them. They are left
// where they are, and the count is said, so a team reading dark values knows these files do not carry them.

// Tokens Studio names its types its own way, and only the three the engine emits are mapped (`color`, `dimension`,
// `typography`). A dimension is `sizing` there unless the group it sits in says otherwise - spacing and radius are
// its own types, and a pipeline given `sizing` for a radius builds the wrong thing.
const STUDIO_BY_GROUP = [[/^spacing(\.|$)/, 'spacing'], [/^(radius|corner|borderRadius)(\.|$)/, 'borderRadius'],
  [/^(border|stroke)(\.|$)/, 'borderWidth'], [/^(breakpoint|screen)(\.|$)/, 'sizing'], [/^opacity(\.|$)/, 'opacity']];
export function studioType(dtcgType, path = '') {
  if (dtcgType === 'color') return 'color';
  if (dtcgType === 'typography') return 'typography';
  if (dtcgType === 'dimension') return STUDIO_BY_GROUP.find(([re]) => re.test(path))?.[1] ?? 'sizing';
  return dtcgType ?? null;   // one the engine does not emit: its own word, never a guess at theirs
}

const isLeaf = (v) => v && typeof v === 'object' && '$value' in v;
const isGroup = (v) => v && typeof v === 'object' && !Array.isArray(v) && !('$value' in v);

// Walk the dictionary, leaf by leaf, with the dot-path each sits at. $-prefixed keys are the format's own
// ($description on a group, $extensions), never a token.
export function* leaves(tokens = {}, path = []) {
  for (const [key, value] of Object.entries(tokens)) {
    if (key.startsWith('$')) continue;
    if (isLeaf(value)) yield { path: [...path, key], leaf: value };
    else if (isGroup(value)) yield* leaves(value, [...path, key]);
  }
}

const setDeep = (root, path, leaf) => { let at = root; for (const k of path.slice(0, -1)) at = (at[k] ??= {}); at[path.at(-1)] = leaf; };

// Style Dictionary's own JSON: the same tree, `value` and `type` without the $, and a description as `comment`,
// which is the word it has always used.
export function styleDictionary(tokens = {}) {
  const out = {};
  for (const { path, leaf } of leaves(tokens)) {
    setDeep(out, path, { value: leaf.$value, ...(leaf.$type ? { type: leaf.$type } : {}),
      ...(leaf.$description ? { comment: leaf.$description } : {}),
      ...(leaf.$deprecated ? { deprecated: leaf.$deprecated } : {}) });
  }
  return out;
}

// Tokens Studio: one set, nested as the dictionary nests, each leaf its `value` and its `type`. The set is named,
// because the format keeps sets by name and a file with none is read as having lost it.
export function tokensStudio(tokens = {}, { set = 'global' } = {}) {
  const inSet = {};
  for (const { path, leaf } of leaves(tokens)) {
    const type = studioType(leaf.$type, path.join('.'));
    setDeep(inSet, path, { value: leaf.$value, ...(type ? { type } : {}),
      ...(leaf.$description ? { description: leaf.$description } : {}) });
  }
  return { [set]: inSet, $metadata: { tokenSetOrder: [set] } };
}

// How many tokens carry a mode these files do not: said by the run, never left for somebody to notice.
export const withOtherModes = (tokens = {}) => [...leaves(tokens)].filter(({ leaf }) => leaf.$extensions && Object.values(leaf.$extensions).some((v) => v && typeof v === 'object' && Object.keys(v).length)).length;

export function exportLines({ styleDictionaryFile = null, tokensStudioFile = null, count = 0, modes = 0 } = {}) {
  const out = [];
  if (styleDictionaryFile) out.push(`🎨 ${count} token${count === 1 ? '' : 's'} for Style Dictionary → ${styleDictionaryFile}`);
  if (tokensStudioFile) out.push(`🎨 ${count} token${count === 1 ? '' : 's'} for Tokens Studio → ${tokensStudioFile}`);
  if (out.length && modes) out.push(`   ${modes} of them have a value in another mode, which neither format carries: those stay in tokens.json`);
  return out;
}
