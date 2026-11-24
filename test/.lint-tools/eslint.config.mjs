// The engine's coding standards, as ESLint checks them (docs/development.md#coding-standards). Run by
// test/lint.test.mjs, from the repository's root: node test/.lint-tools/node_modules/eslint/bin/eslint.js
//   -c test/.lint-tools/eslint.config.mjs
//
// ESLint's recommended rules, with the few patterns the engine uses on purpose said here once, each with why, rather
// than turned off quietly line by line.
import js from '@eslint/js';
import globals from 'globals';

export default [
  // This file lives with the tool; what it checks is the repository two folders up.
  { basePath: '../..' },
  { ignores: ['test/**', 'templates/**', '**/node_modules/**', '.design-system-engine-out/**', '.claude/**'] },
  js.configs.recommended,
  {
    files: ['lib/**/*.mjs', 'lib/**/*.js', '*.mjs', '.githooks/*.mjs'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      // A module runs in Node, and some of its functions are sent into a page to run there (wcag-page.js, the
      // expressions the browser checks evaluate), so both sets of globals are real here.
      globals: { ...globals.node, ...globals.browser },
    },
    linterOptions: { reportUnusedDisableDirectives: 'error' },
    rules: {
      // A `catch {}` that ignores a failure is how the engine degrades safely: a file it cannot read, a browser that
      // closed, a cache it cannot write. Any other empty block is still a mistake.
      'no-empty': ['error', { allowEmptyCatch: true }],
      // Text read from terminals, files and other tools carries control characters, and the engine matches them on
      // purpose to strip or read them.
      'no-control-regex': 'off',
      // An error caught only to be ignored, and a rest sibling taken to leave one key out, are not unused. A function's
      // parameters are its signature, which callers rely on by position, so one it no longer reads is left in place.
      'no-unused-vars': ['error', { args: 'none', caughtErrors: 'none', ignoreRestSiblings: true }],
      // Code built from text and run is refused unless a line says why (the page scripts sent to a browser).
      'no-new-func': 'error',
    },
  },
];
