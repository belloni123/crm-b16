# Runbook — histórico Prisma reconciliado

Use somente em banco vazio, isolado ou staging. Produção não é um alvo deste runbook.

1. Confirme PostgreSQL 15 e defina `DB_SAFETY_SCOPE=isolated` ou `staging`.
2. Execute `scripts/verify-migration-history.sh`.
3. Capture invariantes antes com `npx tsx scripts/db/capture-invariants.ts before.json`.
4. Execute `npx prisma migrate deploy`.
5. Capture `after.json` e compare com `npx tsx scripts/db/compare-invariants.ts before.json after.json`.
6. Execute uma segunda vez `npx prisma migrate deploy`; deve informar que não há migrations pendentes.
7. Compare catálogo e schema com `prisma migrate diff`.

O replay vazio preserva quatro colunas legadas de `Lead`. Elas não são usadas pelo Prisma atual e não devem ser removidas sem uma fase destrutiva específica e aprovada.
