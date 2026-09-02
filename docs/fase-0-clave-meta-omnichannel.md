# Fase 0 — diagnóstico e arquitetura CLAVE Meta Omnichannel

Data: 2026-09-02

Repositório auditado: `belloni123/crm-b16`

Branch e commit de referência: `main` em `215fa2de65b817cefa9c69bd7dd11d26c90fa527`

Este documento confronta o estado atual do CRM com o `PLANO_MESTRE_CLAVE_META_OMNICHANNEL.md`. Ele encerra somente a Fase 0: não contém implementação, migration executável nem autorização de deploy.

Documentos complementares:

- [ADR: modelo híbrido Evolution e Meta](./adr-001-provider-hibrido-evolution-meta.md)
- [Arquitetura, providers e infraestrutura](./arquitetura-omnichannel-providers.md)
- [Plano seguro de migrations e preservação dos leads](./plano-migrations-omnichannel.md)
- [Segurança, privacidade e consentimento](./seguranca-consentimento-omnichannel.md)
- [Checklist manual do Meta Developers](./checklist-meta-developers-clave.md)

## 1. Decisões obrigatórias

1. O CRM atual continua sendo o sistema de registro comercial. `Lead`, `PipelineEntry`, `Stage`, atividades, tarefas, campos personalizados e projetos não serão substituídos.
2. Todos os leads de todos os projetos, seus IDs e seus relacionamentos existentes são dados invioláveis. A evolução omnichannel não pode mover, mesclar, excluir, recriar ou reatribuir um lead implicitamente.
3. Evolution API permanece funcional como provider legado durante toda a transição.
4. Campanhas em massa usam exclusivamente a API oficial do WhatsApp Business da Meta. Evolution não terá a capability de campanha.
5. Instagram Direct será apenas conversacional e iniciado pelo usuário, dentro das regras da Meta; não será usado para prospecção fria ou campanha em massa.
6. A adoção será incremental, por feature flag e por projeto. O piloto usará um único projeto, WABA, número oficial e conjunto controlado de usuários.
7. PostgreSQL continua sendo a fonte de verdade. Redis é infraestrutura transitória de fila, locks e fan-out, nunca armazenamento canônico.
8. A migration atual precisa ser reconciliada antes da primeira alteração omnichannel. Nenhuma DDL será aplicada à produção enquanto o portão de migrations descrito abaixo não for aprovado.
9. Não há deploy nesta fase.

## 2. Diagnóstico do estado atual

### 2.1. O que existe e pode ser reaproveitado

| Capacidade atual | Estado | Reaproveitamento |
|---|---|---|
| Next.js App Router, React e TypeScript | Operacional | Manter aplicação web e rotas API; separar o processamento assíncrono em processos próprios |
| Prisma/PostgreSQL | Operacional | Manter como fonte de verdade; adicionar tabelas e colunas em etapas |
| Projetos, memberships e autorização por projeto | Operacional | Base de isolamento multi-tenant para conexões, conversas, campanhas e automações |
| Leads, pipelines, etapas e `PipelineEntry` | Operacional | Permanecem como domínio comercial; o omnichannel apenas referencia leads opcionais |
| Atividades, tarefas, origens e tags | Operacional | Podem receber eventos explícitos e auditáveis nas fases posteriores, nunca efeitos implícitos de importação |
| Campos personalizados | Operacional | Permanecem ligados ao lead; podem ser usados para segmentação por snapshot |
| Formulários e webhooks de entrada/saída | Operacional | Preservar contratos; reutilizar padrões de escopo, criptografia de headers, timeout e bloqueio SSRF |
| Evolution API e QR Code | Operacional | Encapsular em `EvolutionProvider` sem interromper as instâncias atuais |
| Inbox WhatsApp | Operacional, específica de Evolution | Evoluir a UI para canais múltiplos mantendo as conversas legadas e o vínculo com lead |
| Healthcheck, Dockerfile e Compose | Operacional | Estender com Redis, worker e scheduler sem alterar o volume PostgreSQL existente |

### 2.2. Como o WhatsApp funciona hoje

