# Plano de migrations omnichannel e preservação dos leads

Status: planejamento da Fase 0. Nenhuma migration deste documento foi gerada ou executada.

## 1. Contrato de integridade

Todos os leads existentes, em todos os projetos, são imutáveis durante a migração estrutural. “Preservar” significa manter:

- o mesmo `Lead.id` e `Lead.projectId`;
- nome, e-mail, telefone, empresa, prioridade, origem, responsável, UTM e timestamps;
- cada `PipelineEntry` e seus `pipelineId`, `stageId`, `status`, `value` e motivo de perda;
- tags, tarefas, atividades e valores de campos personalizados;
- vínculos atuais entre lead, conversa e histórico de mensagens;
- isolamento entre projetos.

O omnichannel pode criar referências opcionais a um lead. Não pode usar backfill, importação de audiência, normalização de telefone ou merge para modificar o lead sem uma ação separada, explícita e auditável do usuário.

## 2. Estado do histórico atual

`schema.prisma` possui 22 models, mas as três migrations versionadas não criam `PipelineEntry`, `Form`, `FormField` nem `CalendarIntegration`. A cadeia ainda modela colunas históricas de funil diretamente em `Lead`, enquanto o schema atual usa `PipelineEntry`. Também não existe `prisma/migrations/migration_lock.toml`.

Consequência: o schema atual pode validar e a produção pode estar saudável, mas um banco vazio não é prova de reconstrução pelo histórico. Criar uma migration nova a partir deste ponto sem reconciliação é proibido.

## 3. Migration 0 — reconciliação do histórico

### Evidências obrigatórias

1. dump custom-format externo com SHA-256 e teste `pg_restore -l`;
2. snapshot de `information_schema`, `pg_catalog` e `_prisma_migrations`;
3. cópia restaurada em banco isolado;
4. `prisma migrate status` e diff entre banco restaurado e `schema.prisma`;
5. replay completo em banco vazio;
6. relatório de diferenças, separado em “objeto já existente”, “histórico ausente” e “mudança real necessária”.

### Estratégia a decidir com evidência do banco

- criar `migration_lock.toml` para PostgreSQL;
- produzir uma migration de reconciliação que represente o estado corrente para novos ambientes;
- na produção, marcar como aplicada somente a parte comprovadamente materializada; qualquer DDL faltante será uma migration aditiva separada e ensaiada;
- não editar SQL já aplicado nem falsificar checksum de migration registrada;
- documentar a baseline em runbook e CI.

A escolha final entre uma baseline consolidada para bancos novos e uma migration de reconciliação incremental depende do catálogo real. Não será assumida apenas a partir do repositório.

## 4. Sequência planejada

### M1 — `omnichannel_foundation`

Novos models:

#### `ChannelConnection`

- `id`, `projectId`, `provider`, `channel`, `name`, `status`;
- IDs externos: business/portfolio, WABA, phone number, page ou Instagram account conforme o provider;
- `credentialsEncrypted`, `credentialsKeyId`, `tokenExpiresAt`;
- `capabilitiesSnapshot`, `metadata`, `lastHealthAt`, `lastErrorCode`;
- `isActive`, `createdAt`, `updatedAt`, `archivedAt`.

Relações: pertence a `Project`; possui identidades, conversas, eventos e mensagens. A unicidade do asset externo ativo impede dois providers-of-record.

#### `ContactIdentity`

- `id`, `projectId`, `channelConnectionId`, `channel`;
- `externalUserId`, `address`, `normalizedAddress`, `displayName`, `avatarUrl`;
- `leadId` opcional, `lastInboundAt`, `lastOutboundAt`, `createdAt`, `updatedAt`.

Relação com `Lead` usa `onDelete: SetNull`. A identidade é única por conexão + ID externo. Merge entre identidades é ação explícita futura, não migration.

#### `ProviderEvent`

- `id`, `projectId`, `channelConnectionId`, `provider`;
- `externalEventKey`, `eventType`, `payloadHash`, `payloadEncrypted`;
- `status`, `attempts`, `occurredAt`, `receivedAt`, `processedAt`, `lastErrorCode`.

Unique por conexão + chave externa. O payload tem retenção e pode ser descartado mantendo metadados/auditoria.

#### `OutboxEvent`

- `id`, `projectId`, `aggregateType`, `aggregateId`, `eventType`;
- `payload`, `idempotencyKey`, `status`, `attempts`;
- `availableAt`, `lockedAt`, `publishedAt`, `lastErrorCode`, timestamps.

Unique em `idempotencyKey`; índice para `(status, availableAt)`.

#### `MediaObject`

- `id`, `projectId`, `storageKey`, `bucket`, `contentType`, `sizeBytes`, `checksum`;
- `scanStatus`, `providerMediaId`, `retentionUntil`, timestamps.

Sem conteúdo binário no PostgreSQL. Relações de mensagem/importação usam `onDelete: SetNull` ou `Restrict` conforme retenção.

#### `ProjectFeature`

