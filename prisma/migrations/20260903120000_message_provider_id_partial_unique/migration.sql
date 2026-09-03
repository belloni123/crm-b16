-- Fase 1C.1: provider message IDs are unique only inside a concrete connection.
-- NULL values and repetitions across different connections remain valid.
CREATE UNIQUE INDEX "Message_channelConnectionId_providerMessageId_unique_not_null"
  ON "Message"("channelConnectionId", "providerMessageId")
  WHERE "channelConnectionId" IS NOT NULL AND "providerMessageId" IS NOT NULL;
