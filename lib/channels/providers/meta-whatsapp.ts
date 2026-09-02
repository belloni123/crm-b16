import { assertOutboundDisabled } from "@/lib/env";
import type { ProviderAdapter } from "./types";

export const metaWhatsAppProvider: ProviderAdapter = {
  provider: "META_WHATSAPP",
  capabilities: {
    connect: false, inbound: false, freeformOutbound: false, templates: false,
    campaigns: false, markAsRead: false, mediaTypes: [], requiresCustomerCareWindow: true,
  },
  async dispatch() {
    assertOutboundDisabled();
    return { status: "BLOCKED", reason: "META_WHATSAPP_DISABLED_IN_PHASE_1B" };
  },
};
