-- Phase 1B.1: additive operational hardening. Existing business rows are untouched.
ALTER TABLE "ProviderEvent"
  ADD COLUMN "retentionUntil" TIMESTAMP(3);

ALTER TABLE "OutboxEvent"
  ADD COLUMN "targetQueue" TEXT NOT NULL DEFAULT 'provider-events',
  ADD COLUMN "lockedBy" TEXT,
  ADD COLUMN "lockedUntil" TIMESTAMP(3),
  ADD COLUMN "lastAttemptAt" TIMESTAMP(3),
  ADD COLUMN "deadLetteredAt" TIMESTAMP(3),
  ADD COLUMN "deadLetterPublishedAt" TIMESTAMP(3),
  ADD COLUMN "maxAttempts" INTEGER NOT NULL DEFAULT 5;

CREATE INDEX "ProviderEvent_retentionUntil_idx" ON "ProviderEvent"("retentionUntil");
CREATE INDEX "OutboxEvent_status_lockedUntil_idx" ON "OutboxEvent"("status", "lockedUntil");
