# Relatório de execução — Fases 1C.1 e 2A

Data da execução: 3 de setembro de 2026  
Repositório: `belloni123/crm-b16`  
Base oficial: `feat/evolution-compatibility-layer` em `5f417e6de199fe6843f8d543ceb158259ecd0530`  
Commit funcional de referência: `3b19b5ba6dc28081e2772c96c2819cbd0a1bbc0b`

## Resultado executivo

A Fase 1C.1 foi aprovada integralmente antes do início da Fase 2A. O schema e o catálogo foram reconciliados, o índice parcial de mensagens foi validado, o retry Evolution passou a executar trabalho real, o webhook legado foi endurecido e o envio legado deixou de antecipar `SENT`. Banco PostgreSQL 15 vazio, clone restaurado, CI e staging passaram sem alteração de invariantes comerciais.

Na Fase 2A, o código do piloto Meta WhatsApp foi implementado, testado e publicado somente em staging. O staging possui HTTPS válida, páginas legais, Embedded Signup, cofre de tokens, cliente Graph, sincronização de templates, gateway e processamento real de webhooks, interface administrativa e envio one-shot. O app Meta existente **Clave** foi auditado até os limites do acesso disponível.

O piloto real não foi executado. O app ainda não possui `Config ID` de Facebook Login for Business/Embedded Signup e a auditoria do Business Portfolio foi interrompida pela confirmação de identidade por chave de acesso. Como o onboarding real não foi concluído, todas as feature flags terminam desligadas e zero mensagens oficiais foram enviadas. Não houve tentativa de improvisar credencial, WABA, número ou destinatário.

## Branches e commits

### Fase 1C.1

- `fix/pre-meta-readiness`, criada diretamente de `5f417e6de199fe6843f8d543ceb158259ecd0530`:
  - `315cc6443a25b3ec031f70c63b469a456681c8ed` — hardening obrigatório Evolution antes da Meta;
  - `6cfd5a93310449ea528de354936d58a4ec8acac6` — portão de drift com allowlist legada mínima documentada.

### Fase 2A

- `feat/meta-whatsapp-pilot`, criada de `6cfd5a93310449ea528de354936d58a4ec8acac6`:
  - `77c7deb667526c7d88cd666b5b9188e2afbffa53` — foundation do piloto Meta WhatsApp;
  - `f0fade02a447eaaf029cc7ceba856a6f40aa7886` — alinhamento da migration Meta com o schema Prisma;
  - `fa1d4a1026ded3c9833dc88b1e312976b2c33b90` — unicidade na resolução de assets Meta;
  - `f67af14d7cd8eef67c550a7a73dfc7d88183aa1b` — fechamento dos portões de segurança do piloto.

Não houve merge na `main`. O arquivo pessoal `PROMPT_REPLICAR_CRM_NOFRONTSCALE.md` permaneceu fora de todos os commits.

## Fase 1C.1

### Drift, schema e migrations

`Conversation.instanceId` foi alinhado no `schema.prisma` para `onDelete: Restrict`, refletindo a foreign key materializada pela migration Evolution. Nenhuma migration redundante foi criada para esse ajuste.

O novo `scripts/check-prisma-drift.ts` reconstrói o catálogo em PostgreSQL 15, compara nullability, defaults, índices, constraints e relações com o schema Prisma e falha para qualquer divergência nova. A allowlist permanece restrita aos artefatos legados comprovados em `docs/reconciliacao-historico-prisma.md`; ela não mascara objetos omnichannel, foreign keys, índices, nullability ou defaults novos.

Foi adicionada a migration aditiva:

`20260903120000_message_provider_id_partial_unique`

Ela cria unicidade parcial de `Message(channelConnectionId, providerMessageId)` somente quando os dois campos são não nulos. A pré-auditoria comprovou:

- duplicatas dentro da mesma conexão: `0`;
- repetições entre conexões: `16` ocorrências, correspondentes a `8` IDs de provider;
- todas as repetições entre conexões foram preservadas.

### Credenciais Evolution

`ensureEvolutionConnection` não escreve mais `credentialsEncrypted` nem `credentialsKeyId` no caminho de atualização. Conexões novas continuam sem token quando o backfill não possui credencial migrável; conexões existentes preservam ciphertext e `keyId`. O cenário foi validado com credencial sintética antes e depois de uma segunda reconciliação.

### Retry real Evolution

Os eventos foram separados em `EVOLUTION_DUAL_WRITE_INBOUND_RETRY` e `EVOLUTION_DUAL_WRITE_OUTBOUND_RETRY`. O worker agora:

- carrega o `OutboxEvent` por ID;
- confirma `projectId` e o escopo de mensagem, conversa e instância;
- executa a ponte correta, em vez de reconhecer nominalmente o job;
- diferencia erro permanente e transitório;
- aplica retry BullMQ e DLQ;
- não leva conteúdo da mensagem no job ou no log;
- é idempotente para jobs repetidos.

