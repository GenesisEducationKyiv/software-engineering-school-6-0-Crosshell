import { appConfig } from '@/shared/config';

export function buildConfirmUrl(token: string): string {
  return `${appConfig.frontendUrl}/confirm.html?token=${token}`;
}

export function buildUnsubscribeUrl(token: string): string {
  return `${appConfig.frontendUrl}/unsubscribe.html?token=${token}`;
}
