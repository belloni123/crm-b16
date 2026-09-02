# ADR-001 — Modelo híbrido Evolution e Meta

Status: aceito para planejamento

Data: 2026-09-02

Escopo: Fase 0 CLAVE Meta Omnichannel

## Contexto

O CRM possui conexões Evolution API em produção, conversas ligadas diretamente a `WhatsAppInstance` e uma inbox que já é usada pela operação. A evolução exige WhatsApp Business oficial para templates e campanhas, Instagram Direct e uma inbox unificada, sem interromper o legado nem alterar os leads existentes.

Evolution e Meta não oferecem o mesmo contrato operacional. A Meta possui onboarding, WABA, phone number ID, templates, janelas, qualidade, status e webhooks oficiais. Evolution permanece útil para as conexões legadas, mas não deve ser apresentado como mecanismo de campanha oficial.

## Decisão

Adotar uma camada de providers por capabilities:

- `EvolutionProvider` preserva QR, mensagens e eventos legados;
- `MetaWhatsAppProvider` implementa Embedded Signup, Cloud API, templates, status e campanhas;
- `MetaInstagramProvider` implementa OAuth, inbound e respostas permitidas pelo Direct;
- domínio e UI dependem do contrato `MessagingProvider`, não das APIs concretas;
- cada identidade externa ativa tem um único provider-of-record;
- campanhas aceitam exclusivamente `MetaWhatsAppProvider`;
- a migração usa novas tabelas, FKs opcionais, backfill aditivo, dual-write, dual-read e feature flag por projeto;
- PostgreSQL é a fonte de verdade; Redis/BullMQ executa trabalho durável apoiado por outbox;
- conexões antigas não são apagadas na migração.

## Consequências positivas

- a Evolution continua funcionando durante o rollout;
- regras oficiais ficam isoladas e testáveis;
- novos canais não exigem reescrever o CRM;
- campanha não consegue escolher acidentalmente o provider legado;
- webhook, idempotência, segurança e observabilidade passam a ter contratos comuns;
- é possível migrar projeto a projeto e reverter a aplicação sem reverter dados.

## Custos e limitações

- dual-write aumenta temporariamente a complexidade;
- capabilities diferentes precisam ser explicadas na UI;
- serão necessários Redis, workers, scheduler, object storage e monitoramento;
- onboarding e App Review da Meta são dependências externas;
- o legado só pode ser removido em uma decisão futura separada, após estabilidade comprovada.

## Alternativas rejeitadas

### Substituir Evolution imediatamente

Rejeitada porque interromperia conexões e histórico funcionando, ampliaria o risco e violaria a migração incremental.

### Usar Evolution para campanhas

Rejeitada porque a campanha deve utilizar exclusivamente a API oficial do WhatsApp Business da Meta e suas regras de template, consentimento e qualidade.

### Criar um segundo CRM

Rejeitada porque duplicaria leads, funis, permissões e fonte de verdade. O omnichannel é uma camada nova sobre o CRM existente.

### Generalizar todos os canais com o menor denominador comum

Rejeitada porque esconderia regras obrigatórias de cada provider. O contrato comum usa capabilities e policies específicas.

## Guardrails

- nenhum backfill atualiza ou recria `Lead`/`PipelineEntry`;
- nenhum número ativo pode estar simultaneamente sob Evolution e Meta;
- nenhuma mensagem é marcada como entregue apenas pela resposta HTTP inicial;
- todo job e webhook é idempotente;
- toda consulta de recurso inclui o escopo do projeto;
- tokens ficam cifrados com chave independente;
- nenhum deploy ocorre sem testes, comparação de invariantes e autorização explícita.

## Critério para revisão desta ADR

Revisar somente se a Evolution deixar de ser necessária, se a Meta alterar materialmente o modelo de onboarding/campanhas, ou se um novo provider exigir mudança no contrato comum. A revisão não autoriza remoção de dados legados.
