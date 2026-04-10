import { z } from 'zod';

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
});

export type SubscribeInput = z.infer<typeof subscribeSchema>;
export type SubscriptionWithRepo = z.infer<typeof subscriptionWithRepoSchema>;
