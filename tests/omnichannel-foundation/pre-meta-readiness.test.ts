import assert from "node:assert/strict";
import { createHmac, randomUUID } from "node:crypto";
import test from "node:test";
import IORedis from "ioredis";
import { PrismaClient } from "@prisma/client";
import { ensureEvolutionConnection, linkLegacyMessage } from "../../lib/channels/evolution-compatibility";
import { EVOLUTION_INBOUND_RETRY, EVOLUTION_OUTBOUND_RETRY } from "../../lib/channels/evolution-bridge";
import { processEvolutionRetryOutbox } from "../../lib/channels/evolution-retry";
import { executeEvolutionSend } from "../../lib/channels/evolution-send";
import { allowWebhookRequest, readRawBody, verifyEvolutionWebhookAuth } from "../../lib/channels/webhook-gateway";
import { POST as legacyWebhookPost } from "../../app/api/webhooks/whatsapp/route";

const integration = process.env.RUN_DB_INTEGRATION_TESTS === "true";

test("autenticação Evolution aceita segredo timing-safe ou HMAC e rejeita ausente/inválido", () => {
  const body = Buffer.from('{"synthetic":true}');
  const secret = "synthetic-evolution-webhook-secret";
  assert.equal(verifyEvolutionWebhookAuth(body, new Headers(), secret), false);
  assert.equal(verifyEvolutionWebhookAuth(body, new Headers({ authorization: "Bearer invalid" }), secret), false);
  assert.equal(verifyEvolutionWebhookAuth(body, new Headers({ "webhook-authorization": secret }), secret), true);
  const signature = `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;
  assert.equal(verifyEvolutionWebhookAuth(body, new Headers({ "x-hub-signature-256": signature }), secret), true);
});

test("webhook rejeita corpo maior que o limite antes do parse", async () => {
  const request = new Request("http://localhost/api/webhooks/whatsapp", { method: "POST", headers: { "content-length": "1048577" }, body: "{}" });
  await assert.rejects(() => readRawBody(request), /BODY_TOO_LARGE/);
});

test("rate limit do webhook falha fechado quando Redis está indisponível", async () => {
  const unavailable = { eval: async () => { throw new Error("unavailable"); } } as unknown as IORedis;
  process.env.QUEUE_PREFIX = "crm-b16-ci-webhook";
  assert.equal((await allowWebhookRequest(unavailable, "evolution-legacy", "origin", "synthetic")).code, "RATE_LIMIT_UNAVAILABLE");
});

test("FK, cofre, índice parcial e retry Evolution são seguros e idempotentes", { skip: !integration }, async () => {
  const prisma = new PrismaClient();
  const suffix = randomUUID();
  const p1 = `pre-meta-p1-${suffix}`;
  const p2 = `pre-meta-p2-${suffix}`;
  try {
    await prisma.project.createMany({ data: [{ id: p1, name: "Synthetic" }, { id: p2, name: "Synthetic other" }] });
    const instance = await prisma.whatsAppInstance.create({ data: { id: `instance-${suffix}`, name: "Synthetic", instanceName: `instance-${suffix}`, projectId: p1, token: "synthetic-token" } });
    const otherInstance = await prisma.whatsAppInstance.create({ data: { id: `other-instance-${suffix}`, name: "Synthetic", instanceName: `other-instance-${suffix}`, projectId: p2 } });
    const conversation = await prisma.conversation.create({ data: { id: `conversation-${suffix}`, whatsappId: "00000000000", name: "Synthetic", instanceId: instance.id } });
    const otherConversation = await prisma.conversation.create({ data: { id: `other-conversation-${suffix}`, whatsappId: "11111111111", name: "Synthetic", instanceId: otherInstance.id } });
    const inbound = await prisma.message.create({ data: { id: `inbound-${suffix}`, remoteId: `provider-in-${suffix}`, content: "synthetic", direction: "INBOUND", status: "DELIVERED", conversationId: conversation.id } });
    const outboundAccepted = await prisma.message.create({ data: { id: `out-accepted-${suffix}`, content: "synthetic", direction: "OUTBOUND", status: "SENDING", conversationId: conversation.id } });
    const outboundRejected = await prisma.message.create({ data: { id: `out-rejected-${suffix}`, content: "synthetic", direction: "OUTBOUND", status: "SENDING", conversationId: conversation.id } });
    await prisma.projectFeature.createMany({ data: [{ projectId: p1, key: "evolution_dual_write", enabled: true }, { projectId: p2, key: "evolution_dual_write", enabled: true }] });

    const connection = await prisma.$transaction((tx) => ensureEvolutionConnection(tx, instance));
    await prisma.channelConnection.update({ where: { id: connection.id }, data: { credentialsEncrypted: "synthetic-ciphertext", credentialsKeyId: "synthetic-key-v1" } });
    await prisma.$transaction((tx) => ensureEvolutionConnection(tx, instance));
    const preserved = await prisma.channelConnection.findUniqueOrThrow({ where: { id: connection.id } });
    assert.equal(preserved.credentialsEncrypted, "synthetic-ciphertext");
    assert.equal(preserved.credentialsKeyId, "synthetic-key-v1");

    await prisma.$transaction((tx) => linkLegacyMessage(tx, instance, conversation, inbound));
    const sameConnectionDuplicate = await prisma.message.create({ data: { id: `same-duplicate-${suffix}`, remoteId: inbound.remoteId, content: "synthetic", direction: "INBOUND", status: "DELIVERED", conversationId: conversation.id } });
    await assert.rejects(() => prisma.$transaction((tx) => linkLegacyMessage(tx, instance, conversation, sameConnectionDuplicate)));
    const acrossConnection = await prisma.message.create({ data: { id: `across-${suffix}`, remoteId: inbound.remoteId, content: "synthetic", direction: "INBOUND", status: "DELIVERED", conversationId: otherConversation.id } });
    await prisma.$transaction((tx) => linkLegacyMessage(tx, otherInstance, otherConversation, acrossConnection));

    const retry = await prisma.outboxEvent.create({ data: { projectId: p1, aggregateType: "Message", aggregateId: inbound.id, eventType: EVOLUTION_INBOUND_RETRY, payload: JSON.stringify({ messageId: inbound.id, conversationId: conversation.id, instanceId: instance.id }), idempotencyKey: `retry-in-${suffix}`, status: "PUBLISHED" } });
    await assert.rejects(() => processEvolutionRetryOutbox(retry.id, "transient-first", { inbound: async () => { throw new Error("temporary"); } }), /EVOLUTION_RETRY_TRANSIENT/);
    assert.equal((await prisma.outboxEvent.findUniqueOrThrow({ where: { id: retry.id } })).status, "PUBLISHED");
    assert.equal((await processEvolutionRetryOutbox(retry.id)).status, "PROCESSED");
    assert.equal((await processEvolutionRetryOutbox(retry.id)).status, "DUPLICATE");
    assert.equal(await prisma.auditEvent.count({ where: { projectId: p1, action: "EVOLUTION_DUAL_WRITE_INBOUND", resourceId: inbound.id } }), 1);

    const missing = await prisma.outboxEvent.create({ data: { projectId: p1, aggregateType: "Message", aggregateId: `missing-${suffix}`, eventType: EVOLUTION_INBOUND_RETRY, payload: JSON.stringify({ messageId: `missing-${suffix}`, conversationId: conversation.id, instanceId: instance.id }), idempotencyKey: `retry-missing-${suffix}`, status: "PUBLISHED" } });
    assert.equal((await processEvolutionRetryOutbox(missing.id)).status, "DEAD_LETTER");

    const crossed = await prisma.outboxEvent.create({ data: { projectId: p2, aggregateType: "Message", aggregateId: inbound.id, eventType: EVOLUTION_INBOUND_RETRY, payload: JSON.stringify({ messageId: inbound.id, conversationId: conversation.id, instanceId: instance.id }), idempotencyKey: `retry-cross-${suffix}`, status: "PUBLISHED" } });
    const crossedResult = await processEvolutionRetryOutbox(crossed.id);
    assert.equal(crossedResult.status, "DEAD_LETTER");
    assert.equal(crossedResult.errorCode, "EVOLUTION_BRIDGE_PROJECT_MISMATCH");

    const acceptedRetry = await prisma.outboxEvent.create({ data: { projectId: p1, aggregateType: "Message", aggregateId: outboundAccepted.id, eventType: EVOLUTION_OUTBOUND_RETRY, payload: JSON.stringify({ messageId: outboundAccepted.id, accepted: true, providerMessageId: `accepted-${suffix}` }), idempotencyKey: `retry-out-ok-${suffix}`, status: "PUBLISHED" } });
    const rejectedRetry = await prisma.outboxEvent.create({ data: { projectId: p1, aggregateType: "Message", aggregateId: outboundRejected.id, eventType: EVOLUTION_OUTBOUND_RETRY, payload: JSON.stringify({ messageId: outboundRejected.id, accepted: false, errorCode: "SYNTHETIC_REJECTED" }), idempotencyKey: `retry-out-failed-${suffix}`, status: "PUBLISHED" } });
    assert.equal((await processEvolutionRetryOutbox(acceptedRetry.id)).status, "PROCESSED");
    assert.equal((await processEvolutionRetryOutbox(rejectedRetry.id)).status, "PROCESSED");
    assert.equal((await prisma.message.findUniqueOrThrow({ where: { id: outboundAccepted.id } })).providerMessageId, `accepted-${suffix}`);
    assert.equal((await prisma.message.findUniqueOrThrow({ where: { id: outboundRejected.id } })).errorCode, "SYNTHETIC_REJECTED");
    await assert.rejects(() => prisma.whatsAppInstance.delete({ where: { id: instance.id } }));
  } finally {
    await prisma.conversation.deleteMany({ where: { instance: { projectId: { in: [p1, p2] } } } });
    await prisma.project.deleteMany({ where: { id: { in: [p1, p2] } } });
    await prisma.$disconnect();
  }
});

test("envio Evolution só persiste após validação e nunca marca SENT antes da aceitação", { skip: !integration }, async () => {
  const prisma = new PrismaClient();
  const suffix = randomUUID();
  const projectId = `send-project-${suffix}`;
  try {
    await prisma.project.create({ data: { id: projectId, name: "Synthetic send" } });
    const instance = await prisma.whatsAppInstance.create({ data: { id: `send-instance-${suffix}`, name: "Synthetic", instanceName: `send-instance-${suffix}`, projectId, token: "synthetic-token", status: "CONNECTED" } });
    const conversation = await prisma.conversation.create({ data: { id: `send-conversation-${suffix}`, whatsappId: "00000000000", name: "Synthetic", instanceId: instance.id } });
    process.env.OUTBOUND_INTEGRATIONS_DISABLED = "true";
    await assert.rejects(() => executeEvolutionSend({ projectId, conversationId: conversation.id, content: "synthetic", messageType: "TEXT", mediaUrl: null }, { apiUrl: "https://evolution.invalid" }), /disabled/i);
    assert.equal(await prisma.message.count({ where: { conversationId: conversation.id } }), 0);

    process.env.OUTBOUND_INTEGRATIONS_DISABLED = "false";
    await assert.rejects(() => executeEvolutionSend({ projectId, conversationId: conversation.id, content: "synthetic", messageType: "TEXT", mediaUrl: null }, { apiUrl: "" }), /EVOLUTION_NOT_CONFIGURED/);
    assert.equal(await prisma.message.count({ where: { conversationId: conversation.id } }), 0);

    const accepted = await executeEvolutionSend({ projectId, conversationId: conversation.id, content: "synthetic", messageType: "TEXT", mediaUrl: null }, { apiUrl: "https://evolution.invalid", fetcher: async () => new Response(JSON.stringify({ key: { id: `remote-${suffix}` } }), { status: 200 }) });
    assert.equal(accepted.status, "ACCEPTED");
    assert.ok(accepted.acceptedAt);
    const rejected = await executeEvolutionSend({ projectId, conversationId: conversation.id, content: "synthetic", messageType: "TEXT", mediaUrl: null }, { apiUrl: "https://evolution.invalid", fetcher: async () => new Response('{"error":"synthetic"}', { status: 422 }) });
    assert.equal(rejected.status, "FAILED");
    assert.ok(rejected.failedAt);
    assert.equal(await prisma.message.count({ where: { conversationId: conversation.id, status: "SENT" } }), 0);
  } finally {
    process.env.OUTBOUND_INTEGRATIONS_DISABLED = "true";
    await prisma.conversation.deleteMany({ where: { instance: { projectId } } });
    await prisma.project.deleteMany({ where: { id: projectId } });
    await prisma.$disconnect();
  }
});

test("webhook legado autentica, limita e responde replay sem duplicar mensagem", { skip: !integration || !process.env.TEST_REDIS_URL }, async () => {
  const prisma = new PrismaClient();
  const suffix = randomUUID();
  const projectId = `webhook-project-${suffix}`;
  const secret = `webhook-secret-${suffix}`;
  process.env.REDIS_URL = process.env.TEST_REDIS_URL;
  process.env.QUEUE_PREFIX = `crm-b16-ci-webhook-${suffix}`;
  process.env.DEPLOYMENT_ENV = "staging";
  process.env.EVOLUTION_WEBHOOK_SECRET = secret;
  try {
    await prisma.project.create({ data: { id: projectId, name: "Synthetic webhook" } });
    await prisma.whatsAppInstance.create({ data: { id: `webhook-instance-${suffix}`, name: "Synthetic", instanceName: `webhook-instance-${suffix}`, projectId } });
    const body = JSON.stringify({ event: "MESSAGES_UPSERT", instance: `webhook-instance-${suffix}`, data: { key: { id: `webhook-message-${suffix}`, remoteJid: "00000000000@s.whatsapp.net", fromMe: false }, message: { conversation: "synthetic" } } });
    const unsigned = await legacyWebhookPost(new Request("http://localhost/api/webhooks/whatsapp", { method: "POST", body }));
    assert.equal(unsigned.status, 401);
    const request = () => new Request("http://localhost/api/webhooks/whatsapp", { method: "POST", headers: { "webhook-authorization": secret, "content-type": "application/json" }, body });
    const first = await legacyWebhookPost(request());
    const replay = await legacyWebhookPost(request());
    assert.equal(first.status, 200);
    assert.equal(replay.status, 200);
    assert.equal((await replay.json()).duplicates, 1);
    assert.equal(await prisma.message.count({ where: { remoteId: `webhook-message-${suffix}` } }), 1);
  } finally {
    await prisma.conversation.deleteMany({ where: { instance: { projectId } } });
    await prisma.project.deleteMany({ where: { id: projectId } });
    await prisma.$disconnect();
    delete process.env.EVOLUTION_WEBHOOK_SECRET;
  }
});
