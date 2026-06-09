'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { startWhatsAppConversation } from '@/app/actions/whatsapp';
import { 
  moveLead, 
  createLead, 
  updateLead, 
  deleteLead,
  createTask,
  updateTask,
  deleteTask,
  createActivityComment,
  getLeadById,
  getLeadCustomFields,
  updateLeadCustomFieldValues
} from '@/app/actions/crm';
import { 
  Plus, 
  DollarSign, 
  Calendar, 
  MessageSquare, 
  CheckCircle2, 
  Circle, 
  Trash2, 
  X, 
  Clock, 
  Paperclip,
  Tag as TagIcon,
  HelpCircle,
  AlertCircle,
  User,
  PlusCircle,
  ArrowRight,
  TrendingDown,
  ChevronRight,
  FileText,
  Loader2,
  CheckSquare
} from 'lucide-react';

interface Tag {
  id: string;
  name: string;
  color: string;
}

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

interface Lead {
  id: string;
  name: string;
  company: string | null;
  email: string | null;
  phone: string | null;
  priority: string;
  tags: Tag[];
  tasks: { id: string }[];
  origin?: { name: string } | null;
  pipelineEntries: Array<{
    id: string;
    pipelineId: string;
    stageId: string;
    value: number;
    status: string;
    lostStatusId: string | null;
    lostStatus?: { reason: string } | null;
    stage?: { name: string } | null;
  }>;
}

interface LostStatus {
  id: string;
  reason: string;
}

interface Origin {
  id: string;
  name: string;
}

interface CustomField {
  id: string;
  name: string;
  type: string;
  options: string | null;
  valueId: string | null;
  value: string;
}

interface KanbanBoardProps {
  projectId: string;
  initialPipelines: Pipeline[];
  initialLeads: Lead[];
  tags: Tag[];
  origins: Origin[];
  lostStatuses: LostStatus[];
}

