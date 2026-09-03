import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { encryptChannelCredentials } from "@/lib/channels/credentials";
import { debugMetaToken, exchangeEmbeddedSignupCode, MetaGraphClient } from "./graph-client";
import type { MetaTokenDebug } from "./graph-client";

const REQUIRED_SCOPES = ["whatsapp_business_management", "whatsapp_business_messaging"];
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const randomToken = () => randomBytes(32).toString("base64url");

export async function createMetaOnboardingSession(projectId: string, userId: string) {
  await prisma.metaOnboardingSession.deleteMany({ where: { expiresAt: { lt: new Date() } } });
  const state = randomToken();
  const nonce = randomToken();
  const session = await prisma.$transaction(async (tx) => {
    const created = await tx.metaOnboardingSession.create({ data: { projectId, userId, stateHash: hash(state), nonceHash: hash(nonce), expiresAt: new Date(Date.now() + 10 * 60_000) } });
    await tx.auditEvent.create({ data: { projectId, actorUserId: userId, action: "META_ONBOARDING_STARTED", resourceType: "MetaOnboardingSession", resourceId: created.id, metadataRedacted: JSON.stringify({ ttlSeconds: 600 }) } });
    return created;
  });
  return { sessionId: session.id, state, nonce, appId: process.env.META_APP_ID!, configId: process.env.META_CONFIG_ID!, graphVersion: process.env.META_GRAPH_API_VERSION || "v24.0", sessionInfoVersion: process.env.META_EMBEDDED_SIGNUP_VERSION || "3" };
}

function safeHashEqual(value: string, expected: string) {
  const supplied = Buffer.from(hash(value));
  const stored = Buffer.from(expected);
  return supplied.length === stored.length && timingSafeEqual(supplied, stored);
}

type CompleteInput = { projectId: string; userId: string; sessionId: string; state: string; nonce: string; code: string; wabaId: string; phoneNumberId: string };

export function validateMetaTokenAccess(debug: MetaTokenDebug, wabaId: string, now = Date.now()) {
  if (!debug.is_valid || debug.app_id !== process.env.META_APP_ID) throw new Error("META_TOKEN_APP_MISMATCH");
  if (debug.expires_at && debug.expires_at * 1000 <= now) throw new Error("META_TOKEN_EXPIRED");
  const scopes = new Set([...(debug.scopes || []), ...(debug.granular_scopes || []).map((item) => item.scope)]);
  if (REQUIRED_SCOPES.some((scope) => !scopes.has(scope))) throw new Error("META_REQUIRED_SCOPES_MISSING");
  const wabaTargets = new Set((debug.granular_scopes || []).filter((item) => item.scope === "whatsapp_business_management" || item.scope === "whatsapp_business_messaging").flatMap((item) => item.target_ids || []));
  if (wabaTargets.size && !wabaTargets.has(wabaId)) throw new Error("META_WABA_NOT_GRANTED");
}

