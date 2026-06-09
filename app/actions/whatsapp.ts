'use server';

import { prisma } from '@/lib/prisma';
import { requireProjectAccess } from '@/lib/security';
import { revalidatePath } from 'next/cache';
import crypto from 'crypto';

const EVOLUTION_API_URL = process.env.EVOLUTION_API_URL;
const EVOLUTION_API_KEY = process.env.EVOLUTION_API_KEY;

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
  if (EVOLUTION_API_URL && EVOLUTION_API_KEY) {
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
  const instanceName = `nfs_${projectId.substring(0, 8)}_${crypto.randomBytes(4).toString('hex')}`;
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
  if (EVOLUTION_API_URL && EVOLUTION_API_KEY && type === 'WHATSAPP') {
    try {
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
        }),
      });

      if (!response.ok) {
        console.error('Falha ao criar instância na Evolution API REST:', await response.text());
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

  if (!EVOLUTION_API_URL || !EVOLUTION_API_KEY) {
    return { success: false, message: 'Evolution API não configurada no ambiente.' };
  }

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

  // Deleta da Evolution API se for WhatsApp
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

  if (!conversation || conversation.instance.projectId !== projectId) {
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

  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    include: { instance: true },
  });

  if (!conversation || conversation.instance.projectId !== projectId) {
    throw new Error('Conversa não encontrada.');
  }

  const instance = conversation.instance;

  // 1. Cria a mensagem no banco de dados local com o tipo e a URL da mídia informados
  const message = await prisma.message.create({
    data: {
      content,
      direction: 'OUTBOUND',
      status: 'SENT',
      messageType,
      mediaUrl,
      conversationId: conversation.id,
    },
  });

  // Atualiza a conversa
  await prisma.conversation.update({
    where: { id: conversation.id },
    data: { lastMessageAt: new Date() },
  });

  // 2. Envia via REST API da Evolution se for WhatsApp
  if (EVOLUTION_API_URL && instance.type === 'WHATSAPP') {
    try {
      const cleanPhone = conversation.whatsappId.replace(/\D/g, '');
      const apiKey = instance.token || EVOLUTION_API_KEY || '';

      let endpoint = '';
      const payload: any = {
        number: cleanPhone,
        options: {
          delay: 1000,
          presence: 'composing',
          linkPreview: false,
        },
      };

      if (messageType === 'TEXT') {
        endpoint = `/message/sendText/${instance.instanceName}`;
        payload.textMessage = {
          text: content,
        };
      } else {
        endpoint = `/message/sendMedia/${instance.instanceName}`;
        
        let mediatype = 'document';
        if (messageType === 'IMAGE') mediatype = 'image';
        else if (messageType === 'AUDIO') mediatype = 'audio';
        else if (messageType === 'VIDEO') mediatype = 'video';

        payload.mediaMessage = {
          mediatype,
          fileName: content || (messageType === 'IMAGE' ? 'imagem.png' : messageType === 'AUDIO' ? 'audio.mp3' : 'documento.pdf'),
          caption: messageType === 'IMAGE' ? content : '',
          media: mediaUrl || '',
        };
      }

      const response = await fetch(`${EVOLUTION_API_URL}${endpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': apiKey,
        },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        const result = await response.json();
        if (result.key?.id) {
          await prisma.message.update({
            where: { id: message.id },
            data: { remoteId: result.key.id },
          });
        }
      } else {
        console.error('Erro ao enviar mensagem na Evolution API REST:', await response.text());
      }
    } catch (err) {
      console.error('Erro de rede ao enviar mensagem via Evolution API:', err);
    }
  }

  revalidatePath(`/project/${projectId}/inbox`);
  return message;
}

export async function associateLeadToConversation(projectId: string, conversationId: string, leadId: string | null) {
  await requireProjectAccess(projectId);

  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    include: { instance: true },
  });

  if (!conversation || conversation.instance.projectId !== projectId) {
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

  // 3. Verifica se a conversa já existe
  let conversation = await prisma.conversation.findFirst({
    where: {
      whatsappId: cleanPhone,
      instanceId: instance.id,
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

