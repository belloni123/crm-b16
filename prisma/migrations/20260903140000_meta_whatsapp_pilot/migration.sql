-- Fase 2A: additive Meta WhatsApp pilot foundation. CRM business records are untouched.
-- Meta conversations have no legacy Evolution instance; relaxing NOT NULL preserves the RESTRICT FK for legacy rows.
ALTER TABLE "Conversation" ALTER COLUMN "instanceId" DROP NOT NULL;
CREATE TABLE "MetaOnboardingSession" (
  "id" TEXT NOT NULL, "projectId" TEXT NOT NULL, "userId" TEXT NOT NULL,
  "channelConnectionId" TEXT, "stateHash" TEXT NOT NULL, "nonceHash" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING', "expiresAt" TIMESTAMP(3) NOT NULL,
  "usedAt" TIMESTAMP(3), "errorCode" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MetaOnboardingSession_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "ChannelTemplate" (
  "id" TEXT NOT NULL, "projectId" TEXT NOT NULL, "channelConnectionId" TEXT NOT NULL,
  "providerTemplateId" TEXT, "name" TEXT NOT NULL, "language" TEXT NOT NULL,
  "category" TEXT NOT NULL, "status" TEXT NOT NULL, "componentsJson" TEXT NOT NULL,
  "componentsHash" TEXT NOT NULL, "lastSyncedAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ChannelTemplate_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "MessageDeliveryEvent" (
  "id" TEXT NOT NULL, "projectId" TEXT NOT NULL, "messageId" TEXT,
  "channelConnectionId" TEXT NOT NULL, "providerMessageId" TEXT NOT NULL,
  "providerStatus" TEXT NOT NULL, "providerTimestamp" TIMESTAMP(3),
  "externalEventKey" TEXT NOT NULL, "errorCode" TEXT, "metadataRedacted" TEXT,
  "appliedAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MessageDeliveryEvent_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "DataDeletionRequest" (
  "id" TEXT NOT NULL, "requesterEncrypted" TEXT NOT NULL, "requesterHash" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'RECEIVED', "source" TEXT NOT NULL DEFAULT 'PUBLIC_FORM',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "resolvedAt" TIMESTAMP(3),
  CONSTRAINT "DataDeletionRequest_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "MetaOnboardingSession_projectId_userId_status_expiresAt_idx" ON "MetaOnboardingSession"("projectId", "userId", "status", "expiresAt");
CREATE INDEX "MetaOnboardingSession_expiresAt_idx" ON "MetaOnboardingSession"("expiresAt");
CREATE UNIQUE INDEX "ChannelTemplate_channelConnectionId_name_language_key" ON "ChannelTemplate"("channelConnectionId", "name", "language");
CREATE INDEX "ChannelTemplate_projectId_status_name_idx" ON "ChannelTemplate"("projectId", "status", "name");
CREATE UNIQUE INDEX "MessageDeliveryEvent_channelConnectionId_externalEventKey_key" ON "MessageDeliveryEvent"("channelConnectionId", "externalEventKey");
CREATE INDEX "MDE_connection_provider_created_idx" ON "MessageDeliveryEvent"("channelConnectionId", "providerMessageId", "createdAt");
CREATE INDEX "MessageDeliveryEvent_projectId_messageId_createdAt_idx" ON "MessageDeliveryEvent"("projectId", "messageId", "createdAt");
CREATE INDEX "DataDeletionRequest_requesterHash_createdAt_idx" ON "DataDeletionRequest"("requesterHash", "createdAt");
CREATE INDEX "DataDeletionRequest_status_createdAt_idx" ON "DataDeletionRequest"("status", "createdAt");
ALTER TABLE "MetaOnboardingSession" ADD CONSTRAINT "MetaOnboardingSession_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MetaOnboardingSession" ADD CONSTRAINT "MetaOnboardingSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MetaOnboardingSession" ADD CONSTRAINT "MetaOnboardingSession_channelConnectionId_fkey" FOREIGN KEY ("channelConnectionId") REFERENCES "ChannelConnection"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ChannelTemplate" ADD CONSTRAINT "ChannelTemplate_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ChannelTemplate" ADD CONSTRAINT "ChannelTemplate_channelConnectionId_fkey" FOREIGN KEY ("channelConnectionId") REFERENCES "ChannelConnection"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MessageDeliveryEvent" ADD CONSTRAINT "MessageDeliveryEvent_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MessageDeliveryEvent" ADD CONSTRAINT "MessageDeliveryEvent_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "MessageDeliveryEvent" ADD CONSTRAINT "MessageDeliveryEvent_channelConnectionId_fkey" FOREIGN KEY ("channelConnectionId") REFERENCES "ChannelConnection"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
