import { z } from 'zod';
import { registerConfig } from './register-config';

export const elasticsearchConfig = registerConfig(
  z
    .object({
      ELASTICSEARCH_URL: z
        .string()
        .optional()
        .transform((value) => (value ? value : undefined))
        .pipe(z.url().optional()),
    })
    .transform((env) => ({
      url: env.ELASTICSEARCH_URL,
    })),
);
