import type { FastifyPluginAsync, FastifyReply } from 'fastify';
import { SessionStatus, UserRole, type Currency } from '@prisma/client';
import { z } from 'zod';

import { isoDateAddDays, parseIsoDate, zonedTimeToUtc } from '../lib/timezone.js';

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

const payrollQuerySchema = z
  .object({
    weekStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  })
  .superRefine((data, ctx) => {
    try {
      const parts = parseIsoDate(data.weekStart);
      const utc = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
      if (utc.getUTCDay() !== 1) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['weekStart'],
          message: '`weekStart` must be a Monday (YYYY-MM-DD)',
        });
      }
    } catch {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['weekStart'],
        message: '`weekStart` must be a valid date (YYYY-MM-DD)',
      });
    }
  });

const PAYROLL_TIME_ZONE = 'Australia/Sydney';
const MS_PER_HOUR = 60 * 60 * 1000;

function prorateCents(durationMs: number, hourlyRateCents: number): number {
  if (durationMs <= 0) return 0;
  const numerator = BigInt(durationMs) * BigInt(hourlyRateCents);
  const denominator = BigInt(MS_PER_HOUR);
  return Number((numerator + denominator / 2n) / denominator);
}

const teacherRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/sessions', { preHandler: fastify.requireRole([UserRole.TEACHER]) }, async (request, reply) => {
    const parsedQuery = listSessionsQuerySchema.safeParse(request.query);
    if (!parsedQuery.success) return zodBadRequest(reply, parsedQuery.error);

    const startAtUtcFilter: { gte?: Date; lt?: Date } = {};
    if (parsedQuery.data.from) startAtUtcFilter.gte = parsedQuery.data.from;
    if (parsedQuery.data.to) startAtUtcFilter.lt = parsedQuery.data.to;

    const sessions = await fastify.prisma.session.findMany({
      where: {
        teacherId: request.user.userId,
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

  fastify.get('/payroll', { preHandler: fastify.requireRole([UserRole.TEACHER]) }, async (request, reply) => {
    const parsedQuery = payrollQuerySchema.safeParse(request.query);
    if (!parsedQuery.success) return zodBadRequest(reply, parsedQuery.error);

    const weekStartLocal = parsedQuery.data.weekStart;
    const weekEndLocal = isoDateAddDays(weekStartLocal, 6);
    const nextWeekStartLocal = isoDateAddDays(weekStartLocal, 7);

    const weekStartParts = parseIsoDate(weekStartLocal);
    const nextWeekStartParts = parseIsoDate(nextWeekStartLocal);

    const rangeStartUtc = zonedTimeToUtc(
      { year: weekStartParts.year, month: weekStartParts.month, day: weekStartParts.day, hour: 0, minute: 0, second: 0 },
      PAYROLL_TIME_ZONE,
    );
    const rangeEndUtcExclusive = zonedTimeToUtc(
      {
        year: nextWeekStartParts.year,
        month: nextWeekStartParts.month,
        day: nextWeekStartParts.day,
        hour: 0,
        minute: 0,
        second: 0,
      },
      PAYROLL_TIME_ZONE,
    );

    const sessions = await fastify.prisma.session.findMany({
      where: {
        teacherId: request.user.userId,
        status: SessionStatus.COMPLETED,
        endAtUtc: { gte: rangeStartUtc, lt: rangeEndUtcExclusive },
      },
      select: {
        studentId: true,
        startAtUtc: true,
        endAtUtc: true,
        teacherHourlyWageCentsSnapshot: true,
        currencySnapshot: true,
        student: { select: { studentProfile: { select: { displayName: true } } } },
      },
    });

	    const totalsByCurrency = new Map<
	      Currency,
	      { currency: Currency; totalCents: number; totalHours: number; sessionsCount: number }
	    >();

	    const totalsByStudent = new Map<
	      string,
	      {
	        studentId: string;
	        studentName: string | null;
	        totalsByCurrency: Map<Currency, { currency: Currency; totalCents: number; totalHours: number; sessionsCount: number }>;
	      }
	    >();

	    for (const session of sessions) {
	      const durationMs = session.endAtUtc.getTime() - session.startAtUtc.getTime();
	      if (durationMs <= 0) continue;

	      const currency = session.currencySnapshot;
	      const studentId = session.studentId;
	      const existing = totalsByCurrency.get(currency) ?? {
	        currency,
	        totalCents: 0,
	        totalHours: 0,
	        sessionsCount: 0,
	      };

      const sessionCents = prorateCents(durationMs, session.teacherHourlyWageCentsSnapshot);
	      existing.totalCents += sessionCents;
	      existing.totalHours += durationMs / MS_PER_HOUR;
	      existing.sessionsCount += 1;

	      totalsByCurrency.set(currency, existing);

	      const studentEntry = totalsByStudent.get(studentId) ?? {
	        studentId,
	        studentName: session.student.studentProfile?.displayName ?? null,
	        totalsByCurrency: new Map(),
	      };

	      const studentCurrencyTotal = studentEntry.totalsByCurrency.get(currency) ?? {
	        currency,
	        totalCents: 0,
	        totalHours: 0,
	        sessionsCount: 0,
	      };

	      studentCurrencyTotal.totalCents += sessionCents;
	      studentCurrencyTotal.totalHours += durationMs / MS_PER_HOUR;
	      studentCurrencyTotal.sessionsCount += 1;

	      studentEntry.totalsByCurrency.set(currency, studentCurrencyTotal);
	      totalsByStudent.set(studentId, studentEntry);
	    }

	    const totals = Array.from(totalsByCurrency.values()).sort((a, b) => a.currency.localeCompare(b.currency));
	    const byStudent = Array.from(totalsByStudent.values())
	      .map((entry) => ({
	        studentId: entry.studentId,
	        studentName: entry.studentName,
	        totals: Array.from(entry.totalsByCurrency.values()).sort((a, b) => a.currency.localeCompare(b.currency)),
	      }))
	      .sort((a, b) => (a.studentName ?? a.studentId).localeCompare(b.studentName ?? b.studentId));

	    return {
	      weekStartLocal,
	      weekEndLocal,
	      totals,
	      byStudent,
	    };
	  });
};

export default teacherRoutes;
