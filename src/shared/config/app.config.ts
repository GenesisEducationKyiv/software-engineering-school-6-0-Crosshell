import { z } from 'zod';
import { registerConfig } from './register-config';

const DEFAULT_APP_URL = 'http://localhost:3000';
const DEFAULT_APP_PORT = 3000;
const DEFAULT_FRONTEND_URL = 'http://localhost:8000';

export const appConfig = registerConfig(
  z
    .object({
      NODE_ENV: z
        .enum(['development', 'production', 'test'])
        .default('production'),
      APP_PORT: z.coerce.number().int().positive().optional(),
      PORT: z.coerce.number().int().positive().optional(),
      APP_URL: z.url().default(DEFAULT_APP_URL),
      API_KEY: z.string().min(1).optional(),
      FRONTEND_URL: z.url().default(DEFAULT_FRONTEND_URL),
    })
    .transform((env) => ({
      nodeEnv: env.NODE_ENV,
      port: env.APP_PORT ?? env.PORT ?? DEFAULT_APP_PORT,
      appUrl: env.APP_URL,
      apiKey: env.API_KEY,
      frontendUrl: env.FRONTEND_URL,
    })),
);
