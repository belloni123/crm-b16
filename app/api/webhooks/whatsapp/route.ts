import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getPhoneVariants, isGenericWhatsAppName } from '@/lib/utils';

export async function POST(request: NextRequest) {
  try {
    // 0. Validação de segurança do Webhook (Evolution API)
    const webhookSecret = process.env.EVOLUTION_WEBHOOK_SECRET;
    if (webhookSecret) {
      const authHeader = request.headers.get('webhook-authorization') || 
                         request.headers.get('apikey') || 
                         request.headers.get('Authorization');
      
      const token = authHeader?.replace(/^Bearer\s+/i, '');
      if (token !== webhookSecret) {
        return NextResponse.json(
          { error: 'Não autorizado: Token de webhook inválido.' },
          { status: 401 }
        );
      }
    }

    const body = await request.json();
    console.log('Recebido webhook do WhatsApp:', JSON.stringify(body));

    // A Evolution API envia eventos. O evento principal de mensagem recebida/enviada é "messages.upsert".
    // Também tratamos se vier diretamente sem o envelope de evento.
    const event = body.event;
    const instanceName = body.instance;
    const data = body.data;

    if (!instanceName) {
      return NextResponse.json({ error: 'Nome da instância não fornecido.' }, { status: 400 });
    }

    // 1. Busca a instância no banco de dados local
    const instance = await prisma.whatsAppInstance.findUnique({
      where: { instanceName },
    });

    if (!instance) {
      return NextResponse.json({ error: 'Instância não cadastrada no sistema.' }, { status: 404 });
    }

    // Tratamento de atualização de status da conexão (Evolution API webhook)
    if (event === 'connection.update' || event === 'CONNECTION_UPDATE') {
      const state = data?.state || data?.status;
      const newStatus = state === 'open' ? 'CONNECTED' : 'DISCONNECTED';
      await prisma.whatsAppInstance.update({
        where: { id: instance.id },
        data: { status: newStatus },
      });
      return NextResponse.json({ success: true, message: `Status da instância atualizado para ${newStatus}` });
    }

    // Só processa se o evento for de criação de mensagem ou se não houver evento (envio direto para testes)
    if (event && event !== 'messages.upsert' && event !== 'messages.update' && event !== 'MESSAGES_UPSERT') {
      return NextResponse.json({ success: true, message: `Evento ignorado: ${event}` });
    }

    if (!data) {
      return NextResponse.json({ error: 'Dados da mensagem não fornecidos.' }, { status: 400 });
    }

    // Extrai informações da mensagem
    const key = data.key;
    if (!key) {
      return NextResponse.json({ error: 'Chave da mensagem não fornecida.' }, { status: 400 });
    }

    const remoteId = key.id;
    const remoteJid = key.remoteJid; // ex: "5511999999999@s.whatsapp.net"
    const fromMe = key.fromMe || false;

    if (!remoteJid) {
      return NextResponse.json({ error: 'Remetente não fornecido.' }, { status: 400 });
    }

    // Ignora mensagens de grupo se não quisermos tratá-las
    if (remoteJid.endsWith('@g.us')) {
      return NextResponse.json({ success: true, message: 'Mensagens de grupo ignoradas.' });
    }

    const cleanPhone = remoteJid.split('@')[0].replace(/\D/g, '');
    const pushName = data.pushName || data.verifiedName || null;

    // Determina a direção da mensagem
    const direction = fromMe ? 'OUTBOUND' : 'INBOUND';

    // Determina o tipo e conteúdo da mensagem
    let content = '';
    let messageType = 'TEXT';
    let mediaUrl = null;

    const msg = data.message;
    if (msg) {
      if (msg.conversation) {
        content = msg.conversation;
      } else if (msg.extendedTextMessage?.text) {
        content = msg.extendedTextMessage.text;
      } else if (msg.imageMessage) {
        content = msg.imageMessage.caption || 'Imagem';
        messageType = 'IMAGE';
        mediaUrl = msg.imageMessage.url || null;
      } else if (msg.documentMessage) {
        content = msg.documentMessage.title || msg.documentMessage.fileName || 'Documento';
        messageType = 'DOCUMENT';
        mediaUrl = msg.documentMessage.url || null;
      } else if (msg.audioMessage) {
        content = 'Áudio';
        messageType = 'AUDIO';
        mediaUrl = msg.audioMessage.url || null;
      } else if (msg.videoMessage) {
        content = msg.videoMessage.caption || 'Vídeo';
        messageType = 'VIDEO';
        mediaUrl = msg.videoMessage.url || null;
      } else if (typeof msg === 'string') {
        content = msg;
      }
    }

    if (!content) {
      content = data.message?.conversation || 
                data.message?.extendedTextMessage?.text || 
                data.message?.imageMessage?.caption || 
                data.text || 
                data.content || 
                'Mensagem vazia ou tipo não suportado';
    }

    // 2. Busca um lead correspondente no projeto da instância pelo número de telefone usando variantes robustas
    const whatsappVariants = getPhoneVariants(cleanPhone);
    const matchedLead = await prisma.lead.findFirst({
      where: {
        projectId: instance.projectId,
        phone: { in: whatsappVariants },
      },
    });

    // 3. Encontra ou cria a conversa usando variantes do número de telefone
    const phoneVariants = getPhoneVariants(cleanPhone);
    let conversation = await prisma.conversation.findFirst({
      where: {
        instanceId: instance.id,
        whatsappId: { in: phoneVariants },
      },
    });

    const stablePushName = !isGenericWhatsAppName(pushName, cleanPhone, instance.name) ? pushName : null;
    const fallbackContactName = matchedLead?.name || stablePushName;

    if (!conversation && fallbackContactName) {
      conversation = await prisma.conversation.findFirst({
        where: {
          instanceId: instance.id,
          name: {
            equals: fallbackContactName,
            mode: 'insensitive',
          },
        },
        orderBy: { lastMessageAt: 'desc' },
      });
    }

    if (!conversation) {
      // Prefer a matched lead or a stable contact name. Some Evolution payloads use non-phone
      // WhatsApp IDs, so the name fallback keeps sent/received messages in one thread.
      const conversationName = fromMe
        ? (fallbackContactName || cleanPhone)
        : (fallbackContactName || cleanPhone);

      conversation = await prisma.conversation.create({
        data: {
          whatsappId: cleanPhone,
          name: conversationName,
          instanceId: instance.id,
          leadId: matchedLead?.id || null,
        },
      });
    } else {
      // Atualiza o nome se tiver e o lead se tiver mudado / encontrado agora
      const updateData: any = { lastMessageAt: new Date() };
      
      // Só atualiza o nome com pushName se for uma mensagem inbound (não enviada por nós)
      // e se o nome atual for apenas o número de telefone ou o nome da instância (para corrigir históricos)
      const isGenericName = isGenericWhatsAppName(conversation.name, conversation.whatsappId, instance.name);

      if (fallbackContactName && isGenericName) {
        updateData.name = fallbackContactName;
      }

      if (!conversation.leadId && matchedLead) {
        updateData.leadId = matchedLead.id;
      }
      conversation = await prisma.conversation.update({
        where: { id: conversation.id },
        data: updateData,
      });
    }

    // 4. Salva a mensagem
    // Verifica se a mensagem já existe para evitar duplicatas por reenvio
    let message = null;
    if (remoteId) {
      message = await prisma.message.findFirst({
        where: {
          remoteId,
          conversationId: conversation.id,
        },
      });
    }

    if (!message) {
      message = await prisma.message.create({
        data: {
          remoteId,
          content,
          direction,
          status: 'DELIVERED',
          messageType,
          mediaUrl,
          senderName: pushName,
          conversationId: conversation.id,
        },
      });

      // 5. Registra atividade no lead se estiver vinculado
      if (conversation.leadId) {
        const excerpt = content.length > 60 ? content.substring(0, 57) + '...' : content;
        await prisma.activity.create({
          data: {
            leadId: conversation.leadId,
            type: 'LOG',
            content: `${direction === 'INBOUND' ? 'Recebido' : 'Enviado'} no WhatsApp: "${excerpt}"`,
          },
        });
      }
    }

    return NextResponse.json({ success: true, messageId: message.id });
  } catch (err: any) {
    console.error('Erro no processamento do webhook do WhatsApp:', err);
    return NextResponse.json({ error: 'Erro interno no servidor.', details: err.message }, { status: 500 });
  }
}
