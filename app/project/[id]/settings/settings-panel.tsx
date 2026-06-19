'use client';

import React, { useState } from 'react';
import { 
  createStage, 
  deleteStage,
  createTag,
  deleteTag,
  createOrigin,
  deleteOrigin,
  createLostStatus,
  deleteLostStatus,
  createCustomFieldDefinition,
  deleteCustomFieldDefinition,
  createWebhookEndpoint,
  deleteWebhookEndpoint,
  updateProjectCommercials,
  generateProjectApiKey,
  createPipeline,
  updatePipeline,
  deletePipeline,
  createForm,
  updateForm,
  deleteForm
} from '@/app/actions/crm';
import {
  createWhatsAppInstance,
  deleteWhatsAppInstance,
  getQRCode
} from '@/app/actions/whatsapp';
import {
  getUserCalendarIntegrations,
  disconnectCalendarIntegration
} from '@/app/actions/calendar';
import { Calendar } from 'lucide-react';
import { 
  Settings, 
  Layers, 
  Tag as TagIcon, 
  Webhook, 
  Compass, 
  Frown, 
  PlusCircle, 
  Trash2, 
  Plus, 
  QrCode, 
  MessageSquare,
  Link,
  ChevronRight,
  Clipboard,
  FileText,
  Loader2,
  ListTodo,
  X,
  User,
  Key,
  Copy,
  Check,
  Palette
} from 'lucide-react';

interface Stage {
  id: string;
  name: string;
  order: number;
  color: string;
}

interface Pipeline {
  id: string;
  name: string;
  stages: Stage[];
}

interface Tag {
  id: string;
  name: string;
  color: string;
}

interface Origin {
  id: string;
  name: string;
}

interface LostStatus {
  id: string;
  reason: string;
}

interface CustomFieldDef {
  id: string;
  name: string;
  type: string;
  options: string | null;
}

interface WebhookEndpoint {
  id: string;
  name: string;
  token: string;
  targetStageId: string;
  originId: string | null;
  origin?: { name: string } | null;
  fieldMapping: string;
}

interface WebhookLog {
  id: string;
  webhookId: string;
  payload: string;
  status: string;
  errorDetails: string | null;
  createdAt: Date;
  webhook: { name: string };
}

interface WhatsAppInstance {
  id: string;
  name: string;
  instanceName: string;
  token: string | null;
  status: string;
  type: string;
}

interface Member {
  id: string;
  userId: string;
  role: string;
  isDesignatedCommercial: boolean;
  user: {
    id: string;
    name: string | null;
    email: string;
  };
}

interface FormField {
  id: string;
  formId: string;
  type: 'SYSTEM' | 'CUSTOM';
  fieldName: string;
  customFieldDefinitionId: string | null;
  label: string;
  required: boolean;
  order: number;
}

interface Form {
  id: string;
  name: string;
  token: string;
  projectId: string;
  pipelineId: string;
  stageId: string;
  originId: string | null;
  successMessage: string;
  redirectUrl: string | null;
  isActive: boolean;
  fields: FormField[];
  pipeline?: { name: string };
  stage?: { name: string };
  origin?: { name: string } | null;
  createdAt: Date;
}

interface SettingsPanelProps {
  projectId: string;
  projectRole: string;
  pipelines: Pipeline[];
  tags: Tag[];
  origins: Origin[];
  lostStatuses: LostStatus[];
  customFieldDefs: CustomFieldDef[];
  webhooks: WebhookEndpoint[];
  webhookLogs: WebhookLog[];
  whatsappInstances: WhatsAppInstance[];
  members: Member[];
  initialApiKeyPrefix?: string | null;
  initialForms: Form[];
}

