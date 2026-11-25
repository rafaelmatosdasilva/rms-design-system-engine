// integrations.mjs - the one list of what the engine works with, each with what proves it.
//
// The README shows, under each part of the features page, a badge for every tool and standard that part reads, runs,
// writes, publishes to or follows, and only one a real run has used. Those badges were kept by hand in one long
// line of HTML a part, and the features page names the same tools again in its own words: an integration could
// be added to one and not the other, keep a badge after its proof was gone, or work and go unseen.
//
// So each integration is written here once: its name as its badge says it, its own website, which parts use it
// and how, and what proves it, a test that runs the real tool or the run that showed it. Where what comes out is a
// file rather than the tool itself, the badge says the file and the mark says whose it is: the entry keeps the
// tool's name, and `label` is what that badge shows (`exports` is the only how that uses one today). Saying
// "exports WordPress" would be saying the engine exports the tool; it writes a theme.json for it. One the engine works with
// that is not proven yet, or that the owner keeps off the README, is listed apart with why (WAITING): it has no
// badge until that changes. test/integrations.test.mjs holds the README and the features page to this list.
//
//   INTEGRATIONS  [{ name, site, uses: { <part>: [<how>] }, proof, label }]   how: reads | runs | writes | exports | publishes | follows
//   WAITING       [{ name, why }]
//   badgesByPart() → { <part>: { <how>: [name] } }, the README's badges as this list says them

export const HOW = ['reads', 'runs', 'writes', 'exports', 'publishes', 'follows'];

// The parts, by their names on the features page.
const LIB = 'Check your Figma library rules', LINT = 'Lint your codebase rules', PARITY = 'Measure Figma-code parity';
const A11Y = 'Test accessibility', SPECS = 'Write component specs', GUIDE = 'Maintain usage guidelines';
const STYLE = 'Publish a living control center', PLAY = 'Try components in a playground', THEMES = 'Design themes over your system';
const F2C = 'Turn Figma into code', C2F = 'Turn code into Figma', DOCS = 'Build from your documentation';
const GENF = 'Generate in Figma from a prompt', GENC = 'Generate in code from a prompt', PROTO = 'Prototype with your real components';

