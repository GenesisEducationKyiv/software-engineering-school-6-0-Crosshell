import { z } from 'zod';
import { registerConfig } from './register-config';

const DEFAULT_GITHUB_BASE_URL = 'https://api.github.com';

export const githubConfig = registerConfig(
  z
    .object({
      GITHUB_TOKEN: z.string().optional(),
      GITHUB_BASE_URL: z.url().default(DEFAULT_GITHUB_BASE_URL),
    })
    .transform((env) => ({
      token: env.GITHUB_TOKEN,
      baseUrl: env.GITHUB_BASE_URL,
    })),
);
