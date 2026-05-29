export function buildUnsubscribeUrl(token: string, appUrl: string): string {
  return `${appUrl}/unsubscribe.html?token=${encodeURIComponent(token)}`;
}
