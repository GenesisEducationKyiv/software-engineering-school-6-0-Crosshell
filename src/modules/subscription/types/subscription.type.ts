export type Subscription = {
  id: string;
  email: string;
  repositoryId: string;
  confirmed: boolean;
  confirmToken: string;
  unsubscribeToken: string;
  createdAt: Date;
  updatedAt: Date;
};
