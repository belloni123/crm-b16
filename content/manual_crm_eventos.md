# Manual do Usuário — Operações de Kanbans, Webhooks e Leads

Este manual fornece instruções passo a passo com exemplos práticos sobre como utilizar os novos recursos de múltiplos Kanbans, roteamento de webhooks, importação CSV e distribuição round-robin na plataforma No Front Scale.

---

## 🗺️ 1. Criar um Novo Kanban (Funil de Evento / Lançamento)

Utilize este procedimento para criar um funil separado para campanhas ou eventos específicos, mantendo o controle isolado sem misturar com leads do dia a dia.

### Passo a Passo:
1. Acesse o seu projeto no painel principal do CRM.
2. No menu lateral esquerdo, clique em **Configurações** (ícone de engrenagem).
3. Selecione a aba **Funis & Estágios** no topo do menu de configurações.
4. No campo **Novo Funil de Evento / Lançamento**, digite o nome desejado.
   * *Exemplo:* `Lançamento Junho 2026`
5. Clique em **Criar Funil**. A página recarregará e o funil será criado com 3 estágios padrão.
6. No seletor **Funil Ativo para Configuração**, escolha `Lançamento Junho 2026`.
7. Na seção de estágios abaixo, você pode personalizar as colunas do seu Kanban:
   * Para excluir uma coluna indesejada: clique no ícone de lixeira (vermelho) ao lado do nome do estágio.
   * Para adicionar um novo estágio: digite o nome no campo **Nome do Estágio** (ex: `Inscrito no Lançamento`), selecione a cor visual do card no seletor de cores, e clique em **Adicionar**.

---

## 🔌 2. Configurar Webhook para Roteamento Automático de Leads

Utilize este procedimento para capturar leads que se cadastram em páginas externas (WordPress, Elementor, Kiwify, Hotmart) e inseri-los automaticamente no Kanban do evento correspondente.

### Passo a Passo:
1. No menu de **Configurações**, selecione a aba **Webhooks de Entrada**.
2. No campo **Nome da Integração**, dê um nome descritivo para identificar a origem dos leads.
   * *Exemplo:* `Formulário Página de Captura Elementor`
3. No seletor **Estágio de Destino**, procure o estágio desejado. O sistema agrupa os estágios por funil.
   * *Exemplo:* Selecione a opção `Lançamento Junho 2026 > Inscrito no Lançamento`
4. No campo **Origem Associada**, selecione o canal correspondente (ex: `WordPress`) ou deixe em branco.
5. Na seção **Mapeamento de Campos**, digite o nome exato dos campos JSON enviados pela sua plataforma externa nos inputs correspondentes:
   * **Nome do Lead:** ex: `nome` ou `lead_name`
   * **E-mail:** ex: `email`
   * **Telefone:** ex: `whatsapp` ou `telefone`
6. Clique em **Adicionar**.
7. Na listagem de Webhooks abaixo, localize a integração criada e clique em **Copiar Link**.
8. Cole essa URL no painel da sua plataforma externa (ex: nas configurações de Webhook do Elementor, Kiwify ou Make/Zapier).

---

## 📥 3. Importar Leads de Evento via Arquivo CSV

Utilize este procedimento quando você tiver uma lista de contatos em planilha Excel/CSV e quiser jogá-los em lote em um funil de evento específico.

### Passo a Passo:
1. No menu lateral do projeto, clique em **Leads**.
2. No topo direito da lista de leads, clique em **Importar CSV**.
3. Clique na área tracejada ou arraste seu arquivo `.csv` para selecioná-lo.
4. No modal que se abre:
   * No dropdown **Funil de Destino (Kanban)**, selecione `Lançamento Junho 2026`.
   * No dropdown **Estágio Comercial de Destino**, escolha a etapa inicial (ex: `Inscrito no Lançamento`).
   * No dropdown **Origem padrão**, opcionalmente selecione como esses leads vieram (ex: `Planilha Evento`).
