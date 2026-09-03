import { assertOutboundDisabled } from "@/lib/env";
import type { ProviderAdapter } from "./types";

export const metaWhatsAppProvider: ProviderAdapter = {
  provider: "META_WHATSAPP",
  capabilities: {
    connect: true, inbound: true, freeformOutbound: false, templates: true,
    campaigns: false, markAsRead: false, mediaTypes: ["IMAGE", "DOCUMENT", "AUDIO", "VIDEO", "STICKER"], requiresCustomerCareWindow: true,
  },
  async dispatch() {
    assertOutboundDisabled();
    return { status: "BLOCKED", reason: "META_WHATSAPP_OUTBOUND_REQUIRES_ISOLATED_PILOT" };
  },
};
