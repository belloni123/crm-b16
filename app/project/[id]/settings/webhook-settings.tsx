'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Check,
  ChevronDown,
  ChevronUp,
  Clipboard,
  FileJson,
  FileText,
  Pencil,
  Plus,
  Send,
  Trash2,
  Webhook,
  X,
} from 'lucide-react';
import {
  createCustomFieldDefinition,
  createOutgoingWebhook,
  createWebhookEndpoint,
  deleteWebhookEndpoint,
  retryWebhookDelivery,
  testOutgoingWebhook,
  updateWebhookEndpoint,
} from '@/app/actions/crm';
import {
  INCOMING_SYSTEM_FIELDS,
  parseIncomingWebhookMapping,
  serializeIncomingWebhookMapping,
  type IncomingWebhookField,
} from '@/lib/incoming-webhooks';
import type { CustomFieldType } from '@/lib/custom-fields';
import type { WebhookEvent } from '@/lib/webhooks';

export interface WebhookSettingsCustomField {
  id: string;
  name: string;
  internalName: string;
  type: string;
  options: string | null;
  helpText: string | null;
  defaultValue: string | null;
  validationRules: string | null;
  required: boolean;
  isActive: boolean;
  order: number;
}

export interface WebhookSettingsEndpoint {
  id: string;
  name: string;
  token: string;
  direction: string;
  url: string | null;
  method: string;
  isActive: boolean;
  events: string;
  payloadFields: string;
  timeoutMs: number;
  targetStageId: string | null;
  originId: string | null;
  origin?: { name: string } | null;
  fieldMapping: string;
}

export interface WebhookSettingsLog {
  id: string;
  webhookId: string;
  payload: string;
  status: string;
  errorDetails: string | null;
  event: string | null;
  statusCode: number | null;
  responseBody: string | null;
  attempt: number;
  durationMs: number | null;
  createdAt: Date | string;
  webhook: { name: string; direction: string };
}

interface Pipeline {
  id: string;
  name: string;
  stages: Array<{ id: string; name: string }>;
}

interface Origin {
  id: string;
  name: string;
}

type Direction = 'INCOMING' | 'OUTGOING';
type OutgoingField = {
  key: string;
  sourceType: 'FIELD' | 'CUSTOM' | 'STATIC';
  source?: string;
  staticValue?: string;
  required?: boolean;
};

interface Props {
  projectId: string;
  pipelines: Pipeline[];
  origins: Origin[];
  customFields: WebhookSettingsCustomField[];
  onCustomFieldsChange: (fields: WebhookSettingsCustomField[]) => void;
  onOpenCustomFields: () => void;
  initialWebhooks: WebhookSettingsEndpoint[];
  initialLogs: WebhookSettingsLog[];
}

const DEFAULT_INCOMING_FIELDS: IncomingWebhookField[] = [
  { destinationType: 'SYSTEM', destination: 'name', sourcePath: 'name', required: true },
  { destinationType: 'SYSTEM', destination: 'email', sourcePath: 'email', required: false },
  { destinationType: 'SYSTEM', destination: 'phone', sourcePath: 'phone', required: false },
];

const DEFAULT_OUTGOING_FIELDS: OutgoingField[] = [
  { key: 'id', sourceType: 'FIELD', source: 'id', required: true },
  { key: 'name', sourceType: 'FIELD', source: 'name', required: true },
  { key: 'email', sourceType: 'FIELD', source: 'email' },
  { key: 'phone', sourceType: 'FIELD', source: 'phone' },
];

const FIELD_TYPES = [
  ['TEXT', 'Texto curto'],
  ['LONG_TEXT', 'Texto longo'],
  ['NUMBER', 'Número'],
  ['CURRENCY', 'Moeda'],
  ['DATE', 'Data'],
  ['DATETIME', 'Data e hora'],
  ['PHONE', 'Telefone'],
  ['EMAIL', 'E-mail'],
  ['URL', 'URL'],
  ['SELECT', 'Seleção única'],
  ['MULTI_SELECT', 'Seleção múltipla'],
  ['CHECKBOX', 'Checkbox'],
  ['BOOLEAN', 'Sim / não'],
] as const;

function internalNameFromLabel(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 60);
}

function safeIncomingFields(raw: string, customFields: WebhookSettingsCustomField[] = []) {
  try {
    return parseIncomingWebhookMapping(raw).map((field) => {
      if (field.destinationType !== 'CUSTOM') return field;
      const definition = customFields.find((item) => item.id === field.destination || item.internalName === field.destination);
      return definition ? { ...field, destination: definition.id } : field;
    });
  } catch {
    return DEFAULT_INCOMING_FIELDS.map((field) => ({ ...field }));
  }
}

function safeJsonArray<T>(raw: string, fallback: T[]) {
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed as T[] : fallback;
  } catch {
    return fallback;
  }
}

