import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { Currency, SessionStatus, Subject, UserRole } from '@prisma/client';

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
      hourlyRateCents: 10000,
      currency: Currency.AUD,
    },
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

describe('sessions scheduling (step 5)', () => {
  it('admin can create session, then teacher/student can query it', async () => {
    const { teacher, student } = await createOrgWithUsers();

    const adminToken = await loginAs('admin@example.com', 'password123');
    const teacherToken = await loginAs('teacher@example.com', 'password123');
    const studentToken = await loginAs('student@example.com', 'password123');

    const startAtUtc = new Date('2030-01-01T10:00:00.000Z');
    const endAtUtc = new Date('2030-01-01T11:00:00.000Z');

    const created = await request(app.server)
      .post('/admin/sessions')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        teacherId: teacher.id,
        studentId: student.id,
        startAtUtc: startAtUtc.toISOString(),
        endAtUtc: endAtUtc.toISOString(),
        classTimeZone: 'Australia/Sydney',
      })
      .expect(201);

    const sessionId: string = created.body.id;
    expect(typeof sessionId).toBe('string');

    const teacherSessions = await request(app.server)
      .get('/teacher/sessions')
      .set('Authorization', `Bearer ${teacherToken}`)
      .expect(200);

    expect(teacherSessions.body).toEqual([
      expect.objectContaining({
        id: sessionId,
        startAtUtc: startAtUtc.toISOString(),
        endAtUtc: endAtUtc.toISOString(),
        classTimeZone: 'Australia/Sydney',
        status: 'SCHEDULED',
        studentName: 'Test Student',
        teacherName: 'Test Teacher',
      }),
    ]);

    const studentSessions = await request(app.server)
      .get('/student/sessions')
      .set('Authorization', `Bearer ${studentToken}`)
      .expect(200);

    expect(studentSessions.body).toEqual([
      expect.objectContaining({
        id: sessionId,
        startAtUtc: startAtUtc.toISOString(),
        endAtUtc: endAtUtc.toISOString(),
        classTimeZone: 'Australia/Sydney',
        status: 'SCHEDULED',
        studentName: 'Test Student',
        teacherName: 'Test Teacher',
      }),
    ]);
  });

  it('overlapping sessions for same teacher are rejected (409), but adjacent sessions are allowed', async () => {
    const { teacher, student } = await createOrgWithUsers();
    const adminToken = await loginAs('admin@example.com', 'password123');

    const session1Start = new Date('2030-01-01T10:00:00.000Z');
    const session1End = new Date('2030-01-01T11:00:00.000Z');

    const session2Start = new Date('2030-01-01T11:00:00.000Z');
    const session2End = new Date('2030-01-01T12:00:00.000Z');

    await request(app.server)
      .post('/admin/sessions')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        teacherId: teacher.id,
        studentId: student.id,
        startAtUtc: session1Start.toISOString(),
        endAtUtc: session1End.toISOString(),
        classTimeZone: 'Australia/Sydney',
      })
      .expect(201);

    await request(app.server)
      .post('/admin/sessions')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        teacherId: teacher.id,
        studentId: student.id,
        startAtUtc: session2Start.toISOString(),
        endAtUtc: session2End.toISOString(),
        classTimeZone: 'Australia/Sydney',
      })
      .expect(201);

    const overlapStart = new Date('2030-01-01T10:30:00.000Z');
    const overlapEnd = new Date('2030-01-01T11:30:00.000Z');

    await request(app.server)
      .post('/admin/sessions')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        teacherId: teacher.id,
        studentId: student.id,
        startAtUtc: overlapStart.toISOString(),
        endAtUtc: overlapEnd.toISOString(),
        classTimeZone: 'Australia/Sydney',
      })
      .expect(409);
  });

  it('teacher sessions can be filtered by from/to (UTC)', async () => {
    const { teacher, student } = await createOrgWithUsers();

    const adminToken = await loginAs('admin@example.com', 'password123');
    const teacherToken = await loginAs('teacher@example.com', 'password123');

    const session1Start = new Date('2030-01-01T10:00:00.000Z');
    const session1End = new Date('2030-01-01T11:00:00.000Z');

    const session2Start = new Date('2030-01-01T12:00:00.000Z');
    const session2End = new Date('2030-01-01T13:00:00.000Z');

    await request(app.server)
      .post('/admin/sessions')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        teacherId: teacher.id,
        studentId: student.id,
        startAtUtc: session1Start.toISOString(),
        endAtUtc: session1End.toISOString(),
        classTimeZone: 'Australia/Sydney',
      })
      .expect(201);

    const created2 = await request(app.server)
      .post('/admin/sessions')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        teacherId: teacher.id,
        studentId: student.id,
        startAtUtc: session2Start.toISOString(),
        endAtUtc: session2End.toISOString(),
        classTimeZone: 'Australia/Sydney',
      })
      .expect(201);

    const session2Id: string = created2.body.id;

    const filteredFrom = await request(app.server)
      .get('/teacher/sessions')
      .query({ from: '2030-01-01T11:00:00.000Z' })
      .set('Authorization', `Bearer ${teacherToken}`)
      .expect(200);

    expect(filteredFrom.body).toEqual([expect.objectContaining({ id: session2Id })]);

    const filteredTo = await request(app.server)
      .get('/teacher/sessions')
      .query({ to: '2030-01-01T12:00:00.000Z' })
      .set('Authorization', `Bearer ${teacherToken}`)
      .expect(200);

    expect(filteredTo.body).toHaveLength(1);
    expect(filteredTo.body[0].id).not.toBe(session2Id);
  });

  it('admin can list, edit, and cancel sessions', async () => {
    const { teacher, student } = await createOrgWithUsers();

    const adminToken = await loginAs('admin@example.com', 'password123');
    const teacherToken = await loginAs('teacher@example.com', 'password123');

    const startAtUtc = new Date('2030-01-01T10:00:00.000Z');
    const endAtUtc = new Date('2030-01-01T11:00:00.000Z');

    const created = await request(app.server)
      .post('/admin/sessions')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        teacherId: teacher.id,
        studentId: student.id,
        subject: Subject.GENERAL,
        startAtUtc: startAtUtc.toISOString(),
        endAtUtc: endAtUtc.toISOString(),
        classTimeZone: 'Australia/Sydney',
      })
      .expect(201);

    const sessionId: string = created.body.id;

    const list = await request(app.server)
      .get('/admin/sessions')
      .query({ teacherId: teacher.id, from: '2030-01-01T00:00:00.000Z', to: '2030-01-02T00:00:00.000Z' })
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(list.body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: sessionId,
          teacherId: teacher.id,
          studentId: student.id,
          subject: 'GENERAL',
          status: 'SCHEDULED',
        }),
      ]),
    );

    const updatedStartAtUtc = new Date('2030-01-01T12:00:00.000Z');
    const updatedEndAtUtc = new Date('2030-01-01T13:00:00.000Z');

    await request(app.server)
      .patch(`/admin/sessions/${sessionId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        startAtUtc: updatedStartAtUtc.toISOString(),
        endAtUtc: updatedEndAtUtc.toISOString(),
        classTimeZone: 'Australia/Sydney',
        consumesUnits: 2,
      })
      .expect(200);

    const teacherSessions = await request(app.server)
      .get('/teacher/sessions')
      .set('Authorization', `Bearer ${teacherToken}`)
      .expect(200);

    expect(teacherSessions.body).toEqual([
      expect.objectContaining({
        id: sessionId,
        startAtUtc: updatedStartAtUtc.toISOString(),
        endAtUtc: updatedEndAtUtc.toISOString(),
        status: 'SCHEDULED',
      }),
    ]);

    await request(app.server)
      .delete(`/admin/sessions/${sessionId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    const afterCancel = await request(app.server)
      .get('/admin/sessions')
      .query({ teacherId: teacher.id, from: '2030-01-01T00:00:00.000Z', to: '2030-01-02T00:00:00.000Z' })
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(afterCancel.body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: sessionId,
          status: 'CANCELLED',
        }),
      ]),
    );

    const teacherAfterCancel = await request(app.server)
      .get('/teacher/sessions')
      .set('Authorization', `Bearer ${teacherToken}`)
      .expect(200);

    expect(teacherAfterCancel.body).toEqual([
      expect.objectContaining({
        id: sessionId,
        status: 'CANCELLED',
      }),
    ]);

    const inDb = await app.prisma.session.findUnique({ where: { id: sessionId } });
    expect(inDb?.status).toBe(SessionStatus.CANCELLED);
  });
});
