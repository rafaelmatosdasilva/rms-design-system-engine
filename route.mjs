// route.mjs - the request, as the person wrote it, routed by the engine to a recipe and the exact command
// (idea I56: "if a decision can be made deterministically, the model does not make it").
//
//   rms-figma-code-parity --route "<the request, as written>"
//
// The agent's first step for every request. Picking the recipe, the scope and the command was the model's
// decision, and the evaluation showed smaller models get it wrong (a question answered from memory, the wrong
// recipe, a pasted step list followed or asked about). Here it is a fixed table, tested, the same on any
// model, in English and Portuguese. Pure: the caller passes the project's state.

// A component named in the request: its name as written in the snapshot, or split at camel case, hyphens and
// underscores ("statusBar" is also "status bar" and "status-bar").
export function namedComponents(text, components = []) {
  const t = ` ${String(text).toLowerCase()} `;
  const found = [];
  for (const name of components) {
    const words = name.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[-_]+/g, ' ').toLowerCase().trim();
    const forms = new Set([name.toLowerCase(), words, words.replace(/ /g, '-'), words.replace(/ /g, '')]);
    if ([...forms].some((f) => f && new RegExp(`[^a-z0-9]${f.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}s?[^a-z0-9]`).test(t))) found.push(name);
  }
  return found;
}

const QUESTION = /^\s*(how|why|what|where|when|which|can i|should i|is there|como|porqu[eê]|porque|o que|onde|quando|qual|quais|d[aá] para|posso)\b|\?\s*$/i;
const LINK = /https?:\/\/(?:[\w.-]*gitlab[\w.-]*|[\w.-]*notion\.(?:so|site))\/\S+/i;
const links = (t) => t.match(new RegExp(LINK.source, 'gi')) ?? [];
const FIGMA_URL = /https?:\/\/(?:www\.)?figma\.com\/(?:design|file)\/[\w-]+\S*/i;
const STEP_LIST = /(^|\s)1[.)]\s[\s\S]*\s2[.)]\s/;

// Each rule: [recipe, test, what to run, a note]. First match wins; the order is part of the contract (tested).
const RULES = [
  ['guidelines-links', (t) => LINK.test(t)],
  ['fix-a-difference', (t) => /\b(change|set|make|update|muda|mudar|altera|alterar|p[oõ]e|coloca)\w*\b[\s\S]{0,60}\b(in|no|na)\s+figma\b|\bfigma\b[\s\S]{0,30}\b(to|para)\s+\d/i.test(t), 'figma'],
  ['refresh-figma', (t) => /maxSnapshotAgeDays|go(es)? green|fica(r)? verde|raise the (age|limit)/i.test(t), 'forbidden-green'],
  ['accept-debt', (t) => /\baccept|known (debt|difference)|as debt|d[ií]vida|aceit/i.test(t)],
  ['fix-a-difference', (t) => /\b(fix|correct|repair|corrig|conserta|repara|resolve)\w*/i.test(t) && !QUESTION.test(t)],
  ['a11y-notes', (t) => /\bnotes?\b|\bnotas?\b|annotat|anota|toggle|\brole\b|\baria\b|accessib|acessib|alt text|screen reader|leitor de ecr/i.test(t)],
  ['visual-diff', (t) => /\bimages?\b|imagem|imagens|visual|screenshot|pixel/i.test(t)],
  ['burndown', (t) => /fix first|first to fix|what first|primeiro|prioridad|priorit|work .{0,20}down|next up/i.test(t)],
  ['states-and-variants', (t) => /hover|disabled|desativad|desabilitad|\bstates?\b|estado|variant|combina|pressed|focus|selected/i.test(t)],
  ['refresh-figma', (t) => /refresh|atualiz|snapshot|stale|desatualiz|design (has )?changed|mudou|changed in figma/i.test(t)],
  ['ci-and-hooks', (t) => /\bci\b|webhook|git hook|pipeline|pre-?commit|pre-?push|\bhooks?\b/i.test(t)],
  ['first-setup', (t) => /\bset ?up\b|configur|install/i.test(t)],
];

