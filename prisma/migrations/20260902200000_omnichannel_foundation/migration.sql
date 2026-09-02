-- Phase 1B: additive omnichannel foundation. No existing row is rewritten.
ALTER TABLE "Conversation" ADD COLUMN "assignedUserId" TEXT,
ADD COLUMN "channel" TEXT,
ADD COLUMN "channelConnectionId" TEXT,
ADD COLUMN "contactIdentityId" TEXT,
ADD COLUMN "customerCareWindowEndsAt" TIMESTAMP(3),
ADD COLUMN "externalConversationId" TEXT,
ADD COLUMN "lastInboundAt" TIMESTAMP(3),
ADD COLUMN "lastOutboundAt" TIMESTAMP(3),
ADD COLUMN "projectId" TEXT,
ADD COLUMN "status" TEXT,
ADD COLUMN "updatedAt" TIMESTAMP(3);

ALTER TABLE "Message" ADD COLUMN "acceptedAt" TIMESTAMP(3),
ADD COLUMN "channelConnectionId" TEXT,
ADD COLUMN "deliveredAt" TIMESTAMP(3),
ADD COLUMN "errorCode" TEXT,
ADD COLUMN "errorDetailRedacted" TEXT,
ADD COLUMN "failedAt" TIMESTAMP(3),
ADD COLUMN "idempotencyKey" TEXT,
ADD COLUMN "mediaObjectId" TEXT,
ADD COLUMN "metadata" TEXT,
ADD COLUMN "projectId" TEXT,
ADD COLUMN "providerMessageId" TEXT,
ADD COLUMN "readAt" TIMESTAMP(3),
ADD COLUMN "replyToMessageId" TEXT,
ADD COLUMN "sentAt" TIMESTAMP(3),
ADD COLUMN "updatedAt" TIMESTAMP(3);

