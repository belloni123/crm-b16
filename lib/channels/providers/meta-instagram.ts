import { assertOutboundDisabled } from "@/lib/env";
import type { ProviderAdapter } from "./types";

export const metaInstagramProvider: ProviderAdapter = {
  provider: "META_INSTAGRAM",
  capabilities: {
    connect: false, inbound: false, freeformOutbound: false, templates: false,
    campaigns: false, markAsRead: false, mediaTypes: [], requiresCustomerCareWindow: true,
  },
  async dispatch() {
    assertOutboundDisabled();
    return { status: "BLOCKED", reason: "META_INSTAGRAM_DISABLED_IN_PHASE_1B" };
  },
};
