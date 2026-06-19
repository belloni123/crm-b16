'use server';

import { prisma } from '@/lib/prisma';
import { requireProjectAccess } from '@/lib/security';
import { revalidatePath as nextRevalidatePath } from 'next/cache';

function revalidatePath(path: string) {
  try {
    nextRevalidatePath(path);
  } catch (err) {
    // Ignore "static generation store missing" errors outside Next.js request context (e.g. during tsx tests)
  }
}
import crypto from 'crypto';
import { getPhoneVariants } from '@/lib/utils';
import bcrypt from 'bcryptjs';
import { sendPasswordResetEmail } from '@/lib/mail';
import { syncTaskToAllCalendars } from '@/lib/calendar';

// ==========================================
// FUNIS E ESTÁGIOS
// ==========================================

export async function getPipelines(projectId: string) {
  await requireProjectAccess(projectId);
  return prisma.pipeline.findMany({
    where: { projectId },
    include: {
      stages: {
        orderBy: { order: 'asc' },
      },
    },
  });
}

export async function createPipeline(projectId: string, name: string) {
  await requireProjectAccess(projectId, 'PROJECT_ADMIN');
  
  const pipeline = await prisma.pipeline.create({
    data: {
      name,
      projectId,
    },
  });

  // Cria estágios padrões no novo pipeline
  await prisma.stage.createMany({
    data: [
      { name: 'Sem Contato', order: 0, color: '#888888', pipelineId: pipeline.id },
      { name: 'Qualificação', order: 1, color: '#3b82f6', pipelineId: pipeline.id },
      { name: 'Fechado (Ganho)', order: 2, color: '#10b981', pipelineId: pipeline.id },
    ],
  });

  revalidatePath(`/project/${projectId}/settings`);
  return pipeline;
}

export async function updatePipeline(projectId: string, pipelineId: string, name: string) {
  await requireProjectAccess(projectId, 'PROJECT_ADMIN');
  
  const pipeline = await prisma.pipeline.update({
    where: { id: pipelineId, projectId },
    data: { name },
  });

  revalidatePath(`/project/${projectId}/settings`);
  revalidatePath(`/project/${projectId}/kanban`);
  return pipeline;
}

export async function deletePipeline(projectId: string, pipelineId: string) {
  await requireProjectAccess(projectId, 'PROJECT_ADMIN');

  // Impedir a deleção se for o único pipeline do projeto
  const count = await prisma.pipeline.count({
    where: { projectId },
  });

  if (count <= 1) {
    throw new Error('Não é possível excluir o único funil do projeto.');
  }

  const pipeline = await prisma.pipeline.delete({
    where: { id: pipelineId, projectId },
  });

  revalidatePath(`/project/${projectId}/settings`);
  revalidatePath(`/project/${projectId}/kanban`);
  return pipeline;
}

export async function createStage(projectId: string, pipelineId: string, data: { name: string; color: string; order: number }) {
  await requireProjectAccess(projectId, 'PROJECT_ADMIN');

  const stage = await prisma.stage.create({
    data: {
      name: data.name,
      color: data.color,
      order: data.order,
      pipelineId,
    },
  });

  revalidatePath(`/project/${projectId}`);
  revalidatePath(`/project/${projectId}/settings`);
  return stage;
}

export async function updateStage(projectId: string, stageId: string, data: { name: string; color: string; order: number }) {
  await requireProjectAccess(projectId, 'PROJECT_ADMIN');

  const stage = await prisma.stage.update({
    where: { id: stageId },
    data: {
      name: data.name,
      color: data.color,
      order: data.order,
    },
  });

  revalidatePath(`/project/${projectId}`);
  revalidatePath(`/project/${projectId}/settings`);
  return stage;
}

export async function deleteStage(projectId: string, stageId: string) {
  await requireProjectAccess(projectId, 'PROJECT_ADMIN');

  const stage = await prisma.stage.findUnique({
    where: { id: stageId },
    include: { pipeline: true },
  });

  if (!stage || stage.pipeline.projectId !== projectId) {
    throw new Error('Estágio não encontrado.');
  }

  await prisma.stage.delete({
    where: { id: stageId },
  });

  revalidatePath(`/project/${projectId}`);
  revalidatePath(`/project/${projectId}/settings`);
  return { success: true };
}

// ==========================================
// TAGS
// ==========================================

export async function getTags(projectId: string) {
  await requireProjectAccess(projectId);
  return prisma.tag.findMany({
    where: { projectId },
    orderBy: { name: 'asc' },
  });
}

export async function createTag(projectId: string, data: { name: string; color: string }) {
  await requireProjectAccess(projectId);

  const tag = await prisma.tag.create({
    data: {
      name: data.name,
      color: data.color,
      projectId,
    },
  });

  revalidatePath(`/project/${projectId}/settings`);
  return tag;
}

export async function updateTag(projectId: string, tagId: string, data: { name: string; color: string }) {
  await requireProjectAccess(projectId);

  const tag = await prisma.tag.update({
    where: { id: tagId },
    data: {
      name: data.name,
      color: data.color,
    },
  });

  revalidatePath(`/project/${projectId}/settings`);
  return tag;
}

export async function deleteTag(projectId: string, tagId: string) {
  await requireProjectAccess(projectId);

  const tag = await prisma.tag.findUnique({ where: { id: tagId } });
  if (!tag || tag.projectId !== projectId) {
    throw new Error('Tag não encontrada.');
  }

  await prisma.tag.delete({
    where: { id: tagId },
  });

  revalidatePath(`/project/${projectId}/settings`);
  return { success: true };
}

// ==========================================
// ORIGENS (ORIGINS)
// ==========================================

export async function getOrigins(projectId: string) {
  await requireProjectAccess(projectId);
  return prisma.origin.findMany({
    where: { projectId },
    orderBy: { name: 'asc' },
  });
}

export async function createOrigin(projectId: string, name: string) {
  await requireProjectAccess(projectId, 'PROJECT_ADMIN');
  const origin = await prisma.origin.create({
    data: { name, projectId },
  });
  revalidatePath(`/project/${projectId}/settings`);
  return origin;
}

export async function updateOrigin(projectId: string, originId: string, name: string) {
  await requireProjectAccess(projectId, 'PROJECT_ADMIN');
  const origin = await prisma.origin.update({
    where: { id: originId },
    data: { name },
  });
  revalidatePath(`/project/${projectId}/settings`);
  return origin;
}

