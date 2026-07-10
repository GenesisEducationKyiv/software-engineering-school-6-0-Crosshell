import type { SagaCommand, SagaReply } from '../saga.types';

export interface ISagaCommandsQueue {
  publishCommand(command: SagaCommand): void;
  consumeReplies(handler: (reply: SagaReply) => Promise<void>): void;
}
