# Relatório de execução — Fases 1B.1 e 1C

Data da execução: 2 de setembro de 2026  
Repositório: `belloni123/crm-b16`  
Base aprovada: `feat/omnichannel-foundation` em `814efbe494a6897f1b7ab0b1cfa4e60cb529cf94`

## Resultado executivo

Os portões de código, banco isolado e staging foram aprovados. A foundation foi endurecida e a ponte de compatibilidade Evolution foi implementada sem cutover: o Inbox legado continua sendo a leitura principal e `evolution_dual_write` termina desligada.

O backfill foi executado somente em um clone restaurado e isolado e no staging sintético. As invariantes comerciais ficaram idênticas antes e depois. Nenhum recurso de produção foi modificado.

Dois bloqueios externos permanecem, ambos previstos pelo documento e sem bloquear a Fase 1C:

1. não há destino S3-compatible configurado no Coolify para backup recorrente externo;
2. não foi disponibilizado acesso ao provedor DNS para criar o subdomínio HTTPS de staging.

O dump existente da Fase 1A foi preservado e novamente validado. HTTPS permanece portão obrigatório para a Fase 2A, que não foi iniciada.

## Branches e commits

- `feat/omnichannel-foundation-hardening`, criada exatamente de `814efbe494a6897f1b7ab0b1cfa4e60cb529cf94`:
  - `0f03ff75c42e40f7d707995029335a0d669417e5` — hardening operacional da foundation.
- `feat/evolution-compatibility-layer`, criada do commit aprovado de hardening:
  - `544d12b73c2265ba2c0ead88ef5509e468078d6d` — camada de compatibilidade, backfill e dual-write Evolution;
  - `0ee8d9a3602c54502d69bd09bd4090257b5a6b75` — `.env.example` explícito e versão de deploy;
  - `cbc555087a0317d0eb426dfa85be831cd0d50999` — encerramento determinístico da conexão BullMQ no teste sintético;
  - `32e79194e7e1c7202ab21cfe73b9f7f54a354c28` — `noindex` para ambientes não produtivos;
  - `17c777632a5ffbd238b43b5818d86ef385f79c60` — cenários integrados de falha e recuperação do outbox;
  - `dcf3def67b38a74c0df9053916dbbc1fe3dc856f` — propriedade e encerramento correto das conexões Redis do BullMQ;
  - `3b19b5ba6dc28081e2772c96c2819cbd0a1bbc0b` — isolamento por projeto dos cenários concorrentes de CI.

Não houve merge na `main`.

## Migrations

### `20260902210000_omnichannel_hardening`

Migration aditiva para robustez do outbox e retenção de eventos:

- `targetQueue`, `lockedBy`, `lockedUntil`, `lastAttemptAt`, `deadLetteredAt`, `deadLetterPublishedAt` e `maxAttempts` em `OutboxEvent`;
- `retentionUntil` em `ProviderEvent`;
- índices operacionais para status, lease e retenção.

### `20260902220000_evolution_compatibility`

- `WhatsAppInstance.archivedAt`;
- `ChannelConnection.legacyWhatsAppInstanceId`, opcional e único, com `ON DELETE SET NULL`;
- `BackfillCheckpoint` para execução resumível;
- relação de `Conversation` com `WhatsAppInstance` alterada de cascade para `ON DELETE RESTRICT`, preservando histórico.

Nenhum dado foi apagado. Nenhum índice único retroativo foi criado para `providerMessageId`, porque a auditoria encontrou repetições entre conexões.

## Arquivos alterados

- Configuração e CI: `.env.example`, `.github/workflows/omnichannel-foundation.yml`, `Dockerfile`, `docker-compose.yml`, `next.config.ts`, `package.json`.
- Runtime e segurança: `lib/env.ts`, `lib/outbound-policy.ts`, `lib/process-health.ts`, `lib/mail.ts`, `lib/calendar.ts`, `lib/webhooks.ts`, `lib/storage/s3-compatible.ts`.
- Foundation: `lib/channels/credentials.ts`, `lib/channels/events.ts`, `lib/channels/provider-event-vault.ts`, `lib/channels/webhook-gateway.ts`, `lib/outbox/dispatcher.ts`, `lib/queues/index.ts`, `workers/index.ts`, `scheduler/index.ts`.
- Compatibilidade Evolution: `lib/channels/evolution-compatibility.ts`, `lib/channels/evolution-bridge.ts`, `app/actions/whatsapp.ts`, `app/api/webhooks/whatsapp/route.ts`.
- Rotas endurecidas: healthcheck omnichannel, webhooks Meta/Evolution e integrações Google/Microsoft.
- Prisma: schema, seed sintético e as duas migrations descritas acima.
- Scripts: validação de ambiente, scanner de migrations, invariantes, backfill, shadow comparison e teste de dual-write.
- Testes: foundation, hardening, rate limit Redis e compatibilidade Evolution.
- Documentação: runbooks de hardening e de compatibilidade Evolution, além deste relatório.

