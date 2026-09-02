export type ServiceRole = "web" | "worker" | "scheduler";

export function requireEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

export function requiredBoolean(name: string) {
  const value = requireEnv(name);
  if (value !== "true" && value !== "false") throw new Error(`${name} must be explicitly true or false.`);
  return value === "true";
}

export function isOutboundDisabled() {
  return requiredBoolean("OUTBOUND_INTEGRATIONS_DISABLED");
}

export function assertOutboundDisabled() {
  if (!isOutboundDisabled()) throw new Error("Foundation processes require OUTBOUND_INTEGRATIONS_DISABLED=true.");
}

export function requireRedisUrl() {
  return requireEnv("REDIS_URL");
}

export function deploymentEnvironment() {
  return requireEnv("DEPLOYMENT_ENV");
}

export function queuePrefix() {
  return requireEnv("QUEUE_PREFIX");
}

const commonRequired = [
  "DEPLOYMENT_ENV",
  "OUTBOUND_INTEGRATIONS_DISABLED",
  "DATABASE_URL",
  "REDIS_URL",
  "QUEUE_PREFIX",
  "CHANNEL_CREDENTIALS_ENCRYPTION_KEY",
  "CHANNEL_CREDENTIALS_KEY_ID",
  "PROVIDER_EVENT_ENCRYPTION_KEY",
  "PROVIDER_EVENT_KEY_ID",
] as const;

export function validateServiceEnvironment(role: ServiceRole) {
  for (const name of commonRequired) requireEnv(name);
  requiredBoolean("OUTBOUND_INTEGRATIONS_DISABLED");
  if (role === "web") {
    for (const name of ["META_WEBHOOK_VERIFY_TOKEN", "META_APP_SECRET", "NEXTAUTH_URL", "NEXTAUTH_SECRET"] as const) requireEnv(name);
  }
  const environment = deploymentEnvironment();
  const prefix = queuePrefix();
  if (!prefix.toLowerCase().includes(environment.toLowerCase())) {
    throw new Error("QUEUE_PREFIX must contain DEPLOYMENT_ENV to prevent cross-environment consumption.");
  }
  return { role, environment, outboundDisabled: isOutboundDisabled(), queuePrefix: prefix };
}
