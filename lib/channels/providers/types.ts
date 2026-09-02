export type ChannelProvider = "EVOLUTION" | "META_WHATSAPP" | "META_INSTAGRAM";

export type ProviderCapabilities = {
  connect: boolean;
  inbound: boolean;
  freeformOutbound: boolean;
  templates: boolean;
  campaigns: boolean;
  markAsRead: boolean;
  mediaTypes: readonly string[];
  requiresCustomerCareWindow: boolean;
};

export type ProviderDispatch = {
  projectId: string;
  connectionId: string;
  idempotencyKey: string;
  kind: "MESSAGE" | "MARK_AS_READ";
  payload: Record<string, unknown>;
};

export interface ProviderAdapter {
  readonly provider: ChannelProvider;
  readonly capabilities: ProviderCapabilities;
  dispatch(request: ProviderDispatch): Promise<{ status: "BLOCKED"; reason: string }>;
}
