import type { INotificationMetrics } from '@/modules/notification/interfaces/notification-metrics.interface';
import { notificationsSentTotal } from './metrics.registry';

export class NotificationMetrics implements INotificationMetrics {
  incSent(status: 'success' | 'failure'): void {
    notificationsSentTotal.inc({ status });
  }
}
