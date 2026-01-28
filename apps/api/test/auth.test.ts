import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { UserRole } from '@prisma/client';

import { buildApp } from '../src/app.js';
import { hashPassword } from '../src/lib/password.js';

let app: ReturnType<typeof buildApp>;

async function resetDb() {
  const prisma = app.prisma;

  await prisma.auditLog.deleteMany();
  await prisma.changeRequest.deleteMany();
  await prisma.hourLedgerEntry.deleteMany();
  await prisma.session.deleteMany();
  await prisma.teacherStudentRate.deleteMany();
  await prisma.studentProfile.deleteMany();
  await prisma.teacherProfile.deleteMany();
  await prisma.user.deleteMany();
  await prisma.organization.deleteMany();
}

async function createUser(params: {
  role: UserRole;
  email: string;
  password: string;
  displayName?: string;
  timeZone?: string;
}) {
  const prisma = app.prisma;
  const org = await prisma.organization.create({ data: { name: 'Test Org' } });

  const user = await prisma.user.create({
    data: {
      orgId: org.id,
      email: params.email,
      passwordHash: hashPassword(params.password),
      role: params.role,
    },
  });

  if (params.role === UserRole.STUDENT) {
    await prisma.studentProfile.create({
      data: {
        userId: user.id,
        displayName: params.displayName ?? 'Test Student',
        timeZone: params.timeZone ?? 'Asia/Shanghai',
      },
    });
  }

  if (params.role === UserRole.TEACHER) {
    await prisma.teacherProfile.create({
      data: {
        userId: user.id,
        displayName: params.displayName ?? 'Test Teacher',
        timeZone: params.timeZone ?? 'Australia/Sydney',
      },
    });
  }

  return user;
}

beforeAll(async () => {
  process.env['JWT_SECRET'] = process.env['JWT_SECRET'] ?? 'test_secret';
  process.env['JWT_ACCESS_TTL_SECONDS'] = process.env['JWT_ACCESS_TTL_SECONDS'] ?? '900';
  process.env['JWT_REFRESH_TTL_SECONDS'] = process.env['JWT_REFRESH_TTL_SECONDS'] ?? '2592000';
  process.env['AUTH_LOGIN_RATE_LIMIT_MAX'] = '3';
  process.env['AUTH_LOGIN_RATE_LIMIT_WINDOW_MS'] = '60000';

  app = buildApp({ logger: false });
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

beforeEach(async () => {
  await resetDb();
});

describe('auth + rbac', () => {
  it('login with correct password returns accessToken and sets httpOnly refresh cookie', async () => {
    await createUser({
      role: UserRole.TEACHER,
      email: 'teacher@example.com',
      password: 'password123',
    });

    const res = await request(app.server)
      .post('/auth/login')
      .set('x-forwarded-for', '203.0.113.10')
      .send({ email: 'teacher@example.com', password: 'password123' })
      .expect(200);

    expect(res.body).toHaveProperty('accessToken');
    expect(typeof res.body.accessToken).toBe('string');

    const cookies = res.headers['set-cookie'];
    expect(cookies).toBeTruthy();
    expect(cookies?.join('\n')).toContain('HttpOnly');
    expect(cookies?.join('\n')).toContain(`${app.auth.refreshCookieName}=`);
  });

  it('login with wrong password returns 401', async () => {
    await createUser({
      role: UserRole.TEACHER,
      email: 'teacher@example.com',
      password: 'password123',
    });

    await request(app.server)
      .post('/auth/login')
      .set('x-forwarded-for', '203.0.113.11')
      .send({ email: 'teacher@example.com', password: 'wrong' })
      .expect(401);
  });

  it('GET /me without token returns 401', async () => {
    await request(app.server).get('/me').expect(401);
  });

  it('GET /me with token returns correct user info + profile', async () => {
    const user = await createUser({
      role: UserRole.TEACHER,
      email: 'teacher@example.com',
      password: 'password123',
      displayName: 'Alice',
      timeZone: 'Australia/Sydney',
    });

    const login = await request(app.server)
      .post('/auth/login')
      .set('x-forwarded-for', '203.0.113.12')
      .send({ email: 'teacher@example.com', password: 'password123' })
      .expect(200);

    const token: string = login.body.accessToken;
    const me = await request(app.server).get('/me').set('Authorization', `Bearer ${token}`).expect(200);

    expect(me.body).toMatchObject({
      id: user.id,
      role: UserRole.TEACHER,
      profile: {
        displayName: 'Alice',
        timeZone: 'Australia/Sydney',
      },
    });
  });

  it('non-admin user accessing /admin/ping returns 403', async () => {
    await createUser({
      role: UserRole.TEACHER,
      email: 'teacher@example.com',
      password: 'password123',
    });

    const login = await request(app.server)
      .post('/auth/login')
      .set('x-forwarded-for', '203.0.113.13')
      .send({ email: 'teacher@example.com', password: 'password123' })
      .expect(200);

    const token: string = login.body.accessToken;
    await request(app.server).get('/admin/ping').set('Authorization', `Bearer ${token}`).expect(403);
  });

  it('expired access token cannot access /me', async () => {
    const user = await createUser({
      role: UserRole.TEACHER,
      email: 'teacher@example.com',
      password: 'password123',
    });

    const token = app.jwt.sign(
      { tokenType: 'access', userId: user.id, role: UserRole.TEACHER },
      { expiresIn: 1 },
    );

    await new Promise((resolve) => setTimeout(resolve, 1200));

    await request(app.server).get('/me').set('Authorization', `Bearer ${token}`).expect(401);
  });

  it('login triggers rate limiting after repeated failures', async () => {
    await createUser({
      role: UserRole.TEACHER,
      email: 'teacher@example.com',
      password: 'password123',
    });

    const ip = '203.0.113.99';

    await request(app.server)
      .post('/auth/login')
      .set('x-forwarded-for', ip)
      .send({ email: 'teacher@example.com', password: 'wrong' })
      .expect(401);

    await request(app.server)
      .post('/auth/login')
      .set('x-forwarded-for', ip)
      .send({ email: 'teacher@example.com', password: 'wrong' })
      .expect(401);

    await request(app.server)
      .post('/auth/login')
      .set('x-forwarded-for', ip)
      .send({ email: 'teacher@example.com', password: 'wrong' })
      .expect(401);

    await request(app.server)
      .post('/auth/login')
      .set('x-forwarded-for', ip)
      .send({ email: 'teacher@example.com', password: 'wrong' })
      .expect(429);
  });
});
