import type { IGithubMetrics } from '@/modules/github/interfaces/github-metrics.interface';
import { githubApiRequestsTotal } from './metrics.registry';

export class GithubMetrics implements IGithubMetrics {
  incApiRequest(operation: string, cache: 'hit' | 'miss' | 'none'): void {
    githubApiRequestsTotal.inc({ operation, cache });
  }
}
