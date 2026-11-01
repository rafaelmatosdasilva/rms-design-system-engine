// doc-stress.mjs - the documentation put under load, to find where agents cannot tell what to use or how.
//
//   "Which component?"   each component's own "when to use" lines, its names taken out, become scenarios; an agent
//                        given only what each component is for (one line each, as the catalog shows the ones a request
//                        does not need) picks one. A wrong pick is two pages that claim the same use, or a purpose that
//                        does not say enough.
//   The request sweep    requests made from the intent layer's own templates, patterns and pages; an agent writes each
//                        page from the catalog alone, in one go, and the page check scores it (prototype.mjs sweep).
//
// Pure, but for the answers: a runner (prompt → text) is passed in.

const norm = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');

// The scenarios: up to `per` "when to use" lines of each component, every name of a component taken out (in
// backticks, or a component's name or alias as a word). → [{ id, component, text }]
export function scenariosFrom(context, page, { per = 2, most = 160 } = {}) {
  const names = Object.keys(page.components ?? {});
  const shared = new Set(sharedLines(context, page).map((x) => norm(x.text)));
  const out = [];
  for (const n of names) {
    const c = page.components[n], il = context?.components?.[n]?.intentLayer;
    // Only its own names come out (its name, aliases, tag and the words of its page's title): a need written with
    // another component's name in it says which one to use, and is skipped.
    const own = new Set([n, ...(c.aliases ?? []), c.tag, ...String(il?.file ?? '').split('/').pop().replace(/\.[^.]+$/, '').split(/[^A-Za-z]+/)].filter(Boolean).map(norm).filter((w) => w.length > 2));
    const others = new Set(names.filter((x) => x !== n).flatMap((x) => [x, ...(page.components[x].aliases ?? []), page.components[x].tag]).filter(Boolean).map(norm).filter((w) => w.length > 4));
    const lines = [...(il?.whenToUse ?? []), ...(context?.components?.[n]?.whenToUse ?? [])].filter((l) => !shared.has(norm(l)));
    let taken = 0;
    for (const line of lines) {
      if (taken >= per) break;
      const tokens = String(line).replace(/`[^`]*`/g, ' it ').split(/\s+/).filter(Boolean);
      if (tokens.some((w) => others.has(norm(w)))) continue;
      const text = tokens.map((w) => (own.has(norm(w)) ? 'it' : w)).join(' ').replace(/\s+/g, ' ').trim();
      const its = text.split(' ').filter((w) => /^it\W*$/i.test(w)).length;
      if (text.split(' ').length < 6 || its > 2) continue;
      out.push({ id: `s${out.length + 1}`, component: n, text });
      taken++;
    }
  }
  return out.slice(0, most);
}

// "When to use" lines several components share word for word: they cannot tell an agent which one to use (a gap of
// their own, never asked as a scenario). → [{ text, components }]
export function sharedLines(context, page) {
  const by = new Map();
  for (const n of Object.keys(page.components ?? {})) {
    const il = context?.components?.[n]?.intentLayer;
    for (const l of new Set([...(il?.whenToUse ?? []), ...(context?.components?.[n]?.whenToUse ?? [])])) { const k = norm(l); if (!by.has(k)) by.set(k, { text: l, components: [] }); by.get(k).components.push(n); }
  }
  return [...by.values()].filter((x) => x.components.length > 1).sort((a, b) => b.components.length - a.components.length);
}

// The components every "when to use" line of which another component says too: nothing on their page tells an agent
// when this one, not its siblings. → [names]
export function withoutOwnUse(context, page) {
  const shared = new Set(sharedLines(context, page).map((x) => norm(x.text)));
  return Object.keys(page.components ?? {}).filter((n) => { const il = context?.components?.[n]?.intentLayer; const lines = [...(il?.whenToUse ?? []), ...(context?.components?.[n]?.whenToUse ?? [])]; return lines.length && lines.every((l) => shared.has(norm(l))); });
}

// The menu an agent picks from: one line per component, what it is for. → text
export function menuOf(context, page) {
  return Object.keys(page.components).map((n) => `${n}: ${String(context?.components?.[n]?.purpose ?? context?.components?.[n]?.intentLayer?.purpose ?? '(no description)').replace(/\s+/g, ' ').slice(0, 160)}`).join('\n');
}

export function choicesPrompt(batch, menu) {
  return `You build pages with a design system. Its components, each with what it is for:
${menu}

For each need below, name the one component of this list you would use. Answer with one JSON object and nothing else: { "<id>": "<component name exactly as listed>" }.

${batch.map((s) => `${s.id}: ${s.text}`).join('\n')}`;
}

// Each answer against the component whose page the scenario came from. → { results, confusions: { component: [{ chose, text }] }, right, total }
export function gradeChoices(scenarios, answers, page) {
  const byKey = new Map(Object.entries(page.components).flatMap(([n, c]) => [n, ...(c.aliases ?? []), c.tag].filter(Boolean).map((a) => [norm(a), n])));
  const results = scenarios.map((s) => { const chose = byKey.get(norm(answers?.[s.id])) ?? (answers?.[s.id] ?? null); return { ...s, chose, ok: chose === s.component }; });
  const confusions = {};
  for (const r of results.filter((x) => !x.ok)) (confusions[r.component] = confusions[r.component] ?? []).push({ chose: r.chose, text: r.text });
  return { results, confusions, right: results.filter((r) => r.ok).length, total: results.length };
}

export function runChoices(scenarios, menu, run, { batch = 40 } = {}) {
  const answers = {};
  for (let i = 0; i < scenarios.length; i += batch) {
    const part = scenarios.slice(i, i + batch);
    const text = run(choicesPrompt(part, menu));
    const m = /\{[\s\S]*\}/.exec(String(text ?? ''));
    try { Object.assign(answers, m ? JSON.parse(m[0]) : {}); } catch { /* an answer that is not JSON: those scenarios count as wrong */ }
  }
  return answers;
}

// The requests a sweep asks for: one per template, pattern and product page the intent layer has, from what its page says
// it is for. → [{ id, request, from }]
export function sweepRequests(context, { most = 12 } = {}) {
  const seen = new Set(), out = [];
  for (const r of context?.rules ?? []) {
    // A whole page of the layer (not one of its sections), with what it is for in words, not a reference.
    const m = /^([^·]+?) \((templates?|patterns?|pages?|flows?), intent layer\)$/.exec(r.title);
    if (!m || seen.has(m[1])) continue;
    const purpose = String(r.text).split('\n').find((l) => l.trim() && !/^(Use when|Not when|Common mistake|Limitation):/i.test(l)) ?? '';
    if (purpose.split(' ').length < 6 || /^(figma|see|\||-)/i.test(purpose.trim())) continue;
    seen.add(m[1]);
    out.push({ id: `r${out.length + 1}`, from: m[1], layer: m[2], request: `A page for this need: ${purpose.replace(/\s+/g, ' ').slice(0, 240)}` });
  }
  // Product pages first, then templates, then patterns: what a team builds most.
  const rank = (x) => (/^pages?$/.test(x.layer) ? 0 : /^templates?$/.test(x.layer) ? 1 : 2);
  return out.sort((a, b) => rank(a) - rank(b)).slice(0, most).map((x, i) => ({ ...x, id: `r${i + 1}` }));
}

// Before writing, the agent names the other components it would read in full (as --detail lets it). → prompt
export function detailPrompt(request, catalog) {
  return `${catalog}

You will write the page for this request: "${request}". Some components above are shown in full and the rest in one line. Name the ones shown in one line whose full card you need to read before writing it. Answer with one JSON object and nothing else: { "detail": ["<name>", …] }.`;
}
export function pagePrompt(request, catalog, ext) {
  return `${catalog}

Write the page for this request, as the catalog above says: "${request}"
Use only the components the catalog lists, each as its card writes it. Answer with the whole file in one \`\`\`${ext.slice(1)} code block and nothing else.`;
}
export const codeOf = (text) => /```[\w-]*\n([\s\S]*?)```/.exec(String(text ?? ''))?.[1] ?? null;
