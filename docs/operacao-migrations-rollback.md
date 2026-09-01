# Operação, migration e rollback

## Estado anterior

O PostgreSQL 15 de produção foi historicamente sincronizado com `prisma db push`; por isso, antes desta entrega, a tabela `_prisma_migrations` não existia. O schema do container e o schema do commit oficial foram comparados antes da mudança.

## Backup pré-migração

Foi criado um dump PostgreSQL em formato custom dentro do volume persistente, em `manual-backups/crm-b16-pre-20260901T1500.dump`. O catálogo foi validado com `pg_restore -l`, e tamanho e SHA-256 foram conferidos. O checksum deve ser consultado diretamente no servidor, sem copiar credenciais para relatórios.

O backup no mesmo volume protege contra erro lógico, mas não contra perda do servidor/volume. A recomendação operacional P0 é adicionar backup recorrente para armazenamento S3 externo pelo Coolify.

## Ensaio seguro

1. O dump foi restaurado em um banco temporário isolado.
2. A migration `20260901150000_add_custom_fields_webhooks` foi executada com `ON_ERROR_STOP`.
3. As contagens críticas de leads, valores personalizados, endpoints e logs foram comparadas e permaneceram idênticas.
4. O banco temporário foi removido; o dump verificável foi preservado.

## Baseline e deploy

Como as duas migrations antigas já estavam materializadas no schema de produção, elas foram marcadas como aplicadas com `prisma migrate resolve --applied` antes da publicação da imagem cujo boot usa `prisma migrate deploy`. A operação registrou apenas os metadados de `20260606000000_init` e `20260606100000_add_crm_enhancements`, sem executar novamente o SQL antigo. O status foi conferido como atualizado; no deploy, somente a migration nova deve executar.

O container não executa mais seed nem `db push` no boot. O fluxo passa a ser:

1. backup validado;
2. baseline das migrations históricas, já concluído em 2026-09-01;
3. `prisma migrate deploy`;
4. start da aplicação;
5. healthcheck `/api/health`;
6. smoke tests e comparação de contagens.

No Coolify 4.3.14, não usar a forma `${VAR:?mensagem}` no `docker-compose.yml`: o parser de variáveis do painel pode materializar a mensagem como valor. As variáveis obrigatórias são declaradas como `${VAR}` e sua presença deve ser validada no painel e no container. O healthcheck do PostgreSQL usa apenas host e porta; a autenticação real é validada por `prisma migrate status` e pelo healthcheck da aplicação.

Na publicação de 2026-09-01, a primeira tentativa foi interrompida antes da migration por esse comportamento do parser. O volume não foi recriado. A senha do PostgreSQL e o segredo de sessão foram rotacionados, a configuração foi corrigida e o deploy `8173bbd7f4cd8484567f22608917597f2c6bd3ef` terminou saudável.

## Rollback

Esta migration é aditiva, salvo por tornar `WebhookEndpoint.targetStageId` opcional e criar índices. O rollback preferencial é de aplicação: redeploy do commit anterior, mantendo as novas colunas no banco. O código anterior ignora essas colunas, evitando perda de dados.

Se houver corrupção lógica comprovada:

1. interromper escritas;
2. preservar um segundo dump do estado atual;
3. restaurar o dump pré-migração em banco separado;
4. comparar registros e IDs;
5. somente promover a restauração após aprovação explícita.

Nunca usar `migrate reset`, `drop`, `truncate`, recriar volume ou restaurar por cima do banco em execução.

## Verificações pós-deploy

- migration registrada como aplicada;
- healthcheck 200;
- contagens das tabelas críticas iguais ou superiores à linha de base;
- zero vínculos cruzados entre projetos;
- login/logout e acesso por papel;
- listagem, criação, edição e movimentação de lead;
- reordenação de etapas sem mudar IDs/vínculos;
- campo personalizado, formulário e webhook de teste;
- logs de frontend, backend e PostgreSQL sem erro novo.
