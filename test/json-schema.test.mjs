// The JSON Schema validator (json-schema.mjs), held to a standard's own conformance suite: every example DSDS publishes
// as valid passes, and every fixture DSDS says its schema rejects is rejected, at the place the suite names.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { validate } from '../lib/json-schema.mjs';
import { DSDS_VERSION } from '../lib/contract-dsds.mjs';
import { exampleName, fixtureDir } from '../lib/dsds-release.mjs';

// DSDS's files are fetched, never committed (node lib/dsds-release.mjs fetch): with none here this fails and says so.
const DIR = fixtureDir();
const SCHEMA = JSON.parse(readFileSync(join(DIR, 'dsds.bundled.schema.json'), 'utf8'));
const SUITE = JSON.parse(readFileSync(join(DIR, 'conformance-suite.json'), 'utf8'));
const read = (f) => JSON.parse(readFileSync(join(DIR, 'examples', f), 'utf8'));
// A file with no schemaVersion is one entry, checked as DSDS's own validator checks it: by its kind.
const ENTRY = `https://designsystemdocspec.org/v${DSDS_VERSION}/entries/entry.schema.yaml#/$defs/dispatch`;
const check = (doc) => validate(SCHEMA, doc, doc.schemaVersion === undefined ? { from: ENTRY } : {});

test('every example DSDS publishes as valid passes', () => {
  const rejected = new Set(SUITE.fixtures.map((f) => exampleName(f.file)));
  const files = readdirSync(join(DIR, 'examples')).filter((f) => !rejected.has(f) && !f.startsWith('examples_invalid_'));
  let checked = 0;
  for (const f of files) {
    const doc = read(f);
    // A fragment of a larger file (no version, no kind) and a tutorial's first, unfinished step are not documents.
    if (doc.schemaVersion === undefined && !doc.kind) continue;
    if (doc.schemaVersion !== undefined && !doc.entries) continue;
    const r = check(doc);
    assert.deepEqual(r.errors.map((e) => `${e.at} ${e.message}`), [], f);
    checked++;
  }
  assert.ok(checked >= 40, `only ${checked} examples were checked`);
});

test('every fixture DSDS says its schema rejects is rejected, where the suite says', () => {
  const fixtures = SUITE.fixtures.filter((f) => f.rejectedBy === 'schema');
  assert.ok(fixtures.length >= 10);
  for (const f of fixtures) {
    const r = check(read(exampleName(f.file)));
    assert.equal(r.valid, false, `${f.file} should be rejected`);
    // errorAt is written from where the fixture's own part starts (a section's items, an entry's fields).
    if (f.errorAt && f.errorAt !== '/') assert.ok(r.errors.some((e) => e.at === f.errorAt || e.at.endsWith(f.errorAt)), `${f.file}: no error at ${f.errorAt} (${r.errors.map((e) => e.at).join(', ')})`);
  }
  assert.deepEqual(validate(SCHEMA, {}).unknown, [], 'every keyword the schema uses is one the validator knows');
});

test('the keywords, one by one', () => {
  const s = {
    $id: 'https://example.com/s', type: 'object', required: ['kind'],
    properties: { kind: { enum: ['a', 'b'] }, n: { type: 'integer', minimum: 1 }, tags: { type: 'array', items: { type: 'string', pattern: '^[a-z]+$' }, uniqueItems: true } },
    allOf: [{ if: { properties: { kind: { const: 'b' } } }, then: { required: ['n'] } }],
    unevaluatedProperties: false,
  };
  assert.equal(validate(s, { kind: 'a' }).valid, true);
  assert.match(validate(s, { kind: 'c' }).errors[0].message, /none of "a", "b"/);
  assert.match(validate(s, { kind: 'b' }).errors[0].message, /lacks n/);
  assert.match(validate(s, { kind: 'a', other: 1 }).errors[0].message, /holds other/);
  assert.equal(validate(s, { kind: 'a', tags: ['x', 'x'] }).errors[0].rule, 'uniqueItems');
  assert.equal(validate(s, { kind: 'a', tags: ['X'] }).errors[0].rule, 'pattern');
  assert.equal(validate(s, { kind: 'a', n: 0 }).errors[0].rule, 'minimum');
  // oneOf needs exactly one; a $ref reaches another resource by its $id.
  const o = { $id: 'https://example.com/o', $defs: { s: { $id: 'https://example.com/str', type: 'string' } }, oneOf: [{ $ref: 'https://example.com/str' }, { type: 'number' }] };
  assert.equal(validate(o, 'x').valid, true);
  assert.equal(validate(o, true).valid, false);
  assert.equal(validate({ $ref: '#/nowhere' }, 1).errors[0].rule, '$ref', 'a ref the schema does not hold is named, never passed');
});
