import { z } from 'zod';
import { registerConfig } from './register-config';

const DEFAULT_SCANNER_CRON = '*/10 * * * *';

export const scannerConfig = registerConfig(
  z
    .object({
      SCANNER_CRON: z.string().default(DEFAULT_SCANNER_CRON),
    })
    .transform((env) => ({
      scannerCron: env.SCANNER_CRON,
    })),
);