export async function deleteOrigin(projectId: string, originId: string) {
  await requireProjectAccess(projectId, 'PROJECT_ADMIN');

  const origin = await prisma.origin.findUnique({ where: { id: originId } });
  if (!origin || origin.projectId !== projectId) {
    throw new Error('Origem não encontrada.');
  }

  await prisma.origin.delete({
    where: { id: originId },
  });
  revalidatePath(`/project/${projectId}/settings`);
  return { success: true };
}

// ==========================================
// MOTIVOS DE PERDA (LOST STATUS)
// ==========================================

export async function getLostStatuses(projectId: string) {
  await requireProjectAccess(projectId);
  return prisma.lostStatus.findMany({
    where: { projectId },
    orderBy: { reason: 'asc' },
  });
}

export async function createLostStatus(projectId: string, reason: string) {
  await requireProjectAccess(projectId, 'PROJECT_ADMIN');
  const lostStatus = await prisma.lostStatus.create({
    data: { reason, projectId },
  });
  revalidatePath(`/project/${projectId}/settings`);
  return lostStatus;
}

export async function updateLostStatus(projectId: string, lostStatusId: string, reason: string) {
  await requireProjectAccess(projectId, 'PROJECT_ADMIN');
  const lostStatus = await prisma.lostStatus.update({
    where: { id: lostStatusId },
    data: { reason },
  });
  revalidatePath(`/project/${projectId}/settings`);
  return lostStatus;
}

export async function deleteLostStatus(projectId: string, lostStatusId: string) {
  await requireProjectAccess(projectId, 'PROJECT_ADMIN');

  const lostStatus = await prisma.lostStatus.findUnique({ where: { id: lostStatusId } });
  if (!lostStatus || lostStatus.projectId !== projectId) {
    throw new Error('Motivo de perda não encontrado.');
  }

  await prisma.lostStatus.delete({
    where: { id: lostStatusId },
  });
  revalidatePath(`/project/${projectId}/settings`);
  return { success: true };
}

// ==========================================
// CAMPOS PERSONALIZADOS (CUSTOM FIELDS)
// ==========================================

export async function getCustomFieldDefinitions(projectId: string) {
  await requireProjectAccess(projectId);
  return prisma.customFieldDefinition.findMany({
    where: { projectId },
    orderBy: { name: 'asc' },
  });
}

export async function createCustomFieldDefinition(
  projectId: string,
  data: { name: string; type: 'TEXT' | 'NUMBER' | 'SELECT'; options?: string }
) {
  await requireProjectAccess(projectId, 'PROJECT_ADMIN');
  const definition = await prisma.customFieldDefinition.create({
    data: {
      name: data.name,
      type: data.type,
      options: data.options || null,
      projectId,
      entityType: 'LEAD',
    },
  });
  revalidatePath(`/project/${projectId}/settings`);
  return definition;
}

export async function deleteCustomFieldDefinition(projectId: string, definitionId: string) {
  await requireProjectAccess(projectId, 'PROJECT_ADMIN');

  const def = await prisma.customFieldDefinition.findUnique({ where: { id: definitionId } });
  if (!def || def.projectId !== projectId) {
    throw new Error('Campo personalizado não encontrado.');
  }

  await prisma.customFieldDefinition.delete({
    where: { id: definitionId },
  });
  revalidatePath(`/project/${projectId}/settings`);
  return { success: true };
}

// Obter valores de campos customizados para um Lead específico
export async function getLeadCustomFields(projectId: string, leadId: string) {
  await requireProjectAccess(projectId);

  const lead = await prisma.lead.findUnique({ where: { id: leadId } });
  if (!lead || lead.projectId !== projectId) {
    throw new Error('Lead não encontrado.');
  }

  // Busca todas as definições do projeto
  const definitions = await prisma.customFieldDefinition.findMany({
    where: { projectId },
    orderBy: { name: 'asc' },
  });

  // Busca os valores salvos para o lead
  const values = await prisma.customFieldValue.findMany({
    where: { leadId },
  });

  // Mapeia definições com seus respectivos valores (se existirem)
  return definitions.map((def) => {
    const savedVal = values.find((val) => val.fieldDefinitionId === def.id);
    return {
      ...def,
      valueId: savedVal?.id || null,
      value: savedVal?.value || '',
    };
  });
}

// Atualizar valores dos campos customizados de um Lead
export async function updateLeadCustomFieldValues(
  projectId: string,
  leadId: string,
  fields: Record<string, string> // Dicionário: { [fieldDefinitionId]: valor_como_string }
) {
  await requireProjectAccess(projectId);

  const lead = await prisma.lead.findUnique({ where: { id: leadId } });
  if (!lead || lead.projectId !== projectId) {
    throw new Error('Lead não encontrado.');
  }

  const promises = Object.entries(fields).map(async ([fieldDefinitionId, value]) => {
    // Busca se já existe um valor
    const existingValue = await prisma.customFieldValue.findFirst({
      where: { leadId, fieldDefinitionId },
    });

    if (existingValue) {
      if (value === '') {
        // Se vazio, remove o registro para poupar espaço
        return prisma.customFieldValue.delete({ where: { id: existingValue.id } });
      }
      return prisma.customFieldValue.update({
        where: { id: existingValue.id },
        data: { value },
      });
    } else if (value !== '') {
      return prisma.customFieldValue.create({
        data: {
          leadId,
          fieldDefinitionId,
          value,
        },
      });
    }
  });

  await Promise.all(promises);
  revalidatePath(`/project/${projectId}`);
  return { success: true };
}

// ==========================================
// LEADS (OPORTUNIDADES)
// ==========================================

export async function getLeads(
  projectId: string,
  filters?: { search?: string; tagId?: string; priority?: string; status?: string; originId?: string; pipelineId?: string }
) {
  await requireProjectAccess(projectId);

  const where: any = { projectId };

  const statusFilter = filters?.status || 'ACTIVE';
  where.pipelineEntries = {
    some: { status: statusFilter }
  };

  if (filters?.pipelineId) {
    where.pipelineEntries.some.pipelineId = filters.pipelineId;
  }

  if (filters?.priority) {
    where.priority = filters.priority;
  }

  if (filters?.originId) {
    where.originId = filters.originId;
  }

  if (filters?.tagId) {
    where.tags = {
      some: { id: filters.tagId },
    };
  }

  if (filters?.search) {
    where.OR = [
      { name: { contains: filters.search } },
      { email: { contains: filters.search } },
      { phone: { contains: filters.search } },
      { company: { contains: filters.search } },
    ];
  }

  return prisma.lead.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    include: {
      tags: true,
      origin: true,
      assignedUser: {
        select: { id: true, name: true, email: true }
      },
      pipelineEntries: {
        include: {
          pipeline: true,
          stage: true,
          lostStatus: true
        }
      },
      tasks: {
        where: { status: 'PENDING' },
      },
    },
  });
}

