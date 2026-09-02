import { isOutboundDisabled } from "@/lib/env";
import { structuredLog } from "@/lib/observability";

export type OutboundIntegration =
  | "EVOLUTION"
  | "META_WHATSAPP"
  | "META_INSTAGRAM"
  | "OUTGOING_WEBHOOK"
  | "SMTP"
  | "RESEND"
  | "GOOGLE_CALENDAR"
  | "MICROSOFT_CALENDAR"
  | "OBJECT_STORAGE";

export class OutboundBlockedError extends Error {
  readonly code = "OUTBOUND_INTEGRATIONS_DISABLED";
  constructor(readonly integration: OutboundIntegration, readonly operation: string) {
    super("External integration is disabled in this environment.");
    this.name = "OutboundBlockedError";
  }
}

export function outboundDecision(integration: OutboundIntegration, operation: string) {
  if (!isOutboundDisabled()) return { allowed: true as const };
  structuredLog("warn", "outbound.blocked", { integration, operation, errorCode: "OUTBOUND_INTEGRATIONS_DISABLED" });
  return { allowed: false as const, status: "BLOCKED" as const, reason: "OUTBOUND_INTEGRATIONS_DISABLED" };
}

export function assertOutboundAllowed(integration: OutboundIntegration, operation: string) {
  const decision = outboundDecision(integration, operation);
  if (!decision.allowed) throw new OutboundBlockedError(integration, operation);
}
