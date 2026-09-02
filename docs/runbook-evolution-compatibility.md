# Runbook — compatibilidade Evolution

## Escopo seguro

O backfill recusa produção e exige `DB_SAFETY_SCOPE=isolated` ou `staging` e `BACKFILL_TARGET_CONFIRMATION=<scope>:evolution-foundation`. Ele não chama a Evolution, não lê tokens para logs e não altera `Lead`, `PipelineEntry`, conteúdo ou status histórico de mensagens.

## Sequência

1. Restaure o dump validado em PostgreSQL 15 isolado.
2. Execute todas as migrations com `prisma migrate deploy`.
3. Capture invariantes com `INVARIANT_PROFILE=commercial`.
4. Execute `npm run backfill:evolution -- --dry-run`.
5. Execute `npm run backfill:evolution`; checkpoints permitem retomada por instância.
6. Execute novamente o backfill para provar idempotência.
7. Execute `npm run shadow:evolution` e capture novamente as invariantes comerciais.
8. Compare as invariantes com `scripts/db/compare-invariants.ts`.

O backfill cria uma conexão Evolution inativa por instância, uma identidade por endereço externo dentro da conexão e preenche somente as colunas omnichannel opcionais de conversas e mensagens. Endereços variantes não são mesclados. Duplicatas e ausências de `remoteId` são classificadas, sem constraint retroativa.

## Dual-write

`evolution_dual_write` nasce e termina desligada. O fluxo legado persiste primeiro e permanece a leitura principal. A ponte liga o mesmo registro de conversa/mensagem ao domínio novo e grava somente IDs técnicos no outbox. Falhas da ponte retornam `RETRY_PENDING` sem derrubar o processamento legado.

Em staging, execute o teste somente com a fixture sintética e `DUAL_WRITE_TEST_CONFIRMATION=staging:synthetic-only`. O script desliga todas as flags, mantém conexões Evolution inativas e remove jobs de teste pendentes no bloco `finally`.
