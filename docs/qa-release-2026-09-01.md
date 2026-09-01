# Evidências de QA — release 2026-09-01

Este relatório evita dados pessoais, tokens e credenciais. A linha de base foi coletada somente como contagens e verificações de integridade.

## Correção funcional — construtor de webhooks de entrada

Depois da primeira publicação, a configuração de entrada ainda expunha apenas os cinco destinos fixos da interface antiga. A correção substitui essa tela por um construtor dinâmico, sem alterar os tokens existentes:

- separação explícita entre webhooks de **Entrada** e **Saída**;
- até 50 mapeamentos ordenáveis por endpoint;
- 13 campos padrão de lead, incluindo prioridade, UTMs, referência e página de entrada;
- qualquer campo personalizado ativo como destino;
- criação de campo personalizado sem sair da configuração do webhook, com 13 tipos disponíveis;
- caminho JSON aninhado, obrigatoriedade por campo, prévia do mapeamento e validação contra destinos duplicados ou caminhos perigosos;
- conversão automática do formato legado para a versão 2 somente ao editar, preservando URL e token.

### Evidências da correção antes do deploy

| Verificação | Resultado |
|---|---|
| Testes automatizados | 16/16 aprovados |
| Casos novos | conversão legada, extração dinâmica, obrigatoriedade, duplicidade e bloqueio de prototype pollution |
| Compatibilidade com produção | 10/10 webhooks de entrada legados compatíveis; 0 incompatíveis |
| TypeScript | Aprovado com `tsc --noEmit` |
| ESLint | 0 erros; 42 avisos não bloqueantes fora da implementação nova |
| Auditoria de dependências de produção | 0 vulnerabilidades conhecidas |
| Whitespace/patch | `git diff --check` aprovado |
| Alteração de banco | Nenhuma migration; o mapeamento versionado usa a coluna já existente |

### Resultado da publicação corretiva

- Commit publicado: `148d9f9420a0e93632b7c8eb07723143ef5f62e6`.
- Deploy manual Coolify `p5pfhljxdfllrxpbzf9tm2bh`: **Success** em 2m04s.
- Imagem em execução corresponde exatamente ao commit; PostgreSQL `running/healthy` e aplicação `running`.
- Bundle de produção contém o novo construtor (`webhook_builder_bundle=present`).
- Migrations: nenhuma pendente; Next.js pronto em 226 ms.
- Backup pré-deploy validado por catálogo: `/var/lib/postgresql/data/manual-backups/crm-b16-pre-webhook-builder-20260901-v3.dump` (275,9 KiB). Duas tentativas vazias produzidas durante o ajuste do comando foram removidas; o dump validado foi preservado.
- Contagens antes/depois: 311 leads, 5 definições e 8 valores personalizados, 10 endpoints, 356 logs, 34 etapas e 6 pipelines — sem alteração.
- Smoke HTTP: `/api/health` 200, `/` 200, `/project` 307 para login, API sem chave 401 e token de webhook sintético inválido 404.
- Smoke visual não autenticado: tela de login renderizada no domínio de produção. O CRUD visual autenticado permanece dependente da sessão do usuário no Chrome, que não estava disponível para automação nesta rodada.

## Correção de experiência — páginas de erro

- Adicionadas telas consistentes para acesso negado (403), recurso inexistente (404), erro de rota (500) e falha global.
- Acesso negado a projeto e painel administrativo deixou de cair na exceção técnica ou no login com parâmetro genérico.
- Mensagens de produção não expõem detalhes internos; a tela 500 mostra somente o `digest` seguro quando disponível.
- O botão de nova tentativa usa a recuperação oficial da error boundary do Next.js.
- Corrigido o aviso de hidratação causado pela aplicação antecipada do tema em `data-theme`.
- QA visual local: variações de projeto, superadministrador e 404 renderizadas sem overlay de erro.
- QA HTTP local: página de acesso negado 200, rota inexistente 404 e rota protegida sem sessão 307 para login.
- Gates finais locais: 16/16 testes, TypeScript e build de produção aprovados, 12/12 páginas estáticas, auditoria com 0 vulnerabilidades e ESLint com 0 erros/37 avisos preexistentes fora das telas novas.

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
| Falha de login e recuperação de senha | Smoke manual antes e depois do deploy | Aprovado |
| API sem chave e tokens públicos inválidos | Smoke HTTP antes e depois do deploy | 401/404 conforme esperado |

## Segurança e dependências

O Next.js foi atualizado para 16.3.4 seguindo a convenção `proxy.ts` da versão atual. `next-auth` foi atualizado para 4.24.15 e Nodemailer para 9.1.1, que corrige os avisos atuais. O `next-auth` ainda declara uma faixa opcional antiga para Nodemailer; o build e a API usada pelo CRM são compatíveis, e a instalação do container usa `--legacy-peer-deps` até que o upstream amplie essa faixa.

