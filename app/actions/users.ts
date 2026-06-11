'use server';

import { prisma } from '@/lib/prisma';
import { requireSuperadmin } from '@/lib/security';
import bcrypt from 'bcryptjs';
import { revalidatePath } from 'next/cache';
import { sendProjectInvitationEmail } from '@/lib/mail';

// Listar todos os usuários (Apenas Superadmin)
export async function getUsers() {
  await requireSuperadmin();

  return prisma.user.findMany({
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      createdAt: true,
      memberships: {
        include: {
          project: {
            select: { id: true, name: true }
          }
        }
      }
    }
  });
}

// Criar usuário (Apenas Superadmin)
export async function createUser(data: { name: string; email: string; passwordRaw: string; role: string }) {
  await requireSuperadmin();

  const existingUser = await prisma.user.findUnique({
    where: { email: data.email.toLowerCase() }
  });

  if (existingUser) {
    throw new Error('E-mail já cadastrado.');
  }

  const passwordHash = await bcrypt.hash(data.passwordRaw, 10);

  const user = await prisma.user.create({
    data: {
      name: data.name,
      email: data.email.toLowerCase(),
      passwordHash,
      role: data.role,
    }
  });

  revalidatePath('/admin');
  return { id: user.id, name: user.name, email: user.email, role: user.role };
}

// Atualizar usuário (Apenas Superadmin)
export async function updateUser(id: string, data: { name?: string; email?: string; passwordRaw?: string; role?: string }) {
  await requireSuperadmin();

  const updateData: any = {};
  if (data.name !== undefined) updateData.name = data.name;
  if (data.email !== undefined) updateData.email = data.email.toLowerCase();
  if (data.role !== undefined) updateData.role = data.role;
  if (data.passwordRaw) {
    updateData.passwordHash = await bcrypt.hash(data.passwordRaw, 10);
  }

  const user = await prisma.user.update({
    where: { id },
    data: updateData
  });

  revalidatePath('/admin');
  return { id: user.id, name: user.name, email: user.email, role: user.role };
}

// Excluir usuário (Apenas Superadmin)
export async function deleteUser(id: string) {
  const adminSession = await requireSuperadmin();

  // Impedir auto-exclusão
  if (adminSession.id === id) {
    throw new Error('Você não pode excluir a si mesmo.');
  }

  await prisma.user.delete({
    where: { id }
  });

  revalidatePath('/admin');
  return { success: true };
}

// Vincular usuário a projeto (Apenas Superadmin)
export async function addProjectMembership(data: { userId: string; projectId: string; role: 'PROJECT_ADMIN' | 'MEMBER' }) {
  await requireSuperadmin();

  const membership = await prisma.membership.upsert({
    where: {
      userId_projectId: {
        userId: data.userId,
        projectId: data.projectId
      }
    },
    update: {
      role: data.role
    },
    create: {
      userId: data.userId,
      projectId: data.projectId,
      role: data.role
    }
  });

  // Dispara o e-mail de convite para o usuário
  try {
    const user = await prisma.user.findUnique({
      where: { id: data.userId },
      select: { email: true, name: true }
    });

    const project = await prisma.project.findUnique({
      where: { id: data.projectId },
      select: { name: true }
    });

    if (user && project) {
      const baseUrl = process.env.NEXTAUTH_URL || 'http://localhost:3000';
      const projectUrl = `${baseUrl}/project/${data.projectId}`;
      await sendProjectInvitationEmail(user.email, user.name, project.name, projectUrl);
    }
  } catch (err) {
    console.error('Falha ao enviar e-mail de convite de projeto:', err);
  }

  revalidatePath('/admin');
  revalidatePath(`/project/${data.projectId}`);
  return membership;
}

// Desvincular usuário de projeto (Apenas Superadmin)
export async function removeProjectMembership(userId: string, projectId: string) {
  await requireSuperadmin();

  await prisma.membership.delete({
    where: {
      userId_projectId: {
        userId,
        projectId
      }
    }
  });

  revalidatePath('/admin');
  revalidatePath(`/project/${projectId}`);
  return { success: true };
}