Foram cobertos falha e recuperação, job duplicado, entidade inexistente, cruzamento de projeto, outbound aceito/rejeitado, DLQ e segunda execução.

### Webhook Evolution legado

`/api/webhooks/whatsapp` mantém a compatibilidade da leitura principal, mas agora exige segredo fora de local/teste, usa comparação timing-safe, corpo bruto, limite de bytes, parse controlado, rate limit Redis por origem/instância, correlation ID e resposta redigida. Redis indisponível falha fechado. Payloads e exceções internas não são devolvidos nem registrados integralmente.

### Estado correto do envio legado

O envio Evolution valida kill switch, projeto, conversa, instância e configuração antes de persistir. A mensagem nasce como `QUEUED`/`SENDING`; somente uma aceitação válida grava `remoteId`, `acceptedAt` e estado canônico. HTTP rejeitado ou erro de rede resulta em `FAILED` redigido. Com `OUTBOUND_INTEGRATIONS_DISABLED=true`, nenhuma mensagem local falsa é criada.

### Bancos e invariantes

As 9 migrations foram executadas:

1. em PostgreSQL 15 vazio pela CI;
2. em clone restaurado e isolado da produção;
3. uma segunda vez pelo fluxo normal do Prisma, retornando `No pending migrations to apply`.

No clone restaurado:

- `WhatsAppInstance`: 4, hash `cf07e8f920603d808d10cdfa60dc39654e221ea62f1b367008a92a6861ab2ef0`;
- `Conversation`: 76, hash `2961b0ee8ded98f2ae3263b113b880283eb1d656ffea81760c4f38a15df5d877`;
- `Message`: 633, hash `6cc908cc88172454a151fc7999c6250c49583959a48a3e5101a533f8b27b2505`;
- `ChannelConnection`: 4;
- `ContactIdentity`: 76;
- órfãos de lead/projeto, pipeline/lead, pipeline/pipeline, pipeline/stage, conversa/lead e mensagem/conversa: todos `0`.

O arquivo completo de invariantes comerciais antes e depois teve o mesmo SHA-256:

`15918028f13fb351121724a572f0ca0deeba11c958d9fcda72e5559478b00402`

O PostgreSQL, a rede e o diretório temporários foram removidos depois da prova. O dump original foi preservado e novamente validado com SHA-256:

`260bdd9c99fd4d5b8c4e284902cec4874aba648c177fc2d75da68c9e1e7348df`

### CI e deploy de staging

A execução `33758113915` aprovou a Fase 1C.1. A execução final da Fase 2A, `33764008446`, aprovou:

- PostgreSQL 15 e Redis 7;
- scanner de migrations e `prisma validate`;
- `migrate deploy` duas vezes;
- portão de drift e checksums históricos;
- 48 testes, 48 aprovados, zero omitidos na CI;
- TypeScript;
- lint com 0 erros e 37 warnings preexistentes;
- build Next.js 16.3.4;
- boot/readiness de web, worker e scheduler.

## Fase 2A

### Referências oficiais

- WhatsApp Cloud API: `https://developers.facebook.com/docs/whatsapp/cloud-api`;
- Embedded Signup: `https://developers.facebook.com/docs/whatsapp/embedded-signup`;
- webhooks: `https://developers.facebook.com/docs/whatsapp/cloud-api/webhooks`;
- templates: `https://developers.facebook.com/docs/whatsapp/business-management-api/message-templates`;
- Solution/Tech Providers: `https://developers.facebook.com/docs/whatsapp/solution-providers`;
- sample oficial: `https://github.com/fbsamples/business-messaging-sample-tech-provider-app`;
- commit consultado do sample: `14703a3e1fdba9bcf75b2360b00817b6fcc9f79b`;
- Graph API configurada: `v24.0`.

O sample foi usado somente como referência de fluxo; não foi copiado integralmente.

### Inventário do app Meta Clave

- app existente: **Clave**;
- App ID: `1065199242773457`;
- Business Portfolio visível: **Agência B16**;
- Business ID: `142145626207971`;
- modo: publicado/Live;
- função da conta autenticada: Administrator;
- casos de uso existentes: Instagram Business e Pages API;
- Facebook Login for Business: presente;
- configurações de Login for Business: nenhuma (`Config ID` inexistente);
- produto WhatsApp: ainda não configurado no app;
- permissões WhatsApp/Advanced Access/App Review: ainda não comprovadas;
- `App Domains`: apenas `clave.agenciab16.com.br` no estado auditado;
- redirect URI existente: `https://clave.agenciab16.com.br/instagram/conectar`;
- Allowed Domains for JavaScript SDK: vazio;
- política de privacidade existente: `https://clave.agenciab16.com.br/privacidade`;
- termos existentes: `https://clave.agenciab16.com.br/termos`;
- exclusão existente: `https://clave.agenciab16.com.br/instagram/exclusao-de-dados`;
- WABAs, números, pagamento, qualidade, templates e recipients de teste: não acessíveis/confirmados antes do desbloqueio do Business Portfolio.

