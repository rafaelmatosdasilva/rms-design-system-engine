// route.mjs - the request, as the person wrote it, routed by the engine to a recipe and the exact command
// (idea I56: "if a decision can be made deterministically, the model does not make it").
//
//   rms-figma-code-parity --route "<the request, as written>"
//
// The agent's first step for every request. Picking the recipe, the scope and the command was the model's
// decision, and the evaluation showed smaller models get it wrong (a question answered from memory, the wrong
// recipe, a pasted step list followed or asked about). Here it is a fixed table, tested, the same on any
// model, in English and Portuguese. route() is pure: projectState() reads the project for it.
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

// What the router needs from the project: is there a config, which components, when the snapshots were
// captured (the oldest _updated stamp, as a date), and the command to write (the engine's path when the
// terminal command is not on PATH).
export function projectState(ROOT, { engineDir, env = process.env } = {}) {
  const hasConfig = existsSync(join(ROOT, 'ds-config.json'));
  let conf = {};
  try { conf = hasConfig ? JSON.parse(readFileSync(join(ROOT, 'ds-config.json'), 'utf8')) : {}; } catch { /* unreadable: the defaults */ }
  const read = (rel) => { try { return JSON.parse(readFileSync(join(ROOT, rel), 'utf8')); } catch { return null; } };
  const structure = read(conf.paths?.snapshotStructure ?? 'src/figma-structure.snapshot.json');
  const vars = read(conf.paths?.snapshotVars ?? 'src/figma-vars.snapshot.json');
  const stamps = [structure?._updated, vars?._updated].filter(Boolean).map((u) => new Date(u)).filter((d) => !Number.isNaN(d.getTime()));
  const oldest = stamps.length ? new Date(Math.min(...stamps)) : null;
  const onPath = String(env.PATH ?? '').split(':').some((d) => d && existsSync(join(d, 'rms-figma-code-parity')));
  return {
    hasConfig,
    components: Object.keys(structure?.components ?? {}),
    snapshotDate: oldest ? oldest.toISOString().slice(0, 10) : null,
    cmd: onPath || !engineDir ? 'rms-figma-code-parity' : `node ${join(engineDir, 'audit.mjs')}`,
  };
}

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
  // Before accept-debt: "que valores aceita o size" asks what a prop accepts, it accepts no debt.
  ['ask-the-system', (t) => QUESTION.test(t) && /\b(props?|propriedades?|values?|valores?|tokens?|variables?|vari[aá]ve(l|is)|names?|nomes?)\b/i.test(t) && !/debt|d[ií]vida|baseline/i.test(t)],
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

// Sentences the agent says as written, so what it can and cannot do is never its own wording.
export const SAY = {
  figma: 'I can\'t change Figma: this skill only reads it. A person makes that change in the Figma editor; the audit below shows the Figma value and the code value.',
  noRefresh: (date) => `I couldn't refresh the Figma snapshots here: there is no Figma tool in this session. The audit below uses the committed snapshots${date ? ` (captured ${date})` : ''}, so a change made in Figma after that is not in it. To refresh them, connect the Figma MCP server to Claude Code, or set FIGMA_TOKEN in the project's .env file; never paste a token in the chat.`,
};

// route(text, { hasConfig, components, cmd, snapshotDate }) → { recipe, question, run: [commands], notes: [lines], say: [lines], sayIf }
export function route(text, { hasConfig = true, components = [], cmd = 'rms-figma-code-parity', snapshotDate = null } = {}) {
  const r = routeOnly(text, { hasConfig, components, cmd });
  const say = [];
  let sayIf = null;
  if (r.kind === 'figma') say.push(SAY.figma);
  if (r.recipe === 'refresh-figma' && r.kind !== 'forbidden-green') {
    r.notes.push('A refresh needs a Figma tool in this session (the Figma MCP use_figma tool) for the capture in the recipe below. With it, capture first, then run the command. Without it, do not offer a refresh and never edit a snapshot.');
    sayIf = 'when there is no Figma tool in this session';
    say.push(SAY.noRefresh(snapshotDate));
  }
  delete r.kind;
  return { ...r, say, sayIf };
}

function routeOnly(text, { hasConfig, components, cmd }) {
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
      notes.push('Nothing is ever changed in Figma by the skill, and it never offers to. Run the audit, then tell the person what to change in Figma.');
      return { recipe, question, run: [scoped], notes, kind };
    }
    if (kind === 'forbidden-green') {
      notes.push('Do not raise maxSnapshotAgeDays or edit ds-config.json to go green: that hides drift. Say so, and run the audit to show what really fails.');
      return { recipe, question: false, run: [cmd], notes, kind };
    }
    if (recipe === 'accept-debt') return { recipe, question, run: question ? [] : [`${scoped} --baseline --findings`], notes };
    if (recipe === 'fix-a-difference') {
      notes.push('Fix exactly what was asked, in the code, at the file and line the audit names, and nothing else: list the other differences the audit shows and leave them as they are; then run the same audit again.');
      return { recipe, question, run: [scoped], notes };
    }
    if (recipe === 'burndown') return { recipe, question, run: [cmd], notes };
    if (recipe === 'ask-the-system') {
      const terms = [...named, ...(t.match(/(?:--[a-z][\w-]*|\b[a-z][\w-]*(?:\/[\w-]+)+)/gi) ?? [])];
      if (!terms.length) notes.push('Ask which component or token, then run the query with it.');
      return { recipe, question, run: terms.length ? [`${cmd} --query ${terms.join(' ')}`] : [], notes };
    }
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
export function routeText(r, recipeText, cmd = 'rms-figma-code-parity', { maxRecipe = null } = {}) {
  const lines = [`ROUTE: ${r.recipe}`];
  for (const c of r.run) lines.push(`RUN: ${c}`);
  for (const n of r.notes) lines.push(`NOTE: ${n}`);
  for (const s of r.say ?? []) lines.push(`SAY${r.sayIf ? ` (${r.sayIf})` : ''}: ${s}`);
  const say = r.say?.length ? ` Put the SAY line${r.say.length > 1 ? 's' : ''} in your final reply, word for word${r.sayIf ? `, ${r.sayIf}` : ''}.` : '';
  lines.push(r.run.length
    ? r.recipe === 'ask-the-system'
      ? `NEXT: run the command above and answer from what it prints, with the names exactly as written there.${say}`
      : `NEXT: run ${r.run.length > 1 ? 'these commands' : 'the command'} above, relay its SUMMARY as it is, and follow its NEXT line.${say}`
    : `NEXT: answer from the recipe below (and the reference it points to), quoting its exact words for settings and formats; run nothing.${say}`);
  const recipe = (recipeText ?? '').trimEnd();
  if (maxRecipe != null && recipe.length > maxRecipe) lines.push('', `--- recipe ${r.recipe}: read it with ${cmd} --recipe ${r.recipe} before you follow a step it has ---`);
  else lines.push('', `--- recipe ${r.recipe} (${cmd} --recipe ${r.recipe}) ---`, recipe);
  return lines.join('\n');
}
