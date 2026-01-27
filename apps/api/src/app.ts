import Fastify from 'fastify';

import authPlugin from './plugins/auth.js';
import prismaPlugin from './plugins/prisma.js';
import adminRoutes from './routes/admin.js';
import authRoutes from './routes/auth.js';
import meRoutes from './routes/me.js';

export function buildApp(options?: { logger?: boolean }) {
  const app = Fastify({ logger: options?.logger ?? true });

  app.register(prismaPlugin);
  app.register(authPlugin);

  app.get('/health', async () => ({ status: 'ok' }));

  app.register(authRoutes, { prefix: '/auth' });
  app.register(meRoutes);
  app.register(adminRoutes, { prefix: '/admin' });

  return app;
}

