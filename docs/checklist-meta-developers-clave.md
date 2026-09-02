# Checklist manual — Meta Developers para a CLAVE

Status: checklist da Fase 0. Nenhuma configuração foi feita no Meta Developers por este trabalho.

Use `{BASE_URL}` como o domínio HTTPS público confirmado do ambiente. Staging e produção precisam de URLs e credenciais separadas. Não use o domínio de exemplo do código sem confirmar que ele é o domínio oficial da CLAVE.

## 1. Responsáveis e pré-requisitos

- [ ] Definir owner técnico e owner de negócio da integração.
- [ ] Garantir pelo menos dois administradores confiáveis no Business Portfolio e no app.
- [ ] Exigir 2FA para pessoas com acesso administrativo.
- [ ] Confirmar razão social, site, e-mail no domínio e documentos do negócio.
- [ ] Concluir Business Verification do portfólio que será associado ao app.
- [ ] Registrar IDs, sem publicar secrets: Business Portfolio ID, App ID, WABA ID, phone number ID e Instagram professional account ID.
- [ ] Definir WABA e número exclusivos de teste; não testar campanhas em contatos reais sem opt-in.

## 2. Criar/validar o app

- [ ] Em Meta for Developers, criar ou abrir o app associado ao negócio verificado.
- [ ] Para um app novo, escolher o use case **Connect through WhatsApp**.
- [ ] Em **App Settings > Basic**, preencher nome, namespace se exigido, domínio e contato.
- [ ] Configurar Privacy Policy URL válida e específica.
- [ ] Configurar Terms of Service URL, se aplicável.
- [ ] Configurar Data Deletion Instructions URL ou callback de exclusão de dados.
- [ ] Definir ícone, categoria e demais dados exigidos para publicação.
- [ ] Copiar App ID para o secret manager/Coolify; copiar App Secret somente para secret server-side.
- [ ] Nunca colocar App Secret, access token, verify token ou system-user token no Git ou no navegador.

## 3. Facebook Login for Business e Embedded Signup

- [ ] Adicionar o produto **Facebook Login for Business**.
- [ ] Criar uma **Tech Provider Configuration** e registrar o config ID.
- [ ] Definir a configuração para Embedded Signup e os assets/scopes mínimos exigidos.
- [ ] Adicionar URI exata de redirect HTTPS em **Valid OAuth Redirect URIs**: `{BASE_URL}/api/integrations/meta/callback`.
- [ ] Adicionar o host exato em **Allowed Domains for the JavaScript SDK** quando o SDK for usado.
- [ ] Não usar wildcard, HTTP ou múltiplas variações de barra sem necessidade.
- [ ] Implementar e testar `state` de uso único, expiração e vínculo com projeto/usuário antes do teste real.
- [ ] Validar code exchange apenas no servidor e salvar credenciais por conexão, cifradas.
- [ ] Testar cancelamento, token expirado, asset não autorizado e reconexão.

O path definitivo do callback deve ser congelado antes da configuração. Se a implementação aprovada escolher outro path, atualizar este documento e o dashboard juntos.

## 4. Produto WhatsApp

- [ ] Adicionar/configurar **WhatsApp** no app.
- [ ] Confirmar WABA de teste e número de teste.
- [ ] Registrar display name e PIN quando exigidos no onboarding do número.
- [ ] Configurar forma de pagamento para uso real.
- [ ] Confirmar que o app está inscrito em cada WABA conectada.
- [ ] Configurar Callback URL: `{BASE_URL}/api/webhooks/providers/meta`.
- [ ] Configurar Verify Token igual ao secret `META_WEBHOOK_VERIFY_TOKEN` do mesmo ambiente.
- [ ] Assinar o campo de webhook `messages`.
- [ ] Validar GET de challenge e POST assinado em staging.
- [ ] Rejeitar assinatura inválida e replay duplicado sem duplicar mensagens.
- [ ] Testar inbound, outbound, status, erro, mídia e eventos fora de ordem.
- [ ] Confirmar no dashboard e nos logs técnicos qual WABA/phone number originou cada evento.

## 5. Permissões e App Review — WhatsApp

Solicitar somente o que estiver implementado e demonstrável:

- [ ] `whatsapp_business_management`: WABAs, números, templates e subscriptions.
- [ ] `whatsapp_business_messaging`: envio de mensagens livres elegíveis e templates.
- [ ] `business_management` somente se o fluxo aprovado realmente precisar ler/gerenciar assets do Business Portfolio; não pedir por conveniência.
- [ ] Preparar usuário de revisão, passos reproduzíveis e vídeo completo do onboarding.
- [ ] Mostrar no vídeo: login, seleção do negócio/WABA/número, consentimento, envio, recebimento, templates, desconexão e exclusão de dados.
- [ ] Explicar por que cada permissão é necessária no produto.
- [ ] Manter app em Development enquanto apenas admins/developers/testers estiverem validando.
- [ ] Publicar o app somente depois de aprovação e checklist de produção.

## 6. Templates, consentimento e campanhas

