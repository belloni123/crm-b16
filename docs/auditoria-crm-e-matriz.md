# Auditoria do CRM B16 e matriz funcional

Data da auditoria: 2026-09-01. Este documento registra apenas metadados técnicos e contagens; nenhum dado pessoal ou segredo é reproduzido.

## Versão oficial e consolidação

- Cópia oficial: pasta `CRM B16` no Google Drive compartilhado da Agência B16.
- Repositório: `belloni123/crm-b16`.
- Branch de produção antes desta evolução: `main`.
- Commit local, remoto e código do container antes da evolução: `acfd61e1517d41b4988cf41161d93524c2785050`.
- Coolify: aplicação de produção baseada em `main`, Compose `docker-compose.yml`.
- A pasta `Desktop/CRM B16` não é repositório e contém somente dependências geradas.
- A pasta `Desktop/crm-trycompai` é o CRM de referência, não uma cópia da B16.
- A referência possui alterações locais de modo demo/bypass de autenticação. Elas foram classificadas como inseguras e não foram incorporadas.

## CRM de referência

- Origem: `trycompai/crm`, branch `release`, licença MIT.
- Stack: monorepo Bun/Turborepo, Next.js, NestJS/tRPC, Prisma/PostgreSQL e Better Auth.
- Pontos fortes aproveitados como padrão arquitetural: campos dinâmicos tipados, chaves internas imutáveis, arquivamento sem apagar valores, ordenação transacional, separação entre empresa/contato/negócio e cobertura de testes por pacote.
- A versão local estava 14 commits atrás do `origin/release` no momento da auditoria; o remoto foi consultado com `fetch`, sem `pull`, merge ou rebase.

## Matriz comparativa

Legenda de risco: B = baixo, M = médio, A = alto. Prioridade: P0 a P3.

