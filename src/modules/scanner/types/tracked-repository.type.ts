export type TrackedRepository = {
  id: string;
  owner: string;
  repo: string;
  lastSeenTag: string | null;
};
