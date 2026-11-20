-- AlterTable
ALTER TABLE "Schedule" ADD COLUMN     "externalUuid" TEXT,
ADD COLUMN     "lang" TEXT NOT NULL DEFAULT 'ro',
ADD COLUMN     "mode" TEXT NOT NULL DEFAULT 'MANUAL',
ADD COLUMN     "payload" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN     "plannerUrl" TEXT;
