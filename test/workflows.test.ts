import assert from 'node:assert/strict';
import { test } from 'node:test';
import { WorkflowFailedError } from '@temporalio/client';
import { TestWorkflowEnvironment } from '@temporalio/testing';
import { Worker } from '@temporalio/worker';
import * as activities from '../src/activities';
import type { PaymentDetails } from '../src/shared';
import { moneyTransfer } from '../src/workflows';

async function withWorkflowEnv(
  runTest: (args: { client: TestWorkflowEnvironment['client']; nativeConnection: TestWorkflowEnvironment['nativeConnection'] }) => Promise<void>
): Promise<void> {
  const testEnv = await TestWorkflowEnvironment.createLocal();

  try {
    await runTest({
      client: testEnv.client,
      nativeConnection: testEnv.nativeConnection,
    });
  } finally {
    await testEnv.teardown();
  }
}

void test(
  'successfully withdraws and deposits given existing bank account information',
  { timeout: 30_000 },
  async () => {
    await withWorkflowEnv(async ({ client, nativeConnection }) => {
      const taskQueue = 'test';

      const worker = await Worker.create({
        connection: nativeConnection,
        taskQueue,
        workflowsPath: require.resolve('../src/workflows'),
        activities: {
          withdraw: () => 'w1234567890',
          deposit: () => 'd1234567890',
        },
      });

      const details: PaymentDetails = {
        amount: 400,
        sourceAccount: '85-150',
        targetAccount: '43-812',
        referenceId: '12345',
      };

      await worker.runUntil(async () => {
        const result = await client.workflow.execute(moneyTransfer, {
          args: [details],
          workflowId: 'money-transfer-test-workflow-success',
          taskQueue,
        });

        assert.equal(
          result,
          'Transfer complete (transaction IDs: w1234567890, d1234567890)'
        );
      });
    });
  }
);

void test(
  'moneyTransfer deposit fails if the target account number does not exist',
  { timeout: 30_000 },
  async () => {
    await withWorkflowEnv(async ({ client, nativeConnection }) => {
      const taskQueue = 'test';

      const worker = await Worker.create({
        connection: nativeConnection,
        taskQueue,
        workflowsPath: require.resolve('../src/workflows'),
        activities,
      });

      const invalidDetails: PaymentDetails = {
        amount: 400,
        sourceAccount: '85-150',
        targetAccount: '401-812',
        referenceId: '12345',
      };

      await assert.rejects(
        worker.runUntil(async () => {
          await client.workflow.execute(moneyTransfer, {
            args: [invalidDetails],
            workflowId: 'money-transfer-test-workflow-invalid-target',
            taskQueue,
          });
        }),
        WorkflowFailedError
      );
    });
  }
);

void test(
  'moneyTransfer withdrawal fails if the source account number does not exist',
  { timeout: 30_000 },
  async () => {
    await withWorkflowEnv(async ({ client, nativeConnection }) => {
      const taskQueue = 'test';

      const worker = await Worker.create({
        connection: nativeConnection,
        taskQueue,
        workflowsPath: require.resolve('../src/workflows'),
        activities,
      });

      const invalidDetails: PaymentDetails = {
        amount: 400,
        sourceAccount: '801-150',
        targetAccount: '43-812',
        referenceId: '12345',
      };

      await assert.rejects(
        worker.runUntil(async () => {
          await client.workflow.execute(moneyTransfer, {
            args: [invalidDetails],
            workflowId: 'money-transfer-test-workflow-invalid-source',
            taskQueue,
          });
        }),
        WorkflowFailedError
      );
    });
  }
);

void test(
  'moneyTransfer withdrawal fails if the amount being withdrawn is greater than the amount that the bank has',
  { timeout: 30_000 },
  async () => {
    await withWorkflowEnv(async ({ client, nativeConnection }) => {
      const taskQueue = 'test';

      const worker = await Worker.create({
        connection: nativeConnection,
        taskQueue,
        workflowsPath: require.resolve('../src/workflows'),
        activities,
      });

      const invalidDetails: PaymentDetails = {
        amount: 4000,
        sourceAccount: '801-150',
        targetAccount: '43-812',
        referenceId: '12345',
      };

      await assert.rejects(
        worker.runUntil(async () => {
          await client.workflow.execute(moneyTransfer, {
            args: [invalidDetails],
            workflowId: 'money-transfer-test-workflow-insufficient-funds',
            taskQueue,
          });
        }),
        WorkflowFailedError
      );
    });
  }
);
