-- AlterTable
ALTER TABLE "HourLedgerEntry" ADD COLUMN "teacherId" TEXT;

-- CreateIndex
CREATE INDEX "HourLedgerEntry_teacherId_idx" ON "HourLedgerEntry"("teacherId");

-- AddForeignKey
ALTER TABLE "HourLedgerEntry"
ADD CONSTRAINT "HourLedgerEntry_teacherId_fkey"
FOREIGN KEY ("teacherId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

