import { test, expect } from '@playwright/test';
import {
  clearEmails,
  extractConfirmToken,
  waitForEmail,
} from './helpers/email.helper';

const TEST_REPO = 'golang/go';

test.beforeEach(async ({ request }) => {
  await clearEmails(request);
});

test('shows success message for valid confirm token', async ({
  page,
  request,
}) => {
  const email = `confirm+${Date.now()}@example.com`;

  await request.post('/api/subscribe', {
    data: { email, repo: TEST_REPO },
  });

  const body = await waitForEmail(request, email);
  const token = extractConfirmToken(body);

  await page.goto(`/confirm.html?token=${token}`);
  await page.click('#submit-btn');

  await expect(page.locator('#status-view')).toBeVisible({ timeout: 10_000 });
  await expect(page.locator('#title')).toHaveText('Confirmed!');
});

test('shows error message for invalid confirm token', async ({ page }) => {
  await page.goto('/confirm.html?token=00000000-0000-0000-0000-000000000000');
  await page.click('#submit-btn');

  await expect(page.locator('#status-view')).toBeVisible({ timeout: 10_000 });
  await expect(page.locator('#title')).toHaveText('Confirmation failed');
});
