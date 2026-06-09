'use client';

import React, { useState, useEffect } from 'react';
import { 
  getLeads, 
  getLeadById,
  updateLead,
  createActivityComment,
  createTask,
  updateTask,
  deleteTask,
  getLeadCustomFields,
  updateLeadCustomFieldValues,
  deleteLead,
  getCustomFieldDefinitions,
  exportLeadsToCSVAction,
  importLeadsAction,
  batchDeleteLeadsAction
} from '@/app/actions/crm';
import { useRouter } from 'next/navigation';
import { startWhatsAppConversation } from '@/app/actions/whatsapp';
import { 
  Search, 
  Filter, 
  User, 
  Building2, 
  Phone, 
  Mail, 
  DollarSign, 
  Tag as TagIcon,
  X,
  Plus,
  Loader2,
  Trash2,
  Clock,
  CheckSquare,
  Calendar,
  CheckCircle2,
  Circle,
  FileText,
  MessageSquare
} from 'lucide-react';

interface Pipeline {
  id: string;
  name: string;
  stages: Array<{
    id: string;
    name: string;
    order: number;
    color: string;
  }>;
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

interface Lead {
  id: string;
  name: string;
  company: string | null;
  email: string | null;
  phone: string | null;
  priority: string;
  origin?: { name: string } | null;
  tags: Tag[];
  tasks: { id: string }[];
  assignedUserId?: string | null;
  assignedUser?: { id: string; name: string | null; email: string } | null;
  pipelineEntries: Array<{
    id: string;
    pipelineId: string;
    stageId: string;
    value: number;
    status: string;
    lostStatusId: string | null;
    lostStatus?: { reason: string } | null;
    pipeline: { name: string };
    stage: { name: string };
  }>;
}

interface CustomField {
  id: string;
  name: string;
  type: string;
  options: string | null;
  valueId: string | null;
  value: string;
}

interface LeadsListProps {
  projectId: string;
  initialLeads: Lead[];
  tags: Tag[];
  origins: Origin[];
  lostStatuses: LostStatus[];
  pipelines: Pipeline[];
  members: Member[];
}

export function LeadsList({ projectId, initialLeads, tags, origins, lostStatuses, pipelines, members }: LeadsListProps) {
  const [leads, setLeads] = useState<Lead[]>(initialLeads);
  
  // Filtros
  const [search, setSearch] = useState('');
  const [selectedTagId, setSelectedTagId] = useState('');
  const [selectedPriority, setSelectedPriority] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('ACTIVE'); // ACTIVE, LOST, ARCHIVED
  const [selectedOriginId, setSelectedOriginId] = useState('');

  // Detalhes do Lead
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const [leadDetail, setLeadDetail] = useState<any | null>(null);
  const router = useRouter();
  const [isStartingChat, setIsStartingChat] = useState(false);

  // Estados para Operações em Lote
  const [selectedLeadIds, setSelectedLeadIds] = useState<string[]>([]);
  const [customFieldDefs, setCustomFieldDefs] = useState<any[]>([]);

  // Estados do Modal de Importação CSV
  const [showImportModal, setShowImportModal] = useState(false);
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [csvRows, setCsvRows] = useState<string[][]>([]);
  const [fieldMapping, setFieldMapping] = useState<Record<string, number>>({}); // campoDB -> indiceColunaCSV
  const [importOriginId, setImportOriginId] = useState<string>('');
  const [importPipelineId, setImportPipelineId] = useState<string>(pipelines[0]?.id || '');
  const [importStageId, setImportStageId] = useState<string>(pipelines[0]?.stages[0]?.id || '');
  const [isImporting, setIsImporting] = useState(false);
  const [importResult, setImportResult] = useState<{
    successCount: number;
    failureCount: number;
    errors: Array<{ line: number; error: string }>;
  } | null>(null);

  useEffect(() => {
    const pipe = pipelines.find(p => p.id === importPipelineId);
    setImportStageId(pipe?.stages[0]?.id || '');
  }, [importPipelineId, pipelines]);

  // Estados internos do modal
  const [newComment, setNewComment] = useState('');
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskDue, setNewTaskDue] = useState('');
  const [customFields, setCustomFields] = useState<CustomField[]>([]);
  const [editingCustomFields, setEditingCustomFields] = useState<Record<string, string>>({});
  const [isSavingCustomFields, setIsSavingCustomFields] = useState(false);
  const [isEditingBaseLead, setIsEditingBaseLead] = useState(false);

