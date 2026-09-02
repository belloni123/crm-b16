# Arquitetura omnichannel, providers e infraestrutura

Status: desenho da Fase 0; não implementado.

## 1. Limites de domínio

O sistema fica dividido em módulos internos, ainda dentro do mesmo repositório:

- **CRM Core:** projetos, usuários, leads, pipelines, tarefas, atividades e campos personalizados. Continua sendo o sistema de registro comercial.
- **Channels:** conexões, identidades externas, conversas, mensagens, mídia e normalização de providers.
- **Engagement:** templates, consentimentos, suppression list, audiências e campanhas.
- **Automation:** definições versionadas, enrollments, scheduler e execuções.
- **Integration Runtime:** webhook gateway, outbox, filas, workers, rate limit e observabilidade.

Nenhum adapter externo acessa Prisma diretamente. O adapter traduz contratos do provider; serviços de domínio validam projeto, regra de negócio e persistência.

## 2. Provider abstraction

Contrato conceitual planejado:

```ts
type Channel = 'WHATSAPP' | 'INSTAGRAM';
type Provider = 'EVOLUTION' | 'META_WHATSAPP' | 'META_INSTAGRAM';

interface ProviderCapabilities {
  connect: 'QR' | 'EMBEDDED_SIGNUP' | 'OAUTH';
  inbound: boolean;
  freeformOutbound: boolean;
  templates: boolean;
  campaigns: boolean;
  markAsRead: boolean;
  mediaTypes: string[];
  requiresCustomerCareWindow: boolean;
}

interface MessagingProvider {
  readonly provider: Provider;
  readonly capabilities: ProviderCapabilities;
  connect(input: ConnectInput): Promise<ConnectResult>;
  disconnect(connection: ProviderConnection): Promise<void>;
  health(connection: ProviderConnection): Promise<ProviderHealth>;
  syncAssets(connection: ProviderConnection): Promise<ProviderAssets>;
  syncTemplates?(connection: ProviderConnection): Promise<ProviderTemplate[]>;
  sendFreeform(input: FreeformMessageInput): Promise<ProviderSendResult>;
  sendTemplate?(input: TemplateMessageInput): Promise<ProviderSendResult>;
  markAsRead?(input: MarkAsReadInput): Promise<void>;
  normalizeWebhook(input: VerifiedWebhook): Promise<NormalizedProviderEvent[]>;
}
```

O registry resolve um adapter por `ChannelConnection.provider`. UI, campanhas e automações consultam capabilities; não assumem que todos os canais suportam o mesmo comportamento.

### Matriz de capabilities

| Capability | Evolution legado | Meta WhatsApp | Meta Instagram |
|---|---:|---:|---:|
| Conexão | QR | Embedded Signup | OAuth |
| Receber mensagens | Sim | Sim | Sim |
| Responder mensagem livre | Sim | Sim, respeitando a janela | Sim, somente conversa iniciada pelo usuário |
| Templates oficiais | Não | Sim | Não |
| Campanha em massa | **Não** | **Sim, exclusivo** | **Não** |
| Status enviado/entregue/lido | Conforme evento Evolution | Sim, via webhook | Conforme API/webhook disponível |
| Marcar como lida | Conforme versão Evolution | Sim | Conforme API disponível |
| Mídia | Legado atual | Conforme Cloud API | Subconjunto suportado pela API |
| Provider-of-record | Instância Evolution | phone number ID/WABA | Instagram professional account ID |

Regras inegociáveis:

- `CampaignService` aceita somente conexão `META_WHATSAPP` com capability `campaigns=true`.
- Mensagem livre Meta WhatsApp passa por um policy engine que verifica a janela de atendimento; fora dela, somente template permitido.
- Meta Instagram não oferece operação de iniciar prospecção; uma identidade só fica respondível após evento inbound elegível.
- A mesma identidade externa ativa não pode ter dois providers-of-record simultâneos.

## 3. Estado canônico

### Conexão

`PENDING` → `CONNECTING` → `CONNECTED` → `DEGRADED` → `DISCONNECTED` ou `REVOKED`.

O estado local é atualizado por sincronização e webhooks. A UI nunca trata retorno pontual de uma API como prova permanente de conexão.

### Mensagem

`DRAFT` → `QUEUED` → `SENDING` → `ACCEPTED` → `SENT` → `DELIVERED` → `READ`.

Estados terminais alternativos: `FAILED`, `CANCELED`, `EXPIRED`, `UNDELIVERABLE`.

O retorno HTTP do provider pode avançar até `ACCEPTED`; `SENT`, `DELIVERED` e `READ` vêm de eventos oficiais quando o provider os disponibilizar. Transições regressivas ou duplicadas não sobrescrevem estados mais fortes.

### Conversa

`OPEN`, `PENDING`, `SNOOZED`, `RESOLVED`, `ARCHIVED`. A conversa guarda `lastInboundAt`, `lastOutboundAt`, `customerCareWindowEndsAt`, responsável e fila/equipe opcional.

