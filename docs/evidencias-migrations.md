# Evidências do histórico Prisma — Fase 1A

Data da captura: 2026-09-02

Branch: `chore/prisma-history-reconciliation`

Commit-base: `215fa2de65b817cefa9c69bd7dd11d26c90fa527`

Escopo desta evidência: repositório, produção em sessão PostgreSQL forçada como read-only e duas instâncias PostgreSQL 15 isoladas. Nenhuma migration foi executada em produção.

## 1. Runtime e ferramentas

| Componente | Versão encontrada |
|---|---|
| Node.js | `v22.22.3` |
| npm | `10.9.8` |
| Prisma CLI instalado | `5.22.0` |
| `@prisma/client` instalado | `5.22.0` |
| Prisma declarado no `package.json` | `^5.12.1` |
| `@prisma/client` declarado no `package.json` | `^5.12.1` |
| PostgreSQL do Compose | `postgres:15-alpine` |
| Next.js | `16.3.4` |

Nenhuma dependência foi atualizada. `package-lock.json` e `pnpm-lock.yaml` permanecem inalterados.

## 2. Boot de produção representado no repositório

O `Dockerfile` usa:

```text
CMD ["sh", "-c", "npx prisma migrate deploy && npm run start"]
```

O `docker-compose.yml` inicia PostgreSQL 15 e, depois do healthcheck, o serviço web. Não há Redis, worker, scheduler ou serviço omnichannel nesta branch.

## 3. Migrations versionadas

Não existe `prisma/migrations/migration_lock.toml`.

| Migration | Linhas | SHA-256 |
|---|---:|---|
| `20260606000000_init/migration.sql` | 256 | `70f780b5c860e886f5c1c501bd39cfc1a5243af695eb62938fc6191c4cb33762` |
| `20260606100000_add_crm_enhancements/migration.sql` | 77 | `088e65a8a71f8d0462b99929f40cf60803b337e08b7a5560132f6a14c15d22e0` |
| `20260901150000_add_custom_fields_webhooks/migration.sql` | 65 | `6f1e1dd86e713ceec6ddd2edbade4861af0bbe17d4c91480e54edebc25a405dc` |

Os arquivos originais são a fonte canônica do conteúdo e foram lidos integralmente:

- [`prisma/migrations/20260606000000_init/migration.sql`](../prisma/migrations/20260606000000_init/migration.sql)
- [`prisma/migrations/20260606100000_add_crm_enhancements/migration.sql`](../prisma/migrations/20260606100000_add_crm_enhancements/migration.sql)
- [`prisma/migrations/20260901150000_add_custom_fields_webhooks/migration.sql`](../prisma/migrations/20260901150000_add_custom_fields_webhooks/migration.sql)

Nenhum desses arquivos foi editado. Os hashes acima devem ser comparados com os checksums de `_prisma_migrations` quando o acesso read-only estiver disponível.

### `20260606000000_init`

Cria `User`, `Project`, `Membership`, `Pipeline`, `Stage`, `Lead`, `Tag`, `Task`, `Activity`, `WebhookEndpoint`, `WebhookLog`, `WhatsAppInstance`, `Conversation`, `Message` e a tabela implícita `_LeadToTag`, com PKs, índices e FKs iniciais.

O formato histórico de `Lead` inclui `status`, `value` e `stageId` diretamente na tabela. Esse formato não corresponde ao `schema.prisma` atual, que usa `PipelineEntry`.

### `20260606100000_add_crm_enhancements`

Cria `Origin`, `LostStatus`, `CustomFieldDefinition` e `CustomFieldValue`; adiciona `originId` e `lostStatusId` diretamente a `Lead`; adiciona `originId` a `WebhookEndpoint`, `type` a `WhatsAppInstance` e `messageType`/`mediaUrl` a `Message`, incluindo FKs.

O `lostStatusId` direto em `Lead` não existe no schema atual; atualmente ele pertence a `PipelineEntry`.

### `20260901150000_add_custom_fields_webhooks`

Amplia custom fields e webhooks de forma aditiva, faz backfill de `internalName`/ordem, cria uniques/índices, torna `WebhookEndpoint.targetStageId` opcional e adiciona metadados aos logs.

Essa migration contém um `UPDATE` histórico para o backfill de custom fields. Ele foi apenas inspecionado; não foi executado nesta fase.

