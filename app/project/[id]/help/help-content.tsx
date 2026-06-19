'use client';

import React, { useState, useMemo } from 'react';
import Link from 'next/link';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { 
  Map, 
  Webhook, 
  UploadCloud, 
  Users2, 
  CheckCircle2, 
  ArrowRight, 
  ExternalLink, 
  Copy, 
  Check, 
  HelpCircle, 
  Info, 
  Search,
  BookOpen,
  Sliders,
  AlertCircle,
  FileText,
  Lock,
  Calendar
} from 'lucide-react';

interface HelpContentProps {
  projectId: string;
  projectRole: string;
  markdown: string;
}

export function HelpContent({ projectId, projectRole, markdown }: HelpContentProps) {
  const [activeTab, setActiveTab] = useState<'interactive' | 'raw'>('interactive');
  const [activeSection, setActiveSection] = useState<string>('kanban');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [copiedText, setCopiedText] = useState<string | null>(null);
  const [checkedSteps, setCheckedSteps] = useState<Record<string, boolean>>({});

  const isAdmin = projectRole === 'PROJECT_ADMIN' || projectRole === 'SUPERADMIN';

  // Copiar texto para a área de transferência
  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedText(id);
    setTimeout(() => setCopiedText(null), 2000);
  };

  // Toggle do checklist de passos
  const toggleStep = (sectionId: string, stepIndex: number) => {
    const key = `${sectionId}-${stepIndex}`;
    setCheckedSteps(prev => ({
      ...prev,
      [key]: !prev[key]
    }));
  };

  // Definição das seções interativas estruturadas baseadas no manual
  const sections = useMemo(() => [
    {
      id: 'kanban',
      title: '1. Criar um Novo Kanban',
      subtitle: 'Como gerenciar lançamentos, eventos ou campanhas temporárias de forma isolada.',
      icon: <Map className="h-5 w-5" />,
      link: {
        href: `/project/${projectId}/settings?tab=funnels`,
        label: 'Ir para Configuração de Funis',
        adminOnly: true
      },
      steps: [
        {
          text: 'Acesse o seu projeto no painel principal do CRM.',
        },
        {
          text: 'No menu lateral esquerdo, clique em Configurações (ícone de engrenagem).',
        },
        {
          text: 'Selecione a aba Funis & Estágios no topo do menu de configurações.',
        },
        {
          text: 'No campo Novo Funil de Evento / Lançamento, digite o nome desejado.',
          example: 'Lançamento Junho 2026'
        },
        {
          text: 'Clique em Criar Funil. A página recarregará e o funil será criado com 3 estágios padrão.',
        },
        {
          text: 'No seletor Funil Ativo para Configuração, escolha o funil que acabou de criar.',
        },
        {
          text: 'Na seção de estágios abaixo, personalize as colunas do seu Kanban: exclua clicando na lixeira vermelha ou adicione novos estágios informando nome e cor.',
          example: 'Inscrito no Lançamento'
        }
      ],
      notes: [
        'A exclusão de um Kanban (Pipeline) apagará todas as participações dos leads associadas àquele funil específico (PipelineEntry).',
        'Os dados do Lead em si (nome, e-mail, telefone) e de outros funis continuarão preservados (soft-delete).'
      ]
    },
    {
      id: 'webhook',
      title: '2. Configurar Webhook',
      subtitle: 'Capturar leads externos de WordPress, Elementor, Kiwify, Hotmart, etc.',
      icon: <Webhook className="h-5 w-5" />,
      link: {
        href: `/project/${projectId}/settings?tab=webhooks`,
        label: 'Ir para Configuração de Webhooks',
        adminOnly: true
      },
      steps: [
        {
          text: 'No menu de Configurações, selecione a aba Webhooks de Entrada.',
        },
        {
          text: 'No campo Nome da Integração, dê um nome descritivo para identificar a origem dos leads.',
          example: 'Formulário Página de Captura Elementor'
        },
        {
          text: 'No seletor Estágio de Destino, procure o estágio desejado. O sistema agrupa os estágios por funil.',
          example: 'Lançamento Junho 2026 > Inscrito no Lançamento'
        },
        {
          text: 'No campo Origem Associada, selecione o canal correspondente ou deixe em branco.',
          example: 'WordPress'
        },
        {
          text: 'Na seção Mapeamento de Campos, digite o nome exato dos campos JSON enviados pela sua plataforma externa nos inputs correspondentes (Nome do Lead, E-mail, Telefone).',
          example: 'nome, email, whatsapp'
        },
        {
          text: 'Clique em Adicionar.',
        },
        {
          text: 'Na listagem de Webhooks abaixo, localize a integração criada e clique em Copiar Link.',
        },
        {
          text: 'Cole essa URL no painel da sua plataforma externa (Elementor, Kiwify, Make/Zapier).',
        }
      ],
      notes: [
        'Como cada estágio pertence exclusivamente a um único Kanban, ao rotear a integração para o estágio correto, o lead entrará automaticamente no funil desejado.'
      ]
    },
    {
      id: 'csv',
      title: '3. Importar Leads via CSV',
      subtitle: 'Subir planilhas de contatos diretamente para um funil e etapa específicos.',
      icon: <UploadCloud className="h-5 w-5" />,
      link: {
        href: `/project/${projectId}/leads`,
        label: 'Ir para Lista de Leads',
        adminOnly: false
      },
      steps: [
        {
          text: 'No menu lateral do projeto, clique em Leads.',
        },
        {
          text: 'No topo direito da lista de leads, clique em Importar CSV.',
        },
        {
          text: 'Clique na área tracejada ou arraste seu arquivo .csv para selecioná-lo.',
        },
        {
          text: 'No modal que se abre, no dropdown Funil de Destino (Kanban), selecione o funil desejado.',
          example: 'Lançamento Junho 2026'
        },
        {
          text: 'No dropdown Estágio Comercial de Destino, escolha a etapa inicial desejada.',
          example: 'Inscrito no Lançamento'
        },
        {
          text: 'Mapeie as colunas do seu arquivo CSV correspondentes aos campos do CRM (Nome, E-mail, Telefone).',
        },
        {
          text: 'Clique em Ver Prévia para certificar que os dados das primeiras 5 linhas estão corretos, e depois clique em Iniciar Importação.',
        }
      ],
      notes: [
        'O sistema processa em lote de forma deduplicada e exibe o resumo de sucessos e falhas no final da importação.',
        'Se o lead já existia no CRM, ele preservará os dados antigos, mas ganhará uma nova participação ativa no funil de evento configurado.'
      ]
    },
    {
      id: 'roundrobin',
      title: '4. Rodízio de Vendas (Round-Robin)',
      subtitle: 'Definir quais comerciais (vendedores) devem receber os novos leads em rodízio.',
      icon: <Users2 className="h-5 w-5" />,
      link: {
        href: `/project/${projectId}/settings?tab=comerciais`,
        label: 'Ir para Comerciais e Distribuição',
        adminOnly: true
      },
      steps: [
        {
          text: 'No menu de Configurações, selecione a aba Comerciais e Distribuição.',
        },
        {
          text: 'Na tabela exibida, você verá todos os membros da equipe associados ao projeto.',
        },
        {
          text: 'Marque a caixa de seleção Comercial Designado apenas para os vendedores que participarão da escala de atendimento ativo.',
        },
        {
          text: 'Clique em Salvar Comerciais.',
        },
        {
          text: 'A partir deste momento, qualquer novo lead cadastrado (que não tenha dono anterior) será alternado automaticamente em rodízio de fila (round-robin) entre os comerciais marcados.',
        }
      ],
      notes: [
        'Se o lead já pertencer a algum comercial em outro funil, a regra de rodízio é ignorada para respeitar o dono original da conta, garantindo fidelização.'
      ]
    },
    {
      id: 'form',
      title: '5. Criar e Incorporar um Formulário',
      subtitle: 'Capturar leads diretamente do WordPress com proteção honeypot e rate limiting.',
      icon: <FileText className="h-5 w-5" />,
      link: {
        href: `/project/${projectId}/settings?tab=forms`,
        label: 'Ir para Construtor de Formulários',
        adminOnly: true
      },
      steps: [
        {
          text: 'No menu de Configurações, selecione a aba Formulários.',
        },
        {
          text: 'Clique no botão Criar Formulário.',
        },
        {
          text: 'Defina o nome interno, funil de destino, estágio comercial de entrada e origem padrão do lead.',
          example: 'Landing Page Imersão'
        },
        {
          text: 'Configure os campos: reordene, remova ou torne-os obrigatórios. Lembre-se de manter E-mail ou Telefone ativo para deduplicação.',
        },
        {
          text: 'Adicione campos personalizados criados no projeto através do seletor dropdown e clique em Adicionar.',
        },
        {
          text: 'Salve as configurações, localize o formulário criado na listagem e clique em Embutir Code.',
        },
        {
          text: 'Clique em Copiar Código e cole-o no seu site WordPress em um bloco de HTML Personalizado.',
        }
      ],
      notes: [
        'O formulário gerado é limpo e sem estilo inline. Use as classes CSS .nfs-form, .nfs-field, .nfs-label, .nfs-input e .nfs-button para aplicar seu próprio design.',
        'A proteção honeypot (campo nfs_hp_website) descarta envios de robôs de spam de forma totalmente silenciosa.'
      ]
    },
    {
      id: 'utm',
      title: '6. Rastreamento de Campanhas (UTMs)',
      subtitle: 'Capturar e rastrear parâmetros de campanhas (UTMs) automaticamente sem configurações adicionais.',
      icon: <Sliders className="h-5 w-5" />,
      link: {
        href: `/project/${projectId}/settings?tab=forms`,
        label: 'Ir para Construtor de Formulários',
        adminOnly: false
      },
      steps: [
        {
          text: 'Monte as URLs das suas campanhas de anúncios adicionando os parâmetros UTM normais (ex: utm_source, utm_campaign, utm_medium, utm_term, utm_content).',
          example: 'https://seusite.com/?utm_source=fb&utm_campaign=blackfriday'
        },
        {
          text: 'O formulário gerado pelo CRM possui inputs invisíveis que lerão a URL automaticamente ao carregar a página.',
        },
        {
          text: 'Se o usuário navegar por outras páginas internas ou voltar depois sem UTM na URL, o script usará o localStorage para preservar os parâmetros UTM de sua primeira visita.',
        },
        {
          text: 'Ao preencher e enviar o formulário, os dados de campanha (UTMs, Referrer e Landing Page) serão transmitidos de forma silenciosa para o CRM.',
        },
        {
          text: 'Se for a primeira vez do lead, as UTMs originais serão salvas no perfil do lead (Regra do Primeiro Toque). Se for uma re-entrada, a origem original é mantida, e as novas UTMs são adicionadas à Timeline de Atividades.',
        },
        {
          text: 'Consulte os dados clicando em qualquer Lead no Kanban ou na Lista de Leads para abrir a gaveta de detalhes, localizando a seção "Dados de Rastreamento (UTMs)".',
        }
      ],
      notes: [
        'A captura de referrer guarda a página de onde o usuário veio (ex: google.com, instagram.com).',
        'A captura da página do formulário (Landing Page) ajuda a identificar de qual página exata o lead converteu no seu WordPress.'
      ]
    },
    {
      id: 'recovery',
      title: '7. Recuperação de Senha',
      subtitle: 'Como recuperar o acesso à plataforma de forma rápida e segura.',
      icon: <Lock className="h-5 w-5" />,
      steps: [
        {
          text: 'Na página de login principal do CRM, clique em "Esqueci minha senha" acima do campo de Senha.',
        },
        {
          text: 'Digite seu endereço de e-mail cadastrado e clique em "Recuperar Senha".',
          example: 'admin@nofrontscale.com.br'
        },
        {
          text: 'Na tela de sucesso, se estiver em ambiente local de testes, localize o bloco laranja de simulação e clique em "Redefinir Senha de Teste".',
        },
        {
          text: 'Na página segura de redefinição de senha, digite a sua nova senha (mínimo 6 caracteres).',
        },
        {
          text: 'Confirme a nova senha digitando-a novamente e clique em "Salvar Nova Senha".',
        },
        {
          text: 'Após a confirmação de sucesso, clique em "Ir para o Login" e entre usando a sua nova credencial.',
        }
      ],
      notes: [
        'O link de redefinição gerado expira automaticamente em 1 hora por motivos de segurança.',
        'A redefinição usa criptografia de ponta a ponta (bcryptjs) para salvar o novo hash de forma segura no banco de dados PostgreSQL.'
      ]
    },
    {
      id: 'calendar',
      title: '8. Integrar Agenda Pessoal',
      subtitle: 'Como conectar o Google Agenda e Outlook Calendar para sincronizar tarefas.',
      icon: <Calendar className="h-5 w-5" />,
      link: {
        href: `/project/${projectId}/settings?tab=calendar`,
        label: 'Ir para Minha Agenda',
        adminOnly: false
      },
      steps: [
        {
          text: 'No menu lateral esquerdo, clique em Configurações (ícone de engrenagem).',
        },
        {
          text: 'Selecione a aba Minha Agenda (no final do menu lateral de configurações).',
        },
        {
          text: 'Escolha seu provedor e clique em Conectar Google Agenda ou Conectar Outlook Agenda.',
        },
        {
          text: 'Autentique-se e conceda as permissões de acesso ao seu calendário pessoal na tela de consentimento.',
        },
        {
          text: 'Verifique se a conta conectada exibe o status "Integrado" e o e-mail da sua agenda.',
        },
        {
          text: 'Crie uma nova tarefa com data de vencimento no CRM e confirme se ela aparece automaticamente na sua agenda conectada.',
        }
      ],
      notes: [
        'Cada usuário do CRM tem a sua própria conexão de agenda privada e individual.',
        'A sincronização é instantânea para criação, edição e exclusão de tarefas.'
      ]
    }
  ], [projectId]);

  // Filtragem de seções por busca
  const filteredSections = useMemo(() => {
    if (!searchQuery.trim()) return sections;
    return sections.filter(sec => 
      sec.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      sec.subtitle.toLowerCase().includes(searchQuery.toLowerCase()) ||
      sec.steps.some(step => step.text.toLowerCase().includes(searchQuery.toLowerCase()))
    );
  }, [sections, searchQuery]);

  return (
    <div className="p-6 md:p-8 space-y-8 max-w-6xl mx-auto">
      {/* HEADER */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border-subtle pb-6">
        <div>
          <h1 className="text-2xl md:text-3xl font-extrabold text-white tracking-tight font-display flex items-center gap-2">
            <HelpCircle className="h-7 w-7 text-accent" />
            Central de Ajuda & Manual
          </h1>
          <p className="text-sm text-text-secondary mt-1">
            Encontre guias práticos sobre como operar múltiplos Kanbans, webhooks, importações e o rodízio de leads.
          </p>
        </div>

        {/* CONTROLES DE MODO */}
        <div className="flex items-center gap-2 self-start md:self-auto bg-glass-2 border border-border-subtle rounded-lg p-1">
          <button
            onClick={() => setActiveTab('interactive')}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
              activeTab === 'interactive' 
                ? 'bg-accent text-white shadow-md' 
                : 'text-text-secondary hover:text-white hover:bg-glass-2'
            }`}
          >
            <Sliders className="h-3.5 w-3.5" />
            Passo a Passo
          </button>
          <button
            onClick={() => setActiveTab('raw')}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
              activeTab === 'raw' 
                ? 'bg-accent text-white shadow-md' 
                : 'text-text-secondary hover:text-white hover:bg-glass-2'
            }`}
          >
            <BookOpen className="h-3.5 w-3.5" />
            Documento Completo
          </button>
        </div>
      </div>

      {/* MODO INTERATIVO */}
      {activeTab === 'interactive' && (
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
          {/* SIDEBAR DE PESQUISA & SEÇÕES */}
          <div className="lg:col-span-1 space-y-4">
            {/* Campo de Pesquisa */}
            <div className="relative">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-text-secondary" />
              <input
                type="text"
                placeholder="Pesquisar ajuda..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-2 text-xs bg-glass-2 border border-border-subtle rounded-lg focus:outline-none focus:border-accent text-white placeholder-text-tertiary transition-all"
              />
            </div>

            {/* Lista de Seções */}
            <div className="space-y-1.5">
              {filteredSections.map((sec) => (
                <button
                  key={sec.id}
                  onClick={() => setActiveSection(sec.id)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left text-xs font-semibold border transition-all ${
                    activeSection === sec.id
                      ? 'bg-accent/10 border-accent/30 text-white'
                      : 'border-transparent text-text-secondary hover:text-white hover:bg-glass-2'
                  }`}
                >
                  <span className={activeSection === sec.id ? 'text-accent' : 'text-text-secondary'}>
                    {sec.icon}
                  </span>
                  <span className="truncate">{sec.title.split('. ')[1] || sec.title}</span>
                </button>
              ))}

              {filteredSections.length === 0 && (
                <p className="text-xs text-text-secondary italic text-center py-4">
                  Nenhum resultado encontrado.
                </p>
              )}
            </div>

            {/* Alerta de Acesso */}
            <div className="bg-glass-1 border border-border-subtle rounded-xl p-4 space-y-2">
              <div className="flex items-center gap-2 text-xs font-bold text-accent">
                <Info className="h-4 w-4" />
                Permissões de Acesso
              </div>
              <p className="text-[11px] text-text-secondary leading-relaxed">
                Este manual está disponível para todos os membros. No entanto, configurações avançadas como criação de Kanbans, webhooks e rodízios exigem privilégios de <strong>Administrador do Projeto</strong>.
              </p>
            </div>
          </div>

          {/* ÁREA DE CONTEÚDO DA SEÇÃO SELECIONADA */}
          <div className="lg:col-span-3 space-y-6">
            {(() => {
              const current = sections.find(s => s.id === activeSection);
              if (!current) return null;

              return (
                <div className="bg-glass-1 border border-border-subtle rounded-2xl p-6 md:p-8 shadow-xl space-y-8 relative overflow-hidden backdrop-blur-xl">
                  {/* Decorativo Fundo */}
                  <div className="absolute top-0 right-0 h-40 w-40 bg-accent/5 rounded-full blur-3xl pointer-events-none" />

                  {/* Header da Seção */}
                  <div className="border-b border-border-subtle pb-6 space-y-2">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-xl bg-accent/10 border border-accent/20 flex items-center justify-center text-accent">
                        {current.icon}
                      </div>
                      <div>
                        <h2 className="text-xl font-bold text-white font-display">{current.title}</h2>
                        <p className="text-xs text-text-secondary">{current.subtitle}</p>
                      </div>
                    </div>
                  </div>

                  {/* TIMELINE DE PASSOS */}
                  <div className="space-y-6">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-text-secondary">Procedimento Passo a Passo</h3>
                    
                    <div className="relative pl-6 border-l border-border-subtle space-y-8">
                      {current.steps.map((step, idx) => {
                        const stepKey = `${current.id}-${idx}`;
                        const isChecked = checkedSteps[stepKey] || false;

                        return (
                          <div key={idx} className="relative group">
                            {/* Ponto na timeline */}
                            <button
                              onClick={() => toggleStep(current.id, idx)}
                              className={`absolute -left-[35px] top-0.5 h-[18px] w-[18px] rounded-full border flex items-center justify-center transition-all ${
                                isChecked 
                                  ? 'bg-accent border-accent text-white' 
                                  : 'bg-bg-base border-[rgba(255,255,255,0.2)] hover:border-accent text-transparent group-hover:text-accent-light'
                              }`}
                            >
                              <Check className="h-3 w-3 stroke-[3px]" />
                            </button>

                            {/* Conteúdo do Passo */}
                            <div className="space-y-2">
                              <span className="text-[10px] font-bold text-accent uppercase">Passo {idx + 1}</span>
                              <p className={`text-xs text-white leading-relaxed ${isChecked ? 'line-through text-text-secondary opacity-60' : ''}`}>
                                {step.text}
                              </p>

                              {/* Exemplo associado se houver */}
                              {step.example && (
                                <div className="inline-flex items-center gap-2 bg-glass-2 border border-border-subtle rounded-md px-3 py-1.5">
                                  <span className="text-[10px] text-text-secondary font-mono">Exemplo:</span>
                                  <code className="text-xs font-mono text-accent-light font-semibold">{step.example}</code>
                                  <button
                                    onClick={() => handleCopy(step.example || '', `${stepKey}-copy`)}
                                    className="p-1 text-text-secondary hover:text-white rounded transition-colors"
                                    title="Copiar exemplo"
                                  >
                                    {copiedText === `${stepKey}-copy` ? (
                                      <Check className="h-3.5 w-3.5 text-accent" />
                                    ) : (
                                      <Copy className="h-3.5 w-3.5" />
                                    )}
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* NOTAS E DETALHES IMPORTANTES */}
                  {current.notes && current.notes.length > 0 && (
                    <div className="bg-accent-glow/5 border border-accent/20 rounded-xl p-5 space-y-3">
                      <h4 className="text-xs font-bold text-accent-light flex items-center gap-2">
                        <AlertCircle className="h-4 w-4" />
                        Notas Importantes
                      </h4>
                      <ul className="space-y-2 pl-4 list-disc text-xs text-text-secondary leading-relaxed">
                        {current.notes.map((note, nIdx) => (
                          <li key={nIdx}>{note}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* LINK DE AÇÃO CONTEXTUAL */}
                  {current.link && (
                    <div className="border-t border-border-subtle pt-6 flex flex-col md:flex-row items-center justify-between gap-4">
                      <div className="text-xs text-text-secondary text-center md:text-left">
                        {current.link.adminOnly ? (
                          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold ${
                            isAdmin 
                              ? 'bg-accent/15 text-accent-light border border-accent/30' 
                              : 'bg-danger/15 text-danger border border-danger/30'
                          }`}>
                            {isAdmin ? 'Você possui acesso' : 'Requer cargo de Administrador'}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold bg-glass-4 text-text-secondary border border-border-subtle">
                            Disponível para todos os níveis
                          </span>
                        )}
                      </div>

                      {(!current.link.adminOnly || isAdmin) ? (
                        <Link
                          href={current.link.href}
                          className="flex items-center gap-2 bg-accent hover:bg-accent-light text-white text-xs font-bold px-4 py-2.5 rounded-lg transition-all shadow-lg shadow-accent-glow/20"
                        >
                          {current.link.label}
                          <ArrowRight className="h-3.5 w-3.5" />
                        </Link>
                      ) : (
                        <button
                          disabled
                          className="flex items-center gap-2 bg-glass-2 text-text-tertiary text-xs font-bold px-4 py-2.5 border border-border-subtle rounded-lg cursor-not-allowed"
                        >
                          Acesso Bloqueado
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {/* MODO DOCUMENTO COMPLETO (RAW MARKDOWN) */}
      {activeTab === 'raw' && (
        <div className="bg-glass-1 border border-border-subtle rounded-2xl p-6 md:p-10 shadow-xl backdrop-blur-xl">
          <div className="max-w-none prose prose-invert prose-headings:font-display prose-headings:font-bold prose-h1:text-2xl prose-h2:text-lg prose-p:text-xs prose-li:text-xs prose-strong:text-white prose-code:text-accent-light prose-code:bg-glass-2 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:before:content-none prose-code:after:content-none leading-relaxed">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {markdown}
            </ReactMarkdown>
          </div>
        </div>
      )}
    </div>
  );
}
