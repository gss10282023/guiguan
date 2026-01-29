import { PrismaClient, UserRole, UserStatus, Currency, SessionStatus, HourLedgerReason } from '@prisma/client';

import { hashPassword } from '../src/lib/password.js';
import { isoDateAddDays, parseIsoDate, zonedTimeToUtc } from '../src/lib/timezone.js';

const prisma = new PrismaClient();

const PAYROLL_TIME_ZONE = 'Australia/Sydney';

const SEED_ORG_ID = 'org_seed';
const SEED_ADMIN_ID = 'user_admin_seed';
const SEED_TEACHER_ID = 'user_teacher_seed';
const SEED_STUDENT_ID = 'user_student_seed';
const SEED_STUDENT_2_ID = 'user_student_2_seed';
const SEED_SESSION_1_ID = 'session_seed_1';
const SEED_SESSION_2_ID = 'session_seed_2';
const SEED_SESSION_PAYROLL_1_ID = 'session_seed_payroll_1';
const SEED_SESSION_PAYROLL_2_ID = 'session_seed_payroll_2';
const SEED_SESSION_PAYROLL_STUDENT2_ID = 'session_seed_payroll_student2_1';
const SEED_LEDGER_PURCHASE_ID = 'ledger_seed_purchase_10';

function formatIsoDateInTimeZone(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);

  const year = parts.find((p) => p.type === 'year')?.value;
  const month = parts.find((p) => p.type === 'month')?.value;
  const day = parts.find((p) => p.type === 'day')?.value;

  if (!year || !month || !day) throw new Error('Failed to format ISO date');
  return `${year}-${month}-${day}`;
}

function getSydneyWeekStartIsoDate(date: Date): string {
  const weekday = new Intl.DateTimeFormat('en-US', { timeZone: PAYROLL_TIME_ZONE, weekday: 'short' }).format(date);
  const offset =
    weekday === 'Mon'
      ? 0
      : weekday === 'Tue'
        ? 1
        : weekday === 'Wed'
          ? 2
          : weekday === 'Thu'
            ? 3
            : weekday === 'Fri'
              ? 4
              : weekday === 'Sat'
                ? 5
                : 6;

  const todayLocal = formatIsoDateInTimeZone(date, PAYROLL_TIME_ZONE);
  return isoDateAddDays(todayLocal, -offset);
}