## 4. Schema Prisma esperado pelo código atual

O `schema.prisma` possui 22 models e nenhum `enum` Prisma. Estados e tipos são representados por `String`.

| Model/tabela | Colunas escalares esperadas | Chaves, índices e relações relevantes |
|---|---|---|
| `User` | `id`, `name`, `email`, `passwordHash`, `role`, `createdAt`, `updatedAt`, `resetToken`, `resetTokenExpires`, `lgpdAccepted`, `lgpdAcceptedAt` | PK `id`; unique `email` e `resetToken`; relações com memberships, atividades, leads atribuídos, calendário e tarefas |
| `Project` | `id`, `name`, `description`, `lastAssignedCommercialId`, `apiKeyHash`, `apiKeyPrefix`, `createdAt`, `updatedAt` | PK; unique `apiKeyPrefix`; pai dos recursos do projeto |
| `Membership` | `id`, `role`, `userId`, `projectId`, `isDesignatedCommercial` | unique `(userId, projectId)`; FKs cascade para `User` e `Project` |
| `Pipeline` | `id`, `name`, `projectId` | FK cascade para `Project`; relações com etapas, entries e forms |
| `Stage` | `id`, `name`, `order`, `color`, `pipelineId` | FK cascade para `Pipeline`; default atual de `color` `#9FE870` |
| `Origin` | `id`, `name`, `projectId` | FK cascade para `Project` |
| `LostStatus` | `id`, `reason`, `projectId` | FK cascade para `Project` |
| `Lead` | `id`, `name`, `email`, `phone`, `company`, `priority`, `projectId`, `originId`, `assignedUserId`, `createdAt`, `updatedAt`, campos UTM, `referrer`, `landingPage` | FK project cascade; origin/responsável `SetNull`; não possui `stageId`, `status`, `value` ou `lostStatusId` direto |
| `PipelineEntry` | `id`, `leadId`, `pipelineId`, `stageId`, `value`, `status`, `lostStatusId`, `createdAt`, `updatedAt` | unique `(leadId, pipelineId)`; FKs para lead, pipeline, stage e lost status |
| `CustomFieldDefinition` | `id`, `name`, `internalName`, `type`, `entityType`, `options`, `helpText`, `defaultValue`, `validationRules`, `required`, `isActive`, `order`, `deletedAt`, `projectId`, timestamps | unique `(projectId, internalName)`; index `(projectId, isActive, order)` |
| `CustomFieldValue` | `id`, `fieldDefinitionId`, `leadId`, `value` | unique `(fieldDefinitionId, leadId)`; index `leadId` |
| `Tag` | `id`, `name`, `color`, `projectId` | FK cascade para `Project`; default atual de `color` `#9FE870`; M:N implícita `_LeadToTag` |
| `Task` | `id`, `title`, `description`, `dueDate`, `status`, `leadId`, `projectId`, `userId`, `googleEventId`, `microsoftEventId`, timestamps | FKs para user, lead e project |
| `Activity` | `id`, `type`, `content`, `leadId`, `userId`, `createdAt` | FK lead cascade; user `SetNull` |
| `WebhookEndpoint` | `id`, `name`, `token`, `direction`, `url`, `method`, `isActive`, `events`, `payloadFields`, `headersEncrypted`, `timeoutMs`, `targetStageId`, `projectId`, `originId`, `fieldMapping`, `deletedAt`, timestamps | unique `token`; index `(projectId, direction, isActive)`; FKs para project e origin |
| `WebhookLog` | `id`, `webhookId`, `payload`, `status`, `errorDetails`, `event`, `statusCode`, `responseBody`, `attempt`, `durationMs`, `createdAt` | FK cascade para endpoint; index `(webhookId, createdAt)` |
| `WhatsAppInstance` | `id`, `name`, `instanceName`, `token`, `status`, `type`, `projectId`, `createdAt` | unique `instanceName`; FK cascade para project |
| `Conversation` | `id`, `whatsappId`, `name`, `lastMessageAt`, `leadId`, `instanceId` | unique `(whatsappId, instanceId)`; lead `SetNull`; instance cascade |
| `Message` | `id`, `remoteId`, `content`, `direction`, `status`, `messageType`, `mediaUrl`, `senderName`, `conversationId`, `createdAt` | FK cascade para conversation |
| `Form` | `id`, `name`, `token`, `projectId`, `pipelineId`, `stageId`, `originId`, `successMessage`, `redirectUrl`, `isActive`, timestamps | unique `token`; FKs para project/pipeline/stage e origin `SetNull` |
| `FormField` | `id`, `formId`, `type`, `fieldName`, `customFieldDefinitionId`, `label`, `required`, `order` | FK form cascade; custom definition `SetNull` |
| `CalendarIntegration` | `id`, `provider`, `accessToken`, `refreshToken`, `expiresAt`, `email`, `userId`, timestamps | unique `(userId, provider)`; FK user cascade |

