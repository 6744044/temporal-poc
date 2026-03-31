import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MockActivityEnvironment } from '@temporalio/testing';
import * as activities from '../src/activities';
import type { PaymentDetails } from '../src/shared';

void test('successfully withdraws money from the account', async () => {
  const env = new MockActivityEnvironment();
  const validRegex = /^[a-zA-Z0-9]*$/;
  const details: PaymentDetails = {
    amount: 400,
    sourceAccount: '85-150',
    targetAccount: '43-812',
    referenceId: '12345',
  };

  const result: string = await env.run(activities.withdraw, details);

  assert.equal(typeof result, 'string');
  assert.equal(result.length, 11);
  assert.ok(result.startsWith('W'));
  assert.ok(validRegex.test(result));
});

void test('successfully deposits money into the account', async () => {
  const env = new MockActivityEnvironment();
  const validRegex = /^[a-zA-Z0-9]*$/;
  const details: PaymentDetails = {
    amount: 400,
    sourceAccount: '85-150',
    targetAccount: '43-812',
    referenceId: '12345',
  };

  const result: string = await env.run(activities.deposit, details);

  assert.equal(typeof result, 'string');
  assert.equal(result.length, 11);
  assert.ok(result.startsWith('D'));
  assert.ok(validRegex.test(result));
});

void test('successfully refunds money into the account', async () => {
  const env = new MockActivityEnvironment();
  const validRegex = /^[a-zA-Z0-9]*$/;
  const details: PaymentDetails = {
    amount: 400,
    sourceAccount: '85-150',
    targetAccount: '43-812',
    referenceId: '12345',
  };

  const result: string = await env.run(activities.deposit, details);

  assert.equal(typeof result, 'string');
  assert.equal(result.length, 11);
  assert.ok(result.startsWith('D'));
  assert.ok(validRegex.test(result));
});
