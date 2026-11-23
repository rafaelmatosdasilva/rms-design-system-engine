// product-stories.mjs - a product's screens as stories the system's team opens in its own Storybook.
//
// A system's team works in its Storybook, and a product's screens are drawn in the engine's own workshop
// (product-screens.mjs, --product-screens <product>), where nobody on that team looks. So each screen, drawn exactly as
// the workshop draws it (the prototype route's page: the system's own CSS, components and scripts, nothing of the
// product's), is also written as one story file, in a folder of the engine's own:
//   .design-system-engine-out/workshop/<product>/stories/<screen>.stories.js
// The team points its Storybook at that folder (one line in its stories list), and the screens show beside its
// components. The engine never writes into the team's Storybook, its config or the product: the line is said, and the
// team adds it.
//
// A story shows the drawn page in a frame of its own, so it imports nothing and looks the same in any Storybook: the
// page carries every style and script it needs, and the team's own styles never reach into it. Only how a frame is made
// differs from one framework to the next, read from the framework the team's Storybook names (.storybook/main.*):
// Vue, React, and HTML or web components. Another framework is said plainly, and no file is written for it.
//
//   storybookRenderer(ROOT)                          → { renderer: 'vue3' | 'react' | 'html' | null, framework, file }
//   screenStory({ product, screen, page, renderer }) → the story file's text
//   storiesLine(ROOT, dir, configFile)              → the entry to add to the team's stories list
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative, dirname } from 'node:path';

// The framework a Storybook names in its main config, as Storybook spells it ('@storybook/vue3-vite',
// { name: '@storybook/react-vite' }), → the renderer that draws its stories.
export function rendererOf(framework) {
  const f = String(framework ?? '').toLowerCase();
  if (/vue3/.test(f)) return 'vue3';
  if (/react|nextjs/.test(f)) return 'react';
  if (/web-components|(^|[/-])html(-|$)/.test(f)) return 'html';
  return null;
}

// The team's Storybook: its main config in .storybook (any of the names Storybook reads), and the framework it names.
export function storybookRenderer(ROOT) {
  const dir = join(ROOT, '.storybook');
  let names = [];
  try { names = readdirSync(dir); } catch { return { renderer: null, framework: null, file: null }; }
  const file = names.find((n) => /^main\.(c|m)?(j|t)s$/.test(n));
  if (!file) return { renderer: null, framework: null, file: null };
  const text = readFileSync(join(dir, file), 'utf8');
  const framework = /framework\s*:\s*(?:\{[^}]*?name\s*:\s*)?['"`]([^'"`]+)['"`]/.exec(text)?.[1] ?? null;
  return { renderer: rendererOf(framework), framework, file: `.storybook/${file}` };
}

// A name a story file and a story title can carry.
const fileSafe = (s) => String(s).trim().replace(/\.[^./]+$/, '').replace(/[^A-Za-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || 'screen';
const titleSafe = (s) => String(s).trim().replace(/\.[^./]+$/, '').replace(/[/\\]+/g, ' / ').replace(/[^\w\s/-]+/g, ' ').replace(/\s+/g, ' ').trim() || 'Screen';
export const storyFileOf = (screen) => `${fileSafe(String(screen).split('/').pop())}.stories.js`;

// How each framework's Storybook is handed a frame showing the page.
const FRAME_STYLE = 'border:0;display:block;width:100%;height:100vh';
const RENDER = {
  vue3: { head: "import { h } from 'vue';", render: "() => ({ render: () => h('iframe', { srcdoc: PAGE, title: TITLE, style: STYLE }) })" },
  react: { head: "import { createElement } from 'react';", render: "() => createElement('iframe', { srcDoc: PAGE, title: TITLE, style: { border: 0, display: 'block', width: '100%', height: '100vh' } })" },
  html: { head: '', render: "() => { const f = document.createElement('iframe'); f.srcdoc = PAGE; f.title = TITLE; f.style.cssText = STYLE; return f; }" },
};

// One screen's story. page: the drawn page's HTML. → the file's text, or null for a renderer it has no frame for.
export function screenStory({ product, screen, page, renderer, parts = null }) {
  const r = RENDER[renderer];
  if (!r) return null;
  const name = titleSafe(String(screen).split('/').pop());
  const said = parts ? ` ${parts.system} parts the system's, ${parts.product} the product's own, ${parts.standIn} stand-ins.` : '';
  return [
    `// ${name}, a screen of ${product}, drawn from the system's components by rms-design-system-engine (--product-screens ${product} --stories).${said}`,
    '// Written again on each run: change the screen in the product, never here.',
    ...(r.head ? [r.head] : []),
    `const PAGE = ${JSON.stringify(String(page)).replace(/<\/script/gi, '<\\/script')};`,
    `const TITLE = ${JSON.stringify(`${name} · ${product}`)};`,
    `const STYLE = ${JSON.stringify(FRAME_STYLE)};`,
    `export default { title: ${JSON.stringify(`Product screens/${titleSafe(product)}/${name}`)}, parameters: { layout: 'fullscreen' } };`,
    `export const AsDrawn = { name: 'As drawn from the system', render: ${r.render} };`,
    '',
  ].join('\n');
}

// The entry the team adds to its stories list, from its Storybook's folder to the engine's. dir: the stories folder,
// relative to the project. → '../.design-system-engine-out/workshop/shop/stories/*.stories.js'
export function storiesLine(ROOT, dir, configFile = '.storybook/main.js') {
  const from = dirname(join(ROOT, configFile));
  return `${relative(from, join(ROOT, dir)).split(/[\\/]+/).join('/')}/*.stories.js`;
}
