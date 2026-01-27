import type { FastifyPluginAsync } from 'fastify';
import type { UserRole } from '@prisma/client';

import { verifyPassword } from '../lib/password.js';

type LoginBody = {
  email: string;
  password: string;
};

const authRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post<{ Body: LoginBody }>(
    '/login',
    {
      schema: {
        body: {
          type: 'object',
          required: ['email', 'password'],
          additionalProperties: false,
          properties: {
            email: { type: 'string', minLength: 3 },
            password: { type: 'string', minLength: 1 },
          },
        },
      },
    },
    async (request, reply) => {
      const { email, password } = request.body;

      const user = await fastify.prisma.user.findUnique({ where: { email } });
      if (!user) return reply.code(401).send({ message: 'Invalid credentials' });
      if (user.status !== 'ACTIVE') return reply.code(401).send({ message: 'Invalid credentials' });

      const ok = verifyPassword(password, user.passwordHash);
      if (!ok) return reply.code(401).send({ message: 'Invalid credentials' });

      const accessToken = fastify.jwt.sign(
        { tokenType: 'access', userId: user.id, role: user.role },
        { expiresIn: fastify.auth.accessTokenTtlSeconds },
      );

      const refreshToken = fastify.jwt.sign(
        { tokenType: 'refresh', userId: user.id, role: user.role },
        { expiresIn: fastify.auth.refreshTokenTtlSeconds },
      );

      reply.setCookie(fastify.auth.refreshCookieName, refreshToken, fastify.auth.refreshCookieOptions);
      return reply.send({ accessToken });
    },
  );

  fastify.post('/refresh', async (request, reply) => {
    const token = request.cookies[fastify.auth.refreshCookieName];
    if (!token) return reply.code(401).send({ message: 'Unauthorized' });

    try {
      const decoded = fastify.jwt.verify(token);
      if (!decoded || typeof decoded !== 'object') return reply.code(401).send({ message: 'Unauthorized' });

      const payload = decoded as { tokenType: string; userId: string; role: UserRole };
      if (payload.tokenType !== 'refresh') return reply.code(401).send({ message: 'Unauthorized' });

      const user = await fastify.prisma.user.findUnique({ where: { id: payload.userId } });
      if (!user) return reply.code(401).send({ message: 'Unauthorized' });
      if (user.status !== 'ACTIVE') return reply.code(401).send({ message: 'Unauthorized' });

      const accessToken = fastify.jwt.sign(
        { tokenType: 'access', userId: user.id, role: user.role },
        { expiresIn: fastify.auth.accessTokenTtlSeconds },
      );

      const refreshToken = fastify.jwt.sign(
        { tokenType: 'refresh', userId: user.id, role: user.role },
        { expiresIn: fastify.auth.refreshTokenTtlSeconds },
      );

      reply.setCookie(fastify.auth.refreshCookieName, refreshToken, fastify.auth.refreshCookieOptions);
      return reply.send({ accessToken });
    } catch {
      return reply.code(401).send({ message: 'Unauthorized' });
    }
  });

  fastify.post('/logout', async (_request, reply) => {
    reply.clearCookie(fastify.auth.refreshCookieName, fastify.auth.refreshCookieClearOptions);
    return reply.send({ ok: true });
  });
};

export default authRoutes;
