// The shapes a flow comes in, and what each owes. A designer asks for an operation in several steps - sign in, a
// one-time code, a confirmation, a success page - and the engine checked only that the pages link, so a code step
// with no way to ask for another one and a middle step that quietly ended the journey both passed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SHAPES, SHAPE_NAMES, shapesOf, owedBy, shapeFindings, partWords, pageWords } from '../lib/flow-shapes.mjs';
import { flowGraph } from '../lib/prototype-flows.mjs';

const page = (parts, links = []) => ({ root: 'r', components: [{ id: 'r', component: 'Page' },
  ...parts.map((p, i) => ({ id: `p${i}`, component: 'Text', text: p })),
  ...links.map((t, i) => ({ id: `l${i}`, component: 'Button', label: 'Continue', goesTo: t }))] });

test('a page is known to be a shape by its own words', () => {
  assert.deepEqual(shapesOf('code', page(['Enter the verification code we sent'])), ['a one-time code step']);
  assert.deepEqual(shapesOf('otp', page(['Enter it'])), ['a one-time code step'], 'its name counts too');
  assert.deepEqual(shapesOf('signin', page(['Sign in', 'Email'])), ['a sign-in step']);
  assert.deepEqual(shapesOf('done', page(['Thank you, all set'])), ['a success page']);
  assert.deepEqual(shapesOf('confirm', page(['Delete this order permanently'])), ['a destructive step']);
  // Being no shape at all is the ordinary case, not a finding.
  assert.deepEqual(shapesOf('orders', page(['Orders', 'A table of them'])), []);
});

test('a page owes a part, and its own name is not one', () => {
  // A success page called "done" does not have a way on because its file is called done. Reading the name on
  // both sides let exactly that pass.
  assert.match(pageWords('done', page(['Thank you'])), /done/);
  assert.doesNotMatch(partWords(page(['Thank you'])), /done/);
  assert.deepEqual(owedBy('done', page(['Thank you, all set'])).map((o) => o.part), ['a way on to whatever comes after it']);
  // With a real part that does it, nothing is owed.
  assert.deepEqual(owedBy('done', page(['Thank you, all set', 'Back to your orders'])), []);
});

test('a one-time code step owes a resend and a way back', () => {
  const owed = owedBy('code', page(['Enter the verification code we sent'])).map((o) => o.part);
  assert.equal(owed.length, 2);
  assert.match(owed.join(' | '), /ask for another code/);
  assert.match(owed.join(' | '), /change where it was sent/);
  // Both present: nothing owed.
  assert.deepEqual(owedBy('code', page(['Enter the verification code', 'Resend it', 'Back'])), []);
});

test('what a person reads: the shape, the missing part, and what to do', () => {
  const found = shapeFindings({ signin: page(['Sign in', 'Password']) });
  assert.equal(found[0].level, 'warning', 'a question for the designer, never a failure');
  assert.match(found[0].message, /"signin" is a sign-in step and is missing a way out for somebody who cannot get in/);
  assert.match(found[0].message, /Add it from the system, or say why this flow does not need it/);
  // Never two articles, however the part is worded.
  for (const f of shapeFindings({ code: page(['verification code']), done: page(['Thank you']) })) assert.doesNotMatch(f.message, /\bno a |\bis a a /, f.message);
});

test('a shape answers the question the flow view has to leave open', () => {
  // --prototype --flow names where a journey ends and cannot tell whether that is right.
  const pages = { signin: page(['Sign in', 'Forgot it?'], ['code']), code: page(['verification code', 'Resend', 'Back']) };
  const said = shapeFindings(pages, flowGraph(pages)).map((f) => f.message).join('\n');
  assert.match(said, /the journey ends on "code", which is a one-time code step and not an ending/);
  assert.match(said, /the page after it was never drawn/);
  // A success page is an ending, and is never asked what comes next.
  const ok = { signin: page(['Sign in', 'Forgot it?'], ['done']), done: page(['Thank you, all set', 'Back to your orders']) };
  assert.deepEqual(shapeFindings(ok, flowGraph(ok)), []);
  // A page of no known shape leaves the flow view's open question alone rather than guessing at it.
  const plain = { orders: page(['Orders'], ['detail']), detail: page(['One order']) };
  assert.deepEqual(shapeFindings(plain, flowGraph(plain)), []);
});

test('every shape says how it is known and what it owes, and reads inside the sentence', () => {
  for (const k of SHAPE_NAMES) {
    assert.ok(SHAPES[k].is instanceof RegExp, k);
    assert.match(k, /^a /, `"${k}" has to read after "is": "is ${k}"`);
    for (const o of SHAPES[k].owes ?? []) {
      assert.ok(o.is instanceof RegExp, `${k}: ${o.part}`);
      assert.match(o.part, /^a /, `"${o.part}" has to read after "is missing"`);
    }
  }
  assert.equal(SHAPES['a success page'].ends, true, 'the one shape that ends a journey');
});
