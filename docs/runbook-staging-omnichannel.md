# Runbook — staging omnichannel

## Valores obrigatórios

- branch `feat/omnichannel-foundation`;
- PostgreSQL 15 e Redis 7 exclusivos;
- `DEPLOYMENT_ENV=staging`;
- `OUTBOUND_INTEGRATIONS_DISABLED=true` em web, worker e scheduler;
- chaves e tokens somente sintéticos de staging;
- `OBJECT_STORAGE_ENABLED=false` sem bucket exclusivo;
- URLs Evolution, SMTP e calendários vazios.

## Publicação

1. Faça deploy do Compose no ambiente `staging` do projeto CRM B16.
2. Aguarde PostgreSQL e Redis saudáveis.
3. O web executa somente `prisma migrate deploy` antes do `next start`.
4. Execute manualmente `npm run seed:staging` no container web.
5. Confirme 8 flags e 0 habilitadas.
6. Confirme health 200 para web, worker e scheduler e `PONG` no Redis.
7. Consulte `/api/health/omnichannel`: `outboundIntegrationsDisabled=true` e `enabledFeatures=0`.
8. Teste Meta GET com token sintético e POST inválido; nenhuma inscrição externa deve existir.

O seed recusa qualquer ambiente diferente de `staging` e exige o kill switch.
