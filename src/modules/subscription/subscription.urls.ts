export function buildConfirmUrl(token: string, appUrl: string): string {
  return `${appUrl}/confirm.html?token=${encodeURIComponent(token)}`;
}

export function buildUnsubscribeUrl(token: string, appUrl: string): string {
  return `${appUrl}/unsubscribe.html?token=${encodeURIComponent(token)}`;
}
