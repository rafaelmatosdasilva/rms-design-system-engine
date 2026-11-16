// Where a page written as the product writes its pages leads. A composition says it in one prop ("goesTo"); a page
// written as code says the same thing in code, and nothing read it - so a journey of four ready pages was four
// pages, and the flow view saw none of them.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { linksInCode } from '../lib/code-links.mjs';

const NAMES = ['OrdersToApprove', 'OrderDetail', 'ApproveOrder'];

test('the ways a page in this kind of project leads somewhere', () => {
  const src = `
    const goBack = () => { router.push({ name: 'OrdersToApprove' }) }
    const approve = () => { window.location.href = 'ApproveOrder' }
  `;
  assert.deepEqual(linksInCode('OrderDetail', src, NAMES).map((l) => l.to).sort(), ['ApproveOrder', 'OrdersToApprove']);
  assert.deepEqual(linksInCode('a', "router.replace('OrderDetail')", NAMES).map((l) => l.to), ['OrderDetail']);
  assert.deepEqual(linksInCode('a', `<router-link to="ApproveOrder">on</router-link>`, NAMES).map((l) => l.to), ['ApproveOrder']);
  assert.deepEqual(linksInCode('a', "{ routeName: 'OrderDetail' }", NAMES).map((l) => l.to), ['OrderDetail']);
});

test('a link to something that is not a prototype is the product\'s route, not a step of the flow', () => {
  assert.deepEqual(linksInCode('a', "router.push({ name: 'AccountSettings' })", NAMES), []);
  assert.deepEqual(linksInCode('OrderDetail', "router.push({ name: 'OrderDetail' })", NAMES), [], 'nor is a page leading to itself');
});

// The words matter beyond reading well: the flow tells a way back from a step by them, so a link labelled with the
// page it leads to would read as a step every time, and every page would look like a start.
test('what a link is called comes through the handler it was given to', () => {
  const src = `
    const goBack = () => { router.push({ name: 'OrdersToApprove' }) }
    const approve = () => { router.push({ name: 'ApproveOrder' }) }
    const buttons = [
      { type: 'Secondary', label: 'Voltar', callbackFn: goBack },
      { type: 'Positive', label: 'Aprovar', callbackFn: approve }
    ]
  `;
  const said = Object.fromEntries(linksInCode('OrderDetail', src, NAMES).map((l) => [l.to, l.label]));
  assert.equal(said.OrdersToApprove, 'Voltar', 'the words beside the handler, not the ones nearest the link');
  assert.equal(said.ApproveOrder, 'Aprovar');
});

test('a link with no words of its own is called the page it leads to', () => {
  assert.equal(linksInCode('a', "router.push({ name: 'OrderDetail' })", NAMES)[0].label, 'OrderDetail');
});

test('a page that leads nowhere says nothing, rather than guessing', () => {
  assert.deepEqual(linksInCode('a', 'const x = 1', NAMES), []);
  assert.deepEqual(linksInCode('a', '', NAMES), []);
});