  // Campos de edição rápida do lead no modal
  const [editName, setEditName] = useState('');
  const [editCompany, setEditCompany] = useState('');
  const [editPriority, setEditPriority] = useState<any>('MEDIA');
  const [editPhone, setEditPhone] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editOriginId, setEditOriginId] = useState('');
  const [editAssignedUserId, setEditAssignedUserId] = useState<string>('');

  // Estados para Adição de Funil
  const [addPipelineId, setAddPipelineId] = useState('');
  const [addStageId, setAddStageId] = useState('');
  const [addValue, setAddValue] = useState('0');
  const [isAddingEntry, setIsAddingEntry] = useState(false);

  // Atualiza leads filtrando do banco
  const fetchFilteredLeads = async () => {
    try {
      const filtered = await getLeads(projectId, {
        search: search || undefined,
        tagId: selectedTagId || undefined,
        priority: selectedPriority || undefined,
        status: selectedStatus || undefined,
        originId: selectedOriginId || undefined
      });
      setLeads(filtered as any);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchFilteredLeads();
  }, [search, selectedTagId, selectedPriority, selectedStatus, selectedOriginId]);

  // Carrega as definições de campos personalizados do projeto no mount
  useEffect(() => {
    async function loadDefs() {
      try {
        const defs = await getCustomFieldDefinitions(projectId);
        setCustomFieldDefs(defs);
      } catch (err) {
        console.error('Erro ao buscar definições de campos personalizados:', err);
      }
    }
    loadDefs();
  }, [projectId]);

  // ==========================================
  // CARREGAR DETALHES DO LEAD
  // ==========================================
  const loadLeadDetails = async (leadId: string) => {
    try {
      const detail = await getLeadById(projectId, leadId);
      setLeadDetail(detail);
      
      const fields = await getLeadCustomFields(projectId, leadId);
      setCustomFields(fields as any);
      
      const fieldValues: Record<string, string> = {};
      fields.forEach(f => {
        fieldValues[f.id] = f.value;
      });
      setEditingCustomFields(fieldValues);

      if (detail) {
        setEditName(detail.name);
        setEditCompany(detail.company || '');
        setEditPriority(detail.priority);
        setEditPhone(detail.phone || '');
        setEditEmail(detail.email || '');
        setEditOriginId(detail.originId || '');
        setEditAssignedUserId(detail.assignedUserId || '');
      }
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    if (selectedLeadId) {
      loadLeadDetails(selectedLeadId);
    } else {
      setLeadDetail(null);
      setCustomFields([]);
    }
  }, [selectedLeadId]);

  // ==========================================
  // ATIVIDADES
  // ==========================================
  const handleAddComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newComment.trim() || !selectedLeadId) return;
    try {
      await createActivityComment(projectId, selectedLeadId, newComment);
      setNewComment('');
      loadLeadDetails(selectedLeadId);
    } catch (err) {
      console.error(err);
    }
  };

  // ==========================================
  // TAREFAS
  // ==========================================
  const handleAddTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTaskTitle.trim() || !selectedLeadId) return;
    try {
      await createTask(projectId, {
        title: newTaskTitle,
        dueDate: newTaskDue || undefined,
        leadId: selectedLeadId
      });
      setNewTaskTitle('');
      setNewTaskDue('');
      loadLeadDetails(selectedLeadId);
    } catch (err) {
      console.error(err);
    }
  };

  const handleToggleTaskStatus = async (taskId: string, currentStatus: string) => {
    if (!selectedLeadId) return;
    const targetStatus = currentStatus === 'COMPLETED' ? 'PENDING' : 'COMPLETED';
    try {
      await updateTask(projectId, taskId, { status: targetStatus });
      loadLeadDetails(selectedLeadId);
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteTask = async (taskId: string) => {
    if (!confirm('Deseja excluir esta tarefa?') || !selectedLeadId) return;
    try {
      await deleteTask(projectId, taskId);
      loadLeadDetails(selectedLeadId);
    } catch (err) {
      console.error(err);
    }
  };

  // ==========================================
  // CAMPOS PERSONALIZADOS
  // ==========================================
  const handleCustomFieldChange = (defId: string, val: string) => {
    setEditingCustomFields({ ...editingCustomFields, [defId]: val });
  };

  const handleSaveCustomFields = async () => {
    if (!selectedLeadId) return;
    setIsSavingCustomFields(true);
    try {
      await updateLeadCustomFieldValues(projectId, selectedLeadId, editingCustomFields);
      loadLeadDetails(selectedLeadId);
    } catch (err) {
      console.error(err);
    } finally {
      setIsSavingCustomFields(false);
    }
  };

  const handleStartChat = async () => {
    if (!leadDetail) return;
    setIsStartingChat(true);
    try {
      const res = await startWhatsAppConversation(projectId, leadDetail.id);
      if (res.success && res.conversationId) {
        router.push(`/project/${projectId}/inbox?selected=${res.conversationId}`);
      } else {
        alert(res.message || 'Erro ao iniciar conversa');
      }
    } catch (err: any) {
      console.error(err);
      alert(err.message || 'Erro ao iniciar conversa');
    } finally {
      setIsStartingChat(false);
    }
  };

  // ==========================================
  // EDIÇÃO DE INFORMAÇÕES BÁSICAS
  // ==========================================
  const handleSaveBaseLead = async () => {
    if (!selectedLeadId) return;
    try {
      await updateLead(projectId, selectedLeadId, {
        name: editName,
        company: editCompany,
        priority: editPriority,
        phone: editPhone,
        email: editEmail,
        originId: editOriginId || null,
        assignedUserId: editAssignedUserId || null
      });
      setIsEditingBaseLead(false);
      loadLeadDetails(selectedLeadId);
      fetchFilteredLeads(); // Recarrega tabela
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteLead = async () => {
    if (!confirm('Deseja arquivar (excluir) este lead?') || !selectedLeadId) return;
    try {
      await deleteLead(projectId, selectedLeadId);
      setSelectedLeadId(null);
      fetchFilteredLeads(); // Recarrega tabela
    } catch (err) {
      console.error(err);
    }
  };

  const handleUpdatePipelineEntry = async (
    pipelineId: string, 
    stageId: string, 
    value: number, 
    status: string, 
    lostStatusId: string | null
  ) => {
    if (!selectedLeadId) return;
    try {
      await updateLead(projectId, selectedLeadId, {
        pipelineId,
        stageId,
        value,
        status: status as any,
        lostStatusId: status === 'LOST' ? lostStatusId : null
      });
      loadLeadDetails(selectedLeadId);
      fetchFilteredLeads();
    } catch (err) {
      console.error(err);
      alert('Erro ao atualizar participação.');
    }
  };

  const handleAddPipelineEntry = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedLeadId || !addPipelineId || !addStageId) return;
    setIsAddingEntry(true);
    try {
      await updateLead(projectId, selectedLeadId, {
        pipelineId: addPipelineId,
        stageId: addStageId,
        value: parseFloat(addValue) || 0.0,
        status: 'ACTIVE'
      });
      setAddPipelineId('');
      setAddStageId('');
      setAddValue('0');
      loadLeadDetails(selectedLeadId);
      fetchFilteredLeads();
    } catch (err) {
      console.error(err);
      alert('Erro ao adicionar funil.');
    } finally {
      setIsAddingEntry(false);
    }
  };

  const availablePipelines = React.useMemo(() => {
    if (!leadDetail || !pipelines) return [];
    const currentPipelineIds = leadDetail.pipelineEntries?.map((e: any) => e.pipelineId) || [];
    return pipelines.filter(p => !currentPipelineIds.includes(p.id));
  }, [leadDetail, pipelines]);

  useEffect(() => {
    if (addPipelineId) {
      const p = pipelines.find(x => x.id === addPipelineId);
      setAddStageId(p?.stages[0]?.id || '');
    } else {
      setAddStageId('');
    }
  }, [addPipelineId, pipelines]);

  // ==========================================
  // OPERAÇÕES EM LOTE: AUXILIARES E ACTIONS
  // ==========================================
  
  const parseCSV = (text: string): string[][] => {
    const firstLine = text.split('\n')[0] || '';
    let delimiter = ';';
    let content = text;
    if (firstLine.startsWith('sep=')) {
      delimiter = firstLine.charAt(4) || ';';
      content = text.substring(text.indexOf('\n') + 1);
    } else {
      const semicolonCount = (firstLine.match(/;/g) || []).length;
      const commaCount = (firstLine.match(/,/g) || []).length;
      delimiter = semicolonCount >= commaCount ? ';' : ',';
    }

    const lines: string[][] = [];
    let row: string[] = [];
    let inQuotes = false;
    let currentValue = '';

    for (let i = 0; i < content.length; i++) {
      const char = content[i];
      const nextChar = content[i + 1];

      if (inQuotes) {
        if (char === '"') {
          if (nextChar === '"') {
            currentValue += '"';
            i++;
          } else {
            inQuotes = false;
          }
        } else {
          currentValue += char;
        }
      } else {
        if (char === '"') {
          inQuotes = true;
        } else if (char === delimiter) {
          row.push(currentValue);
          currentValue = '';
        } else if (char === '\r' || char === '\n') {
          row.push(currentValue);
          currentValue = '';
          if (row.length > 0 && row.some(cell => cell.trim() !== '')) {
            lines.push(row);
          }
          row = [];
          if (char === '\r' && nextChar === '\n') {
            i++;
          }
        } else {
          currentValue += char;
        }
      }
    }

    if (currentValue || row.length > 0) {
      row.push(currentValue);
      if (row.some(cell => cell.trim() !== '')) {
        lines.push(row);
      }
    }

    return lines;
  };

  const handleCSVUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setCsvFile(file);
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      const parsed = parseCSV(text);
      if (parsed.length > 0) {
        const headers = parsed[0].map(h => h.trim());
        const rows = parsed.slice(1);
        setCsvHeaders(headers);
        setCsvRows(rows);

        const initialMapping: Record<string, number> = {};
        
        headers.forEach((h, index) => {
          const lowerH = h.toLowerCase();
          if (lowerH === 'nome' || lowerH === 'name') {
            initialMapping['name'] = index;
          } else if (lowerH === 'email' || lowerH === 'e-mail' || lowerH === 'mail') {
            initialMapping['email'] = index;
          } else if (lowerH === 'telefone' || lowerH === 'phone' || lowerH === 'celular' || lowerH === 'whatsapp' || lowerH === 'tel') {
            initialMapping['phone'] = index;
          } else if (lowerH === 'empresa' || lowerH === 'company' || lowerH === 'organization' || lowerH === 'org') {
            initialMapping['company'] = index;
          } else if (lowerH === 'valor' || lowerH === 'value' || lowerH === 'preço' || lowerH === 'price' || lowerH === 'quantia') {
            initialMapping['value'] = index;
          }

          customFieldDefs.forEach(def => {
            if (lowerH === def.name.toLowerCase()) {
              initialMapping[`custom_${def.id}`] = index;
            }
          });
        });

        setFieldMapping(initialMapping);
      }
    };
    reader.readAsText(file, 'UTF-8');
  };

  const handleExecuteImport = async () => {
    if (fieldMapping['name'] === undefined || fieldMapping['name'] === -1) {
      alert('Você precisa mapear a coluna do Nome do Lead (campo obrigatório).');
      return;
    }

    setIsImporting(true);
    setImportResult(null);

    try {
      const rowsToImport = csvRows.map((csvRow) => {
        const name = fieldMapping['name'] !== undefined && fieldMapping['name'] !== -1 ? csvRow[fieldMapping['name']] || '' : '';
        const email = fieldMapping['email'] !== undefined && fieldMapping['email'] !== -1 ? csvRow[fieldMapping['email']] || '' : '';
        const phone = fieldMapping['phone'] !== undefined && fieldMapping['phone'] !== -1 ? csvRow[fieldMapping['phone']] || '' : '';
        const company = fieldMapping['company'] !== undefined && fieldMapping['company'] !== -1 ? csvRow[fieldMapping['company']] || '' : '';
        const value = fieldMapping['value'] !== undefined && fieldMapping['value'] !== -1 ? csvRow[fieldMapping['value']] || '' : '';

        const customFields: Record<string, string> = {};
        customFieldDefs.forEach(def => {
          const key = `custom_${def.id}`;
          if (fieldMapping[key] !== undefined && fieldMapping[key] !== -1) {
            customFields[def.id] = csvRow[fieldMapping[key]] || '';
          }
        });

        return {
          name,
          email,
          phone,
          company,
          value,
          customFields
        };
      });

      const res = await importLeadsAction(
        projectId,
        rowsToImport,
        importOriginId || null,
        importPipelineId || null,
        importStageId || null
      );

      setImportResult(res);
      fetchFilteredLeads();
    } catch (err: any) {
      console.error(err);
      alert(err.message || 'Erro durante a importação.');
    } finally {
      setIsImporting(false);
    }
  };

  const handleExportCSV = async () => {
    try {
      const csvContent = await exportLeadsToCSVAction(projectId, {
        search: search || undefined,
        tagId: selectedTagId || undefined,
        priority: selectedPriority || undefined,
        status: selectedStatus || undefined,
        originId: selectedOriginId || undefined
      });

      const blob = new Blob([new Uint8Array([0xEF, 0xBB, 0xBF]), csvContent], {
        type: 'text/csv;charset=utf-8;'
      });

      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `leads_export_${new Date().toISOString().split('T')[0]}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err: any) {
      console.error(err);
      alert(err.message || 'Erro ao exportar leads.');
    }
  };

  const handleBatchDelete = async () => {
    if (selectedLeadIds.length === 0) return;
    const confirmMessage = `Tem certeza que deseja arquivar os ${selectedLeadIds.length} leads selecionados? Eles serão marcados como arquivados e poderão ser restaurados individualmente depois.`;
    if (!confirm(confirmMessage)) return;

    try {
      const res = await batchDeleteLeadsAction(projectId, selectedLeadIds);
      alert(`${res.count} leads foram arquivados com sucesso.`);
      setSelectedLeadIds([]);
      fetchFilteredLeads();
    } catch (err: any) {
      console.error(err);
      alert(err.message || 'Erro ao excluir leads em lote.');
    }
  };

  const handleSelectLead = (leadId: string) => {
    if (selectedLeadIds.includes(leadId)) {
      setSelectedLeadIds(selectedLeadIds.filter(id => id !== leadId));
    } else {
      setSelectedLeadIds([...selectedLeadIds, leadId]);
    }
  };

  const handleSelectAll = () => {
    if (selectedLeadIds.length === leads.length) {
      setSelectedLeadIds([]);
    } else {
      setSelectedLeadIds(leads.map(lead => lead.id));
    }
  };

  const getMappedPreviewRows = () => {
    const previewCount = Math.min(csvRows.length, 5);
    const preview: any[] = [];

    for (let r = 0; r < previewCount; r++) {
      const csvRow = csvRows[r];
      const mappedRow: Record<string, string> = {};

      mappedRow['name'] = fieldMapping['name'] !== undefined && fieldMapping['name'] !== -1 ? csvRow[fieldMapping['name']] || '' : '';
      mappedRow['email'] = fieldMapping['email'] !== undefined && fieldMapping['email'] !== -1 ? csvRow[fieldMapping['email']] || '' : '';
      mappedRow['phone'] = fieldMapping['phone'] !== undefined && fieldMapping['phone'] !== -1 ? csvRow[fieldMapping['phone']] || '' : '';
      mappedRow['company'] = fieldMapping['company'] !== undefined && fieldMapping['company'] !== -1 ? csvRow[fieldMapping['company']] || '' : '';
      mappedRow['value'] = fieldMapping['value'] !== undefined && fieldMapping['value'] !== -1 ? csvRow[fieldMapping['value']] || '' : '';

      customFieldDefs.forEach(def => {
        const key = `custom_${def.id}`;
        mappedRow[key] = fieldMapping[key] !== undefined && fieldMapping[key] !== -1 ? csvRow[fieldMapping[key]] || '' : '';
      });

      preview.push(mappedRow);
    }

    return preview;
  };

  const targetFields = [
    { key: 'name', label: 'Nome * (Obrigatório)' },
    { key: 'email', label: 'E-mail' },
    { key: 'phone', label: 'Telefone / WhatsApp' },
    { key: 'company', label: 'Empresa' },
    { key: 'value', label: 'Valor Estimado (R$)' },
    ...customFieldDefs.map(def => ({
      key: `custom_${def.id}`,
      label: `${def.name} (Campo Personalizado)`
    }))
  ];

  return (
    <div className="flex-1 p-6 md:p-8 space-y-6 max-w-6xl mx-auto flex flex-col h-screen overflow-hidden">
      
      {/* Header */}
      <div className="flex-shrink-0 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold font-display text-white tracking-tight">Leads & Oportunidades</h1>
          <p className="text-xs text-text-secondary mt-1">Busque leads, filtre por tags, prioridade ou origem e edite suas propriedades.</p>
        </div>
        <div className="flex items-center gap-2">
          {selectedLeadIds.length > 0 && (
            <button
              onClick={handleBatchDelete}
              className="px-3 py-2 bg-danger/20 hover:bg-danger text-danger hover:text-white border border-danger/30 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer"
            >
              <Trash2 className="h-4 w-4" />
              Excluir selecionados ({selectedLeadIds.length})
            </button>
          )}
          <button
            onClick={() => setShowImportModal(true)}
            className="px-3 py-2 bg-[rgba(255,255,255,0.03)] hover:bg-[rgba(255,255,255,0.06)] border border-border-subtle hover:border-text-secondary text-white font-bold text-xs rounded-lg transition-all flex items-center gap-1.5 cursor-pointer"
          >
            Importar CSV
          </button>
          <button
            onClick={handleExportCSV}
            className="px-3 py-2 bg-accent hover:bg-accent-light text-black font-bold text-xs rounded-lg transition-all flex items-center gap-1.5 cursor-pointer"
          >
            Exportar CSV
          </button>
        </div>
      </div>

      {/* Filtros e Busca */}
      <div className="flex-shrink-0 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 bg-[rgba(255,255,255,0.01)] border border-border-subtle p-4 rounded-xl backdrop-blur-md">
        
        {/* Busca por texto */}
        <div className="relative">
          <Search className="absolute left-2.5 top-3 h-4 w-4 text-text-tertiary" />
          <input
            type="text"
            placeholder="Buscar por nome, e-mail..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 bg-bg-base border border-border-subtle rounded-lg px-3 py-2 text-xs text-white outline-none focus:border-accent"
          />
        </div>

        {/* Filtrar por Status */}
        <select
          value={selectedStatus}
          onChange={(e) => setSelectedStatus(e.target.value)}
          className="bg-bg-base border border-border-subtle rounded-lg px-3 py-2 text-xs text-white outline-none focus:border-accent"
        >
          <option value="ACTIVE">Status: Ativo</option>
          <option value="LOST">Status: Perdido</option>
          <option value="ARCHIVED">Status: Arquivado</option>
        </select>

        {/* Filtrar por Prioridade */}
        <select
          value={selectedPriority}
          onChange={(e) => setSelectedPriority(e.target.value)}
          className="bg-bg-base border border-border-subtle rounded-lg px-3 py-2 text-xs text-white outline-none focus:border-accent"
        >
          <option value="">Prioridade: Qualquer</option>
          <option value="BAIXA">Baixa</option>
          <option value="MEDIA">Média</option>
          <option value="ALTA">Alta</option>
        </select>

        {/* Filtrar por Tag */}
        <select
          value={selectedTagId}
          onChange={(e) => setSelectedTagId(e.target.value)}
          className="bg-bg-base border border-border-subtle rounded-lg px-3 py-2 text-xs text-white outline-none focus:border-accent"
        >
          <option value="">Tag: Qualquer</option>
          {tags.map(t => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </select>

        {/* Filtrar por Origem */}
        <select
          value={selectedOriginId}
          onChange={(e) => setSelectedOriginId(e.target.value)}
          className="bg-bg-base border border-border-subtle rounded-lg px-3 py-2 text-xs text-white outline-none focus:border-accent"
        >
          <option value="">Origem: Qualquer</option>
          {origins.map(o => (
            <option key={o.id} value={o.id}>{o.name}</option>
          ))}
        </select>

      </div>

      {/* Tabela de Leads */}
      <div className="flex-1 bg-[rgba(255,255,255,0.01)] border border-border-subtle rounded-xl overflow-hidden shadow-xl flex flex-col min-h-0">
        <div className="flex-1 overflow-y-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-border-subtle bg-[rgba(255,255,255,0.01)] text-text-secondary text-xs uppercase tracking-wider sticky top-0 z-10 backdrop-blur-md">
                <th className="p-4 font-semibold w-10">
                  <input
                    type="checkbox"
                    checked={leads.length > 0 && selectedLeadIds.length === leads.length}
                    onChange={handleSelectAll}
                    className="accent-accent rounded border-border-subtle cursor-pointer"
                  />
                </th>
                <th className="p-4 font-semibold">Nome</th>
                <th className="p-4 font-semibold">Empresa</th>
                <th className="p-4 font-semibold">Contato</th>
                <th className="p-4 font-semibold">Responsável</th>
                <th className="p-4 font-semibold">Origem</th>
                <th className="p-4 font-semibold">Prioridade</th>
                <th className="p-4 font-semibold">Funis e Estágios</th>
                <th className="p-4 font-semibold text-right">Valor Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[rgba(255,255,255,0.03)] text-xs text-text-secondary">
              {leads.length === 0 ? (
                <tr>
                  <td colSpan={9} className="p-8 text-center text-text-tertiary">
                    Nenhum lead encontrado com os filtros selecionados.
                  </td>
                </tr>
              ) : (
                leads.map((lead) => {
                  const totalValue = lead.pipelineEntries?.reduce((sum: number, entry: any) => sum + entry.value, 0) || 0;
                  return (
                    <tr 
                      key={lead.id}
                      onClick={() => setSelectedLeadId(lead.id)}
                      className="hover:bg-[rgba(255,255,255,0.02)] cursor-pointer transition-colors"
                    >
                      <td className="p-4 w-10" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={selectedLeadIds.includes(lead.id)}
                          onChange={() => handleSelectLead(lead.id)}
                          className="accent-accent rounded border-border-subtle cursor-pointer"
                        />
                      </td>
                      <td className="p-4 font-bold text-white flex flex-col gap-1.5">
                        <span>{lead.name}</span>
                        <div className="flex flex-wrap gap-1">
                          {lead.tags.map(t => (
                            <span 
                              key={t.id} 
                              className="text-[9px] px-1.5 py-0.5 rounded-full text-white/95"
                              style={{ backgroundColor: `${t.color}88` }}
                            >
                              {t.name}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="p-4">{lead.company || '—'}</td>
                      <td className="p-4">
                        <div className="flex flex-col gap-0.5">
                          <span className="text-white font-medium">{lead.phone || '—'}</span>
                          <span className="text-[10px] text-text-tertiary">{lead.email || ''}</span>
                        </div>
                      </td>
                      <td className="p-4 truncate max-w-[120px]">
                        {lead.assignedUser?.name || lead.assignedUser?.email || (
                          <span className="text-text-tertiary">Sem comercial</span>
                        )}
                      </td>
                      <td className="p-4">
                        {lead.origin ? (
                          <span className="bg-[rgba(255,255,255,0.03)] px-2 py-0.5 rounded border border-border-subtle">
                            {lead.origin.name}
                          </span>
                        ) : '—'}
                      </td>
                      <td className="p-4">
                        <span className={`px-2 py-0.5 rounded text-[9px] font-bold ${
                          lead.priority === 'ALTA' 
                            ? 'bg-danger/10 text-danger border border-danger/20' 
                            : lead.priority === 'MEDIA'
                              ? 'bg-amber-500/10 text-amber-500 border border-amber-500/20'
                              : 'bg-[rgba(255,255,255,0.03)] text-text-secondary border border-border-subtle'
                        }`}>
                          {lead.priority}
                        </span>
                      </td>
                      <td className="p-4">
                        <div className="flex flex-col gap-1 max-w-[200px]">
                          {lead.pipelineEntries && lead.pipelineEntries.length > 0 ? (
                            lead.pipelineEntries.map((entry: any) => (
                              <span key={entry.id} className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-[rgba(255,255,255,0.03)] border border-border-subtle text-white truncate" title={`${entry.pipeline.name}: ${entry.stage.name}`}>
                                {entry.pipeline.name}: {entry.stage.name}
                              </span>
                            ))
                          ) : (
                            <span className="text-text-tertiary font-medium">Sem funil</span>
                          )}
                        </div>
                      </td>
                      <td className="p-4 text-right font-black text-accent-light text-sm">
                        {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(totalValue)}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ==========================================
      MODAL DE DETALHES DO LEAD (COPIADO DO KANBAN)
      ========================================== */}
      {selectedLeadId && leadDetail && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-sm z-40 flex items-center justify-center p-4">
          <div className="bg-bg-elevated border border-border-strong w-full max-w-4xl h-[85vh] rounded-2xl overflow-hidden shadow-2xl flex flex-col">
            
            {/* Header do Modal */}
            <div className="px-6 py-4 border-b border-[rgba(255,255,255,0.05)] bg-[rgba(255,255,255,0.01)] flex justify-between items-center flex-shrink-0">
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-lg bg-accent/15 border border-border-glass flex items-center justify-center text-accent">
                  <User className="h-4 w-4" />
                </div>
                <div>
                  <h2 className="text-md font-bold font-display text-white">{leadDetail.name}</h2>
                  <p className="text-[10px] text-text-secondary">
                    Criado em {new Date(leadDetail.createdAt).toLocaleString('pt-BR')} • Funis Ativos: <span className="text-white font-semibold">{leadDetail.pipelineEntries?.map((e: any) => e.pipeline.name).join(', ') || 'Nenhum'}</span>
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <button 
                  onClick={handleDeleteLead}
                  className="p-2 text-danger/80 hover:text-danger hover:bg-danger/10 border border-transparent hover:border-danger/20 rounded-lg cursor-pointer transition-all"
                  title="Excluir Lead"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
                <button onClick={() => setSelectedLeadId(null)} className="text-text-secondary hover:text-white cursor-pointer p-1">
                  <X className="h-6 w-6" />
                </button>
              </div>
            </div>

            {/* Corpo do Modal */}
            <div className="flex-1 overflow-hidden flex flex-col md:flex-row min-h-0">
              
              {/* Coluna Central 1: Participações em Funis */}
              <div className="w-full md:w-80 border-b md:border-b-0 md:border-r border-[rgba(255,255,255,0.05)] p-6 overflow-y-auto space-y-6 flex-shrink-0 bg-[rgba(5,5,5,0.05)] custom-scrollbar">
                <h3 className="text-xs font-bold text-accent uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  Participações em Funis
                </h3>
                
                {/* Listagem de participações existentes */}
                <div className="space-y-4">
                  {leadDetail.pipelineEntries?.length === 0 ? (
                    <p className="text-[10px] text-text-secondary leading-relaxed">
                      Este lead não está participando de nenhum funil comercial atualmente.
                    </p>
                  ) : (
                    leadDetail.pipelineEntries.map((entry: any) => {
                      const pipelineObj = pipelines.find(p => p.id === entry.pipelineId);
                      const stagesList = pipelineObj?.stages || [];
                      
                      return (
                        <div key={entry.id} className="bg-[rgba(255,255,255,0.02)] border border-border-subtle p-3 rounded-lg space-y-3">
                          <div className="flex justify-between items-center border-b border-[rgba(255,255,255,0.04)] pb-1.5">
                            <span className="text-xs font-bold text-white truncate block max-w-[150px]">
                              {entry.pipeline.name}
                            </span>
                            <span className={`px-1.5 py-0.5 rounded text-[8px] font-bold ${
                              entry.status === 'ACTIVE'
                                ? 'bg-accent/15 text-accent border border-accent/20'
                                : entry.status === 'LOST'
                                  ? 'bg-danger/10 text-danger border border-danger/20'
                                  : 'bg-[rgba(255,255,255,0.03)] text-text-secondary border border-border-subtle'
                            }`}>
                              {entry.status}
                            </span>
                          </div>

                          <div className="grid grid-cols-1 gap-2.5 text-xs">
                            {/* Stage Select */}
                            <div className="flex flex-col gap-1">
                              <label className="text-[9px] font-bold text-text-secondary uppercase">Estágio</label>
                              <select
                                value={entry.stageId}
                                onChange={async (e) => {
                                  await handleUpdatePipelineEntry(
                                    entry.pipelineId,
                                    e.target.value,
                                    entry.value,
                                    entry.status,
                                    entry.lostStatusId
                                  );
                                }}
                                className="bg-bg-base border border-border-subtle rounded px-2 py-1 text-[11px] text-white outline-none w-full"
                              >
                                {stagesList.map(s => (
                                  <option key={s.id} value={s.id}>{s.name}</option>
                                ))}
                              </select>
                            </div>

                            {/* Value Input */}
                            <div className="flex flex-col gap-1">
                              <label className="text-[9px] font-bold text-text-secondary uppercase">Valor</label>
                              <input
                                type="number"
                                defaultValue={entry.value}
                                onBlur={async (e) => {
                                  const parsedVal = parseFloat(e.target.value) || 0;
                                  if (parsedVal !== entry.value) {
                                    await handleUpdatePipelineEntry(
                                      entry.pipelineId,
                                      entry.stageId,
                                      parsedVal,
                                      entry.status,
                                      entry.lostStatusId
                                    );
                                  }
                                }}
                                className="bg-bg-base border border-border-subtle rounded px-2 py-1 text-[11px] text-white outline-none w-full"
                              />
                            </div>

                            {/* Status select */}
                            <div className="flex flex-col gap-1">
                              <label className="text-[9px] font-bold text-text-secondary uppercase">Status</label>
                              <select
                                value={entry.status}
                                onChange={async (e) => {
                                  const newStatus = e.target.value;
                                  const defaultLostReasonId = lostStatuses[0]?.id || null;
                                  await handleUpdatePipelineEntry(
                                    entry.pipelineId,
                                    entry.stageId,
                                    entry.value,
                                    newStatus,
                                    newStatus === 'LOST' ? defaultLostReasonId : null
                                  );
                                }}
                                className="bg-bg-base border border-border-subtle rounded px-2 py-1 text-[11px] text-white outline-none w-full"
                              >
                                <option value="ACTIVE">Ativo</option>
                                <option value="LOST">Perdido</option>
                                <option value="ARCHIVED">Arquivado</option>
                              </select>
                            </div>

                            {/* Lost Reason select (if LOST) */}
                            {entry.status === 'LOST' && (
                              <div className="flex flex-col gap-1">
                                <label className="text-[9px] font-bold text-text-secondary uppercase">Motivo da Perda</label>
                                <select
                                  value={entry.lostStatusId || ''}
                                  onChange={async (e) => {
                                    await handleUpdatePipelineEntry(
                                      entry.pipelineId,
                                      entry.stageId,
                                      entry.value,
                                      entry.status,
                                      e.target.value || null
                                    );
                                  }}
                                  className="bg-bg-base border border-border-subtle rounded px-2 py-1 text-[11px] text-white outline-none w-full text-danger font-semibold"
                                >
                                  <option value="">Selecione...</option>
                                  {lostStatuses.map(ls => (
                                    <option key={ls.id} value={ls.id}>{ls.reason}</option>
                                  ))}
                                </select>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>

                {/* Formulário para adicionar a outro funil */}
                {availablePipelines.length > 0 && (
                  <div className="border-t border-[rgba(255,255,255,0.05)] pt-4 mt-4 space-y-3">
                    <h4 className="text-[11px] font-bold text-white uppercase tracking-wider">Adicionar a outro Funil</h4>
                    <form onSubmit={handleAddPipelineEntry} className="space-y-2.5">
                      <div className="flex flex-col gap-1 text-[11px]">
                        <label className="font-semibold text-text-secondary">Funil</label>
                        <select
                          required
                          value={addPipelineId}
                          onChange={(e) => setAddPipelineId(e.target.value)}
                          className="bg-bg-base border border-border-subtle rounded px-2.5 py-1.5 text-xs text-white outline-none w-full"
                        >
                          <option value="">Selecione o funil...</option>
                          {availablePipelines.map(p => (
                            <option key={p.id} value={p.id}>{p.name}</option>
                          ))}
                        </select>
                      </div>

                      {addPipelineId && (
                        <>
                          <div className="flex flex-col gap-1 text-[11px]">
                            <label className="font-semibold text-text-secondary">Estágio Inicial</label>
                            <select
                              required
                              value={addStageId}
                              onChange={(e) => setAddStageId(e.target.value)}
                              className="bg-bg-base border border-border-subtle rounded px-2.5 py-1.5 text-xs text-white outline-none w-full"
                            >
                              {pipelines.find(p => p.id === addPipelineId)?.stages.map(s => (
                                <option key={s.id} value={s.id}>{s.name}</option>
                              ))}
                            </select>
                          </div>

                          <div className="flex flex-col gap-1 text-[11px]">
                            <label className="font-semibold text-text-secondary">Valor Comercial</label>
                            <input
                              type="number"
                              value={addValue}
                              onChange={(e) => setAddValue(e.target.value)}
                              className="bg-bg-base border border-border-subtle rounded px-2.5 py-1.5 text-xs text-white outline-none w-full"
                            />
                          </div>

                          <button
                            type="submit"
                            disabled={isAddingEntry}
                            className="w-full py-1.5 bg-accent hover:bg-accent-light disabled:bg-accent/40 disabled:text-black/60 text-black font-bold text-xs rounded transition-all cursor-pointer flex items-center justify-center gap-1"
                          >
                            {isAddingEntry && <Loader2 className="h-3 w-3 animate-spin" />}
                            Vincular a Funil
                          </button>
                        </>
                      )}
                    </form>
                  </div>
                )}
              </div>
              
              {/* Coluna Lateral: Dados do Lead */}
              <div className="w-full md:w-80 border-b md:border-b-0 md:border-r border-[rgba(255,255,255,0.05)] p-6 overflow-y-auto space-y-6 flex-shrink-0 bg-[rgba(5,5,5,0.1)] custom-scrollbar">
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <h3 className="text-xs font-bold text-accent uppercase tracking-wider">Dados do Lead</h3>
                    <button 
                      onClick={() => setIsEditingBaseLead(!isEditingBaseLead)}
                      className="text-[10px] font-bold text-text-secondary hover:text-white cursor-pointer underline"
                    >
                      {isEditingBaseLead ? 'Cancelar' : 'Editar'}
                    </button>
                  </div>

                  {!isEditingBaseLead ? (
                    <div className="space-y-3 text-xs leading-relaxed">
                      <div>
                        <span className="text-[10px] text-text-secondary block font-semibold">EMPRESA</span>
                        <span className="text-white font-medium">{leadDetail.company || '—'}</span>
                      </div>
                      <div>
                        <span className="text-[10px] text-text-secondary block font-semibold">VALOR TOTAL ACUMULADO</span>
                        <span className="text-accent-light font-black text-sm">
                          {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(leadDetail.pipelineEntries?.reduce((sum: number, e: any) => sum + e.value, 0) || 0)}
                        </span>
                      </div>
                      <div>
                        <span className="text-[10px] text-text-secondary block font-semibold">COMERCIAL RESPONSÁVEL</span>
                        <span className="text-white font-medium">{leadDetail.assignedUser?.name || leadDetail.assignedUser?.email || 'Sem comercial'}</span>
                      </div>
                      <div>
                        <span className="text-[10px] text-text-secondary block font-semibold">PRIORIDADE</span>
                        <span className={`px-2 py-0.5 rounded text-[9px] font-bold ${
                          leadDetail.priority === 'ALTA' 
                            ? 'bg-danger/10 text-danger border border-danger/20' 
                            : leadDetail.priority === 'MEDIA'
                              ? 'bg-amber-500/10 text-amber-500 border border-amber-500/20'
                              : 'bg-[rgba(255,255,255,0.03)] text-text-secondary border border-border-subtle'
                        }`}>
                          {leadDetail.priority}
                        </span>
                      </div>
                      <div>
                        <span className="text-[10px] text-text-secondary block font-semibold">WHATSAPP</span>
                        {leadDetail.phone ? (
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-white font-medium">{leadDetail.phone}</span>
                            <button
                              onClick={handleStartChat}
                              disabled={isStartingChat}
                              className="inline-flex items-center gap-1 px-2 py-0.5 bg-accent/20 hover:bg-accent/40 border border-accent/30 text-accent text-[10px] font-bold rounded cursor-pointer transition-all disabled:opacity-50"
                              title="Conversar no WhatsApp"
                            >
                              {isStartingChat ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                <MessageSquare className="h-3 w-3" />
                              )}
                              Conversar
                            </button>
                          </div>
                        ) : (
                          <span className="text-white font-medium">—</span>
                        )}
                      </div>
                      <div>
                        <span className="text-[10px] text-text-secondary block font-semibold">E-MAIL</span>
                        <span className="text-white font-medium truncate block">{leadDetail.email || '—'}</span>
                      </div>
                      <div>
                        <span className="text-[10px] text-text-secondary block font-semibold">ORIGEM</span>
                        <span className="text-white font-medium">{leadDetail.origin?.name || '—'}</span>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-3 flex flex-col">
                      <div className="flex flex-col gap-1">
                        <label className="text-[9px] font-semibold text-text-secondary uppercase">Nome</label>
                        <input
                          type="text"
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          className="bg-bg-base border border-border-subtle rounded px-2.5 py-1.5 text-xs text-white outline-none"
                        />
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className="text-[9px] font-semibold text-text-secondary uppercase">Empresa</label>
                        <input
                          type="text"
                          value={editCompany}
                          onChange={(e) => setEditCompany(e.target.value)}
                          className="bg-bg-base border border-border-subtle rounded px-2.5 py-1.5 text-xs text-white outline-none"
                        />
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className="text-[9px] font-semibold text-text-secondary uppercase">Prioridade</label>
                        <select
                          value={editPriority}
                          onChange={(e) => setEditPriority(e.target.value as any)}
                          className="bg-bg-base border border-border-subtle rounded px-2 py-1.5 text-xs text-white outline-none"
                        >
                          <option value="BAIXA">Baixa</option>
                          <option value="MEDIA">Média</option>
                          <option value="ALTA">Alta</option>
                        </select>
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className="text-[9px] font-semibold text-text-secondary uppercase">WhatsApp</label>
                        <input
                          type="text"
                          value={editPhone}
                          onChange={(e) => setEditPhone(e.target.value)}
                          className="bg-bg-base border border-border-subtle rounded px-2.5 py-1.5 text-xs text-white outline-none"
                        />
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className="text-[9px] font-semibold text-text-secondary uppercase">E-mail</label>
                        <input
                          type="email"
                          value={editEmail}
                          onChange={(e) => setEditEmail(e.target.value)}
                          className="bg-bg-base border border-border-subtle rounded px-2.5 py-1.5 text-xs text-white outline-none"
                        />
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className="text-[9px] font-semibold text-text-secondary uppercase">Origem</label>
                        <select
                          value={editOriginId}
                          onChange={(e) => setEditOriginId(e.target.value)}
                          className="bg-bg-base border border-border-subtle rounded px-2 py-1.5 text-xs text-white outline-none"
                        >
                          <option value="">Selecione...</option>
                          {origins.map(o => (
                            <option key={o.id} value={o.id}>{o.name}</option>
                          ))}
                        </select>
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className="text-[9px] font-semibold text-text-secondary uppercase">Comercial Responsável</label>
                        <select
                          value={editAssignedUserId}
                          onChange={(e) => setEditAssignedUserId(e.target.value)}
                          className="bg-bg-base border border-border-subtle rounded px-2 py-1.5 text-xs text-white outline-none"
                        >
                          <option value="">Sem comercial (Rodízio se novos)</option>
                          {members.map(member => (
                            <option key={member.user.id} value={member.user.id}>
                              {member.user.name || member.user.email} {member.isDesignatedCommercial ? '★' : ''}
                            </option>
                          ))}
                        </select>
                      </div>

                      <button
                        onClick={handleSaveBaseLead}
                        className="mt-2 py-2 bg-accent text-black font-bold text-xs rounded transition-all cursor-pointer"
                      >
                        Salvar Alterações
                      </button>
                    </div>
                  )}
                </div>

                {/* Rastreamento / UTM (Adendo) */}
                {(leadDetail?.utmSource || leadDetail?.utmMedium || leadDetail?.utmCampaign || leadDetail?.utmContent || leadDetail?.utmTerm || leadDetail?.referrer || leadDetail?.landingPage) && (
                  <div className="border-t border-[rgba(255,255,255,0.05)] pt-6 space-y-4">
                    <h3 className="text-xs font-bold text-accent uppercase tracking-wider">Dados de Rastreamento (UTMs)</h3>
                    <div className="grid grid-cols-2 gap-3 text-xs">
                      {leadDetail.utmSource && (
                        <div className="flex flex-col gap-0.5">
                          <span className="text-[9px] font-semibold text-text-secondary uppercase">UTM Source</span>
                          <span className="text-white bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.05)] rounded-md px-2 py-1 select-all break-all">{leadDetail.utmSource}</span>
                        </div>
                      )}
                      {leadDetail.utmMedium && (
                        <div className="flex flex-col gap-0.5">
                          <span className="text-[9px] font-semibold text-text-secondary uppercase">UTM Medium</span>
                          <span className="text-white bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.05)] rounded-md px-2 py-1 select-all break-all">{leadDetail.utmMedium}</span>
                        </div>
                      )}
                      {leadDetail.utmCampaign && (
                        <div className="flex flex-col gap-0.5">
                          <span className="text-[9px] font-semibold text-text-secondary uppercase">UTM Campaign</span>
                          <span className="text-white bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.05)] rounded-md px-2 py-1 select-all break-all">{leadDetail.utmCampaign}</span>
                        </div>
                      )}
                      {leadDetail.utmContent && (
                        <div className="flex flex-col gap-0.5">
                          <span className="text-[9px] font-semibold text-text-secondary uppercase">UTM Content</span>
                          <span className="text-white bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.05)] rounded-md px-2 py-1 select-all break-all">{leadDetail.utmContent}</span>
                        </div>
                      )}
                      {leadDetail.utmTerm && (
                        <div className="flex flex-col gap-0.5 col-span-2">
                          <span className="text-[9px] font-semibold text-text-secondary uppercase">UTM Term</span>
                          <span className="text-white bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.05)] rounded-md px-2 py-1 select-all break-all">{leadDetail.utmTerm}</span>
                        </div>
                      )}
                      {leadDetail.referrer && (
                        <div className="flex flex-col gap-0.5 col-span-2">
                          <span className="text-[9px] font-semibold text-text-secondary uppercase">Referrer (Origem)</span>
                          <span className="text-white bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.05)] rounded-md px-2 py-1 select-all break-all">{leadDetail.referrer}</span>
                        </div>
                      )}
                      {leadDetail.landingPage && (
                        <div className="flex flex-col gap-0.5 col-span-2">
                          <span className="text-[9px] font-semibold text-text-secondary uppercase">Landing Page</span>
                          <span className="text-white bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.05)] rounded-md px-2 py-1 select-all break-all">{leadDetail.landingPage}</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Campos Personalizados (Adendo) */}
                <div className="border-t border-[rgba(255,255,255,0.05)] pt-6 space-y-4">
                  <h3 className="text-xs font-bold text-accent uppercase tracking-wider">Campos Personalizados</h3>
                  
                  {customFields.length === 0 ? (
                    <p className="text-[10px] text-text-secondary leading-relaxed">
                      Nenhum campo personalizado cadastrado.
                    </p>
                  ) : (
                    <div className="space-y-4">
                      {customFields.map((field) => (
                        <div key={field.id} className="flex flex-col gap-1 text-xs">
                          <label className="font-semibold text-text-secondary uppercase text-[10px]">
                            {field.name}
                          </label>
                          {field.type === 'SELECT' ? (
                            <select
                              value={editingCustomFields[field.id] || ''}
                              onChange={(e) => handleCustomFieldChange(field.id, e.target.value)}
                              className="bg-bg-base border border-border-subtle rounded px-2.5 py-1.5 text-xs text-white outline-none"
                            >
                              <option value="">Selecione...</option>
                              {(() => {
                                try {
                                  const opts = JSON.parse(field.options || '[]');
                                  return opts.map((opt: string) => (
                                    <option key={opt} value={opt}>{opt}</option>
                                  ));
                                } catch {
                                  return null;
                                }
                              })()}
                            </select>
                          ) : (
                            <input
                              type={field.type === 'NUMBER' ? 'number' : 'text'}
                              value={editingCustomFields[field.id] || ''}
                              onChange={(e) => handleCustomFieldChange(field.id, e.target.value)}
                              className="bg-bg-base border border-border-subtle rounded px-2.5 py-1.5 text-xs text-white outline-none focus:border-accent"
                            />
                          )}
                        </div>
                      ))}

                      <button
                        onClick={handleSaveCustomFields}
                        disabled={isSavingCustomFields}
                        className="w-full py-1.5 bg-[rgba(255,255,255,0.03)] hover:bg-[rgba(255,255,255,0.06)] border border-border-subtle hover:border-text-secondary text-white font-bold text-xs rounded transition-all cursor-pointer flex items-center justify-center gap-1.5"
                      >
                        {isSavingCustomFields && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                        Salvar Campos
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Central: Histórico e Tarefas */}
              <div className="flex-1 flex flex-col md:flex-row min-h-0 overflow-y-auto md:overflow-hidden divide-y md:divide-y-0 md:divide-x divide-[rgba(255,255,255,0.05)]">
                
                {/* Atividades */}
                <div className="flex-1 p-6 flex flex-col min-h-0 overflow-hidden">
                  <h3 className="text-xs font-bold text-accent uppercase tracking-wider mb-4 flex items-center gap-1.5 flex-shrink-0">
                    <Clock className="h-4 w-4" />
                    Histórico & Linha do Tempo
                  </h3>

                  <div className="flex-1 overflow-y-auto space-y-4 pr-2 custom-scrollbar min-h-[180px]">
                    {leadDetail.activities.length === 0 ? (
                      <p className="text-xs text-text-secondary text-center py-6">Nenhum evento registrado.</p>
                    ) : (
                      leadDetail.activities.map((act: any) => (
                        <div key={act.id} className="text-xs flex gap-3 items-start relative">
                          <div className={`h-6 w-6 rounded-full flex-shrink-0 flex items-center justify-center ${
                            act.type === 'COMMENT' 
                              ? 'bg-accent/15 text-accent' 
                              : act.type === 'STATUS_CHANGE'
                                ? 'bg-amber-500/15 text-amber-500'
                                : 'bg-[rgba(255,255,255,0.03)] text-text-secondary'
                          }`}>
                            <FileText className="h-3.5 w-3.5" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex justify-between items-baseline gap-2">
                              <span className="font-bold text-white text-[11px]">
                                {act.user?.name || 'Sistema'}
                              </span>
                              <span className="text-[10px] text-text-tertiary">
                                {new Date(act.createdAt).toLocaleString('pt-BR')}
                              </span>
                            </div>
                            <p className="text-text-secondary mt-1 font-medium leading-relaxed">
                              {act.content}
                            </p>
                          </div>
                        </div>
                      ))
                    )}
                  </div>

                  <form onSubmit={handleAddComment} className="mt-4 pt-4 border-t border-[rgba(255,255,255,0.05)] flex gap-2 flex-shrink-0">
                    <input
                      required
                      type="text"
                      placeholder="Adicione um comentário..."
                      value={newComment}
                      onChange={(e) => setNewComment(e.target.value)}
                      className="flex-1 bg-bg-base border border-border-subtle rounded px-3 py-2 text-xs text-white outline-none focus:border-accent"
                    />
                    <button
                      type="submit"
                      className="px-4 py-2 bg-accent text-black font-bold text-xs rounded-lg cursor-pointer"
                    >
                      Enviar
                    </button>
                  </form>
                </div>

                {/* Tarefas */}
                <div className="w-full md:w-80 p-6 flex flex-col min-h-0 overflow-hidden">
                  <h3 className="text-xs font-bold text-accent uppercase tracking-wider mb-4 flex items-center gap-1.5 flex-shrink-0">
                    <CheckSquare className="h-4 w-4" />
                    Ações & Tarefas
                  </h3>

                  <form onSubmit={handleAddTask} className="mb-4 space-y-2 flex-shrink-0">
                    <input
                      required
                      type="text"
                      placeholder="Nova ação"
                      value={newTaskTitle}
                      onChange={(e) => setNewTaskTitle(e.target.value)}
                      className="w-full bg-bg-base border border-border-subtle rounded px-3 py-2 text-xs text-white outline-none focus:border-accent"
                    />
                    <div className="flex gap-2">
                      <input
                        type="date"
                        value={newTaskDue}
                        onChange={(e) => setNewTaskDue(e.target.value)}
                        className="flex-1 bg-bg-base border border-border-subtle rounded px-2 py-1 text-xs text-white outline-none"
                      />
                      <button
                        type="submit"
                        className="px-3 py-1 bg-accent text-black font-bold text-xs rounded cursor-pointer"
                      >
                        Agendar
                      </button>
                    </div>
                  </form>

                  <div className="flex-1 overflow-y-auto space-y-2.5 pr-2 custom-scrollbar min-h-[150px]">
                    {leadDetail.tasks.length === 0 ? (
                      <p className="text-xs text-text-secondary text-center py-6">Nenhuma tarefa agendada.</p>
                    ) : (
                      leadDetail.tasks.map((task: any) => {
                        const isCompleted = task.status === 'COMPLETED';
                        return (
                          <div 
                            key={task.id} 
                            className={`flex items-start gap-2 p-2 rounded border text-xs ${
                              isCompleted ? 'bg-[rgba(255,255,255,0.01)] opacity-65' : 'bg-[rgba(255,255,255,0.02)] border-border-subtle'
                            }`}
                          >
                            <button
                              onClick={() => handleToggleTaskStatus(task.id, task.status)}
                              className="text-text-secondary cursor-pointer mt-0.5"
                            >
                              {isCompleted ? (
                                <CheckCircle2 className="h-3.5 w-3.5 text-accent" />
                              ) : (
                                <Circle className="h-3.5 w-3.5 text-text-tertiary" />
                              )}
                            </button>
                            <div className="flex-1 min-w-0">
                              <p className={`font-semibold text-white ${isCompleted ? 'line-through text-text-secondary' : ''}`}>
                                {task.title}
                              </p>
                              {task.dueDate && (
                                <span className="text-[9px] text-orange-400 mt-1 flex items-center gap-1 font-semibold">
                                  <Calendar className="h-3.5 w-3.5" />
                                  {new Date(task.dueDate).toLocaleDateString('pt-BR')}
                                </span>
                              )}
                            </div>
                            <button
                              onClick={() => handleDeleteTask(task.id)}
                              className="text-text-tertiary hover:text-danger cursor-pointer"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>

              </div>

            </div>

          </div>
        </div>
      )}

      {/* Modal de Importação CSV */}
      {showImportModal && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-sm z-40 flex items-center justify-center p-4">
          <div className="bg-bg-elevated border border-border-strong w-full max-w-4xl h-[85vh] rounded-2xl overflow-hidden shadow-2xl flex flex-col">
            
            {/* Header do Modal */}
            <div className="px-6 py-4 border-b border-[rgba(255,255,255,0.05)] bg-[rgba(255,255,255,0.01)] flex justify-between items-center flex-shrink-0">
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-lg bg-accent/15 border border-border-glass flex items-center justify-center text-accent">
                  <FileText className="h-4 w-4" />
                </div>
                <div>
                  <h2 className="text-md font-bold font-display text-white">Importar Leads via CSV</h2>
                  <p className="text-[10px] text-text-secondary mt-0.5">Suba um arquivo .csv (UTF-8, com suporte a vírgula ou ponto e vírgula).</p>
                </div>
              </div>
              <button 
                onClick={() => {
                  setShowImportModal(false);
                  setImportResult(null);
                  setCsvFile(null);
                  setCsvHeaders([]);
                  setCsvRows([]);
                  setFieldMapping({});
                }} 
                className="text-text-secondary hover:text-white cursor-pointer p-1"
              >
                <X className="h-6 w-6" />
              </button>
            </div>

            {/* Corpo do Modal */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {importResult ? (
                /* Resultado da Importação */
                <div className="space-y-4 max-w-xl mx-auto">
                  <div className="bg-accent/10 border border-accent/20 rounded-xl p-4 flex flex-col gap-1">
                    <h4 className="text-sm font-bold text-white">Importação Concluída</h4>
                    <p className="text-xs text-text-secondary">
                      O arquivo foi processado com sucesso.
                    </p>
                    <div className="grid grid-cols-2 gap-4 mt-3">
                      <div className="bg-bg-base border border-border-subtle p-3 rounded-lg text-center">
                        <span className="text-[10px] text-text-secondary font-bold uppercase">Importados</span>
                        <span className="block text-2xl font-black text-accent mt-1">{importResult.successCount}</span>
                      </div>
                      <div className="bg-bg-base border border-border-subtle p-3 rounded-lg text-center">
                        <span className="text-[10px] text-text-secondary font-bold uppercase">Falhas</span>
                        <span className="block text-2xl font-black text-danger mt-1">{importResult.failureCount}</span>
                      </div>
                    </div>
                  </div>

                  {importResult.errors.length > 0 && (
                    <div className="space-y-2">
                      <span className="text-xs font-bold text-danger uppercase tracking-wider block">Relatório de Erros ({importResult.errors.length})</span>
                      <div className="bg-bg-base border border-border-subtle rounded-xl p-3 max-h-40 overflow-y-auto space-y-1.5 custom-scrollbar">
                        {importResult.errors.map((err, idx) => (
                          <div key={idx} className="text-xs flex gap-2 justify-between border-b border-[rgba(255,255,255,0.02)] pb-1.5 last:border-0 last:pb-0">
                            <span className="font-bold text-white">Linha {err.line}</span>
                            <span className="text-text-secondary truncate max-w-xs">{err.error}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="flex justify-end pt-4">
                    <button
                      onClick={() => {
                        setShowImportModal(false);
                        setImportResult(null);
                        setCsvFile(null);
                        setCsvHeaders([]);
                        setCsvRows([]);
                        setFieldMapping({});
                      }}
                      className="px-4 py-2 bg-accent hover:bg-accent-light text-black font-bold text-xs rounded-lg cursor-pointer"
                    >
                      Fechar
                    </button>
                  </div>
                </div>
              ) : !csvFile ? (
                /* Seleção do Arquivo */
                <div className="flex flex-col items-center justify-center py-12 border-2 border-dashed border-border-subtle rounded-xl bg-[rgba(255,255,255,0.01)] hover:bg-[rgba(255,255,255,0.02)] transition-colors relative">
                  <input
                    type="file"
                    accept=".csv"
                    onChange={handleCSVUpload}
                    className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                  />
                  <FileText className="h-10 w-10 text-text-tertiary mb-3 animate-pulse" />
                  <p className="text-sm font-bold text-white">Clique para selecionar ou arraste o arquivo CSV</p>
                  <p className="text-[10px] text-text-tertiary mt-1">Suporta separador por vírgula (,) ou ponto e vírgula (;) e codificação UTF-8</p>
                </div>
              ) : (
                /* Mapeamento de Colunas e Prévia */
                <div className="space-y-6">
                  {/* Informações do Arquivo */}
                  <div className="flex flex-wrap justify-between items-center gap-2 px-4 py-2.5 bg-[rgba(255,255,255,0.02)] border border-border-subtle rounded-xl text-xs text-text-secondary">
                    <span>Arquivo selecionado: <strong className="text-white">{csvFile.name}</strong></span>
                    <span>Total de registros encontrados: <strong className="text-accent">{csvRows.length} linhas</strong></span>
                  </div>

                  {/* Destinos e Configurações */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-[rgba(255,255,255,0.01)] border border-border-subtle p-4 rounded-xl">
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[10px] font-bold text-text-secondary uppercase">Funil de Destino (Kanban)</label>
                      <select
                        value={importPipelineId}
                        onChange={(e) => setImportPipelineId(e.target.value)}
                        className="bg-bg-base border border-border-subtle rounded-lg px-3 py-2 text-xs text-white outline-none focus:border-accent"
                      >
                        {pipelines.map(p => (
                          <option key={p.id} value={p.id}>{p.name}</option>
                        ))}
                      </select>
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[10px] font-bold text-text-secondary uppercase">Estágio Comercial de Destino</label>
                      <select
                        value={importStageId}
                        onChange={(e) => setImportStageId(e.target.value)}
                        className="bg-bg-base border border-border-subtle rounded-lg px-3 py-2 text-xs text-white outline-none focus:border-accent"
                      >
                        {pipelines.find(p => p.id === importPipelineId)?.stages.map(s => (
                          <option key={s.id} value={s.id}>{s.name}</option>
                        )) || <option value="">Nenhum estágio disponível</option>}
                      </select>
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[10px] font-bold text-text-secondary uppercase">Origem padrão para os novos leads</label>
                      <select
                        value={importOriginId}
                        onChange={(e) => setImportOriginId(e.target.value)}
                        className="bg-bg-base border border-border-subtle rounded-lg px-3 py-2 text-xs text-white outline-none focus:border-accent"
                      >
                        <option value="">Nenhuma</option>
                        {origins.map(o => (
                          <option key={o.id} value={o.id}>{o.name}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Formulário de Mapeamento */}
                  <div className="space-y-3">
                    <h3 className="text-xs font-bold text-accent uppercase tracking-wider">Mapeamento de Colunas</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {targetFields.map((field) => (
                        <div key={field.key} className="flex items-center justify-between p-3 rounded-lg bg-[rgba(255,255,255,0.01)] border border-border-subtle gap-4">
                          <span className="text-xs text-white font-semibold">{field.label}</span>
                          <select
                            value={fieldMapping[field.key] !== undefined ? fieldMapping[field.key] : ''}
                            onChange={(e) => {
                              const val = e.target.value;
                              setFieldMapping({
                                ...fieldMapping,
                                [field.key]: val === '' ? -1 : parseInt(val)
                              });
                            }}
                            className="bg-bg-base border border-border-subtle rounded-lg px-3 py-1.5 text-xs text-white outline-none focus:border-accent w-48"
                          >
                            <option value="">-- Não importar --</option>
                            {csvHeaders.map((header, idx) => (
                              <option key={idx} value={idx}>
                                Coluna {idx + 1}: {header}
                              </option>
                            ))}
                          </select>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Prévia dos Dados */}
                  <div className="space-y-3">
                    <h3 className="text-xs font-bold text-accent uppercase tracking-wider">Prévia da Importação (Primeiras 5 linhas)</h3>
                    <div className="border border-border-subtle rounded-xl overflow-x-auto bg-[rgba(255,255,255,0.01)]">
                      <table className="w-full text-left border-collapse text-xs">
                        <thead>
                          <tr className="border-b border-border-subtle bg-[rgba(255,255,255,0.02)] text-text-secondary uppercase font-semibold">
                            {targetFields
                              .filter(f => fieldMapping[f.key] !== undefined && fieldMapping[f.key] !== -1)
                              .map((field) => (
                                <th key={field.key} className="p-3">{field.label.replace(' * (Obrigatório)', '').replace(' (Campo Personalizado)', '')}</th>
                              ))
                            }
                          </tr>
                        </thead>
                        <tbody className="text-text-secondary divide-y divide-[rgba(255,255,255,0.02)]">
                          {getMappedPreviewRows().length === 0 ? (
                            <tr>
                              <td colSpan={targetFields.length} className="p-4 text-center text-text-tertiary">
                                Mapeie pelo menos uma coluna para ver a prévia.
                              </td>
                            </tr>
                          ) : (
                            getMappedPreviewRows().map((row, rIdx) => (
                              <tr key={rIdx} className="hover:bg-[rgba(255,255,255,0.01)]">
                                {targetFields
                                  .filter(f => fieldMapping[f.key] !== undefined && fieldMapping[f.key] !== -1)
                                  .map((field) => (
                                    <td key={field.key} className="p-3 max-w-[200px] truncate text-white">{row[field.key] || '—'}</td>
                                  ))
                                }
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Botões de Ação */}
                  <div className="flex justify-between items-center pt-4 border-t border-[rgba(255,255,255,0.05)]">
                    <button
                      onClick={() => {
                        setCsvFile(null);
                        setCsvHeaders([]);
                        setCsvRows([]);
                        setFieldMapping({});
                      }}
                      className="px-4 py-2 border border-border-subtle hover:border-text-secondary text-white font-bold text-xs rounded-lg transition-all cursor-pointer"
                    >
                      Alterar arquivo
                    </button>
                    <div className="flex gap-2">
                      <button
                        onClick={() => {
                          setShowImportModal(false);
                          setCsvFile(null);
                          setCsvHeaders([]);
                          setCsvRows([]);
                          setFieldMapping({});
                        }}
                        className="px-4 py-2 bg-[rgba(255,255,255,0.02)] hover:bg-[rgba(255,255,255,0.05)] border border-border-subtle text-white font-bold text-xs rounded-lg transition-all cursor-pointer"
                      >
                        Cancelar
                      </button>
                      <button
                        onClick={handleExecuteImport}
                        disabled={isImporting || fieldMapping['name'] === undefined || fieldMapping['name'] === -1}
                        className="px-4 py-2 bg-accent hover:bg-accent-light disabled:bg-accent/40 disabled:text-black/60 text-black font-bold text-xs rounded-lg transition-all cursor-pointer flex items-center gap-1.5"
                      >
                        {isImporting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                        Confirmar Importação
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>

          </div>
        </div>
      )}

    </div>
  );
}