export async function getLeadById(projectId: string, leadId: string) {
  await requireProjectAccess(projectId);

  return prisma.lead.findFirst({
    where: { id: leadId, projectId },
    include: {
      tags: true,
      origin: true,
      assignedUser: {
        select: { id: true, name: true, email: true }
      },
      pipelineEntries: {
        include: {
          pipeline: true,
          stage: true,
          lostStatus: true
        }
      },
      tasks: {
        orderBy: { createdAt: 'desc' },
      },
      customFieldValues: {
        include: {
          definition: true,
        },
      },
      activities: {
        orderBy: { createdAt: 'desc' },
        include: {
          user: {
            select: { name: true, email: true },
          },
        },
      },
      conversations: {
        include: {
          messages: {
            orderBy: { createdAt: 'desc' },
            take: 1,
          },
        },
      },
    },
  });
}

async function getNextAssignedCommercial(projectId: string): Promise<string | null> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { lastAssignedCommercialId: true }
  });

  const memberships = await prisma.membership.findMany({
    where: { projectId, isDesignatedCommercial: true },
    select: { userId: true },
    orderBy: { userId: 'asc' }
  });

  if (memberships.length === 0) {
    return null;
  }

  if (memberships.length === 1) {
    return memberships[0].userId;
  }

  const commercialA = memberships[0].userId;
  const commercialB = memberships[1].userId;
  
  let nextCommercialId = commercialA;
  if (project?.lastAssignedCommercialId === commercialA) {
    nextCommercialId = commercialB;
  } else {
    nextCommercialId = commercialA;
  }

  await prisma.project.update({
    where: { id: projectId },
    data: { lastAssignedCommercialId: nextCommercialId }
  });

  return nextCommercialId;
}

export async function createLead(
  projectId: string,
  data: {
    name: string;
    email?: string;
    phone?: string;
    company?: string;
    value?: number;
    priority?: 'BAIXA' | 'MEDIA' | 'ALTA';
    stageId: string;
    originId?: string;
    tags?: string[];
  }
) {
  const { user } = await requireProjectAccess(projectId);

  const stage = await prisma.stage.findUnique({
    where: { id: data.stageId },
    include: { pipeline: true }
  });

  if (!stage) {
    throw new Error('Estágio inválido.');
  }

  const pipelineId = stage.pipelineId;
  const normalizedEmail = data.email?.trim().toLowerCase() || null;
  let normalizedPhone = data.phone || null;
  if (normalizedPhone) {
    normalizedPhone = normalizedPhone.replace(/\D/g, '');
  }

  let lead = null;
  let isNew = false;

  if (normalizedEmail || normalizedPhone) {
    const conditions: any[] = [];
    if (normalizedEmail) conditions.push({ email: normalizedEmail });
    if (normalizedPhone) {
      const variants = getPhoneVariants(normalizedPhone);
      variants.forEach(v => {
        conditions.push({ phone: v });
      });
    }

    lead = await prisma.lead.findFirst({
      where: {
        projectId,
        OR: conditions
      }
    });
  }

  if (lead) {
    const updateData: any = {};
    if (!lead.email && normalizedEmail) updateData.email = normalizedEmail;
    if (!lead.phone && normalizedPhone) updateData.phone = normalizedPhone;
    if (!lead.company && data.company?.trim()) updateData.company = data.company.trim();
    if (data.originId && !lead.originId) updateData.originId = data.originId;
    if (data.priority && lead.priority === 'MEDIA' && data.priority !== 'MEDIA') {
      updateData.priority = data.priority;
    }

    if (data.tags && data.tags.length > 0) {
      updateData.tags = {
        connect: data.tags.map(id => ({ id }))
      };
    }

    lead = await prisma.lead.update({
      where: { id: lead.id },
      data: updateData
    });
  } else {
    const assignedUserId = await getNextAssignedCommercial(projectId);
    isNew = true;

    lead = await prisma.lead.create({
      data: {
        name: data.name.trim(),
        email: normalizedEmail,
        phone: normalizedPhone,
        company: data.company?.trim() || null,
        priority: data.priority || 'MEDIA',
        projectId,
        originId: data.originId || null,
        assignedUserId,
        tags: data.tags && data.tags.length > 0 ? {
          connect: data.tags.map(id => ({ id }))
        } : undefined
      }
    });
  }

  const existingEntry = await prisma.pipelineEntry.findUnique({
    where: {
      leadId_pipelineId: {
        leadId: lead.id,
        pipelineId
      }
    }
  });

  const origin = data.originId 
    ? await prisma.origin.findUnique({ where: { id: data.originId } })
    : null;

  if (!existingEntry) {
    await prisma.pipelineEntry.create({
      data: {
        leadId: lead.id,
        pipelineId,
        stageId: data.stageId,
        value: data.value || 0.0,
        status: 'ACTIVE'
      }
    });

    const content = isNew
      ? `Lead cadastrado pela primeira vez ${origin ? `via ${origin.name}` : ''} no estágio "${stage.name}" do funil "${stage.pipeline.name}".`
      : `Lead re-cadastrado ${origin ? `via ${origin.name}` : ''} no estágio "${stage.name}" do funil "${stage.pipeline.name}".`;

    await prisma.activity.create({
      data: {
        leadId: lead.id,
        userId: user.id,
        type: 'LOG',
        content
      }
    });
  } else {
    await prisma.pipelineEntry.update({
      where: {
        leadId_pipelineId: {
          leadId: lead.id,
          pipelineId
        }
      },
      data: {
        stageId: data.stageId,
        value: data.value !== undefined ? data.value : existingEntry.value,
        status: 'ACTIVE',
        lostStatusId: null
      }
    });

    await prisma.activity.create({
      data: {
        leadId: lead.id,
        userId: user.id,
        type: 'STATUS_CHANGE',
        content: `Lead movimentado no funil "${stage.pipeline.name}" para o estágio "${stage.name}" via novo cadastro.`
      }
    });
  }

  revalidatePath(`/project/${projectId}`);
  revalidatePath(`/project/${projectId}/leads`);
  return lead;
}