- `app/actions/whatsapp.ts` concentra conexão, sincronização de status, envio e exclusão diretamente contra a Evolution API.
- `app/api/webhooks/whatsapp/route.ts` processa o webhook de forma síncrona e cria conversas, mensagens e atividades.
- `WhatsAppInstance`, `Conversation` e `Message` são acoplados à semântica da Evolution e a identificadores de WhatsApp.
- A inbox consulta conversas e mensagens a cada cinco segundos e carrega listas inteiras, sem paginação ou transporte realtime.
- O envio cria a mensagem local com estado `SENT` antes da confirmação do provider; falha remota não transiciona a mensagem para `FAILED`.
- Mídias de até 5 MB podem ser convertidas para Base64 no navegador e enviadas pela action; não há object storage privado.
- O webhook evita parte das duplicatas por `remoteId`, mas não possui chave única global, journal de eventos, outbox, replay controlado ou DLQ.
- O payload bruto do webhook é escrito em log e a resposta de erro inclui detalhes internos; ambos precisam ser removidos antes do gateway público da Meta.

### 2.3. Dívida técnica que interfere diretamente

| Prioridade | Dívida | Impacto | Tratamento obrigatório |
|---|---|---|---|
| P0 | Histórico Prisma não reconstrói `schema.prisma` e não contém `migration_lock.toml` | Risco de DDL inesperada ou perda de dados | Reconciliar em cópia restaurada e em banco limpo antes de qualquer migration nova |
| P0 | Ausência de journal, outbox e idempotência forte | Webhooks e retries podem duplicar mensagens ou envios | `ProviderEvent`, `OutboxEvent`, chaves únicas e workers idempotentes |
| P0 | Credenciais de provider no modelo legado sem envelope dedicado | Exposição de tokens permite acesso a contas conectadas | Criptografia autenticada, chave independente, `keyId` e rotação |
| P0 | Webhook atual registra payload integral | Pode vazar conteúdo e dados pessoais nos logs | Logs estruturados com IDs técnicos e redaction; payload protegido com retenção |
| P0 | Envio síncrono sem fila e sem falha persistida | Estado incorreto e baixa resiliência | Estado `QUEUED` → `SENDING` → confirmação por webhook ou `FAILED` |
| P0 | Rate limit em memória de processo | Não funciona corretamente com múltiplas réplicas | Limites distribuídos no Redis por projeto, conexão e provider |
| P1 | Inbox por polling e sem paginação | Carga crescente e experiência atrasada | Paginação por cursor e SSE autenticado com fan-out Redis |
| P1 | Upload Base64 pela aplicação | Memória elevada e baixa segurança operacional | Upload assinado direto para bucket privado e inspeção de mídia |
| P1 | CSV de leads é processado no cliente e sequencialmente | Não escala para audiência de campanha | Importação assíncrona e não mutante por padrão |
| P1 | Exclusão de instância legada pode remover conversas em cascata | Perda de histórico | Trocar exclusão por desconexão/arquivamento; preservar dados históricos |
| P1 | Dois lockfiles (`package-lock.json` e `pnpm-lock.yaml`) divergentes | Builds não reprodutíveis | Declarar npm como gerenciador canônico antes de adicionar dependências |
| P1 | Ausência de testes de WhatsApp, isolamento E2E e falhas/retries | Alto risco de regressão | Matriz de testes unitários, integração, contrato e E2E antes do piloto |

### 2.4. Portão P0 de migrations

A cadeia versionada possui somente três migrations. Ela não cria `PipelineEntry`, `Form`, `FormField` ou `CalendarIntegration`; ainda representa colunas antigas diretamente em `Lead`; e não possui `prisma/migrations/migration_lock.toml`. O comando de comparação a partir das migrations não pode ser considerado uma reconstrução válida do schema atual.

Antes de gerar a primeira migration omnichannel:

1. obter snapshot somente leitura do schema e da tabela `_prisma_migrations` de produção;
2. gerar backup verificável e restaurá-lo em PostgreSQL isolado de staging;
3. comparar banco real, `schema.prisma` e a cadeia versionada;
4. reproduzir o schema em banco vazio;
5. escolher e revisar a estratégia de reconciliação/baseline;
6. testar `prisma migrate deploy` tanto no banco vazio quanto na cópia de produção;
7. confirmar invariantes e contagens de leads antes e depois;
8. somente então aprovar a migration `omnichannel_foundation`.

Marcar uma migration como aplicada em produção só é permitido quando cada objeto e constraint correspondente já tiver sido comprovado no catálogo do banco. `db push`, `migrate reset`, `DROP`, `TRUNCATE` e recriação do volume são proibidos.

