import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

type Envelope = { v: 1; keyId: string; iv: string; tag: string; ciphertext: string };

function parseKey(raw: string | undefined, name: string) {
  if (!raw) throw new Error(`${name} is required.`);
  const key = /^[a-f0-9]{64}$/i.test(raw) ? Buffer.from(raw, "hex") : Buffer.from(raw, "base64");
  if (key.length !== 32) throw new Error(`${name} must decode to exactly 32 bytes.`);
  return key;
}

export function encryptChannelCredentials(value: unknown) {
  const keyId = process.env.CHANNEL_CREDENTIALS_KEY_ID;
  if (!keyId) throw new Error("CHANNEL_CREDENTIALS_KEY_ID is required.");
  const key = parseKey(process.env.CHANNEL_CREDENTIALS_ENCRYPTION_KEY, "CHANNEL_CREDENTIALS_ENCRYPTION_KEY");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const plaintext = Buffer.from(JSON.stringify(value));
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const envelope: Envelope = {
    v: 1,
    keyId,
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
    ciphertext: ciphertext.toString("base64"),
  };
  return JSON.stringify(envelope);
}

export function decryptChannelCredentials<T>(serialized: string): T {
  const envelope = JSON.parse(serialized) as Envelope;
  if (envelope.v !== 1) throw new Error("Unsupported credential envelope.");
  const activeId = process.env.CHANNEL_CREDENTIALS_KEY_ID;
  const active = process.env.CHANNEL_CREDENTIALS_ENCRYPTION_KEY;
  const previous = process.env.CHANNEL_CREDENTIALS_PREVIOUS_KEY;
  const rawKey = envelope.keyId === activeId ? active : previous;
  const key = parseKey(rawKey, envelope.keyId === activeId ? "CHANNEL_CREDENTIALS_ENCRYPTION_KEY" : "CHANNEL_CREDENTIALS_PREVIOUS_KEY");
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(envelope.iv, "base64"));
  decipher.setAuthTag(Buffer.from(envelope.tag, "base64"));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(envelope.ciphertext, "base64")),
    decipher.final(),
  ]);
  return JSON.parse(plaintext.toString("utf8")) as T;
}