export async function completeMetaOnboarding(input: CompleteInput) {
  const claimed = await prisma.metaOnboardingSession.updateMany({ where: { id: input.sessionId, projectId: input.projectId, userId: input.userId, status: "PENDING", usedAt: null, expiresAt: { gt: new Date() } }, data: { status: "PROCESSING", usedAt: new Date() } });
  if (!claimed.count) throw new Error("META_ONBOARDING_SESSION_INVALID");
  const session = await prisma.metaOnboardingSession.findUniqueOrThrow({ where: { id: input.sessionId } });
  if (!safeHashEqual(input.state, session.stateHash) || !safeHashEqual(input.nonce, session.nonceHash)) {
    await prisma.metaOnboardingSession.update({ where: { id: session.id }, data: { status: "FAILED", errorCode: "META_ONBOARDING_CSRF_FAILED" } });
    throw new Error("META_ONBOARDING_CSRF_FAILED");
  }
  try {
    const redirectUri = `${process.env.NEXTAUTH_URL}/meta/callback`;
    const exchanged = await exchangeEmbeddedSignupCode(input.code, redirectUri);
    const debug = await debugMetaToken(exchanged.accessToken);
    validateMetaTokenAccess(debug, input.wabaId);

    const graph = new MetaGraphClient(exchanged.accessToken);
    const waba = await graph.get<{ id: string; name?: string; account_review_status?: string; owner_business_info?: { business_id?: string; name?: string } }>(`/${encodeURIComponent(input.wabaId)}?fields=id,name,account_review_status,owner_business_info`);
    const phones = await graph.get<{ data?: Array<{ id: string; display_phone_number?: string; verified_name?: string; quality_rating?: string; status?: string }> }>(`/${encodeURIComponent(input.wabaId)}/phone_numbers?fields=id,display_phone_number,verified_name,quality_rating,status`);
    const phone = phones.data?.find((item) => item.id === input.phoneNumberId);
    if (!phone || waba.id !== input.wabaId) throw new Error("META_PHONE_NOT_IN_WABA");
    if (phone.status && phone.status !== "CONNECTED") throw new Error("META_PHONE_NOT_CONNECTED");
    await graph.post(`/${encodeURIComponent(input.wabaId)}/subscribed_apps`);
    const subscriptions = await graph.get<{ data?: Array<{ id?: string }> }>(`/${encodeURIComponent(input.wabaId)}/subscribed_apps`);
    if (!subscriptions.data?.some((item) => item.id === process.env.META_APP_ID)) throw new Error("META_WABA_SUBSCRIPTION_NOT_CONFIRMED");

    const encrypted = encryptChannelCredentials({ accessToken: exchanged.accessToken });
    const tokenExpiresAt = debug.expires_at ? new Date(debug.expires_at * 1000) : exchanged.expiresIn ? new Date(Date.now() + exchanged.expiresIn * 1000) : null;
    const existing = await prisma.channelConnection.findFirst({ where: { projectId: input.projectId, provider: "META_WHATSAPP", externalPhoneNumberId: input.phoneNumberId } });
    const data = {
      externalBusinessId: waba.owner_business_info?.business_id || null, externalWabaId: input.wabaId, externalPhoneNumberId: input.phoneNumberId,
      credentialsEncrypted: encrypted, credentialsKeyId: process.env.CHANNEL_CREDENTIALS_KEY_ID!, tokenExpiresAt,
      name: phone.verified_name || waba.name || "WhatsApp oficial", status: "CONNECTED", isActive: true, archivedAt: null,
      lastHealthAt: new Date(), lastErrorCode: null,
      capabilitiesSnapshot: JSON.stringify({ scopes: REQUIRED_SCOPES, qualityRating: phone.quality_rating || null, phoneStatus: phone.status || null }),
      metadata: JSON.stringify({ displayPhoneMasked: phone.display_phone_number ? `***${phone.display_phone_number.replace(/\D/g, "").slice(-4)}` : null, wabaName: waba.name || null, accountReviewStatus: waba.account_review_status || null }),
    };
    const connection = existing
      ? await prisma.channelConnection.update({ where: { id: existing.id }, data })
      : await prisma.channelConnection.create({ data: { projectId: input.projectId, provider: "META_WHATSAPP", channel: "WHATSAPP", ...data } });
    await prisma.$transaction([
      prisma.metaOnboardingSession.update({ where: { id: session.id }, data: { status: "COMPLETED", channelConnectionId: connection.id } }),
      prisma.auditEvent.create({ data: { projectId: input.projectId, actorUserId: input.userId, action: "META_WHATSAPP_CONNECTED", resourceType: "ChannelConnection", resourceId: connection.id, metadataRedacted: JSON.stringify({ wabaSuffix: input.wabaId.slice(-4), phoneSuffix: input.phoneNumberId.slice(-4), scopes: REQUIRED_SCOPES }) } }),
    ]);
    return connection.id;
  } catch (error) {
    const code = error instanceof Error ? error.message.slice(0, 100) : "META_ONBOARDING_FAILED";
    await prisma.metaOnboardingSession.update({ where: { id: session.id }, data: { status: "FAILED", errorCode: code } });
    throw error;
  }
}

export function requiredMetaScopes() { return [...REQUIRED_SCOPES]; }