O arquivo pessoal não relacionado `PROMPT_REPLICAR_CRM_NOFRONTSCALE.md` permaneceu fora dos commits.

## Backup e restore

### Backup recorrente externo

O recurso de S3 Storage do Coolify foi inspecionado e informou zero destinos configurados. A tela de backups da aplicação também não possuía agendamento utilizável. Sem endpoint, bucket e credenciais de um storage externo, não existe alternativa segura: gravar outra cópia no mesmo servidor não atenderia ao requisito de backup externo.

Bloqueio externo preciso:

- ação tentada: localizar e configurar destino S3-compatible no Coolify;
- ferramenta: painel autenticado do Coolify;
- resultado: `0 storage destinations for backups`;
- acesso ausente: um destino S3 externo e suas credenciais limitadas ao bucket de backup;
- alternativa rejeitada: manter somente outra cópia no mesmo host, pois não protege contra falha do servidor.

Estado atual:

- o dump custom-format da Fase 1A permanece protegido fora do Git;
- tamanho: 284.304 bytes;
- SHA-256: `260bdd9c99fd4d5b8c4e284902cec4874aba648c177fc2d75da68c9e1e7348df`;
- `pg_restore --list`: aprovado novamente;
- retenção atual: preservar o dump até existir outra cópia externa validada;
- RPO atual: o ponto do dump de 2026-09-02 18:00:03 UTC, sem SLA recorrente até o S3 ser fornecido;
- RTO observado para este conjunto: restauração técnica em menos de um minuto; o RTO de operação completa deve ser formalizado após o destino externo;
- política futura exigida: backup diário externo com no mínimo 14 pontos.

### Restore isolado

Foi criado PostgreSQL 15 efêmero em rede Docker interna, sem portas publicadas. O dump foi restaurado com sucesso, o catálogo foi validado e as migrations foram aplicadas somente nesse clone. Um Redis 7 efêmero foi mantido na mesma rede interna. Depois da prova, banco, Redis e rede temporários foram removidos; o dump foi preservado e teve seu checksum confirmado novamente.

## HTTPS e indexação

URL atual de staging:

`http://mawcghq4zbnnzmbxmvby6fal.147.93.15.68.sslip.io`

Os nomes sugeridos `crm-staging.nofrontscale.com.br` e `staging-crm.nofrontscale.com.br` não possuíam registro DNS. O Coolify não oferece acesso ao provedor DNS do domínio e não havia integração DNS configurada. Portanto não foi possível criar o registro nem emitir um certificado estável sem inventar credenciais ou alterar a produção.

Este é um bloqueio obrigatório para a Fase 2A. Até sua resolução, o staging mantém a URL HTTP existente e envia `X-Robots-Tag: noindex, nofollow, noarchive` em ambientes não produtivos.

## Hardening da foundation

### Ambiente e isolamento

- variáveis críticas passaram a ser obrigatórias e validadas no boot;
- booleanos críticos exigem `true` ou `false` explícito;
- `QUEUE_PREFIX` é obrigatório, precisa conter `DEPLOYMENT_ENV` e isola BullMQ por ambiente;
- `.env.example` contém somente nomes e placeholders;
- staging usa `QUEUE_PREFIX=crm-b16-staging-omnichannel`;
- nenhuma credencial de produção foi copiada.

### Kill switch universal

`OUTBOUND_INTEGRATIONS_DISABLED=true` agora bloqueia, antes da chamada externa:

- Evolution legado e adapters novos;
- exclusão remota, QR/configuração e envio;
- webhook de saída;
- SMTP e Resend;
- Google e Microsoft Calendar;
- Meta e object storage.

O fluxo legado não cria mais falso estado `SENT` quando a saída está bloqueada. Logs carregam apenas códigos técnicos redigidos.

### Rate limit Redis

O `Map` em memória foi substituído por operação Lua atômica no Redis. Existem limites separados por origem e por conexão, chaves prefixadas pelo ambiente, validação de proxy e comportamento fail-closed quando o Redis não está disponível. O teste concorrente real passou na CI com Redis 7.

### Cofres e rotação

- credenciais de canais mantêm AES-256-GCM e agora só aceitam chave anterior quando `CHANNEL_CREDENTIALS_PREVIOUS_KEY_ID` corresponde ao envelope;
- payloads de `ProviderEvent` usam cofre e chave separados;
- o envelope de provider usa nonce único, auth tag, `keyId` e AAD com projeto, conexão e versão;
- escrita usa somente a chave ativa;
- leitura aceita chave anterior apenas com `keyId` explícito correspondente;
- tamper e rotação foram testados;
- staging recebeu chave sintética distinta, sem reutilizar a chave de credenciais;
- retenção inicial: 30 dias.

