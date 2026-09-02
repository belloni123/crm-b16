# Reconciliação do histórico Prisma — status da Fase 1A

Data: 2026-09-02

Status: **bloqueada no Passo 3 por ausência de acesso read-only ao banco real**.

## 1. Trabalho concluído

- branch `chore/prisma-history-reconciliation` criada a partir de `215fa2de65b817cefa9c69bd7dd11d26c90fa527`;
- seis documentos da Fase 0 versionados sem merge em `main`;
- runtime, Compose, boot, schema, migrations e hashes inventariados em [evidencias-migrations.md](./evidencias-migrations.md);
- presença de `.env` verificada sem revelar valores;
- o destino local foi classificado apenas como serviço local/Compose;
- Docker não está disponível nesta máquina;
- uma sondagem `SELECT` com `default_transaction_read_only=on` e timeout não conseguiu estabelecer conexão.

Nenhum dado, schema ou migration foi modificado por essa sondagem.

## 2. Motivo da parada

A estratégia de reconciliação depende de quatro fontes:

1. `prisma/schema.prisma`;
2. migrations versionadas;
3. `_prisma_migrations` do banco atual;
4. catálogo real do PostgreSQL.

Somente as duas primeiras estão disponíveis. Sem as duas fontes do banco, seria inseguro decidir entre baseline consolidada, migration incremental, migration histórica ausente ou `migrate resolve`. A instrução aprovada proíbe assumir que `schema.prisma` representa a produção e determina a parada neste ponto.

## 3. Acesso necessário para continuar

Fornecer uma das opções abaixo, sem colocar credenciais no Git ou no chat:

### Opção recomendada: dump custom-format gerado pelo administrador

1. o administrador gera um dump consistente do banco atual;
2. valida o arquivo com `pg_restore -l` e calcula SHA-256;
3. entrega o dump por canal seguro em caminho fora do repositório;
4. informa separadamente a versão major do PostgreSQL e confirma se o dump corresponde ao banco atualmente usado;
5. autoriza explicitamente a restauração somente em PostgreSQL 15 isolado e efêmero.

O dump conterá dados pessoais mesmo que eles não sejam exibidos nos relatórios. Por isso, precisa de permissão restrita, retenção curta e descarte aprovado ao final.

### Opção alternativa: conexão de banco realmente read-only

Disponibilizar no ambiente seguro, sem revelar no chat:

- host/porta/database por secret do ambiente;
- usuário PostgreSQL dedicado com `default_transaction_read_only=on` e sem privilégios de escrita/DDL;
- acesso de rede/TLS necessário;
- permissão de `SELECT` em `_prisma_migrations`, `information_schema`, `pg_catalog` e tabelas usadas somente para contagens/hashes;
- autorização para `pg_dump --format=custom` somente leitura, se o dump também for esperado.

Antes de coletar evidência, a sessão validará `transaction_read_only=on`. Se essa validação falhar, a coleta será interrompida.

## 4. Metadados que serão coletados

Sem imprimir PII:

- `server_version` e extensões;
- schemas, tabelas, views, sequences, colunas, tipos, nullability e defaults;
- PKs, FKs, uniques, checks, índices, triggers e funções relevantes;
- linhas técnicas de `_prisma_migrations`, com nome, checksum, timestamps/estado e logs de falha redigidos;
- contagens por tabela/projeto;
- hashes canônicos e IDs técnicos estritamente necessários para invariantes.

Nomes, e-mails, telefones, mensagens, tokens, payloads e URLs de banco não serão impressos ou versionados.

## 5. O que permanece deliberadamente não executado

- criação de `migration_lock.toml`;
- criação ou escolha de baseline/migration de reconciliação;
- SQL de reconciliação;
- scripts de invariantes dependentes do catálogo confirmado;
- dump e restore;
- replay em banco vazio;
- simulação de `migrate resolve`;
- automação do portão;
- qualquer comando contra produção;
- qualquer componente omnichannel;
- merge ou deploy.

## 6. Condição para retomar

Retomar a Fase 1A somente após uma das duas formas de acesso acima estar disponível e o usuário autorizar a análise. O próximo comando contra banco será exclusivamente read-only; nenhuma estratégia será escolhida antes da matriz completa.
