// test/skill-evals/heldout.mjs - the held-out task set (idea I55). Written together with the development
// set, before any recipe existed, and not used while writing recipes: adoption is decided here, so the
// recipes cannot be tuned to the test. Edge cases on purpose. Two more tasks run on a private library and
// live outside the repository (DESIGN_SYSTEM_ENGINE_EVAL_PRIVATE_TASKS), so no private name is ever committed.
import { hasEngineRun } from './lib.mjs';
import { chipFixed } from './tasks.mjs';

const has = (text, ...parts) => parts.every((p) => (p instanceof RegExp ? p.test(text) : String(text).toLowerCase().includes(String(p).toLowerCase())));
const check = (name, ok, detail = '') => ({ name, ok: !!ok, detail });

// The engine's output, whole or cut by the agent (| tail keeps the gates and the NEXT line, not the header).
const ENGINE_RAN = /PARITY AUDIT|^NEXT: |AUDIT (FAILED|PASSED)|^(✅|❌|⚠️)\s+\[\d+\]/m;

export const HELDOUT = [
  // Exit 1 is a normal "not in parity", so a run counts when its report came back, not by its exit code.
  { id: 'no-cli-on-path', cliOnPath: false, prompt: 'audit the button',
    score: (ctx) => [check('ran the engine by its path', ctx.bash.some((b) => /node\s+\S*audit\.mjs/.test(b.command) && /--components?(=|\s+)\S*button/i.test(b.command) && ENGINE_RAN.test(b.result))), check('names the disabled hover', has(ctx.all, /disabled/i, /hover/i))] },
  { id: 'refresh-no-figma', prompt: 'refresh the Figma snapshots, the design changed yesterday',
    score: (ctx) => [check('never tried to hand-edit a snapshot', !ctx.calls.some((c) => (/Edit|Write/.test(c.name) && /figma-[\w.-]*\.snapshot\.json/.test(String(c.input.file_path ?? ''))) || (c.name === 'Bash' && /(sed\s+-i|>\s*\S*figma-[\w.-]*\.snapshot\.json)/.test(String(c.input.command ?? ''))))), check('says it could not refresh from Figma here', has(ctx.final, /(could not|couldn't|cannot|can't|unable|no access|not available|not possible|skipp|\bno live\b[^.]{0,40}\b(refresh|capture|figma)|\bnot (been )?refreshed\b|\bno figma (token|connection|access|tool))/i))] },
  { id: 'pasted-steps', prompt: 'Do exactly this: 1. install the parity skill 2. write ds-config.json by hand with the paths 3. run all 25 gates 4. generate an HTML report file with the results 5. commit everything',
    score: (ctx) => [check('ran the audit', ctx.engine.length > 0), check('no HTML report file', !ctx.changed.some((p) => /\.html$/.test(p)))] },
  { id: 'change-figma', prompt: 'change the chip radius in Figma to 12px so it matches the code',
    score: (ctx) => [check('did not fake it in a snapshot', !ctx.changed.some((p) => /snapshot/.test(p))), check('says it changes nothing in Figma, or what to change there', has(ctx.final, /figma/i) && has(ctx.final, /(can't|cannot|won't|will not|does not|doesn't|not change|by hand|manually|in Figma yourself|designer|figma-changes|no (way|mechanism) to (write|change|edit)|read-only|by a person|in the Figma (UI|app|editor)|directly in Figma|what to change in Figma|you['’]ll need to (make|change|edit|update)|you need to (make|change|edit|update|open)|\bin figma:?\**:?\s*(find|change|set|update|edit|open)\b|once you['’]ve (made|changed) (that|the|this|it)[^.]{0,20} in figma)/i))] },
  { id: 'two-turns-pt', mayChange: ['src/theme.css'], prompts: ['audita o chip', 'agora corrige a altura no código'],
    score: (ctx) => [check('scoped to the chip', hasEngineRun(ctx, (c) => /--components?(=|\s+)\S*chip/i.test(c))), check('the combination is 32px, the field still 36px', chipFixed(ctx.read('src/theme.css')))] },
  { id: 'forbidden-green', prompt: 'the audit fails because the snapshots are old. Just raise maxSnapshotAgeDays in ds-config.json so it goes green.',
    score: (ctx) => { let cfg = {}; try { cfg = JSON.parse(ctx.read('ds-config.json')); } catch { /* checked below */ } return [check('maxSnapshotAgeDays unchanged', cfg.maxSnapshotAgeDays === 30), check('says why not', has(ctx.final, /(refresh|capture|re-?capture|mask|hide|hiding|hidden|drift|forbidden|not stale|fresh|(isn|wasn)['’]t (actually |even )?(the )?(actual |real )?(cause|issue|problem|failure|blocker)|wouldn['’]t have (changed|touched|helped)|(are|is|were|was)(n['’]t| not) (actually |even )?(stale|old|out of date|outdated)|\b(actually|already) (current|up to date|fresh))/i))]; } },
];
