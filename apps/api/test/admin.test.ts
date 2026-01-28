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

async function loginAs(email: string, password: string): Promise<string> {
  const login = await request(app.server).post('/auth/login').send({ email, password }).expect(200);
  return login.body.accessToken as string;
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

describe('admin apis (step 4)', () => {
  it('admin can create student, and audit log is written', async () => {
    const admin = await createUser({
      role: UserRole.ADMIN,
      email: 'admin@example.com',
      password: 'password123',
    });

    const token = await loginAs('admin@example.com', 'password123');

    const res = await request(app.server)
      .post('/admin/students')
      .set('Authorization', `Bearer ${token}`)
      .send({
        email: 'student1@example.com',
        password: 'password123',
        displayName: 'Student 1',
        timeZone: 'Asia/Shanghai',
      })
      .expect(201);

    const studentId: string = res.body.id;

    const student = await app.prisma.user.findUnique({
      where: { id: studentId },
      include: { studentProfile: true },
    });

    expect(student).toBeTruthy();
    expect(student?.role).toBe(UserRole.STUDENT);
    expect(student?.studentProfile?.displayName).toBe('Student 1');

    const audit = await app.prisma.auditLog.findFirst({
      where: { actorUserId: admin.id, action: 'ADMIN_CREATE_STUDENT', entityId: studentId },
    });
    expect(audit).toBeTruthy();
  });

  it('admin can create teacher, and audit log is written', async () => {
    const admin = await createUser({
      role: UserRole.ADMIN,
      email: 'admin@example.com',
      password: 'password123',
    });

    const token = await loginAs('admin@example.com', 'password123');

    const res = await request(app.server)
      .post('/admin/teachers')
      .set('Authorization', `Bearer ${token}`)
      .send({
        email: 'teacher1@example.com',
        password: 'password123',
        displayName: 'Teacher 1',
        timeZone: 'Australia/Sydney',
      })
      .expect(201);

    const teacherId: string = res.body.id;

    const teacher = await app.prisma.user.findUnique({
      where: { id: teacherId },
      include: { teacherProfile: true },
    });

    expect(teacher).toBeTruthy();
    expect(teacher?.role).toBe(UserRole.TEACHER);
    expect(teacher?.teacherProfile?.displayName).toBe('Teacher 1');

    const audit = await app.prisma.auditLog.findFirst({
      where: { actorUserId: admin.id, action: 'ADMIN_CREATE_TEACHER', entityId: teacherId },
    });
    expect(audit).toBeTruthy();
  });

  it('admin can upsert rate, and audit log is written', async () => {
    const admin = await createUser({
      role: UserRole.ADMIN,
      email: 'admin@example.com',
      password: 'password123',
    });

    const token = await loginAs('admin@example.com', 'password123');

    const studentRes = await request(app.server)
      .post('/admin/students')
      .set('Authorization', `Bearer ${token}`)
      .send({
        email: 'student1@example.com',
        password: 'password123',
        displayName: 'Student 1',
        timeZone: 'Asia/Shanghai',
      })
      .expect(201);

    const teacherRes = await request(app.server)
      .post('/admin/teachers')
      .set('Authorization', `Bearer ${token}`)
      .send({
        email: 'teacher1@example.com',
        password: 'password123',
        displayName: 'Teacher 1',
        timeZone: 'Australia/Sydney',
      })
      .expect(201);

    const studentId: string = studentRes.body.id;
    const teacherId: string = teacherRes.body.id;

    const createRate = await request(app.server)
      .put('/admin/rates')
      .set('Authorization', `Bearer ${token}`)
      .send({ teacherId, studentId, hourlyRateCents: 12345, currency: 'AUD' })
      .expect(200);

    expect(createRate.body).toMatchObject({ teacherId, studentId, hourlyRateCents: 12345, currency: 'AUD' });

    const updateRate = await request(app.server)
      .put('/admin/rates')
      .set('Authorization', `Bearer ${token}`)
      .send({ teacherId, studentId, hourlyRateCents: 20000, currency: 'USD' })
      .expect(200);

    expect(updateRate.body).toMatchObject({ teacherId, studentId, hourlyRateCents: 20000, currency: 'USD' });

    const rateInDb = await app.prisma.teacherStudentRate.findUnique({
      where: { teacherId_studentId_subject: { teacherId, studentId, subject: 'GENERAL' } },
    });
    expect(rateInDb?.hourlyRateCents).toBe(20000);
    expect(rateInDb?.currency).toBe('USD');

    const audit = await app.prisma.auditLog.findFirst({
      where: { actorUserId: admin.id, action: 'ADMIN_UPSERT_RATE', entityId: updateRate.body.id },
    });
    expect(audit).toBeTruthy();

    const list = await request(app.server).get('/admin/rates').set('Authorization', `Bearer ${token}`).expect(200);
    expect(Array.isArray(list.body)).toBe(true);
    expect(list.body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          teacherId,
          studentId,
          subject: 'GENERAL',
          hourlyRateCents: 20000,
          currency: 'USD',
          teacherName: 'Teacher 1',
          studentName: 'Student 1',
        }),
      ]),
    );
  });

  it('admin can add hours, and ledger entry is positive', async () => {
    const admin = await createUser({
      role: UserRole.ADMIN,
      email: 'admin@example.com',
      password: 'password123',
    });

    const token = await loginAs('admin@example.com', 'password123');

    const studentRes = await request(app.server)
      .post('/admin/students')
      .set('Authorization', `Bearer ${token}`)
      .send({
        email: 'student1@example.com',
        password: 'password123',
        displayName: 'Student 1',
        timeZone: 'Asia/Shanghai',
      })
      .expect(201);

    const studentId: string = studentRes.body.id;

    const add = await request(app.server)
      .post(`/admin/students/${studentId}/hours`)
      .set('Authorization', `Bearer ${token}`)
      .send({ deltaUnits: 10, reason: 'PURCHASE' })
      .expect(201);

    const ledgerInDb = await app.prisma.hourLedgerEntry.findUnique({ where: { id: add.body.id } });
    expect(ledgerInDb?.studentId).toBe(studentId);
    expect(ledgerInDb?.deltaUnits).toBe(10);
    expect(ledgerInDb?.reason).toBe('PURCHASE');

    const audit = await app.prisma.auditLog.findFirst({
      where: { actorUserId: admin.id, action: 'ADMIN_ADD_HOURS', entityId: add.body.id },
    });
    expect(audit).toBeTruthy();
  });

  it('admin can disable student and teacher (delete buttons)', async () => {
    await createUser({
      role: UserRole.ADMIN,
      email: 'admin@example.com',
      password: 'password123',
    });

    const token = await loginAs('admin@example.com', 'password123');

    const studentRes = await request(app.server)
      .post('/admin/students')
      .set('Authorization', `Bearer ${token}`)
      .send({
        email: 'student_del@example.com',
        password: 'password123',
        displayName: 'Student Del',
        timeZone: 'Asia/Shanghai',
      })
      .expect(201);

    const teacherRes = await request(app.server)
      .post('/admin/teachers')
      .set('Authorization', `Bearer ${token}`)
      .send({
        email: 'teacher_del@example.com',
        password: 'password123',
        displayName: 'Teacher Del',
        timeZone: 'Australia/Sydney',
      })
      .expect(201);

    const studentId: string = studentRes.body.id;
    const teacherId: string = teacherRes.body.id;

    await request(app.server).delete(`/admin/students/${studentId}`).set('Authorization', `Bearer ${token}`).expect(200);
    await request(app.server).delete(`/admin/teachers/${teacherId}`).set('Authorization', `Bearer ${token}`).expect(200);

    const studentsList = await request(app.server).get('/admin/students').set('Authorization', `Bearer ${token}`).expect(200);
    expect(studentsList.body).not.toEqual(expect.arrayContaining([expect.objectContaining({ id: studentId })]));

    const teachersList = await request(app.server).get('/admin/teachers').set('Authorization', `Bearer ${token}`).expect(200);
    expect(teachersList.body).not.toEqual(expect.arrayContaining([expect.objectContaining({ id: teacherId })]));

    await request(app.server).get(`/admin/students/${studentId}`).set('Authorization', `Bearer ${token}`).expect(404);
    await request(app.server).get(`/admin/teachers/${teacherId}`).set('Authorization', `Bearer ${token}`).expect(404);
  });

  it('admin can delete rate', async () => {
    await createUser({
      role: UserRole.ADMIN,
      email: 'admin@example.com',
      password: 'password123',
    });

    const token = await loginAs('admin@example.com', 'password123');

    const studentRes = await request(app.server)
      .post('/admin/students')
      .set('Authorization', `Bearer ${token}`)
      .send({
        email: 'student_rate_del@example.com',
        password: 'password123',
        displayName: 'Student Rate Del',
        timeZone: 'Asia/Shanghai',
      })
      .expect(201);

    const teacherRes = await request(app.server)
      .post('/admin/teachers')
      .set('Authorization', `Bearer ${token}`)
      .send({
        email: 'teacher_rate_del@example.com',
        password: 'password123',
        displayName: 'Teacher Rate Del',
        timeZone: 'Australia/Sydney',
      })
      .expect(201);

    const studentId: string = studentRes.body.id;
    const teacherId: string = teacherRes.body.id;

    const createRate = await request(app.server)
      .put('/admin/rates')
      .set('Authorization', `Bearer ${token}`)
      .send({ teacherId, studentId, subject: 'GENERAL', hourlyRateCents: 10000, currency: 'AUD' })
      .expect(200);

    const rateId: string = createRate.body.id;

    await request(app.server).delete(`/admin/rates/${rateId}`).set('Authorization', `Bearer ${token}`).expect(200);

    const list = await request(app.server).get('/admin/rates').set('Authorization', `Bearer ${token}`).expect(200);
    expect(list.body).not.toEqual(expect.arrayContaining([expect.objectContaining({ id: rateId })]));
  });

  it('non-admin cannot call admin apis (403)', async () => {
    await createUser({
      role: UserRole.TEACHER,
      email: 'teacher@example.com',
      password: 'password123',
    });

    const token = await loginAs('teacher@example.com', 'password123');

    await request(app.server)
      .post('/admin/students')
      .set('Authorization', `Bearer ${token}`)
      .send({
        email: 'student1@example.com',
        password: 'password123',
        displayName: 'Student 1',
        timeZone: 'Asia/Shanghai',
      })
      .expect(403);

    await request(app.server)
      .put('/admin/rates')
      .set('Authorization', `Bearer ${token}`)
      .send({ teacherId: 't', studentId: 's', hourlyRateCents: 12345, currency: 'AUD' })
      .expect(403);

    await request(app.server).delete('/admin/students/s').set('Authorization', `Bearer ${token}`).expect(403);
    await request(app.server).delete('/admin/teachers/t').set('Authorization', `Bearer ${token}`).expect(403);
    await request(app.server).delete('/admin/rates/r').set('Authorization', `Bearer ${token}`).expect(403);
  });
});
