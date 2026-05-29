import { z } from 'zod';
import { registerConfig } from './register-config';

export const elasticsearchConfig = registerConfig(
  z
    .object({
      ELASTICSEARCH_URL: z.url().optional(),
    })
    .transform((env) => ({
      url: env.ELASTICSEARCH_URL,
    })),
);
