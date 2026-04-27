import { z } from 'zod';
import { registerConfig } from './register-config';

export const redisConfig = registerConfig(
  z
    .object({
      REDIS_URL: z.string(),
    })
    .transform((env) => ({
      url: env.REDIS_URL,
    })),
);
