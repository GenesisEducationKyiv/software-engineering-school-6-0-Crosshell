export interface IGithubMetrics {
  incApiRequest(operation: string, cache: 'hit' | 'miss' | 'none'): void;
}