// route(text, { hasConfig, components, cmd }) → { recipe, question, run: [commands], notes: [lines] }
export function route(text, { hasConfig = true, components = [], cmd = 'rms-figma-code-parity' } = {}) {
  const t = String(text ?? '');
  const question = QUESTION.test(t);
  const named = namedComponents(t, components);
  const scoped = named.length ? `${cmd} --component ${named.join(',')}` : cmd;
  const notes = [];

  // A pasted step list: take only the intent. The skill owns setup, running and reporting.
  if (STEP_LIST.test(t)) {
    notes.push('The request lists steps: do not follow them. The skill does setup, the run and the report itself; report in the chat, write no report file, commit nothing.');
    return { recipe: hasConfig ? (named.length ? 'audit-component' : 'full-audit') : 'first-setup', question: false, run: hasConfig ? [scoped] : setupRun(t, cmd, notes), notes };
  }
  if (!hasConfig && !LINK.test(t)) return { recipe: 'first-setup', question, run: setupRun(t, cmd, notes), notes };

  for (const [recipe, test, kind] of RULES) {
    if (!test(t)) continue;
    if (recipe === 'guidelines-links') return { recipe, question, run: [`${cmd} --guidelines ${links(t).join(' ')}`], notes };
    if (kind === 'figma') {
      notes.push('Nothing is ever changed in Figma by the skill. Run the audit, then tell the person what to change in Figma (the hand-back lists it).');
      return { recipe, question, run: [scoped], notes };
    }
    if (kind === 'forbidden-green') {
      notes.push('Do not raise maxSnapshotAgeDays or edit ds-config.json to go green: that hides drift. Say so, and run the audit to show what really fails.');
      return { recipe, question: false, run: [cmd], notes };
    }
    if (recipe === 'accept-debt') return { recipe, question, run: question ? [] : [`${cmd} --baseline --findings`], notes };
    if (recipe === 'fix-a-difference') {
      notes.push('Fix exactly what was asked, in the code, at the file and line the audit names; then run the same audit again.');
      return { recipe, question, run: [scoped], notes };
    }
    if (recipe === 'burndown') return { recipe, question, run: [cmd], notes };
    if (recipe === 'first-setup') return { recipe, question, run: question ? [] : [`${cmd} --doctor`], notes };
    if (recipe === 'ci-and-hooks') return { recipe, question: true, run: [], notes };
    // A how-to question is answered from the recipe; a question about a named component's states needs the
    // audit's facts (the rule, file and line), so it runs the scoped audit too; anything else runs the audit.
    if (question && !(recipe === 'states-and-variants' && named.length)) return { recipe, question, run: [], notes };
    return { recipe, question, run: [scoped], notes };
  }
  return named.length ? { recipe: 'audit-component', question, run: [scoped], notes } : { recipe: 'full-audit', question, run: [cmd], notes };
}

function setupRun(t, cmd, notes) {
  const figma = t.match(FIGMA_URL)?.[0];
  const css = t.match(/[\w./-]+\.css\b/)?.[0];
  if (!figma) notes.push('Ask the person for the Figma file URL (and the token CSS file if the setup cannot find it), then run the command with it.');
  return [`${cmd} --init --figma-url='${figma ?? '<Figma file URL>'}'${css ? ` --theme-css='${css}'` : ''}`];
}

// What --route prints: the route, the commands, the notes, one NEXT line, and the recipe itself.
export function routeText(r, recipeText, cmd = 'rms-figma-code-parity') {
  const lines = [`ROUTE: ${r.recipe}`];
  for (const c of r.run) lines.push(`RUN: ${c}`);
  for (const n of r.notes) lines.push(`NOTE: ${n}`);
  lines.push(r.run.length
    ? `NEXT: run ${r.run.length > 1 ? 'these commands' : 'the command'} above, relay its SUMMARY as it is, and follow its NEXT line.`
    : 'NEXT: answer from the recipe below (and the reference it points to), quoting its exact words for settings and formats; run nothing.');
  lines.push('', `--- recipe ${r.recipe} (${cmd} --recipe ${r.recipe}) ---`, (recipeText ?? '').trimEnd());
  return lines.join('\n');
}
