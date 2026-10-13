// figma-capture.mjs - Figma's variables, text styles and effect styles read in chunks the engine checks (P6), by the
// Figma tool of the agent's session or by figma-cli (P7), and turned into the vars snapshot here with the capture
// recipe's own scripts.
//
// Through the Figma tool every answer is capped (about 20 kB), and copying each value into the snapshot by hand takes
// hours on a large file. So the engine writes a read-only script for one chunk (--capture-script vars N). Each answer
// carries a checksum computed in Figma over what it holds and the checksums of every chunk; the agent saves it as it
// came. --capture-import verifies each saved answer against its checksum, says which chunks are missing or changed,
// and once all are there builds the snapshot locally: it runs the recipe's own scripts (cookbook/refresh-figma.md,
// Steps 1a, 1b-single, 1b-motion-effects and 1f) on what Figma returned, so the result is the one a capture through
// the Figma tool gives. On a refresh only the checksums are asked (--capture-script vars sums) and only the chunks
// that changed are read again. figma-cli runs the same scripts itself (`figma-cli eval`), so both readers give the
// same snapshot.
//
// A chunk's boundaries follow its items (a boundary after an item whose id hashes to it, or when the next item would
// pass the budget), so a variable added or changed moves only the chunk it is in. Chunks are matched by checksum, not
// by number: a chunk saved before under another number is used as it is.
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, statSync, unlinkSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { OUT_DIR } from './names.mjs';
import { buildStamp, mayWrite } from './stamp.mjs';

const ENGINE = dirname(fileURLToPath(import.meta.url));
export const BUDGET = 14000;   // bytes of items per answer: under the Figma tool's 20,480 and figma-cli's 20,000, with room for the rest
export const captureDir = (ROOT) => join(ROOT, OUT_DIR, 'figma-capture');

// cyrb53: the same 53-bit hash in Figma and here (a checksum, not a secret). → 14 hex digits.
export const HASH_SRC = `function cyrb53(str){let h1=0xdeadbeef,h2=0x41c6ce57;for(let i=0;i<str.length;i++){const ch=str.charCodeAt(i);h1=Math.imul(h1^ch,2654435761);h2=Math.imul(h2^ch,1597334677);}h1=Math.imul(h1^(h1>>>16),2246822507)^Math.imul(h2^(h2>>>13),3266489909);h2=Math.imul(h2^(h2>>>16),2246822507)^Math.imul(h1^(h1>>>13),3266489909);return (4294967296*(2097151&h2)+(h1>>>0)).toString(16).padStart(14,'0');}`;
// eslint-disable-next-line no-new-func
export const cyrb53 = new Function(`${HASH_SRC}; return cyrb53;`)();

