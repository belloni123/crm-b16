# Implementação — Omnichannel Foundation (Fase 1B)

## Escopo entregue

A foundation adiciona sete models novos, campos opcionais em `Conversation` e `Message`, provider registry, cofre AES-256-GCM, outbox transacional, Redis/BullMQ, worker, scheduler, storage S3-compatible desabilitado e gateway de webhooks de foundation.

O fluxo Evolution existente em `/api/webhooks/whatsapp` não foi alterado. Os adapters Meta são scaffolds incapazes de enviar. Campanhas, automações, Embedded Signup, OAuth Meta, templates, backfill e migração de mídia permanecem fora de escopo.

## Segurança por padrão

- as oito feature flags nascem `false`;
- `OUTBOUND_INTEGRATIONS_DISABLED=true` é validado no boot de worker e scheduler;
- providers retornam `BLOCKED` sem fazer chamada de rede;
- credenciais usam AES-256-GCM, nonce único, auth tag e `keyId`;
- payload integral de provider é cifrado e não aparece em logs;
- o gateway resolve o projeto pela conexão/asset, nunca pelo payload;
- Meta usa HMAC-SHA256 e comparação constante;
- body máximo de 1 MiB, rate limit e correlation ID;
- storage usa adapter `disabled` enquanto não houver bucket próprio de staging.

## Dados e relações

- `ContactIdentity.leadId` é opcional e `SetNull`;
- conexões são protegidas por `Restrict` quando possuem identities/events;
- nenhum novo campo em conversas ou mensagens é obrigatório;
- não há backfill;
- outbox no PostgreSQL é a fonte de verdade; Redis é transporte;
- índices parciais impedem dois providers-of-record ativos para o mesmo asset externo.

## Filas

`provider-events`, `outbox-dispatch`, `message-dispatch` e `dead-letter`. O worker executa somente no-op; `message-dispatch` é sempre bloqueada nesta fase. O scheduler reivindica outbox com `FOR UPDATE SKIP LOCKED`, publica job idempotente e marca `PUBLISHED`.

## Testes executados

- 24 testes Node aprovados;
- typecheck e build Next.js aprovados;
- lint sem erros (37 warnings preexistentes);
- migration aplicada em PostgreSQL 15 vazio e em clone restaurado;
- segunda execução sem DDL;
- clone com invariantes idênticos e zero drift;
- Redis PONG, worker 200, scheduler 200;
- outbox sintético passou de `PENDING` para `PUBLISHED`, uma tentativa;
- zero URL, token ou chamada externa nos logs do worker.
