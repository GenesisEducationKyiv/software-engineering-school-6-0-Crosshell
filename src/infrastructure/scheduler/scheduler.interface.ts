export interface IScheduler {
  start(callback: () => Promise<void>): void;
}