// The script for chunk N ('sums' for the checksums alone), to run unchanged in Figma. Read only.
export function varsScript(chunk = 0, budget = BUDGET) {
  const which = chunk === 'sums' ? "'sums'" : String(Number(chunk) || 0);
  return `// rms-design-system-engine: Figma's variables, text styles and effect styles, chunk ${chunk === 'sums' ? 'checksums' : chunk}. Read only: it changes nothing in Figma.
const CHUNK=${which}, BUDGET=${budget};
${HASH_SRC}
const bytes=(s)=>{let n=0;for(let i=0;i<s.length;i++){const c=s.charCodeAt(i);n+=c<0x80?1:c<0x800?2:(c>=0xd800&&c<0xdc00)?(i++,4):3;}return n;};
const collections=await figma.variables.getLocalVariableCollectionsAsync();
const idToVar={},order=[];
for(const c of collections)for(const id of c.variableIds){const v=await figma.variables.getVariableByIdAsync(id);if(v&&!idToVar[id]){idToVar[id]=v;order.push(id);}}
// Every alias target the file does not hold (a library's variable), so a token that points at one resolves.
const tried={};for(let added=1;added;){added=0;for(const id of [...order]){for(const val of Object.values(idToVar[id].valuesByMode)){const a=val&&val.type==='VARIABLE_ALIAS'?val:val&&val.color&&val.color.type==='VARIABLE_ALIAS'?val.color:null;if(!a||idToVar[a.id]||tried[a.id])continue;tried[a.id]=1;const t=await figma.variables.getVariableByIdAsync(a.id);if(t){idToVar[a.id]=t;order.push(a.id);added++;}}}}
const items=[];
for(const c of collections)items.push({k:'collection',id:c.id,v:{id:c.id,name:c.name,modes:c.modes.map(m=>({modeId:m.modeId,name:m.name}))}});
for(const id of order){const v=idToVar[id];items.push({k:'var',id,v:{id:v.id,name:v.name,resolvedType:v.resolvedType,variableCollectionId:v.variableCollectionId,valuesByMode:v.valuesByMode,scopes:[...(v.scopes||[])],description:v.description||'',remote:!!v.remote}});}
for(const st of await figma.getLocalTextStylesAsync())items.push({k:'text',id:st.id,v:{id:st.id,name:st.name,fontSize:st.fontSize,fontName:st.fontName,lineHeight:st.lineHeight,letterSpacing:st.letterSpacing,textCase:st.textCase,description:st.description||''}});
for(const st of await figma.getLocalEffectStylesAsync())items.push({k:'effect',id:st.id,v:{id:st.id,name:st.name,effects:st.effects}});
// Chunks: a boundary after an item whose id hashes to it, or before an item that would pass the budget.
const chunks=[];let cur=[],size=0;
for(const it of items){const s=JSON.stringify(it),b=bytes(s)+1;if(cur.length&&size+b>BUDGET){chunks.push(cur);cur=[];size=0;}cur.push(it);size+=b;if(parseInt(cyrb53(it.id).slice(-2),16)%24===0){chunks.push(cur);cur=[];size=0;}}
if(cur.length)chunks.push(cur);
const sums=chunks.map(c=>cyrb53(JSON.stringify(c)));
if(CHUNK==='sums')return {capture:'vars',of:chunks.length,sums};
if(CHUNK>=chunks.length)return {capture:'vars',chunk:CHUNK,of:chunks.length,sums,error:'no such chunk'};
return {capture:'vars',chunk:CHUNK,of:chunks.length,sums,sum:sums[CHUNK],items:chunks[CHUNK]};
`;
}

// A saved answer: the tool's text as it came (a JSON object, or the JSON inside the text the tool wrapped it in).
export function parseAnswer(text) {
  const t = String(text).trim();
  try { return JSON.parse(t); } catch { /* wrapped */ }
  const a = t.indexOf('{'), b = t.lastIndexOf('}');
  if (a >= 0 && b > a) { try { return JSON.parse(t.slice(a, b + 1)); } catch { /* not JSON */ } }
  return null;
}

// The saved answers of a capture in dir. → { sums (the latest list), of, chunks: Map(sum → items), bad: [file: why],
// missing: [chunk numbers to read again], stale: [files no longer in the list] }
export function readCapture(dir, kind = 'vars') {
  const out = { sums: null, of: 0, chunks: new Map(), bad: [], missing: [], stale: [], files: new Map() };
  if (!existsSync(dir)) return out;
  let latest = -Infinity;
  for (const f of readdirSync(dir).filter((x) => x.startsWith(`${kind}-`) && x.endsWith('.json'))) {
    const p = join(dir, f), a = parseAnswer(readFileSync(p, 'utf8'));
    if (!a || a.capture !== kind) { out.bad.push(`${f}: not an answer of the ${kind} capture script`); continue; }
    if (a.error) { out.bad.push(`${f}: ${a.error}`); continue; }
    const at = statSync(p).mtimeMs;
    if (Array.isArray(a.sums) && at > latest) { latest = at; out.sums = a.sums; out.of = a.of; }
    if (!Array.isArray(a.items)) continue;
    const sum = cyrb53(JSON.stringify(a.items));
    if (sum !== a.sum) { out.bad.push(`${f}: its checksum does not match what it holds (changed or cut while it was saved)`); continue; }
    out.chunks.set(sum, a.items); out.files.set(sum, f);
  }
  if (out.sums) {
    out.missing = out.sums.map((s, i) => (out.chunks.has(s) ? null : i)).filter((i) => i != null);
    out.stale = [...out.files].filter(([s]) => !out.sums.includes(s)).map(([, f]) => f);
  }
  return out;
}

