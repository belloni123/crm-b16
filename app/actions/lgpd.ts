'use server';

import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function acceptLgpdTerms() {
  const session = await getServerSession(authOptions);
  
  if (!session?.user) {
    throw new Error('Não autorizado. Por favor, faça login novamente.');
  }
  
  const userId = (session.user as any).id;
  const acceptedAt = new Date();
  
  await prisma.user.update({
    where: { id: userId },
    data: {
      lgpdAccepted: true,
      lgpdAcceptedAt: acceptedAt,
    },
  });
  
  return { success: true, acceptedAt };
}
