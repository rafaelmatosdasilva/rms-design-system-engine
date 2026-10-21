// figma-capture.mjs - Figma read in chunks the engine checks, by the Figma tool of the agent's session or by
// figma-cli: the variables, text styles and effect styles, turned into the vars snapshot here with the capture
// recipe's own scripts; and the components, put together in Figma with the recipes' own functions and merged here into
// the five files the gates read about them (structure, props, raw values, state tokens, state bindings).
//
// Through the Figma tool every answer is capped (20,480 bytes), and copying each value into the snapshot by hand takes
// hours on a large file. So the engine writes a read-only script for one chunk (--capture-script vars N, or
// components N). Each answer carries a checksum computed in Figma over what it holds; the agent saves it as it came.
// --capture-import verifies each saved answer against its checksum, says which chunks are missing or changed, and
// once all are there writes the snapshots. For the variables it runs the recipe's own scripts (cookbook/refresh-figma.md,
// Steps 1a, 1b-single, 1b-motion-effects and 1f) on what Figma returned, so the result is the one a capture through
// the Figma tool gives. On a refresh only the checksums are asked (--capture-script vars sums, components sums) and
// only the chunks that changed are read again. figma-cli runs the same scripts itself (`figma-cli eval`), so both
// readers give the same snapshots. No script switches Figma's page: each loads the pages it reads where they are.
//
// Every answer passes through the agent twice (read from Figma, then saved as it came), so each one is compact and
// near the cap: a variable is a short positional record, a colour its hex, a 32-bit float the shortest decimal that
// reads back to it, and a component's facts carry each string once. Here they are decoded back into what Figma holds,
// so the recipes' functions run on the same objects and the snapshots are the ones the full form gives. Answers saved
// in the form before (an `items` list) still read.
//
// The variables' chunk boundaries follow their items (a boundary after an item whose id hashes to it, or, when the
// next item would pass the budget, after the last item in the chunk whose id hashes to a weaker one), so a variable
// added or changed moves only the chunk it is in. Chunks are matched by checksum, not by number: a chunk saved before
// under another number is used as it is. The components are kept by component id throughout (below).
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, statSync, unlinkSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { inflateRawSync } from 'node:zlib';
import { OUT_DIR } from './names.mjs';
import { buildStamp, mayWrite } from './stamp.mjs';

const ENGINE = dirname(fileURLToPath(import.meta.url));
// Bytes of one chunk's payload. With the answer's wrapper an answer stays near 19,000 bytes, under the Figma tool's
// 20,480 and figma-cli's 20,000.
export const BUDGET = 18600;
export const captureDir = (ROOT) => join(ROOT, OUT_DIR, 'figma-capture');
// The variables' boundaries: after an item whose id hashes to STRONG, or, when the chunk is full, after the last one
// whose id hashes to WEAK (once the chunk is half full).
export const STRONG = 1024, WEAK = 16;

// cyrb53: the same 53-bit hash in Figma and here (a checksum, not a secret). → 14 hex digits.
export const HASH_SRC = `function cyrb53(str){let h1=0xdeadbeef,h2=0x41c6ce57;for(let i=0;i<str.length;i++){const ch=str.charCodeAt(i);h1=Math.imul(h1^ch,2654435761);h2=Math.imul(h2^ch,1597334677);}h1=Math.imul(h1^(h1>>>16),2246822507)^Math.imul(h2^(h2>>>13),3266489909);h2=Math.imul(h2^(h2>>>16),2246822507)^Math.imul(h1^(h1>>>13),3266489909);return (4294967296*(2097151&h2)+(h1>>>0)).toString(16).padStart(14,'0');}`;
// eslint-disable-next-line no-new-func
export const cyrb53 = new Function(`${HASH_SRC}; return cyrb53;`)();
const BYTES_SRC = 'const bytes=(s)=>{let n=0;for(let i=0;i<s.length;i++){const c=s.charCodeAt(i);n+=c<0x80?1:c<0x800?2:(c>=0xd800&&c<0xdc00)?(i++,4):3;}return n;};';

// The compact form, the same in Figma and here. N: a number Figma stores as a 32-bit float (1.2000000476837158) travels
// as '~' and the shortest decimal that reads back to it ('~1.2'); E: N throughout a value, a string that starts with ~
// given one more; sid: a variable's id without 'VariableID:' (one without it starts with =).
export const CODEC_SRC = `const N=(x)=>{if(typeof x!=='number'||Number.isInteger(x)||Math.fround(x)!==x)return x;for(let p=1;p<10;p++){const y=+x.toPrecision(p);if(y===x)return x;if(Math.fround(y)===x)return '~'+y;}return x;};
const E=(x)=>typeof x==='number'?N(x):typeof x==='string'?(x[0]==='~'?'~'+x:x):Array.isArray(x)?x.map(E):x&&typeof x==='object'?Object.fromEntries(Object.entries(x).map(([k,v])=>[k,E(v)])):x;
const sid=(id)=>String(id).startsWith('VariableID:')?String(id).slice(11):'='+id;`;
// eslint-disable-next-line no-new-func
export const { E: encodeValue } = new Function(`${CODEC_SRC}; return { E };`)();
// What E wrote, back.
export function decodeValue(x) {
  if (typeof x === 'string') return x[0] !== '~' ? x : x[1] === '~' ? x.slice(1) : Math.fround(Number(x.slice(1)));
  if (Array.isArray(x)) return x.map(decodeValue);
  if (x && typeof x === 'object') return Object.fromEntries(Object.entries(x).map(([k, v]) => [k, decodeValue(v)]));
  return x;
}
const fullId = (s) => (String(s).startsWith('=') ? String(s).slice(1) : `VariableID:${s}`);
// A variable's scopes travel as their place here (0 alone: every scope).
export const SCOPES = ['ALL_SCOPES', 'TEXT_CONTENT', 'CORNER_RADIUS', 'WIDTH_HEIGHT', 'GAP', 'ALL_FILLS', 'FRAME_FILL', 'SHAPE_FILL', 'TEXT_FILL', 'STROKE_COLOR', 'STROKE_FLOAT',
  'EFFECT_FLOAT', 'EFFECT_COLOR', 'OPACITY', 'FONT_FAMILY', 'FONT_STYLE', 'FONT_WEIGHT', 'FONT_SIZE', 'LINE_HEIGHT', 'LETTER_SPACING', 'PARAGRAPH_SPACING', 'PARAGRAPH_INDENT', 'FONT_VARIATIONS', 'TRANSFORM'];
const TYPES = ['COLOR', 'FLOAT', 'STRING', 'BOOLEAN'];

