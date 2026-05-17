import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mock } from 'vitest-mock-extended';
import type { Channel, ConsumeMessage } from 'amqplib';
import { NotificationQueue } from './notification.queue';
import type { QueueManager } from '@/infrastructure/queue/queue-manager';
import type { ReleaseNotificationPayload } from './notification.schemas';

vi.mock('@/shared/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { logger } from '@/shared/logger';

const QUEUE_NAME = 'release.notifications';
const DLX_NAME = 'release.notifications.dlx';
const DLQ_NAME = 'release.notifications.dead';
const MAX_RETRIES = 3;

const VALID_PAYLOAD: ReleaseNotificationPayload = {
  repositoryOwner: 'acc',
  repositoryRepo: 'testName',
  newTag: 'v2.0.0',
  releaseUrl: 'https://github.com/acc/testName/releases/tag/v2.0.0',
  subscribers: [
    {
      email: 'user@example.com',
      unsubscribeToken: '550e8400-e29b-41d4-a716-446655440001',
    },
  ],
};

function makeMessage(content: unknown, retryCount?: number): ConsumeMessage {
  return {
    content: Buffer.from(JSON.stringify(content)),
    properties: {
      headers: retryCount !== undefined ? { 'x-retry-count': retryCount } : {},
      contentType: undefined,
      contentEncoding: undefined,
      deliveryMode: undefined,
      priority: undefined,
      correlationId: undefined,
      replyTo: undefined,
      expiration: undefined,
      messageId: undefined,
      timestamp: undefined,
      type: undefined,
      userId: undefined,
      appId: undefined,
      clusterId: undefined,
    },
    fields: {
      deliveryTag: 1,
      redelivered: false,
      exchange: '',
      routingKey: QUEUE_NAME,
      consumerTag: 'test-consumer',
    },
  } as ConsumeMessage;
}

describe('NotificationQueue', () => {
  let queueManager: ReturnType<typeof mock<QueueManager>>;
  let channel: ReturnType<typeof mock<Channel>>;
  let queue: NotificationQueue;

  beforeEach(() => {
    channel = mock<Channel>();
    channel.sendToQueue.mockReturnValue(true);

    queueManager = mock<QueueManager>();
    queueManager.getChannel.mockReturnValue(channel);

    queue = new NotificationQueue(queueManager);
  });

  describe('setup', () => {
    it('should assert the dead-letter exchange', async () => {
      await queue.setup();

      expect(channel.assertExchange).toHaveBeenCalledWith(DLX_NAME, 'direct', {
        durable: true,
      });
    });

    it('should assert the dead-letter queue', async () => {
      await queue.setup();

      expect(channel.assertQueue).toHaveBeenCalledWith(DLQ_NAME, {
        durable: true,
      });
    });

    it('should bind the dead-letter queue to the exchange', async () => {
      await queue.setup();

      expect(channel.bindQueue).toHaveBeenCalledWith(
        DLQ_NAME,
        DLX_NAME,
        QUEUE_NAME,
      );
    });

    it('should assert the main queue with dead-letter arguments', async () => {
      await queue.setup();

      expect(channel.assertQueue).toHaveBeenCalledWith(QUEUE_NAME, {
        durable: true,
        arguments: {
          'x-dead-letter-exchange': DLX_NAME,
          'x-dead-letter-routing-key': QUEUE_NAME,
        },
      });
    });
  });

  describe('publish', () => {
    it('should send the payload as serialized JSON to the main queue', () => {
      queue.publish(VALID_PAYLOAD);

      expect(channel.sendToQueue).toHaveBeenCalledWith(
        QUEUE_NAME,
        Buffer.from(JSON.stringify(VALID_PAYLOAD)),
        { persistent: true },
      );
    });

    it('should not log a warning when sendToQueue returns true', () => {
      channel.sendToQueue.mockReturnValue(true);

      queue.publish(VALID_PAYLOAD);

      expect(logger.warn).not.toHaveBeenCalled();
    });

    it('should log a warning with the repo name when sendToQueue returns false', () => {
      channel.sendToQueue.mockReturnValue(false);

      queue.publish(VALID_PAYLOAD);

      expect(logger.warn).toHaveBeenCalledWith(
        {
          repo: `${VALID_PAYLOAD.repositoryOwner}/${VALID_PAYLOAD.repositoryRepo}`,
        },
        '[Queue] sendToQueue returned false. Channel write buffer is full',
      );
    });
  });

  describe('consume', () => {
    let capturedMsgHandler: (msg: ConsumeMessage | null) => Promise<void>;
    let handler: ReturnType<
      typeof vi.fn<(payload: ReleaseNotificationPayload) => Promise<void>>
    >;

    beforeEach(() => {
      handler = vi
        .fn<(payload: ReleaseNotificationPayload) => Promise<void>>()
        .mockResolvedValue(undefined);

      channel.consume.mockImplementation(async (_queue, msgHandler) => {
        capturedMsgHandler = msgHandler as (
          msg: ConsumeMessage | null,
        ) => Promise<void>;
        return { consumerTag: 'test' };
      });

      queue.consume(handler);
    });

    it('should register a consumer on the main queue', () => {
      expect(channel.consume).toHaveBeenCalledWith(
        QUEUE_NAME,
        expect.any(Function),
      );
    });

    describe('when a null message arrives (consumer cancelled)', () => {
      it('should return early without calling the handler', async () => {
        await capturedMsgHandler(null);

        expect(handler).not.toHaveBeenCalled();
      });
    });

    describe('when a valid message arrives', () => {
      it('should parse the payload and pass it to the handler', async () => {
        const message = makeMessage(VALID_PAYLOAD);

        await capturedMsgHandler(message);

        expect(handler).toHaveBeenCalledWith(VALID_PAYLOAD);
      });

      it('should ack the message after the handler resolves', async () => {
        const message = makeMessage(VALID_PAYLOAD);

        await capturedMsgHandler(message);

        expect(channel.ack).toHaveBeenCalledWith(message);
      });

      it('should not nack the message on success', async () => {
        const message = makeMessage(VALID_PAYLOAD);

        await capturedMsgHandler(message);

        expect(channel.nack).not.toHaveBeenCalled();
      });
    });

    describe('when processing fails and retry count is below MAX_RETRIES', () => {
      const processingError = new Error('handler failed');

      it.each([0, 1, 2])(
        'should re-queue the message with an incremented retry count when retryCount is %i',
        async (retryCount) => {
          handler.mockRejectedValue(processingError);
          const message = makeMessage(VALID_PAYLOAD, retryCount);

          await capturedMsgHandler(message);

          expect(channel.sendToQueue).toHaveBeenCalledWith(
            QUEUE_NAME,
            message.content,
            { persistent: true, headers: { 'x-retry-count': retryCount + 1 } },
          );
        },
      );

      it('should ack the original message after re-queuing', async () => {
        handler.mockRejectedValue(processingError);
        const message = makeMessage(VALID_PAYLOAD, 0);

        await capturedMsgHandler(message);

        expect(channel.ack).toHaveBeenCalledWith(message);
      });

      it('should not nack the message when re-queuing', async () => {
        handler.mockRejectedValue(processingError);
        const message = makeMessage(VALID_PAYLOAD, 2);

        await capturedMsgHandler(message);

        expect(channel.nack).not.toHaveBeenCalled();
      });

      it('should log the error and retry count', async () => {
        handler.mockRejectedValue(processingError);
        const message = makeMessage(VALID_PAYLOAD, 1);

        await capturedMsgHandler(message);

        expect(logger.error).toHaveBeenCalledWith(
          { err: processingError, retryCount: 1 },
          '[Queue] Failed to process message',
        );
      });
    });

    describe(`when processing fails and retry count has reached MAX_RETRIES (${MAX_RETRIES})`, () => {
      const processingError = new Error('handler failed');

      it('should nack the message and send it to the dead-letter queue', async () => {
        handler.mockRejectedValue(processingError);
        const message = makeMessage(VALID_PAYLOAD, MAX_RETRIES);

        await capturedMsgHandler(message);

        expect(channel.nack).toHaveBeenCalledWith(message, false, false);
      });

      it('should not re-queue the message', async () => {
        handler.mockRejectedValue(processingError);
        const message = makeMessage(VALID_PAYLOAD, MAX_RETRIES);

        await capturedMsgHandler(message);

        expect(channel.sendToQueue).not.toHaveBeenCalled();
      });

      it('should log a max-retries error', async () => {
        handler.mockRejectedValue(processingError);
        const message = makeMessage(VALID_PAYLOAD, MAX_RETRIES);

        await capturedMsgHandler(message);

        expect(logger.error).toHaveBeenCalledWith(
          { err: processingError },
          '[Queue] Max retries reached. Sending to DLQ',
        );
      });
    });

    describe('when the message content is invalid JSON', () => {
      it('should not call the handler', async () => {
        const badMessage = {
          ...makeMessage({}),
          content: Buffer.from('not-valid-json{'),
        } as ConsumeMessage;

        await capturedMsgHandler(badMessage);

        expect(handler).not.toHaveBeenCalled();
      });

      it('should nack the message immediately without retrying', async () => {
        const badMessage = {
          ...makeMessage({}, 0),
          content: Buffer.from('{broken'),
        } as ConsumeMessage;

        await capturedMsgHandler(badMessage);

        expect(channel.nack).toHaveBeenCalledWith(badMessage, false, false);
        expect(channel.sendToQueue).not.toHaveBeenCalled();
      });

      it('should log an error before sending to DLQ', async () => {
        const badMessage = {
          ...makeMessage({}),
          content: Buffer.from('{broken'),
        } as ConsumeMessage;

        await capturedMsgHandler(badMessage);

        expect(logger.error).toHaveBeenCalledWith(
          { err: expect.any(Error) },
          '[Queue] Invalid message payload. Sending to DLQ',
        );
      });
    });

    describe('when the message has a valid JSON body but fails schema validation', () => {
      it('should not call the handler', async () => {
        const invalidPayload = { repositoryOwner: 'acc' };
        const message = makeMessage(invalidPayload);

        await capturedMsgHandler(message);

        expect(handler).not.toHaveBeenCalled();
      });

      it('should nack the message immediately without retrying', async () => {
        const invalidPayload = { repositoryOwner: 'acc' };
        const message = makeMessage(invalidPayload, 0);

        await capturedMsgHandler(message);

        expect(channel.nack).toHaveBeenCalledWith(message, false, false);
        expect(channel.sendToQueue).not.toHaveBeenCalled();
      });

      it('should log an error before sending to DLQ', async () => {
        const invalidPayload = { repositoryOwner: 'acc' };
        const message = makeMessage(invalidPayload);

        await capturedMsgHandler(message);

        expect(logger.error).toHaveBeenCalledWith(
          { err: expect.any(Error) },
          '[Queue] Invalid message payload. Sending to DLQ',
        );
      });
    });

    describe('when a message arrives with no retry header (first delivery)', () => {
      it('should treat the retry count as 0', async () => {
        handler.mockRejectedValue(new Error('fail'));
        const message = {
          ...makeMessage(VALID_PAYLOAD),
          properties: { headers: undefined },
        } as unknown as ConsumeMessage;

        await capturedMsgHandler(message);

        expect(channel.sendToQueue).toHaveBeenCalledWith(
          QUEUE_NAME,
          message.content,
          { persistent: true, headers: { 'x-retry-count': 1 } },
        );
      });
    });
  });
});
