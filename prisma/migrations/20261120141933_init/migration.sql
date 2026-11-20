-- CreateEnum
CREATE TYPE "StoryStatus" AS ENUM ('NEW', 'SCRIPT_DRAFT', 'SCRIPT_REVIEW', 'VIDEO_DRAFT', 'VIDEO_REVIEW', 'VOICE_DRAFT', 'VOICE_REVIEW', 'FINAL_RENDER', 'FINAL_REVIEW', 'SOCIAL_DRAFT', 'SOCIAL_REVIEW', 'SCHEDULED', 'PUBLISHED', 'REJECTED');

-- CreateEnum
CREATE TYPE "Stage" AS ENUM ('SCRIPT', 'VIDEO', 'VOICE', 'FINAL', 'SOCIAL');

-- CreateEnum
CREATE TYPE "Decision" AS ENUM ('APPROVED', 'CHANGES_REQUESTED', 'REJECTED');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'WAITING_LIMIT');

-- CreateEnum
CREATE TYPE "IntegrationType" AS ENUM ('METRICOOL', 'SPEKO', 'TTS_ALT', 'SMTP');

-- CreateEnum
CREATE TYPE "IntegrationStatus" AS ENUM ('UNTESTED', 'OK', 'EXPIRED', 'ERROR');

-- CreateTable
CREATE TABLE "Book" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "author" TEXT NOT NULL,
    "skillName" TEXT NOT NULL DEFAULT 'istorioare-episod-v2',
    "attributionRo" TEXT NOT NULL DEFAULT 'După o istorioară de {author} · Istorioara nr. {number} «{title}» · {book}',
    "attributionEn" TEXT NOT NULL DEFAULT 'Based on a story by {author} · Story no. {number} “{title}” · {book}',
    "animationProvider" TEXT NOT NULL DEFAULT 'trifa-v2',
    "ttsProvider" TEXT NOT NULL DEFAULT 'speko',
    "sourceFileKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Book_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Story" (
    "id" TEXT NOT NULL,
    "bookId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "sourceReference" TEXT NOT NULL,
    "status" "StoryStatus" NOT NULL DEFAULT 'NEW',
    "position" INTEGER NOT NULL,
    "excluded" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Story_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Version" (
    "id" TEXT NOT NULL,
    "storyId" TEXT NOT NULL,
    "stage" "Stage" NOT NULL,
    "number" INTEGER NOT NULL,
    "payload" JSONB NOT NULL,
    "files" JSONB NOT NULL DEFAULT '[]',
    "inputFeedback" TEXT,
    "parentVersionId" TEXT,
    "decision" "Decision",
    "decisionComment" TEXT,
    "decidedAt" TIMESTAMP(3),
    "jobId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Version_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Job" (
    "id" TEXT NOT NULL,
    "storyId" TEXT,
    "kind" TEXT NOT NULL,
    "stage" "Stage",
    "status" "JobStatus" NOT NULL DEFAULT 'QUEUED',
    "input" JSONB NOT NULL DEFAULT '{}',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "runAfter" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lockedBy" TEXT,
    "lockedAt" TIMESTAMP(3),
    "logs" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "Job_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Run" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "agent" TEXT NOT NULL,
    "model" TEXT,
    "effort" TEXT,
    "attempt" INTEGER NOT NULL DEFAULT 1,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "cacheReadTokens" INTEGER NOT NULL DEFAULT 0,
    "cacheCreationTokens" INTEGER NOT NULL DEFAULT 0,
    "costUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "modelUsage" JSONB,
    "durationMs" INTEGER NOT NULL DEFAULT 0,
    "durationApiMs" INTEGER,
    "numTurns" INTEGER,
    "exitCode" INTEGER,
    "sessionId" TEXT,
    "outputValid" BOOLEAN NOT NULL DEFAULT false,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Run_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Channel" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "language" TEXT NOT NULL,
    "metricoolBrandId" TEXT,
    "platforms" TEXT[],
    "timezone" TEXT NOT NULL DEFAULT 'Europe/Bucharest',
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Channel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Integration" (
    "id" TEXT NOT NULL,
    "type" "IntegrationType" NOT NULL,
    "tokenEnc" TEXT,
    "config" JSONB NOT NULL DEFAULT '{}',
    "status" "IntegrationStatus" NOT NULL DEFAULT 'UNTESTED',
    "lastChecked" TIMESTAMP(3),
    "lastError" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Integration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Schedule" (
    "id" TEXT NOT NULL,
    "storyId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "versionId" TEXT,
    "platform" TEXT NOT NULL,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "externalId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Schedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExternalCost" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "storyId" TEXT,
    "amountUsd" DOUBLE PRECISION NOT NULL,
    "units" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExternalCost_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Settings" (
    "id" TEXT NOT NULL DEFAULT 'global',
    "rhythm" JSONB NOT NULL DEFAULT '{"storiesPerWeek":1,"days":[2],"hour":"09:00","timezone":"Europe/Bucharest"}',
    "template" JSONB NOT NULL DEFAULT '{}',
    "thresholds" JSONB NOT NULL DEFAULT '{"weeklyCostUsd":50,"monthlyCostUsd":200}',
    "notifyEmail" TEXT,

    CONSTRAINT "Settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Story_status_idx" ON "Story"("status");

-- CreateIndex
CREATE INDEX "Story_position_idx" ON "Story"("position");

-- CreateIndex
CREATE UNIQUE INDEX "Story_bookId_number_key" ON "Story"("bookId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "Version_storyId_stage_number_key" ON "Version"("storyId", "stage", "number");

-- CreateIndex
CREATE INDEX "Job_status_runAfter_idx" ON "Job"("status", "runAfter");

-- CreateIndex
CREATE INDEX "Run_agent_createdAt_idx" ON "Run"("agent", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Integration_type_key" ON "Integration"("type");

-- CreateIndex
CREATE INDEX "Schedule_scheduledAt_idx" ON "Schedule"("scheduledAt");

-- AddForeignKey
ALTER TABLE "Story" ADD CONSTRAINT "Story_bookId_fkey" FOREIGN KEY ("bookId") REFERENCES "Book"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Version" ADD CONSTRAINT "Version_storyId_fkey" FOREIGN KEY ("storyId") REFERENCES "Story"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Job" ADD CONSTRAINT "Job_storyId_fkey" FOREIGN KEY ("storyId") REFERENCES "Story"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Run" ADD CONSTRAINT "Run_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Schedule" ADD CONSTRAINT "Schedule_storyId_fkey" FOREIGN KEY ("storyId") REFERENCES "Story"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Schedule" ADD CONSTRAINT "Schedule_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "Channel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExternalCost" ADD CONSTRAINT "ExternalCost_storyId_fkey" FOREIGN KEY ("storyId") REFERENCES "Story"("id") ON DELETE SET NULL ON UPDATE CASCADE;
