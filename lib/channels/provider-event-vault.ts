import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

type Envelope = { v: 1; keyId: string; iv: string; tag: string; ciphertext: string };
export type ProviderEventContext = { projectId: string; connectionId: string; envelopeVersion?: number };

function parseKey(raw: string | undefined, name: string) {
  if (!raw) throw new Error(`${name} is required.`);
  const key = /^[a-f0-9]{64}$/i.test(raw) ? Buffer.from(raw, "hex") : Buffer.from(raw, "base64");
  if (key.length !== 32) throw new Error(`${name} must decode to exactly 32 bytes.`);
  return key;
}

function aad(context: ProviderEventContext) {
  return Buffer.from(JSON.stringify({ projectId: context.projectId, connectionId: context.connectionId, v: context.envelopeVersion ?? 1 }));
}

export function encryptProviderEventPayload(value: string, context: ProviderEventContext) {
  const keyId = process.env.PROVIDER_EVENT_KEY_ID;
  if (!keyId) throw new Error("PROVIDER_EVENT_KEY_ID is required.");
  const key = parseKey(process.env.PROVIDER_EVENT_ENCRYPTION_KEY, "PROVIDER_EVENT_ENCRYPTION_KEY");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(aad(context));
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return JSON.stringify({ v: 1, keyId, iv: iv.toString("base64"), tag: cipher.getAuthTag().toString("base64"), ciphertext: ciphertext.toString("base64") } satisfies Envelope);
}

export function decryptProviderEventPayload(serialized: string, context: ProviderEventContext) {
  const envelope = JSON.parse(serialized) as Envelope;
  if (envelope.v !== 1) throw new Error("Unsupported provider event envelope.");
  const activeId = process.env.PROVIDER_EVENT_KEY_ID;
  const previousId = process.env.PROVIDER_EVENT_PREVIOUS_KEY_ID;
  const isActive = envelope.keyId === activeId;
  const isPrevious = Boolean(previousId) && envelope.keyId === previousId;
  if (!isActive && !isPrevious) throw new Error("Provider event envelope keyId is not configured.");
  const key = parseKey(
    isActive ? process.env.PROVIDER_EVENT_ENCRYPTION_KEY : process.env.PROVIDER_EVENT_PREVIOUS_KEY,
    isActive ? "PROVIDER_EVENT_ENCRYPTION_KEY" : "PROVIDER_EVENT_PREVIOUS_KEY",
  );
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(envelope.iv, "base64"));
  decipher.setAAD(aad(context));
  decipher.setAuthTag(Buffer.from(envelope.tag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(envelope.ciphertext, "base64")), decipher.final()]).toString("utf8");
}