CREATE TABLE "ChannelConnection" (
  "id" TEXT NOT NULL, "projectId" TEXT NOT NULL, "provider" TEXT NOT NULL,
  "channel" TEXT NOT NULL, "name" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'DISABLED', "externalBusinessId" TEXT,
  "externalWabaId" TEXT, "externalPhoneNumberId" TEXT, "externalPageId" TEXT,
  "externalInstagramAccountId" TEXT, "credentialsEncrypted" TEXT,
  "credentialsKeyId" TEXT, "tokenExpiresAt" TIMESTAMP(3),
  "capabilitiesSnapshot" TEXT, "metadata" TEXT, "lastHealthAt" TIMESTAMP(3),
  "lastErrorCode" TEXT, "isActive" BOOLEAN NOT NULL DEFAULT false,
  "archivedAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ChannelConnection_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ContactIdentity" (
  "id" TEXT NOT NULL, "projectId" TEXT NOT NULL, "channelConnectionId" TEXT NOT NULL,
  "channel" TEXT NOT NULL, "externalUserId" TEXT NOT NULL, "address" TEXT,
  "normalizedAddress" TEXT, "displayName" TEXT, "avatarUrl" TEXT, "leadId" TEXT,
  "lastInboundAt" TIMESTAMP(3), "lastOutboundAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ContactIdentity_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ProviderEvent" (
  "id" TEXT NOT NULL, "projectId" TEXT NOT NULL, "channelConnectionId" TEXT NOT NULL,
  "provider" TEXT NOT NULL, "externalEventKey" TEXT NOT NULL, "eventType" TEXT NOT NULL,
  "payloadHash" TEXT NOT NULL, "payloadEncrypted" TEXT, "status" TEXT NOT NULL DEFAULT 'RECEIVED',
  "attempts" INTEGER NOT NULL DEFAULT 0, "occurredAt" TIMESTAMP(3),
  "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "processedAt" TIMESTAMP(3),
  "lastErrorCode" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ProviderEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "OutboxEvent" (
  "id" TEXT NOT NULL, "projectId" TEXT NOT NULL, "aggregateType" TEXT NOT NULL,
  "aggregateId" TEXT NOT NULL, "eventType" TEXT NOT NULL, "payload" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL, "status" TEXT NOT NULL DEFAULT 'PENDING',
  "attempts" INTEGER NOT NULL DEFAULT 0, "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lockedAt" TIMESTAMP(3), "publishedAt" TIMESTAMP(3), "lastErrorCode" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "OutboxEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MediaObject" (
  "id" TEXT NOT NULL, "projectId" TEXT NOT NULL, "storageKey" TEXT NOT NULL,
  "bucket" TEXT NOT NULL, "contentType" TEXT NOT NULL, "sizeBytes" BIGINT NOT NULL,
  "checksum" TEXT NOT NULL, "scanStatus" TEXT NOT NULL DEFAULT 'PENDING',
  "providerMediaId" TEXT, "retentionUntil" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MediaObject_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ProjectFeature" (
  "id" TEXT NOT NULL, "projectId" TEXT NOT NULL, "key" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT false, "configuration" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ProjectFeature_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AuditEvent" (
  "id" TEXT NOT NULL, "projectId" TEXT NOT NULL, "actorUserId" TEXT,
  "action" TEXT NOT NULL, "resourceType" TEXT NOT NULL, "resourceId" TEXT NOT NULL,
  "correlationId" TEXT, "reason" TEXT, "metadataRedacted" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ChannelConnection_projectId_provider_channel_isActive_idx" ON "ChannelConnection"("projectId", "provider", "channel", "isActive");
CREATE UNIQUE INDEX "ChannelConnection_active_phone_asset_key" ON "ChannelConnection"("provider", "externalPhoneNumberId") WHERE "isActive" = true AND "externalPhoneNumberId" IS NOT NULL;
CREATE UNIQUE INDEX "ChannelConnection_active_instagram_asset_key" ON "ChannelConnection"("provider", "externalInstagramAccountId") WHERE "isActive" = true AND "externalInstagramAccountId" IS NOT NULL;
CREATE UNIQUE INDEX "ChannelConnection_active_page_asset_key" ON "ChannelConnection"("provider", "externalPageId") WHERE "isActive" = true AND "externalPageId" IS NOT NULL;
CREATE INDEX "ContactIdentity_projectId_channel_normalizedAddress_idx" ON "ContactIdentity"("projectId", "channel", "normalizedAddress");
CREATE INDEX "ContactIdentity_leadId_idx" ON "ContactIdentity"("leadId");
CREATE UNIQUE INDEX "ContactIdentity_channelConnectionId_externalUserId_key" ON "ContactIdentity"("channelConnectionId", "externalUserId");
CREATE INDEX "ProviderEvent_projectId_status_receivedAt_idx" ON "ProviderEvent"("projectId", "status", "receivedAt");
CREATE UNIQUE INDEX "ProviderEvent_channelConnectionId_externalEventKey_key" ON "ProviderEvent"("channelConnectionId", "externalEventKey");
CREATE UNIQUE INDEX "OutboxEvent_idempotencyKey_key" ON "OutboxEvent"("idempotencyKey");
CREATE INDEX "OutboxEvent_status_availableAt_idx" ON "OutboxEvent"("status", "availableAt");
CREATE INDEX "OutboxEvent_projectId_createdAt_idx" ON "OutboxEvent"("projectId", "createdAt");
CREATE INDEX "MediaObject_projectId_retentionUntil_idx" ON "MediaObject"("projectId", "retentionUntil");
CREATE UNIQUE INDEX "MediaObject_projectId_storageKey_key" ON "MediaObject"("projectId", "storageKey");
CREATE INDEX "ProjectFeature_projectId_enabled_idx" ON "ProjectFeature"("projectId", "enabled");
CREATE UNIQUE INDEX "ProjectFeature_projectId_key_key" ON "ProjectFeature"("projectId", "key");
CREATE INDEX "AuditEvent_projectId_createdAt_idx" ON "AuditEvent"("projectId", "createdAt");
CREATE INDEX "AuditEvent_correlationId_idx" ON "AuditEvent"("correlationId");
CREATE INDEX "Conversation_projectId_channel_status_idx" ON "Conversation"("projectId", "channel", "status");
CREATE INDEX "Conversation_channelConnectionId_lastMessageAt_idx" ON "Conversation"("channelConnectionId", "lastMessageAt");
CREATE INDEX "Message_projectId_createdAt_idx" ON "Message"("projectId", "createdAt");
CREATE INDEX "Message_channelConnectionId_providerMessageId_idx" ON "Message"("channelConnectionId", "providerMessageId");
CREATE UNIQUE INDEX "Message_connection_idempotency_key" ON "Message"("channelConnectionId", "idempotencyKey") WHERE "idempotencyKey" IS NOT NULL;

ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_channelConnectionId_fkey" FOREIGN KEY ("channelConnectionId") REFERENCES "ChannelConnection"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_contactIdentityId_fkey" FOREIGN KEY ("contactIdentityId") REFERENCES "ContactIdentity"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_assignedUserId_fkey" FOREIGN KEY ("assignedUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Message" ADD CONSTRAINT "Message_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Message" ADD CONSTRAINT "Message_channelConnectionId_fkey" FOREIGN KEY ("channelConnectionId") REFERENCES "ChannelConnection"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Message" ADD CONSTRAINT "Message_replyToMessageId_fkey" FOREIGN KEY ("replyToMessageId") REFERENCES "Message"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Message" ADD CONSTRAINT "Message_mediaObjectId_fkey" FOREIGN KEY ("mediaObjectId") REFERENCES "MediaObject"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ChannelConnection" ADD CONSTRAINT "ChannelConnection_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ContactIdentity" ADD CONSTRAINT "ContactIdentity_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ContactIdentity" ADD CONSTRAINT "ContactIdentity_channelConnectionId_fkey" FOREIGN KEY ("channelConnectionId") REFERENCES "ChannelConnection"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ContactIdentity" ADD CONSTRAINT "ContactIdentity_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ProviderEvent" ADD CONSTRAINT "ProviderEvent_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProviderEvent" ADD CONSTRAINT "ProviderEvent_channelConnectionId_fkey" FOREIGN KEY ("channelConnectionId") REFERENCES "ChannelConnection"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "OutboxEvent" ADD CONSTRAINT "OutboxEvent_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MediaObject" ADD CONSTRAINT "MediaObject_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProjectFeature" ADD CONSTRAINT "ProjectFeature_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