5. Na seção **Mapeamento de Colunas**, o CRM listará os campos do sistema e você deverá escolher qual coluna do seu arquivo CSV corresponde a cada dado (Nome, E-mail, Telefone).
6. Abaixo, clique em **Ver Prévia** para certificar que os dados das primeiras 5 linhas estão corretos e legíveis.
7. Clique em **Iniciar Importação**. O sistema processará em lote de forma deduplicada e exibirá o resumo de sucessos e falhas no final.

---

## 👥 4. Configurar Rodízio de Vendas (Round-Robin)

Utilize este procedimento para definir quais comerciais (vendedores) devem receber os novos leads que entram via webhooks ou CSV para o projeto ativo.

### Passo a Passo:
1. No menu de **Configurações**, selecione a aba **Comerciais e Distribuição**.
2. Na tabela exibida, você verá todos os membros da equipe.
3. Marque a checkbox **Comercial Designado** apenas para os vendedores que participarão da escala de atendimento ativo do projeto.
4. Clique em **Salvar Comerciais**.
5. A partir deste momento, qualquer novo lead cadastrado (que não seja um lead existente com dono anterior) será alternado automaticamente em fila de rodízio entre esses comerciais selecionados.

---

## 📝 5. Criar e Incorporar um Formulário no WordPress

Utilize este procedimento para capturar leads através de um formulário gerado diretamente no CRM, obtendo o código HTML para copiar e colar no WordPress de forma simplificada e segura contra bots de spam.

### Passo a Passo:
1. No menu de **Configurações**, selecione a aba **Formulários**.
2. Clique no botão **Criar Formulário**.
3. Preencha os campos principais:
   * **Nome Interno:** ex: `Formulário Landing Page Imersão`
   * **Funil de Destino:** ex: `Lançamento Junho 2026`
   * **Estágio de Destino:** ex: `Inscrito no Lançamento`
   * **Origem Padrão:** ex: `WordPress` (ou qualquer canal comercial desejado)
   * **Mensagem de Sucesso / URL de Redirecionamento:** Mensagem exibida após envio ou o link da página de obrigado.
4. Na seção **Campos do Formulário**:
   * O formulário já vem com Nome, E-mail e Telefone.
   * Você pode reordenar usando as setas ▲/▼, definir quais campos são obrigatórios ou excluí-los (desde que mantenha ao menos E-mail ou Telefone ativo).
   * Para incluir campos personalizados do projeto, selecione-os no dropdown de seleção e clique em **Adicionar**.
5. Clique em **Salvar Formulário**.
6. Na listagem de formulários, localize a opção criada e clique em **Embutir Code**.
7. Clique no botão **Copiar Código** no modal de visualização.
8. No editor do seu site WordPress (Gutenberg, Elementor, etc.), adicione um bloco de **HTML Personalizado** e cole o código copiado.
9. Você pode customizar os estilos visuais livremente em seu CSS utilizando as classes `.nfs-form`, `.nfs-field`, `.nfs-label`, `.nfs-input` e `.nfs-button`.

---

## 📈 6. Rastreamento Automático de Campanhas (UTMs)

Quando você utiliza tráfego pago (Google Ads, Facebook Ads) ou campanhas estruturadas, os links que trazem os visitantes ao seu site costumam ter tags como `utm_source=facebook` ou `utm_campaign=promocao`. O CRM No Front Scale captura estes dados automaticamente e armazena de forma isolada nos leads.

### Como Funciona:
1. **Configuração nos Anúncios:** Você não precisa fazer nenhuma configuração adicional no CRM ou no formulário embutido. Basta montar o link do seu anúncio ou postagem incluindo os parâmetros UTM normais (ex: `https://seusite.com/?utm_source=instagram&utm_medium=stories&utm_campaign=imersao-ago`).
2. **Captura Inteligente (Primeira Visita):** Quando o usuário acessa o seu site através do link patrocinado, o script do formulário lê esses dados da URL e os guarda de forma invisível no navegador dele (`localStorage`).
3. **Persistência ao Navegar:** Se o visitante navegar por várias páginas antes de preencher o formulário, ou se ele fechar a aba e voltar depois sem UTM na URL (acesso direto), o formulário resgata os parâmetros guardados na primeira visita. Isso impede que você perca a origem real da conversão.
4. **Regra do Primeiro Toque (Deduplicação):**
   * Se o lead se cadastrar pela primeira vez, os campos UTM principais no CRM exibirão os parâmetros da campanha que trouxe a pessoa.
   * Se a pessoa preencher o formulário novamente vindo de uma nova campanha, **o CRM mantém as UTMs originais do primeiro contato** no perfil do lead (para você saber o que realmente o atraiu no início).
   * Contudo, para não perder a informação da nova campanha, **o CRM registra os novos parâmetros de UTM no Histórico / Timeline de Atividades** do lead de forma automática.