## 3. Arquitetura final proposta

```text
Meta WhatsApp ─┐
Meta Instagram ├─> Webhook gateway ─> ProviderEvent + Outbox (PostgreSQL)
Evolution ─────┘                              │
                                             v
                                     dispatcher / Redis
                                             │
                    ┌────────────────────────┼────────────────────────┐
                    v                        v                        v
            provider-events          message-dispatch       campaign/automation
                    │                        │                        │
                    └──────────────> workers idempotentes <───────────┘
                                             │
                            PostgreSQL + object storage privado
                                             │
                                   SSE autenticado / Inbox
```

Componentes e contratos estão detalhados em [arquitetura-omnichannel-providers.md](./arquitetura-omnichannel-providers.md). A decisão de implementação é:

- um monólito modular para web/API e domínio compartilhado;
- processos separados para `web`, `worker` e `scheduler`, gerados pela mesma base de código/imagem quando viável;
- Redis 7 + BullMQ para filas, rate limits, locks curtos e eventos realtime;
- Cloudflare R2 ou outro serviço S3 compatível como bucket privado, escolhido via configuração;
- webhook gateway enxuto: autenticar, limitar, persistir de forma idempotente e responder rapidamente;
- adapters de provider por capability, sem `if provider` espalhado pela UI e pelo domínio;
- outbox transacional entre PostgreSQL e Redis;
- SSE inicialmente, mantendo a possibilidade de WebSocket posteriormente;
- feature flags persistidas por projeto e um provider-of-record por identidade externa.

## 4. Arquivos planejados para implementação

Esta é a superfície prevista; nenhum dos arquivos abaixo foi criado ou alterado nesta Fase 0, exceto os documentos em `/docs`.

| Área | Arquivos atuais a evoluir | Novos arquivos/diretórios planejados |
|---|---|---|
| Dados | `prisma/schema.prisma`, `prisma/migrations/*` | migrations de reconciliação, foundation, backfill, campanhas e automações |
| Configuração | `.env.example`, `docker-compose.yml`, `Dockerfile`, `package.json` | `lib/env.ts`, comandos/entrypoints de worker e scheduler |
| Providers | `app/actions/whatsapp.ts` | `lib/channels/providers/{types,registry,evolution,meta-whatsapp,meta-instagram}.ts`, clientes Graph/Evolution |
| Webhooks | `app/api/webhooks/whatsapp/route.ts` | `app/api/webhooks/providers/meta/route.ts`, gateway/normalizadores, dispatcher/outbox |
| Mensageria | envio hoje dentro da action | `lib/queues/*`, `workers/*`, `lib/outbox/*`, DLQ e scheduler |
| Inbox | `app/project/[id]/inbox/page.tsx`, `inbox-panel.tsx`, `app/project/[id]/layout.tsx` | componentes por canal, paginação, filtros, endpoint SSE |
| Conexões | `app/project/[id]/settings/page.tsx`, `settings-panel.tsx` | actions/rotas de Embedded Signup, OAuth Instagram, templates e health |
| Campanhas | inexistente | `app/project/[id]/campaigns/*`, domínio/actions/rotas, importação e aprovação |
| Automações | inexistente | `app/project/[id]/automations/*`, motor versionado, enrollment e execuções |
| Storage | mídia em URL/Base64 | `lib/storage/*`, uploads assinados, metadados e retenção |
| Segurança | `lib/security.ts`, `lib/api-auth.ts` | HMAC Meta, cofre de credenciais, redaction e rotação |
| Testes | `tests/*.test.ts` | testes de providers, webhook/replay, filas, migrations, isolamento e E2E |
| Documentação | `/docs` | runbooks de conexão, operação, incidentes, LGPD e rollback por fase |

## 5. Modelos e migrations planejados

O desenho completo, relacionamentos, índices e sequência segura estão em [plano-migrations-omnichannel.md](./plano-migrations-omnichannel.md). Resumo:

