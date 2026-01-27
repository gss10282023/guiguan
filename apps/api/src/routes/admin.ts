import { UserRole } from '@prisma/client';
import type { FastifyPluginAsync } from 'fastify';

const adminRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get(
    '/ping',
    {
      preHandler: fastify.requireRole([UserRole.ADMIN]),
    },
    async () => ({ ok: true }),
  );
};

export default adminRoutes;