Permissões mínimas preparadas no código e na matriz de validação:

- `whatsapp_business_management`;
- `whatsapp_business_messaging`.

Nenhuma permissão adicional foi solicitada e nenhuma submissão para App Review foi iniciada.

### HTTPS e páginas legais

Staging final:

`https://mawcghq4zbnnzmbxmvby6fal.147.93.15.68.sslip.io`

O certificado Let's Encrypt é confiável, HTTP redireciona para HTTPS e o ambiente continua `noindex`. As páginas abaixo respondem `200`:

- `/privacy`;
- `/terms`;
- `/data-deletion`;
- `/meta/callback`.

O conteúdo identifica CLAVE/Agência B16, finalidade, contato, retenção, direitos LGPD, exclusão e revogação. A solicitação de exclusão é registrada de forma técnica, cifrada e rate-limited; não apaga dados automaticamente.

### Models e migration Meta

A migration aditiva `20260903140000_meta_whatsapp_pilot` cria:

- `MetaOnboardingSession`: state/nonce somente em hash, TTL, uso único, escopo por projeto/usuário e auditoria;
- `ChannelTemplate`: template por conexão, nome, idioma, categoria, status, componentes, hash e sincronização;
- `MessageDeliveryEvent`: aplicação idempotente e auditável de status do provider;
- `DataDeletionRequest`: solicitação técnica sem exclusão automática.

`Conversation.instanceId` torna-se opcional para conversas Meta, mantendo `RESTRICT` para o legado. Relacionamentos comerciais continuam opcionais e não há cascade para `Lead`.

### Embedded Signup e token

A interface `Configurações > Canais > WhatsApp oficial` é restrita a `PROJECT_ADMIN`. O SDK é carregado somente nessa tela, usa `config_id`, `response_type=code`, `override_default_response_type=true` e `extras.sessionInfoVersion` configurável. O cliente não recebe App Secret e não persiste token em `localStorage`.

No servidor, o fluxo valida membership, projeto, state, nonce, expiração e replay; troca code por token; valida App ID, expiração, scopes e granular scopes da WABA; identifica Business/WABA/Phone; verifica status do número e subscription; cifra o token com AES-256-GCM e AAD; nunca retorna o token ao browser; e só marca a conexão como ativa depois de todos os portões.

### Cliente Graph, templates e desconexão

`lib/channels/meta/graph-client.ts` centraliza base/versionamento, timeout, AbortSignal, correlation ID, classificação de erro, redaction e User-Agent. Tokens são enviados por `Authorization`, nunca por URL. Retry automático existe somente para GET transitório seguro; POST de mensagem não é repetido cegamente.

A sincronização de templates apenas lê/persiste templates da WABA, valida status e hash, e não cria nem edita templates. A tela mascara Business, WABA e telefone, exibe saúde/token/sincronização e não contém controles de campanha. Desconectar tenta revogar a subscription quando permitido, arquiva a conexão e preserva conversas e mensagens.

### Webhook, inbound e status

`/api/webhooks/providers/meta` implementa HMAC SHA-256, corpo bruto, limites, rate limit Redis e resolução estrita:

`META_WHATSAPP + externalWabaId + externalPhoneNumberId + isActive=true`.

O gateway percorre todas as `entry`, `changes`, `messages` e `statuses`. Asset desconhecido gera somente log técnico com identificador hash; resolução ambígua ou projeto divergente é bloqueada; flags desligadas impedem processamento de domínio.

O worker valida projeto, adquire lease, descriptografa `ProviderEvent` com AAD, normaliza e aplica de forma idempotente, recupera `PROCESSING` expirado, usa retry e envia falha terminal para DLQ. Inbound cria identidade/conversa omnichannel sem criar lead, sem alterar `PipelineEntry` e sem mesclar Evolution. Tipos suportados incluem texto, mídia, localização, contatos, reação, interativo, botão, pedido, sistema e `unsupported`; mídia fica apenas como referência quando storage está desligado.

Status `ACCEPTED`, `SENT`, `DELIVERED`, `READ`, `FAILED` e `DELETED` são monotônicos. Status recebido antes da mensagem permanece pendente para correlação. Cada aplicação idempotente gera `MessageDeliveryEvent` com timestamp e erro redigido.

### Envio unitário

