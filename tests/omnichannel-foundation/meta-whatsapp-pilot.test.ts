import assert from "node:assert/strict";
import { createHmac, randomUUID } from "node:crypto";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { PrismaClient } from "@prisma/client";
import { MetaGraphClient, MetaGraphError, exchangeEmbeddedSignupCode } from "../../lib/channels/meta/graph-client";
import { canAdvanceDelivery, eachMetaChange, metaMessageContent, normalizedDeliveryStatus } from "../../lib/channels/meta/payload";
import { processMetaProviderEvent, reconcilePendingDeliveryEvents } from "../../lib/channels/meta/processor";
import { POST as metaWebhookPost } from "../../app/api/webhooks/providers/meta/route";
import { completeMetaOnboarding, createMetaOnboardingSession, validateMetaTokenAccess } from "../../lib/channels/meta/onboarding";
import { validateMetaPilotPolicy } from "../../lib/channels/meta/pilot-policy";

const integration = process.env.RUN_DB_INTEGRATION_TESTS === "true" && Boolean(process.env.TEST_REDIS_URL);

test("parser Meta percorre todos os entries/changes e normaliza conteúdo/status", () => {
  const changes = eachMetaChange({ object: "whatsapp_business_account", entry: [{ id: "w1", changes: [{ field: "messages", value: {} }, { field: "messages", value: {} }] }, { id: "w2", changes: [{ field: "messages", value: {} }] }] });
  assert.equal(changes.length, 3);
  assert.deepEqual(metaMessageContent({ type: "text", text: { body: "oi" } }), { type: "TEXT", content: "oi" });
  assert.equal(metaMessageContent({ type: "image", image: { id: "m1", caption: "foto" } }).mediaId, "m1");
  assert.equal(metaMessageContent({ type: "unsupported" }).type, "UNSUPPORTED");
  assert.equal(normalizedDeliveryStatus("delivered"), "DELIVERED");
  assert.equal(normalizedDeliveryStatus("invented"), null);
  assert.equal(canAdvanceDelivery("DELIVERED", "READ"), true);
  assert.equal(canAdvanceDelivery("READ", "SENT"), false);
});

test("Graph client usa Authorization, não coloca token na URL e só repete GET seguro", async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const fetcher = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    if (calls.length === 1) return new Response(JSON.stringify({ error: { code: 4, is_transient: true } }), { status: 429 });
    return Response.json({ data: [{ id: "synthetic" }] });
  }) as typeof fetch;
  const result = await new MetaGraphClient("secret-token", fetcher, 1000).get<{ data: Array<{ id: string }> }>("/me");
  assert.equal(result.data[0].id, "synthetic");
  assert.equal(calls.length, 2);
  assert.ok(calls.every((call) => !call.url.includes("secret-token")));
  assert.ok(calls.every((call) => new Headers(call.init?.headers).get("authorization") === "Bearer secret-token"));

  let posts = 0;
  const rejected = (async () => { posts += 1; return new Response(JSON.stringify({ error: { code: 4, is_transient: true } }), { status: 429 }); }) as typeof fetch;
  await assert.rejects(() => new MetaGraphClient("token", rejected).post("/messages", {}), MetaGraphError);
  assert.equal(posts, 1);
});

test("troca de code mantém code e app secret fora da URL", async () => {
  process.env.META_APP_ID = "1065199242773457"; process.env.META_APP_SECRET = "synthetic-secret";
  let capturedUrl = ""; let capturedBody = "";
  const fetcher = (async (url: string | URL | Request, init?: RequestInit) => { capturedUrl = String(url); capturedBody = String(init?.body); return Response.json({ access_token: "synthetic-token", expires_in: 60 }); }) as typeof fetch;
  await exchangeEmbeddedSignupCode("one-time-code", "https://staging.invalid/meta/callback", fetcher);
  assert.ok(!capturedUrl.includes("one-time-code") && !capturedUrl.includes("synthetic-secret"));
  assert.match(capturedBody, /code=one-time-code/);
  assert.match(capturedBody, /client_secret=synthetic-secret/);
});

