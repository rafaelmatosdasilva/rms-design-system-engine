// The review sheet's results built in Figma, so a person judges what they see, never only what the run says it did.
// For each request in the sample, one script: the first builds the benchmark's system on an empty page (its variables,
// and each component as its capture describes it, in a frame named System), and each one after it puts the request's
// component twice side by side in a section of its own, Before and After, then runs on the After one the very script
// the engine wrote for it (figma-ops.mjs opsScript). Every script is run with the Figma MCP's use_figma on an empty
// file, in order, each under the tool's size limit.
//
//   systemScript(system)                    → the script that builds the system
//   requestScript(k, req, plan, script)     → the script that sets out request k and runs the engine's on it
import { opWords } from '../../lib/figma-ops.mjs';

const lit = (v) => JSON.stringify(v).replace(/</g, '\\u003c');

export function systemScript(system) {
  return `// The benchmark's system, built for a person to review (test/figma-bench/review-figma.mjs).
const system = ${lit(system)};
await figma.loadFontAsync({ family: 'Inter', style: 'Regular' });
const page = figma.currentPage; page.name = 'Review';
const col = figma.variables.createVariableCollection('Tokens');
const modes = (system.modes.Tokens ?? ['default']); col.renameMode(col.modes[0].modeId, modes[0]); for (const m of modes.slice(1)) col.addMode(m);
const vars = {};
for (const v of system.variables) { const x = figma.variables.createVariable(v.name, col, v.type ?? 'FLOAT'); x.scopes = v.type === 'COLOR' ? ['ALL_FILLS'] : ['GAP', 'WIDTH_HEIGHT']; vars[v.name] = x; }
for (const v of system.variables) for (const m of col.modes) {
  if (v.alias && vars[v.alias]) vars[v.name].setValueForMode(m.modeId, figma.variables.createVariableAlias(vars[v.alias]));
  // A colour the capture holds no value for, by its role, so a reviewer can read what is drawn: a surface light, a
  // text dark, anything else a mid blue.
  else vars[v.name].setValueForMode(m.modeId, v.type === 'COLOR' ? (/surface|background|bg|fill/i.test(v.name) ? { r: 0.92, g: 0.93, b: 0.95, a: 1 } : /text|label|content|foreground|fg/i.test(v.name) ? { r: 0.1, g: 0.1, b: 0.12, a: 1 } : { r: 0.3, g: 0.45, b: 0.9, a: 1 }) : (v.value ?? 0));
}
const frame = figma.createAutoLayout('HORIZONTAL', { name: 'System', itemSpacing: 40, paddingLeft: 40, paddingTop: 40, paddingRight: 40, paddingBottom: 40 }); frame.layoutWrap = 'WRAP'; frame.resize(1600, 100); frame.counterAxisSizingMode = 'AUTO'; frame.x = 40; frame.y = 40;
const comps = {};
const nests = (t) => [...(t?.t === 'INSTANCE' && t.of?.name ? [t.of.name] : []), ...(t?.c ?? []).flatMap(nests)];
const order = [], seen = new Set(), visit = (n) => { if (seen.has(n) || !system.components[n]) return; seen.add(n); for (const m of nests(system.components[n].tree)) visit(m); order.push(n); };
for (const n of Object.keys(system.components)) visit(n);
const solid = (c) => ({ type: 'SOLID', color: c });
const build = (t, top) => {
  const of = t.t === 'INSTANCE' ? comps[t.of?.name] : null;
  const n = of ? of.createInstance() : t.t === 'TEXT' ? figma.createText() : top ?? figma.createFrame();
  if (t.t === 'TEXT') n.characters = String(t.text ?? t.n ?? 'Text');
  if (!of && t.t !== 'TEXT') { n.fills = []; if (t.layout?.dir) { n.layoutMode = t.layout.dir; n.primaryAxisSizingMode = t.fixed ? 'FIXED' : 'AUTO'; n.counterAxisSizingMode = t.fixed ? 'FIXED' : 'AUTO'; n.itemSpacing = t.layout.gap ?? t.gap ?? 4; } }
  if (t.fixed) n.resize(t.fixed[0], t.fixed[1]); else if (t.t === 'INSTANCE' && !of) n.resize(16, 16);
  if (t.n && !top) n.name = t.n;
  for (const [f, v] of Object.entries(t.bind ?? {})) { const x = vars[v]; if (!x) continue; if (f === 'fill') n.fills = [figma.variables.setBoundVariableForPaint(solid({ r: 0, g: 0, b: 0 }), 'color', x)]; else n.setBoundVariable(f, x); }
  if (!of) for (const k of t.c ?? []) n.appendChild(build(k));
  return n;
};
for (const name of order) {
  const c = system.components[name];
  const variants = c.variants.map((vn) => { const v = figma.createComponent(); v.fills = [solid({ r: 1, g: 1, b: 1 })]; build({ ...c.tree, t: 'COMPONENT' }, v); v.name = vn;
    // A component with nothing inside (an icon the capture holds no drawing for) is drawn as a dot, so it can be seen.
    if (!(c.tree.c ?? []).length) { const dot = figma.createEllipse(); dot.resize(Math.min(v.width, v.height) || 16, Math.min(v.width, v.height) || 16); dot.fills = [solid({ r: 0.3, g: 0.45, b: 0.9 })]; v.fills = []; v.appendChild(dot); }
    return v; });
  let set = variants[0];
  if (variants.length > 1 || c.axes) { set = figma.combineAsVariants(variants, frame); set.layoutMode = 'HORIZONTAL'; set.itemSpacing = 16; set.paddingLeft = set.paddingRight = set.paddingTop = set.paddingBottom = 16; set.primaryAxisSizingMode = 'AUTO'; set.counterAxisSizingMode = 'AUTO'; }
  else frame.appendChild(set);
  set.name = name; set.description = c.description ?? '';
  const keys = {};
  for (const [k, d] of Object.entries(c.properties ?? {})) if (d.type === 'BOOLEAN' || d.type === 'TEXT') keys[k.split('#')[0]] = set.addComponentProperty(k.split('#')[0], d.type, d.type === 'BOOLEAN' ? d.defaultValue !== false : String(d.defaultValue ?? ''));
  // Each layer wired to its property, as the capture says.
  const wire = (n, t) => { if (t.wired) { try { n.componentPropertyReferences = Object.fromEntries(Object.entries(t.wired).filter(([, p]) => keys[p]).map(([f, p]) => [f, keys[p]])); } catch (e) { } } if (t.t !== 'INSTANCE') (t.c ?? []).forEach((k, i) => n.children[i] && wire(n.children[i], k)); };
  for (const v of variants) wire(v, c.tree);
  comps[name] = set.type === 'COMPONENT_SET' ? set.defaultVariant : set;
}
return { system: frame.id, components: Object.keys(comps).length, variables: Object.keys(vars).length };
`;
}

