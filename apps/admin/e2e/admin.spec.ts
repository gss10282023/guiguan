import { expect, test } from '@playwright/test';

test('管理员端：未登录访问根路径不应闪到 /students', async ({ page }) => {
  const navigations: string[] = [];
  page.on('framenavigated', (frame) => {
    if (frame === page.mainFrame()) navigations.push(frame.url());
  });

  await page.addInitScript(() => window.localStorage.clear());
  await page.context().clearCookies();

  await page.goto('/');
  await expect(page).toHaveURL(/\/login$/);

  expect(navigations.some((url) => new URL(url).pathname === '/students')).toBe(false);
});

function toDateTimeLocalValue(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  const hour = pad(date.getHours());
  const minute = pad(date.getMinutes());
  return `${year}-${month}-${day}T${hour}:${minute}`;
}

test('管理员端：创建学生 → 加课时 → 设费率 → 排课 → 学生端可见', async ({ page }) => {
  const nonce = Date.now();
  const studentEmail = `e2e.student.${nonce}@example.com`;
  const studentPassword = 'password123';
  const studentDisplayName = `E2E Student ${nonce}`;

  await page.goto('/login');
  await page.getByTestId('email').fill('admin@example.com');
  await page.getByTestId('password').fill('password123');
  await page.getByTestId('login-submit').click();

  await expect(page).toHaveURL(/\/students$/);

  await page.getByTestId('student-create-email').fill(studentEmail);
  await page.getByTestId('student-create-password').fill(studentPassword);
  await page.getByTestId('student-create-displayName').fill(studentDisplayName);
  await page.getByTestId('student-create-timeZone').selectOption('Asia/Shanghai');
  await page.getByTestId('student-create-submit').click();

  await expect(page).toHaveURL(/\/students\/.+/);

  await expect(page.getByTestId('student-remaining-units')).toHaveText('0');

  await page.getByTestId('add-hours-deltaUnits').fill('5');
  await page.getByTestId('add-hours-reason').selectOption('PURCHASE');
  await page.getByTestId('add-hours-submit').click();
  await expect(page.getByTestId('student-remaining-units')).toHaveText('5');

  await page.getByRole('link', { name: '费率' }).click();
  await expect(page).toHaveURL(/\/rates$/);

  await page.getByTestId('rate-teacherId').selectOption({ label: 'Seed Teacher (teacher@example.com)' });
  await page.getByTestId('rate-studentId').selectOption({ label: `${studentDisplayName} (${studentEmail})` });
  await page.getByTestId('rate-hourlyRateCents').fill('12000');
  await page.getByTestId('rate-currency').selectOption('AUD');
  await page.getByTestId('rate-submit').click();
  await expect(page.getByTestId('rate-success')).toBeVisible();

  await page.getByRole('link', { name: '排课' }).click();
  await expect(page).toHaveURL(/\/sessions$/);

  await page.getByRole('button', { name: '创建课程', exact: true }).click();

  await page.getByTestId('session-teacherId').selectOption({ label: 'Seed Teacher (teacher@example.com)' });
  await page.getByTestId('session-studentId').selectOption({ label: `${studentDisplayName} (${studentEmail})` });

  const slotBase = nonce;
  const slotIndex = slotBase % 18; // 9:00~17:30
  const hour = 9 + Math.floor(slotIndex / 2);
  const minute = slotIndex % 2 ? 30 : 0;
  const dayOffset = 1 + (Math.floor(slotBase / 18) % 7);

  const start = new Date();
  start.setSeconds(0, 0);
  start.setDate(start.getDate() + dayOffset);
  start.setHours(hour);
  start.setMinutes(minute);
  const end = new Date(start.getTime() + 60 * 60 * 1000);

  await page.getByTestId('session-startAt').fill(toDateTimeLocalValue(start));
  await page.getByTestId('session-endAt').fill(toDateTimeLocalValue(end));
  await page.getByTestId('session-timeZone').fill('Australia/Sydney');
  await page.getByTestId('session-submit').click();
  await expect(page.getByTestId('session-success')).toBeVisible();

  await page.goto('http://localhost:3000/login');
  await page.getByTestId('email').fill(studentEmail);
  await page.getByTestId('password').fill(studentPassword);
  await page.getByTestId('login-submit').click();

  await expect(page).toHaveURL(/\/calendar$/);
  await expect(page.getByTestId('session-item').first()).toBeVisible();

  await page.getByRole('link', { name: '课时' }).click();
  await expect(page).toHaveURL(/\/hours$/);
  await expect(page.getByTestId('remaining-units')).toHaveText('5');
});

test('非管理员不能登录管理员后台', async ({ page }) => {
  await page.goto('/login');

  await page.getByTestId('email').fill('teacher@example.com');
  await page.getByTestId('password').fill('password123');
  await page.getByTestId('login-submit').click();

  await expect(page.getByTestId('login-error')).toHaveText('无管理员权限');
});
