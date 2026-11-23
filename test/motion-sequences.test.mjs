// A motion of several parts kept as tokens (a backdrop, then its card), against the code's, part by part, with its
// reduced form (lib/motion-sequences.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sequencesOf, sequenceFindings } from '../lib/motion-sequences.mjs';

const TOKENS = {
  'motion/modal/open/backdrop/duration': '200ms', 'motion/modal/open/backdrop/easing': 'ease-out',
  'motion/modal/open/card/duration': '0.24s', 'motion/modal/open/card/delay': '80ms', 'motion/modal/open/card/easing': 'ease-out',
  'motion/modal/open/reduced/backdrop/duration': '100ms',   // the backdrop still fades for less motion; the card does not move
  'motion/easing/standard': 'ease',                          // a plain token, not a sequence
};
const css = (text) => [{ file: 'theme.css', text }];
const SHEET = `@keyframes fade { from { opacity: 0 } to { opacity: 1 } }
@keyframes rise { from { transform: translateY(16px) } to { transform: none } }
.modal { animation: fade 200ms ease-out; }
.modal-card { animation: rise 240ms ease-out 80ms; }
@media (prefers-reduced-motion: reduce) { .modal-card { animation: none; } }
`;

test('a sequence is read from the motion tokens: each part with its duration, delay and curve, and its reduced form', () => {
  assert.deepEqual(sequencesOf(TOKENS), { modal: { open: {
    parts: { backdrop: { ms: 200, easing: 'ease-out' }, card: { ms: 240, delay: 80, easing: 'ease-out' } },
    reduced: { backdrop: { ms: 100 } } } } });
});

test('the code that moves each part as the tokens say, and stops the card for less motion, matches', () => {
  assert.deepEqual(sequenceFindings(TOKENS, css(SHEET), (n) => n), []);
});

test('a part out of turn, too slow, missing, or still moving for less motion, is said part by part', () => {
  const wrong = `@keyframes fade { from { opacity: 0 } to { opacity: 1 } }
.modal { animation: fade 200ms ease-out; }
.modal-card { animation: fade 400ms linear; }
`;
  const f = sequenceFindings(TOKENS, css(wrong), (n) => n);
  assert.deepEqual(f.map((x) => [x.part, x.what]), [['card', 'duration'], ['card', 'delay'], ['card', 'easing'], ['card', 'reduced']]);
  assert.match(f[1].message, /^modal opens, card: the tokens start it 80ms in, the code 0ms in \(\.modal-card, theme\.css:3\)$/);
  assert.match(f[3].message, /the reduced form keeps it still, and the code still moves it under prefers-reduced-motion/);
  const none = sequenceFindings(TOKENS, css('.modal { animation: fade 200ms ease-out; }\n@keyframes fade { to { opacity: 1 } }'), (n) => n);
  assert.deepEqual(none.map((x) => [x.part, x.what]), [['card', 'missing']]);
});
