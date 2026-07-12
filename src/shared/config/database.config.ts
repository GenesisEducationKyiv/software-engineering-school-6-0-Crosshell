import { z } from 'zod';
import { registerConfig } from './register-config';

export const databaseConfig = registerConfig(
  z
    .object({
      DATABASE_URL: z.string().min(1),
    })
    .transform((env) => ({
      url: env.DATABASE_URL,
    })),
);
