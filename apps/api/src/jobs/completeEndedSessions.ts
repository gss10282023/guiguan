import { HourLedgerReason, SessionStatus, type PrismaClient } from '@prisma/client';

type CompleteEndedSessionsOptions = {
  now?: Date;
  batchSize?: number;
};

export async function completeEndedSessions(
  prisma: PrismaClient,
  options: CompleteEndedSessionsOptions = {},
): Promise<{ processed: number }> {
  const now = options.now ?? new Date();
  const batchSize = options.batchSize ?? 100;

  const sessions = await prisma.session.findMany({
    where: {
      status: SessionStatus.SCHEDULED,
      endAtUtc: { lte: now },
    },
    select: { id: true },
    orderBy: { endAtUtc: 'asc' },
    take: batchSize,
  });

  for (const session of sessions) {
    await prisma.$transaction(async (tx) => {
      const current = await tx.session.findUnique({
        where: { id: session.id },
        select: { id: true, status: true, endAtUtc: true, studentId: true, teacherId: true, consumesUnits: true },
      });

      if (!current) return;
      if (current.endAtUtc > now) return;
      if (current.status === SessionStatus.CANCELLED) return;

      await tx.session.updateMany({
        where: { id: current.id, status: SessionStatus.SCHEDULED },
        data: { status: SessionStatus.COMPLETED },
      });

      await tx.hourLedgerEntry.upsert({
        where: { sessionId: current.id },
        create: {
          studentId: current.studentId,
          teacherId: current.teacherId,
          deltaUnits: -current.consumesUnits,
          reason: HourLedgerReason.SESSION_CONSUME,
          sessionId: current.id,
        },
        update: {},
      });
    });
  }

  return { processed: sessions.length };
}