- `id`, `projectId`, `key`, `enabled`, `configuration`, timestamps;
- unique `(projectId, key)`.

Todas as flags omnichannel nascem desabilitadas.

#### `AuditEvent`

- `id`, `projectId`, `actorUserId?`, `action`, `resourceType`, `resourceId`;
- `correlationId`, `reason?`, `metadataRedacted`, `createdAt`;
- append-only, sem payload sensível ou token.

Registra conexão/revogação, aprovação e pausa de campanha, replay, merge manual e alteração de consentimento. Não substitui `Activity`, que continua como histórico comercial do lead.

Alterações aditivas em models atuais:

- `Conversation`: `projectId` denormalizado e validado, `channelConnectionId?`, `contactIdentityId?`, `externalConversationId?`, `channel?`, `status?`, `assignedUserId?`, `lastInboundAt?`, `lastOutboundAt?`, `customerCareWindowEndsAt?`, timestamps; manter `whatsappId`, `instanceId` e o ID da conversa.
- `Message`: `projectId?`, `channelConnectionId?`, `providerMessageId?`, `idempotencyKey?`, `errorCode?`, `errorDetailRedacted?`, `acceptedAt?`, `sentAt?`, `deliveredAt?`, `readAt?`, `failedAt?`, `replyToMessageId?`, `mediaObjectId?`, `metadata?`; manter `remoteId`, `content`, `mediaUrl` e o ID da mensagem.

No primeiro deploy, novas FKs em tabelas atuais são opcionais. Nenhuma coluna existente é renomeada, removida ou tornada obrigatória.

### M2 — `evolution_legacy_backfill`

1. criar uma `ChannelConnection(provider=EVOLUTION)` para cada `WhatsAppInstance` existente;
2. criar `ContactIdentity` para cada par único atual de instância + `whatsappId`;
3. preencher apenas os novos FKs opcionais de `Conversation` e `Message`;
4. copiar a referência opcional a `leadId` para a identidade sem atualizar o lead;
5. registrar conflitos e continuar sem merge automático;
6. habilitar dual-write no adapter Evolution;
7. comparar dual-read por projeto antes de qualquer cutover.

O backfill precisa ser resumível, em lotes pequenos, com checkpoint e idempotência. Ele não usa cascade, não exclui `WhatsAppInstance` e não altera mensagens/conversas legadas além das colunas novas.

### M3 — `consent_templates_campaigns`

#### `ConsentRecord`

- projeto, identidade/endereço, canal, finalidade, estado (`GRANTED`, `REVOKED`, `EXPIRED`);
- origem, texto/versão da prova, timestamps e actor;
- histórico append-only; revogação não apaga a concessão anterior.

#### `SuppressionEntry`

- projeto, canal, endereço normalizado/identidade, escopo e motivo;
- `activeFrom`, `activeUntil?`, origem e auditoria;
- prevalece sobre consentimento e listas.

#### `TemplateSnapshot`

- `channelConnectionId`, provider template ID, nome, idioma, categoria, status;
- estrutura/componentes versionados, hash e timestamps de sincronização;
- campanha referencia uma revisão imutável.

#### `AudienceImport` e `AudienceImportRow`

- arquivo em object storage, checksum, mapping, totais, estado e erros;
- linha guarda snapshot normalizado, elegibilidade e `leadId?` apenas como referência;
- não cria/atualiza `Lead` por padrão e nunca move estágio.

#### `Campaign`

- projeto, conexão Meta WhatsApp, template snapshot, nome, revisão, estado;
- configuração de limites, janela, agendamento, aprovação, estatísticas e timestamps.

#### `CampaignRecipient`

- campanha, identidade/endereço snapshot, `leadId?`, variáveis renderizadas;
- consentimento/suppression decididos no momento do envio;
- `idempotencyKey`, estado, tentativas, provider message ID, erro redigido e timestamps.

Relações opcionais a `Lead` usam `onDelete: SetNull`. Unique por campanha + identidade/endereço normalizado evita duplicidade na mesma revisão.

### M4 — `automation_engine`

#### `Automation`

Cabeçalho editável por projeto, nome, estado e versão publicada.

#### `AutomationVersion` e `AutomationNode`

Definição imutável publicada, grafo validado, trigger, condições e ações. Uma edição cria nova versão.

#### `AutomationEnrollment`

Projeto, versão, identidade/conversa/lead opcionais, estado, `nextWakeAt`, lease e timestamps. Vínculo com lead usa `onDelete: SetNull`.

#### `AutomationStepExecution`

Enrollment, node, tentativa, idempotency key, input/output redigido, estado, erro e timestamps. Unique evita repetir a mesma ação lógica.

### M5 — `inbox_assignment_and_sla`

- `InboxTeam` e `InboxTeamMember` opcionais por projeto;
- responsável/equipe, prioridade, etiquetas operacionais e SLA na conversa;
- índices de inbox por projeto, estado, responsável e última mensagem;
- nenhuma mudança no responsável comercial do lead é implícita.

