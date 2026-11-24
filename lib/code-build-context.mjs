// code-build-context.mjs - how this system writes a component's code, read from its own code: its framework, the folder
// and the case of its files, how it names a part's class and a prop, the custom property each variable is, how it sets a
// text style and the tag each of its components has. spec-to-code.mjs writes a file with it, and the file is read back
// with the code's own reader against what it was written from.
//
//   codeBuildContext(ROOT, cfg, { props, vars, name }) → { ctx, framework, comps }
//   readBack(model, ctx, out, framework) → what differs from the model, read back as the engine reads any code
import { dirname, join } from 'node:path';
import { readFileSync } from 'node:fs';

export async function codeBuildContext(ROOT, cfg, { props = {}, vars = {}, name = '' } = {}) {
  const { codeInputs, codeGrammarOf } = await import('./code-grammar.mjs');
  const comps = await codeInputs(ROOT, cfg, { figmaProps: props });
  const g = codeGrammarOf({ components: comps, textStyles: vars.typography ?? null }).code;
  const says = (id) => g.rules.find((r) => r.id === id)?.says ?? '';
  const top = (xs) => [...xs.reduce((m, x) => m.set(x, (m.get(x) ?? 0) + 1), new Map())].sort((a, b) => b[1] - a[1])[0]?.[0];
  // With no component written yet, what the project installs says it: React alone is JSX, else Vue as before.
  const installed = (() => { try { const p = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')); return { ...p.dependencies, ...p.devDependencies, ...p.peerDependencies }; } catch { return {}; } })();
  const framework = top(comps.map((c) => (/\.vue$/.test(c.file) ? 'vue' : /\.(jsx|tsx)$/.test(c.file) ? 'jsx' : /\.svelte$/.test(c.file) ? 'svelte' : 'other')))
    ?? ((installed.react || installed.next) && !(installed.vue || installed.nuxt) ? 'jsx' : 'vue');
  const folder = (/sits in ([^\s(]+?)\/? \(|sits in ([^\s]+?)\/$/.exec(says('code-file-folder')) ?? [])[1] ?? top(comps.map((c) => dirname(c.file))) ?? 'src/components';
  const textWays = new Map();
  for (const a of Object.values(g.anatomy)) for (const t of a.text ?? []) if (t.style && !textWays.has(t.style)) textWays.set(t.style, /^@/.test(t.prop) ? { how: 'include', name: t.value } : t.prop === 'class' ? { how: 'class', name: t.value } : null);
  const { resolveNamingSpec, tokenToVar } = await import('./naming-convention.mjs');
  const nspec = resolveNamingSpec(cfg);
  const ctx = {
    framework, folder: String(folder).replace(/\/(<family>\/?)?$/, '') + (/<family>/.test(says('code-file-folder')) ? `/${String(name).replace(/([a-z0-9])([A-Z]).*/, '$1').toLowerCase()}` : ''),
    fileCase: (/in (\S+)$/.exec(says('code-file-name-case')) ?? [])[1] ?? 'PascalCase',
    partWay: /__/.test(says('code-part-class')) ? '<root>__…' : /name of its own/.test(says('code-part-class')) ? 'own name' : /-label|\(\w+-\w+\)/.test(says('code-part-class')) ? '<root>-…' : '<root>__…',
    propCase: (/in (\S+)$/.exec(says('code-boolean-prop-case')) ?? [])[1] ?? 'camelCase',
    cssVarOf: (v) => { try { const c = tokenToVar(v, nspec, { raw: true }); return c ? (String(c).startsWith('--') ? c : `--${c}`) : null; } catch { return null; } },
    textWayOf: (st) => textWays.get(st) ?? null,
    tagOf: (n) => comps.find((c) => c.name === n)?.api?.tag ?? String(n).replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase(),
  };
  return { ctx, framework, comps };
}

export async function readBack(model, ctx, out, framework) {
  const { anatomyOf } = await import('./code-grammar.mjs');
  const { textComponentApi } = await import('./component-source.mjs');
  const { checkAgainstSpec } = await import('./spec-to-code.mjs');
  const api = textComponentApi(out.file, out.text);
  const styleOnly = out.text.replace(/[\s\S]*<style[^>]*>/, (m) => m.replace(/[^\n]/g, ' ')).replace(/<\/style>[\s\S]*/, '');
  const styles = framework === 'vue' ? [{ file: out.file, text: styleOnly }] : (out.also ?? []).filter((f) => /\.(s?css)$/.test(f.file));
  const anatomy = anatomyOf({ file: out.file, text: out.text, styles, root: model.name.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase(), props: Object.keys(api.props ?? {}) });
  return checkAgainstSpec(model, ctx, anatomy, Object.keys(api.props ?? {}));
}
