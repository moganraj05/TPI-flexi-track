-- CreateEnum
CREATE TYPE "ResetRequestLevel" AS ENUM ('incharge', 'supervisor', 'staff');

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "password_changed_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "password_reset_requests" ADD COLUMN     "escalated_at" TIMESTAMP(3),
ADD COLUMN     "level" "ResetRequestLevel" NOT NULL DEFAULT 'incharge';

-- Existing requests that went to the plant's supervisors
UPDATE "password_reset_requests" SET "level" = 'supervisor' WHERE "routed_to_id" IS NULL;

-- CreateIndex
CREATE INDEX "password_reset_requests_status_level_idx" ON "password_reset_requests"("status", "level");
