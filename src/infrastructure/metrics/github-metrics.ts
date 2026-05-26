import type {
  IGithubApiMetrics,
  IGithubCacheMetrics,
} from '@/modules/github/interfaces/github-metrics.interface';
import {
  githubApiRequestsTotal,
  githubCacheEventsTotal,
} from './metrics.registry';

export class GithubMetrics implements IGithubApiMetrics, IGithubCacheMetrics {
  incApiRequest(operation: string): void {
    githubApiRequestsTotal.inc({ operation });
  }

  incCacheHit(operation: string): void {
    githubCacheEventsTotal.inc({ operation, result: 'hit' });
  }

  incCacheMiss(operation: string): void {
    githubCacheEventsTotal.inc({ operation, result: 'miss' });
  }
}
