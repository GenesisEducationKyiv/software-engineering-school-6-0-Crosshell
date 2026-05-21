export function buildConfirmUrl(token: string, appUrl: string): string {
  return `${appUrl}/confirm.html?token=${encodeURIComponent(token)}`;
}
