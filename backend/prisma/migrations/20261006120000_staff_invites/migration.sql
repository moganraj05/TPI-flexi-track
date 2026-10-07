-- AlterTable
ALTER TABLE "users" ADD COLUMN     "invited_at" TIMESTAMP(3),
ADD COLUMN     "must_set_password" BOOLEAN NOT NULL DEFAULT false;