// A Figma stand-in made of what the chunks hold, for the recipe's scripts to run on.
export function standInFigma(items) {
  const cols = [], byCol = new Map(), vars = {}, texts = [], effects = [];
  for (const it of items) if (it.k === 'collection') { const c = { ...it.v, variableIds: [] }; cols.push(c); byCol.set(c.id, c); }
  for (const it of items) {
    if (it.k === 'var') { vars[it.v.id] = it.v; const c = byCol.get(it.v.variableCollectionId); if (c && !it.v.remote) c.variableIds.push(it.v.id); }
    else if (it.k === 'text') texts.push(it.v);
    else if (it.k === 'effect') effects.push(it.v);
  }
  const local = () => cols.flatMap((c) => c.variableIds.map((id) => vars[id]));
  return {
    variables: {
      getLocalVariableCollectionsAsync: async () => cols,
      getVariableByIdAsync: async (id) => vars[id] ?? null,
      getVariableCollectionByIdAsync: async (id) => byCol.get(id) ?? null,
      getLocalVariablesAsync: async () => local(),
    },
    getLocalTextStylesAsync: async () => texts,
    getLocalEffectStylesAsync: async () => effects,
  };
}

// The recipe's own scripts, as use_figma runs them, with ds-config.json's values filled in where the recipe says to.
const FENCE = '`'.repeat(3);
export function recipeScripts(engineDir = ENGINE) {
  const md = readFileSync(join(engineDir, 'cookbook', 'refresh-figma.md'), 'utf8');
  const after = (heading) => md.split(heading)[1].split(FENCE + 'js\n')[1].split(FENCE)[0];
  const blocks = [...md.matchAll(new RegExp(FENCE + 'js\\n([\\s\\S]*?)' + FENCE, 'g'))].map((m) => m[1]);
  return {
    probe: after('### Step 1a - Probe'),
    single: after('### Step 1b-single'),
    motion: blocks.find((b) => b.includes('MOTION_COLLECTION')),
    scopes: after('### Step 1f - Variable scopes'),
  };
}
const q = (v) => (v == null ? 'null' : JSON.stringify(v));
function fill(script, cfg, collectionNames) {
  const f = cfg.figma ?? {};
  const motion = f.motionCollection ?? collectionNames.find((n) => /motion|animation/i.test(n)) ?? null;
  const subs = [
    [/(let|const)\s+COLOR_COLLECTION\s*=\s*'[^']*'/, (m, k) => `${k} COLOR_COLLECTION=${q(f.colorCollection ?? 'Theme')}`],
    [/const\s+SIZING_COLLECTION\s*=\s*'[^']*'/, () => `const SIZING_COLLECTION=${q(f.sizingCollection ?? null)}`],
    [/const\s+PRIMITIVE_PREFIX\s*=\s*'[^']*'/, () => `const PRIMITIVE_PREFIX=${q(f.primitivePrefix ?? 'primitives/')}`],
    [/let\s+MODES\s*=\s*\[[^\]]*\]/, () => `let MODES=${JSON.stringify((f.modes ?? []).map((m) => ({ name: m.name, snapshotKey: m.snapshotKey })))}`],
    [/const\s+COLLECTIONS\s*=\s*\[\]/, () => `const COLLECTIONS=${JSON.stringify(f.collections ?? [])}`],
    [/const\s+MOTION_COLLECTION\s*=\s*'[^']*'/, () => `const MOTION_COLLECTION=${q(motion ?? '\u0000none')}`],
    [/const\s+BATCH_START\s*=\s*0,\s*BATCH_END\s*=\s*\d+/, () => 'const BATCH_START=0, BATCH_END=1e9'],
  ];
  let s = script;
  for (const [re, to] of subs) s = s.replace(re, to);
  return s;
}
const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor;
export async function runRecipe(script, figma) { return new AsyncFunction('figma', script)(figma); }

