import { z } from 'zod';
import { registerConfig } from './register-config';

const DEFAULT_APP_URL = 'http://localhost:3000';
const DEFAULT_APP_PORT = 3000;

export const appConfig = registerConfig(
  z
    .object({
      NODE_ENV: z
        .enum(['development', 'production', 'test'])
        .default('production'),
      APP_PORT: z.coerce.number().int().positive().default(DEFAULT_APP_PORT),
      APP_URL: z.url().default(DEFAULT_APP_URL),
      API_KEY: z.string().min(1).optional(),
    })
    .transform((env) => ({
      nodeEnv: env.NODE_ENV,
      port: env.APP_PORT,
      appUrl: env.APP_URL,
      apiKey: env.API_KEY,
    })),
);
