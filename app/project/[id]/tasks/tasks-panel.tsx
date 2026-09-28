'use client';

import React, { useState } from 'react';
import { 
  createTask, 
  updateTask, 
  deleteTask 
} from '@/app/actions/crm';
import { 
  CheckSquare, 
  Plus, 
  Calendar, 
  User, 
  Trash2, 
  CheckCircle2, 
  Circle, 
  AlertCircle,
  Clock,
  Play
} from 'lucide-react';

interface Task {
  id: string;
  title: string;
  description: string | null;
  dueDate: Date | null;
  status: string;
  leadId: string | null;
  lead?: {
    id: string;
    name: string;
    company: string | null;
  } | null;
}

interface Lead {
  id: string;
  name: string;
}

interface TasksPanelProps {
  projectId: string;
  initialTasks: Task[];
  leads: Lead[];
}

export function TasksPanel({ projectId, initialTasks, leads }: TasksPanelProps) {
  const [tasks, setTasks] = useState<Task[]>(initialTasks);
  const [isPending, setIsPending] = useState(false);

  // Campos de Criação
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [dueTime, setDueTime] = useState('');
  const [leadId, setLeadId] = useState('');

  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    setIsPending(true);

    try {
      const created = await createTask(projectId, {
        title,
        description: description || undefined,
        dueDate: dueDate ? (dueTime ? `${dueDate}T${dueTime}` : dueDate) : undefined,
        leadId: leadId || undefined
      });

      const selectedLead = leads.find(l => l.id === leadId);

      const newTaskObj: Task = {
        id: created.id,
        title: created.title,
        description: created.description,
        dueDate: created.dueDate,
        status: created.status,
        leadId: created.leadId,
        lead: selectedLead ? { id: selectedLead.id, name: selectedLead.name, company: null } : null
      };

      setTasks([newTaskObj, ...tasks]);
      setTitle('');
      setDescription('');
      setDueDate('');
      setDueTime('');
      setLeadId('');
    } catch (err) {
      console.error(err);
    } finally {
      setIsPending(false);
    }
  };

  const handleToggleStatus = async (taskId: string, currentStatus: string) => {
    const targetStatus = currentStatus === 'COMPLETED' ? 'PENDING' : 'COMPLETED';
    
    // Atualização otimista
    setTasks(tasks.map(t => t.id === taskId ? { ...t, status: targetStatus } : t));

    try {
      await updateTask(projectId, taskId, { status: targetStatus });
    } catch (err) {
      console.error(err);
      setTasks(initialTasks); // Reverte
    }
  };

  const handleDeleteTask = async (taskId: string) => {
    if (!confirm('Deseja excluir esta tarefa?')) return;
    
    setTasks(tasks.filter(t => t.id !== taskId));
    try {
      await deleteTask(projectId, taskId);
    } catch (err) {
      console.error(err);
      setTasks(initialTasks);
    }
  };

  const pendingTasks = tasks.filter(t => t.status !== 'COMPLETED');
  const completedTasks = tasks.filter(t => t.status === 'COMPLETED');

  return (
    <div className="flex-1 p-6 md:p-8 space-y-6 max-w-6xl mx-auto flex flex-col md:flex-row gap-8 h-screen overflow-hidden">
      
      {/* Coluna Esquerda: Lista de Tarefas (Flex-1) */}
      <div className="flex-1 flex flex-col min-h-0">
        <div className="mb-4">
          <h1 className="text-2xl font-extrabold font-display text-white tracking-tight">Gestão de Tarefas</h1>
          <p className="text-xs text-text-secondary mt-1">Acompanhe e conclua compromissos e followups agendados.</p>
        </div>

        {/* Listagem dividida em Pendentes e Concluídas */}
        <div className="flex-1 overflow-y-auto space-y-6 pr-2 custom-scrollbar min-h-0">
          
          {/* Pendentes */}
          <div className="space-y-3">
            <h2 className="text-xs font-bold text-accent uppercase tracking-wider flex items-center gap-1.5">
              <Clock className="h-4 w-4" />
              Pendentes ({pendingTasks.length})
            </h2>

            {pendingTasks.length === 0 ? (
              <p className="text-xs text-text-secondary py-4 bg-glass-1 border border-dashed border-border-subtle rounded-xl text-center">
                Sem tarefas pendentes para hoje.
              </p>
            ) : (
              <div className="space-y-3">
                {pendingTasks.map((task) => (
                  <div 
                    key={task.id}
                    className="bg-glass-2 hover:bg-glass-4 border border-border-subtle hover:border-border-glass rounded-xl p-4 flex items-start gap-4 transition-all"
                  >
                    <button
                      onClick={() => handleToggleStatus(task.id, task.status)}
                      className="text-text-secondary hover:text-white cursor-pointer mt-0.5"
                    >
                      <Circle className="h-5 w-5 text-text-tertiary" />
                    </button>
                    
                    <div className="flex-1 min-w-0">
                      <h3 className="text-sm font-bold text-white leading-snug">{task.title}</h3>
                      {task.description && (
                        <p className="text-xs text-text-secondary mt-1 leading-relaxed">{task.description}</p>
                      )}
                      
                      <div className="flex flex-wrap items-center gap-4 mt-3 text-[10px] text-text-secondary">
                        {task.dueDate && (
                          <span className="flex items-center gap-1 font-semibold text-orange-400">
                            <Calendar className="h-3.5 w-3.5" />
                            Vence em: {new Date(task.dueDate).toLocaleDateString('pt-BR')} às {new Date(task.dueDate).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        )}
                        {task.lead && (
                          <span className="flex items-center gap-1 font-semibold text-accent-light">
                            <User className="h-3.5 w-3.5" />
                            Lead: {task.lead.name}
                          </span>
                        )}
                      </div>
                    </div>

                    <button
                      onClick={() => handleDeleteTask(task.id)}
                      className="text-text-tertiary hover:text-danger p-1 cursor-pointer"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Concluídas */}
          <div className="space-y-3 pt-4 border-t border-border-subtle">
            <h2 className="text-xs font-bold text-text-secondary uppercase tracking-wider flex items-center gap-1.5">
              <CheckCircle2 className="h-4 w-4 text-text-tertiary" />
              Concluídas ({completedTasks.length})
            </h2>

            {completedTasks.length === 0 ? (
              <p className="text-xs text-text-tertiary py-4 text-center">Nenhuma tarefa concluída recentemente.</p>
            ) : (
              <div className="space-y-2.5">
                {completedTasks.map((task) => (
                  <div 
                    key={task.id}
                    className="bg-glass-1 border border-[rgba(255,255,255,0.03)] opacity-60 rounded-xl p-3 flex items-start gap-3 transition-all"
                  >
                    <button
                      onClick={() => handleToggleStatus(task.id, task.status)}
                      className="text-text-secondary hover:text-white cursor-pointer mt-0.5"
                    >
                      <CheckCircle2 className="h-4 w-4 text-accent" />
                    </button>
                    
                    <div className="flex-1 min-w-0">
                      <h3 className="text-xs font-bold text-white line-through leading-snug">{task.title}</h3>
                      <div className="flex items-center gap-4 mt-2 text-[9px] text-text-tertiary">
                        {task.dueDate && (
                          <span className="flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            Finalizada
                          </span>
                        )}
                        {task.lead && (
                          <span className="flex items-center gap-1">
                            <User className="h-3 w-3" />
                            Lead: {task.lead.name}
                          </span>
                        )}
                      </div>
                    </div>

                    <button
                      onClick={() => handleDeleteTask(task.id)}
                      className="text-text-tertiary hover:text-danger p-0.5 cursor-pointer"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>
      </div>

      {/* Coluna Direita: Criar Tarefa (W-80) */}
      <div className="w-full md:w-80 flex-shrink-0 bg-glass-1 border border-border-subtle rounded-2xl p-6 shadow-2xl h-fit">
        <h2 className="text-md font-bold font-display text-white mb-4 flex items-center gap-2">
          <Plus className="h-4 w-4 text-accent" />
          Agendar Nova Ação
        </h2>
        
        <form onSubmit={handleCreateTask} className="flex flex-col gap-4">
          
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-semibold text-text-secondary uppercase">Título da Ação</label>
            <input
              required
              type="text"
              placeholder="Ex: Enviar deck comercial"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="bg-bg-base border border-border-subtle rounded-lg px-3 py-2 text-xs text-white outline-none focus:border-accent"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-semibold text-text-secondary uppercase">Descrição / Anotações</label>
            <textarea
              placeholder="Detalhes adicionais..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="bg-bg-base border border-border-subtle rounded-lg px-3 py-2 text-xs text-white outline-none focus:border-accent resize-none"
            />
          </div>

          <div className="flex gap-2">
            <div className="flex flex-col gap-1 flex-1">
              <label className="text-[10px] font-semibold text-text-secondary uppercase">Data de Vencimento</label>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="bg-bg-base border border-border-subtle rounded-lg px-3 py-2 text-xs text-white outline-none focus:border-accent"
              />
            </div>
            <div className="flex flex-col gap-1 w-28">
              <label className="text-[10px] font-semibold text-text-secondary uppercase">Horário</label>
              <input
                type="time"
                value={dueTime}
                onChange={(e) => setDueTime(e.target.value)}
                disabled={!dueDate}
                className="bg-bg-base border border-border-subtle rounded-lg px-3 py-2 text-xs text-white outline-none focus:border-accent disabled:opacity-40"
              />
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-semibold text-text-secondary uppercase">Vincular a um Lead</label>
            <select
              value={leadId}
              onChange={(e) => setLeadId(e.target.value)}
              className="bg-bg-base border border-border-subtle rounded-lg px-3 py-2 text-xs text-white outline-none focus:border-accent"
            >
              <option value="">Não vincular (Geral)</option>
              {leads.map(l => (
                <option key={l.id} value={l.id}>{l.name}</option>
              ))}
            </select>
          </div>

          <button
            type="submit"
            disabled={isPending}
            className="w-full h-10 bg-accent hover:bg-accent-light text-black font-bold text-xs rounded-lg cursor-pointer transition-all duration-200"
          >
            {isPending ? 'Agendando...' : 'Agendar Tarefa'}
          </button>

        </form>
      </div>

    </div>
  );
}