Segredos deixaram de existir no Compose versionado. A senha do papel PostgreSQL e o segredo de sessão foram rotacionados durante a publicação, e uma chave independente de 64 caracteres foi configurada para headers de webhooks. Como a credencial histórica da Evolution API ainda permanece recuperável no Git, sua rotação coordenada com o serviço de WhatsApp continua recomendada. Nenhum segredo é reproduzido neste documento.

## Critérios pós-deploy

- `prisma migrate status` com três migrations e schema atualizado;
- `/api/health` retornando 200;
- aplicação e PostgreSQL saudáveis no Coolify;
- contagens críticas preservadas;
- zero novos vínculos cruzados ou ordens duplicadas;
- login inválido, recuperação, API sem chave e tokens inválidos mantendo os contratos;
- ausência de erro novo no console e nos logs do deploy.

## Resultado pós-deploy

- Repositório: `belloni123/crm-b16`, branch `main`.
- Commit funcional validado: `fff120d1e0b8feb7290a7ca89193758a9114db95`.
- Commit efetivamente publicado: `8173bbd7f4cd8484567f22608917597f2c6bd3ef`.
- Coolify: deploy manual concluído com status **Success** em 2026-09-01; aplicação e PostgreSQL `running/healthy`.
- Migration nova aplicada automaticamente; as três entradas estão finalizadas e sem rollback.
- Next.js iniciou em 417 ms após a migration.
- Healthcheck externo: `GET /api/health` → 200 com `{"status":"ok"}`.

A primeira tentativa, em `fff120d`, não executou a migration nem iniciou o serviço web: a sintaxe `${VAR:?mensagem}` foi interpretada pelo gerenciador de variáveis do Coolify como valor literal, deixando somente o PostgreSQL em execução. O volume permaneceu intacto. O Compose foi corrigido para interpolação portátil e healthcheck sem credenciais; a segunda tentativa, em `8173bbd`, foi concluída normalmente.

### Contagens antes e depois

| Tabela | Antes | Depois |
|---|---:|---:|
| User | 5 | 5 |
| Project | 6 | 6 |
| Membership | 17 | 17 |
| Pipeline | 6 | 6 |
| Stage | 34 | 34 |
| Origin | 12 | 12 |
| LostStatus | 20 | 20 |
| Lead | 310 | 310 |
| PipelineEntry | 269 | 269 |
| CustomFieldDefinition | 5 | 5 |
| CustomFieldValue | 8 | 8 |
| Tag | 16 | 16 |
| Task | 8 | 8 |
| Activity | 1.378 | 1.378 |
| WebhookEndpoint | 10 | 10 |
| WebhookLog | 355 | 355 |
| WhatsAppInstance | 4 | 4 |
| Conversation | 76 | 76 |
| Message | 633 | 633 |
| Form | 4 | 4 |
| FormField | 14 | 14 |
| CalendarIntegration | 1 | 1 |

Após a migration: zero vínculos pipeline/projeto cruzados, zero valores customizados cruzados, zero formulários com destino incompatível, zero ordens duplicadas de etapa e zero valores customizados duplicados. Os seis webhooks antigos com etapa inválida e os 41 leads sem pipeline permaneceram inalterados.

### Smoke tests de produção

| Teste | Resultado |
|---|---|
| `GET /` | 200 |
| `GET /project` sem sessão | 307 para login |
| `GET /api/v1/leads` sem chave | 401 |
| Formulário com token sintético inválido | 404 |
| Webhook de entrada com token sintético inválido | 404 |
| Login inválido | Mensagem segura, sem navegação |
| Recuperação com e-mail sintético inexistente | Resposta genérica, sem enumeração |
| Console do navegador | 0 erros |
| Logs do serviço | Migration aplicada, Next.js pronto, sem erro novo |
| Layout desktop | Renderização visual aprovada, identidade B16 preservada |

### Limite de cobertura autenticada

Não havia conta de QA autorizada nem sessão autenticada disponível no navegador conectado; a integração com Chrome também não estava disponível. Por segurança, não foi criada, redefinida ou removida uma conta real e nenhum lead de produção foi alterado apenas para teste. Assim, login positivo/logout, CRUD visual de usuário e lead, arraste do Kanban e CRUD visual de campos/webhooks não foram repetidos como E2E no domínio. Esses caminhos foram cobertos por testes automatizados das regras, validações de autorização, build/TypeScript, revisão dos fluxos e integridade pós-deploy, mas ainda constituem a principal lacuna manual desta rodada.