// The vars snapshot from the chunks' items, with the recipe's scripts. → the snapshot's keys (no stamp, no _updated).
export async function varsFromItems(items, cfg = {}, { engineDir = ENGINE } = {}) {
  const S = recipeScripts(engineDir);
  const names = items.filter((i) => i.k === 'collection').map((i) => i.v.name);
  const run = (k) => runRecipe(fill(S[k], cfg, names), standInFigma(items));
  const hasColour = items.some((i) => i.k === 'var' && i.v.resolvedType === 'COLOR' && !i.v.remote);
  const single = hasColour ? await run('single') : {};
  const probe = hasColour ? await run('probe') : { brokenAliases: [] };
  const motion = await run('motion');
  const scopes = await run('scopes');
  // Each variable's own description (tokenMeta), as the recipe asks: @deprecated in it marks the token deprecated.
  const tokenMeta = {};
  for (const i of items) if (i.k === 'var' && !i.v.remote && String(i.v.description ?? '').trim()) tokenMeta[i.v.name] = { description: i.v.description.trim(), deprecated: /@deprecated/i.test(i.v.description) };
  return {
    ...single,
    brokenAliases: probe.brokenAliases ?? [],
    ...(Object.keys(motion.motion ?? {}).length ? { motion: motion.motion } : {}),
    ...(Object.keys(motion.effects ?? {}).length ? { effects: motion.effects } : {}),
    variableScopes: scopes.scopes ?? {},
    ...(Object.keys(tokenMeta).length ? { tokenMeta } : {}),
  };
}

// --capture-import: verify the saved answers; when every chunk is there, write the vars snapshot.
// → { ok, missing, bad, stale, path?, counts?, kept? }
// figmaVersion: the file's version, when the API gives it (FIGMA_TOKEN), read after the capture as Step 5 says.
export async function importCapture(ROOT, cfg = {}, { dir = captureDir(ROOT), source = 'the Figma tool', now = new Date().toISOString(), engineDir = ENGINE, figmaVersion = null } = {}) {
  const c = readCapture(dir, 'vars');
  const base = { missing: c.missing, bad: c.bad, stale: c.stale, of: c.of };
  if (!c.sums) return { ok: false, ...base, missing: [0], why: 'no answer saved yet' };
  if (c.missing.length) return { ok: false, ...base };
  const items = c.sums.flatMap((s) => c.chunks.get(s));
  const built = await varsFromItems(items, cfg, { engineDir });
  const path = cfg.paths?.snapshotVars ?? 'src/figma-vars.snapshot.json';
  let prev = {}; try { prev = JSON.parse(readFileSync(join(ROOT, path), 'utf8')); } catch { /* first capture */ }
  // The recipe keeps the text styles already there when Figma returned none.
  if (!Object.keys(built.typography ?? {}).length && prev.typography) built.typography = prev.typography;
  const stamp = buildStamp(ROOT, { engineDir, figma: figmaVersion, figmaRead: now });
  const snap = { ...prev, _updated: now, _source: `${source}, read in ${c.sums.length} checked chunk${c.sums.length === 1 ? '' : 's'}`, ...built, _built: stamp };
  // The file's version is the one the API gives after this capture, or none: an older one would claim a freshness
  // this capture did not check.
  if (figmaVersion) snap._figmaVersion = figmaVersion; else delete snap._figmaVersion;
  const may = mayWrite(join(ROOT, path), stamp, { ROOT, engineDir, label: path });
  if (!may.ok) return { ok: false, ...base, kept: may.line };
  mkdirSync(dirname(join(ROOT, path)), { recursive: true });
  writeFileSync(join(ROOT, path), JSON.stringify(snap, null, 2) + '\n');
  for (const f of c.stale) { try { unlinkSync(join(dir, f)); } catch { /* left */ } }
  const colours = Object.values(snap.color ?? {}).reduce((n, m) => n + Object.keys(m ?? {}).length, 0);
  return { ok: true, ...base, path, counts: { chunks: c.sums.length, colours, modes: Object.keys(snap.color ?? {}).length, sizing: Object.keys(snap.sizing ?? {}).length, textStyles: Object.keys(snap.typography ?? {}).length, scopes: Object.keys(snap.variableScopes ?? {}).length } };
}

