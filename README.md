# CRM B16 — plataforma de CRM multiprojeto

Aplicação oficial do CRM B16 em Next.js 16, Prisma e PostgreSQL. O produto mantém isolamento por projeto, múltiplos funis, Kanban, leads, tarefas, formulários embutidos, API pública, WhatsApp via Evolution API, campos personalizados tipados e webhooks de entrada e saída.

## Documentação técnica

- [Auditoria e matriz funcional](docs/auditoria-crm-e-matriz.md)
- [Campos personalizados, webhooks e Kanban](docs/campos-webhooks-kanban.md)
- [Tratamento de erros e acesso negado](docs/tratamento-de-erros.md)
- [Operação, migrations e rollback](docs/operacao-migrations-rollback.md)
- [Evidências de QA da entrega de 2026-09-01](docs/qa-release-2026-09-01.md)

## Desenvolvimento local

Requisitos: Node.js 20+, npm e PostgreSQL 15+. Não existem credenciais padrão documentadas e o seed nunca deve ser executado em produção.

```bash
cp .env.example .env
npm ci --legacy-peer-deps
npx prisma migrate deploy
npm run dev
```

Para subir o banco pelo Compose, configure primeiro as variáveis obrigatórias do `.env` e execute `docker compose up -d postgres`. Se o Next.js rodar fora do Docker, ajuste o host do `DATABASE_URL` de `postgres` para `localhost`.

Antes de enviar uma alteração:

```bash
npm test
npm run lint
npx prisma validate
npm run build
npm audit --omit=dev
```

## Produção no Coolify

O recurso de produção usa `docker-compose.yml`. O boot executa somente migrations versionadas com `prisma migrate deploy`, inicia o Next.js e expõe o healthcheck em `/api/health`. Não use `prisma db push`, seed, reset ou recriação de volume em produção.

Variáveis obrigatórias:

- `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD` e `DATABASE_URL`;
- `NEXTAUTH_URL` e `NEXTAUTH_SECRET`;
- `WEBHOOK_ENCRYPTION_KEY`, usada para criptografar headers de webhooks de saída.

Integrações opcionais usam `EVOLUTION_*`, `RESEND_API_KEY`, `MAIL_FROM`, `SMTP_*`, `GOOGLE_*` e `MICROSOFT_*`. Gere segredos longos e aleatórios no gerenciador de variáveis do Coolify; nunca grave valores reais no Git.

O procedimento completo de backup, baseline, migração, verificação e rollback está em [docs/operacao-migrations-rollback.md](docs/operacao-migrations-rollback.md).

---

## 🔀 Mapeamento Dinâmico de Webhooks de Entrada

A plataforma suporta o recebimento de leads de qualquer ferramenta externa (ex: Kiwify, WordPress, Elementor, Hotmart) de forma dinâmica.

1.  Abra **Configurações > Webhooks**, escolha **Entrada** e clique em **Novo webhook**.
2.  O sistema gerará uma URL exclusiva: `https://seu-dominio.com/api/webhooks/incoming/[token]`.
3.  Em **Campos recebidos**, adicione, remova ou reordene qualquer campo. Escolha o destino no CRM e configure o caminho usando a notação de ponto para objetos JSON aninhados. Se o destino ainda não existir, use **Criar campo personalizado** sem sair da tela.
    *   *Exemplo de Payload Recebido:*
        ```json
        {
          "cliente": {
            "nome": "João Silva",
            "email": "joao@email.com",
            "telefone": "5511999999999"
          },
          "venda": {
            "valor": 1500.00
          }
        }
        ```
    *   *Mapeamento no construtor:*
        *   **Nome:** `cliente.nome`
        *   **E-mail:** `cliente.email`
        *   **Telefone:** `cliente.telefone`
        *   **Valor:** `venda.valor`
4.  Campos podem ser marcados como obrigatórios. O CRM valida o payload, cria ou atualiza o lead no estágio selecionado e registra sucesso ou erro no histórico da própria tela.

---

## 💬 Central de WhatsApp Inbox (Evolution API)

A caixa de entrada de WhatsApp simula um painel similar ao WhatsApp Web, permitindo gerenciar conversas e mídias de forma centralizada.

### 1. Conexão e QR Code:
1.  Vá em **Configurações > WhatsApp** e crie uma nova instância.
2.  Clique em **Gerar QR Code** para chamar a Evolution API e exibir o código na tela.
3.  Abra o WhatsApp no seu celular e leia o QR Code.