- [ ] Criar templates no WhatsApp Manager com categoria, idioma e variáveis corretos.
- [ ] Aguardar aprovação; não tratar template pendente/rejeitado como enviável.
- [ ] Sincronizar ID, nome, idioma, categoria, componentes, status e revisão para `TemplateSnapshot`.
- [ ] Definir fonte de opt-in e texto da prova por audiência.
- [ ] Implementar opt-out e suppression list antes de habilitar campanha.
- [ ] Conferir qualidade do número, messaging limits e restrições da conta.
- [ ] Definir ramp-up, limite por minuto, horários, pausa e circuit breaker.
- [ ] Confirmar billing/pagamento e acompanhar erros/custos.
- [ ] Garantir que o worker de campanha só aceite `META_WHATSAPP`.
- [ ] Fazer campanha de teste apenas para destinatários controlados e consentidos.

## 7. Instagram Direct

- [ ] Usar conta profissional do Instagram elegível e controlada para teste.
- [ ] Associar a conta aos assets Meta exigidos pelo caminho de login escolhido.
- [ ] Configurar produto/API Instagram e webhook no mesmo gateway ou callback aprovado.
- [ ] Solicitar `instagram_business_basic`.
- [ ] Solicitar `instagram_business_manage_messages`.
- [ ] Solicitar `instagram_business_manage_comments` apenas quando a fase de comentários/replies estiver implementada.
- [ ] Não solicitar publicação de conteúdo para o MVP de Direct.
- [ ] Preparar App Review com login, evento inbound e resposta no CRM.
- [ ] Comprovar que o CRM não inicia mensagem fria e não oferece campanha Instagram.
- [ ] Testar revogação, conta desconectada e identidade não elegível.

## 8. URLs e secrets por ambiente

| Item | Staging | Produção |
|---|---|---|
| Base URL HTTPS | pendente confirmar | pendente confirmar |
| OAuth redirect | `{BASE_URL}/api/integrations/meta/callback` | mesmo path no domínio de produção |
| Webhook callback | `{BASE_URL}/api/webhooks/providers/meta` | mesmo path no domínio de produção |
| Verify token | secret exclusivo | secret exclusivo e diferente |
| App/WABA/número | assets de teste | assets aprovados de produção |
| Banco/Redis/bucket | isolados | isolados |

Secrets planejados no Coolify:

- `META_APP_ID`
- `META_APP_SECRET`
- `META_GRAPH_API_VERSION`
- `META_WEBHOOK_VERIFY_TOKEN`
- `META_EMBEDDED_SIGNUP_CONFIG_ID`
- `META_OAUTH_REDIRECT_URI`
- `META_APP_BASE_URL`
- `META_DATA_DELETION_CALLBACK_URL`

A versão da Graph API é configuração explícita e deve ser atualizada por ciclo controlado, após conferir changelog e testar. Não copiar para este documento valores reais.

## 9. Produção e operação

- [ ] Privacy Policy e Data Deletion testadas publicamente sem autenticação quando exigido.
- [ ] Business Verification e App Review aprovados.
- [ ] App publicado e assets de produção conectados.
- [ ] Webhook HTTPS válido, assinatura HMAC obrigatória e observabilidade sem PII.
- [ ] Tokens de longa duração/system user avaliados conforme o fluxo oficial e com mínimo privilégio.
- [ ] Rotação e revogação de credenciais documentadas.
- [ ] Alertas para falha de auth, volume anômalo, DLQ, qualidade e limite.
- [ ] Runbook de incidente, pausa de campanha e desconexão por projeto.
- [ ] Retenção, exportação e exclusão LGPD aprovadas.
- [ ] Autorização explícita de deploy registrada antes de qualquer publicação.

## 10. Evidências ainda pendentes

A auditoria de código não comprova o estado do Meta Developers. Para fechar estas caixas, é necessário acesso ao app/Business Portfolio ou evidências fornecidas pelo administrador:

- App ID e negócio associado;
- status de Business Verification e App Review;
- config ID do Embedded Signup;
- WABA/número de teste e subscriptions;
- conta profissional do Instagram;
- URLs públicas definitivas;
- política, termos e exclusão de dados;
- permissions já aprovadas e expiração dos tokens.

## 11. Fontes oficiais consultadas

- [Sample oficial Meta para Tech Providers e checklist de produção](https://github.com/fbsamples/business-messaging-sample-tech-provider-app/blob/main/README.md)
- [Coleção oficial WhatsApp Cloud API da Meta](https://www.postman.com/meta/whatsapp-business-platform/documentation/wlk6lh4/whatsapp-cloud-api)
- [Workspace oficial WhatsApp Business Platform](https://www.postman.com/meta/whatsapp-business-platform/documentation/wl)
- [Documentação oficial Instagram API da Meta](https://www.postman.com/meta/instagram/documentation/6yqw8pt/instagram-api)
- [Programa de parceiros WhatsApp Business](https://whatsappbusiness.com/partners/become-a-partner/)
- [Guia oficial de onboarding do WhatsApp Business Platform](https://whatsappbusiness.com/wp-content/uploads/2026/04/Onboarding-to-the-WhatsApp-Business-Platform.pdf)

As regras e permissões da Meta mudam. Este checklist deve ser reconfirmado nas fontes oficiais imediatamente antes da implementação e antes do App Review.
