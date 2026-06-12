'use server';

import { prisma } from '@/lib/prisma';
import { requireSuperadmin, getSession } from '@/lib/security';
import { revalidatePath } from 'next/cache';

// Listar todos os projetos acessíveis pelo usuário logado
export async function getProjects() {
  const session = await getSession();
  if (!session || !session.user) return [];

  const user = session.user as { id: string; role: string };

  if (user.role === 'SUPERADMIN') {
    return prisma.project.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        memberships: {
          include: {
            user: {
              select: { id: true, name: true, email: true }
            }
          }
        }
      }
    });
  }

  // Se usuário comum, lista apenas projetos onde tem vinculação
  return prisma.project.findMany({
    where: {
      memberships: {
        some: { userId: user.id }
      }
    },
    orderBy: { createdAt: 'desc' },
    include: {
      memberships: {
        include: {
          user: {
            select: { id: true, name: true, email: true }
          }
        }
      }
    }
  });
}

// Obter detalhes de um projeto específico
export async function getProjectById(id: string) {
  const session = await getSession();
  if (!session || !session.user) throw new Error('Não autenticado.');

  const user = session.user as { id: string; role: string };

  if (user.role !== 'SUPERADMIN') {
    const membership = await prisma.membership.findUnique({
      where: {
        userId_projectId: {
          userId: user.id,
          projectId: id,
        }
      }
    });
    if (!membership) throw new Error('Acesso negado.');
  }

  return prisma.project.findUnique({
    where: { id },
    include: {
      pipelines: {
        include: {
          stages: {
            orderBy: { order: 'asc' }
          }
        }
      }
    }
  });
}

// Criar projeto (Apenas Superadmin)
export async function createProject(data: { name: string; description?: string }) {
  const superadmin = await requireSuperadmin();

  const project = await prisma.project.create({
    data: {
      name: data.name,
      description: data.description,
    },
  });

  // Vincula o próprio criador como admin do projeto
  await prisma.membership.create({
    data: {
      userId: superadmin.id,
      projectId: project.id,
      role: 'PROJECT_ADMIN',
    },
  });

  // Cria um pipeline padrão por conveniência
  const pipeline = await prisma.pipeline.create({
    data: {
      name: 'Funil de Vendas Principal',
      projectId: project.id,
    },
  });

  // Cria estágios padrão no pipeline
  await prisma.stage.createMany({
    data: [
      { name: 'Sem Contato', order: 0, color: '#888888', pipelineId: pipeline.id },
      { name: 'Qualificação', order: 1, color: '#3b82f6', pipelineId: pipeline.id },
      { name: 'Reunião Agendada', order: 2, color: '#f59e0b', pipelineId: pipeline.id },
      { name: 'Proposta Enviada', order: 3, color: '#8b5cf6', pipelineId: pipeline.id },
      { name: 'Fechado (Ganho)', order: 4, color: '#10b981', pipelineId: pipeline.id },
      { name: 'Perdido', order: 5, color: '#ef4444', pipelineId: pipeline.id },
    ],
  });

  // Cria tags padrões
  await prisma.tag.createMany({
    data: [
      { name: 'Decisor', color: '#d4a843', projectId: project.id },
      { name: 'ICP Ideal', color: '#abfe37', projectId: project.id },
      { name: 'High Ticket', color: '#8b5cf6', projectId: project.id },
    ],
  });

  revalidatePath('/admin');
  return project;
}

// Atualizar projeto (Apenas Superadmin)
export async function updateProject(id: string, data: { name: string; description?: string }) {
  await requireSuperadmin();

  const project = await prisma.project.update({
    where: { id },
    data: {
      name: data.name,
      description: data.description,
    },
  });

  revalidatePath('/admin');
  revalidatePath(`/project/${id}`);
  return project;
}

// Excluir projeto (Apenas Superadmin)
export async function deleteProject(id: string) {
  await requireSuperadmin();

  await prisma.project.delete({
    where: { id },
  });

  revalidatePath('/admin');
  return { success: true };
}
