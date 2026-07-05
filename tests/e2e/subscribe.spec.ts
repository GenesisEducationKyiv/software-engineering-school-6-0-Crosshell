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

test('subscribes successfully and shows success alert', async ({ page }) => {
  const email = `sub+${Date.now()}@example.com`;

  await page.goto('/');
  await page.fill('#sub-email', email);
  await page.fill('#sub-repo', TEST_REPO);
  await page.click('#subscribe-form button[type="submit"]');

  const alert = page.locator('#sub-alert');
  await expect(alert).toBeVisible({ timeout: 15_000 });
  await expect(alert).toHaveClass(/success/);
});

test('invalid email triggers browser validation and does not submit', async ({
  page,
}) => {
  await page.goto('/');
  await page.fill('#sub-email', 'not-an-email');
  await page.fill('#sub-repo', TEST_REPO);
  await page.click('#subscribe-form button[type="submit"]');

  await expect(page.locator('#sub-alert')).not.toBeVisible();
});

test('repo without slash shows format validation error', async ({ page }) => {
  await page.goto('/');
  await page.fill('#sub-email', `sub+${Date.now()}@example.com`);
  await page.fill('#sub-repo', 'noslash');
  await page.click('#subscribe-form button[type="submit"]');

  const alert = page.locator('#sub-alert');
  await expect(alert).toBeVisible({ timeout: 10_000 });
  await expect(alert).toHaveClass(/error/);
  await expect(alert).toContainText(/owner\/repo format/i);
});

test('subscribing twice to same repo shows error alert', async ({
  page,
  request,
}) => {
  const email = `dupe+${Date.now()}@example.com`;

  await request.post('/api/subscribe', {
    data: { email, repo: TEST_REPO },
  });

  await page.goto('/');
  await page.fill('#sub-email', email);
  await page.fill('#sub-repo', TEST_REPO);
  await page.click('#subscribe-form button[type="submit"]');

  const alert = page.locator('#sub-alert');
  await expect(alert).toBeVisible({ timeout: 15_000 });
  await expect(alert).toHaveClass(/error/);
  await expect(alert).toContainText('already subscribed');
});

test('sends a confirmation email after successful subscription', async ({
  page,
  request,
}) => {
  const email = `mail+${Date.now()}@example.com`;

  await page.goto('/');
  await page.fill('#sub-email', email);
  await page.fill('#sub-repo', TEST_REPO);
  await page.click('#subscribe-form button[type="submit"]');

  await expect(page.locator('#sub-alert')).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('#sub-alert')).toHaveClass(/success/);

  const body = await waitForEmail(request, email);
  expect(body).toMatch(/confirm/i);
});

test('My subscriptions tab shows empty state for email with no confirmed subscriptions', async ({
  page,
}) => {
  await page.goto('/');
  await page.click('[data-tab="subscriptions"]');
  await page.fill('#lookup-email', 'nobody@example.com');
  await page.click('#panel-subscriptions button[type="submit"]');

  await expect(page.locator('#sub-list .empty')).toBeVisible({
    timeout: 10_000,
  });
});

test('My subscriptions tab shows confirmed subscription after confirming via email', async ({
  page,
  request,
}) => {
  const email = `list+${Date.now()}@example.com`;

  await request.post('/api/subscribe', { data: { email, repo: TEST_REPO } });

  const body = await waitForEmail(request, email);
  const token = extractConfirmToken(body);

  await page.goto(`/confirm.html?token=${token}`);
  await page.click('#submit-btn');
  await expect(page.locator('#title')).toHaveText('Confirmed!');

  await page.goto('/');
  await page.click('[data-tab="subscriptions"]');
  await page.fill('#lookup-email', email);
  await page.click('#panel-subscriptions button[type="submit"]');

  await expect(page.locator('#sub-list .sub-item')).toBeVisible({
    timeout: 10_000,
  });
  await expect(page.locator('#sub-list')).toContainText(TEST_REPO);
});
