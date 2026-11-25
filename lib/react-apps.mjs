// react-apps.mjs - a React system built by Next.js or Create React App, drawn by the build its app framework resolves.
//
// The React harness (react-harness.mjs) draws a system's components with the project's own React, built by the
// project's own Vite or webpack config. A system built with Next.js or Create React App has neither config of its
// own: the framework makes its webpack config when it runs, so the harness found "no build tool" and fell back to the
// stand-in, which runs no hooks, context or portals. Vue had the same gap closed for Vue CLI by asking it for the
// webpack config it resolves (vue-harness.mjs); this asks each React framework the same:
//
//   Create React App   react-scripts' own config/webpack.config.js, called as `react-scripts start` calls it, from
//                      the project's folder (it reads its paths and its .env from there). Tried on react-scripts 5.
//   Next.js            the client config Next's own build makes (next/dist/build/webpack-config), with the project's
//                      next.config read as `next dev` reads it, and Next's own copy of webpack. Its compiler for
//                      components is Next's SWC (or the project's Babel, when it has a Babel config, as Next decides).
//                      Tried on Next 15. Next 16 builds with Turbopack by default and still ships this webpack
//                      config; a version whose builder answers differently is said, with its version, never guessed at.
//
// Each config is for the framework's own app, so a page built once keeps only the plugins that shape the code
// (KEEP), never the ones for its routes, manifests, hot reloading or dev server. Both compile components for fast
// refresh in development, which expects two globals its dev server provides: the page gives the no-op pair React's
// own refresh runtime uses when nothing listens. Next's CSS goes in before the marker its pages carry.
//
//   appBuild(ROOT, deps) → { kind: 'webpack', label, webpack, config, keep, head } | { why } | null (neither framework)
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { inProject } from './vue-harness.mjs';

const why1 = (e) => String(e?.message ?? e).split('\n')[0];
// What each framework's own dev command sets while it compiles: its Babel and SWC read it then too.
const DEV_ENV = { NODE_ENV: 'development', BABEL_ENV: 'development', NEXT_TELEMETRY_DISABLED: '1' };
const configOf = (ROOT, base) => ['.ts', '.mts', '.js', '.mjs', '.cjs'].map((e) => base + e).find((f) => existsSync(join(ROOT, f))) ?? null;

// The no-op refresh pair, as React's refresh runtime defines it with nothing listening: a component keeps its own
// identity and nothing is registered.
export const REFRESH_NOOP = '<script>window.$RefreshReg$=function(){};window.$RefreshSig$=function(){return function(t){return t}}</script>';
// Where Next's style loader puts a page's CSS, as Next's own pages mark it.
export const NEXT_CSS_MARKER = '<noscript id="__next_css__DO_NOT_USE__"></noscript>';

// The plugins a page built once keeps from a framework's config: what defines its globals and constants, what loads its
// CSS, and (Next's) the plugin whose trace its loaders write to. Everything else is for the framework's own app.
const CRA_KEEP = /^(DefinePlugin|ProvidePlugin|IgnorePlugin|MiniCssExtractPlugin|ModuleNotFoundPlugin|CaseSensitivePathsPlugin)$/;
const NEXT_KEEP = /^(ProfilingPlugin|DefinePlugin|ProvidePlugin|IgnorePlugin|MiniCssExtractPlugin|NextMiniCssExtractPlugin)$/;

const hasBrowserslist = (ROOT, pkg) => !!pkg.browserslist || ['.browserslistrc', 'browserslist'].some((f) => existsSync(join(ROOT, f)));

// Run with the environment the framework's own command sets, put back after: both read NODE_ENV when their config is
// made, and neither may change the engine's.
async function asDev(ROOT, fn) {
  const was = Object.fromEntries(Object.keys(DEV_ENV).map((k) => [k, process.env[k]]));
  Object.assign(process.env, DEV_ENV);
  try { return await inProject(ROOT, fn); }
  finally { for (const [k, v] of Object.entries(was)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; } }
}

