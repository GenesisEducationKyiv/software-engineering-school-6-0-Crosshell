import type { QueueManager } from '@/infrastructure/queue/queue-manager';
import type { ILogger } from '@/shared/logger/logger.interface';
import type { SagaCommand, SagaReply } from './saga.types';
import {
  COMMANDS_QUEUE,
  COMMANDS_DLX,
  COMMANDS_DLQ,
  REPLIES_QUEUE,
  REPLIES_DLX,
  REPLIES_DLQ,
} from './saga-commands.constants';

export class SagaCommandsQueue {
  constructor(
    private readonly queueManager: QueueManager,
    private readonly logger: ILogger,
  ) {}

  async setup(): Promise<void> {
    const ch = this.queueManager.getChannel();

    await ch.assertExchange(COMMANDS_DLX, 'direct', { durable: true });
    await ch.assertQueue(COMMANDS_DLQ, { durable: true });
    await ch.bindQueue(COMMANDS_DLQ, COMMANDS_DLX, COMMANDS_QUEUE);
    await ch.assertQueue(COMMANDS_QUEUE, {
      durable: true,
      arguments: {
        'x-dead-letter-exchange': COMMANDS_DLX,
        'x-dead-letter-routing-key': COMMANDS_QUEUE,
      },
    });

    await ch.assertExchange(REPLIES_DLX, 'direct', { durable: true });
    await ch.assertQueue(REPLIES_DLQ, { durable: true });
    await ch.bindQueue(REPLIES_DLQ, REPLIES_DLX, REPLIES_QUEUE);
    await ch.assertQueue(REPLIES_QUEUE, {
      durable: true,
      arguments: {
        'x-dead-letter-exchange': REPLIES_DLX,
        'x-dead-letter-routing-key': REPLIES_QUEUE,
      },
    });
  }

  publishCommand(command: SagaCommand): void {
    const ok = this.queueManager
      .getChannel()
      .sendToQueue(COMMANDS_QUEUE, Buffer.from(JSON.stringify(command)), {
        persistent: true,
      });

    if (!ok) {
      this.logger.warn(
        { correlationId: command.correlationId, type: command.type },
        '[SagaQueue] Write buffer full — command queued, backpressure in effect',
      );
    }
  }

  publishReply(reply: SagaReply): void {
    const ok = this.queueManager
      .getChannel()
      .sendToQueue(REPLIES_QUEUE, Buffer.from(JSON.stringify(reply)), {
        persistent: true,
      });

    if (!ok) {
      this.logger.warn(
        { correlationId: reply.correlationId, type: reply.type },
        '[SagaQueue] Write buffer full — reply queued, backpressure in effect',
      );
    }
  }

  consumeCommands(handler: (command: SagaCommand) => Promise<void>): void {
    const ch = this.queueManager.getChannel();

    void ch.consume(COMMANDS_QUEUE, (msg) => {
      if (!msg) {
        return;
      }

      void (async () => {
        try {
          const command = JSON.parse(msg.content.toString()) as SagaCommand;
          await handler(command);
          this.queueManager.getChannel().ack(msg);
        } catch (err) {
          this.logger.error({ err }, '[SagaQueue] Failed to process command');
          this.queueManager.getChannel().nack(msg, false, false);
        }
      })();
    });
  }

  consumeReplies(handler: (reply: SagaReply) => Promise<void>): void {
    const ch = this.queueManager.getChannel();

    void ch.consume(REPLIES_QUEUE, (msg) => {
      if (!msg) {
        return;
      }

      void (async () => {
        try {
          const reply = JSON.parse(msg.content.toString()) as SagaReply;
          await handler(reply);
          this.queueManager.getChannel().ack(msg);
        } catch (err) {
          this.logger.error({ err }, '[SagaQueue] Failed to process reply');
          this.queueManager.getChannel().nack(msg, false, false);
        }
      })();
    });
  }
}
