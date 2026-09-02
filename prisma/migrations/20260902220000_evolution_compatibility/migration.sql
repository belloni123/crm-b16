-- Phase 1C: Evolution compatibility metadata and resumable checkpointing.
ALTER TABLE "WhatsAppInstance" ADD COLUMN "archivedAt" TIMESTAMP(3);

ALTER TABLE "ChannelConnection" ADD COLUMN "legacyWhatsAppInstanceId" TEXT;

CREATE TABLE "BackfillCheckpoint" (
  "id" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "cursor" TEXT,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "countsJson" TEXT,
  "conflictsJson" TEXT,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "completedAt" TIMESTAMP(3),
  CONSTRAINT "BackfillCheckpoint_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BackfillCheckpoint_key_key" ON "BackfillCheckpoint"("key");
CREATE UNIQUE INDEX "ChannelConnection_legacyWhatsAppInstanceId_key" ON "ChannelConnection"("legacyWhatsAppInstanceId");

ALTER TABLE "ChannelConnection"
  ADD CONSTRAINT "ChannelConnection_legacyWhatsAppInstanceId_fkey"
  FOREIGN KEY ("legacyWhatsAppInstanceId") REFERENCES "WhatsAppInstance"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- History must never cascade when a legacy instance is removed directly.
ALTER TABLE "Conversation" DROP CONSTRAINT "Conversation_instanceId_fkey";
ALTER TABLE "Conversation"
  ADD CONSTRAINT "Conversation_instanceId_fkey"
  FOREIGN KEY ("instanceId") REFERENCES "WhatsAppInstance"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