test("validação de token recusa app, expiração, scopes e WABA divergentes", () => {
  process.env.META_APP_ID = "expected-app";
  const valid = { app_id: "expected-app", is_valid: true, expires_at: Math.floor(Date.now() / 1000) + 3600, granular_scopes: [{ scope: "whatsapp_business_management", target_ids: ["waba-ok"] }, { scope: "whatsapp_business_messaging", target_ids: ["waba-ok"] }] };
  assert.doesNotThrow(() => validateMetaTokenAccess(valid, "waba-ok"));
  assert.throws(() => validateMetaTokenAccess({ ...valid, app_id: "wrong" }, "waba-ok"), /META_TOKEN_APP_MISMATCH/);
  assert.throws(() => validateMetaTokenAccess({ ...valid, expires_at: 1 }, "waba-ok"), /META_TOKEN_EXPIRED/);
  assert.throws(() => validateMetaTokenAccess({ ...valid, granular_scopes: valid.granular_scopes.slice(0, 1) }, "waba-ok"), /META_REQUIRED_SCOPES_MISSING/);
  assert.throws(() => validateMetaTokenAccess(valid, "other-waba"), /META_WABA_NOT_GRANTED/);
});

test("cliente Embedded Signup não contém App Secret nem persiste credencial no browser", async () => {
  const source = await readFile("app/project/[id]/settings/meta-whatsapp-settings.tsx", "utf8");
  assert.ok(!source.includes("META_APP_SECRET"));
  assert.ok(!source.includes("localStorage") && !source.includes("sessionStorage"));
  assert.match(source, /response_type: 'code'/);
  assert.match(source, /override_default_response_type: true/);
});

test("política one-shot recusa produção, kill switch aberto, expiração e destinatário externo", () => {
  const base = { environment: "staging", outboundDisabled: "true", confirmation: "SEND_ONE_META_MESSAGE", expiresAt: "2030-01-01T00:00:00Z", allowlist: "+55 11 99999-0000", recipient: "5511999990000", now: 1_800_000_000_000 };
  assert.equal(validateMetaPilotPolicy(base), "5511999990000");
  assert.throws(() => validateMetaPilotPolicy({ ...base, environment: "production" }), /STAGING_ONLY/);
  assert.throws(() => validateMetaPilotPolicy({ ...base, outboundDisabled: "false" }), /KILL_SWITCH/);
  assert.throws(() => validateMetaPilotPolicy({ ...base, expiresAt: "2020-01-01T00:00:00Z" }), /EXPIRED/);
  assert.throws(() => validateMetaPilotPolicy({ ...base, recipient: "5511888880000" }), /NOT_ALLOWLISTED/);
});

test("sessão de onboarding guarda apenas hashes, falha CSRF e bloqueia replay", { skip: !integration }, async () => {
  const prisma = new PrismaClient(); const suffix = randomUUID(); const projectId = `meta-session-${suffix}`; const userId = `meta-user-${suffix}`;
  try {
    await prisma.user.create({ data: { id: userId, name: "Synthetic", email: `${suffix}@invalid.test`, passwordHash: "not-used" } });
    await prisma.project.create({ data: { id: projectId, name: "Synthetic" } });
    const created = await createMetaOnboardingSession(projectId, userId);
    const stored = await prisma.metaOnboardingSession.findUniqueOrThrow({ where: { id: created.sessionId } });
    assert.notEqual(stored.stateHash, created.state); assert.notEqual(stored.nonceHash, created.nonce);
    const input = { projectId, userId, sessionId: created.sessionId, state: "wrong", nonce: created.nonce, code: "never-exchanged", wabaId: "waba", phoneNumberId: "phone" };
    await assert.rejects(() => completeMetaOnboarding(input), /META_ONBOARDING_CSRF_FAILED/);
    assert.equal((await prisma.metaOnboardingSession.findUniqueOrThrow({ where: { id: created.sessionId } })).status, "FAILED");
    await assert.rejects(() => completeMetaOnboarding({ ...input, state: created.state }), /META_ONBOARDING_SESSION_INVALID/);
  } finally { await prisma.project.deleteMany({ where: { id: projectId } }); await prisma.user.deleteMany({ where: { id: userId } }); await prisma.$disconnect(); }
});

