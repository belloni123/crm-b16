import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import test from "node:test";
import { decryptChannelCredentials, encryptChannelCredentials } from "../../lib/channels/credentials";
import { decryptProviderEventPayload, encryptProviderEventPayload } from "../../lib/channels/provider-event-vault";
import { parseWebhookJson, verifyHmacSha256 } from "../../lib/channels/webhook-gateway";
import { outboxBackoffMs, shouldDeadLetter } from "../../lib/outbox/dispatcher";
import { outboundDecision } from "../../lib/outbound-policy";
import { validateServiceEnvironment } from "../../lib/env";

test("provider events usam chave própria, AAD, keyId e rotação explícita", () => {
  const first = randomBytes(32).toString("base64");
  const second = randomBytes(32).toString("base64");
  const context = { projectId: "project-a", connectionId: "connection-a" };
  process.env.PROVIDER_EVENT_KEY_ID = "events-v1";
  process.env.PROVIDER_EVENT_ENCRYPTION_KEY = first;
  const envelope = encryptProviderEventPayload('{"synthetic":true}', context);
  assert.equal(decryptProviderEventPayload(envelope, context), '{"synthetic":true}');
  assert.throws(() => decryptProviderEventPayload(envelope, { ...context, projectId: "project-b" }));
  process.env.PROVIDER_EVENT_PREVIOUS_KEY_ID = "events-v1";
  process.env.PROVIDER_EVENT_PREVIOUS_KEY = first;
  process.env.PROVIDER_EVENT_KEY_ID = "events-v2";
  process.env.PROVIDER_EVENT_ENCRYPTION_KEY = second;
  assert.equal(decryptProviderEventPayload(envelope, context), '{"synthetic":true}');
});

test("credenciais não usam chave anterior sem keyId correspondente", () => {
  process.env.CHANNEL_CREDENTIALS_KEY_ID = "credentials-v1";
  process.env.CHANNEL_CREDENTIALS_ENCRYPTION_KEY = randomBytes(32).toString("base64");
  const envelope = encryptChannelCredentials({ synthetic: true });
  process.env.CHANNEL_CREDENTIALS_PREVIOUS_KEY = process.env.CHANNEL_CREDENTIALS_ENCRYPTION_KEY;
  delete process.env.CHANNEL_CREDENTIALS_PREVIOUS_KEY_ID;
  process.env.CHANNEL_CREDENTIALS_KEY_ID = "credentials-v2";
  process.env.CHANNEL_CREDENTIALS_ENCRYPTION_KEY = randomBytes(32).toString("base64");
  assert.throws(() => decryptChannelCredentials(envelope), /keyId is not configured/);
});

test("HMAC rejeita formatos hex inválidos e JSON excessivamente profundo", () => {
  assert.equal(verifyHmacSha256(Buffer.from("x"), "sha256=zz", "secret"), false);
  const deep = `${"[".repeat(22)}0${"]".repeat(22)}`;
  assert.throws(() => parseWebhookJson(Buffer.from(deep)), /JSON_TOO_DEEP/);
});

test("backoff exponencial tem jitter limitado e DLQ respeita máximo", () => {
  assert.equal(outboxBackoffMs(1, 0), 750);
  assert.equal(outboxBackoffMs(1, 1), 1250);
  assert.equal(shouldDeadLetter(4, 5), false);
  assert.equal(shouldDeadLetter(5, 5), true);
});

test("kill switch é explícito e retorna BLOCKED sem payload", () => {
  process.env.OUTBOUND_INTEGRATIONS_DISABLED = "true";
  assert.deepEqual(outboundDecision("EVOLUTION", "test"), { allowed: false, status: "BLOCKED", reason: "OUTBOUND_INTEGRATIONS_DISABLED" });
  delete process.env.OUTBOUND_INTEGRATIONS_DISABLED;
  assert.throws(() => outboundDecision("EVOLUTION", "test"), /is required/);
});

test("validação de ambiente exige namespace coerente", () => {
  Object.assign(process.env, {
    DEPLOYMENT_ENV: "staging",
    OUTBOUND_INTEGRATIONS_DISABLED: "true",
    DATABASE_URL: "postgresql://synthetic",
    REDIS_URL: "redis://synthetic",
    QUEUE_PREFIX: "crm-b16-production",
    CHANNEL_CREDENTIALS_ENCRYPTION_KEY: randomBytes(32).toString("base64"),
    CHANNEL_CREDENTIALS_KEY_ID: "c-v1",
    PROVIDER_EVENT_ENCRYPTION_KEY: randomBytes(32).toString("base64"),
    PROVIDER_EVENT_KEY_ID: "e-v1",
  });
  assert.throws(() => validateServiceEnvironment("worker"), /QUEUE_PREFIX/);
  process.env.QUEUE_PREFIX = "crm-b16-staging";
  assert.equal(validateServiceEnvironment("worker").environment, "staging");
});
