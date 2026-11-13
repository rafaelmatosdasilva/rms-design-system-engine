// figma-plugin.mjs - the hand-back as a Figma plugin, so a designer reviews and applies it inside Figma.
//
// The hand-back was a script an agent ran with the Figma tool once the person said yes. A designer working in Figma had
// to ask for it. This writes, beside the script, a development plugin that does the same from inside the file: it lists
// what the change does, in the words the engine prints, and applies it on the designer's click, which is their yes. It
// keeps what the change replaced in the file itself, so "Undo last change" puts it back, the same way the engine's own
// way back does (figma-undo.mjs): newest first, refused whole when part of it has no way back.
//
// The plugin is the same script, never a second copy of its logic: the apply is figma-apply.js as written, the undo is
// undoScript reading the record the plugin kept. A designer imports it once (Plugins › Development › Import plugin from
// manifest…, the manifest in handback/figma-plugin/), and each hand-back the engine writes after that rewrites its
// files, so running it again shows the latest list. It asks for no network access.
//
//   pluginFiles({ script, lines }) → { 'manifest.json', 'code.js', 'ui.html' }
//     script: the hand-back script (figma-edits.mjs applyScript); lines: what it does, as editLines prints it
// Pure apart from writeFigmaPlugin.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { undoScript } from './figma-undo.mjs';

export const PLUGIN_DIR = 'figma-plugin';
export const RECORD_KEY = 'rms_dse_last_apply';

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
// A script written into the plugin's code as the body of a function it calls: the hand-back scripts end in a return.
const asFunction = (name, body) => `async function ${name}() {\n${body}\n}`;

export function pluginFiles({ script = '', lines = [] } = {}) {
  const manifest = {
    name: 'Design system hand-back',
    id: 'rms-dse-handback',
    api: '1.0.0',
    main: 'code.js',
    ui: 'ui.html',
    editorType: ['figma'],
    documentAccess: 'dynamic-page',
    networkAccess: { allowedDomains: ['none'] },
  };
  const undoBody = undoScript([], { recordFrom: `JSON.parse(figma.root.getPluginData(${JSON.stringify(RECORD_KEY)}) || '{"undo":[],"complete":true,"cannot":[]}')` });
  const code = `// Written by rms-design-system-engine (figma-plugin.mjs): the hand-back, applied from inside Figma on the designer's
// click. Rewritten with every hand-back; import it once from Plugins > Development > Import plugin from manifest.
figma.showUI(__html__, { width: 520, height: 600, themeColors: true });
const RECORD_KEY = ${JSON.stringify(RECORD_KEY)};
${asFunction('applyChange', script)}
${asFunction('undoLast', undoBody)}
// What the change replaced, kept in the file so the way back works on any computer that opens it.
const keep = (undo) => {
  const cannot = undo.filter((s) => s && s.kind === 'cannot');
  const record = { at: new Date().toISOString(), what: 'figma-plugin', complete: !cannot.length, cannot: cannot.map((s) => ({ what: s.what, why: s.why })), undo };
  figma.root.setPluginData(RECORD_KEY, JSON.stringify(record));
};
figma.ui.onmessage = async (msg) => {
  try {
    if (msg.type === 'apply') {
      const r = await applyChange();
      keep(r.undo || []);
      figma.ui.postMessage({ type: 'done', changed: r.changed || [], skipped: r.skipped || [], missing: r.missing || [] });
    } else if (msg.type === 'undo') {
      if (!figma.root.getPluginData(RECORD_KEY)) { figma.ui.postMessage({ type: 'done', changed: [], skipped: ['Nothing to undo: this file has no change applied from the plugin.'], missing: [] }); return; }
      const r = await undoLast();
      if (!r.refused) figma.root.setPluginData(RECORD_KEY, '');
      figma.ui.postMessage({ type: 'done', changed: r.undone || [], skipped: r.refused ? [r.why] : [], missing: r.failed || [] });
    } else if (msg.type === 'close') figma.closePlugin();
  } catch (e) { figma.ui.postMessage({ type: 'error', message: String((e && e.message) || e) }); }
};
`;
  const list = lines.filter((l) => !/^NEXT:/.test(l)).map((l) => `<li${/^\s/.test(l) ? ' class="sub"' : ''}>${esc(l.trim())}</li>`).join('\n');
  const ui = `<!doctype html>
<meta charset="utf-8">
<style>
  body { font: 12px/1.5 Inter, system-ui, sans-serif; margin: 0; color: var(--figma-color-text); background: var(--figma-color-bg); }
  header { padding: 16px 16px 8px; } h1 { font-size: 14px; margin: 0 0 4px; } p { margin: 0; color: var(--figma-color-text-secondary); }
  ul { margin: 0; padding: 8px 16px 8px 32px; max-height: 360px; overflow: auto; } li.sub { list-style: circle; color: var(--figma-color-text-secondary); }
  footer { display: flex; gap: 8px; padding: 12px 16px; border-top: 1px solid var(--figma-color-border); }
  button { font: inherit; padding: 6px 12px; border-radius: 6px; border: 1px solid var(--figma-color-border); background: var(--figma-color-bg); color: var(--figma-color-text); cursor: pointer; }
  button.go { background: var(--figma-color-bg-brand); color: var(--figma-color-text-onbrand); border-color: transparent; }
  #out { padding: 0 16px 12px; white-space: pre-wrap; }
</style>
<header><h1>Design system hand-back</h1><p>What the change does, as the engine wrote it. Nothing changes until you apply it, and Undo puts back what it replaced.</p></header>
<ul>
${list || '<li>Nothing to change.</li>'}
</ul>
<div id="out" role="status"></div>
<footer><button class="go" data-do="apply">Apply</button><button data-do="undo">Undo last change</button><button data-do="close">Close</button></footer>
<script>
  const out = document.getElementById('out');
  document.querySelector('footer').addEventListener('click', (e) => { const b = e.target.closest('[data-do]'); if (!b) return; out.textContent = b.dataset.do === 'close' ? '' : 'Working…'; parent.postMessage({ pluginMessage: { type: b.dataset.do } }, '*'); });
  onmessage = (e) => { const m = e.data.pluginMessage; if (!m) return; out.textContent = m.type === 'error' ? 'Stopped: ' + m.message : [m.changed.length ? 'Done: ' + m.changed.join('; ') : '', m.skipped.length ? 'Left: ' + m.skipped.join('; ') : '', m.missing.length ? 'Not found: ' + m.missing.join('; ') : ''].filter(Boolean).join('\\n') || 'Nothing changed.'; };
</script>
`;
  return { 'manifest.json': JSON.stringify(manifest, null, 2) + '\n', 'code.js': code, 'ui.html': ui };
}

export function writeFigmaPlugin(handbackDir, { script, lines }) {
  const dir = join(handbackDir, PLUGIN_DIR);
  mkdirSync(dir, { recursive: true });
  for (const [name, text] of Object.entries(pluginFiles({ script, lines }))) writeFileSync(join(dir, name), text);
  return join(dir, 'manifest.json');
}
