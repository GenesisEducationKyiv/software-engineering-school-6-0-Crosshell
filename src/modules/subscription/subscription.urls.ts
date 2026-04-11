import { appConfig } from '@/shared/config';

export function buildConfirmUrl(token: string): string {
  return `${appConfig.appUrl}/api/confirm/${token}`;
}

export function buildUnsubscribeUrl(token: string): string {
  return `${appConfig.appUrl}/api/unsubscribe/${token}`;
}
