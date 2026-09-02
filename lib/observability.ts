const sensitiveKeys = /token|secret|password|authorization|payload|content|email|phone/i;

export function redact(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redact);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, sensitiveKeys.test(key) ? "[REDACTED]" : redact(item)]));
}

export function structuredLog(level: "info" | "warn" | "error", event: string, data: Record<string, unknown> = {}) {
  const safeData = redact(data) as Record<string, unknown>;
  const entry = JSON.stringify({ timestamp: new Date().toISOString(), level, event, ...safeData });
  if (level === "error") console.error(entry);
  else if (level === "warn") console.warn(entry);
  else console.info(entry);
}
