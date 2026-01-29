import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

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

  return { org, admin, teacher, student };
}

async function createSession(params: {
  teacherId: string;
  studentId: string;
  createdByAdminId: string;
  startAtUtc: Date;
  endAtUtc: Date;
  classTimeZone?: string;
}) {
  return app.prisma.session.create({
    data: {
      teacherId: params.teacherId,
      studentId: params.studentId,
      startAtUtc: params.startAtUtc,
      endAtUtc: params.endAtUtc,
      classTimeZone: params.classTimeZone ?? 'Australia/Sydney',
      status: SessionStatus.SCHEDULED,
      consumesUnits: 1,
      studentHourlyRateCentsSnapshot: 10000,
      teacherHourlyWageCentsSnapshot: 10000,
      currencySnapshot: Currency.AUD,
      createdByAdminId: params.createdByAdminId,
    },
    select: { id: true },
  });
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

describe('change requests (step 8)', () => {
  it('enforces 24h rule (exactly 24h allowed, 24h+1ms forbidden)', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      const { teacher, student, admin } = await createOrgWithUsers();

      const session1 = await createSession({
        teacherId: teacher.id,
        studentId: student.id,
        createdByAdminId: admin.id,
        startAtUtc: new Date('2030-01-02T00:00:00.000Z'),
        endAtUtc: new Date('2030-01-02T01:00:00.000Z'),
      });

      const session2 = await createSession({
        teacherId: teacher.id,
        studentId: student.id,
        createdByAdminId: admin.id,
        startAtUtc: new Date('2030-01-02T00:00:00.000Z'),
        endAtUtc: new Date('2030-01-02T01:00:00.000Z'),
      });

      vi.setSystemTime(new Date('2030-01-01T00:00:00.000Z'));
      const studentToken = await loginAs('student@example.com', 'password123');

      await request(app.server)
        .post(`/student/sessions/${session1.id}/change-requests`)
        .set('Authorization', `Bearer ${studentToken}`)
        .send({ type: 'CANCEL' })
        .expect(201);

      vi.setSystemTime(new Date('2030-01-01T00:00:00.001Z'));

      await request(app.server)
        .post(`/student/sessions/${session2.id}/change-requests`)
        .set('Authorization', `Bearer ${studentToken}`)
        .send({ type: 'CANCEL' })
        .expect(403);
    } finally {
      vi.useRealTimers();
    }
  });

  it('rejects a second change request when a PENDING one already exists', async () => {
    const { teacher, student, admin } = await createOrgWithUsers();

    const session = await createSession({
      teacherId: teacher.id,
      studentId: student.id,
      createdByAdminId: admin.id,
      startAtUtc: new Date('2030-01-02T00:00:00.000Z'),
      endAtUtc: new Date('2030-01-02T01:00:00.000Z'),
    });

    const studentToken = await loginAs('student@example.com', 'password123');

    await request(app.server)
      .post(`/student/sessions/${session.id}/change-requests`)
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ type: 'CANCEL' })
      .expect(201);

    await request(app.server)
      .post(`/student/sessions/${session.id}/change-requests`)
      .set('Authorization', `Bearer ${studentToken}`)
      .send({
        type: 'RESCHEDULE',
        proposedStartAtUtc: '2030-01-03T10:00:00.000Z',
        proposedEndAtUtc: '2030-01-03T11:00:00.000Z',
        proposedTimeZone: 'Asia/Shanghai',
      })
      .expect(409);
  });

  it('admin approve updates session time/timezone for RESCHEDULE', async () => {
    const { teacher, student, admin } = await createOrgWithUsers();

    const session = await createSession({
      teacherId: teacher.id,
      studentId: student.id,
      createdByAdminId: admin.id,
      startAtUtc: new Date('2030-01-10T10:00:00.000Z'),
      endAtUtc: new Date('2030-01-10T11:00:00.000Z'),
      classTimeZone: 'Australia/Sydney',
    });

    const studentToken = await loginAs('student@example.com', 'password123');
    const adminToken = await loginAs('admin@example.com', 'password123');

    const proposedStartAtUtc = '2030-01-11T10:00:00.000Z';
    const proposedEndAtUtc = '2030-01-11T11:00:00.000Z';

    const created = await request(app.server)
      .post(`/student/sessions/${session.id}/change-requests`)
      .set('Authorization', `Bearer ${studentToken}`)
      .send({
        type: 'RESCHEDULE',
        proposedStartAtUtc,
        proposedEndAtUtc,
        proposedTimeZone: 'Asia/Shanghai',
      })
      .expect(201);

    const changeRequestId: string = created.body.id;

    await request(app.server)
      .post(`/admin/change-requests/${changeRequestId}/approve`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    const updatedSession = await app.prisma.session.findUnique({
      where: { id: session.id },
      select: { status: true, startAtUtc: true, endAtUtc: true, classTimeZone: true },
    });

    expect(updatedSession).toMatchObject({
      status: SessionStatus.SCHEDULED,
      classTimeZone: 'Asia/Shanghai',
    });
    expect(updatedSession?.startAtUtc.toISOString()).toBe(proposedStartAtUtc);
    expect(updatedSession?.endAtUtc.toISOString()).toBe(proposedEndAtUtc);

    const updatedChangeRequest = await app.prisma.changeRequest.findUnique({
      where: { id: changeRequestId },
      select: { status: true, decidedByAdminId: true },
    });
    expect(updatedChangeRequest?.status).toBe('APPROVED');
    expect(updatedChangeRequest?.decidedByAdminId).toBe(admin.id);

    const audit = await app.prisma.auditLog.findFirst({
      where: { action: 'ADMIN_APPROVE_CHANGE_REQUEST', entityId: changeRequestId },
      select: { id: true },
    });
    expect(audit).toBeTruthy();
  });

  it('admin approve updates session status for CANCEL', async () => {
    const { teacher, student, admin } = await createOrgWithUsers();

    const session = await createSession({
      teacherId: teacher.id,
      studentId: student.id,
      createdByAdminId: admin.id,
      startAtUtc: new Date('2030-01-10T10:00:00.000Z'),
      endAtUtc: new Date('2030-01-10T11:00:00.000Z'),
    });

    const studentToken = await loginAs('student@example.com', 'password123');
    const adminToken = await loginAs('admin@example.com', 'password123');

    const created = await request(app.server)
      .post(`/student/sessions/${session.id}/change-requests`)
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ type: 'CANCEL' })
      .expect(201);

    const changeRequestId: string = created.body.id;

    await request(app.server)
      .post(`/admin/change-requests/${changeRequestId}/approve`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    const updatedSession = await app.prisma.session.findUnique({
      where: { id: session.id },
      select: { status: true },
    });
    expect(updatedSession?.status).toBe(SessionStatus.CANCELLED);
  });

  it('student can list own change requests', async () => {
    const { teacher, student, admin } = await createOrgWithUsers();

    const session = await createSession({
      teacherId: teacher.id,
      studentId: student.id,
      createdByAdminId: admin.id,
      startAtUtc: new Date('2030-01-10T10:00:00.000Z'),
      endAtUtc: new Date('2030-01-10T11:00:00.000Z'),
    });

    const studentToken = await loginAs('student@example.com', 'password123');

    await request(app.server)
      .post(`/student/sessions/${session.id}/change-requests`)
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ type: 'CANCEL' })
      .expect(201);

    const list = await request(app.server)
      .get('/student/change-requests')
      .set('Authorization', `Bearer ${studentToken}`)
      .expect(200);

    expect(list.body).toHaveLength(1);
    expect(list.body[0]).toMatchObject({
      sessionId: session.id,
      type: 'CANCEL',
      status: 'PENDING',
    });
  });

  it('admin can list PENDING change requests', async () => {
    const { teacher, student, admin } = await createOrgWithUsers();

    const session = await createSession({
      teacherId: teacher.id,
      studentId: student.id,
      createdByAdminId: admin.id,
      startAtUtc: new Date('2030-01-10T10:00:00.000Z'),
      endAtUtc: new Date('2030-01-10T11:00:00.000Z'),
    });

    const studentToken = await loginAs('student@example.com', 'password123');
    const adminToken = await loginAs('admin@example.com', 'password123');

    await request(app.server)
      .post(`/student/sessions/${session.id}/change-requests`)
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ type: 'CANCEL' })
      .expect(201);

    const list = await request(app.server)
      .get('/admin/change-requests')
      .query({ status: 'PENDING' })
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(list.body).toHaveLength(1);
    expect(list.body[0]).toMatchObject({
      sessionId: session.id,
      type: 'CANCEL',
      status: 'PENDING',
      requestedByUserId: student.id,
    });
  });
});