### Campanha

`DRAFT` → `VALIDATING` → `READY` → `SCHEDULED` → `QUEUING` → `RUNNING` → `PAUSING` → `PAUSED` → `COMPLETED`.

Estados alternativos: `CANCELED`, `FAILED`. Alterações relevantes após `READY` geram nova revisão/snapshot e exigem nova aprovação.

### Destinatário de campanha

`IMPORTED` → `INVALID`/`DUPLICATE`/`SUPPRESSED` ou `ELIGIBLE` → `QUEUED` → `SUBMITTING` → `ACCEPTED` → `SENT` → `DELIVERED` → `READ`/`REPLIED`.

Estados terminais alternativos: `FAILED`, `CANCELED`. `ACCEPTED` vem da resposta inicial da API; estados posteriores e falhas assíncronas vêm dos webhooks oficiais.

## 4. Webhook gateway

### Endpoints

- `GET /api/webhooks/providers/meta`: validar `hub.mode`, `hub.verify_token` e responder `hub.challenge` somente em caso válido.
- `POST /api/webhooks/providers/meta`: ler o corpo bruto com limite de bytes, validar `X-Hub-Signature-256` com HMAC-SHA256/App Secret e comparação constante antes de desserializar/processar.
- `POST /api/webhooks/providers/evolution`: endpoint genérico futuro com secret por conexão.
- `/api/webhooks/whatsapp`: manter compatibilidade durante a transição, delegando ao adapter Evolution.

### Fluxo de ingestão

1. limitar tamanho e taxa por origem;
2. validar assinatura/secret antes de confiar no corpo;
3. calcular `payloadHash` e chave externa estável;
4. resolver a conexão por asset externo sem aceitar `projectId` do payload;
5. numa única transação, inserir `ProviderEvent` idempotente e `OutboxEvent`;
6. responder 200 rapidamente;
7. o dispatcher publica o outbox em `provider-events`;
8. o worker normaliza, aplica serviços de domínio e marca o evento como processado;
9. falhas usam backoff e, após o limite, DLQ com alerta e replay auditado.

O payload integral nunca vai para `console.log`. Logs contêm correlation ID, provider, conexão, tipo do evento, hash e resultado. Quando a retenção do payload bruto for necessária para replay/suporte, ele será cifrado, com acesso restrito e expiração configurada.

## 5. Filas e workers

| Fila | Responsabilidade | Chave idempotente sugerida |
|---|---|---|
| `provider-events` | Normalizar eventos e atualizar domínio | `providerEventId` |
| `message-dispatch` | Enviar mensagem individual | `message.id` / `idempotencyKey` |
| `message-status` | Aplicar status fora de ordem com monotonicidade | provider + message ID + status + timestamp |
| `audience-imports` | Ler CSV/XLSX, validar e criar snapshot | `audienceImportId:batch` |
| `campaign-dispatch` | Materializar e despachar destinatários elegíveis | `campaignRecipient.id` |
| `automation-scheduler` | Acordar enrollments vencidos | `enrollmentId:version:nextWakeAt` |
| `automation-actions` | Executar um step de automação | `stepExecution.id` |
| `media-processing` | Verificar MIME/tamanho, scanner e metadados | `mediaObject.id:version` |
| `dead-letter` | Operação manual de falhas permanentes | job original + tentativa final |

Requisitos:

- retry somente para falhas classificadas como transitórias;
- exponential backoff com jitter e limites por provider;
- rate limit distribuído por conexão, WABA/número, projeto e endpoint;
- circuit breaker para qualidade degradada, auth revogada ou excesso de erros;
- concurrency configurável por fila, nunca uma variável global irrestrita;
- payload de job contém IDs, não tokens ou arquivos Base64;
- replay exige permissão administrativa, motivo, actor e registro auditável.

## 6. Outbox e scheduler

Toda operação que precise persistir estado e publicar um job cria `OutboxEvent` na mesma transação de banco. Um dispatcher reentrante busca linhas `PENDING` com `FOR UPDATE SKIP LOCKED`, publica no Redis e marca `PUBLISHED`. Falhas permanecem recuperáveis no PostgreSQL.

O scheduler não depende de timers em memória. A fonte de verdade é `scheduledAt`/`nextWakeAt` no PostgreSQL. Uma instância com lease ou advisory lock busca itens vencidos, cria outbox idempotente e renova o próximo wake-up. Reinício e deploy não podem duplicar ações.

## 7. Object storage

Escolha recomendada: bucket privado Cloudflare R2, acessado pela API S3. Outro storage S3-compatible pode ser usado sem mudar o domínio.

- upload direto por URL assinada de curta duração;
- chave de objeto inclui ambiente/projeto/UUID, nunca e-mail ou telefone;
- MIME real, tamanho, checksum e estado de scan persistidos em `MediaObject`;
- download autenticado gera URL assinada de curta duração;
- importações, exportações e mídia ficam fora do PostgreSQL e do Redis;
- criptografia em repouso, CORS estrito, lifecycle/retention e bucket separado por ambiente;
- mídia não verificada não é disponibilizada nem reenviada;
- exclusão obedece retenção, legal hold e auditoria, nunca cascade acidental de lead/conversa.

