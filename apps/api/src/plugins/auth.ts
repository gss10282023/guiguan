import type { CookieSerializeOptions } from '@fastify/cookie';
import type { UserRole } from '@prisma/client';
import type { preHandlerAsyncHookHandler } from 'fastify';
import fp from 'fastify-plugin';

import cookie from '@fastify/cookie';
import jwt from '@fastify/jwt';

type TokenType = 'access' | 'refresh';

type JwtUser = {
  tokenType: TokenType;
  userId: string;
  role: UserRole;
};

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: JwtUser;
    user: JwtUser;
  }
}

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: preHandlerAsyncHookHandler;
    requireRole: (roles: UserRole[]) => preHandlerAsyncHookHandler;
    auth: {
      accessTokenTtlSeconds: number;
      refreshTokenTtlSeconds: number;
      refreshCookieName: string;
      refreshCookieOptions: CookieSerializeOptions;
      refreshCookieClearOptions: CookieSerializeOptions;
    };
  }
}

function readIntEnv(varName: string, fallback: number): number {
  const raw = process.env[varName];
  if (!raw) return fallback;
  const value = Number(raw);
  return Number.isFinite(value) ? value : fallback;
}

function getJwtSecret(): string {
  const secret = process.env['JWT_SECRET'];
  if (secret) return secret;
  if (process.env['NODE_ENV'] === 'production') {
    throw new Error('Missing env: JWT_SECRET');
  }
  return 'dev_jwt_secret_change_me';
}

const authPlugin = fp(async (fastify) => {
  const isProd = process.env['NODE_ENV'] === 'production';
  const jwtSecret = getJwtSecret();

  const accessTokenTtlSeconds = readIntEnv('JWT_ACCESS_TTL_SECONDS', 15 * 60);
  const refreshTokenTtlSeconds = readIntEnv('JWT_REFRESH_TTL_SECONDS', 30 * 24 * 60 * 60);

  const refreshCookieName = process.env['JWT_REFRESH_COOKIE_NAME'] ?? 'refreshToken';
  const refreshCookieClearOptions: CookieSerializeOptions = {
    httpOnly: true,
    sameSite: 'lax',
    secure: isProd,
    path: '/',
  };

  const refreshCookieOptions: CookieSerializeOptions = {
    ...refreshCookieClearOptions,
    maxAge: refreshTokenTtlSeconds,
  };

  fastify.decorate('auth', {
    accessTokenTtlSeconds,
    refreshTokenTtlSeconds,
    refreshCookieName,
    refreshCookieOptions,
    refreshCookieClearOptions,
  });

  await fastify.register(cookie);
  await fastify.register(jwt, { secret: jwtSecret });

  fastify.decorate('authenticate', async (request, reply) => {
    try {
      await request.jwtVerify();

      if (request.user.tokenType !== 'access') {
        return reply.code(401).send({ message: 'Unauthorized' });
      }
    } catch {
      return reply.code(401).send({ message: 'Unauthorized' });
    }
  });

  fastify.decorate('requireRole', (roles: UserRole[]) => {
    const preHandler: preHandlerAsyncHookHandler = async (request, reply) => {
      await fastify.authenticate(request, reply);
      if (reply.sent) return;

      if (!roles.includes(request.user.role)) {
        return reply.code(403).send({ message: 'Forbidden' });
      }
    };
    return preHandler;
  });
});

export default authPlugin;
