import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assertSafeWebhookUrl,
  buildWebhookPayload,
  decryptWebhookHeaders,
  encryptWebhookHeaders,
  parseWebhookPayloadFields,
  serializeWebhookLogPayload,
  validatePayloadFields,
} from '../lib/webhooks';

process.env.WEBHOOK_ENCRYPTION_KEY = 'test-only-key-with-more-than-24-characters';

test('monta payload ordenado com campos padrão, personalizados e estáticos', () => {
  const fields = parseWebhookPayloadFields(JSON.stringify([
    { key: 'lead_name', sourceType: 'FIELD', source: 'name', required: true },
    { key: 'segment', sourceType: 'CUSTOM', source: 'segmento' },
    { key: 'source', sourceType: 'STATIC', staticValue: 'crm-b16' },
  ]));
  const payload = buildWebhookPayload({ name: 'Empresa B16', customFields: { segmento: 'B2B' } }, fields);
  assert.deepEqual(payload, { lead_name: 'Empresa B16', segment: 'B2B', source: 'crm-b16' });
});

test('rejeita chaves duplicadas e campos obrigatórios sem valor', () => {
  assert.throws(() => validatePayloadFields([
    { key: 'id', sourceType: 'FIELD', source: 'id' },
    { key: 'id', sourceType: 'STATIC', staticValue: 'x' },
  ]), /duplicada/);
  assert.throws(() => buildWebhookPayload({}, [
    { key: 'email', sourceType: 'FIELD', source: 'email', required: true },
  ]), /obrigatório/);
});

test('criptografa e recupera headers sem armazenar o segredo em claro', () => {
  const headers = { Authorization: 'Bearer segredo', 'X-Tenant': 'b16' };
  const encrypted = encryptWebhookHeaders(headers);
  assert.ok(encrypted);
  assert.equal(encrypted?.includes('segredo'), false);
  assert.deepEqual(decryptWebhookHeaders(encrypted), headers);
  assert.throws(() => encryptWebhookHeaders({ Host: 'internal' }), /não é permitido/);
  assert.throws(() => encryptWebhookHeaders({ 'X-Test': 'ok\r\ninjected: true' }), /inválido/);
});

test('bloqueia endpoints locais para reduzir SSRF', async () => {
  await assert.rejects(() => assertSafeWebhookUrl('http://localhost:3000/internal'), /locais/);
  await assert.rejects(() => assertSafeWebhookUrl('http://127.0.0.1/internal'), /endereço público/);
  await assert.rejects(() => assertSafeWebhookUrl('http://service.internal/path'), /locais/);
});

test('remove credenciais e limita payloads antes de gravar logs', () => {
  const payload = serializeWebhookLogPayload({
    name: 'Lead',
    authorization: 'Bearer secret',
    nested: { api_key: 'private', value: 'ok' },
  });
  assert.equal(payload.includes('Bearer secret'), false);
  assert.equal(payload.includes('private'), false);
  assert.match(payload, /\[REDACTED\]/);
  assert.equal(serializeWebhookLogPayload({ value: '123456' }, 8).length, 8);
});
