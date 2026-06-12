# CRM b16 — Plataforma de CRM Multiprojeto

Esta é a plataforma de CRM Multiprojeto oficial do **CRM b16**, um clube privado de empresários focados em escala de negócios. A plataforma foi desenvolvida focando em estética premium (dark mode com glassmorphism), isolamento multi-tenant rígido por projeto (`project_id`), webhooks de entrada dinâmicos com mapeamento JSON e caixa de entrada integrada de WhatsApp conectada à Evolution API.

---

## 🔑 Credenciais de Acesso Padrão (Seed)

Após rodar o script de banco de dados, você poderá efetuar login com os seguintes usuários de teste:

*   **Superadmin (Acesso Global):**
    *   **E-mail:** `admin@crmb16.com.br`
    *   **Senha:** `admin123`
*   **Membro de Teste (Acesso ao Projeto 1):**
    *   **E-mail:** `membro@crmb16.com.br`
    *   **Senha:** `membro123`

---

## 🛠️ Como Rodar Localmente (Desenvolvimento com PostgreSQL)

Para garantir 100% de consistência com a produção, a plataforma roda exclusivamente com **PostgreSQL** tanto localmente quanto no deploy de produção. O schema do Prisma é fixo para PostgreSQL.

Você pode rodar o PostgreSQL local de duas maneiras: via **Docker** ou nativamente via **Homebrew** no macOS.

### Opção A: Rodar via Docker (Recomendado se tiver Docker instalado)
1. **Suba apenas o serviço do PostgreSQL no Docker:**
   ```bash
   docker-compose up -d postgres
   ```
2. **Sincronize as tabelas do banco de dados:**
   ```bash
   npx prisma db push
   ```
3. **Povoar o banco com os dados iniciais (Seed):**
   ```bash
   node prisma/seed.js
   ```
4. **Inicie o servidor de desenvolvimento:**
   ```bash
   npm run dev
   ```

### Opção B: Rodar nativamente via Homebrew (Para rodar sem Docker)
1. **Inicie o serviço do PostgreSQL 15:**
   ```bash
   brew services start postgresql@15
   ```
2. **Crie o usuário administrador do banco de dados do CRM:**
   ```bash
   createuser -s crm_user
   ```
3. **Crie o banco de dados oficial:**
   ```bash
   createdb -O crm_user crm_b16
   ```
4. **Defina a senha do usuário do banco (deve corresponder ao .env):**
   ```bash
   psql -d postgres -c "ALTER USER crm_user WITH PASSWORD 'crm_password_secure_123';"
   ```
5. **Sincronize as tabelas e rode o seed:**
   ```bash
   npx prisma db push
   node prisma/seed.js
   ```
6. **Inicie o servidor de desenvolvimento:**
   ```bash
   npm run dev
   ```

5. **Acesse o painel:**
   Abra [http://localhost:3000](http://localhost:3000) (ou a porta exibida no terminal) no seu navegador.

---

## 🐳 Configurações e Deploy no Coolify (Produção)

O projeto já está 100% pronto para deploy na sua VPS via Coolify, configurado com Dockerfile multiphase otimizado para Next.js e docker-compose contendo PostgreSQL.

No Coolify, crie um novo recurso de **Docker Compose** apontando para o seu repositório e configure as variáveis de ambiente necessárias.

### Variáveis de Ambiente (`.env`):

Crie um arquivo `.env` na raiz do projeto com as seguintes variáveis:

```env
# Banco de Dados (PostgreSQL para Produção no Coolify)
DATABASE_URL="postgresql://postgres:sua_senha_segura@postgres:5432/crm_b16?schema=public"

# Configurações do NextAuth
NEXTAUTH_URL="http://localhost:3000" # Em produção, altere para https://seu-dominio.com
NEXTAUTH_SECRET="um_hash_md5_ou_string_aleatoria_longa_e_segura"

# Integração Evolution API (WhatsApp)
EVOLUTION_API_URL="https://sua-evolution-api.com"
EVOLUTION_API_KEY="seu_apikey_global_da_evolution_api"
```

---

## 🔀 Mapeamento Dinâmico de Webhooks de Entrada

A plataforma suporta o recebimento de leads de qualquer ferramenta externa (ex: Kiwify, WordPress, Elementor, Hotmart) de forma dinâmica.

1.  Crie um webhook em **Configurações > Webhooks de Entrada** dentro do projeto.
2.  O sistema gerará uma URL exclusiva: `https://seu-dominio.com/api/webhooks/incoming/[token]`.
3.  Configure o **Mapeamento de Campos** usando a notação de ponto para objetos JSON aninhados.
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
    *   *Mapeamento no CRM:*
        *   **Nome:** `cliente.nome`
        *   **E-mail:** `cliente.email`
        *   **Telefone:** `cliente.telefone`
        *   **Valor:** `venda.valor`
4.  O CRM processará o payload automaticamente, criará o lead no estágio selecionado e salvará o log bruto da requisição para auditoria na UI de configurações.

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
2. Clique em **Gerar Chave de API** para gerar um token aleatório seguro (ex: `b16_test_main_...`).
3. > [!WARNING]
   > **Aviso de Exibição Única**: A chave de API inteira é mostrada **apenas uma vez** em um modal de aviso. Você deve copiá-la e salvá-la imediatamente. Após sair da tela, o CRM nunca mais exibirá a chave original.
4. **Armazenamento de Alta Segurança**: Por motivos de conformidade e segurança, o CRM realiza o hash da sua chave completa usando `bcrypt` antes de persistir no banco de dados (a chave nunca é guardada legível). O banco armazena apenas o hash (`apiKeyHash`) e os primeiros 12 caracteres (`apiKeyPrefix`) como identificador visual e busca indexada.

### 🛡️ Autenticação e Rate Limiting
* **Headers Aceitos**:
  * `Authorization: Bearer b16_...` (Recomendado)
  * `x-api-key: b16_...`
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
* Ao criar um webhook de integração em **Configurações > Webhooks de Entrada**, o seletor de "Estágio de Destino" exibirá as colunas do CRM agrupadas por seus respectivos Kanbans (ex: `Lançamento Junho > Inscrito`).
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




