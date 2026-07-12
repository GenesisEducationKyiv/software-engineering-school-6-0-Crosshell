import type { SubscribeInput } from '../subscription.schemas';

export interface ISubscribeOrchestrator {
  execute(input: SubscribeInput): Promise<void>;
}