`scripts/meta/send-pilot-message.ts` recusa produção, exige staging, projeto/conexão, confirmação explícita, expiração e destinatário allowlisted. Faz dry-run, limita a uma mensagem, usa somente valores sintéticos, passa por `QUEUED`/`SENDING`, aceita apenas resposta Graph válida e não repete POST automaticamente.

Nenhum processo one-shot foi iniciado porque não existe conexão Meta validada, test recipient confirmado ou allowlist autorizada. Resultado desta execução:

- mensagens oficiais enviadas: `0`;
- recipient: não aplicável;
- provider message ID: não aplicável;
- status final de entrega: não aplicável;
- chamadas a Evolution, SMTP, Google ou Microsoft durante o piloto: `0`.

### Staging e flags finais

Recurso Coolify: `crm-b16-omnichannel-staging`  
Branch: `feat/meta-whatsapp-pilot`  
Commit publicado: `f67af14d7cd8eef67c550a7a73dfc7d88183aa1b`

Estado validado:

- web: healthy;
- worker: healthy;
- scheduler: healthy;
- PostgreSQL: healthy;
- Redis: healthy;
- `OUTBOUND_INTEGRATIONS_DISABLED=true`;
- `OBJECT_STORAGE_ENABLED=false`;
- features habilitadas: `0`;
- outbox pendente/DLQ: `0`;
- páginas legais: `200`;
- webhook GET com token incorreto: `403`;
- webhook POST sem HMAC/válido incorreto: bloqueado antes do domínio.

Como o onboarding real não terminou, `omnichannel_foundation`, `meta_whatsapp`, `campaigns`, `automations`, `meta_instagram`, `realtime_inbox`, `object_storage` e `evolution_dual_write` permanecem `false` em todos os projetos.

### Bloqueios externos e ponto de retomada

#### 1. Confirmação para criar a configuração OAuth

- ação preparada: clicar em `Criar configuração` em Facebook Login for Business para gerar o `Config ID` do Embedded Signup;
- ferramenta: painel autenticado Meta for Developers, app Clave;
- estado observado: nenhuma configuração existente;
- recurso ausente: confirmação imediata do usuário para criar uma configuração OAuth persistente;
- alternativa segura avaliada: não existe `Config ID` reutilizável e criar outro app é expressamente proibido;
- retomada: criar a configuração no app existente, adicionar apenas os redirect/domínios de staging, registrar o `META_CONFIG_ID` no Coolify e redeployar staging.

#### 2. Reautenticação do Business Portfolio

- ação tentada: abrir as configurações e inventariar verificação empresarial, WABA, números, pagamento e usuários;
- ferramenta: Meta Business Suite autenticada;
- bloqueio exibido: confirmação de identidade por chave de acesso/passkey;
- recurso ausente: presença do usuário para concluir a verificação biométrica/2FA;
- alternativa segura avaliada: `Try another method` não ofereceu método utilizável; não há bypass seguro ou autorizado;
- retomada: o usuário confirma a identidade, a auditoria de Business/WABA/Phone continua e somente ativos próprios/de teste podem ser selecionados.

Sem esses dois passos não é seguro validar token real, conectar WABA, inscrever a app, sincronizar templates reais, habilitar as duas flags do projeto sintético ou enviar a mensagem piloto.

### App Review e backup externo

App Review não foi submetido. Permanecem para uma autorização posterior: Advanced Access, justificativas por permissão, screenshots/vídeo, conta de teste, instruções ao revisor, Data Use Checkup e validação jurídica das URLs definitivas.

O backup externo diário continua pendente por ausência de destino S3-compatible no Coolify. Isso não bloqueia o piloto em staging, mas bloqueia qualquer rollout futuro em produção. O dump custom-format validado foi preservado no servidor; nenhuma cópia real virou banco permanente de staging.

## Produção intacta e declarações finais

Produção foi reinspecionada em modo somente leitura no Coolify: recurso `crm-b16:main-bavvnurbx1q576ehkicmazi6`, status `Running`, branch `main`. O remoto `refs/heads/main` permanece em `215fa2de65b817cefa9c69bd7dd11d26c90fa527`.

Nenhuma migration foi executada em produção.  
Nenhum deploy foi feito em produção.  
Nenhuma variável de produção foi alterada.  
Nenhum cliente ou ativo de cliente foi usado.  
Nenhuma campanha foi criada.  
Nenhum CSV ou XLS foi importado.  
Nenhuma automação foi criada.  
Zero mensagens oficiais foram enviadas; portanto, o limite máximo de uma mensagem ao destinatário interno autorizado foi respeitado.  
A Evolution permaneceu como leitura principal do Inbox.  
Produção permaneceu em `main` no commit `215fa2de65b817cefa9c69bd7dd11d26c90fa527`.

A Fase 2B não foi iniciada.
