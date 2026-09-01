import crypto from 'crypto';
import { isIP } from 'net';
import { lookup } from 'dns/promises';
import { prisma } from './prisma';

export const WEBHOOK_EVENTS = ['lead.created', 'lead.updated', 'lead.stage_changed'] as const;
export const WEBHOOK_METHODS = ['POST', 'PUT', 'PATCH'] as const;

export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number];
export type WebhookMethod = (typeof WEBHOOK_METHODS)[number];
export type WebhookPayloadField = {
  key: string;
  sourceType: 'FIELD' | 'CUSTOM' | 'STATIC';
  source?: string;
  staticValue?: string;
  required?: boolean;
};

const SENSITIVE_KEY = /password|passwd|secret|token|authorization|cookie|api[-_]?key/i;

export function serializeWebhookLogPayload(value: unknown, maxLength = 16384) {
  const seen = new WeakSet<object>();
  const serialized = JSON.stringify(value, (key, item) => {
    if (key && SENSITIVE_KEY.test(key)) return '[REDACTED]';
    if (item && typeof item === 'object') {
      if (seen.has(item)) return '[CIRCULAR]';
      seen.add(item);
    }
    return item;
  });
  return (serialized || '').slice(0, maxLength);
}

type WebhookRecord = Record<string, unknown> & {
  customFields?: Record<string, unknown>;
};

function encryptionKey() {
  const secret = process.env.WEBHOOK_ENCRYPTION_KEY || process.env.NEXTAUTH_SECRET;
  if (!secret || secret.length < 24) throw new Error('Configure WEBHOOK_ENCRYPTION_KEY para armazenar headers com segurança.');
  return crypto.createHash('sha256').update(secret).digest();
}

export function encryptWebhookHeaders(headers: Record<string, string>) {
  if (Object.keys(headers).length === 0) return null;
  const blockedHeaders = new Set(['connection', 'content-length', 'cookie', 'host', 'transfer-encoding']);
  for (const [name, value] of Object.entries(headers)) {
    if (!/^[A-Za-z0-9!#$%&'*+.^_`|~-]+$/.test(name) || blockedHeaders.has(name.toLowerCase())) {
      throw new Error(`O header ${name || '(vazio)'} não é permitido.`);
    }
    if (/\r|\n/.test(value)) throw new Error(`O valor do header ${name} é inválido.`);
  }
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(headers), 'utf8'), cipher.final()]);
  return [iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), encrypted.toString('base64url')].join('.');
}

export function decryptWebhookHeaders(value?: string | null): Record<string, string> {
  if (!value) return {};
  const [iv, tag, encrypted] = value.split('.');
  if (!iv || !tag || !encrypted) throw new Error('Headers criptografados inválidos.');
  const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(iv, 'base64url'));
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  const clear = Buffer.concat([decipher.update(Buffer.from(encrypted, 'base64url')), decipher.final()]).toString('utf8');
  const parsed = JSON.parse(clear);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
  return Object.fromEntries(Object.entries(parsed).map(([key, headerValue]) => [key, String(headerValue)]));
}

export function parseWebhookPayloadFields(value?: string | null): WebhookPayloadField[] {
  if (!value) return [];
  const parsed = JSON.parse(value);
  if (!Array.isArray(parsed)) throw new Error('O mapeamento do payload precisa ser uma lista.');
  return parsed.map((field) => ({
    key: String(field.key || '').trim(),
    sourceType: field.sourceType,
    source: field.source ? String(field.source) : undefined,
    staticValue: field.staticValue === undefined ? undefined : String(field.staticValue),
    required: Boolean(field.required),
  }));
}

export function validatePayloadFields(fields: WebhookPayloadField[]) {
  const keys = new Set<string>();
  for (const field of fields) {
    if (!/^[A-Za-z_][A-Za-z0-9_.-]{0,63}$/.test(field.key)) throw new Error(`Chave de payload inválida: ${field.key || '(vazia)'}.`);
    if (keys.has(field.key)) throw new Error(`A chave ${field.key} está duplicada.`);
    keys.add(field.key);
    if (!['FIELD', 'CUSTOM', 'STATIC'].includes(field.sourceType)) throw new Error(`Origem inválida para ${field.key}.`);
    if (field.sourceType !== 'STATIC' && !field.source) throw new Error(`Selecione a origem de ${field.key}.`);
  }
}

export function buildWebhookPayload(record: WebhookRecord, fields: WebhookPayloadField[]) {
  validatePayloadFields(fields);
  const payload: Record<string, unknown> = {};
  for (const field of fields) {
    const value = field.sourceType === 'STATIC'
      ? field.staticValue
      : field.sourceType === 'CUSTOM'
        ? record.customFields?.[field.source || '']
        : record[field.source || ''];
    if (field.required && (value === undefined || value === null || value === '')) {
      throw new Error(`O campo obrigatório ${field.key} não possui valor.`);
    }
    if (value !== undefined) payload[field.key] = value;
  }
  return payload;
}

function isPrivateAddress(address: string) {
  const mappedIpv4 = address.toLowerCase().match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)?.[1];
  if (mappedIpv4) return isPrivateAddress(mappedIpv4);
  if (address === '::1' || address === '::' || address.startsWith('fe80:') || address.startsWith('fc') || address.startsWith('fd')) return true;
  if (isIP(address) === 4) {
    const [a, b] = address.split('.').map(Number);
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
  }
  return false;
}

