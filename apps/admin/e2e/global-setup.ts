import { execSync } from 'node:child_process';
import path from 'node:path';

export default async function globalSetup() {
  const workspaceRoot = path.join(__dirname, '..', '..', '..');

  execSync('pnpm --filter @guiguan/api db:migrate', {
    cwd: workspaceRoot,
    stdio: 'inherit',
  });

  execSync('pnpm --filter @guiguan/api db:seed', {
    cwd: workspaceRoot,
    stdio: 'inherit',
  });
}

