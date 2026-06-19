'use server';

import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { revalidatePath } from 'next/cache';

/**
 * Obtém o status de conexões de agenda do usuário logado
 */
export async function getUserCalendarIntegrations() {
  const session = await getServerSession(authOptions);
  if (!session || !session.user) {
    throw new Error('Não autorizado');
  }

  const userId = (session.user as any).id;

  const integrations = await prisma.calendarIntegration.findMany({
    where: { userId },
    select: {
      provider: true,
      email: true,
      createdAt: true,
    },
  });

  const status = {
    google: { connected: false, email: null as string | null },
    microsoft: { connected: false, email: null as string | null },
  };

  integrations.forEach((item) => {
    if (item.provider === 'GOOGLE') {
      status.google.connected = true;
      status.google.email = item.email;
    } else if (item.provider === 'MICROSOFT') {
      status.microsoft.connected = true;
      status.microsoft.email = item.email;
    }
  });

  return status;
}

/**
 * Remove a integração de agenda do usuário logado
 */
export async function disconnectCalendarIntegration(projectId: string, provider: 'GOOGLE' | 'MICROSOFT') {
  const session = await getServerSession(authOptions);
  if (!session || !session.user) {
    throw new Error('Não autorizado');
  }

  const userId = (session.user as any).id;

  // Busca e apaga do banco de dados
  await prisma.calendarIntegration.deleteMany({
    where: {
      userId,
      provider,
    },
  });

  // Limpa os eventIds de tarefas do usuário associadas a esse provedor
  const updateData: any = {};
  if (provider === 'GOOGLE') {
    updateData.googleEventId = null;
  } else if (provider === 'MICROSOFT') {
    updateData.microsoftEventId = null;
  }

  await prisma.task.updateMany({
    where: {
      userId,
      projectId,
    },
    data: updateData,
  });

  revalidatePath(`/project/${projectId}/settings`);
  return { success: true };
}