// A real tool installed for the suite (test/.<name>-tools) is what makes a test a proof: the stand-in tests beside them
// are not one.
export const INTEGRATIONS = [
  { name: 'Figma', site: 'https://www.figma.com/', uses: { [LIB]: ['reads'], [PARITY]: ['reads'], [A11Y]: ['reads'], [SPECS]: ['reads'], [GUIDE]: ['reads'], [STYLE]: ['reads'], [PLAY]: ['reads'] }, proof: 'test/figma-capture.test.mjs, and the owner\'s own Figma files' },
  { name: 'Code Connect', site: 'https://developers.figma.com/docs/code-connect/', uses: { [PARITY]: ['reads'], [SPECS]: ['reads'] }, proof: 'test/codeconnect-check.test.mjs' },
  { name: 'Vue.js', site: 'https://vuejs.org/', uses: { [LINT]: ['reads'], [PARITY]: ['reads'], [A11Y]: ['reads'], [SPECS]: ['reads'], [GUIDE]: ['reads'], [STYLE]: ['reads'], [PLAY]: ['reads'] }, proof: 'test/vue-harness.test.mjs, with Vue installed (test/.vue-tools)' },
  { name: 'React', site: 'https://react.dev/', uses: { [LINT]: ['reads'], [PARITY]: ['reads'], [A11Y]: ['reads'], [PLAY]: ['reads'] }, proof: 'test/react-harness.test.mjs, with React installed (test/.react-tools)' },
  { name: 'Angular', site: 'https://angular.dev/', uses: { [LINT]: ['reads'], [PARITY]: ['reads'], [A11Y]: ['reads'], [PLAY]: ['reads'] }, proof: 'test/angular-harness.test.mjs, test/class-parity.test.mjs and test/class-a11y.test.mjs, with Angular installed (test/.angular-tools)' },
  { name: 'Lit', site: 'https://lit.dev/', uses: { [LINT]: ['reads'], [PARITY]: ['reads'], [A11Y]: ['reads'], [PLAY]: ['reads'] }, proof: 'test/lit-harness.test.mjs, test/class-parity.test.mjs and test/class-a11y.test.mjs, with Lit installed (test/.lit-tools)' },
  { name: 'Web Components', site: 'https://developer.mozilla.org/en-US/docs/Web/API/Web_components', uses: { [LINT]: ['reads'] }, proof: 'test/product-stories.test.mjs' },
  { name: 'Storybook', site: 'https://storybook.js.org/', uses: { [PARITY]: ['reads'], [A11Y]: ['reads'], [SPECS]: ['reads'], [GUIDE]: ['reads'], [PLAY]: ['reads'] }, proof: 'test/storybook-real.test.mjs, with Storybook installed (test/.storybook-tools)' },
  { name: 'shadcn/ui', site: 'https://ui.shadcn.com/', uses: { [LINT]: ['reads'], [PARITY]: ['reads'] }, proof: 'test/shadcn.test.mjs' },
  { name: 'CSS', site: 'https://developer.mozilla.org/en-US/docs/Web/CSS', uses: { [LINT]: ['reads'], [PARITY]: ['reads'], [A11Y]: ['reads'] }, proof: 'test/code-grammar.test.mjs' },
  { name: 'Sass', site: 'https://sass-lang.com/', uses: { [LINT]: ['reads'], [PARITY]: ['reads'], [A11Y]: ['reads'] }, proof: 'test/code-grammar.test.mjs' },
  { name: 'Markdown', site: 'https://commonmark.org/', uses: { [GUIDE]: ['reads', 'writes'], [STYLE]: ['reads'] }, proof: 'test/intent-sources.test.mjs' },
  { name: 'Chrome', site: 'https://www.google.com/chrome/', uses: { [PARITY]: ['runs'], [A11Y]: ['runs'], [STYLE]: ['runs'] }, proof: 'test/a11y-check.test.mjs, in Chrome on every run of the suite' },
  { name: 'Firefox', site: 'https://www.mozilla.org/firefox/', uses: { [PARITY]: ['runs'], [A11Y]: ['runs'] }, proof: 'test/a11y-browsers.test.mjs, in Firefox where it is installed' },
  { name: 'Playwright', site: 'https://playwright.dev/', uses: { [PARITY]: ['runs'], [A11Y]: ['runs'] }, proof: 'test/playwright.test.mjs' },
  { name: 'axe-core', site: 'https://github.com/dequelabs/axe-core', uses: { [A11Y]: ['runs'] }, proof: 'test/a11y-check.test.mjs' },
  { name: 'Screen readers', site: 'https://www.guidepup.dev/', uses: { [A11Y]: ['runs'] }, proof: 'test/a11y-by-hand.test.mjs' },
  { name: 'ESLint', site: 'https://eslint.org/', uses: { [LINT]: ['runs'] }, proof: 'test/a11y-lint.test.mjs, with ESLint installed (test/.lint-tools)' },
  { name: 'Stylelint', site: 'https://stylelint.io/', uses: { [LINT]: ['runs'] }, proof: 'test/code-grammar.test.mjs, with Stylelint installed (test/.lint-tools)' },
  { name: 'TypeScript', site: 'https://www.typescriptlang.org/', uses: { [LINT]: ['runs'] }, proof: 'test/component-harness.test.mjs' },
  { name: 'Vite', site: 'https://vite.dev/', uses: { [PLAY]: ['runs'] }, proof: 'test/vue-harness.test.mjs, built with Vite (test/.vue-tools)' },
  { name: 'Nuxt', site: 'https://nuxt.com/', uses: { [PLAY]: ['runs'] }, proof: 'test/vue-builds.test.mjs, with Nuxt installed (test/.nuxt-tools)' },
  { name: 'Git', site: 'https://git-scm.com/', uses: { [PARITY]: ['runs'], [STYLE]: ['runs'] }, proof: 'test/git-check.test.mjs' },
  { name: 'Figma MCP', site: 'https://developers.figma.com/docs/figma-mcp-server/', uses: { [LIB]: ['runs'] }, proof: 'test/capture-recipe.test.mjs, and the owner\'s captures through it' },
  { name: 'Figma Console MCP', site: 'https://www.npmjs.com/package/figma-console-mcp', uses: { [LIB]: ['runs'] }, proof: 'test/figma-console.test.mjs' },
  { name: 'figma-cli', site: 'https://github.com/silships/figma-cli', uses: { [LIB]: ['runs'] }, proof: 'test/figma-console.test.mjs' },
  { name: 'GitHub', site: 'https://github.com/', uses: { [SPECS]: ['publishes'], [GUIDE]: ['publishes'], [STYLE]: ['publishes'] }, proof: 'test/publish-job.test.mjs, and the public example control center' },
  { name: 'GitLab', site: 'https://gitlab.com/', uses: { [SPECS]: ['publishes'], [GUIDE]: ['publishes'], [STYLE]: ['publishes'] }, proof: 'test/publish-job.test.mjs' },
  { name: 'DSDS', site: 'https://designsystemdocspec.org/', uses: { [SPECS]: ['writes'] }, proof: 'test/contract-dsds.test.mjs, against the pinned DSDS release (test/.dsds)' },
  { name: 'W3C DTCG', site: 'https://www.designtokens.org/', uses: { [SPECS]: ['writes'] }, proof: 'test/dtcg.test.mjs' },
  // The Tokens page saves the system's tokens for a tool to read: the badge says the file, its mark says whose it is.
  { name: 'W3C DTCG', label: 'tokens.json', site: 'https://www.designtokens.org/', uses: { [STYLE]: ['exports'] }, proof: 'test/token-exports.test.mjs' },
  { name: 'Tokens Studio', label: 'tokens-studio.json', site: 'https://tokens.studio/', uses: { [STYLE]: ['exports'] }, proof: 'test/token-exports.test.mjs' },
  // The contracts' WordPress view (contracts/wordpress) is loaded into a real WordPress and read back as it resolves it.
  { name: 'WordPress', label: 'theme.json', site: 'https://wordpress.org/', uses: { [STYLE]: ['exports'], [SPECS]: ['exports'] }, proof: 'test/wordpress-real.test.mjs, in WordPress Playground (test/.wordpress-tools), and test/wordpress-theme.test.mjs with git applying its patch' },
  { name: 'llms.txt', site: 'https://llmstxt.org/', uses: { [SPECS]: ['writes'] }, proof: 'test/contract-complete.test.mjs' },
  { name: 'WCAG 2.2 A / AA', site: 'https://www.w3.org/TR/WCAG22/', uses: { [A11Y]: ['follows'] }, proof: 'test/a11y-complete.test.mjs' },
  { name: 'WAI-ARIA APG', site: 'https://www.w3.org/WAI/ARIA/apg/', uses: { [A11Y]: ['follows'] }, proof: 'test/wcag21.test.mjs' },
];

