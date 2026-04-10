export interface Subscriber {
  email: string;
  unsubscribeToken: string;
}

export interface ReleaseNotificationPayload {
  repositoryOwner: string;
  repositoryRepo: string;
  newTag: string;
  releaseUrl: string;
  subscribers: Subscriber[];
}
