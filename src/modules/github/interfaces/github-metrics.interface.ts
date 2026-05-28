export interface IGithubApiMetrics {
  incApiRequest(operation: string): void;
}

export interface IGithubCacheMetrics {
  incCacheHit(operation: string): void;
  incCacheMiss(operation: string): void;
}