| Funcionalidade | Referência | B16 antes | Qualidade B16 | Compatibilidade / banco | Risco | Prioridade | Estratégia |
|---|---:|---:|---|---|---:|---:|---|
| Workspaces/projetos isolados | Sim | Sim | Boa | Nativa; sem mudança | B | P0 | Preservar `projectId` e autorização |
| Usuários e membros | Sim | Sim | Boa | Nativa | B | P0 | Preservar |
| Papéis e permissões | Sim | Sim | Média | Nativa; reforçar checagens cruzadas | M | P0 | Validar todo recurso contra projeto |
| Empresas | Sim | Parcial (`company` no lead) | Básica | Novas tabelas e migração | A | P2 | Modelar entidade sem quebrar campo legado |
| Contatos | Sim | Parcial (lead) | Básica | Novas tabelas/relacionamentos | A | P2 | Separar gradualmente |
| Leads/oportunidades | Sim | Sim | Boa | Nativa | M | P0 | Evoluir sem trocar IDs |
| Múltiplos pipelines | Sim | Sim | Boa | Nativa | B | P0 | Preservar |
| Kanban | Não configurável como B16 | Sim | Boa | `Stage.order` já existente | B | P0 | Reordenação transacional |
| Reordenação de etapas | Não | Não | Ausente | Sem alteração destrutiva | B | P0 | Arrastar + botões, rollback otimista |
| Tarefas | Não como módulo geral | Sim | Boa | Nativa | B | P1 | Preservar |
| Atividades/histórico | Parcial | Sim | Boa | Nativa | B | P0 | Preservar |
| Notas/comentários | Parcial | Sim | Média | Nativa | B | P1 | Evoluir em lote futuro |
| Campos personalizados | Sim | Parcial | Básica | Colunas aditivas + índices | M | P0 | Tipos, regras, ordem, pausa e arquivo |
| Campos em formulários | Não | Sim parcial | Média | Nativa | M | P0 | Validar tipos e múltipla seleção |
| Formulários embutidos | Não | Sim | Boa | Nativa | M | P0 | Preservar contratos e corrigir honeypot |
| Webhooks de entrada | Não | Sim | Média | Preservado e classificado como `INCOMING` | M | P0 | Compatibilidade integral |
| Webhooks de saída | Não | Não | Ausente | Colunas/logs aditivos | M | P0 | Eventos, payload, teste e reenvio |
| Importação | Sim | Sim | Média | Nativa | M | P1 | Validar campos por projeto |
| Exportação | Sim | Sim | Média | Sem banco | B | P1 | Incluir campos dinâmicos de modo estável |
| Busca global | Sim | Parcial por módulo | Média | Índices/serviço futuro | M | P1 | Busca unificada incremental |
| Filtros | Sim | Sim, sem construtor dinâmico | Média | Índices por campo futuro | M | P1 | Filtros customizados em fase posterior |
| Paginação | Sim | Parcial | Média | Sem migração | M | P1 | Cursor para listas grandes |
| Dashboard/relatórios | Sim | Sim | Média | Agregações/consultas | M | P1 | KPIs e funil por período |
| E-mail e calendário | Sim | Calendário | Média | Credenciais/integradores | A | P2 | Integrar por provedor com consentimento |
| WhatsApp | Não | Sim | Boa | Nativa | M | P0 | Preservar Evolution API |
| Slack | Sim | Não | Ausente | Nova integração | M | P3 | Implementar sob demanda |
| SSO | Sim | Não | Ausente | Auth e configuração | A | P3 | Planejar sem alterar login atual |
| Convites de membros | Sim | Parcial/admin | Média | Tokens/fluxo | M | P2 | Fluxo auditável |
| Moedas | Sim | Valor numérico | Básica | Preferência de workspace | M | P2 | Adicionar ISO 4217 depois |
| Tracking de website | Sim | UTM/referrer | Média | Eventos novos | M | P2 | Evoluir coleta com consentimento |
| Automações/agente | Sim | Não | Ausente | Filas, auditoria e limites | A | P3 | Projeto separado |
| Anexos/uploads | Sim | Sim | Média | Storage existente | M | P1 | Revisar limites e antivírus |
| API pública | Parcial | Sim | Média | Compatível | M | P1 | Versionar e documentar |
| Logs de auditoria | Parcial | Atividades + logs | Média | Tabela dedicada futura | M | P1 | Auditoria imutável futura |
| Responsividade | Sim | Sim | Boa | Frontend | B | P0 | Manter identidade B16 |
| Acessibilidade | Parcial | Parcial | Média | Frontend | M | P1 | Teclado, foco e rótulos |
| Testes | Ampla suíte por pacotes | Ausentes | Fraca | Infra de testes | M | P0 | Node test + integração progressiva |
| Tratamento de erros | Bom | Parcial | Média | Sem banco | M | P0 | Mensagens e rollback otimista |
| Segurança de deploy | Adequada | Segredos no Compose | Crítica | Variáveis Coolify | A | P0 | Remover, rotacionar, verificar |

## Escopo incorporado nesta entrega

- Modelo completo de campos personalizados, 13 tipos, regras, opções, nome interno, ajuda, padrão, obrigatoriedade, ordem, pausa e arquivamento sem apagar valores.
- Renderização tipada em leads, Kanban e formulários; validação no servidor e isolamento por projeto.
- Webhooks de saída configuráveis, sem alterar tokens ou contratos dos endpoints de entrada existentes.
- Reordenação das etapas do Kanban com persistência transacional, IDs e leads preservados.
- Reforço das validações de pertencimento projeto/pipeline/etapa/campo.
- Healthcheck, migration versionada e remoção de seed/`db push` do boot de produção.

## Itens deliberadamente pendentes

Empresas/contatos separados, busca global, filtros por campos personalizados, paginação por cursor, relatórios avançados, Slack, SSO, moedas, automações e agente não foram misturados a esta entrega. Todos exigem contratos e migrations próprios; incorporá-los de uma vez elevaria desnecessariamente o risco sobre a produção. A ordem recomendada é: paginação/filtros, busca, auditoria, empresas/contatos, relatórios e somente depois integrações/automações.
