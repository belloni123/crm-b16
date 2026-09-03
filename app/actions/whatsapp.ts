'use server';

import { prisma } from '@/lib/prisma';
import { requireProjectAccess } from '@/lib/security';
import { revalidatePath } from 'next/cache';
import { getPhoneVariants } from '@/lib/utils';
import crypto from 'crypto';
import { outboundDecision } from '@/lib/outbound-policy';
import { executeEvolutionSend } from '@/lib/channels/evolution-send';

const EVOLUTION_API_URL = process.env.EVOLUTION_API_URL;
const EVOLUTION_API_KEY = process.env.EVOLUTION_API_KEY;

// Função auxiliar para garantir que o webhook está configurado corretamente na Evolution API
async function ensureWebhookConfigured(instanceName: string) {
  if (!outboundDecision('EVOLUTION', 'configure-webhook').allowed) return false;
  if (!EVOLUTION_API_URL || !EVOLUTION_API_KEY) return;
  
  try {
    const baseUrl = process.env.NEXTAUTH_URL || 'https://crm.agenciab16.com.br';
    const webhookUrl = `${baseUrl}/api/webhooks/whatsapp`;
    
    // 1. Tenta buscar a configuração de webhook atual
    const findResponse = await fetch(`${EVOLUTION_API_URL}/webhook/find/${instanceName}`, {
      method: 'GET',
      headers: {
        'apikey': EVOLUTION_API_KEY,
      },
    });
    
    let needsSetting = true;
    if (findResponse.ok) {
      const data = await findResponse.json();
      if (data && data.enabled && data.url === webhookUrl) {
        needsSetting = false;
      }
    }
    
    // 2. Se não estiver configurado ou estiver apontando para a URL errada, define o webhook
    if (needsSetting) {
      console.log(`[Webhook Auto-Config] Configurando webhook para ${instanceName} -> ${webhookUrl}`);
      const setResponse = await fetch(`${EVOLUTION_API_URL}/webhook/set/${instanceName}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': EVOLUTION_API_KEY,
        },
        body: JSON.stringify({
          webhook: {
            enabled: true,
            url: webhookUrl,
            byEvents: false,
            base64: false,
            events: [
              "MESSAGES_UPSERT",
              "MESSAGES_UPDATE",
              "CONNECTION_UPDATE"
            ]
          }
        }),
      });
      
      if (!setResponse.ok) {
        console.error(`[Webhook Auto-Config] Falha ao configurar webhook para ${instanceName}:`, await setResponse.text());
      } else {
        console.log(`[Webhook Auto-Config] Webhook configurado com sucesso para ${instanceName}`);
      }
    }
  } catch (err) {
    console.error(`[Webhook Auto-Config] Erro ao assegurar webhook da instância ${instanceName}:`, err);
  }
}

// ==========================================
// GERENCIAMENTO DE INSTÂNCIAS
// ==========================================

export async function getWhatsAppInstances(projectId: string) {
  await requireProjectAccess(projectId);
  
  const instances = await prisma.whatsAppInstance.findMany({
    where: { projectId },
    orderBy: { createdAt: 'desc' },
  });

  // Sincroniza em tempo real o status com a Evolution API se estiver configurado
  if (EVOLUTION_API_URL && EVOLUTION_API_KEY && outboundDecision('EVOLUTION', 'sync-instance-status').allowed) {
    try {
      const updatedInstances = await Promise.all(
        instances.map(async (inst) => {
          if (inst.type !== 'WHATSAPP') return inst;
          try {
            const response = await fetch(`${EVOLUTION_API_URL}/instance/connectionState/${inst.instanceName}`, {
              method: 'GET',
              headers: {
                'apikey': EVOLUTION_API_KEY,
              },
            });
            if (response.ok) {
              const data = await response.json();
              const evolutionState = data.instance?.state;
              const newStatus = evolutionState === 'open' ? 'CONNECTED' : 'DISCONNECTED';
              
              // Garante que o webhook está ativo se a instância estiver conectada
              if (newStatus === 'CONNECTED') {
                await ensureWebhookConfigured(inst.instanceName);
              }
              
              if (inst.status !== newStatus) {
                const updated = await prisma.whatsAppInstance.update({
                  where: { id: inst.id },
                  data: { status: newStatus },
                });
                return updated;
              }
            }
          } catch (err) {
            console.error(`Erro ao sincronizar status da instância ${inst.instanceName}:`, err);
          }
          return inst;
        })
      );
      return updatedInstances;
    } catch (err) {
      console.error('Erro na sincronização de instâncias:', err);
    }
  }

  return instances;
}

export async function createWhatsAppInstance(projectId: string, name: string, type: string = 'WHATSAPP') {
  await requireProjectAccess(projectId, 'PROJECT_ADMIN');

  // Gera um nome único e token para a instância na Evolution API
  const instanceName = `b16_${projectId.substring(0, 8)}_${crypto.randomBytes(4).toString('hex')}`;
  const token = crypto.randomBytes(16).toString('hex');

  // 1. Cria a instância no banco de dados local
  const instance = await prisma.whatsAppInstance.create({
    data: {
      name,
      instanceName,
      token,
      status: 'DISCONNECTED',
      type, // Salva o tipo (WHATSAPP, etc) para extensibilidade futura
      projectId,
    },
  });

  // 2. Tenta registrar a instância na Evolution API
  if (EVOLUTION_API_URL && EVOLUTION_API_KEY && type === 'WHATSAPP' && outboundDecision('EVOLUTION', 'create-instance').allowed) {
    try {
      const baseUrl = process.env.NEXTAUTH_URL || 'https://crm.agenciab16.com.br';
      
      const response = await fetch(`${EVOLUTION_API_URL}/instance/create`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': EVOLUTION_API_KEY,
        },
        body: JSON.stringify({
          instanceName: instanceName,
          token: token,
          qrcode: true,
          sendPresence: true,
          integration: 'WHATSAPP-BAILEYS',
          webhook_baileys: {
            url: `${baseUrl}/api/webhooks/whatsapp`,
            events: [
              "MESSAGES_UPSERT",
              "MESSAGES_UPDATE"
            ]
          }
        }),
      });

      if (!response.ok) {
        console.error('Falha ao criar instância na Evolution API REST:', await response.text());
      } else {
        // Assegura que o webhook geral também está configurado
        await ensureWebhookConfigured(instanceName);
      }
    } catch (err) {
      console.error('Erro de conexão ao tentar falar com Evolution API:', err);
    }
  }

  revalidatePath(`/project/${projectId}/settings`);
  return instance;
}

export async function getQRCode(projectId: string, instanceId: string) {
  await requireProjectAccess(projectId);

  const instance = await prisma.whatsAppInstance.findUnique({
    where: { id: instanceId },
  });

  if (!instance || instance.projectId !== projectId) {
    throw new Error('Instância não encontrada.');
  }

  const outbound = outboundDecision('EVOLUTION', 'connect-instance');
  if (!outbound.allowed) return { success: false, blocked: true, message: outbound.reason };

  if (!EVOLUTION_API_URL || !EVOLUTION_API_KEY) {
    return { success: false, message: 'Evolution API não configurada no ambiente.' };
  }

  // Garante que o webhook está configurado antes de conectar/mostrar o QR code
  await ensureWebhookConfigured(instance.instanceName);

  try {
    const response = await fetch(`${EVOLUTION_API_URL}/instance/connect/${instance.instanceName}`, {
      method: 'GET',
      headers: {
        'apikey': EVOLUTION_API_KEY,
      },
    });

    if (!response.ok) {
      return { success: false, message: 'Não foi possível obter o QR Code (Instância já conectada ou offline).' };
    }

    const data = await response.json();
    
    if (data.code || data.base64) {
      return {
        success: true,
        qrcode: data.base64 || data.code,
        status: 'CONNECTING',
      };
    }

    return { success: true, qrcode: null, status: data.status || 'CONNECTED' };
  } catch (err) {
    console.error('Erro ao chamar conectar na Evolution API:', err);
    return { success: false, message: 'Erro de rede ao conectar com Evolution API.' };
  }
}

export async function deleteWhatsAppInstance(projectId: string, instanceId: string) {
  await requireProjectAccess(projectId, 'PROJECT_ADMIN');

  const instance = await prisma.whatsAppInstance.findUnique({
    where: { id: instanceId },
  });

  if (!instance || instance.projectId !== projectId) {
    throw new Error('Instância não encontrada.');
  }

  const historyCount = await prisma.conversation.count({ where: { instanceId: instance.id } });
  if (historyCount > 0) {
    await prisma.$transaction([
      prisma.whatsAppInstance.update({ where: { id: instance.id }, data: { status: 'DISCONNECTED', archivedAt: new Date() } }),
      prisma.channelConnection.updateMany({ where: { legacyWhatsAppInstanceId: instance.id }, data: { status: 'ARCHIVED', isActive: false, archivedAt: new Date() } }),
      prisma.auditEvent.create({ data: { projectId, action: 'EVOLUTION_INSTANCE_ARCHIVED', resourceType: 'WhatsAppInstance', resourceId: instance.id, reason: 'HISTORY_PRESERVED', metadataRedacted: JSON.stringify({ conversationCount: historyCount }) } }),
    ]);
    revalidatePath(`/project/${projectId}/settings`);
    return { success: true, archived: true };
  }

  // Deleta da Evolution API se for WhatsApp
  const deletionDecision = outboundDecision('EVOLUTION', 'delete-instance');
  if (EVOLUTION_API_URL && EVOLUTION_API_KEY && instance.type === 'WHATSAPP' && !deletionDecision.allowed) {
    return { success: false, blocked: true, message: deletionDecision.reason };
  }
  if (EVOLUTION_API_URL && EVOLUTION_API_KEY && instance.type === 'WHATSAPP') {
    try {
      await fetch(`${EVOLUTION_API_URL}/instance/delete/${instance.instanceName}`, {
        method: 'DELETE',
        headers: {
          'apikey': EVOLUTION_API_KEY,
        },
      });
    } catch (err) {
      console.error('Erro de rede ao deletar instância na Evolution API:', err);
    }
  }

  await prisma.whatsAppInstance.delete({
    where: { id: instanceId },
  });

  revalidatePath(`/project/${projectId}/settings`);
  return { success: true };
}

// ==========================================
// CHATS, CONVERSAS E MENSAGENS
// ==========================================

export async function getWhatsAppConversations(projectId: string) {
  await requireProjectAccess(projectId);

  return prisma.conversation.findMany({
    where: {
      instance: { projectId },
    },
    orderBy: { lastMessageAt: 'desc' },
    include: {
      lead: {
        select: { id: true, name: true, phone: true, company: true },
      },
      instance: {
        select: { name: true, instanceName: true, type: true },
      },
      messages: {
        orderBy: { createdAt: 'desc' },
        take: 1,
      },
    },
  });
}

export async function getWhatsAppMessages(projectId: string, conversationId: string) {
  await requireProjectAccess(projectId);

  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    include: { instance: true },
  });

  if (!conversation || (conversation.projectId || conversation.instance?.projectId) !== projectId) {
    throw new Error('Conversa não encontrada.');
  }

  return prisma.message.findMany({
    where: { conversationId },
    orderBy: { createdAt: 'asc' },
  });
}

export async function sendWhatsAppMessage(
  projectId: string,
  conversationId: string,
  content: string,
  messageType: string = 'TEXT',
  mediaUrl: string | null = null
) {
  await requireProjectAccess(projectId);
  const message = await executeEvolutionSend({ projectId, conversationId, content, messageType, mediaUrl });
  revalidatePath(`/project/${projectId}/inbox`);
  return message;
}

export async function associateLeadToConversation(projectId: string, conversationId: string, leadId: string | null) {
  await requireProjectAccess(projectId);

  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    include: { instance: true },
  });

  if (!conversation || (conversation.projectId || conversation.instance?.projectId) !== projectId) {
    throw new Error('Conversa não encontrada.');
  }

  if (leadId) {
    // Valida que o lead pertence ao projeto
    const lead = await prisma.lead.findUnique({
      where: { id: leadId },
    });
    if (!lead || lead.projectId !== projectId) {
      throw new Error('Lead inválido ou não pertence a este projeto.');
    }
  }

  const updatedConversation = await prisma.conversation.update({
    where: { id: conversationId },
    data: { leadId },
    include: {
      lead: {
        select: { id: true, name: true, phone: true, company: true },
      },
    },
  });

  revalidatePath(`/project/${projectId}/inbox`);
  return updatedConversation;
}

export async function startWhatsAppConversation(projectId: string, leadId: string) {
  await requireProjectAccess(projectId);

  // 1. Busca o lead e valida
  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
  });

  if (!lead || lead.projectId !== projectId) {
    throw new Error('Lead não encontrado.');
  }

  if (!lead.phone) {
    return { success: false, message: 'Este lead não possui telefone cadastrado.' };
  }

  const cleanPhone = lead.phone.replace(/\D/g, '');
  if (!cleanPhone) {
    return { success: false, message: 'Telefone do lead inválido.' };
  }

  // 2. Busca a primeira instância de WhatsApp ativa (conectada) do projeto
  const instance = await prisma.whatsAppInstance.findFirst({
    where: { 
      projectId, 
      status: 'CONNECTED',
      type: 'WHATSAPP'
    },
  });

  if (!instance) {
    return { success: false, message: 'Nenhuma conexão de WhatsApp ativa neste projeto. Vá em Configurações > Conexões WhatsApp para conectar.' };
  }

  // 3. Verifica se a conversa já existe usando as variantes do telefone
  const phoneVariants = getPhoneVariants(cleanPhone);
  let conversation = await prisma.conversation.findFirst({
    where: {
      instanceId: instance.id,
      whatsappId: { in: phoneVariants },
    },
  });

  // 4. Se não existe, cria a conversa
  if (!conversation) {
    conversation = await prisma.conversation.create({
      data: {
        whatsappId: cleanPhone,
        name: lead.name,
        instanceId: instance.id,
        leadId: lead.id,
      },
    });
  } else if (!conversation.leadId) {
    // Se a conversa existia mas não estava vinculada ao lead, vincula agora
    conversation = await prisma.conversation.update({
      where: { id: conversation.id },
      data: { leadId: lead.id },
    });
  }

  return { success: true, conversationId: conversation.id };
}
