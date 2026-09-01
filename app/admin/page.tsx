import React from 'react';
import { redirect } from 'next/navigation';
import { getSession, type CRMUser } from '@/lib/security';
import { getUsers } from '@/app/actions/users';
import { getProjects } from '@/app/actions/projects';
import { AdminPanel } from './admin-panel';

export const dynamic = 'force-dynamic';

export default async function AdminPage() {
  // 1. Trata falta de permissão como estado esperado, sem expor erro técnico.
  const session = await getSession();
  if (!session?.user) redirect('/');
  if ((session.user as CRMUser).role !== 'SUPERADMIN') {
    redirect('/acesso-negado?reason=admin');
  }

  // 2. Busca dados iniciais no lado do servidor
  const users = await getUsers();
  const projects = await getProjects();

  return (
    <AdminPanel 
      initialUsers={users as any} 
      initialProjects={projects as any} 
    />
  );
}
