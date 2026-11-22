// content-guidance.mjs - a team's words about its words, read from its intent layer, and the copy held to them.
//
// The engine checked copy only against the system's own writing rules (writing-formats.mjs, case-check.mjs). A team
// also writes how its product speaks: the voice, the terms to use and the ones to avoid, how an error, an empty state or
// a button is worded. That guidance lives in its intent layer, on a page of its own (Content, Voice and tone, Writing,
// Terminology) or a section of one, and nothing held the copy to it but a person reading every screen.
//
// Here each line of that guidance a check can hold becomes a rule, in the team's own words and with the page it came
// from, the same way for any team. What a check cannot hold is listed as such, never guessed into a rule.
//
//   contentGuidance(intent)        → { rules: [{ kind, text, page, … }], unread: [{ text, page }] }
//   copyFindings(texts, rules)     → [{ kind, text, component, message, rule, page }]
//   textsOfTree(tree)              → [{ text, component, role }]: a composition's words, each with what shows it
//
// The kinds a line becomes:
//   term    a word or phrase to avoid, with the one to say instead when the line gives it ("Use sign in, not log in")
//   verb    a button starts with a verb
//   blame   an error never blames the person
//   case    words in sentence case (or title case)
// Pure: nothing is read or written here.

// A page, or a section of one, that is about the product's words.
const ABOUT_WORDS = /\b(content|voice|tone|writing|wording|copy|terminology|glossary|microcopy|vocabulary|language)\b/i;
const Q = /["“”'‘’]([^"“”'‘’]{1,60})["“”'‘’]/g;   // a quoted term
const quoted = (s) => [...String(s).matchAll(Q)].map((m) => m[1].trim()).filter(Boolean);
const bare = (s) => String(s).replace(/^[\s"“”'‘’]+|[\s"“”'‘’.,;:!]+$/g, '').trim();

// Every line a page about words holds: its rules, its mistakes, and its sections' lines.
function linesOf(e) {
  const out = [];
  const pageAbout = ABOUT_WORDS.test(`${e.name ?? ''} ${e.kind ?? ''}`);
  if (pageAbout) for (const r of e.rules ?? []) out.push(r.text ?? r);
  if (pageAbout) for (const m of e.mistakes ?? []) out.push(m);
  for (const s of e.sections ?? []) if (pageAbout || ABOUT_WORDS.test(s.title ?? '')) for (const l of String(s.text ?? '').split(/\n+|(?<=\.)\s+(?=[A-Z])/)) out.push(l);
  return out.map((l) => String(l).replace(/^\s*[-*•]\s*/, '').trim()).filter((l) => l.length > 3);
}

// One line → a rule, or null when no check can hold it.
export function ruleOf(line) {
  const t = String(line);
  let m;
  // "Use sign in, not log in" · "Say X instead of Y" · "Write X rather than Y"
  if ((m = /^(?:use|say|write|prefer)\s+(.+?),?\s+(?:not|instead of|rather than|over)\s+(.+?)\.?$/i.exec(t))) {
    const use = quoted(m[1])[0] ?? bare(m[1]), avoid = quoted(m[2]).length ? quoted(m[2]) : [bare(m[2])];
    return avoid.filter(Boolean).length ? { kind: 'term', avoid: avoid.filter(Boolean), use } : null;
  }
  // "Avoid 'click here' and 'please'" · "Don't say 'oops'" · "Never write 'simply'"
  if ((m = /^(?:avoid|don'?t\s+(?:use|say|write)|do not\s+(?:use|say|write)|never\s+(?:use|say|write))\s+(.+?)\.?$/i.exec(t))) {
    const avoid = quoted(m[1]).length ? quoted(m[1]) : (/^[\w\s-]{1,30}$/.test(bare(m[1])) ? [bare(m[1])] : []);
    return avoid.length ? { kind: 'term', avoid, use: null } : null;
  }
  if (/\bbuttons?\b[^.]*\b(start|starts|begin|begins|open|opens)\s+with\s+a\s+verb\b|\bbutton labels?\s+(are|is)\s+(a\s+)?verbs?\b|\bbuttons?\s+(are|is)\s+(a\s+)?verbs?\b/i.test(t)) return { kind: 'verb' };
  if (/\berrors?\b[^.]*\b(never|don'?t|do not)\s+blame\b/i.test(t) || /\bnever\s+blame\b[^.]*\b(person|user|reader)\b/i.test(t)) return { kind: 'blame' };
  if (/\bsentence case\b/i.test(t)) return { kind: 'case', case: 'sentence' };
  if (/\btitle case\b/i.test(t) && !/\bnot\b|\bnever\b|\bavoid\b/i.test(t)) return { kind: 'case', case: 'title' };
  return null;
}

export function contentGuidance(intent) {
  const rules = [], unread = [];
  for (const e of intent?.entities ?? []) {
    for (const line of linesOf(e)) {
      const r = ruleOf(line);
      if (r) rules.push({ ...r, text: line, page: e.name ?? e.file ?? null, url: e.url ?? null });
      else unread.push({ text: line, page: e.name ?? e.file ?? null });
    }
  }
  return { rules, unread };
}

// A composition's words, each with the component that shows it and what the words are for.
export function textsOfTree(tree) {
  const out = [];
  const walk = (n) => {
    if (!n || typeof n !== 'object') return;
    const p = n.props ?? {}, c = String(n.component ?? '');
    for (const k of ['text', 'label', 'Label', 'title', 'Title', 'placeholder']) if (typeof p[k] === 'string' && p[k].trim()) out.push({ text: p[k].trim(), component: c || null, role: roleOf(c, p) });
    (Array.isArray(n.children) ? n.children : Object.values(n.children ?? {})).forEach(walk);
  };
  walk(tree);
  return out;
}
const roleOf = (c, p = {}) => /button|link|cta/i.test(c) ? 'button' : (/error|alert|toast|notice|message|feedback/i.test(c) || p.error || /^(error|danger|negative)$/i.test(p.variant ?? p.Variant ?? '')) ? 'error' : 'text';

// Words a button never starts with, when it starts with a verb: an article, a possessive, a yes or a no.
const NOT_A_VERB = /^(the|a|an|your|my|our|their|this|that|ok|okay|yes|no)\b/i;
const BLAMES = /\byou\s+(entered|typed|chose|selected|forgot|failed|made|did|have not|haven'?t)\b|\binvalid\b|\billegal\b|\bwrong\b/i;
const TITLE = (s) => s.split(/\s+/).filter((w) => /^[A-Za-z]{4,}$/.test(w)).length >= 2 && s.split(/\s+/).filter((w) => /^[a-z]{4,}$/.test(w)).length === 0;
const SENTENCE = (s) => s.split(/\s+/).slice(1).some((w) => /^[a-z]/.test(w)) || s.split(/\s+/).length < 2;

export function copyFindings(texts = [], rules = []) {
  const out = [];
  for (const t of texts) {
    for (const r of rules) {
      const said = (message) => { if (!out.some((o) => o.message === message)) out.push({ kind: r.kind, text: t.text, component: t.component, message, rule: r.text, page: r.page }); };
      if (r.kind === 'term') for (const a of r.avoid) {
        if (new RegExp(`(^|[^\\p{L}])${a.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^\\p{L}])`, 'iu').test(t.text)) said(`"${t.text}" says "${a}", which ${r.page ?? 'the content guidance'} says to avoid${r.use ? `: say "${r.use}"` : ''}`);
      }
      if (r.kind === 'verb' && t.role === 'button' && NOT_A_VERB.test(t.text)) said(`the button "${t.text}" does not start with a verb, as ${r.page ?? 'the content guidance'} asks`);
      if (r.kind === 'blame' && t.role === 'error' && BLAMES.test(t.text)) said(`the error "${t.text}" blames the person, which ${r.page ?? 'the content guidance'} rules out: say what happened and what to do`);
      if (r.kind === 'case' && t.text.split(/\s+/).length >= 2) {
        if (r.case === 'sentence' && TITLE(t.text)) said(`"${t.text}" is in title case, where ${r.page ?? 'the content guidance'} asks for sentence case`);
        if (r.case === 'title' && !TITLE(t.text) && SENTENCE(t.text)) said(`"${t.text}" is in sentence case, where ${r.page ?? 'the content guidance'} asks for title case`);
      }
    }
  }
  return out;
}

// A page of the system's own code (Vue, JSX, HTML): the words it writes in a component's attributes (label, text,
// title, placeholder) and inside a button, each with the tag that shows it.
export function textsOfMarkup(src = '') {
  const out = [];
  const s = String(src).replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, '');
  for (const m of s.matchAll(/<([A-Za-z][\w.-]*)\b([^>]*)>/g)) {
    for (const a of m[2].matchAll(/\b(label|text|title|placeholder)\s*=\s*"([^"{}]+)"/g)) out.push({ text: a[2].trim(), component: m[1], role: roleOf(m[1]) });
  }
  for (const m of s.matchAll(/<([A-Za-z][\w.-]*(?:button|Button|link|Link)[\w.-]*|button|a)\b[^>]*>([^<{]+)<\/\1>/g)) if (m[2].trim()) out.push({ text: m[2].trim(), component: m[1], role: 'button' });
  return out;
}

// The check of one prototype's copy, from its project: the guidance read, the copy held to it, and what was not read.
// → { rules, unread, findings, lines } (lines: what the check prints; none when the intent layer has no content guidance)
export function copyCheck(intent, texts) {
  const { rules, unread } = contentGuidance(intent);
  if (!rules.length) return { rules, unread, findings: [], lines: [] };
  const findings = copyFindings(texts, rules);
  const pages = [...new Set(rules.map((r) => r.page).filter(Boolean))];
  const lines = [`✍️  COPY  held to ${rules.length} rule${rules.length === 1 ? '' : 's'} of the content guidance (${pages.join(', ')})${findings.length ? `: ${findings.length}` : ': it follows them'}`,
    ...findings.map((f) => `   ❌ ${f.message}`),
    ...(unread.length ? [`   ℹ️  ${unread.length} line${unread.length === 1 ? '' : 's'} of it no check reads (a voice, a tone): for whoever reviews the copy`] : []),
    ...(findings.length ? ['NEXT: change each ❌ line under ✍️ COPY in the prototype\'s own words, as its rule says, and check it again; a rule that does not fit this screen is the team\'s to change in its content guidance, never the prototype\'s to ignore: tell the person.'] : [])];
  return { rules, unread, findings, lines };
}
