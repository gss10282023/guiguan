import type { FastifyPluginAsync } from 'fastify';

const meRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get(
    '/me',
    {
      preHandler: fastify.authenticate,
    },
    async (request, reply) => {
      const user = await fastify.prisma.user.findUnique({
        where: { id: request.user.userId },
        include: { studentProfile: true, teacherProfile: true },
      });

      if (!user) return reply.code(401).send({ message: 'Unauthorized' });

      const profile = user.studentProfile ?? user.teacherProfile;

      return {
        id: user.id,
        role: user.role,
        profile: profile
          ? {
              displayName: profile.displayName,
              timeZone: profile.timeZone,
            }
          : null,
      };
    },
  );
};

export default meRoutes;
