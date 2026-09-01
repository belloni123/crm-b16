import assert from 'node:assert/strict';
import test from 'node:test';
import {
  normalizeCustomFieldValue,
  normalizeInternalName,
  parseFieldOptions,
  parseValidationRules,
} from '../lib/custom-fields';

test('normaliza o nome interno sem acentos ou caracteres especiais', () => {
  assert.equal(normalizeInternalName('  Receita Média / Mês '), 'receita_media_mes');
});

test('deduplica opções e valida seleção simples e múltipla', () => {
  const options = parseFieldOptions('["Agência","Indicação","Agência"]');
  assert.deepEqual(options, ['Agência', 'Indicação']);
  assert.equal(normalizeCustomFieldValue('SELECT', 'Agência', options), 'Agência');
  assert.equal(normalizeCustomFieldValue('MULTI_SELECT', '["Indicação","Agência","Agência"]', options), '["Indicação","Agência"]');
  assert.throws(() => normalizeCustomFieldValue('SELECT', 'Inválida', options), /opção válida/);
});

test('normaliza números, datas, telefone, booleano e URL', () => {
  assert.equal(normalizeCustomFieldValue('CURRENCY', '10,50', [], { min: 10, max: 20 }), '10.5');
  assert.equal(normalizeCustomFieldValue('DATE', '2026-09-01'), '2026-09-01');
  assert.equal(normalizeCustomFieldValue('PHONE', '+55 (11) 99999-0000'), '+5511999990000');
  assert.equal(normalizeCustomFieldValue('BOOLEAN', 'sim'), 'true');
  assert.equal(normalizeCustomFieldValue('URL', 'https://example.com/path'), 'https://example.com/path');
});

test('aplica regras de tamanho, expressão regular e e-mail', () => {
  const rules = parseValidationRules('{"min":3,"max":6,"pattern":"^[A-Z0-9]+$"}');
  assert.equal(normalizeCustomFieldValue('TEXT', 'B16', [], rules), 'B16');
  assert.throws(() => normalizeCustomFieldValue('TEXT', 'b16', [], rules), /validação/);
  assert.throws(() => normalizeCustomFieldValue('EMAIL', 'invalido'), /e-mail válido/);
});
