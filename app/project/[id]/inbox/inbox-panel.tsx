'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { 
  getWhatsAppConversations, 
  getWhatsAppMessages, 
  sendWhatsAppMessage, 
  associateLeadToConversation 
} from '@/app/actions/whatsapp';
import { 
  Send, 
  Paperclip, 
  Image as ImageIcon, 
  File as FileIcon, 
  Music as AudioIcon, 
  Search, 
  User, 
  Link2, 
  X, 
  Plus, 
  Loader2, 
  Check, 
  CheckCheck,
  AlertCircle,
  MessageSquare,
  Building2,
  Phone,
  ExternalLink
} from 'lucide-react';

interface Lead {
  id: string;
  name: string;
  phone: string | null;
  company: string | null;
}

interface WhatsAppInstance {
  id: string;
  name: string;
  instanceName: string;
  status: string;
  type: string;
}

interface Message {
  id: string;
  remoteId: string | null;
  content: string;
  direction: string;
  status: string;
  messageType: string;
  mediaUrl: string | null;
  senderName: string | null;
  createdAt: Date;
}

interface Conversation {
  id: string;
  whatsappId: string;
  name: string;
  lastMessageAt: Date;
  leadId: string | null;
  lead?: Lead | null;
  instance: {
    name: string;
    instanceName: string;
    type: string;
  };
  messages: Message[];
}

interface InboxPanelProps {
  projectId: string;
  initialConversations: Conversation[];
  whatsappInstances: WhatsAppInstance[];
  leads: Lead[];
}