async function craBuild(ROOT, pkg) {
  const req = createRequire(join(ROOT, 'package.json'));
  let at, webpack;
  try { at = req.resolve('react-scripts/config/webpack.config.js'); } catch { return { why: 'the project is a Create React App app with no react-scripts installed to build it with' }; }
  try { webpack = createRequire(req.resolve('react-scripts/package.json'))('webpack'); } catch { return { why: 'react-scripts is installed without the webpack it builds with' }; }
  // Loaded inside the environment too: react-scripts reads the project's folder and NODE_ENV as its modules load,
  // not only when the config is made.
  let config;
  try { config = await asDev(ROOT, () => req(at)('development')); } catch (e) { return { why: `Create React App's webpack config could not be made (${why1(e)})` }; }
  // Create React App asks for a browsers list before it builds; a project without one is built for today's browsers.
  if (!hasBrowserslist(ROOT, pkg) && String(config.target ?? '').startsWith('browserslist')) config = { ...config, target: 'web' };
  return { kind: 'webpack', label: 'Create React App', webpack, config, keep: (n) => CRA_KEEP.test(n), head: REFRESH_NOOP, env: DEV_ENV };
}

async function nextBuild(ROOT) {
  const req = createRequire(join(ROOT, 'package.json'));
  let version;
  try { version = JSON.parse(readFileSync(req.resolve('next/package.json'), 'utf8')).version; } catch { return { why: 'the project is a Next.js app with no next package installed to build it with' }; }
  try {
    const loadConfig = req('next/dist/server/config').default;
    const { PHASE_DEVELOPMENT_SERVER } = req('next/constants');
    const getBaseWebpackConfig = req('next/dist/build/webpack-config').default;
    const { trace } = req('next/dist/trace');
    const lib = req('next/dist/compiled/webpack/webpack');
    lib.init?.();
    const appDir = ['app', 'src/app'].map((d) => join(ROOT, d)).find((d) => existsSync(d));
    const pagesDir = ['pages', 'src/pages'].map((d) => join(ROOT, d)).find((d) => existsSync(d));
    const config = await asDev(ROOT, async () => {
      const nextConfig = await loadConfig(PHASE_DEVELOPMENT_SERVER, ROOT);
      return getBaseWebpackConfig(ROOT, {
        buildId: 'dse-harness', encryptionKey: Buffer.alloc(32).toString('base64'), config: nextConfig, compilerType: 'client', dev: true,
        entrypoints: {}, appDir, pagesDir, rewrites: { beforeFiles: [], afterFiles: [], fallback: [] }, originalRedirects: [],
        runWebpackSpan: trace('dse-harness'), previewProps: { previewModeId: 'dse', previewModeSigningKey: 'dse', previewModeEncryptionKey: 'dse' },
        allowedRevalidateHeaderKeys: [], fetchCacheKeyPrefix: '', edgePreviewProps: {}, jsConfig: {},
      });
    });
    if (!config?.module?.rules) throw new Error('its builder gave no rules');
    return { kind: 'webpack', label: `Next.js ${version}`, webpack: lib.webpack, config, keep: (n) => NEXT_KEEP.test(n), head: NEXT_CSS_MARKER + REFRESH_NOOP, env: DEV_ENV };
  } catch (e) { return { why: `Next.js ${version}'s webpack config could not be made (${why1(e)}): its components are drawn by the stand-in` }; }
}

// The framework that builds the project, when it is one of these: Next.js by its config or its package, Create React
// App by react-scripts. → a build, { why }, or null when it is neither.
export async function appBuild(ROOT) {
  let pkg = {};
  try { pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')); } catch { /* none */ }
  const deps = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };
  if (configOf(ROOT, 'next.config') || deps.next) return nextBuild(ROOT);
  if (deps['react-scripts']) return craBuild(ROOT, pkg);
  return null;
}

export const __test = { CRA_KEEP, NEXT_KEEP, hasBrowserslist };