export function KanbanBoard({ 
  projectId, 
  initialPipelines, 
  initialLeads, 
  tags, 
  origins, 
  lostStatuses 
}: KanbanBoardProps) {
  const router = useRouter();
  const [isStartingChat, setIsStartingChat] = useState(false);
  const [pipelines] = useState<Pipeline[]>(initialPipelines);
  const [activePipeline, setActivePipeline] = useState<Pipeline | null>(pipelines[0] || null);
  
  // Leads do funil ativo
  const [leads, setLeads] = useState<Lead[]>(initialLeads);
  const [dragOverStageId, setDragOverStageId] = useState<string | null>(null);

  // Flattened board items computed for the active pipeline
  const boardItems = React.useMemo(() => {
    if (!activePipeline) return [];
    return leads.map(lead => {
      const entry = lead.pipelineEntries?.find(e => e.pipelineId === activePipeline.id);
      if (!entry || entry.status !== 'ACTIVE') return null;
      return {
        ...lead,
        stageId: entry.stageId,
        value: entry.value,
        status: entry.status,
        lostStatusId: entry.lostStatusId,
        lostStatus: entry.lostStatus
      };
    }).filter(Boolean) as any[];
  }, [leads, activePipeline]);

  // Modais de Criação e Detalhes
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const [leadDetail, setLeadDetail] = useState<any | null>(null);

  // Active entry inside the lead detail modal
  const activeEntry = React.useMemo(() => {
    if (!leadDetail || !activePipeline) return null;
    return leadDetail.pipelineEntries?.find((e: any) => e.pipelineId === activePipeline.id) || null;
  }, [leadDetail, activePipeline]);
  
  // Campos do novo Lead
  const [newName, setNewName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newCompany, setNewCompany] = useState('');
  const [newValue, setNewValue] = useState('0');
  const [newPriority, setNewPriority] = useState<'BAIXA' | 'MEDIA' | 'ALTA'>('MEDIA');
  const [newStageId, setNewStageId] = useState('');
  const [newOriginId, setNewOriginId] = useState('');
  const [newLeadTags, setNewLeadTags] = useState<string[]>([]);

  // Modal de registrar perda
  const [lossConfirm, setLossConfirm] = useState<{ leadId: string; targetStageId: string } | null>(null);
  const [selectedLossReasonId, setSelectedLossReasonId] = useState('');

  // Estados internos do modal de detalhes
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
  const [editValue, setEditValue] = useState(0);
  const [editPriority, setEditPriority] = useState<any>('MEDIA');
  const [editPhone, setEditPhone] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editOriginId, setEditOriginId] = useState('');

  // Recarrega leads se trocar o pipeline (se houver mais de um)
  const activeStages = activePipeline ? activePipeline.stages : [];

  // ==========================================
  // CARREGAR DETALHES DO LEAD
  // ==========================================
  const loadLeadDetails = async (leadId: string) => {
    try {
      const detail = await getLeadById(projectId, leadId);
      setLeadDetail(detail);
      
      // Carrega campos personalizados
      const fields = await getLeadCustomFields(projectId, leadId);
      setCustomFields(fields as any);
      
      const fieldValues: Record<string, string> = {};
      fields.forEach(f => {
        fieldValues[f.id] = f.value;
      });
      setEditingCustomFields(fieldValues);

      // Preenche campos de edição rápida
      if (detail && activePipeline) {
        const entry = detail.pipelineEntries?.find((e: any) => e.pipelineId === activePipeline.id);
        setEditName(detail.name);
        setEditCompany(detail.company || '');
        setEditValue(entry ? entry.value : 0);
        setEditPriority(detail.priority);
        setEditPhone(detail.phone || '');
        setEditEmail(detail.email || '');
        setEditOriginId(detail.originId || '');
      }
    } catch (err) {
      console.error('Erro ao buscar detalhes do lead:', err);
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
  // DRAG & DROP NATIVO
  // ==========================================
  
  const handleDragStart = (e: React.DragEvent, leadId: string) => {
    e.dataTransfer.setData('text/plain', leadId);
  };

  const handleDragOver = (e: React.DragEvent, stageId: string) => {
    e.preventDefault();
    setDragOverStageId(stageId);
  };

  const handleDragLeave = () => {
    setDragOverStageId(null);
  };

  const handleDrop = async (e: React.DragEvent, targetStageId: string) => {
    e.preventDefault();
    setDragOverStageId(null);
    const leadId = e.dataTransfer.getData('text/plain');
    if (!leadId || !activePipeline) return;

    const leadObj = leads.find(l => l.id === leadId);
    if (!leadObj) return;

    const targetStage = activeStages.find(s => s.id === targetStageId);
    
    // Se soltou no estágio de perda, exibe modal de registrar motivo de perda
    if (targetStage && (targetStage.name.toLowerCase().includes('perdido') || targetStage.name.toLowerCase().includes('lost'))) {
      setSelectedLossReasonId(lostStatuses[0]?.id || '');
      setLossConfirm({ leadId, targetStageId });
      return;
    }

    // Caso contrário, move normalmente
    // Otimista
    setLeads(leads.map(l => {
      if (l.id === leadId) {
        const updatedEntries = l.pipelineEntries.map(entry =>
          entry.pipelineId === activePipeline.id ? { ...entry, stageId: targetStageId } : entry
        );
        return { ...l, pipelineEntries: updatedEntries };
      }
      return l;
    }));
    try {
      await moveLead(projectId, leadId, activePipeline.id, targetStageId);
    } catch (err) {
      console.error(err);
      // Reverte em caso de erro
      setLeads(initialLeads);
    }
  };

  // Salvar a perda com o motivo
  const handleSaveLoss = async () => {
    if (!lossConfirm || !activePipeline) return;
    const { leadId, targetStageId } = lossConfirm;

    setLossConfirm(null);

    try {
      // Atualiza localmente mudando o status da participação no pipeline ativo para LOST
      setLeads(leads.map(l => {
        if (l.id === leadId) {
          const updatedEntries = l.pipelineEntries.map(e =>
            e.pipelineId === activePipeline.id ? { ...e, status: 'LOST', stageId: targetStageId, lostStatusId: selectedLossReasonId } : e
          );
          return { ...l, pipelineEntries: updatedEntries };
        }
        return l;
      }));

      await updateLead(projectId, leadId, {
        stageId: targetStageId,
        status: 'LOST',
        lostStatusId: selectedLossReasonId || null,
        pipelineId: activePipeline.id
      });
    } catch (err) {
      console.error(err);
      setLeads(initialLeads);
    }
  };

  // ==========================================
  // CRIAR LEAD
  // ==========================================
  
  const handleOpenAddModal = (stageId: string) => {
    setNewStageId(stageId);
    setNewName('');
    setNewEmail('');
    setNewPhone('');
    setNewCompany('');
    setNewValue('0');
    setNewPriority('MEDIA');
    setNewOriginId(origins[0]?.id || '');
    setNewLeadTags([]);
    setShowAddModal(true);
  };

  const handleCreateLead = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activePipeline) return;
    try {
      const created = await createLead(projectId, {
        name: newName,
        email: newEmail || undefined,
        phone: newPhone || undefined,
        company: newCompany || undefined,
        value: parseFloat(newValue) || 0.0,
        priority: newPriority,
        stageId: newStageId,
        originId: newOriginId || undefined,
        tags: newLeadTags
      });

      // Busca a origem no objeto local para exibir no card
      const selectedOrigin = origins.find(o => o.id === newOriginId);
      
      const newLeadObj: Lead = {
        id: created.id,
        name: created.name,
        company: created.company,
        email: created.email,
        phone: created.phone,
        priority: created.priority,
        tags: tags.filter(t => newLeadTags.includes(t.id)),
        tasks: [],
        origin: selectedOrigin ? { name: selectedOrigin.name } : null,
        pipelineEntries: [
          {
            id: 'temp-' + Date.now(),
            pipelineId: activePipeline.id,
            stageId: newStageId,
            value: parseFloat(newValue) || 0.0,
            status: 'ACTIVE',
            lostStatusId: null
          }
        ]
      };

      // Se o lead já existia na lista local (mesmo email/telefone), mescla ele, caso contrário adiciona
      const existsIndex = leads.findIndex(l => l.id === created.id);
      if (existsIndex >= 0) {
        const updatedLeads = [...leads];
        const existingLead = updatedLeads[existsIndex];
        const otherEntries = existingLead.pipelineEntries?.filter(e => e.pipelineId !== activePipeline.id) || [];
        updatedLeads[existsIndex] = {
          ...existingLead,
          name: created.name,
          company: created.company,
          email: created.email,
          phone: created.phone,
          priority: created.priority,
          tags: tags.filter(t => [...(existingLead.tags || []).map(tg => tg.id), ...newLeadTags].includes(t.id)),
          pipelineEntries: [
            ...otherEntries,
            {
              id: 'temp-' + Date.now(),
              pipelineId: activePipeline.id,
              stageId: newStageId,
              value: parseFloat(newValue) || 0.0,
              status: 'ACTIVE',
              lostStatusId: null
            }
          ]
        };
        setLeads(updatedLeads);
      } else {
        setLeads([newLeadObj, ...leads]);
      }
      setShowAddModal(false);
    } catch (err) {
      console.error('Erro ao criar lead:', err);
    }
  };

  // Toggle tag seleção
  const handleToggleTag = (tagId: string) => {
    if (newLeadTags.includes(tagId)) {
      setNewLeadTags(newLeadTags.filter(id => id !== tagId));
    } else {
      setNewLeadTags([...newLeadTags, tagId]);
    }
  };

  // ==========================================
  // ATIVIDADES E COMENTÁRIOS
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
      
      // Atualiza contador de tarefas no card principal
      setLeads(leads.map(l => l.id === selectedLeadId ? { ...l, tasks: [...l.tasks, { id: 'new' }] } : l));
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

      // Atualiza contador local se foi finalizada
      if (targetStatus === 'COMPLETED') {
        setLeads(leads.map(l => l.id === selectedLeadId ? { ...l, tasks: l.tasks.slice(0, -1) } : l));
      } else {
        setLeads(leads.map(l => l.id === selectedLeadId ? { ...l, tasks: [...l.tasks, { id: 'task' }] } : l));
      }
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
    setEditingCustomFields({
      ...editingCustomFields,
      [defId]: val
    });
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
  // EDIÇÃO DE INFORMAÇÕES BÁSICAS DO LEAD
  // ==========================================
  const handleSaveBaseLead = async () => {
    if (!selectedLeadId || !activePipeline) return;
    try {
      const updated = await updateLead(projectId, selectedLeadId, {
        name: editName,
        company: editCompany,
        value: parseFloat(editValue as any) || 0.0,
        priority: editPriority,
        phone: editPhone,
        email: editEmail,
        originId: editOriginId || null,
        pipelineId: activePipeline.id
      });

      // Reflete as mudanças no board local
      setLeads(leads.map(l => {
        if (l.id === selectedLeadId) {
          const updatedEntries = l.pipelineEntries.map(e =>
            e.pipelineId === activePipeline.id ? { ...e, value: parseFloat(editValue as any) || 0.0 } : e
          );
          return {
            ...l,
            name: updated.name,
            company: updated.company,
            priority: updated.priority,
            phone: updated.phone,
            email: updated.email,
            origin: origins.find(o => o.id === updated.originId) ? { name: origins.find(o => o.id === updated.originId)!.name } : null,
            pipelineEntries: updatedEntries
          };
        }
        return l;
      }));

      setIsEditingBaseLead(false);
      loadLeadDetails(selectedLeadId);
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteLead = async () => {
    if (!confirm('Deseja excluir permanentemente este lead?') || !selectedLeadId) return;
    try {
      await deleteLead(projectId, selectedLeadId);
      setLeads(leads.filter(l => l.id !== selectedLeadId));
      setSelectedLeadId(null);
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="flex-1 flex flex-col h-[calc(100vh-50px)] md:h-screen overflow-hidden">
      
      {/* Top bar do Kanban */}
      <div className="flex justify-between items-center px-6 py-4 border-b border-[rgba(255,255,255,0.06)] bg-[rgba(5,5,5,0.2)] backdrop-blur-md">
        <div>
          <h1 className="text-xl font-bold font-display text-white tracking-tight flex items-center gap-2">
            <TrendingDown className="h-5 w-5 text-accent rotate-180" />
            Funil Comercial
          </h1>
          <p className="text-[10px] text-text-secondary mt-0.5">
            Arraste os leads entre os estágios para atualizar o funil de vendas.
          </p>
        </div>
        
        <div className="flex items-center gap-3">
          {/* Seletor de Pipeline (Funil) */}
          {pipelines.length > 1 ? (
            <select
              value={activePipeline?.id || ''}
              onChange={(e) => {
                const found = pipelines.find(p => p.id === e.target.value);
                if (found) setActivePipeline(found);
              }}
              className="text-xs text-white bg-[rgba(255,255,255,0.02)] border border-border-subtle rounded-lg px-3 py-1.5 font-bold outline-none cursor-pointer focus:border-accent"
            >
              {pipelines.map(p => (
                <option key={p.id} value={p.id} className="bg-bg-elevated text-white">
                  {p.name}
                </option>
              ))}
            </select>
          ) : (
            <div className="text-xs text-white bg-[rgba(255,255,255,0.02)] border border-border-subtle rounded-lg px-3 py-1.5 font-bold">
              {activePipeline?.name}
            </div>
          )}
        </div>
      </div>

      {/* Board Kanban */}
      <div className="flex-1 overflow-x-auto overflow-y-hidden p-6 bg-[linear-gradient(to_bottom,transparent,rgba(10,20,13,0.2))]">
        <div className="flex gap-4 items-start h-full pb-4">
          
          {activeStages.map((stage) => {
            const stageLeads = boardItems.filter(l => l.stageId === stage.id);
            const totalValue = stageLeads.reduce((sum, l) => sum + l.value, 0);
            const isOver = dragOverStageId === stage.id;

            return (
              <div
                key={stage.id}
                onDragOver={(e) => handleDragOver(e, stage.id)}
                onDragLeave={handleDragLeave}
                onDrop={(e) => handleDrop(e, stage.id)}
                className={`w-72 max-h-full flex flex-col bg-[rgba(10,15,11,0.2)] backdrop-blur-sm border rounded-xl transition-all duration-150 flex-shrink-0 ${
                  isOver 
                    ? 'border-accent bg-accent-glow' 
                    : 'border-[rgba(255,255,255,0.04)]'
                }`}
              >
                {/* Cabeçalho da coluna */}
                <div className="p-3.5 border-b border-[rgba(255,255,255,0.04)] flex items-center justify-between">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="h-2 w-2 rounded-full flex-shrink-0" style={{ backgroundColor: stage.color }} />
                    <h3 className="text-xs font-bold text-white truncate">{stage.name}</h3>
                    <span className="text-[10px] text-text-secondary bg-[rgba(255,255,255,0.04)] px-2 py-0.5 rounded-full font-bold">
                      {stageLeads.length}
                    </span>
                  </div>
                  <span className="text-[10px] font-bold text-accent-light">
                    {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(totalValue)}
                  </span>
                </div>

                {/* Lista de Cards da coluna */}
                <div className="flex-1 overflow-y-auto p-2.5 space-y-2.5 custom-scrollbar min-h-[150px]">
                  {stageLeads.map((lead) => (
                    <div
                      key={lead.id}
                      draggable
                      onDragStart={(e) => handleDragStart(e, lead.id)}
                      onClick={() => setSelectedLeadId(lead.id)}
                      className="bg-[rgba(255,255,255,0.02)] hover:bg-[rgba(255,255,255,0.04)] border border-[rgba(255,255,255,0.05)] hover:border-border-glass rounded-lg p-3 cursor-grab active:cursor-grabbing transition-all duration-150 relative"
                    >
                      {/* Priority strip */}
                      <span className={`absolute top-0 left-0 bottom-0 w-1 rounded-l-lg ${
                        lead.priority === 'ALTA' 
                          ? 'bg-danger' 
                          : lead.priority === 'MEDIA' 
                            ? 'bg-amber-500' 
                            : 'bg-text-tertiary'
                      }`} />

                      <div className="pl-1.5 space-y-2">
                        {/* Tags */}
                        {lead.tags.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {lead.tags.map((t: any) => (
                              <span 
                                key={t.id}
                                className="text-[9px] font-semibold px-2 py-0.5 rounded-full text-white/90"
                                style={{ backgroundColor: `${t.color}aa` }}
                              >
                                {t.name}
                              </span>
                            ))}
                          </div>
                        )}

                        {/* Name and company */}
                        <div>
                          <h4 className="text-xs font-bold text-white line-clamp-1">{lead.name}</h4>
                          {lead.company && (
                            <p className="text-[10px] text-text-secondary line-clamp-1 mt-0.5">{lead.company}</p>
                          )}
                        </div>

                        {/* Value and stats */}
                        <div className="flex items-center justify-between pt-1 border-t border-[rgba(255,255,255,0.02)]">
                          <span className="text-xs font-black text-accent-light">
                            {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(lead.value)}
                          </span>

                          <div className="flex items-center gap-2 text-[10px] text-text-secondary">
                            {lead.origin && (
                              <span className="bg-[rgba(255,255,255,0.03)] px-1.5 py-0.5 rounded text-[9px] border border-border-subtle" title="Origem">
                                {lead.origin.name}
                              </span>
                            )}
                            {lead.tasks.length > 0 && (
                              <span className="text-orange-400 font-bold" title="Tarefas pendentes">
                                ✓ {lead.tasks.length}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Botão de adicionar no final da coluna */}
                <button
                  onClick={() => handleOpenAddModal(stage.id)}
                  className="mx-3.5 my-3 py-1.5 border border-dashed border-[rgba(255,255,255,0.06)] hover:border-accent hover:bg-accent-glow text-[11px] font-bold text-text-secondary hover:text-accent rounded-lg flex items-center justify-center gap-1 cursor-pointer transition-all duration-150"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Adicionar Lead
                </button>
              </div>
            );
          })}

        </div>
      </div>

      {/* ==========================================
      MODAL DE ADICIONAR LEAD
      ========================================== */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-bg-elevated border border-border-strong w-full max-w-lg rounded-2xl overflow-hidden shadow-2xl p-6">
            <div className="flex justify-between items-center border-b border-[rgba(255,255,255,0.05)] pb-3 mb-4">
              <h2 className="text-lg font-bold font-display text-white">Criar Nova Oportunidade</h2>
              <button onClick={() => setShowAddModal(false)} className="text-text-secondary hover:text-white cursor-pointer">
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleCreateLead} className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5 col-span-2">
                <label className="text-xs font-semibold text-text-secondary uppercase">Nome do Lead</label>
                <input
                  required
                  type="text"
                  placeholder="Nome do cliente"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="bg-bg-base border border-border-subtle rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-accent"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-text-secondary uppercase">E-mail</label>
                <input
                  type="email"
                  placeholder="cliente@email.com"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  className="bg-bg-base border border-border-subtle rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-accent"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-text-secondary uppercase">Telefone/WhatsApp</label>
                <input
                  type="text"
                  placeholder="11999998888"
                  value={newPhone}
                  onChange={(e) => setNewPhone(e.target.value)}
                  className="bg-bg-base border border-border-subtle rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-accent"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-text-secondary uppercase">Empresa</label>
                <input
                  type="text"
                  placeholder="Nome da empresa"
                  value={newCompany}
                  onChange={(e) => setNewCompany(e.target.value)}
                  className="bg-bg-base border border-border-subtle rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-accent"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-text-secondary uppercase">Valor do Contrato (R$)</label>
                <input
                  type="number"
                  placeholder="Valor estimado"
                  value={newValue}
                  onChange={(e) => setNewValue(e.target.value)}
                  className="bg-bg-base border border-border-subtle rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-accent"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-text-secondary uppercase">Prioridade</label>
                <select
                  value={newPriority}
                  onChange={(e) => setNewPriority(e.target.value as any)}
                  className="bg-bg-base border border-border-subtle rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-accent"
                >
                  <option value="BAIXA">Baixa</option>
                  <option value="MEDIA">Média</option>
                  <option value="ALTA">Alta</option>
                </select>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-text-secondary uppercase">Origem do Lead</label>
                <select
                  value={newOriginId}
                  onChange={(e) => setNewOriginId(e.target.value)}
                  className="bg-bg-base border border-border-subtle rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-accent"
                >
                  <option value="">Selecione...</option>
                  {origins.map(o => (
                    <option key={o.id} value={o.id}>{o.name}</option>
                  ))}
                </select>
              </div>

              {/* Tags */}
              <div className="flex flex-col gap-1.5 col-span-2">
                <label className="text-xs font-semibold text-text-secondary uppercase">Tags Relacionadas</label>
                <div className="flex flex-wrap gap-2 pt-1">
                  {tags.map((t) => {
                    const isSelected = newLeadTags.includes(t.id);
                    return (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => handleToggleTag(t.id)}
                        className={`px-3 py-1 rounded-full text-xs font-semibold cursor-pointer border transition-all ${
                          isSelected 
                            ? 'text-white border-transparent' 
                            : 'text-text-secondary border-border-subtle hover:text-white'
                        }`}
                        style={{ backgroundColor: isSelected ? t.color : 'transparent' }}
                      >
                        {t.name}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 col-span-2 pt-4 border-t border-[rgba(255,255,255,0.05)]">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 text-xs font-bold text-text-secondary hover:text-white cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-accent hover:bg-accent-light text-black font-bold text-xs rounded-lg transition-all cursor-pointer"
                >
                  Salvar Oportunidade
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ==========================================
      MODAL REGISTRAR PERDA (LOST STATUS)
      ========================================== */}
      {lossConfirm && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-bg-elevated border border-border-strong w-full max-w-sm rounded-2xl overflow-hidden shadow-2xl p-6">
            <div className="flex items-center gap-2 text-danger mb-4">
              <AlertCircle className="h-5 w-5" />
              <h2 className="text-lg font-bold font-display text-white">Marcar como Perdido</h2>
            </div>
            
            <p className="text-xs text-text-secondary mb-4 leading-relaxed">
              Para arquivar esta oportunidade comercial, por favor registre o principal motivo da perda.
            </p>

            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-text-secondary uppercase">Motivo de Perda</label>
                <select
                  value={selectedLossReasonId}
                  onChange={(e) => setSelectedLossReasonId(e.target.value)}
                  className="bg-bg-base border border-border-subtle rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-accent"
                >
                  {lostStatuses.map(reason => (
                    <option key={reason.id} value={reason.id}>{reason.reason}</option>
                  ))}
                  {lostStatuses.length === 0 && (
                    <option value="">Nenhum motivo cadastrado</option>
                  )}
                </select>
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setLossConfirm(null)}
                  className="px-4 py-2 text-xs font-bold text-text-secondary hover:text-white cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleSaveLoss}
                  className="px-4 py-2 bg-danger hover:bg-red-600 text-white font-bold text-xs rounded-lg transition-all cursor-pointer"
                >
                  Registrar Perda
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ==========================================
      MODAL DE DETALHES DO LEAD (LINHA DO TEMPO, TAREFAS, CUSTOM FIELDS)
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
                    Criado em {new Date(leadDetail.createdAt).toLocaleString('pt-BR')} • Estágio: <span className="text-white font-semibold">{activeEntry?.stage?.name || 'Sem estágio'}</span>
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
              
              {/* Coluna Lateral: Informações do Lead */}
              <div className="w-full md:w-80 border-b md:border-b-0 md:border-r border-[rgba(255,255,255,0.05)] p-6 overflow-y-auto space-y-6 flex-shrink-0 bg-[rgba(5,5,5,0.1)]">
                
                {/* Informações Básicas / Form de Edição */}
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
                        <span className="text-[10px] text-text-secondary block font-semibold">VALOR ESTIMADO</span>
                        <span className="text-accent-light font-black text-sm">
                          {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(activeEntry?.value || 0)}
                        </span>
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
                      {activeEntry?.status === 'LOST' && (
                        <div className="bg-danger/10 border border-danger/20 rounded-lg p-3 text-danger">
                          <span className="text-[9px] font-bold uppercase tracking-wider block">OPORTUNIDADE PERDIDA</span>
                          <p className="text-xs font-semibold mt-1">Motivo: {activeEntry?.lostStatus?.reason || 'Outros'}</p>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-3 flex flex-col">
                      <div className="flex flex-col gap-1">
                        <label className="text-[9px] font-semibold text-text-secondary uppercase">Nome</label>
                        <input
                          type="text"
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          className="bg-bg-base border border-border-subtle rounded px-2.5 py-1.5 text-xs text-white outline-none focus:border-accent"
                        />
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className="text-[9px] font-semibold text-text-secondary uppercase">Empresa</label>
                        <input
                          type="text"
                          value={editCompany}
                          onChange={(e) => setEditCompany(e.target.value)}
                          className="bg-bg-base border border-border-subtle rounded px-2.5 py-1.5 text-xs text-white outline-none focus:border-accent"
                        />
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className="text-[9px] font-semibold text-text-secondary uppercase">Valor (R$)</label>
                        <input
                          type="number"
                          value={editValue}
                          onChange={(e) => setEditValue(parseFloat(e.target.value) || 0)}
                          className="bg-bg-base border border-border-subtle rounded px-2.5 py-1.5 text-xs text-white outline-none focus:border-accent"
                        />
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className="text-[9px] font-semibold text-text-secondary uppercase">Prioridade</label>
                        <select
                          value={editPriority}
                          onChange={(e) => setEditPriority(e.target.value as any)}
                          className="bg-bg-base border border-border-subtle rounded px-2 py-1.5 text-xs text-white outline-none focus:border-accent"
                        >
                          <option value="BAIXA">Baixa</option>
                          <option value="MEDIA">Média</option>
                          <option value="ALTA">Alta</option>
                        </select>
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className="text-[9px] font-semibold text-text-secondary uppercase">Telefone/WhatsApp</label>
                        <input
                          type="text"
                          value={editPhone}
                          onChange={(e) => setEditPhone(e.target.value)}
                          className="bg-bg-base border border-border-subtle rounded px-2.5 py-1.5 text-xs text-white outline-none focus:border-accent"
                        />
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className="text-[9px] font-semibold text-text-secondary uppercase">E-mail</label>
                        <input
                          type="email"
                          value={editEmail}
                          onChange={(e) => setEditEmail(e.target.value)}
                          className="bg-bg-base border border-border-subtle rounded px-2.5 py-1.5 text-xs text-white outline-none focus:border-accent"
                        />
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className="text-[9px] font-semibold text-text-secondary uppercase">Origem</label>
                        <select
                          value={editOriginId}
                          onChange={(e) => setEditOriginId(e.target.value)}
                          className="bg-bg-base border border-border-subtle rounded px-2 py-1.5 text-xs text-white outline-none focus:border-accent"
                        >
                          <option value="">Selecione...</option>
                          {origins.map(o => (
                            <option key={o.id} value={o.id}>{o.name}</option>
                          ))}
                        </select>
                      </div>

                      <button
                        onClick={handleSaveBaseLead}
                        className="mt-2 py-2 bg-accent hover:bg-accent-light text-black font-bold text-xs rounded transition-all cursor-pointer"
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
                      Nenhum campo personalizado cadastrado nas configurações do projeto comercial.
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
                              className="bg-bg-base border border-border-subtle rounded-md px-2.5 py-1.5 text-xs text-white outline-none"
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
                              className="bg-bg-base border border-border-subtle rounded-md px-2.5 py-1.5 text-xs text-white outline-none focus:border-accent"
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

              {/* Central: Histórico de Linha do tempo e Tarefas */}
              <div className="flex-1 flex flex-col md:flex-row min-h-0 overflow-y-auto md:overflow-hidden divide-y md:divide-y-0 md:divide-x divide-[rgba(255,255,255,0.05)]">
                
                {/* Linha do tempo de atividades (Timeline) */}
                <div className="flex-1 p-6 flex flex-col min-h-0 overflow-hidden">
                  <h3 className="text-xs font-bold text-accent uppercase tracking-wider mb-4 flex items-center gap-1.5 flex-shrink-0">
                    <Clock className="h-4 w-4" />
                    Histórico & Linha do Tempo
                  </h3>

                  {/* Listagem de Atividades */}
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

                  {/* Caixa de Novo Comentário */}
                  <form onSubmit={handleAddComment} className="mt-4 pt-4 border-t border-[rgba(255,255,255,0.05)] flex gap-2 flex-shrink-0">
                    <input
                      required
                      type="text"
                      placeholder="Adicione um comentário ou anotação..."
                      value={newComment}
                      onChange={(e) => setNewComment(e.target.value)}
                      className="flex-1 bg-bg-base border border-border-subtle rounded-lg px-3 py-2 text-xs text-white outline-none focus:border-accent"
                    />
                    <button
                      type="submit"
                      className="px-4 py-2 bg-accent hover:bg-accent-light text-black font-bold text-xs rounded-lg transition-all cursor-pointer"
                    >
                      Enviar
                    </button>
                  </form>
                </div>

                {/* Checklist de Tarefas do Lead */}
                <div className="w-full md:w-80 p-6 flex flex-col min-h-0 overflow-hidden">
                  <h3 className="text-xs font-bold text-accent uppercase tracking-wider mb-4 flex items-center gap-1.5 flex-shrink-0">
                    <CheckSquare className="h-4 w-4" />
                    Ações & Tarefas
                  </h3>

                  {/* Formulário rápida de nova Tarefa */}
                  <form onSubmit={handleAddTask} className="mb-4 space-y-2 flex-shrink-0">
                    <input
                      required
                      type="text"
                      placeholder="Nova ação (ex: Ligar na segunda)"
                      value={newTaskTitle}
                      onChange={(e) => setNewTaskTitle(e.target.value)}
                      className="w-full bg-bg-base border border-border-subtle rounded-lg px-3 py-2 text-xs text-white outline-none focus:border-accent"
                    />
                    <div className="flex gap-2">
                      <input
                        type="date"
                        value={newTaskDue}
                        onChange={(e) => setNewTaskDue(e.target.value)}
                        className="flex-1 bg-bg-base border border-border-subtle rounded-lg px-2.5 py-1.5 text-xs text-white outline-none focus:border-accent"
                      />
                      <button
                        type="submit"
                        className="px-3 py-1.5 bg-accent hover:bg-accent-light text-black font-bold text-xs rounded-lg cursor-pointer"
                      >
                        Agendar
                      </button>
                    </div>
                  </form>

                  {/* Listagem de Tarefas */}
                  <div className="flex-1 overflow-y-auto space-y-2.5 pr-2 custom-scrollbar min-h-[150px]">
                    {leadDetail.tasks.length === 0 ? (
                      <p className="text-xs text-text-secondary text-center py-6">Nenhuma tarefa agendada.</p>
                    ) : (
                      leadDetail.tasks.map((task: any) => {
                        const isCompleted = task.status === 'COMPLETED';
                        return (
                          <div 
                            key={task.id} 
                            className={`flex items-start gap-2.5 p-3 rounded-lg border text-xs transition-all ${
                              isCompleted 
                                ? 'bg-[rgba(255,255,255,0.01)] border-[rgba(255,255,255,0.03)] opacity-60' 
                                : 'bg-[rgba(255,255,255,0.02)] border-[rgba(255,255,255,0.05)] hover:border-border-glass'
                            }`}
                          >
                            <button
                              onClick={() => handleToggleTaskStatus(task.id, task.status)}
                              className="text-text-secondary hover:text-white cursor-pointer mt-0.5"
                            >
                              {isCompleted ? (
                                <CheckCircle2 className="h-4 w-4 text-accent" />
                              ) : (
                                <Circle className="h-4 w-4 text-text-tertiary" />
                              )}
                            </button>
                            <div className="flex-1 min-w-0">
                              <p className={`font-semibold text-white ${isCompleted ? 'line-through text-text-secondary' : ''}`}>
                                {task.title}
                              </p>
                              {task.dueDate && (
                                <span className="text-[10px] text-orange-400 mt-1 flex items-center gap-1 font-semibold">
                                  <Calendar className="h-3 w-3" />
                                  {new Date(task.dueDate).toLocaleDateString('pt-BR')}
                                </span>
                              )}
                            </div>
                            <button
                              onClick={() => handleDeleteTask(task.id)}
                              className="text-text-tertiary hover:text-danger p-0.5 cursor-pointer"
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

    </div>
  );
}