### M6 — `post_cutover_constraints`

Somente após múltiplos ciclos estáveis:

- tornar obrigatórias novas referências comprovadamente preenchidas;
- desabilitar dual-read legado;
- arquivar conexões legadas inativas;
- avaliar remoção de campos antigos em release própria, com backup e autorização explícita.

Esta etapa não faz parte da implementação inicial e não autoriza exclusões.

## 5. Relacionamentos principais

```text
Project
 ├─ Lead ── PipelineEntry / Activity / CustomFieldValue (preservados)
 ├─ ChannelConnection
 │   ├─ ContactIdentity ── leadId? -> Lead (SET NULL)
 │   ├─ Conversation ───── leadId? -> Lead (existente, preservado)
 │   │   └─ Message ────── MediaObject?
 │   ├─ ProviderEvent
 │   └─ TemplateSnapshot
 ├─ Campaign
 │   └─ CampaignRecipient ─ leadId? -> Lead (SET NULL)
 ├─ Automation
 │   └─ AutomationVersion
 │       └─ AutomationEnrollment ─ leadId? -> Lead (SET NULL)
 └─ OutboxEvent / ProjectFeature / AuditEvent / ConsentRecord / SuppressionEntry
```

Todos os models novos carregam `projectId`. Relações críticas devem verificar que pai e filho pertencem ao mesmo projeto. Onde o Prisma permitir sem complexidade desproporcional, usar chave composta/constraint de tenant; em todos os casos, o serviço de domínio filtra por `projectId` e testes tentam violações cruzadas.

## 6. Índices e constraints planejados

- `ChannelConnection(projectId, provider, status)`;
- unique do asset externo por provider, considerando apenas conexão ativa quando implementado com índice parcial SQL;
- unique `ContactIdentity(channelConnectionId, externalUserId)`;
- índice `ContactIdentity(projectId, channel, normalizedAddress)`;
- unique `ProviderEvent(channelConnectionId, externalEventKey)`;
- índice `ProviderEvent(status, receivedAt)`;
- unique parcial `Message(channelConnectionId, providerMessageId)` quando não nulo;
- unique parcial `Message(channelConnectionId, idempotencyKey)` quando não nulo;
- unique `OutboxEvent(idempotencyKey)` e índice `(status, availableAt)`;
- índice `Conversation(projectId, status, lastMessageAt)`;
- índice `Campaign(projectId, status, scheduledAt)`;
- unique `CampaignRecipient(campaignId, identityKey)` e índice `(campaignId, status)`;
- unique `AutomationStepExecution(idempotencyKey)`;
- índice `AutomationEnrollment(status, nextWakeAt)`.

Índices grandes serão criados com estratégia de baixo lock apropriada ao PostgreSQL e ensaiados com volume equivalente. O SQL gerado pelo Prisma será revisado manualmente antes de cada deploy.

## 7. Baseline e invariantes de leads

Antes e depois de cada migration, capturar por projeto:

| Invariante | Expectativa |
|---|---|
| `count(Lead)` | idêntico |
| conjunto de `Lead.id` | idêntico |
| hash ordenado de colunas comerciais de Lead | idêntico |
| `count(PipelineEntry)` e tuplas lead/pipeline/stage/status/value | idênticos |
| tags por lead | idênticas |
| atividades, tarefas e custom values por lead | idênticos |
| conversas/mensagens legadas e seus IDs | idênticos ou maiores somente por tráfego real controlado |
| leads sem projeto válido | zero |
| relações cruzadas entre projetos | zero |
| órfãos novos | zero, salvo FK opcional explicitamente permitida |

Para evitar falso positivo causado por tráfego durante a medição, a migration deve ocorrer com janela de escrita controlada ou snapshot transacional. O relatório guarda apenas IDs técnicos, contagens e hashes; não copia PII para logs.

## 8. Estratégia de rollout e rollback

1. migration aditiva com feature flag desligada;
2. backfill resumível em staging;
3. checagem de invariantes;
4. dual-write Evolution, leitura antiga como principal;
5. shadow comparison;
6. dual-read novo no projeto piloto;
7. rollback de aplicação mantém tabelas/colunas novas;
8. correção forward é preferida a down migration destrutiva;
9. restauração de backup só em banco separado, seguida de comparação e promoção aprovada.

Nunca executar automaticamente `migrate reset`, `db push`, `DROP TABLE`, `TRUNCATE`, remoção de volume ou `DELETE FROM Lead`.

## 9. Testes obrigatórios por migration

- `prisma validate` e revisão manual do SQL;
- aplicação em banco vazio;
- aplicação em clone restaurado do estado anterior;
- reaplicação/status sem DDL inesperada;
- invariantes de leads e isolamento multi-project;
- backfill interrompido e retomado;
- conflito/duplicata sem merge automático;
- rollback de aplicação;
- tempo de lock e tamanho dos índices;
- testes de contrato Evolution antes/depois;
- criação de campanha/audiência comprovadamente sem alterar lead ou funil.
