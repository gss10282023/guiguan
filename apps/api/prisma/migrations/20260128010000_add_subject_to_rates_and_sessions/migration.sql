-- CreateEnum
CREATE TYPE "Subject" AS ENUM ('GENERAL', 'ENGLISH', 'MATH', 'CHINESE');

-- AlterTable
ALTER TABLE "TeacherStudentRate" ADD COLUMN "subject" "Subject" NOT NULL DEFAULT 'GENERAL';

-- DropIndex
DROP INDEX "TeacherStudentRate_teacherId_studentId_key";

-- CreateIndex
CREATE UNIQUE INDEX "TeacherStudentRate_teacherId_studentId_subject_key" ON "TeacherStudentRate"("teacherId", "studentId", "subject");

-- CreateIndex
CREATE INDEX "TeacherStudentRate_subject_idx" ON "TeacherStudentRate"("subject");

-- AlterTable
ALTER TABLE "Session" ADD COLUMN "subject" "Subject" NOT NULL DEFAULT 'GENERAL';

