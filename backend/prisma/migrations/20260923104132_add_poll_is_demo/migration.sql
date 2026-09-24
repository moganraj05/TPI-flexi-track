-- DropIndex
DROP INDEX "uniq_shift_poll";

-- AlterTable
ALTER TABLE "polls" ADD COLUMN     "is_demo" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE UNIQUE INDEX "uniq_shift_poll" ON "polls"("department_id", "shift_start", "shift_end", "date", "is_demo");
