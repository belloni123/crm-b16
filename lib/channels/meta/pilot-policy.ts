export function normalizePilotPhone(value: string) { return value.replace(/\D/g, ""); }

export function validateMetaPilotPolicy(input: { environment?: string; outboundDisabled?: string; confirmation?: string; expiresAt?: string; allowlist?: string; recipient: string; now?: number }) {
  if (input.environment !== "staging") throw new Error("META_PILOT_STAGING_ONLY");
  if (input.outboundDisabled !== "true") throw new Error("UNIVERSAL_KILL_SWITCH_MUST_REMAIN_ENABLED");
  if (input.confirmation !== "SEND_ONE_META_MESSAGE") throw new Error("EXPLICIT_CONFIRMATION_REQUIRED");
  const expiresAt = Date.parse(input.expiresAt || "");
  if (!Number.isFinite(expiresAt) || expiresAt <= (input.now ?? Date.now())) throw new Error("META_PILOT_AUTHORIZATION_EXPIRED");
  const recipient = normalizePilotPhone(input.recipient);
  const allowlist = new Set((input.allowlist || "").split(",").map(normalizePilotPhone).filter(Boolean));
  if (!allowlist.has(recipient)) throw new Error("RECIPIENT_NOT_ALLOWLISTED");
  return recipient;
}
