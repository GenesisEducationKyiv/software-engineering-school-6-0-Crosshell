export type SubscriptionWithRepo = {
  email: string;
  repo: string;
  confirmed: boolean;
  lastSeenTag: string | null;
};
