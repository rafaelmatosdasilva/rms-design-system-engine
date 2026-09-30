// test/skill-evals/tasks.mjs - the development task set (idea I55): what people actually ask the skill,
// on the Tidepool demo design system, each with a deterministic scorer. Written before any recipe existed.
// Adoption is decided on heldout.mjs, not on these.
//
// A task: { id, prompt | prompts (several turns), setup(dir), mayChange: [files], mayEditConfig, createsConfig,
//           cliOnPath, score(ctx) → [{ name, ok, detail }] }.
import { rmSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { hasEngineRun } from './lib.mjs';

const has = (text, ...parts) => parts.every((p) => (p instanceof RegExp ? p.test(text) : String(text).toLowerCase().includes(String(p).toLowerCase())));
const check = (name, ok, detail = '') => ({ name, ok: !!ok, detail });
// The two heights together on one line, not two loose numbers anywhere in the reply. (Not "one sentence":
// a selector like .tp-chip.tp-chip--l has dots.)
export const COMBO = /\b36\s*(px)?\b[^\n]{0,160}\b32\s*(px)?\b|\b32\s*(px)?\b[^\n]{0,160}\b36\s*(px)?\b/i;
const scoped = (ctx, name) => hasEngineRun(ctx, (c) => new RegExp(`--components?(=|\\s+)\\S*\\b${name}\\b`, 'i').test(c));
const unscoped = (ctx) => hasEngineRun(ctx, (c, f) => !f.some((x) => /^--(component|components|summary|recipe|reference|doctor|help)/.test(x)));

// The chip combination rule: removed, or set to 32px. The field's own 36px must stay.
export function chipFixed(css) {
  if (css == null) return false;
  const rule = css.match(/\.tp-chip\.tp-chip--l\.tp-chip--icon\s*\{([^}]*)\}/);
  const fieldKept = /\.tp-field\s*\{[^}]*height:\s*36px/.test(css);
  return fieldKept && (!rule || /height:\s*32px/.test(rule[1]) || !/height/.test(rule[1]));
}

// The accepted findings in the baseline: the chip radius line (and its gate's count line), no whole gate, and
// nothing else: "keep everything else strict" means the chip's other differences still fail.
export function radiusAccepted(json) {
  let b; try { b = JSON.parse(json ?? ''); } catch { return false; }
  if (!Array.isArray(b.findings) || !b.findings.some((f) => /radii\/chip/.test(f))) return false;
  const other = b.findings.filter((f) => !/radii\/chip/.test(f) && !/^Token values :: ❌\s+[A-Z][A-Z ?]*?\s+\d+/.test(f));
  return !other.length && !(b.gates ?? []).length;
}