// The script for chunk N ('sums' for the checksums alone), to run unchanged in Figma. Read only.
// A chunk is d = { c: collections, v: variables, t: text styles, e: effect styles } (a kind it has none of left out):
// - collection: [id, name, [[modeId, name], …]]
// - variable: [id (sid), characters its name shares with the variable before it in the chunk, the rest of its name,
//   type (0 colour, 1 number, 2 string, 3 boolean; 4 more for a library's), its collection (its place, or its id when
//   the file does not hold it), values, scopes (left out: every scope), description (left out: none)]. values: one
//   value when every mode has it, else one per mode in the collection's order, else { m: [[mode (its place, or its
//   id), value], …] }. A value: a colour's hex (#rrggbb, with alpha below 1), { a: sid } an alias, { c, o } a colour
//   with its own opacity, { x } anything else, else the value (E).
// - text style: [id, name, fontSize, fontName, lineHeight, letterSpacing, paragraphSpacing, textCase,
//   boundVariables (each field's variable as a sid), description]; effect style: [id, name, effects].
export function varsScript(chunk = 0, budget = BUDGET) {
  const which = chunk === 'sums' ? "'sums'" : String(Number(chunk) || 0);
  return `// rms-design-system-engine: Figma's variables, text styles and effect styles, chunk ${chunk === 'sums' ? 'checksums' : chunk}. Read only: it changes nothing in Figma.
const CHUNK=${which}, BUDGET=${budget}, STRONG=${STRONG}, WEAK=${WEAK}, SC=${JSON.stringify(SCOPES)};
${HASH_SRC}
${BYTES_SRC}
${CODEC_SRC}
const collections=await figma.variables.getLocalVariableCollectionsAsync();
const idToVar={},order=[];
for(const c of collections)for(const id of c.variableIds){const v=await figma.variables.getVariableByIdAsync(id);if(v&&!idToVar[id]){idToVar[id]=v;order.push(id);}}
// Every variable a text style binds that the file does not hold (a library's), so a bound value resolves.
const textStyles=await figma.getLocalTextStylesAsync();
for(const st of textStyles)for(const a of Object.values(st.boundVariables||{}))for(const x of [].concat(a)){if(!x||!x.id||idToVar[x.id])continue;const t=await figma.variables.getVariableByIdAsync(x.id);if(t){idToVar[x.id]=t;order.push(x.id);}}
// Every alias target the file does not hold (a library's variable), so a token that points at one resolves.
const tried={};for(let added=1;added;){added=0;for(const id of [...order]){for(const val of Object.values(idToVar[id].valuesByMode)){const a=val&&val.type==='VARIABLE_ALIAS'?val:val&&val.color&&val.color.type==='VARIABLE_ALIAS'?val.color:null;if(!a||idToVar[a.id]||tried[a.id])continue;tried[a.id]=1;const t=await figma.variables.getVariableByIdAsync(a.id);if(t){idToVar[a.id]=t;order.push(a.id);added++;}}}}
// Compact records (figma-capture.mjs reads them back).
const T={COLOR:0,FLOAT:1,STRING:2,BOOLEAN:3},colAt=new Map(collections.map((c,i)=>[c.id,i]));
const unit=(x)=>typeof x==='number'&&x>=0&&x<=1;
const hex=(c)=>{const h=[c.r,c.g,c.b].map(x=>Math.round(x*255).toString(16).padStart(2,'0')).join('');const a=c.a===undefined?1:c.a;return '#'+h+(a>=1?'':Math.round(a*255).toString(16).padStart(2,'0'));};
const V=(x,t)=>{if(x==null)return null;if(typeof x!=='object')return E(x);const ks=Object.keys(x);
if(x.type==='VARIABLE_ALIAS'&&ks.length===2)return {a:sid(x.id)};
if(t==='COLOR'&&ks.every(k=>/^[rgba]$/.test(k)&&unit(x[k]))&&['r','g','b'].every(k=>k in x))return hex(x);
if(t==='COLOR'&&'color' in x&&ks.every(k=>k==='color'||k==='opacity'))return 'opacity' in x?{c:V(x.color,t),o:E(x.opacity)}:{c:V(x.color,t)};
return {x:E(x)};};
const vals=(v)=>{const c=collections[colAt.get(v.variableCollectionId)],ms=c?c.modes.map(m=>m.modeId):[],ks=Object.keys(v.valuesByMode),t=v.resolvedType;
if(c&&ks.length===ms.length&&ks.every((k,i)=>k===ms[i])){const e=ks.map(k=>V(v.valuesByMode[k],t)),j=e.map(x=>JSON.stringify(x));return j.every(x=>x===j[0])?e[0]:e;}
return {m:ks.map(k=>[ms.includes(k)?ms.indexOf(k):k,V(v.valuesByMode[k],t)])};};
const scopes=(s)=>s.length===1&&s[0]==='ALL_SCOPES'?0:s.map(x=>SC.includes(x)?SC.indexOf(x):x);
const BV=(x)=>x&&x.type==='VARIABLE_ALIAS'?sid(x.id):Array.isArray(x)?x.map(BV):{x:E(x)};
const items=[];
for(const c of collections)items.push({k:'c',id:c.id,r:()=>[c.id,c.name,c.modes.map(m=>[m.modeId,m.name])]});
for(const id of order){const v=idToVar[id];items.push({k:'v',id,name:v.name,r:(prev)=>{let s=0;const n=v.name;while(s<n.length&&s<prev.length&&n[s]===prev[s])s++;
const t=v.resolvedType in T?T[v.resolvedType]+(v.remote?4:0):(v.remote?'!':'')+v.resolvedType,c=colAt.has(v.variableCollectionId)?colAt.get(v.variableCollectionId):v.variableCollectionId;
const r=[sid(v.id),s,n.slice(s),t,c,vals(v)],sc=scopes([...(v.scopes||[])]),d=v.description||'';if(d)r.push(sc,d);else if(sc!==0)r.push(sc);return r;}});}
// A text style with the variables it binds (boundVariables: the field and the variable), its family in fontName.
for(const st of textStyles)items.push({k:'t',id:st.id,r:()=>{const r=[st.id,st.name,E(st.fontSize),E(st.fontName),E(st.lineHeight),E(st.letterSpacing),E(st.paragraphSpacing),E(st.textCase),Object.fromEntries(Object.entries(st.boundVariables||{}).map(([k,x])=>[k,BV(x)]))];if(st.description)r.push(st.description);return r;}});
for(const st of await figma.getLocalEffectStylesAsync())items.push({k:'e',id:st.id,r:()=>[st.id,st.name,E(st.effects)]});
// Chunks: a boundary after an item whose id hashes to STRONG; when the next item would pass the budget, after the last
// one that hashes to WEAK (in the chunk's second half), else before that item.
const hs=items.map(it=>parseInt(cyrb53(it.id).slice(-6),16)),chunks=[];
for(let i=0;i<items.length;){const recs=[];let size=32,prev='',cut=0,full=false,j=i;
for(;j<items.length;j++){const it=items[j],r=it.r(prev),b=bytes(JSON.stringify(r))+1;if(recs.length&&size+b>BUDGET){full=true;break;}
recs.push([it.k,r]);size+=b;if(it.k==='v')prev=it.name;if(hs[j]%STRONG===0){j++;break;}if(hs[j]%WEAK===0&&size>=BUDGET/2)cut=recs.length;}
if(full&&cut){recs.length=cut;j=i+cut;}
const d={};for(const [k,r] of recs)(d[k]=d[k]||[]).push(r);chunks.push(d);i=j;}
const sums=chunks.map(d=>cyrb53(JSON.stringify(d)));
if(CHUNK==='sums')return {capture:'vars',v:2,of:chunks.length,sums};
if(CHUNK>=chunks.length)return {capture:'vars',v:2,chunk:CHUNK,of:chunks.length,sums,error:'no such chunk'};
return {capture:'vars',v:2,chunk:CHUNK,of:chunks.length,sums,sum:sums[CHUNK],d:chunks[CHUNK]};
`;
}

// A value of a variable, back from its compact form. A hex colour is { r, g, b, a } (an alpha of ff below 1 reads
// back as 0.999, which the recipe's toHex writes as ff again).
function valueBack(x, type) {
  if (x == null) return null;
  if (typeof x === 'string' && type === 'COLOR') {
    const b = (i) => parseInt(x.slice(i, i + 2), 16) / 255;
    return { r: b(1), g: b(3), b: b(5), a: x.length > 7 ? (x.slice(7, 9) === 'ff' ? 0.999 : b(7)) : 1 };
  }
  if (typeof x === 'object' && !Array.isArray(x)) {
    if ('a' in x) return { type: 'VARIABLE_ALIAS', id: fullId(x.a) };
    if ('c' in x) return 'o' in x ? { color: valueBack(x.c, type), opacity: decodeValue(x.o) } : { color: valueBack(x.c, type) };
    if ('x' in x) return decodeValue(x.x);
  }
  return decodeValue(x);
}
const boundBack = (x) => (typeof x === 'string' ? { type: 'VARIABLE_ALIAS', id: fullId(x) } : Array.isArray(x) ? x.map(boundBack) : decodeValue(x?.x));
const defined = (o) => Object.fromEntries(Object.entries(o).filter(([, x]) => x != null));

// The chunks' records (in the order of the checksums), back as the items the recipe's scripts read: { k: 'collection'
// | 'var' | 'text' | 'effect', id, v } with v shaped as Figma's own (valuesByMode, boundVariables, effects).
export function varsItems(ds) {
  const cols = ds.flatMap((d) => d.c ?? []).map(([id, name, modes]) => ({ id, name, modes: modes.map(([modeId, n]) => ({ modeId, name: n })) }));
  const items = cols.map((c) => ({ k: 'collection', id: c.id, v: c }));
  for (const d of ds) {
    let prev = '';
    for (const [s, shared, rest, tc, cx, vals, sc = 0, description = ''] of d.v ?? []) {
      const name = prev.slice(0, shared) + rest; prev = name;
      const remote = typeof tc === 'number' ? tc >= 4 : String(tc).startsWith('!');
      const resolvedType = typeof tc === 'number' ? TYPES[tc % 4] : String(tc).replace(/^!/, '');
      const col = typeof cx === 'number' ? cols[cx] : null, ms = col ? col.modes.map((m) => m.modeId) : [];
      const valuesByMode = vals && typeof vals === 'object' && !Array.isArray(vals) && 'm' in vals
        ? Object.fromEntries(vals.m.map(([m, x]) => [typeof m === 'number' ? ms[m] : m, valueBack(x, resolvedType)]))
        : Object.fromEntries(ms.map((m, i) => [m, valueBack(Array.isArray(vals) ? vals[i] : vals, resolvedType)]));
      const id = fullId(s);
      items.push({ k: 'var', id, v: { id, name, resolvedType, variableCollectionId: col ? col.id : cx, valuesByMode, scopes: sc === 0 ? ['ALL_SCOPES'] : sc.map((x) => (typeof x === 'number' ? SCOPES[x] : x)), description, remote } });
    }
  }
  for (const d of ds) for (const [id, name, fontSize, fontName, lineHeight, letterSpacing, paragraphSpacing, textCase, bound, description = ''] of d.t ?? []) {
    const v = defined({ id, name, fontSize: decodeValue(fontSize), fontName: decodeValue(fontName), lineHeight: decodeValue(lineHeight), letterSpacing: decodeValue(letterSpacing), paragraphSpacing: decodeValue(paragraphSpacing), textCase: decodeValue(textCase) });
    items.push({ k: 'text', id, v: { ...v, boundVariables: Object.fromEntries(Object.entries(bound ?? {}).map(([k, x]) => [k, boundBack(x)])), description } });
  }
  for (const d of ds) for (const [id, name, effects] of d.e ?? []) items.push({ k: 'effect', id, v: { id, name, effects: decodeValue(effects) } });
  return items;
}

// A saved answer: the tool's text as it came (a JSON object, or the JSON inside the text the tool wrapped it in).
export function parseAnswer(text) {
  const t = String(text).trim();
  try { return JSON.parse(t); } catch { /* wrapped */ }
  const a = t.indexOf('{'), b = t.lastIndexOf('}');
  if (a >= 0 && b > a) { try { return JSON.parse(t.slice(a, b + 1)); } catch { /* not JSON */ } }
  return null;
}

