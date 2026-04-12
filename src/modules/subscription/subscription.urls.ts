import { appConfig } from '@/shared/config';

export function buildConfirmUrl(token: string): string {
  return `${appConfig.appUrl}/confirm.html?token=${token}`;
}

export function buildUnsubscribeUrl(token: string): string {
  return `${appConfig.appUrl}/unsubscribe.html?token=${token}`;
}
