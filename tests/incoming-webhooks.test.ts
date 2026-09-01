import assert from 'node:assert/strict';
import test from 'node:test';
import {
  IncomingWebhookPayloadError,
  extractIncomingWebhookValues,
  parseIncomingWebhookMapping,
  serializeIncomingWebhookMapping,
  validateIncomingWebhookFields,
} from '../lib/incoming-webhooks';

test('converte o mapeamento legado sem quebrar webhooks existentes', () => {
  const fields = parseIncomingWebhookMapping(JSON.stringify({
    name: 'data.contact.name',
    email: 'data.contact.email',
    customFields: { segmento: 'data.segment' },
  }));

  assert.deepEqual(fields, [
    { destinationType: 'SYSTEM', destination: 'name', sourcePath: 'data.contact.name', required: false },
    { destinationType: 'SYSTEM', destination: 'email', sourcePath: 'data.contact.email', required: false },
    { destinationType: 'CUSTOM', destination: 'segmento', sourcePath: 'data.segment', required: false },
  ]);
});

test('serializa e extrai campos padrão e personalizados do formato dinâmico', () => {
  const serialized = serializeIncomingWebhookMapping([
    { destinationType: 'SYSTEM', destination: 'name', sourcePath: 'body.lead.full_name', required: true },
    { destinationType: 'SYSTEM', destination: 'utmCampaign', sourcePath: 'tracking.campaign' },
    { destinationType: 'CUSTOM', destination: 'segmento', sourcePath: 'lead.profile.segment' },
  ]);
  const fields = parseIncomingWebhookMapping(serialized);
  const values = extractIncomingWebhookValues({
    lead: { full_name: 'Felipe', profile: { segment: 'Agência' } },
    tracking: { campaign: 'crm-2026' },
  }, fields);

  assert.deepEqual(values.system, { name: 'Felipe', utmCampaign: 'crm-2026' });
  assert.deepEqual(values.custom, { segmento: 'Agência' });
});

test('valida obrigatoriedade, destinos duplicados e caminhos perigosos', () => {
  const required = [
    { destinationType: 'SYSTEM' as const, destination: 'email', sourcePath: 'contact.email', required: true },
  ];
  assert.throws(
    () => extractIncomingWebhookValues({ contact: {} }, required),
    IncomingWebhookPayloadError,
  );
  assert.throws(() => validateIncomingWebhookFields([
    { destinationType: 'SYSTEM', destination: 'email', sourcePath: 'primary.email' },
    { destinationType: 'SYSTEM', destination: 'email', sourcePath: 'backup.email' },
  ]), /apenas uma vez/);
  assert.throws(() => validateIncomingWebhookFields([
    { destinationType: 'SYSTEM', destination: 'name', sourcePath: '__proto__.polluted' },
  ]), /não é válido/);
});
