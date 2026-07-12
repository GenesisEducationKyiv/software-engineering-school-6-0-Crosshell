export interface INotificationMetrics {
  incSent(status: 'success' | 'failure'): void;
  observeProcessingDuration(seconds: number): void;
}
