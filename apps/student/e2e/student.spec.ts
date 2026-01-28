import { expect, test } from '@playwright/test';

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

