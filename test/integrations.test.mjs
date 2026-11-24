// The one list of what the engine works with (integrations.mjs), and the README and features page held to it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { INTEGRATIONS, WAITING, PARTS, HOW, badgesByPart, badgeName } from '../lib/integrations.mjs';

const ENGINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => readFileSync(join(ENGINE, f), 'utf8');

// Each README part's badges, per way, as the README draws them: [{ part, how, name, site }].
function readmeBadges() {
  const out = [];
  for (const line of read('README.md').split('\n').filter((l) => l.startsWith('| <dl><dd><h3>'))) {
    const part = line.match(/features\.md#[^"]+">([^<]+)<\/a><\/h3>/)?.[1];
    const pieces = line.split(/<img [^>]*src="[^"]*label-(reads|runs|writes|exports|publishes|follows)\.svg"[^>]*\/>/);
    for (let i = 1; i < pieces.length; i += 2) for (const m of pieces[i + 1].matchAll(/<a href="([^"]+)"><img [^>]*alt="([^"]+)"/g)) out.push({ part, how: pieces[i], name: m[2], site: m[1] });
  }
  return out;
}

test('the list is whole: every integration has a name, its own site, a part it serves and its proof', () => {
  const names = INTEGRATIONS.map(badgeName);
  assert.equal(new Set(names).size, names.length, 'each badge once');
  for (const it of INTEGRATIONS) {
    assert.match(it.site, /^https:\/\/(?!github\.com\/rafaelmatosdasilva\/rms-design-system-engine)/, `${it.name}: its own site, never a page of this repository`);
    assert.ok(Object.keys(it.uses).length, `${it.name}: a part that uses it`);
    for (const [part, hows] of Object.entries(it.uses)) {
      assert.ok(PARTS.includes(part), `${it.name}: "${part}" is a part of the features page`);
      for (const h of hows) assert.ok(HOW.includes(h), `${it.name}: "${h}" is one of ${HOW.join(', ')}`);
    }
    // What proves it: the test that runs it, which must exist.
    const file = it.proof.match(/^test\/[\w.-]+\.test\.mjs/)?.[0];
    assert.ok(file, `${it.name}: its proof names the test that runs it`);
    assert.ok(existsSync(join(ENGINE, file)), `${it.name}: ${file} exists`);
  }
  for (const w of WAITING) {
    assert.ok(w.why.length > 20, `${w.name}: why it has no badge`);
    assert.ok(!names.includes(w.name), `${w.name}: waiting or listed, never both`);
  }
});

test('the README shows a badge for each integration where the list says, linked to its own site, and none other', () => {
  const badges = readmeBadges();
  assert.ok(badges.length > 30, 'the README\'s badges are read');
  const want = badgesByPart(), have = {};
  for (const b of badges) ((have[b.part] ??= {})[b.how] ??= []).push(b.name);
  const sorted = (o) => Object.fromEntries(Object.entries(o).sort().map(([p, v]) => [p, Object.fromEntries(Object.entries(v).sort().map(([h, n]) => [h, [...n].sort()]))]));
  assert.deepEqual(sorted(have), sorted(want));
  const site = Object.fromEntries(INTEGRATIONS.map((x) => [badgeName(x), x.site]));
  for (const b of badges) assert.equal(b.site, site[b.name], `${b.name} on ${b.part} links to its own site`);
  for (const w of WAITING) assert.ok(!badges.some((b) => b.name === w.name), `${w.name} is waiting: no badge`);
  // A badge that says a file says which tool it is for, so the entry keeps the tool's name beside the label.
  for (const it of INTEGRATIONS) if (it.label) assert.ok(it.name && it.name !== it.label, `${it.label}: the tool it is for`);
});

// The tools the features page names in Works with your tools are each in the list, or waiting with why: a tool the
// page promises and the list does not know is one whose badge nobody will ever add, or remove.
const NOT_TOOLS = new Set(['Claude', 'Playground', 'Figma API']);   // the agent, a part of the engine, and Figma read through its own API
test('every tool the features page names is in the list or waiting', () => {
  const page = read('docs/features.md');
  const at = page.indexOf('## Works with your tools'), end = page.indexOf('\n## ', at + 5);
  assert.ok(at > 0, 'the features page has its Works with your tools section');
  const named = new Set();
  for (const line of page.slice(at, end).split('\n').filter((l) => l.startsWith('- ')))
    for (const m of line.slice(2).matchAll(/(?<=[^.]\s)([A-Z][A-Za-z0-9]*(?:[ -][A-Z][A-Za-z0-9]*)*|[a-z]+-cli)/g)) named.add(m[1]);
  const known = new Set([...INTEGRATIONS.map((x) => x.name), ...WAITING.map((x) => x.name), ...NOT_TOOLS]);
  assert.ok(named.size > 5, 'its tools are read');
  assert.deepEqual([...named].filter((n) => !known.has(n)), []);
});
