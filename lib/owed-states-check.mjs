// owed-states-check.mjs - part of Gate 14 (All states are built): the states the team's intent layer says a component
// must have, held against Figma and the code (owed-states.mjs).
// Run from project root: node lib/owed-states-check.mjs
//
// Advisory: the team's page says what is owed, and a side that lacks it is told so on every run, with the page it
// comes from; it never fails the gate. Nothing to check, and it says so, when no page names a component's required
// states.
//
// Exit 0 always (advisory); 1 only when ds-config.json cannot be read.
import { readFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { readIntentLayer, matchComponents, codeFilesOf } from './intent-layer.mjs';
import { owedOf, figmaStatesOf, codeStatesOf, missingOwed, stateWord } from './owed-states.mjs';
import { codeSnapshotPath } from './names.mjs';

const ROOT = process.cwd();
let cfg = {};
try { cfg = JSON.parse(readFileSync(join(ROOT, 'ds-config.json'), 'utf8')); } catch { console.error('❌ ds-config.json not found at project root.'); process.exit(1); }
const read = (p) => { try { return readFileSync(resolve(ROOT, p), 'utf8'); } catch { return ''; } };
const json = (p) => { try { return JSON.parse(read(p)); } catch { return null; } };

const IL = readIntentLayer(ROOT, cfg);
const props = json(cfg.paths?.compPropsSnapshot ?? 'src/figma-component-props.snapshot.json') ?? {};
const codeFiles = codeFilesOf(ROOT, cfg);
const names = [...new Set([...Object.keys(props).filter((n) => !n.startsWith('_')), ...Object.keys(codeFiles)])];
const matched = IL ? matchComponents(names, IL.entities, codeFiles) : new Map();
const owing = [...matched].map(([name, e]) => ({ name, e, ...owedOf(e.owedStates ?? []) })).filter((x) => x.owed.length || x.unread.length);
if (!owing.length) {
  console.log(`⏭  owed states: ${IL ? 'no intent page names the states a component must have (a "Required states" section)' : 'no intent layer read'} - nothing to check`);
  process.exit(0);
}

const api = json(codeSnapshotPath(cfg))?.api ?? {};
const css = [cfg.paths?.themeCSS ?? 'src/theme.css', ...(cfg.paths?.pluginCSS ?? [])].flat().map(read).join('\n');
// The styles that name a component: every rule whose selector has its class.
const stylesOf = (name) => css.split('}').filter((r) => new RegExp(`\\.${name.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase()}(?![\\w-])|\\.${name}(?![\\w-])`).test(r.split('{')[0] ?? '')).join('}\n');

const OK = [], MISSING = [], UNREAD = [];
for (const { name, e, owed, unread } of owing) {
  const figma = props[name] ? figmaStatesOf(props[name].properties ?? {}, cfg) : null;
  const file = codeFiles[name];
  const code = file && existsSync(resolve(ROOT, file)) ? codeStatesOf({ text: read(file), css: stylesOf(name), props: Object.keys(api[name]?.props ?? {}) }) : null;
  const miss = missingOwed({ owed, figma, code });
  const page = e.file ? ` (${e.file})` : '';
  for (const s of owed) if (!miss.some((m) => m.state === s)) OK.push(`${name}: ${stateWord(s)}`);
  // One line a component and state: the sides that lack it.
  for (const s of owed) {
    const sides = miss.filter((m) => m.state === s).map((m) => m.side);
    if (sides.length) MISSING.push(`${name} owes the ${stateWord(s)} state, as its page says${page}: ${sides.map((x) => (x === 'Figma' ? `Figma has no ${stateWord(s)} variant or property` : `the code has nothing for it (no prop, attribute or style)`)).join('; ')}`);
  }
  for (const u of unread) UNREAD.push(`${name}: "${u}" is no state the engine can check${page}`);
}

console.log(`\n✅ OWED      ${OK.length}   (a state the intent layer says a component must have, on every side)`);
console.log(`⚠️  MISSING   ${MISSING.length}   (a required state one side lacks - advisory)`);
if (UNREAD.length) console.log(`⚠️  UNREAD    ${UNREAD.length}   (a required state written in words the engine cannot read as one)`);
if (MISSING.length) { console.log('\n─── Required states one side lacks ──'); for (const l of MISSING) console.log(`  ⚠️ ${l}`); }
if (UNREAD.length) { console.log('\n─── Required states the engine cannot read ──'); for (const l of UNREAD) console.log(`  ⚠️ ${l}`); }
process.exit(0);
