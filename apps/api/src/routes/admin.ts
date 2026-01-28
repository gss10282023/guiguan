import type { FastifyPluginAsync, FastifyReply } from 'fastify';
import { ChangeRequestStatus, Currency, HourLedgerReason, SessionStatus, Subject, UserRole, UserStatus } from '@prisma/client';
import { z } from 'zod';

import { hashPassword } from '../lib/password.js';

function zodBadRequest(reply: FastifyReply, error: z.ZodError) {
  return reply.code(400).send({
    message: 'Bad Request',
    issues: error.issues.map((issue) => ({
      path: issue.path.join('.'),
      message: issue.message,
    })),
  });
}

const adminRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get(
    '/ping',
    {
      preHandler: fastify.requireRole([UserRole.ADMIN]),
    },
    async () => ({ ok: true }),
  );

  fastify.get('/students', { preHandler: fastify.requireRole([UserRole.ADMIN]) }, async (request, reply) => {
    const actor = await fastify.prisma.user.findUnique({
      where: { id: request.user.userId },
      select: { id: true, orgId: true },
    });
    if (!actor) return reply.code(401).send({ message: 'Unauthorized' });

    const students = await fastify.prisma.user.findMany({
      where: { orgId: actor.orgId, role: UserRole.STUDENT, status: UserStatus.ACTIVE },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        email: true,
        createdAt: true,
        studentProfile: { select: { displayName: true, timeZone: true } },
      },
    });

    return students.map((student) => ({
      id: student.id,
      email: student.email,
      displayName: student.studentProfile?.displayName ?? null,
      timeZone: student.studentProfile?.timeZone ?? null,
      createdAt: student.createdAt.toISOString(),
    }));
  });

  const studentParamsSchema = z.object({ id: z.string().min(1) });

  fastify.get('/students/:id', { preHandler: fastify.requireRole([UserRole.ADMIN]) }, async (request, reply) => {
    const parsedParams = studentParamsSchema.safeParse(request.params);
    if (!parsedParams.success) return zodBadRequest(reply, parsedParams.error);

    const actor = await fastify.prisma.user.findUnique({
      where: { id: request.user.userId },
      select: { id: true, orgId: true },
    });
    if (!actor) return reply.code(401).send({ message: 'Unauthorized' });

    const student = await fastify.prisma.user.findFirst({
      where: { id: parsedParams.data.id, orgId: actor.orgId, role: UserRole.STUDENT, status: UserStatus.ACTIVE },
      select: {
        id: true,
        email: true,
        createdAt: true,
        studentProfile: { select: { displayName: true, timeZone: true } },
      },
    });
    if (!student) return reply.code(404).send({ message: 'Student not found' });

    const remaining = await fastify.prisma.hourLedgerEntry.aggregate({
      where: { studentId: student.id },
      _sum: { deltaUnits: true },
    });

    const ledgerEntries = await fastify.prisma.hourLedgerEntry.findMany({
      where: { studentId: student.id },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: { id: true, deltaUnits: true, reason: true, sessionId: true, createdAt: true },
    });

    return {
      id: student.id,
      email: student.email,
      displayName: student.studentProfile?.displayName ?? null,
      timeZone: student.studentProfile?.timeZone ?? null,
      createdAt: student.createdAt.toISOString(),
      remainingUnits: remaining._sum.deltaUnits ?? 0,
      ledgerEntries: ledgerEntries.map((entry) => ({
        id: entry.id,
        deltaUnits: entry.deltaUnits,
        reason: entry.reason,
        sessionId: entry.sessionId ?? null,
        createdAt: entry.createdAt.toISOString(),
      })),
    };
  });

  fastify.get('/teachers', { preHandler: fastify.requireRole([UserRole.ADMIN]) }, async (request, reply) => {
    const actor = await fastify.prisma.user.findUnique({
      where: { id: request.user.userId },
      select: { id: true, orgId: true },
    });
    if (!actor) return reply.code(401).send({ message: 'Unauthorized' });

    const teachers = await fastify.prisma.user.findMany({
      where: { orgId: actor.orgId, role: UserRole.TEACHER, status: UserStatus.ACTIVE },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        email: true,
        createdAt: true,
        teacherProfile: { select: { displayName: true, timeZone: true } },
      },
    });

    return teachers.map((teacher) => ({
      id: teacher.id,
      email: teacher.email,
      displayName: teacher.teacherProfile?.displayName ?? null,
      timeZone: teacher.teacherProfile?.timeZone ?? null,
      createdAt: teacher.createdAt.toISOString(),
    }));
  });

  const teacherParamsSchema = z.object({ id: z.string().min(1) });

  fastify.get('/teachers/:id', { preHandler: fastify.requireRole([UserRole.ADMIN]) }, async (request, reply) => {
    const parsedParams = teacherParamsSchema.safeParse(request.params);
    if (!parsedParams.success) return zodBadRequest(reply, parsedParams.error);

    const actor = await fastify.prisma.user.findUnique({
      where: { id: request.user.userId },
      select: { id: true, orgId: true },
    });
    if (!actor) return reply.code(401).send({ message: 'Unauthorized' });

    const teacher = await fastify.prisma.user.findFirst({
      where: { id: parsedParams.data.id, orgId: actor.orgId, role: UserRole.TEACHER, status: UserStatus.ACTIVE },
      select: {
        id: true,
        email: true,
        createdAt: true,
        teacherProfile: { select: { displayName: true, timeZone: true } },
      },
    });
    if (!teacher) return reply.code(404).send({ message: 'Teacher not found' });

    return {
      id: teacher.id,
      email: teacher.email,
      displayName: teacher.teacherProfile?.displayName ?? null,
      timeZone: teacher.teacherProfile?.timeZone ?? null,
      createdAt: teacher.createdAt.toISOString(),
    };
  });

  const createStudentBodySchema = z.object({
    email: z.string().email(),
    password: z.string().min(8),
    displayName: z.string().min(1),
    timeZone: z.string().min(1),
  });

  fastify.post(
    '/students',
    { preHandler: fastify.requireRole([UserRole.ADMIN]) },
    async (request, reply) => {
      const parsedBody = createStudentBodySchema.safeParse(request.body);
      if (!parsedBody.success) return zodBadRequest(reply, parsedBody.error);

      const actor = await fastify.prisma.user.findUnique({
        where: { id: request.user.userId },
        select: { id: true, orgId: true },
      });
      if (!actor) return reply.code(401).send({ message: 'Unauthorized' });

      const student = await fastify.prisma.user.create({
        data: {
          orgId: actor.orgId,
          email: parsedBody.data.email,
          passwordHash: hashPassword(parsedBody.data.password),
          role: UserRole.STUDENT,
          status: UserStatus.ACTIVE,
          studentProfile: {
            create: {
              displayName: parsedBody.data.displayName,
              timeZone: parsedBody.data.timeZone,
            },
          },
        },
      });

      await fastify.prisma.auditLog.create({
        data: {
          orgId: actor.orgId,
          actorUserId: actor.id,
          action: 'ADMIN_CREATE_STUDENT',
          entityType: 'User',
          entityId: student.id,
          meta: { email: parsedBody.data.email },
        },
      });

      return reply.code(201).send({ id: student.id });
    },
  );

  const createTeacherBodySchema = z.object({
    email: z.string().email(),
    password: z.string().min(8),
    displayName: z.string().min(1),
    timeZone: z.string().min(1),
  });

  fastify.post(
    '/teachers',
    { preHandler: fastify.requireRole([UserRole.ADMIN]) },
    async (request, reply) => {
      const parsedBody = createTeacherBodySchema.safeParse(request.body);
      if (!parsedBody.success) return zodBadRequest(reply, parsedBody.error);

      const actor = await fastify.prisma.user.findUnique({
        where: { id: request.user.userId },
        select: { id: true, orgId: true },
      });
      if (!actor) return reply.code(401).send({ message: 'Unauthorized' });

      const teacher = await fastify.prisma.user.create({
        data: {
          orgId: actor.orgId,
          email: parsedBody.data.email,
          passwordHash: hashPassword(parsedBody.data.password),
          role: UserRole.TEACHER,
          status: UserStatus.ACTIVE,
          teacherProfile: {
            create: {
              displayName: parsedBody.data.displayName,
              timeZone: parsedBody.data.timeZone,
            },
          },
        },
      });

      await fastify.prisma.auditLog.create({
        data: {
          orgId: actor.orgId,
          actorUserId: actor.id,
          action: 'ADMIN_CREATE_TEACHER',
          entityType: 'User',
          entityId: teacher.id,
          meta: { email: parsedBody.data.email },
        },
      });

      return reply.code(201).send({ id: teacher.id });
    },
  );

  const upsertRateBodySchema = z.object({
    teacherId: z.string().min(1),
    studentId: z.string().min(1),
    subject: z.nativeEnum(Subject).optional(),
    hourlyRateCents: z.number().int().positive(),
    currency: z.nativeEnum(Currency),
  });

  fastify.delete('/rates/:id', { preHandler: fastify.requireRole([UserRole.ADMIN]) }, async (request, reply) => {
    const parsedParams = z.object({ id: z.string().min(1) }).safeParse(request.params);
    if (!parsedParams.success) return zodBadRequest(reply, parsedParams.error);

    const actor = await fastify.prisma.user.findUnique({
      where: { id: request.user.userId },
      select: { id: true, orgId: true },
    });
    if (!actor) return reply.code(401).send({ message: 'Unauthorized' });

    const existing = await fastify.prisma.teacherStudentRate.findFirst({
      where: { id: parsedParams.data.id, teacher: { orgId: actor.orgId }, student: { orgId: actor.orgId } },
      select: { id: true, teacherId: true, studentId: true, subject: true },
    });
    if (!existing) return reply.code(404).send({ message: 'Rate not found' });

    await fastify.prisma.teacherStudentRate.delete({ where: { id: existing.id } });

    await fastify.prisma.auditLog.create({
      data: {
        orgId: actor.orgId,
        actorUserId: actor.id,
        action: 'ADMIN_DELETE_RATE',
        entityType: 'TeacherStudentRate',
        entityId: existing.id,
        meta: { teacherId: existing.teacherId, studentId: existing.studentId, subject: existing.subject },
      },
    });

    return reply.send({ ok: true });
  });

  fastify.get('/rates', { preHandler: fastify.requireRole([UserRole.ADMIN]) }, async (request, reply) => {
    const actor = await fastify.prisma.user.findUnique({
      where: { id: request.user.userId },
      select: { id: true, orgId: true },
    });
    if (!actor) return reply.code(401).send({ message: 'Unauthorized' });

    const rates = await fastify.prisma.teacherStudentRate.findMany({
      where: {
        teacher: { orgId: actor.orgId, role: UserRole.TEACHER },
        student: { orgId: actor.orgId, role: UserRole.STUDENT },
      },
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        teacherId: true,
        studentId: true,
        subject: true,
        hourlyRateCents: true,
        currency: true,
        updatedAt: true,
        teacher: { select: { email: true, teacherProfile: { select: { displayName: true } } } },
        student: { select: { email: true, studentProfile: { select: { displayName: true } } } },
      },
    });

    return rates.map((rate) => ({
      id: rate.id,
      teacherId: rate.teacherId,
      teacherName: rate.teacher.teacherProfile?.displayName ?? null,
      teacherEmail: rate.teacher.email,
      studentId: rate.studentId,
      studentName: rate.student.studentProfile?.displayName ?? null,
      studentEmail: rate.student.email,
      subject: rate.subject,
      hourlyRateCents: rate.hourlyRateCents,
      currency: rate.currency,
      updatedAt: rate.updatedAt.toISOString(),
    }));
  });

  fastify.put('/rates', { preHandler: fastify.requireRole([UserRole.ADMIN]) }, async (request, reply) => {
    const parsedBody = upsertRateBodySchema.safeParse(request.body);
    if (!parsedBody.success) return zodBadRequest(reply, parsedBody.error);

    const actor = await fastify.prisma.user.findUnique({
      where: { id: request.user.userId },
      select: { id: true, orgId: true },
    });
    if (!actor) return reply.code(401).send({ message: 'Unauthorized' });

    const [teacher, student] = await Promise.all([
      fastify.prisma.user.findUnique({
        where: { id: parsedBody.data.teacherId },
        select: { id: true, orgId: true, role: true },
      }),
      fastify.prisma.user.findUnique({
        where: { id: parsedBody.data.studentId },
        select: { id: true, orgId: true, role: true },
      }),
    ]);

    if (!teacher || teacher.orgId !== actor.orgId || teacher.role !== UserRole.TEACHER) {
      return reply.code(404).send({ message: 'Teacher not found' });
    }
    if (!student || student.orgId !== actor.orgId || student.role !== UserRole.STUDENT) {
      return reply.code(404).send({ message: 'Student not found' });
    }

    const subject = parsedBody.data.subject ?? Subject.GENERAL;

    const rate = await fastify.prisma.teacherStudentRate.upsert({
      where: {
        teacherId_studentId_subject: {
          teacherId: teacher.id,
          studentId: student.id,
          subject,
        },
      },
      create: {
        teacherId: teacher.id,
        studentId: student.id,
        subject,
        hourlyRateCents: parsedBody.data.hourlyRateCents,
        currency: parsedBody.data.currency,
      },
      update: {
        subject,
        hourlyRateCents: parsedBody.data.hourlyRateCents,
        currency: parsedBody.data.currency,
      },
    });

    await fastify.prisma.auditLog.create({
      data: {
        orgId: actor.orgId,
        actorUserId: actor.id,
        action: 'ADMIN_UPSERT_RATE',
        entityType: 'TeacherStudentRate',
        entityId: rate.id,
        meta: {
          teacherId: teacher.id,
          studentId: student.id,
          subject,
          hourlyRateCents: parsedBody.data.hourlyRateCents,
          currency: parsedBody.data.currency,
        },
      },
    });

    return reply.send({
      id: rate.id,
      teacherId: rate.teacherId,
      studentId: rate.studentId,
      subject: rate.subject,
      hourlyRateCents: rate.hourlyRateCents,
      currency: rate.currency,
    });
  });

  const addHoursParamsSchema = z.object({ id: z.string().min(1) });
  const addHoursBodySchema = z.object({
    deltaUnits: z.number().int().positive(),
    reason: z.enum([HourLedgerReason.PURCHASE, HourLedgerReason.ADJUSTMENT] as const),
    teacherId: z.string().min(1).optional(),
  });

  fastify.post(
    '/students/:id/hours',
    { preHandler: fastify.requireRole([UserRole.ADMIN]) },
    async (request, reply) => {
      const parsedParams = addHoursParamsSchema.safeParse(request.params);
      if (!parsedParams.success) return zodBadRequest(reply, parsedParams.error);

      const parsedBody = addHoursBodySchema.safeParse(request.body);
      if (!parsedBody.success) return zodBadRequest(reply, parsedBody.error);

      const actor = await fastify.prisma.user.findUnique({
        where: { id: request.user.userId },
        select: { id: true, orgId: true },
      });
      if (!actor) return reply.code(401).send({ message: 'Unauthorized' });

      const student = await fastify.prisma.user.findUnique({
        where: { id: parsedParams.data.id },
        select: { id: true, orgId: true, role: true },
      });
      if (!student || student.orgId !== actor.orgId || student.role !== UserRole.STUDENT) {
        return reply.code(404).send({ message: 'Student not found' });
      }

      let teacherId: string | null = null;
      if (parsedBody.data.teacherId) {
        const teacher = await fastify.prisma.user.findUnique({
          where: { id: parsedBody.data.teacherId },
          select: { id: true, orgId: true, role: true },
        });
        if (!teacher || teacher.orgId !== actor.orgId || teacher.role !== UserRole.TEACHER) {
          return reply.code(404).send({ message: 'Teacher not found' });
        }
        teacherId = teacher.id;
      }

      const entry = await fastify.prisma.hourLedgerEntry.create({
        data: {
          studentId: student.id,
          teacherId,
          deltaUnits: parsedBody.data.deltaUnits,
          reason: parsedBody.data.reason,
        },
      });

      await fastify.prisma.auditLog.create({
        data: {
          orgId: actor.orgId,
          actorUserId: actor.id,
          action: 'ADMIN_ADD_HOURS',
          entityType: 'HourLedgerEntry',
          entityId: entry.id,
          meta: {
            studentId: student.id,
            teacherId,
            deltaUnits: entry.deltaUnits,
            reason: entry.reason,
          },
        },
      });

      return reply.code(201).send({ id: entry.id });
    },
  );

  fastify.delete('/students/:id', { preHandler: fastify.requireRole([UserRole.ADMIN]) }, async (request, reply) => {
    const parsedParams = studentParamsSchema.safeParse(request.params);
    if (!parsedParams.success) return zodBadRequest(reply, parsedParams.error);

    const actor = await fastify.prisma.user.findUnique({
      where: { id: request.user.userId },
      select: { id: true, orgId: true },
    });
    if (!actor) return reply.code(401).send({ message: 'Unauthorized' });

    const student = await fastify.prisma.user.findFirst({
      where: { id: parsedParams.data.id, orgId: actor.orgId, role: UserRole.STUDENT, status: UserStatus.ACTIVE },
      select: { id: true, email: true },
    });
    if (!student) return reply.code(404).send({ message: 'Student not found' });

    await fastify.prisma.user.update({ where: { id: student.id }, data: { status: UserStatus.DISABLED } });

    await fastify.prisma.auditLog.create({
      data: {
        orgId: actor.orgId,
        actorUserId: actor.id,
        action: 'ADMIN_DISABLE_STUDENT',
        entityType: 'User',
        entityId: student.id,
        meta: { email: student.email },
      },
    });

    return reply.send({ ok: true });
  });

  fastify.delete('/teachers/:id', { preHandler: fastify.requireRole([UserRole.ADMIN]) }, async (request, reply) => {
    const parsedParams = teacherParamsSchema.safeParse(request.params);
    if (!parsedParams.success) return zodBadRequest(reply, parsedParams.error);

    const actor = await fastify.prisma.user.findUnique({
      where: { id: request.user.userId },
      select: { id: true, orgId: true },
    });
    if (!actor) return reply.code(401).send({ message: 'Unauthorized' });

    const teacher = await fastify.prisma.user.findFirst({
      where: { id: parsedParams.data.id, orgId: actor.orgId, role: UserRole.TEACHER, status: UserStatus.ACTIVE },
      select: { id: true, email: true },
    });
    if (!teacher) return reply.code(404).send({ message: 'Teacher not found' });

    await fastify.prisma.user.update({ where: { id: teacher.id }, data: { status: UserStatus.DISABLED } });

    await fastify.prisma.auditLog.create({
      data: {
        orgId: actor.orgId,
        actorUserId: actor.id,
        action: 'ADMIN_DISABLE_TEACHER',
        entityType: 'User',
        entityId: teacher.id,
        meta: { email: teacher.email },
      },
    });

    return reply.send({ ok: true });
  });

  const createSessionBodySchema = z
    .object({
      teacherId: z.string().min(1),
      studentId: z.string().min(1),
      subject: z.nativeEnum(Subject).default(Subject.GENERAL),
      startAtUtc: z.coerce.date(),
      endAtUtc: z.coerce.date(),
      classTimeZone: z.string().min(1),
      consumesUnits: z.number().int().positive().default(1),
    })
    .refine((data) => data.endAtUtc > data.startAtUtc, {
      path: ['endAtUtc'],
      message: '`endAtUtc` must be after `startAtUtc`',
    });

  const sessionParamsSchema = z.object({ id: z.string().min(1) });

  const listSessionsQuerySchema = z
    .object({
      from: z.coerce.date().optional(),
      to: z.coerce.date().optional(),
      teacherId: z.string().min(1).optional(),
      studentId: z.string().min(1).optional(),
      status: z.nativeEnum(SessionStatus).optional(),
    })
    .refine((data) => !data.from || !data.to || data.to > data.from, {
      path: ['to'],
      message: '`to` must be after `from`',
    })
    .refine((data) => !(data.teacherId && data.studentId), {
      path: ['teacherId'],
      message: 'Cannot filter by both teacherId and studentId',
    });

  fastify.get('/sessions', { preHandler: fastify.requireRole([UserRole.ADMIN]) }, async (request, reply) => {
    const parsedQuery = listSessionsQuerySchema.safeParse(request.query);
    if (!parsedQuery.success) return zodBadRequest(reply, parsedQuery.error);

    const actor = await fastify.prisma.user.findUnique({
      where: { id: request.user.userId },
      select: { id: true, orgId: true },
    });
    if (!actor) return reply.code(401).send({ message: 'Unauthorized' });

    if (parsedQuery.data.teacherId) {
      const teacher = await fastify.prisma.user.findFirst({
        where: { id: parsedQuery.data.teacherId, orgId: actor.orgId, role: UserRole.TEACHER, status: UserStatus.ACTIVE },
        select: { id: true },
      });
      if (!teacher) return reply.code(404).send({ message: 'Teacher not found' });
    }

    if (parsedQuery.data.studentId) {
      const student = await fastify.prisma.user.findFirst({
        where: { id: parsedQuery.data.studentId, orgId: actor.orgId, role: UserRole.STUDENT, status: UserStatus.ACTIVE },
        select: { id: true },
      });
      if (!student) return reply.code(404).send({ message: 'Student not found' });
    }

    const startAtUtcFilter: { gte?: Date; lt?: Date } = {};
    if (parsedQuery.data.from) startAtUtcFilter.gte = parsedQuery.data.from;
    if (parsedQuery.data.to) startAtUtcFilter.lt = parsedQuery.data.to;

    const sessions = await fastify.prisma.session.findMany({
      where: {
        teacher: { orgId: actor.orgId },
        student: { orgId: actor.orgId },
        ...(parsedQuery.data.teacherId ? { teacherId: parsedQuery.data.teacherId } : {}),
        ...(parsedQuery.data.studentId ? { studentId: parsedQuery.data.studentId } : {}),
        ...(parsedQuery.data.status ? { status: parsedQuery.data.status } : {}),
        ...(Object.keys(startAtUtcFilter).length ? { startAtUtc: startAtUtcFilter } : {}),
      },
      orderBy: { startAtUtc: 'asc' },
      select: {
        id: true,
        teacherId: true,
        studentId: true,
        subject: true,
        startAtUtc: true,
        endAtUtc: true,
        classTimeZone: true,
        status: true,
        consumesUnits: true,
        rateCentsSnapshot: true,
        currencySnapshot: true,
        teacher: { select: { email: true, teacherProfile: { select: { displayName: true } } } },
        student: { select: { email: true, studentProfile: { select: { displayName: true } } } },
      },
    });

    return sessions.map((session) => ({
      id: session.id,
      teacherId: session.teacherId,
      teacherName: session.teacher.teacherProfile?.displayName ?? null,
      teacherEmail: session.teacher.email,
      studentId: session.studentId,
      studentName: session.student.studentProfile?.displayName ?? null,
      studentEmail: session.student.email,
      subject: session.subject,
      startAtUtc: session.startAtUtc.toISOString(),
      endAtUtc: session.endAtUtc.toISOString(),
      classTimeZone: session.classTimeZone,
      status: session.status,
      consumesUnits: session.consumesUnits,
      rateCentsSnapshot: session.rateCentsSnapshot,
      currencySnapshot: session.currencySnapshot,
    }));
  });

  fastify.post('/sessions', { preHandler: fastify.requireRole([UserRole.ADMIN]) }, async (request, reply) => {
    const parsedBody = createSessionBodySchema.safeParse(request.body);
    if (!parsedBody.success) return zodBadRequest(reply, parsedBody.error);

    const actor = await fastify.prisma.user.findUnique({
      where: { id: request.user.userId },
      select: { id: true, orgId: true },
    });
    if (!actor) return reply.code(401).send({ message: 'Unauthorized' });

    const [teacher, student] = await Promise.all([
      fastify.prisma.user.findUnique({
        where: { id: parsedBody.data.teacherId },
        select: { id: true, orgId: true, role: true },
      }),
      fastify.prisma.user.findUnique({
        where: { id: parsedBody.data.studentId },
        select: { id: true, orgId: true, role: true },
      }),
    ]);

    if (!teacher || teacher.orgId !== actor.orgId || teacher.role !== UserRole.TEACHER) {
      return reply.code(404).send({ message: 'Teacher not found' });
    }
    if (!student || student.orgId !== actor.orgId || student.role !== UserRole.STUDENT) {
      return reply.code(404).send({ message: 'Student not found' });
    }

    const rate = await fastify.prisma.teacherStudentRate.findUnique({
      where: {
        teacherId_studentId_subject: {
          teacherId: teacher.id,
          studentId: student.id,
          subject: parsedBody.data.subject,
        },
      },
      select: { id: true, hourlyRateCents: true, currency: true },
    });
    if (!rate) {
      return reply.code(404).send({ message: 'Rate not found' });
    }

    const conflict = await fastify.prisma.session.findFirst({
      where: {
        teacherId: teacher.id,
        status: SessionStatus.SCHEDULED,
        startAtUtc: { lt: parsedBody.data.endAtUtc },
        endAtUtc: { gt: parsedBody.data.startAtUtc },
      },
      select: { id: true },
    });

    if (conflict) {
      return reply.code(409).send({ message: 'Teacher time conflict', conflictSessionId: conflict.id });
    }

    const session = await fastify.prisma.session.create({
      data: {
        teacherId: teacher.id,
        studentId: student.id,
        subject: parsedBody.data.subject,
        startAtUtc: parsedBody.data.startAtUtc,
        endAtUtc: parsedBody.data.endAtUtc,
        classTimeZone: parsedBody.data.classTimeZone,
        consumesUnits: parsedBody.data.consumesUnits,
        rateCentsSnapshot: rate.hourlyRateCents,
        currencySnapshot: rate.currency,
        createdByAdminId: actor.id,
      },
    });

    await fastify.prisma.auditLog.create({
      data: {
        orgId: actor.orgId,
        actorUserId: actor.id,
        action: 'ADMIN_CREATE_SESSION',
        entityType: 'Session',
        entityId: session.id,
        meta: {
          teacherId: teacher.id,
          studentId: student.id,
          subject: session.subject,
          startAtUtc: session.startAtUtc.toISOString(),
          endAtUtc: session.endAtUtc.toISOString(),
          classTimeZone: session.classTimeZone,
          consumesUnits: session.consumesUnits,
          rateCentsSnapshot: session.rateCentsSnapshot,
          currencySnapshot: session.currencySnapshot,
        },
      },
    });

    return reply.code(201).send({ id: session.id });
  });

  const updateSessionBodySchema = z
    .object({
      subject: z.nativeEnum(Subject).optional(),
      startAtUtc: z.coerce.date().optional(),
      endAtUtc: z.coerce.date().optional(),
      classTimeZone: z.string().min(1).optional(),
      consumesUnits: z.number().int().positive().optional(),
      status: z.nativeEnum(SessionStatus).optional(),
    })
    .refine((data) => !data.startAtUtc || !data.endAtUtc || data.endAtUtc > data.startAtUtc, {
      path: ['endAtUtc'],
      message: '`endAtUtc` must be after `startAtUtc`',
    });

  fastify.patch('/sessions/:id', { preHandler: fastify.requireRole([UserRole.ADMIN]) }, async (request, reply) => {
    const parsedParams = sessionParamsSchema.safeParse(request.params);
    if (!parsedParams.success) return zodBadRequest(reply, parsedParams.error);

    const parsedBody = updateSessionBodySchema.safeParse(request.body);
    if (!parsedBody.success) return zodBadRequest(reply, parsedBody.error);

    const actor = await fastify.prisma.user.findUnique({
      where: { id: request.user.userId },
      select: { id: true, orgId: true },
    });
    if (!actor) return reply.code(401).send({ message: 'Unauthorized' });

    const existing = await fastify.prisma.session.findFirst({
      where: { id: parsedParams.data.id, teacher: { orgId: actor.orgId }, student: { orgId: actor.orgId } },
      select: {
        id: true,
        teacherId: true,
        studentId: true,
        subject: true,
        startAtUtc: true,
        endAtUtc: true,
        classTimeZone: true,
        consumesUnits: true,
        status: true,
      },
    });
    if (!existing) return reply.code(404).send({ message: 'Session not found' });

    if (existing.status !== SessionStatus.SCHEDULED) {
      return reply.code(409).send({ message: 'Only SCHEDULED sessions can be edited' });
    }

    const nextSubject = parsedBody.data.subject ?? existing.subject;
    const nextStartAtUtc = parsedBody.data.startAtUtc ?? existing.startAtUtc;
    const nextEndAtUtc = parsedBody.data.endAtUtc ?? existing.endAtUtc;

    const nextStatus = parsedBody.data.status ?? existing.status;
    if (nextStatus !== SessionStatus.SCHEDULED && nextStatus !== SessionStatus.CANCELLED) {
      return reply.code(400).send({ message: 'Invalid status transition' });
    }

    const conflict = await fastify.prisma.session.findFirst({
      where: {
        id: { not: existing.id },
        teacherId: existing.teacherId,
        status: SessionStatus.SCHEDULED,
        startAtUtc: { lt: nextEndAtUtc },
        endAtUtc: { gt: nextStartAtUtc },
      },
      select: { id: true },
    });

    if (conflict) {
      return reply.code(409).send({ message: 'Teacher time conflict', conflictSessionId: conflict.id });
    }

    let nextRateCentsSnapshot: number | undefined;
    let nextCurrencySnapshot: Currency | undefined;
    if (nextSubject !== existing.subject) {
      const rate = await fastify.prisma.teacherStudentRate.findUnique({
        where: {
          teacherId_studentId_subject: {
            teacherId: existing.teacherId,
            studentId: existing.studentId,
            subject: nextSubject,
          },
        },
        select: { hourlyRateCents: true, currency: true },
      });
      if (!rate) return reply.code(404).send({ message: 'Rate not found' });
      nextRateCentsSnapshot = rate.hourlyRateCents;
      nextCurrencySnapshot = rate.currency;
    }

    const updated = await fastify.prisma.session.update({
      where: { id: existing.id },
      data: {
        subject: nextSubject,
        startAtUtc: nextStartAtUtc,
        endAtUtc: nextEndAtUtc,
        classTimeZone: parsedBody.data.classTimeZone ?? existing.classTimeZone,
        consumesUnits: parsedBody.data.consumesUnits ?? existing.consumesUnits,
        status: nextStatus,
        ...(nextRateCentsSnapshot !== undefined ? { rateCentsSnapshot: nextRateCentsSnapshot } : {}),
        ...(nextCurrencySnapshot !== undefined ? { currencySnapshot: nextCurrencySnapshot } : {}),
      },
      select: { id: true, subject: true, startAtUtc: true, endAtUtc: true, classTimeZone: true, consumesUnits: true, status: true },
    });

    await fastify.prisma.auditLog.create({
      data: {
        orgId: actor.orgId,
        actorUserId: actor.id,
        action: 'ADMIN_UPDATE_SESSION',
        entityType: 'Session',
        entityId: updated.id,
        meta: {
          subject: updated.subject,
          startAtUtc: updated.startAtUtc.toISOString(),
          endAtUtc: updated.endAtUtc.toISOString(),
          classTimeZone: updated.classTimeZone,
          consumesUnits: updated.consumesUnits,
          status: updated.status,
        },
      },
    });

    return reply.send({ ok: true });
  });

  fastify.delete('/sessions/:id', { preHandler: fastify.requireRole([UserRole.ADMIN]) }, async (request, reply) => {
    const parsedParams = sessionParamsSchema.safeParse(request.params);
    if (!parsedParams.success) return zodBadRequest(reply, parsedParams.error);

    const actor = await fastify.prisma.user.findUnique({
      where: { id: request.user.userId },
      select: { id: true, orgId: true },
    });
    if (!actor) return reply.code(401).send({ message: 'Unauthorized' });

    const existing = await fastify.prisma.session.findFirst({
      where: { id: parsedParams.data.id, teacher: { orgId: actor.orgId }, student: { orgId: actor.orgId } },
      select: { id: true, status: true },
    });
    if (!existing) return reply.code(404).send({ message: 'Session not found' });

    if (existing.status === SessionStatus.COMPLETED) {
      return reply.code(409).send({ message: 'Cannot delete COMPLETED session' });
    }

    if (existing.status !== SessionStatus.CANCELLED) {
      await fastify.prisma.session.update({ where: { id: existing.id }, data: { status: SessionStatus.CANCELLED } });
    }

    await fastify.prisma.auditLog.create({
      data: {
        orgId: actor.orgId,
        actorUserId: actor.id,
        action: 'ADMIN_CANCEL_SESSION',
        entityType: 'Session',
        entityId: existing.id,
        meta: { status: SessionStatus.CANCELLED },
      },
    });

    return reply.send({ ok: true });
  });

  const listChangeRequestsQuerySchema = z.object({
    status: z.nativeEnum(ChangeRequestStatus).optional(),
  });

  fastify.get(
    '/change-requests',
    { preHandler: fastify.requireRole([UserRole.ADMIN]) },
    async (request, reply) => {
      const parsedQuery = listChangeRequestsQuerySchema.safeParse(request.query);
      if (!parsedQuery.success) return zodBadRequest(reply, parsedQuery.error);

      const actor = await fastify.prisma.user.findUnique({
        where: { id: request.user.userId },
        select: { id: true, orgId: true },
      });
      if (!actor) return reply.code(401).send({ message: 'Unauthorized' });

      const status = parsedQuery.data.status ?? ChangeRequestStatus.PENDING;

      const changeRequests = await fastify.prisma.changeRequest.findMany({
        where: {
          status,
          session: { student: { orgId: actor.orgId } },
        },
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          sessionId: true,
          type: true,
          status: true,
          proposedStartAtUtc: true,
          proposedEndAtUtc: true,
          proposedTimeZone: true,
          requestedByUserId: true,
          decidedByAdminId: true,
          createdAt: true,
          updatedAt: true,
          session: {
            select: {
              startAtUtc: true,
              endAtUtc: true,
              classTimeZone: true,
              student: { select: { studentProfile: { select: { displayName: true } } } },
              teacher: { select: { teacherProfile: { select: { displayName: true } } } },
            },
          },
        },
      });

      return changeRequests.map((cr) => ({
        id: cr.id,
        sessionId: cr.sessionId,
        type: cr.type,
        status: cr.status,
        proposedStartAtUtc: cr.proposedStartAtUtc?.toISOString() ?? null,
        proposedEndAtUtc: cr.proposedEndAtUtc?.toISOString() ?? null,
        proposedTimeZone: cr.proposedTimeZone ?? null,
        requestedByUserId: cr.requestedByUserId,
        decidedByAdminId: cr.decidedByAdminId ?? null,
        createdAt: cr.createdAt.toISOString(),
        updatedAt: cr.updatedAt.toISOString(),
        session: {
          startAtUtc: cr.session.startAtUtc.toISOString(),
          endAtUtc: cr.session.endAtUtc.toISOString(),
          classTimeZone: cr.session.classTimeZone,
          studentName: cr.session.student.studentProfile?.displayName ?? null,
          teacherName: cr.session.teacher.teacherProfile?.displayName ?? null,
        },
      }));
    },
  );

  const changeRequestParamsSchema = z.object({ id: z.string().min(1) });

  fastify.post(
    '/change-requests/:id/approve',
    { preHandler: fastify.requireRole([UserRole.ADMIN]) },
    async (request, reply) => {
      const parsedParams = changeRequestParamsSchema.safeParse(request.params);
      if (!parsedParams.success) return zodBadRequest(reply, parsedParams.error);

      const actor = await fastify.prisma.user.findUnique({
        where: { id: request.user.userId },
        select: { id: true, orgId: true },
      });
      if (!actor) return reply.code(401).send({ message: 'Unauthorized' });

      const changeRequest = await fastify.prisma.changeRequest.findUnique({
        where: { id: parsedParams.data.id },
        select: {
          id: true,
          type: true,
          status: true,
          sessionId: true,
          proposedStartAtUtc: true,
          proposedEndAtUtc: true,
          proposedTimeZone: true,
          requestedByUserId: true,
          session: {
            select: {
              id: true,
              status: true,
              startAtUtc: true,
              endAtUtc: true,
              classTimeZone: true,
              student: { select: { orgId: true } },
            },
          },
        },
      });

      if (!changeRequest || changeRequest.session.student.orgId !== actor.orgId) {
        return reply.code(404).send({ message: 'Change request not found' });
      }

      if (changeRequest.status !== ChangeRequestStatus.PENDING) {
        return reply.code(409).send({ message: 'Change request is not pending' });
      }

      if (changeRequest.session.status !== SessionStatus.SCHEDULED) {
        return reply.code(409).send({ message: 'Session is not schedulable' });
      }

      if (changeRequest.type === 'RESCHEDULE') {
        if (!changeRequest.proposedStartAtUtc || !changeRequest.proposedEndAtUtc || !changeRequest.proposedTimeZone) {
          return reply.code(400).send({ message: 'Missing proposed time fields' });
        }
      }

      const { session: sessionBefore } = changeRequest;

      const updated = await fastify.prisma.$transaction(async (tx) => {
        const updatedChangeRequest = await tx.changeRequest.update({
          where: { id: changeRequest.id },
          data: {
            status: ChangeRequestStatus.APPROVED,
            decidedByAdminId: actor.id,
          },
        });

        const updatedSession =
          changeRequest.type === 'CANCEL'
            ? await tx.session.update({
                where: { id: changeRequest.sessionId },
                data: { status: SessionStatus.CANCELLED },
                select: { id: true, status: true, startAtUtc: true, endAtUtc: true, classTimeZone: true },
              })
            : await tx.session.update({
                where: { id: changeRequest.sessionId },
                data: {
                  startAtUtc: changeRequest.proposedStartAtUtc!,
                  endAtUtc: changeRequest.proposedEndAtUtc!,
                  classTimeZone: changeRequest.proposedTimeZone!,
                },
                select: { id: true, status: true, startAtUtc: true, endAtUtc: true, classTimeZone: true },
              });

        await tx.auditLog.create({
          data: {
            orgId: actor.orgId,
            actorUserId: actor.id,
            action: 'ADMIN_APPROVE_CHANGE_REQUEST',
            entityType: 'ChangeRequest',
            entityId: updatedChangeRequest.id,
            meta: {
              type: updatedChangeRequest.type,
              sessionId: updatedChangeRequest.sessionId,
              requestedByUserId: updatedChangeRequest.requestedByUserId,
            },
          },
        });

        await tx.auditLog.create({
          data: {
            orgId: actor.orgId,
            actorUserId: actor.id,
            action: changeRequest.type === 'CANCEL' ? 'ADMIN_CANCEL_SESSION' : 'ADMIN_RESCHEDULE_SESSION',
            entityType: 'Session',
            entityId: updatedSession.id,
            meta: {
              changeRequestId: updatedChangeRequest.id,
              before: {
                status: sessionBefore.status,
                startAtUtc: sessionBefore.startAtUtc.toISOString(),
                endAtUtc: sessionBefore.endAtUtc.toISOString(),
                classTimeZone: sessionBefore.classTimeZone,
              },
              after: {
                status: updatedSession.status,
                startAtUtc: updatedSession.startAtUtc.toISOString(),
                endAtUtc: updatedSession.endAtUtc.toISOString(),
                classTimeZone: updatedSession.classTimeZone,
              },
            },
          },
        });

        return { updatedChangeRequest, updatedSession };
      });

      return reply.send({
        id: updated.updatedChangeRequest.id,
        status: updated.updatedChangeRequest.status,
        session: {
          id: updated.updatedSession.id,
          status: updated.updatedSession.status,
          startAtUtc: updated.updatedSession.startAtUtc.toISOString(),
          endAtUtc: updated.updatedSession.endAtUtc.toISOString(),
          classTimeZone: updated.updatedSession.classTimeZone,
        },
      });
    },
  );

  fastify.post(
    '/change-requests/:id/reject',
    { preHandler: fastify.requireRole([UserRole.ADMIN]) },
    async (request, reply) => {
      const parsedParams = changeRequestParamsSchema.safeParse(request.params);
      if (!parsedParams.success) return zodBadRequest(reply, parsedParams.error);

      const actor = await fastify.prisma.user.findUnique({
        where: { id: request.user.userId },
        select: { id: true, orgId: true },
      });
      if (!actor) return reply.code(401).send({ message: 'Unauthorized' });

      const changeRequest = await fastify.prisma.changeRequest.findUnique({
        where: { id: parsedParams.data.id },
        select: {
          id: true,
          status: true,
          sessionId: true,
          requestedByUserId: true,
          session: { select: { student: { select: { orgId: true } } } },
        },
      });

      if (!changeRequest || changeRequest.session.student.orgId !== actor.orgId) {
        return reply.code(404).send({ message: 'Change request not found' });
      }

      if (changeRequest.status !== ChangeRequestStatus.PENDING) {
        return reply.code(409).send({ message: 'Change request is not pending' });
      }

      const updated = await fastify.prisma.$transaction(async (tx) => {
        const updatedChangeRequest = await tx.changeRequest.update({
          where: { id: changeRequest.id },
          data: { status: ChangeRequestStatus.REJECTED, decidedByAdminId: actor.id },
        });

        await tx.auditLog.create({
          data: {
            orgId: actor.orgId,
            actorUserId: actor.id,
            action: 'ADMIN_REJECT_CHANGE_REQUEST',
            entityType: 'ChangeRequest',
            entityId: updatedChangeRequest.id,
            meta: {
              sessionId: updatedChangeRequest.sessionId,
              requestedByUserId: updatedChangeRequest.requestedByUserId,
            },
          },
        });

        return updatedChangeRequest;
      });

      return reply.send({ id: updated.id, status: updated.status });
    },
  );
};

export default adminRoutes;
