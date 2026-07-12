import type { SagaCommand, SagaReply } from '@/modules/saga-queue';

export interface ISagaCommandsQueue {
  publishCommand(command: SagaCommand): void;
  consumeReplies(handler: (reply: SagaReply) => Promise<void>): void;
}
