export type SubscriptionWithRepo = {
  email: string;
  owner: string;
  repo: string;
  confirmed: boolean;
  lastSeenTag: string | null;
};
