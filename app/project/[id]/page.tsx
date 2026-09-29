import React from 'react';
import { requireProjectAccess } from '@/lib/security';
import { prisma } from '@/lib/prisma';
import { 
  TrendingUp, 
  Users, 
  DollarSign, 
  CheckSquare, 
  Target, 
  Sparkles,
  AlertTriangle,
  Compass,
  Frown,
  CalendarClock,
  User
} from 'lucide-react';

// Nomes de estágio considerados "fechamento (ganho)" para métricas de conversão
const WON_STAGE_NAMES = ['Fechado (Ganho)', 'Fechado'];

interface Props {
  params: Promise<{ id: string }>;
}

export const dynamic = 'force-dynamic';

export default async function ProjectDashboardPage({ params }: Props) {
  const { id: projectId } = await params;
  
  // 1. Valida acesso ao projeto
  await requireProjectAccess(projectId);

  // 2. Busca dados de estatísticas básicas
  const activeLeadsCount = await prisma.lead.count({
    where: {
      projectId,
      pipelineEntries: {
        some: {
          status: 'ACTIVE'
        }
      }
    },
  });

  const valueSumResult = await prisma.pipelineEntry.aggregate({
    where: {
      status: 'ACTIVE',
      pipeline: {
        projectId: projectId
      }
    },
    _sum: { value: true },
  });
  const totalPipelineValue = valueSumResult._sum.value || 0;

  const pendingTasksCount = await prisma.task.count({
    where: { projectId, status: { in: ['PENDING', 'IN_PROGRESS'] } },
  });

  // Eventos/Tarefas agendados para hoje (horário de Brasília)
  const spToday = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
  const todayStart = new Date(`${spToday}T00:00:00-03:00`);
  const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);

  const todayEvents = await prisma.task.findMany({
    where: {
      projectId,
      status: { in: ['PENDING', 'IN_PROGRESS'] },
      dueDate: { gte: todayStart, lt: todayEnd },
    },
    include: { lead: { select: { name: true } } },
    orderBy: { dueDate: 'asc' },
  });

  // Cálculo de taxa de conversão (Leads Ganhas / Total Histórico de Leads)
  const wonLeadsCount = await prisma.lead.count({
    where: { 
      projectId, 
      pipelineEntries: {
        some: {
          stage: {
            name: { in: WON_STAGE_NAMES }
          }
        }
      }
    },
  });

  const totalLeadsHistorical = await prisma.lead.count({
    where: { projectId },
  });

  const conversionRate = totalLeadsHistorical > 0 
    ? ((wonLeadsCount / totalLeadsHistorical) * 100).toFixed(1)
    : '0.0';

  // 3. Distribuição de Leads por Estágios (agrupado por funil)
  const pipelinesData = await prisma.pipeline.findMany({
    where: { projectId },
    orderBy: { name: 'asc' },
    include: {
      stages: {
        orderBy: { order: 'asc' },
        include: {
          pipelineEntries: {
            where: { status: 'ACTIVE' },
            select: { value: true }
          }
        }
      }
    }
  });

  const pipelineBreakdown = pipelinesData.map(pipeline => ({
    id: pipeline.id,
    name: pipeline.name,
    stages: pipeline.stages.map(stage => ({
      id: stage.id,
      name: stage.name,
      color: stage.color,
      count: stage.pipelineEntries.length,
      value: stage.pipelineEntries.reduce((sum, entry) => sum + entry.value, 0)
    }))
  }));

  // 4. Distribuição de Leads por Origem + Fechamento por Origem
  const originsData = await prisma.origin.findMany({
    where: { projectId },
    include: {
      leads: {
        select: {
          id: true,
          pipelineEntries: {
            select: {
              status: true,
              stage: { select: { name: true } }
            }
          }
        }
      }
    }
  });

  // Leads sem origem cadastrada
  const leadsWithoutOrigin = await prisma.lead.findMany({
    where: { projectId, originId: null },
    select: {
      id: true,
      pipelineEntries: {
        select: {
          status: true,
          stage: { select: { name: true } }
        }
      }
    }
  });

  type OriginLead = {
    id: string;
    pipelineEntries: { status: string; stage: { name: string } }[];
  };

  const buildOriginStats = (id: string, name: string, originLeads: OriginLead[]) => {
    const total = originLeads.length;
    const active = originLeads.filter(l => l.pipelineEntries.some(e => e.status === 'ACTIVE')).length;
    const won = originLeads.filter(l => l.pipelineEntries.some(e => WON_STAGE_NAMES.includes(e.stage.name))).length;
    return {
      id,
      name,
      count: active,
      total,
      won,
      rate: total > 0 ? (won / total) * 100 : 0
    };
  };

  const originBreakdown = originsData.map(origin => buildOriginStats(origin.id, origin.name, origin.leads));

  if (leadsWithoutOrigin.length > 0) {
    originBreakdown.push(buildOriginStats('none', 'Sem Origem Especificada', leadsWithoutOrigin));
  }

  // Ranking de fechamento por origem (maiores primeiro)
  const originClosingRanking = [...originBreakdown]
    .filter(item => item.total > 0)
    .sort((a, b) => b.won - a.won || b.rate - a.rate);

  // 5. Relatório de Oportunidades Perdidas por Motivo (adendo)
  const lostReasonsData = await prisma.lostStatus.findMany({
    where: { projectId },
    include: {
      pipelineEntries: {
        where: { status: 'LOST' }
      }
    }
  });

  const lostWithoutReasonCount = await prisma.pipelineEntry.count({
    where: {
      status: 'LOST',
      lostStatusId: null,
      pipeline: {
        projectId: projectId
      }
    }
  });

  const lostReasonBreakdown = lostReasonsData.map(reason => ({
    id: reason.id,
    reason: reason.reason,
    count: reason.pipelineEntries.length
  }));

  if (lostWithoutReasonCount > 0) {
    lostReasonBreakdown.push({
      id: 'none',
      reason: 'Outros / Não informado',
      count: lostWithoutReasonCount
    });
  }

  const totalLostLeads = lostReasonBreakdown.reduce((sum, item) => sum + item.count, 0);

  return (
    <div className="flex-1 p-6 md:p-8 space-y-8 max-w-6xl mx-auto">
      
      {/* Top Banner de Boas Vindas */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <span className="text-[10px] uppercase font-bold tracking-widest text-accent bg-accent-glow px-2.5 py-1 rounded-full border border-border-glass">
            Decisor • ICP Ideal • High Ticket
          </span>
          <h1 className="text-3xl font-extrabold font-display text-white mt-2 tracking-tight">
            Dashboard Estratégico
          </h1>
          <p className="text-xs text-text-secondary mt-1">
            Métricas de desempenho e saúde comercial do seu projeto.
          </p>
        </div>
      </div>

      {/* Destaque: Eventos de Hoje */}
      <div className="bg-glass-1 border border-accent/40 rounded-xl p-5 shadow-xl">
        <h4 className="text-sm font-bold font-display text-white uppercase tracking-wider mb-4 flex items-center gap-2">
          <CalendarClock className="h-4 w-4 text-accent" />
          Eventos de Hoje
          <span className="text-[10px] font-bold text-black bg-accent px-2 py-0.5 rounded-full">
            {todayEvents.length}
          </span>
        </h4>

        {todayEvents.length === 0 ? (
          <p className="text-xs text-text-secondary py-2 text-center">
            Nenhum evento agendado para hoje.
          </p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {todayEvents.map((task) => (
              <div
                key={task.id}
                className="bg-glass-2 border border-border-subtle rounded-lg p-3.5 flex flex-col gap-1.5"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] font-bold text-accent bg-accent/10 border border-accent/25 px-2 py-0.5 rounded-full">
                    {task.dueDate
                      ? new Date(task.dueDate).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' })
                      : '--:--'}
                  </span>
                  {task.lead && (
                    <span className="text-[10px] text-text-secondary flex items-center gap-1 truncate">
                      <User className="h-3 w-3 flex-shrink-0" />
                      <span className="truncate">{task.lead.name}</span>
                    </span>
                  )}
                </div>
                <p className="text-xs font-bold text-white leading-snug">{task.title}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Grid de Cards Métricas (Totalizadores) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        
        {/* Card 1: Leads Ativos */}
        <div className="bg-glass-1 border border-border-subtle border-l-accent rounded-xl p-5 shadow-lg relative overflow-hidden group">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-[10px] font-bold text-text-secondary uppercase tracking-wider">Leads Ativos</p>
              <h3 className="text-3xl font-extrabold text-white mt-1 font-display">{activeLeadsCount}</h3>
            </div>
            <div className="h-8 w-8 rounded-lg bg-accent/10 flex items-center justify-center text-accent">
              <Users className="h-4 w-4" />
            </div>
          </div>
          <p className="text-[10px] text-text-secondary mt-3">Negociações ativas no funil</p>
        </div>

        {/* Card 2: Valor Total */}
        <div className="bg-glass-1 border border-border-subtle border-l-[#abfe37] rounded-xl p-5 shadow-lg relative overflow-hidden group">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-[10px] font-bold text-text-secondary uppercase tracking-wider">Valor em Pipeline</p>
              <h3 className="text-3xl font-extrabold text-white mt-1 font-display">
                {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(totalPipelineValue)}
              </h3>
            </div>
            <div className="h-8 w-8 rounded-lg bg-[#abfe37]/10 flex items-center justify-center text-[#abfe37]">
              <DollarSign className="h-4 w-4" />
            </div>
          </div>
          <p className="text-[10px] text-text-secondary mt-3">Valor total ponderado estimado</p>
        </div>

        {/* Card 3: Taxa de Conversão */}
        <div className="bg-glass-1 border border-border-subtle border-l-purple-500 rounded-xl p-5 shadow-lg relative overflow-hidden group">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-[10px] font-bold text-text-secondary uppercase tracking-wider">Taxa de Conversão</p>
              <h3 className="text-3xl font-extrabold text-white mt-1 font-display">{conversionRate}%</h3>
            </div>
            <div className="h-8 w-8 rounded-lg bg-purple-500/10 flex items-center justify-center text-purple-400">
              <Target className="h-4 w-4" />
            </div>
          </div>
          <p className="text-[10px] text-text-secondary mt-3">De leads geradas para fechadas</p>
        </div>

        {/* Card 4: Tarefas Pendentes */}
        <div className="bg-glass-1 border border-border-subtle border-l-orange-400 rounded-xl p-5 shadow-lg relative overflow-hidden group">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-[10px] font-bold text-text-secondary uppercase tracking-wider">Ações Pendentes</p>
              <h3 className="text-3xl font-extrabold text-white mt-1 font-display">{pendingTasksCount}</h3>
            </div>
            <div className="h-8 w-8 rounded-lg bg-orange-400/10 flex items-center justify-center text-orange-400">
              <CheckSquare className="h-4 w-4" />
            </div>
          </div>
          <p className="text-[10px] text-text-secondary mt-3">Tarefas aguardando execução</p>
        </div>

      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Painel 1: Pipeline por Estágio (Largura 2 colunas no desktop) */}
        <div className="lg:col-span-2 bg-glass-1 border border-border-subtle rounded-xl p-6 shadow-xl flex flex-col justify-between">
          <div>
            <h4 className="text-sm font-bold font-display text-white uppercase tracking-wider mb-5 flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-accent" />
              Volume por Estágio do Funil
            </h4>
            <div className="space-y-6">
              {pipelineBreakdown.map((pipeline) => {
                // Calcula percentual para a barra de progresso dentro do próprio funil
                const maxLeads = Math.max(...pipeline.stages.map(s => s.count), 1);

                return (
                  <div key={pipeline.id} className="space-y-4">
                    {/* Nome do funil (separador visual quando há mais de um) */}
                    <h5 className="text-[10px] font-bold text-accent uppercase tracking-widest border-b border-border-subtle pb-2 flex items-center justify-between">
                      <span>{pipeline.name}</span>
                      <span className="text-text-secondary normal-case tracking-normal font-semibold">
                        {pipeline.stages.reduce((sum, s) => sum + s.count, 0)} leads ativos
                      </span>
                    </h5>

                    {pipeline.stages.map((stage) => {
                      const percent = ((stage.count / maxLeads) * 100);

                      return (
                        <div key={stage.id} className="space-y-1">
                          <div className="flex justify-between text-xs font-semibold">
                            <span className="flex items-center gap-2 text-white">
                              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: stage.color }} />
                              {stage.name}
                            </span>
                            <span className="text-text-secondary">
                              {stage.count} {stage.count === 1 ? 'lead' : 'leads'} • <span className="text-accent-light font-bold">
                                {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(stage.value)}
                              </span>
                            </span>
                          </div>
                          <div className="h-1.5 w-full bg-glass-4 rounded-full overflow-hidden">
                            <div 
                              className="h-full rounded-full transition-all duration-500" 
                              style={{ 
                                width: `${percent}%`, 
                                backgroundColor: stage.color 
                              }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Painel 2: Origens de Leads com Fechamento */}
        <div className="bg-glass-1 border border-border-subtle rounded-xl p-6 shadow-xl flex flex-col justify-between">
          <div>
            <h4 className="text-sm font-bold font-display text-white uppercase tracking-wider mb-5 flex items-center gap-2">
              <Compass className="h-4 w-4 text-accent" />
              Fechamento por Origem
            </h4>
            <div className="space-y-4">
              {originClosingRanking.length === 0 ? (
                <p className="text-xs text-text-secondary py-4 text-center">Nenhuma origem mapeada.</p>
              ) : (
                originClosingRanking.map((item) => (
                  <div key={item.id} className="space-y-1.5">
                    <div className="flex justify-between text-xs font-semibold gap-2">
                      <span className="text-white truncate">{item.name}</span>
                      <span className="text-text-secondary whitespace-nowrap">
                        <span className="text-accent-light font-bold">{item.won}</span> de {item.total} • {item.rate.toFixed(1)}%
                      </span>
                    </div>
                    <div className="h-1.5 w-full bg-glass-4 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-accent rounded-full transition-all duration-500"
                        style={{ width: `${item.rate}%` }}
                      />
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
          <p className="text-[10px] text-text-secondary mt-4 pt-3 border-t border-border-subtle">
            Ganhos por origem sobre o total histórico de leads da origem.
          </p>
        </div>

      </div>

      {/* Relatório de Perdas (Adendo) */}
      <div className="bg-glass-1 border border-border-subtle rounded-xl p-6 shadow-xl">
        <h4 className="text-sm font-bold font-display text-white uppercase tracking-wider mb-5 flex items-center gap-2">
          <Frown className="h-4 w-4 text-danger" />
          Motivos de Perda (Oportunidades Perdidas)
        </h4>
        
        {totalLostLeads === 0 ? (
          <div className="py-6 text-center text-xs text-text-secondary">
            Nenhuma oportunidade foi marcada como perdida neste projeto até o momento.
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {lostReasonBreakdown.map((item) => {
                const percent = ((item.count / totalLostLeads) * 100).toFixed(0);
                return (
                  <div key={item.id} className="bg-glass-1 border border-border-subtle rounded-lg p-4 flex flex-col justify-between gap-2">
                    <div className="flex justify-between items-start gap-2">
                      <span className="text-xs font-bold text-white leading-tight">{item.reason}</span>
                      <span className="text-xs text-danger font-extrabold bg-danger/10 px-2 py-0.5 rounded-full border border-danger/20">
                        {item.count}
                      </span>
                    </div>
                    <div>
                      <div className="h-1 w-full bg-glass-4 rounded-full overflow-hidden">
                        <div className="h-full bg-danger rounded-full" style={{ width: `${percent}%` }} />
                      </div>
                      <div className="flex justify-between text-[10px] text-text-secondary mt-1">
                        <span>Relevância</span>
                        <span>{percent}% do total perdido</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="text-right text-[11px] text-text-secondary pt-2">
              Total de leads perdidos no projeto: <span className="text-white font-bold">{totalLostLeads}</span>
            </div>
          </div>
        )}
      </div>

    </div>
  );
}