export async function updateLead(
  projectId: string,
  leadId: string,
  data: {
    name?: string;
    email?: string;
    phone?: string;
    company?: string;
    value?: number;
    priority?: 'BAIXA' | 'MEDIA' | 'ALTA';
    stageId?: string;
    status?: 'ACTIVE' | 'ARCHIVED' | 'LOST';
    lostStatusId?: string | null;
    originId?: string | null;
    tags?: string[];
    pipelineId?: string;
    assignedUserId?: string | null;
  }
) {
  const { user } = await requireProjectAccess(projectId);

  const originalLead = await prisma.lead.findUnique({
    where: { id: leadId },
  });

  if (!originalLead || originalLead.projectId !== projectId) {
    throw new Error('Lead não encontrado.');
  }

  const updateData: any = {};
  if (data.name !== undefined) updateData.name = data.name;
  if (data.email !== undefined) updateData.email = data.email || null;
  if (data.company !== undefined) updateData.company = data.company || null;
  if (data.priority !== undefined) updateData.priority = data.priority;
  if (data.originId !== undefined) updateData.originId = data.originId;
  if (data.assignedUserId !== undefined) updateData.assignedUserId = data.assignedUserId;

  if (data.phone !== undefined) {
    let normalizedPhone = data.phone || null;
    if (normalizedPhone) {
      normalizedPhone = normalizedPhone.replace(/\D/g, '');
    }
    updateData.phone = normalizedPhone;
  }

  if (data.tags !== undefined) {
    updateData.tags = {
      set: data.tags.map((id) => ({ id })),
    };
  }

  const updatedLead = await prisma.lead.update({
    where: { id: leadId },
    data: updateData,
  });

  let targetPipelineId = data.pipelineId;
  if (!targetPipelineId && data.stageId) {
    const stage = await prisma.stage.findUnique({ where: { id: data.stageId } });
    if (stage) targetPipelineId = stage.pipelineId;
  }

  if (targetPipelineId) {
    const existingEntry = await prisma.pipelineEntry.findUnique({
      where: {
        leadId_pipelineId: {
          leadId,
          pipelineId: targetPipelineId
        }
      }
    });

    const entryUpdateData: any = {};
    if (data.stageId !== undefined) entryUpdateData.stageId = data.stageId;
    if (data.value !== undefined) entryUpdateData.value = data.value;
    if (data.status !== undefined) entryUpdateData.status = data.status;
    if (data.lostStatusId !== undefined) entryUpdateData.lostStatusId = data.lostStatusId;

    if (existingEntry) {
      const updatedEntry = await prisma.pipelineEntry.update({
        where: {
          leadId_pipelineId: {
            leadId,
            pipelineId: targetPipelineId
          }
        },
        data: entryUpdateData,
        include: { pipeline: true }
      });

      if (data.stageId && data.stageId !== existingEntry.stageId) {
        const stage = await prisma.stage.findUnique({ where: { id: data.stageId } });
        await prisma.activity.create({
          data: {
            leadId,
            userId: user.id,
            type: 'STATUS_CHANGE',
            content: `Movido para o estágio "${stage?.name || 'Desconhecido'}" no funil "${updatedEntry.pipeline.name}".`,
          },
        });
      }

      if (data.status === 'LOST' && existingEntry.status !== 'LOST') {
        let reasonText = 'Motivo não especificado';
        if (data.lostStatusId) {
          const lostReason = await prisma.lostStatus.findUnique({ where: { id: data.lostStatusId } });
          if (lostReason) reasonText = lostReason.reason;
        }
        await prisma.activity.create({
          data: {
            leadId,
            userId: user.id,
            type: 'STATUS_CHANGE',
            content: `Marcado como perdido no funil "${updatedEntry.pipeline.name}". Motivo: "${reasonText}".`,
          },
        });
      }
    } else {
      if (data.stageId) {
        const createdEntry = await prisma.pipelineEntry.create({
          data: {
            leadId,
            pipelineId: targetPipelineId,
            stageId: data.stageId,
            value: data.value || 0.0,
            status: data.status || 'ACTIVE',
            lostStatusId: data.lostStatusId
          },
          include: { pipeline: true }
        });

        const stage = await prisma.stage.findUnique({ where: { id: data.stageId } });
        await prisma.activity.create({
          data: {
            leadId,
            userId: user.id,
            type: 'LOG',
            content: `Adicionado ao funil "${createdEntry.pipeline.name}" no estágio "${stage?.name}".`,
          },
        });
      }
    }
  }

  revalidatePath(`/project/${projectId}`);
  revalidatePath(`/project/${projectId}/leads`);
  return updatedLead;
}

export async function moveLead(projectId: string, leadId: string, pipelineId: string, targetStageId: string) {
  const { user } = await requireProjectAccess(projectId);

  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
  });

  if (!lead || lead.projectId !== projectId) {
    throw new Error('Lead não encontrado.');
  }

  const targetStage = await prisma.stage.findUnique({
    where: { id: targetStageId },
    include: { pipeline: true }
  });

  if (!targetStage) throw new Error('Estágio de destino inválido.');

  const existingEntry = await prisma.pipelineEntry.findUnique({
    where: {
      leadId_pipelineId: {
        leadId,
        pipelineId
      }
    },
    include: { stage: true }
  });

  if (!existingEntry) {
    throw new Error('Participação no funil não encontrada.');
  }

  if (existingEntry.stageId === targetStageId) return lead;

  await prisma.pipelineEntry.update({
    where: {
      leadId_pipelineId: {
        leadId,
        pipelineId
      }
    },
    data: { stageId: targetStageId }
  });

  await prisma.activity.create({
    data: {
      leadId,
      userId: user.id,
      type: 'STATUS_CHANGE',
      content: `Movido de "${existingEntry.stage.name}" para "${targetStage.name}" no funil "${targetStage.pipeline.name}" via painel Kanban.`,
    },
  });

  revalidatePath(`/project/${projectId}`);
  return lead;
}

export async function deleteLead(projectId: string, leadId: string) {
  const { user } = await requireProjectAccess(projectId, 'PROJECT_ADMIN');

  await prisma.pipelineEntry.updateMany({
    where: { leadId },
    data: { status: 'ARCHIVED' }
  });

  await prisma.activity.create({
    data: {
      leadId,
      userId: user.id,
      type: 'STATUS_CHANGE',
      content: `Lead arquivado (soft-delete) de todos os funis por ${user.name || user.email}.`,
    },
  });

  revalidatePath(`/project/${projectId}`);
  revalidatePath(`/project/${projectId}/leads`);
  return { success: true };
}

// ==========================================
// TAREFAS
// ==========================================

