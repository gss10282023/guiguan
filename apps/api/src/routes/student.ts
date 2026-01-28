import type { FastifyPluginAsync, FastifyReply } from 'fastify';
import { ChangeRequestStatus, SessionStatus, UserRole } from '@prisma/client';
import { z } from 'zod';

function zodBadRequest(reply: FastifyReply, error: z.ZodError) {
  return reply.code(400).send({
    message: 'Bad Request',
    issues: error.issues.map((issue) => ({
      path: issue.path.join('.'),
      message: issue.message,
    })),
  });
}

const listSessionsQuerySchema = z
  .object({
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
  })
  .refine((data) => !data.from || !data.to || data.to > data.from, {
    path: ['to'],
    message: '`to` must be after `from`',
  });

const studentRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/sessions', { preHandler: fastify.requireRole([UserRole.STUDENT]) }, async (request, reply) => {
    const parsedQuery = listSessionsQuerySchema.safeParse(request.query);
    if (!parsedQuery.success) return zodBadRequest(reply, parsedQuery.error);

    const startAtUtcFilter: { gte?: Date; lt?: Date } = {};
    if (parsedQuery.data.from) startAtUtcFilter.gte = parsedQuery.data.from;
    if (parsedQuery.data.to) startAtUtcFilter.lt = parsedQuery.data.to;

    const sessions = await fastify.prisma.session.findMany({
      where: {
        studentId: request.user.userId,
        ...(Object.keys(startAtUtcFilter).length ? { startAtUtc: startAtUtcFilter } : {}),
      },
      orderBy: { startAtUtc: 'asc' },
      select: {
        id: true,
        startAtUtc: true,
        endAtUtc: true,
        classTimeZone: true,
        status: true,
        student: { select: { studentProfile: { select: { displayName: true } } } },
        teacher: { select: { teacherProfile: { select: { displayName: true } } } },
      },
    });

    return sessions.map((session) => ({
      id: session.id,
      startAtUtc: session.startAtUtc.toISOString(),
      endAtUtc: session.endAtUtc.toISOString(),
      classTimeZone: session.classTimeZone,
      status: session.status,
      studentName: session.student.studentProfile?.displayName ?? null,
      teacherName: session.teacher.teacherProfile?.displayName ?? null,
    }));
  });

  const createChangeRequestParamsSchema = z.object({ id: z.string().min(1) });
  const createChangeRequestBodySchema = z
    .union([
      z.object({ type: z.literal('CANCEL') }),
      z.object({
        type: z.literal('RESCHEDULE'),
        proposedStartAtUtc: z.coerce.date(),
        proposedEndAtUtc: z.coerce.date(),
        proposedTimeZone: z.string().min(1),
      }),
    ])
    .superRefine((data, ctx) => {
      if (data.type !== 'RESCHEDULE') return;
      if (data.proposedEndAtUtc <= data.proposedStartAtUtc) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['proposedEndAtUtc'],
          message: '`proposedEndAtUtc` must be after `proposedStartAtUtc`',
        });
      }
    });

  fastify.post(
    '/sessions/:id/change-requests',
    { preHandler: fastify.requireRole([UserRole.STUDENT]) },
    async (request, reply) => {
      const parsedParams = createChangeRequestParamsSchema.safeParse(request.params);
      if (!parsedParams.success) return zodBadRequest(reply, parsedParams.error);

      const parsedBody = createChangeRequestBodySchema.safeParse(request.body);
      if (!parsedBody.success) return zodBadRequest(reply, parsedBody.error);

      const actor = await fastify.prisma.user.findUnique({
        where: { id: request.user.userId },
        select: { id: true, orgId: true },
      });
      if (!actor) return reply.code(401).send({ message: 'Unauthorized' });

      const session = await fastify.prisma.session.findFirst({
        where: { id: parsedParams.data.id, studentId: request.user.userId },
        select: { id: true, startAtUtc: true, status: true },
      });
      if (!session) return reply.code(404).send({ message: 'Session not found' });
      if (session.status !== SessionStatus.SCHEDULED) {
        return reply.code(409).send({ message: 'Session is not schedulable' });
      }

      const nowUtc = new Date();
      const cutoffUtc = new Date(session.startAtUtc.getTime() - 24 * 60 * 60 * 1000);
      if (nowUtc > cutoffUtc) {
        return reply.code(403).send({ message: 'Forbidden' });
      }

      const existingPending = await fastify.prisma.changeRequest.findFirst({
        where: { sessionId: session.id, status: ChangeRequestStatus.PENDING },
        select: { id: true },
      });
      if (existingPending) {
        return reply.code(409).send({ message: 'Pending change request already exists' });
      }

      const changeRequest = await fastify.prisma.$transaction(async (tx) => {
        const created = await tx.changeRequest.create({
          data: {
            sessionId: session.id,
            type: parsedBody.data.type,
            proposedStartAtUtc: parsedBody.data.type === 'RESCHEDULE' ? parsedBody.data.proposedStartAtUtc : null,
            proposedEndAtUtc: parsedBody.data.type === 'RESCHEDULE' ? parsedBody.data.proposedEndAtUtc : null,
            proposedTimeZone: parsedBody.data.type === 'RESCHEDULE' ? parsedBody.data.proposedTimeZone : null,
            requestedByUserId: request.user.userId,
          },
        });

        await tx.auditLog.create({
          data: {
            orgId: actor.orgId,
            actorUserId: actor.id,
            action: 'STUDENT_CREATE_CHANGE_REQUEST',
            entityType: 'ChangeRequest',
            entityId: created.id,
            meta: {
              sessionId: session.id,
              type: created.type,
              proposedStartAtUtc: created.proposedStartAtUtc?.toISOString() ?? null,
              proposedEndAtUtc: created.proposedEndAtUtc?.toISOString() ?? null,
              proposedTimeZone: created.proposedTimeZone ?? null,
            },
          },
        });

        return created;
      });

      return reply.code(201).send({
        id: changeRequest.id,
        sessionId: changeRequest.sessionId,
        type: changeRequest.type,
        status: changeRequest.status,
        proposedStartAtUtc: changeRequest.proposedStartAtUtc?.toISOString() ?? null,
        proposedEndAtUtc: changeRequest.proposedEndAtUtc?.toISOString() ?? null,
        proposedTimeZone: changeRequest.proposedTimeZone ?? null,
      });
    },
  );

  fastify.get('/change-requests', { preHandler: fastify.requireRole([UserRole.STUDENT]) }, async (request) => {
    const changeRequests = await fastify.prisma.changeRequest.findMany({
      where: { requestedByUserId: request.user.userId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        sessionId: true,
        type: true,
        status: true,
        proposedStartAtUtc: true,
        proposedEndAtUtc: true,
        proposedTimeZone: true,
        decidedByAdminId: true,
        createdAt: true,
        updatedAt: true,
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
      decidedByAdminId: cr.decidedByAdminId ?? null,
      createdAt: cr.createdAt.toISOString(),
      updatedAt: cr.updatedAt.toISOString(),
    }));
  });

  fastify.get('/hours', { preHandler: fastify.requireRole([UserRole.STUDENT]) }, async (request) => {
    const summary = await fastify.prisma.hourLedgerEntry.aggregate({
      where: { studentId: request.user.userId },
      _sum: { deltaUnits: true },
    });

    return { remainingUnits: summary._sum.deltaUnits ?? 0 };
  });

  fastify.get(
    '/hours/by-teacher',
    { preHandler: fastify.requireRole([UserRole.STUDENT]) },
    async (request, reply) => {
      const actor = await fastify.prisma.user.findUnique({
        where: { id: request.user.userId },
        select: { id: true, orgId: true },
      });
      if (!actor) return reply.code(401).send({ message: 'Unauthorized' });

      const grouped = await fastify.prisma.hourLedgerEntry.groupBy({
        by: ['teacherId'],
        where: { studentId: actor.id },
        _sum: { deltaUnits: true },
      });

      const unassignedUnits = grouped.find((g) => g.teacherId === null)?._sum.deltaUnits ?? 0;

      const unitsByTeacherId = new Map<string, number>();
      for (const group of grouped) {
        if (!group.teacherId) continue;
        unitsByTeacherId.set(group.teacherId, group._sum.deltaUnits ?? 0);
      }

      const teacherIds = Array.from(unitsByTeacherId.keys());

      const teachers = teacherIds.length
        ? await fastify.prisma.user.findMany({
            where: { id: { in: teacherIds }, orgId: actor.orgId, role: UserRole.TEACHER },
            select: { id: true, teacherProfile: { select: { displayName: true } } },
          })
        : [];

      const teacherNameById = new Map<string, string | null>(
        teachers.map((teacher) => [teacher.id, teacher.teacherProfile?.displayName ?? null]),
      );

      const byTeacher = teacherIds
        .map((teacherId) => ({
          teacherId,
          teacherName: teacherNameById.get(teacherId) ?? null,
          remainingUnits: unitsByTeacherId.get(teacherId) ?? 0,
        }))
        .sort((a, b) => (a.teacherName ?? a.teacherId).localeCompare(b.teacherName ?? b.teacherId));

      const totalRemainingUnits = grouped.reduce((acc, g) => acc + (g._sum.deltaUnits ?? 0), 0);

      return reply.send({ totalRemainingUnits, unassignedUnits, byTeacher });
    },
  );
};

export default studentRoutes;
