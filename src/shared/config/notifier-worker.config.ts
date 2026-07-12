import { z } from 'zod';
import { registerConfig } from './register-config';

const DEFAULT_NOTIFIER_WORKER_PORT = 3002;

export const notifierWorkerConfig = registerConfig(
  z
    .object({
      NOTIFIER_WORKER_PORT: z.coerce.number().int().positive().optional(),
    })
    .transform((env) => ({
      port: env.NOTIFIER_WORKER_PORT ?? DEFAULT_NOTIFIER_WORKER_PORT,
    })),
);
