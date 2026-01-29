import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { Currency, SessionStatus, UserRole } from '@prisma/client';

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

async function loginAs(email: string, password: string): Promise<string> {
  const login = await request(app.server).post('/auth/login').send({ email, password }).expect(200);
  return login.body.accessToken as string;
}

async function createOrgWithUsers() {
  const prisma = app.prisma;
  const org = await prisma.organization.create({ data: { name: 'Test Org' } });

  const passwordHash = hashPassword('password123');

  const admin = await prisma.user.create({
    data: { orgId: org.id, email: 'admin@example.com', passwordHash, role: UserRole.ADMIN },
  });

  const teacher = await prisma.user.create({
    data: { orgId: org.id, email: 'teacher@example.com', passwordHash, role: UserRole.TEACHER },
  });
  await prisma.teacherProfile.create({
    data: { userId: teacher.id, displayName: 'Test Teacher', timeZone: 'Australia/Sydney' },
  });

  const studentAud = await prisma.user.create({
    data: { orgId: org.id, email: 'student-aud@example.com', passwordHash, role: UserRole.STUDENT },
  });
  await prisma.studentProfile.create({
    data: { userId: studentAud.id, displayName: 'Student AUD', timeZone: 'Australia/Sydney' },
  });

  const studentUsd = await prisma.user.create({
    data: { orgId: org.id, email: 'student-usd@example.com', passwordHash, role: UserRole.STUDENT },
  });
  await prisma.studentProfile.create({
    data: { userId: studentUsd.id, displayName: 'Student USD', timeZone: 'Australia/Sydney' },
  });

  await prisma.teacherStudentRate.create({
    data: {
      teacherId: teacher.id,
      studentId: studentAud.id,
      studentHourlyRateCents: 10000,
      teacherHourlyWageCents: 10000,
      currency: Currency.AUD,
    },
  });
  await prisma.teacherStudentRate.create({
    data: {
      teacherId: teacher.id,
      studentId: studentUsd.id,
      studentHourlyRateCents: 12000,
      teacherHourlyWageCents: 12000,
      currency: Currency.USD,
    },
  });

  return { org, admin, teacher, studentAud, studentUsd };
}

beforeAll(async () => {
  process.env['JWT_SECRET'] = process.env['JWT_SECRET'] ?? 'test_secret';
  process.env['JWT_ACCESS_TTL_SECONDS'] = process.env['JWT_ACCESS_TTL_SECONDS'] ?? '900';
  process.env['JWT_REFRESH_TTL_SECONDS'] = process.env['JWT_REFRESH_TTL_SECONDS'] ?? '2592000';
  process.env['AUTH_LOGIN_RATE_LIMIT_MAX'] = '1000';
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

describe('teacher payroll (step 9)', () => {
  it('aggregates COMPLETED sessions by Sydney week boundary and currency', async () => {
    const { admin, teacher, studentAud, studentUsd } = await createOrgWithUsers();
    const teacherToken = await loginAs('teacher@example.com', 'password123');

    const prisma = app.prisma;

    await prisma.session.createMany({
      data: [
        {
          teacherId: teacher.id,
          studentId: studentAud.id,
          startAtUtc: new Date('2030-06-02T15:00:00.000Z'),
          endAtUtc: new Date('2030-06-02T16:00:00.000Z'),
          classTimeZone: 'Australia/Sydney',
          status: SessionStatus.COMPLETED,
          consumesUnits: 1,
          studentHourlyRateCentsSnapshot: 10000,
          teacherHourlyWageCentsSnapshot: 10000,
          currencySnapshot: Currency.AUD,
          createdByAdminId: admin.id,
        },
        {
          teacherId: teacher.id,
          studentId: studentAud.id,
          startAtUtc: new Date('2030-06-09T12:00:00.000Z'),
          endAtUtc: new Date('2030-06-09T13:30:00.000Z'),
          classTimeZone: 'Australia/Sydney',
          status: SessionStatus.COMPLETED,
          consumesUnits: 1,
          studentHourlyRateCentsSnapshot: 10000,
          teacherHourlyWageCentsSnapshot: 10000,
          currencySnapshot: Currency.AUD,
          createdByAdminId: admin.id,
        },
        {
          teacherId: teacher.id,
          studentId: studentUsd.id,
          startAtUtc: new Date('2030-06-04T00:00:00.000Z'),
          endAtUtc: new Date('2030-06-04T01:00:00.000Z'),
          classTimeZone: 'Australia/Sydney',
          status: SessionStatus.COMPLETED,
          consumesUnits: 1,
          studentHourlyRateCentsSnapshot: 12000,
          teacherHourlyWageCentsSnapshot: 12000,
          currencySnapshot: Currency.USD,
          createdByAdminId: admin.id,
        },
        {
          teacherId: teacher.id,
          studentId: studentAud.id,
          startAtUtc: new Date('2030-06-06T00:00:00.000Z'),
          endAtUtc: new Date('2030-06-06T01:00:00.000Z'),
          classTimeZone: 'Australia/Sydney',
          status: SessionStatus.SCHEDULED,
          consumesUnits: 1,
          studentHourlyRateCentsSnapshot: 10000,
          teacherHourlyWageCentsSnapshot: 10000,
          currencySnapshot: Currency.AUD,
          createdByAdminId: admin.id,
        },
        {
          teacherId: teacher.id,
          studentId: studentAud.id,
          startAtUtc: new Date('2030-06-09T13:30:00.000Z'),
          endAtUtc: new Date('2030-06-09T14:00:00.000Z'),
          classTimeZone: 'Australia/Sydney',
          status: SessionStatus.COMPLETED,
          consumesUnits: 1,
          studentHourlyRateCentsSnapshot: 10000,
          teacherHourlyWageCentsSnapshot: 10000,
          currencySnapshot: Currency.AUD,
          createdByAdminId: admin.id,
        },
      ],
    });

    const weekStart = '2030-06-03';
    const payroll = await request(app.server)
      .get(`/teacher/payroll?weekStart=${weekStart}`)
      .set('Authorization', `Bearer ${teacherToken}`)
      .expect(200);

    expect(payroll.body).toEqual({
      weekStartLocal: weekStart,
      weekEndLocal: '2030-06-09',
      totals: [
        { currency: 'AUD', totalCents: 25000, totalHours: 2.5, sessionsCount: 2 },
        { currency: 'USD', totalCents: 12000, totalHours: 1, sessionsCount: 1 },
      ],
      byStudent: [
        {
          studentId: studentAud.id,
          studentName: 'Student AUD',
          totals: [{ currency: 'AUD', totalCents: 25000, totalHours: 2.5, sessionsCount: 2 }],
        },
        {
          studentId: studentUsd.id,
          studentName: 'Student USD',
          totals: [{ currency: 'USD', totalCents: 12000, totalHours: 1, sessionsCount: 1 }],
        },
      ],
    });
  });

  it('rejects non-Monday weekStart', async () => {
    await createOrgWithUsers();
    const teacherToken = await loginAs('teacher@example.com', 'password123');

    await request(app.server)
      .get('/teacher/payroll?weekStart=2030-06-04')
      .set('Authorization', `Bearer ${teacherToken}`)
      .expect(400);
  });
});
