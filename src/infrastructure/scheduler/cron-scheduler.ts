import cron from 'node-cron';
import type { IScheduler } from './scheduler.interface';

export class CronScheduler implements IScheduler {
  constructor(private readonly cronExpression: string) {}

  start(callback: () => Promise<void>): void {
    cron.schedule(this.cronExpression, callback);
  }
}
