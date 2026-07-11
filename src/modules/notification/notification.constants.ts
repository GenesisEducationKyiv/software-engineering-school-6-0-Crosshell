export const QUEUE_NAME = 'release.notifications';
export const DLX_NAME = 'release.notifications.dlx';
export const DLQ_NAME = 'release.notifications.dead';
export const RETRY_QUEUE_NAME = 'release.notifications.retry';
export const MAX_RETRIES = 3;
export const RETRY_DELAYS_MS = [2_000, 5_000, 10_000];
