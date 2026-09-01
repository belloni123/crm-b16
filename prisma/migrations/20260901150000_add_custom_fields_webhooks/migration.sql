-- Extend custom fields without removing or rewriting existing values.
ALTER TABLE "CustomFieldDefinition"
ADD COLUMN "internalName" TEXT,
ADD COLUMN "helpText" TEXT,
ADD COLUMN "defaultValue" TEXT,
ADD COLUMN "validationRules" TEXT,
ADD COLUMN "required" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "order" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "deletedAt" TIMESTAMP(3),
ADD COLUMN "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

WITH ranked AS (
  SELECT id,
         (ROW_NUMBER() OVER (PARTITION BY "projectId" ORDER BY name, id) - 1)::INTEGER AS position
  FROM "CustomFieldDefinition"
)
UPDATE "CustomFieldDefinition" AS field
SET "internalName" = 'field_' || REPLACE(SUBSTRING(field.id FROM 1 FOR 12), '-', ''),
    "order" = ranked.position
FROM ranked
WHERE ranked.id = field.id;

ALTER TABLE "CustomFieldDefinition"
ALTER COLUMN "internalName" SET NOT NULL;

CREATE UNIQUE INDEX "CustomFieldDefinition_projectId_internalName_key"
ON "CustomFieldDefinition"("projectId", "internalName");

CREATE INDEX "CustomFieldDefinition_projectId_isActive_order_idx"
ON "CustomFieldDefinition"("projectId", "isActive", "order");

CREATE UNIQUE INDEX "CustomFieldValue_fieldDefinitionId_leadId_key"
ON "CustomFieldValue"("fieldDefinitionId", "leadId");

CREATE INDEX "CustomFieldValue_leadId_idx"
ON "CustomFieldValue"("leadId");

-- Existing webhook rows remain incoming endpoints with the same token and mapping.
ALTER TABLE "WebhookEndpoint"
ALTER COLUMN "targetStageId" DROP NOT NULL,
ADD COLUMN "direction" TEXT NOT NULL DEFAULT 'INCOMING',
ADD COLUMN "url" TEXT,
ADD COLUMN "method" TEXT NOT NULL DEFAULT 'POST',
ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "events" TEXT NOT NULL DEFAULT '[]',
ADD COLUMN "payloadFields" TEXT NOT NULL DEFAULT '[]',
ADD COLUMN "headersEncrypted" TEXT,
ADD COLUMN "timeoutMs" INTEGER NOT NULL DEFAULT 10000,
ADD COLUMN "deletedAt" TIMESTAMP(3),
ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE INDEX "WebhookEndpoint_projectId_direction_isActive_idx"
ON "WebhookEndpoint"("projectId", "direction", "isActive");

ALTER TABLE "WebhookLog"
ADD COLUMN "event" TEXT,
ADD COLUMN "statusCode" INTEGER,
ADD COLUMN "responseBody" TEXT,
ADD COLUMN "attempt" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN "durationMs" INTEGER;

CREATE INDEX "WebhookLog_webhookId_createdAt_idx"
ON "WebhookLog"("webhookId", "createdAt");
