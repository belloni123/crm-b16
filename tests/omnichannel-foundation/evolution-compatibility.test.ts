import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import test from "node:test";
import { PrismaClient } from "@prisma/client";
import { bridgeLegacyInbound, bridgeLegacyInboundSafely } from "../../lib/channels/evolution-bridge";
import { ensureEvolutionConnection, linkLegacyConversation, linkLegacyMessage } from "../../lib/channels/evolution-compatibility";

const enabled = process.env.RUN_DB_INTEGRATION_TESTS === "true";

test("compatibilidade Evolution preserva legado, escopo e idempotência", { skip: !enabled }, async () => {
  const prisma = new PrismaClient();
  const suffix = randomUUID();
  const p1 = `test-project-1-${suffix}`;
  const p2 = `test-project-2-${suffix}`;
  const digest = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
  try {
    await prisma.project.createMany({ data: [{ id: p1, name: "Synthetic one" }, { id: p2, name: "Synthetic two" }] });
    const lead = await prisma.lead.create({ data: { id: `lead-${suffix}`, name: "Synthetic", projectId: p1 } });
    const pipeline = await prisma.pipeline.create({ data: { id: `pipeline-${suffix}`, name: "Synthetic", projectId: p1 } });
    const stage = await prisma.stage.create({ data: { id: `stage-${suffix}`, name: "Synthetic", pipelineId: pipeline.id } });
    const entry = await prisma.pipelineEntry.create({ data: { id: `entry-${suffix}`, leadId: lead.id, pipelineId: pipeline.id, stageId: stage.id } });
    const instance = await prisma.whatsAppInstance.create({ data: { id: `instance-${suffix}`, name: "Synthetic", instanceName: `synthetic-${suffix}`, projectId: p1 } });
    const otherInstance = await prisma.whatsAppInstance.create({ data: { id: `instance-other-${suffix}`, name: "Synthetic other", instanceName: `synthetic-other-${suffix}`, projectId: p2 } });
    const emptyInstance = await prisma.whatsAppInstance.create({ data: { id: `instance-empty-${suffix}`, name: "Synthetic empty", instanceName: `synthetic-empty-${suffix}`, projectId: p1 } });
    const conversation = await prisma.conversation.create({ data: { id: `conversation-${suffix}`, whatsappId: "synthetic-address", name: "Synthetic", instanceId: instance.id, leadId: lead.id } });
    const crossProjectConversation = await prisma.conversation.create({ data: { id: `conversation-cross-${suffix}`, whatsappId: "synthetic-cross", name: "Synthetic", instanceId: otherInstance.id, leadId: lead.id } });
    const message = await prisma.message.create({ data: { id: `message-${suffix}`, remoteId: `remote-${suffix}`, content: "synthetic", direction: "INBOUND", status: "DELIVERED", conversationId: conversation.id } });
    const messageWithoutRemote = await prisma.message.create({ data: { id: `message-empty-${suffix}`, content: "synthetic", direction: "INBOUND", status: "DELIVERED", conversationId: conversation.id } });
    const leadBefore = digest(await prisma.lead.findUnique({ where: { id: lead.id } }));
    const entryBefore = digest(await prisma.pipelineEntry.findUnique({ where: { id: entry.id } }));

    const first = await prisma.$transaction((tx) => linkLegacyMessage(tx, instance, conversation, message));
    const second = await prisma.$transaction((tx) => linkLegacyMessage(tx, instance, conversation, message));
    assert.equal(first.connection.id, second.connection.id);
    assert.equal(await prisma.channelConnection.count({ where: { legacyWhatsAppInstanceId: instance.id } }), 1);
    assert.equal(await prisma.contactIdentity.count({ where: { channelConnectionId: first.connection.id, externalUserId: conversation.whatsappId } }), 1);
    const missing = await prisma.$transaction((tx) => linkLegacyMessage(tx, instance, conversation, messageWithoutRemote));
    assert.ok(missing.conflicts.includes("MESSAGE_WITHOUT_REMOTE_ID"));
    const crossed = await prisma.$transaction((tx) => linkLegacyConversation(tx, otherInstance, crossProjectConversation));
    assert.ok(crossed.conflicts.includes("CONVERSATION_LEAD_PROJECT_MISMATCH"));

    assert.deepEqual(await bridgeLegacyInbound({ projectId: p1, instanceId: instance.id, conversationId: conversation.id, messageId: message.id }), { status: "DISABLED" });
    await prisma.projectFeature.create({ data: { projectId: p1, key: "evolution_dual_write", enabled: true } });
    const linked = await bridgeLegacyInbound({ projectId: p1, instanceId: instance.id, conversationId: conversation.id, messageId: message.id });
    assert.equal(linked.status, "LINKED");
    const safeFailure = await bridgeLegacyInboundSafely({ projectId: p1, instanceId: otherInstance.id, conversationId: conversation.id, messageId: message.id });
    assert.equal(safeFailure.status, "RETRY_PENDING");
    await prisma.projectFeature.update({ where: { projectId_key: { projectId: p1, key: "evolution_dual_write" } }, data: { enabled: false } });

    assert.equal(digest(await prisma.lead.findUnique({ where: { id: lead.id } })), leadBefore);
    assert.equal(digest(await prisma.pipelineEntry.findUnique({ where: { id: entry.id } })), entryBefore);
    await assert.rejects(() => prisma.whatsAppInstance.delete({ where: { id: instance.id } }));
    await prisma.whatsAppInstance.delete({ where: { id: emptyInstance.id } });
    assert.equal(await prisma.whatsAppInstance.count({ where: { id: emptyInstance.id } }), 0);
    await prisma.$transaction(async (tx) => { await ensureEvolutionConnection(tx, instance); await ensureEvolutionConnection(tx, instance); });
  } finally { await prisma.$disconnect(); }
});