export async function assertSafeWebhookUrl(rawUrl: string) {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error('Informe uma URL válida.');
  }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw new Error('Use uma URL HTTP ou HTTPS sem credenciais embutidas.');
  }
  const hostname = url.hostname.toLowerCase();
  if (['localhost', '0.0.0.0'].includes(hostname) || hostname.endsWith('.local') || hostname.endsWith('.internal')) {
    throw new Error('URLs locais não são permitidas.');
  }
  const addresses = await lookup(url.hostname, { all: true });
  if (addresses.length === 0 || addresses.some(({ address }) => isPrivateAddress(address))) {
    throw new Error('A URL precisa apontar para um endereço público.');
  }
  return url.toString();
}

export async function webhookRecordForLead(projectId: string, leadId: string, event: WebhookEvent): Promise<WebhookRecord> {
  const lead = await prisma.lead.findFirst({
    where: { id: leadId, projectId },
    include: {
      customFieldValues: { include: { definition: true } },
      pipelineEntries: true,
    },
  });
  if (!lead) throw new Error('Lead não encontrado para envio do webhook.');
  const activeEntry = lead.pipelineEntries.find((entry) => entry.status === 'ACTIVE') || lead.pipelineEntries[0];
  const customFields = Object.fromEntries(
    lead.customFieldValues.flatMap((item) => [
      [item.definition.internalName, item.value],
      [item.definition.id, item.value],
    ]),
  );
  return {
    event,
    id: lead.id,
    name: lead.name,
    email: lead.email,
    phone: lead.phone,
    company: lead.company,
    priority: lead.priority,
    originId: lead.originId,
    assignedUserId: lead.assignedUserId,
    pipelineId: activeEntry?.pipelineId,
    stageId: activeEntry?.stageId,
    value: activeEntry?.value,
    createdAt: lead.createdAt.toISOString(),
    updatedAt: lead.updatedAt.toISOString(),
    customFields,
  };
}

export async function deliverWebhook(
  webhook: {
    id: string;
    url: string | null;
    method: string;
    payloadFields: string;
    headersEncrypted: string | null;
    timeoutMs: number;
  },
  event: string,
  record: WebhookRecord,
  attempt = 1,
) {
  let payload: Record<string, unknown> = {};
  try {
    payload = buildWebhookPayload(record, parseWebhookPayloadFields(webhook.payloadFields));
    return deliverPreparedWebhook(webhook, event, payload, attempt);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Falha desconhecida no envio.';
    await prisma.webhookLog.create({
      data: {
        webhookId: webhook.id,
        event,
        payload: serializeWebhookLogPayload(payload),
        status: 'ERROR',
        errorDetails: message.slice(0, 1000),
        attempt,
        durationMs: 0,
      },
    });
    return { success: false, statusCode: null, responseBody: message };
  }
}

export async function deliverPreparedWebhook(
  webhook: {
    id: string;
    url: string | null;
    method: string;
    headersEncrypted: string | null;
    timeoutMs: number;
  },
  event: string,
  payload: Record<string, unknown>,
  attempt = 1,
) {
  const startedAt = Date.now();
  try {
    if (!webhook.url) throw new Error('Webhook sem URL configurada.');
    const url = await assertSafeWebhookUrl(webhook.url);
    const response = await fetch(url, {
      method: webhook.method,
      headers: { 'content-type': 'application/json', ...decryptWebhookHeaders(webhook.headersEncrypted) },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(Math.min(Math.max(webhook.timeoutMs, 1000), 30000)),
      redirect: 'manual',
    });
    const responseBody = (await response.text()).slice(0, 4096);
    const status = response.ok ? 'SUCCESS' : 'ERROR';
    await prisma.webhookLog.create({
      data: {
        webhookId: webhook.id,
        event,
        payload: serializeWebhookLogPayload(payload),
        status,
        statusCode: response.status,
        responseBody,
        errorDetails: response.ok ? null : `O destino respondeu com HTTP ${response.status}.`,
        attempt,
        durationMs: Date.now() - startedAt,
      },
    });
    return { success: response.ok, statusCode: response.status, responseBody };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Falha desconhecida no envio.';
    await prisma.webhookLog.create({
      data: {
        webhookId: webhook.id,
        event,
        payload: serializeWebhookLogPayload(payload),
        status: 'ERROR',
        errorDetails: message.slice(0, 1000),
        attempt,
        durationMs: Date.now() - startedAt,
      },
    });
    return { success: false, statusCode: null, responseBody: message };
  }
}

export async function dispatchLeadWebhooks(projectId: string, leadId: string, event: WebhookEvent) {
  const webhooks = await prisma.webhookEndpoint.findMany({
    where: { projectId, direction: 'OUTGOING', isActive: true, deletedAt: null },
  });
  const matching = webhooks.filter((webhook) => {
    try {
      return (JSON.parse(webhook.events) as string[]).includes(event);
    } catch {
      return false;
    }
  });
  if (matching.length === 0) return [];
  const record = await webhookRecordForLead(projectId, leadId, event);
  return Promise.all(matching.map((webhook) => deliverWebhook(webhook, event, record)));
}
