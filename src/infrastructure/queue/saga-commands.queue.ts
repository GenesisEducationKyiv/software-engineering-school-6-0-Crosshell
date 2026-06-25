import type { QueueManager } from '@/infrastructure/queue/queue-manager';
import type { ILogger } from '@/shared/logger/logger.interface';
import type { SagaCommand, SagaReply } from '@/modules/saga/saga.types';

const COMMANDS_QUEUE = 'saga.subscription.commands';
const REPLIES_QUEUE = 'saga.subscription.replies';

export class SagaCommandsQueue {
  constructor(
    private readonly queueManager: QueueManager,
    private readonly logger: ILogger,
  ) {}

  async setup(): Promise<void> {
    const ch = this.queueManager.getChannel();
    await ch.assertQueue(COMMANDS_QUEUE, { durable: true });
    await ch.assertQueue(REPLIES_QUEUE, { durable: true });
  }

  publishCommand(command: SagaCommand): void {
    const ok = this.queueManager
      .getChannel()
      .sendToQueue(COMMANDS_QUEUE, Buffer.from(JSON.stringify(command)), {
        persistent: true,
      });

    if (!ok) {
      throw new Error(
        `[SagaQueue] Write buffer full — command ${command.type} not sent (correlationId=${command.correlationId})`,
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
      throw new Error(
        `[SagaQueue] Write buffer full — reply ${reply.type} not sent (correlationId=${reply.correlationId})`,
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
