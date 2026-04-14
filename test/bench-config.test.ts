import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseLocalActivitySteps } from '../src/bench/config';

void test('parseLocalActivitySteps accepts comma-separated numeric step indexes', () => {
  assert.deepEqual(parseLocalActivitySteps('3, 4,3', 5), ['step3', 'step4']);
});

void test('parseLocalActivitySteps also accepts step-prefixed values', () => {
  assert.deepEqual(parseLocalActivitySteps('step2,step5', 5), ['step2', 'step5']);
});

void test('parseLocalActivitySteps rejects values outside the workflow activity range', () => {
  assert.throws(
    () => parseLocalActivitySteps('6', 5),
    /BENCH_LOCAL_ACTIVITY_STEPS must reference steps between 1 and 5/
  );
});