export async function getTasks(projectId: string, leadId?: string) {
  await requireProjectAccess(projectId);

  const where: any = { projectId };
  if (leadId) where.leadId = leadId;

  return prisma.task.findMany({
    where,
    orderBy: { dueDate: 'asc' },
    include: {
      lead: {
        select: { id: true, name: true, company: true },
      },
    },
  });
}

export async function createTask(
  projectId: string,
  data: {
    title: string;
    description?: string;
    dueDate?: string;
    leadId?: string;
    status?: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED';
    userId?: string;
  }
) {
  const { user } = await requireProjectAccess(projectId);
  const assigneeId = data.userId || user.id;

  const task = await prisma.task.create({
    data: {
      title: data.title,
      description: data.description || null,
      dueDate: data.dueDate ? new Date(data.dueDate) : null,
      status: data.status || 'PENDING',
      leadId: data.leadId || null,
      projectId,
      userId: assigneeId,
    },
  });

  if (data.leadId) {
    await prisma.activity.create({
      data: {
        leadId: data.leadId,
        userId: user.id,
        type: 'LOG',
        content: `Tarefa criada: "${data.title}".`,
      },
    });
  }

  // Sincroniza com a agenda
  if (task.dueDate && task.userId) {
    await syncTaskToAllCalendars(task.userId, task, 'CREATE');
  }

  revalidatePath(`/project/${projectId}`);
  revalidatePath(`/project/${projectId}/tasks`);
  return task;
}

export async function updateTask(
  projectId: string,
  taskId: string,
  data: {
    title?: string;
    description?: string;
    dueDate?: string | null;
    status?: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED';
    userId?: string;
  }
) {
  const { user } = await requireProjectAccess(projectId);

  const originalTask = await prisma.task.findUnique({
    where: { id: taskId },
  });

  if (!originalTask || originalTask.projectId !== projectId) {
    throw new Error('Tarefa não encontrada.');
  }

  const updateData: any = {};
  if (data.title !== undefined) updateData.title = data.title;
  if (data.description !== undefined) updateData.description = data.description;
  if (data.status !== undefined) updateData.status = data.status;
  if (data.userId !== undefined) updateData.userId = data.userId;
  if (data.dueDate !== undefined) {
    updateData.dueDate = data.dueDate ? new Date(data.dueDate) : null;
  }

  const task = await prisma.task.update({
    where: { id: taskId },
    data: updateData,
  });

  if (data.status === 'COMPLETED' && originalTask.status !== 'COMPLETED' && task.leadId) {
    await prisma.activity.create({
      data: {
        leadId: task.leadId,
        userId: user.id,
        type: 'LOG',
        content: `Tarefa concluída: "${task.title}".`,
      },
    });
  }

  // Sincroniza com a agenda
  if (originalTask.userId && originalTask.userId !== task.userId) {
    // Apaga na agenda do antigo responsável
    await syncTaskToAllCalendars(originalTask.userId, originalTask, 'DELETE');
    // Cria na agenda do novo responsável
    const resetTask = await prisma.task.update({
      where: { id: taskId },
      data: { googleEventId: null, microsoftEventId: null },
    });
    if (resetTask.userId) {
      await syncTaskToAllCalendars(resetTask.userId, resetTask, 'CREATE');
    }
  } else if (task.userId) {
    await syncTaskToAllCalendars(task.userId, task, 'UPDATE');
  }

  revalidatePath(`/project/${projectId}`);
  revalidatePath(`/project/${projectId}/tasks`);
  return task;
}

export async function deleteTask(projectId: string, taskId: string) {
  await requireProjectAccess(projectId);

  const task = await prisma.task.findUnique({ where: { id: taskId } });
  if (!task || task.projectId !== projectId) {
    throw new Error('Tarefa não encontrada.');
  }

  // Sincroniza exclusão na agenda do responsável
  if (task.userId) {
    await syncTaskToAllCalendars(task.userId, task, 'DELETE');
  }

  await prisma.task.delete({
    where: { id: taskId },
  });

  revalidatePath(`/project/${projectId}`);
  revalidatePath(`/project/${projectId}/tasks`);
  return { success: true };
}

// ==========================================
// ATIVIDADES (HISTÓRICO / COMENTÁRIOS DO LEAD)
// ==========================================

export async function createActivityComment(projectId: string, leadId: string, content: string) {
  const { user } = await requireProjectAccess(projectId);

  const comment = await prisma.activity.create({
    data: {
      leadId,
      userId: user.id,
      type: 'COMMENT',
      content,
    },
  });

  revalidatePath(`/project/${projectId}`);
  return comment;
}

export async function deleteActivity(projectId: string, activityId: string) {
  const { user } = await requireProjectAccess(projectId);

  const activity = await prisma.activity.findUnique({
    where: { id: activityId },
    include: { lead: true },
  });
  if (!activity || activity.lead.projectId !== projectId) {
    throw new Error('Atividade não encontrada.');
  }

  if (activity.userId !== user.id && user.role !== 'SUPERADMIN') {
    throw new Error('Acesso negado.');
  }

  await prisma.activity.delete({
    where: { id: activityId },
  });

  return { success: true };
}

// ==========================================
// CONFIGURAÇÕES DE WEBHOOKS DE ENTRADA
// ==========================================

export async function getWebhookEndpoints(projectId: string) {
  await requireProjectAccess(projectId, 'PROJECT_ADMIN');
  return prisma.webhookEndpoint.findMany({
    where: { projectId },
    orderBy: { createdAt: 'desc' },
    include: {
      origin: true,
    },
  });
}

export async function createWebhookEndpoint(
  projectId: string,
  data: {
    name: string;
    targetStageId: string;
    originId?: string; // Vincula a uma origem (adendo)
    fieldMapping: string;
  }
) {
  await requireProjectAccess(projectId, 'PROJECT_ADMIN');

  const token = crypto.randomBytes(32).toString('hex');

  const endpoint = await prisma.webhookEndpoint.create({
    data: {
      name: data.name,
      token,
      targetStageId: data.targetStageId,
      originId: data.originId || null,
      projectId,
      fieldMapping: data.fieldMapping,
    },
  });

  revalidatePath(`/project/${projectId}/settings`);
  return endpoint;
}

export async function deleteWebhookEndpoint(projectId: string, webhookId: string) {
  await requireProjectAccess(projectId, 'PROJECT_ADMIN');

  const webhook = await prisma.webhookEndpoint.findUnique({ where: { id: webhookId } });
  if (!webhook || webhook.projectId !== projectId) {
    throw new Error('Webhook não encontrado.');
  }

  await prisma.webhookEndpoint.delete({
    where: { id: webhookId },
  });

  revalidatePath(`/project/${projectId}/settings`);
  return { success: true };
}

