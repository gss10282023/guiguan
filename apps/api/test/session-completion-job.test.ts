import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { Currency, HourLedgerReason, SessionStatus, UserRole } from '@prisma/client';

import { buildApp } from '../src/app.js';
import { completeEndedSessions } from '../src/jobs/completeEndedSessions.js';
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

  const student = await prisma.user.create({
    data: { orgId: org.id, email: 'student@example.com', passwordHash, role: UserRole.STUDENT },
  });
  await prisma.studentProfile.create({
    data: { userId: student.id, displayName: 'Test Student', timeZone: 'Asia/Shanghai' },
  });

  await prisma.teacherStudentRate.create({
    data: {
      teacherId: teacher.id,
      studentId: student.id,
      studentHourlyRateCents: 10000,
      teacherHourlyWageCents: 10000,
      currency: Currency.AUD,
    },
  });

  await prisma.hourLedgerEntry.create({
    data: { studentId: student.id, deltaUnits: 10, reason: HourLedgerReason.PURCHASE },
  });

  return { org, admin, teacher, student };
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

describe('session completion job (step 7)', () => {
  it('completes ended sessions and deducts hours (idempotent)', async () => {
    const { teacher, student, admin } = await createOrgWithUsers();

    const startAtUtc = new Date('2030-01-01T10:00:00.000Z');
    const endAtUtc = new Date('2030-01-01T11:00:00.000Z');

    const session = await app.prisma.session.create({
      data: {
        teacherId: teacher.id,
        studentId: student.id,
        startAtUtc,
        endAtUtc,
        classTimeZone: 'Australia/Sydney',
        status: SessionStatus.SCHEDULED,
        consumesUnits: 1,
        studentHourlyRateCentsSnapshot: 10000,
        teacherHourlyWageCentsSnapshot: 10000,
        currencySnapshot: Currency.AUD,
        createdByAdminId: admin.id,
      },
      select: { id: true },
    });

    const token = await loginAs('student@example.com', 'password123');

    const before = await request(app.server).get('/student/hours').set('Authorization', `Bearer ${token}`).expect(200);
    expect(before.body).toEqual({ remainingUnits: 10 });

    const now = new Date('2030-01-02T00:00:00.000Z');
    await completeEndedSessions(app.prisma, { now });

    const updatedSession = await app.prisma.session.findUnique({
      where: { id: session.id },
      select: { status: true },
    });
    expect(updatedSession?.status).toBe(SessionStatus.COMPLETED);

    const ledgerAfter = await app.prisma.hourLedgerEntry.findMany({
      where: { sessionId: session.id },
      select: { deltaUnits: true, reason: true, studentId: true, sessionId: true },
    });
    expect(ledgerAfter).toEqual([
      {
        deltaUnits: -1,
        reason: HourLedgerReason.SESSION_CONSUME,
        studentId: student.id,
        sessionId: session.id,
      },
    ]);

    const after1 = await request(app.server).get('/student/hours').set('Authorization', `Bearer ${token}`).expect(200);
    expect(after1.body).toEqual({ remainingUnits: 9 });

    await completeEndedSessions(app.prisma, { now });

    const ledgerAfter2 = await app.prisma.hourLedgerEntry.findMany({
      where: { sessionId: session.id },
      select: { id: true },
    });
    expect(ledgerAfter2).toHaveLength(1);

    const after2 = await request(app.server).get('/student/hours').set('Authorization', `Bearer ${token}`).expect(200);
    expect(after2.body).toEqual({ remainingUnits: 9 });
  });
});
