import { z } from 'zod';
import { registerConfig } from './register-config';

export const queueConfig = registerConfig(
  z
    .object({
      RABBITMQ_URL: z.string().min(1),
    })
    .transform((env) => ({
      url: env.RABBITMQ_URL,
    })),
);
