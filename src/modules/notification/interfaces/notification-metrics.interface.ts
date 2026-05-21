export interface INotificationMetrics {
  incSent(status: 'success' | 'failure'): void;
}