// The request's component twice, Before and After, in a section of its own; then the engine's script run on After.
export function requestScript(k, req, plan, script) {
  const base = plan.target ?? plan.like ?? null;
  const body = String(script)
    // Only the nodes line: an empty map (nodes: {}) is one line, a full one ends at its own closing brace.
    .replace(/^const nodes = (\{\}|\{\n[^]*?\n\});$/m, 'const nodes = __NODES__;')
    .replace(/await figma\.getNodeByIdAsync\("__AFTER__"\)/g, '__AFTER__');
  return `// Request ${k} for a person to review: "${String(req.ask).replace(/\n/g, ' ')}" (test/figma-bench/review-figma.mjs).
await figma.loadFontAsync({ family: 'Inter', style: 'Regular' }); await figma.loadFontAsync({ family: 'Inter', style: 'Semi Bold' });
const page = figma.currentPage;
const system = page.findOne((n) => n.name === 'System');
const own = (name) => system ? system.findChild((n) => n.name === name && (n.type === 'COMPONENT_SET' || n.type === 'COMPONENT')) : null;
const label = (s, bold) => { const t = figma.createText(); t.fontName = { family: 'Inter', style: bold ? 'Semi Bold' : 'Regular' }; t.characters = s; t.fontSize = bold ? 18 : 14; return t; };
const sec = figma.createSection(); sec.name = ${lit(`Request ${k}: "${req.ask}"`)};
const below = Math.max(0, ...page.children.filter((n) => n !== sec).map((n) => n.y + n.height)); sec.x = 40; sec.y = below + 80;
const col = figma.createAutoLayout('VERTICAL', { name: 'Request ${k}', itemSpacing: 20, paddingLeft: 40, paddingRight: 40, paddingTop: 40, paddingBottom: 40 }); col.fills = [];
col.appendChild(label(${lit(`${k}. "${req.ask}"`)}, true));
col.appendChild(label(${lit(['What the engine built:', ...(plan.ops.length ? plan.ops.map((o) => `• ${opWords(o)}`) : ['• nothing: it asked first'])].join('\n'))}, false));
${plan.asks?.length ? `col.appendChild(label(${lit(['What it asked:', ...plan.asks.map((a) => `• ${a}`)].join('\n'))}, false));` : ''}
const row = figma.createAutoLayout('HORIZONTAL', { name: 'Before and after', itemSpacing: 80 }); row.fills = []; col.appendChild(row);
const side = (name) => { const b = figma.createAutoLayout('VERTICAL', { name, itemSpacing: 12 }); b.fills = []; b.appendChild(label(name, true)); row.appendChild(b); return b; };
const before = side('Before ${k}'), after = side('After ${k}');
const src = ${base ? `own(${lit(base)})` : 'null'};
if (src) { before.appendChild(src.clone()); after.appendChild(src.clone()); }
sec.appendChild(col); sec.resizeWithoutConstraints(Math.max(col.width, 600), col.height);
const target = after.findChild((n) => n.type === 'COMPONENT_SET' || n.type === 'COMPONENT');
const __NODES__ = Object.fromEntries([...(system ? system.children : []), ...after.children].filter((n) => n.type === 'COMPONENT_SET' || n.type === 'COMPONENT').map((n) => [n.name, n.id]));
const had = new Set(Object.keys((target && (target.type === 'COMPONENT_SET' || target.parent?.type !== 'COMPONENT_SET') ? target.componentPropertyDefinitions : null) ?? {}));
const result = await (async () => {
${body.replace(/__NODES__/g, '__NODES__').replace(/__AFTER__/g, 'target')}
})();
// A new boolean is off unless set, so what it shows is hidden: one instance with each new one on, to be seen.
const defs = (target && (target.type === 'COMPONENT_SET' || target.parent?.type !== 'COMPONENT_SET') ? target.componentPropertyDefinitions : null) ?? {};
for (const [k, d] of Object.entries(defs).filter(([k, d]) => !had.has(k) && d.type === 'BOOLEAN')) {
  const main = target.type === 'COMPONENT_SET' ? target.defaultVariant : target;
  const inst = main.createInstance(); inst.setProperties({ [k]: true });
  after.appendChild(label('With ' + k.split('#')[0] + ' on', false)); after.appendChild(inst);
}
sec.resizeWithoutConstraints(Math.max(col.width, 600), col.height);
return { request: ${k}, section: sec.id, result };
`;
}