export async function getWebhookLogs(projectId: string) {
  await requireProjectAccess(projectId, 'PROJECT_ADMIN');

  return prisma.webhookLog.findMany({
    where: {
      webhook: { projectId },
    },
    orderBy: { createdAt: 'desc' },
    take: 100,
    include: {
      webhook: {
        select: { name: true },
      },
    },
  });
}

// ==========================================
// OPERAÇÕES EM LOTE (BATCH OPERATIONS)
// ==========================================

export async function exportLeadsToCSVAction(
  projectId: string,
  filters?: { search?: string; tagId?: string; priority?: string; status?: string; originId?: string; pipelineId?: string }
) {
  await requireProjectAccess(projectId);

  const where: any = { projectId };

  const statusFilter = filters?.status || 'ACTIVE';
  where.pipelineEntries = {
    some: { status: statusFilter }
  };

  if (filters?.pipelineId) {
    where.pipelineEntries.some.pipelineId = filters.pipelineId;
  }

  if (filters?.priority) {
    where.priority = filters.priority;
  }

  if (filters?.originId) {
    where.originId = filters.originId;
  }

  if (filters?.tagId) {
    where.tags = {
      some: { id: filters.tagId },
    };
  }

  if (filters?.search) {
    where.OR = [
      { name: { contains: filters.search } },
      { email: { contains: filters.search } },
      { phone: { contains: filters.search } },
      { company: { contains: filters.search } },
    ];
  }

  const leads = await prisma.lead.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    include: {
      origin: true,
      tags: true,
      assignedUser: true,
      pipelineEntries: {
        where: filters?.pipelineId ? { pipelineId: filters.pipelineId } : undefined,
        include: {
          pipeline: true,
          stage: true
        }
      },
      customFieldValues: {
        include: {
          definition: true,
        },
      },
    },
  });

  const customDefs = await prisma.customFieldDefinition.findMany({
    where: { projectId },
    orderBy: { name: 'asc' },
  });

  const escapeCSV = (str: string | null | undefined) => {
    if (!str) return '';
    const clean = String(str).replace(/"/g, '""');
    if (clean.includes(';') || clean.includes('\n') || clean.includes('"')) {
      return `"${clean}"`;
    }
    return clean;
  };

  let csvContent = 'sep=;\n';
  const headers = [
    'Nome',
    'Empresa',
    'Email',
    'Telefone',
    'Comercial Responsavel',
    'Prioridade',
    'Funis e Estagios',
    'Valor Total',
    'Origem',
    'Data de Criacao',
  ];

  customDefs.forEach((def) => {
    headers.push(def.name);
  });

  csvContent += headers.map(h => escapeCSV(h)).join(';') + '\n';

  leads.forEach((lead) => {
    const funnelsText = lead.pipelineEntries
      .map(entry => `${entry.pipeline.name}: ${entry.stage.name} (${entry.status})`)
      .join(' | ');

    const totalValue = lead.pipelineEntries.reduce((sum, entry) => sum + entry.value, 0);

    const row = [
      escapeCSV(lead.name),
      escapeCSV(lead.company),
      escapeCSV(lead.email),
      escapeCSV(lead.phone),
      escapeCSV(lead.assignedUser?.name || lead.assignedUser?.email || ''),
      lead.priority,
      escapeCSV(funnelsText),
      totalValue.toString(),
      escapeCSV(lead.origin?.name),
      lead.createdAt.toISOString(),
    ];

    customDefs.forEach((def) => {
      const valObj = lead.customFieldValues.find(v => v.fieldDefinitionId === def.id);
      row.push(escapeCSV(valObj?.value));
    });

    csvContent += row.join(';') + '\n';
  });

  return csvContent;
}