export function WebhookSettings({
  projectId,
  pipelines,
  origins,
  customFields,
  onCustomFieldsChange,
  onOpenCustomFields,
  initialWebhooks,
  initialLogs,
}: Props) {
  const router = useRouter();
  const firstStageId = pipelines.flatMap((pipeline) => pipeline.stages)[0]?.id || '';
  const [baseUrl, setBaseUrl] = useState('');
  const [direction, setDirection] = useState<Direction>('INCOMING');
  const [webhooks, setWebhooks] = useState(initialWebhooks);
  const [logs, setLogs] = useState(initialLogs);
  const [editorOpen, setEditorOpen] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [name, setName] = useState('');
  const [stageId, setStageId] = useState(firstStageId);
  const [originId, setOriginId] = useState('');
  const [incomingFields, setIncomingFields] = useState<IncomingWebhookField[]>(DEFAULT_INCOMING_FIELDS);
  const [url, setUrl] = useState('');
  const [method, setMethod] = useState<'POST' | 'PUT' | 'PATCH'>('POST');
  const [events, setEvents] = useState<string[]>(['lead.created']);
  const [headers, setHeaders] = useState('');
  const [timeout, setTimeoutValue] = useState('10000');
  const [outgoingFields, setOutgoingFields] = useState<OutgoingField[]>(DEFAULT_OUTGOING_FIELDS);
  const [quickFieldOpen, setQuickFieldOpen] = useState(false);
  const [quickFieldName, setQuickFieldName] = useState('');
  const [quickFieldInternalName, setQuickFieldInternalName] = useState('');
  const [quickFieldType, setQuickFieldType] = useState('TEXT');
  const [quickFieldOptions, setQuickFieldOptions] = useState('');
  const [quickFieldRequired, setQuickFieldRequired] = useState(false);
  const [quickInternalTouched, setQuickInternalTouched] = useState(false);

  useEffect(() => setWebhooks(initialWebhooks), [initialWebhooks]);
  useEffect(() => setLogs(initialLogs), [initialLogs]);
  useEffect(() => setBaseUrl(window.location.origin), []);

  const activeCustomFields = useMemo(
    () => customFields.filter((field) => field.isActive),
    [customFields],
  );
  const visibleWebhooks = webhooks.filter((webhook) => webhook.direction === direction);
  const visibleLogs = logs.filter((log) => log.webhook.direction === direction);

  const resetEditor = (nextDirection: Direction = direction) => {
    setEditingId(null);
    setName('');
    setStageId(firstStageId);
    setOriginId('');
    setIncomingFields(DEFAULT_INCOMING_FIELDS.map((field) => ({ ...field })));
    setUrl('');
    setMethod('POST');
    setEvents(['lead.created']);
    setHeaders('');
    setTimeoutValue('10000');
    setOutgoingFields(DEFAULT_OUTGOING_FIELDS.map((field) => ({ ...field })));
    setDirection(nextDirection);
    setEditorOpen(true);
  };

  const changeDirection = (nextDirection: Direction) => {
    if (nextDirection === direction) return;
    resetEditor(nextDirection);
  };

  const destinationValue = (field: IncomingWebhookField) => `${field.destinationType}:${field.destination}`;

  const updateIncomingDestination = (index: number, encoded: string) => {
    const [destinationType, destination] = encoded.split(':', 2) as ['SYSTEM' | 'CUSTOM', string];
    const next = [...incomingFields];
    const customField = customFields.find((field) => field.id === destination);
    next[index] = {
      ...next[index],
      destinationType,
      destination,
      sourcePath: destinationType === 'CUSTOM' ? (customField?.internalName || next[index].sourcePath) : destination,
      required: destinationType === 'CUSTOM' ? Boolean(customField?.required) : next[index].required,
    };
    setIncomingFields(next);
  };

  const addIncomingField = () => {
    const used = new Set(incomingFields.map(destinationValue));
    const system = INCOMING_SYSTEM_FIELDS.find((field) => !used.has(`SYSTEM:${field.key}`));
    if (system) {
      setIncomingFields([...incomingFields, { destinationType: 'SYSTEM', destination: system.key, sourcePath: system.key }]);
      return;
    }
    const custom = activeCustomFields.find((field) => !used.has(`CUSTOM:${field.id}`));
    if (custom) {
      setIncomingFields([...incomingFields, { destinationType: 'CUSTOM', destination: custom.id, sourcePath: custom.internalName, required: custom.required }]);
      return;
    }
    alert('Todos os campos disponíveis já foram adicionados. Crie um campo personalizado para continuar.');
  };

  const moveIncomingField = (index: number, offset: -1 | 1) => {
    const target = index + offset;
    if (target < 0 || target >= incomingFields.length) return;
    const next = [...incomingFields];
    [next[index], next[target]] = [next[target], next[index]];
    setIncomingFields(next);
  };

  const resetQuickField = () => {
    setQuickFieldOpen(false);
    setQuickFieldName('');
    setQuickFieldInternalName('');
    setQuickFieldType('TEXT');
    setQuickFieldOptions('');
    setQuickFieldRequired(false);
    setQuickInternalTouched(false);
  };

  const createQuickField = async () => {
    if (!quickFieldName.trim() || !quickFieldInternalName.trim()) {
      alert('Informe o nome e a chave interna do novo campo.');
      return;
    }
    setPending(true);
    try {
      const usesOptions = ['SELECT', 'MULTI_SELECT'].includes(quickFieldType);
      const options = usesOptions
        ? JSON.stringify(quickFieldOptions.split(',').map((option) => option.trim()).filter(Boolean))
        : undefined;
      const created = await createCustomFieldDefinition(projectId, {
        name: quickFieldName,
        internalName: quickFieldInternalName,
        type: quickFieldType as CustomFieldType,
        options,
        validationRules: '{}',
        required: quickFieldRequired,
      });
      const normalized = created as WebhookSettingsCustomField;
      onCustomFieldsChange([...customFields, normalized]);
      setIncomingFields([...incomingFields, {
        destinationType: 'CUSTOM',
        destination: normalized.id,
        sourcePath: normalized.internalName,
        required: normalized.required,
      }]);
      resetQuickField();
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Não foi possível criar o campo personalizado.');
    } finally {
      setPending(false);
    }
  };

  const editWebhook = (webhook: WebhookSettingsEndpoint) => {
    const nextDirection = webhook.direction as Direction;
    setDirection(nextDirection);
    setEditingId(webhook.id);
    setName(webhook.name);
    setEditorOpen(true);
    if (nextDirection === 'INCOMING') {
      setStageId(webhook.targetStageId || firstStageId);
      setOriginId(webhook.originId || '');
      setIncomingFields(safeIncomingFields(webhook.fieldMapping, customFields));
      return;
    }
    setUrl(webhook.url || '');
    setMethod(webhook.method as 'POST' | 'PUT' | 'PATCH');
    setEvents(safeJsonArray<string>(webhook.events, []));
    setOutgoingFields(safeJsonArray<OutgoingField>(webhook.payloadFields, []));
    setTimeoutValue(String(webhook.timeoutMs));
    setHeaders('');
  };

  const saveWebhook = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!name.trim()) return;
    setPending(true);
    try {
      let saved;
      if (direction === 'INCOMING') {
        if (!stageId) throw new Error('Selecione a etapa de destino.');
        const data = {
          name,
          targetStageId: stageId,
          originId: originId || null,
          fieldMapping: serializeIncomingWebhookMapping(incomingFields),
        };
        saved = editingId
          ? await updateWebhookEndpoint(projectId, editingId, data)
          : await createWebhookEndpoint(projectId, data);
      } else {
        let parsedHeaders: Record<string, string> | undefined;
        if (headers.trim()) {
          const parsed = JSON.parse(headers);
          if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Os headers devem ser um objeto JSON.');
          parsedHeaders = Object.fromEntries(Object.entries(parsed).map(([key, value]) => [key, String(value)]));
        }
        const data = {
          name,
          url,
          method,
          events: events as WebhookEvent[],
          payloadFields: outgoingFields,
          headers: parsedHeaders,
          timeoutMs: Number(timeout),
        };
        saved = editingId
          ? await updateWebhookEndpoint(projectId, editingId, data)
          : await createOutgoingWebhook(projectId, data);
      }
      const normalized = { ...saved, origin: origins.find((origin) => origin.id === saved.originId) || null } as WebhookSettingsEndpoint;
      setWebhooks(editingId
        ? webhooks.map((webhook) => webhook.id === editingId ? normalized : webhook)
        : [normalized, ...webhooks]);
      setEditorOpen(false);
      setEditingId(null);
      router.refresh();
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Não foi possível salvar o webhook.');
    } finally {
      setPending(false);
    }
  };

  const toggleWebhook = async (webhook: WebhookSettingsEndpoint) => {
    setPending(true);
    try {
      const updated = await updateWebhookEndpoint(projectId, webhook.id, { isActive: !webhook.isActive });
      setWebhooks(webhooks.map((item) => item.id === webhook.id ? { ...item, ...updated } : item));
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Não foi possível alterar o webhook.');
    } finally {
      setPending(false);
    }
  };

  const removeWebhook = async (webhook: WebhookSettingsEndpoint) => {
    if (!confirm(`Arquivar o webhook "${webhook.name}"? O histórico será preservado.`)) return;
    setPending(true);
    try {
      await deleteWebhookEndpoint(projectId, webhook.id);
      setWebhooks(webhooks.filter((item) => item.id !== webhook.id));
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Não foi possível arquivar o webhook.');
    } finally {
      setPending(false);
    }
  };

  const testWebhook = async (webhookId: string) => {
    setPending(true);
    try {
      const result = await testOutgoingWebhook(projectId, webhookId);
      alert(result.success ? `Teste concluído com HTTP ${result.statusCode}.` : `Falha no teste: ${result.responseBody || 'sem resposta'}`);
      router.refresh();
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Não foi possível testar o webhook.');
    } finally {
      setPending(false);
    }
  };

  const retryLog = async (logId: string) => {
    setPending(true);
    try {
      const result = await retryWebhookDelivery(projectId, logId);
      alert(result.success ? `Reenvio concluído com HTTP ${result.statusCode}.` : `Falha no reenvio: ${result.responseBody || 'sem resposta'}`);
      router.refresh();
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Não foi possível reenviar o webhook.');
    } finally {
      setPending(false);
    }
  };

  const copy = async (value: string) => {
    await navigator.clipboard.writeText(value);
    alert('URL copiada.');
  };

  const incomingPreview = Object.fromEntries(incomingFields.map((field) => {
    const system = INCOMING_SYSTEM_FIELDS.find((item) => item.key === field.destination);
    const custom = customFields.find((item) => item.id === field.destination);
    return [system?.label || custom?.name || field.destination, `<${field.sourcePath || 'caminho_no_json'}>`];
  }));

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-bold text-white font-display"><Webhook className="h-5 w-5 text-accent" /> Webhooks</h2>
          <p className="mt-1 max-w-2xl text-xs text-text-secondary">Receba leads de qualquer sistema ou envie eventos do CRM. Cada campo pode ser adicionado, removido, reordenado e marcado como obrigatório.</p>
        </div>
        <button type="button" onClick={() => resetEditor(direction)} className="inline-flex items-center justify-center gap-2 rounded-lg bg-accent px-4 py-2 text-xs font-bold text-black hover:bg-accent-light">
          <Plus className="h-4 w-4" /> Novo webhook
        </button>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <button type="button" onClick={() => changeDirection('INCOMING')} className={`rounded-xl border p-4 text-left transition ${direction === 'INCOMING' ? 'border-accent bg-accent/10' : 'border-border-subtle bg-glass-1 hover:border-border-glass'}`}>
          <div className="flex items-center justify-between"><span className="text-sm font-bold text-white">Entrada</span><span className="rounded-full bg-glass-3 px-2 py-0.5 text-[10px] text-text-secondary">{webhooks.filter((item) => item.direction === 'INCOMING').length}</span></div>
          <p className="mt-1 text-[11px] text-text-secondary">Recebe um JSON e cria ou atualiza um lead.</p>
        </button>
        <button type="button" onClick={() => changeDirection('OUTGOING')} className={`rounded-xl border p-4 text-left transition ${direction === 'OUTGOING' ? 'border-accent bg-accent/10' : 'border-border-subtle bg-glass-1 hover:border-border-glass'}`}>
          <div className="flex items-center justify-between"><span className="text-sm font-bold text-white">Saída</span><span className="rounded-full bg-glass-3 px-2 py-0.5 text-[10px] text-text-secondary">{webhooks.filter((item) => item.direction === 'OUTGOING').length}</span></div>
          <p className="mt-1 text-[11px] text-text-secondary">Envia eventos e um payload configurável para outro sistema.</p>
        </button>
      </div>

      {editorOpen && (
        <form onSubmit={saveWebhook} className="space-y-5 rounded-2xl border border-accent/30 bg-glass-1 p-5 shadow-lg">
          <div className="flex items-center justify-between border-b border-border-subtle pb-4">
            <div>
              <h3 className="text-sm font-bold text-white">{editingId ? 'Editar' : 'Criar'} webhook de {direction === 'INCOMING' ? 'entrada' : 'saída'}</h3>
              <p className="mt-0.5 text-[10px] text-text-secondary">{direction === 'INCOMING' ? 'Escolha exatamente quais dados do JSON entram no CRM.' : 'Monte exatamente o JSON enviado pelo CRM.'}</p>
            </div>
            <button type="button" onClick={() => setEditorOpen(false)} className="rounded p-1 text-text-secondary hover:bg-glass-3 hover:text-white" aria-label="Fechar editor"><X className="h-4 w-4" /></button>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <label className="flex flex-col gap-1.5 text-[10px] font-bold uppercase text-text-secondary">Nome da integração
              <input required value={name} onChange={(event) => setName(event.target.value)} placeholder={direction === 'INCOMING' ? 'Ex: Formulário do site' : 'Ex: Notificar ERP'} className="rounded-lg border border-border-subtle bg-bg-base px-3 py-2 text-xs font-normal normal-case text-white outline-none focus:border-accent" />
            </label>

            {direction === 'INCOMING' ? (<>
              <label className="flex flex-col gap-1.5 text-[10px] font-bold uppercase text-text-secondary">Etapa de destino
                <select required value={stageId} onChange={(event) => setStageId(event.target.value)} className="rounded-lg border border-border-subtle bg-bg-base px-3 py-2 text-xs font-normal normal-case text-white">
                  {pipelines.map((pipeline) => <optgroup key={pipeline.id} label={pipeline.name}>{pipeline.stages.map((stage) => <option key={stage.id} value={stage.id}>{stage.name}</option>)}</optgroup>)}
                </select>
              </label>
              <label className="flex flex-col gap-1.5 text-[10px] font-bold uppercase text-text-secondary">Origem
                <select value={originId} onChange={(event) => setOriginId(event.target.value)} className="rounded-lg border border-border-subtle bg-bg-base px-3 py-2 text-xs font-normal normal-case text-white"><option value="">Nenhuma</option>{origins.map((origin) => <option key={origin.id} value={origin.id}>{origin.name}</option>)}</select>
              </label>
            </>) : (<>
              <label className="flex flex-col gap-1.5 text-[10px] font-bold uppercase text-text-secondary">URL pública de destino
                <input required type="url" value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://sistema.exemplo.com/webhooks" className="rounded-lg border border-border-subtle bg-bg-base px-3 py-2 text-xs font-normal normal-case text-white outline-none focus:border-accent" />
              </label>
              <div className="grid grid-cols-2 gap-2">
                <label className="flex flex-col gap-1.5 text-[10px] font-bold uppercase text-text-secondary">Método<select value={method} onChange={(event) => setMethod(event.target.value as typeof method)} className="rounded-lg border border-border-subtle bg-bg-base px-3 py-2 text-xs font-normal text-white"><option>POST</option><option>PUT</option><option>PATCH</option></select></label>
                <label className="flex flex-col gap-1.5 text-[10px] font-bold uppercase text-text-secondary">Timeout<input type="number" min="1000" max="30000" value={timeout} onChange={(event) => setTimeoutValue(event.target.value)} className="rounded-lg border border-border-subtle bg-bg-base px-3 py-2 text-xs font-normal text-white" /></label>
              </div>
              <div className="md:col-span-2">
                <p className="mb-2 text-[10px] font-bold uppercase text-text-secondary">Eventos</p>
                <div className="flex flex-wrap gap-3">{[['lead.created', 'Lead criado'], ['lead.updated', 'Lead atualizado'], ['lead.stage_changed', 'Etapa alterada']].map(([value, label]) => <label key={value} className="flex items-center gap-2 text-xs text-white"><input type="checkbox" checked={events.includes(value)} onChange={(event) => setEvents(event.target.checked ? [...events, value] : events.filter((item) => item !== value))} className="accent-accent" />{label}</label>)}</div>
              </div>
            </>)}
          </div>

          {direction === 'INCOMING' ? (
            <div className="space-y-4 border-t border-border-subtle pt-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div><h4 className="text-sm font-bold text-white">Campos recebidos</h4><p className="text-[10px] text-text-secondary">O destino é o campo salvo no CRM. O caminho é onde o valor chega no JSON, por exemplo <code className="text-accent-light">data.contact.email</code>.</p></div>
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={addIncomingField} className="inline-flex items-center gap-1 rounded-lg bg-accent/15 px-3 py-2 text-[10px] font-bold text-accent-light"><Plus className="h-3.5 w-3.5" /> Adicionar campo</button>
                  <button type="button" onClick={() => setQuickFieldOpen(true)} className="inline-flex items-center gap-1 rounded-lg border border-border-subtle px-3 py-2 text-[10px] font-bold text-white hover:border-accent"><Plus className="h-3.5 w-3.5" /> Criar campo personalizado</button>
                </div>
              </div>

              <div className="space-y-2">
                {incomingFields.map((field, index) => (
                  <div key={`${field.destinationType}-${field.destination}-${index}`} className="grid grid-cols-1 items-center gap-2 rounded-xl border border-border-subtle bg-bg-base p-3 lg:grid-cols-[1.2fr_1.3fr_auto_auto]">
                    <label className="flex flex-col gap-1 text-[9px] font-bold uppercase text-text-secondary">Salvar no campo
                      <select value={destinationValue(field)} onChange={(event) => updateIncomingDestination(index, event.target.value)} className="rounded border border-border-subtle bg-glass-2 px-2 py-2 text-xs font-normal normal-case text-white">
                        <optgroup label="Campos padrão">{INCOMING_SYSTEM_FIELDS.map((option) => <option key={option.key} value={`SYSTEM:${option.key}`} disabled={incomingFields.some((item, itemIndex) => itemIndex !== index && destinationValue(item) === `SYSTEM:${option.key}`)}>{option.label}</option>)}</optgroup>
                        {activeCustomFields.length > 0 && <optgroup label="Campos personalizados">{activeCustomFields.map((option) => <option key={option.id} value={`CUSTOM:${option.id}`} disabled={incomingFields.some((item, itemIndex) => itemIndex !== index && destinationValue(item) === `CUSTOM:${option.id}`)}>{option.name}</option>)}</optgroup>}
                      </select>
                    </label>
                    <label className="flex flex-col gap-1 text-[9px] font-bold uppercase text-text-secondary">Caminho no JSON recebido
                      <input required value={field.sourcePath} onChange={(event) => { const next = [...incomingFields]; next[index] = { ...field, sourcePath: event.target.value }; setIncomingFields(next); }} placeholder="data.contact.email" className="rounded border border-border-subtle bg-glass-2 px-2 py-2 font-mono text-xs font-normal normal-case text-white" />
                    </label>
                    <label className="flex items-center gap-2 text-[10px] text-text-secondary"><input type="checkbox" checked={Boolean(field.required)} onChange={(event) => { const next = [...incomingFields]; next[index] = { ...field, required: event.target.checked }; setIncomingFields(next); }} className="accent-accent" /> Obrigatório</label>
                    <div className="flex items-center justify-end gap-1">
                      <button type="button" disabled={index === 0} onClick={() => moveIncomingField(index, -1)} className="p-1 text-text-secondary disabled:opacity-30" aria-label="Mover campo para cima"><ChevronUp className="h-4 w-4" /></button>
                      <button type="button" disabled={index === incomingFields.length - 1} onClick={() => moveIncomingField(index, 1)} className="p-1 text-text-secondary disabled:opacity-30" aria-label="Mover campo para baixo"><ChevronDown className="h-4 w-4" /></button>
                      <button type="button" disabled={incomingFields.length === 1} onClick={() => setIncomingFields(incomingFields.filter((_, itemIndex) => itemIndex !== index))} className="p-1 text-danger disabled:opacity-30" aria-label="Remover campo"><Trash2 className="h-4 w-4" /></button>
                    </div>
                  </div>
                ))}
              </div>

              {quickFieldOpen && (
                <div className="space-y-4 rounded-xl border border-accent/30 bg-accent/5 p-4">
                  <div className="flex items-start justify-between"><div><h5 className="text-xs font-bold text-white">Novo campo personalizado</h5><p className="text-[10px] text-text-secondary">Ele será criado no projeto e adicionado automaticamente a este webhook.</p></div><button type="button" onClick={resetQuickField} className="text-text-secondary"><X className="h-4 w-4" /></button></div>
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4">
                    <label className="flex flex-col gap-1 text-[9px] font-bold uppercase text-text-secondary">Rótulo<input value={quickFieldName} onChange={(event) => { const value = event.target.value; setQuickFieldName(value); if (!quickInternalTouched) setQuickFieldInternalName(internalNameFromLabel(value)); }} placeholder="Ex: Segmento" className="rounded border border-border-subtle bg-bg-base px-2 py-2 text-xs font-normal normal-case text-white" /></label>
                    <label className="flex flex-col gap-1 text-[9px] font-bold uppercase text-text-secondary">Chave interna<input value={quickFieldInternalName} onChange={(event) => { setQuickInternalTouched(true); setQuickFieldInternalName(event.target.value); }} placeholder="segmento" className="rounded border border-border-subtle bg-bg-base px-2 py-2 font-mono text-xs font-normal normal-case text-white" /></label>
                    <label className="flex flex-col gap-1 text-[9px] font-bold uppercase text-text-secondary">Tipo<select value={quickFieldType} onChange={(event) => setQuickFieldType(event.target.value)} className="rounded border border-border-subtle bg-bg-base px-2 py-2 text-xs font-normal normal-case text-white">{FIELD_TYPES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
                    {['SELECT', 'MULTI_SELECT'].includes(quickFieldType) ? <label className="flex flex-col gap-1 text-[9px] font-bold uppercase text-text-secondary">Opções<input value={quickFieldOptions} onChange={(event) => setQuickFieldOptions(event.target.value)} placeholder="Opção 1, Opção 2" className="rounded border border-border-subtle bg-bg-base px-2 py-2 text-xs font-normal normal-case text-white" /></label> : <label className="flex items-center gap-2 self-end pb-2 text-[10px] text-text-secondary"><input type="checkbox" checked={quickFieldRequired} onChange={(event) => setQuickFieldRequired(event.target.checked)} className="accent-accent" /> Obrigatório no CRM</label>}
                  </div>
                  {['SELECT', 'MULTI_SELECT'].includes(quickFieldType) && <label className="flex items-center gap-2 text-[10px] text-text-secondary"><input type="checkbox" checked={quickFieldRequired} onChange={(event) => setQuickFieldRequired(event.target.checked)} className="accent-accent" /> Obrigatório no CRM</label>}
                  <div className="flex flex-wrap justify-between gap-2"><button type="button" onClick={onOpenCustomFields} className="text-[10px] font-bold text-text-secondary hover:text-white">Abrir configuração completa de campos</button><button type="button" disabled={pending} onClick={createQuickField} className="inline-flex items-center gap-1 rounded-lg bg-accent px-3 py-2 text-[10px] font-bold text-black disabled:opacity-50"><Check className="h-3.5 w-3.5" /> Criar e adicionar</button></div>
                </div>
              )}

              <div className="rounded-xl border border-border-subtle bg-bg-base p-3"><p className="mb-2 flex items-center gap-1 text-[10px] font-bold uppercase text-text-secondary"><FileJson className="h-3.5 w-3.5" /> Prévia do mapeamento</p><pre className="max-h-48 overflow-auto whitespace-pre-wrap text-[10px] text-accent-light">{JSON.stringify(incomingPreview, null, 2)}</pre></div>
            </div>
          ) : (
            <div className="space-y-4 border-t border-border-subtle pt-5">
              <div className="flex items-center justify-between"><div><h4 className="text-sm font-bold text-white">Campos enviados</h4><p className="text-[10px] text-text-secondary">Defina a chave do JSON e de onde o valor será obtido.</p></div><button type="button" onClick={() => setOutgoingFields([...outgoingFields, { key: '', sourceType: 'FIELD', source: 'name' }])} className="inline-flex items-center gap-1 rounded-lg bg-accent/15 px-3 py-2 text-[10px] font-bold text-accent-light"><Plus className="h-3.5 w-3.5" /> Adicionar campo</button></div>
              <div className="space-y-2">{outgoingFields.map((field, index) => <div key={index} className="grid grid-cols-1 items-center gap-2 rounded-xl border border-border-subtle bg-bg-base p-3 lg:grid-cols-[1fr_1fr_1.3fr_auto]">
                <input aria-label="Chave do payload" required value={field.key} onChange={(event) => { const next = [...outgoingFields]; next[index] = { ...field, key: event.target.value }; setOutgoingFields(next); }} placeholder="chave_destino" className="rounded border border-border-subtle bg-glass-2 px-2 py-2 font-mono text-xs text-white" />
                <select value={field.sourceType} onChange={(event) => { const next = [...outgoingFields]; next[index] = { ...field, sourceType: event.target.value as OutgoingField['sourceType'] }; setOutgoingFields(next); }} className="rounded border border-border-subtle bg-glass-2 px-2 py-2 text-xs text-white"><option value="FIELD">Campo padrão</option><option value="CUSTOM">Personalizado</option><option value="STATIC">Valor estático</option></select>
                {field.sourceType === 'STATIC' ? <input value={field.staticValue || ''} onChange={(event) => { const next = [...outgoingFields]; next[index] = { ...field, staticValue: event.target.value }; setOutgoingFields(next); }} placeholder="Valor" className="rounded border border-border-subtle bg-glass-2 px-2 py-2 text-xs text-white" /> : field.sourceType === 'CUSTOM' ? <select value={field.source || ''} onChange={(event) => { const next = [...outgoingFields]; next[index] = { ...field, source: event.target.value }; setOutgoingFields(next); }} className="rounded border border-border-subtle bg-glass-2 px-2 py-2 text-xs text-white"><option value="">Selecione...</option>{activeCustomFields.map((item) => <option key={item.id} value={item.internalName}>{item.name}</option>)}</select> : <select value={field.source || ''} onChange={(event) => { const next = [...outgoingFields]; next[index] = { ...field, source: event.target.value }; setOutgoingFields(next); }} className="rounded border border-border-subtle bg-glass-2 px-2 py-2 text-xs text-white">{['id', 'name', 'email', 'phone', 'company', 'priority', 'value', 'pipelineId', 'stageId', 'originId', 'createdAt', 'updatedAt', 'event'].map((source) => <option key={source} value={source}>{source}</option>)}</select>}
                <div className="flex items-center gap-1"><label className="mr-1 flex items-center gap-1 text-[9px] text-text-secondary"><input type="checkbox" checked={Boolean(field.required)} onChange={(event) => { const next = [...outgoingFields]; next[index] = { ...field, required: event.target.checked }; setOutgoingFields(next); }} className="accent-accent" /> obrigatório</label><button type="button" aria-label="Mover campo para cima" disabled={index === 0} onClick={() => { const next = [...outgoingFields]; [next[index - 1], next[index]] = [next[index], next[index - 1]]; setOutgoingFields(next); }} className="p-1 text-text-secondary disabled:opacity-30"><ChevronUp className="h-3.5 w-3.5" /></button><button type="button" aria-label="Mover campo para baixo" disabled={index === outgoingFields.length - 1} onClick={() => { const next = [...outgoingFields]; [next[index], next[index + 1]] = [next[index + 1], next[index]]; setOutgoingFields(next); }} className="p-1 text-text-secondary disabled:opacity-30"><ChevronDown className="h-3.5 w-3.5" /></button><button type="button" aria-label="Remover campo" onClick={() => setOutgoingFields(outgoingFields.filter((_, itemIndex) => itemIndex !== index))} className="p-1 text-danger"><Trash2 className="h-3.5 w-3.5" /></button></div>
              </div>)}</div>
              <div className="rounded-xl border border-border-subtle bg-bg-base p-3"><p className="mb-2 text-[10px] font-bold uppercase text-text-secondary">Prévia do payload</p><pre className="max-h-48 overflow-auto whitespace-pre-wrap text-[10px] text-accent-light">{JSON.stringify(Object.fromEntries(outgoingFields.filter((field) => field.key.trim()).map((field) => [field.key.trim(), field.sourceType === 'STATIC' ? (field.staticValue || '') : `<${field.source || 'campo'}>`])), null, 2)}</pre></div>
              <label className="flex flex-col gap-1.5 text-[10px] font-bold uppercase text-text-secondary">Headers personalizados — JSON criptografado<textarea value={headers} onChange={(event) => setHeaders(event.target.value)} placeholder='{"Authorization":"Bearer ..."}' className="min-h-20 rounded-lg border border-border-subtle bg-bg-base px-3 py-2 font-mono text-xs font-normal normal-case text-white" />{editingId && <span className="font-normal normal-case text-text-tertiary">Deixe vazio para preservar os headers existentes.</span>}</label>
            </div>
          )}

          <div className="flex justify-end gap-2 border-t border-border-subtle pt-4"><button type="button" onClick={() => setEditorOpen(false)} className="rounded-lg border border-border-subtle px-4 py-2 text-xs font-bold text-white">Cancelar</button><button type="submit" disabled={pending} className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-xs font-bold text-black disabled:opacity-50"><Check className="h-4 w-4" /> {editingId ? 'Salvar alterações' : 'Criar webhook'}</button></div>
        </form>
      )}

      <div className="space-y-3">
        <div className="flex items-center justify-between"><h3 className="text-xs font-bold uppercase tracking-wider text-white">Webhooks de {direction === 'INCOMING' ? 'entrada' : 'saída'}</h3>{!editorOpen && <button type="button" onClick={() => resetEditor(direction)} className="text-[10px] font-bold text-accent-light">+ Criar novo</button>}</div>
        {visibleWebhooks.length === 0 ? <div className="rounded-xl border border-dashed border-border-subtle p-8 text-center"><Webhook className="mx-auto h-7 w-7 text-text-tertiary" /><p className="mt-2 text-xs font-bold text-white">Nenhum webhook de {direction === 'INCOMING' ? 'entrada' : 'saída'}</p><p className="mt-1 text-[10px] text-text-secondary">Use o editor acima para criar a primeira integração.</p></div> : visibleWebhooks.map((webhook) => {
          const endpointPath = `/api/webhooks/incoming/${webhook.token}`;
          const endpointUrl = baseUrl ? `${baseUrl}${endpointPath}` : endpointPath;
          const mappedCount = direction === 'INCOMING' ? safeIncomingFields(webhook.fieldMapping, customFields).length : safeJsonArray<OutgoingField>(webhook.payloadFields, []).length;
          return <div key={webhook.id} className={`rounded-xl border border-border-subtle bg-glass-2 p-4 ${webhook.isActive ? '' : 'opacity-60'}`}>
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between"><div><div className="flex flex-wrap items-center gap-2"><h4 className="text-sm font-bold text-white">{webhook.name}</h4><span className={`rounded-full px-2 py-0.5 text-[9px] font-bold ${webhook.isActive ? 'bg-accent/10 text-accent-light' : 'bg-glass-4 text-text-secondary'}`}>{webhook.isActive ? 'ATIVO' : 'PAUSADO'}</span></div><p className="mt-1 text-[10px] text-text-secondary">{direction === 'INCOMING' ? `${mappedCount} campos mapeados • destino ${pipelines.flatMap((pipeline) => pipeline.stages).find((stage) => stage.id === webhook.targetStageId)?.name || 'etapa inválida'}` : `${webhook.method} • ${mappedCount} campos • ${safeJsonArray<string>(webhook.events, []).join(', ')}`}</p></div>
              <div className="flex flex-wrap gap-1">{direction === 'OUTGOING' && <button type="button" disabled={pending} onClick={() => testWebhook(webhook.id)} className="inline-flex items-center gap-1 rounded px-2 py-1 text-[10px] font-bold text-accent-light hover:bg-accent/10"><Send className="h-3.5 w-3.5" /> Testar</button>}<button type="button" onClick={() => editWebhook(webhook)} className="inline-flex items-center gap-1 rounded px-2 py-1 text-[10px] font-bold text-text-secondary hover:bg-glass-3 hover:text-white"><Pencil className="h-3.5 w-3.5" /> Editar</button><button type="button" disabled={pending} onClick={() => toggleWebhook(webhook)} className="rounded px-2 py-1 text-[10px] font-bold text-text-secondary hover:bg-glass-3 hover:text-white">{webhook.isActive ? 'Pausar' : 'Ativar'}</button><button type="button" onClick={() => removeWebhook(webhook)} className="rounded p-1 text-text-tertiary hover:bg-danger/10 hover:text-danger"><Trash2 className="h-4 w-4" /></button></div></div>
            <div className="mt-3 flex items-center gap-2 rounded-lg border border-border-subtle bg-bg-base p-2"><span className="min-w-0 flex-1 truncate font-mono text-[10px] text-text-tertiary">{direction === 'INCOMING' ? endpointUrl : webhook.url}</span>{direction === 'INCOMING' && <button type="button" onClick={() => copy(endpointUrl)} className="p-1 text-accent-light" title="Copiar URL"><Clipboard className="h-4 w-4" /></button>}</div>
          </div>;
        })}
      </div>

      <div className="space-y-3 border-t border-border-subtle pt-5">
        <h3 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-accent"><FileText className="h-4 w-4" /> Histórico de {direction === 'INCOMING' ? 'recebimentos' : 'envios'}</h3>
        {visibleLogs.length === 0 ? <p className="rounded-lg border border-dashed border-border-subtle py-6 text-center text-[10px] text-text-secondary">Nenhuma tentativa registrada.</p> : <div className="max-h-72 space-y-2 overflow-y-auto pr-1">{visibleLogs.map((log) => <div key={log.id} className="space-y-1.5 rounded-lg border border-border-subtle bg-bg-base p-3 text-[10px]"><div className="flex items-center justify-between gap-2"><span className="font-bold text-white">{log.webhook.name}{log.event ? ` • ${log.event}` : ''}</span><div className="flex items-center gap-2"><span className={log.status === 'SUCCESS' ? 'text-accent-light' : 'text-danger'}>{log.status}{log.statusCode ? ` • HTTP ${log.statusCode}` : ''}</span>{direction === 'OUTGOING' && log.status === 'ERROR' && <button type="button" disabled={pending} onClick={() => retryLog(log.id)} className="font-bold text-accent-light">Reenviar</button>}</div></div><p className="truncate rounded bg-glass-1 p-1 font-mono text-text-tertiary">{log.payload}</p>{log.errorDetails && <p className="text-danger">{log.errorDetails}</p>}{log.responseBody && <p className="max-h-16 overflow-auto whitespace-pre-wrap text-text-secondary">Resposta: {log.responseBody}</p>}<p className="text-right text-[9px] text-text-tertiary">Tentativa {log.attempt}{log.durationMs !== null ? ` • ${log.durationMs} ms` : ''} • {new Date(log.createdAt).toLocaleString('pt-BR')}</p></div>)}</div>}
      </div>
    </div>
  );
}
