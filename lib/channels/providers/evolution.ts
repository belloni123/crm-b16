import { assertOutboundDisabled } from "@/lib/env";
import type { ProviderAdapter } from "./types";

export const evolutionProvider: ProviderAdapter = {
  provider: "EVOLUTION",
  capabilities: {
    connect: true, inbound: true, freeformOutbound: true, templates: false,
    campaigns: false, markAsRead: true, mediaTypes: ["IMAGE", "DOCUMENT", "AUDIO", "VIDEO"],
    requiresCustomerCareWindow: false,
  },
  async dispatch() {
    assertOutboundDisabled();
    return { status: "BLOCKED", reason: "FOUNDATION_ONLY_LEGACY_FLOW_UNCHANGED" };
  },
};