O código atual consulta explicitamente `PipelineEntry`, `Form`, `FormField` e `CalendarIntegration`, além dos models iniciais. Portanto, esses objetos não são apenas declarações não usadas no schema.

## 5. Diagnóstico definitivo do catálogo restaurado

O PostgreSQL correto foi identificado pelo vínculo do recurso Coolify com o repositório `belloni123/crm-b16`, branch `main`, commit de produção `215fa2de65b817cefa9c69bd7dd11d26c90fa527`. A sessão de produção confirmou `transaction_read_only=on`, PostgreSQL `15.19`, database `crm_b16` e role da aplicação, sem expor a URL ou credenciais.

O dump custom-format foi criado em armazenamento restrito fora do Git:

| Evidência | Resultado |
|---|---|
| arquivo | `crm-b16-phase1a-20260902T175957Z.dump` |
| bytes | `284304` |
| SHA-256 | `260bdd9c99fd4d5b8c4e284902cec4874aba648c177fc2d75da68c9e1e7348df` |
| `pg_restore -l` | válido, 142 entradas |
| restore | PostgreSQL 15 isolado, sem portas publicadas |
| tabelas públicas | 24, incluindo `_prisma_migrations` |

As três linhas históricas de `_prisma_migrations` estavam concluídas, sem rollback, e seus checksums coincidiram exatamente com os arquivos versionados. O catálogo restaurado correspondeu ao `schema.prisma`, salvo dois defaults técnicos em `CustomFieldDefinition.updatedAt` e `WebhookEndpoint.updatedAt`. Esses defaults foram removidos apenas nas cópias de teste pela migration de reconciliação.

## 6. Matriz de drift concluída

| Categoria | Evidência local |
|---|---|
| objeto existente no catálogo e no schema, mas ausente das três migrations antigas | `PipelineEntry`, `Form`, `FormField`, `CalendarIntegration` |
| colunas existentes no catálogo/schema, mas ausentes do histórico | reset/LGPD de `User`; API/round-robin de `Project`; comercial de `Membership`; responsável/tracking de `Lead`; calendário/responsável de `Task` |
| objetos históricos obsoletos | `Lead.status`, `Lead.value`, `Lead.stageId`, `Lead.lostStatusId` aparecem somente no replay vazio; não existem no catálogo restaurado |
| defaults históricos | `Stage.color`/`Tag.color` foram reconciliados para `#9FE870`; dois defaults de `updatedAt` foram removidos nas cópias |
| provider lock | criado como `postgresql` |
| drift após reconciliação na cópia restaurada | zero (`prisma migrate diff` retornou apenas o marcador de migration vazia, 32 bytes) |
| drift residual no replay vazio | quatro colunas e duas FKs legadas de `Lead`, 283 bytes; removê-las exigiria `DROP COLUMN`, proibido pelo contrato de segurança |

O drift residual do replay vazio é deliberado e operacionalmente inofensivo: `stageId` legado foi tornado nullable, nenhuma coluna é mapeada pelo Prisma atual e nenhum dado foi movido ou apagado.

## 7. Integridade desta captura

- migrations existentes permaneceram byte a byte inalteradas;
- `schema.prisma`, runtime, Docker/Compose e lockfiles de dependências não foram alterados;
- a única leitura em produção ocorreu com `default_transaction_read_only=on`;
- comandos Prisma de escrita foram executados somente nos bancos efêmeros isolados;
- nenhuma credencial, URL de banco, PII ou conteúdo comercial foi registrado neste documento;
- produção permaneceu no commit `215fa2de65b817cefa9c69bd7dd11d26c90fa527`, sem migration, variável ou deploy.
