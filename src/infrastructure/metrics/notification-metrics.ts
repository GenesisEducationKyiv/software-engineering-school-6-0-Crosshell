import type { INotificationMetrics } from '@/modules/notification';
import {
  notificationsSentTotal,
  notificationProcessingDurationSeconds,
} from './metrics.registry';

export class NotificationMetrics implements INotificationMetrics {
  incSent(status: 'success' | 'failure'): void {
    notificationsSentTotal.inc({ status });
  }

  observeProcessingDuration(seconds: number): void {
    notificationProcessingDurationSeconds.observe(seconds);
  }
}
