import dotenv from 'dotenv';
import type { z } from 'zod';

dotenv.config();

export function registerConfig<T>(schema: z.ZodSchema<T>): T {
  const parsed = schema.safeParse(process.env);

  if (!parsed.success) {
    console.error('Invalid environment variables:');
    for (const issue of parsed.error.issues) {
      console.error(`  ${issue.path.join('.')}: ${issue.message}`);
    }
    process.exit(1);
  }

  return parsed.data;
}