### 2. Configurando o Webhook na Evolution API:
Para que as mensagens recebidas caiam na plataforma em tempo real, configure o Webhook no painel da sua Evolution API:
*   **URL do Webhook:** `https://seu-dominio.com/api/webhooks/whatsapp`
*   **Eventos:** Marcar `MESSAGES_UPSERT` (e opcionalmente `MESSAGES_UPDATE`).

### 3. Envio de Mídias (Imagens, Áudios e Documentos):
*   Na tela de **Inbox**, clique no ícone de clipe de papel para selecionar um arquivo.
*   O sistema lerá o arquivo físico localmente como uma string Base64 e o enviará direto para a Evolution API. Isso elimina a necessidade de configurar servidores de arquivos S3 no CRM, garantindo que qualquer mídia seja transmitida e salva com sucesso.

### 4. Vinculação com o CRM:
*   As conversas recebidas buscam automaticamente por leads cadastrados que possuam o mesmo número de telefone.
*   Caso não haja uma vinculação automática, você pode clicar em **Vincular Lead CRM** no cabeçalho do chat aberto para selecionar manualmente qual lead do pipeline pertence àquela conversa.

---

## 🔌 Integração de Agentes e API de Desenvolvedor (Hermes, Claude, etc.)

A plataforma disponibiliza uma API REST integrada no padrão `/api/v1` para facilitar a conexão com agentes autônomos de IA, Zapier, Make ou integrações personalizadas.

### 🔐 Geração e Segurança de Chaves de API
1. Acesse as **Configurações do Projeto > Desenvolvedor & API**.
2. Clique em **Gerar Chave de API** para gerar um token aleatório seguro (ex: `nfs_...`).
3. > [!WARNING]
   > **Aviso de Exibição Única**: A chave de API inteira é mostrada **apenas uma vez** em um modal de aviso. Você deve copiá-la e salvá-la imediatamente. Após sair da tela, o CRM nunca mais exibirá a chave original.
4. **Armazenamento de Alta Segurança**: Por motivos de conformidade e segurança, o CRM realiza o hash da sua chave completa usando `bcrypt` antes de persistir no banco de dados (a chave nunca é guardada legível). O banco armazena apenas o hash (`apiKeyHash`) e os primeiros 12 caracteres (`apiKeyPrefix`) como identificador visual e busca indexada.

### 🛡️ Autenticação e Rate Limiting
* **Headers Aceitos**:
  * `Authorization: Bearer <sua_chave>` (Recomendado)
  * `x-api-key: <sua_chave>`
* **Rate Limiting Protetivo**: Cada chave de API possui um teto de **60 requisições por minuto**.
  * Requisições que excederem o limite receberão a resposta `429 Too Many Requests` com o cabeçalho `Retry-After` informando os segundos restantes para liberação.

### 📡 Endpoints RESTful Disponíveis

* **`GET /api/v1/pipelines`**: Retorna os funis e estágios cadastrados no projeto autenticado.
* **`GET /api/v1/leads`**: Retorna os leads e participações do projeto. Suporta os query parameters:
  * `stageId` (opcional): Filtra leads de um estágio específico.
  * `status` (opcional): Filtra por status das participações (padrão: `ACTIVE`).
* **`POST /api/v1/leads`**: Cria um novo lead ou atualiza/acumula tags em um lead existente (deduplicação inteligente por e-mail/telefone).
  * Aplica automaticamente o **rodízio de comerciais (round-robin)** e conecta o lead ao estágio selecionado em `stageId`.
  * *Body JSON:* `{"name": "João", "email": "joao@email.com", "phone": "5511999999999", "stageId": "uuid-do-estagio"}`
* **`GET /api/v1/leads/[id]`**: Detalha dados de um lead específico, incluindo tarefas, atividades e campos personalizados.
* **`PATCH /api/v1/leads/[id]`**: Atualiza dados cadastrais do lead (nome, e-mail, telefone, empresa, prioridade).
* **`DELETE /api/v1/leads/[id]`**: Executa o **soft-delete** seguro (arquiva todas as participações no funil marcando status como `ARCHIVED` e registra histórico para auditoria). Os dados da pessoa nunca são apagados fisicamente por agentes externos.
* **`POST /api/v1/tasks`**: Cria uma nova tarefa pendente vinculada a um lead do projeto.
  * *Body JSON:* `{"leadId": "uuid-do-lead", "title": "Ligar Urgente", "description": "Conversar sobre contrato", "dueDate": "2026-06-10T14:00:00Z"}`

