import test from 'node:test';
import assert from 'node:assert/strict';

import { createLabelState } from '../../app/js/labels.js';

test('label state is visible by default', () => {
  const s = createLabelState();
  assert.equal(s.get(), true);
});

test('label state can be initialised hidden', () => {
  const s = createLabelState(false);
  assert.equal(s.get(), false);
});

test('toggle() flips visibility from true to false', () => {
  const s = createLabelState();
  const result = s.toggle();
  assert.equal(result, false);
  assert.equal(s.get(), false);
});

test('toggle() flips back to true on second call', () => {
  const s = createLabelState();
  s.toggle();
  s.toggle();
  assert.equal(s.get(), true);
});

test('toggle() returns the new state', () => {
  const s = createLabelState(false);
  assert.equal(s.toggle(), true);
  assert.equal(s.toggle(), false);
});

test('set(false) hides labels', () => {
  const s = createLabelState();
  s.set(false);
  assert.equal(s.get(), false);
});

test('set(true) shows labels', () => {
  const s = createLabelState(false);
  s.set(true);
  assert.equal(s.get(), true);
});

test('multiple instances are independent', () => {
  const a = createLabelState();
  const b = createLabelState();
  a.toggle();
  assert.equal(a.get(), false);
  assert.equal(b.get(), true);
});
