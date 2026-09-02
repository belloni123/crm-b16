# Runbook — hardening da foundation omnichannel

## Ambientes e variáveis

Web, worker e scheduler exigem `DEPLOYMENT_ENV`, `DATABASE_URL`, `REDIS_URL`, `QUEUE_PREFIX`, `OUTBOUND_INTEGRATIONS_DISABLED`, as chaves ativas de credenciais e de provider events e seus respectivos `keyId`. Web também exige `NEXTAUTH_URL`, `NEXTAUTH_SECRET`, `META_WEBHOOK_VERIFY_TOKEN` e `META_APP_SECRET`.

Staging usa namespace Redis exclusivo contendo `staging`, `OUTBOUND_INTEGRATIONS_DISABLED=true` e `OBJECT_STORAGE_ENABLED=false`. Produção deve receber valores próprios somente em uma futura publicação autorizada; nenhum secret pode ser promovido entre ambientes.

## Outbox

O scheduler reclama eventos `PENDING` e também leases `PROCESSING` expirados usando `FOR UPDATE SKIP LOCKED`. O lease padrão é 60 segundos. Falhas transitórias retornam a `PENDING` com backoff exponencial e jitter; fila desconhecida ou excesso de tentativas resulta em `DEAD_LETTER`. Jobs contêm somente IDs técnicos.

## Criptografia

Credenciais e payloads de provider usam chaves AES-256-GCM distintas. Para rotação, configure chave e `keyId` anteriores juntos, valide leitura, mantenha toda escrita na chave ativa e retire o par anterior somente após a janela de retenção. Provider events usam AAD de projeto, conexão e versão, com retenção padrão de 30 dias.

## Execução local equivalente à CI

Suba PostgreSQL 15 e Redis 7 isolados, defina as variáveis sintéticas de `.env.example` e execute: `npm ci`, `npx tsx scripts/check-additive-migrations.ts`, `npx prisma validate`, duas vezes `npx prisma migrate deploy`, `./scripts/verify-migration-history.sh`, `npm test`, `npx tsc --noEmit`, `npm run lint` e `npm run build`. Worker e scheduler expõem liveness em `/live` e readiness em `/ready`.