## 8. Realtime e Inbox

A primeira versão usa Server-Sent Events:

- cliente abre stream autenticado por sessão;
- servidor resolve membership do projeto e nunca aceita outro projeto pelo evento;
- worker publica evento mínimo no Redis Pub/Sub após commit;
- réplicas web fazem fan-out somente para assinantes autorizados;
- cursor e paginação no PostgreSQL cobrem reconexão; Pub/Sub não é histórico;
- polling de fallback pode permanecer temporariamente com intervalo maior durante dual-read.

SSE atende atualização unidirecional da inbox com menor complexidade. WebSocket só será adotado se presença, typing ou sinais bidirecionais justificarem o custo operacional.

## 9. Segurança e privacidade

- secrets de aplicação permanecem em variáveis do Coolify; tokens por conexão ficam cifrados no banco.
- `CHANNEL_CREDENTIALS_ENCRYPTION_KEY` é independente de `NEXTAUTH_SECRET` e `WEBHOOK_ENCRYPTION_KEY`.
- envelope contém algoritmo, nonce, ciphertext, auth tag e `keyId`; a leitura aceita chave anterior durante rotação, a escrita usa somente a ativa.
- App Secret e chaves nunca são enviados ao cliente ou registrados em logs.
- todo resource lookup usa `projectId` no critério, não apenas um `findUnique(id)` após autenticação genérica.
- service tokens têm o mínimo de scopes; acesso administrativo e replay entram em auditoria imutável.
- conteúdos e identidades têm retenção definida, exportação e exclusão LGPD controlada.
- consentimento é específico por projeto, identidade/endereço, canal, finalidade e origem da prova.
- suppression list prevalece sobre audiência, automação e tentativa manual de campanha.

## 10. Variáveis de ambiente planejadas

Somente nomes; valores devem existir separadamente por ambiente e nunca ser versionados.

### Meta

- `META_APP_ID`
- `META_APP_SECRET`
- `META_GRAPH_API_VERSION`
- `META_WEBHOOK_VERIFY_TOKEN`
- `META_EMBEDDED_SIGNUP_CONFIG_ID`
- `META_OAUTH_REDIRECT_URI`
- `META_APP_BASE_URL`
- `META_DATA_DELETION_CALLBACK_URL`

Tokens de WABA, números e Instagram não serão variáveis globais: serão credenciais por `ChannelConnection`, cifradas e rotacionáveis.

### Redis e processos

- `REDIS_URL`
- `QUEUE_PREFIX`
- `WORKER_CONCURRENCY_PROVIDER_EVENTS`
- `WORKER_CONCURRENCY_MESSAGES`
- `WORKER_CONCURRENCY_CAMPAIGNS`
- `WORKER_CONCURRENCY_AUTOMATIONS`
- `SCHEDULER_POLL_INTERVAL_MS`
- `OUTBOX_POLL_INTERVAL_MS`

### Criptografia e webhooks

- `CHANNEL_CREDENTIALS_ENCRYPTION_KEY`
- `CHANNEL_CREDENTIALS_KEY_ID`
- `PROVIDER_EVENT_ENCRYPTION_KEY`
- `WEBHOOK_MAX_BODY_BYTES`
- `PROVIDER_EVENT_RETENTION_DAYS`

### Object storage

- `OBJECT_STORAGE_ENDPOINT`
- `OBJECT_STORAGE_REGION`
- `OBJECT_STORAGE_BUCKET`
- `OBJECT_STORAGE_ACCESS_KEY_ID`
- `OBJECT_STORAGE_SECRET_ACCESS_KEY`
- `OBJECT_STORAGE_SIGNED_URL_TTL_SECONDS`
- `OBJECT_STORAGE_MAX_FILE_BYTES`

### Importação e operação

- `AUDIENCE_IMPORT_MAX_FILE_BYTES`
- `AUDIENCE_IMPORT_MAX_ROWS`
- `DLQ_ALERT_WEBHOOK_URL`

As variáveis Evolution existentes são preservadas: `EVOLUTION_API_URL`, `EVOLUTION_API_KEY` e `EVOLUTION_WEBHOOK_SECRET`.

## 11. Topologia Coolify planejada

Sem deploy nesta fase. Quando autorizado, staging deve conter:

- `web`: Next.js e endpoints;
- `worker`: consumo BullMQ;
- `scheduler`: due jobs e outbox dispatcher, com singleton/lease;
- `postgres`: volume atual preservado e backup externo;
- `redis`: volume/eviction policy compatível com BullMQ e healthcheck;
- bucket privado externo por ambiente.

Staging e produção usam bancos, Redis, buckets, callbacks e credenciais Meta diferentes. A cópia de produção em staging deve ser sanitizada e nunca pode enviar mensagens reais.
