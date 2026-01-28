import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { HourLedgerReason, UserRole } from '@prisma/client';

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

async function createOrg() {
  return app.prisma.organization.create({ data: { name: 'Test Org' } });
}

async function createStudent(params: { orgId: string; email: string; password: string }) {
  const passwordHash = hashPassword(params.password);
  const student = await app.prisma.user.create({
    data: {
      orgId: params.orgId,
      email: params.email,
      passwordHash,
      role: UserRole.STUDENT,
      studentProfile: { create: { displayName: 'Test Student', timeZone: 'Asia/Shanghai' } },
    },
  });
  return student;
}

async function createTeacher(params: { orgId: string; email: string; password: string; displayName?: string }) {
  const passwordHash = hashPassword(params.password);
  const teacher = await app.prisma.user.create({
    data: {
      orgId: params.orgId,
      email: params.email,
      passwordHash,
      role: UserRole.TEACHER,
      teacherProfile: { create: { displayName: params.displayName ?? 'Test Teacher', timeZone: 'Australia/Sydney' } },
    },
  });
  return teacher;
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

describe('student hours (step 6)', () => {
  it('returns remainingUnits from ledger, and updates after a consume entry', async () => {
    const org = await createOrg();
    const student = await createStudent({ orgId: org.id, email: 'student@example.com', password: 'password123' });

    await app.prisma.hourLedgerEntry.create({
      data: { studentId: student.id, deltaUnits: 10, reason: HourLedgerReason.PURCHASE },
    });

    const token = await loginAs('student@example.com', 'password123');

    const initial = await request(app.server)
      .get('/student/hours')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(initial.body).toEqual({ remainingUnits: 10 });

    await app.prisma.hourLedgerEntry.create({
      data: { studentId: student.id, deltaUnits: -1, reason: HourLedgerReason.SESSION_CONSUME },
    });

    const afterConsume = await request(app.server)
      .get('/student/hours')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(afterConsume.body).toEqual({ remainingUnits: 9 });
  });

  it('student can only see their own remainingUnits', async () => {
    const org = await createOrg();
    const studentA = await createStudent({ orgId: org.id, email: 'a@example.com', password: 'password123' });
    const studentB = await createStudent({ orgId: org.id, email: 'b@example.com', password: 'password123' });

    await app.prisma.hourLedgerEntry.create({ data: { studentId: studentA.id, deltaUnits: 5, reason: 'PURCHASE' } });
    await app.prisma.hourLedgerEntry.create({ data: { studentId: studentB.id, deltaUnits: 20, reason: 'PURCHASE' } });

    const tokenA = await loginAs('a@example.com', 'password123');
    const hoursA = await request(app.server)
      .get('/student/hours')
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);

    expect(hoursA.body).toEqual({ remainingUnits: 5 });
  });

  it('returns remainingUnits breakdown by teacher', async () => {
    const org = await createOrg();
    const student = await createStudent({ orgId: org.id, email: 'student@example.com', password: 'password123' });
    const teacherA = await createTeacher({
      orgId: org.id,
      email: 'teacher-a@example.com',
      password: 'password123',
      displayName: 'Teacher A',
    });
    const teacherB = await createTeacher({
      orgId: org.id,
      email: 'teacher-b@example.com',
      password: 'password123',
      displayName: 'Teacher B',
    });

    await app.prisma.hourLedgerEntry.create({
      data: { studentId: student.id, teacherId: teacherA.id, deltaUnits: 5, reason: HourLedgerReason.PURCHASE },
    });
    await app.prisma.hourLedgerEntry.create({
      data: { studentId: student.id, teacherId: teacherB.id, deltaUnits: 3, reason: HourLedgerReason.PURCHASE },
    });
    await app.prisma.hourLedgerEntry.create({
      data: { studentId: student.id, deltaUnits: 2, reason: HourLedgerReason.ADJUSTMENT },
    });
    await app.prisma.hourLedgerEntry.create({
      data: { studentId: student.id, teacherId: teacherA.id, deltaUnits: -1, reason: HourLedgerReason.SESSION_CONSUME },
    });

    const token = await loginAs('student@example.com', 'password123');

    const res = await request(app.server)
      .get('/student/hours/by-teacher')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body).toEqual({
      totalRemainingUnits: 9,
      unassignedUnits: 2,
      byTeacher: [
        { teacherId: teacherA.id, teacherName: 'Teacher A', remainingUnits: 4 },
        { teacherId: teacherB.id, teacherName: 'Teacher B', remainingUnits: 3 },
      ],
    });
  });

  it('non-student cannot access /student/hours (403)', async () => {
    const org = await createOrg();
    await createTeacher({ orgId: org.id, email: 'teacher@example.com', password: 'password123' });

    const token = await loginAs('teacher@example.com', 'password123');
    await request(app.server).get('/student/hours').set('Authorization', `Bearer ${token}`).expect(403);
  });
});
