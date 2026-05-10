import { appConfig } from '@/shared/config';

export function buildUnsubscribeUrl(token: string): string {
  return `${appConfig.appUrl}/unsubscribe.html?token=${token}`;
}
