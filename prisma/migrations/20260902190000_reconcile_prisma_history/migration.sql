-- Phase 1A: reconcile the versioned history with the already-existing catalog.
-- Safety contract: no DROP TABLE, DROP COLUMN, DELETE, TRUNCATE, row rewrite, or
-- backfill is performed. Every create/add is replay-safe against the restored
-- production catalog and against a database built from the three older migrations.

-- Historical databases created only from the first migration have a required
-- Lead.stageId column. Keep the compatibility column, but make it nullable so the
-- current PipelineEntry-based write path is not blocked. Existing values are kept.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'Lead'
      AND column_name = 'stageId'
      AND is_nullable = 'NO'
  ) THEN
    ALTER TABLE "Lead" ALTER COLUMN "stageId" DROP NOT NULL;
  END IF;
END $$;

ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "resetToken" TEXT,
  ADD COLUMN IF NOT EXISTS "resetTokenExpires" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "lgpdAccepted" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "lgpdAcceptedAt" TIMESTAMP(3);

ALTER TABLE "Project"
  ADD COLUMN IF NOT EXISTS "lastAssignedCommercialId" TEXT,
  ADD COLUMN IF NOT EXISTS "apiKeyHash" TEXT,
  ADD COLUMN IF NOT EXISTS "apiKeyPrefix" TEXT;

ALTER TABLE "Membership"
  ADD COLUMN IF NOT EXISTS "isDesignatedCommercial" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "Lead"
  ADD COLUMN IF NOT EXISTS "assignedUserId" TEXT,
  ADD COLUMN IF NOT EXISTS "utmSource" TEXT,
  ADD COLUMN IF NOT EXISTS "utmMedium" TEXT,
  ADD COLUMN IF NOT EXISTS "utmCampaign" TEXT,
  ADD COLUMN IF NOT EXISTS "utmContent" TEXT,
  ADD COLUMN IF NOT EXISTS "utmTerm" TEXT,
  ADD COLUMN IF NOT EXISTS "referrer" TEXT,
  ADD COLUMN IF NOT EXISTS "landingPage" TEXT;

ALTER TABLE "Task"
  ADD COLUMN IF NOT EXISTS "userId" TEXT,
  ADD COLUMN IF NOT EXISTS "googleEventId" TEXT,
  ADD COLUMN IF NOT EXISTS "microsoftEventId" TEXT;

ALTER TABLE "Stage" ALTER COLUMN "color" SET DEFAULT '#9FE870';
ALTER TABLE "Tag" ALTER COLUMN "color" SET DEFAULT '#9FE870';

-- These defaults were introduced by the historical additive migration only to
-- make its backfill safe. Prisma now owns updatedAt on writes.
ALTER TABLE "CustomFieldDefinition" ALTER COLUMN "updatedAt" DROP DEFAULT;
ALTER TABLE "WebhookEndpoint" ALTER COLUMN "updatedAt" DROP DEFAULT;

CREATE TABLE IF NOT EXISTS "PipelineEntry" (
  "id" TEXT NOT NULL,
  "leadId" TEXT NOT NULL,
  "pipelineId" TEXT NOT NULL,
  "stageId" TEXT NOT NULL,
  "value" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "lostStatusId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PipelineEntry_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "Form" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "token" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "pipelineId" TEXT NOT NULL,
  "stageId" TEXT NOT NULL,
  "originId" TEXT,
  "successMessage" TEXT NOT NULL DEFAULT 'Formulário enviado com sucesso!',
  "redirectUrl" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Form_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "FormField" (
  "id" TEXT NOT NULL,
  "formId" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "fieldName" TEXT NOT NULL,
  "customFieldDefinitionId" TEXT,
  "label" TEXT NOT NULL,
  "required" BOOLEAN NOT NULL DEFAULT false,
  "order" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "FormField_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "CalendarIntegration" (
  "id" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "accessToken" TEXT NOT NULL,
  "refreshToken" TEXT,
  "expiresAt" TIMESTAMP(3),
  "email" TEXT,
  "userId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CalendarIntegration_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "PipelineEntry_leadId_pipelineId_key"
  ON "PipelineEntry"("leadId", "pipelineId");
CREATE UNIQUE INDEX IF NOT EXISTS "Form_token_key" ON "Form"("token");
CREATE UNIQUE INDEX IF NOT EXISTS "CalendarIntegration_userId_provider_key"
  ON "CalendarIntegration"("userId", "provider");
CREATE UNIQUE INDEX IF NOT EXISTS "Project_apiKeyPrefix_key" ON "Project"("apiKeyPrefix");
CREATE UNIQUE INDEX IF NOT EXISTS "User_resetToken_key" ON "User"("resetToken");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Lead_assignedUserId_fkey') THEN
    ALTER TABLE "Lead" ADD CONSTRAINT "Lead_assignedUserId_fkey"
      FOREIGN KEY ("assignedUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PipelineEntry_leadId_fkey') THEN
    ALTER TABLE "PipelineEntry" ADD CONSTRAINT "PipelineEntry_leadId_fkey"
      FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PipelineEntry_pipelineId_fkey') THEN
    ALTER TABLE "PipelineEntry" ADD CONSTRAINT "PipelineEntry_pipelineId_fkey"
      FOREIGN KEY ("pipelineId") REFERENCES "Pipeline"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PipelineEntry_stageId_fkey') THEN
    ALTER TABLE "PipelineEntry" ADD CONSTRAINT "PipelineEntry_stageId_fkey"
      FOREIGN KEY ("stageId") REFERENCES "Stage"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PipelineEntry_lostStatusId_fkey') THEN
    ALTER TABLE "PipelineEntry" ADD CONSTRAINT "PipelineEntry_lostStatusId_fkey"
      FOREIGN KEY ("lostStatusId") REFERENCES "LostStatus"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Task_userId_fkey') THEN
    ALTER TABLE "Task" ADD CONSTRAINT "Task_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Form_projectId_fkey') THEN
    ALTER TABLE "Form" ADD CONSTRAINT "Form_projectId_fkey"
      FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Form_pipelineId_fkey') THEN
    ALTER TABLE "Form" ADD CONSTRAINT "Form_pipelineId_fkey"
      FOREIGN KEY ("pipelineId") REFERENCES "Pipeline"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Form_stageId_fkey') THEN
    ALTER TABLE "Form" ADD CONSTRAINT "Form_stageId_fkey"
      FOREIGN KEY ("stageId") REFERENCES "Stage"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Form_originId_fkey') THEN
    ALTER TABLE "Form" ADD CONSTRAINT "Form_originId_fkey"
      FOREIGN KEY ("originId") REFERENCES "Origin"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FormField_formId_fkey') THEN
    ALTER TABLE "FormField" ADD CONSTRAINT "FormField_formId_fkey"
      FOREIGN KEY ("formId") REFERENCES "Form"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FormField_customFieldDefinitionId_fkey') THEN
    ALTER TABLE "FormField" ADD CONSTRAINT "FormField_customFieldDefinitionId_fkey"
      FOREIGN KEY ("customFieldDefinitionId") REFERENCES "CustomFieldDefinition"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CalendarIntegration_userId_fkey') THEN
    ALTER TABLE "CalendarIntegration" ADD CONSTRAINT "CalendarIntegration_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
