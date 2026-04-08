import { z } from 'zod';

export const createSubscriptionSchema = z.object({
  email: z.email(),
  repositoryId: z.uuid(),
});

export type CreateSubscriptionInput = z.infer<typeof createSubscriptionSchema>;
