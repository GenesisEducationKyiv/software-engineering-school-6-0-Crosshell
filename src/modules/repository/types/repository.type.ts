export type Repository = {
  id: string;
  owner: string;
  repo: string;
  lastSeenTag: string | null;
  createdAt: Date;
  updatedAt: Date;
};
