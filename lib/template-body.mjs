// template-body.mjs - what a template's body holds, against what the documentation says it holds.
//
// A template is the shell of a page; what goes inside it is the page. The check read whether a page started from a
// template and never read what the template was filled with. In the run this came from, the agent put radio buttons
// inside a filters panel: the team uses dropdowns, and nothing in the documentation says which control a filter
// takes, so the check had nothing to hold the page to and said nothing. The prototype reached review teaching a
// control nobody had chosen.
//
// Both readings here are about the documentation, never about what the page does, and neither says the page is
// wrong:
//   • a template whose documentation never says what its body holds is said once, with what this page put in it;
//   • a body the documentation does describe, that holds something it never names, is said as this prototype's own
//     choice, kept and asked about.
// And a page whose documentation is only a pointer to a spec that is not there is no documentation at all: the
// pointer reads as documented, nobody can follow it, and the question it leaves open is asked instead.
const norm = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
// A template's documentation and the component that lays it out are often one name apart ("List page" / `ListPageTemplate`).
const bare = (s) => norm(s).replace(/template$/, '');
// The name part of a rule's title: "List page · Body (templates, intent layer)" → "List page".
export const ruleName = (title) => String(title ?? '').split(' · ')[0].replace(/\s*\([^)]*\)\s*$/, '').trim();

// Everything the documentation says about one template: its own intent layer page, every section of it, and any
// product rule written under its name. → one text, empty when the documentation says nothing of it.
export function templateSaid(context, template) {
  const want = bare(template);
  if (!want) return '';
  return (context?.rules ?? []).filter((r) => bare(ruleName(r.title)) === want).map((r) => r.text).filter(Boolean).join('\n');
}

// The system's components a text names, however the project writes them: the name itself, a word of prose that is
// the name, or an alias. Generous on purpose - a mention is enough to call a component documented here, and the
// cost of reading one too many is a finding not raised, never a page refused on no evidence.
export function namedIn(text, names = [], aliases = {}) {
  const said = String(text ?? '');
  if (!said.trim() || !names.length) return new Set();
  const byKey = new Map(names.map((n) => [norm(n), n]));
  for (const [a, n] of Object.entries(aliases)) if (names.includes(n)) byKey.set(norm(a), n);
  const out = new Set();
  for (const w of said.match(/[A-Za-z][\w/-]*/g) ?? []) { const n = byKey.get(norm(w)); if (n) out.add(n); }
  return out;
}

// What each template on this page holds, and what its documentation says of it.
// nodes: [{ id, component, parent, line }] (page-check's own); templates: the template components the page may use.
// → [{ template, said, body: [names], unnamed: [{ component, line }] }], one a template, each component once.
export function templateBodies(nodes = [], context = null, templates = [], { aliases = {} } = {}) {
  if (!context || !templates.length) return [];            // no documentation read: nothing to hold a body to
  const names = Object.keys(context.components ?? {});
  if (!names.length) return [];
  // A team whose documentation describes no template at all is not told so on every page it makes: that is a fact
  // about the documentation, not about this page, and repeating it a page is how a check gets ignored. It is the
  // template nobody wrote up, among the ones somebody did, that this reads.
  if (!templates.some((t) => templateSaid(context, t).trim())) return [];
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const shell = (n) => { for (let p = byId.get(n.parent); p; p = byId.get(p.parent)) if (templates.includes(p.component)) return p.component; return null; };
  const rows = new Map();
  for (const n of nodes) {
    if (!names.includes(n.component) || templates.includes(n.component)) continue;
    const t = shell(n);
    if (!t) continue;
    const row = rows.get(t) ?? { template: t, said: templateSaid(context, t), at: new Map() };
    if (!row.at.has(n.component)) row.at.set(n.component, n.line ?? 1);
    rows.set(t, row);
  }
  return [...rows.values()].map((r) => {
    const named = namedIn(r.said, names, aliases);
    return {
      template: r.template,
      said: r.said,
      body: [...r.at.keys()],
      unnamed: [...r.at].filter(([c]) => !named.has(c)).map(([component, line]) => ({ component, line })),
    };
  });
}

// How many are named before the rest are counted: a finding a reviewer cannot read is a finding nobody acts on.
export const MOST_NAMED = 4;
const list = (xs) => (xs.length <= MOST_NAMED ? xs.join(', ') : `${xs.slice(0, MOST_NAMED).join(', ')} and ${xs.length - MOST_NAMED} more`);

// → [{ level, line, template, message }]. A warning, never an error: what the page does may well be right, and what
// is wrong is that nobody decided it.
export function bodyFindings(bodies = []) {
  const out = [];
  for (const b of bodies) {
    if (!b.body.length) continue;
    if (!String(b.said).trim()) {
      out.push({ level: 'warning', line: b.unnamed[0]?.line ?? 1, template: b.template,
        message: `${b.template}'s documentation never says what its body holds, and this page put ${list(b.body)} in it: ${b.body.length === 1 ? 'that is' : 'those are'} this prototype's choice, not the system's. Ask the team what belongs in a ${b.template}` });
      continue;
    }
    if (!b.unnamed.length) continue;
    const who = b.unnamed.map((u) => u.component);
    const one = who.length === 1;
    out.push({ level: 'warning', line: b.unnamed[0].line, template: b.template,
      message: `${b.template}'s documentation says what its body holds and never names ${list(who)}: ${one ? 'it is' : 'they are'} this prototype's choice. Keep ${one ? 'it' : 'them'} and put the question to the team, or use what the documentation names` });
  }
  return out;
}

// A page's documentation that is only a pointer: "See the Filters family spec", "Documented in the Table spec". A
// pointer is documentation where the thing it points at is there to read, and nothing at all where it is not.
export const POINTS_AT = /^\s*(?:see|refer to|documented (?:in|at|under)|described in|defined in|follows?|as (?:per|in)|per)\b\s+(.{2,80}?)\s*\.?\s*$/i;
const SPEC_WORD = /\s+(?:family\s+)?(?:spec|specification|guidelines?|documentation|docs?|page)$/i;

// → [{ page, points, from }]: each page whose whole documentation points somewhere there is nothing to point at.
export function pointsNowhere(context) {
  const rules = context?.rules ?? [];
  const known = new Set([...rules.map((r) => bare(ruleName(r.title))), ...Object.keys(context?.components ?? {}).map(bare)].filter(Boolean));
  const out = [], seen = new Set();
  for (const r of rules) {
    if (r.layer !== 'pages') continue;
    const lines = String(r.text ?? '').split('\n').map((x) => x.trim()).filter(Boolean);
    // Only a pointer: a page that says anything of its own is documented, however thin.
    if (!lines.length || !lines.every((l) => POINTS_AT.test(l))) continue;
    const at = POINTS_AT.exec(lines[0])[1].replace(/^(?:the|a|an)\s+/i, '').replace(SPEC_WORD, '').trim();
    if (!at || known.has(bare(at))) continue;
    const page = ruleName(r.title);
    if (seen.has(page)) continue;
    seen.add(page);
    out.push({ page, points: at, from: r.file ?? 'the intent layer' });
  }
  return out;
}

// Each one as a question the documentation leaves open, in the shape the intent layer's own open questions take, so
// it reaches whoever makes a page the same way they do. The text is the thing left open, not a question: the line
// that prints it asks "How should it be on this page?" around it.
export function nowhereQuestions(gone = []) {
  return gone.map((g) => ({
    name: g.page,
    layer: 'pages',
    where: null,
    from: g.from,
    text: `its documentation is only a pointer to ${g.points}, and there is no ${g.points} to read: nothing says what this page is for or what goes on it`,
  }));
}
