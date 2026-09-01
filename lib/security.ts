import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from './prisma';

export type CRMUser = {
  id: string;
  email: string;
  name?: string | null;
  role: string;
};

export type ProjectAccessResult =
  | { granted: true; user: CRMUser; projectRole: string }
  | { granted: false; reason: 'UNAUTHENTICATED' | 'FORBIDDEN' };

export async function getSession() {
  if (process.env.CRM_TEST_MODE === 'true') {
    return {
      user: {
        id: process.env.CRM_TEST_USER_ID || 'test-user-id',
        email: 'test-admin@test.com',
        name: 'Test Admin',
        role: process.env.CRM_TEST_USER_ROLE || 'SUPERADMIN'
      }
    };
  }
  return await getServerSession(authOptions);
}

// Garante que o usuário logado é SUPERADMIN
export async function requireSuperadmin() {
  const session = await getSession();
  if (!session || !session.user || (session.user as CRMUser).role !== 'SUPERADMIN') {
    throw new Error('Acesso negado: Requer privilégios de Superadmin.');
  }
  return session.user as CRMUser;
}

// Resolve o acesso sem lançar exceção para que páginas possam renderizar um estado esperado.
export async function resolveProjectAccess(projectId: string): Promise<ProjectAccessResult> {
  const session = await getSession();
  if (!session || !session.user) {
    return { granted: false, reason: 'UNAUTHENTICATED' };
  }

  const user = session.user as CRMUser;

  // Superadmin tem passe livre global
  if (user.role === 'SUPERADMIN') {
    return { granted: true, user, projectRole: 'PROJECT_ADMIN' };
  }

  // Verifica se o usuário tem membership no projeto
  const membership = await prisma.membership.findUnique({
    where: {
      userId_projectId: {
        userId: user.id,
        projectId,
      },
    },
  });

  if (!membership) {
    return { granted: false, reason: 'FORBIDDEN' };
  }

  return { granted: true, user, projectRole: membership.role };
}

// Garante acesso em Server Actions. Páginas e layouts devem usar resolveProjectAccess.
export async function requireProjectAccess(projectId: string, requiredRole?: 'PROJECT_ADMIN' | 'MEMBER') {
  const access = await resolveProjectAccess(projectId);
  if (!access.granted) {
    throw new Error(access.reason === 'UNAUTHENTICATED'
      ? 'Acesso negado: Não autenticado.'
      : 'Acesso negado: Você não tem permissão neste projeto.');
  }

  // Se for exigido papel específico (ex: PROJECT_ADMIN), valida
  if (requiredRole === 'PROJECT_ADMIN' && access.projectRole !== 'PROJECT_ADMIN') {
    throw new Error('Acesso negado: Apenas administradores do projeto podem realizar esta ação.');
  }

  return { user: access.user, projectRole: access.projectRole };
}