// The saved answers of a capture in dir. → { sums (the latest list), of, chunks: Map(sum → the chunk's compact
// records d, or its items in the form before), bad: [file: why], missing: [chunk numbers to read again], stale: [files
// no longer in the list], older: [files in the form before that the latest checksums leave out] }
export function readCapture(dir, kind = 'vars') {
  const out = { sums: null, of: 0, v: 1, plan: null, chunks: new Map(), bad: [], missing: [], stale: [], changed: [], older: [], files: new Map() };
  if (!existsSync(dir)) return out;
  let latest = -Infinity;
  const read = new Map();   // sum → { chunk, at, v }
  for (const f of readdirSync(dir).filter((x) => x.startsWith(`${kind}-`) && x.endsWith('.json'))) {
    const p = join(dir, f), a = parseAnswer(readFileSync(p, 'utf8'));
    if (!a || a.capture !== kind) { out.bad.push(`${f}: not an answer of the ${kind} capture script`); continue; }
    if (a.error) { out.bad.push(`${f}: ${a.error}`); continue; }
    const at = statSync(p).mtimeMs;
    if (Array.isArray(a.sums) && at > latest) { latest = at; out.sums = a.sums; out.of = a.of; out.v = a.v ?? 1; out.plan = a.plan ?? null; }
    const body = a.d ?? a.items;
    if (!body || typeof body !== 'object') continue;
    const sum = cyrb53(JSON.stringify(body));
    if (sum !== a.sum) { out.bad.push(`${f}: its checksum does not match what it holds (changed or cut while it was saved)`); continue; }
    out.chunks.set(sum, body); out.files.set(sum, f); read.set(sum, { chunk: a.chunk, at, v: a.v ?? 1 });
  }
  if (out.sums) {
    out.missing = out.sums.map((s, i) => (out.chunks.has(s) ? null : i)).filter((i) => i != null);
    out.stale = [...out.files].filter(([s]) => !out.sums.includes(s)).map(([, f]) => f);
    out.older = [...out.files].filter(([s]) => !out.sums.includes(s) && read.get(s).v !== out.v).map(([, f]) => f);
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
  // The primitives as Figma has them in each colour mode (the ramp the tokens point at), each link followed.
  const primitives = primitivesFromItems(items, cfg);
  const figmaTokens = tokensFromItems(items);
  return {
    ...(figmaTokens.tokens.length ? { figmaTokens } : {}),
    ...single,
    ...(Object.values(primitives).some((m) => Object.keys(m).length) ? { primitives } : {}),
    brokenAliases: probe.brokenAliases ?? [],
    ...(Object.keys(motion.motion ?? {}).length ? { motion: motion.motion } : {}),
    ...(Object.keys(motion.effects ?? {}).length ? { effects: motion.effects } : {}),
    variableScopes: scopes.scopes ?? {},
    ...(Object.keys(tokenMeta).length ? { tokenMeta } : {}),
  };
}

// Every token as Figma keeps it, for the style guide's Tokens page: Figma's collections (each with its modes, in order),
// and each token's collection, kind, scopes, description, its value in each mode of its collection (an alias followed to
// the value it ends at) and, in a mode where it points at another token, that token's name. Nothing guessed.
// → { collections: [{ name, modes: [name] }], tokens: [{ name, collection, kind, scopes?, description?, values: { mode: value }, aliases?: { mode: name } }] }
// A motion value as CSS writes it: Figma's easing ({ easingFunctionCubicBezier: { x1, y1, x2, y2 } }, or the curve itself)
// as cubic-bezier(…), a timing (seconds) as milliseconds. Anything else: null.
export function motionValue(v, kind = null) {
  if (typeof v === 'number' && kind === 'TIMING') return Math.round(v * 1000) + 'ms';
  const b = v && typeof v === 'object' ? (v.easingFunctionCubicBezier ?? v.cubicBezier ?? v) : null;
  if (b && ['x1', 'y1', 'x2', 'y2'].every((k) => typeof b[k] === 'number')) return `cubic-bezier(${[b.x1, b.y1, b.x2, b.y2].map((n) => Math.round(n * 100) / 100).join(', ')})`;
  if (v && typeof v === 'object' && /LINEAR/i.test(v.type ?? '')) return 'linear';
  return null;
}
export function tokensFromItems(items = []) {
  const cols = items.filter((i) => i.k === 'collection').map((i) => i.v);
  const colById = new Map(cols.map((c) => [c.id, c]));
  const vars = items.filter((i) => i.k === 'var' && !i.v.remote).map((i) => i.v);
  const byId = new Map(items.filter((i) => i.k === 'var').map((i) => [i.v.id, i.v]));
  const hex = (c) => { const h = (n) => Math.round(Math.max(0, Math.min(1, n)) * 255).toString(16).padStart(2, '0'); return '#' + h(c.r) + h(c.g) + h(c.b) + (c.a != null && c.a < 0.995 ? h(c.a) : ''); };
  const shown = (v, kind, scopes) => {
    if (v == null) return null;
    if (kind === 'COLOR' && typeof v === 'object') return hex(v);
    // Motion: an easing as CSS writes it, a time in milliseconds (Figma keeps seconds).
    if (typeof v === 'object') return motionValue(v) ?? JSON.stringify(v);
    if (kind === 'TIMING' && typeof v === 'number') return motionValue(v, kind);
    if (kind === 'FLOAT' && typeof v === 'number') {
      const n = Math.round(v * 1000) / 1000;
      return (scopes ?? []).some((s) => /OPACITY/.test(s)) ? n + '%' : (scopes ?? []).some((s) => /FONT_WEIGHT|FONT_VARIATIONS/.test(s)) ? String(n) : n + 'px';
    }
    return String(v);
  };
  // A mode of the token's own collection by name, else its first: an alias into another collection reads it there.
  const modeOf = (c, name) => (c?.modes ?? []).find((m) => m.name === name) ?? (c?.modes ?? [])[0];
  const resolve = (v, modeName) => {
    let cur = v, alias = null;
    for (let step = 0; cur && step < 12; step++) {
      const m = modeOf(colById.get(cur.variableCollectionId), modeName); const x = m ? cur.valuesByMode?.[m.modeId] : undefined;
      if (x && typeof x === 'object' && x.type === 'VARIABLE_ALIAS') { const t = byId.get(x.id); if (step === 0) alias = t?.name ?? null; cur = t; continue; }
      return { value: shown(x, cur.resolvedType, cur.scopes), alias };
    }
    return { value: null, alias };
  };
  const tokens = vars.map((v) => {
    const c = colById.get(v.variableCollectionId), values = {}, aliases = {};
    for (const m of c?.modes ?? []) { const r = resolve(v, m.name); values[m.name] = r.value; if (r.alias) aliases[m.name] = r.alias; }
    return { name: v.name, collection: c?.name ?? null, kind: v.resolvedType, ...((v.scopes ?? []).length && !(v.scopes.length === 1 && v.scopes[0] === 'ALL_SCOPES') ? { scopes: v.scopes } : {}), ...(String(v.description ?? '').trim() ? { description: v.description.trim() } : {}), values, ...(Object.keys(aliases).length ? { aliases } : {}) };
  });
  return { collections: cols.map((c) => ({ name: c.name, modes: (c.modes ?? []).map((m) => m.name) })), tokens };
}

// items (the capture's variables and collections) → { snapshotKey: { 'primitives/…': '#rrggbb' } } for the colour
// collection's modes (ds-config.json figma.modes, by name), each primitive's value in that mode, its links followed (a
// link into a collection of one mode reads that mode).
export function primitivesFromItems(items = [], cfg = {}) {
  const prefix = cfg.figma?.primitivePrefix ?? 'primitives/';
  const cols = items.filter((i) => i.k === 'collection').map((i) => i.v), vars = new Map(items.filter((i) => i.k === 'var').map((i) => [i.v.id, i.v]));
  const colour = cols.find((c) => c.name === cfg.figma?.colorCollection) ?? cols.find((c) => (c.modes ?? []).length > 1 && [...vars.values()].some((v) => v.variableCollectionId === c.id && v.resolvedType === 'COLOR'));
  if (!colour) return {};
  const hex = (c) => '#' + [c.r, c.g, c.b].map((x) => Math.round(x * 255).toString(16).padStart(2, '0')).join('') + (c.a != null && c.a < 1 ? Math.round(c.a * 255).toString(16).padStart(2, '0') : '');
  const modes = (cfg.figma?.modes ?? []).length ? cfg.figma.modes : (colour.modes ?? []).map((m) => ({ name: m.name, snapshotKey: String(m.name).toLowerCase().replace(/[^a-z0-9]+/g, '-') }));
  const valueIn = (v, modeName, d = 0) => {
    if (!v || d > 10) return null;
    const col = cols.find((c) => c.id === v.variableCollectionId);
    const m = (col?.modes ?? []).find((x) => x.name === modeName) ?? (col?.modes ?? [])[0];
    const x = m ? v.valuesByMode?.[m.modeId] : Object.values(v.valuesByMode ?? {})[0];
    if (x && typeof x === 'object' && x.type === 'VARIABLE_ALIAS') return valueIn(vars.get(x.id), modeName, d + 1);
    return x && typeof x === 'object' && 'r' in x ? hex(x) : null;
  };
  const out = {};
  for (const m of modes) {
    if (!(colour.modes ?? []).some((x) => x.name === m.name)) continue;
    out[m.snapshotKey] = {};
    for (const v of vars.values()) if (v.variableCollectionId === colour.id && v.resolvedType === 'COLOR' && String(v.name).startsWith(prefix)) { const h = valueIn(v, m.name); if (h) out[m.snapshotKey][v.name] = h; }
  }
  return out;
}

// --capture-import: verify the saved answers; when every chunk is there, write the vars snapshot.
// → { ok, missing, bad, stale, path?, counts?, kept? }
// figmaVersion: the file's version, when the API gives it (FIGMA_TOKEN), read after the capture as Step 5 says.
export async function importCapture(ROOT, cfg = {}, { dir = captureDir(ROOT), source = 'the Figma tool', now = new Date().toISOString(), engineDir = ENGINE, figmaVersion = null } = {}) {
  const c = readCapture(dir, 'vars');
  const base = { kind: 'vars', missing: c.missing, bad: c.bad, stale: c.stale, changed: c.changed, older: c.older, of: c.of };
  if (!c.sums) return { ok: false, ...base, missing: [0], why: 'no answer saved yet' };
  if (c.missing.length) return { ok: false, ...base };
  // The compact records decoded back into what Figma holds; answers in the form before hold the items themselves.
  const parts = c.sums.map((s) => c.chunks.get(s));
  const items = parts.every(Array.isArray) ? parts.flat() : varsItems(parts.filter((p) => !Array.isArray(p)));
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

// ── Components: everything the gates need, read per component in Figma with the recipes' own functions ──
// The facts are put together in Figma (the node trees are far too large to send), so each script carries the recipes'
// functions unchanged: Step 1c of cookbook/refresh-figma.md (structure, every variant, props) and, from
// cookbook/full-audit.md, the raw-value sweep (component-values.snapshot.json) and the state walk
// (component-state-tokens.json, component-state-bindings.json). A component's items: { k: 'component' | 'variant' |
// 'props' | 'values' | 'states' | 'bindings', id, v }, its variants as items of their own; a part the Figma tool could
// not read is an item { v: { name, error } }, and the import keeps what that part held before.
//
// Everything is kept by component id, never by position, so a component added to the file mid-capture shifts no other:
// - the checksums: one per component, over its items, read in pages (--capture-script components sums), each one short
//   enough for the Figma tool, in the order of the components' id hash; a page says where the next one starts.
// - the reads (--capture-script components next, one at a time): each takes, in the file's order, the components whose
//   items no answer holds yet and answers as many as fit. Their items travel compressed: the JSON text, deflated (the
//   format zlib reads) and in base64, about a tenth of its size, since a component's facts repeat its token, layer and
//   variant names. A component larger than one answer comes in slices of that text.
// - the import matches each component's items to its checksum, in whichever answer they were saved.
// No script switches Figma's page (that is saved with the file and changes its version): each page is loaded where it is.
export const COMPONENT_FUNCTIONS = ['prop', 'parseAxes', 'restingVariant', 'restingOf', 'deepHasStroke', 'getBoundPaddingVar', 'childFrames', 'deepFacts', 'paintFacts', 'componentFacts', 'propsFacts'];
export const AUDIT_FUNCTIONS = ['stateTokensOf', 'getBindings', 'stateBindingsOf', 'collectRaw', 'hygieneOf'];
// The keys componentFacts writes, and propsFacts: an older snapshot's other keys are kept, these are replaced.
export const STRUCTURE_KEYS = ['nodeId', 'h', 'paddingVar', 'gapVar', 'fontSizeVar', 'fontWeightVar', 'fillStructure', 'innerRadiusVar', 'strokeOnDefault', 'strokeOnAnyState',
  'sizingV', 'layout', 'slot', 'minH', 'iconSize', 'childFramePadding', 'childFrameGaps', 'variantStroke', 'variantHeight', 'restingState', 'restingStroke', 'variantOpacity',
  'box', 'paddingPx', 'radiusPx', 'gapPx', 'colors', 'inFlow', 'stroke', 'opacity', 'text', 'toggles', 'defaultVariant', 'variants', 'slots', 'fillOpacity', 'variantFillOpacity', 'drawnOn', 'fills'];
export const PROPS_KEYS = ['nodeId', 'properties', 'annotations', 'layerAnnotations', 'description'];
export const TIME = 20000;   // ms a call spends reading components in Figma before it answers, well within the Figma tool's wait
export const ANSWER = 19000;   // bytes of one answer of the components, all of it
export const SCRIPT_MAX = 50000;   // characters the Figma tool takes in one script
const READ_IDS = 400;   // the components a read is offered, at most (each answer holds far fewer)
// The five files the components capture writes (the structure and props snapshots where ds-config.json puts them).
export const componentFiles = (cfg = {}) => ({ structure: cfg.paths?.snapshotStructure ?? 'src/figma-structure.snapshot.json', props: cfg.paths?.compPropsSnapshot ?? 'src/figma-component-props.snapshot.json',
  values: 'component-values.snapshot.json', states: 'component-state-tokens.json', bindings: 'component-state-bindings.json' });

// The source of each named function in the recipes' code blocks (cookbook/refresh-figma.md, cookbook/full-audit.md).
export function recipeFunctions(engineDir = ENGINE, names = [...COMPONENT_FUNCTIONS, ...AUDIT_FUNCTIONS]) {
  const code = ['refresh-figma.md', 'full-audit.md'].map((f) => readFileSync(join(engineDir, 'cookbook', f), 'utf8'))
    .flatMap((md) => [...md.matchAll(new RegExp(FENCE + 'js\\n([\\s\\S]*?)' + FENCE, 'g'))].map((m) => m[1])).join('\n');
  return names.map((name) => {
    const m = new RegExp(`^(async )?function ${name}\\(`, 'm').exec(code);
    if (!m) throw new Error(`the cookbook has no function ${name}`);
    let i = code.indexOf('{', code.indexOf(')', m.index)), depth = 0;
    for (; i < code.length; i++) { if (code[i] === '{') depth++; else if (code[i] === '}' && --depth === 0) break; }
    return code.slice(m.index, i + 1);
  });
}

// zip(text) → the text's UTF-8 bytes deflated (one block of fixed Huffman codes, LZ77 matches found through hash chains)
// and in base64: what zlib's inflateRaw reads back here.
export const ZIP_SRC = `const LB=[3,4,5,6,7,8,9,10,11,13,15,17,19,23,27,31,35,43,51,59,67,83,99,115,131,163,195,227,258],DB=[1,2,3,4,5,7,9,13,17,25,33,49,65,97,129,193,257,385,513,769,1025,1537,2049,3073,4097,6145,8193,12289,16385,24577];
function zip(s){const a=[];for(let i=0;i<s.length;i++){let c=s.charCodeAt(i);if(c<128)a.push(c);else if(c<2048)a.push(192|c>>6,128|c&63);else if(c>=0xd800&&c<0xdc00&&i+1<s.length){c=0x10000+((c-0xd800)<<10)+(s.charCodeAt(++i)-0xdc00);a.push(240|c>>18,128|c>>12&63,128|c>>6&63,128|c&63);}else a.push(224|c>>12,128|c>>6&63,128|c&63);}
const n=a.length,o=[],head=new Int32Array(32768).fill(-1),prev=new Int32Array(n);let bb=0,bn=0;
const put=(v,k)=>{bb|=v<<bn;bn+=k;while(bn>=8){o.push(bb&255);bb>>>=8;bn-=8;}};
const huff=(v,k)=>{let r=0;for(let i=0;i<k;i++){r=r<<1|v&1;v>>=1;}put(r,k);};
const sym=(c)=>c<144?huff(48+c,8):c<256?huff(256+c,9):c<280?huff(c-256,7):huff(c-88,8);
const hash=(i)=>(a[i]<<10^a[i+1]<<5^a[i+2])&32767,add=(i)=>{if(i+2<n){const k=hash(i);prev[i]=head[k];head[k]=i;}};
put(3,3);
for(let i=0;i<n;){let bl=0,bd=0;if(i+2<n)for(let j=head[hash(i)],c=0;j>=0&&i-j<=32768&&c<64;j=prev[j],c++){let l=0;while(l<258&&i+l<n&&a[j+l]===a[i+l])l++;if(l>bl){bl=l;bd=i-j;if(l===258)break;}}
if(bl<3){sym(a[i]);add(i);i++;continue;}
let c=0;while(LB[c+1]<=bl)c++;sym(257+c);put(bl-LB[c],c<8||c===28?0:(c-4)>>2);let d=0;while(DB[d+1]<=bd)d++;huff(d,5);put(bd-DB[d],d<4?0:(d-2)>>1);
for(let t=0;t<bl;t++)add(i+t);i+=bl;}
sym(256);if(bn)o.push(bb&255);
const B='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';let z='';
for(let i=0;i<o.length;i+=3){const v=o[i]<<16|(o[i+1]|0)<<8|(o[i+2]|0);z+=B[v>>18&63]+B[v>>12&63]+(i+1<o.length?B[v>>6&63]:'=')+(i+2<o.length?B[v&63]:'=');}
return z;}`;
// What zip wrote, back as text (whitespace the saving added is left out).
export const unzip = (z) => inflateRawSync(Buffer.from(String(z).replace(/\s+/g, ''), 'base64')).toString('utf8');
const zSum = (z) => cyrb53(String(z).replace(/\s+/g, ''));

// The script for one call, to run unchanged in Figma. Read only. call: 'sums' (a page of the checksums, from the key
// `after` on, in the pass `pass`) or 'read' (as many of the components `ids` as fit, in that order, or slice `slice` of
// the first one). pages: the pages to read (ds-config.json figma.componentsPage), null for every page.
export function componentsScript(call = 'sums', { budget = BUDGET, time = TIME, pages = null, pass = null, after = null, ids = [], slice = null, engineDir = ENGINE } = {}) {
  const pageIds = pages == null ? null : [pages].flat().filter(Boolean).map((id) => String(id).replace('-', ':'));
  const what = call === 'sums' ? `the checksums${after ? ', continued' : ''}` : slice != null ? `slice ${slice} of one component` : 'the next components';
  return `// rms-design-system-engine: Figma's components, ${what}. Read only: it changes nothing in Figma and never switches its page.
// Each component is read with the recipes' own functions (cookbook/refresh-figma.md Step 1c; cookbook/full-audit.md, the
// state walk and the raw-value sweep).
const CALL=${JSON.stringify(call)}, BUDGET=${budget}, ANSWER=${ANSWER}, TIME=${time}, PAGE_IDS=${JSON.stringify(pageIds && pageIds.length ? pageIds : null)};
const PASS=${JSON.stringify(pass)}, AFTER=${JSON.stringify(after)}, IDS=${JSON.stringify(call === 'sums' ? null : ids)}, SLICE=${JSON.stringify(call === 'sums' ? null : slice)};
const T0=Date.now();
${HASH_SRC}
${BYTES_SRC}
${recipeFunctions(engineDir).join('\n')}
// The pages to read, each loaded where it is: switching the page is saved with the file and changes it.
const PAGES=PAGE_IDS?(await Promise.all(PAGE_IDS.map((id)=>figma.getNodeByIdAsync(id)))).filter((p)=>p&&p.type==='PAGE'):[...figma.root.children];
for(const p of PAGES)await p.loadAsync();
// The file's own variables, the same in every call, so a component reads alike whatever else the call reads.
const LOCAL={},NAMES={};
for(const v of await figma.variables.getLocalVariablesAsync()){LOCAL[v.id]=v;NAMES[v.id]=v.name;}
const found=PAGES.flatMap((p)=>p.findAllWithCriteria({types:['COMPONENT_SET','COMPONENT']}));
// The components a slot prefers, named from these pages alone, for the same reason.
deepFacts.byKey=new Map(found.filter((x)=>prop(x,'key')).map((x)=>[x.key,x.name]));
// Each set, and each component outside a set; a name starting with _ or . is private to the file, not part of the system,
// a status mark in front of it (🟡 .tableRow) or not.
const all=found.filter((x)=>(x.type==='COMPONENT_SET'||!x.parent||x.parent.type!=='COMPONENT_SET')&&!/^[_.]/.test(x.name.replace(/^[^A-Za-z0-9_.]+/,'')));
// One component's items: each part read on its own, so one the Figma tool cannot read leaves the others.
async function readOnce(r){
const id=r.id,name=r.name,out=[];
const read=async(k,at,f)=>{try{return await f();}catch(e){out.push({k,id:at,v:{name,error:String(e&&e.message||e).slice(0,200)}});return null;}};
const s=await read('component',id,()=>componentFacts(r,{...LOCAL}));
if(s){const {variants,...entry}=s;out.push({k:'component',id,v:{name,...entry}});for(const [vn,g] of Object.entries(variants||{}))out.push({k:'variant',id:id+'|'+vn,v:{of:id,name:vn,...g}});}
const p=await read('props',id+'#props',()=>propsFacts(r));if(p)out.push({k:'props',id:id+'#props',v:{name,...p}});
const values=await read('values',id+'#values',()=>{const nums=new Set(),colors=new Set();collectRaw(r,nums,colors);return {nums:[...nums].sort((a,b)=>a-b),colors:[...colors].sort(),hygiene:hygieneOf(r,prop(r,'description'))};});
if(values)out.push({k:'values',id:id+'#values',v:values});
const states=await read('states',id+'#states',()=>stateTokensOf(r,NAMES));if(states)out.push({k:'states',id:id+'#states',v:states});
if(r.type==='COMPONENT_SET'){const b=await read('bindings',id+'#bindings',()=>stateBindingsOf(r,LOCAL));if(b)out.push({k:'bindings',id:id+'#bindings',v:{variants:b}});}
// What JSON keeps (no symbol such as figma.mixed, no undefined), so the checksum is over what the answer carries.
return JSON.parse(JSON.stringify(out));
}
// Figma fills in the layers of a nested instance lazily: the first walk of a component can miss them (its label text in
// a nested toggle), so a read depended on what the call had read before and the checksums said Figma changed when it had
// not. The component is walked once first, then read until two reads agree, so every call reads it alike.
async function itemsOf(r){
try{r.findAll(()=>false);}catch(e){/* a node the walk cannot reach: the reads below say so */}
await figma.getNodeByIdAsync(r.id);
let a=await readOnce(r);
for(let i=0;i<2;i++){const b=await readOnce(r);if(JSON.stringify(b)===JSON.stringify(a))return b;a=b;}
return a;
}
if(CALL==='sums'){
// [id, checksum, place in the file], in the order of the id hash from AFTER on, until TIME or BUDGET.
const key=(x)=>cyrb53(x.id)+' '+x.id,pos=new Map(all.map((x,i)=>[x.id,i]));
const todo=all.filter((x)=>AFTER==null||key(x)>AFTER).sort((a,b)=>(key(a)<key(b)?-1:1));
const sums=[];let size=0,last=null,after=null;
for(const r of todo){
if(sums.length&&(Date.now()-T0>=TIME||size>BUDGET)){after=last;break;}
const e=[r.id,cyrb53(JSON.stringify(await itemsOf(r))),pos.get(r.id)];
sums.push(e);size+=bytes(JSON.stringify(e))+1;last=key(r);
}
return {capture:'components',v:3,kind:'sums',pass:PASS||Date.now().toString(36),from:AFTER,after,of:all.length,sums};
}
${ZIP_SRC}
const byId=new Map(all.map((x)=>[x.id,x])),gone=IDS.filter((id)=>!byId.has(id));
const answer=(o)=>({capture:'components',v:3,kind:'read',pass:PASS,of:all.length,...(gone.length?{gone}:{}),...o});
const fits=(o)=>bytes(JSON.stringify(o))<=ANSWER;
// A component larger than one answer: slice SLICE of its compressed text.
const sliced=async(r,k)=>{const its=await itemsOf(r),z=zip(JSON.stringify(its)),w=ANSWER-600,n=Math.ceil(z.length/w);
if(k>=n)return answer({error:'Figma changed after the checksums were read: read them again'});
const part=z.slice(k*w,(k+1)*w);return answer({sums:{[r.id]:cyrb53(JSON.stringify(its))},slice:k,slices:n,sum:cyrb53(part),z:part});};
if(SLICE!=null){const r=byId.get(IDS[0]);return r?sliced(r,SLICE):answer({error:'no longer in the file: read the checksums again'});}
// The components asked, in order, until TIME or far more than an answer holds; then as many as fit, compressed together.
const got=[];let raw=0;
for(const id of IDS){const r=byId.get(id);if(!r)continue;if(got.length&&(Date.now()-T0>=TIME||raw>ANSWER*24))break;const its=await itemsOf(r),t=JSON.stringify(its);got.push({r,its,sum:cyrb53(t)});raw+=t.length;}
if(!got.length)return answer({sums:{},sum:cyrb53(''),z:''});
const make=(k)=>{const g=got.slice(0,k),z=zip(JSON.stringify(g.flatMap((x)=>x.its)));return answer({sums:Object.fromEntries(g.map((x)=>[x.r.id,x.sum])),sum:cyrb53(z),z});};
let lo=0,hi=got.length,best=null;
while(lo<hi){const k=(lo+hi+1)>>1,o=make(k);if(fits(o)){lo=k;best=o;}else hi=k-1;}
return best||sliced(got[0].r,0);
`;
}

// The component an item belongs to: its id up to the first | # or ~ (a component's own id has none).
export const rootOf = (id) => String(id).split(/[|#~]/)[0];

// The saved answers of the components capture in dir (format 3; format 2's reads still serve, an older capture's
// answers read as readCapture does).
// → { v, pass, complete, next (the checksums page to read next), entries ([{ id, sum, pos }]), of, todo (the ids no
//     answer holds yet, in the file's order), slice ({ id, slice, slices } when one is read in slices), slot (the
//     number the next read is saved as), changed (ids), gone, added, have (id → items), used, bad, stale, older }
export function readComponents(dir) {
  const out = { v: 3, pass: null, pages: 0, complete: false, next: null, entries: [], of: 0, todo: [], slice: null, slot: 0, changed: [], gone: [], added: 0, have: new Map(), used: new Set(), bad: [], stale: [], older: [] };
  if (!existsSync(dir)) return out;
  const answers = [];
  for (const f of readdirSync(dir).filter((x) => x.startsWith('components-') && x.endsWith('.json')).sort()) {
    const a = parseAnswer(readFileSync(join(dir, f), 'utf8'));
    if (!a || a.capture !== 'components') { out.bad.push(`${f}: not an answer of the components capture script`); continue; }
    if (a.error) { out.bad.push(`${f}: ${a.error}`); continue; }
    answers.push({ f, a });
  }
  if (answers.length && !answers.some(({ a }) => a.v >= 2)) return { ...readCapture(dir, 'components'), v: 1 };
  // The checksums: components-sums.json starts the pass, each next page continues where the one before stopped.
  const pages = answers.filter(({ a }) => a.v === 3 && a.kind === 'sums');
  const first = pages.find(({ f }) => f === 'components-sums.json');
  const chain = first ? [first] : [];
  for (let cur = first?.a; cur && cur.after != null;) {
    const k = chain.length + 1, fits = ({ a }) => a.pass === first.a.pass && a.from === cur.after;
    const nx = pages.find((p) => fits(p) && p.f === `components-sums-${k}.json`) ?? pages.find(fits);
    if (!nx) { out.next = { pass: first.a.pass, after: cur.after, page: k }; break; }
    chain.push(nx); cur = nx.a;
  }
  for (const p of pages) if (!chain.includes(p)) out.stale.push(p.f);
  for (const { f, a } of answers) if (a.v !== 3 && !(a.v === 2 && a.kind === 'read' && !a.slices)) { out.stale.push(f); out.older.push(f); }   // read before, in a form this one does not use
  if (!first) return out;
  out.pass = first.a.pass; out.pages = chain.length; out.complete = !out.next; out.of = chain[chain.length - 1].a.of ?? 0;
  const seen = new Set();
  for (const { a } of chain) for (const [id, sum, pos] of a.sums ?? []) if (!seen.has(id)) { seen.add(id); out.entries.push({ id, sum, pos: pos ?? Infinity }); }
  out.entries.sort((x, y) => x.pos - y.pos);   // the file's order, for the reads and the snapshots
  // Each component's items, by checksum, from every answer that holds them whole (or every slice of them).
  const cand = new Map();
  const add = (id, sum, items, files) => {
    const by = cand.get(id) ?? cand.set(id, new Map()).get(id);
    const c = by.get(sum) ?? by.set(sum, { items, files: new Set() }).get(sum);
    for (const f of files) c.files.add(f);
  };
  const sliced = new Map(), taken = new Set();
  const reads = answers.filter(({ a }) => a.kind === 'read' && (a.v === 3 || (a.v === 2 && !a.slices)));
  for (const { f, a } of reads) {
    const body = a.v === 3 ? a.z : a.items;
    if (body == null || (a.v === 3 ? zSum(body) : cyrb53(JSON.stringify(body))) !== a.sum) { out.bad.push(`${f}: its checksum does not match what it holds (changed or cut while it was saved)`); continue; }
    if (a.pass === out.pass) { const m = /-(\d+)\.json$/.exec(f); if (m) taken.add(Number(m[1])); }
    if (a.slice != null) {
      const [id, sum] = Object.entries(a.sums ?? {})[0] ?? [];
      if (!sum) continue;
      const s = sliced.get(`${id} ${sum}`) ?? sliced.set(`${id} ${sum}`, { id, sum, n: a.slices, parts: [], files: new Set(), pass: a.pass }).get(`${id} ${sum}`);
      s.parts[a.slice] = String(a.z).replace(/\s+/g, ''); s.files.add(f);
      continue;
    }
    let items;
    try { items = a.v === 3 ? (a.z ? JSON.parse(unzip(a.z)) : []) : a.items; } catch { out.bad.push(`${f}: what it holds does not read back`); continue; }
    const groups = new Map();
    for (const it of items) { const r = rootOf(it.id); (groups.get(r) ?? groups.set(r, []).get(r)).push(it); }
    for (const [id, sum] of Object.entries(a.sums ?? {})) {
      const its = groups.get(id) ?? [];
      if (cyrb53(JSON.stringify(its)) !== sum) { out.bad.push(`${f}: ${id} does not match its checksum`); continue; }
      add(id, sum, its, [f]);
    }
  }
  for (const s of sliced.values()) {
    if (![...Array(s.n).keys()].every((i) => s.parts[i])) continue;
    let items = null;
    try { items = JSON.parse(unzip(s.parts.join(''))); } catch { /* checked below */ }
    if (items && cyrb53(JSON.stringify(items)) === s.sum) add(s.id, s.sum, items, s.files);
    else out.bad.push(`${[...s.files].join(', ')}: the slices of ${s.id} do not match its checksum`);
  }
  if (!out.complete) return out;
  const held = (e) => cand.get(e.id)?.has(e.sum);
  const byId = new Map(out.entries.map((e) => [e.id, e]));
  out.todo = out.entries.filter((e) => !held(e)).map((e) => e.id);
  // A component read in slices: the next read is its first slice not saved yet.
  for (const s of sliced.values()) {
    const e = byId.get(s.id);
    if (e && e.sum === s.sum && !held(e)) { out.slice = { id: s.id, slice: [...Array(s.n).keys()].find((i) => !s.parts[i]), slices: s.n }; break; }
  }
  while (taken.has(out.slot)) out.slot++;
  // Read for this pass but no longer what the checksums say, or gone from the file: Figma changed in between.
  for (const { a } of reads) {
    if (a.pass !== out.pass) continue;
    for (const [id, sum] of Object.entries(a.sums ?? {})) { const e = byId.get(id); if (e && sum !== e.sum && !held(e)) out.changed.push(id); }
    for (const id of a.gone ?? []) if (byId.has(id)) out.gone.push(id);
    if (typeof a.of === 'number') out.added = Math.max(out.added, a.of - out.entries.length);
  }
  out.added = Math.max(out.added, out.of - out.entries.length, 0);
  out.changed = [...new Set(out.changed)];
  out.gone = [...new Set(out.gone)];
  for (const e of out.entries) { const c = cand.get(e.id)?.get(e.sum); if (c) { out.have.set(e.id, c.items); for (const f of c.files) out.used.add(f); } }
  for (const { f } of reads) if (!out.used.has(f) && !out.bad.some((b) => b.startsWith(`${f}:`)) && !(out.slice && [...(sliced.get(`${out.slice.id} ${byId.get(out.slice.id).sum}`)?.files ?? [])].includes(f))) out.stale.push(f);
  return out;
}

// The script for the next call and the file its answer is saved as. chunk: 'sums' (the next page of the checksums, or
// a new pass when the last one is complete or fresh is set), or anything else for the next read. → { script, save } or
// { error }
export function componentsCall(dir, chunk, { cfg = {}, engineDir = ENGINE, fresh = false, time = TIME } = {}) {
  const pages = cfg.figma?.componentsPage ?? cfg.componentsPage ?? null;
  const c = dir ? readComponents(dir) : { v: 3 };
  if (chunk === 'sums') {
    const go = !fresh && c.v === 3 && c.next;
    return { script: componentsScript('sums', { pages, pass: go ? c.next.pass : null, after: go ? c.next.after : null, time, engineDir }), save: go ? `components-sums-${c.next.page}.json` : 'components-sums.json' };
  }
  if (c.v !== 3 || !c.complete) return { error: 'the checksums are not all read yet: run rms-design-system-engine --capture-script components sums first, and --capture-import says what to read next' };
  if (!c.todo.length) return { error: 'every component is read: run rms-design-system-engine --capture-import' };
  const read = c.slice ? { ids: [c.slice.id], slice: c.slice.slice } : { ids: c.todo.slice(0, READ_IDS) };
  // Named by the pass too, so a read of this pass never replaces one an earlier capture saved under the same number.
  return { script: componentsScript('read', { pages, pass: c.pass, ...read, time, engineDir }), save: `components-${c.pass}-${c.slot}.json` };
}

// The script for a chunk: the variables' by number, the components' through componentsCall.
export function captureScript(kind, chunk, { dir, cfg = {}, engineDir = ENGINE, fresh = false } = {}) {
  if (kind === 'vars') return varsScript(chunk);
  const call = componentsCall(dir, chunk, { cfg, engineDir, fresh });
  if (call.error) throw new Error(call.error);
  return call.script;
}

// Items with their parts put back together (answers of the form before carried an item larger than one answer in parts).
export function partsBack(items) {
  const out = [], parts = new Map();
  for (const it of items) {
    if (it.k !== 'part') { out.push(it); continue; }
    const p = parts.get(it.v.of);
    if (!p) { const q = { at: out.length, k: it.v.k, n: it.v.n, s: [] }; parts.set(it.v.of, q); out.push(null); q.s[it.v.j] = it.v.s; }
    else p.s[it.v.j] = it.v.s;
  }
  for (const [id, p] of parts) {
    let v = null;
    try { if (p.s.length === p.n && p.s.every((x) => typeof x === 'string')) v = JSON.parse(p.s.join('')); } catch { /* left out */ }
    out[p.at] = v ? { k: p.k, id, v } : null;
  }
  return out.filter(Boolean);
}

// A component Figma does not publish to its library: its name starts with a dot or an underscore (.tableRow, _base),
// after any status mark in front of it (🟡 .tableRow). A building block of others, never a component of the system.
export const unpublished = (name) => /^[._]/.test(String(name ?? '').replace(/^[^\p{L}\p{N}._]+/u, ''));

// What the items hold, by component name. → { names, structure, props, values, states, bindings, errors, variants, dupes,
// unpublished }
export function componentsFromItems(items) {
  const all = partsBack(items);
  const byId = new Map(), names = [], structure = {}, props = {}, values = {}, states = {}, bindings = {}, errors = [], dupes = [], hidden = [];
  let variants = 0;
  for (const it of all) {
    if (it.k !== 'component' || byId.has(it.id)) continue;
    const { name, error, ...entry } = it.v;
    if (unpublished(name)) { if (!hidden.includes(name)) hidden.push(name); continue; }
    if (names.includes(name)) { dupes.push(name); continue; }
    byId.set(it.id, name); names.push(name);
    if (error) errors.push({ name, kind: 'structure', error }); else structure[name] = entry;
  }
  for (const it of all) {
    const name = it.k === 'component' ? null : byId.get(it.k === 'variant' ? it.v.of : rootOf(it.id));
    if (!name) continue;
    if (it.v?.error) { errors.push({ name, kind: it.k, error: it.v.error }); continue; }
    if (it.k === 'variant') { const { of, name: vn, ...g } = it.v; if (structure[name]) { (structure[name].variants ??= {})[vn] = g; variants++; } }
    else if (it.k === 'props') { const { name: _n, ...p } = it.v; props[name] = p; }
    else if (it.k === 'values') values[name] = it.v;
    else if (it.k === 'states') states[name] = it.v;
    else if (it.k === 'bindings') bindings[name] = it.v.variants ?? {};
  }
  return { names, structure, props, values, states, bindings, errors, variants, dupes: [...new Set(dupes)], unpublished: hidden };
}

// component-state-tokens.json from each component's own tokens: the counts summed, a token hidden-only when no
// component binds it on a visible layer, toggleable when a visibility variable can show it somewhere.
export function stateTokensFile(per) {
  const counts = {}, shown = new Set(), toggle = new Set();
  for (const s of Object.values(per)) {
    for (const [t, n] of Object.entries(s.tokens ?? {})) { counts[t] = (counts[t] ?? 0) + n; if (!(s.hidden ?? []).includes(t)) shown.add(t); }
    for (const t of s.toggleable ?? []) toggle.add(t);
  }
  const hiddenOnly = Object.keys(counts).filter((t) => !shown.has(t)).sort();
  return { _hiddenOnly: hiddenOnly, _hiddenToggleable: hiddenOnly.filter((t) => toggle.has(t)), ...counts };
}

// --capture-import for the components: when every chunk is there, write the five files. A part a chunk did not read
// (an older capture's answers, or one the Figma tool could not read) keeps what the file held; a component no longer in
// Figma is taken out of each.
export async function importComponents(ROOT, cfg = {}, { dir = captureDir(ROOT), source = 'the Figma tool', now = new Date().toISOString(), engineDir = ENGINE, figmaVersion = null } = {}) {
  const c = readComponents(dir);
  if (c.v === 1) {
    const base = { kind: 'components', v: 1, missing: c.missing, bad: c.bad, stale: c.stale, changed: c.changed, of: c.of };
    if (!c.sums) return { ok: false, ...base, missing: ['sums'], why: 'no answer saved yet' };
    if (c.missing.length) return { ok: false, ...base };
    const items = c.sums.flatMap((s) => c.chunks.get(s));
    return writeComponents(ROOT, cfg, items, { base, chunks: c.sums.length, stale: c.stale, dir, source, now, engineDir, figmaVersion });
  }
  const base = { kind: 'components', v: 3, pass: c.pass, todo: c.todo, slot: c.slot, slice: c.slice, bad: c.bad, stale: c.stale, older: c.older, changed: c.changed, gone: c.gone, read: c.entries.length, total: c.of };
  if (!c.pass) return { ok: false, ...base, why: 'no answer saved yet' };
  if (!c.complete) return { ok: false, ...base, why: 'checksums', next: c.next };
  if (c.changed.length || c.gone.length || c.todo.length) return { ok: false, ...base };
  const items = c.entries.flatMap((e) => c.have.get(e.id) ?? []);
  return writeComponents(ROOT, cfg, items, { base, chunks: c.used.size, stale: c.stale, added: c.added, dir, source, now, engineDir, figmaVersion });
}

function writeComponents(ROOT, cfg, items, { base, chunks, stale = [], added = 0, dir, source, now, engineDir, figmaVersion }) {
  const got = componentsFromItems(items);
  const paths = componentFiles(cfg);
  const read = (p) => { try { return JSON.parse(readFileSync(join(ROOT, p), 'utf8')); } catch { return null; } };
  const prev = Object.fromEntries(Object.entries(paths).map(([k, p]) => [k, read(p)]));
  const inFigma = new Set(got.names), removed = new Set();
  const failed = (name, kind) => got.errors.some((e) => e.name === name && e.kind === kind);
  const meta = (o) => Object.fromEntries(Object.entries(o ?? {}).filter(([k]) => k.startsWith('_')));
  const own = (o) => Object.entries(o ?? {}).filter(([k]) => !k.startsWith('_'));
  const keep = (old, keys) => Object.fromEntries(Object.entries(old ?? {}).filter(([k]) => !keys.includes(k)));
  const how = `${source}, read in ${chunks} checked chunk${chunks === 1 ? '' : 's'} with the capture recipes' functions`;
  const stamp = buildStamp(ROOT, { engineDir, figma: figmaVersion, figmaRead: now });
  const snaps = {};
  // The structure: what the capture reads replaced, the keys it does not read kept, a component not read kept as it was.
  const prevS = prev.structure ?? {};
  const components = {};
  for (const name of got.names) {
    if (got.structure[name]) components[name] = { ...got.structure[name], ...keep(prevS.components?.[name], STRUCTURE_KEYS) };
    else if (prevS.components?.[name]) components[name] = prevS.components[name];
  }
  for (const k of Object.keys(prevS.components ?? {})) if (!inFigma.has(k)) removed.add(k);
  snaps.structure = { ...prevS, _updated: now, _note: prevS._note ?? 'Each component\'s structure as Figma draws it, read with the capture recipe\'s Step 1c functions (cookbook/refresh-figma.md). Do not edit by hand.', _source: how, components, _built: stamp };
  // The props: a component with nothing to record has no entry.
  const prevP = prev.props ?? {};
  const props = meta(prevP);
  for (const name of got.names) {
    if (got.props[name]) props[name] = { ...got.props[name], ...keep(prevP[name], PROPS_KEYS) };
    else if (failed(name, 'props') && prevP[name]) props[name] = prevP[name];
  }
  for (const [k] of own(prevP)) if (!inFigma.has(k)) removed.add(k);
  snaps.props = Object.assign(props, { _updated: now, _source: how, _built: stamp });
  // The raw values, the state tokens and the state bindings: written once a chunk read them, a component not read kept.
  const notRead = {};
  if (Object.keys(got.values).length) {
    const values = { ...meta(prev.values), _updated: now, _source: how };
    for (const name of got.names) { const v = got.values[name] ?? prev.values?.[name]; if (v) values[name] = v; else (notRead.values ??= []).push(name); }
    for (const [k] of own(prev.values)) if (!inFigma.has(k)) removed.add(k);
    snaps.values = { ...values, _built: stamp };
  }
  let statesKept = null;
  if (Object.keys(got.states).length) {
    const before = prev.states?._components ?? {}, per = {};
    for (const name of got.names) { const s = got.states[name] ?? before[name]; if (s) per[name] = s; else (notRead.states ??= []).push(name); }
    for (const k of Object.keys(before)) if (!inFigma.has(k)) removed.add(k);
    // A file written another way holds no component's own tokens: recounted only once every component is read.
    if (notRead.states && prev.states && !prev.states._components) statesKept = notRead.states;
    else snaps.states = { ...meta(prev.states), _updated: now, _source: how, ...stateTokensFile(per), _components: per, _built: stamp };
  }
  if (Object.keys(got.bindings).length || Object.keys(got.states).length) {
    const prevB = prev.bindings ?? {}, bindings = { ...meta(prevB), _updated: now, _source: how };
    for (const name of got.names) {
      if (name in got.bindings) { if (Object.keys(got.bindings[name]).length) bindings[name] = got.bindings[name]; }
      else if (got.states[name] && !failed(name, 'bindings')) { /* read: a component outside a set has no variants to bind */ }
      else if (prevB[name]) bindings[name] = prevB[name];
    }
    for (const [k] of own(prevB)) if (!inFigma.has(k)) removed.add(k);
    snaps.bindings = { ...bindings, _built: stamp };
  }
  const kept = [], written = [];
  for (const [k, snap] of Object.entries(snaps)) {
    const may = mayWrite(join(ROOT, paths[k]), stamp, { ROOT, engineDir, label: paths[k] });
    if (!may.ok) { kept.push(may.line); continue; }
    mkdirSync(dirname(join(ROOT, paths[k])), { recursive: true });
    writeFileSync(join(ROOT, paths[k]), JSON.stringify(snap, null, 2) + '\n');
    written.push(paths[k]);
  }
  if (!written.length) return { ok: false, ...base, kept: kept.join('\n') };
  for (const f of new Set(stale)) { try { unlinkSync(join(dir, f)); } catch { /* left */ } }
  return { ok: true, ...base, paths, written, removed: [...removed].filter((n) => !unpublished(n)), unpublished: got.unpublished, dupes: got.dupes, errors: got.errors, notRead, statesKept, added, ...(kept.length ? { kept: kept.join('\n') } : {}),
    counts: { chunks, components: Object.keys(components).length, variants: got.variants, props: Object.keys(got.props).length, values: Object.keys(got.values).length, states: Object.keys(got.states).length } };
}

// figma-cli reads the same chunks itself: the checksums first, then each chunk not saved yet.
// run(code) → the text figma-cli printed (or a promise of it). kind: vars or components. → the import's result.
export async function captureWithFigmaCli(ROOT, cfg = {}, { run = figmaCliEval(ROOT), dir = captureDir(ROOT), engineDir = ENGINE, figmaVersion = null, kind = 'vars' } = {}) {
  mkdirSync(dir, { recursive: true });
  const opts = { dir, source: 'figma-cli', engineDir, figmaVersion };
  if (kind === 'components') {
    for (let fresh = true, page = 0; page < 10000; fresh = false, page++) {
      const call = componentsCall(dir, 'sums', { cfg, engineDir, fresh });
      const text = await run(call.script), a = parseAnswer(text);
      if (!Array.isArray(a?.sums)) throw new Error(`figma-cli did not return the checksums (is Figma Desktop open on the design system's file?)${a?.error ? `: ${a.error}` : ''}`);
      writeFileSync(join(dir, call.save), String(text).trim() + '\n');
      if (a.after == null) break;
    }
    // The reads, one after the other, each taking the components the last left, until every one is read.
    for (let last = null; ;) {
      const c = readComponents(dir), now = JSON.stringify([c.todo.length, c.slice]);
      if (!c.todo.length || c.changed.length || c.gone.length) break;
      if (now === last) throw new Error('figma-cli read nothing new the last time: the import says why');
      last = now;
      const call = componentsCall(dir, 'next', { cfg, engineDir });
      if (call.error) throw new Error(call.error);
      const text = await run(call.script), a = parseAnswer(text);
      if (typeof a?.z !== 'string') throw new Error(`figma-cli did not return the components: ${a?.error ?? String(text).trim().split('\n').slice(-1)[0]}`);
      writeFileSync(join(dir, call.save), String(text).trim() + '\n');
    }
    return importComponents(ROOT, cfg, opts);
  }
  const script = (chunk) => captureScript(kind, chunk, { dir, cfg, engineDir });
  const sums = parseAnswer(await run(script('sums')));
  if (!sums?.sums) throw new Error('figma-cli did not return the checksums (is Figma Desktop open on the design system\'s file?)');
  writeFileSync(join(dir, `${kind}-sums.json`), JSON.stringify(sums) + '\n');
  for (const n of readCapture(dir, kind).missing) {
    const text = await run(script(n));
    const a = parseAnswer(text);
    if (!a?.d && !a?.items) throw new Error(`figma-cli did not return chunk ${n}: ${a?.error ?? String(text).trim().split('\n').slice(-1)[0]}`);
    writeFileSync(join(dir, `${kind}-${n}.json`), text.trim() + '\n');
  }
  return importCapture(ROOT, cfg, opts);
}
// One script through figma-cli. A call that fails (Safe Mode's plugin can drop one, right after a snapshot or while it
// reconnects) is tried once more after a pause, so one dropped call does not end a capture; the error says what
// figma-cli printed, which in Safe Mode is on stdout, stderr left empty.
export function figmaCliEval(ROOT, { spawn = spawnSync, pause = (ms) => new Promise((r) => setTimeout(r, ms)), retryMs = 5000 } = {}) {
  const lastLine = (s) => String(s ?? '').trim().split('\n').map((l) => l.trim()).filter(Boolean).slice(-1)[0];
  return async (code) => {
    const file = join(tmpdir(), `rms-capture-${process.pid}-${Date.now()}.js`);
    writeFileSync(file, code);
    try {
      let why = null;
      for (let attempt = 0; attempt < 2; attempt++) {
        if (attempt) await pause(retryMs);
        const r = spawn('figma-cli', ['eval', '--file', file], { cwd: ROOT, encoding: 'utf8', timeout: 120000 });
        if (!r.error && r.status === 0) return r.stdout;
        why = r.error?.message ?? lastLine(r.stderr) ?? lastLine(r.stdout) ?? `exit ${r.status}`;
      }
      throw new Error(`figma-cli eval did not finish, twice: ${why}`);
    } finally { try { unlinkSync(file); } catch { /* gone */ } }
  };
}


// What --capture-import says. r: importCapture's or importComponents' result; dir relative to the project.
export function importLines(r, rel) {
  const kind = r.kind ?? 'vars', lines = [];
  for (const b of r.bad ?? []) lines.push(`❌ ${b}`);
  if (r.kept && !r.ok) { lines.push(r.kept); return lines; }
  const tool = 'run the script it writes unchanged with the Figma tool (use_figma)';
  if (!r.ok && kind === 'components' && r.v === 3) {
    if (r.older?.length) lines.push(`${r.older.length} component answer${r.older.length === 1 ? ' was' : 's were'} saved in a form before this one (${r.older.slice(0, 3).join(', ')}${r.older.length > 3 ? ', …' : ''}): the checksums are read again in the compact form; a component those answers hold whole is not read again.`);
    if (r.why === 'no answer saved yet') lines.push(`No component answer saved in ${rel} yet.`, `NEXT: run rms-design-system-engine --capture-script components sums, ${tool}, save its answer as it came to ${rel}/components-sums.json, then run rms-design-system-engine --capture-import again.`);
    else if (r.why === 'checksums') lines.push(`The checksums of ${r.read} of ${r.total} components read so far.`, `NEXT: run rms-design-system-engine --capture-script components sums (it goes on where the last answer stopped), ${tool}, save its answer as it came to ${rel}/components-sums-${r.next.page}.json, then run rms-design-system-engine --capture-import again.`);
    else if (r.changed?.length || r.gone?.length) {
      const some = (ids) => `${ids.slice(0, 5).join(', ')}${ids.length > 5 ? ', …' : ''}`;
      lines.push(`Figma changed after the checksums were read (${[r.changed?.length ? `${r.changed.length} component${r.changed.length === 1 ? '' : 's'}: ${some(r.changed)}` : '', r.gone?.length ? `no longer in the file: ${some(r.gone)}` : ''].filter(Boolean).join('; ')}).`);
      lines.push(`NEXT: run rms-design-system-engine --capture-script components sums new, ${tool}, save its answer as it came to ${rel}/components-sums.json, then read what --capture-import names.`);
    } else {
      lines.push(`${r.todo.length} of ${r.read} components still to read${r.slice ? ` (one too large for an answer, read in ${r.slice.slices} slices: slice ${r.slice.slice} next)` : ''}.`);
      lines.push(`NEXT: run rms-design-system-engine --capture-script components next, ${tool}, save its answer as it came to ${rel}/components-${r.pass}-${r.slot}.json, then run rms-design-system-engine --capture-import again. One at a time: each read takes the components the last one left, as many as fit.`);
    }
    return lines;
  }
  if (!r.ok) {
    const left = r.missing ?? [];
    if (r.changed?.length) lines.push(`Figma changed after the checksums were read (chunk ${r.changed.join(', ')}).`);
    const what = kind === 'components' ? 'component ' : '';
    lines.push(r.why === 'no answer saved yet' ? `No ${what}answer saved in ${rel} yet.` : `${left.length} of ${r.of} ${what}chunk${r.of === 1 ? '' : 's'} still to read: ${left.join(', ')}.`);
    if (r.older?.length) lines.push(`${r.older.length} answer${r.older.length === 1 ? ' was' : 's were'} saved in the form before (${r.older.slice(0, 3).join(', ')}${r.older.length > 3 ? ', …' : ''}): the checksums now are of the compact form, so read the chunks named again; the import clears the old answers.`);
    if (r.changed?.length) lines.push(`NEXT: run rms-design-system-engine --capture-script ${kind} sums${kind === 'components' ? ' new' : ''}, ${tool}, save its answer as it came to ${rel}/${kind}-sums.json, then read each chunk --capture-import names.`);
    else if (kind === 'components') lines.push(`NEXT: run rms-design-system-engine --capture-script components sums${r.why === 'no answer saved yet' ? '' : ' new'}, ${tool}, save its answer as it came to ${rel}/components-sums.json, then run rms-design-system-engine --capture-import again.`);
    else lines.push(`NEXT: for each, run rms-design-system-engine --capture-script ${kind} <chunk>, ${tool}, save its answer as it came to ${rel}/${kind}-<chunk>.json, then run rms-design-system-engine --capture-import again.`);
    return lines;
  }
  const n = r.counts;
  if (kind === 'vars') { lines.push(`✓ Figma's variables read in ${n.chunks} checked chunk${n.chunks === 1 ? '' : 's'}: ${n.colours} colours in ${n.modes} mode${n.modes === 1 ? '' : 's'}, ${n.sizing} sizes, ${n.textStyles} text styles, the scopes of ${n.scopes} variables → ${r.path}`); return lines; }
  const also = n.values || n.states ? `, the raw values of ${n.values} and the states of ${n.states}` : '';
  lines.push(`✓ Figma's components read in ${n.chunks} checked chunk${n.chunks === 1 ? '' : 's'}: ${n.components} component${n.components === 1 ? '' : 's'} with ${n.variants} variants, the props of ${n.props}${also} → ${r.written.join(', ')}`);
  if (r.removed?.length) lines.push(`Taken out, no longer in Figma: ${r.removed.join(', ')}.`);
  if (r.errors?.length) lines.push(`⚠️  Not read in Figma, kept as it was: ${r.errors.map((e) => `${e.name} (${e.kind}: ${e.error})`).join('; ')}.`);
  for (const [k, names] of Object.entries(r.notRead ?? {})) lines.push(`ℹ️  ${names.length} component${names.length === 1 ? '' : 's'} not read for ${k === 'values' ? 'the raw values' : 'the states'} in this capture, and none before: ${names.slice(0, 8).join(', ')}${names.length > 8 ? ', …' : ''}.`);
  if (r.statesKept) lines.push(`${componentFiles().states} kept as it was: it was not written per component, and ${r.statesKept.length} component${r.statesKept.length === 1 ? ' was' : 's were'} not read with their states. Read them all once: rms-design-system-engine --capture-script components sums new.`);
  if (r.added) lines.push(`ℹ️  Figma has ${r.added} more component${r.added === 1 ? '' : 's'} than when the checksums were read: rms-design-system-engine --capture-script components sums new reads ${r.added === 1 ? 'it' : 'them'} next time.`);
  if (r.unpublished?.length) lines.push(`Left out, not published in Figma's library (a name that starts with . or _): ${r.unpublished.join(', ')}.`);
  if (r.dupes?.length) lines.push(`⚠️  Two components share a name, the first one is kept: ${r.dupes.join(', ')}. Rename one in Figma.`);
  if (r.kept) lines.push(r.kept);
  return lines;
}