export async function importLeadsAction(
  projectId: string,
  rows: Array<{
    name: string;
    email?: string;
    phone?: string;
    company?: string;
    value?: string;
    customFields?: Record<string, string>;
  }>,
  originId?: string | null,
  pipelineId?: string | null,
  stageId?: string | null
) {
  const { user } = await requireProjectAccess(projectId);

  let targetPipelineId = pipelineId;
  let targetStageId = stageId;

  if (!targetPipelineId || !targetStageId) {
    const pipeline = await prisma.pipeline.findFirst({
      where: { projectId },
      include: {
        stages: {
          orderBy: { order: 'asc' },
          take: 1,
        },
      },
    });

    targetPipelineId = pipeline?.id || null;
    targetStageId = pipeline?.stages[0]?.id || null;
  }

  if (!targetPipelineId || !targetStageId) {
    throw new Error('Nenhum estágio de pipeline configurado neste projeto.');
  }

  const targetPipeline = await prisma.pipeline.findUnique({
    where: { id: targetPipelineId },
    include: { stages: true }
  });
  const targetStage = targetPipeline?.stages.find(s => s.id === targetStageId);

  if (!targetPipeline || !targetStage) {
    throw new Error('Funil ou estágio de destino inválido.');
  }

  let successCount = 0;
  let failureCount = 0;
  const errors: Array<{ line: number; error: string }> = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const lineNumber = i + 1;

    try {
      if (!row.name || !row.name.trim()) {
        throw new Error('Nome do lead está em branco.');
      }

      let val = 0.0;
      if (row.value) {
        const cleanVal = String(row.value).replace(/[^\d.,]/g, '').replace(',', '.');
        const parsed = parseFloat(cleanVal);
        if (!isNaN(parsed)) {
          val = parsed;
        }
      }

      const email = row.email?.trim().toLowerCase() || null;
      if (email && !email.includes('@')) {
        throw new Error(`E-mail inválido: "${row.email}"`);
      }

      const phone = row.phone ? String(row.phone).replace(/\D/g, '') : null;

      let lead = null;
      let isNew = false;

      if (email || phone) {
        const conditions: any[] = [];
        if (email) conditions.push({ email });
        if (phone) {
          const variants = getPhoneVariants(phone);
          variants.forEach(v => {
            conditions.push({ phone: v });
          });
        }

        lead = await prisma.lead.findFirst({
          where: {
            projectId,
            OR: conditions
          }
        });
      }

      if (lead) {
        const updateData: any = {};
        if (!lead.email && email) updateData.email = email;
        if (!lead.phone && phone) updateData.phone = phone;
        if (!lead.company && row.company?.trim()) updateData.company = row.company.trim();
        if (originId && !lead.originId) updateData.originId = originId;

        lead = await prisma.lead.update({
          where: { id: lead.id },
          data: updateData
        });
      } else {
        const assignedUserId = await getNextAssignedCommercial(projectId);
        isNew = true;

        lead = await prisma.lead.create({
          data: {
            name: row.name.trim(),
            email,
            phone,
            company: row.company?.trim() || null,
            priority: 'MEDIA',
            projectId,
            originId: originId || null,
            assignedUserId
          }
        });
      }

      const existingEntry = await prisma.pipelineEntry.findUnique({
        where: {
          leadId_pipelineId: {
            leadId: lead.id,
            pipelineId: targetPipelineId
          }
        }
      });

      const origin = originId 
        ? await prisma.origin.findUnique({ where: { id: originId } })
        : null;

      if (!existingEntry) {
        await prisma.pipelineEntry.create({
          data: {
            leadId: lead.id,
            pipelineId: targetPipelineId,
            stageId: targetStageId,
            value: val,
            status: 'ACTIVE'
          }
        });

        const content = isNew
          ? `Lead importado via arquivo CSV por ${user.name || user.email} no estágio "${targetStage.name}" do funil "${targetPipeline.name}".`
          : `Lead re-cadastrado via importação CSV por ${user.name || user.email} no estágio "${targetStage.name}" do funil "${targetPipeline.name}".`;

        await prisma.activity.create({
          data: {
            leadId: lead.id,
            userId: user.id,
            type: 'LOG',
            content
          }
        });
      } else {
        await prisma.pipelineEntry.update({
          where: {
            leadId_pipelineId: {
              leadId: lead.id,
              pipelineId: targetPipelineId
            }
          },
          data: {
            stageId: targetStageId,
            value: val || existingEntry.value,
            status: 'ACTIVE',
            lostStatusId: null
          }
        });

        await prisma.activity.create({
          data: {
            leadId: lead.id,
            userId: user.id,
            type: 'LOG',
            content: `Lead atualizado via importação CSV por ${user.name || user.email} no funil "${targetPipeline.name}".`
          }
        });
      }

      if (row.customFields) {
        const customFieldPromises = Object.entries(row.customFields).map(async ([definitionId, value]) => {
          if (value && value.trim()) {
            const existingVal = await prisma.customFieldValue.findFirst({
              where: { leadId: lead.id, fieldDefinitionId: definitionId }
            });

            if (!existingVal) {
              return prisma.customFieldValue.create({
                data: {
                  leadId: lead.id,
                  fieldDefinitionId: definitionId,
                  value: value.trim(),
                },
              });
            } else {
              if (!existingVal.value || !existingVal.value.trim()) {
                return prisma.customFieldValue.update({
                  where: { id: existingVal.id },
                  data: { value: value.trim() }
                });
              }
            }
          }
        });
        await Promise.all(customFieldPromises);
      }

      successCount++;
    } catch (err: any) {
      failureCount++;
      errors.push({
        line: lineNumber,
        error: err.message || 'Erro desconhecido ao processar linha.',
      });
    }
  }

  revalidatePath(`/project/${projectId}`);
  revalidatePath(`/project/${projectId}/leads`);

  return {
    successCount,
    failureCount,
    errors,
  };
}

export async function batchDeleteLeadsAction(projectId: string, leadIds: string[]) {
  const { user } = await requireProjectAccess(projectId, 'PROJECT_ADMIN');

  const promises = leadIds.map(async (leadId) => {
    const lead = await prisma.lead.findUnique({ where: { id: leadId } });
    if (!lead || lead.projectId !== projectId) {
      throw new Error('Acesso negado: Lead não pertence a este projeto.');
    }

    await prisma.pipelineEntry.updateMany({
      where: { leadId },
      data: { status: 'ARCHIVED' }
    });

    return prisma.activity.create({
      data: {
        leadId,
        userId: user.id,
        type: 'STATUS_CHANGE',
        content: `Lead arquivado (soft-delete) de todos os funis via exclusão em lote por ${user.name || user.email}.`,
      },
    });
  });

  await Promise.all(promises);

  revalidatePath(`/project/${projectId}`);
  revalidatePath(`/project/${projectId}/leads`);

  return { success: true, count: leadIds.length };
}

export async function getProjectMembers(projectId: string) {
  await requireProjectAccess(projectId, 'PROJECT_ADMIN');
  return prisma.membership.findMany({
    where: { projectId },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true
        }
      }
    },
    orderBy: { user: { name: 'asc' } }
  });
}

export async function updateProjectCommercials(projectId: string, userIds: string[]) {
  await requireProjectAccess(projectId, 'PROJECT_ADMIN');
  
  if (userIds.length < 1 || userIds.length > 2) {
    throw new Error('Você deve designar no mínimo 1 e no máximo 2 comerciais responsáveis.');
  }

  await prisma.$transaction([
    prisma.membership.updateMany({
      where: { projectId },
      data: { isDesignatedCommercial: false }
    }),
    prisma.membership.updateMany({
      where: { projectId, userId: { in: userIds } },
      data: { isDesignatedCommercial: true }
    })
  ]);

  revalidatePath(`/project/${projectId}/settings`);
  return { success: true };
}

export async function getProjectApiKeyInfo(projectId: string) {
  await requireProjectAccess(projectId, 'PROJECT_ADMIN');
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { apiKeyPrefix: true }
  });
  return { apiKeyPrefix: project?.apiKeyPrefix || null };
}

export async function generateProjectApiKey(projectId: string) {
  await requireProjectAccess(projectId, 'PROJECT_ADMIN');

  // Gera token aleatório: nfs_ + 32 bytes hex (68 caracteres)
  const token = 'nfs_' + crypto.randomBytes(32).toString('hex');
  const prefix = token.substring(0, 12); // ex: nfs_ + 8 caracteres hex

  // Hash bcrypt da chave completa
  const salt = bcrypt.genSaltSync(10);
  const hash = bcrypt.hashSync(token, salt);

  await prisma.project.update({
    where: { id: projectId },
    data: {
      apiKeyHash: hash,
      apiKeyPrefix: prefix
    }
  });

  revalidatePath(`/project/${projectId}/settings`);
  return token;
}

export async function getForms(projectId: string) {
  await requireProjectAccess(projectId);
  return prisma.form.findMany({
    where: { projectId },
    include: {
      fields: {
        orderBy: { order: 'asc' }
      },
      pipeline: {
        select: { name: true }
      },
      stage: {
        select: { name: true }
      },
      origin: {
        select: { name: true }
      }
    },
    orderBy: { createdAt: 'desc' }
  });
}

