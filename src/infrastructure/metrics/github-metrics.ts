import type {
  IGithubApiMetrics,
  IGithubCacheMetrics,
} from '@/modules/github/interfaces/github-metrics.interface';
import {
  githubApiRequestsTotal,
  githubApiErrorsTotal,
  githubApiDurationSeconds,
  githubCacheEventsTotal,
} from './metrics.registry';

export class GithubMetrics implements IGithubApiMetrics, IGithubCacheMetrics {
  incApiRequest(operation: string): void {
    githubApiRequestsTotal.inc({ operation });
  }

  incApiError(operation: string): void {
    githubApiErrorsTotal.inc({ operation });
  }

  observeApiDuration(operation: string, seconds: number): void {
    githubApiDurationSeconds.observe({ operation }, seconds);
  }

  incCacheHit(operation: string): void {
    githubCacheEventsTotal.inc({ operation, result: 'hit' });
  }

  incCacheMiss(operation: string): void {
    githubCacheEventsTotal.inc({ operation, result: 'miss' });
  }
}
