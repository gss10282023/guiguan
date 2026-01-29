import { expect, test } from '@playwright/test';

test('学生端：未登录访问根路径不应闪到 /calendar', async ({ page }) => {
  const navigations: string[] = [];
  page.on('framenavigated', (frame) => {
    if (frame === page.mainFrame()) navigations.push(frame.url());
  });

  await page.addInitScript(() => window.localStorage.clear());
  await page.context().clearCookies();

  await page.goto('/');
  await expect(page).toHaveURL(/\/login$/);

  expect(navigations.some((url) => new URL(url).pathname === '/calendar')).toBe(false);
});

test('学生端：登录 → 课表 → 剩余课时', async ({ page }) => {
  await page.goto('/login');

  await page.getByTestId('email').fill('student@example.com');
  await page.getByTestId('password').fill('password123');
  await page.getByTestId('login-submit').click();

  await expect(page).toHaveURL(/\/calendar$/);
  await expect(page.getByTestId('session-item').first()).toBeVisible();

  await page.getByRole('link', { name: '课时' }).click();
  await expect(page).toHaveURL(/\/hours$/);
  await expect(page.getByTestId('remaining-units')).toHaveText('10');
});