### Outbox, leases, retry e DLQ

- claim de `PENDING` e recuperação de `PROCESSING` com lease expirado;
- `FOR UPDATE SKIP LOCKED` e identidade do scheduler;
- `jobId` idempotente;
- backoff exponencial com jitter;
- retorno para `PENDING` em falha transitória;
- `DEAD_LETTER` em falha permanente ou tentativas esgotadas;
- fila dead-letter recebe apenas referência técnica mínima;
- handlers desconhecidos falham controladamente;
- liveness e readiness separados;
- shutdown gracioso e namespace de filas por ambiente.

Os testes integrados com PostgreSQL 15 e Redis 7 cobrem crash antes e depois da publicação, concorrência, lease expirado, Redis indisponível, job duplicado, tentativa máxima, DLQ real e reexecução. A prova inicial revelou que clientes `ioredis` entregues prontos ao BullMQ eram tratados como compartilhados e permaneciam abertos após `queue.close()`. O factory passou a entregar opções de conexão, deixando cada Queue/Worker criar e encerrar seu próprio cliente; healthcheck, dispatcher, workers e teste passaram no encerramento limpo.

### Gateway e healthcheck

- HMAC estrito e timing-safe;
- tamanho validado antes de parse;
- limites de profundidade e coleção JSON;
- nenhum corpo bruto em log;
- payload Meta com múltiplas `entry`/`changes` vira envelopes separados;
- healthcheck público mínimo, detalhes adicionais somente em staging;
- cache curto, estados `healthy`, `degraded` e `unavailable`, commit, kill switch, flags, PostgreSQL, Redis, worker, scheduler e filas.

## CI e QA

Workflow `Omnichannel foundation` usa Node compatível, PostgreSQL 15 e Redis 7, sem secrets reais. Ele executa instalação, scanner de migrations, `prisma validate`, `migrate deploy` duas vezes, checksums históricos, testes, TypeScript, lint, build e readiness de worker/scheduler.

Execuções relevantes:

- hardening: run `33684730065`, aprovado;
- compatibilidade Evolution: run `33685878219`, aprovado;
- `.env.example`/compose: run `33686207471`, aprovado;
- correção da limpeza BullMQ: run `33687410338`, aprovado;
- commit final de `noindex`: run `33687878789`, aprovado.
- resiliência completa do outbox e encerramento Redis: run `33690181296`, aprovado.

Duas execuções intermediárias foram deliberadamente rejeitadas pelo portão: a run `33689379827` foi cancelada após revelar o handle Redis persistente, e a run `33690029909` falhou por interferência entre testes paralelos no banco compartilhado da CI. Ambas as causas foram corrigidas antes da run final aprovada.

Resultado local final antes do deploy:

- 33 testes: 30 aprovados e 3 integrações omitidas localmente por falta de Docker, todos os 33 aprovados na CI;
- TypeScript: aprovado;
- lint: zero erros e 37 warnings preexistentes;
- build Next.js 16.3.4: aprovado;
- `npm audit --omit=dev --audit-level=critical`: zero vulnerabilidades;
- scanner: 3 migrations aditivas validadas.

## Backfill no clone restaurado

### Dry-run

- instâncias: 4;
- conversas: 76;
- mensagens: 633;
- conversa sem lead: 74;
- lead de outro projeto: 0;
- mensagem sem `remoteId`: 0.

Hashes dos conjuntos de IDs legados, mantidos em todas as execuções:

- `WhatsAppInstance`: `cf07e8f920603d808d10cdfa60dc39654e221ea62f1b367008a92a6861ab2ef0`;
- `Conversation`: `2961b0ee8ded98f2ae3263b113b880283eb1d656ffea81760c4f38a15df5d877`;
- `Message`: `6cc908cc88172454a151fc7999c6250c49583959a48a3e5101a533f8b27b2505`.

### Interrupção e retomada

Com lote de uma instância, o processo foi interrompido intencionalmente após o primeiro checkpoint e encerrou com código 130:

- 1 instância;
- 54 conversas;
- 447 mensagens;
- status `CANCELLED`.

A retomada leu o checkpoint e processou as 3 instâncias restantes, 22 conversas e 186 mensagens, terminando em `COMPLETED`.

### Cobertura e conflitos

- 4/4 instâncias representadas por conexão Evolution inativa;
- 76/76 conversas ligadas;
- 76 identidades criadas, sem mesclar formatos variantes;
- 633/633 mensagens ligadas;
- divergência de projeto: 0;
- divergência de lead: 0;
- IDs de provider ausentes depois do vínculo: 0;
- duplicatas dentro da mesma conexão: 0;
- repetições entre conexões: 16 ocorrências classificadas e preservadas;
- conversas sem lead: 74, preservadas sem criação ou merge automático;
- retries pendentes: 0;
- DLQ: 0.

