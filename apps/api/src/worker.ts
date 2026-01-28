import { PrismaClient } from '@prisma/client';

import { completeEndedSessions } from './jobs/completeEndedSessions.js';

function readIntEnv(varName: string, fallback: number): number {
  const raw = process.env[varName];
  if (!raw) return fallback;
  const value = Number(raw);
  return Number.isFinite(value) ? value : fallback;
}

const shouldRunOnce = process.argv.includes('--once');

const intervalMs = readIntEnv('SESSION_COMPLETION_INTERVAL_MS', 60_000);
const batchSize = readIntEnv('SESSION_COMPLETION_BATCH_SIZE', 100);

const prisma = new PrismaClient();

let isTickRunning = false;

async function tick() {
  if (isTickRunning) return;
  isTickRunning = true;
  try {
    await completeEndedSessions(prisma, { batchSize });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[worker] completeEndedSessions failed', error);
  } finally {
    isTickRunning = false;
  }
}

async function shutdown(signal: string) {
  // eslint-disable-next-line no-console
  console.log(`[worker] received ${signal}, shutting down...`);
  await prisma.$disconnect();
  process.exit(0);
}

process.on('SIGINT', () => {
  void shutdown('SIGINT');
});
process.on('SIGTERM', () => {
  void shutdown('SIGTERM');
});

await tick();

if (shouldRunOnce) {
  await prisma.$disconnect();
  process.exit(0);
}

setInterval(() => {
  void tick();
}, intervalMs);

