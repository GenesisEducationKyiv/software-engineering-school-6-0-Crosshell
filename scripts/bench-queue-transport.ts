import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { QueueManager } from '@/infrastructure/queue/queue-manager';
import { logger } from '@/shared/logger';
import { SagaCommandsQueue, type SagaReply } from '@/modules/saga-queue';

const CONCURRENCY = Number(process.argv[2] ?? 50);
const DURATION_MS = Number(process.argv[3] ?? 10_000);

function percentile(sorted: number[], p: number): number {
  const idx = Math.min(sorted.length - 1, Math.floor(sorted.length * p));

  return sorted[idx];
}

async function main(): Promise<void> {
  const rabbitmqUrl = process.env.RABBITMQ_URL;
  if (!rabbitmqUrl) {
    throw new Error('RABBITMQ_URL is not set');
  }

  const queueManager = new QueueManager({ url: rabbitmqUrl });
  await queueManager.connect();

  const sagaCommandsQueue = new SagaCommandsQueue(queueManager, logger);
  await sagaCommandsQueue.setup();

  const pendingResolvers = new Map<string, (reply: SagaReply) => void>();
  sagaCommandsQueue.consumeReplies(async (reply) => {
    const resolve = pendingResolvers.get(reply.correlationId);
    if (resolve) {
      pendingResolvers.delete(reply.correlationId);
      resolve(reply);
    }
  });

  const latenciesMs: number[] = [];
  let failures = 0;
  const deadline = Date.now() + DURATION_MS;

  async function fireOne(): Promise<void> {
    const correlationId = randomUUID();
    const start = performance.now();

    const reply = await new Promise<SagaReply>((resolve) => {
      pendingResolvers.set(correlationId, resolve);
      sagaCommandsQueue.publishCommand({
        type: 'SEND_CONFIRMATION_EMAIL',
        correlationId,
        payload: {
          email: 'bench@example.com',
          confirmUrl: 'http://localhost/confirm',
          unsubscribeUrl: 'http://localhost/unsubscribe',
        },
      });
    });

    latenciesMs.push(performance.now() - start);
    if (reply.type === 'SEND_CONFIRMATION_EMAIL_FAILURE') {
      failures++;
    }
  }

  async function worker(): Promise<void> {
    while (Date.now() < deadline) {
      await fireOne();
    }
  }

  const startedAt = performance.now();
  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));
  const elapsedSec = (performance.now() - startedAt) / 1000;

  const sorted = [...latenciesMs].sort((a, b) => a - b);
  const avg = sorted.reduce((a, b) => a + b, 0) / sorted.length;

  console.log(`Transport:     RabbitMQ (queue)`);
  console.log(`Concurrency:   ${CONCURRENCY}`);
  console.log(`Duration:      ${elapsedSec.toFixed(2)}s`);
  console.log(`Requests:      ${sorted.length} (${failures} failures)`);
  console.log(`Requests/sec:  ${(sorted.length / elapsedSec).toFixed(0)}`);
  console.log(`Avg latency:   ${avg.toFixed(2)} ms`);
  console.log(`p99 latency:   ${percentile(sorted, 0.99).toFixed(2)} ms`);

  await queueManager.close();
}

main()
  .then(() => process.exit(0))
  .catch((err: unknown) => {
    console.error(err);
    process.exit(1);
  });
