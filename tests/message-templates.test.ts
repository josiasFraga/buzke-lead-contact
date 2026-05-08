import test from 'node:test';
import assert from 'node:assert/strict';

import { getInitialGreetingMessage } from '../src/lib/message-templates.ts';

test('saudacao inicial usa bom dia pela manha', () => {
  const result = getInitialGreetingMessage(new Date('2026-05-08T11:00:00-03:00'));

  assert.equal(result, 'Bom dia, tudo bem?');
});

test('saudacao inicial usa boa tarde a tarde', () => {
  const result = getInitialGreetingMessage(new Date('2026-05-08T15:00:00-03:00'));

  assert.equal(result, 'Boa tarde, tudo bem?');
});

test('saudacao inicial usa boa noite a noite', () => {
  const result = getInitialGreetingMessage(new Date('2026-05-08T20:00:00-03:00'));

  assert.equal(result, 'Boa noite, tudo bem?');
});