---

## 📋 Pendências e Melhorias Futuras (Backlog)

### 💾 Otimização do Armazenamento de Mídias (WhatsApp)
*   **Problema Atual:** Para facilitar o setup inicial e evitar dependências extras de infraestrutura, os arquivos enviados pelo Inbox (imagens, áudios e documentos) são convertidos para **Base64** no navegador e salvos diretamente na coluna `mediaUrl` do banco de dados (PostgreSQL). Em produção, o uso contínuo desta função irá inflar/inchar o banco de dados PostgreSQL rapidamente, degradando o desempenho das consultas.
*   **Recomendação de Evolução:** Migrar o upload de arquivos para um provedor de Object Storage (como **Cloudflare R2**, **Amazon S3** ou **Supabase Storage**).
    *   *Como implementar:* Configurar uma Server Action ou Rota de API no Next.js que receba o arquivo, gere uma URL assinada (Presigned URL) para o storage de arquivos, faça o upload direto e salve apenas a URL do link público (ex: `https://seu-bucket.r2.dev/arquivo.png`) no banco de dados.

---

## 🔀 Múltiplos Kanbans (Funis de Evento) e Roteamento de Leads

A plataforma foi projetada para gerenciar múltiplos fluxos comerciais no mesmo projeto de forma isolada (ex: o funil ordinário comercial e funis sazonais de eventos como "Lançamento Março", "Lançamento Junho" ou "Imersão Agosto").

### 1. Cadastro e Gestão de Funis (Settings)
* Acesse as **Configurações do Projeto > Funis & Estágios**.
* Você pode visualizar todos os funis ativos e criar novos funis de eventos.
* Ao selecionar um funil no dropdown de configuração, o painel exibirá as colunas (estágios) daquele funil específico. Você poderá adicionar novas colunas, renomeá-las ou excluí-las.
* Ao deletar um funil de evento, o sistema executa a exclusão segura em cascata de suas etapas e participações (`PipelineEntry`), mas **preserva os leads cadastrados** (a pessoa física/contato não é excluída).

### 2. Roteamento Inteligente de Webhooks
* Ao criar um webhook de integração em **Configurações > Webhooks > Entrada**, o seletor de "Estágio de Destino" exibirá as colunas do CRM agrupadas por seus respectivos Kanbans (ex: `Lançamento Junho > Inscrito`).
* Isso permite que leads vindos de formulários externos do WordPress ou de compras aprovadas no Kiwify/Hotmart caiam diretamente no Kanban de evento correto de forma totalmente automática.

### 3. Importação de Leads via CSV
* Ao realizar a importação em lote por CSV na tela de Leads, o modal de mapeamento exibirá seletores para você escolher o **Funil de Destino (Kanban)** e o **Estágio Comercial** correspondente onde os leads importados deverão ser adicionados.

---

## 📋 Construtor de Formulários Embutidos (WordPress & Sites Externos)

A plataforma possui um **Construtor de Formulários** integrado nas Configurações do Projeto. Ele permite criar formulários sob medida, selecionar o funil/estágio comercial de destino, escolher uma origem padrão e obter um código HTML semântico pronto para ser copiado e colado em qualquer página externa (como WordPress, Elementor, Webflow ou HTML puro).

### 1. Criar e Customizar Formulários
* Acesse as **Configurações do Projeto > Formulários** (disponível para Administradores do Projeto).
* Clique em **Criar Formulário**.
* Preencha as configurações:
  * **Nome Interno:** Identificação no CRM (ex: `Landing Page Imersão`).
  * **Destino:** Escolha o Kanban, a etapa inicial desejada e a Origem de captação que deseja marcar no lead.
  * **Sucesso/Redirecionamento:** Defina uma mensagem de sucesso amigável ou forneça uma URL de redirecionamento (ex: `https://seusite.com/obrigado`).
* **Gerenciar Campos:**
  * O formulário vem por padrão com Nome, E-mail e Telefone.
  * Você pode alterar os rótulos (Labels), torná-los obrigatórios, arrastar/reordenar a sequência de exibição ou removê-los.
  * *Regra de Identificação:* Pelo menos um identificador (`E-mail` ou `Telefone`) deve permanecer no formulário para garantir que a deduplicação e o rodízio funcionem.
  * Você também pode adicionar **Campos Personalizados** que foram criados previamente no projeto.
