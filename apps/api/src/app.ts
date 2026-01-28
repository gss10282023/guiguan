import Fastify from 'fastify';
import { randomUUID } from 'node:crypto';
import net from 'node:net';

import rateLimit from '@fastify/rate-limit';

import authPlugin from './plugins/auth.js';
import prismaPlugin from './plugins/prisma.js';
import adminRoutes from './routes/admin.js';
import authRoutes from './routes/auth.js';
import meRoutes from './routes/me.js';
import studentRoutes from './routes/student.js';
import teacherRoutes from './routes/teacher.js';

function readIntEnv(varName: string, fallback: number): number {
  const raw = process.env[varName];
  if (!raw) return fallback;
  const value = Number(raw);
  return Number.isFinite(value) ? value : fallback;
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, timeoutMessage: string): Promise<T> {
  if (timeoutMs <= 0) return promise;

  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(timeoutMessage));
    }, timeoutMs);

    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

async function pingRedis(redisUrl: string, timeoutMs: number): Promise<void> {
  const url = new URL(redisUrl);
  if (url.protocol !== 'redis:') throw new Error(`Unsupported redis url protocol: ${url.protocol}`);

  const host = url.hostname;
  const port = Number(url.port || '6379');

  await new Promise<void>((resolve, reject) => {
    const socket = net.createConnection({ host, port });

    const timer = setTimeout(() => {
      socket.destroy();
      reject(new Error('Redis ping timeout'));
    }, timeoutMs);

    function cleanup() {
      clearTimeout(timer);
      socket.removeAllListeners();
    }

    socket.on('error', (error) => {
      cleanup();
      reject(error);
    });

    socket.on('connect', () => {
      // RESP: PING
      socket.write('*1\r\n$4\r\nPING\r\n');
    });

    socket.on('data', (data) => {
      const payload = data.toString('utf8');
      if (payload.includes('PONG')) {
        cleanup();
        socket.end();
        resolve();
      } else if (payload.startsWith('-')) {
        cleanup();
        socket.end();
        reject(new Error(`Redis error: ${payload.trim()}`));
      }
    });
  });
}

export function buildApp(options?: { logger?: boolean }) {
  const loggerEnabled = options?.logger ?? true;
  const logLevel = process.env['LOG_LEVEL'] ?? 'info';

  const app = Fastify({
    logger: loggerEnabled
      ? {
          level: logLevel,
          redact: {
            paths: ['req.headers.authorization', 'req.headers.cookie'],
            remove: true,
          },
        }
      : false,
    requestIdHeader: 'x-request-id',
    genReqId(req) {
      const header = req.headers['x-request-id'];
      if (typeof header === 'string' && header.length > 0) return header;
      if (Array.isArray(header) && header[0]) return header[0];
      return randomUUID();
    },
  });

  app.addHook('onSend', async (request, reply, payload) => {
    if (!reply.hasHeader('x-request-id')) {
      reply.header('x-request-id', request.id);
    }
    return payload;
  });

  app.setErrorHandler((error, request, reply) => {
    request.log.error({ err: error }, 'request failed');

    const statusCode =
      typeof error.statusCode === 'number' && error.statusCode >= 400 && error.statusCode < 600
        ? error.statusCode
        : 500;

    if (statusCode === 429) return reply.code(429).send({ message: 'Too Many Requests' });
    if (statusCode === 400 && 'validation' in error) return reply.code(400).send({ message: 'Bad Request' });

    const message = statusCode >= 500 ? 'Internal Server Error' : error.message;
    return reply.code(statusCode).send({ message });
  });

  app.register(rateLimit, {
    global: false,
    keyGenerator(request) {
      const header = request.headers['x-forwarded-for'];
      if (typeof header === 'string' && header.length > 0) return header.split(',')[0]?.trim() || request.ip;
      if (Array.isArray(header) && header[0]) return header[0].split(',')[0]?.trim() || request.ip;
      return request.ip;
    },
  });

  app.register(prismaPlugin);
  app.register(authPlugin);

  app.get('/health', async () => ({ status: 'ok' }));
  app.get('/ready', async (request, reply) => {
    const timeoutMs = readIntEnv('READY_CHECK_TIMEOUT_MS', 1000);

    try {
      await withTimeout(app.prisma.$queryRaw`SELECT 1`, timeoutMs, 'Database ping timeout');
    } catch (error) {
      request.log.error({ err: error }, 'db not ready');
      return reply.code(503).send({ status: 'error', message: 'Database not ready' });
    }

    const redisUrl = process.env['REDIS_URL'];
    if (redisUrl) {
      try {
        await pingRedis(redisUrl, timeoutMs);
      } catch (error) {
        request.log.error({ err: error }, 'redis not ready');
        return reply.code(503).send({ status: 'error', message: 'Redis not ready' });
      }
    }

    return reply.send({ status: 'ok' });
  });

  app.register(authRoutes, { prefix: '/auth' });
  app.register(meRoutes);
  app.register(adminRoutes, { prefix: '/admin' });
  app.register(studentRoutes, { prefix: '/student' });
  app.register(teacherRoutes, { prefix: '/teacher' });

  return app;
}
