// showroom-bundle.mjs - the Showroom's screens built to run on the style guide's page: each showroom/<Screen>.vue and
// the system's components it uses, compiled by the project's own Vite (its config, its plugins) with what the
// project's entry installs on its app (appSetup: its i18n, its global components), into one script and one stylesheet.
// The page mounts each screen where its drawing is, so a person uses it as the product does: a row's checkbox selects
// the row, the header's selects every row, a tab or a menu item is chosen, all through the system's own code.
//
//   showroomBundle(ROOT, screens) → { js, css } or { why }   screens: { key: file relative to ROOT }
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { OUT_DIR } from './names.mjs';
import { projectBuild, appSetup, appPlugins } from './vue-harness.mjs';

export async function showroomBundle(ROOT, screens = {}, cfg = {}) {
  const keys = Object.keys(screens);
  if (!keys.length) return { why: 'no screen' };
  const pb = await projectBuild(ROOT);
  if (pb.kind !== 'vite') return { why: pb.why ?? `the project builds with ${pb.label}, and only a Vite build is bundled for the Showroom yet` };
  const dir = join(ROOT, OUT_DIR, 'showroom');
  mkdirSync(dir, { recursive: true });
  const fromRoot = (f) => '/' + String(f).split(sep).join('/').replace(/^\/+/, '');
  const setup = appSetup(ROOT).filter((x) => x.kind !== 'import');
  // The page already carries the system's own stylesheets: the bundle brings only its components' rules, never the
  // project's global ones (its body's font and overflow are the product's page, not the style guide's).
  // Its store and its router, as the product's app gives them (a store of its own; a router on a page of its own).
  const { pinia, router } = appPlugins(ROOT);
  const entry = `import { createApp, h } from 'vue';
${pinia ? "import { createPinia } from 'pinia';" : ''}
${router ? "import { createRouter, createMemoryHistory } from 'vue-router';" : ''}
${setup.map((x, i) => `import ${x.named ? `{ ${x.named} as S${i} }` : `S${i}`} from ${JSON.stringify(x.spec)};`).join('\n')}
${keys.map((k, i) => `import V${i} from ${JSON.stringify(fromRoot(screens[k]))};`).join('\n')}
const SCREENS = { ${keys.map((k, i) => `${JSON.stringify(k)}: V${i}`).join(', ')} };
const SETUP = [${setup.map((x, i) => `{ kind: ${JSON.stringify(x.kind)}, name: ${JSON.stringify(x.name ?? null)}, v: S${i} }`).join(', ')}];
window.__dseShowroom = {
  keys: Object.keys(SCREENS),
  mount(el, key) {
    const C = SCREENS[key];
    if (!C) return null;
    const app = createApp({ render: () => h(C) });
    app.config.warnHandler = () => {};
    for (const x of SETUP) {
      try {
        if (x.kind === 'use') app.use(x.v);
        else if (x.kind === 'component') app.component(x.name, x.v);
        else if (x.kind === 'directive') app.directive(x.name, x.v);
      } catch (e) { /* one the app cannot take twice: the rest still installed */ }
    }
    ${pinia ? 'if (!app.config.globalProperties.$pinia) app.use(createPinia());' : ''}
    ${router ? "if (!app.config.globalProperties.$router) app.use(createRouter({ history: createMemoryHistory(), routes: [{ path: '/:any(.*)*', component: { render: () => null } }] }));" : ''}
    el.innerHTML = '';
    app.mount(el);
    return app;
  }
};
`;
  const entryFile = join(dir, 'entry.js');
  writeFileSync(entryFile, entry);
  let out;
  try {
    out = await pb.vite.build({
      root: ROOT, configFile: pb.config ? join(ROOT, pb.config) : false, plugins: pb.plugins, logLevel: 'silent', mode: 'production',
      define: { 'process.env.NODE_ENV': JSON.stringify('production') },
      build: {
        write: false, emptyOutDir: false, copyPublicDir: false, cssCodeSplit: false, minify: true, assetsInlineLimit: 1e8, sourcemap: false,
        lib: { entry: entryFile, formats: ['iife'], name: 'DseShowroomBundle', fileName: () => 'showroom.js' },
        rollupOptions: { output: { inlineDynamicImports: true } },
      },
    });
  } catch (e) { return { why: `the project's Vite could not build the Showroom (${String(e?.message ?? e).split('\n')[0]})` }; }
  const files = [].concat(out).flatMap((o) => o.output ?? []);
  const js = files.filter((f) => f.type === 'chunk').map((f) => f.code).join('\n');
  const css = files.filter((f) => f.type === 'asset' && /\.css$/.test(f.fileName)).map((f) => String(f.source)).join('\n');
  return js ? { js, css } : { why: 'the Showroom\'s build gave no script' };
}

export const relativeTo = (ROOT, f) => relative(ROOT, f).split(sep).join('/');
