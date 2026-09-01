# Tratamento de erros e acesso negado

O CRM diferencia falhas esperadas de falhas inesperadas para não expor mensagens técnicas ao usuário.

## Estados disponíveis

| Situação | Experiência exibida | Ações oferecidas |
|---|---|---|
| Usuário autenticado sem acesso a um projeto | Tela 403 “Você não tem acesso a este projeto” | Voltar aos projetos ou sair e trocar de conta |
| Usuário comum tentando abrir `/admin` | Tela 403 exclusiva de superadministrador | Voltar aos projetos ou sair e trocar de conta |
| Rota ou recurso inexistente | Tela 404 “Não encontramos esta página” | Voltar aos projetos ou ao início |
| Exceção inesperada em uma rota | Tela 500 dentro do layout | Tentar novamente ou voltar aos projetos |
| Falha no layout raiz | Tela global de contingência | Tentar novamente |

As páginas 403 explicam que a conta continua ativa e orientam o usuário a falar com o administrador para solicitar vínculo ao projeto ou revisão do perfil. Detalhes internos da exceção não são mostrados. Quando o Next.js fornece um `digest`, a tela 500 apresenta apenas esse código seguro como referência de suporte.

## Fluxo de autorização

- O `proxy.ts` continua enviando usuários sem sessão para o login.
- Acesso de um usuário autenticado ao painel global sem papel `SUPERADMIN` redireciona para `/acesso-negado?reason=admin`.
- O layout de projeto consulta `resolveProjectAccess`. Ausência de vínculo redireciona para `/acesso-negado?reason=project`; uma sessão ausente volta ao login.
- Server Actions continuam usando `requireProjectAccess` e `requireSuperadmin`, pois nelas a autorização precisa ser validada novamente no servidor.
- Projetos ou rotas inexistentes usam a convenção `notFound()` do Next.js e retornam a tela 404.

## Verificação

Antes de publicar, validar:

1. `/acesso-negado?reason=project` renderiza o texto de vínculo ao projeto.
2. `/acesso-negado?reason=admin` explica a exigência de superadministrador.
3. Uma rota inexistente retorna HTTP 404 e a tela personalizada.
4. Usuário sem sessão em `/project/...` continua recebendo redirecionamento para login.
5. Build, TypeScript, lint e testes automatizados permanecem aprovados.
