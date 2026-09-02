export const PROJECT_FEATURE_KEYS = [
  "omnichannel_foundation",
  "meta_whatsapp",
  "meta_instagram",
  "campaigns",
  "automations",
  "realtime_inbox",
  "object_storage",
  "evolution_dual_write",
] as const;

export type ProjectFeatureKey = (typeof PROJECT_FEATURE_KEYS)[number];

export function isProjectFeatureKey(value: string): value is ProjectFeatureKey {
  return PROJECT_FEATURE_KEYS.includes(value as ProjectFeatureKey);
}