test("webhook Meta resolve WABA+phone exatos, guarda todos os itens e não cria lead", { skip: !integration }, async () => {
  const prisma = new PrismaClient(); const suffix = randomUUID(); const projectId = `meta-project-${suffix}`;
  process.env.REDIS_URL = process.env.TEST_REDIS_URL; process.env.QUEUE_PREFIX = `crm-b16-ci-meta-${suffix}`; process.env.DEPLOYMENT_ENV = "ci";
  process.env.META_APP_SECRET = `meta-secret-${suffix}`; process.env.PROVIDER_EVENT_ENCRYPTION_KEY ||= "b".repeat(64); process.env.PROVIDER_EVENT_KEY_ID ||= "event-ci-v1";
  try {
    await prisma.project.create({ data: { id: projectId, name: "Synthetic Meta" } });
    await prisma.projectFeature.createMany({ data: [{ projectId, key: "omnichannel_foundation", enabled: true }, { projectId, key: "meta_whatsapp", enabled: true }] });
    const connection = await prisma.channelConnection.create({ data: { projectId, provider: "META_WHATSAPP", channel: "WHATSAPP", name: "Synthetic", status: "CONNECTED", isActive: true, externalWabaId: `waba-${suffix}`, externalPhoneNumberId: `phone-${suffix}` } });
    const leadsBefore = await prisma.lead.count({ where: { projectId } }); const pipelinesBefore = await prisma.pipelineEntry.count({ where: { lead: { projectId } } });
    const body = JSON.stringify({ object: "whatsapp_business_account", entry: [{ id: `waba-${suffix}`, changes: [{ field: "messages", value: { messaging_product: "whatsapp", metadata: { phone_number_id: `phone-${suffix}` }, contacts: [{ wa_id: "551100000001", profile: { name: "Contato 1" } }, { wa_id: "551100000002", profile: { name: "Contato 2" } }], messages: [{ id: `msg-1-${suffix}`, from: "551100000001", timestamp: "1788400000", type: "text", text: { body: "um" } }, { id: `msg-2-${suffix}`, from: "551100000002", timestamp: "1788400001", type: "image", image: { id: "media-synthetic", caption: "dois" } }], statuses: [{ id: `out-1-${suffix}`, status: "sent", timestamp: "1788400002" }, { id: `out-2-${suffix}`, status: "delivered", timestamp: "1788400003" }] } }] }] });
    const signature = `sha256=${createHmac("sha256", process.env.META_APP_SECRET).update(body).digest("hex")}`;
    const request = () => new Request("http://localhost/api/webhooks/providers/meta", { method: "POST", headers: { "content-type": "application/json", "x-hub-signature-256": signature }, body });
    assert.equal((await metaWebhookPost(new Request("http://localhost/api/webhooks/providers/meta", { method: "POST", body }))).status, 401);
    assert.equal((await metaWebhookPost(new Request("http://localhost/api/webhooks/providers/meta", { method: "POST", headers: { "x-hub-signature-256": "sha256=" + "0".repeat(64) }, body }))).status, 401);
    assert.equal((await metaWebhookPost(new Request("http://localhost/api/webhooks/providers/meta", { method: "POST", headers: { "content-length": "1048577", "x-hub-signature-256": signature }, body: "{}" }))).status, 413);
    const accepted = await metaWebhookPost(request()); assert.equal(accepted.status, 202); assert.equal((await accepted.json()).accepted, 1);
    const replay = await metaWebhookPost(request()); assert.equal((await replay.json()).duplicates, 1);
    const event = await prisma.providerEvent.findFirstOrThrow({ where: { channelConnectionId: connection.id } });
    const processed = await processMetaProviderEvent(event.id, "ci-worker"); assert.deepEqual({ inbound: processed.inbound, statuses: processed.statuses }, { inbound: 2, statuses: 2 });
    assert.equal((await processMetaProviderEvent(event.id, "ci-worker-replay")).status, "DUPLICATE");
    assert.equal(await prisma.message.count({ where: { channelConnectionId: connection.id, direction: "INBOUND" } }), 2);
    assert.equal(await prisma.contactIdentity.count({ where: { channelConnectionId: connection.id, leadId: null } }), 2);
    assert.equal(await prisma.messageDeliveryEvent.count({ where: { channelConnectionId: connection.id, messageId: null } }), 2);
    assert.equal(await prisma.lead.count({ where: { projectId } }), leadsBefore);
    assert.equal(await prisma.pipelineEntry.count({ where: { lead: { projectId } } }), pipelinesBefore);
    const firstConversation = await prisma.conversation.findFirstOrThrow({ where: { channelConnectionId: connection.id } });
    assert.equal(firstConversation.instanceId, null); assert.ok(firstConversation.customerCareWindowEndsAt);

    const pendingId = `pending-${suffix}`;
    await prisma.messageDeliveryEvent.create({ data: { projectId, channelConnectionId: connection.id, providerMessageId: pendingId, providerStatus: "READ", externalEventKey: `pending-event-${suffix}` } });
    const outbound = await prisma.message.create({ data: { projectId, channelConnectionId: connection.id, providerMessageId: pendingId, conversationId: firstConversation.id, content: "synthetic", direction: "OUTBOUND", status: "ACCEPTED" } });
    assert.equal(await reconcilePendingDeliveryEvents(connection.id, pendingId), 1);
    assert.equal((await prisma.message.findUniqueOrThrow({ where: { id: outbound.id } })).status, "READ");
    await prisma.projectFeature.updateMany({ where: { projectId }, data: { enabled: false } });
    const disabledBody = body.replace(`msg-1-${suffix}`, `msg-disabled-${suffix}`);
    const disabledSignature = `sha256=${createHmac("sha256", process.env.META_APP_SECRET).update(disabledBody).digest("hex")}`;
    const disabled = await metaWebhookPost(new Request("http://localhost/api/webhooks/providers/meta", { method: "POST", headers: { "x-hub-signature-256": disabledSignature }, body: disabledBody }));
    assert.equal((await disabled.json()).status, "UNKNOWN_CONNECTION");
  } finally { await prisma.project.deleteMany({ where: { id: projectId } }); await prisma.$disconnect(); }
});

