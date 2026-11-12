// figma-undo.mjs - the way back from a write the engine made in Figma.
//
// Every Figma write the engine makes goes through one script (.design-system-engine-out/handback/figma-apply.js),
// written by --figma-edits (figma-edits.mjs applyScript) or by --figma-change and --figma-build (figma-ops.mjs
// opsScript). Until now a wrong write could only be taken back through the file's version history, which also drops
// everyone else's work since.
//
// Only the script can see what a value was, because only it runs inside the file. So each write records the value it
// is about to replace, in one small vocabulary of reversal steps, and the run returns them with what it changed. The
// agent never writes that record: the guard picks it up from the tool's own answer (guard.mjs, PostToolUse on
// use_figma) and writes the way back beside the change:
//   figma-undo.json  the record: the steps, in the order they were made, and what has no way back;
//   figma-undo.js    a Figma plugin script that puts each one back, newest first. Run with use_figma, like the
//                    script that made the change and only after the person says yes; the guard lets this one through
//                    too, and nothing else.
//
// A step with no way back (a variant, a layer or a property the change removed: Figma keeps no copy of what was in
// it) is recorded as such and never guessed at. A record that holds one is not complete, and the script written from
// it refuses to run rather than putting a file half back: a half-covered undo is more dangerous than none, because
// the person believes the change is gone. --change-report says so in words, with the version history as the only way
// left.
//
// The vocabulary (each step carries the node it is on and the value to put back):
//   name            a node's name
//   annotations     a node's annotations, in the form the API takes back
//   description     a component set's description
//   delete          a node the run created, removed again
//   devResource     a Dev Mode resource the run added, removed again
//   codeSyntax      a variable's code syntax for one platform (null where it had none)
//   propertyName    a component property's name (found again by the name it carries now)
//   propertyDefault a component property's default value
//   deleteProperty  a component property the run added, removed again
//   propertyRefs    a layer's componentPropertyReferences
//   paints          a node's fills or strokes, with what they were bound to
//   boundVariable   one bound field of a node (null where it was bound to nothing)
//   parent          where a node sat, and at what index and position
//   resize          a size the run grew to fit new variants
//   remade          output of the engine's own that a later run wrote afresh over: no way back to that copy, and no
//                   loss of anyone's work either, so it is said and never refused on
//   cannot          a write with no way back: what it was, and why
// Pure apart from writeUndo.
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

