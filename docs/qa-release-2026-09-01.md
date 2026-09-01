# Evidências de QA — release 2026-09-01

Este relatório evita dados pessoais, tokens e credenciais. A linha de base foi coletada somente como contagens e verificações de integridade.

## Escopo

- evolução segura de campos personalizados;
- webhooks configuráveis de saída, mantendo os contratos de entrada;
- reordenação persistente de etapas do Kanban;
- migration, backup, rollback e healthcheck;
- atualização de Next.js e dependências afetadas por alertas de segurança;
- preservação dos registros e isolamento entre projetos.

## Fluxo validado

Interface → Server Action ou rota HTTP → validação de sessão/projeto → Prisma → PostgreSQL → revalidação ou resposta HTTP. Os endpoints públicos de formulário e webhook fazem validação própria de token, destino, campos, rate limit e honeypot antes de persistir.

## Evidências pré-deploy

| Verificação | Resultado |
|---|---|
| Testes automatizados de normalização, regras, defaults, ordem, payload, criptografia, SSRF e sanitização | 13/13 aprovados |
| Instalação limpa com lockfile | Aprovada com `npm ci --legacy-peer-deps` |
| Auditoria de dependências de produção | 0 vulnerabilidades conhecidas |
| Prisma schema | Válido |
| TypeScript e build de produção | Aprovados; 11/11 páginas estáticas geradas |
| ESLint | 0 erros; 47 avisos não bloqueantes já catalogados |
| Whitespace/patch | `git diff --check` aprovado |
| Migration em clone restaurado do backup | Aprovada com `ON_ERROR_STOP` |
| Preservação no ensaio | 310 leads, 8 valores personalizados, 10 endpoints e 355 logs, sem alteração de contagem |
| Integridade do banco antes da mudança | 0 vínculos pipeline/projeto cruzados; 0 valores customizados cruzados; 0 formulários com destino inválido; 0 ordens duplicadas de etapa |
| Backup PostgreSQL custom | Catálogo validado por `pg_restore -l`; dump preservado no volume persistente |

O banco já possuía seis webhooks de entrada antigos apontando para etapas hoje inexistentes. Eles foram preservados para não quebrar tokens ou histórico e passam a ser identificados na interface como configuração inválida. Também existem 41 leads sem participação ativa em pipeline; são registros legados preservados, não efeito da migration.

## Casos funcionais cobertos

| Caso | Cobertura | Estado |
|---|---|---|
| Criar/editar campo com tipo, opções, regra e default | Unitário + build + revisão de fluxo | Aprovado |
| Rejeitar default ou valor fora das regras | Unitário + servidor | Aprovado |
| Arquivar campo sem apagar valores | Modelo/migration + revisão de fluxo | Aprovado |
| Reordenar campos e etapas com coleção exata | Unitário + transação | Aprovado |
| Rejeitar ID externo, ausente ou duplicado | Unitário + autorização no servidor | Aprovado |
| Gerar formulário com valores padrão | Build + revisão do HTML e rota | Aprovado |
| Criar payload de webhook ordenado | Unitário | Aprovado |
| Criptografar headers e não devolvê-los à UI | Unitário + revisão do fluxo | Aprovado |
| Bloquear localhost, rede privada e credencial na URL | Unitário | Aprovado |
| Sanitizar logs de webhook | Unitário | Aprovado |
| Falha de login e recuperação de senha | Smoke manual em produção anterior | Aprovado |
| API sem chave e tokens públicos inválidos | Smoke HTTP em produção anterior | 401/400/404 conforme esperado |

## Segurança e dependências

O Next.js foi atualizado para 16.3.4 seguindo a convenção `proxy.ts` da versão atual. `next-auth` foi atualizado para 4.24.15 e Nodemailer para 9.1.1, que corrige os avisos atuais. O `next-auth` ainda declara uma faixa opcional antiga para Nodemailer; o build e a API usada pelo CRM são compatíveis, e a instalação do container usa `--legacy-peer-deps` até que o upstream amplie essa faixa.

Segredos deixaram de existir no Compose versionado. Como valores antigos permanecem recuperáveis no histórico Git, a rotação operacional continua recomendada. Nenhum segredo é reproduzido neste documento.

## Critérios pós-deploy

- `prisma migrate status` com três migrations e schema atualizado;
- `/api/health` retornando 200;
- aplicação e PostgreSQL saudáveis no Coolify;
- contagens críticas preservadas;
- zero novos vínculos cruzados ou ordens duplicadas;
- login inválido, recuperação, API sem chave e tokens inválidos mantendo os contratos;
- ausência de erro novo no console e nos logs do deploy.

O resultado pós-deploy, commit e horário serão acrescentados ao final desta página após a publicação.