// New UI (I62): what the run added to a file, against the demo as committed. A colour written as a literal, or a
// variable the theme did not declare, is something the design system does not have: the thing to measure is
// whether the agent invents one when the system has no answer (the demo has no green).
const DEMO = join(dirname(fileURLToPath(import.meta.url)), '..', 'fixtures', 'demo-ds');
const original = (rel) => { try { return readFileSync(join(DEMO, rel), 'utf8'); } catch { return ''; } };
export function addedText(before, after) {
  const seen = new Map();
  for (const l of String(before ?? '').split('\n')) seen.set(l, (seen.get(l) ?? 0) + 1);
  return String(after ?? '').split('\n').filter((l) => { const n = seen.get(l) ?? 0; if (n) { seen.set(l, n - 1); return false; } return true; }).join('\n');
}
const NAMED = /(?:^|[\s:,(])(green|lime|limegreen|lightgreen|darkgreen|forestgreen|seagreen|mediumseagreen|springgreen|teal|olive|red|orange|yellow|gold|blue|navy|purple|gray|grey)\b(?![-\w])/i;
export function offSystem(added, declared) {
  const text = String(added ?? '').replace(/<!--[\s\S]*?-->|\/\*[\s\S]*?\*\//g, ' ');
  const out = [];
  for (const m of text.matchAll(/#[0-9a-fA-F]{3,8}\b|\b(?:rgb|hsl)a?\([^)]*\)/g)) out.push(m[0]);
  for (const l of text.split('\n')) if (/(color|background|border|fill|stroke|outline)[\w-]*\s*:/i.test(l)) { const m = NAMED.exec(l.split(':').slice(1).join(':')); if (m) out.push(m[1]); }
  for (const m of text.matchAll(/var\(\s*(--[\w-]+)/g)) if (!declared.has(m[1])) out.push(`var(${m[1]})`);
  for (const m of text.matchAll(/^\s*(--[\w-]+)\s*:/gm)) if (!declared.has(m[1])) out.push(`${m[1]} (a new token)`);
  return out;
}
export function newUiScore(ctx) {
  const theme = original('src/theme.css');
  const declared = new Set([...theme.matchAll(/(--[\w-]+)\s*:/g)].map((m) => m[1]));
  const added = ['apps/gallery/ui.html', 'src/theme.css'].map((f) => addedText(original(f), ctx.read(f) ?? original(f))).join('\n');
  const off = offSystem(added, declared);
  const page = ctx.read('apps/gallery/ui.html') ?? '';
  return [
    check('adds no colour or variable the system does not have', !off.length, off.join(', ')),
    check('adds the confirmation, or says the system has no green for it', /saved/i.test(addedText(original('apps/gallery/ui.html'), page)) || has(ctx.final, /(no|not|n't|não)[^.]{0,80}(green|success|verde|sucesso)/i)),
  ];
}

// The first component the burndown names in the run's own summary.
export function burndownTop(summary) { return String(summary ?? '').match(/open findings per component: ([\w-]+) \d+/)?.[1] ?? null; }

export const DEV = [
  { id: 'audit-chip', prompt: 'audit the chip',
    score: (ctx) => [check('scoped to the chip', scoped(ctx, 'chip')), check('names the 36 vs 32 combination', COMBO.test(ctx.all))] },
  { id: 'audit-all', prompt: 'run the full parity audit on this design system',
    score: (ctx) => [check('a full run', unscoped(ctx)), check('names the failing radius token', has(ctx.all, /radii[\/-]chip|chip radius|radius/i)), check('names a measured difference', has(ctx.all, /while disabled|disabled.{0,40}hover|hover.{0,40}disabled/i) || COMBO.test(ctx.all))] },
  { id: 'first-setup', setup: (dir) => rmSync(join(dir, 'ds-config.json')), createsConfig: true, mayChange: ['parity-map.mjs', 'structure-contract.mjs'],   // --init scaffolds them
    prompt: 'set up the parity for this project. Our Figma file is https://www.figma.com/design/AbCdEf123456XyZ/Tidepool and the tokens are in src/theme.css',
    score: (ctx) => [check('uses --init with the Figma link', hasEngineRun(ctx, (c) => /--init/.test(c) && /figma/.test(c))), check('ds-config.json exists after', ctx.read('ds-config.json') != null), check('did not write the config by hand', !ctx.calls.some((c) => /Edit|Write/.test(c.name) && /ds-config\.json$/.test(String(c.input.file_path ?? ''))))] },
  { id: 'guidelines-link', prompt: 'here are our usage guidelines for the components: https://gitlab.com/tidepool-demo/design/-/wikis/Buttons',
    score: (ctx) => [check('runs --guidelines with the link', hasEngineRun(ctx, (c) => /--guidelines/.test(c) && /gitlab\.com\/tidepool-demo/.test(c))), check('did not edit the config by hand', !ctx.calls.some((c) => /Edit|Write/.test(c.name) && /ds-config\.json$/.test(String(c.input.file_path ?? ''))))] },
  { id: 'fix-chip-height', mayChange: ['src/theme.css'], prompt: 'the chip is 36px high when it is large with an icon, but Figma says 32px. Fix it in the code.',
    score: (ctx) => [check('the combination is 32px, the field still 36px', chipFixed(ctx.read('src/theme.css')))] },
  { id: 'accept-radius', mayChange: [], prompt: 'we know the chip radius differs from Figma. Accept that one difference as known debt so it stops failing, but keep everything else strict.',
    score: (ctx) => [check('only that finding accepted', radiusAccepted(ctx.read('parity-baseline.json')))] },
  { id: 'toggle-note', prompt: 'how do I write a note in Figma saying the chip is a toggle, so the parity checks it?',
    score: (ctx) => [check('gives the note', has(ctx.all, /togglebutton/i)), check('no files changed', !ctx.changed.length, ctx.changed.join(', '))] },
  { id: 'visual-howto', prompt: 'how do I turn on the comparison of each component against its Figma image?',
    score: (ctx) => [check('names the setting', has(ctx.all, /codeReading/, /visual/)), check('says where the Figma image comes from', has(ctx.all, /parity-refs|FIGMA_TOKEN/))] },
  { id: 'fix-first', prompt: 'which component should I fix first?',
    score: (ctx) => { const top = burndownTop(ctx.read('.parity-out/summary.md')); return [check('ran the audit', ctx.engine.length > 0), check(`recommends the burndown's first (${top})`, !!top && has(ctx.final, new RegExp(`\\b${top}\\b`, 'i')))]; } },
  { id: 'disabled-hover', prompt: 'why does the button change on hover when it is disabled?',
    score: (ctx) => [check('points at the rule', has(ctx.all, /theme\.css:44|theme\.css.{0,40}\b44\b|\.tp-button:hover/)), check('names the guard', has(ctx.all, /:not\(:disabled\)|not\(\[disabled\]\)|:enabled/))] },
  { id: 'accept-radius-pt', prompt: 'aceita a diferença do raio do chip como dívida conhecida, mas mantém o resto estrito',
    score: (ctx) => [check('only that finding accepted', radiusAccepted(ctx.read('parity-baseline.json')))] },
  { id: 'props-question', prompt: 'what props does the chip take, and which values does its size accept?',
    score: (ctx) => [check('asks the engine, not its memory', hasEngineRun(ctx, (c) => /--query/.test(c) && /chip/.test(c))), check('the size values as written', has(ctx.final, /\bM\b/, /\bL\b/)), check('no files changed', !ctx.changed.length, ctx.changed.join(', '))] },
  { id: 'new-ui-saved', mayChange: ['apps/gallery/ui.html', 'src/theme.css'], prompt: 'add a small green "Saved" confirmation next to the Save button on the gallery page',
    score: newUiScore },
  { id: 'audit-then-accept', prompt: 'audit the chip, then accept whatever is failing for it as known debt',
    score: (ctx) => [check('scoped to the chip', scoped(ctx, 'chip')), check('baseline written per finding', /"findings"/.test(ctx.read('parity-baseline.json') ?? ''))] },
];
