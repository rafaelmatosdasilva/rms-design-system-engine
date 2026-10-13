// figma-capture.mjs - Figma read in chunks the engine checks (P6), by the Figma tool of the agent's session or by
// figma-cli (P7): the variables, text styles and effect styles, turned into the vars snapshot here with the capture
// recipe's own scripts; and the components, whose structure and props are put together in Figma with the recipe's
// own Step 1c functions and merged here into the structure and props snapshots.
//
// Through the Figma tool every answer is capped (about 20 kB), and copying each value into the snapshot by hand takes
// hours on a large file. So the engine writes a read-only script for one chunk (--capture-script vars N, or
// components N). Each answer carries a checksum computed in Figma over what it holds; the agent saves it as it came.
// --capture-import verifies each saved answer against its checksum, says which chunks are missing or changed, and
// once all are there writes the snapshots. For the variables it runs the recipe's own scripts (cookbook/refresh-figma.md,
// Steps 1a, 1b-single, 1b-motion-effects and 1f) on what Figma returned, so the result is the one a capture through
// the Figma tool gives. On a refresh only the checksums are asked (--capture-script vars sums, components sums) and
// only the chunks that changed are read again. figma-cli runs the same scripts itself (`figma-cli eval`), so both
// readers give the same snapshots.
//
// A chunk's boundaries follow its items (a boundary after an item whose id hashes to it, or when the next item would
// pass the budget), so a variable or a component added or changed moves only the chunk it is in. Chunks are matched
// by checksum, not by number: a chunk saved before under another number is used as it is.
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
  const out = { sums: null, of: 0, plan: null, chunks: new Map(), bad: [], missing: [], stale: [], changed: [], files: new Map() };
  if (!existsSync(dir)) return out;
  let latest = -Infinity;
  const read = new Map();   // sum → { chunk, at }
  for (const f of readdirSync(dir).filter((x) => x.startsWith(`${kind}-`) && x.endsWith('.json'))) {
    const p = join(dir, f), a = parseAnswer(readFileSync(p, 'utf8'));
    if (!a || a.capture !== kind) { out.bad.push(`${f}: not an answer of the ${kind} capture script`); continue; }
    if (a.error) { out.bad.push(`${f}: ${a.error}`); continue; }
    const at = statSync(p).mtimeMs;
    if (Array.isArray(a.sums) && at > latest) { latest = at; out.sums = a.sums; out.of = a.of; out.plan = a.plan ?? null; }
    if (!Array.isArray(a.items)) continue;
    const sum = cyrb53(JSON.stringify(a.items));
    if (sum !== a.sum) { out.bad.push(`${f}: its checksum does not match what it holds (changed or cut while it was saved)`); continue; }
    out.chunks.set(sum, a.items); out.files.set(sum, f); read.set(sum, { chunk: a.chunk, at });
  }
  if (out.sums) {
    out.missing = out.sums.map((s, i) => (out.chunks.has(s) ? null : i)).filter((i) => i != null);
    out.stale = [...out.files].filter(([s]) => !out.sums.includes(s)).map(([, f]) => f);
    // A chunk read after the checksums that no longer matches them: Figma changed in between.
    out.changed = [...read].filter(([s, r]) => !out.sums.includes(s) && r.at >= latest && out.missing.includes(r.chunk)).map(([, r]) => r.chunk);
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
  const base = { kind: 'vars', missing: c.missing, bad: c.bad, stale: c.stale, changed: c.changed, of: c.of };
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

// ── Components (Step 1c): each component's structure and props, read in Figma with the recipe's own functions ──
// The facts are put together in Figma (the node trees are far too large to send), so each chunk script carries the
// recipe's functions unchanged. Items: { k: 'component' | 'variant' | 'props', id, v }, a component's variants and props
// as items of their own, so a large component set can span two chunks. A chunk boundary falls after a component whose
// id hashes to it, or before an item that would pass the budget. The checksums' answer also gives each chunk's plan
// (its components, first and last item), so a chunk script reads only its own components.
export const COMPONENT_FUNCTIONS = ['parseAxes', 'restingOf', 'deepHasStroke', 'getBoundPaddingVar', 'childFrames', 'deepFacts', 'paintFacts', 'componentFacts', 'propsFacts'];
// The keys componentFacts writes, and propsFacts: an older snapshot's other keys are kept, these are replaced.
export const STRUCTURE_KEYS = ['nodeId', 'h', 'paddingVar', 'gapVar', 'fontSizeVar', 'fontWeightVar', 'fillStructure', 'innerRadiusVar', 'strokeOnDefault', 'strokeOnAnyState',
  'sizingV', 'layout', 'slot', 'minH', 'iconSize', 'childFramePadding', 'childFrameGaps', 'variantStroke', 'variantHeight', 'restingState', 'restingStroke', 'variantOpacity',
  'box', 'paddingPx', 'radiusPx', 'gapPx', 'colors', 'inFlow', 'stroke', 'opacity', 'text', 'toggles', 'defaultVariant', 'variants', 'slots', 'fillOpacity', 'variantFillOpacity', 'drawnOn', 'fills'];
export const PROPS_KEYS = ['nodeId', 'properties', 'annotations', 'layerAnnotations', 'description'];

// The source of each named function in the recipe's code blocks (cookbook/refresh-figma.md).
export function recipeFunctions(engineDir = ENGINE, names = COMPONENT_FUNCTIONS) {
  const md = readFileSync(join(engineDir, 'cookbook', 'refresh-figma.md'), 'utf8');
  const code = [...md.matchAll(new RegExp(FENCE + 'js\\n([\\s\\S]*?)' + FENCE, 'g'))].map((m) => m[1]).join('\n');
  return names.map((name) => {
    const m = new RegExp(`^(async )?function ${name}\\(`, 'm').exec(code);
    if (!m) throw new Error(`cookbook/refresh-figma.md has no function ${name}`);
    let i = code.indexOf('{', code.indexOf(')', m.index)), depth = 0;
    for (; i < code.length; i++) { if (code[i] === '{') depth++; else if (code[i] === '}' && --depth === 0) break; }
    return code.slice(m.index, i + 1);
  });
}

// The script for chunk N ('sums' for the checksums alone), to run unchanged in Figma. Read only.
// pages: the pages to read (ds-config.json figma.componentsPage), null for every page. plan: the chunk's plan from
// the checksums' answer ({ roots, from, to, of }); without one the script reads every component.
export function componentsScript(chunk = 0, { budget = BUDGET, pages = null, plan = null, engineDir = ENGINE } = {}) {
  const which = chunk === 'sums' ? "'sums'" : String(Number(chunk) || 0);
  const ids = pages == null ? null : [pages].flat().filter(Boolean).map((id) => String(id).replace('-', ':'));
  return `// rms-design-system-engine: Figma's components (structure and props), ${chunk === 'sums' ? 'the checksums' : `chunk ${chunk}`}. Read only: it changes nothing in Figma.
// Each component is read with the capture recipe's own functions (cookbook/refresh-figma.md, Step 1c).
const CHUNK=${which}, BUDGET=${budget}, PAGE_IDS=${JSON.stringify(ids && ids.length ? ids : null)}, PLAN=${JSON.stringify(chunk === 'sums' ? null : plan)};
${HASH_SRC}
const bytes=(s)=>{let n=0;for(let i=0;i<s.length;i++){const c=s.charCodeAt(i);n+=c<0x80?1:c<0x800?2:(c>=0xd800&&c<0xdc00)?(i++,4):3;}return n;};
${recipeFunctions(engineDir).join('\n')}
const idToVar={};
for(const v of await figma.variables.getLocalVariablesAsync())idToVar[v.id]=v;
// The page each component is on is loaded once (the current page when there is only one).
const pageOf=(x)=>{while(x&&x.type!=='PAGE')x=x.parent;return x;};
const load=async(pages)=>{const ps=[...new Set(pages.filter(Boolean))];if(ps.length===1&&ps[0]!==figma.currentPage)await figma.setCurrentPageAsync(ps[0]);else for(const p of ps)if(p!==figma.currentPage&&typeof p.loadAsync==='function')await p.loadAsync();};
let roots;
if(PLAN){roots=(await Promise.all(PLAN.roots.map((id)=>figma.getNodeByIdAsync(id)))).filter(Boolean);await load(roots.map(pageOf));}
else if(PAGE_IDS){const pages=(await Promise.all(PAGE_IDS.map((id)=>figma.getNodeByIdAsync(id)))).filter((p)=>p&&p.type==='PAGE');await load(pages);
roots=pages.flatMap((p)=>p.findAllWithCriteria({types:['COMPONENT_SET','COMPONENT']}));}
else roots=figma.root.findAllWithCriteria({types:['COMPONENT_SET','COMPONENT']});
roots=roots.filter((x)=>x.type==='COMPONENT_SET'||!x.parent||x.parent.type!=='COMPONENT_SET');
// A name starting with _ or . is private to the file, not part of the system.
roots=roots.filter((r)=>!/^[_.]/.test(r.name));
let items=[];
for(const r of roots){
  const {variants,...entry}=await componentFacts(r,idToVar);
  items.push({k:'component',id:r.id,v:{name:r.name,...entry}});
  for(const [name,g] of Object.entries(variants||{}))items.push({k:'variant',id:r.id+'|'+name,v:{of:r.id,name,...g}});
  const p=propsFacts(r);
  if(p)items.push({k:'props',id:r.id+'#props',v:{name:r.name,...p}});
}
// What JSON keeps (no symbol, no undefined), so the checksum is over what the answer carries.
items=JSON.parse(JSON.stringify(items));
const rootOf=(it)=>it.k==='component'?it.id:it.k==='variant'?it.v.of:it.id.replace(/#props$/,'');
if(PLAN){const a=items.findIndex((it)=>it.id===PLAN.from),b=items.findIndex((it)=>it.id===PLAN.to);
if(a<0||b<a)return {capture:'components',chunk:CHUNK,of:PLAN.of,error:'Figma changed after the checksums were read: read them again'};
const mine=items.slice(a,b+1);return {capture:'components',chunk:CHUNK,of:PLAN.of,sum:cyrb53(JSON.stringify(mine)),items:mine};}
const chunks=[];let cur=[],size=0;
for(let i=0;i<items.length;i++){const it=items[i],b=bytes(JSON.stringify(it))+1;if(cur.length&&size+b>BUDGET){chunks.push(cur);cur=[];size=0;}cur.push(it);size+=b;
const r=rootOf(it),next=items[i+1];if((!next||rootOf(next)!==r)&&parseInt(cyrb53(r).slice(-2),16)%8===0){chunks.push(cur);cur=[];size=0;}}
if(cur.length)chunks.push(cur);
const sums=chunks.map((c)=>cyrb53(JSON.stringify(c)));
const plan=chunks.map((c)=>({roots:[...new Set(c.map(rootOf))],from:c[0].id,to:c[c.length-1].id}));
if(CHUNK==='sums')return {capture:'components',of:chunks.length,sums,plan};
if(CHUNK>=chunks.length)return {capture:'components',chunk:CHUNK,of:chunks.length,sums,plan,error:'no such chunk'};
return {capture:'components',chunk:CHUNK,of:chunks.length,sums,plan,sum:sums[CHUNK],items:chunks[CHUNK]};
`;
}

// The script for a chunk with the plan of the checksums saved in dir, when there is one.
export function captureScript(kind, chunk, { dir, cfg = {}, engineDir = ENGINE } = {}) {
  if (kind === 'vars') return varsScript(chunk);
  const c = dir ? readCapture(dir, 'components') : null;
  const plan = chunk !== 'sums' && c?.plan?.[chunk] ? { ...c.plan[chunk], of: c.of } : null;
  return componentsScript(chunk, { pages: cfg.figma?.componentsPage ?? cfg.componentsPage ?? null, plan, engineDir });
}

// The structure and props entries from the chunks' items. → { structure, props, variants, dupes }
export function componentsFromItems(items) {
  const byId = new Map(), structure = {}, props = {}, dupes = [];
  let variants = 0;
  for (const it of items) {
    if (it.k !== 'component') continue;
    const { name, ...entry } = it.v;
    if (name in structure) { dupes.push(name); continue; }
    structure[name] = entry; byId.set(it.id, name);
  }
  for (const it of items) {
    const name = it.k === 'variant' ? byId.get(it.v.of) : it.k === 'props' ? byId.get(it.id.replace(/#props$/, '')) : null;
    if (!name) continue;
    if (it.k === 'variant') { const { of, name: vn, ...g } = it.v; (structure[name].variants ??= {})[vn] = g; variants++; }
    else { const { name: _n, ...p } = it.v; props[name] = p; }
  }
  return { structure, props, variants, dupes: [...new Set(dupes)] };
}

// --capture-import for the components: when every chunk is there, write the structure and props snapshots.
// Keys the capture does not read (set by other means) are kept; a component no longer in Figma is taken out.
export async function importComponents(ROOT, cfg = {}, { dir = captureDir(ROOT), source = 'the Figma tool', now = new Date().toISOString(), engineDir = ENGINE, figmaVersion = null } = {}) {
  const c = readCapture(dir, 'components');
  const base = { kind: 'components', missing: c.missing, bad: c.bad, stale: c.stale, changed: c.changed, of: c.of };
  if (!c.sums) return { ok: false, ...base, missing: ['sums'], why: 'no answer saved yet' };
  if (c.missing.length) return { ok: false, ...base };
  const items = c.sums.flatMap((s) => c.chunks.get(s));
  const got = componentsFromItems(items);
  const paths = { structure: cfg.paths?.snapshotStructure ?? 'src/figma-structure.snapshot.json', props: cfg.paths?.compPropsSnapshot ?? 'src/figma-component-props.snapshot.json' };
  const read = (p) => { try { return JSON.parse(readFileSync(join(ROOT, p), 'utf8')); } catch { return {}; } };
  const prevS = read(paths.structure), prevP = read(paths.props);
  const keep = (old, keys) => Object.fromEntries(Object.entries(old ?? {}).filter(([k]) => !keys.includes(k)));
  const components = {};
  for (const [name, e] of Object.entries(got.structure)) components[name] = { ...e, ...keep(prevS.components?.[name], STRUCTURE_KEYS) };
  const removed = Object.keys(prevS.components ?? {}).filter((k) => !(k in components));
  const how = `${source}, read in ${c.sums.length} checked chunk${c.sums.length === 1 ? '' : 's'} with the capture recipe's Step 1c functions`;
  const stamp = buildStamp(ROOT, { engineDir, figma: figmaVersion, figmaRead: now });
  const structure = { ...prevS, _updated: now, _note: prevS._note ?? 'Each component\'s structure as Figma draws it, read with the capture recipe\'s Step 1c functions (cookbook/refresh-figma.md). Do not edit by hand.', _source: how, components, _built: stamp };
  const props = Object.fromEntries(Object.entries(prevP).filter(([k]) => k.startsWith('_')));
  for (const [name, p] of Object.entries(got.props)) props[name] = { ...p, ...keep(prevP[name], PROPS_KEYS) };
  Object.assign(props, { _updated: now, _source: how, _built: stamp });
  const kept = [], written = [];
  for (const [k, snap] of [['structure', structure], ['props', props]]) {
    const may = mayWrite(join(ROOT, paths[k]), stamp, { ROOT, engineDir, label: paths[k] });
    if (!may.ok) { kept.push(may.line); continue; }
    mkdirSync(dirname(join(ROOT, paths[k])), { recursive: true });
    writeFileSync(join(ROOT, paths[k]), JSON.stringify(snap, null, 2) + '\n');
    written.push(paths[k]);
  }
  if (!written.length) return { ok: false, ...base, kept: kept.join('\n') };
  for (const f of c.stale) { try { unlinkSync(join(dir, f)); } catch { /* left */ } }
  return { ok: true, ...base, paths, written, removed, dupes: got.dupes, ...(kept.length ? { kept: kept.join('\n') } : {}),
    counts: { chunks: c.sums.length, components: Object.keys(components).length, variants: got.variants, props: Object.keys(got.props).length } };
}

// figma-cli reads the same chunks itself: the checksums first, then each chunk not saved yet (P7).
// run(code) → the text figma-cli printed (or a promise of it). kind: vars or components. → the import's result.
export async function captureWithFigmaCli(ROOT, cfg = {}, { run = figmaCliEval(ROOT), dir = captureDir(ROOT), engineDir = ENGINE, figmaVersion = null, kind = 'vars' } = {}) {
  mkdirSync(dir, { recursive: true });
  const script = (chunk) => captureScript(kind, chunk, { dir, cfg, engineDir });
  const sums = parseAnswer(await run(script('sums')));
  if (!sums?.sums) throw new Error('figma-cli did not return the checksums (is Figma Desktop open on the design system\'s file?)');
  writeFileSync(join(dir, `${kind}-sums.json`), JSON.stringify(sums) + '\n');
  for (const n of readCapture(dir, kind).missing) {
    const text = await run(script(n));
    const a = parseAnswer(text);
    if (!a?.items) throw new Error(`figma-cli did not return chunk ${n}: ${a?.error ?? String(text).trim().split('\n').slice(-1)[0]}`);
    writeFileSync(join(dir, `${kind}-${n}.json`), text.trim() + '\n');
  }
  const opts = { dir, source: 'figma-cli', engineDir, figmaVersion };
  return kind === 'vars' ? importCapture(ROOT, cfg, opts) : importComponents(ROOT, cfg, opts);
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

// What --capture-import says. r: importCapture's or importComponents' result; dir relative to the project.
export function importLines(r, rel) {
  const kind = r.kind ?? 'vars', lines = [];
  for (const b of r.bad ?? []) lines.push(`❌ ${b}`);
  if (r.kept && !r.ok) { lines.push(r.kept); return lines; }
  if (!r.ok) {
    const left = r.missing ?? [];
    if (r.changed?.length) lines.push(`Figma changed after the checksums were read (chunk ${r.changed.join(', ')}).`);
    const what = kind === 'components' ? 'component ' : '';
    lines.push(r.why === 'no answer saved yet' ? `No ${what}answer saved in ${rel} yet.` : `${left.length} of ${r.of} ${what}chunk${r.of === 1 ? '' : 's'} still to read: ${left.join(', ')}.`);
    if (r.changed?.length) lines.push(`NEXT: run rms-design-system-engine --capture-script ${kind} sums, run the script it writes unchanged with the Figma tool (use_figma), save its answer as it came to ${rel}/${kind}-sums.json, then read each chunk --capture-import names.`);
    else if (kind === 'components' && r.why === 'no answer saved yet') lines.push(`NEXT: run rms-design-system-engine --capture-script components sums, run the script it writes unchanged with the Figma tool (use_figma), save its answer as it came to ${rel}/components-sums.json, then run rms-design-system-engine --capture-import again.`);
    else lines.push(`NEXT: for each, run rms-design-system-engine --capture-script ${kind} <chunk>, run the script it writes unchanged with the Figma tool (use_figma), save its answer as it came to ${rel}/${kind}-<chunk>.json, then run rms-design-system-engine --capture-import again.`);
    return lines;
  }
  const n = r.counts;
  if (kind === 'vars') lines.push(`✓ Figma's variables read in ${n.chunks} checked chunk${n.chunks === 1 ? '' : 's'}: ${n.colours} colours in ${n.modes} mode${n.modes === 1 ? '' : 's'}, ${n.sizing} sizes, ${n.textStyles} text styles, the scopes of ${n.scopes} variables → ${r.path}`);
  else {
    lines.push(`✓ Figma's components read in ${n.chunks} checked chunk${n.chunks === 1 ? '' : 's'}: ${n.components} component${n.components === 1 ? '' : 's'} with ${n.variants} variants, the props of ${n.props} → ${r.written.join(', ')}`);
    if (r.removed?.length) lines.push(`Taken out, no longer in Figma: ${r.removed.join(', ')}.`);
    if (r.dupes?.length) lines.push(`⚠️  Two components share a name, the first one is kept: ${r.dupes.join(', ')}. Rename one in Figma.`);
    if (r.kept) lines.push(r.kept);
  }
  return lines;
}
