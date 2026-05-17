import type Redis from 'ioredis';
import { CacheService } from '@/infrastructure/cache/cache.service';
import { GithubHttpClient } from '@/modules/github/github-http-client';
import { GithubAdapter } from '@/modules/github/github.adapter';

export function createGithubClient(redisClient: Redis): GithubAdapter {
  const cache = new CacheService(redisClient);
  return new GithubAdapter(new GithubHttpClient(cache));
}