// What the engine works with and shows no badge for, each with why. A name here never has a badge.
export const WAITING = [
  { name: 'Safari', why: 'the engine draws in Safari when asked (WebKit), and no full run has used it yet, so it has no badge until one does' },
  { name: 'MCP', why: 'the owner took it off the README (17 November 2026): the README names only where the whole engine runs, and MCP answers four questions' },
  { name: 'webpack', why: 'the engine draws a Vue and a React system\'s components with the project\'s own webpack, proven by test/vue-builds.test.mjs and test/react-builds.test.mjs with webpack installed (test/.vue-cli-tools, test/.react-tools), and it has no badge until its badge image is drawn with the others on the owner\'s profile' },
  { name: 'Svelte', why: 'parked by the owner (20 November 2026): its components are drawn in the browser by the project\'s own Svelte (taken up on 23 November 2026, that item only), and it has no badge until the owner takes Svelte back up' },
];

export const PARTS = [LIB, LINT, PARITY, A11Y, SPECS, GUIDE, STYLE, PLAY, THEMES, F2C, C2F, DOCS, GENF, GENC, PROTO];

// The README's badges as this list says them: per part, per way, the names in the order they are listed here.
// The name a badge shows: the file where the entry gives one, else the tool's own name.
export const badgeName = (it) => it.label ?? it.name;

export function badgesByPart(list = INTEGRATIONS) {
  const out = {};
  for (const it of list) for (const [part, hows] of Object.entries(it.uses)) for (const how of hows) ((out[part] ??= {})[how] ??= []).push(badgeName(it));
  return out;
}
