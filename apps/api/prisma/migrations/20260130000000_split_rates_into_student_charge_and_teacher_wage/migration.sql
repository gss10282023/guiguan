-- Split TeacherStudentRate hourlyRateCents into student charge + teacher wage.
ALTER TABLE "TeacherStudentRate" RENAME COLUMN "hourlyRateCents" TO "teacherHourlyWageCents";
ALTER TABLE "TeacherStudentRate" ADD COLUMN "studentHourlyRateCents" INTEGER NOT NULL DEFAULT 0;
UPDATE "TeacherStudentRate" SET "studentHourlyRateCents" = "teacherHourlyWageCents";
ALTER TABLE "TeacherStudentRate" ALTER COLUMN "studentHourlyRateCents" DROP DEFAULT;

-- Snapshot both student charge and teacher wage on Session.
ALTER TABLE "Session" RENAME COLUMN "rateCentsSnapshot" TO "teacherHourlyWageCentsSnapshot";
ALTER TABLE "Session" ADD COLUMN "studentHourlyRateCentsSnapshot" INTEGER NOT NULL DEFAULT 0;
UPDATE "Session" SET "studentHourlyRateCentsSnapshot" = "teacherHourlyWageCentsSnapshot";
ALTER TABLE "Session" ALTER COLUMN "studentHourlyRateCentsSnapshot" DROP DEFAULT;
