import { z } from 'zod';
import { registerConfig } from './register-config';

export const githubConfig = registerConfig(
  z
    .object({
      GITHUB_TOKEN: z.string().optional(),
    })
    .transform((env) => ({
      token: env.GITHUB_TOKEN,
    })),
);
