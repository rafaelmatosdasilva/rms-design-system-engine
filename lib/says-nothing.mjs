// says-nothing.mjs - a description that is there and says nothing.
//
// The engine reports what a component's documentation says. It never reported documentation that says nothing,
// so a sentence like "Stepper Primary is a Vue design system component of the Acme library" counted as
// documented: it names the thing, the framework and the library, and tells whoever reads it nothing they did
// not know from the name. An empty field is visibly empty; a sentence that says nothing is not, and an agent
// choosing between twenty components written that way has the names and no more.
//
// This is not a style opinion about how a team writes. It is a reading of whether a sentence carries anything
// past the name: a description made only of the component's own name, the words every description in this
// system shares, and the language every design system's documentation uses, says nothing about what it is for.
const NOTHING = /^\s*$|^\(?no description/i;

// The words that say nothing on their own, because any component's description could hold them. The system's
// own boilerplate (its library's name, its framework, its house phrasing) is not listed here: it is read from
// the system itself by commonWords, since only the system knows it.
export const EMPTY_WORDS = new Set(['is', 'a', 'an', 'the', 'of', 'in', 'for', 'and', 'or', 'to', 'this', 'it',
  'component', 'components', 'design', 'system', 'library', 'ui', 'element', 'widget', 'control',
  'vue', 'react', 'angular', 'svelte', 'web', 'html', 'css', 'javascript', 'typescript']);

const words = (s) => String(s ?? '').toLowerCase().match(/[a-zà-ú][a-zà-ú0-9-]*/g) ?? [];
const nameWords = (n) => words(String(n ?? '').replace(/([a-z0-9])([A-Z])/g, '$1 $2'));

// A word half the system's descriptions share is the house phrasing, not what a component is for. Read from the
// system rather than configured: the library's name, the framework's and the team's own turn of phrase differ per
// system and nothing outside it knows them. SMALLEST: under this many written descriptions a shared word is a
// coincidence, not a pattern, so nothing is taken away.
export const SHARED = 0.5;
export const SMALLEST = 8;

export function commonWords(said = []) {
  const texts = said.map((t) => String(t ?? '')).filter((t) => !NOTHING.test(t));
  if (texts.length < SMALLEST) return new Set();
  const seen = new Map();
  for (const t of texts) for (const w of new Set(words(t))) seen.set(w, (seen.get(w) ?? 0) + 1);
  return new Set([...seen].filter(([, n]) => n >= texts.length * SHARED).map(([w]) => w));
}

// Whether a description tells a reader anything about what this component is for.
// name: so its own name does not count as content. common: the system's own shared words (commonWords).
export function saysNothing(said, name = '', { common = new Set() } = {}) {
  const text = String(said ?? '');
  if (NOTHING.test(text)) return true;
  const own = new Set(nameWords(name));
  const left = words(text).filter((w) => w.length > 1 && !EMPTY_WORDS.has(w) && !common.has(w) && !own.has(w));
  // Two words of its own is the least that can carry a meaning ("ordered events", "destructive confirmations").
  // One is the name said again in other letters.
  return left.length < 2;
}

const saidOf = (k) => String(k?.purpose ?? k?.intentLayer?.purpose ?? k?.description ?? '').trim();

// Every component whose documentation says nothing. components: { name: { purpose, ... } }.
// Components with nothing written at all are left out: the catalog already shows those as empty, and an empty
// field asks for the same sentence this does without needing to be told twice.
// → [{ name, said }], in the order they were given.
export function sayNothing(components = {}) {
  const rows = Object.entries(components).map(([name, k]) => ({ name, said: saidOf(k) }));
  const common = commonWords(rows.map((r) => r.said));
  return rows.filter((r) => !NOTHING.test(r.said) && saysNothing(r.said, r.name, { common }));
}

export const MOST_NAMED = 6;

// What a person is told, once, with the count. Not a failure: it is the team's documentation to write, and the
// engine's job is to say that an agent choosing between these has nothing to choose on.
export function sayNothingLines(found = [], { total = 0 } = {}) {
  if (!found.length) return [];
  const names = found.slice(0, MOST_NAMED).map((f) => f.name).join(', ');
  const more = found.length > MOST_NAMED ? `, and ${found.length - MOST_NAMED} more` : '';
  return ['', `📝 DOCUMENTED IN NAME ONLY  ${found.length}${total ? ` of ${total}` : ''} component(s): ${names}${more}`,
    '   Their description repeats the name and the words every description here shares, so it says nothing about',
    '   what they are for: choosing between them gives an agent what the name gives and no more.',
    '   One sentence each, saying when to use it, is what this asks for.'];
}
