// The Figma webhook listener (webhook-server.mjs) takes only what it should: it listens on this computer unless a host
// is set, it will not start or register with no passcode, the passcode is compared in constant time, a body larger
// than any Figma event is refused, and events faster than a run takes are one run.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { webhookOptions, samePasscode, webhookHandler, MAX_BODY } from '../lib/webhook-server.mjs';
import { tempDir } from './helpers.mjs';

const ENGINE = dirname(dirname(fileURLToPath(import.meta.url)));

test('it listens on this computer unless a host is set, and reads its passcode from the config or the environment', () => {
  assert.deepEqual(webhookOptions({}, {}), { port: 3456, host: '127.0.0.1', secret: '', minGapMs: 60000 });
  assert.equal(webhookOptions({ webhook: { host: '0.0.0.0' } }, {}).host, '0.0.0.0', 'a host is only where the person sets one');
  assert.equal(webhookOptions({}, { FIGMA_WEBHOOK_SECRET: 's3cret' }).secret, 's3cret');
  assert.equal(webhookOptions({ webhook: { minIntervalSec: 5 } }, {}).minGapMs, 5000);
});

test('the passcode is the same one or nothing, whatever its length', () => {
  assert.equal(samePasscode('a-long-passcode', 'a-long-passcode'), true);
  assert.equal(samePasscode('a-long-passcodf', 'a-long-passcode'), false);
  assert.equal(samePasscode('a', 'a-long-passcode'), false, 'a shorter one is no answer, and says nothing of its length');
  assert.equal(samePasscode(undefined, 'a-long-passcode'), false);
  assert.equal(samePasscode('', ''), false, 'no passcode set matches nothing');
  assert.throws(() => webhookHandler({ secret: '', run: async () => {} }), /passcode is required/);
});

test('it will not start, nor register with Figma, with no passcode', () => {
  const dir = tempDir('webhook-');
  writeFileSync(join(dir, 'ds-config.json'), JSON.stringify({ figmaFileKey: 'ABC123' }));
  const env = { ...process.env, FIGMA_WEBHOOK_SECRET: '', FIGMA_TOKEN: 'figd_test' };
  delete env.FIGMA_WEBHOOK_SECRET;
  const serve = spawnSync(process.execPath, [join(ENGINE, 'lib', 'webhook-server.mjs')], { cwd: dir, encoding: 'utf8', env, timeout: 20000 });
  assert.equal(serve.status, 2, serve.stdout + serve.stderr);
  assert.match(serve.stderr, /No webhook passcode/);
  const setup = spawnSync(process.execPath, [join(ENGINE, 'lib', 'setup-webhook.mjs'), '--url', 'https://example.com/webhook'], { cwd: dir, encoding: 'utf8', env, timeout: 20000 });
  assert.equal(setup.status, 1, setup.stdout + setup.stderr);
  assert.match(setup.stderr, /No webhook passcode to register[\s\S]*for instance this fresh one: [\w-]{20,}/, 'never a default passcode every install shares');
});

// A real server on a free port of this computer, answering as the listener does.
const serve = async (opts) => {
  const handler = webhookHandler(opts);
  const server = createServer(handler);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const url = `http://127.0.0.1:${server.address().port}/webhook`;
  const post = (body) => fetch(url, { method: 'POST', body: typeof body === 'string' ? body : JSON.stringify(body) }).then(async (r) => ({ status: r.status, text: await r.text() }));
  return { handler, server, post, close: () => new Promise((r) => server.close(r)) };
};

test('a wrong passcode, no passcode, bad JSON and a body larger than any event are refused, and nothing runs', async () => {
  let runs = 0;
  const s = await serve({ secret: 'right', run: async () => { runs++; }, log: () => {} });
  try {
    assert.equal((await s.post({ passcode: 'wrong', event_type: 'FILE_UPDATE' })).status, 401);
    assert.equal((await s.post({ event_type: 'FILE_UPDATE' })).status, 401);
    assert.equal((await s.post('not json')).status, 400);
    const big = await s.post({ passcode: 'right', event_type: 'FILE_UPDATE', pad: 'x'.repeat(MAX_BODY + 10) }).catch(() => ({ status: 413 }));
    assert.equal(big.status, 413);
    assert.equal(runs, 0);
    // An event Figma sends that is not a change (its PING) is answered, and starts nothing.
    assert.equal((await s.post({ passcode: 'right', event_type: 'PING' })).status, 200);
    assert.equal(runs, 0);
  } finally { await s.close(); }
});

test('events faster than a run takes are one run after it, never a queue', async () => {
  let runs = 0, release;
  const gate = new Promise((r) => { release = r; });
  const s = await serve({ secret: 'right', minGapMs: 0, run: async () => { runs++; if (runs === 1) await gate; }, log: () => {} });
  try {
    const ok = { passcode: 'right', event_type: 'FILE_UPDATE', file_key: 'ABC123' };
    assert.equal((await s.post(ok)).status, 200, 'the first starts a run');
    const later = await Promise.all([s.post(ok), s.post(ok), s.post(ok)]);
    assert.deepEqual(later.map((r) => r.status), [202, 202, 202], 'the rest are told they run later');
    assert.equal(runs, 1, 'never two at once');
    release();
    for (let i = 0; i < 50 && !s.handler.idle(); i++) await new Promise((r) => setTimeout(r, 20));
    assert.equal(runs, 2, 'three events during a run are one run after it');
  } finally { await s.close(); }
});

test('a run sooner than the least time between two waits for it, then runs once', async () => {
  let t = 1000, runs = 0;
  const s = await serve({ secret: 'right', minGapMs: 60, now: () => t, run: async () => { runs++; }, log: () => {} });
  try {
    const ok = { passcode: 'right', event_type: 'LIBRARY_PUBLISH' };
    assert.equal((await s.post(ok)).status, 200);
    for (let i = 0; i < 50 && !s.handler.idle(); i++) await new Promise((r) => setTimeout(r, 5));
    assert.equal((await s.post(ok)).status, 202, 'too soon after the last');
    assert.equal(runs, 1);
    t += 60;
    for (let i = 0; i < 100 && !s.handler.idle(); i++) await new Promise((r) => setTimeout(r, 10));
    assert.equal(runs, 2, 'it ran once the least time had passed');
  } finally { await s.close(); }
});

test('started with a passcode, it listens on this computer only and answers its health check', async () => {
  const { spawn } = await import('node:child_process');
  const dir = tempDir('webhook-real-');
  writeFileSync(join(dir, 'ds-config.json'), JSON.stringify({ webhook: { port: 0, secret: 'right' } }));
  const p = spawn(process.execPath, [join(ENGINE, 'lib', 'webhook-server.mjs')], { cwd: dir, stdio: ['ignore', 'pipe', 'pipe'] });
  try {
    let out = '';
    for (let i = 0; i < 100 && !/Passcode:/.test(out); i++) { await new Promise((r) => setTimeout(r, 50)); out += p.stdout.read()?.toString() ?? ''; }
    assert.match(out, /Listening: http:\/\/127\.0\.0\.1:\d+\/webhook \(this computer only\)/, out);
    assert.match(out, /Passcode: {2}configured ✓ · at most one run every 60s/);
    const port = /127\.0\.0\.1:(\d+)\/health/.exec(out)[1];
    assert.notEqual(port, '0', 'the port it got, never the 0 it was given');
    assert.equal(await fetch(`http://127.0.0.1:${port}/health`).then((r) => r.text()), 'OK');
  } finally { p.kill(); }
});
