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
  // A class component is its framework's by its class (Angular's @Component, Lit's LitElement, a plain HTMLElement),
  // as the rest of the engine tells them apart; a React .js file by what it returns.
  const { classKind } = await import('./class-components.mjs');
  const { reactFile } = await import('./component-source.mjs');
  const textOf = (f) => { try { return readFileSync(join(ROOT, f), 'utf8'); } catch { return ''; } };
  const kindOf = (f) => {
    if (/\.vue$/.test(f)) return 'vue';
    if (/\.svelte$/.test(f)) return 'svelte';
    const t = /\.(m?js|ts|jsx|tsx)$/.test(f) ? textOf(f) : '';
    const k = t ? classKind(f, t) : null;
    if (k) return k;
    return /\.(jsx|tsx)$/.test(f) || reactFile(f, t) ? 'jsx' : 'other';
  };
  const kinds = comps.map((c) => ({ c, kind: kindOf(c.file) }));
  // With no component yet, the one framework the project installs: Angular, Lit, React alone, else Vue as before.
  // What the config says first (ds-config.json framework: a plain Web Components system has no package to tell it by),
  // then what its own components are written in.
  const stated = { react: 'jsx', jsx: 'jsx', shadcn: 'jsx', vue: 'vue', angular: 'angular', lit: 'lit', 'web component': 'web component', 'web components': 'web component' }[String(cfg.framework ?? '').toLowerCase()] ?? null;
  const framework = stated ?? top(kinds.map((k) => k.kind))
    ?? (installed['@angular/core'] ? 'angular' : installed.lit || installed['lit-element'] ? 'lit' : (installed.react || installed.next) && !(installed.vue || installed.nuxt) ? 'jsx' : 'vue');
  const mine = kinds.filter((k) => k.kind === framework).map((k) => k.c);
  const folder = (/sits in ([^\s(]+?)\/? \(|sits in ([^\s]+?)\/$/.exec(says('code-file-folder')) ?? [])[1] ?? top(comps.map((c) => dirname(c.file))) ?? 'src/components';
  const kebabOf = (n) => String(n).replace(/([a-z0-9])([A-Z])/g, '$1-$2').split(/[^A-Za-z0-9]+/).filter(Boolean).join('-').toLowerCase();
  const pascalOf = (n) => kebabOf(n).split('-').map((w) => w[0].toUpperCase() + w.slice(1)).join('');
  // The prefix the system's own tags share (acme- in acme-button and acme-chip), given to a new one's tag.
  const tags = mine.map((c) => c.api?.tag).filter((t) => /^[a-z][\w]*-/.test(String(t)));
  const prefix = tags.length && tags.every((t) => t.split('-')[0] === tags[0].split('-')[0]) ? `${tags[0].split('-')[0]}-` : null;
  const withPrefix = (t) => (prefix && !t.startsWith(prefix) ? prefix + t : t);
  const angularSuffix = framework === 'angular' && (!mine.length || mine.some((c) => /\.component\.ts$/.test(c.file)));
  const classExt = framework === 'angular' ? 'ts' : top(mine.map((c) => (/\.ts$/.test(c.file) ? 'ts' : 'js'))) ?? (installed.typescript ? 'ts' : 'js');
  const componentSuffix = mine.length ? mine.some((c) => /Component\b/.test(textOf(c.file).match(/export\s+class\s+(\w+)/)?.[1] ?? '')) : null;
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
    tagOf: (n) => comps.find((c) => c.name === n)?.api?.tag ?? withPrefix(String(n).replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase()),
    // A class framework's file and class, named as its own components are (acme-button.component.ts and
    // AcmeButtonComponent, acme-chip.ts and AcmeChip), else as its framework names them.
    classFileOf: (n) => `${kebabOf(n)}${angularSuffix ? '.component' : ''}.${classExt}`,
    classNameOf: (n) => `${pascalOf(n)}${framework === 'angular' && (componentSuffix ?? true) ? 'Component' : ''}`,
  };
  return { ctx, framework, comps };
}

export async function readBack(model, ctx, out, framework) {
  const { anatomyOf } = await import('./code-grammar.mjs');
  const { textComponentApi } = await import('./component-source.mjs');
  const { checkAgainstSpec } = await import('./spec-to-code.mjs');
  const api = textComponentApi(out.file, out.text);
  const styleOnly = out.text.replace(/[\s\S]*<style[^>]*>/, (m) => m.replace(/[^\n]/g, ' ')).replace(/<\/style>[\s\S]*/, '');
  // An Angular, Lit or plain Web Components file holds its own styles, read where it writes them (code-grammar.mjs).
  const { classStyles } = await import('./code-grammar.mjs');
  const own = ['angular', 'lit', 'web component'].includes(framework) ? classStyles(out.file, out.text) : null;
  const styles = framework === 'vue' ? [{ file: out.file, text: styleOnly }] : own ? [own] : (out.also ?? []).filter((f) => /\.(s?css)$/.test(f.file));
  const anatomy = anatomyOf({ file: out.file, text: out.text, styles, root: model.name.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase(), props: Object.keys(api.props ?? {}) });
  return checkAgainstSpec(model, ctx, anatomy, Object.keys(api.props ?? {}));
}