// figma-cli reads the same chunks itself: the checksums first, then each chunk not saved yet (P7).
// run(code) → the text figma-cli printed (or a promise of it). → importCapture's result.
export async function captureWithFigmaCli(ROOT, cfg = {}, { run = figmaCliEval(ROOT), dir = captureDir(ROOT), engineDir = ENGINE, figmaVersion = null } = {}) {
  mkdirSync(dir, { recursive: true });
  const sums = parseAnswer(await run(varsScript('sums')));
  if (!sums?.sums) throw new Error('figma-cli did not return the checksums (is Figma Desktop open on the design system\'s file?)');
  writeFileSync(join(dir, 'vars-sums.json'), JSON.stringify(sums) + '\n');
  for (const n of readCapture(dir, 'vars').missing) {
    const text = await run(varsScript(n));
    const a = parseAnswer(text);
    if (!a?.items) throw new Error(`figma-cli did not return chunk ${n}: ${String(text).trim().split('\n').slice(-1)[0]}`);
    writeFileSync(join(dir, `vars-${n}.json`), text.trim() + '\n');
  }
  return importCapture(ROOT, cfg, { dir, source: 'figma-cli', engineDir, figmaVersion });
}
export function figmaCliEval(ROOT) {
  return (code) => {
    const file = join(tmpdir(), `rms-capture-${process.pid}-${Date.now()}.js`);
    writeFileSync(file, code);
    try {
      const r = spawnSync('figma-cli', ['eval', '--file', file], { cwd: ROOT, encoding: 'utf8', timeout: 120000 });
      if (r.error || r.status !== 0) throw new Error(`figma-cli eval did not finish: ${(r.error?.message ?? r.stderr ?? '').trim().split('\n').slice(-1)[0] || `exit ${r.status}`}`);
      return r.stdout;
    } finally { try { unlinkSync(file); } catch { /* gone */ } }
  };
}

// What --capture-import says. r: importCapture's result; dir relative to the project.
export function importLines(r, rel) {
  const lines = [];
  for (const b of r.bad ?? []) lines.push(`❌ ${b}`);
  if (r.kept) { lines.push(r.kept); return lines; }
  if (!r.ok) {
    const left = r.missing ?? [];
    lines.push(r.why === 'no answer saved yet' ? `No answer saved in ${rel} yet.` : `${left.length} of ${r.of} chunk${r.of === 1 ? '' : 's'} still to read: ${left.join(', ')}.`);
    lines.push(`NEXT: for each, run rms-design-system-engine --capture-script vars <chunk>, run the script it writes unchanged with the Figma tool (use_figma), save its answer as it came to ${rel}/vars-<chunk>.json, then run rms-design-system-engine --capture-import again.`);
    return lines;
  }
  const n = r.counts;
  lines.push(`✓ Figma's variables read in ${n.chunks} checked chunk${n.chunks === 1 ? '' : 's'}: ${n.colours} colours in ${n.modes} mode${n.modes === 1 ? '' : 's'}, ${n.sizing} sizes, ${n.textStyles} text styles, the scopes of ${n.scopes} variables → ${r.path}`);
  return lines;
}
