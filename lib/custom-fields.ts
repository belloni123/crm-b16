export const CUSTOM_FIELD_TYPES = [
  'TEXT',
  'LONG_TEXT',
  'NUMBER',
  'CURRENCY',
  'DATE',
  'DATETIME',
  'PHONE',
  'EMAIL',
  'URL',
  'SELECT',
  'MULTI_SELECT',
  'CHECKBOX',
  'BOOLEAN',
] as const;

export type CustomFieldType = (typeof CUSTOM_FIELD_TYPES)[number];

export type CustomFieldValidationRules = {
  min?: number;
  max?: number;
  pattern?: string;
};

export function normalizeInternalName(input: string) {
  return input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 64);
}

export function parseFieldOptions(options?: string | null): string[] {
  if (!options) return [];
  try {
    const parsed = JSON.parse(options);
    if (!Array.isArray(parsed)) return [];
    return [...new Set(parsed.map(String).map((item) => item.trim()).filter(Boolean))];
  } catch {
    return [];
  }
}

export function parseValidationRules(rules?: string | null): CustomFieldValidationRules {
  if (!rules) return {};
  try {
    const parsed = JSON.parse(rules);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return {
      min: typeof parsed.min === 'number' ? parsed.min : undefined,
      max: typeof parsed.max === 'number' ? parsed.max : undefined,
      pattern: typeof parsed.pattern === 'string' ? parsed.pattern.slice(0, 200) : undefined,
    };
  } catch {
    return {};
  }
}

export function normalizeCustomFieldValue(
  type: CustomFieldType,
  rawValue: unknown,
  options: string[] = [],
  rules: CustomFieldValidationRules = {},
) {
  if (rawValue === null || rawValue === undefined || rawValue === '') return '';

  let value = String(rawValue).trim();

  if (type === 'NUMBER' || type === 'CURRENCY') {
    const number = Number(value.replace(',', '.'));
    if (!Number.isFinite(number)) throw new Error('Informe um número válido.');
    if (rules.min !== undefined && number < rules.min) throw new Error(`O valor mínimo é ${rules.min}.`);
    if (rules.max !== undefined && number > rules.max) throw new Error(`O valor máximo é ${rules.max}.`);
    return String(number);
  }

  if (type === 'DATE' || type === 'DATETIME') {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) throw new Error('Informe uma data válida.');
    return type === 'DATE' ? date.toISOString().slice(0, 10) : date.toISOString();
  }

  if (type === 'EMAIL' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
    throw new Error('Informe um e-mail válido.');
  }

  if (type === 'URL') {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Informe uma URL HTTP ou HTTPS válida.');
    value = url.toString();
  }

  if (type === 'PHONE') value = value.replace(/[^\d+]/g, '');

  if (type === 'CHECKBOX' || type === 'BOOLEAN') {
    return ['true', '1', 'sim', 'yes', 'on'].includes(value.toLowerCase()) ? 'true' : 'false';
  }

  if (type === 'SELECT' && !options.includes(value)) {
    throw new Error('Selecione uma opção válida.');
  }

  if (type === 'MULTI_SELECT') {
    let selected: string[];
    try {
      const parsed = typeof rawValue === 'string' ? JSON.parse(rawValue) : rawValue;
      selected = Array.isArray(parsed) ? parsed.map(String) : [value];
    } catch {
      selected = value.split(',').map((item) => item.trim()).filter(Boolean);
    }
    if (selected.some((item) => !options.includes(item))) throw new Error('Uma ou mais opções são inválidas.');
    return JSON.stringify([...new Set(selected)]);
  }

  if (rules.min !== undefined && value.length < rules.min) throw new Error(`Use pelo menos ${rules.min} caracteres.`);
  if (rules.max !== undefined && value.length > rules.max) throw new Error(`Use no máximo ${rules.max} caracteres.`);
  if (rules.pattern) {
    let expression: RegExp;
    try {
      expression = new RegExp(rules.pattern);
    } catch {
      throw new Error('A regra de validação configurada é inválida.');
    }
    if (!expression.test(value)) throw new Error('O valor não atende à validação configurada.');
  }

  return value;
}
