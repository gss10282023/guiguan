import { expect, test } from '@playwright/test';

test('老师端：登录 → 课表 → 周工资（并验证无 admin 权限）', async ({ page, request }) => {
  await page.goto('/login');

  await page.getByTestId('email').fill('teacher@example.com');
  await page.getByTestId('password').fill('password123');
  await page.getByTestId('login-submit').click();

  await expect(page).toHaveURL(/\/calendar$/);
  await expect(page.getByTestId('session-item').first()).toBeVisible();

  await page.getByRole('link', { name: '工资' }).click();
  await expect(page).toHaveURL(/\/payroll$/);
  await expect(page.getByTestId('payroll-week-range')).toBeVisible();
  await expect(page.getByTestId('payroll-totals')).toBeVisible();

  const accessToken = await page.evaluate(() => window.localStorage.getItem('guiguan:teacher:accessToken'));
  expect(accessToken).toBeTruthy();

  const adminPing = await request.get('http://localhost:3001/admin/ping', {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  expect(adminPing.status()).toBe(403);
});