* Salve as configurações.

### 2. Copiar Código HTML para WordPress
* Na listagem de formulários, localize o formulário criado e clique no botão **Embutir Code**.
* Um modal se abrirá exibindo o código HTML estruturado. Clique em **Copiar Código**.
* No WordPress/Elementor, adicione um bloco de **HTML Personalizado (Custom HTML)** e cole o código copiado.

### 3. Customização Visual (CSS)
O código HTML gerado é cru e limpo, sem estilos embutidos pesados ou iframe. Ele utiliza classes semânticas previsíveis para permitir controle total de design via folha de estilo (CSS) externa do seu site:

*   **`.b16-form`**: Classe atribuída à tag principal `<form>`.
*   **`.b16-field`**: Classe da `<div>` que envolve cada par de rótulo e entrada.
*   **`.b16-label`**: Classe aplicada à tag `<label>`.
*   **`.b16-input`**: Classe aplicada aos campos `<input>` (texto, número, email).
*   **`.b16-button`**: Classe aplicada ao botão `<button type="submit">` de envio.

Exemplo de CSS simples para estilização rápida:
```css
.b16-form {
  max-width: 400px;
  margin: 0 auto;
  padding: 20px;
  background: #111;
  border-radius: 8px;
}
.b16-field {
  margin-bottom: 15px;
}
.b16-label {
  display: block;
  color: #fff;
  font-size: 14px;
  margin-bottom: 5px;
}
.b16-input {
  width: 100%;
  padding: 8px;
  background: #222;
  border: 1px solid #444;
  color: #fff;
  border-radius: 4px;
}
.b16-button {
  width: 100%;
  padding: 10px;
  background-color: #6D8A6C;
  color: #fff;
  border: none;
  font-weight: bold;
  border-radius: 4px;
  cursor: pointer;
}
.b16-button:hover {
  background-color: #8BA88A;
}
```

### 4. Proteção Robusta Contra Spam (Honeypot)
O código gerado inclui um campo invisível para humanos chamado `b16_hp_website`, escondido por uma regra inline de CSS (`display: none !important;`).
*   **Como funciona:** Usuários reais não enxergam esse campo, portanto deixam-no em branco. Robôs/Spambots ignoram regras de CSS e vasculham o código HTML preenchendo todos os campos que encontram na tentativa de enviar propagandas.
*   **Resposta do CRM:** Quando a API recebe um envio onde o campo `b16_hp_website` está preenchido, o CRM detecta imediatamente que é um bot de spam. O servidor **descarta o envio silenciosamente** (não cria o lead no banco de dados) e devolve uma resposta de sucesso (200 OK ou redirecionamento). Isso engana o bot, fazendo-o pensar que o spam funcionou, evitando que ele tente burlar a segurança por outros meios.

### 5. Rate Limiting por IP
Para evitar ataques de negação de serviço (DoS) ou inundações de envios (flood), o endpoint público de formulários limita as submissões a **no máximo 10 envios por minuto por endereço IP**. Se ultrapassado, as tentativas adicionais serão bloqueadas com o código de resposta HTTP `429 Too Many Requests`.

---

## 🎨 Efeitos Visuais & Recuperação de Senha (Forgot Password)

Adicionamos aprimoramentos estéticos modernos e um sistema completo de redefinição de senhas.

### 1. Animações High-Tech na Tela de Login
*   **Glow Neon Pulsante**: Um efeito de luz neon difusa e pulsante atrás da logomarca principal.
*   **Logo Reveal**: Animação de entrada do logotipo principal com escala suave e desfoque progressivo.
*   **Tracking Letters Transition**: O título `CRM b16` expande suavemente o espaçamento de suas letras ao carregar a página.

### 2. Recuperação de Senha (Esqueci Minha Senha)
*   **Transição de Card**: Na tela de login, clicando em "Esqueci minha senha", a caixa de login realiza uma transição suave para o formulário de e-mail de recuperação.
*   **Simulador de E-mail de Desenvolvimento**: Como não há SMTP ativo localmente, a tela de sucesso exibe uma caixa destacada contendo o link de depuração para testes locais: `http://localhost:3000/reset-password?token=...`.
*   **Página Pública de Redefinição (`/reset-password`)**: Rota segura que extrai o token da URL, valida a expiração de 1 hora no PostgreSQL, valida a força da senha (mínimo de 6 caracteres), gera o hash `bcryptjs` no servidor e atualiza o usuário no banco de dados.

