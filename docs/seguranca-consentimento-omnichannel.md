# Segurança, privacidade e consentimento omnichannel

Status: política técnica planejada na Fase 0; não implementada.

## 1. Objetivos

- proteger tokens, mensagens, mídia e dados pessoais;
- impedir acesso cruzado entre projetos;
- comprovar consentimento e respeitar opt-out;
- autenticar eventos externos e impedir replay/duplicidade;
- manter trilha auditável sem copiar PII desnecessária;
- preservar integralmente os leads existentes.

## 2. Fronteiras de confiança

| Fronteira | Ameaças principais | Controle mínimo |
|---|---|---|
| navegador → web | IDOR, CSRF, upload malicioso | sessão, membership, validação server-side, upload assinado |
| Meta/Evolution → gateway | spoofing, replay, payload grande | HMAC/secret, raw body, limite, idempotência, rate limit |
| web → PostgreSQL | cross-tenant, mass assignment | `projectId` em toda query, DTO allowlist, transação |
| PostgreSQL → Redis/worker | evento perdido ou duplicado | outbox, job ID idempotente, retries classificados |
| worker → provider | token exposto, duplo envio | cofre, redaction, idempotency key, limiter e audit |
| aplicação → storage | bucket público, malware | bucket privado, URL curta, MIME/checksum/scan |
| operadores → administração | abuso de replay/exportação | papel mínimo, motivo, `AuditEvent`, alerta |

## 3. Isolamento por projeto

- todas as tabelas omnichannel persistem `projectId`;
- a conexão é resolvida pelo asset externo verificado, nunca por `projectId` fornecido no webhook;
- actions e queries filtram `id` + `projectId` na mesma operação;
- filas carregam IDs e o worker reconfirma o projeto no banco;
- SSE autoriza o projeto na abertura e filtra todo evento;
- exportação, replay, campanha e reconexão exigem papel explícito;
- testes automatizados tentam ler e mutar cada recurso com usuário de outro projeto.

Nenhum modelo de canal pode provocar cascade que apague um `Lead`. Vínculos novos com lead são opcionais e usam `SetNull`/`Restrict`.

## 4. Segredos e credenciais

### Segredos globais

App Secret, chaves de criptografia, verify tokens, Redis e object storage existem somente no secret manager/Coolify do ambiente. Nunca entram no Git, logs, payload de job ou JavaScript cliente.

### Credenciais por conexão

Tokens e refresh tokens são cifrados com AEAD e chave dedicada:

- envelope versionado com algoritmo, nonce, ciphertext, auth tag e `keyId`;
- chave ativa escreve; chave anterior pode apenas ler durante rotação;
- contexto autenticado inclui projeto, conexão e provider para impedir troca de ciphertext;
- rotação recriptografa em lotes e registra somente IDs/resultado;
- revogação desconecta a conexão, preservando histórico;
- telas mostram estado/expiração, nunca o token.

`NEXTAUTH_SECRET` não serve como fallback para credenciais de canal.

## 5. Autenticidade do webhook

Meta:

- GET exige verify token e devolve challenge somente se válido;
- POST valida `X-Hub-Signature-256` sobre os bytes exatos do corpo usando App Secret;
- comparação em tempo constante antes do parse/processamento;
- `ProviderEvent` tem chave externa única e hash do payload.

Evolution:

- manter compatibilidade com o secret atual;
- evoluir para secret por conexão quando suportado;
- aplicar o mesmo journal, idempotência, tamanho e redaction.

Falha de assinatura recebe resposta genérica, métrica e alerta controlado; não revela secret ou detalhes internos.

## 6. Consentimento

`ConsentRecord` é histórico append-only por projeto, identidade/endereço, canal e finalidade. Guarda:

- estado (`GRANTED`, `REVOKED`, `EXPIRED`);
- origem (`FORM`, `IMPORT`, `API`, `MANUAL`, `INBOUND_MESSAGE` ou outra allowlist);
- data/hora e versão/texto da prova;
- actor/integração que registrou;
- metadados mínimos necessários, com PII mascarada nos logs.

Uma concessão posterior não apaga revogações antigas. A elegibilidade usa o evento mais recente válido e a finalidade compatível.

### Suppression

