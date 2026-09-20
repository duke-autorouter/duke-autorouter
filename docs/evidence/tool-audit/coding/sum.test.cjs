'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { sumNumbers } = require('./sum.cjs');

test('exports sumNumbers as a function', () => {
  assert.equal(typeof sumNumbers, 'function');
});

test('sums finite numbers and ignores non-numbers and non-finite values', () => {
  assert.equal(sumNumbers([1, 2.5, -3, 0, '4', null, NaN, Infinity, -Infinity]), 0.5);
});

test('returns zero for an empty array', () => {
  assert.equal(sumNumbers([]), 0);
});

test('does not coerce numeric strings or nested values', () => {
  assert.equal(sumNumbers(['10', ['20'], {}, true, false, undefined]), 0);
});

test('handles negative and fractional finite numbers', () => {
  assert.equal(sumNumbers([-10.25, 4.5, 0.75]), -5);
});
