import { z } from 'zod';

const subscriberSchema = z.object({
  email: z.email(),
  unsubscribeToken: z.uuid(),
});

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

export type SubscriberInfo = z.infer<typeof subscriberSchema>;
