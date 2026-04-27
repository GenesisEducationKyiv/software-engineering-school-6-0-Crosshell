import { z } from 'zod';

export const subscriberSchema = z.object({
  email: z.email(),
  unsubscribeToken: z.uuid(),
});

export type Subscriber = z.infer<typeof subscriberSchema>;

export const releaseNotificationPayloadSchema = z.object({
  repositoryOwner: z.string(),
  repositoryRepo: z.string(),
  newTag: z.string(),
  releaseUrl: z.url(),
  subscribers: z.array(subscriberSchema),
});

export type ReleaseNotificationPayload = z.infer<
  typeof releaseNotificationPayloadSchema
>;