async function main() {
  const seedPasswordHash = hashPassword('password123');

  const org = await prisma.organization.upsert({
    where: { id: SEED_ORG_ID },
    create: { id: SEED_ORG_ID, name: 'Seed Organization' },
    update: { name: 'Seed Organization' },
  });

  const admin = await prisma.user.upsert({
    where: { email: 'admin@example.com' },
    create: {
      id: SEED_ADMIN_ID,
      orgId: org.id,
      email: 'admin@example.com',
      passwordHash: seedPasswordHash,
      role: UserRole.ADMIN,
      status: UserStatus.ACTIVE,
    },
    update: {
      orgId: org.id,
      email: 'admin@example.com',
      passwordHash: seedPasswordHash,
      role: UserRole.ADMIN,
      status: UserStatus.ACTIVE,
    },
  });

  const teacher = await prisma.user.upsert({
    where: { email: 'teacher@example.com' },
    create: {
      id: SEED_TEACHER_ID,
      orgId: org.id,
      email: 'teacher@example.com',
      passwordHash: seedPasswordHash,
      role: UserRole.TEACHER,
      status: UserStatus.ACTIVE,
      teacherProfile: {
        create: { displayName: 'Seed Teacher', timeZone: 'Australia/Sydney' },
      },
    },
    update: {
      orgId: org.id,
      email: 'teacher@example.com',
      passwordHash: seedPasswordHash,
      role: UserRole.TEACHER,
      status: UserStatus.ACTIVE,
      teacherProfile: {
        upsert: {
          create: { displayName: 'Seed Teacher', timeZone: 'Australia/Sydney' },
          update: { displayName: 'Seed Teacher', timeZone: 'Australia/Sydney' },
        },
      },
    },
  });

  const student = await prisma.user.upsert({
    where: { email: 'student@example.com' },
    create: {
      id: SEED_STUDENT_ID,
      orgId: org.id,
      email: 'student@example.com',
      passwordHash: seedPasswordHash,
      role: UserRole.STUDENT,
      status: UserStatus.ACTIVE,
      studentProfile: {
        create: { displayName: 'Seed Student', timeZone: 'Asia/Shanghai' },
      },
    },
    update: {
      orgId: org.id,
      email: 'student@example.com',
      passwordHash: seedPasswordHash,
      role: UserRole.STUDENT,
      status: UserStatus.ACTIVE,
      studentProfile: {
        upsert: {
          create: { displayName: 'Seed Student', timeZone: 'Asia/Shanghai' },
          update: { displayName: 'Seed Student', timeZone: 'Asia/Shanghai' },
        },
      },
    },
  });

  const student2 = await prisma.user.upsert({
    where: { email: 'student2@example.com' },
    create: {
      id: SEED_STUDENT_2_ID,
      orgId: org.id,
      email: 'student2@example.com',
      passwordHash: seedPasswordHash,
      role: UserRole.STUDENT,
      status: UserStatus.ACTIVE,
      studentProfile: {
        create: { displayName: 'Seed Student 2', timeZone: 'Australia/Sydney' },
      },
    },
    update: {
      orgId: org.id,
      email: 'student2@example.com',
      passwordHash: seedPasswordHash,
      role: UserRole.STUDENT,
      status: UserStatus.ACTIVE,
      studentProfile: {
        upsert: {
          create: { displayName: 'Seed Student 2', timeZone: 'Australia/Sydney' },
          update: { displayName: 'Seed Student 2', timeZone: 'Australia/Sydney' },
        },
      },
    },
  });

  const rate = await prisma.teacherStudentRate.upsert({
    where: {
      teacherId_studentId_subject: {
        teacherId: teacher.id,
        studentId: student.id,
        subject: 'GENERAL',
      },
    },
    create: {
      teacherId: teacher.id,
      studentId: student.id,
      subject: 'GENERAL',
      studentHourlyRateCents: 10000,
      teacherHourlyWageCents: 10000,
      currency: Currency.AUD,
    },
    update: {
      subject: 'GENERAL',
      studentHourlyRateCents: 10000,
      teacherHourlyWageCents: 10000,
      currency: Currency.AUD,
    },
  });

  const rate2 = await prisma.teacherStudentRate.upsert({
    where: {
      teacherId_studentId_subject: {
        teacherId: teacher.id,
        studentId: student2.id,
        subject: 'GENERAL',
      },
    },
    create: {
      teacherId: teacher.id,
      studentId: student2.id,
      subject: 'GENERAL',
      studentHourlyRateCents: 8000,
      teacherHourlyWageCents: 8000,
      currency: Currency.AUD,
    },
    update: {
      subject: 'GENERAL',
      studentHourlyRateCents: 8000,
      teacherHourlyWageCents: 8000,
      currency: Currency.AUD,
    },
  });

  await prisma.hourLedgerEntry.upsert({
    where: { id: SEED_LEDGER_PURCHASE_ID },
    create: {
      id: SEED_LEDGER_PURCHASE_ID,
      studentId: student.id,
      teacherId: teacher.id,
      deltaUnits: 10,
      reason: HourLedgerReason.PURCHASE,
    },
    update: {
      studentId: student.id,
      teacherId: teacher.id,
      deltaUnits: 10,
      reason: HourLedgerReason.PURCHASE,
    },
  });

  const desiredRemainingUnits = 10;
  const currentRemaining = await prisma.hourLedgerEntry.aggregate({
    where: { studentId: student.id },
    _sum: { deltaUnits: true },
  });
  const currentUnits = currentRemaining._sum.deltaUnits ?? 0;
  const adjustment = desiredRemainingUnits - currentUnits;

  if (adjustment !== 0) {
    await prisma.hourLedgerEntry.create({
      data: {
        studentId: student.id,
        teacherId: teacher.id,
        deltaUnits: adjustment,
        reason: HourLedgerReason.ADJUSTMENT,
      },
    });
  }

  const now = Date.now();
  const session1Start = new Date(now + 24 * 60 * 60 * 1000);
  const session1End = new Date(now + 25 * 60 * 60 * 1000);
  const session2Start = new Date(now + 48 * 60 * 60 * 1000);
  const session2End = new Date(now + 49 * 60 * 60 * 1000);

  await prisma.session.upsert({
    where: { id: SEED_SESSION_1_ID },
    create: {
      id: SEED_SESSION_1_ID,
      teacherId: teacher.id,
      studentId: student.id,
      startAtUtc: session1Start,
      endAtUtc: session1End,
      classTimeZone: 'Australia/Sydney',
      status: SessionStatus.SCHEDULED,
      consumesUnits: 1,
      studentHourlyRateCentsSnapshot: rate.studentHourlyRateCents,
      teacherHourlyWageCentsSnapshot: rate.teacherHourlyWageCents,
      currencySnapshot: rate.currency,
      createdByAdminId: admin.id,
    },
    update: {
      teacherId: teacher.id,
      studentId: student.id,
      startAtUtc: session1Start,
      endAtUtc: session1End,
      classTimeZone: 'Australia/Sydney',
      status: SessionStatus.SCHEDULED,
      consumesUnits: 1,
      studentHourlyRateCentsSnapshot: rate.studentHourlyRateCents,
      teacherHourlyWageCentsSnapshot: rate.teacherHourlyWageCents,
      currencySnapshot: rate.currency,
      createdByAdminId: admin.id,
    },
  });

  await prisma.session.upsert({
    where: { id: SEED_SESSION_2_ID },
    create: {
      id: SEED_SESSION_2_ID,
      teacherId: teacher.id,
      studentId: student.id,
      startAtUtc: session2Start,
      endAtUtc: session2End,
      classTimeZone: 'Australia/Sydney',
      status: SessionStatus.SCHEDULED,
      consumesUnits: 1,
      studentHourlyRateCentsSnapshot: rate.studentHourlyRateCents,
      teacherHourlyWageCentsSnapshot: rate.teacherHourlyWageCents,
      currencySnapshot: rate.currency,
      createdByAdminId: admin.id,
    },
    update: {
      teacherId: teacher.id,
      studentId: student.id,
      startAtUtc: session2Start,
      endAtUtc: session2End,
      classTimeZone: 'Australia/Sydney',
      status: SessionStatus.SCHEDULED,
      consumesUnits: 1,
      studentHourlyRateCentsSnapshot: rate.studentHourlyRateCents,
      teacherHourlyWageCentsSnapshot: rate.teacherHourlyWageCents,
      currencySnapshot: rate.currency,
      createdByAdminId: admin.id,
    },
  });

  // Payroll demo data: create COMPLETED sessions in the current Sydney week so teacher can see wages on /payroll.
  const payrollWeekStart = getSydneyWeekStartIsoDate(new Date());
  const monday = parseIsoDate(payrollWeekStart);
  const tuesday = parseIsoDate(isoDateAddDays(payrollWeekStart, 1));
  const wednesday = parseIsoDate(isoDateAddDays(payrollWeekStart, 2));
  const thursday = parseIsoDate(isoDateAddDays(payrollWeekStart, 3));

  const payroll1Start = zonedTimeToUtc({ ...monday, hour: 10, minute: 0, second: 0 }, PAYROLL_TIME_ZONE);
  const payroll1End = zonedTimeToUtc({ ...monday, hour: 11, minute: 30, second: 0 }, PAYROLL_TIME_ZONE);

  const payroll2Start = zonedTimeToUtc({ ...thursday, hour: 14, minute: 0, second: 0 }, PAYROLL_TIME_ZONE);
  const payroll2End = zonedTimeToUtc({ ...thursday, hour: 15, minute: 0, second: 0 }, PAYROLL_TIME_ZONE);

  const payroll3Start = zonedTimeToUtc({ ...tuesday, hour: 9, minute: 0, second: 0 }, PAYROLL_TIME_ZONE);
  const payroll3End = zonedTimeToUtc({ ...tuesday, hour: 10, minute: 0, second: 0 }, PAYROLL_TIME_ZONE);

  const student2PayrollStart = zonedTimeToUtc({ ...wednesday, hour: 18, minute: 0, second: 0 }, PAYROLL_TIME_ZONE);
  const student2PayrollEnd = zonedTimeToUtc({ ...wednesday, hour: 19, minute: 0, second: 0 }, PAYROLL_TIME_ZONE);

  await prisma.session.upsert({
    where: { id: SEED_SESSION_PAYROLL_1_ID },
    create: {
      id: SEED_SESSION_PAYROLL_1_ID,
      teacherId: teacher.id,
      studentId: student.id,
      startAtUtc: payroll1Start,
      endAtUtc: payroll1End,
      classTimeZone: PAYROLL_TIME_ZONE,
      status: SessionStatus.COMPLETED,
      consumesUnits: 1,
      studentHourlyRateCentsSnapshot: rate.studentHourlyRateCents,
      teacherHourlyWageCentsSnapshot: rate.teacherHourlyWageCents,
      currencySnapshot: rate.currency,
      createdByAdminId: admin.id,
    },
    update: {
      teacherId: teacher.id,
      studentId: student.id,
      startAtUtc: payroll1Start,
      endAtUtc: payroll1End,
      classTimeZone: PAYROLL_TIME_ZONE,
      status: SessionStatus.COMPLETED,
      consumesUnits: 1,
      studentHourlyRateCentsSnapshot: rate.studentHourlyRateCents,
      teacherHourlyWageCentsSnapshot: rate.teacherHourlyWageCents,
      currencySnapshot: rate.currency,
      createdByAdminId: admin.id,
    },
  });

  await prisma.session.upsert({
    where: { id: SEED_SESSION_PAYROLL_2_ID },
    create: {
      id: SEED_SESSION_PAYROLL_2_ID,
      teacherId: teacher.id,
      studentId: student.id,
      startAtUtc: payroll2Start,
      endAtUtc: payroll2End,
      classTimeZone: PAYROLL_TIME_ZONE,
      status: SessionStatus.COMPLETED,
      consumesUnits: 1,
      studentHourlyRateCentsSnapshot: rate.studentHourlyRateCents,
      teacherHourlyWageCentsSnapshot: rate.teacherHourlyWageCents,
      currencySnapshot: rate.currency,
      createdByAdminId: admin.id,
    },
    update: {
      teacherId: teacher.id,
      studentId: student.id,
      startAtUtc: payroll2Start,
      endAtUtc: payroll2End,
      classTimeZone: PAYROLL_TIME_ZONE,
      status: SessionStatus.COMPLETED,
      consumesUnits: 1,
      studentHourlyRateCentsSnapshot: rate.studentHourlyRateCents,
      teacherHourlyWageCentsSnapshot: rate.teacherHourlyWageCents,
      currencySnapshot: rate.currency,
      createdByAdminId: admin.id,
    },
  });

  // Extra COMPLETED session in the same Sydney week to make totals non-trivial (1h).
  await prisma.session.upsert({
    where: { id: `${SEED_SESSION_PAYROLL_2_ID}_extra` },
    create: {
      id: `${SEED_SESSION_PAYROLL_2_ID}_extra`,
      teacherId: teacher.id,
      studentId: student.id,
      startAtUtc: payroll3Start,
      endAtUtc: payroll3End,
      classTimeZone: PAYROLL_TIME_ZONE,
      status: SessionStatus.COMPLETED,
      consumesUnits: 1,
      studentHourlyRateCentsSnapshot: rate.studentHourlyRateCents,
      teacherHourlyWageCentsSnapshot: rate.teacherHourlyWageCents,
      currencySnapshot: rate.currency,
      createdByAdminId: admin.id,
    },
    update: {
      teacherId: teacher.id,
      studentId: student.id,
      startAtUtc: payroll3Start,
      endAtUtc: payroll3End,
      classTimeZone: PAYROLL_TIME_ZONE,
      status: SessionStatus.COMPLETED,
      consumesUnits: 1,
      studentHourlyRateCentsSnapshot: rate.studentHourlyRateCents,
      teacherHourlyWageCentsSnapshot: rate.teacherHourlyWageCents,
      currencySnapshot: rate.currency,
      createdByAdminId: admin.id,
    },
  });

  // A second student to demonstrate per-student breakdown in teacher payroll.
  await prisma.session.upsert({
    where: { id: SEED_SESSION_PAYROLL_STUDENT2_ID },
    create: {
      id: SEED_SESSION_PAYROLL_STUDENT2_ID,
      teacherId: teacher.id,
      studentId: student2.id,
      startAtUtc: student2PayrollStart,
      endAtUtc: student2PayrollEnd,
      classTimeZone: PAYROLL_TIME_ZONE,
      status: SessionStatus.COMPLETED,
      consumesUnits: 1,
      studentHourlyRateCentsSnapshot: rate2.studentHourlyRateCents,
      teacherHourlyWageCentsSnapshot: rate2.teacherHourlyWageCents,
      currencySnapshot: rate2.currency,
      createdByAdminId: admin.id,
    },
    update: {
      teacherId: teacher.id,
      studentId: student2.id,
      startAtUtc: student2PayrollStart,
      endAtUtc: student2PayrollEnd,
      classTimeZone: PAYROLL_TIME_ZONE,
      status: SessionStatus.COMPLETED,
      consumesUnits: 1,
      studentHourlyRateCentsSnapshot: rate2.studentHourlyRateCents,
      teacherHourlyWageCentsSnapshot: rate2.teacherHourlyWageCents,
      currencySnapshot: rate2.currency,
      createdByAdminId: admin.id,
    },
  });
}

try {
  await main();
} finally {
  await prisma.$disconnect();
}