test("banco impede resolução Meta ambígua e webhook ignora conexão desconhecida", { skip: !integration }, async () => {
  const prisma = new PrismaClient(); const suffix = randomUUID(); const projectId = `meta-ambiguous-${suffix}`;
  process.env.REDIS_URL = process.env.TEST_REDIS_URL; process.env.QUEUE_PREFIX = `crm-b16-ci-meta-amb-${suffix}`; process.env.DEPLOYMENT_ENV = "ci"; process.env.META_APP_SECRET = `meta-secret-${suffix}`;
  const makeBody = (waba: string, phone: string) => JSON.stringify({ object: "whatsapp_business_account", entry: [{ id: waba, changes: [{ field: "messages", value: { metadata: { phone_number_id: phone }, messages: [] } }] }] });
  const send = (body: string) => metaWebhookPost(new Request("http://localhost/api/webhooks/providers/meta", { method: "POST", headers: { "x-hub-signature-256": `sha256=${createHmac("sha256", process.env.META_APP_SECRET!).update(body).digest("hex")}` }, body }));
  try {
    await prisma.project.create({ data: { id: projectId, name: "Ambiguous" } });
    await prisma.channelConnection.create({ data: { projectId, provider: "META_WHATSAPP", channel: "WHATSAPP", name: "c1", isActive: true, externalWabaId: `waba-${suffix}`, externalPhoneNumberId: `phone-${suffix}` } });
    await assert.rejects(() => prisma.channelConnection.create({ data: { projectId, provider: "META_WHATSAPP", channel: "WHATSAPP", name: "c2", isActive: true, externalWabaId: `waba-${suffix}`, externalPhoneNumberId: `phone-${suffix}` } }));
    const unknown = await send(makeBody("unknown", "unknown")); assert.equal(unknown.status, 202); assert.equal((await unknown.json()).status, "UNKNOWN_CONNECTION");
  } finally { await prisma.project.deleteMany({ where: { id: projectId } }); await prisma.$disconnect(); }
});
