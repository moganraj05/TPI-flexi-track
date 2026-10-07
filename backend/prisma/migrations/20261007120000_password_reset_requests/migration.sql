-- CreateEnum
CREATE TYPE "ResetRequestStatus" AS ENUM ('pending', 'approved', 'rejected', 'expired', 'cancelled');

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "last_login_at" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "password_reset_requests" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "department_id" UUID,
    "routed_to_id" UUID,
    "status" "ResetRequestStatus" NOT NULL DEFAULT 'pending',
    "request_count" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_requested_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "notified_at" TIMESTAMP(3),
    "request_ip" TEXT,
    "user_agent" TEXT,
    "handled_by_id" UUID,
    "handled_by_name" TEXT,
    "handled_at" TIMESTAMP(3),
    "reject_reason" TEXT,
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "password_reset_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "password_reset_requests_user_id_status_idx" ON "password_reset_requests"("user_id", "status");

-- CreateIndex
CREATE INDEX "password_reset_requests_department_id_status_idx" ON "password_reset_requests"("department_id", "status");

-- CreateIndex
CREATE INDEX "password_reset_requests_routed_to_id_status_idx" ON "password_reset_requests"("routed_to_id", "status");

-- AddForeignKey
ALTER TABLE "password_reset_requests" ADD CONSTRAINT "password_reset_requests_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

