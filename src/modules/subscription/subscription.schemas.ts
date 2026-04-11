import { z } from 'zod';
import type { SubscriptionWithRepo } from './types/subscription-with-repo.type';

const REPO_REGEX = /^[a-zA-Z0-9._-]+\/[a-zA-Z0-9._-]+$/;

export const subscribeSchema = z.object({
  email: z.email(),
  repo: z
    .string()
    .regex(
      REPO_REGEX,
      'Repository must be in owner/repo format (e.g. golang/go)',
    ),
});

export const tokenSchema = z.object({
  token: z.uuid(),
});

export const getSubscriptionsQuerySchema = z.object({
  email: z.email(),
});

export const subscriptionWithRepoSchema = z.object({
  email: z.string(),
  repo: z.string(),
  confirmed: z.boolean(),
  lastSeenTag: z.string().nullable(),
}) satisfies z.ZodType<SubscriptionWithRepo>;

export type SubscribeInput = z.infer<typeof subscribeSchema>;
export type UnsubscribeInput = z.infer<typeof tokenSchema>;
export type GetSubscriptionsQuery = z.infer<typeof getSubscriptionsQuerySchema>;
