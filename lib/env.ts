export function isOutboundDisabled() {
  return process.env.OUTBOUND_INTEGRATIONS_DISABLED !== "false";
}

export function assertOutboundDisabled() {
  if (!isOutboundDisabled()) {
    throw new Error("Foundation processes require OUTBOUND_INTEGRATIONS_DISABLED=true.");
  }
}

export function requireRedisUrl() {
  const value = process.env.REDIS_URL;
  if (!value) throw new Error("REDIS_URL is required.");
  return value;
}

export function deploymentEnvironment() {
  return process.env.DEPLOYMENT_ENV || "unknown";
}
