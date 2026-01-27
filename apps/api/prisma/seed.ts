import { PrismaClient, UserRole, Currency, SessionStatus, HourLedgerReason } from '@prisma/client';

import { hashPassword } from '../src/lib/password.js';

const prisma = new PrismaClient();

const SEED_ORG_ID = 'org_seed';
const SEED_ADMIN_ID = 'user_admin_seed';
const SEED_TEACHER_ID = 'user_teacher_seed';
const SEED_STUDENT_ID = 'user_student_seed';
const SEED_SESSION_1_ID = 'session_seed_1';
const SEED_SESSION_2_ID = 'session_seed_2';
const SEED_LEDGER_PURCHASE_ID = 'ledger_seed_purchase_10';

async function main() {
  const seedPasswordHash = hashPassword('password123');

  const org = await prisma.organization.upsert({
    where: { id: SEED_ORG_ID },
    create: { id: SEED_ORG_ID, name: 'Seed Organization' },
    update: { name: 'Seed Organization' },
  });

  const admin = await prisma.user.upsert({
    where: { id: SEED_ADMIN_ID },
    create: {
      id: SEED_ADMIN_ID,
      orgId: org.id,
      email: 'admin@example.com',
      passwordHash: seedPasswordHash,
      role: UserRole.ADMIN,
    },
    update: {
      orgId: org.id,
      email: 'admin@example.com',
      passwordHash: seedPasswordHash,
      role: UserRole.ADMIN,
    },
  });

  const teacher = await prisma.user.upsert({
    where: { id: SEED_TEACHER_ID },
    create: {
      id: SEED_TEACHER_ID,
      orgId: org.id,
      email: 'teacher@example.com',
      passwordHash: seedPasswordHash,
      role: UserRole.TEACHER,
      teacherProfile: {
        create: { displayName: 'Seed Teacher', timeZone: 'Australia/Sydney' },
      },
    },
    update: {
      orgId: org.id,
      email: 'teacher@example.com',
      passwordHash: seedPasswordHash,
      role: UserRole.TEACHER,
      teacherProfile: {
        upsert: {
          create: { displayName: 'Seed Teacher', timeZone: 'Australia/Sydney' },
          update: { displayName: 'Seed Teacher', timeZone: 'Australia/Sydney' },
        },
      },
    },
  });

  const student = await prisma.user.upsert({
    where: { id: SEED_STUDENT_ID },
    create: {
      id: SEED_STUDENT_ID,
      orgId: org.id,
      email: 'student@example.com',
      passwordHash: seedPasswordHash,
      role: UserRole.STUDENT,
      studentProfile: {
        create: { displayName: 'Seed Student', timeZone: 'Asia/Shanghai' },
      },
    },
    update: {
      orgId: org.id,
      email: 'student@example.com',
      passwordHash: seedPasswordHash,
      role: UserRole.STUDENT,
      studentProfile: {
        upsert: {
          create: { displayName: 'Seed Student', timeZone: 'Asia/Shanghai' },
          update: { displayName: 'Seed Student', timeZone: 'Asia/Shanghai' },
        },
      },
    },
  });

  const rate = await prisma.teacherStudentRate.upsert({
    where: {
      teacherId_studentId: {
        teacherId: teacher.id,
        studentId: student.id,
      },
    },
    create: {
      teacherId: teacher.id,
      studentId: student.id,
      hourlyRateCents: 10000,
      currency: Currency.AUD,
    },
    update: {
      hourlyRateCents: 10000,
      currency: Currency.AUD,
    },
  });

  await prisma.hourLedgerEntry.upsert({
    where: { id: SEED_LEDGER_PURCHASE_ID },
    create: {
      id: SEED_LEDGER_PURCHASE_ID,
      studentId: student.id,
      deltaUnits: 10,
      reason: HourLedgerReason.PURCHASE,
    },
    update: {
      studentId: student.id,
      deltaUnits: 10,
      reason: HourLedgerReason.PURCHASE,
    },
  });

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
      rateCentsSnapshot: rate.hourlyRateCents,
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
      rateCentsSnapshot: rate.hourlyRateCents,
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
      rateCentsSnapshot: rate.hourlyRateCents,
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
      rateCentsSnapshot: rate.hourlyRateCents,
      currencySnapshot: rate.currency,
      createdByAdminId: admin.id,
    },
  });
}

try {
  await main();
} finally {
  await prisma.$disconnect();
}