export function SettingsPanel({
  projectId,
  projectRole,
  pipelines,
  tags: initialTags,
  origins: initialOrigins,
  lostStatuses: initialLostStatuses,
  customFieldDefs: initialCustomFieldDefs,
  webhooks: initialWebhooks,
  webhookLogs,
  whatsappInstances: initialWhatsappInstances,
  members: initialMembers,
  initialApiKeyPrefix,
  initialForms,
}: SettingsPanelProps) {
  const isAdmin = projectRole === 'PROJECT_ADMIN' || projectRole === 'SUPERADMIN';
  const [activeTab, setActiveTab] = useState<'funnels' | 'tags' | 'origins' | 'losses' | 'custom' | 'webhooks' | 'whatsapp' | 'comerciais' | 'api' | 'forms' | 'appearance' | 'calendar'>(isAdmin ? 'funnels' : 'forms');
  const [currentTheme, setCurrentTheme] = useState('dark');

  const [calendarStatus, setCalendarStatus] = useState<{
    google: { connected: boolean; email: string | null };
    microsoft: { connected: boolean; email: string | null };
  }>({
    google: { connected: false, email: null },
    microsoft: { connected: false, email: null },
  });
  const [loadingCalendar, setLoadingCalendar] = useState(false);

  const fetchCalendarIntegrations = React.useCallback(async () => {
    setLoadingCalendar(true);
    try {
      const res = await getUserCalendarIntegrations();
      setCalendarStatus(res);
    } catch (err) {
      console.error('Erro ao buscar integrações de agenda:', err);
    } finally {
      setLoadingCalendar(false);
    }
  }, []);

  React.useEffect(() => {
    if (typeof window !== 'undefined') {
      const theme = localStorage.getItem('theme') || 'dark';
      setCurrentTheme(theme);
    }
    const handleThemeChange = () => {
      if (typeof window !== 'undefined') {
        const theme = localStorage.getItem('theme') || 'dark';
        setCurrentTheme(theme);
      }
    };
    window.addEventListener('theme-changed', handleThemeChange);
    return () => window.removeEventListener('theme-changed', handleThemeChange);
  }, []);

  // Inicializa a aba ativa a partir da query param ?tab=
  React.useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const tabParam = params.get('tab');
      const validTabs = ['funnels', 'tags', 'origins', 'losses', 'custom', 'webhooks', 'whatsapp', 'comerciais', 'api', 'forms', 'appearance', 'calendar'];
      if (tabParam && validTabs.includes(tabParam)) {
        setActiveTab(tabParam as any);
      }
    }
  }, []);

  React.useEffect(() => {
    if (activeTab === 'calendar') {
      fetchCalendarIntegrations();
    }
  }, [activeTab, fetchCalendarIntegrations]);

  // URL base para os webhooks de entrada e webhook da Evolution
  const baseUrl = typeof window !== 'undefined' ? `${window.location.protocol}//${window.location.host}` : 'http://localhost:3000';

  // Estados Locais
  const [pipelineList, setPipelineList] = useState<Pipeline[]>(pipelines);
  const [selectedPipeline, setSelectedPipeline] = useState<Pipeline | null>(pipelines[0] || null);
  const [newPipelineName, setNewPipelineName] = useState('');
  const [editingPipelineName, setEditingPipelineName] = useState('');
  const [isEditingPipelineName, setIsEditingPipelineName] = useState(false);

  const [stages, setStages] = useState<Stage[]>(selectedPipeline?.stages || []);

  React.useEffect(() => {
    setStages(selectedPipeline?.stages || []);
    if (selectedPipeline) {
      setEditingPipelineName(selectedPipeline.name);
    }
    setIsEditingPipelineName(false);
  }, [selectedPipeline]);
  const [tagsList, setTagsList] = useState<Tag[]>(initialTags);
  const [originsList, setOriginsList] = useState<Origin[]>(initialOrigins);
  const [lostList, setLostList] = useState<LostStatus[]>(initialLostStatuses);
  const [customList, setCustomList] = useState<CustomFieldDef[]>(initialCustomFieldDefs);
  const [webhooksList, setWebhooksList] = useState<WebhookEndpoint[]>(initialWebhooks);
  const [whatsappList, setWhatsappList] = useState<WhatsAppInstance[]>(initialWhatsappInstances);

  // Estados para Gestão de Formulários Embutidos
  const [formsList, setFormsList] = useState<Form[]>(initialForms || []);
  const [isFormEditorOpen, setIsFormEditorOpen] = useState(false);
  const [editingFormId, setEditingFormId] = useState<string | null>(null);
  const [embedForm, setEmbedForm] = useState<Form | null>(null);

  // Estados dos inputs do editor de formulário
  const [formName, setFormName] = useState('');
  const [formPipelineId, setFormPipelineId] = useState('');
  const [formStageId, setFormStageId] = useState('');
  const [formOriginId, setFormOriginId] = useState('');
  const [formSuccessMessage, setFormSuccessMessage] = useState('Formulário enviado com sucesso!');
  const [formRedirectUrl, setFormRedirectUrl] = useState('');

  // Campos locais do formulário no editor
  interface TempFormField {
    type: 'SYSTEM' | 'CUSTOM';
    fieldName: string;
    customFieldDefinitionId: string | null;
    label: string;
    required: boolean;
    order: number;
  }
  const [formFields, setFormFields] = useState<TempFormField[]>([]);
  const [fieldToAdd, setFieldToAdd] = useState('');
  const [isSavingForm, setIsSavingForm] = useState(false);

  // Manipuladores de eventos de Formulários
  const handleOpenNewForm = () => {
    setEditingFormId(null);
    setFormName('');
    setFormPipelineId(pipelines[0]?.id || '');
    setFormStageId(pipelines[0]?.stages[0]?.id || '');
    setFormOriginId('');
    setFormSuccessMessage('Formulário enviado com sucesso!');
    setFormRedirectUrl('');
    setFormFields([
      { type: 'SYSTEM', fieldName: 'name', customFieldDefinitionId: null, label: 'Nome Completo', required: true, order: 0 },
      { type: 'SYSTEM', fieldName: 'email', customFieldDefinitionId: null, label: 'E-mail', required: true, order: 1 },
      { type: 'SYSTEM', fieldName: 'phone', customFieldDefinitionId: null, label: 'WhatsApp / Telefone', required: true, order: 2 }
    ]);
    setIsFormEditorOpen(true);
  };

  const handleOpenEditForm = (form: Form) => {
    setEditingFormId(form.id);
    setFormName(form.name);
    setFormPipelineId(form.pipelineId);
    setFormStageId(form.stageId);
    setFormOriginId(form.originId || '');
    setFormSuccessMessage(form.successMessage);
    setFormRedirectUrl(form.redirectUrl || '');
    setFormFields(form.fields.map(f => ({
      type: f.type,
      fieldName: f.fieldName,
      customFieldDefinitionId: f.customFieldDefinitionId,
      label: f.label,
      required: f.required,
      order: f.order
    })));
    setIsFormEditorOpen(true);
  };

  const handlePipelineChange = (pId: string) => {
    setFormPipelineId(pId);
    const pipeline = pipelines.find(p => p.id === pId);
    setFormStageId(pipeline?.stages[0]?.id || '');
  };

  const handleAddField = () => {
    if (!fieldToAdd) return;
    if (formFields.some(f => f.fieldName === fieldToAdd)) {
      alert('Este campo já foi adicionado ao formulário.');
      return;
    }
    
    let newField: TempFormField;
    if (fieldToAdd === 'name') {
      newField = { type: 'SYSTEM', fieldName: 'name', customFieldDefinitionId: null, label: 'Nome Completo', required: false, order: formFields.length };
    } else if (fieldToAdd === 'email') {
      newField = { type: 'SYSTEM', fieldName: 'email', customFieldDefinitionId: null, label: 'E-mail', required: false, order: formFields.length };
    } else if (fieldToAdd === 'phone') {
      newField = { type: 'SYSTEM', fieldName: 'phone', customFieldDefinitionId: null, label: 'WhatsApp / Telefone', required: false, order: formFields.length };
    } else {
      const customDef = initialCustomFieldDefs.find(d => d.id === fieldToAdd);
      if (!customDef) return;
      newField = {
        type: 'CUSTOM',
        fieldName: customDef.id,
        customFieldDefinitionId: customDef.id,
        label: customDef.name,
        required: false,
        order: formFields.length
      };
    }
    
    setFormFields([...formFields, newField]);
    setFieldToAdd('');
  };

  const handleRemoveField = (fieldName: string) => {
    const remaining = formFields.filter(f => f.fieldName !== fieldName);
    const hasIdentifier = remaining.some(
      f => f.type === 'SYSTEM' && (f.fieldName === 'email' || f.fieldName === 'phone')
    );
    if (!hasIdentifier) {
      alert('Erro: O formulário precisa conter ao menos um identificador (E-mail ou Telefone) para deduplicação!');
      return;
    }
    setFormFields(remaining.map((f, idx) => ({ ...f, order: idx })));
  };

  const handleMoveField = (index: number, direction: 'up' | 'down') => {
    if (direction === 'up' && index === 0) return;
    if (direction === 'down' && index === formFields.length - 1) return;
    
    const newFields = [...formFields];
    const swapWith = direction === 'up' ? index - 1 : index + 1;
    
    const temp = newFields[index];
    newFields[index] = newFields[swapWith];
    newFields[swapWith] = temp;
    
    setFormFields(newFields.map((f, idx) => ({ ...f, order: idx })));
  };

  const handleSaveForm = async () => {
    if (!formName.trim()) {
      alert('Por favor, informe o nome do formulário.');
      return;
    }
    
    setIsSavingForm(true);
    try {
      if (editingFormId) {
        const updated = await updateForm(projectId, editingFormId, {
          name: formName,
          pipelineId: formPipelineId,
          stageId: formStageId,
          originId: formOriginId || null,
          successMessage: formSuccessMessage,
          redirectUrl: formRedirectUrl || null,
          fields: formFields
        });
        setFormsList(formsList.map(f => f.id === editingFormId ? (updated as any) : f));
      } else {
        const created = await createForm(projectId, {
          name: formName,
          pipelineId: formPipelineId,
          stageId: formStageId,
          originId: formOriginId || null,
          successMessage: formSuccessMessage,
          redirectUrl: formRedirectUrl || null,
          fields: formFields
        });
        setFormsList([created as any, ...formsList]);
      }
      setIsFormEditorOpen(false);
    } catch (err: any) {
      alert(err.message || 'Erro ao salvar o formulário.');
    } finally {
      setIsSavingForm(false);
    }
  };

  const handleDeleteForm = async (formId: string) => {
    if (!confirm('Deseja realmente excluir este formulário? Esta ação é irreversível.')) return;
    try {
      await deleteForm(projectId, formId);
      setFormsList(formsList.filter(f => f.id !== formId));
    } catch (err: any) {
      alert(err.message || 'Erro ao excluir o formulário.');
    }
  };

  const getEmbedCode = (form: Form) => {
    const fieldsHtml = form.fields
      .map(f => {
        const fieldType = f.fieldName === 'email' ? 'email' : 'text';
        const requiredAttr = f.required ? ' required' : '';
        const requiredAsterisk = f.required ? ' *' : '';
        return `  <div class="nfs-field">
    <label class="nfs-label">${f.label}${requiredAsterisk}</label>
    <input type="${fieldType}" name="${f.fieldName}" class="nfs-input"${requiredAttr} />
  </div>`;
      })
      .join('\n\n');

    return `<!-- NFS Embedded Form: ${form.name} -->
<form action="${baseUrl}/api/forms/submit/${form.token}" method="POST" class="nfs-form">
  <!-- Honeypot protection field against spam bots -->
  <div style="display: none !important;">
    <input type="text" name="nfs_hp_website" tabindex="-1" autocomplete="off" />
  </div>

  <!-- Hidden tracking fields for campaigns (UTMs) -->
  <input type="hidden" name="utm_source" value="" />
  <input type="hidden" name="utm_medium" value="" />
  <input type="hidden" name="utm_campaign" value="" />
  <input type="hidden" name="utm_content" value="" />
  <input type="hidden" name="utm_term" value="" />
  <input type="hidden" name="referrer" value="" />
  <input type="hidden" name="url" value="" />

${fieldsHtml}

  <button type="submit" class="nfs-button">Enviar</button>
</form>

<script>
  (function() {
    var params = new URLSearchParams(window.location.search);
    var utms = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'];
    
    // Guardar UTMs da URL no localStorage se estiverem presentes
    utms.forEach(function(key) {
      var val = params.get(key);
      if (val) {
        localStorage.setItem('nfs_' + key, val);
      }
    });

    // Registrar o referrer (página anterior) e url de entrada se não existirem no localStorage
    if (document.referrer && !localStorage.getItem('nfs_referrer')) {
      localStorage.setItem('nfs_referrer', document.referrer);
    }
    if (!localStorage.getItem('nfs_url')) {
      localStorage.setItem('nfs_url', window.location.href);
    }

    // Valores finais preenchidos (busca da URL, cai para o localStorage da primeira visita, ou fica vazio)
    var values = {
      utm_source: params.get('utm_source') || localStorage.getItem('nfs_utm_source') || '',
      utm_medium: params.get('utm_medium') || localStorage.getItem('nfs_utm_medium') || '',
      utm_campaign: params.get('utm_campaign') || localStorage.getItem('nfs_utm_campaign') || '',
      utm_content: params.get('utm_content') || localStorage.getItem('nfs_utm_content') || '',
      utm_term: params.get('utm_term') || localStorage.getItem('nfs_utm_term') || '',
      referrer: document.referrer || localStorage.getItem('nfs_referrer') || '',
      url: window.location.href
    };

    function fillFormFields() {
      var form = document.querySelector('form[action*="${form.token}"]');
      if (form) {
        Object.keys(values).forEach(function(key) {
          var input = form.querySelector('input[name="' + key + '"]');
          if (input) {
            input.value = values[key];
          }
        });
      }
    }

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', fillFormFields);
    } else {
      fillFormFields();
    }
  })();
</script>`;
  };
  const [membersList, setMembersList] = useState<Member[]>(initialMembers);
  const [selectedCommercialIds, setSelectedCommercialIds] = useState<string[]>(
    initialMembers.filter(m => m.isDesignatedCommercial).map(m => m.userId)
  );
  
  const [isPending, setIsPending] = useState(false);
  const [qrState, setQrState] = useState<{ instanceId: string; code: string | null; loading: boolean } | null>(null);

  // Estados para API Key
  const [apiKeyPrefix, setApiKeyPrefix] = useState<string | null>(initialApiKeyPrefix || null);
  const [newGeneratedKey, setNewGeneratedKey] = useState<string | null>(null);
  const [isGeneratingKey, setIsGeneratingKey] = useState(false);
  const [showKeyModal, setShowKeyModal] = useState(false);
  const [copied, setCopied] = useState(false);

  // Form de Estágio
  const [newStageName, setNewStageName] = useState('');
  const [newStageColor, setNewStageColor] = useState('#9FE870');

  // Form de Tag
  const [newTagName, setNewTagName] = useState('');
  const [newTagColor, setNewTagColor] = useState('#9FE870');

  // Form de Origem
  const [newOriginName, setNewOriginName] = useState('');

  // Form de Motivo de Perda
  const [newLostReason, setNewLostReason] = useState('');

  // Form de Campo Personalizado
  const [newFieldName, setNewFieldName] = useState('');
  const [newFieldType, setNewFieldType] = useState<'TEXT' | 'NUMBER' | 'SELECT'>('TEXT');
  const [newFieldOptions, setNewFieldOptions] = useState(''); // Opções separadas por vírgula

  // Form de Webhook
  const [newWebhookName, setNewWebhookName] = useState('');
  const [newWebhookStageId, setNewWebhookStageId] = useState(stages[0]?.id || '');
  const [newWebhookOriginId, setNewWebhookOriginId] = useState('');
  const [mappingName, setMappingName] = useState('name');
  const [mappingEmail, setMappingEmail] = useState('email');
  const [mappingPhone, setMappingPhone] = useState('phone');
  const [mappingCompany, setMappingCompany] = useState('company');
  const [mappingValue, setMappingValue] = useState('value');

  // Form de WhatsApp
  const [newWhatsappName, setNewWhatsappName] = useState('');
  const [newWhatsappType, setNewWhatsappType] = useState('WHATSAPP');

  // Utilitário para copiar link
  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    alert('Link copiado para a área de transferência!');
  };

  // ==========================================
  // FUNÇÕES DE SALVAR / EXCLUIR
  // ==========================================

  const handleAddPipeline = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPipelineName.trim()) return;
    setIsPending(true);
    try {
      await createPipeline(projectId, newPipelineName.trim());
      setNewPipelineName('');
      window.location.reload();
    } catch (err) {
      console.error(err);
      alert(err instanceof Error ? err.message : 'Erro ao criar Kanban.');
    } finally {
      setIsPending(false);
    }
  };

  const handleUpdatePipelineName = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPipeline || !editingPipelineName.trim()) return;
    setIsPending(true);
    try {
      await updatePipeline(projectId, selectedPipeline.id, editingPipelineName.trim());
      window.location.reload();
    } catch (err) {
      console.error(err);
      alert(err instanceof Error ? err.message : 'Erro ao atualizar Kanban.');
    } finally {
      setIsPending(false);
    }
  };

  const handleDeletePipeline = async () => {
    if (!selectedPipeline) return;
    if (pipelineList.length <= 1) {
      alert('Não é possível excluir o único funil do projeto.');
      return;
    }
    if (!confirm(`Tem certeza que deseja excluir o funil "${selectedPipeline.name}"? Todos os estágios e participações dos leads nele serão permanentemente apagados!`)) {
      return;
    }
    setIsPending(true);
    try {
      await deletePipeline(projectId, selectedPipeline.id);
      window.location.reload();
    } catch (err) {
      console.error(err);
      alert(err instanceof Error ? err.message : 'Erro ao excluir o funil.');
    } finally {
      setIsPending(false);
    }
  };

  const handleAddStage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newStageName.trim() || !selectedPipeline) return;
    setIsPending(true);
    try {
      const created = await createStage(projectId, selectedPipeline.id, {
        name: newStageName,
        color: newStageColor,
        order: stages.length
      });
      setStages([...stages, created]);
      setNewStageName('');
    } catch (err) {
      console.error(err);
    } finally {
      setIsPending(false);
    }
  };

  const handleDeleteStage = async (stageId: string) => {
    if (!confirm('Deseja excluir este estágio comercial? Leads neste estágio serão excluídos.')) return;
    setIsPending(true);
    try {
      await deleteStage(projectId, stageId);
      setStages(stages.filter(s => s.id !== stageId));
    } catch (err) {
      console.error(err);
    } finally {
      setIsPending(false);
    }
  };

  const handleGenerateApiKey = async () => {
    if (apiKeyPrefix && !confirm('Tem certeza que deseja regerar a chave de API? A chave anterior será invalidada imediatamente.')) {
      return;
    }
    
    setIsGeneratingKey(true);
    try {
      const token = await generateProjectApiKey(projectId);
      setNewGeneratedKey(token);
      setApiKeyPrefix(token.substring(0, 12));
      setShowKeyModal(true);
      setCopied(false);
    } catch (err: any) {
      alert(err.message || 'Erro ao gerar chave de API.');
    } finally {
      setIsGeneratingKey(false);
    }
  };

  const handleCopyKey = () => {
    if (!newGeneratedKey) return;
    navigator.clipboard.writeText(newGeneratedKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleAddTag = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTagName.trim()) return;
    setIsPending(true);
    try {
      const created = await createTag(projectId, { name: newTagName, color: newTagColor });
      setTagsList([...tagsList, created]);
      setNewTagName('');
    } catch (err) {
      console.error(err);
    } finally {
      setIsPending(false);
    }
  };

  const handleDeleteTag = async (tagId: string) => {
    if (!confirm('Deseja excluir esta tag comercial?')) return;
    setIsPending(true);
    try {
      await deleteTag(projectId, tagId);
      setTagsList(tagsList.filter(t => t.id !== tagId));
    } catch (err) {
      console.error(err);
    } finally {
      setIsPending(false);
    }
  };

  const handleAddOrigin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newOriginName.trim()) return;
    setIsPending(true);
    try {
      const created = await createOrigin(projectId, newOriginName);
      setOriginsList([...originsList, created]);
      setNewOriginName('');
    } catch (err) {
      console.error(err);
    } finally {
      setIsPending(false);
    }
  };

  const handleDeleteOrigin = async (originId: string) => {
    if (!confirm('Deseja excluir esta origem? Leads vinculados perderão a referência.')) return;
    setIsPending(true);
    try {
      await deleteOrigin(projectId, originId);
      setOriginsList(originsList.filter(o => o.id !== originId));
    } catch (err) {
      console.error(err);
    } finally {
      setIsPending(false);
    }
  };

  const handleAddLost = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newLostReason.trim()) return;
    setIsPending(true);
    try {
      const created = await createLostStatus(projectId, newLostReason);
      setLostList([...lostList, created]);
      setNewLostReason('');
    } catch (err) {
      console.error(err);
    } finally {
      setIsPending(false);
    }
  };

  const handleDeleteLost = async (lostId: string) => {
    if (!confirm('Deseja excluir este motivo de perda?')) return;
    setIsPending(true);
    try {
      await deleteLostStatus(projectId, lostId);
      setLostList(lostList.filter(l => l.id !== lostId));
    } catch (err) {
      console.error(err);
    } finally {
      setIsPending(false);
    }
  };

  const handleAddCustom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFieldName.trim()) return;
    setIsPending(true);

    let parsedOptions = null;
    if (newFieldType === 'SELECT' && newFieldOptions.trim()) {
      parsedOptions = JSON.stringify(newFieldOptions.split(',').map(s => s.trim()));
    }

    try {
      const created = await createCustomFieldDefinition(projectId, {
        name: newFieldName,
        type: newFieldType,
        options: parsedOptions || undefined
      });
      setCustomList([...customList, created]);
      setNewFieldName('');
      setNewFieldOptions('');
    } catch (err) {
      console.error(err);
    } finally {
      setIsPending(false);
    }
  };

  const handleDeleteCustom = async (defId: string) => {
    if (!confirm('Deseja excluir este campo personalizado? Todos os valores salvos nos leads serão excluídos.')) return;
    setIsPending(true);
    try {
      await deleteCustomFieldDefinition(projectId, defId);
      setCustomList(customList.filter(c => c.id !== defId));
    } catch (err) {
      console.error(err);
    } finally {
      setIsPending(false);
    }
  };

  const handleAddWebhook = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newWebhookName.trim()) return;
    setIsPending(true);

    const mapping = {
      name: mappingName,
      email: mappingEmail,
      phone: mappingPhone,
      company: mappingCompany,
      value: mappingValue
    };

    try {
      const created = await createWebhookEndpoint(projectId, {
        name: newWebhookName,
        targetStageId: newWebhookStageId || stages[0]?.id,
        originId: newWebhookOriginId || undefined,
        fieldMapping: JSON.stringify(mapping)
      });
      
      const newWebhookObj: WebhookEndpoint = {
        id: created.id,
        name: created.name,
        token: created.token,
        targetStageId: created.targetStageId,
        originId: created.originId,
        origin: originsList.find(o => o.id === created.originId) || null,
        fieldMapping: created.fieldMapping
      };

      setWebhooksList([...webhooksList, newWebhookObj]);
      setNewWebhookName('');
      setNewWebhookOriginId('');
    } catch (err) {
      console.error(err);
    } finally {
      setIsPending(false);
    }
  };

  const handleDeleteWebhook = async (webhookId: string) => {
    if (!confirm('Deseja excluir este endpoint de webhook?')) return;
    setIsPending(true);
    try {
      await deleteWebhookEndpoint(projectId, webhookId);
      setWebhooksList(webhooksList.filter(w => w.id !== webhookId));
    } catch (err) {
      console.error(err);
    } finally {
      setIsPending(false);
    }
  };

  const handleAddWhatsapp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newWhatsappName.trim()) return;
    setIsPending(true);
    try {
      const created = await createWhatsAppInstance(projectId, newWhatsappName, newWhatsappType);
      setWhatsappList([...whatsappList, created as any]);
      setNewWhatsappName('');
    } catch (err) {
      console.error(err);
    } finally {
      setIsPending(false);
    }
  };

  const handleDeleteWhatsapp = async (instanceId: string) => {
    if (!confirm('Deseja deletar esta instância de conexão? A conexão com a Evolution API será desfeita.')) return;
    setIsPending(true);
    try {
      await deleteWhatsAppInstance(projectId, instanceId);
      setWhatsappList(whatsappList.filter(w => w.id !== instanceId));
    } catch (err) {
      console.error(err);
    } finally {
      setIsPending(false);
    }
  };

  const handleRequestQRCode = async (instanceId: string) => {
    setQrState({ instanceId, code: null, loading: true });
    try {
      const result = await getQRCode(projectId, instanceId);
      if (result.success && result.qrcode) {
        setQrState({ instanceId, code: result.qrcode, loading: false });
      } else {
        alert(result.message || 'QR Code não gerado.');
        setQrState(null);
      }
    } catch (err) {
      console.error(err);
      setQrState(null);
    }
  };

  return (
    <div className="flex-1 p-6 md:p-8 space-y-6 max-w-6xl mx-auto flex flex-col md:flex-row gap-8 h-screen overflow-hidden">
      
      {/* Coluna Esquerda: Menu de Configurações (W-64) */}
      <div className="w-full md:w-60 flex-shrink-0 flex flex-col">
        <div className="mb-6">
          <h1 className="text-xl font-bold font-display text-white tracking-tight flex items-center gap-2">
            <Settings className="h-5 w-5 text-accent" />
            Configurações
          </h1>
          <p className="text-[10px] text-text-secondary mt-0.5">Customização estrutural do CRM comercial.</p>
        </div>

        {/* Links das Abas */}
        <div className="space-y-1">
          {isAdmin && (
            <>
              <TabButton active={activeTab === 'funnels'} onClick={() => setActiveTab('funnels')} icon={<Layers className="h-4 w-4" />} label="Funis & Estágios" />
              <TabButton active={activeTab === 'tags'} onClick={() => setActiveTab('tags')} icon={<TagIcon className="h-4 w-4" />} label="Tags Comerciais" />
              <TabButton active={activeTab === 'origins'} onClick={() => setActiveTab('origins')} icon={<Compass className="h-4 w-4" />} label="Origens de Leads" />
              <TabButton active={activeTab === 'losses'} onClick={() => setActiveTab('losses')} icon={<Frown className="h-4 w-4" />} label="Motivos de Perda" />
              <TabButton active={activeTab === 'custom'} onClick={() => setActiveTab('custom')} icon={<ListTodo className="h-4 w-4" />} label="Campos Customizados" />
              <TabButton active={activeTab === 'webhooks'} onClick={() => setActiveTab('webhooks')} icon={<Webhook className="h-4 w-4" />} label="Webhooks de Entrada" />
              <TabButton active={activeTab === 'whatsapp'} onClick={() => setActiveTab('whatsapp')} icon={<MessageSquare className="h-4 w-4" />} label="Conexões WhatsApp" />
              <TabButton active={activeTab === 'comerciais'} onClick={() => setActiveTab('comerciais')} icon={<User className="h-4 w-4" />} label="Comerciais e Distribuição" />
              <TabButton active={activeTab === 'api'} onClick={() => setActiveTab('api')} icon={<Key className="h-4 w-4" />} label="Desenvolvedor & API" />
            </>
          )}
          <TabButton active={activeTab === 'forms'} onClick={() => setActiveTab('forms')} icon={<FileText className="h-4 w-4" />} label="Formulários" />
          <TabButton active={activeTab === 'appearance'} onClick={() => setActiveTab('appearance')} icon={<Palette className="h-4 w-4" />} label="Aparência" />
          <TabButton active={activeTab === 'calendar'} onClick={() => setActiveTab('calendar')} icon={<Calendar className="h-4 w-4" />} label="Minha Agenda" />
        </div>
      </div>

      {/* Coluna Direita: Conteúdo da Configuração (Flex-1) */}
      <div className="flex-1 bg-glass-1 border border-border-subtle rounded-2xl p-6 shadow-2xl flex flex-col min-h-0 overflow-y-auto">
        
        {/* ABA 1: FUNIS & ESTÁGIOS */}
        {activeTab === 'funnels' && (
          <div className="space-y-6">
            <div>
              <h2 className="text-md font-bold text-white font-display mb-1">Configuração de Funis (Kanbans) & Estágios</h2>
              <p className="text-xs text-text-secondary">Crie múltiplos funis para eventos ou lançamentos e gerencie suas etapas de vendas.</p>
            </div>

            {/* Seletor e Criação de Funil */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-glass-2 border border-border-subtle p-4 rounded-xl">
              <div className="flex flex-col gap-1.5 w-full sm:w-auto">
                <label className="text-[10px] font-bold text-text-secondary uppercase">Funil Ativo para Configuração</label>
                <select
                  value={selectedPipeline?.id || ''}
                  onChange={(e) => {
                    const found = pipelineList.find(p => p.id === e.target.value);
                    if (found) setSelectedPipeline(found);
                  }}
                  className="bg-bg-base border border-border-subtle rounded-lg px-3 py-2 text-xs text-white outline-none focus:border-accent w-full sm:w-60"
                >
                  {pipelineList.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>
              
              <form onSubmit={handleAddPipeline} className="flex gap-2 items-end w-full sm:w-auto">
                <div className="flex-1 sm:flex-initial flex flex-col gap-1.5 w-full">
                  <label className="text-[10px] font-bold text-text-secondary uppercase">Novo Funil de Evento / Lançamento</label>
                  <input
                    required
                    type="text"
                    placeholder="Ex: Lançamento Junho"
                    value={newPipelineName}
                    onChange={(e) => setNewPipelineName(e.target.value)}
                    className="bg-bg-base border border-border-subtle rounded-lg px-3 py-2 text-xs text-white outline-none focus:border-accent w-full sm:w-52"
                  />
                </div>
                <button
                  type="submit"
                  disabled={isPending}
                  className="px-4 py-2 bg-accent hover:bg-accent-light text-black font-bold text-xs rounded-lg transition-all h-9 cursor-pointer flex items-center gap-1.5"
                >
                  <Plus className="h-4 w-4" /> Criar Funil
                </button>
              </form>
            </div>

            {/* Ações e nome do Funil selecionado */}
            {selectedPipeline && (
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-glass-1 border border-border-subtle p-4 rounded-xl border-l-4 border-l-accent">
                {isEditingPipelineName ? (
                  <form onSubmit={handleUpdatePipelineName} className="flex gap-2 items-center w-full">
                    <input
                      required
                      type="text"
                      value={editingPipelineName}
                      onChange={(e) => setEditingPipelineName(e.target.value)}
                      className="bg-bg-base border border-border-subtle rounded-lg px-3 py-2 text-xs text-white outline-none focus:border-accent flex-1 max-w-xs"
                    />
                    <button
                      type="submit"
                      disabled={isPending}
                      className="px-3 py-1.5 bg-accent hover:bg-accent-light text-black font-bold text-xs rounded-lg transition-all cursor-pointer"
                    >
                      Salvar
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setEditingPipelineName(selectedPipeline.name);
                        setIsEditingPipelineName(false);
                      }}
                      className="px-3 py-1.5 bg-glass-5 hover:bg-[rgba(255,255,255,0.1)] text-white font-bold text-xs rounded-lg transition-all cursor-pointer"
                    >
                      Cancelar
                    </button>
                  </form>
                ) : (
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-bold text-white">Funil Selecionado: {selectedPipeline.name}</h3>
                    <button
                      onClick={() => setIsEditingPipelineName(true)}
                      className="text-text-secondary hover:text-white text-[10px] font-bold border border-border-subtle rounded px-2 py-0.5 cursor-pointer"
                    >
                      Renomear
                    </button>
                  </div>
                )}
                
                {pipelineList.length > 1 && (
                  <button
                    type="button"
                    onClick={handleDeletePipeline}
                    disabled={isPending}
                    className="px-3 py-1.5 bg-transparent border border-danger/40 hover:bg-danger hover:text-white text-danger font-bold text-xs rounded-lg transition-all cursor-pointer flex items-center gap-1"
                  >
                    <Trash2 className="h-3.5 w-3.5" /> Excluir Funil
                  </button>
                )}
              </div>
            )}

            {/* Estágios (Colunas) do Funil Selecionado */}
            {selectedPipeline && (
              <div className="space-y-4">
                <div className="border-t border-border-subtle pt-4">
                  <h3 className="text-xs font-bold text-white mb-1">Estágios do Funil (Colunas do Kanban)</h3>
                  <p className="text-[10px] text-text-secondary">Defina as colunas do seu Kanban para este funil ativo.</p>
                </div>

                {/* Formulário rápido */}
                <form onSubmit={handleAddStage} className="flex gap-2 items-end bg-glass-1 border border-border-subtle p-4 rounded-xl">
                  <div className="flex-1 flex flex-col gap-1.5">
                    <label className="text-[10px] font-bold text-text-secondary uppercase">Nome do Estágio</label>
                    <input
                      required
                      type="text"
                      placeholder="Ex: Proposta Enviada"
                      value={newStageName}
                      onChange={(e) => setNewStageName(e.target.value)}
                      className="bg-bg-base border border-border-subtle rounded-lg px-3 py-2 text-xs text-white outline-none focus:border-accent"
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] font-bold text-text-secondary uppercase">Cor Visual</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={newStageColor}
                        onChange={(e) => setNewStageColor(e.target.value)}
                        className="h-9 w-9 bg-transparent border-0 cursor-pointer"
                      />
                    </div>
                  </div>
                  <button
                    type="submit"
                    disabled={isPending}
                    className="px-4 py-2 bg-accent hover:bg-accent-light text-black font-bold text-xs rounded-lg transition-all h-9 cursor-pointer"
                  >
                    Adicionar
                  </button>
                </form>

                {/* Listagem de Estágios */}
                <div className="space-y-2.5">
                  {stages.map((stage) => (
                    <div key={stage.id} className="flex items-center justify-between p-3.5 bg-glass-2 border border-border-subtle rounded-xl text-xs">
                      <div className="flex items-center gap-2 text-white font-semibold">
                        <span className="h-3 w-3 rounded-full border border-black/20" style={{ backgroundColor: stage.color }} />
                        {stage.name}
                      </div>
                      <button
                        onClick={() => handleDeleteStage(stage.id)}
                        className="text-text-tertiary hover:text-danger p-1 cursor-pointer"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ABA 2: TAGS */}
        {activeTab === 'tags' && (
          <div className="space-y-6">
            <div>
              <h2 className="text-md font-bold text-white font-display mb-1">Tags Comerciais</h2>
              <p className="text-xs text-text-secondary">Etiquetas para segmentar seus leads com cores personalizadas.</p>
            </div>

            {/* Form */}
            <form onSubmit={handleAddTag} className="flex gap-2 items-end bg-glass-1 border border-border-subtle p-4 rounded-xl">
              <div className="flex-1 flex flex-col gap-1.5">
                <label className="text-[10px] font-bold text-text-secondary uppercase">Nome da Tag</label>
                <input
                  required
                  type="text"
                  placeholder="Ex: Hot Lead"
                  value={newTagName}
                  onChange={(e) => setNewTagName(e.target.value)}
                  className="bg-bg-base border border-border-subtle rounded-lg px-3 py-2 text-xs text-white outline-none focus:border-accent"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-bold text-text-secondary uppercase">Cor</label>
                <input
                  type="color"
                  value={newTagColor}
                  onChange={(e) => setNewTagColor(e.target.value)}
                  className="h-9 w-9 bg-transparent border-0 cursor-pointer"
                />
              </div>
              <button
                type="submit"
                disabled={isPending}
                className="px-4 py-2 bg-accent hover:bg-accent-light text-black font-bold text-xs rounded-lg transition-all h-9 cursor-pointer"
              >
                Criar Tag
              </button>
            </form>

            {/* Listagem */}
            <div className="flex flex-wrap gap-2">
              {tagsList.map((tag) => (
                <span 
                  key={tag.id}
                  className="inline-flex items-center gap-2 text-xs text-white px-3.5 py-1.5 rounded-full border border-transparent shadow"
                  style={{ backgroundColor: `${tag.color}33`, borderColor: tag.color }}
                >
                  <span className="font-semibold">{tag.name}</span>
                  <button
                    onClick={() => handleDeleteTag(tag.id)}
                    className="text-white/40 hover:text-danger cursor-pointer transition-colors p-0.5"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
          </div>
        )}

        {/* ABA 3: ORIGENS */}
        {activeTab === 'origins' && (
          <div className="space-y-6">
            <div>
              <h2 className="text-md font-bold text-white font-display mb-1">Origens de Leads (Canais)</h2>
              <p className="text-xs text-text-secondary">Configure os canais de entrada dos leads (ex: Instagram, WordPress, Indicação).</p>
            </div>

            {/* Form */}
            <form onSubmit={handleAddOrigin} className="flex gap-2 items-end bg-glass-1 border border-border-subtle p-4 rounded-xl">
              <div className="flex-1 flex flex-col gap-1.5">
                <label className="text-[10px] font-bold text-text-secondary uppercase">Nome do Canal / Origem</label>
                <input
                  required
                  type="text"
                  placeholder="Ex: Landing Page Wordpress"
                  value={newOriginName}
                  onChange={(e) => setNewOriginName(e.target.value)}
                  className="bg-bg-base border border-border-subtle rounded-lg px-3 py-2 text-xs text-white outline-none focus:border-accent"
                />
              </div>
              <button
                type="submit"
                disabled={isPending}
                className="px-4 py-2 bg-accent hover:bg-accent-light text-black font-bold text-xs rounded-lg transition-all h-9 cursor-pointer"
              >
                Adicionar
              </button>
            </form>

            {/* Listagem */}
            <div className="space-y-2">
              {originsList.map((origin) => (
                <div key={origin.id} className="flex items-center justify-between p-3 bg-glass-2 border border-border-subtle rounded-xl text-xs">
                  <span className="text-white font-bold">{origin.name}</span>
                  <button
                    onClick={() => handleDeleteOrigin(origin.id)}
                    className="text-text-tertiary hover:text-danger p-1 cursor-pointer"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ABA 4: MOTIVOS DE PERDA */}
        {activeTab === 'losses' && (
          <div className="space-y-6">
            <div>
              <h2 className="text-md font-bold text-white font-display mb-1">Motivos de Perda</h2>
              <p className="text-xs text-text-secondary">Configure justificativas para arquivar oportunidades perdidas no Kanban.</p>
            </div>

            {/* Form */}
            <form onSubmit={handleAddLost} className="flex gap-2 items-end bg-glass-1 border border-border-subtle p-4 rounded-xl">
              <div className="flex-1 flex flex-col gap-1.5">
                <label className="text-[10px] font-bold text-text-secondary uppercase">Justificativa / Motivo</label>
                <input
                  required
                  type="text"
                  placeholder="Ex: Preço muito elevado"
                  value={newLostReason}
                  onChange={(e) => setNewLostReason(e.target.value)}
                  className="bg-bg-base border border-border-subtle rounded-lg px-3 py-2 text-xs text-white outline-none focus:border-accent"
                />
              </div>
              <button
                type="submit"
                disabled={isPending}
                className="px-4 py-2 bg-accent hover:bg-accent-light text-black font-bold text-xs rounded-lg transition-all h-9 cursor-pointer"
              >
                Adicionar
              </button>
            </form>

            {/* Listagem */}
            <div className="space-y-2">
              {lostList.map((l) => (
                <div key={l.id} className="flex items-center justify-between p-3 bg-glass-2 border border-border-subtle rounded-xl text-xs">
                  <span className="text-white font-bold">{l.reason}</span>
                  <button
                    onClick={() => handleDeleteLost(l.id)}
                    className="text-text-tertiary hover:text-danger p-1 cursor-pointer"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ABA 5: CAMPOS PERSONALIZADOS */}
        {activeTab === 'custom' && (
          <div className="space-y-6">
            <div>
              <h2 className="text-md font-bold text-white font-display mb-1">Definição de Campos Customizados</h2>
              <p className="text-xs text-text-secondary">Crie novos campos de dados para os leads do seu projeto (ex: Faturamento, Segmento).</p>
            </div>

            {/* Form */}
            <form onSubmit={handleAddCustom} className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-glass-1 border border-border-subtle p-4 rounded-xl items-end">
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-bold text-text-secondary uppercase">Nome do Campo</label>
                <input
                  required
                  type="text"
                  placeholder="Ex: Faturamento Mensal"
                  value={newFieldName}
                  onChange={(e) => setNewFieldName(e.target.value)}
                  className="bg-bg-base border border-border-subtle rounded-lg px-3 py-2 text-xs text-white outline-none focus:border-accent"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-bold text-text-secondary uppercase">Tipo de Dado</label>
                <select
                  value={newFieldType}
                  onChange={(e) => setNewFieldType(e.target.value as any)}
                  className="bg-bg-base border border-border-subtle rounded-lg px-3 py-2 text-xs text-white outline-none focus:border-accent"
                >
                  <option value="TEXT">Texto Livre</option>
                  <option value="NUMBER">Número</option>
                  <option value="SELECT">Seleção Única (Dropdown)</option>
                </select>
              </div>

              {newFieldType === 'SELECT' && (
                <div className="flex flex-col gap-1.5 col-span-2">
                  <label className="text-[10px] font-bold text-text-secondary uppercase">Opções (separadas por vírgula)</label>
                  <input
                    required
                    type="text"
                    placeholder="Opção 1, Opção 2, Opção 3"
                    value={newFieldOptions}
                    onChange={(e) => setNewFieldOptions(e.target.value)}
                    className="bg-bg-base border border-border-subtle rounded-lg px-3 py-2 text-xs text-white outline-none focus:border-accent"
                  />
                </div>
              )}

              <button
                type="submit"
                disabled={isPending}
                className="px-4 py-2 bg-accent hover:bg-accent-light text-black font-bold text-xs rounded-lg transition-all h-9 cursor-pointer col-span-1 sm:col-span-2"
              >
                Salvar Definição
              </button>
            </form>

            {/* Listagem */}
            <div className="space-y-2">
              {customList.map((c) => (
                <div key={c.id} className="p-3.5 bg-glass-2 border border-border-subtle rounded-xl text-xs flex justify-between items-center">
                  <div>
                    <h4 className="font-bold text-white">{c.name}</h4>
                    <p className="text-[10px] text-text-secondary mt-0.5">
                      Tipo: {c.type} {c.options && `• Opções: ${JSON.parse(c.options).join(', ')}`}
                    </p>
                  </div>
                  <button
                    onClick={() => handleDeleteCustom(c.id)}
                    className="text-text-tertiary hover:text-danger p-1 cursor-pointer"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ABA 6: WEBHOOKS DE ENTRADA */}
        {activeTab === 'webhooks' && (
          <div className="space-y-6">
            <div>
              <h2 className="text-md font-bold text-white font-display mb-1">Webhooks de Entrada (Integrações)</h2>
              <p className="text-xs text-text-secondary">Configure URLs para receber leads automaticamente de plataformas externas (Kiwify, WordPress).</p>
            </div>

            {/* Form */}
            <form onSubmit={handleAddWebhook} className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-glass-1 border border-border-subtle p-4 rounded-xl items-end">
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-bold text-text-secondary uppercase">Nome da Integração</label>
                <input
                  required
                  type="text"
                  placeholder="Ex: Form WordPress Principal"
                  value={newWebhookName}
                  onChange={(e) => setNewWebhookName(e.target.value)}
                  className="bg-bg-base border border-border-subtle rounded-lg px-3 py-2 text-xs text-white outline-none focus:border-accent"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-bold text-text-secondary uppercase">Estágio de Destino</label>
                <select
                  value={newWebhookStageId}
                  onChange={(e) => setNewWebhookStageId(e.target.value)}
                  className="bg-bg-base border border-border-subtle rounded-lg px-3 py-2 text-xs text-white outline-none focus:border-accent"
                >
                  {pipelineList.map(pipeline => (
                    <optgroup key={pipeline.id} label={pipeline.name} className="bg-bg-elevated text-text-secondary">
                      {pipeline.stages.map(s => (
                        <option key={s.id} value={s.id} className="bg-bg-base text-white">
                          {s.name}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-bold text-text-secondary uppercase">Origem Associada</label>
                <select
                  value={newWebhookOriginId}
                  onChange={(e) => setNewWebhookOriginId(e.target.value)}
                  className="bg-bg-base border border-border-subtle rounded-lg px-3 py-2 text-xs text-white outline-none focus:border-accent"
                >
                  <option value="">Nenhuma (Indefinida)</option>
                  {originsList.map(o => (
                    <option key={o.id} value={o.id}>{o.name}</option>
                  ))}
                </select>
              </div>

              {/* Mapeamento simples */}
              <div className="col-span-2 border-t border-border-subtle pt-4 mt-2">
                <h4 className="text-xs font-bold text-white mb-3">Mapeamento de Campos (Nome da chave do JSON enviado)</h4>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  <div className="flex flex-col gap-1 text-[10px]">
                    <label className="text-text-secondary">Nome do Lead</label>
                    <input type="text" value={mappingName} onChange={e => setMappingName(e.target.value)} className="bg-bg-base border border-border-subtle rounded px-2.5 py-1 text-xs text-white" />
                  </div>
                  <div className="flex flex-col gap-1 text-[10px]">
                    <label className="text-text-secondary">E-mail</label>
                    <input type="text" value={mappingEmail} onChange={e => setMappingEmail(e.target.value)} className="bg-bg-base border border-border-subtle rounded px-2.5 py-1 text-xs text-white" />
                  </div>
                  <div className="flex flex-col gap-1 text-[10px]">
                    <label className="text-text-secondary">WhatsApp/Telefone</label>
                    <input type="text" value={mappingPhone} onChange={e => setMappingPhone(e.target.value)} className="bg-bg-base border border-border-subtle rounded px-2.5 py-1 text-xs text-white" />
                  </div>
                  <div className="flex flex-col gap-1 text-[10px]">
                    <label className="text-text-secondary">Empresa</label>
                    <input type="text" value={mappingCompany} onChange={e => setMappingCompany(e.target.value)} className="bg-bg-base border border-border-subtle rounded px-2.5 py-1 text-xs text-white" />
                  </div>
                  <div className="flex flex-col gap-1 text-[10px]">
                    <label className="text-text-secondary">Valor Estimado</label>
                    <input type="text" value={mappingValue} onChange={e => setMappingValue(e.target.value)} className="bg-bg-base border border-border-subtle rounded px-2.5 py-1 text-xs text-white" />
                  </div>
                </div>
              </div>

              <button
                type="submit"
                disabled={isPending}
                className="px-4 py-2 bg-accent hover:bg-accent-light text-black font-bold text-xs rounded-lg transition-all h-9 cursor-pointer col-span-2 mt-4"
              >
                Gerar Webhook Endpoint
              </button>
            </form>

            {/* Listagem */}
            <div className="space-y-4">
              {webhooksList.map((webhook) => {
                const webhookUrl = `${baseUrl}/api/webhooks/incoming/${webhook.token}`;
                return (
                  <div key={webhook.id} className="p-4 bg-glass-2 border border-border-subtle rounded-xl text-xs space-y-3 relative">
                    <button
                      onClick={() => handleDeleteWebhook(webhook.id)}
                      className="absolute top-4 right-4 text-text-tertiary hover:text-danger p-1 cursor-pointer"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                    <div>
                      <h4 className="font-bold text-white text-sm">{webhook.name}</h4>
                      <p className="text-[10px] text-text-secondary mt-0.5">
                        Destino: {stages.find(s => s.id === webhook.targetStageId)?.name || 'Estágio Desconhecido'} 
                        {webhook.origin && ` • Origem: ${webhook.origin.name}`}
                      </p>
                    </div>

                    <div className="flex items-center gap-2 bg-bg-base border border-border-subtle rounded-lg p-2">
                      <span className="text-[10px] text-text-tertiary select-all truncate flex-1 font-mono">{webhookUrl}</span>
                      <button
                        onClick={() => copyToClipboard(webhookUrl)}
                        className="p-1 text-accent hover:text-accent-light cursor-pointer"
                        title="Copiar URL"
                      >
                        <Clipboard className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Logs de Webhook (adendo) */}
            <div className="border-t border-border-subtle pt-6">
              <h3 className="text-xs font-bold text-accent uppercase tracking-wider mb-4 flex items-center gap-1.5">
                <FileText className="h-4 w-4" />
                Histórico & Logs de Depuração (Últimos 100)
              </h3>
              <div className="space-y-2 max-h-60 overflow-y-auto pr-2 custom-scrollbar">
                {webhookLogs.length === 0 ? (
                  <p className="text-[10px] text-text-secondary text-center py-4">Nenhum payload recebido até o momento.</p>
                ) : (
                  webhookLogs.map((log) => (
                    <div key={log.id} className="p-3 bg-bg-base border border-border-subtle rounded-lg text-[10px] space-y-1.5">
                      <div className="flex justify-between items-center">
                        <span className="font-bold text-white">{log.webhook.name}</span>
                        <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                          log.status === 'SUCCESS' ? 'bg-accent/10 text-accent-light' : 'bg-danger/10 text-danger'
                        }`}>
                          {log.status}
                        </span>
                      </div>
                      <p className="text-text-tertiary font-mono text-[9px] select-all truncate bg-glass-1 p-1 rounded border border-border-subtle">
                        {log.payload}
                      </p>
                      {log.errorDetails && <p className="text-danger font-semibold font-mono text-[9px]">{log.errorDetails}</p>}
                      <div className="text-[9px] text-text-secondary text-right">
                        {new Date(log.createdAt).toLocaleString('pt-BR')}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        {/* ABA 7: CONEXÕES WHATSAPP */}
        {activeTab === 'whatsapp' && (
          <div className="space-y-6">
            <div>
              <h2 className="text-md font-bold text-white font-display mb-1">Gerenciamento de Canais WhatsApp</h2>
              <p className="text-xs text-text-secondary">Cadastre instâncias da Evolution API para parear números de atendimento e chats no CRM.</p>
            </div>

            {/* Form */}
            <form onSubmit={handleAddWhatsapp} className="flex gap-2 items-end bg-glass-1 border border-border-subtle p-4 rounded-xl">
              <div className="flex-1 flex flex-col gap-1.5">
                <label className="text-[10px] font-bold text-text-secondary uppercase">Nome de Identificação (Ex: WhatsApp Comercial)</label>
                <input
                  required
                  type="text"
                  placeholder="Nome do número"
                  value={newWhatsappName}
                  onChange={(e) => setNewWhatsappName(e.target.value)}
                  className="bg-bg-base border border-border-subtle rounded-lg px-3 py-2 text-xs text-white outline-none focus:border-accent"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-bold text-text-secondary uppercase">Canal/Tipo</label>
                <select
                  value={newWhatsappType}
                  onChange={(e) => setNewWhatsappType(e.target.value)}
                  className="bg-bg-base border border-border-subtle rounded-lg px-3 py-2 text-xs text-white outline-none focus:border-accent"
                >
                  <option value="WHATSAPP">WhatsApp</option>
                  <option value="INSTAGRAM">Instagram (Pronto no Banco)</option>
                </select>
              </div>
              <button
                type="submit"
                disabled={isPending}
                className="px-4 py-2 bg-accent hover:bg-accent-light text-black font-bold text-xs rounded-lg transition-all h-9 cursor-pointer"
              >
                Registrar
              </button>
            </form>

            {/* Listagem */}
            <div className="space-y-4">
              {whatsappList.map((inst) => {
                const evolutionWebhookUrl = `${baseUrl}/api/webhooks/whatsapp`;
                return (
                  <div key={inst.id} className="p-4 bg-glass-2 border border-border-subtle rounded-xl text-xs space-y-4 relative">
                    <button
                      onClick={() => handleDeleteWhatsapp(inst.id)}
                      className="absolute top-4 right-4 text-text-tertiary hover:text-danger p-1 cursor-pointer"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>

                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded-lg bg-accent/10 flex items-center justify-center text-accent">
                        <MessageSquare className="h-4 w-4" />
                      </div>
                      <div>
                        <h4 className="font-bold text-white text-sm">{inst.name}</h4>
                        <p className="text-[9px] text-text-secondary mt-0.5">
                          Cod. Instância: {inst.instanceName} • Canal: <span className="text-white font-bold">{inst.type}</span>
                        </p>
                      </div>
                      
                      <span className={`ml-auto px-2 py-0.5 rounded text-[9px] font-bold border ${
                        inst.status === 'CONNECTED' 
                          ? 'bg-accent/10 text-accent border-accent/20' 
                          : 'bg-danger/10 text-danger border-danger/20'
                      }`}>
                        {inst.status === 'CONNECTED' ? 'CONECTADO' : 'DESCONECTADO'}
                      </span>
                    </div>

                    {/* Ações adicionais */}
                    {inst.status !== 'CONNECTED' && inst.type === 'WHATSAPP' && (
                      <div className="pt-2 border-t border-border-subtle flex flex-col items-center gap-3">
                        <button
                          onClick={() => handleRequestQRCode(inst.id)}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-accent hover:bg-accent-light text-black font-bold text-xs rounded-lg transition-all cursor-pointer"
                        >
                          <QrCode className="h-3.5 w-3.5" />
                          Gerar QR Code para Pareamento
                        </button>

                        {/* Exibe QR Code se disponível */}
                        {qrState?.instanceId === inst.id && (
                          <div className="bg-white p-3 rounded-xl border border-border-strong flex flex-col items-center justify-center gap-2">
                            {qrState.loading ? (
                              <div className="h-40 w-40 flex items-center justify-center text-black font-bold text-xs">
                                <Loader2 className="h-6 w-6 animate-spin text-accent" />
                                Carregando QR...
                              </div>
                            ) : qrState.code ? (
                              <>
                                <img src={qrState.code} alt="QR Code Evolution API" className="h-40 w-40 object-contain" />
                                <span className="text-[10px] text-black font-semibold">Abra o WhatsApp &gt; Aparelhos Conectados &gt; Conectar</span>
                              </>
                            ) : null}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Exibe a URL de Webhook da Evolution API */}
                    <div className="pt-3 border-t border-border-subtle space-y-1.5">
                      <span className="text-[9px] font-bold text-text-secondary uppercase tracking-wider block">URL Webhook para plugar na Evolution API:</span>
                      <div className="flex items-center gap-2 bg-bg-base border border-border-subtle rounded-lg p-2">
                        <span className="text-[10px] text-text-tertiary select-all truncate flex-1 font-mono">{evolutionWebhookUrl}</span>
                        <button
                          onClick={() => copyToClipboard(evolutionWebhookUrl)}
                          className="p-1 text-accent hover:text-accent-light cursor-pointer"
                          title="Copiar URL"
                        >
                          <Clipboard className="h-4 w-4" />
                        </button>
                      </div>
                    </div>

                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ABA 8: COMERCIAIS E DISTRIBUIÇÃO */}
        {activeTab === 'comerciais' && (
          <div className="space-y-6">
            <div>
              <h2 className="text-md font-bold text-white font-display mb-1">Comerciais e Distribuição de Leads</h2>
              <p className="text-xs text-text-secondary font-medium">
                Selecione os membros do projeto que atuarão como comerciais responsáveis por receber novos leads.
              </p>
            </div>

            {(() => {
              const handleSaveCommercials = async (e: React.FormEvent) => {
                e.preventDefault();
                if (selectedCommercialIds.length < 1 || selectedCommercialIds.length > 2) {
                  alert('Você deve designar no mínimo 1 e no máximo 2 comerciais responsáveis.');
                  return;
                }
                setIsPending(true);
                try {
                  await updateProjectCommercials(projectId, selectedCommercialIds);
                  alert('Configurações de distribuição comercial salvas com sucesso!');
                  setMembersList(membersList.map(m => ({
                    ...m,
                    isDesignatedCommercial: selectedCommercialIds.includes(m.userId)
                  })));
                } catch (err: any) {
                  console.error(err);
                  alert(err.message || 'Erro ao salvar comerciais.');
                } finally {
                  setIsPending(false);
                }
              };

              const handleToggleCommercialSelect = (userId: string) => {
                if (selectedCommercialIds.includes(userId)) {
                  setSelectedCommercialIds(selectedCommercialIds.filter(id => id !== userId));
                } else {
                  if (selectedCommercialIds.length >= 2) {
                    alert('Você só pode selecionar no máximo 2 comerciais para a distribuição.');
                    return;
                  }
                  setSelectedCommercialIds([...selectedCommercialIds, userId]);
                }
              };

              return (
                <form onSubmit={handleSaveCommercials} className="space-y-6">
                  <div className="bg-glass-1 border border-border-subtle p-4 rounded-xl space-y-4">
                    <h3 className="text-xs font-bold text-white uppercase tracking-wider">Membros Disponíveis</h3>
                    
                    <div className="space-y-2.5">
                      {membersList.length === 0 ? (
                        <p className="text-xs text-text-tertiary">Nenhum membro convidado para este projeto.</p>
                      ) : (
                        membersList.map((member) => {
                          const isSelected = selectedCommercialIds.includes(member.userId);
                          return (
                            <div
                              key={member.id}
                              onClick={() => handleToggleCommercialSelect(member.userId)}
                              className={`flex items-center justify-between p-3.5 border rounded-xl text-xs cursor-pointer transition-all ${
                                isSelected
                                  ? 'border-accent bg-accent-glow text-white font-bold'
                                  : 'border-border-subtle bg-glass-1 text-text-secondary hover:border-border-glass'
                              }`}
                            >
                              <div className="flex items-center gap-2.5">
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  onChange={() => {}} // handled by outer click
                                  className="accent-accent cursor-pointer"
                                />
                                <div className="flex flex-col gap-0.5">
                                  <span className="text-white font-bold">{member.user.name || 'Membro sem nome'}</span>
                                  <span className="text-[10px] text-text-tertiary font-mono">{member.user.email}</span>
                                </div>
                              </div>
                              <span className="text-[10px] bg-glass-3 px-2 py-0.5 rounded border border-border-subtle">
                                {member.role === 'PROJECT_ADMIN' ? 'Administrador' : 'Membro'}
                              </span>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>

                  {/* Modo de distribuição status card */}
                  <div className="bg-dark-glass-2 border border-border-subtle p-4 rounded-xl space-y-2 text-xs">
                    <h4 className="font-bold text-white uppercase tracking-wider text-[10px] text-accent">Modo de Atribuição Comercial</h4>
                    {selectedCommercialIds.length === 1 ? (
                      <div className="text-white leading-relaxed">
                        <p className="font-bold text-sm">Dono Único (100% de direcionamento)</p>
                        <p className="text-text-secondary text-[11px] mt-1">
                          Como apenas 1 comercial foi designado, todos os novos leads serão atribuídos diretamente a ele.
                        </p>
                      </div>
                    ) : selectedCommercialIds.length === 2 ? (
                      <div className="text-white leading-relaxed">
                        <p className="font-bold text-sm">Rodízio Alternado (Round-Robin)</p>
                        <p className="text-text-secondary text-[11px] mt-1">
                          Com 2 comerciais designados, novos leads serão distribuídos alternadamente de forma automática.
                        </p>
                      </div>
                    ) : (
                      <p className="text-danger font-semibold">
                        Selecione de 1 a 2 comerciais responsáveis para ativar a atribuição automática.
                      </p>
                    )}
                  </div>

                  <div className="flex justify-end">
                    <button
                      type="submit"
                      disabled={isPending || selectedCommercialIds.length < 1 || selectedCommercialIds.length > 2}
                      className="px-5 py-2.5 bg-accent hover:bg-accent-light disabled:bg-accent/40 disabled:text-black/60 text-black font-bold text-xs rounded-lg transition-all cursor-pointer flex items-center gap-1.5"
                    >
                      {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                      Salvar Configurações de Distribuição
                    </button>
                  </div>
                </form>
              );
            })()}
          </div>
        )}

        {/* ABA 9: DESENVOLVEDOR & API */}
        {activeTab === 'api' && (
          <div className="space-y-6 animate-fadeIn">
            <div>
              <h2 className="text-md font-bold text-white font-display mb-1">Chaves de API para Integração</h2>
              <p className="text-xs text-text-secondary">
                Use chaves de API para integrar agentes de IA (como Hermes Agente ou Claude), Zapier, Make ou automações próprias com seu funil comercial.
              </p>
            </div>

            <div className="p-5 bg-glass-2 border border-border-subtle rounded-xl space-y-4">
              <div>
                <h4 className="font-bold text-white text-[10px] uppercase tracking-wider text-accent mb-1.5">Status da API Key</h4>
                {apiKeyPrefix ? (
                  <p className="text-xs text-white">
                    Uma chave de API ativa está configurada para este projeto (Prefixo: <code className="bg-black/40 px-2 py-0.5 rounded font-mono text-accent">{apiKeyPrefix}</code>).
                  </p>
                ) : (
                  <p className="text-xs text-text-secondary">
                    Nenhuma chave de API configurada para este projeto. Gere uma nova chave para iniciar integrações.
                  </p>
                )}
              </div>

              <div className="bg-accent/5 border border-accent/20 rounded-lg p-3 text-[11px] text-text-secondary leading-relaxed space-y-2">
                <p className="font-bold text-white flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
                  Regras importantes de segurança e uso da API:
                </p>
                <ul className="list-disc pl-4 space-y-1">
                  <li>O token de API inteiro <code className="text-white">nfs_...</code> <strong>só será exibido uma vez</strong> no momento da geração para você copiar. Guarde-o em local seguro!</li>
                  <li>No banco de dados, guardamos apenas o hash da chave de API por motivos de segurança (a chave original nunca é exposta nem legível).</li>
                  <li><strong>Rate Limiting</strong>: Há um limite de até <strong>60 requisições por minuto</strong> por chave de API.</li>
                </ul>
              </div>

              <div className="flex justify-start">
                <button
                  type="button"
                  disabled={isGeneratingKey}
                  onClick={handleGenerateApiKey}
                  className="px-4 py-2 bg-accent hover:bg-accent-light disabled:bg-accent/40 disabled:text-black/60 text-black font-bold text-xs rounded-lg transition-all cursor-pointer flex items-center gap-1.5"
                >
                  {isGeneratingKey && <Loader2 className="h-4 w-4 animate-spin" />}
                  {apiKeyPrefix ? 'Regerar Chave de API' : 'Gerar Chave de API'}
                </button>
              </div>
            </div>

            <div className="p-5 bg-glass-2 border border-border-subtle rounded-xl space-y-3">
              <h4 className="font-bold text-white text-[10px] uppercase tracking-wider text-accent mb-1">Documentação Rápida dos Endpoints</h4>
              <p className="text-[11px] text-text-secondary">
                Todas as requisições devem incluir o header <code className="bg-black/35 px-1.5 py-0.5 rounded text-white">Authorization: Bearer SUA_CHAVE</code>.
              </p>
              
              <div className="space-y-3 text-[11px] font-mono">
                <div className="border border-border-subtle/50 rounded-lg p-3 bg-black/20">
                  <p className="text-white font-bold"><span className="text-green-400">GET</span> {baseUrl}/api/v1/pipelines</p>
                  <p className="text-text-tertiary mt-1 text-[10px]">Lista funis e estágios cadastrados no projeto.</p>
                </div>

                <div className="border border-border-subtle/50 rounded-lg p-3 bg-black/20">
                  <p className="text-white font-bold"><span className="text-green-400">GET</span> {baseUrl}/api/v1/leads</p>
                  <p className="text-text-tertiary mt-1 text-[10px]">Lista os leads e suas participações ativas.</p>
                </div>

                <div className="border border-border-subtle/50 rounded-lg p-3 bg-black/20">
                  <p className="text-white font-bold"><span className="text-blue-400">POST</span> {baseUrl}/api/v1/leads</p>
                  <p className="text-text-tertiary mt-1 text-[10px]">
                    Cria ou atualiza (deduplica) um lead. Distribui automaticamente comerciais em rodízio.<br />
                    JSON body: <code className="text-white">{"{ name: \"Nome\", email: \"...\", phone: \"...\", stageId: \"...\" }"}</code>
                  </p>
                </div>

                <div className="border border-border-subtle/50 rounded-lg p-3 bg-black/20">
                  <p className="text-white font-bold"><span className="text-red-400">DELETE</span> {baseUrl}/api/v1/leads/[id]</p>
                  <p className="text-text-tertiary mt-1 text-[10px]">Realiza o soft-delete de todas as participações do lead.</p>
                </div>
              </div>
            </div>
          </div>
        )}

      </div>

      {/* MODAL DE EXIBIÇÃO ÚNICA DA CHAVE DE API */}
      {showKeyModal && newGeneratedKey && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 animate-fadeIn">
          <div className="bg-background-card border border-accent/30 rounded-2xl p-6 max-w-md w-full shadow-2xl space-y-4 relative">
            <div className="flex items-center gap-2 text-accent">
              <Key className="h-6 w-6" />
              <h3 className="font-display font-bold text-lg text-white">Sua Chave de API foi Gerada!</h3>
            </div>

            <div className="bg-danger/10 border border-danger/30 rounded-lg p-3 text-[11px] text-danger-light leading-relaxed">
              <strong>ATENÇÃO:</strong> Esta chave será exibida <strong>apenas esta vez</strong>. Copie e guarde-a agora mesmo em um local seguro. Ao sair desta tela, você nunca mais poderá visualizá-la!
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] uppercase font-bold tracking-wider text-text-secondary">Token de Integração</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  readOnly
                  value={newGeneratedKey}
                  className="flex-1 bg-black/40 border border-border-subtle rounded-lg px-3 py-2 text-xs font-mono text-white focus:outline-none select-all"
                />
                <button
                  type="button"
                  onClick={handleCopyKey}
                  className="px-3 py-2 bg-accent hover:bg-accent-light text-black text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 cursor-pointer"
                >
                  {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  {copied ? 'Copiado' : 'Copiar'}
                </button>
              </div>
            </div>

            <div className="pt-2 flex justify-end">
              <button
                type="button"
                onClick={() => {
                  setShowKeyModal(false);
                  setNewGeneratedKey(null);
                }}
                className="px-4 py-2 bg-white/10 hover:bg-white/15 text-white font-bold text-xs rounded-lg transition-all cursor-pointer"
              >
                Entendi, salvei a chave!
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ABA: FORMULÁRIOS EMBUTIDOS */}
      {activeTab === 'forms' && (
        <div className="space-y-6">
          <div className="flex justify-between items-center border-b border-border-subtle pb-4">
            <div>
              <h2 className="text-md font-bold text-white font-display mb-1">Construtor de Formulários</h2>
              <p className="text-xs text-text-secondary">Crie formulários HTML semânticos para capturar leads diretamente do WordPress ou site externo.</p>
            </div>
            {isAdmin && !isFormEditorOpen && (
              <button
                onClick={handleOpenNewForm}
                className="flex items-center gap-1.5 px-3 py-2 bg-accent hover:bg-accent-light text-white text-xs font-bold rounded-lg transition-all cursor-pointer shadow-md shadow-accent-glow/20"
              >
                <Plus className="h-3.5 w-3.5" />
                Criar Formulário
              </button>
            )}
          </div>

          {/* EDITOR DE FORMULÁRIO */}
          {isFormEditorOpen ? (
            <div className="bg-glass-2 border border-border-subtle p-6 rounded-xl space-y-6">
              <h3 className="text-sm font-bold text-white font-display">
                {editingFormId ? 'Editar Formulário' : 'Novo Formulário Embutido'}
              </h3>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-bold text-text-secondary uppercase">Nome Interno</label>
                  <input
                    type="text"
                    placeholder="Ex: Form Evento Junho"
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    className="bg-bg-base border border-border-subtle rounded-lg px-3 py-2 text-xs text-white outline-none focus:border-accent"
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-bold text-text-secondary uppercase">Origem Padrão do Lead</label>
                  <select
                    value={formOriginId}
                    onChange={(e) => setFormOriginId(e.target.value)}
                    className="bg-bg-base border border-border-subtle rounded-lg px-3 py-2 text-xs text-white outline-none focus:border-accent"
                  >
                    <option value="">Nenhuma</option>
                    {originsList.map(o => (
                      <option key={o.id} value={o.id}>{o.name}</option>
                    ))}
                  </select>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-bold text-text-secondary uppercase">Funil de Destino (Kanban)</label>
                  <select
                    value={formPipelineId}
                    onChange={(e) => handlePipelineChange(e.target.value)}
                    className="bg-bg-base border border-border-subtle rounded-lg px-3 py-2 text-xs text-white outline-none focus:border-accent"
                  >
                    {pipelines.map(p => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-bold text-text-secondary uppercase">Estágio de Destino</label>
                  <select
                    value={formStageId}
                    onChange={(e) => setFormStageId(e.target.value)}
                    className="bg-bg-base border border-border-subtle rounded-lg px-3 py-2 text-xs text-white outline-none focus:border-accent"
                  >
                    {pipelines.find(p => p.id === formPipelineId)?.stages.map(s => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    )) || <option value="">Nenhum estágio disponível</option>}
                  </select>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-bold text-text-secondary uppercase">Mensagem de Sucesso (Exibida após preencher)</label>
                  <input
                    type="text"
                    placeholder="Formulário enviado com sucesso!"
                    value={formSuccessMessage}
                    onChange={(e) => setFormSuccessMessage(e.target.value)}
                    className="bg-bg-base border border-border-subtle rounded-lg px-3 py-2 text-xs text-white outline-none focus:border-accent"
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-bold text-text-secondary uppercase">URL de Redirecionamento (Opcional)</label>
                  <input
                    type="url"
                    placeholder="https://meusite.com/obrigado"
                    value={formRedirectUrl}
                    onChange={(e) => setFormRedirectUrl(e.target.value)}
                    className="bg-bg-base border border-border-subtle rounded-lg px-3 py-2 text-xs text-white outline-none focus:border-accent"
                  />
                </div>
              </div>

              {/* CONSTRUTOR DE CAMPOS */}
              <div className="border-t border-border-subtle pt-4 space-y-4">
                <div className="flex justify-between items-center">
                  <h4 className="text-xs font-bold text-white font-display uppercase tracking-wider">Campos do Formulário</h4>
                  
                  {/* Seletor para adicionar novo campo */}
                  <div className="flex gap-2 items-center">
                    <select
                      value={fieldToAdd}
                      onChange={(e) => setFieldToAdd(e.target.value)}
                      className="bg-bg-base border border-border-subtle rounded-lg px-2.5 py-1.5 text-xs text-white outline-none focus:border-accent"
                    >
                      <option value="">-- Selecione um campo --</option>
                      <optgroup label="Campos de Sistema">
                        {!formFields.some(f => f.fieldName === 'name') && <option value="name">Nome Completo</option>}
                        {!formFields.some(f => f.fieldName === 'email') && <option value="email">E-mail</option>}
                        {!formFields.some(f => f.fieldName === 'phone') && <option value="phone">WhatsApp / Telefone</option>}
                      </optgroup>
                      <optgroup label="Campos Personalizados">
                        {initialCustomFieldDefs.map(def => (
                          <option key={def.id} value={def.id}>{def.name} ({def.type})</option>
                        ))}
                      </optgroup>
                    </select>
                    <button
                      type="button"
                      onClick={handleAddField}
                      className="px-3 py-1.5 bg-accent/20 hover:bg-accent/35 text-accent-light text-xs font-bold rounded-lg transition-all cursor-pointer border border-accent/30"
                    >
                      Adicionar
                    </button>
                  </div>
                </div>

                <div className="bg-bg-base rounded-xl border border-border-subtle overflow-hidden">
                  <table className="w-full text-xs text-left border-collapse">
                    <thead>
                      <tr className="border-b border-border-subtle bg-white/[0.02] text-text-secondary uppercase text-[10px] font-bold">
                        <th className="p-3">Nome Técnico</th>
                        <th className="p-3">Rótulo Exibido (Label)</th>
                        <th className="p-3">Tipo</th>
                        <th className="p-3 text-center">Obrigatório</th>
                        <th className="p-3 text-center">Ordenação</th>
                        <th className="p-3 text-right">Ações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {formFields.map((field, idx) => (
                        <tr key={idx} className="border-b border-border-subtle hover:bg-white/[0.01] transition-colors">
                          <td className="p-3 font-mono text-text-secondary text-[11px]">{field.fieldName}</td>
                          <td className="p-3">
                            <input
                              type="text"
                              value={field.label}
                              onChange={(e) => {
                                const updated = [...formFields];
                                updated[idx].label = e.target.value;
                                setFormFields(updated);
                              }}
                              className="bg-bg-base border border-border-subtle rounded px-2 py-1 text-xs text-white outline-none focus:border-accent w-full"
                            />
                          </td>
                          <td className="p-3">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              field.type === 'SYSTEM' ? 'bg-accent/15 text-accent-light' : 'bg-purple-500/15 text-purple-300'
                            }`}>
                              {field.type === 'SYSTEM' ? 'Sistema' : 'Personalizado'}
                            </span>
                          </td>
                          <td className="p-3 text-center">
                            <input
                              type="checkbox"
                              checked={field.required}
                              onChange={(e) => {
                                const updated = [...formFields];
                                updated[idx].required = e.target.checked;
                                setFormFields(updated);
                              }}
                              className="h-3.5 w-3.5 accent-accent cursor-pointer"
                            />
                          </td>
                          <td className="p-3 text-center">
                            <div className="flex gap-1 justify-center">
                              <button
                                type="button"
                                disabled={idx === 0}
                                onClick={() => handleMoveField(idx, 'up')}
                                className="p-1 hover:bg-white/5 rounded text-text-secondary disabled:opacity-30 disabled:pointer-events-none"
                              >
                                ▲
                              </button>
                              <button
                                type="button"
                                disabled={idx === formFields.length - 1}
                                onClick={() => handleMoveField(idx, 'down')}
                                className="p-1 hover:bg-white/5 rounded text-text-secondary disabled:opacity-30 disabled:pointer-events-none"
                              >
                                ▼
                              </button>
                            </div>
                          </td>
                          <td className="p-3 text-right">
                            <button
                              type="button"
                              onClick={() => handleRemoveField(field.fieldName)}
                              className="p-1 hover:bg-danger/10 text-danger rounded transition-colors"
                              title="Remover Campo"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="flex gap-3 justify-end border-t border-border-subtle pt-4">
                <button
                  type="button"
                  onClick={() => setIsFormEditorOpen(false)}
                  className="px-4 py-2 bg-white/10 hover:bg-white/15 text-white font-bold text-xs rounded-lg transition-all cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  disabled={isSavingForm}
                  onClick={handleSaveForm}
                  className="px-4 py-2 bg-accent hover:bg-accent-light text-white font-bold text-xs rounded-lg transition-all cursor-pointer disabled:opacity-50"
                >
                  {isSavingForm ? 'Salvando...' : 'Salvar Formulário'}
                </button>
              </div>
            </div>
          ) : (
            /* GRID DE LISTAGEM DE FORMULÁRIOS */
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {formsList.map(form => (
                <div key={form.id} className="bg-glass-1 border border-border-subtle border-l-accent hover:border-l-accent-light rounded-xl p-5 shadow-lg relative overflow-hidden group hover:bg-white/[0.01] transition-all">
                  <div className="flex justify-between items-start">
                    <div>
                      <h3 className="text-sm font-bold text-white font-display mb-1">{form.name}</h3>
                      <p className="text-[10px] text-text-secondary">
                        Destino: <span className="text-accent-light">{form.pipeline?.name}</span> &gt; <span className="text-accent-light">{form.stage?.name}</span>
                      </p>
                      {form.origin && (
                        <p className="text-[10px] text-text-secondary mt-0.5">
                          Origem marcada: <span className="text-white">{form.origin.name}</span>
                        </p>
                      )}
                      <p className="text-[10px] text-text-tertiary mt-2">
                        Campos coletados: {form.fields.length}
                      </p>
                    </div>
                    
                    <div className="flex gap-2">
                      <button
                        onClick={() => setEmbedForm(form)}
                        className="flex items-center gap-1 px-2.5 py-1.5 bg-accent/10 border border-accent/20 hover:bg-accent/25 hover:border-accent/40 text-accent text-[10px] font-bold rounded transition-all cursor-pointer"
                        title="Ver Código HTML para WordPress"
                      >
                        <Link className="h-3 w-3" />
                        Embutir Code
                      </button>
                    </div>
                  </div>

                  <div className="flex justify-end gap-3 border-t border-border-subtle mt-4 pt-3 opacity-60 group-hover:opacity-100 transition-opacity">
                    {isAdmin && (
                      <>
                        <button
                          onClick={() => handleOpenEditForm(form)}
                          className="text-[11px] font-semibold text-text-secondary hover:text-white transition-colors cursor-pointer"
                        >
                          Editar
                        </button>
                        <button
                          onClick={() => handleDeleteForm(form.id)}
                          className="text-[11px] font-semibold text-danger hover:text-red-400 transition-colors cursor-pointer"
                        >
                          Excluir
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ))}

              {formsList.length === 0 && (
                <div className="md:col-span-2 text-center py-10 bg-glass-1 border border-border-subtle border-dashed rounded-xl">
                  <p className="text-xs text-text-secondary">Nenhum formulário cadastrado para este projeto.</p>
                  {isAdmin && (
                    <button
                      onClick={handleOpenNewForm}
                      className="mt-3 px-3 py-2 bg-accent/20 hover:bg-accent/35 text-accent-light text-xs font-bold rounded-lg border border-accent/30 transition-all cursor-pointer"
                    >
                      Criar Primeiro Formulário
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ABA: APARÊNCIA (TEMAS) */}
      {activeTab === 'appearance' && (
        <div className="space-y-6">
          <div>
            <h2 className="text-md font-bold text-text-primary font-display mb-1">Configuração de Aparência e Tema</h2>
            <p className="text-xs text-text-secondary">Escolha o estilo visual de sua preferência para navegar pela plataforma.</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 pt-2">
            {/* Opção Tema Dark */}
            <button
              onClick={() => {
                localStorage.setItem('theme', 'dark');
                document.documentElement.setAttribute('data-theme', 'dark');
                window.dispatchEvent(new Event('theme-changed'));
              }}
              className={`p-5 rounded-2xl border text-left flex flex-col gap-4 transition-all hover:translate-y-[-2px] cursor-pointer ${
                currentTheme !== 'light'
                  ? 'bg-accent/10 border-accent shadow-lg shadow-accent/10'
                  : 'bg-glass-2 border-border-subtle hover:border-border-strong'
              }`}
            >
              <div className="h-28 w-full bg-[#050505] border border-border-subtle rounded-xl flex overflow-hidden">
                <div className="w-1/4 bg-[#0a0f0a] border-r border-border-subtle p-2 space-y-1">
                  <div className="h-2 w-full bg-accent/20 rounded"></div>
                  <div className="h-2 w-8/12 bg-glass-3 rounded"></div>
                  <div className="h-2 w-6/12 bg-glass-3 rounded"></div>
                </div>
                <div className="flex-1 p-3 bg-gradient-to-b from-[#050505] to-[#09120b] space-y-2">
                  <div className="h-3 w-1/3 bg-glass-3 rounded"></div>
                  <div className="grid grid-cols-3 gap-1">
                    <div className="h-10 bg-glass-2 border border-border-subtle rounded"></div>
                    <div className="h-10 bg-glass-2 border border-border-subtle rounded"></div>
                    <div className="h-10 bg-glass-2 border border-border-subtle rounded"></div>
                  </div>
                </div>
              </div>
              <div>
                <h4 className="text-xs font-bold text-text-primary">Tema Black / Escuro</h4>
                <p className="text-[10px] text-text-secondary mt-1">
                  Visual padrão da plataforma com fundo escuro, efeitos em vidro (glassmorphism) e destaques neon.
                </p>
              </div>
            </button>

            {/* Opção Tema Light */}
            <button
              onClick={() => {
                localStorage.setItem('theme', 'light');
                document.documentElement.setAttribute('data-theme', 'light');
                window.dispatchEvent(new Event('theme-changed'));
              }}
              className={`p-5 rounded-2xl border text-left flex flex-col gap-4 transition-all hover:translate-y-[-2px] cursor-pointer ${
                currentTheme === 'light'
                  ? 'bg-accent/10 border-accent shadow-lg shadow-accent/10'
                  : 'bg-glass-2 border-border-subtle hover:border-border-strong'
              }`}
            >
              <div className="h-28 w-full bg-[#f9fafb] border border-border-strong rounded-xl flex overflow-hidden">
                <div className="w-1/4 bg-[#f3f4f6] border-r border-border-strong p-2 space-y-1">
                  <div className="h-2 w-full bg-accent/30 rounded"></div>
                  <div className="h-2 w-8/12 bg-glass-3 rounded"></div>
                  <div className="h-2 w-6/12 bg-glass-3 rounded"></div>
                </div>
                <div className="flex-1 p-3 bg-gradient-to-b from-[#f9fafb] to-[#f3f4f6] space-y-2">
                  <div className="h-3 w-1/3 bg-glass-3 rounded"></div>
                  <div className="grid grid-cols-3 gap-1">
                    <div className="h-10 bg-white border border-border-strong rounded shadow-sm"></div>
                    <div className="h-10 bg-white border border-border-strong rounded shadow-sm"></div>
                    <div className="h-10 bg-white border border-border-strong rounded shadow-sm"></div>
                  </div>
                </div>
              </div>
              <div>
                <h4 className="text-xs font-bold text-text-primary">Tema Light / Claro</h4>
                <p className="text-[10px] text-text-secondary mt-1">
                  Visual com fundo claro, melhorando a visibilidade sob luz forte com elementos limpos e sombras sutis.
                </p>
              </div>
            </button>
          </div>
        </div>
      )}

      {/* ABA: AGENDA (CALENDAR INTEGRATIONS) */}
      {activeTab === 'calendar' && (
        <div className="space-y-6">
          <div>
            <h2 className="text-md font-bold text-text-primary font-display mb-1">Minha Agenda Pessoal (Sincronização de Tarefas)</h2>
            <p className="text-xs text-text-secondary">Conecte sua agenda pessoal para que as tarefas comerciais criadas por você no CRM sejam automaticamente sincronizadas.</p>
          </div>

          {loadingCalendar ? (
            <div className="flex items-center justify-center py-12 text-xs text-text-secondary gap-2">
              <Loader2 className="h-4 w-4 animate-spin text-accent" />
              Carregando conexões de agenda...
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 pt-2">
              {/* Card Google Calendar */}
              <div className="bg-glass-2 border border-border-subtle p-5 rounded-2xl flex flex-col justify-between gap-4">
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="h-9 w-9 bg-blue-600/10 border border-blue-600/25 rounded-xl flex items-center justify-center text-blue-500 font-bold text-sm">
                        G
                      </div>
                      <div>
                        <h4 className="text-xs font-bold text-white">Google Calendar</h4>
                        <p className="text-[10px] text-text-tertiary">Google Agenda pessoal ou corporativo</p>
                      </div>
                    </div>

                    {calendarStatus.google.connected ? (
                      <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-accent/15 border border-accent/25 text-accent">
                        Integrado
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-full text-[9px] font-semibold bg-glass-3 border border-border-subtle text-text-tertiary">
                        Desconectado
                      </span>
                    )}
                  </div>

                  {calendarStatus.google.connected && (
                    <div className="bg-glass-3 border border-border-subtle p-3 rounded-xl flex items-center justify-between">
                      <div>
                        <span className="text-[9px] font-bold text-text-tertiary uppercase block">Conta Conectada</span>
                        <span className="text-xs font-semibold text-white">{calendarStatus.google.email}</span>
                      </div>
                    </div>
                  )}
                </div>

                {calendarStatus.google.connected ? (
                  <button
                    onClick={async () => {
                      if (confirm('Tem certeza que deseja desconectar o Google Agenda?')) {
                        await disconnectCalendarIntegration(projectId, 'GOOGLE');
                        fetchCalendarIntegrations();
                      }
                    }}
                    className="w-full py-2 bg-glass-3 hover:bg-danger/10 border border-border-subtle hover:border-danger/30 text-text-secondary hover:text-danger text-xs font-bold rounded-lg transition-all cursor-pointer"
                  >
                    Desconectar Google Agenda
                  </button>
                ) : (
                  <a
                    href={`/api/integrations/google/auth?projectId=${projectId}`}
                    className="w-full py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-blue-600/10"
                  >
                    Conectar Google Agenda
                  </a>
                )}
              </div>

              {/* Card Microsoft Calendar */}
              <div className="bg-glass-2 border border-border-subtle p-5 rounded-2xl flex flex-col justify-between gap-4">
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="h-9 w-9 bg-emerald-600/10 border border-emerald-600/25 rounded-xl flex items-center justify-center text-emerald-500 font-bold text-sm">
                        M
                      </div>
                      <div>
                        <h4 className="text-xs font-bold text-white">Outlook Calendar</h4>
                        <p className="text-[10px] text-text-tertiary">Microsoft 365 ou Outlook.com pessoal</p>
                      </div>
                    </div>

                    {calendarStatus.microsoft.connected ? (
                      <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-accent/15 border border-accent/25 text-accent">
                        Integrado
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-full text-[9px] font-semibold bg-glass-3 border border-border-subtle text-text-tertiary">
                        Desconectado
                      </span>
                    )}
                  </div>

                  {calendarStatus.microsoft.connected && (
                    <div className="bg-glass-3 border border-border-subtle p-3 rounded-xl flex items-center justify-between">
                      <div>
                        <span className="text-[9px] font-bold text-text-tertiary uppercase block">Conta Conectada</span>
                        <span className="text-xs font-semibold text-white">{calendarStatus.microsoft.email}</span>
                      </div>
                    </div>
                  )}
                </div>

                {calendarStatus.microsoft.connected ? (
                  <button
                    onClick={async () => {
                      if (confirm('Tem certeza que deseja desconectar o Outlook Agenda?')) {
                        await disconnectCalendarIntegration(projectId, 'MICROSOFT');
                        fetchCalendarIntegrations();
                      }
                    }}
                    className="w-full py-2 bg-glass-3 hover:bg-danger/10 border border-border-subtle hover:border-danger/30 text-text-secondary hover:text-danger text-xs font-bold rounded-lg transition-all cursor-pointer"
                  >
                    Desconectar Outlook Agenda
                  </button>
                ) : (
                  <a
                    href={`/api/integrations/microsoft/auth?projectId=${projectId}`}
                    className="w-full py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-emerald-600/10"
                  >
                    Conectar Outlook Agenda
                  </a>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* MODAL DE CÓDIGO EMBUTIDO */}
      {embedForm && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-bg-base border border-border-strong w-full max-w-2xl rounded-2xl p-6 shadow-2xl flex flex-col max-h-[85vh]">
            <div className="flex justify-between items-start border-b border-border-subtle pb-3">
              <div>
                <h3 className="text-md font-bold text-white font-display">Código HTML para Incorporação</h3>
                <p className="text-[10px] text-text-secondary mt-0.5">Copie o código abaixo e cole no bloco de HTML/Custom HTML do seu WordPress ou site.</p>
              </div>
              <button
                onClick={() => setEmbedForm(null)}
                className="p-1 hover:bg-white/5 text-text-secondary hover:text-white rounded transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto py-4 space-y-4 min-h-0">
              <div className="relative">
                <pre className="bg-black/40 border border-border-subtle p-4 rounded-xl font-mono text-[10px] text-accent-light overflow-x-auto whitespace-pre select-all max-h-[40vh]">
                  {getEmbedCode(embedForm)}
                </pre>
                
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(getEmbedCode(embedForm));
                    alert('Código copiado para a área de transferência!');
                  }}
                  className="absolute top-2 right-2 flex items-center gap-1.5 px-3 py-1.5 bg-accent hover:bg-accent-light text-white text-[10px] font-bold rounded-lg transition-all cursor-pointer shadow"
                >
                  <Clipboard className="h-3 w-3" />
                  Copiar Código
                </button>
              </div>

              <div className="bg-accent-glow/5 border border-accent/20 rounded-xl p-4 space-y-2 text-xs">
                <h4 className="font-bold text-accent-light">Classes CSS para Estilização</h4>
                <p className="text-text-secondary text-[11px] leading-relaxed">
                  Você tem total liberdade para estilizar o formulário no CSS do seu site WordPress. O formulário é gerado com as seguintes classes semânticas:
                </p>
                <ul className="list-disc pl-4 space-y-1 text-text-secondary text-[11px] font-mono">
                  <li><strong className="text-white">.nfs-form</strong>: Aplica-se à tag &lt;form&gt; principal.</li>
                  <li><strong className="text-white">.nfs-field</strong>: Div contendo um campo (rótulo + input).</li>
                  <li><strong className="text-white">.nfs-label</strong>: A tag &lt;label&gt; do campo.</li>
                  <li><strong className="text-white">.nfs-input</strong>: Os campos de entrada (&lt;input type="text"&gt; ou &lt;input type="email"&gt;).</li>
                  <li><strong className="text-white">.nfs-button</strong>: O botão &lt;button type="submit"&gt; de envio.</li>
                </ul>
              </div>
            </div>

            <div className="flex justify-end pt-3 border-t border-border-subtle">
              <button
                onClick={() => setEmbedForm(null)}
                className="px-4 py-2 bg-accent text-white font-bold text-xs rounded-lg hover:bg-accent-light transition-all cursor-pointer"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Subcomponente de Aba Lateral
interface TabButtonProps {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}

function TabButton({ active, onClick, icon, label }: TabButtonProps) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-xs font-semibold border transition-all cursor-pointer ${
        active 
          ? 'bg-accent/15 border-border-glass text-accent' 
          : 'text-text-secondary hover:text-white border-transparent hover:bg-glass-2'
      }`}
    >
      <span className={active ? 'text-accent' : 'text-text-tertiary'}>
        {icon}
      </span>
      {label}
    </button>
  );
}