1. `migration_history_reconciliation`: tornar a cadeia reproduzível sem alterar dados de produção já existentes.
2. `omnichannel_foundation`: `ChannelConnection`, `ContactIdentity`, `ProviderEvent`, `OutboxEvent`, `MediaObject`, `ProjectFeature` e `AuditEvent`; adicionar apenas FKs opcionais e metadados a `Conversation`/`Message`.
3. `evolution_legacy_backfill`: criar a representação genérica das instâncias e conversas Evolution, com dual-read/dual-write e sem alterar `Lead` ou `PipelineEntry`.
4. `consent_templates_campaigns`: `ConsentRecord`, `SuppressionEntry`, `TemplateSnapshot`, `AudienceImport`, `AudienceImportRow`, `Campaign` e `CampaignRecipient`.
5. `automation_engine`: `Automation`, `AutomationVersion`, `AutomationNode`, `AutomationEnrollment` e `AutomationStepExecution`.
6. `inbox_assignment_and_sla`: atribuição, estado, fila/equipe e métricas operacionais da conversa.
7. `post_cutover_constraints`: somente após estabilidade comprovada; constraints mais fortes e possível descontinuação futura de campos legados em release separada e explicitamente autorizada.

## 6. Proteção absoluta dos leads existentes

As seguintes condições são critérios de aceite, não recomendações:

- zero `DELETE`, recriação ou troca de ID em `Lead`;
- zero mudança implícita de `projectId`, `assignedUserId`, `originId`, tags ou campos personalizados;
- zero alteração implícita de `PipelineEntry.pipelineId`, `stageId`, `status`, `value` ou `lostStatusId`;
- novos vínculos para lead são opcionais e usam `onDelete: SetNull`/`Restrict`, nunca cascade do canal para o lead;
- backfills consultam o legado, criam apenas registros novos e não atualizam entidades comerciais;
- importação de audiência cria snapshot independente e, por padrão, não cria nem atualiza lead;
- conversas legadas mantêm IDs e continuam acessíveis; os novos IDs genéricos entram inicialmente como colunas opcionais;
- antes/depois de cada migration, comparar contagens e conjuntos de IDs por projeto de `Lead`, `PipelineEntry`, `Activity`, `CustomFieldValue`, `Task`, `Conversation` e `Message`;
- validar relações críticas e zero referências cruzadas entre projetos;
- qualquer divergência interrompe automaticamente a publicação e exige restauração em ambiente isolado para análise.

## 7. Riscos e controles

| Risco | Probabilidade/impacto | Controle |
|---|---|---|
| Cadeia de migrations divergente | Alta/crítico | Portão P0, restore em staging, diff de catálogo e replay em banco vazio |
| Alteração de leads ou funil por importação | Média/crítico | Importação de audiência não mutante, snapshots e testes de invariantes |
| Duplo envio em retry/deploy | Alta/alto | Idempotency key, outbox, locks curtos e unique constraints |
| Campanha por Evolution | Média/crítico regulatório | Capability negada no adapter e validação de domínio/worker |
| Envio fora da janela Meta | Média/alto | Policy engine server-side; template aprovado quando exigido |
| Bloqueio/queda de qualidade do número | Média/alto | Consentimento, suppression list, limites, ramp-up e circuit breaker |
| Webhook falso ou replay | Alta/alto | GET verify token, HMAC do corpo bruto, idempotência e retenção de eventos |
| Vazamento de tokens/conteúdo | Média/crítico | Cofre criptografado, redaction, mínimo privilégio e rotação |
| Mensagem perdida entre banco e fila | Média/alto | Outbox transacional e dispatcher reentrante |
| Duplicidade de contato entre canais | Alta/médio | Identidade por canal; merge somente explícito e auditado |
| Falha do Redis | Média/médio | Dados canônicos no PostgreSQL, retry com backoff e reconstrução de jobs |
| Bucket exposto | Baixa/alto | Bucket privado, URLs curtas assinadas, MIME/limite e retenção |
| Regressão na Evolution | Média/alto | Adapter de compatibilidade, rota legada, feature flag e testes de contrato |
| App Review atrasar | Alta/médio | WABA/número de teste, evidências e checklist Meta antecipado |

## 8. Checklist Meta Developers

O passo a passo manual completo está em [checklist-meta-developers-clave.md](./checklist-meta-developers-clave.md). Ainda não foi possível auditar o estado real do app da Meta porque App ID, acesso ao Business Portfolio e domínio público definitivo não foram fornecidos nesta fase. Isso não bloqueia a documentação, mas bloqueia a conclusão operacional do onboarding.

Resumo do que precisa ser feito manualmente:

1. Business Portfolio da CLAVE verificado, com administradores e 2FA.
2. App do tipo/use case compatível com “Connect through WhatsApp”, associado ao negócio verificado.
3. App ID/Secret, domínios, política de privacidade, termos, exclusão de dados e contato configurados.
4. Facebook Login for Business e configuração de Embedded Signup com redirects exatos.
5. Produto WhatsApp, WABA/número de teste, callback HTTPS, verify token e assinatura do campo `messages`.
6. App inscrito em cada WABA conectada.
7. App Review para `whatsapp_business_management` e `whatsapp_business_messaging`; `business_management` somente se o fluxo realmente precisar gerenciar assets do portfólio.
8. Templates, opt-in, quality rating, limites e faturamento preparados para campanha.
9. Instagram profissional conectado, OAuth e permissões mínimas `instagram_business_basic` e `instagram_business_manage_messages`.
10. App publicado somente depois de revisão, testes e política de dados.

## 9. Ordem exata de implementação

Cada etapa termina com teste e gate; não avançar em caso de divergência.

1. Confirmar o domínio público de staging/produção, owners, App ID, Business Portfolio, WABA/número e Instagram de teste.
2. Inventariar o schema real de produção e `_prisma_migrations` com acesso somente leitura.
3. Criar backup externo verificável, restaurar cópia sanitizada em staging e registrar as contagens/invariantes de leads.
4. Reconciliar a cadeia Prisma e provar `migrate deploy` em banco vazio e na cópia restaurada.
5. Fixar npm como gerenciador canônico e validar build reprodutível, sem alterar comportamento.
6. Adicionar Redis, BullMQ, healthchecks, processos `worker` e `scheduler` em staging.
7. Adicionar feature flags por projeto e habilitar tudo como `false`.
8. Criar os modelos foundation, índices e colunas opcionais; validar invariantes de leads.
9. Implementar cofre de credenciais, registry de providers e contratos/capabilities.
10. Encapsular Evolution no adapter e executar testes de paridade antes de qualquer Meta.
11. Criar gateway Meta com verificação GET, HMAC POST, `ProviderEvent`, outbox e replay idempotente.
12. Fazer backfill Evolution aditivo, ativar dual-write e comparar leituras antigas/novas no piloto.
13. Implementar Meta WhatsApp: Embedded Signup, sincronização de WABA/número/templates, envio e status por webhook.
14. Implementar object storage privado, upload assinado e pipeline seguro de mídia.
15. Evoluir inbox para modelo genérico, paginação e SSE; preservar links e conversas legadas.
16. Criar consentimento, suppression list, templates snapshot e importação de audiência não mutante.
17. Criar campanhas oficiais Meta com preview, aprovação, limites, pausas, idempotência e auditoria.
18. Criar automações versionadas, scheduler por `nextWakeAt`, leases e execuções idempotentes.
19. Integrar Instagram Direct somente para conversas iniciadas pelo usuário e oportunidades explícitas.
20. Executar suíte completa, teste de restauração, shadow/dual-read e piloto de um projeto.
21. Preparar runbook e plano de rollback; solicitar autorização explícita para deploy.
22. Somente após autorização, publicar em etapas e comparar invariantes pós-deploy.

## 10. Baseline de qualidade executada na Fase 0

| Verificação | Resultado em 2026-09-02 |
|---|---|
| `npm test` | 16/16 testes aprovados |
| `npx tsc --noEmit` | aprovado |
| `npm run build` | aprovado, Next.js 16.3.4 |
| `npm run lint` | 0 erros e 37 warnings |
| `npm audit --omit=dev` | 0 vulnerabilidades conhecidas reportadas |
| `prisma validate` | schema atual válido |
| reconstrução por migrations | reprovada: cadeia incompleta e sem `migration_lock.toml` |

A cobertura atual valida principalmente campos personalizados e webhooks genéricos. Não há cobertura suficiente de provider, inbox, assinatura Meta, retries, filas, campanhas, isolamento E2E ou preservação dos leads durante migration; esses testes são obrigatórios nas fases seguintes.

## 11. Critério de encerramento desta fase

A Fase 0 produz somente estes documentos. A implementação, as migrations e o deploy permanecem parados. Os próximos bloqueios externos são: confirmar os assets reais da Meta, obter snapshot somente leitura do banco de produção e aprovar a estratégia de reconciliação das migrations.
