export const INCOMING_SYSTEM_FIELDS = [
  { key: 'name', label: 'Nome do lead' },
  { key: 'email', label: 'E-mail' },
  { key: 'phone', label: 'WhatsApp / telefone' },
  { key: 'company', label: 'Empresa' },
  { key: 'value', label: 'Valor estimado' },
  { key: 'priority', label: 'Prioridade' },
  { key: 'utmSource', label: 'UTM Source' },
  { key: 'utmMedium', label: 'UTM Medium' },
  { key: 'utmCampaign', label: 'UTM Campaign' },
  { key: 'utmContent', label: 'UTM Content' },
  { key: 'utmTerm', label: 'UTM Term' },
  { key: 'referrer', label: 'Referência' },
  { key: 'landingPage', label: 'Página de entrada' },
] as const;

export type IncomingSystemField = (typeof INCOMING_SYSTEM_FIELDS)[number]['key'];

export type IncomingWebhookField = {
  destinationType: 'SYSTEM' | 'CUSTOM';
  destination: string;
  sourcePath: string;
  required?: boolean;
};

export type IncomingWebhookMapping = {
  version: 2;
  fields: IncomingWebhookField[];
};

export class IncomingWebhookPayloadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'IncomingWebhookPayloadError';
  }
}

const SYSTEM_FIELD_KEYS = new Set<string>(INCOMING_SYSTEM_FIELDS.map((field) => field.key));
const BLOCKED_PATH_PARTS = new Set(['__proto__', 'prototype', 'constructor']);
const SOURCE_PATH = /^[A-Za-z0-9_$-]+(?:\.[A-Za-z0-9_$-]+)*$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function validateIncomingWebhookFields(fields: IncomingWebhookField[]) {
  if (!Array.isArray(fields) || fields.length === 0) {
    throw new Error('Adicione pelo menos um campo ao webhook de entrada.');
  }
  if (fields.length > 50) {
    throw new Error('Um webhook de entrada pode mapear no máximo 50 campos.');
  }

  const destinations = new Set<string>();
  for (const field of fields) {
    if (!['SYSTEM', 'CUSTOM'].includes(field.destinationType)) {
      throw new Error('O tipo de destino de um campo do webhook é inválido.');
    }
    if (!field.destination || field.destination.length > 120) {
      throw new Error('Selecione um destino válido para todos os campos.');
    }
    if (field.destinationType === 'SYSTEM' && !SYSTEM_FIELD_KEYS.has(field.destination)) {
      throw new Error(`O campo padrão ${field.destination} não é suportado.`);
    }

    const sourcePath = field.sourcePath.trim().replace(/^body\./, '');
    const parts = sourcePath.split('.');
    if (!sourcePath || sourcePath.length > 256 || !SOURCE_PATH.test(sourcePath) || parts.some((part) => BLOCKED_PATH_PARTS.has(part))) {
      throw new Error(`O caminho ${field.sourcePath || '(vazio)'} não é válido.`);
    }

    const destinationKey = `${field.destinationType}:${field.destination}`;
    if (destinations.has(destinationKey)) {
      throw new Error('Cada campo do CRM pode aparecer apenas uma vez no mapeamento.');
    }
    destinations.add(destinationKey);
  }
}

export function serializeIncomingWebhookMapping(fields: IncomingWebhookField[]) {
  const normalized = fields.map((field) => ({
    destinationType: field.destinationType,
    destination: field.destination,
    sourcePath: field.sourcePath.trim().replace(/^body\./, ''),
    required: Boolean(field.required),
  }));
  validateIncomingWebhookFields(normalized);
  return JSON.stringify({ version: 2, fields: normalized } satisfies IncomingWebhookMapping);
}

export function parseIncomingWebhookMapping(raw?: string | null): IncomingWebhookField[] {
  let parsed: unknown = {};
  try {
    parsed = JSON.parse(raw || '{}');
  } catch {
    throw new Error('O mapeamento salvo neste webhook não é um JSON válido.');
  }

  if (isRecord(parsed) && parsed.version === 2 && Array.isArray(parsed.fields)) {
    const fields = parsed.fields.map((field) => {
      if (!isRecord(field)) throw new Error('Um campo salvo no webhook é inválido.');
      return {
        destinationType: field.destinationType === 'CUSTOM' ? 'CUSTOM' as const : 'SYSTEM' as const,
        destination: String(field.destination || ''),
        sourcePath: String(field.sourcePath || ''),
        required: Boolean(field.required),
      };
    });
    validateIncomingWebhookFields(fields);
    return fields;
  }

  // Compatibilidade integral com o formato usado pelos webhooks existentes.
  const legacy = isRecord(parsed) ? parsed : {};
  const fields: IncomingWebhookField[] = [];
  for (const key of ['name', 'email', 'phone', 'company', 'value'] as const) {
    const sourcePath = legacy[key];
    if (typeof sourcePath === 'string' && sourcePath.trim()) {
      fields.push({
        destinationType: 'SYSTEM',
        destination: key,
        sourcePath: sourcePath.trim(),
        required: false,
      });
    }
  }
  if (isRecord(legacy.customFields)) {
    for (const [destination, sourcePath] of Object.entries(legacy.customFields)) {
      if (typeof sourcePath === 'string' && sourcePath.trim()) {
        fields.push({
          destinationType: 'CUSTOM',
          destination,
          sourcePath: sourcePath.trim(),
          required: false,
        });
      }
    }
  }

  if (fields.length === 0) {
    return [
      { destinationType: 'SYSTEM', destination: 'name', sourcePath: 'name', required: false },
      { destinationType: 'SYSTEM', destination: 'email', sourcePath: 'email', required: false },
      { destinationType: 'SYSTEM', destination: 'phone', sourcePath: 'phone', required: false },
    ];
  }
  validateIncomingWebhookFields(fields);
  return fields;
}

export function getIncomingWebhookValue(payload: unknown, path: string): unknown {
  if (!isRecord(payload)) return undefined;
  const cleanPath = path.trim().replace(/^body\./, '');
  let current: unknown = payload;
  for (const part of cleanPath.split('.')) {
    if (BLOCKED_PATH_PARTS.has(part) || (!isRecord(current) && !Array.isArray(current))) return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

export function extractIncomingWebhookValues(payload: unknown, fields: IncomingWebhookField[]) {
  validateIncomingWebhookFields(fields);
  const system: Partial<Record<IncomingSystemField, unknown>> = {};
  const custom: Record<string, unknown> = {};

  for (const field of fields) {
    const value = getIncomingWebhookValue(payload, field.sourcePath);
    if (field.required && (value === undefined || value === null || value === '')) {
      throw new IncomingWebhookPayloadError(`O campo obrigatório ${field.sourcePath} não foi recebido.`);
    }
    if (value === undefined) continue;
    if (field.destinationType === 'CUSTOM') custom[field.destination] = value;
    else system[field.destination as IncomingSystemField] = value;
  }

  return { system, custom };
}