export function InboxPanel({ projectId, initialConversations, whatsappInstances, leads }: InboxPanelProps) {
  const [conversations, setConversations] = useState<Conversation[]>(initialConversations);
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const searchParams = useSearchParams();
  const selectedParam = searchParams?.get('selected') || null;

  useEffect(() => {
    if (selectedParam) {
      setSelectedConversationId(selectedParam);
    }
  }, [selectedParam]);

  const [messages, setMessages] = useState<Message[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [inputText, setInputText] = useState('');
  const [isSending, setIsSending] = useState(false);
  
  // Estados de vinculação de leads
  const [isLinking, setIsLinking] = useState(false);
  const [showLeadSelector, setShowLeadSelector] = useState(false);
  const [leadSearchQuery, setLeadSearchQuery] = useState('');

  // Dropdown de anexos
  const [showAttachments, setShowAttachments] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);

  // Referência do input de arquivo oculto
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [attachmentType, setAttachmentType] = useState<'IMAGE' | 'AUDIO' | 'DOCUMENT'>('IMAGE');

  // Referência para scroll das mensagens
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);

  // Encontra a conversa ativa selecionada
  const activeConversation = conversations.find(c => c.id === selectedConversationId);

  // 1. Polling de Atualização de Dados (a cada 5 segundos)
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        // Atualiza a lista de conversas
        const updatedConversations = await getWhatsAppConversations(projectId);
        setConversations(updatedConversations as any);

        // Se houver uma conversa aberta, atualiza as mensagens dela
        if (selectedConversationId) {
          const updatedMessages = await getWhatsAppMessages(projectId, selectedConversationId);
          
          // Verifica se houve novas mensagens para forçar scroll
          setMessages(prev => {
            const hasNew = updatedMessages.length > prev.length;
            if (hasNew) {
              setTimeout(scrollToBottom, 50);
            }
            return updatedMessages as any;
          });
        }
      } catch (err) {
        console.error('Erro no polling do Inbox:', err);
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [projectId, selectedConversationId]);

  // 2. Quando seleciona uma conversa, carrega as mensagens imediatamente
  useEffect(() => {
    if (selectedConversationId) {
      const loadMessages = async () => {
        try {
          const fetchedMessages = await getWhatsAppMessages(projectId, selectedConversationId);
          setMessages(fetchedMessages as any);
          setTimeout(scrollToBottom, 50);
        } catch (err) {
          console.error(err);
        }
      };
      loadMessages();
      setShowLeadSelector(false);
      setLeadSearchQuery('');
    } else {
      setMessages([]);
    }
  }, [selectedConversationId]);

  function scrollToBottom() {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }

  // 3. Envio de mensagem de texto
  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim() || !selectedConversationId || isSending) return;

    setIsSending(true);
    const textToSend = inputText;
    setInputText('');

    try {
      const newMsg = await sendWhatsAppMessage(projectId, selectedConversationId, textToSend, 'TEXT', null);
      
      // Adiciona localmente na tela para feedback instantâneo
      setMessages(prev => [...prev, newMsg as any]);
      
      // Atualiza a lista de conversas para ordenar por última mensagem
      const updatedConversations = await getWhatsAppConversations(projectId);
      setConversations(updatedConversations as any);

      setTimeout(scrollToBottom, 50);
    } catch (err) {
      console.error(err);
    } finally {
      setIsSending(false);
    }
  };

  // 4. Envio de Arquivos (Convertidos em Base64 localmente no navegador)
  const triggerFileInput = (type: 'IMAGE' | 'AUDIO' | 'DOCUMENT') => {
    setAttachmentType(type);
    setShowAttachments(false);
    setFileError(null);
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedConversationId) return;

    // Limite de tamanho de 5MB
    const limitBytes = 5 * 1024 * 1024;
    if (file.size > limitBytes) {
      setFileError('Arquivo muito grande. O limite máximo é de 5MB.');
      return;
    }

    setIsSending(true);
    setFileError(null);

    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const base64 = reader.result as string;
        
        // Envia o arquivo usando o nome dele como conteúdo (legível) e o base64 como URL
        const newMsg = await sendWhatsAppMessage(
          projectId, 
          selectedConversationId, 
          file.name, 
          attachmentType, 
          base64
        );

        setMessages(prev => [...prev, newMsg as any]);
        
        // Reseta campo de arquivo
        if (e.target) e.target.value = '';

        const updatedConversations = await getWhatsAppConversations(projectId);
        setConversations(updatedConversations as any);

        setTimeout(scrollToBottom, 50);
      } catch (err: any) {
        console.error(err);
        setFileError(err.message || 'Falha ao enviar arquivo.');
      } finally {
        setIsSending(false);
      }
    };
    reader.onerror = () => {
      setFileError('Erro ao ler o arquivo físico.');
      setIsSending(false);
    };
    reader.readAsDataURL(file);
  };

  // 5. Vincular conversa a um Lead existente
  const handleLinkLead = async (leadId: string | null) => {
    if (!selectedConversationId) return;
    setIsLinking(true);
    try {
      const updated = await associateLeadToConversation(projectId, selectedConversationId, leadId);
      
      // Atualiza a conversa na lista
      setConversations(prev => prev.map(c => c.id === selectedConversationId ? { ...c, leadId: updated.leadId, lead: updated.lead } : c));
      setShowLeadSelector(false);
    } catch (err) {
      console.error(err);
    } finally {
      setIsLinking(false);
    }
  };

  // Filtra conversas pelo termo de busca
  const filteredConversations = conversations.filter(c => 
    c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.whatsappId.includes(searchTerm)
  );

  // Filtra leads disponíveis para vinculação
  const filteredLeads = leads.filter(lead => 
    lead.name.toLowerCase().includes(leadSearchQuery.toLowerCase()) ||
    (lead.company && lead.company.toLowerCase().includes(leadSearchQuery.toLowerCase()))
  );

  return (
    <div className="flex-1 flex h-screen overflow-hidden bg-transparent">
      {/* 1. BARRA LATERAL: LISTA DE CHATS */}
      <div className="w-80 md:w-96 border-r border-border-subtle bg-[rgba(5,5,5,0.2)] backdrop-blur-lg flex flex-col flex-shrink-0">
        
        {/* Header da Barra Lateral */}
        <div className="p-4 border-b border-border-subtle space-y-3 flex-shrink-0">
          <div>
            <h1 className="text-lg font-extrabold font-display text-white tracking-tight">Inbox WhatsApp</h1>
            <p className="text-[10px] text-text-secondary">Central de conversas unificadas por instância de WhatsApp.</p>
          </div>

          {/* Status das Instâncias */}
          <div className="bg-[rgba(255,255,255,0.02)] border border-border-subtle p-2.5 rounded-lg space-y-1.5">
            <span className="text-[9px] font-bold text-accent uppercase tracking-wider block">Instâncias Ativas</span>
            {whatsappInstances.length === 0 ? (
              <p className="text-[10px] text-text-tertiary">Nenhuma instância cadastrada.</p>
            ) : (
              <div className="max-h-20 overflow-y-auto space-y-1 scrollbar-thin">
                {whatsappInstances.map(inst => (
                  <div key={inst.id} className="flex items-center justify-between text-[10px]">
                    <span className="text-white font-medium truncate max-w-[150px]">{inst.name}</span>
                    <span className={`px-1.5 py-0.5 rounded text-[8px] font-semibold ${
                      inst.status === 'CONNECTED' 
                        ? 'bg-accent/15 text-accent border border-accent/25' 
                        : 'bg-[rgba(255,255,255,0.03)] text-text-tertiary border border-border-subtle'
                    }`}>
                      {inst.status === 'CONNECTED' ? 'Conectado' : 'Desconectado'}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Campo de Busca */}
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-text-tertiary" />
            <input
              type="text"
              placeholder="Buscar conversa por nome..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-8.5 bg-bg-base border border-border-subtle rounded-lg px-3 py-1.5 text-xs text-white outline-none focus:border-accent"
            />
          </div>
        </div>

        {/* Lista de Conversas */}
        <div className="flex-1 overflow-y-auto divide-y divide-[rgba(255,255,255,0.03)] custom-scrollbar">
          {filteredConversations.length === 0 ? (
            <div className="p-8 text-center text-text-tertiary text-xs">
              Nenhuma conversa ativa encontrada.
            </div>
          ) : (
            filteredConversations.map((chat) => {
              const isActive = chat.id === selectedConversationId;
              const lastMessage = chat.messages?.[0];
              const isLeadLinked = !!chat.leadId;

              return (
                <div
                  key={chat.id}
                  onClick={() => setSelectedConversationId(chat.id)}
                  className={`p-3.5 flex gap-3 items-start cursor-pointer transition-all border-l-2 ${
                    isActive 
                      ? 'bg-[rgba(255,255,255,0.04)] border-accent' 
                      : 'hover:bg-[rgba(255,255,255,0.01)] border-transparent'
                  }`}
                >
                  {/* Avatar de Contato */}
                  <div className="h-10 w-10 rounded-lg bg-[rgba(255,255,255,0.03)] border border-border-subtle flex items-center justify-center text-text-secondary font-bold text-xs flex-shrink-0">
                    {chat.name.substring(0, 2).toUpperCase()}
                  </div>

                  {/* Detalhes da Conversa */}
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex items-center justify-between gap-1.5">
                      <h4 className="text-xs font-bold text-white truncate">{chat.name}</h4>
                      <span className="text-[9px] text-text-tertiary flex-shrink-0">
                        {new Date(chat.lastMessageAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>

                    <p className="text-[10px] text-text-tertiary truncate">
                      {lastMessage ? (
                        <>
                          <span className="font-semibold text-text-secondary">{lastMessage.direction === 'OUTBOUND' ? 'Você: ' : ''}</span>
                          {lastMessage.messageType !== 'TEXT' ? `[${lastMessage.messageType}] ` : ''}
                          {lastMessage.content}
                        </>
                      ) : (
                        'Sem mensagens'
                      )}
                    </p>

                    <div className="flex items-center justify-between pt-1">
                      <span className="text-[8px] px-1 bg-[rgba(255,255,255,0.05)] border border-border-subtle text-text-tertiary rounded">
                        via {chat.instance.name}
                      </span>
                      {isLeadLinked ? (
                        <span className="text-[8px] px-1.5 py-0.5 rounded bg-accent/10 border border-accent/20 text-accent font-semibold flex items-center gap-0.5">
                          <User className="h-2.5 w-2.5" />
                          Lead
                        </span>
                      ) : (
                        <span className="text-[8px] px-1.5 py-0.5 rounded bg-[rgba(255,255,255,0.02)] border border-border-subtle text-text-tertiary font-medium">
                          Não vinculado
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* 2. PAINEL DIREITO: ÁREA DE MENSAGENS */}
      <div className="flex-1 flex flex-col bg-[rgba(0,0,0,0.2)]">
        {activeConversation ? (
          <>
            {/* Header do Chat */}
            <div className="px-6 py-4 border-b border-border-subtle bg-[rgba(5,5,5,0.2)] backdrop-blur-lg flex justify-between items-center flex-shrink-0">
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-lg bg-accent/15 border border-border-glass flex items-center justify-center text-accent font-bold text-sm">
                  {activeConversation.name.substring(0, 2).toUpperCase()}
                </div>
                <div>
                  <h2 className="text-sm font-bold text-white">{activeConversation.name}</h2>
                  <p className="text-[10px] text-text-secondary flex items-center gap-1.5">
                    <Phone className="h-3 w-3 text-text-tertiary" />
                    +{activeConversation.whatsappId} • via {activeConversation.instance.name}
                  </p>
                </div>
              </div>

              {/* Interface de Vinculação com o Lead */}
              <div className="flex items-center gap-3">
                {activeConversation.lead ? (
                  <div className="bg-accent/5 border border-accent/20 rounded-lg p-2 flex items-center gap-2">
                    <div className="text-left">
                      <span className="text-[9px] text-text-tertiary block font-semibold">LEAD VINCULADO</span>
                      <span className="text-xs font-bold text-white">{activeConversation.lead.name}</span>
                    </div>
                    <button 
                      onClick={() => handleLinkLead(null)}
                      title="Desvincular Lead"
                      className="p-1 hover:bg-danger/10 hover:text-danger rounded cursor-pointer transition-all text-text-tertiary"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ) : (
                  <div className="relative">
                    {showLeadSelector ? (
                      <div className="absolute right-0 top-11 bg-bg-elevated border border-border-strong rounded-xl w-64 shadow-2xl p-3 z-30 space-y-2">
                        <div className="flex justify-between items-center">
                          <span className="text-[10px] font-bold text-accent uppercase tracking-wider">Vincular a Lead</span>
                          <button onClick={() => setShowLeadSelector(false)} className="text-text-tertiary hover:text-white">
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                        <input
                          type="text"
                          placeholder="Buscar lead..."
                          value={leadSearchQuery}
                          onChange={(e) => setLeadSearchQuery(e.target.value)}
                          className="w-full bg-bg-base border border-border-subtle rounded px-2.5 py-1.5 text-xs text-white outline-none"
                        />
                        <div className="max-h-40 overflow-y-auto space-y-1 custom-scrollbar">
                          {filteredLeads.length === 0 ? (
                            <p className="text-[10px] text-text-tertiary text-center py-2">Nenhum lead ativo.</p>
                          ) : (
                            filteredLeads.map(lead => (
                              <button
                                key={lead.id}
                                onClick={() => handleLinkLead(lead.id)}
                                disabled={isLinking}
                                className="w-full text-left p-2 rounded hover:bg-[rgba(255,255,255,0.03)] transition-all flex flex-col gap-0.5 text-xs border border-transparent hover:border-border-subtle"
                              >
                                <span className="font-bold text-white">{lead.name}</span>
                                {lead.company && <span className="text-[9px] text-text-tertiary">{lead.company}</span>}
                              </button>
                            ))
                          )}
                        </div>
                      </div>
                    ) : (
                      <button
                        onClick={() => setShowLeadSelector(true)}
                        className="px-3 py-1.5 bg-[rgba(255,255,255,0.02)] hover:bg-[rgba(255,255,255,0.05)] border border-border-subtle hover:border-text-secondary text-white text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 cursor-pointer"
                      >
                        <Link2 className="h-3.5 w-3.5 text-text-tertiary" />
                        Vincular Lead CRM
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Espaço de Mensagens (Body) */}
            <div 
              ref={messagesContainerRef}
              className="flex-1 overflow-y-auto p-6 space-y-4 custom-scrollbar bg-[rgba(5,5,5,0.1)]"
            >
              {messages.length === 0 ? (
                <div className="h-full flex items-center justify-center text-text-tertiary text-xs">
                  Nenhuma mensagem nesta conversa. Envie uma mensagem de texto ou mídia abaixo.
                </div>
              ) : (
                messages.map((msg) => {
                  const isOutbound = msg.direction === 'OUTBOUND';
                  return (
                    <div 
                      key={msg.id} 
                      className={`flex ${isOutbound ? 'justify-end' : 'justify-start'}`}
                    >
                      <div className={`max-w-[70%] rounded-2xl px-4 py-2.5 text-xs shadow-md border ${
                        isOutbound 
                          ? 'bg-accent/15 border-accent/30 text-white rounded-tr-none' 
                          : 'bg-[rgba(255,255,255,0.02)] border-border-subtle text-white rounded-tl-none'
                      }`}>
                        {/* Remetente se for Inbound */}
                        {!isOutbound && msg.senderName && (
                          <span className="text-[9px] font-bold text-accent block mb-1">{msg.senderName}</span>
                        )}

                        {/* Renderização conforme tipo de mensagem */}
                        {msg.messageType === 'IMAGE' && (
                          <div className="space-y-1.5 max-w-sm">
                            <img 
                              src={msg.mediaUrl || ''} 
                              alt="Mídia WhatsApp" 
                              className="rounded-lg max-h-60 object-cover w-full border border-border-subtle bg-black/40"
                              onError={(e) => {
                                // Fallback em caso de erro de carregamento de base64/url
                                e.currentTarget.style.display = 'none';
                              }}
                            />
                            <p className="leading-relaxed whitespace-pre-wrap">{msg.content || 'Imagem'}</p>
                          </div>
                        )}

                        {msg.messageType === 'AUDIO' && (
                          <div className="space-y-1.5">
                            <audio src={msg.mediaUrl || ''} controls className="h-8 max-w-[240px] opacity-90" />
                            <p className="text-[9px] text-text-tertiary italic">Áudio do WhatsApp</p>
                          </div>
                        )}

                        {msg.messageType === 'DOCUMENT' && (
                          <div className="flex items-center gap-3 bg-[rgba(255,255,255,0.03)] border border-border-subtle p-2 rounded-lg">
                            <FileIcon className="h-8 w-8 text-accent-light flex-shrink-0" />
                            <div className="min-w-0">
                              <p className="font-bold text-white truncate max-w-[180px]">{msg.content}</p>
                              <a 
                                href={msg.mediaUrl || '#'} 
                                download={msg.content}
                                target="_blank"
                                rel="noreferrer"
                                className="text-[10px] text-accent font-semibold hover:underline flex items-center gap-1 mt-0.5"
                              >
                                <ExternalLink className="h-3 w-3" />
                                Baixar Arquivo
                              </a>
                            </div>
                          </div>
                        )}

                        {msg.messageType === 'TEXT' && (
                          <p className="leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                        )}

                        {/* Rodapé do Balão de Mensagem (Data e Status) */}
                        <div className="flex items-center justify-end gap-1.5 mt-1.5">
                          <span className="text-[8px] text-text-tertiary font-medium">
                            {new Date(msg.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                          </span>
                          {isOutbound && (
                            <span className="text-accent flex-shrink-0">
                              {msg.status === 'READ' ? (
                                <CheckCheck className="h-3 w-3 text-accent" />
                              ) : (
                                <Check className="h-3 w-3 text-text-tertiary" />
                              )}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Alerta de erro de arquivo, se houver */}
            {fileError && (
              <div className="px-6 py-2 bg-danger/10 border-t border-danger/25 text-danger flex items-center gap-2 text-xs flex-shrink-0">
                <AlertCircle className="h-4 w-4" />
                <span className="font-semibold">{fileError}</span>
                <button onClick={() => setFileError(null)} className="ml-auto text-danger hover:underline font-bold">Fechar</button>
              </div>
            )}

            {/* Input Footer */}
            <div className="p-4 border-t border-border-subtle bg-[rgba(5,5,5,0.2)] backdrop-blur-lg flex-shrink-0">
              <form onSubmit={handleSendMessage} className="flex items-center gap-3 max-w-4xl mx-auto relative">
                
                {/* Inputs invisíveis de arquivo */}
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileChange}
                  className="hidden"
                  accept={
                    attachmentType === 'IMAGE' 
                      ? 'image/*' 
                      : attachmentType === 'AUDIO' 
                        ? 'audio/*' 
                        : 'application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain'
                  }
                />

                {/* Botão de Anexo */}
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setShowAttachments(!showAttachments)}
                    className="p-2.5 rounded-lg bg-[rgba(255,255,255,0.02)] hover:bg-[rgba(255,255,255,0.05)] border border-border-subtle text-text-secondary hover:text-white transition-all cursor-pointer"
                  >
                    <Paperclip className="h-4 w-4" />
                  </button>

                  {showAttachments && (
                    <div className="absolute left-0 bottom-12 bg-bg-elevated border border-border-strong rounded-xl w-44 shadow-2xl p-1.5 z-30 space-y-0.5">
                      <button
                        type="button"
                        onClick={() => triggerFileInput('IMAGE')}
                        className="w-full text-left px-3 py-2 text-xs text-text-secondary hover:text-white hover:bg-[rgba(255,255,255,0.03)] rounded-lg transition-all flex items-center gap-2"
                      >
                        <ImageIcon className="h-4 w-4 text-accent" />
                        Enviar Imagem
                      </button>
                      <button
                        type="button"
                        onClick={() => triggerFileInput('AUDIO')}
                        className="w-full text-left px-3 py-2 text-xs text-text-secondary hover:text-white hover:bg-[rgba(255,255,255,0.03)] rounded-lg transition-all flex items-center gap-2"
                      >
                        <AudioIcon className="h-4 w-4 text-accent" />
                        Enviar Áudio
                      </button>
                      <button
                        type="button"
                        onClick={() => triggerFileInput('DOCUMENT')}
                        className="w-full text-left px-3 py-2 text-xs text-text-secondary hover:text-white hover:bg-[rgba(255,255,255,0.03)] rounded-lg transition-all flex items-center gap-2"
                      >
                        <FileIcon className="h-4 w-4 text-accent" />
                        Enviar Documento
                      </button>
                    </div>
                  )}
                </div>

                {/* Input de Texto */}
                <input
                  required
                  type="text"
                  placeholder="Digite sua mensagem de texto..."
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  className="flex-1 bg-bg-base border border-border-subtle rounded-xl px-4 py-3 text-xs text-white outline-none focus:border-accent"
                />

                {/* Botão de Enviar */}
                <button
                  type="submit"
                  disabled={isSending || !inputText.trim()}
                  className="p-3 bg-accent text-black rounded-xl hover:bg-accent-light transition-all flex items-center justify-center cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                </button>
              </form>
            </div>
          </>
        ) : (
          /* Estado Vazio */
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center space-y-4">
            <div className="h-16 w-16 rounded-2xl bg-[rgba(255,255,255,0.01)] border border-border-subtle flex items-center justify-center text-text-tertiary">
              <MessageSquare className="h-8 w-8" />
            </div>
            <div>
              <h3 className="text-md font-bold text-white font-display">Nenhum Chat Selecionado</h3>
              <p className="text-xs text-text-secondary max-w-sm mt-1 mx-auto">
                Selecione uma conversa na lista lateral para visualizar o histórico de mensagens e responder seus leads.
              </p>
            </div>
            <div className="pt-4 flex justify-center gap-6 text-[10px] text-text-tertiary border-t border-[rgba(255,255,255,0.05)] w-full max-w-md">
              <div className="space-y-0.5">
                <span className="font-semibold text-white block">Decisor</span>
                <span>Contato chave</span>
              </div>
              <div className="space-y-0.5">
                <span className="font-semibold text-white block">ICP Ideal</span>
                <span>Perfil de cliente ideal</span>
              </div>
              <div className="space-y-0.5">
                <span className="font-semibold text-white block">High Ticket</span>
                <span>Oportunidade de alto valor</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