// A value written into a plugin script as a literal: JSON, with the characters that could end a string or a script
// written as escapes, so a name or a label read from Figma can never become code.
export const lit = (v, ...a) => (JSON.stringify(v, ...a) ?? 'undefined').replace(/[<>/\u2028\u2029]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`);

export const UNDO_KINDS = ['name', 'annotations', 'description', 'delete', 'devResource', 'codeSyntax', 'propertyName', 'propertyDefault', 'deleteProperty', 'propertyRefs', 'paints', 'boundVariable', 'parent', 'resize', 'remade', 'deleteVariable', 'cannot'];

// What every script the engine writes carries, so each write can record what it replaces. `undo` is returned with
// what the run changed; `U` is how each write records itself, always before it makes the change.
// A node Figma gives as mixed (a text with more than one font, fills that differ along a range) has no one value to
// put back, so it is recorded as a step with no way back instead of a guess.
export const UNDO_PRELUDE = `const undo = [];
const _ann = (a) => ({ ...(a.labelMarkdown ? { labelMarkdown: a.labelMarkdown } : { label: a.label || '' }), ...(a.properties ? { properties: a.properties } : {}), ...(a.categoryId ? { categoryId: a.categoryId } : {}) });
const _plain = (v) => { try { return JSON.parse(JSON.stringify(v)); } catch (e) { return undefined; } };
const _mixed = (v) => v === figma.mixed || v === undefined;
const U = {
  cannot: (what, why) => { undo.push({ kind: 'cannot', what: String(what), why: String(why) }); },
  remade: (what, how) => { undo.push({ kind: 'remade', what: String(what), how: String(how) }); },
  name: (n) => { undo.push({ kind: 'name', id: n.id, was: n.name, what: n.name }); },
  made: (n, what) => { undo.push({ kind: 'delete', id: n.id, what: String(what == null ? n.name : what) }); },
  madeVariable: (v, what) => { undo.push({ kind: 'deleteVariable', id: v.id, what: String(what == null ? v.name : what) }); },
  annotations: (n) => { undo.push({ kind: 'annotations', id: n.id, was: (n.annotations || []).map(_ann), what: n.name }); },
  description: (n) => { undo.push({ kind: 'description', id: n.id, was: n.description, what: n.name }); },
  devResource: (n, url) => { undo.push({ kind: 'devResource', id: n.id, url, what: n.name }); },
  codeSyntax: (v, platform) => { undo.push({ kind: 'codeSyntax', id: v.id, platform, was: (v.codeSyntax && v.codeSyntax[platform]) != null ? v.codeSyntax[platform] : null, what: v.name }); },
  propertyName: (n, now, was) => { undo.push({ kind: 'propertyName', id: n.id, now, was, what: n.name + ' ' + was }); },
  propertyDefault: (n, name, was) => { undo.push({ kind: 'propertyDefault', id: n.id, name, was: _plain(was), what: n.name + ' ' + name }); },
  madeProperty: (n, name) => { undo.push({ kind: 'deleteProperty', id: n.id, name, what: n.name + ' ' + name }); },
  propertyRefs: (n) => { undo.push({ kind: 'propertyRefs', id: n.id, was: _plain(n.componentPropertyReferences) || null, what: n.name }); },
  paints: (n, field) => { const ps = n[field]; if (_mixed(ps)) { U.cannot(n.name + ' ' + field, 'Figma gives this node more than one ' + field + ', so there is no one value to put back'); return; } undo.push({ kind: 'paints', id: n.id, field, was: _plain(ps) || [], what: n.name + ' ' + field }); },
  boundVariable: (n, field) => { const b = (n.boundVariables || {})[field]; undo.push({ kind: 'boundVariable', id: n.id, field, was: b && b.id ? b.id : null, what: n.name + ' ' + field }); },
  parent: (n) => { const p = n.parent; undo.push({ kind: 'parent', id: n.id, parent: p ? p.id : null, index: p && p.children ? p.children.indexOf(n) : null, x: n.x, y: n.y, what: n.name }); },
  resize: (n) => { undo.push({ kind: 'resize', id: n.id, w: n.width, h: n.height, what: n.name }); },
};`;

// The steps a run reported, from what use_figma answered. Takes the returned object, a JSON string, or the MCP's
// own wrapper ({ content: [{ text }] }); anything else gives none, and none is never read as "nothing to undo".
export function undoSteps(result) {
  const seen = new Set();
  const dig = (v, depth = 0) => {
    if (v == null || depth > 6) return null;
    if (typeof v === 'string') { const t = v.trim(); if (!/[[{]/.test(t)) return null; for (const m of [t, t.slice(t.search(/[[{]/))]) { try { const p = JSON.parse(m); const hit = dig(p, depth + 1); if (hit) return hit; } catch { /* not JSON here */ } } return null; }
    if (typeof v !== 'object') return null;
    if (seen.has(v)) return null;
    seen.add(v);
    if (Array.isArray(v)) { for (const x of v) { const hit = dig(x, depth + 1); if (hit) return hit; } return null; }
    if (Array.isArray(v.undo) && v.undo.every((s) => s && UNDO_KINDS.includes(s.kind))) return v.undo;
    for (const x of Object.values(v)) { const hit = dig(x, depth + 1); if (hit) return hit; }
    return null;
  };
  return dig(result);
}

// What has no way back, and so what the record cannot promise.
export const cannotUndo = (undo = []) => undo.filter((s) => s?.kind === 'cannot');
// Output of the engine's own written afresh over: said, never refused on, because no one else's work was in it.
export const remadeUndo = (undo = []) => undo.filter((s) => s?.kind === 'remade');
export const canUndo = (undo = []) => undo.filter((s) => s?.kind !== 'cannot' && s?.kind !== 'remade');

// The record kept beside the change: the steps in the order they were made, and whether every one of them can be put
// back. `what` is the command that made the change, for whoever reads the file later.
export function undoRecord(undo = [], { what = 'figma-apply', at = new Date().toISOString() } = {}) {
  const cannot = cannotUndo(undo), remade = remadeUndo(undo);
  return { at, what, complete: !cannot.length, steps: canUndo(undo).length, cannot: cannot.map((s) => ({ what: s.what, why: s.why })), remade: remade.map((s) => ({ what: s.what, how: s.how })), undo };
}

// The script that puts each step back, newest first: the same way the change was made, with use_figma, after the
// person says yes.
// A record that is not complete refuses: it changes nothing and says what has no way back, because a file put half
// back reads as a file put back. Each step is tried on its own, so one that cannot be reached (a node someone deleted
// since) is reported and never stops the rest.
export function undoScript(undo = [], { what = 'figma-apply' } = {}) {
  const record = undoRecord(undo, { what });
  return `// Written by rms-design-system-engine: the way back from ${what}. Run it with the Figma MCP's use_figma only
// after the person said yes, as written. It puts back what the change replaced, newest first.
const record = ${lit(record, null, 2)};
const undone = [], failed = [];
if (!record.complete) return { refused: true, undone, failed, cannot: record.cannot, why: 'Part of this change has no way back (' + record.cannot.map((c) => c.what).join('; ') + '), so putting the rest back would leave the file looking undone when it is not. Nothing was changed. The file\\u0027s version history is the only way back from the whole change.' };
const nodeOf = async (id) => (id ? await figma.getNodeByIdAsync(id) : null);
const varOf = async (id) => (id && figma.variables.getVariableByIdAsync ? await figma.variables.getVariableByIdAsync(id) : null);
const keyOf = (n, name) => Object.keys(n.componentPropertyDefinitions || {}).find((k) => k.replace(/#[^#]*$/, '') === name);
const fonts = async (n) => { if (!n || n.type !== 'TEXT') return; const f = n.fontName === figma.mixed ? n.getRangeAllFontNames(0, n.characters.length) : [n.fontName]; for (const x of f) await figma.loadFontAsync(x); };
const pageOf = async (n) => { let p = n; while (p && p.type !== 'PAGE') p = p.parent; if (p && p.loadAsync) await p.loadAsync(); };
for (const s of [...record.undo].reverse()) {
  try {
    if (s.kind === 'remade') { continue; }
    if (s.kind === 'codeSyntax') {
      const v = await varOf(s.id);
      if (!v) { failed.push(s.what + ': the variable is not in this file any more'); continue; }
      if (s.was == null) { if (v.removeVariableCodeSyntax) v.removeVariableCodeSyntax(s.platform); } else v.setVariableCodeSyntax(s.platform, s.was);
      undone.push(s.what + ': code syntax put back');
      continue;
    }
    if (s.kind === 'deleteVariable') {
      const v = await varOf(s.id);
      if (!v) { failed.push(s.what + ': the variable is not in this file any more'); continue; }
      v.remove();
      undone.push(s.what + ': removed again');
      continue;
    }
    const n = await nodeOf(s.id);
    if (!n) { failed.push(s.what + ': the node is not in this file any more'); continue; }
    await pageOf(n);
    if (s.kind === 'name') { n.name = s.was; undone.push('named ' + s.was + ' again'); }
    else if (s.kind === 'annotations') { n.annotations = s.was; undone.push(s.what + ': annotations put back'); }
    else if (s.kind === 'description') { n.description = s.was; undone.push(s.what + ': description put back'); }
    else if (s.kind === 'delete') { n.remove(); undone.push(s.what + ': removed again'); }
    else if (s.kind === 'devResource') { if (!n.deleteDevResourceAsync) { failed.push(s.what + ': this node takes no Dev Mode resource'); continue; } await n.deleteDevResourceAsync(s.url); undone.push(s.what + ': the link to the code removed again'); }
    else if (s.kind === 'propertyName') { const k = keyOf(n, s.now); if (!k) { failed.push(s.what + ': no property named ' + s.now + ' to name back'); continue; } n.editComponentProperty(k, { name: s.was }); undone.push(s.what + ': named ' + s.was + ' again'); }
    else if (s.kind === 'propertyDefault') { const k = keyOf(n, s.name); if (!k) { failed.push(s.what + ': no property named ' + s.name + ' any more'); continue; } n.editComponentProperty(k, { defaultValue: s.was }); undone.push(s.what + ': default put back'); }
    else if (s.kind === 'deleteProperty') { const k = keyOf(n, s.name); if (!k) { failed.push(s.what + ': no property named ' + s.name + ' to remove'); continue; } n.deleteComponentProperty(k); undone.push(s.what + ': removed again'); }
    else if (s.kind === 'propertyRefs') { await fonts(n); n.componentPropertyReferences = s.was; undone.push(s.what + ': what its layers are wired to put back'); }
    else if (s.kind === 'paints') { n[s.field] = s.was; undone.push(s.what + ': put back'); }
    else if (s.kind === 'boundVariable') { await fonts(n); n.setBoundVariable(s.field, s.was ? await varOf(s.was) : null); undone.push(s.what + ': put back'); }
    else if (s.kind === 'parent') {
      const p = await nodeOf(s.parent);
      if (!p || !('insertChild' in p || 'appendChild' in p)) { failed.push(s.what + ': where it sat is not in this file any more'); continue; }
      await pageOf(p);
      if (s.index != null && 'insertChild' in p) p.insertChild(Math.min(s.index, (p.children || []).length), n); else p.appendChild(n);
      n.x = s.x; n.y = s.y;
      undone.push(s.what + ': put back where it sat');
    } else if (s.kind === 'resize') { if (n.resizeWithoutConstraints) n.resizeWithoutConstraints(s.w, s.h); undone.push(s.what + ': sized as it was'); }
    else failed.push(s.what + ': ' + s.kind + ' is not a step this script knows');
  } catch (e) { failed.push((s.what || s.kind) + ': ' + String((e && e.message) || e)); }
}
return { refused: false, undone, failed, cannot: [] };
`;
}

// The way back, beside the change it undoes. Written only from a run's own record: where a run reported none, no
// script is written and nothing claims the change can be taken back.
// → { json, script, record } or null
export function writeUndo(dir, undo, { what = 'figma-apply', at } = {}) {
  if (!Array.isArray(undo)) return null;
  const record = undoRecord(undo, { what, ...(at ? { at } : {}) });
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'figma-undo.json'), JSON.stringify(record, null, 2) + '\n');
  writeFileSync(join(dir, 'figma-undo.js'), undoScript(undo, { what }));
  return { json: join(dir, 'figma-undo.json'), script: join(dir, 'figma-undo.js'), record };
}

// What the person is told about the way back, from the record kept beside the change.
export function undoLines(record, { script = '.design-system-engine-out/handback/figma-undo.js' } = {}) {
  if (!record) return ['⚠️  No way back was recorded for this change: nothing reported what each value was before it changed, so the engine cannot take it back. The file\'s version history is the only way, and it drops everyone else\'s work since.'];
  if (!record.complete) {
    return [`⚠️  This change cannot be taken back in full (${record.cannot.length} step${record.cannot.length === 1 ? '' : 's'} with no way back):`,
      ...record.cannot.map((c) => `   • ${c.what}: ${c.why}`),
      `   The other ${record.steps} step${record.steps === 1 ? '' : 's'} could be put back, but putting part of a change back leaves the file looking undone when it is not, so the engine refuses: the way back is the file's version history, which drops everyone else's work since.`];
  }
  return [`The way back from this change (${record.steps} step${record.steps === 1 ? '' : 's'}), written beside it: ${script}`,
    '   Run it with the Figma MCP\'s use_figma, as written, only when the person says yes. It puts back what the change replaced, newest first, and touches nothing else.',
    ...(record.remade ?? []).map((r) => `   • ${r.what} was the engine's own from an earlier run and was written afresh: ${r.how}.`)];
}
