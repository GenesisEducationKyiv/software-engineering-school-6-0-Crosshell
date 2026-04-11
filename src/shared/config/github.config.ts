import { z } from 'zod';
import { registerConfig } from './register-config';

const DEFAULT_GITHUB_BASE_URL = 'https://api.github.com';
const DEFAULT_GITHUB_CACHE_TTL_SECONDS = 600;

export const githubConfig = registerConfig(
  z
    .object({
      GITHUB_TOKEN: z.string().optional(),
      GITHUB_BASE_URL: z.url().default(DEFAULT_GITHUB_BASE_URL),
      GITHUB_CACHE_TTL_SECONDS: z.coerce.number().int().positive().default(DEFAULT_GITHUB_CACHE_TTL_SECONDS),
    })
    .transform((env) => ({
      token: env.GITHUB_TOKEN,
      baseUrl: env.GITHUB_BASE_URL,
      cacheTtlSeconds: env.GITHUB_CACHE_TTL_SECONDS,
    })),
);
