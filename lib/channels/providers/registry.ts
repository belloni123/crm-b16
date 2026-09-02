import { evolutionProvider } from "./evolution";
import { metaInstagramProvider } from "./meta-instagram";
import { metaWhatsAppProvider } from "./meta-whatsapp";
import type { ChannelProvider, ProviderAdapter } from "./types";

const providers: Record<ChannelProvider, ProviderAdapter> = {
  EVOLUTION: evolutionProvider,
  META_WHATSAPP: metaWhatsAppProvider,
  META_INSTAGRAM: metaInstagramProvider,
};

export function getProvider(provider: ChannelProvider) {
  return providers[provider];
}
