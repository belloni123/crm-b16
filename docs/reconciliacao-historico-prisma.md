# Reconciliação do histórico Prisma — Fase 1A

Data: 2026-09-02

Status: **APROVADA**. O portão para iniciar a Fase 1B foi satisfeito.

## Diagnóstico

O banco real continha um catálogo coerente com o `schema.prisma`, mas o histórico Git possuía somente três migrations. Parte do catálogo havia sido criada fora desse histórico: quatro tabelas, colunas atuais, índices e relacionamentos não podiam ser reproduzidos em um banco vazio. Os checksums das três migrations registradas no banco coincidiram com o Git; portanto, não houve adulteração das migrations aplicadas, e sim histórico incompleto.

Não foi necessário usar `prisma migrate resolve`, editar migrations aplicadas ou criar uma baseline que escondesse o problema.

## Estratégia executada

Foi criada `20260902190000_reconcile_prisma_history`, uma migration incremental e replay-safe que:

- adiciona somente os objetos ausentes;
- usa `IF NOT EXISTS` e verificações em `pg_constraint` para funcionar tanto no catálogo atual quanto no replay histórico;
- cria `PipelineEntry`, `Form`, `FormField` e `CalendarIntegration` quando ausentes;
- adiciona colunas, índices e FKs atuais que faltavam no histórico;
- corrige defaults técnicos;
- mantém todas as colunas legadas de `Lead` no replay vazio;
- torna apenas `Lead.stageId` legado nullable para não bloquear o write path atual;
- não contém `DROP TABLE`, `DROP COLUMN`, `DELETE`, `TRUNCATE`, backfill ou reconstrução de leads.

## Provas executadas

### Cópia restaurada do banco atual

- restore custom-format em PostgreSQL 15 isolado: aprovado;
- captura de invariantes antes: aprovada;
- `prisma migrate deploy`: migration de reconciliação aplicada;
- captura de invariantes depois: idêntica à anterior;
- 15 tabelas protegidas comparadas por contagem e SHA-256 canônico;
- 6 verificações de órfãos: zero antes e depois;
- `_prisma_migrations`: 4 migrations concluídas;
- `prisma migrate status`: banco atualizado;
- `prisma migrate diff`: zero drift material.

Contagens preservadas na cópia: 6 projetos, 313 leads, 272 pipeline entries, 76 conversas, 633 mensagens, 1.390 atividades, 8 tarefas, 16 tags, 5 definições e 8 valores de custom fields, 10 endpoints e 376 logs de webhook, 4 formulários, 14 campos de formulário e 1 integração de calendário.

O arquivo de invariantes anterior e posterior teve o mesmo SHA-256: `15918028f13fb351121724a572f0ca0deeba11c958d9fcda72e5559478b00402`.

### Banco completamente vazio

- PostgreSQL 15 isolado, sem tabelas iniciais: aprovado;
- `prisma migrate deploy` aplicou as quatro migrations em ordem;
- 24 tabelas públicas ao final;
- invariantes de dados: aprovados, nenhuma linha criada ou alterada;
- `_prisma_migrations`: 4 migrations concluídas;
- `prisma migrate status`: banco atualizado;
- drift residual documentado: quatro colunas e duas FKs históricas de `Lead` que só existem no replay vazio.

O residual não foi removido porque isso exigiria operações destrutivas. A coluna `stageId` histórica está nullable; as quatro colunas não são mapeadas pelo Prisma atual e não bloqueiam a aplicação.

## Scripts versionados

- `scripts/db/capture-catalog.sql`: catálogo sem dados de negócio;
- `scripts/db/capture-invariants.ts`: contagens e SHA-256 sem emitir PII;
- `scripts/db/compare-invariants.ts`: comparação antes/depois com falha fechada;
- `scripts/verify-migration-history.sh`: checksums, schema e status das migrations;
- `prisma/migrations/migration_lock.toml`: provider PostgreSQL explícito.

Todos exigem `DB_SAFETY_SCOPE=isolated` ou `staging`. Produção é recusada intencionalmente pelos scripts de invariantes e verificação.

## Portão da Fase 1A

| Critério | Resultado |
|---|---|
| banco correto identificado sem ambiguidade | PASS |
| produção acessada somente em read-only | PASS |
| dump custom-format válido, hash calculado e restore comprovado | PASS |
| checksums do banco iguais aos arquivos históricos | PASS |
| replay completo em banco vazio | PASS |
| reconciliação na cópia com invariantes preservados | PASS |
| nenhuma operação destrutiva ou backfill | PASS |
| drift da cópia restaurada zerado | PASS |
| drift residual do vazio justificado sem risco ao runtime | PASS |
| produção sem migration, mudança de variável ou deploy | PASS |

Conclusão: a transição automática para `feat/omnichannel-foundation` está autorizada pelo documento oficial.

## Reprodutibilidade

1. Restaure o dump em PostgreSQL 15 isolado.
2. Defina `DB_SAFETY_SCOPE=isolated` e `DATABASE_URL` para o clone.
3. Execute `npx tsx scripts/db/capture-invariants.ts before.json`.
4. Execute `npx prisma migrate deploy`.
5. Execute `npx tsx scripts/db/capture-invariants.ts after.json`.
6. Execute `npx tsx scripts/db/compare-invariants.ts before.json after.json`.
7. Execute `scripts/verify-migration-history.sh`.
8. Execute `prisma migrate diff` e confirme que a cópia restaurada não tem drift material.
