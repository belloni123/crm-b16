import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { createOrUpdateDeduplicatedLead } from '@/lib/leads';
import { normalizeCustomFieldValue, parseFieldOptions, parseValidationRules, type CustomFieldType } from '@/lib/custom-fields';
import { dispatchLeadWebhooks, serializeWebhookLogPayload } from '@/lib/webhooks';

// Helper recursivo para buscar propriedades aninhadas em objetos (ex: "customer.name" ou "body.customer.name")
function getNestedValue(obj: any, path: string): any {
  if (!path) return undefined;
  
  // Limpa prefixo "body." se enviado no mapeamento
  const cleanPath = path.replace(/^body\./, '');
  const parts = cleanPath.split('.');
  
  let current = obj;
  for (const part of parts) {
    if (current === null || current === undefined) {
      return undefined;
    }
    current = current[part];
  }
  return current;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  
  // 1. Busca o endpoint de webhook correspondente
  const webhook = await prisma.webhookEndpoint.findUnique({
    where: { token },
  });

  if (!webhook || webhook.direction !== 'INCOMING' || !webhook.isActive || webhook.deletedAt) {
    return NextResponse.json(
      { error: 'Endpoint de webhook inválido ou inexistente.' },
      { status: 404 }
    );
  }

  if (!webhook.targetStageId) {
    return NextResponse.json({ error: 'Este webhook precisa ter uma etapa de destino válida.' }, { status: 409 });
  }

  let body: any = {};
  try {
    body = await request.json();
  } catch (err) {
    return NextResponse.json(
      { error: 'Corpo da requisição deve ser um JSON válido.' },
      { status: 400 }
    );
  }

  // Registramos um log de auditoria
  try {
    // 2. Extrai o mapeamento
    const mapping = JSON.parse(webhook.fieldMapping || '{}');

    // Extrai valores do payload de acordo com o mapeamento configurado
    const rawName = getNestedValue(body, mapping.name);
    const rawEmail = getNestedValue(body, mapping.email);
    const rawPhone = getNestedValue(body, mapping.phone);
    const rawCompany = getNestedValue(body, mapping.company);
    const rawValue = getNestedValue(body, mapping.value);

    // Normalizações básicas
    const name = String(rawName || 'Novo Lead Webhook').substring(0, 100);
    const email = rawEmail ? String(rawEmail).toLowerCase() : null;
    
    let phone = null;
    if (rawPhone) {
      // Remove caracteres não-numéricos e garante DDI 55
      phone = String(rawPhone).replace(/\D/g, '');
      if (phone && !phone.startsWith('55')) {
        phone = '55' + phone;
      }
    }
    
    const company = rawCompany ? String(rawCompany) : null;
    
    let value = 0.0;
    if (rawValue) {
      const parsedValue = parseFloat(String(rawValue).replace(/[^\d.,]/g, '').replace(',', '.'));
      if (!isNaN(parsedValue)) {
        value = parsedValue;
      }
    }

    // 3. Cria ou atualiza o lead na base de dados de forma deduplicada e distribui comercial
    const lead = await createOrUpdateDeduplicatedLead(
      webhook.projectId,
      {
        name,
        email,
        phone,
        company,
        value,
        priority: 'MEDIA',
        stageId: webhook.targetStageId,
        originId: webhook.originId
      },
      null // Sem operador autenticado
    );

    const customMappings = mapping.customFields && typeof mapping.customFields === 'object'
      ? Object.entries(mapping.customFields) as Array<[string, string]>
      : [];
    if (customMappings.length > 0) {
      const definitions = await prisma.customFieldDefinition.findMany({
        where: {
          projectId: webhook.projectId,
          isActive: true,
          deletedAt: null,
          OR: [
            { id: { in: customMappings.map(([identifier]) => identifier) } },
            { internalName: { in: customMappings.map(([identifier]) => identifier) } },
          ],
        },
      });
      const definitionsByIdentifier = new Map(definitions.flatMap((definition) => [
        [definition.id, definition],
        [definition.internalName, definition],
      ]));

      for (const [identifier, sourcePath] of customMappings) {
        const definition = definitionsByIdentifier.get(identifier);
        if (!definition) continue;
        const rawValue = getNestedValue(body, sourcePath);
        const value = normalizeCustomFieldValue(
          definition.type as CustomFieldType,
          rawValue,
          parseFieldOptions(definition.options),
          parseValidationRules(definition.validationRules),
        );
        if (value === '') continue;
        await prisma.customFieldValue.upsert({
          where: { fieldDefinitionId_leadId: { fieldDefinitionId: definition.id, leadId: lead.id } },
          create: { fieldDefinitionId: definition.id, leadId: lead.id, value },
          update: { value },
        });
      }
    }

    // Registra log de atividade específico do webhook
    await prisma.activity.create({
      data: {
        leadId: lead.id,
        type: 'LOG',
        content: `Lead processado via webhook de entrada: "${webhook.name}".`,
      },
    });

    // Registra Log de Sucesso no Banco de Dados
    await prisma.webhookLog.create({
      data: {
        webhookId: webhook.id,
        payload: serializeWebhookLogPayload(body),
        status: 'SUCCESS',
        errorDetails: null,
      },
    });

    await dispatchLeadWebhooks(webhook.projectId, lead.id, 'lead.updated');

    return NextResponse.json({
      success: true,
      leadId: lead.id,
      message: 'Lead processado e criado com sucesso.'
    });

  } catch (err: any) {
    console.error('Erro ao processar payload do webhook:', err);

    // Registra Log de Erro no Banco de Dados para diagnóstico do usuário
    await prisma.webhookLog.create({
      data: {
        webhookId: webhook.id,
        payload: serializeWebhookLogPayload(body),
        status: 'ERROR',
        errorDetails: err.message || 'Erro de processamento ou inserção no banco de dados.',
      },
    });

    return NextResponse.json(
      { error: 'Erro interno ao processar o webhook.' },
      { status: 500 }
    );
  }
}
