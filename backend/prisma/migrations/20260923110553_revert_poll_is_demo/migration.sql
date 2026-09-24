-- DropIndex
DROP INDEX "uniq_shift_poll";

-- AlterTable
ALTER TABLE "polls" DROP COLUMN "is_demo";

-- CreateIndex
CREATE UNIQUE INDEX "uniq_shift_poll" ON "polls"("department_id", "shift_start", "shift_end", "date");
