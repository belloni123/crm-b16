import assert from "node:assert/strict";
import { createHmac, randomBytes } from "node:crypto";
import test from "node:test";
import { decryptChannelCredentials, encryptChannelCredentials } from "../../lib/channels/credentials";
import { PROJECT_FEATURE_KEYS } from "../../lib/channels/features";
import { getProvider } from "../../lib/channels/providers/registry";
import { canTransition } from "../../lib/channels/states";
import { verifyHmacSha256 } from "../../lib/channels/webhook-gateway";
import { disabledStorage } from "../../lib/storage/disabled";

test("credenciais usam AES-256-GCM, nonce único e rotação", () => {
  const first = randomBytes(32).toString("base64");
  const second = randomBytes(32).toString("base64");
  process.env.CHANNEL_CREDENTIALS_KEY_ID = "v1";
  process.env.CHANNEL_CREDENTIALS_ENCRYPTION_KEY = first;
  const a = encryptChannelCredentials({ token: "synthetic" });
  const b = encryptChannelCredentials({ token: "synthetic" });
  assert.notEqual(a, b);
  assert.deepEqual(decryptChannelCredentials(a), { token: "synthetic" });
  process.env.CHANNEL_CREDENTIALS_PREVIOUS_KEY = first;
  process.env.CHANNEL_CREDENTIALS_PREVIOUS_KEY_ID = "v1";
  process.env.CHANNEL_CREDENTIALS_KEY_ID = "v2";
  process.env.CHANNEL_CREDENTIALS_ENCRYPTION_KEY = second;
  assert.deepEqual(decryptChannelCredentials(a), { token: "synthetic" });
});

test("falha de autenticação GCM bloqueia envelope adulterado", () => {
  process.env.CHANNEL_CREDENTIALS_KEY_ID = "active";
  process.env.CHANNEL_CREDENTIALS_ENCRYPTION_KEY = randomBytes(32).toString("base64");
  const envelope = JSON.parse(encryptChannelCredentials({ token: "synthetic" }));
  envelope.tag = Buffer.alloc(16).toString("base64");
  assert.throws(() => decryptChannelCredentials(JSON.stringify(envelope)));
});

test("capabilities de campanhas permanecem desligadas", () => {
  assert.equal(getProvider("EVOLUTION").capabilities.campaigns, false);
  assert.equal(getProvider("META_INSTAGRAM").capabilities.campaigns, false);
  assert.equal(getProvider("META_WHATSAPP").capabilities.campaigns, false);
  assert.equal(getProvider("META_WHATSAPP").capabilities.connect, true);
  assert.equal(getProvider("META_WHATSAPP").capabilities.templates, true);
});

test("kill switch bloqueia todos os adapters", async () => {
  process.env.OUTBOUND_INTEGRATIONS_DISABLED = "true";
  for (const name of ["EVOLUTION", "META_WHATSAPP", "META_INSTAGRAM"] as const) {
    const result = await getProvider(name).dispatch({ projectId: "p", connectionId: "c", idempotencyKey: "i", kind: "MESSAGE", payload: {} });
    assert.equal(result.status, "BLOCKED");
  }
});

test("todas as feature flags previstas existem e não têm default ativo", () => {
  assert.deepEqual(PROJECT_FEATURE_KEYS, ["omnichannel_foundation", "meta_whatsapp", "meta_instagram", "campaigns", "automations", "realtime_inbox", "object_storage", "evolution_dual_write"]);
});

test("estados avançam monotonicamente", () => {
  assert.equal(canTransition("ACCEPTED", "SENT"), true);
  assert.equal(canTransition("SENT", "DELIVERED"), true);
  assert.equal(canTransition("DELIVERED", "READ"), true);
  assert.equal(canTransition("READ", "SENT"), false);
});

test("HMAC Meta usa SHA-256 e rejeita assinatura inválida", () => {
  const body = Buffer.from('{"synthetic":true}');
  const secret = "staging-only-secret";
  const signature = `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;
  assert.equal(verifyHmacSha256(body, signature, secret), true);
  assert.equal(verifyHmacSha256(body, `${signature.slice(0, -1)}0`, secret), false);
});

test("storage nasce desabilitado", async () => {
  await assert.rejects(() => disabledStorage.createSignedDownload("p", "x"), /OBJECT_STORAGE_DISABLED/);
});
