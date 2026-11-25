// A system read from its code alone, with tokens in its CSS and no Figma: its control center lists those tokens on the
// Tokens page, in every mode the project sets, and offers the same three downloads (DTCG, Tokens Studio, WordPress) a
// system with Figma's variables gets, made the one way they are always made (token-exports.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { codeVariables } from '../lib/styleguide-data.mjs';
import { rootTokens } from '../lib/css-source.mjs';
import { readPage } from '../lib/styleguide-files.mjs';
import { findChrome } from '../lib/cdp.mjs';
import { budget, tempDir } from './helpers.mjs';

const ENGINE = dirname(dirname(fileURLToPath(import.meta.url)));
const CHROME = findChrome({ playwright: true });
const TOKENS = ':root { --acme-accent: #1f5fd6; --acme-surface: #ffffff; --acme-ink: var(--acme-accent); --acme-radius-m: 6px; --acme-space-s: 8px; }\n.theme-dark { --acme-surface: #10161b; }\n';
const MODES = [{ name: 'Light', snapshotKey: 'light', cssSelector: 'root' }, { name: 'Dark', snapshotKey: 'dark', cssSelector: 'class:theme-dark' }];

test("a system's own token file read as its tokens: every mode it sets, an alias as one, each in the file it is declared in", () => {
  const rows = codeVariables([{ file: 'src/styles/tokens.css', text: TOKENS }], MODES, rootTokens);
  const by = Object.fromEntries(rows.map((r) => [r.var, r]));
  assert.deepEqual(rows.map((r) => r.var), ['--acme-accent', '--acme-surface', '--acme-ink', '--acme-radius-m', '--acme-space-s']);
  assert.deepEqual(by['--acme-surface'].values, ['#ffffff', '#10161b'], 'its dark value from the dark mode\'s own rule');
  assert.deepEqual(by['--acme-surface'].modes, ['Light', 'Dark']);
  assert.deepEqual(by['--acme-ink'].aliases, ['acme-accent', 'acme-accent'], 'a token that is only another\'s var() points at it');
  assert.deepEqual(rows.map((r) => r.type), ['colour', 'colour', 'colour', 'radius', 'spacing'], 'an alias styles what it points at');
  assert.equal(by['--acme-accent'].collection, 'tokens.css', 'its collection is the file it is declared in, never one made up');
  // A project that sets no modes: one value a token, never a light and a dark it did not write.
  assert.deepEqual(codeVariables([{ file: 't.css', text: ':root { --x-gap: 4px; }' }], [], rootTokens)[0].modes, ['Value']);
});

const READY = CHROME && typeof WebSocket !== 'undefined' ? false : 'no Chrome';
test('its control center has the Tokens page and the three downloads, as a system with Figma has', { skip: READY, timeout: budget(400000) }, async () => {
  const dir = tempDir('code-only-tokens-');
  mkdirSync(join(dir, 'src', 'styles'), { recursive: true });
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'acme-ui', private: true }));
  writeFileSync(join(dir, 'src', 'styles', 'tokens.css'), TOKENS);
  writeFileSync(join(dir, 'ds-config.json'), JSON.stringify({ name: 'Acme', paths: { themeCSS: 'src/styles/tokens.css' }, figma: { modes: MODES } }));
  spawnSync('git', ['init', '-q'], { cwd: dir });
  const r = spawnSync(process.execPath, [join(ENGINE, 'audit.mjs'), '--styleguide', '--no-a11y-bake'], { cwd: dir, encoding: 'utf8', env: { ...process.env, NO_COLOR: '1', CHROME_PATH: CHROME }, timeout: budget(380000) });
  const file = join(dir, '.design-system-engine-out', 'styleguide', 'index.html');
  const data = JSON.parse(readPage(file).match(/id="sg-data">([\s\S]*?)<\/script>/)?.[1] ?? 'null');
  assert.ok(data, `${r.stdout}\n${r.stderr}`.slice(-1500));
  assert.equal(data.allVars.length, 5);
  assert.match(data.tokenFiles.dtcg.$description, /from the code's own token files/);
  assert.equal(data.tokenFiles.dtcg['acme-ink'].$value, '{acme-accent}', 'an alias is a DTCG reference');
  assert.equal(data.tokenFiles.dtcg['acme-surface'].$extensions['com.rms.design-system-engine'].modes.Dark.hex, '#10161b');
  assert.ok(data.tokenFiles.tokensStudio && data.tokenFiles.wordpress, 'Tokens Studio and WordPress made from the same dictionary');
  const { launchChrome, connectCDP, openPage, waitForTrue, FILE_PAGE_LOADED } = await import('../lib/cdp.mjs');
  const c = await launchChrome(CHROME);
  try {
    const { send, close } = await connectCDP(c.wsUrl);
    const { sessionId } = await openPage(send, `file://${file}#tokens`);
    await waitForTrue(send, sessionId, FILE_PAGE_LOADED);
    const inPage = async (expression) => (await send('Runtime.evaluate', { expression, returnByValue: true }, sessionId)).result.value;
    let seen = null;
    for (let i = 0; i < 100 && !seen; i++) { if (i) await new Promise((res) => setTimeout(res, 100)); seen = await inPage(`(() => { const s = document.getElementById('tokens'); return s && s.querySelector('[data-tk-file]') ? { files: [...s.querySelectorAll('[data-tk-file]')].map((b) => b.getAttribute('data-tk-file')), text: s.textContent } : null; })()`); }
    close();
    assert.ok(seen, 'the Tokens page is there, with its downloads');
    assert.deepEqual(seen.files, ['dtcg', 'studio', 'wordpress']);
    assert.match(seen.text, /acme-surface #ffffff #10161b/, 'it lists the code\'s own tokens, each mode a column');
  } finally { c.kill(); }
});
