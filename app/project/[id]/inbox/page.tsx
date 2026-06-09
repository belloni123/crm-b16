import React, { Suspense } from 'react';
import { requireProjectAccess } from '@/lib/security';
import { getWhatsAppConversations, getWhatsAppInstances } from '@/app/actions/whatsapp';
import { getLeads } from '@/app/actions/crm';
import { InboxPanel } from './inbox-panel';

interface Props {
  params: Promise<{ id: string }>;
}

export const dynamic = 'force-dynamic';

export default async function ProjectInboxPage({ params }: Props) {
  const { id: projectId } = await params;

  // 1. Valida acesso ao projeto
  await requireProjectAccess(projectId);

  // 2. Busca conversas, instâncias e leads
  const conversations = await getWhatsAppConversations(projectId);
  const whatsappInstances = await getWhatsAppInstances(projectId);
  const leads = await getLeads(projectId, { status: 'ACTIVE' });

  return (
    <Suspense fallback={<div className="flex-1 flex items-center justify-center text-white text-xs">Carregando Inbox...</div>}>
      <InboxPanel
        projectId={projectId}
        initialConversations={conversations as any}
        whatsappInstances={whatsappInstances as any}
        leads={leads as any}
      />
    </Suspense>
  );
}