### Segunda execução

- 4 instâncias, 76 conversas e 633 mensagens reavaliadas;
- novas conexões: 0;
- novas identidades: 0;
- cobertura permaneceu 100%;
- nenhum registro duplicado;
- mesmos hashes de IDs.

## Invariantes antes e depois

| Tabela protegida | Antes | Depois |
| --- | ---: | ---: |
| Project | 6 | 6 |
| Lead | 313 | 313 |
| PipelineEntry | 272 | 272 |
| Conversation | 76 | 76 |
| Message | 633 | 633 |
| Activity | 1.390 | 1.390 |
| Task | 8 | 8 |
| Tag | 16 | 16 |
| CustomFieldDefinition | 5 | 5 |
| CustomFieldValue | 8 | 8 |

Todos os digests SHA-256 comerciais comparados ficaram idênticos. Os seis checks de órfãos permaneceram em zero: lead/projeto, oportunidade/lead, oportunidade/pipeline, oportunidade/estágio, conversa/lead e mensagem/conversa. Conteúdo e status histórico de mensagens foram incluídos nos digests e não mudaram.

## Staging sintético e dual-write

O seed criou somente dados sintéticos:

- 1 instância Evolution sem token;
- 1 conversa;
- 2 mensagens fake, uma inbound e uma outbound;
- conexão resultante inativa.

Backfill:

- primeira execução: 1 conexão e 1 identidade criadas; 1 conversa e 2 mensagens ligadas;
- segunda execução: 0 conexões e 0 identidades novas;
- shadow comparison: 1/1 instância, 1/1 conversa, 2/2 mensagens, zero divergências, retries ou DLQ.

Dual-write fake:

- `evolution_dual_write` foi habilitada somente no projeto sintético;
- inbound: `LINKED`;
- outbound fake: `LINKED`;
- mensagens ligadas: 2;
- nenhum `Message`, `Conversation`, `Lead` ou `PipelineEntry` duplicado;
- ativação e desativação auditadas;
- leitura principal permaneceu legada;
- a flag foi desligada no bloco de limpeza;
- jobs pendentes de teste foram removidos ou drenados sem apagar evidência publicada.

As invariantes comerciais sintéticas também ficaram idênticas antes e depois.

## Deploy e healthchecks finais

- branch publicada no staging: `feat/evolution-compatibility-layer`;
- commit funcional da aplicação: `3b19b5ba6dc28081e2772c96c2819cbd0a1bbc0b`;
- deploy em produção: nenhum;
- web: `healthy`;
- worker: `healthy`;
- scheduler: `healthy`;
- PostgreSQL 15: `healthy`;
- Redis 7: `healthy`;
- endpoint básico `/api/health`: HTTP 200;
- endpoint `/api/health/omnichannel`: `healthy`, kill switch ligado e zero flags ativas;
- `X-Robots-Tag`: `noindex, nofollow, noarchive`;
- HTTPS: bloqueado por DNS, conforme seção anterior.

Durante o primeiro deploy do hardening, o Coolify iniciou a build antes do salvamento do `QUEUE_PREFIX` e injetou o texto de placeholder. O boot explícito recusou corretamente a configuração e marcou o container unhealthy. Depois que a variável foi salva, o redeploy concluiu com todos os serviços saudáveis. Esse incidente não tocou produção e comprova o fail-fast configurado.

## Estado final de segurança

Staging:

```text
DEPLOYMENT_ENV=staging
OUTBOUND_INTEGRATIONS_DISABLED=true
OBJECT_STORAGE_ENABLED=false
evolution_dual_write=false
conexões Evolution ativas=0
credenciais Evolution reais=0
feature flags ativas=0 de 8
```

A auditoria de containers, variáveis não secretas, outbox e logs não encontrou chamada externa. Evolution, Meta, SMTP, Resend, Google e Microsoft permanecem sem credenciais reais no staging. Não houve envio, campanha ou automação.

Produção permaneceu:

```text
branch=main
commit=215fa2de65b817cefa9c69bd7dd11d26c90fa527
status=Running
```

## Declarações obrigatórias

Nenhuma migration foi executada em produção.  
Nenhum deploy foi feito em produção.  
Nenhuma variável de runtime da aplicação de produção foi alterada.  
Nenhuma mensagem foi enviada.  
Nenhuma conta Meta foi conectada.  
Nenhuma credencial Evolution real foi usada em staging.  
Todas as feature flags permanecem desligadas.  
Nenhum lead ou vínculo comercial foi alterado.  
A leitura principal do Inbox continua sendo a implementação legada.

A Fase 2A não foi iniciada.