export async function createForm(
  projectId: string,
  data: {
    name: string;
    pipelineId: string;
    stageId: string;
    originId?: string | null;
    successMessage?: string;
    redirectUrl?: string | null;
    fields: {
      type: 'SYSTEM' | 'CUSTOM';
      fieldName: string;
      customFieldDefinitionId?: string | null;
      label: string;
      required: boolean;
      order: number;
    }[];
  }
) {
  await requireProjectAccess(projectId, 'PROJECT_ADMIN');

  if (!data.name.trim()) {
    throw new Error('O nome do formulário é obrigatório.');
  }

  // Validação do campo identificador
  const hasIdentifier = data.fields.some(
    f => f.type === 'SYSTEM' && (f.fieldName === 'email' || f.fieldName === 'phone')
  );
  if (!hasIdentifier) {
    throw new Error('O formulário deve conter pelo menos um campo identificador (E-mail ou Telefone) para fins de deduplicação.');
  }

  const token = 'nfs_form_' + crypto.randomBytes(24).toString('hex');

  const form = await prisma.form.create({
    data: {
      name: data.name.trim(),
      token,
      projectId,
      pipelineId: data.pipelineId,
      stageId: data.stageId,
      originId: data.originId || null,
      successMessage: data.successMessage?.trim() || 'Formulário enviado com sucesso!',
      redirectUrl: data.redirectUrl?.trim() || null,
      fields: {
        create: data.fields.map(f => ({
          type: f.type,
          fieldName: f.fieldName,
          customFieldDefinitionId: f.customFieldDefinitionId || null,
          label: f.label.trim(),
          required: f.required,
          order: f.order
        }))
      }
    },
    include: {
      fields: true
    }
  });

  revalidatePath(`/project/${projectId}/settings`);
  return form;
}

export async function updateForm(
  projectId: string,
  formId: string,
  data: {
    name: string;
    pipelineId: string;
    stageId: string;
    originId?: string | null;
    successMessage?: string;
    redirectUrl?: string | null;
    fields: {
      type: 'SYSTEM' | 'CUSTOM';
      fieldName: string;
      customFieldDefinitionId?: string | null;
      label: string;
      required: boolean;
      order: number;
    }[];
  }
) {
  await requireProjectAccess(projectId, 'PROJECT_ADMIN');

  const existing = await prisma.form.findUnique({
    where: { id: formId }
  });

  if (!existing || existing.projectId !== projectId) {
    throw new Error('Formulário não encontrado ou não pertence a este projeto.');
  }

  if (!data.name.trim()) {
    throw new Error('O nome do formulário é obrigatório.');
  }

  // Validação do campo identificador
  const hasIdentifier = data.fields.some(
    f => f.type === 'SYSTEM' && (f.fieldName === 'email' || f.fieldName === 'phone')
  );
  if (!hasIdentifier) {
    throw new Error('O formulário deve conter pelo menos um campo identificador (E-mail ou Telefone) para fins de deduplicação.');
  }

  // Usamos uma transação para atualizar o form e recriar os campos
  const form = await prisma.$transaction(async (tx) => {
    // 1. Deleta todos os campos antigos do form
    await tx.formField.deleteMany({
      where: { formId }
    });

    // 2. Atualiza o form e cria os novos campos
    return tx.form.update({
      where: { id: formId },
      data: {
        name: data.name.trim(),
        pipelineId: data.pipelineId,
        stageId: data.stageId,
        originId: data.originId || null,
        successMessage: data.successMessage?.trim() || 'Formulário enviado com sucesso!',
        redirectUrl: data.redirectUrl?.trim() || null,
        fields: {
          create: data.fields.map(f => ({
            type: f.type,
            fieldName: f.fieldName,
            customFieldDefinitionId: f.customFieldDefinitionId || null,
            label: f.label.trim(),
            required: f.required,
            order: f.order
          }))
        }
      },
      include: {
        fields: true
      }
    });
  });

  revalidatePath(`/project/${projectId}/settings`);
  return form;
}

export async function deleteForm(projectId: string, formId: string) {
  await requireProjectAccess(projectId, 'PROJECT_ADMIN');

  const existing = await prisma.form.findUnique({
    where: { id: formId }
  });

  if (!existing || existing.projectId !== projectId) {
    throw new Error('Formulário não encontrado ou não pertence a este projeto.');
  }

  await prisma.form.delete({
    where: { id: formId }
  });

  revalidatePath(`/project/${projectId}/settings`);
  return { success: true };
}

export async function requestPasswordReset(email: string) {
  const normalizedEmail = email.trim().toLowerCase();
  const user = await prisma.user.findUnique({
    where: { email: normalizedEmail }
  });

  if (!user) {
    // Generic response for security to avoid account enumeration
    return {
      success: true,
      message: 'Se o e-mail estiver cadastrado, as instruções de redefinição foram enviadas.',
      debugInfo: `E-mail não encontrado no banco de dados. (Apenas no ambiente local: ${normalizedEmail})`
    };
  }

  const token = crypto.randomUUID();
  const expires = new Date(Date.now() + 3600 * 1000); // 1 hora de expiração

  await prisma.user.update({
    where: { id: user.id },
    data: {
      resetToken: token,
      resetTokenExpires: expires
    }
  });

  const baseUrl = process.env.NEXTAUTH_URL || 'http://localhost:3000';
  const resetUrl = `${baseUrl}/reset-password?token=${token}`;

  const mailResult = await sendPasswordResetEmail(user.email, resetUrl);

  return {
    success: true,
    message: 'Instruções de redefinição enviadas para o e-mail cadastrado.',
    debugLink: mailResult.simulated ? resetUrl : null
  };
}

export async function resetPassword(token: string, newPassword: string) {
  if (!token) {
    throw new Error('Token de redefinição é obrigatório.');
  }

  if (newPassword.length < 6) {
    throw new Error('A senha deve ter pelo menos 6 caracteres.');
  }

  const user = await prisma.user.findFirst({
    where: {
      resetToken: token,
      resetTokenExpires: {
        gt: new Date()
      }
    }
  });

  if (!user) {
    throw new Error('Token inválido ou expirado.');
  }

  const salt = await bcrypt.genSalt(10);
  const passwordHash = await bcrypt.hash(newPassword, salt);

  await prisma.user.update({
    where: { id: user.id },
    data: {
      passwordHash,
      resetToken: null,
      resetTokenExpires: null
    }
  });

  return { success: true };
}


