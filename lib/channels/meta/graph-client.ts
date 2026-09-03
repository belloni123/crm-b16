import { randomUUID } from "node:crypto";
import { structuredLog } from "@/lib/observability";

export const META_GRAPH_API_VERSION = process.env.META_GRAPH_API_VERSION || "v24.0";
const GRAPH_BASE = "https://graph.facebook.com";

type GraphErrorBody = { error?: { message?: string; type?: string; code?: number; error_subcode?: number; is_transient?: boolean } };

export class MetaGraphError extends Error {
  constructor(public readonly code: string, public readonly status: number, public readonly retryable: boolean) {
    super(code);
  }
}

function classify(status: number, body: GraphErrorBody) {
  const code = body.error?.code;
  if (status === 401 || status === 403 || code === 190) return { code: "META_AUTHORIZATION_FAILED", retryable: false };
  if (status === 429 || code === 4 || code === 17 || code === 80004) return { code: "META_RATE_LIMITED", retryable: true };
  if (status >= 500 || body.error?.is_transient) return { code: "META_TRANSIENT_ERROR", retryable: true };
  return { code: "META_GRAPH_REJECTED", retryable: false };
}

export class MetaGraphClient {
  constructor(
    private readonly accessToken?: string,
    private readonly fetcher: typeof fetch = fetch,
    private readonly timeoutMs = Number(process.env.META_GRAPH_TIMEOUT_MS || 10_000),
  ) {}

  async request<T>(path: string, init: RequestInit & { safeRetry?: boolean } = {}): Promise<T> {
    if (!path.startsWith("/")) throw new Error("META_GRAPH_PATH_INVALID");
    if (!/^v\d+\.\d+$/.test(META_GRAPH_API_VERSION)) throw new Error("META_GRAPH_VERSION_INVALID");
    const method = (init.method || "GET").toUpperCase();
    const attempts = init.safeRetry && method === "GET" ? 3 : 1;
    const correlationId = randomUUID();
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);
      try {
        const response = await this.fetcher(`${GRAPH_BASE}/${META_GRAPH_API_VERSION}${path}`, {
          ...init,
          headers: {
            accept: "application/json",
            ...(init.body ? { "content-type": "application/json" } : {}),
            ...(this.accessToken ? { authorization: `Bearer ${this.accessToken}` } : {}),
            "user-agent": "CLAVE-CRM-MetaPilot/2A",
            ...init.headers,
          },
          signal: controller.signal,
        });
        const body = await response.json().catch(() => ({})) as T & GraphErrorBody;
        if (response.ok) return body;
        const classified = classify(response.status, body);
        structuredLog("warn", "meta.graph.rejected", { correlationId, status: response.status, errorCode: classified.code, attempt, path });
        if (!classified.retryable || attempt === attempts) throw new MetaGraphError(classified.code, response.status, classified.retryable);
      } catch (error) {
        if (error instanceof MetaGraphError && (!error.retryable || attempt === attempts)) throw error;
        if (attempt === attempts) throw new MetaGraphError("META_GRAPH_UNAVAILABLE", 503, true);
      } finally {
        clearTimeout(timer);
      }
      await new Promise((resolve) => setTimeout(resolve, Math.min(1000, 100 * (2 ** (attempt - 1)))));
    }
    throw new MetaGraphError("META_GRAPH_UNAVAILABLE", 503, true);
  }

  get<T>(path: string) { return this.request<T>(path, { safeRetry: true }); }
  post<T>(path: string, body?: unknown) { return this.request<T>(path, { method: "POST", body: body === undefined ? undefined : JSON.stringify(body) }); }
  delete<T>(path: string) { return this.request<T>(path, { method: "DELETE" }); }
}

export async function exchangeEmbeddedSignupCode(code: string, redirectUri: string, fetcher: typeof fetch = fetch) {
  const appId = process.env.META_APP_ID;
  const appSecret = process.env.META_APP_SECRET;
  if (!appId || !appSecret) throw new Error("META_APP_CREDENTIALS_MISSING");
  const response = await fetcher(`${GRAPH_BASE}/${META_GRAPH_API_VERSION}/oauth/access_token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
    body: new URLSearchParams({ client_id: appId, client_secret: appSecret, code, redirect_uri: redirectUri }),
    signal: AbortSignal.timeout(Number(process.env.META_GRAPH_TIMEOUT_MS || 10_000)),
  });
  const body = await response.json().catch(() => ({})) as { access_token?: string; expires_in?: number } & GraphErrorBody;
  if (!response.ok || !body.access_token) throw new MetaGraphError(classify(response.status, body).code, response.status, false);
  return { accessToken: body.access_token, expiresIn: body.expires_in };
}

export async function debugMetaToken(inputToken: string, fetcher: typeof fetch = fetch) {
  const appId = process.env.META_APP_ID;
  const appSecret = process.env.META_APP_SECRET;
  if (!appId || !appSecret) throw new Error("META_APP_CREDENTIALS_MISSING");
  const response = await fetcher(`${GRAPH_BASE}/${META_GRAPH_API_VERSION}/debug_token`, {
    method: "POST",
    headers: { authorization: `Bearer ${appId}|${appSecret}`, "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
    body: new URLSearchParams({ input_token: inputToken }),
    signal: AbortSignal.timeout(Number(process.env.META_GRAPH_TIMEOUT_MS || 10_000)),
  });
  const body = await response.json().catch(() => ({})) as { data?: MetaTokenDebug } & GraphErrorBody;
  if (!response.ok || !body.data) throw new MetaGraphError(classify(response.status, body).code, response.status, false);
  return body.data;
}

export type MetaTokenDebug = {
  app_id?: string; is_valid?: boolean; expires_at?: number; scopes?: string[];
  granular_scopes?: Array<{ scope: string; target_ids?: string[] }>;
};
