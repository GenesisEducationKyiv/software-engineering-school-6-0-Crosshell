import { test, expect } from '@playwright/test';
import {
  clearEmails,
  extractUnsubscribeToken,
  waitForEmail,
} from './helpers/email.helper';

const TEST_REPO = 'golang/go';

test.beforeEach(async ({ request }) => {
  await clearEmails(request);
});

test('shows success message for valid unsubscribe token', async ({
  page,
  request,
}) => {
  const email = `unsub+${Date.now()}@example.com`;

  await request.post('/api/subscribe', {
    data: { email, repo: TEST_REPO },
  });

  const body = await waitForEmail(request, email);
  const token = extractUnsubscribeToken(body);

  await page.goto(`/unsubscribe.html?token=${token}`);
  await page.locator('#form-view button').click();

  await expect(page.locator('#status-view')).toBeVisible({ timeout: 10_000 });
  await expect(page.locator('#title')).toHaveText('Unsubscribed');
});

test('shows error message for invalid unsubscribe token', async ({ page }) => {
  await page.goto(
    '/unsubscribe.html?token=00000000-0000-0000-0000-000000000000',
  );
  await page.locator('#form-view button').click();

  await expect(page.locator('#status-view')).toBeVisible({ timeout: 10_000 });
  await expect(page.locator('#title')).toHaveText('Failed to unsubscribe');
});
