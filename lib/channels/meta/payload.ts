import { createHash } from "node:crypto";

export type MetaMessage = {
  id?: string; from?: string; timestamp?: string; type?: string;
  text?: { body?: string }; image?: { id?: string; caption?: string }; document?: { id?: string; caption?: string; filename?: string };
  audio?: { id?: string }; video?: { id?: string; caption?: string }; sticker?: { id?: string };
  location?: { latitude?: number; longitude?: number; name?: string; address?: string };
  contacts?: unknown[]; interactive?: unknown; button?: unknown; reaction?: unknown;
  context?: { id?: string };
};

export type MetaStatus = { id?: string; status?: string; timestamp?: string; errors?: Array<{ code?: number; title?: string }> };
export type MetaChangeValue = {
  messaging_product?: string;
  metadata?: { display_phone_number?: string; phone_number_id?: string };
  contacts?: Array<{ profile?: { name?: string }; wa_id?: string }>;
  messages?: MetaMessage[];
  statuses?: MetaStatus[];
};

export type MetaWebhookPayload = { object?: string; entry?: Array<{ id?: string; changes?: Array<{ field?: string; value?: MetaChangeValue }> }> };

export function eachMetaChange(payload: MetaWebhookPayload) {
  return (payload.entry || []).flatMap((entry, entryIndex) => (entry.changes || []).map((change, changeIndex) => ({ entry, entryIndex, change, changeIndex })));
}

export function metaChangeKey(entryId: string | undefined, value: MetaChangeValue | undefined, entryIndex: number, changeIndex: number) {
  const ids = [...(value?.messages || []).map((item) => item.id), ...(value?.statuses || []).map((item) => `${item.id}:${item.status}:${item.timestamp}`)].filter(Boolean);
  return `meta:${createHash("sha256").update(JSON.stringify({ entryId, ids, value, entryIndex, changeIndex })).digest("hex")}`;
}

const STATUS_ORDER: Record<string, number> = { ACCEPTED: 10, SENT: 20, DELIVERED: 30, READ: 40, FAILED: 50, DELETED: 60 };
export function normalizedDeliveryStatus(status: string | undefined) {
  const normalized = status?.toUpperCase();
  return normalized && normalized in STATUS_ORDER ? normalized : null;
}
export function canAdvanceDelivery(current: string, next: string) {
  if (next === "FAILED" || next === "DELETED") return current !== "READ" && current !== "DELETED";
  return (STATUS_ORDER[next] || 0) > (STATUS_ORDER[current] || 0);
}

export function metaMessageContent(message: MetaMessage) {
  if (message.type === "text") return { type: "TEXT", content: message.text?.body || "" };
  const media = ["image", "document", "audio", "video", "sticker"].includes(message.type || "") ? message[message.type as "image"] as { id?: string; caption?: string; filename?: string } | undefined : undefined;
  if (media) return { type: (message.type || "unknown").toUpperCase(), content: media.caption || media.filename || `[${message.type}]`, mediaId: media.id };
  if (message.type === "location") return { type: "LOCATION", content: JSON.stringify(message.location || {}) };
  if (message.type === "contacts") return { type: "CONTACTS", content: "[contatos]" };
  if (["interactive", "button", "reaction"].includes(message.type || "")) return { type: (message.type || "unknown").toUpperCase(), content: `[${message.type}]` };
  return { type: "UNKNOWN", content: `[mensagem ${message.type || "desconhecida"}]` };
}
