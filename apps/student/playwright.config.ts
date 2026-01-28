import { defineConfig, devices } from '@playwright/test';
import path from 'node:path';

const reuseExistingServer = process.env['CI'] ? false : true;
const workspaceRoot = path.join(__dirname, '..', '..');

export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/global-setup',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
  },
  webServer: [
    {
      command: 'pnpm --filter @guiguan/api dev',
      url: 'http://localhost:3001/health',
      reuseExistingServer,
      cwd: workspaceRoot,
      timeout: 120_000,
    },
    {
      command: 'pnpm --filter @guiguan/student dev',
      url: 'http://localhost:3000/login',
      reuseExistingServer,
      cwd: workspaceRoot,
      timeout: 120_000,
    },
  ],
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
