import type { APIRequestContext } from '@playwright/test';

const MAILHOG_URL = 'http://localhost:8025';

interface MailhogMessage {
  To: Array<{ Mailbox: string; Domain: string }>;
  Content: { Body: string };
}

interface MailhogV2Response {
  items: MailhogMessage[];
}

function decodeQP(str: string): string {
  return str
    .replace(/=\r?\n/g, '')
    .replace(/=([0-9A-Fa-f]{2})/g, (_, hex: string) =>
      String.fromCharCode(parseInt(hex, 16)),
    );
}

export async function clearEmails(request: APIRequestContext): Promise<void> {
  await request.delete(`${MAILHOG_URL}/api/v1/messages`);
}

export async function waitForEmail(
  request: APIRequestContext,
  to: string,
  timeout = 15_000,
): Promise<string> {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const res = await request.get(`${MAILHOG_URL}/api/v2/messages`);
    const data = (await res.json()) as MailhogV2Response;
    for (const item of data.items ?? []) {
      const recipient = `${item.To[0]?.Mailbox}@${item.To[0]?.Domain}`;
      if (recipient === to) {
        return decodeQP(item.Content.Body);
      }
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`Email to ${to} not received within ${timeout}ms`);
}

export function extractConfirmToken(body: string): string {
  const match = body.match(/confirm\.html\?token=([a-f0-9-]+)/i);
  if (!match?.[1]) throw new Error('Confirm token not found in email body');
  return match[1];
}
