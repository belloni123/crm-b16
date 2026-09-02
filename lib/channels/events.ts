import { createHash, randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { encryptProviderEventPayload } from "./provider-event-vault";

export type RecordProviderEventInput = {
  connectionId: string;
  externalEventKey: string;
  eventType: string;
  rawBody: string;
  occurredAt?: Date;
};

export async function recordProviderEvent(input: RecordProviderEventInput) {
  const connection = await prisma.channelConnection.findUnique({ where: { id: input.connectionId } });
  if (!connection?.isActive) throw new Error("CHANNEL_CONNECTION_NOT_ACTIVE");
  const payloadHash = createHash("sha256").update(input.rawBody).digest("hex");
  const encrypted = encryptProviderEventPayload(input.rawBody, { projectId: connection.projectId, connectionId: connection.id });

  try {
    return await prisma.$transaction(async (tx) => {
      const event = await tx.providerEvent.create({
        data: {
          projectId: connection.projectId,
          channelConnectionId: connection.id,
          provider: connection.provider,
          externalEventKey: input.externalEventKey,
          eventType: input.eventType,
          payloadHash,
          payloadEncrypted: encrypted,
          retentionUntil: new Date(Date.now() + Number(process.env.PROVIDER_EVENT_RETENTION_DAYS || 30) * 86_400_000),
          occurredAt: input.occurredAt,
        },
      });
      await tx.outboxEvent.create({
        data: {
          projectId: connection.projectId,
          aggregateType: "ProviderEvent",
          aggregateId: event.id,
          eventType: "PROVIDER_EVENT_RECEIVED",
          targetQueue: "provider-events",
          payload: JSON.stringify({ providerEventId: event.id, correlationId: randomUUID() }),
          idempotencyKey: `provider-event:${connection.id}:${input.externalEventKey}`,
        },
      });
      return { event, duplicate: false };
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const event = await prisma.providerEvent.findUniqueOrThrow({
        where: { channelConnectionId_externalEventKey: { channelConnectionId: connection.id, externalEventKey: input.externalEventKey } },
      });
      return { event, duplicate: true };
    }
    throw error;
  }
}
