export interface IGithubApiMetrics {
  incApiRequest(operation: string): void;
  incApiError(operation: string): void;
  observeApiDuration(operation: string, seconds: number): void;
}

export interface IGithubCacheMetrics {
  incCacheHit(operation: string): void;
  incCacheMiss(operation: string): void;
}