5. **Consulta de Dados:**
   * Abra a gaveta/detalhes do lead no Kanban ou na Listagem.
   * Uma seção chamada **Dados de Rastreamento (UTMs)** aparecerá em destaque exibindo a origem (`Source`), mídia (`Medium`), campanha (`Campaign`), além da página exata em que o formulário foi preenchido e o link de referência anterior (`Referrer`).

---

## 🔑 7. Recuperação de Senha (Esqueci Minha Senha)

Se você ou um membro da equipe esquecer a senha de acesso, a plataforma possui um fluxo seguro de redefinição de senha diretamente na tela de login.

### Passo a Passo:
1. Na página inicial de login do CRM, clique no link **Esqueci minha senha** localizado logo acima do campo de Senha.
2. Digite o seu e-mail cadastrado no sistema (ex: `admin@nofrontscale.com.br`) e clique em **Recuperar Senha**.
3. Uma tela de confirmação será exibida informando que as instruções foram enviadas.
4. **Simulação no Ambiente de Desenvolvimento (Sem SMTP local):**
   * Como o ambiente local não possui um servidor de e-mail ativo para disparos reais, um painel especial de depuração (Alerta de Teste) aparecerá na tela de sucesso.
   * Clique no botão **Redefinir Senha de Teste** para simular o recebimento do e-mail. Isso abrirá a página segura de redefinição em `/reset-password?token=...`.
5. Na tela **Criar Nova Senha**, digite a nova senha desejada (mínimo de 6 caracteres) e confirme-a.
6. Clique em **Salvar Nova Senha**. Após a confirmação, você será redirecionado para a tela de login principal, onde poderá acessar o painel usando suas novas credenciais.

---

## 📅 8. Integração de Agenda Pessoal (Google & Microsoft)

Esta funcionalidade permite que cada vendedor ou administrador conecte sua própria agenda pessoal (Google Calendar ou Microsoft Outlook/Exchange) ao CRM. As tarefas com data de vencimento que você criar ou que forem atribuídas a você serão automaticamente sincronizadas como compromissos/eventos na sua agenda pessoal.

### Passo a Passo:
1. Acesse o menu **Configurações** (ícone de engrenagem) no menu lateral esquerdo.
2. Selecione a aba **Minha Agenda** no menu de configurações (disponível para todos os usuários).
3. Escolha o provedor de sua preferência:
   * **Google Calendar**: Clique em **Conectar Google Agenda**. Você será redirecionado para a página de login e consentimento do Google. Autorize a plataforma a ler e escrever eventos em sua agenda.
   * **Outlook Calendar**: Clique em **Conectar Outlook Agenda**. Você será redirecionado para a página de consentimento da Microsoft. Autorize a plataforma.
4. Após o consentimento, você será redirecionado de volta para as Configurações do CRM, exibindo o status **Integrado** e o e-mail da conta de agenda vinculada.
5. **Funcionamento da Sincronização:**
   * Sempre que você criar uma nova tarefa com **data de vencimento**, ela será criada como um evento de 1 hora na sua agenda externa com o título `CRM: [Título da Tarefa]`.
   * Se você editar o título, descrição, data de vencimento ou se a tarefa for concluída, a alteração será refletida na sua agenda pessoal externa em tempo real.
   * Se a tarefa for excluída do CRM, o respectivo evento também será removido da sua agenda externa.
6. Para remover uma integração a qualquer momento, basta acessar novamente a aba **Minha Agenda** e clicar em **Desconectar [Google/Outlook] Agenda**.