`SuppressionEntry` prevalece sobre consentimento, lista importada, automação e tentativa manual. Motivos canônicos:

- `OPT_OUT`
- `INVALID`
- `MANUAL`
- `POLICY`
- `COMPLAINT`

Opt-out recebido durante campanha impede novos jobs ainda não submetidos na campanha atual e nas futuras. Mensagens já aceitas pelo provider não podem ser “desenviadas”, mas ficam registradas.

## 7. Policy de envio

Antes de enfileirar e novamente antes de submeter:

1. confirmar projeto, conexão ativa e provider-of-record;
2. confirmar capability permitida;
3. confirmar destinatário normalizado e não duplicado;
4. consultar suppression;
5. validar consentimento/finalidade;
6. validar template/revisão e variáveis obrigatórias;
7. validar janela de atendimento para mensagem livre;
8. aplicar limite, horário, qualidade e circuit breaker;
9. reservar idempotency key;
10. registrar decisão redigida.

Campanha sempre falha fechada: ausência de evidência, variável, regra ou capability bloqueia o destinatário; não tenta “melhor esforço”.

## 8. Importação e leads existentes

- CSV/XLS/XLSX entra em bucket privado e worker assíncrono;
- o arquivo é validado por tamanho, tipo, estrutura, linhas e fórmulas perigosas;
- telefones são normalizados no snapshot da audiência, sem reescrever `Lead.phone`;
- correspondência com lead cria apenas `leadId?` de referência;
- por padrão, a importação não cria lead, não atualiza campo e não move funil;
- qualquer efeito futuro no CRM exige tela separada, preview, permissão e auditoria;
- erros exportáveis usam acesso autenticado e expiração.

## 9. Dados, logs e retenção

| Dado | Regra planejada |
|---|---|
| credencial | cifrada enquanto a conexão existir; revogada/descartada na desconexão conforme runbook |
| payload bruto de provider | cifrado, acesso restrito e retenção curta configurável |
| metadado de evento | mantido para idempotência/auditoria pelo prazo aprovado |
| mensagem | conforme política do CRM/LGPD e necessidade operacional |
| mídia | bucket privado com lifecycle, legal hold quando aplicável e URL temporária |
| arquivo de importação | expira após processamento/prazo operacional aprovado |
| logs | IDs técnicos, hashes e códigos; sem token, payload integral ou telefone aberto |

Os prazos exatos precisam ser aprovados pelo responsável de privacidade da CLAVE antes da implementação. Até lá, a aplicação deve ter configuração explícita e conservadora, sem retenção infinita por acidente.

## 10. Auditoria

`AuditEvent` é append-only e registra:

- conectar, reconectar, revogar e arquivar conexão;
- conceder/revogar consentimento e incluir/remover suppression;
- criar, aprovar, agendar, pausar, retomar e cancelar campanha;
- replay de webhook/job e override administrativo;
- merge/link manual de identidade e lead;
- exportação e exclusão de dados.

Registra actor, projeto, ação, recurso, correlation ID, motivo e metadados redigidos. Nunca registra secret ou conteúdo integral da mensagem.

## 11. Resposta a incidentes

1. pausar conexão/campanha afetada por feature flag/circuit breaker;
2. revogar credencial no provider e rotacionar secret comprometido;
3. preservar evidência técnica sem propagar PII;
4. delimitar projetos, conexões, destinatários e janela temporal;
5. corrigir e testar em staging;
6. reprocessar somente por IDs idempotentes e com auditoria;
7. comunicar responsáveis e cumprir obrigações legais aplicáveis;
8. registrar causa, impacto e prevenção.

## 12. Gates antes do piloto

- [ ] threat model revisado;
- [ ] teste de isolamento por projeto;
- [ ] HMAC válido/inválido/replay;
- [ ] tokens ilegíveis no banco e ausentes em logs/jobs;
- [ ] rotação/revogação testada;
- [ ] opt-in, opt-out e suppression concorrente testados;
- [ ] campanha por Evolution impossível por contrato e por worker;
- [ ] upload privado, expiração, limite e scan testados;
- [ ] restauração e DLQ/replay testados;
- [ ] contagens e hashes de leads/pipelines idênticos antes/depois;
- [ ] política LGPD e prazos aprovados;
- [ ] autorização explícita para deploy.
