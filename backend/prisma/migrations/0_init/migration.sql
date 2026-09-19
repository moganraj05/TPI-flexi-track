-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('worker', 'incharge', 'supervisor', 'admin', 'superadmin', 'hr');

-- CreateEnum
CREATE TYPE "PollStatus" AS ENUM ('open', 'closed');

-- CreateEnum
CREATE TYPE "ResponseAnswer" AS ENUM ('yes', 'no');

-- CreateEnum
CREATE TYPE "FollowUpStatus" AS ENUM ('pending', 'contacted', 'confirmed_coming', 'confirmed_not_coming');

-- CreateTable
CREATE TABLE "departments" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "departments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "employee_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "password" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'worker',
    "department_id" UUID,
    "incharge_id" UUID,
    "shift_start" TEXT,
    "shift_end" TEXT,
    "shift_name" TEXT,
    "equipment" TEXT,
    "process" TEXT,
    "push_token" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "token_version" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "polls" (
    "id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "department_id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "shift" TEXT NOT NULL DEFAULT 'general',
    "shift_start" TEXT,
    "shift_end" TEXT,
    "status" "PollStatus" NOT NULL DEFAULT 'open',
    "opens_at" TIMESTAMP(3) NOT NULL,
    "closes_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,
    "auto_created" BOOLEAN NOT NULL DEFAULT true,
    "send_reminder" BOOLEAN NOT NULL DEFAULT true,
    "reminder_minutes_before" INTEGER NOT NULL DEFAULT 30,
    "reminder_sent_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "polls_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "responses" (
    "id" UUID NOT NULL,
    "poll_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "answer" "ResponseAnswer" NOT NULL,
    "answered_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "responses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "followups" (
    "id" UUID NOT NULL,
    "worker_id" UUID NOT NULL,
    "poll_id" UUID NOT NULL,
    "status" "FollowUpStatus" NOT NULL DEFAULT 'pending',
    "note" TEXT,
    "updated_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "followups_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "departments_code_key" ON "departments"("code");

-- CreateIndex
CREATE UNIQUE INDEX "users_employee_id_key" ON "users"("employee_id");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "polls_status_closes_at_idx" ON "polls"("status", "closes_at");

-- CreateIndex
CREATE UNIQUE INDEX "uniq_shift_poll" ON "polls"("department_id", "shift_start", "shift_end", "date");

-- CreateIndex
CREATE INDEX "responses_user_id_answered_at_idx" ON "responses"("user_id", "answered_at");

-- CreateIndex
CREATE UNIQUE INDEX "responses_poll_id_user_id_key" ON "responses"("poll_id", "user_id");

-- CreateIndex
CREATE INDEX "followups_poll_id_idx" ON "followups"("poll_id");

-- CreateIndex
CREATE UNIQUE INDEX "followups_worker_id_poll_id_key" ON "followups"("worker_id", "poll_id");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_incharge_id_fkey" FOREIGN KEY ("incharge_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "polls" ADD CONSTRAINT "polls_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "polls" ADD CONSTRAINT "polls_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "responses" ADD CONSTRAINT "responses_poll_id_fkey" FOREIGN KEY ("poll_id") REFERENCES "polls"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "responses" ADD CONSTRAINT "responses_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "followups" ADD CONSTRAINT "followups_worker_id_fkey" FOREIGN KEY ("worker_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "followups" ADD CONSTRAINT "followups_poll_id_fkey" FOREIGN KEY ("poll_id") REFERENCES "polls"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "followups" ADD CONSTRAINT "followups_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

